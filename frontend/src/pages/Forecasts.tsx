import { useEffect, useMemo, useState } from "react";

import { api, ForecastRun } from "../api/client";
import Pagination from "../components/Pagination";
import { riskBand } from "../lib/format";

const PAGE_SIZE = 50;

export default function Forecasts() {
  const [forecasts, setForecasts] = useState<ForecastRun[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .listForecasts(page)
      .then((data) => {
        setForecasts(data.results);
        setCount(data.count);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [page]);

  const riskAndBand = useMemo(
    () =>
      new Map(forecasts.map((f) => [f.id, { band: riskBand(f.risk_score), isPlaceholder: f.model_name === "placeholder_not_trained" }])),
    [forecasts],
  );

  return (
    <div>
      <h2>Outbreak Forecasts</h2>
      <p className="placeholder-note">
        ml_service/app/forecasting.py loads a trained XGBoost model (see docs/architecture.md's "Model results" for
        honest accuracy numbers). To run a new forecast, see Generate Forecast in the nav.
      </p>

      <div className="card">
        {error && <p style={{ color: "var(--risk-high)" }}>Could not reach backend: {error}</p>}
        {!loading && forecasts.length === 0 && !error && <p className="placeholder-note">No forecast runs yet.</p>}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>County</th>
                <th>Period</th>
                <th>Predicted cases</th>
                <th>Risk score</th>
                <th>Model</th>
              </tr>
            </thead>
            <tbody>
              {forecasts.map((f) => {
                const meta = riskAndBand.get(f.id);
                return (
                  <tr key={f.id}>
                    <td>{f.county_name}</td>
                    <td>
                      {f.forecast_period_start} → {f.forecast_period_end}
                    </td>
                    <td className="mono">{f.predicted_cases.toFixed(1)}</td>
                    <td className={`mono text-risk-${meta?.band ?? "low"}`} style={{ fontWeight: 600 }}>
                      {f.risk_score.toFixed(3)}
                    </td>
                    <td>{meta?.isPlaceholder ? <span className="placeholder-note">{f.model_name}</span> : f.model_name}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={PAGE_SIZE} count={count} onPageChange={setPage} />
      </div>
    </div>
  );
}
