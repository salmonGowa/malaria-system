"""County boundaries from GADM — the one place county geometry comes from.

Used by the dashboard's "Locate on map" flow and by
data/scripts/load_county_boundaries.py, so both match names and build
geometry the same way. Boundaries come from GADM v4.1's Kenya level-1
(county) layer rather than being hand-drawn: climate aggregation averages
raster cells inside the exact polygon (see aggregate_climate.py), so an
approximate shape would quietly skew every rainfall input for that county.

Source: GADM v4.1, https://gadm.org (free for academic/non-commercial use).
The file is downloaded once and cached under data/raw/ (gitignored).
"""
import io
import json
import re
import urllib.request
import zipfile
from pathlib import Path

from django.conf import settings
from django.contrib.gis.geos import GEOSGeometry, MultiPolygon

GADM_URL = "https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_KEN_1.json.zip"
NAME_FIELD = "NAME_1"
DEFAULT_CACHE_PATH = Path(settings.BASE_DIR).parent / "data" / "raw" / "gadm" / "gadm41_KEN_1.json"


class BoundaryLookupError(RuntimeError):
    pass


def normalize_name(name):
    """Loose match: 'Homa Bay' / 'HomaBay' / 'homa-bay' all collapse to 'homabay'."""
    return re.sub(r"[^a-z0-9]", "", name.lower())


def to_multipolygon(geometry):
    geom = GEOSGeometry(json.dumps(geometry))
    if geom.geom_type == "Polygon":
        geom = MultiPolygon(geom)
    elif geom.geom_type != "MultiPolygon":
        raise ValueError(f"Unexpected geometry type: {geom.geom_type}")
    return geom


def features_from_bytes(blob, is_zip):
    if is_zip:
        with zipfile.ZipFile(io.BytesIO(blob)) as zf:
            json_name = next(n for n in zf.namelist() if n.endswith(".json"))
            blob = zf.read(json_name)
    return json.loads(blob)["features"]


def download_gadm(timeout=60):
    with urllib.request.urlopen(GADM_URL, timeout=timeout) as resp:
        return resp.read()


# Parsed once per process — the file is ~10 MB and never changes.
_FEATURES_CACHE = {}


class CountyBoundaryService:
    def __init__(self, cache_path=None, downloader=None):
        # Resolved at call time (not as default args) so tests can patch the
        # module-level cache path / downloader.
        self.cache_path = Path(cache_path or DEFAULT_CACHE_PATH)
        self.downloader = downloader or download_gadm

    def features(self):
        key = str(self.cache_path)
        if key in _FEATURES_CACHE:
            return _FEATURES_CACHE[key]
        if self.cache_path.exists():
            features = features_from_bytes(self.cache_path.read_bytes(), is_zip=False)
        else:
            try:
                blob = self.downloader()
            except Exception as exc:  # network errors surface as one clear message
                raise BoundaryLookupError(f"Couldn't download GADM boundaries: {exc}") from exc
            features = features_from_bytes(blob, is_zip=True)
            self.cache_path.parent.mkdir(parents=True, exist_ok=True)
            self.cache_path.write_text(json.dumps({"type": "FeatureCollection", "features": features}))
        _FEATURES_CACHE[key] = features
        return features

    def names(self):
        return sorted(f["properties"][NAME_FIELD] for f in self.features())

    def find(self, name):
        wanted = normalize_name(name)
        return next((f for f in self.features() if normalize_name(f["properties"][NAME_FIELD]) == wanted), None)

    def suggest(self, county, name=None):
        """The GADM boundary matching `name` (default: the county's own name),
        plus every GADM county name to choose from when nothing matches.
        Read-only — nothing is saved."""
        feature = self.find(name or county.name)
        return {
            "matched": feature is not None,
            "gadm_name": feature["properties"][NAME_FIELD] if feature else None,
            "geometry": feature["geometry"] if feature else None,
            "candidates": self.names(),
        }

    def apply(self, county, gadm_name):
        feature = self.find(gadm_name)
        if feature is None:
            raise BoundaryLookupError(f"No GADM county named {gadm_name!r}.")
        county.boundary = to_multipolygon(feature["geometry"])
        county.save(update_fields=["boundary"])
        return county
