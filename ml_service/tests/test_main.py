"""Endpoint-level tests via FastAPI's TestClient — separate from the
app/*.py unit tests, since these exercise request validation and HTTP status
mapping (main.py's job), not the underlying logic."""
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_health():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_forecast_without_enough_history_returns_422():
    resp = client.post(
        "/forecast",
        json={
            "county_code": "KEN-042",
            "as_of_date": "2026-05-01",
            "recent_confirmed_cases": [10, 20],  # only 2 months
            "recent_rainfall_mm": [5, 10],
        },
    )
    # Either a trained model rejects short history (422) or no model exists
    # yet (503) — both are correct "don't guess" outcomes, never a 200.
    assert resp.status_code in (422, 503)


def test_allocate_real_endpoint():
    resp = client.post(
        "/allocate",
        json={
            "total_available_doses": 1000,
            "county_forecasts": [
                {
                    "county_code": "A",
                    "forecast_period_start": "2026-05-01",
                    "forecast_period_end": "2026-05-28",
                    "predicted_cases": 0.0,
                    "risk_score": 0.8,
                    "model_name": "test",
                    "model_version": "test",
                }
            ],
            "county_populations": {"A": 5000},
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["total_allocated_doses"] == 1000


def test_model_info():
    from app.forecasting import MODELS_DIR

    resp = client.get("/model-info")
    if not (MODELS_DIR / "forecast_metadata.json").exists():
        assert resp.status_code == 503
        return

    assert resp.status_code == 200
    body = resp.json()
    for key in ("model_name", "feature_names", "held_out_test_metrics", "seir_benchmark_metrics", "climate_contribution_to_auc"):
        assert key in body


def test_simulate_endpoint_returns_disclaimer():
    resp = client.post(
        "/simulate",
        json={"population": 100000, "horizon_weeks": 4},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "illustrative" in body["disclaimer"].lower()
    assert len(body["weeks"]) == 5  # week 0 + 4 horizon weeks
