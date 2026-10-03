import type { AllocationRun } from "../lib/allocationRuns";
import { formatNumber } from "../lib/format";
import { PLACEHOLDER_NOTE_CLASS } from "../lib/noteClasses";

export function runSummary(run: AllocationRun) {
  const funded = run.lines.filter((l) => l.recommended_doses > 0);
  const top = funded[0] ?? null;
  return {
    funded,
    unfunded: run.lines.filter((l) => l.recommended_doses === 0),
    top,
    topShare: top && run.totalAllocated > 0 ? top.recommended_doses / run.totalAllocated : 0,
    usedPct: run.supply ? (run.totalAllocated / run.supply) * 100 : null,
  };
}

/** Funded counties as bars (doses, share, the risk that drove it), with the
 * zero-dose counties folded into one line underneath. */
export function RunLines({ run }: { run: AllocationRun }) {
  const { funded, unfunded } = runSummary(run);
  const max = Math.max(1, ...funded.map((l) => l.recommended_doses));
  return (
    <div>
      {funded.length === 0 ? (
        <p className={PLACEHOLDER_NOTE_CLASS}>No county received doses in this run.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {funded.map((l) => (
            <li
              key={l.id}
              title={l.rationale}
              className="grid grid-cols-[minmax(90px,140px)_minmax(0,1fr)_auto] items-center gap-3 text-[0.8125rem] min-[641px]:grid-cols-[150px_minmax(0,1fr)_90px_70px_80px]"
            >
              <span className="truncate font-semibold text-text">{l.county_name}</span>
              <span className="h-2.5 overflow-hidden rounded-full bg-panel-muted">
                <span className="block h-full rounded-full bg-accent" style={{ width: `${(l.recommended_doses / max) * 100}%` }} />
              </span>
              <span className="text-right font-semibold tabular-nums text-text">{formatNumber(l.recommended_doses)}</span>
              <span className="hidden text-right tabular-nums text-muted min-[641px]:block">
                {run.totalAllocated > 0 ? `${((l.recommended_doses / run.totalAllocated) * 100).toFixed(0)}%` : "—"}
              </span>
              <span className="hidden text-right text-xs text-muted min-[641px]:block">
                {l.risk !== null ? `risk ${Math.round(l.risk * 100)}%` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
      {unfunded.length > 0 && (
        <p className="mt-3 mb-0 text-xs leading-relaxed text-muted">
          <span className="font-semibold text-text-secondary">
            {unfunded.length} {unfunded.length === 1 ? "county" : "counties"} got no doses:
          </span>{" "}
          {unfunded.map((l) => l.county_name).join(", ")}.
        </p>
      )}
    </div>
  );
}
