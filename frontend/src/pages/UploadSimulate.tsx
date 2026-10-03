import { DragEvent, FormEvent, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { mlApi, UploadSimulationResponse } from "../api/client";
import Card from "../components/Card";
import ChartTooltip from "../components/ChartTooltip";
import KpiCard, { KPI_HINT_CLASS, KPI_LABEL_CLASS, KPI_VALUE_CLASS, kpiCardClass } from "../components/KpiCard";
import LabeledSlider from "../components/LabeledSlider";
import { AlertIcon, CheckCircleIcon, DownloadIcon, InfoIcon, UploadIcon, XIcon } from "../components/icons";
import { priorityBadgeClass } from "../lib/badgeClasses";
import { BANNER_WARNING_CLASS, FORM_BANNER_ERROR_CLASS } from "../lib/bannerClasses";
import { btnClass } from "../lib/buttonClasses";
import { AXIS, GRID, LINE_CURSOR } from "../lib/chartTheme";
import { downloadCsv, toCsv } from "../lib/csv";
import { CsvPreview, MIN_ROWS, previewCaseCsv } from "../lib/csvPreview";
import { recCardClass, REC_WHY_UL_CLASS } from "../lib/decisionSupportClasses";
import { FIELD_HINT_CLASS, FIELD_INPUT_CLASS } from "../lib/fieldClasses";
import { formatCompact, formatMonthTick, formatNumber } from "../lib/format";
import { useLanguage } from "../lib/i18n";
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
const TEMPLATE_COLUMNS: (keyof (typeof TEMPLATE_ROWS)[number])[] = ["date", "confirmed_cases", "rainfall_mm"];

function formatBytes(n: number) {
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`;
}

function StepLabel({ n, children }: { n: number; children: ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-text">
      <span className="grid size-5 place-items-center rounded-full bg-accent-soft text-[0.7rem] font-bold text-accent-text">{n}</span>
      {children}
    </div>
  );
}

/** What the browser read from the file, before anything is sent. */
function PreviewPanel({ preview }: { preview: CsvPreview }) {
  if (preview.errors.length > 0) {
    return (
      <div className="rounded-lg border border-risk-high/40 bg-risk-high-soft px-3.5 py-3 text-[0.8125rem]" role="alert">
        <div className="mb-1 flex items-center gap-1.5 font-semibold text-risk-high">
          <AlertIcon size={14} /> This file can't be used yet
        </div>
        <ul className="m-0 flex flex-col gap-0.5 pl-5 text-text-secondary">
          {preview.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      </div>
    );
  }
  const { rows } = preview;
  const shown = rows.length > 6 ? [...rows.slice(0, 4), null, rows[rows.length - 1]] : rows;
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem]">
        <span className="flex items-center gap-1.5 font-semibold text-risk-low">
          <CheckCircleIcon size={14} /> Ready
        </span>
        <span className="text-text-secondary">
          {rows.length} months · {formatMonthTick(rows[0].date)} – {formatMonthTick(rows[rows.length - 1].date)} ·{" "}
          {preview.hasRainfall ? "rainfall included" : "no rainfall (constant transmission)"}
        </span>
      </div>
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-panel-muted text-left text-muted">
              <th className="px-3 py-1.5 font-semibold">Month</th>
              <th className="px-3 py-1.5 text-right font-semibold">Cases</th>
              <th className="px-3 py-1.5 text-right font-semibold">Rainfall</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {shown.map((r, i) =>
              r === null ? (
                <tr key="gap" className="border-t border-border">
                  <td colSpan={3} className="px-3 py-1 text-center text-muted">
                    ⋯ {rows.length - 5} more ⋯
                  </td>
                </tr>
              ) : (
                <tr key={`${r.date}-${i}`} className="border-t border-border">
                  <td className="px-3 py-1.5 text-text-secondary">{formatMonthTick(r.date)}</td>
                  <td className="px-3 py-1.5 text-right text-text">{formatNumber(r.cases)}</td>
                  <td className="px-3 py-1.5 text-right text-text-secondary">{r.rainfall !== null ? `${r.rainfall} mm` : "—"}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function UploadSimulate() {
  const { t } = useLanguage();
  const thresholds = useThresholds();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [dragging, setDragging] = useState(false);
  const [population, setPopulation] = useState(500000);
  const [horizonMonths, setHorizonMonths] = useState(6);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadSimulationResponse | null>(null);
  // The horizon the shown result was run with — the slider may have moved since.
  const [resultHorizon, setResultHorizon] = useState(horizonMonths);

  const insights = useMemo(() => (result ? buildUploadInsights(result, thresholds) : null), [result, thresholds]);

  const acceptFile = async (f: File | null) => {
    setResult(null);
    setError(null);
    setFile(f);
    setPreview(null);
    if (!f) return;
    if (!/\.csv$/i.test(f.name) && f.type !== "text/csv") {
      setPreview({ rows: [], hasRainfall: false, columns: [], errors: [`"${f.name}" isn't a CSV file.`] });
      return;
    }
    setPreview(previewCaseCsv(await f.text()));
  };

  const loadSample = () => {
    const text = toCsv(TEMPLATE_ROWS, TEMPLATE_COLUMNS);
    void acceptFile(new File([text], "sample-outbreak.csv", { type: "text/csv" }));
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void acceptFile(e.dataTransfer.files?.[0] ?? null);
  };

  const ready = !!file && !!preview && preview.errors.length === 0 && population >= 1;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file || !ready) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await mlApi.simulateUpload(file, population, horizonMonths);
      setResult(res);
      setResultHorizon(horizonMonths);
      requestAnimationFrame(() => document.getElementById("upload-result")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^Request to .*? — /, "") : "Simulation failed");
    } finally {
      setSubmitting(false);
    }
  };

  // Where uploaded data stops and the projection begins, for the chart's divider + shading.
  const lastActual = result ? [...result.series].reverse().find((r) => r.actual !== null)?.date : undefined;
  const lastDate = result?.series[result.series.length - 1]?.date;
  const ConcernIcon = insights ? CONCERN_ICON[insights.concern] : InfoIcon;

  return (
    <div>
      <header className="mb-5">
        <h2 className="m-0 text-[1.6rem] font-bold tracking-[-0.02em] text-text">{t("page.uploadSimulate")}</h2>
        <p className="mt-1 mb-0 max-w-[75ch] text-sm text-muted">
          Upload monthly case counts for any area and get a fitted outbreak curve, a projection and suggested next
          steps. Nothing is saved.
        </p>
      </header>

      <Card>
        <form onSubmit={handleSubmit} className="grid gap-6 min-[961px]:grid-cols-[1.4fr_1fr]">
          {/* Step 1: data */}
          <div className="min-w-0">
            <StepLabel n={1}>Add your case data</StepLabel>
            {!file ? (
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className={
                  "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-9 text-center transition-colors " +
                  "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent " +
                  (dragging ? "border-accent bg-accent-soft" : "border-border-strong hover:border-accent hover:bg-panel-muted")
                }
              >
                <span className="grid size-11 place-items-center rounded-full bg-accent-soft text-accent-text">
                  <UploadIcon size={20} />
                </span>
                <span className="text-[0.95rem] font-semibold text-text">
                  Drop a CSV here or <span className="text-accent-text underline">browse</span>
                </span>
                <span className="text-xs text-muted">
                  Columns <code className="mono">date</code>, <code className="mono">confirmed_cases</code>, optional{" "}
                  <code className="mono">rainfall_mm</code> · at least {MIN_ROWS} monthly rows
                </span>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  onChange={(e) => {
                    void acceptFile(e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                />
              </label>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3 rounded-xl border border-border bg-panel-muted px-3.5 py-2.5">
                  <span className="grid size-8 flex-none place-items-center rounded-lg bg-panel text-muted">
                    <UploadIcon size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[0.8125rem] font-semibold text-text">{file.name}</div>
                    <div className="text-xs text-muted">{formatBytes(file.size)}</div>
                  </div>
                  <button
                    type="button"
                    className={btnClass("secondary", { sm: true })}
                    onClick={() => inputRef.current?.click()}
                  >
                    Replace
                  </button>
                  <button
                    type="button"
                    aria-label="Remove file"
                    title="Remove file"
                    onClick={() => void acceptFile(null)}
                    className="grid size-8 cursor-pointer place-items-center rounded-lg border-0 bg-transparent text-muted hover:bg-panel hover:text-text"
                  >
                    <XIcon size={15} />
                  </button>
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="sr-only"
                    tabIndex={-1}
                    aria-hidden="true"
                    onChange={(e) => {
                      void acceptFile(e.target.files?.[0] ?? null);
                      e.target.value = "";
                    }}
                  />
                </div>
                {preview && <PreviewPanel preview={preview} />}
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.8125rem]">
              <button
                type="button"
                className="cursor-pointer border-0 bg-transparent p-0 font-semibold text-accent-text hover:underline"
                onClick={loadSample}
              >
                Try with sample data
              </button>
              <button
                type="button"
                className="inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-text-secondary hover:text-text hover:underline"
                onClick={() => downloadCsv("upload-simulate-template.csv", TEMPLATE_ROWS, TEMPLATE_COLUMNS)}
              >
                <DownloadIcon size={13} /> Download template
              </button>
            </div>
          </div>

          {/* Step 2: settings + run */}
          <div className="flex min-w-0 flex-col">
            <StepLabel n={2}>Set the context</StepLabel>
            <label className="mb-4 flex flex-col gap-1.5 text-[0.8125rem]">
              <span className="font-medium text-text-secondary">Population</span>
              <input
                type="number"
                className={FIELD_INPUT_CLASS}
                min={1}
                value={population}
                onChange={(e) => setPopulation(Number(e.target.value))}
              />
              <span className={FIELD_HINT_CLASS}>People living in the area these cases come from.</span>
            </label>
            <LabeledSlider
              label="Project forward"
              value={horizonMonths}
              onChange={setHorizonMonths}
              min={1}
              max={24}
              formatValue={(v) => `${v} month${v === 1 ? "" : "s"}`}
            />
            <div className="mt-auto pt-2">
              {error && <p className={FORM_BANNER_ERROR_CLASS}>{error}</p>}
              <button type="submit" className={btnClass("primary", { block: true })} disabled={!ready || submitting}>
                {submitting ? (
                  <>
                    <span className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />
                    Fitting the model…
                  </>
                ) : (
                  <>Run simulation</>
                )}
              </button>
              {!ready && !submitting && (
                <p className="mt-2 mb-0 text-center text-xs text-muted">
                  {!file ? "Add a CSV to continue." : preview && preview.errors.length > 0 ? "Fix the file to continue." : ""}
                </p>
              )}
            </div>
          </div>
        </form>
      </Card>

      <details className="group mb-5 rounded-xl border border-border bg-panel px-4 py-3 text-[0.8125rem] text-text-secondary">
        <summary className="cursor-pointer list-none font-semibold text-text [&::-webkit-details-marker]:hidden">
          <span className="mr-1 inline-block text-muted transition-transform group-open:rotate-90">›</span>
          About this tool
        </summary>
        <div className="mt-2 flex flex-col gap-2 leading-relaxed">
          <p className="m-0">
            Fits the SEIR compartmental model (ml_service/app/compartmental.py) to the series you upload, then projects it
            forward. It uses SEIR rather than the trained XGBoost model on purpose: that model only means something for
            the counties it was trained on, while a compartmental fit works on any dataset.
          </p>
          <p className="m-0">
            Works best for a single emerging outbreak (one rise and fall). The assessment uses the same plain, fixed rules
            as <Link to="/decision-support">Decision Support</Link> — never a calibrated risk score, since this data was
            never part of the trained model. The "rising" cutoff is configurable in <Link to="/settings">Settings</Link>.
          </p>
        </div>
      </details>

      {result && insights && (
        <section id="upload-result" className="scroll-mt-6">
          {/* Verdict first — the answer, then the evidence. */}
          <Card className={recCardClass(insights.concern)}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <span className={`${priorityBadgeClass(insights.concern)} mb-2`}>
                  <ConcernIcon size={13} /> {CONCERN_LABEL[insights.concern]}
                </span>
                <p className="m-0 max-w-[85ch] text-[0.95rem] leading-relaxed text-text">{insights.summary}</p>
              </div>
              <button
                type="button"
                className={btnClass("secondary", { sm: true })}
                onClick={() =>
                  downloadCsv("upload-simulation-results.csv", result.series, ["date", "actual", "fitted", "predicted"])
                }
              >
                <DownloadIcon size={14} /> Download results
              </button>
            </div>
          </Card>

          <div className="mb-5 grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-4">
            <KpiCard
              label="Peak in your data"
              value={insights.historicalPeak ? formatCompact(insights.historicalPeak.value) : "—"}
              hint={insights.historicalPeak ? formatMonthTick(insights.historicalPeak.date) : "no uploaded rows"}
            />
            <KpiCard
              label="Projected peak"
              value={insights.projectedPeak ? formatCompact(insights.projectedPeak.value) : "—"}
              hint={insights.projectedPeak ? formatMonthTick(insights.projectedPeak.date) : "no projected months"}
              tone={
                insights.projectedPeak && insights.historicalPeak && insights.projectedPeak.value > insights.historicalPeak.value
                  ? "high"
                  : "neutral"
              }
            />
            <KpiCard
              label="Projected cases"
              value={insights.totalProjectedCases !== null ? formatCompact(insights.totalProjectedCases) : "—"}
              hint={`over the next ${resultHorizon} month${resultHorizon === 1 ? "" : "s"}`}
            />
            <KpiCard
              label="Share of population infected"
              value={insights.attackRatePct !== null ? `${insights.attackRatePct.toFixed(2)}%` : "—"}
              hint="uploaded + projected cases"
            />
          </div>

          <Card>
            <div className="mb-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
              <div>
                <h3 className="m-0 text-[0.95rem] font-semibold text-text">Your data and the projection</h3>
                <p className="mt-1 mb-0 text-[0.8125rem] text-muted">
                  {result.rows_used} months uploaded · population {formatNumber(result.population)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 pt-0.5 text-xs text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full bg-accent" /> Your data
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3.5 border-t-2 border-dashed border-series-1" /> Model fit
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3.5 border-t-2 border-series-2" /> Projection
                </span>
              </div>
            </div>

            {result.warnings.map((w, i) => (
              <p key={i} className={BANNER_WARNING_CLASS}>
                {w}
              </p>
            ))}

            <ResponsiveContainer width="100%" height={340}>
              <ComposedChart data={result.series} margin={{ top: 20, right: 12, left: -8, bottom: 0 }}>
                <CartesianGrid {...GRID} />
                {lastActual && lastDate && lastActual !== lastDate && (
                  <ReferenceArea x1={lastActual} x2={lastDate} fill="var(--panel-muted)" fillOpacity={0.7} ifOverflow="extendDomain" />
                )}
                <XAxis {...AXIS} dataKey="date" tickFormatter={formatMonthTick} minTickGap={24} />
                <YAxis {...AXIS} tickFormatter={formatCompact} width={52} />
                <Tooltip
                  cursor={LINE_CURSOR}
                  content={<ChartTooltip labelFormatter={(l) => formatMonthTick(String(l))} valueFormatter={(v) => formatNumber(Math.round(v))} />}
                />
                {lastActual && (
                  <ReferenceLine
                    x={lastActual}
                    stroke="var(--border-strong)"
                    strokeDasharray="3 3"
                    label={{ value: "Projection →", position: "insideTopLeft", fill: "var(--muted)", fontSize: 11, dx: 6 }}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="fitted"
                  name="Model fit"
                  stroke="var(--series-1)"
                  strokeWidth={1.75}
                  strokeDasharray="4 3"
                  dot={false}
                  connectNulls={false}
                />
                <Line
                  type="monotone"
                  dataKey="predicted"
                  name="Projection"
                  stroke="var(--series-2)"
                  strokeWidth={2.25}
                  dot={false}
                  connectNulls={false}
                />
                <Line
                  type="monotone"
                  dataKey="actual"
                  name="Your data"
                  stroke="var(--accent)"
                  strokeWidth={2.25}
                  dot={{ r: 3.5, strokeWidth: 0, fill: "var(--accent)" }}
                  activeDot={{ r: 5, strokeWidth: 0 }}
                  connectNulls={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
            <p className="mt-3 mb-0 flex gap-2 text-xs leading-relaxed text-muted">
              <span className="mt-px flex-none">
                <InfoIcon size={14} />
              </span>
              {result.disclaimer}
            </p>
          </Card>

          <Card>
            <h3 className="m-0 mb-3 text-[0.95rem] font-semibold text-text">Suggested next steps</h3>
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {insights.actions.map((a, i) => (
                <li key={i} className="flex gap-2.5 text-[0.875rem] leading-normal text-text-secondary">
                  <span className="mt-[3px] grid size-[18px] flex-none place-items-center rounded-full bg-accent-soft text-[0.65rem] font-bold text-accent-text">
                    {i + 1}
                  </span>
                  {a}
                </li>
              ))}
            </ul>
            <details className="group mt-4 border-t border-border pt-3 text-[0.8125rem]">
              <summary className="cursor-pointer list-none font-semibold text-accent-text [&::-webkit-details-marker]:hidden">
                <span className="inline-block transition-transform group-open:rotate-90">›</span> Why this assessment?
              </summary>
              <ul className={REC_WHY_UL_CLASS}>
                {insights.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </details>
          </Card>

          <details className="group mb-5 rounded-xl border border-border bg-panel px-4 py-3">
            <summary className="cursor-pointer list-none text-[0.8125rem] font-semibold text-text [&::-webkit-details-marker]:hidden">
              <span className="mr-1 inline-block text-muted transition-transform group-open:rotate-90">›</span>
              Model fit details
              <span className="ml-2 font-normal text-muted">
                fit quality {(1 - Math.min(result.fit_relative_error, 1)).toLocaleString(undefined, { style: "percent" })}
              </span>
            </summary>
            <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
              <div className={kpiCardClass(insights.fitIsReliable ? "low" : "mid")}>
                <div className={KPI_LABEL_CLASS}>Fit quality</div>
                <div className={KPI_VALUE_CLASS}>
                  {(1 - Math.min(result.fit_relative_error, 1)).toLocaleString(undefined, { style: "percent" })}
                </div>
                <div className={KPI_HINT_CLASS}>how closely the fit tracks your data</div>
              </div>
              <div className={kpiCardClass()}>
                <div className={KPI_LABEL_CLASS}>Fitted β₀ / k</div>
                <div className={`${KPI_VALUE_CLASS} mono`}>
                  {result.fitted_params.beta0.toFixed(2)} / {result.fitted_params.k.toFixed(2)}
                </div>
                <div className={KPI_HINT_CLASS}>
                  base transmission / rainfall sensitivity{result.used_rainfall ? "" : " (no rainfall column)"}
                </div>
              </div>
              <div className={kpiCardClass()}>
                <div className={KPI_LABEL_CLASS}>Reporting fraction</div>
                <div className={`${KPI_VALUE_CLASS} mono`}>{(result.fitted_params.reporting_fraction * 100).toFixed(1)}%</div>
                <div className={KPI_HINT_CLASS}>share of true infections that get reported</div>
              </div>
              <div className={kpiCardClass()}>
                <div className={KPI_LABEL_CLASS}>Est. true infections</div>
                <div className={KPI_VALUE_CLASS}>
                  {insights.estimatedTrueInfections !== null ? formatCompact(insights.estimatedTrueInfections) : "—"}
                </div>
                <div className={KPI_HINT_CLASS}>
                  {insights.estimatedTrueInfections !== null
                    ? "uploaded window, from the reporting fraction"
                    : insights.reportingFractionIsPlausible
                      ? "reporting fraction too low to estimate"
                      : "reporting fraction isn't reliable for this data"}
                </div>
              </div>
            </div>
          </details>
        </section>
      )}
    </div>
  );
}
