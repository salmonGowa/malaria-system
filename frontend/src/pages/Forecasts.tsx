import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";

import { api, ForecastRun, HistoricalCaseData } from "../api/client";
import Pagination from "../components/Pagination";
import { DownloadIcon } from "../components/icons";
import { forecastAccuracy } from "../lib/analytics";
import { downloadCsv } from "../lib/csv";
import { formatCompact, riskBand } from "../lib/format";
import { useThresholds } from "../lib/useThresholds";
import { useLanguage } from "../lib/i18n";

const PAGE_SIZE = 50;
const tooltipStyle = { background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13 };

export default function Forecasts() {
  const { t } = useLanguage();
  const thresholds = useThresholds();
  const [forecasts, setForecasts] = useState<ForecastRun[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [allForecasts, setAllForecasts] = useState<ForecastRun[]>([]);
  const [historical, setHistorical] = useState<HistoricalCaseData[]>([]);

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

  // Separate from the paginated table above — accuracy needs every forecast
  // + the full historical series to find overlapping county/months, not just
  // whatever page is currently showing.
  useEffect(() => {
    api.listAllForecasts().then(setAllForecasts).catch(() => undefined);
    api.listAllHistoricalCaseData().then(setHistorical).catch(() => undefined);
  }, []);

  const riskAndBand = useMemo(
    () =>
      new Map(
        forecasts.map((f) => [f.id, { band: riskBand(f.risk_score, thresholds), isPlaceholder: f.model_name === "placeholder_not_trained" }]),
      ),
    [forecasts, thresholds],
  );

  const accuracyData = useMemo(() => forecastAccuracy(allForecasts, historical), [allForecasts, historical]);

  return (
    <div>
      <h2>{t("page.outbreakForecasts")}</h2>
      <p className="placeholder-note">
        ml_service/app/forecasting.py loads a trained XGBoost model (see docs/architecture.md's "Model results" for
        honest accuracy numbers). To run a new forecast, see Generate Forecast in the nav.
      </p>

      {accuracyData.length > 0 && (
        <div className="card">
          <h3>Forecast accuracy</h3>
          <p className="card-subtitle">
            Predicted vs. actual cases, for forecasts whose period falls inside the historical case window (synthetic_v1)
            — points closer to the diagonal are more accurate. {accuracyData.length} comparable forecast(s).
          </p>
          <ResponsiveContainer width="100%" height={280}>
            <ScatterChart margin={{ bottom: 8, left: 8 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis
                type="number"
                dataKey="predicted"
                name="Predicted"
                stroke="var(--muted)"
                fontSize={12}
                tickFormatter={formatCompact}
                label={{ value: "Predicted cases", position: "insideBottom", offset: -4, fill: "var(--muted)", fontSize: 12 }}
              />
              <YAxis
                type="number"
                dataKey="actual"
                name="Actual"
                stroke="var(--muted)"
                fontSize={12}
                tickFormatter={formatCompact}
                label={{ value: "Actual cases", angle: -90, position: "insideLeft", fill: "var(--muted)", fontSize: 12 }}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                cursor={{ strokeDasharray: "3 3" }}
                formatter={(v, name) => [formatCompact(Number(v)), name]}
                labelFormatter={() => ""}
              />
              <Scatter data={accuracyData} fill="var(--series-1)" />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="card">
        <div className="card-header-row">
          {error && <p style={{ color: "var(--risk-high)" }}>Could not reach backend: {error}</p>}
          {!loading && forecasts.length === 0 && !error && <p className="placeholder-note">No forecast runs yet.</p>}
          {forecasts.length > 0 && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() =>
                downloadCsv(
                  "forecasts.csv",
                  allForecasts.length ? allForecasts : forecasts,
                  [
                    "county_name",
                    "forecast_period_start",
                    "forecast_period_end",
                    "predicted_cases",
                    "risk_score",
                    "model_name",
                    "generated_at",
                    "generated_by_username",
                  ],
                )
              }
            >
              <DownloadIcon size={14} /> {t("common.exportCsv")}
            </button>
          )}
        </div>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Outbreak forecasts table, scrollable horizontally">
          <table>
            <thead>
              <tr>
                <th>{t("table.county")}</th>
                <th>{t("table.period")}</th>
                <th>{t("table.predictedCases")}</th>
                <th>{t("table.riskScore")}</th>
                <th>{t("table.model")}</th>
                <th>{t("table.triggeredBy")}</th>
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
                    <td className="field-hint">{f.generated_by_username ?? "—"}</td>
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
