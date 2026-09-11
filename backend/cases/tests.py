import tempfile
from pathlib import Path

import numpy as np
import rasterio
from django.contrib.auth import get_user_model
from django.test import TestCase
from rasterio.transform import from_origin
from shapely.geometry import Polygon

from data.scripts.aggregate_climate import aggregate_raster_to_polygon
from .models import CaseReport, County, HealthFacility


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

            self.assertAlmostEqual(result, 20.0, places=3)


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
