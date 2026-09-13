"""Upload-and-simulate module: fit the SEIR compartmental model
(app/compartmental.py) against an arbitrary user-uploaded case series and
project it forward.

Deliberately built on the compartmental model, not the trained XGBoost
classifier (app/forecasting.py): that model was trained on the specific
feature distribution of 5 particular Kenyan counties (see
data/scripts/train_forecast_model.py) and would produce a confident-looking
but meaningless number for a dataset outside that distribution — wrong
population scale, wrong baseline rate, features it's never seen. SEIR
calibration is a per-dataset fit: `compartmental.fit_county` doesn't care
what population or case scale it's given, it fits to whatever series it's
handed. That's the right tool for "bring your own data," even though it's
the weaker of the two models on the data it WAS built for (see
docs/architecture.md's "Model results" — the trained model beats SEIR by a
wide margin on the 5 counties it was actually trained on).
"""
import csv
import io
from datetime import date, datetime

from app import compartmental

REQUIRED_COLUMNS = {"date", "confirmed_cases"}
MIN_ROWS = 6  # compartmental.fit_county itself requires >= 4; a slightly
# higher bar here since a 4-6 point fit is rarely a meaningful one to show a user.


class UploadValidationError(ValueError):
    """A problem with the uploaded file itself — mapped to HTTP 422, not 500,
    since it's the user's input that's wrong, not the server."""


def _parse_date(value, line_no):
    for fmt in ("%Y-%m-%d", "%Y-%m"):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    raise UploadValidationError(f"Line {line_no}: unrecognised date {value!r} — use YYYY-MM-DD or YYYY-MM.")


def parse_csv(raw_bytes: bytes) -> list[dict]:
    """Returns rows sorted chronologically: [{date, confirmed_cases, rainfall_mm|None}, ...].
    Raises UploadValidationError with a line-numbered message on anything
    that doesn't parse — never silently drops a bad value into the fit."""
    try:
        text = raw_bytes.decode("utf-8-sig")  # -sig: tolerate an Excel-exported BOM
    except UnicodeDecodeError as exc:
        raise UploadValidationError("File isn't valid UTF-8 text — export/save the CSV with UTF-8 encoding.") from exc

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise UploadValidationError("File appears to be empty.")

    columns = {c.strip().lower() for c in reader.fieldnames}
    missing = REQUIRED_COLUMNS - columns
    if missing:
        raise UploadValidationError(
            f"Missing required column(s): {', '.join(sorted(missing))}. "
            "Expected at least: date, confirmed_cases (rainfall_mm is optional)."
        )

    rows = []
    for i, raw_row in enumerate(reader, start=2):  # start=2: header is line 1
        row = {(k or "").strip().lower(): (v.strip() if v else v) for k, v in raw_row.items()}
        date_str, cases_str = row.get("date"), row.get("confirmed_cases")
        if not date_str and not cases_str:
            continue  # a genuinely blank line (e.g. trailing newline) — skip, don't fail

        if not date_str or not cases_str:
            raise UploadValidationError(f"Line {i}: date and confirmed_cases are both required.")

        parsed_date = _parse_date(date_str, i)
        try:
            cases = float(cases_str)
        except ValueError:
            raise UploadValidationError(f"Line {i}: confirmed_cases {cases_str!r} isn't a number.")
        if cases < 0:
            raise UploadValidationError(f"Line {i}: confirmed_cases can't be negative.")

        rainfall = None
        rainfall_raw = row.get("rainfall_mm")
        if rainfall_raw:
            try:
                rainfall = float(rainfall_raw)
            except ValueError:
                raise UploadValidationError(f"Line {i}: rainfall_mm {rainfall_raw!r} isn't a number.")

        rows.append({"date": parsed_date, "confirmed_cases": cases, "rainfall_mm": rainfall})

    rows.sort(key=lambda r: r["date"])
    if len(rows) < MIN_ROWS:
        raise UploadValidationError(f"Need at least {MIN_ROWS} monthly rows for a meaningful fit — got {len(rows)}.")
    return rows


def _add_months(d: date, n: int) -> date:
    y, m = d.year, d.month + n
    while m > 12:
        m -= 12
        y += 1
    while m < 1:
        m += 12
        y -= 1
    return date(y, m, 1)


