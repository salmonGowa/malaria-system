from fastapi import FastAPI

from app.allocation import optimise_allocation
from app.forecasting import naive_forecast
from app.schemas import AllocationRequest, AllocationResponse, ForecastRequest, ForecastResponse

app = FastAPI(
    title="Malaria Forecasting & Allocation Service",
    description="Serves outbreak risk forecasts and vaccine allocation recommendations "
    "to the Django backend and dashboard. No TensorFlow — scikit-learn/XGBoost for "
    "forecasting, PuLP for allocation optimisation.",
    version="0.1.0",
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/forecast", response_model=ForecastResponse)
def forecast(request: ForecastRequest):
    """PLACEHOLDER — returns a deterministic non-answer until the trained model
    (Module 2) replaces `naive_forecast`. See app/forecasting.py."""
    return naive_forecast(request)


@app.post("/allocate", response_model=AllocationResponse)
def allocate(request: AllocationRequest):
    """Real implementation — risk-weighted linear-programming allocation. See
    app/allocation.py for the model and its current limitations."""
    return optimise_allocation(request)
