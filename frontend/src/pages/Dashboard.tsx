import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  api,
  CaseReport,
  ClimateObservation,
  County,
  ForecastRun,
  HistoricalCaseData,
  mlApi,
  ModelInfo,
  VaccineAllocation,
} from "../api/client";
import Card from "../components/Card";
import ChartTooltip from "../components/ChartTooltip";
import {
  AlertIcon,
  AllocationIcon,
  CaseReportIcon,
  ForecastIcon,
  SparkleIcon,
  UserIcon,
} from "../components/icons";
import KpiCard, { KPI_HINT_CLASS, KPI_LABEL_CLASS, KPI_ROW_CLASS, KPI_VALUE_CLASS, kpiCardClass } from "../components/KpiCard";
// Lazy: Leaflet (+ its CSS) is a big, map-only dependency that isn't needed
// for the rest of this landing page's first paint — see App.tsx's own
// per-route splitting for the same reasoning.
const RiskMap = lazy(() => import("../components/RiskMap"));
import {
  allocationByCounty,
  caseTrend,
  historicalCaseTrend,
  historicalRainfallTrend,
  latestForecastByCounty,
  seasonalClimatology,
} from "../lib/analytics";
import { BANNER_WARNING_CLASS } from "../lib/bannerClasses";
import { btnClass } from "../lib/buttonClasses";
import { AXIS, BAR_ROW, CATEGORY_AXIS, CURSOR, GRID, GRID_VERTICAL, LINE_CURSOR } from "../lib/chartTheme";
import { formatCompact, formatDayLabel, formatMonthTick, formatNumber, riskBand } from "../lib/format";
import { useLanguage } from "../lib/i18n";
import { PLACEHOLDER_NOTE_CLASS, ROUTE_LOADING_CLASS } from "../lib/noteClasses";
import { useThresholds } from "../lib/useThresholds";

const RISK_COLORS: Record<"high" | "mid" | "low", string> = {
  high: "#d9534f",
  mid: "#e0a83b",
  low: "#2fae8f",
};

// Kenya's two rainy seasons, by 0-based month index — highlighted on the
// seasonal chart so the bimodal pattern reads without the caption.
const LONG_RAINS = new Set([2, 3, 4]);
const SHORT_RAINS = new Set([9, 10, 11]);

const GRID_2 = "grid gap-x-5 min-[1101px]:grid-cols-[1.45fr_1fr]";
const GRID_EQUAL = "grid gap-x-5 min-[1101px]:grid-cols-2";

function LegendChip({ color, label, dashed = false }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted">
      {dashed ? (
        <span className="w-3.5 border-t-2 border-dashed" style={{ borderColor: color }} />
      ) : (
        <span className="size-2.5 rounded-[3px]" style={{ background: color }} />
      )}
      {label}
    </span>
  );
}

/** Card with a consistent header: title + one-line subtitle on the left,
 * an optional legend on the right, then the chart. */
