import json

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from app.allocation import optimise_allocation
from app.forecasting import MODELS_DIR, InsufficientHistoryError, ModelNotTrainedError, trained_forecast
from app.schemas import (
    AllocationRequest,
    AllocationResponse,
    ForecastRequest,
    ForecastResponse,
    SimulationRequest,
    SimulationResponse,
    UploadSimulationResponse,
)
from app.simulation import simulate_outbreak
from app.upload_simulation import UploadValidationError, parse_csv, simulate_upload

MAX_UPLOAD_BYTES = 2 * 1024 * 1024  # 2MB — generous for a monthly case-count CSV, cheap to abuse otherwise

app = FastAPI(
    title="Malaria Forecasting & Allocation Service",
    description="Serves outbreak risk forecasts and vaccine allocation recommendations "
    "to the Django backend and dashboard. No TensorFlow — scikit-learn/XGBoost for "
    "forecasting, PuLP for allocation optimisation.",
    version="0.1.0",
)

# Called directly from the browser (the dashboard's what-if simulators hit this
# service without going through Django), so it needs its own CORS policy rather
# than relying on the Django backend's corsheaders config.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/model-info")
def model_info():
    """Training metadata for the currently-loaded forecast model — feature
    list, held-out test metrics, the SEIR/climate-free-baseline comparison,
    training window. Written by data/scripts/train_forecast_model.py; the
    dashboard's Analytics page reads this to chart real model performance
    rather than restating numbers by hand. 503 (not a silent {}) if nothing
    has been trained yet — same "don't guess" rule as /forecast."""
    metadata_path = MODELS_DIR / "forecast_metadata.json"
    if not metadata_path.exists():
        raise HTTPException(status_code=503, detail="No trained model yet — run data/scripts/train_forecast_model.py.")
    return json.loads(metadata_path.read_text())


@app.post("/forecast", response_model=ForecastResponse)
def forecast(request: ForecastRequest):
    """Real implementation — trained XGBoost classifier (risk) + regressor
    (predicted cases). See app/forecasting.py and data/scripts/train_forecast_model.py."""
    try:
        return trained_forecast(request)
    except ModelNotTrainedError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except InsufficientHistoryError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/allocate", response_model=AllocationResponse)
def allocate(request: AllocationRequest):
    """Real implementation — risk-weighted linear-programming allocation. See
    app/allocation.py for the model and its current limitations."""
    return optimise_allocation(request)


@app.post("/simulate", response_model=SimulationResponse)
def simulate(request: SimulationRequest):
    """ILLUSTRATIVE — a generic SEIR compartmental model, not the trained,
    data-fitted forecasting model from Module 2. See app/simulation.py."""
    return simulate_outbreak(request)


@app.post("/simulate-upload", response_model=UploadSimulationResponse)
async def simulate_upload_endpoint(
    file: UploadFile = File(..., description="CSV with columns: date, confirmed_cases, rainfall_mm (optional)"),
    population: int = Form(..., gt=0),
    horizon_months: int = Form(6, ge=1, le=24),
):
    """Fit the SEIR compartmental model to an arbitrary uploaded case series
    and project it forward — see app/upload_simulation.py for why this uses
    SEIR rather than the trained XGBoost model (that one is only meaningful
    for the 5 counties it was actually trained on)."""
    raw = await file.read()
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"File too large — max {MAX_UPLOAD_BYTES // 1024}KB.")

    try:
        rows = parse_csv(raw)
        return simulate_upload(rows, population, horizon_months)
    except UploadValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ValueError as exc:  # compartmental.fit_county's own guards (e.g. too-short series)
        raise HTTPException(status_code=422, detail=str(exc)) from exc
