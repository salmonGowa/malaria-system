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
from .models import CaseReport, ClimateObservation, County, ForecastRun, HealthFacility, HistoricalCaseData
from .services.allocation_generation_service import AllocationGenerationError, AllocationGenerationService
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
    
