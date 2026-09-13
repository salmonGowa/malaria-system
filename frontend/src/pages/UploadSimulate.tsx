import { ChangeEvent, FormEvent, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { mlApi, UploadSimulationResponse } from "../api/client";
import { DownloadIcon, UploadIcon } from "../components/icons";
import { downloadCsv } from "../lib/csv";
import { formatCompact, formatNumber } from "../lib/format";
import { useLanguage } from "../lib/i18n";

const tooltipStyle = { background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13 };

const TEMPLATE_ROWS = [
  { date: "2026-01-01", confirmed_cases: 180, rainfall_mm: 45 },
  { date: "2026-02-01", confirmed_cases: 420, rainfall_mm: 90 },
  { date: "2026-03-01", confirmed_cases: 1100, rainfall_mm: 160 },
  { date: "2026-04-01", confirmed_cases: 2400, rainfall_mm: 210 },
  { date: "2026-05-01", confirmed_cases: 1600, rainfall_mm: 130 },
  { date: "2026-06-01", confirmed_cases: 650, rainfall_mm: 60 },
  { date: "2026-07-01", confirmed_cases: 210, rainfall_mm: 30 },
  { date: "2026-08-01", confirmed_cases: 120, rainfall_mm: 25 },
];

export default function UploadSimulate() {
  const { t } = useLanguage();
  const [file, setFile] = useState<File | null>(null);
  const [population, setPopulation] = useState(500000);
  const [horizonMonths, setHorizonMonths] = useState(6);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadSimulationResponse | null>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] ?? null);
    setResult(null);
    setError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Choose a CSV file first.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await mlApi.simulateUpload(file, population, horizonMonths);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^Request to .*? — /, "") : "Simulation failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h2>{t("page.uploadSimulate")}</h2>
      <p className="placeholder-note">
        Fits the SEIR compartmental model (ml_service/app/compartmental.py) to a case series you upload, then
        projects it forward — no county data involved, nothing is saved. Uses SEIR rather than the trained XGBoost
        model on purpose: that model only means something for the 5 counties it was trained on, while a compartmental
        fit works on any dataset you give it.
      </p>

      <div className="card">
        <h3>1. Format your data</h3>
        <p className="card-subtitle">
          A CSV with columns <code className="mono">date</code> (YYYY-MM-DD or YYYY-MM),{" "}
          <code className="mono">confirmed_cases</code>, and optionally <code className="mono">rainfall_mm</code> —
          at least 6 monthly rows. Works best for a single emerging outbreak (one rise and fall); see the warning
          below if you upload a full endemic year instead.
        </p>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => downloadCsv("upload-simulate-template.csv", TEMPLATE_ROWS, ["date", "confirmed_cases", "rainfall_mm"])}
        >
          <DownloadIcon size={14} /> Download template CSV
        </button>
      </div>

      <div className="card">
        <h3>2. Upload &amp; run</h3>
        <form onSubmit={handleSubmit}>
          <div className="field-row">
            <label className="field" style={{ flex: 2 }}>
              <span className="field-label">CSV file</span>
              <input type="file" accept=".csv,text/csv" onChange={handleFileChange} />
              {file && <span className="field-hint">{file.name}</span>}
            </label>
            <label className="field">
              <span className="field-label">Population</span>
              <input type="number" min={1} value={population} onChange={(e) => setPopulation(Number(e.target.value))} />
            </label>
            <label className="field">
              <span className="field-label">Forecast horizon (months)</span>
              <input
                type="number"
                min={1}
                max={24}
                value={horizonMonths}
                onChange={(e) => setHorizonMonths(Number(e.target.value))}
              />
            </label>
          </div>

          {error && <p className="form-banner-error">{error}</p>}

          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? "Fitting…" : (
              <>
                <UploadIcon size={14} /> Upload &amp; simulate
              </>
            )}
          </button>
        </form>
      </div>

      {result && (
        <div className="card">
          <h3>Result</h3>
          <p className="card-subtitle">
            {result.rows_used} uploaded rows · population {formatNumber(result.population)} ·{" "}
            {result.used_rainfall ? "rainfall column used" : "no rainfall column — constant transmission assumed"}
          </p>

          {result.warnings.map((w, i) => (
            <p key={i} className="form-banner-error">
              {w}
            </p>
          ))}

          <div className="kpi-row" style={{ marginTop: 4 }}>
            <div className="kpi-card kpi-tone-neutral">
              <div className="kpi-label">Fit quality</div>
              <div className="kpi-value">{(1 - Math.min(result.fit_relative_error, 1)).toLocaleString(undefined, { style: "percent" })}</div>
              <div className="kpi-hint">how closely the fit tracks your uploaded data</div>
            </div>
            <div className="kpi-card kpi-tone-neutral">
              <div className="kpi-label">Fitted β₀ / k</div>
              <div className="kpi-value mono">
                {result.fitted_params.beta0.toFixed(2)} / {result.fitted_params.k.toFixed(2)}
              </div>
              <div className="kpi-hint">base transmission / rainfall sensitivity</div>
            </div>
            <div className="kpi-card kpi-tone-neutral">
              <div className="kpi-label">Reporting fraction</div>
              <div className="kpi-value mono">{(result.fitted_params.reporting_fraction * 100).toFixed(1)}%</div>
              <div className="kpi-hint">true infections → confirmed reports</div>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={result.series} margin={{ left: 8 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis dataKey="date" stroke="var(--muted)" fontSize={11} />
              <YAxis stroke="var(--muted)" fontSize={12} tickFormatter={formatCompact} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => (v === null ? "—" : formatCompact(Number(v)))} />
              <Legend />
              <Line type="monotone" dataKey="actual" name="Actual (uploaded)" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3 }} />
              <Line
                type="monotone"
                dataKey="fitted"
                name="Fitted (in-sample)"
                stroke="var(--series-1)"
                strokeWidth={2}
                strokeDasharray="4 3"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="predicted"
                name="Projected forward"
                stroke="var(--series-2)"
                strokeWidth={2}
                strokeDasharray="4 3"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>

          <p className="field-hint" style={{ marginTop: 10 }}>
            {result.disclaimer}
          </p>
        </div>
      )}
    </div>
  );
}
