import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { mlApi, UploadSimulationResponse } from "../api/client";
import Card, { CARD_SUBTITLE_CLASS, CARD_TITLE_CLASS } from "../components/Card";
import KpiCard, { KPI_HINT_CLASS, KPI_LABEL_CLASS, KPI_ROW_CLASS, KPI_VALUE_CLASS, kpiCardClass } from "../components/KpiCard";
import { AlertIcon, CheckCircleIcon, DownloadIcon, InfoIcon, UploadIcon } from "../components/icons";
import { priorityBadgeClass } from "../lib/badgeClasses";
import { FORM_BANNER_ERROR_CLASS } from "../lib/bannerClasses";
import { btnClass } from "../lib/buttonClasses";
import {
  recCardClass,
  REC_ACTION_ITEM_CLASS,
  REC_ACTIONS_CLASS,
  REC_ACTIONS_LABEL_CLASS,
  REC_CARD_HEADER_CLASS,
  REC_WHY_CLASS,
  REC_WHY_SUMMARY_CLASS,
  REC_WHY_UL_CLASS,
} from "../lib/decisionSupportClasses";
import { downloadCsv } from "../lib/csv";
import {
  FIELD_HINT_CLASS,
  FIELD_INPUT_CLASS,
  FIELD_LABEL_CLASS,
  FIELD_ROW_CLASS,
  FIELD_ROW_FIELD_CLASS,
} from "../lib/fieldClasses";
import { formatCompact, formatNumber } from "../lib/format";
import { useLanguage } from "../lib/i18n";
import { PLACEHOLDER_NOTE_CLASS } from "../lib/noteClasses";
import { Concern, buildUploadInsights } from "../lib/uploadInsights";
import { useThresholds } from "../lib/useThresholds";

const CONCERN_LABEL: Record<Concern, string> = {
  high: "Escalating — needs attention",
  mid: "Monitor closely",
  low: "Stable",
};

const CONCERN_ICON: Record<Concern, typeof AlertIcon> = {
  high: AlertIcon,
  mid: InfoIcon,
  low: CheckCircleIcon,
};

