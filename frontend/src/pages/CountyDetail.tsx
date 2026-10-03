import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
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
  HealthFacility,
  HistoricalCaseData,
  ReadinessResponse,
  VaccineAllocation,
} from "../api/client";
import Card from "../components/Card";
import ChartTooltip from "../components/ChartTooltip";
import CountySetup from "../components/CountySetup";
import CountyShape from "../components/CountyShape";
import EditCounty from "../components/EditCounty";
import { AllocationIcon, CaseReportIcon, CheckCircleIcon, HospitalIcon, SettingsIcon, SparkleIcon, TrendDownIcon, TrendFlatIcon, TrendUpIcon } from "../components/icons";
import { activityFor, ReportingStrip, STATUS_LABEL, STATUS_PILL } from "../components/ReportingStrip";
import { previousDistinctForecast } from "../lib/analytics";
import { useAuth } from "../lib/auth";
import { priorityBadgeClass } from "../lib/badgeClasses";
import { BANNER_WARNING_CLASS } from "../lib/bannerClasses";
import { btnClass } from "../lib/buttonClasses";
import { AXIS, CURSOR, GRID } from "../lib/chartTheme";
import { formatCompact, formatDayLabel, formatMonthTick, formatNumber, formatPeriod, formatRelativeTime, riskBand } from "../lib/format";
import { PLACEHOLDER_NOTE_CLASS, ROUTE_LOADING_CLASS } from "../lib/noteClasses";
import { buildCountyRecommendation } from "../lib/recommendations";
import { useThresholds } from "../lib/useThresholds";

const BAND_COLOR = { high: "#d9534f", mid: "#e0a83b", low: "#2fae8f" } as const;
const BAND_TEXT = { high: "text-risk-high", mid: "text-risk-mid", low: "text-risk-low" } as const;
const BAND_FILL = { high: "bg-risk-high", mid: "bg-risk-mid", low: "bg-risk-low" } as const;
const BAND_HEADLINE = { high: "High outbreak risk", mid: "Moderate outbreak risk", low: "Low outbreak risk" } as const;
const STORY_MONTHS = 24;
const byNewest = (a: { generated_at: string }, b: { generated_at: string }) =>
  new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime();

