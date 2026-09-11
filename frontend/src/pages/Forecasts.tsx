import { useEffect, useState } from "react";

import { api, ForecastRun } from "../api/client";

export default function Forecasts() {
  const [forecasts, setForecasts] = useState<ForecastRun[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listForecasts()
      .then((data) => setForecasts(data.results))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div>
      <h2>Outbreak Forecasts</h2>
      <p className="placeholder-note">
        The ml_service's /forecast endpoint currently returns a placeholder (see
        ml_service/app/forecasting.py) until the trained model exists. This table
        will populate once ForecastRun records exist, whether from placeholder or
        real model output.
      </p>
      <div className="card">
        {error && <p style={{ color: "var(--risk-high)" }}>Could not reach backend: {error}</p>}
        {forecasts.length === 0 && !error && <p>No forecast runs yet.</p>}
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
            {forecasts.map((f) => (
              <tr key={f.id}>
                <td>{f.county_name}</td>
                <td>
                  {f.forecast_period_start} → {f.forecast_period_end}
                </td>
                <td>{f.predicted_cases.toFixed(1)}</td>
                <td>{f.risk_score.toFixed(2)}</td>
                <td>{f.model_name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