function ChartCard({
  title,
  subtitle,
  legend,
  footer,
  className,
  children,
}: {
  title: string;
  subtitle: string;
  legend?: ReactNode;
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={`flex flex-col ${className ?? ""}`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 className="m-0 text-[0.95rem] font-semibold text-text">{title}</h3>
          <p className="mt-1 mb-0 text-[0.8125rem] text-muted">{subtitle}</p>
        </div>
        {legend && <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 pt-0.5">{legend}</div>}
      </div>
      <div className="flex-1">{children}</div>
      {footer && <div className="mt-3 border-t border-border pt-3 text-xs leading-relaxed text-muted">{footer}</div>}
    </Card>
  );
}

function EmptyChart({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-[200px] place-items-center rounded-lg border border-dashed border-border px-6 text-center text-[0.8125rem] text-muted">
      {children}
    </div>
  );
}

function DashboardSkeleton() {
  const block = "animate-pulse rounded-xl border border-border bg-panel";
  return (
    <div role="status" aria-busy="true" aria-label="Loading analytics">
      <div className="mb-6 h-12 w-72 animate-pulse rounded-lg bg-panel-muted" />
      <div className={KPI_ROW_CLASS}>
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className={`${block} h-[118px]`} />
        ))}
      </div>
      <div className={GRID_2}>
        <div className={`${block} mb-5 h-[360px]`} />
        <div className={`${block} mb-5 h-[360px]`} />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { t } = useLanguage();
  const thresholds = useThresholds();
  const [counties, setCounties] = useState<County[]>([]);
  const [reports, setReports] = useState<CaseReport[]>([]);
  const [forecasts, setForecasts] = useState<ForecastRun[]>([]);
  const [allocations, setAllocations] = useState<VaccineAllocation[]>([]);
  const [historicalCases, setHistoricalCases] = useState<HistoricalCaseData[]>([]);
  const [rainfall, setRainfall] = useState<ClimateObservation[]>([]);
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [modelInfoError, setModelInfoError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.listAllCounties(),
      api.listAllCaseReports(),
      api.listAllForecasts(),
      api.listAllAllocations(),
      api.listAllHistoricalCaseData(),
      api.listAllClimateObservations("CHIRPS"),
    ])
      .then(([c, r, f, a, hist, rain]) => {
        setCounties(c);
        setReports(r);
        setForecasts(f);
        setAllocations(a);
        setHistoricalCases(hist);
        setRainfall(rain);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));

    mlApi
      .modelInfo()
      .then(setModelInfo)
      .catch((err) => setModelInfoError(err instanceof Error ? err.message : "Model info unavailable"));
  }, []);

  const latestForecasts = useMemo(() => latestForecastByCounty(forecasts), [forecasts]);
  const trend = useMemo(() => caseTrend(reports), [reports]);
  const historicalTrend = useMemo(() => historicalCaseTrend(historicalCases), [historicalCases]);
  const rainfallTrend = useMemo(() => historicalRainfallTrend(rainfall), [rainfall]);
  const climatology = useMemo(() => seasonalClimatology(rainfall), [rainfall]);
  const allocationData = useMemo(() => allocationByCounty(allocations), [allocations]);

  const totalConfirmed = reports.reduce((sum, r) => sum + r.confirmed_cases, 0);
  const totalDeaths = reports.reduce((sum, r) => sum + r.deaths, 0);
  const totalDosesAllocated = allocations.reduce((sum, a) => sum + a.recommended_doses, 0);

  // Per-population rate, not just a raw count — a county's case load only
  // means something relative to how many people are actually there.
  const countiesWithPopulation = counties.filter((c) => c.population);
  const totalPopulation = countiesWithPopulation.reduce((sum, c) => sum + (c.population ?? 0), 0);
  const casesPer1000 = totalPopulation > 0 ? (totalConfirmed / totalPopulation) * 1000 : null;

  const riskValues = [...latestForecasts.values()].map((f) => f.risk_score);
  const avgRisk = riskValues.length > 0 ? riskValues.reduce((a, b) => a + b, 0) / riskValues.length : null;

  const forecastsAreAllPlaceholder =
    latestForecasts.size > 0 && [...latestForecasts.values()].every((f) => f.model_name === "placeholder_not_trained");

  const riskByCountyId: Record<number, number | undefined> = {};
  const riskChartData = counties
    .map((c) => {
      const f = latestForecasts.get(c.id);
      riskByCountyId[c.id] = f?.risk_score;
      const risk = f?.risk_score ?? 0;
      return {
        name: c.name,
        risk,
        hasData: f !== undefined,
        fill: f !== undefined ? RISK_COLORS[riskBand(risk, thresholds)] : "var(--border-strong)",
      };
    })
    .sort((a, b) => b.risk - a.risk)
    .slice(0, 12);

  // Zero-dose counties would be empty rows; they're counted in the footer instead.
  const fundedCounties = allocationData.filter((a) => a.doses > 0);
  const allocationChartData = [...fundedCounties].sort((a, b) => b.doses - a.doses).slice(0, 10);
  const unfundedCount = allocationData.length - fundedCounties.length;

  const trendData = trend.map((d) => ({ ...d, ts: Date.parse(`${d.date}T00:00:00Z`) }));
  const latestReportDate = trend.length > 0 ? trend[trend.length - 1].date : null;

  const seasonalData = climatology.map((m, i) => ({
    ...m,
    fill: LONG_RAINS.has(i) ? "var(--accent)" : SHORT_RAINS.has(i) ? "var(--series-1)" : "var(--border-strong)",
  }));

  // Baselines muted, the model itself in the accent — the comparison is
  // "does the full model beat these", not three equal series.
  const modelComparisonData = modelInfo
    ? [
        { name: "Climate-free baseline", auc: modelInfo.climate_free_baseline_metrics.auc, fill: "var(--border-strong)" },
        { name: "SEIR benchmark", auc: modelInfo.seir_benchmark_metrics.auc, fill: "var(--border-strong)" },
        { name: "Full model (XGBoost)", auc: modelInfo.held_out_test_metrics.auc, fill: "var(--accent)" },
      ]
    : [];

  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="m-0 text-[1.6rem] font-bold tracking-[-0.02em] text-text">{t("page.analyticsOverview")}</h2>
          <p className="mt-1 mb-0 text-sm text-muted">
            Malaria cases, outbreak risk and vaccine supply across {counties.length || "the"} lake-region &amp; coastal
            counties.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {latestReportDate && (
            <span className="mr-1 flex items-center gap-2 rounded-full border border-border bg-panel px-3 py-1.5 text-xs text-muted">
              <span className="size-1.5 rounded-full bg-risk-low" />
              Latest report {formatDayLabel(latestReportDate)}
            </span>
          )}
          <Link className={btnClass("secondary", { className: "no-underline" })} to="/run-allocation">
            <AllocationIcon size={15} />
            Run allocation
          </Link>
          <Link className={btnClass("primary", { className: "no-underline" })} to="/generate-forecast">
            <SparkleIcon size={15} />
            Generate forecast
          </Link>
        </div>
      </header>

      {error && <p className={BANNER_WARNING_CLASS}>Could not reach backend: {error}</p>}

      {!error && counties.length === 0 && (
        <p className={PLACEHOLDER_NOTE_CLASS}>No data yet — seed counties, facilities, and case reports via /admin/.</p>
      )}

      {counties.length > 0 && (
        <>
          <div className={KPI_ROW_CLASS}>
            <KpiCard
              label={t("kpi.confirmedCasesAllTime")}
              value={formatNumber(totalConfirmed)}
              hint={`${formatNumber(reports.length)} facility reports`}
              icon={<CaseReportIcon size={16} />}
            />
            <KpiCard
              label={t("kpi.casesPer1000")}
              value={casesPer1000 !== null ? casesPer1000.toFixed(1) : "—"}
              hint={casesPer1000 !== null ? `${countiesWithPopulation.length} counties with known population` : "no population data"}
              icon={<UserIcon size={16} />}
            />
            <KpiCard
              label={t("kpi.deathsReported")}
              value={formatNumber(totalDeaths)}
              hint={totalConfirmed > 0 ? `${((totalDeaths / totalConfirmed) * 100).toFixed(1)}% of confirmed cases` : undefined}
              tone={totalDeaths > 0 ? "high" : "neutral"}
              icon={<AlertIcon size={16} />}
            />
            <KpiCard
              label={t("kpi.avgOutbreakRisk")}
              value={avgRisk !== null ? avgRisk.toFixed(2) : "—"}
              hint={avgRisk !== null ? `across ${latestForecasts.size} counties` : "no forecast runs yet"}
              tone={avgRisk !== null ? riskBand(avgRisk, thresholds) : "neutral"}
              icon={<ForecastIcon size={16} />}
            />
            <KpiCard
              label={t("kpi.dosesAllocated")}
              value={formatCompact(totalDosesAllocated)}
              hint={`${allocations.length} allocation run(s)`}
              icon={<AllocationIcon size={16} />}
            />
          </div>

          {forecastsAreAllPlaceholder && (
            <p className={BANNER_WARNING_CLASS}>
              Every forecast currently on record is from the untrained placeholder model
              (predicted_cases and risk_score both 0) — see ml_service/app/forecasting.py.
              Risk figures below aren't meaningful until a real forecast has been generated.
            </p>
          )}

          <div className={GRID_2}>
            <ChartCard
              title="Case trend"
              subtitle="Real facility reports, summed across all counties"
              legend={
                <>
                  <LegendChip color="var(--accent)" label="Confirmed" />
                  <LegendChip color="var(--risk-mid)" label="Suspected" dashed />
                </>
              }
            >
              {trendData.length === 0 ? (
                <EmptyChart>No case reports yet.</EmptyChart>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={trendData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <defs>
                      <linearGradient id="confirmedGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid {...GRID} />
                    <XAxis
                      {...AXIS}
                      dataKey="ts"
                      type="number"
                      scale="time"
                      domain={["dataMin", "dataMax"]}
                      tickFormatter={(ts: number) => formatMonthTick(new Date(ts).toISOString())}
                      minTickGap={36}
                    />
                    <YAxis {...AXIS} tickFormatter={formatCompact} width={52} />
                    <Tooltip
                      cursor={LINE_CURSOR}
                      content={
                        <ChartTooltip
                          labelFormatter={(ts) => formatDayLabel(new Date(Number(ts)).toISOString())}
                          valueFormatter={(v) => formatNumber(v)}
                        />
                      }
                    />
                    <Area
                      type="monotone"
                      dataKey="confirmed"
                      name="Confirmed"
                      stroke="var(--accent)"
                      fill="url(#confirmedGradient)"
                      strokeWidth={2}
                      activeDot={{ r: 4, strokeWidth: 0 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="suspected"
                      name="Suspected"
                      stroke="var(--risk-mid)"
                      fill="none"
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                      activeDot={{ r: 3, strokeWidth: 0 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard
              title="Risk by county"
              subtitle={`Latest forecast per county, highest ${riskChartData.length}`}
              legend={
                <>
                  <LegendChip color={RISK_COLORS.high} label="High" />
                  <LegendChip color={RISK_COLORS.mid} label="Medium" />
                  <LegendChip color={RISK_COLORS.low} label="Low" />
                </>
              }
            >
              {riskChartData.length === 0 ? (
                <EmptyChart>No forecast runs yet.</EmptyChart>
              ) : (
                <ResponsiveContainer width="100%" height={riskChartData.length * BAR_ROW + 28}>
                  <BarChart data={riskChartData} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }} barSize={14}>
                    <CartesianGrid {...GRID_VERTICAL} />
                    <XAxis {...AXIS} type="number" domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} />
                    <YAxis {...CATEGORY_AXIS} type="category" dataKey="name" width={96} />
                    <Tooltip cursor={CURSOR} content={<ChartTooltip valueFormatter={(v) => v.toFixed(2)} />} />
                    <Bar dataKey="risk" name="Risk score" radius={[0, 4, 4, 0]}>
                      {riskChartData.map((entry) => (
                        <Cell key={entry.name} fill={entry.fill} />
                      ))}
                      <LabelList
                        dataKey="risk"
                        position="right"
                        formatter={(v) => Number(v).toFixed(2)}
                        fill="var(--text-secondary)"
                        fontSize={11}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          <ChartCard title="Outbreak risk map" subtitle="Counties shaded by their latest forecast risk score — hover for details">
            <Suspense fallback={<div className={ROUTE_LOADING_CLASS}>Loading map…</div>}>
              <RiskMap counties={counties} riskByCountyId={riskByCountyId} />
            </Suspense>
          </ChartCard>

          <div className="mt-10 mb-5">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="m-0 text-[1.2rem] font-bold tracking-[-0.01em] text-text">Climate &amp; historical signal</h2>
              <span className="rounded-full border border-risk-mid/40 bg-risk-mid-soft px-2.5 py-0.5 text-[0.7rem] font-semibold text-risk-mid">
                Synthetic case data
              </span>
            </div>
            <p className="mt-1.5 mb-0 max-w-[80ch] text-[0.8125rem] text-muted">
              The forecasting model's training data: real CHIRPS rainfall driving a synthetic case series (see
              docs/architecture.md, "Model results") — not the short real-reporting window above.
            </p>
          </div>

          <div className={GRID_EQUAL}>
            <ChartCard title="Historical rainfall" subtitle="Mean monthly CHIRPS rainfall across counties, 5 years (mm)">
              {rainfallTrend.length === 0 ? (
                <EmptyChart>No climate observations yet.</EmptyChart>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={rainfallTrend} margin={{ top: 8, right: 4, left: -12, bottom: 0 }} barCategoryGap={1}>
                    <CartesianGrid {...GRID} />
                    <XAxis {...AXIS} dataKey="month" tickFormatter={formatMonthTick} minTickGap={28} />
                    <YAxis {...AXIS} width={40} />
                    <Tooltip
                      cursor={CURSOR}
                      content={<ChartTooltip labelFormatter={(l) => formatMonthTick(String(l))} valueFormatter={(v) => `${v.toFixed(1)} mm`} />}
                    />
                    <Bar dataKey="rainfall" name="Rainfall" fill="var(--series-1)" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="Historical case trend" subtitle="Confirmed cases (synthetic_v1), summed across counties">
              {historicalTrend.length === 0 ? (
                <EmptyChart>No historical case data yet — run data/scripts/generate_synthetic_case_history.py.</EmptyChart>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={historicalTrend} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <defs>
                      <linearGradient id="historicalGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--series-2)" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="var(--series-2)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid {...GRID} />
                    <XAxis {...AXIS} dataKey="month" tickFormatter={formatMonthTick} minTickGap={28} />
                    <YAxis {...AXIS} tickFormatter={formatCompact} width={52} />
                    <Tooltip
                      cursor={LINE_CURSOR}
                      content={<ChartTooltip labelFormatter={(l) => formatMonthTick(String(l))} valueFormatter={(v) => formatNumber(v)} />}
                    />
                    <Area
                      type="monotone"
                      dataKey="cases"
                      name="Cases"
                      stroke="var(--series-2)"
                      fill="url(#historicalGradient)"
                      strokeWidth={2}
                      activeDot={{ r: 4, strokeWidth: 0 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          <div className={GRID_EQUAL}>
            <ChartCard
              title="Seasonal rainfall pattern"
              subtitle="Mean rainfall by calendar month, all years & counties (mm)"
              legend={
                <>
                  <LegendChip color="var(--accent)" label="Long rains" />
                  <LegendChip color="var(--series-1)" label="Short rains" />
                </>
              }
              footer="Kenya's bimodal rains — long rains (Mar–May) and short rains (Oct–Dec), described in the proposal's Chapter 2.2 — visible directly in real CHIRPS data."
            >
              {climatology.every((m) => m.rainfall === 0) ? (
                <EmptyChart>No climate observations yet.</EmptyChart>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={seasonalData} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
                    <CartesianGrid {...GRID} />
                    <XAxis {...AXIS} dataKey="monthLabel" interval={0} />
                    <YAxis {...AXIS} width={40} />
                    <Tooltip cursor={CURSOR} content={<ChartTooltip valueFormatter={(v) => `${v.toFixed(1)} mm`} />} />
                    <Bar dataKey="rainfall" name="Avg. rainfall" radius={[4, 4, 0, 0]}>
                      {seasonalData.map((m) => (
                        <Cell key={m.monthLabel} fill={m.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard
              title="Vaccine allocation by county"
              subtitle={`Total recommended doses across all runs${fundedCounties.length > 10 ? ", top 10" : ""}`}
              footer={
                unfundedCount > 0
                  ? `${unfundedCount} other ${unfundedCount === 1 ? "county has" : "counties have"} received no doses in any run.`
                  : undefined
              }
            >
              {allocationChartData.length === 0 ? (
                <EmptyChart>No allocation runs yet.</EmptyChart>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(160, allocationChartData.length * BAR_ROW + 28)}>
                  <BarChart data={allocationChartData} layout="vertical" margin={{ top: 0, right: 48, left: 0, bottom: 0 }} barSize={14}>
                    <CartesianGrid {...GRID_VERTICAL} />
                    <XAxis {...AXIS} type="number" tickFormatter={formatCompact} />
                    <YAxis {...CATEGORY_AXIS} type="category" dataKey="name" width={96} />
                    <Tooltip cursor={CURSOR} content={<ChartTooltip valueFormatter={(v) => formatNumber(v)} />} />
                    <Bar dataKey="doses" name="Doses" fill="var(--accent)" radius={[0, 4, 4, 0]}>
                      <LabelList
                        dataKey="doses"
                        position="right"
                        formatter={(v) => formatCompact(Number(v))}
                        fill="var(--text-secondary)"
                        fontSize={11}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          <ChartCard
            title="Model performance"
            subtitle="Held-out test AUC — months the model never saw. Objective 2's target is 0.8."
            legend={
              <>
                <LegendChip color="var(--accent)" label="Full model" />
                <LegendChip color="var(--border-strong)" label="Baselines" />
                <LegendChip color="var(--risk-mid)" label="Target" dashed />
              </>
            }
            footer={modelInfo?.training_data_disclaimer}
          >
            {modelInfoError ? (
              <EmptyChart>Model performance unavailable: {modelInfoError}</EmptyChart>
            ) : !modelInfo ? (
              <EmptyChart>Loading…</EmptyChart>
            ) : (
              <div className="grid grid-cols-[1.5fr_1fr] items-center gap-6 max-[900px]:grid-cols-[1fr]">
                <ResponsiveContainer width="100%" height={210}>
                  <BarChart data={modelComparisonData} layout="vertical" margin={{ top: 18, right: 48, left: 0, bottom: 0 }} barSize={22}>
                    <CartesianGrid {...GRID_VERTICAL} />
                    <XAxis {...AXIS} type="number" domain={[0, 1]} ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]} />
                    <YAxis {...CATEGORY_AXIS} type="category" dataKey="name" width={150} />
                    <Tooltip cursor={CURSOR} content={<ChartTooltip valueFormatter={(v) => v.toFixed(3)} />} />
                    <ReferenceLine
                      x={0.8}
                      stroke="var(--risk-mid)"
                      strokeDasharray="4 3"
                      label={{ value: "Target 0.8", position: "top", fill: "var(--risk-mid)", fontSize: 11 }}
                    />
                    <Bar dataKey="auc" name="AUC" radius={[0, 4, 4, 0]}>
                      {modelComparisonData.map((entry) => (
                        <Cell key={entry.name} fill={entry.fill} />
                      ))}
                      <LabelList
                        dataKey="auc"
                        position="right"
                        formatter={(v) => Number(v).toFixed(3)}
                        fill="var(--text)"
                        fontSize={12}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>

                <div className="flex flex-col gap-3">
                  <div className={kpiCardClass("low")}>
                    <div className={KPI_LABEL_CLASS}>Climate contribution to AUC</div>
                    <div className={KPI_VALUE_CLASS}>+{modelInfo.climate_contribution_to_auc.toFixed(3)}</div>
                    <div className={KPI_HINT_CLASS}>rainfall + temperature + humidity vs. case history alone</div>
                  </div>
                  <div className={kpiCardClass()}>
                    <div className={KPI_LABEL_CLASS}>Sensitivity / specificity</div>
                    <div className={KPI_VALUE_CLASS}>
                      {(modelInfo.held_out_test_metrics.sensitivity * 100).toFixed(0)}% /{" "}
                      {(modelInfo.held_out_test_metrics.specificity * 100).toFixed(0)}%
                    </div>
                    <div className={KPI_HINT_CLASS}>on {modelInfo.held_out_test_metrics.n} held-out county-months</div>
                  </div>
                </div>
              </div>
            )}
          </ChartCard>
        </>
      )}
    </div>
  );
}
