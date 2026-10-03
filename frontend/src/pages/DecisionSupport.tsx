import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { api, County, ForecastRun, HistoricalCaseData, VaccineAllocation } from "../api/client";
import Card from "../components/Card";
import {
  AlertIcon,
  CheckCircleIcon,
  InfoIcon,
  SettingsIcon,
  SparkleIcon,
  TrendDownIcon,
  TrendFlatIcon,
  TrendUpIcon,
} from "../components/icons";
import { priorityBadgeClass } from "../lib/badgeClasses";
import { BANNER_WARNING_CLASS } from "../lib/bannerClasses";
import { btnClass } from "../lib/buttonClasses";
import { recCardClass, REC_WHY_UL_CLASS } from "../lib/decisionSupportClasses";
import { PLACEHOLDER_NOTE_CLASS } from "../lib/noteClasses";
import { buildRecommendations, CountyRecommendation, Priority } from "../lib/recommendations";
import type { DecisionThresholds } from "../lib/settings";
import { useThresholds } from "../lib/useThresholds";
import { useLanguage } from "../lib/i18n";

const PRIORITY_LABEL: Record<Priority, string> = {
  high: "High priority",
  mid: "Moderate",
  low: "Stable",
  "no-data": "No data",
};

const PRIORITY_ICON: Record<Priority, typeof AlertIcon> = {
  high: AlertIcon,
  mid: AlertIcon,
  low: CheckCircleIcon,
  "no-data": InfoIcon,
};

const BAND_FILL: Record<Priority, string> = {
  high: "bg-risk-high",
  mid: "bg-risk-mid",
  low: "bg-risk-low",
  "no-data": "bg-muted",
};

const FILTERS: { value: Priority | "all"; label: string; dot: string }[] = [
  { value: "all", label: "All counties", dot: "bg-accent" },
  { value: "high", label: "High priority", dot: "bg-risk-high" },
  { value: "mid", label: "Moderate", dot: "bg-risk-mid" },
  { value: "low", label: "Stable", dot: "bg-risk-low" },
  { value: "no-data", label: "No data", dot: "bg-muted" },
];

// Same cutoff recommendations.ts uses to add its "worth investigating" action.
const RISING_ALERT_PCT = 20;

/** Why a county is in "Needs attention" — null means it isn't. Priority
 * comes first; a low-risk county still surfaces when its modelled trend is
 * climbing fast or its forecast is too old to trust. */
function attentionReason(rec: CountyRecommendation): string | null {
  if (rec.priority === "high") return "High outbreak risk";
  if (rec.priority === "mid") return "Moderate outbreak risk";
  if (rec.trend === "rising" && rec.trendChangePct !== null && rec.trendChangePct > RISING_ALERT_PCT) {
    return `Modelled trend up ${Math.round(rec.trendChangePct)}%`;
  }
  if (rec.forecastStale) return "Forecast is out of date";
  return null;
}

const PRIORITY_ORDER: Record<Priority, number> = { high: 0, mid: 1, low: 2, "no-data": 3 };

function byUrgency(a: CountyRecommendation, b: CountyRecommendation) {
  return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || (b.riskScore ?? -1) - (a.riskScore ?? -1);
}

/** Risk as a bar with the Settings thresholds marked, so "46%" reads as
 * "past moderate, well short of high" without knowing the cutoffs. */
function RiskMeter({ rec, thresholds, compact = false }: { rec: CountyRecommendation; thresholds: DecisionThresholds; compact?: boolean }) {
  const pct = rec.riskScore !== null ? Math.round(rec.riskScore * 100) : null;
  return (
    <div className={compact ? "w-full" : ""}>
      {!compact && (
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-[0.8125rem] text-muted">Outbreak risk</span>
          <span className="text-[1.35rem] font-bold tabular-nums text-text">{pct !== null ? `${pct}%` : "—"}</span>
        </div>
      )}
      <div
        className="relative h-1.5 rounded-full bg-panel-muted"
        role="img"
        aria-label={pct !== null ? `Risk ${pct}%` : "No risk score"}
      >
        {pct !== null && (
          <div className={`h-full rounded-full ${BAND_FILL[rec.priority]}`} style={{ width: `${Math.max(pct, 2)}%` }} />
        )}
        {[thresholds.riskMid, thresholds.riskHigh].map((t) => (
          <span key={t} className="absolute -top-0.5 h-2.5 w-px bg-border-strong" style={{ left: `${t * 100}%` }} />
        ))}
      </div>
      {!compact && (
        <div className="relative mt-1 h-3 text-[0.65rem] text-muted">
          <span className="absolute -translate-x-1/2" style={{ left: `${thresholds.riskMid * 100}%` }}>
            moderate
          </span>
          <span className="absolute -translate-x-1/2" style={{ left: `${thresholds.riskHigh * 100}%` }}>
            high
          </span>
        </div>
      )}
    </div>
  );
}

