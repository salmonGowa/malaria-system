import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api, County, ForecastRun, GenerateForecastsError } from "../api/client";
import CountyPicker from "../components/CountyPicker";
import { UserIcon } from "../components/icons";
import { useAuth } from "../lib/auth";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function GenerateForecast() {
  const { username } = useAuth();
  const [counties, setCounties] = useState<County[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [asOfDate, setAsOfDate] = useState(todayIso());
  const [horizonWeeks, setHorizonWeeks] = useState(4);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: ForecastRun[]; errors: GenerateForecastsError[] } | null>(null);

  useEffect(() => {
    api
      .listAllCounties()
      .then((cs) => {
        setCounties(cs);
        setSelected(new Set(cs.map((c) => c.id)));
      })
      .catch(() => undefined);
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (selected.size === 0) {
      setError("Select at least one county.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.generateForecasts({
        county_ids: [...selected],
        as_of_date: asOfDate,
        horizon_weeks: horizonWeeks,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate forecasts");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h2>Generate Forecast</h2>
      <p className="placeholder-note">
        Calls the trained model (ml_service/app/forecasting.py) for each selected county using its real recent
        rainfall + case history, and stores the result. See results on <Link to="/forecasts">Forecasts</Link>.
      </p>

      <div className="card">
        {!username && (
          <p className="form-banner-error">
            <UserIcon size={14} /> Sign in (top right) to generate forecasts.
          </p>
        )}

        <form onSubmit={handleSubmit}>
          <CountyPicker counties={counties} selected={selected} onChange={setSelected} />

          <div className="field-row">
            <label className="field">
              <span className="field-label">As of date</span>
              <input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} disabled={!username} />
            </label>
            <label className="field">
              <span className="field-label">Horizon (weeks)</span>
              <input
                type="number"
                min={1}
                max={26}
                value={horizonWeeks}
                onChange={(e) => setHorizonWeeks(Number(e.target.value))}
                disabled={!username}
              />
            </label>
          </div>

          {error && <p className="form-banner-error">{error}</p>}

          <button type="submit" className="btn btn-primary" disabled={!username || submitting}>
            {submitting ? "Generating…" : "Generate forecasts"}
          </button>
        </form>

        {result && (
          <div className="generate-results">
            {result.created.length > 0 && (
              <p className="form-banner-success">
                Generated {result.created.length} forecast{result.created.length === 1 ? "" : "s"}.
              </p>
            )}
            <ul className="generate-results-list">
              {result.created.map((f) => (
                <li key={f.id}>
                  <span>{f.county_name}</span>
                  <span className="risk-value">risk {f.risk_score.toFixed(3)}</span>
                </li>
              ))}
              {result.errors.map((e) => (
                <li key={e.county_code}>
                  <span>{e.county_name}</span>
                  <span style={{ color: "var(--risk-high)" }}>{e.error}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