function ConcernBadge({ concern }: { concern: Concern }) {
  const Icon = CONCERN_ICON[concern];
  return (
    <span className={priorityBadgeClass(concern)}>
      <Icon size={13} /> {CONCERN_LABEL[concern]}
    </span>
  );
}

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
  const thresholds = useThresholds();
  const [file, setFile] = useState<File | null>(null);
  const [population, setPopulation] = useState(500000);
  const [horizonMonths, setHorizonMonths] = useState(6);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadSimulationResponse | null>(null);

  const insights = useMemo(() => (result ? buildUploadInsights(result, thresholds) : null), [result, thresholds]);

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
      <p className={PLACEHOLDER_NOTE_CLASS}>
        Fits the SEIR compartmental model (ml_service/app/compartmental.py) to a case series you upload, then
        projects it forward — no county data involved, nothing is saved. Uses SEIR rather than the trained XGBoost
        model on purpose: that model only means something for the 5 counties it was trained on, while a compartmental
        fit works on any dataset you give it.
      </p>

      <Card>
        <h3 className={CARD_TITLE_CLASS}>1. Format your data</h3>
        <p className={CARD_SUBTITLE_CLASS}>
          A CSV with columns <code className="mono">date</code> (YYYY-MM-DD or YYYY-MM),{" "}
          <code className="mono">confirmed_cases</code>, and optionally <code className="mono">rainfall_mm</code> —
          at least 6 monthly rows. Works best for a single emerging outbreak (one rise and fall); see the warning
          below if you upload a full endemic year instead.
        </p>
        <button
          type="button"
          className={btnClass("secondary", { sm: true })}
          onClick={() => downloadCsv("upload-simulate-template.csv", TEMPLATE_ROWS, ["date", "confirmed_cases", "rainfall_mm"])}
        >
          <DownloadIcon size={14} /> Download template CSV
        </button>
      </Card>

      <Card>
        <h3 className={CARD_TITLE_CLASS}>2. Upload &amp; run</h3>
        <form onSubmit={handleSubmit}>
          <div className={FIELD_ROW_CLASS}>
            <label className={FIELD_ROW_FIELD_CLASS} style={{ flex: 2 }}>
              <span className={FIELD_LABEL_CLASS}>CSV file</span>
              <input type="file" accept=".csv,text/csv" onChange={handleFileChange} />
              {file && <span className={FIELD_HINT_CLASS}>{file.name}</span>}
            </label>
            <label className={FIELD_ROW_FIELD_CLASS}>
              <span className={FIELD_LABEL_CLASS}>Population</span>
              <input
                type="number"
                className={FIELD_INPUT_CLASS}
                min={1}
                value={population}
                onChange={(e) => setPopulation(Number(e.target.value))}
              />
            </label>
            <label className={FIELD_ROW_FIELD_CLASS}>
              <span className={FIELD_LABEL_CLASS}>Forecast horizon (months)</span>
              <input
                type="number"
                className={FIELD_INPUT_CLASS}
                min={1}
                max={24}
                value={horizonMonths}
                onChange={(e) => setHorizonMonths(Number(e.target.value))}
              />
            </label>
          </div>

          {error && <p className={FORM_BANNER_ERROR_CLASS}>{error}</p>}

          <button type="submit" className={btnClass("primary")} disabled={submitting}>
            {submitting ? "Fitting…" : (
              <>
                <UploadIcon size={14} /> Upload &amp; simulate
              </>
            )}
          </button>
        </form>
      </Card>

      {result && (
        <Card>
          <h3 className={CARD_TITLE_CLASS}>Result</h3>
          <p className={CARD_SUBTITLE_CLASS}>
            {result.rows_used} uploaded rows · population {formatNumber(result.population)} ·{" "}
            {result.used_rainfall ? "rainfall column used" : "no rainfall column — constant transmission assumed"}
          </p>

          {result.warnings.map((w, i) => (
            <p key={i} className={FORM_BANNER_ERROR_CLASS}>
              {w}
            </p>
          ))}

          <div className={KPI_ROW_CLASS} style={{ marginTop: 4 }}>
            <div className={kpiCardClass()}>
              <div className={KPI_LABEL_CLASS}>Fit quality</div>
              <div className={KPI_VALUE_CLASS}>{(1 - Math.min(result.fit_relative_error, 1)).toLocaleString(undefined, { style: "percent" })}</div>
              <div className={KPI_HINT_CLASS}>how closely the fit tracks your uploaded data</div>
            </div>
            <div className={kpiCardClass()}>
              <div className={KPI_LABEL_CLASS}>Fitted β₀ / k</div>
              <div className={`${KPI_VALUE_CLASS} mono`}>
                {result.fitted_params.beta0.toFixed(2)} / {result.fitted_params.k.toFixed(2)}
              </div>
              <div className={KPI_HINT_CLASS}>base transmission / rainfall sensitivity</div>
            </div>
            <div className={kpiCardClass()}>
              <div className={KPI_LABEL_CLASS}>Reporting fraction</div>
              <div className={`${KPI_VALUE_CLASS} mono`}>{(result.fitted_params.reporting_fraction * 100).toFixed(1)}%</div>
              <div className={KPI_HINT_CLASS}>true infections → confirmed reports</div>
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

          <p className={FIELD_HINT_CLASS} style={{ marginTop: 10 }}>
            {result.disclaimer}
          </p>
        </Card>
      )}

      {result && insights && (
        <Card className={recCardClass(insights.concern)}>
          <h3 className={CARD_TITLE_CLASS}>3. Report, suggestions &amp; decision support</h3>
          <p className={CARD_SUBTITLE_CLASS}>
            The same plain, fixed-rule approach as <Link to="/decision-support">Decision Support</Link> — not a
            second model — applied to this upload instead of a stored county forecast. Never a calibrated risk
            score: this dataset was never part of the trained model's training distribution, so a number dressed up
            as one here would be false confidence. The cutoff for "rising" vs "stable" is the same configurable
            trend threshold as Decision Support (<Link to="/settings">Settings</Link>).
          </p>

          <div className={REC_CARD_HEADER_CLASS} style={{ marginTop: 4 }}>
            <h4 style={{ margin: 0 }}>Assessment</h4>
            <ConcernBadge concern={insights.concern} />
          </div>

          <p style={{ marginTop: 10 }}>{insights.summary}</p>

          <div className={KPI_ROW_CLASS} style={{ marginTop: 4 }}>
            <KpiCard
              label="Historical peak"
              value={insights.historicalPeak ? formatCompact(insights.historicalPeak.value) : "—"}
              hint={insights.historicalPeak ? insights.historicalPeak.date : "no uploaded rows"}
            />
            <KpiCard
              label="Projected peak"
              value={insights.projectedPeak ? formatCompact(insights.projectedPeak.value) : "—"}
              hint={insights.projectedPeak ? insights.projectedPeak.date : "no projected months"}
              tone={insights.projectedPeak && insights.historicalPeak && insights.projectedPeak.value > insights.historicalPeak.value ? "high" : "neutral"}
            />
            <KpiCard
              label="Total projected cases"
              value={insights.totalProjectedCases !== null ? formatCompact(insights.totalProjectedCases) : "—"}
              hint={`over the ${horizonMonths}-month projection`}
            />
            <KpiCard
              label="Est. true infections"
              value={insights.estimatedTrueInfections !== null ? formatCompact(insights.estimatedTrueInfections) : "—"}
              hint={
                insights.estimatedTrueInfections !== null
                  ? "from the fitted reporting fraction, uploaded window"
                  : insights.reportingFractionIsPlausible
                    ? "reporting fraction too low to estimate"
                    : "fitted reporting fraction isn't reliable here — see \"Why?\" below"
              }
            />
            <KpiCard
              label="Attack rate so far"
              value={insights.attackRatePct !== null ? `${insights.attackRatePct.toFixed(2)}%` : "—"}
              hint="uploaded + projected cases ÷ population"
            />
          </div>

          <p className={REC_ACTIONS_LABEL_CLASS}>Suggested next steps</p>
          <ul className={REC_ACTIONS_CLASS}>
            {insights.actions.map((a, i) => (
              <li key={i} className={REC_ACTION_ITEM_CLASS}>
                {a}
              </li>
            ))}
          </ul>

          <details className={REC_WHY_CLASS}>
            <summary className={REC_WHY_SUMMARY_CLASS}>Why this assessment?</summary>
            <ul className={REC_WHY_UL_CLASS}>
              {insights.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </details>
        </Card>
      )}
    </div>
  );
}