function TrendValue({ rec }: { rec: CountyRecommendation }) {
  if (rec.trend === "unknown") {
    return (
      <span className="inline-flex items-center gap-1 text-muted">
        <TrendFlatIcon size={14} /> n/a
      </span>
    );
  }
  const pct = rec.trendChangePct !== null ? `${rec.trendChangePct > 0 ? "+" : ""}${Math.round(rec.trendChangePct)}%` : "";
  const [Icon, tone] =
    rec.trend === "rising"
      ? [TrendUpIcon, "text-risk-mid"]
      : rec.trend === "falling"
        ? [TrendDownIcon, "text-risk-low"]
        : [TrendFlatIcon, "text-muted"];
  return (
    <span className={`inline-flex items-center gap-1 ${tone}`}>
      <Icon size={14} /> {rec.trend === "stable" ? "Stable" : pct}
    </span>
  );
}

function Stat({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-0.5 text-[0.95rem] font-semibold tabular-nums text-text">{children}</div>
      {hint && <div className="text-[0.7rem] text-muted">{hint}</div>}
    </div>
  );
}

function ForecastAge({ rec }: { rec: CountyRecommendation }) {
  if (rec.forecastAgeDays === null) return <>—</>;
  return <span className={rec.forecastStale ? "text-risk-high" : undefined}>{rec.forecastAgeDays}d</span>;
}

function ActionList({ actions }: { actions: string[] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {actions.map((a, i) => (
        <li key={i} className="flex gap-2.5 text-[0.8125rem] leading-normal text-text-secondary">
          <span className="mt-[3px] grid size-4 flex-none place-items-center rounded-full bg-accent-soft text-[0.6rem] font-bold text-accent-text">
            {i + 1}
          </span>
          {a}
        </li>
      ))}
    </ul>
  );
}