def simulate_upload(rows: list[dict], population: int, horizon_months: int) -> dict:
    """rows: parse_csv's output. Fits SEIR to the uploaded series, replays
    the fit over the same window (so the user can see how well it actually
    tracks their data — an honest "does this model even fit" check, not
    just a forward projection taken on faith), then projects `horizon_months`
    beyond it."""
    cases = [r["confirmed_cases"] for r in rows]
    used_rainfall = any(r["rainfall_mm"] is not None for r in rows)
    rainfall = [r["rainfall_mm"] if r["rainfall_mm"] is not None else 0.0 for r in rows]

    warnings = []
    if not used_rainfall:
        warnings.append(
            "No rainfall_mm column (or all blank) — fit assumes constant transmission with no climate "
            "modulation, equivalent to a flat rainfall_response of 0 every month."
        )
    elif any(r["rainfall_mm"] is None for r in rows):
        warnings.append("Some rows are missing rainfall_mm — those months were treated as 0mm in the fit.")

    params = compartmental.fit_county(population, rainfall, cases)

    # Replay the fit over the uploaded window with the exact same initial
    # state fit_county used internally, so "fitted" is genuinely what the
    # calibration produced, not a re-simulation from a different starting point.
    initial_state = compartmental.initial_state_for(population)
    fitted = compartmental.simulate_series(params, initial_state, rainfall)

    # A plain SEIR has permanent immunity and no reinfection/import term —
    # once a wave passes, I decays toward 0 with nothing to sustain a
    # baseline. It genuinely cannot reproduce multiple seasonal waves (a
    # rise, fall, AND recovery) inside one calibration window; it can only
    # fit a single rise-and-fall. That's a structural property of this model
    # (see app/compartmental.py), not a fitting bug, so tell the user rather
    # than let a bad-looking chart speak for itself. Relative RMSE is a
    # simple, honest way to catch it automatically.
    mean_actual = sum(cases) / len(cases)
    rmse = (sum((f - a) ** 2 for f, a in zip(fitted, cases)) / len(cases)) ** 0.5
    relative_error = rmse / mean_actual if mean_actual > 0 else float("inf")
    if relative_error > 0.5:
        warnings.append(
            f"The fit doesn't track your data well (typical error ~{relative_error:.0%} of the mean case "
            "count). This usually means the uploaded series has more than one seasonal wave — a plain SEIR "
            "has permanent immunity and nothing to sustain a case count between waves, so it can only "
            "represent a single rise-and-fall per fit. Try uploading a shorter window around one emerging "
            "outbreak rather than a full endemic year for a fit that actually means something."
        )

    series = [
        {"date": r["date"].isoformat(), "actual": r["confirmed_cases"], "fitted": f, "predicted": None}
        for r, f in zip(rows, fitted)
    ]

    # Project forward: repeat the mean of the last 3 uploaded rainfall
    # values (only over months that actually had rainfall data) — "recent
    # conditions continue" is the simplest honest assumption available
    # without asking the user to also supply future rainfall.
    recent_rainfall = [rf for rf in rainfall[-3:]]
    projected_rainfall = [sum(recent_rainfall) / len(recent_rainfall)] * horizon_months
    forecast_values = compartmental.forecast(params, population, projected_rainfall, cases[-3:])

    last_date = rows[-1]["date"]
    for i, value in enumerate(forecast_values, start=1):
        series.append({"date": _add_months(last_date, i).isoformat(), "actual": None, "fitted": None, "predicted": value})

    return {
        "population": population,
        "rows_used": len(rows),
        "used_rainfall": used_rainfall,
        "fitted_params": {
            "beta0": params.beta0,
            "k": params.k,
            "reporting_fraction": params.reporting_fraction,
        },
        "fit_relative_error": relative_error,
        "series": series,
        "warnings": warnings,
        "disclaimer": (
            "SEIR fit to your uploaded data, not the trained XGBoost model — see "
            "ml_service/app/upload_simulation.py for why. Treat the projected months as illustrative, "
            "not a validated forecast: the model has only ever seen the data you just uploaded."
        ),
    }
