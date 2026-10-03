import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import type { County } from "../../api/client";
import { RunLines, runSummary } from "../AllocationRunLines";
import { KPI_HINT_CLASS, KPI_LABEL_CLASS, KPI_VALUE_CLASS, kpiCardClass } from "../KpiCard";
import { DeliveryPanel, ImpactPanel, type DeliveryPlan } from "../simulations/AllocationSimulator";
import { diffAgainst, placeableDoses } from "../../lib/allocationChecks";
import type { AllocationRun } from "../../lib/allocationRuns";
import { btnClass } from "../../lib/buttonClasses";
import { formatCompact, formatNumber, formatRelativeTime } from "../../lib/format";
import { encodeScenario } from "../../lib/outbreakScenario";

type InsightTab = "split" | "change" | "impact" | "delivery";

interface Props {
  run: AllocationRun;
  /** Counties that took part (selected, with a forecast). */
  counties: County[];
  supply: number;
  capPct: number;
  floor: number;
  /** The run to compare against, if any. */
  previous: AllocationRun | null;
  risk: Record<number, number>;
  plan: DeliveryPlan;
  onPlanChange: (plan: DeliveryPlan) => void;
  busy?: boolean;
  /** Suggest a fix for left-over doses (only while settings can still change). */
  onRaiseCap?: (pct: number) => void;
}

/** What a run does: headline figures, then the split, the change from the
 * last run, what the doses buy, and the delivery schedule — as tabs. Shared
 * by the live preview and the saved result so both read the same way. */
export default function AllocationInsights({ run, counties, supply, capPct, floor, previous, risk, plan, onPlanChange, busy, onRaiseCap }: Props) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<InsightTab>("split");
  const summary = runSummary(run);

  const dosesByName = useMemo(() => new Map(run.lines.map((l) => [l.county_name, l.recommended_doses])), [run]);
  const dosesByCode = useMemo(() => {
    const byName = new Map(counties.map((c) => [c.name, c.code]));
    return new Map(run.lines.map((l) => [byName.get(l.county_name) ?? String(l.county), l.recommended_doses]));
  }, [run, counties]);
  const diff = useMemo(() => (previous ? diffAgainst(previous, dosesByName) : []), [previous, dosesByName]);
  const changed = diff.filter((r) => r.delta !== 0);
  const moved = changed.reduce((n, r) => n + Math.max(r.delta, 0), 0);

  const leftover = Math.max(0, supply - run.totalAllocated);
  const placeable = placeableDoses(
    counties.map((c) => c.population ?? 0),
    capPct,
    supply,
  );
  // Smallest cap (in 5% steps) that would let the selected counties absorb the whole supply.
  const capNeeded = (() => {
    for (let pct = capPct + 5; pct <= 100; pct += 5) if (placeableDoses(counties.map((c) => c.population ?? 0), pct, supply) >= supply) return pct;
    return null;
  })();

  const tabs: { id: InsightTab; label: string; badge?: string }[] = [
    { id: "split", label: "Split" },
    { id: "change", label: "Change vs last run", badge: previous ? String(changed.length) : undefined },
    { id: "impact", label: "What it buys" },
    { id: "delivery", label: "Delivery" },
  ];

  return (
    <div>
      <div className="mb-4 grid gap-3 min-[561px]:grid-cols-2 min-[1101px]:grid-cols-4">
        <div className={kpiCardClass(leftover > 0 ? "mid" : "neutral")}>
          <div className={KPI_LABEL_CLASS}>Allocated</div>
          <div className={KPI_VALUE_CLASS}>{formatCompact(run.totalAllocated)}</div>
          <div className={KPI_HINT_CLASS}>
            {leftover > 0 ? `${formatNumber(leftover)} of ${formatNumber(supply)} left over` : `all ${formatNumber(supply)} doses placed`}
          </div>
        </div>
        <div className={kpiCardClass()}>
          <div className={KPI_LABEL_CLASS}>Counties funded</div>
          <div className={KPI_VALUE_CLASS}>
            {summary.funded.length} <span className="text-base font-medium text-muted">of {run.lines.length}</span>
          </div>
          <div className={KPI_HINT_CLASS}>{floor > 0 ? `each gets at least ${formatCompact(floor)}` : "no minimum per county"}</div>
        </div>
        <div className={kpiCardClass(summary.topShare > 0.6 ? "mid" : "neutral")}>
          <div className={KPI_LABEL_CLASS}>Largest share</div>
          <div className={KPI_VALUE_CLASS}>{(summary.topShare * 100).toFixed(0)}%</div>
          <div className={KPI_HINT_CLASS}>{summary.top ? summary.top.county_name : "—"}</div>
        </div>
        <div className={kpiCardClass()}>
          <div className={KPI_LABEL_CLASS}>vs last run</div>
          <div className={KPI_VALUE_CLASS}>{previous ? formatCompact(moved) : "—"}</div>
          <div className={KPI_HINT_CLASS}>
            {previous ? `doses moved · ${changed.length} ${changed.length === 1 ? "county" : "counties"} changed` : "no earlier run to compare"}
          </div>
        </div>
      </div>

      {leftover > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-risk-mid/40 bg-risk-mid-soft px-4 py-3 text-[0.8125rem] text-text-secondary">
          <span className="min-w-[240px] flex-1">
            <strong className="text-text">{formatNumber(leftover)} doses aren't allocated.</strong>{" "}
            {placeable < supply
              ? `Each county takes at most its population${capPct < 100 ? ` and ${capPct}% of the supply` : ""}, so these counties can absorb only ${formatNumber(placeable)}.`
              : "The optimiser left them unassigned at these settings."}
          </span>
          {onRaiseCap && capNeeded !== null && capPct < 100 && (
            <button type="button" className={btnClass("secondary", { sm: true })} onClick={() => onRaiseCap(capNeeded)}>
              Raise cap to {capNeeded}%
            </button>
          )}
        </div>
      )}

      <div role="tablist" aria-label="Allocation details" className="mb-4 flex flex-wrap gap-1 border-b border-border">
        {tabs.map((tb) => {
          const active = tab === tb.id;
          return (
            <button
              key={tb.id}
              id={`alloc-insight-${tb.id}`}
              role="tab"
              type="button"
              aria-selected={active}
              aria-controls="alloc-insight-panel"
              onClick={() => setTab(tb.id)}
              className={
                "-mb-px flex cursor-pointer items-center gap-1.5 border-0 border-b-2 bg-transparent px-3 py-2 text-[0.8125rem] font-semibold transition-colors " +
                "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent " +
                (active ? "border-accent text-text" : "border-transparent text-muted hover:text-text")
              }
            >
              {tb.label}
              {tb.badge !== undefined && (
                <span className="rounded-full bg-panel-muted px-1.5 py-px text-[0.68rem] font-semibold tabular-nums text-text-secondary">{tb.badge}</span>
              )}
            </button>
          );
        })}
      </div>

      <div id="alloc-insight-panel" role="tabpanel" aria-labelledby={`alloc-insight-${tab}`} className={`transition-opacity ${busy ? "opacity-60" : ""}`}>
        {tab === "split" && <RunLines run={run} />}
        {tab === "change" && <ChangeView previous={previous} diff={diff} supply={supply} />}
        {tab === "impact" && (
          <ImpactPanel
            embedded
            counties={counties}
            dosesByCode={dosesByCode}
            allocating={Boolean(busy)}
            onOpenOutbreak={(params) => navigate(`/simulations?s=${encodeScenario(params)}#outbreak`)}
          />
        )}
        {tab === "delivery" && <DeliveryPanel embedded counties={counties} dosesByCode={dosesByCode} risk={risk} plan={plan} onPlanChange={onPlanChange} />}
      </div>
    </div>
  );
}

