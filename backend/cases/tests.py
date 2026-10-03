import tempfile
from datetime import date
from pathlib import Path
from unittest.mock import Mock, patch

import numpy as np
import rasterio


from django.contrib.auth import get_user_model
from django.contrib.gis.geos import GEOSGeometry, MultiPolygon
from django.test import TestCase
from rasterio.transform import from_origin
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient
from shapely.geometry import Polygon
from data.scripts.aggregate_climate import _write_observation, aggregate_raster_to_polygon
from .models import (
    CaseReport,
    ClimateObservation,
    County,
    ForecastRun,
    HealthFacility,
    HistoricalCaseData,
    VaccineAllocation,
)
from .services.allocation_generation_service import AllocationGenerationError, AllocationGenerationService
from .services.case_report_service import CaseReportService
from .services.forecast_generation_service import ForecastGenerationError, ForecastGenerationService



class ClimateAggregationTests(TestCase):
    def test_aggregate_raster_to_polygon(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            raster_path = Path(tmpdir) / "rainfall.tif"
            data = np.full((10, 10), 10.0, dtype="float32")
            data[3:7, 3:7] = 30.0

            with rasterio.open(
                raster_path,
                "w",
                driver="GTiff",
                height=10,
                width=10,
                count=1,
                dtype="float32",
                crs="EPSG:4326",
                transform=from_origin(0, 10, 1, 1),
            ) as dst:
                dst.write(data, 1)

            polygon = Polygon([(2, 2), (2, 8), (8, 8), (8, 2), (2, 2)])
            result = aggregate_raster_to_polygon(raster_path, polygon)

            # The polygon crops exactly to the raster's 6x6 (2..8, 2..8) block: the
            # inner 4x4 sub-block is 30.0 (16 cells), the surrounding ring is 10.0
            # (36 - 16 = 20 cells) -> (16*30 + 20*10) / 36 = 18.888...
            self.assertAlmostEqual(result, 680 / 36, places=3)

    def _write_raster(self, path, data, nodata=None):
        with rasterio.open(
            path,
            "w",
            driver="GTiff",
            height=data.shape[0],
            width=data.shape[1],
            count=1,
            dtype="float32",
            crs="EPSG:4326",
            transform=from_origin(0, 10, 1, 1),
            nodata=nodata,
        ) as dst:
            dst.write(data, 1)

    def test_nodata_cells_are_excluded_from_the_mean(self):
        """A polygon that partly overlaps nodata cells (e.g. a coastline)
        must average only the valid cells, not treat the sentinel as data."""
        with tempfile.TemporaryDirectory() as tmpdir:
            raster_path = Path(tmpdir) / "rainfall.tif"
            data = np.full((10, 10), 20.0, dtype="float32")
            data[:, 5:] = -9999.0  # right half of the raster is nodata (e.g. ocean)
            self._write_raster(raster_path, data, nodata=-9999.0)

            # Polygon covers both the valid left half and the nodata right half.
            polygon = Polygon([(1, 1), (1, 9), (9, 9), (9, 1), (1, 1)])
            result = aggregate_raster_to_polygon(raster_path, polygon)

            self.assertAlmostEqual(result, 20.0, places=3)

    def test_raises_when_polygon_covers_only_nodata(self):
        """Regression test: a polygon landing entirely on nodata cells used to
        silently return the sentinel value (-9999) as if it were a real mean,
        because MaskedArray.astype()/isnan() doesn't recognise a sentinel that
        isn't NaN. It must raise instead."""
        with tempfile.TemporaryDirectory() as tmpdir:
            raster_path = Path(tmpdir) / "rainfall.tif"
            data = np.full((10, 10), -9999.0, dtype="float32")
            self._write_raster(raster_path, data, nodata=-9999.0)

            polygon = Polygon([(2, 2), (2, 8), (8, 8), (8, 2), (2, 2)])
            with self.assertRaises(ValueError):
                aggregate_raster_to_polygon(raster_path, polygon)

    def test_nodata_fallback_used_when_raster_declares_none(self):
        """CHIRPS's real Africa-monthly product doesn't declare a nodata
        value in its GeoTIFF metadata even though -9999 is its sentinel by
        convention — this is the exact case the pilot run against real
        CHIRPS data hit. FALLBACK_NODATA must catch it even with no
        declared nodata on the file."""
        with tempfile.TemporaryDirectory() as tmpdir:
            raster_path = Path(tmpdir) / "rainfall.tif"
            data = np.full((10, 10), -9999.0, dtype="float32")
            self._write_raster(raster_path, data, nodata=None)

            polygon = Polygon([(2, 2), (2, 8), (8, 8), (8, 2), (2, 2)])
            with self.assertRaises(ValueError):
                aggregate_raster_to_polygon(raster_path, polygon)


class ClimateObservationWriteTests(TestCase):
    """Regression tests for _write_observation: writing one climate variable
    must not clobber sibling variables already stored on the same
    (county, date, source) row — this matters as soon as two variables from
    one source (e.g. ERA5 temperature_c + humidity_pct) share a row."""

    def setUp(self):
        square = MultiPolygon(GEOSGeometry(Polygon([(0, 0), (0, 1), (1, 1), (1, 0), (0, 0)]).wkt))
        self.county = County.objects.create(name="Kisumu", code="KEN-042", boundary=square)

    def test_second_variable_preserves_first(self):
        _write_observation(self.county, "rainfall_mm", 42.0, "2026-07-01", "ERA5")
        _write_observation(self.county, "temperature_c", 24.5, "2026-07-01", "ERA5")

        obs = ClimateObservation.objects.get(county=self.county, observation_date="2026-07-01", source="ERA5")
        self.assertAlmostEqual(obs.rainfall_mm, 42.0, places=3)
        self.assertAlmostEqual(obs.temperature_c, 24.5, places=3)

    def test_different_sources_stay_on_separate_rows(self):
        _write_observation(self.county, "rainfall_mm", 42.0, "2026-07-01", "CHIRPS")
        _write_observation(self.county, "temperature_c", 24.5, "2026-07-01", "ERA5")

        self.assertEqual(ClimateObservation.objects.filter(county=self.county, observation_date="2026-07-01").count(), 2)


class CaseReportChainTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="reporter", password="testpass123")
        self.county = County.objects.create(name="Kisumu", code="KEN-042")
        self.facility = HealthFacility.objects.create(
            name="Kisumu Dispensary", county=self.county, level=HealthFacility.FacilityLevel.DISPENSARY
        )

    def _make_report(self, confirmed_cases=10):
        return CaseReport.objects.create(
            county=self.county,
            facility=self.facility,
            report_date="2026-01-15",
            confirmed_cases=confirmed_cases,
            suspected_cases=2,
            deaths=0,
            reported_by=self.user,
        )

    def test_first_record_has_empty_previous_hash(self):
        report = self._make_report()
        self.assertEqual(report.previous_hash, "")
        self.assertTrue(report.record_hash)
        self.assertTrue(report.verify_chain_link())

    def test_chain_links_to_prior_record(self):
        first = self._make_report(confirmed_cases=10)
        second = self._make_report(confirmed_cases=15)
        self.assertEqual(second.previous_hash, first.record_hash)
        self.assertTrue(first.verify_chain_link())
        self.assertTrue(second.verify_chain_link())

    def test_records_are_immutable(self):
        report = self._make_report()
        report.confirmed_cases = 999
        with self.assertRaises(ValueError):
            report.save()

    def test_records_cannot_be_deleted(self):
        report = self._make_report()
        with self.assertRaises(ValueError):
            report.delete()

    def test_verify_chain_valid_on_untouched_records(self):
        self._make_report(confirmed_cases=10)
        self._make_report(confirmed_cases=15)
        self._make_report(confirmed_cases=20)

        result = CaseReportService().verify_chain()
        self.assertTrue(result["valid"])
        self.assertEqual(result["total_records"], 3)
        self.assertIsNone(result["broken_at_id"])

    def test_verify_chain_detects_an_edited_record(self):
        first = self._make_report(confirmed_cases=10)
        self._make_report(confirmed_cases=15)

        # save() refuses this (immutability) — simulate real tampering (e.g.
        # a raw SQL UPDATE) by bypassing the model layer entirely.
        CaseReport.objects.filter(pk=first.pk).update(confirmed_cases=99999)

        result = CaseReportService().verify_chain()
        self.assertFalse(result["valid"])
        self.assertEqual(result["broken_at_id"], first.pk)
        self.assertIn("edited", result["reason"])

    def test_verify_chain_returns_a_per_record_breakdown_continuing_past_the_first_failure(self):
        """Editing a record's content (not its stored hash column) doesn't
        change what the *next* record's previous_hash was set against, so
        the chain should keep walking and report every record, not bail out
        after the first bad one — the whole point of per-record detail."""
        first = self._make_report(confirmed_cases=10)
        second = self._make_report(confirmed_cases=15)
        third = self._make_report(confirmed_cases=20)
        CaseReport.objects.filter(pk=first.pk).update(confirmed_cases=99999)

        result = CaseReportService().verify_chain()

        self.assertEqual(len(result["records"]), 3)
        by_id = {r["id"]: r for r in result["records"]}

        self.assertFalse(by_id[first.pk]["self_valid"])
        self.assertFalse(by_id[first.pk]["valid"])
        # second and third's previous_hash still matches first's unchanged
        # stored record_hash column — their own link/self checks still pass.
        self.assertTrue(by_id[second.pk]["valid"])
        self.assertTrue(by_id[third.pk]["valid"])

    def test_verify_chain_records_are_all_valid_when_untampered(self):
        a = self._make_report(confirmed_cases=10)
        b = self._make_report(confirmed_cases=15)

        result = CaseReportService().verify_chain()

        self.assertEqual({r["id"] for r in result["records"]}, {a.pk, b.pk})
        self.assertTrue(all(r["valid"] for r in result["records"]))

    def test_verify_chain_endpoint(self):
        self._make_report(confirmed_cases=10)
        resp = self.client.get("/api/case-reports/verify_chain/")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["valid"])