function WhyList({ reasons }: { reasons: string[] }) {
  return (
    <details className="group text-[0.8125rem]">
      <summary className="cursor-pointer list-none font-semibold text-accent-text [&::-webkit-details-marker]:hidden">
        <span className="inline-block transition-transform group-open:rotate-90">›</span> Why this recommendation?
      </summary>
      <ul className={REC_WHY_UL_CLASS}>
        {reasons.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
    </details>
  );
}

function AttentionCard({ rec, reason, thresholds }: { rec: CountyRecommendation; reason: string; thresholds: DecisionThresholds }) {
  const Icon = PRIORITY_ICON[rec.priority];
  return (
    // A low-risk county is only here because something else (trend, stale
    // forecast) flagged it — amber accent says "watch", badge still says band.
    <Card className={`flex flex-col ${recCardClass(rec.priority === "low" ? "mid" : rec.priority)}`}>
      <div className="mb-1 flex items-start justify-between gap-3">
        <h3 className="m-0 text-[1.15rem] font-bold tracking-[-0.01em]">
          <Link to={`/counties/${rec.county.id}`} className="text-text no-underline hover:underline">
            {rec.county.name}
          </Link>
        </h3>
        <span className={priorityBadgeClass(rec.priority)}>
          <Icon size={13} /> {PRIORITY_LABEL[rec.priority]}
        </span>
      </div>
      <p className="mt-0 mb-4 text-xs font-medium text-muted">Flagged: {reason}</p>

      <RiskMeter rec={rec} thresholds={thresholds} />

      <div className="my-4 grid grid-cols-3 gap-3 border-y border-border py-3">
        <Stat label="Dose coverage">{rec.coveragePct !== null ? `${rec.coveragePct.toFixed(1)}%` : "—"}</Stat>
        <Stat label="Modelled trend">
          <TrendValue rec={rec} />
        </Stat>
        <Stat label="Forecast age">
          <ForecastAge rec={rec} />
        </Stat>
      </div>

      <div className="mb-2 text-xs font-semibold text-muted">Recommended actions</div>
      <div className="flex-1">
        <ActionList actions={rec.actions} />
      </div>
      <div className="mt-4 border-t border-border pt-3">
        <WhyList reasons={rec.reasons} />
      </div>
    </Card>
  );
}

const ROW_GRID = "grid grid-cols-[minmax(0,1.3fr)_minmax(0,1.6fr)_auto] items-center gap-4 min-[761px]:grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_90px_90px_70px_20px]";

/** A low-priority county as one scannable row; expands to its actions. */
function StableRow({ rec, thresholds }: { rec: CountyRecommendation; thresholds: DecisionThresholds }) {
  const pct = rec.riskScore !== null ? `${Math.round(rec.riskScore * 100)}%` : "—";
  return (
    <details className="group border-t border-border first:border-t-0">
      <summary className={`${ROW_GRID} cursor-pointer list-none px-4 py-3 hover:bg-panel-muted [&::-webkit-details-marker]:hidden`}>
        <span className="flex min-w-0 items-center gap-2">
          <span className={`size-2 flex-none rounded-full ${BAND_FILL[rec.priority]}`} />
          <span className="truncate font-semibold text-text">{rec.county.name}</span>
        </span>
        <span className="flex items-center gap-3">
          <span className="w-9 text-right text-[0.8125rem] font-semibold tabular-nums text-text">{pct}</span>
          <RiskMeter rec={rec} thresholds={thresholds} compact />
        </span>
        <span className="hidden text-[0.8125rem] tabular-nums text-text-secondary min-[761px]:block">
          {rec.coveragePct !== null ? `${rec.coveragePct.toFixed(1)}%` : "—"}
        </span>
        <span className="text-[0.8125rem] tabular-nums">
          <TrendValue rec={rec} />
        </span>
        <span className="hidden text-[0.8125rem] tabular-nums text-text-secondary min-[761px]:block">
          <ForecastAge rec={rec} />
        </span>
        <span className="hidden text-muted transition-transform group-open:rotate-90 min-[761px]:block" aria-hidden="true">
          ›
        </span>
      </summary>
      <div className="grid gap-4 bg-panel-muted/50 px-4 pt-1 pb-4 min-[761px]:grid-cols-2 min-[761px]:pl-8">
        <div>
          <div className="mb-2 text-xs font-semibold text-muted">Recommended actions</div>
          <ActionList actions={rec.actions} />
        </div>
        <div className="flex flex-col gap-3">
          <WhyList reasons={rec.reasons} />
          <Link to={`/counties/${rec.county.id}`} className="text-[0.8125rem] font-semibold text-accent-text no-underline hover:underline">
            County details →
          </Link>
        </div>
      </div>
    </details>
  );
}

export default function DecisionSupport() {
  const { t } = useLanguage();
  const [counties, setCounties] = useState<County[]>([]);
  const [forecasts, setForecasts] = useState<ForecastRun[]>([]);
  const [allocations, setAllocations] = useState<VaccineAllocation[]>([]);
  const [historical, setHistorical] = useState<HistoricalCaseData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Priority | "all">("all");

  useEffect(() => {
    Promise.all([api.listAllCounties(), api.listAllForecasts(), api.listAllAllocations(), api.listAllHistoricalCaseData()])
      .then(([c, f, a, h]) => {
        setCounties(c);
        setForecasts(f);
        setAllocations(a);
        setHistorical(h);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const thresholds = useThresholds();
  const recommendations = useMemo(
    () => buildRecommendations(counties, forecasts, allocations, historical, new Date(), thresholds),
    [counties, forecasts, allocations, historical, thresholds],
  );

  const counts = useMemo(() => {
    const c: Record<Priority | "all", number> = { all: recommendations.length, high: 0, mid: 0, low: 0, "no-data": 0 };
    for (const r of recommendations) c[r.priority]++;
    return c;
  }, [recommendations]);

  const visible = (filter === "all" ? recommendations : recommendations.filter((r) => r.priority === filter))
    .slice()
    .sort(byUrgency);
  const attention = visible.flatMap((rec) => {
    const reason = attentionReason(rec);
    return reason ? [{ rec, reason }] : [];
  });
  const routine = visible.filter((rec) => attentionReason(rec) === null);

  if (loading) {
    return (
      <div role="status" aria-busy="true" aria-label="Loading recommendations">
        <div className="mb-6 h-12 w-72 animate-pulse rounded-lg bg-panel-muted" />
        <div className="mb-6 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="h-[76px] animate-pulse rounded-xl border border-border bg-panel" />
          ))}
        </div>
        <div className="h-[320px] animate-pulse rounded-xl border border-border bg-panel" />
      </div>
    );
  }

  return (
    <div>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-[70ch]">
          <h2 className="m-0 text-[1.6rem] font-bold tracking-[-0.02em] text-text">{t("page.decisionSupport")}</h2>
          <p className="mt-1 mb-0 text-sm text-muted">
            Plain-language next steps for each county, from stored forecasts, allocations and the modelled case trend.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link className={btnClass("secondary", { className: "no-underline" })} to="/settings">
            <SettingsIcon size={15} />
            Adjust thresholds
          </Link>
          <Link className={btnClass("primary", { className: "no-underline" })} to="/generate-forecast">
            <SparkleIcon size={15} />
            Generate forecast
          </Link>
        </div>
      </header>

      <details className="group mb-6 rounded-xl border border-border bg-panel px-4 py-3 text-[0.8125rem] text-text-secondary">
        <summary className="cursor-pointer list-none font-semibold text-text [&::-webkit-details-marker]:hidden">
          <span className="mr-1 inline-block text-muted transition-transform group-open:rotate-90">›</span>
          How these recommendations are made
        </summary>
        <p className="mt-2 mb-0 leading-relaxed">
          Simple, fixed rules over real numbers — not a separate opaque model. Every recommendation's "Why?" shows
          exactly what drove it and links back to its source (Forecasts, Vaccine Allocation). The cutoffs behind
          "high risk", "stale" and "under-covered" are configurable in <Link to="/settings">Settings</Link>. Trends come
          from the modelled (synthetic) case series, so treat them as early signals, not field reports.
        </p>
      </details>

      {error && <p className={BANNER_WARNING_CLASS}>Could not reach backend: {error}</p>}

      <div role="group" aria-label="Filter by priority" className="mb-8 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        {FILTERS.map((f) => {
          const active = filter === f.value;
          return (
            <button
              key={f.value}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(f.value)}
              className={
                "flex cursor-pointer flex-col items-start gap-1 rounded-xl border px-4 py-3 text-left transition duration-150 " +
                "hover:-translate-y-px hover:shadow-[var(--shadow)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
                (active ? "border-accent bg-accent-soft shadow-[var(--shadow-sm)]" : "border-border bg-panel")
              }
            >
              <span className="flex items-center gap-2 text-[0.8125rem] font-medium text-text-secondary">
                <span className={`size-2 rounded-full ${f.dot}`} />
                {f.label}
              </span>
              <span className="text-[1.6rem] font-bold leading-none tabular-nums text-text">{counts[f.value]}</span>
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <p className={PLACEHOLDER_NOTE_CLASS}>No counties match this filter.</p>
      ) : (
        <>
          {attention.length > 0 && (
            <section className="mb-8">
              <div className="mb-3 flex items-baseline gap-2">
                <h3 className="m-0 text-[1.05rem] font-bold text-text">Needs attention</h3>
                <span className="text-sm text-muted">
                  {attention.length} {attention.length === 1 ? "county" : "counties"}
                </span>
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-x-4">
                {attention.map(({ rec, reason }) => (
                  <AttentionCard key={rec.county.id} rec={rec} reason={reason} thresholds={thresholds} />
                ))}
              </div>
            </section>
          )}

          {routine.length > 0 && (
            <section>
              <div className="mb-3 flex items-baseline gap-2">
                <h3 className="m-0 text-[1.05rem] font-bold text-text">Routine monitoring</h3>
                <span className="text-sm text-muted">
                  {routine.length} {routine.length === 1 ? "county" : "counties"} · select a row for details
                </span>
              </div>
              <div className="mb-5 overflow-hidden rounded-xl border border-border bg-panel shadow-[var(--shadow-sm)]">
                <div className={`${ROW_GRID} border-b border-border bg-panel-muted px-4 py-2 text-xs font-semibold text-muted`} aria-hidden="true">
                  <span>County</span>
                  <span>Outbreak risk</span>
                  <span className="hidden min-[761px]:block">Coverage</span>
                  <span>Trend</span>
                  <span className="hidden min-[761px]:block">Forecast</span>
                  <span className="hidden min-[761px]:block" />
                </div>
                {routine.map((rec) => (
                  <StableRow key={rec.county.id} rec={rec} thresholds={thresholds} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