function Fact({ label, value, tone }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-0.5 text-[0.95rem] font-semibold tabular-nums ${tone ?? "text-text"}`}>{value}</div>
    </div>
  );
}

export default function CountyDetail() {
  const { id } = useParams<{ id: string }>();
  const countyId = Number(id);
  const thresholds = useThresholds();
  const { username } = useAuth();

  const [county, setCounty] = useState<County | null>(null);
  const [reports, setReports] = useState<CaseReport[]>([]);
  const [forecasts, setForecasts] = useState<ForecastRun[]>([]);
  const [allocations, setAllocations] = useState<VaccineAllocation[]>([]);
  const [rainfall, setRainfall] = useState<ClimateObservation[]>([]);
  const [history, setHistory] = useState<HistoricalCaseData[]>([]);
  const [facilities, setFacilities] = useState<HealthFacility[]>([]);
  const [allCounties, setAllCounties] = useState<County[]>([]);
  const [readiness, setReadiness] = useState<ReadinessResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSetup, setShowSetup] = useState(true);
  const [editing, setEditing] = useState(false);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [reloadPrompt, setReloadPrompt] = useState(false);

  const load = () => {
    if (!countyId) return;
    Promise.all([
      api.getCounty(countyId),
      api.listAllCaseReports(countyId),
      api.listAllForecasts(countyId),
      api.listAllAllocations(countyId),
      api.listAllClimateObservations("CHIRPS", countyId),
      api.listAllHistoricalCaseData(countyId),
      api.listAllFacilities(countyId),
    ])
      .then(([c, r, f, a, rain, hist, fac]) => {
        setCounty(c);
        setReports(r);
        setForecasts([...f].sort(byNewest));
        setAllocations([...a].sort(byNewest));
        setRainfall(rain);
        setHistory(hist);
        setFacilities(fac);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
    api.countyReadiness().then(setReadiness).catch(() => undefined);
    api.listAllCounties().then(setAllCounties).catch(() => undefined);
  };

  useEffect(() => {
    setLoading(true);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countyId]);

  const latest = forecasts[0];
  const previous = useMemo(() => previousDistinctForecast(forecasts), [forecasts]);
  const band = latest ? riskBand(latest.risk_score, thresholds) : null;
  const rec = useMemo(
    () => (county ? buildCountyRecommendation(county, latest, allocations, history, new Date(), thresholds) : null),
    [county, latest, allocations, history, thresholds],
  );
  const ready = readiness?.counties[String(countyId)];

  // Rain -> cases -> forecast, on one monthly timeline.
  const story = useMemo(() => {
    const byMonth = new Map<string, { month: string; rainfall?: number; cases?: number; forecast?: number }>();
    const at = (m: string) => byMonth.get(m) ?? byMonth.set(m, { month: m }).get(m)!;
    for (const r of rainfall) if (r.rainfall_mm !== null) at(r.observation_date.slice(0, 7)).rainfall = r.rainfall_mm;
    for (const h of history) at(h.period_start.slice(0, 7)).cases = h.confirmed_cases;
    let rows = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-STORY_MONTHS);
    if (latest) {
      const fm = latest.forecast_period_start.slice(0, 7);
      const last = rows[rows.length - 1];
      // Fill any months between the data and the forecast window, so the
      // forecast sits at its real position on the time axis.
      if (last) {
        let [y, m] = last.month.split("-").map(Number);
        while (true) {
          m += 1;
          if (m > 12) {
            m = 1;
            y += 1;
          }
          const key = `${y}-${String(m).padStart(2, "0")}`;
          if (key > fm) break;
          rows.push({ month: key });
        }
      }
      rows = rows.map((r) => (r.month === fm ? { ...r, forecast: latest.predicted_cases } : r));
      // Join the dashed forecast segment to the last month of case data.
      const lastCases = [...rows].reverse().find((r) => r.cases !== undefined);
      if (lastCases && lastCases.month !== fm) lastCases.forecast = lastCases.cases;
    }
    return rows.map((r) => ({ ...r, month: `${r.month}-01` }));
  }, [rainfall, history, latest]);

  const latestAllocation = allocations[0];
  const latestRunDoses = latestAllocation ? latestAllocation.recommended_doses : 0;
  const coverage = county?.population && latestAllocation ? (latestRunDoses / county.population) * 100 : null;
  const reportTotals = reports
    .filter((r) => !r.superseded_by_id)
    .reduce((t, r) => ({ confirmed: t.confirmed + r.confirmed_cases, deaths: t.deaths + r.deaths }), { confirmed: 0, deaths: 0 });
  const todayMs = useMemo(() => Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`), []);

  if (loading) return <p className={ROUTE_LOADING_CLASS}>Loading county…</p>;
  if (error) return <p className={BANNER_WARNING_CLASS}>Could not reach backend: {error}</p>;
  if (!county) return <p className={PLACEHOLDER_NOTE_CLASS}>County not found.</p>;

  const diff = latest && previous ? latest.risk_score - previous.risk_score : null;
  const changeText =
    diff === null
      ? "first forecast for this county"
      : Math.abs(diff) < 0.01
        ? "unchanged since the previous forecast"
        : `${diff > 0 ? "up" : "down"} ${Math.abs(diff * 100).toFixed(0)} points since the previous forecast`;
  const ChangeIcon = diff === null || Math.abs(diff) < 0.01 ? TrendFlatIcon : diff > 0 ? TrendUpIcon : TrendDownIcon;
  const oneFacility = facilities.length === 1 ? facilities[0] : null;

  return (
    <div>
      <Link to="/counties" className="mb-3 inline-block text-[0.8125rem] text-muted no-underline hover:text-text">
        ← All counties
      </Link>

      {/* 1. How is it doing right now? */}
      <Card>
        <div className="grid items-center gap-5 min-[961px]:grid-cols-[auto_minmax(0,1fr)_auto]">
          <div className="grid size-[120px] place-items-center rounded-2xl bg-panel-muted">
            {county.boundary ? (
              <CountyShape geometry={county.boundary} fill={band ? BAND_COLOR[band] : "#8a97a3"} label={`Outline of ${county.name}`} size={110} />
            ) : (
              <span className="px-3 text-center text-xs text-muted">Not on the map yet</span>
            )}
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="m-0 text-[1.8rem] font-bold tracking-[-0.02em] text-text">{county.name}</h2>
              <span className="mono text-sm text-muted">{county.code}</span>
            </div>
            <p className="mt-1 mb-0 text-sm text-text-secondary">
              {county.population ? `${formatNumber(county.population)} people` : "Population unknown"}
              {" · "}
              {facilities.length} reporting {facilities.length === 1 ? "facility" : "facilities"}
              {!county.is_endemic_focus && " · outside the endemic-focus scope"}
            </p>

            {latest && band ? (
              <div className="mt-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`text-[1.35rem] font-bold ${BAND_TEXT[band]}`}>{BAND_HEADLINE[band]}</span>
                  <span className={priorityBadgeClass(band)}>{Math.round(latest.risk_score * 100)}%</span>
                </div>
                <p className="mt-1 mb-0 flex flex-wrap items-center gap-1.5 text-[0.8125rem] text-text-secondary">
                  <ChangeIcon size={14} /> {changeText}. About {formatNumber(Math.round(latest.predicted_cases))} cases expected{" "}
                  {formatPeriod(latest.forecast_period_start, latest.forecast_period_end)} · updated{" "}
                  {formatRelativeTime(latest.generated_at)}.
                </p>
                <div className="relative mt-3 h-2 max-w-[460px] rounded-full bg-panel-muted" aria-hidden="true">
                  <span className={`absolute inset-y-0 left-0 rounded-full ${BAND_FILL[band]}`} style={{ width: `${Math.max(latest.risk_score * 100, 2)}%` }} />
                  {[thresholds.riskMid, thresholds.riskHigh].map((t) => (
                    <span key={t} className="absolute -top-1 h-4 w-px bg-border-strong" style={{ left: `${t * 100}%` }} />
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <p className="m-0 text-[0.95rem] font-semibold text-text-secondary">No forecast yet</p>
                {ready?.forecast_ready && (
                  <p className="mt-1 mb-0 text-[0.8125rem] text-muted">
                    Its data is loaded — <Link to="/generate-forecast">generate its first forecast</Link> to see its outbreak risk.
                  </p>
                )}
              </div>
            )}
          </div>

          {username && (
            <div className="flex flex-wrap gap-2 min-[961px]:flex-col">
              <Link className={btnClass("primary", { sm: true, className: "no-underline" })} to="/generate-forecast">
                <SparkleIcon size={14} /> Generate forecast
              </Link>
              <Link className={btnClass("secondary", { sm: true, className: "no-underline" })} to="/run-allocation">
                <AllocationIcon size={14} /> Run allocation
              </Link>
              <Link
                className={btnClass("secondary", { sm: true, className: "no-underline" })}
                to={oneFacility ? `/submit-case-report?facility=${oneFacility.id}` : "/submit-case-report"}
              >
                <CaseReportIcon size={14} /> Submit report
              </Link>
              {!editing && (
                <button
                  type="button"
                  className={btnClass("secondary", { sm: true })}
                  onClick={() => {
                    setEditing(true);
                    setSavedNote(null);
                  }}
                >
                  <SettingsIcon size={14} /> Edit county
                </button>
              )}
            </div>
          )}
        </div>
      </Card>

      {savedNote && (
        <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-risk-low/40 bg-risk-low-soft px-4 py-3 text-[0.8125rem] text-text" role="status">
          <span className="flex items-center gap-2">
            <CheckCircleIcon size={16} /> {savedNote}
          </span>
          <button type="button" className={btnClass("secondary", { sm: true })} onClick={() => setSavedNote(null)}>
            Dismiss
          </button>
        </div>
      )}

      {editing && username && (
        <EditCounty
          county={county}
          allCounties={allCounties}
          readiness={ready}
          onCancel={() => setEditing(false)}
          onSaved={(saved, { dataStale, keepOpen }) => {
            setCounty(saved);
            if (!keepOpen) setEditing(false);
            setSavedNote(keepOpen ? `${saved.name}'s location was updated.` : `Changes to ${saved.name} saved.`);
            if (dataStale) setReloadPrompt(true);
            load();
          }}
        />
      )}

      {reloadPrompt && username && ready?.forecast_ready && (
        <CountySetup
          key={`reload-${county.id}`}
          county={county}
          readiness={ready}
          zones={readiness?.zones ?? []}
          allCounties={allCounties}
          initialStep="prepare"
          title={`Reload ${county.name}'s data to match`}
          subtitle="Pick the same zone as before to keep its profile. This regenerates its rainfall, climate and case history."
          onChanged={load}
          onClose={() => setReloadPrompt(false)}
        />
      )}

      {ready && !ready.forecast_ready && showSetup && username && (
        <CountySetup
          county={county}
          readiness={ready}
          zones={readiness?.zones ?? []}
          allCounties={allCounties}
          onChanged={load}
          onClose={() => setShowSetup(false)}
        />
      )}
      {ready && !ready.forecast_ready && !username && (
        <p className={BANNER_WARNING_CLASS}>
          {county.name} can't be forecast yet — it {ready.has_boundary ? "has no data loaded" : "isn't on the map and has no data loaded"}. Sign in to set it up.
        </p>
      )}

      {/* 2. What should we do? */}
      {rec && latest && (
        <Card>
          <div className="grid gap-6 min-[961px]:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h3 className="m-0 text-[0.95rem] font-semibold text-text">What to do</h3>
                <span className={priorityBadgeClass(rec.priority)}>
                  {rec.priority === "high" ? "High priority" : rec.priority === "mid" ? "Moderate" : rec.priority === "low" ? "Stable" : "No data"}
                </span>
              </div>
              <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
                {rec.actions.map((a, i) => (
                  <li key={i} className="flex gap-2.5 text-[0.875rem] leading-normal text-text-secondary">
                    <span className="mt-0.5 grid size-5 flex-none place-items-center rounded-full bg-accent-soft text-[0.7rem] font-bold text-accent-text">
                      {i + 1}
                    </span>
                    {a}
                  </li>
                ))}
              </ol>
              <details className="group mt-4 border-t border-border pt-3 text-[0.8125rem]">
                <summary className="cursor-pointer list-none font-semibold text-accent-text [&::-webkit-details-marker]:hidden">
                  <span className="inline-block transition-transform group-open:rotate-90">›</span> Why
                </summary>
                <ul className="mt-2 flex flex-col gap-1 pl-[18px] text-muted">
                  {rec.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </details>
            </div>
            <div className="grid content-start grid-cols-2 gap-4 rounded-xl bg-panel-muted p-4">
              <Fact
                label="Forecast age"
                value={
                  rec.forecastAgeDays !== null
                    ? `${rec.forecastAgeDays} day${rec.forecastAgeDays === 1 ? "" : "s"}${rec.forecastStale ? " · stale" : ""}`
                    : "—"
                }
                tone={rec.forecastStale ? "text-risk-high" : undefined}
              />
              <Fact
                label="Modelled trend"
                value={rec.trend === "unknown" ? "—" : rec.trendChangePct !== null ? `${rec.trendChangePct > 0 ? "+" : ""}${Math.round(rec.trendChangePct)}%` : rec.trend}
                tone={rec.trend === "rising" ? "text-risk-mid" : rec.trend === "falling" ? "text-risk-low" : undefined}
              />
              {/* Latest run only: each allocation run is an alternative split of the
                  same supply, so summing runs would overstate coverage. */}
              <Fact
                label="Dose coverage"
                value={coverage !== null ? `${coverage < 0.1 && coverage > 0 ? "<0.1" : coverage.toFixed(1)}% · latest run` : "—"}
                tone={coverage !== null && coverage < thresholds.lowCoveragePct ? "text-risk-mid" : undefined}
              />
              <Fact label="Facility reports" value={`${reports.length} · ${formatNumber(reportTotals.confirmed)} cases`} />
            </div>
          </div>
        </Card>
      )}

      {/* 3. Why — the story on one timeline */}
      {story.length > 0 && (
        <Card>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="m-0 text-[0.95rem] font-semibold text-text">Rain, cases and the forecast</h3>
              <p className="mt-1 mb-0 text-[0.8125rem] text-muted">
                Cases tend to follow heavy rain by one to two months — that lag is what the model reads.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 pt-0.5 text-xs text-muted">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-[3px] bg-series-1 opacity-60" /> Rainfall (mm)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-[3px] bg-series-2" /> Monthly cases
              </span>
              {latest && (
                <span className="flex items-center gap-1.5">
                  <span className="w-3.5 border-t-2 border-dashed border-accent" /> Forecast
                </span>
              )}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={story} margin={{ top: 16, right: 0, left: -4, bottom: 0 }}>
              <defs>
                <linearGradient id="countyCasesGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--series-2)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--series-2)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid {...GRID} />
              {latest && (
                <ReferenceArea
                  yAxisId="cases"
                  x1={`${latest.forecast_period_start.slice(0, 7)}-01`}
                  x2={story[story.length - 1].month}
                  fill="var(--accent)"
                  fillOpacity={0.1}
                  label={{ value: "Forecast", position: "insideTop", fill: "var(--muted)", fontSize: 11 }}
                />
              )}
              <XAxis {...AXIS} dataKey="month" tickFormatter={formatMonthTick} minTickGap={28} />
              <YAxis {...AXIS} yAxisId="cases" tickFormatter={formatCompact} width={52} />
              <YAxis {...AXIS} yAxisId="rain" orientation="right" width={40} />
              <Tooltip
                cursor={CURSOR}
                content={
                  <ChartTooltip
                    labelFormatter={(l) => formatMonthTick(String(l))}
                    valueFormatter={(v, name) => (name === "Rainfall" ? `${v.toFixed(0)} mm` : formatNumber(Math.round(v)))}
                  />
                }
              />
              <Bar yAxisId="rain" dataKey="rainfall" name="Rainfall" fill="var(--series-1)" fillOpacity={0.45} radius={[2, 2, 0, 0]} isAnimationActive={false} />
              <Area yAxisId="cases" type="monotone" dataKey="cases" name="Monthly cases" stroke="var(--series-2)" strokeWidth={2} fill="url(#countyCasesGradient)" isAnimationActive={false} />
              {latest && (
                <Line
                  yAxisId="cases"
                  type="monotone"
                  dataKey="forecast"
                  name="Forecast cases"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={{ r: 4, strokeWidth: 2, stroke: "var(--accent)", fill: "var(--panel)" }}
                  connectNulls
                  isAnimationActive={false}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
          <p className="mt-2 mb-0 text-xs text-muted">
            Rainfall is real CHIRPS satellite data; monthly cases are the synthetic series the model was trained on.
          </p>
        </Card>
      )}

      {/* 4. What's been done, and who's reporting */}
      <div className="grid gap-x-5 min-[1101px]:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h3 className="m-0 text-[0.95rem] font-semibold text-text">Vaccine supply</h3>
            <Link to="/allocations" className="text-xs text-text-secondary">
              All allocations
            </Link>
          </div>
          {latestAllocation ? (
            <>
              <div className="flex items-baseline gap-2">
                <span className="text-[1.8rem] font-bold leading-none tabular-nums text-text">{formatNumber(latestRunDoses)}</span>
                <span className="text-sm text-muted">doses in the latest run</span>
              </div>
              <p className="mt-1 mb-3 text-xs text-muted">
                {formatPeriod(latestAllocation.period_start, latestAllocation.period_end)} · {formatRelativeTime(latestAllocation.generated_at)}
              </p>
              {coverage !== null && (
                <>
                  <div className="mb-1 flex justify-between text-xs text-muted">
                    <span>Covers {coverage < 0.1 && coverage > 0 ? "<0.1" : coverage.toFixed(1)}% of the population</span>
                    <span className={coverage < thresholds.lowCoveragePct ? "text-risk-mid" : ""}>
                      {coverage < thresholds.lowCoveragePct ? `below the ${thresholds.lowCoveragePct}% coverage threshold` : ""}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-panel-muted" aria-hidden="true">
                    <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.min(Math.max(coverage, 1), 100)}%` }} />
                  </div>
                </>
              )}
              <ul className="m-0 mt-4 flex list-none flex-col gap-1 border-t border-border p-0 pt-3 text-[0.8125rem]">
                {allocations.slice(0, 5).map((a) => (
                  <li key={a.id} className="flex justify-between gap-3 text-text-secondary">
                    <span>{formatDayLabel(a.generated_at.slice(0, 10))}</span>
                    <span className={`tabular-nums ${a.recommended_doses ? "font-semibold text-text" : "text-muted"}`}>
                      {formatNumber(a.recommended_doses)} doses
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="m-0 text-[0.8125rem] text-muted">
              No doses allocated yet. <Link to="/run-allocation">Run an allocation</Link>.
            </p>
          )}
        </Card>

        <Card>
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h3 className="m-0 text-[0.95rem] font-semibold text-text">Reporting</h3>
            <Link to={`/case-reports?q=${encodeURIComponent(county.name)}`} className="text-xs text-text-secondary">
              Case reports
            </Link>
          </div>
          {facilities.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border-strong px-4 py-5 text-center">
              <div className="mx-auto mb-2 grid size-9 place-items-center rounded-full bg-panel-muted text-muted">
                <HospitalIcon size={17} />
              </div>
              <p className="m-0 text-[0.8125rem] text-text-secondary">
                No facility in {county.name}, so no case reports can come from here.
              </p>
              <Link to="/facilities" className={btnClass("secondary", { sm: true, className: "mt-3 no-underline" })}>
                Add a facility
              </Link>
            </div>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-5 p-0">
              {facilities.map((f) => {
                const a = activityFor(
                  reports.filter((r) => r.facility === f.id && !r.superseded_by_id),
                  todayMs,
                );
                return (
                  <li key={f.id}>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[0.875rem] font-semibold text-text">{f.name}</span>
                      <span className={`rounded-full px-2.5 py-0.5 text-[0.7rem] font-bold ${STATUS_PILL[a.status]}`}>{STATUS_LABEL[a.status]}</span>
                    </div>
                    <ReportingStrip weeks={a.weeks} todayMs={todayMs} />
                  </li>
                );
              })}
            </ul>
          )}
          {reports.length > 0 && (
            <p className="mt-4 mb-0 border-t border-border pt-3 text-xs text-muted">
              {reports.length} reports · {formatNumber(reportTotals.confirmed)} confirmed cases · {formatNumber(reportTotals.deaths)} deaths in total.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