function ChangeView({ previous, diff, supply }: { previous: AllocationRun | null; diff: ReturnType<typeof diffAgainst>; supply: number }) {
  if (!previous) {
    return <p className="m-0 text-[0.8125rem] text-muted">This is the first allocation — there's no earlier run to compare with.</p>;
  }
  const max = Math.max(1, ...diff.map((r) => Math.max(r.before, r.after)));
  const notes: ReactNode[] = [];
  if (previous.supply && previous.supply !== supply) {
    notes.push(`Supply ${supply > previous.supply ? "rose" : "fell"} from ${formatNumber(previous.supply)} to ${formatNumber(supply)} doses.`);
  }
  return (
    <div>
      <p className="mt-0 mb-3 text-[0.8125rem] text-muted">
        Compared with the run {formatRelativeTime(previous.generatedAt)}
        {previous.user ? ` by ${previous.user}` : ""} ({formatNumber(previous.totalAllocated)} doses
        {previous.capPct ? `, capped at ${previous.capPct}%` : ""}). {notes}
      </p>
      {diff.length === 0 ? (
        <p className="m-0 text-[0.8125rem] text-muted">Neither run gave any county doses.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {diff.map((r) => (
            <li
              key={r.name}
              className="grid grid-cols-[minmax(90px,130px)_minmax(0,1fr)_auto] items-center gap-3 text-[0.8125rem] min-[641px]:grid-cols-[150px_minmax(0,1fr)_150px_90px]"
            >
              <span className="truncate font-semibold text-text">{r.name}</span>
              {/* Before as a faint track, after as the solid bar. */}
              <span className="relative h-2.5 overflow-hidden rounded-full bg-panel-muted" aria-hidden="true">
                <span className="absolute inset-y-0 left-0 rounded-full bg-border-strong" style={{ width: `${(r.before / max) * 100}%` }} />
                <span
                  className={`absolute inset-y-0 left-0 rounded-full ${r.delta < 0 ? "bg-risk-mid" : "bg-accent"}`}
                  style={{ width: `${(r.after / max) * 100}%` }}
                />
              </span>
              <span className="hidden text-right tabular-nums text-muted min-[641px]:block">
                {formatNumber(r.before)} → <span className="font-semibold text-text">{formatNumber(r.after)}</span>
              </span>
              <span
                className={`text-right text-xs font-semibold tabular-nums ${r.delta > 0 ? "text-risk-low" : r.delta < 0 ? "text-risk-mid" : "text-muted"}`}
              >
                {r.delta === 0 ? "no change" : `${r.delta > 0 ? "▲" : "▼"} ${formatNumber(Math.abs(r.delta))}`}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 mb-0 flex items-center gap-3 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-3.5 rounded-full bg-border-strong" /> last run
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-3.5 rounded-full bg-accent" /> this run
        </span>
      </p>
    </div>
  );
}