class CaseReportCorrectionTests(TestCase):
    """CaseReport is append-only, so a mistaken report is corrected by
    submitting a new report with `supersedes` set, never by editing the old
    one — see CaseReportService.create_report."""

    def setUp(self):
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(username="reporter", password="testpass123")
        self.token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")
        self.county = County.objects.create(name="Kisumu", code="KEN-042")
        self.other_county = County.objects.create(name="Siaya", code="KEN-041")
        self.facility = HealthFacility.objects.create(
            name="Kisumu Dispensary", county=self.county, level=HealthFacility.FacilityLevel.DISPENSARY
        )
        self.other_facility = HealthFacility.objects.create(
            name="Siaya Dispensary", county=self.other_county, level=HealthFacility.FacilityLevel.DISPENSARY
        )
        self.original = CaseReport.objects.create(
            county=self.county,
            facility=self.facility,
            report_date="2026-01-15",
            confirmed_cases=10,
            suspected_cases=2,
            deaths=0,
            reported_by=self.user,
        )

    def _payload(self, **overrides):
        payload = {
            "county": self.county.id,
            "facility": self.facility.id,
            "report_date": "2026-01-15",
            "confirmed_cases": 25,
            "suspected_cases": 2,
            "deaths": 0,
            "supersedes": self.original.id,
        }
        payload.update(overrides)
        return payload

    def test_correction_is_created_and_linked(self):
        resp = self.client.post("/api/case-reports/", self._payload(), format="json")
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data["confirmed_cases"], 25)
        self.assertEqual(resp.data["supersedes"], self.original.id)

        # The original report is untouched — no in-place edit ever happens.
        self.original.refresh_from_db()
        self.assertEqual(self.original.confirmed_cases, 10)

    def test_original_report_reflects_superseded_by_id_after_correction(self):
        resp = self.client.post("/api/case-reports/", self._payload(), format="json")
        correction_id = resp.data["id"]

        detail = self.client.get(f"/api/case-reports/{self.original.id}/")
        self.assertEqual(detail.data["superseded_by_id"], correction_id)

    def test_cannot_supersede_a_report_that_is_already_superseded(self):
        first_correction = self.client.post("/api/case-reports/", self._payload(confirmed_cases=25), format="json")
        self.assertEqual(first_correction.status_code, 201)

        second_correction = self.client.post(
            "/api/case-reports/", self._payload(confirmed_cases=30), format="json"
        )
        self.assertEqual(second_correction.status_code, 400)
        self.assertIn("already been corrected", str(second_correction.data))

        # Correcting the *current* version (the first correction) instead
        # works fine.
        resp = self.client.post(
            "/api/case-reports/",
            self._payload(confirmed_cases=30, supersedes=first_correction.data["id"]),
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)

    def test_correction_must_match_county_facility_and_report_date(self):
        resp = self.client.post("/api/case-reports/", self._payload(county=self.other_county.id), format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("county", str(resp.data))

        resp = self.client.post("/api/case-reports/", self._payload(facility=self.other_facility.id), format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("facility", str(resp.data))

        resp = self.client.post("/api/case-reports/", self._payload(report_date="2026-02-15"), format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("report_date", str(resp.data))

    def test_report_without_supersedes_is_unaffected(self):
        """A plain new report (no correction) needs none of the supersedes checks."""
        resp = self.client.post(
            "/api/case-reports/",
            {
                "county": self.county.id,
                "facility": self.facility.id,
                "report_date": "2026-02-01",
                "confirmed_cases": 5,
                "suspected_cases": 0,
                "deaths": 0,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertIsNone(resp.data["supersedes"])


def _mock_response(status_code, json_data):
    resp = Mock()
    resp.status_code = status_code
    resp.json.return_value = json_data
    resp.text = str(json_data)
    return resp


class ForecastGenerationServiceTests(TestCase):
    def setUp(self):
        square = MultiPolygon(GEOSGeometry(Polygon([(0, 0), (0, 1), (1, 1), (1, 0), (0, 0)]).wkt))
        self.county = County.objects.create(name="Kisumu", code="KEN-042", population=500_000, boundary=square)
        # 4 months of trailing history so the service has something to send.
        for i, (cases, rain) in enumerate([(100.0, 20.0), (120.0, 40.0), (90.0, 15.0), (140.0, 60.0)]):
            month = date(2026, 1 + i, 1)
            HistoricalCaseData.objects.create(county=self.county, period_start=month, confirmed_cases=cases, source="synthetic_v1")
            ClimateObservation.objects.create(county=self.county, observation_date=month, rainfall_mm=rain, source="CHIRPS")

    @patch("cases.services.forecast_generation_service.requests.post")
    def test_generate_for_county_sends_trailing_history_and_stores_result(self, mock_post):
        mock_post.return_value = _mock_response(
            200,
            {
                "forecast_period_start": "2026-05-01",
                "forecast_period_end": "2026-05-28",
                "predicted_cases": 150.0,
                "risk_score": 0.62,
                "model_name": "xgboost_v1",
                "model_version": "test",
            },
        )

        service = ForecastGenerationService()
        run = service.generate_for_county(self.county, date(2026, 5, 1))

        sent_payload = mock_post.call_args.kwargs["json"]
        self.assertEqual(sent_payload["county_code"], "KEN-042")
        self.assertEqual(sent_payload["recent_confirmed_cases"], [100.0, 120.0, 90.0, 140.0])
        self.assertEqual(sent_payload["recent_rainfall_mm"], [20.0, 40.0, 15.0, 60.0])

        self.assertIsInstance(run, ForecastRun)
        self.assertEqual(run.risk_score, 0.62)
        self.assertEqual(ForecastRun.objects.count(), 1)

    @patch("cases.services.forecast_generation_service.requests.post")
    def test_generate_for_county_raises_on_ml_service_error(self, mock_post):
        mock_post.return_value = _mock_response(422, {"detail": "not enough history"})
        with self.assertRaises(ForecastGenerationError):
            ForecastGenerationService().generate_for_county(self.county, date(2026, 5, 1))

    @patch("cases.services.forecast_generation_service.requests.post")
    def test_generate_for_counties_continues_past_one_failure(self, mock_post):
        other = County.objects.create(name="Siaya", code="KEN-041", population=300_000)

        def side_effect(*args, **kwargs):
            code = kwargs["json"]["county_code"]
            if code == "KEN-041":
                return _mock_response(500, {"detail": "boom"})
            return _mock_response(
                200,
                {
                    "forecast_period_start": "2026-05-01",
                    "forecast_period_end": "2026-05-28",
                    "predicted_cases": 100.0,
                    "risk_score": 0.4,
                    "model_name": "xgboost_v1",
                    "model_version": "test",
                },
            )

        mock_post.side_effect = side_effect
        created, errors = ForecastGenerationService().generate_for_counties([self.county, other], date(2026, 5, 1))

        self.assertEqual(len(created), 1)
        self.assertEqual(len(errors), 1)
        self.assertEqual(errors[0]["county_code"], "KEN-041")


class AllocationGenerationServiceTests(TestCase):
    def setUp(self):
        self.county_a = County.objects.create(name="Kisumu", code="KEN-042", population=500_000)
        self.county_b = County.objects.create(name="Siaya", code="KEN-041", population=300_000)
        self.forecast_a = ForecastRun.objects.create(
            county=self.county_a,
            forecast_period_start=date(2026, 5, 1),
            forecast_period_end=date(2026, 5, 28),
            predicted_cases=120.0,
            risk_score=0.7,
            model_name="xgboost_v1",
        )
        self.forecast_b = ForecastRun.objects.create(
            county=self.county_b,
            forecast_period_start=date(2026, 5, 1),
            forecast_period_end=date(2026, 5, 28),
            predicted_cases=80.0,
            risk_score=0.3,
            model_name="xgboost_v1",
        )

    @patch("cases.services.allocation_generation_service.requests.post")
    def test_generate_uses_latest_forecast_and_links_it(self, mock_post):
        mock_post.return_value = _mock_response(
            200,
            {
                "total_available_doses": 10000,
                "total_allocated_doses": 10000,
                "allocations": [
                    {"county_code": "KEN-042", "recommended_doses": 7000, "rationale": "high risk"},
                    {"county_code": "KEN-041", "recommended_doses": 3000, "rationale": "lower risk"},
                ],
            },
        )

        created = AllocationGenerationService().generate(
            [self.county_a, self.county_b], 10000, date(2026, 5, 1), date(2026, 5, 28)
        )

        self.assertEqual(len(created), 2)
        by_county = {a.county: a for a in created}
        self.assertEqual(by_county[self.county_a].recommended_doses, 7000)
        self.assertEqual(by_county[self.county_a].based_on_forecast, self.forecast_a)
        self.assertEqual(by_county[self.county_b].based_on_forecast, self.forecast_b)

    def test_raises_when_no_forecasts_exist(self):
        county_c = County.objects.create(name="Busia", code="KEN-040", population=200_000)
        with self.assertRaises(AllocationGenerationError):
            AllocationGenerationService().generate([county_c], 10000, date(2026, 5, 1), date(2026, 5, 28))


class GenerationAuditTrailTests(TestCase):
    """ForecastRun/VaccineAllocation.generated_by — who triggered a /generate
    call, for the same accountability reason CaseReport tracks `reported_by`."""

    def setUp(self):
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(username="analyst", password="testpass123")
        self.token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")
        self.county = County.objects.create(name="Kisumu", code="KEN-042", population=500_000)
        for i in range(4):
            month = date(2026, 1, 1).replace(month=i + 1)
            HistoricalCaseData.objects.create(county=self.county, period_start=month, confirmed_cases=100, source="synthetic_v1")
            ClimateObservation.objects.create(county=self.county, observation_date=month, rainfall_mm=30, source="CHIRPS")

    @patch("cases.services.forecast_generation_service.requests.post")
    def test_generate_forecast_endpoint_stamps_the_requesting_user(self, mock_post):
        mock_post.return_value = _mock_response(
            200,
            {
                "forecast_period_start": "2026-05-01",
                "forecast_period_end": "2026-05-28",
                "predicted_cases": 150.0,
                "risk_score": 0.62,
                "model_name": "xgboost_v1",
                "model_version": "test",
            },
        )
        resp = self.client.post(
            "/api/forecasts/generate/", {"county_ids": [self.county.id]}, format="json"
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        run = ForecastRun.objects.get()
        self.assertEqual(run.generated_by, self.user)

        list_resp = self.client.get("/api/forecasts/")
        self.assertEqual(list_resp.data["results"][0]["generated_by_username"], "analyst")

    @patch("cases.services.allocation_generation_service.requests.post")
    def test_generate_allocation_endpoint_stamps_the_requesting_user(self, mock_post):
        ForecastRun.objects.create(
            county=self.county,
            forecast_period_start=date(2026, 5, 1),
            forecast_period_end=date(2026, 5, 28),
            predicted_cases=120.0,
            risk_score=0.7,
            model_name="xgboost_v1",
        )
        mock_post.return_value = _mock_response(
            200,
            {
                "total_available_doses": 1000,
                "total_allocated_doses": 1000,
                "allocations": [{"county_code": "KEN-042", "recommended_doses": 1000, "rationale": "only county"}],
            },
        )
        resp = self.client.post(
            "/api/allocations/generate/",
            {"total_available_doses": 1000, "county_ids": [self.county.id]},
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        allocation = VaccineAllocation.objects.get()
        self.assertEqual(allocation.generated_by, self.user)

        list_resp = self.client.get("/api/allocations/")
        self.assertEqual(list_resp.data["results"][0]["generated_by_username"], "analyst")


class AuthTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(username="tester", password="correct-horse-battery")

    def test_login_with_correct_credentials_returns_token(self):
        resp = self.client.post("/api/auth/login/", {"username": "tester", "password": "correct-horse-battery"})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["username"], "tester")
        self.assertEqual(resp.data["token"], Token.objects.get(user=self.user).key)

    def test_login_with_wrong_password_is_rejected(self):
        resp = self.client.post("/api/auth/login/", {"username": "tester", "password": "wrong"})
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(Token.objects.filter(user=self.user).exists())

    def test_me_requires_a_valid_token(self):
        resp = self.client.get("/api/auth/me/")
        self.assertEqual(resp.status_code, 401)

        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        resp = self.client.get("/api/auth/me/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["username"], "tester")

    def test_write_endpoints_reject_anonymous_requests(self):
        resp = self.client.post("/api/allocations/generate/", {"total_available_doses": 1000})
        self.assertEqual(resp.status_code, 401)

    def test_write_endpoints_accept_a_valid_token(self):
        county = County.objects.create(name="Kisumu", code="KEN-042", population=500_000)
        ForecastRun.objects.create(
            county=county,
            forecast_period_start=date(2026, 5, 1),
            forecast_period_end=date(2026, 5, 28),
            predicted_cases=100.0,
            risk_score=0.5,
            model_name="test",
        )
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        resp = self.client.post(
            "/api/allocations/generate/",
            {"total_available_doses": 1000, "county_ids": [county.id]},
            format="json",
        )
        # Reaches the service layer (not a 401/403) — its own success/failure
        # is exercised by AllocationGenerationServiceTests already.
        self.assertNotIn(resp.status_code, (401, 403))


class GenerateEndpointCountySelectionTests(TestCase):
    """Regression tests: an explicit county_ids=[] must mean "no counties",
    not silently fall through to "every county" — [] and "key omitted" are
    both falsy in Python but callers mean different things by them."""

    def setUp(self):
        self.client = APIClient()
        user = get_user_model().objects.create_user(username="tester", password="pw")
        token = Token.objects.create(user=user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        square = MultiPolygon(GEOSGeometry(Polygon([(0, 0), (0, 1), (1, 1), (1, 0), (0, 0)]).wkt))
        self.county = County.objects.create(name="Kisumu", code="KEN-042", population=500_000, boundary=square)

    @patch("cases.services.forecast_generation_service.requests.post")
    def test_empty_county_ids_generates_nothing(self, mock_post):
        resp = self.client.post(
            "/api/forecasts/generate/", {"county_ids": [], "as_of_date": "2026-05-01"}, format="json"
        )
        self.assertEqual(resp.data["created"], [])
        self.assertEqual(resp.data["errors"], [])
        mock_post.assert_not_called()

    @patch("cases.services.allocation_generation_service.requests.post")
    def test_empty_county_ids_allocates_nothing(self, mock_post):
        # No counties -> no forecasts to allocate against -> a clear 400,
        # not a silent "ran for everyone" or a silent empty success.
        resp = self.client.post(
            "/api/allocations/generate/", {"total_available_doses": 1000, "county_ids": []}, format="json"
        )
        self.assertEqual(resp.status_code, 400)
        mock_post.assert_not_called()

    @patch("cases.services.forecast_generation_service.requests.post")
    def test_omitted_county_ids_defaults_to_every_county(self, mock_post):
        mock_post.return_value = _mock_response(
            200,
            {
                "forecast_period_start": "2026-05-01",
                "forecast_period_end": "2026-05-28",
                "predicted_cases": 100.0,
                "risk_score": 0.5,
                "model_name": "test",
                "model_version": "test",
            },
        )
        resp = self.client.post("/api/forecasts/generate/", {"as_of_date": "2026-05-01"}, format="json")
        self.assertEqual(len(resp.data["created"]), 1)


class CountyAndFacilityWriteTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        user = get_user_model().objects.create_user(username="tester", password="pw")
        token = Token.objects.create(user=user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")

    def test_anonymous_cannot_create_county(self):
        anon = APIClient()
        resp = anon.post("/api/counties/", {"name": "Nakuru", "code": "KEN-032"}, format="json")
        self.assertEqual(resp.status_code, 401)

    def test_create_county(self):
        resp = self.client.post(
            "/api/counties/", {"name": "Nakuru", "code": "KEN-032", "population": 2_162_202}, format="json"
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(County.objects.get(code="KEN-032").name, "Nakuru")

    def test_create_county_does_not_accept_a_boundary(self):
        """boundary is a read-only SerializerMethodField — posting one should
        be silently ignored, not crash, and the county should be created
        with no boundary."""
        resp = self.client.post(
            "/api/counties/",
            {"name": "Nakuru", "code": "KEN-032", "boundary": {"type": "MultiPolygon", "coordinates": []}},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertIsNone(County.objects.get(code="KEN-032").boundary)

    def test_update_county_population(self):
        county = County.objects.create(name="Nakuru", code="KEN-032", population=1)
        resp = self.client.patch(f"/api/counties/{county.id}/", {"population": 2_162_202}, format="json")
        self.assertEqual(resp.status_code, 200)
        county.refresh_from_db()
        self.assertEqual(county.population, 2_162_202)

    def test_create_facility(self):
        county = County.objects.create(name="Nakuru", code="KEN-032")
        resp = self.client.post(
            "/api/facilities/",
            {"name": "Nakuru Level 5 Hospital", "county": county.id, "level": "hospital"},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(HealthFacility.objects.get(name="Nakuru Level 5 Hospital").county, county)

    def test_anonymous_cannot_create_facility(self):
        county = County.objects.create(name="Nakuru", code="KEN-032")
        anon = APIClient()
        resp = anon.post(
            "/api/facilities/", {"name": "Nakuru Level 5 Hospital", "county": county.id, "level": "hospital"}, format="json"
        )
        self.assertEqual(resp.status_code, 401)
    


_PREDICTION = {
    "forecast_period_start": "2026-05-01",
    "forecast_period_end": "2026-05-28",
    "predicted_cases": 150.0,
    "risk_score": 0.62,
    "model_name": "xgboost_v1",
    "model_version": "test",
}


class ForecastPreviewTests(TestCase):
    """POST /api/forecasts/preview/ — a dry run of /generate/: same inputs,
    same model call, nothing stored."""

    def setUp(self):
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(username="analyst", password="testpass123")
        self.token = Token.objects.create(user=self.user)
        self.county = County.objects.create(name="Kisumu", code="KEN-042", population=500_000)
        for i, (cases, rain) in enumerate([(100.0, 20.0), (120.0, 40.0), (90.0, 15.0), (140.0, 60.0)]):
            month = date(2026, 1 + i, 1)
            HistoricalCaseData.objects.create(county=self.county, period_start=month, confirmed_cases=cases, source="synthetic_v1")
            ClimateObservation.objects.create(county=self.county, observation_date=month, rainfall_mm=rain, source="CHIRPS")

    @patch("cases.services.forecast_generation_service.requests.post")
    def test_preview_sends_the_same_payload_as_generate_and_stores_nothing(self, mock_post):
        mock_post.return_value = _mock_response(200, _PREDICTION)
        service = ForecastGenerationService()

        previews, errors = service.preview_for_counties([self.county], date(2026, 5, 1))
        preview_payload = mock_post.call_args.kwargs["json"]
        self.assertEqual(errors, [])
        self.assertEqual(previews[0]["county"], self.county.id)
        self.assertEqual(previews[0]["risk_score"], 0.62)
        self.assertEqual(ForecastRun.objects.count(), 0)

        service.generate_for_county(self.county, date(2026, 5, 1))
        self.assertEqual(mock_post.call_args.kwargs["json"], preview_payload)

    @patch("cases.services.forecast_generation_service.requests.post")
    def test_preview_reports_one_countys_failure_without_aborting(self, mock_post):
        other = County.objects.create(name="Busia", code="KEN-040", population=900_000)
        mock_post.side_effect = lambda url, json, timeout: (
            _mock_response(422, {"detail": "not enough history"}) if json["county_code"] == "KEN-040" else _mock_response(200, _PREDICTION)
        )
        previews, errors = ForecastGenerationService().preview_for_counties([self.county, other], date(2026, 5, 1))
        self.assertEqual([p["county_name"] for p in previews], ["Kisumu"])
        self.assertEqual(errors[0]["county_name"], "Busia")

    @patch("cases.services.forecast_generation_service.requests.post")
    def test_preview_endpoint_returns_predictions_without_writing(self, mock_post):
        mock_post.return_value = _mock_response(200, _PREDICTION)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")
        resp = self.client.post("/api/forecasts/preview/", {"county_ids": [self.county.id], "as_of_date": "2026-05-01"}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["previews"][0]["county_name"], "Kisumu")
        self.assertEqual(resp.data["errors"], [])
        self.assertEqual(ForecastRun.objects.count(), 0)

    def test_preview_endpoint_requires_sign_in(self):
        resp = self.client.post("/api/forecasts/preview/", {"county_ids": [self.county.id]}, format="json")
        self.assertIn(resp.status_code, (401, 403))


def _gadm_zip(features):
    """A fake GADM download: the real file's zip-of-json shape."""
    import io as _io
    import json as _json
    import zipfile as _zipfile

    buf = _io.BytesIO()
    with _zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("gadm41_KEN_1.json", _json.dumps({"type": "FeatureCollection", "features": features}))
    return buf.getvalue()


_MACHAKOS_FEATURE = {
    "type": "Feature",
    "properties": {"NAME_1": "Machakos"},
    "geometry": {"type": "Polygon", "coordinates": [[[37.0, -1.0], [37.5, -1.0], [37.5, -1.5], [37.0, -1.5], [37.0, -1.0]]]},
}
_HOMA_BAY_FEATURE = {
    "type": "Feature",
    "properties": {"NAME_1": "Homa Bay"},
    "geometry": {"type": "Polygon", "coordinates": [[[34.2, -0.4], [34.6, -0.4], [34.6, -0.8], [34.2, -0.8], [34.2, -0.4]]]},
}


class CountyBoundaryTests(TestCase):
    """Locating a county on the map: the official GADM boundary is suggested
    (read-only), then applied on confirmation. Never hand-drawn geometry."""

    def setUp(self):
        from cases.services import county_boundary_service as svc

        self.svc = svc
        svc._FEATURES_CACHE.clear()
        self.tmp = tempfile.TemporaryDirectory()
        self.cache_path = Path(self.tmp.name) / "gadm.json"
        self.downloads = 0

        def fake_download(timeout=60):
            self.downloads += 1
            return _gadm_zip([_MACHAKOS_FEATURE, _HOMA_BAY_FEATURE])

        self.patches = [
            patch.object(svc, "DEFAULT_CACHE_PATH", self.cache_path),
            patch.object(svc, "download_gadm", fake_download),
        ]
        for p in self.patches:
            p.start()
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(username="analyst", password="testpass123")
        self.token = Token.objects.create(user=self.user)
        self.county = County.objects.create(name="Machakos", code="KEN-016", population=1_400_000)

    def tearDown(self):
        for p in self.patches:
            p.stop()
        self.svc._FEATURES_CACHE.clear()
        self.tmp.cleanup()

    def test_suggest_matches_loosely_by_name_and_saves_nothing(self):
        homa = County.objects.create(name="homa-bay", code="KEN-043")
        result = self.svc.CountyBoundaryService().suggest(homa)
        self.assertTrue(result["matched"])
        self.assertEqual(result["gadm_name"], "Homa Bay")
        self.assertEqual(result["candidates"], ["Homa Bay", "Machakos"])
        homa.refresh_from_db()
        self.assertIsNone(homa.boundary)

    def test_download_is_cached_to_disk_and_reused(self):
        self.svc.CountyBoundaryService().names()
        self.assertTrue(self.cache_path.exists())
        self.svc._FEATURES_CACHE.clear()  # new process
        self.svc.CountyBoundaryService().names()
        self.assertEqual(self.downloads, 1)

    def test_no_match_returns_candidates_to_pick_from(self):
        typo = County.objects.create(name="Machakoss", code="KEN-099")
        result = self.svc.CountyBoundaryService().suggest(typo)
        self.assertFalse(result["matched"])
        self.assertIsNone(result["geometry"])
        self.assertIn("Machakos", result["candidates"])

    def test_suggestion_endpoint_requires_sign_in(self):
        resp = self.client.get(f"/api/counties/{self.county.id}/boundary-suggestion/")
        self.assertIn(resp.status_code, (401, 403))

    def test_apply_endpoint_saves_the_gadm_geometry(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")
        suggestion = self.client.get(f"/api/counties/{self.county.id}/boundary-suggestion/")
        self.assertEqual(suggestion.status_code, 200)
        self.assertEqual(suggestion.data["gadm_name"], "Machakos")

        resp = self.client.post(f"/api/counties/{self.county.id}/apply-boundary/", {"gadm_name": "Machakos"}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["boundary"]["type"], "MultiPolygon")
        self.county.refresh_from_db()
        self.assertEqual(self.county.boundary.geom_type, "MultiPolygon")
        self.assertAlmostEqual(self.county.boundary.extent[0], 37.0)

    def test_apply_rejects_an_unknown_name(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")
        resp = self.client.post(f"/api/counties/{self.county.id}/apply-boundary/", {"gadm_name": "Atlantis"}, format="json")
        self.assertEqual(resp.status_code, 400)
        self.county.refresh_from_db()
        self.assertIsNone(self.county.boundary)

    def test_boundary_still_cannot_be_set_through_plain_update(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")
        square = {"type": "Polygon", "coordinates": [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]]}
        self.client.patch(f"/api/counties/{self.county.id}/", {"boundary": square}, format="json")
        self.county.refresh_from_db()
        self.assertIsNone(self.county.boundary)


class CountyDataPreparationTests(TestCase):
    """POST /api/counties/{id}/prepare-data/ — makes a dashboard-added county
    forecast-ready: real CHIRPS rainfall over its polygon, plus synthetic
    climatology and case history from its epidemiological zone."""

    def setUp(self):
        from cases.services import county_data_service as svc

        self.tmp = tempfile.TemporaryDirectory()
        chirps = Path(self.tmp.name)
        # Four monthly rasters: 10 mm, 20 mm, 30 mm, 40 mm everywhere.
        for i in range(4):
            with rasterio.open(
                chirps / f"chirps-v2.0.2026.0{i + 1}.tif", "w", driver="GTiff", height=10, width=10, count=1,
                dtype="float32", crs="EPSG:4326", transform=from_origin(0, 10, 1, 1),
            ) as dst:
                dst.write(np.full((10, 10), 10.0 * (i + 1), dtype="float32"), 1)
        self.patch = patch.object(svc, "CHIRPS_DIR", chirps)
        self.patch.start()

        self.client = APIClient()
        self.user = get_user_model().objects.create_user(username="analyst", password="testpass123")
        self.token = Token.objects.create(user=self.user)
        square = MultiPolygon(GEOSGeometry(Polygon([(2, 2), (2, 8), (8, 8), (8, 2), (2, 2)]).wkt))
        self.county = County.objects.create(name="Machakos", code="KEN-016", population=1_400_000, boundary=square)

    def tearDown(self):
        self.patch.stop()
        self.tmp.cleanup()

    def _prepare(self, zone="seasonal"):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")
        return self.client.post(f"/api/counties/{self.county.id}/prepare-data/", {"zone": zone}, format="json")

    def test_prepare_writes_real_rainfall_and_labelled_synthetic_history(self):
        resp = self._prepare()
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertTrue(resp.data["readiness"]["forecast_ready"])

        rain = list(
            ClimateObservation.objects.filter(county=self.county, source="CHIRPS").order_by("observation_date").values_list("rainfall_mm", flat=True)
        )
        self.assertEqual([round(r) for r in rain], [10, 20, 30, 40])  # the real raster values
        self.assertEqual(ClimateObservation.objects.filter(county=self.county, source="synthetic_climatology_v1").count(), 4)
        self.assertEqual(HistoricalCaseData.objects.filter(county=self.county, source="synthetic_v1").count(), 4)

    def test_prepare_is_idempotent(self):
        self._prepare()
        self._prepare()
        self.assertEqual(HistoricalCaseData.objects.filter(county=self.county).count(), 4)
        self.assertEqual(ClimateObservation.objects.filter(county=self.county, source="CHIRPS").count(), 4)

    def test_zone_sets_the_case_level(self):
        self._prepare("low_risk")
        low = sum(HistoricalCaseData.objects.filter(county=self.county).values_list("confirmed_cases", flat=True))
        self._prepare("lake_endemic")
        high = sum(HistoricalCaseData.objects.filter(county=self.county).values_list("confirmed_cases", flat=True))
        self.assertGreater(high, low * 10)

    def test_requires_a_boundary_and_a_known_zone(self):
        self.assertEqual(self._prepare("tropical").status_code, 400)
        no_shape = County.objects.create(name="Kitui", code="KEN-015")
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")
        resp = self.client.post(f"/api/counties/{no_shape.id}/prepare-data/", {"zone": "seasonal"}, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("locate it on the map", resp.data["detail"])

    def test_prepare_requires_sign_in(self):
        resp = self.client.post(f"/api/counties/{self.county.id}/prepare-data/", {"zone": "seasonal"}, format="json")
        self.assertIn(resp.status_code, (401, 403))

    def test_readiness_reports_each_county(self):
        before = self.client.get("/api/counties/readiness/").data
        self.assertFalse(before["counties"][self.county.id]["forecast_ready"])
        self.assertIn("seasonal", [z["id"] for z in before["zones"]])
        self._prepare()
        after = self.client.get("/api/counties/readiness/").data["counties"][self.county.id]
        self.assertEqual(after["rainfall_months"], 4)
        self.assertTrue(after["forecast_ready"])


class SimulationStartTests(TestCase):
    """GET /api/counties/{id}/simulation-start/ — real starting values for
    the outbreak simulator."""

    def setUp(self):
        self.client = APIClient()
        self.county = County.objects.create(name="Kisumu", code="KEN-042", population=1_200_000)
        for i, cases in enumerate([20_000.0, 25_000.0, 30_000.0]):
            HistoricalCaseData.objects.create(county=self.county, period_start=date(2026, 6 + i, 1), confirmed_cases=cases, source="synthetic_v1")
        for year in (2025, 2026):
            for month in range(1, 13):
                ClimateObservation.objects.create(
                    county=self.county, observation_date=date(year, month, 1), rainfall_mm=10.0 * month + (year - 2025) * 10, source="CHIRPS"
                )

    def test_returns_population_current_infections_and_seasonality(self):
        resp = self.client.get(f"/api/counties/{self.county.id}/simulation-start/")
        self.assertEqual(resp.status_code, 200, resp.data)
        body = resp.data
        self.assertEqual(body["population"], 1_200_000)
        # Latest month 30,000 cases -> ~30,000/30.44*14 people infectious now.
        self.assertAlmostEqual(body["initial_infectious"], 30_000 / (365.25 / 12) * 14, delta=1)
        self.assertEqual(len(body["seasonal_rainfall_mm"]), 12)
        self.assertAlmostEqual(body["seasonal_rainfall_mm"][0], 15.0)  # Jan: mean of 10 and 20
        self.assertEqual([m["cases"] for m in body["recent_monthly_cases"]], [20_000.0, 25_000.0, 30_000.0])

    def test_county_without_case_history_is_explained(self):
        empty = County.objects.create(name="Machakos", code="KEN-016", population=1_400_000)
        resp = self.client.get(f"/api/counties/{empty.id}/simulation-start/")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("set it up", resp.data["detail"])

    def test_infectious_estimate_is_capped(self):
        tiny = County.objects.create(name="Tiny", code="KEN-099", population=1_000)
        HistoricalCaseData.objects.create(county=tiny, period_start=date(2026, 8, 1), confirmed_cases=50_000.0, source="synthetic_v1")
        resp = self.client.get(f"/api/counties/{tiny.id}/simulation-start/")
        self.assertEqual(resp.data["initial_infectious"], 200)
        self.assertIsNone(resp.data["seasonal_rainfall_mm"])
