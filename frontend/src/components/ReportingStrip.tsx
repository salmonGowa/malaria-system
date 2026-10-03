import type { CaseReport } from "../api/client";
import { formatDayLabel } from "../lib/format";

/** A facility's reporting activity over the last year, shared by the
 * Facilities page and County detail. */

// A facility with no report in this many days has "gone quiet".
export const ACTIVE_DAYS = 30;
export const WEEKS = 52;
export const DAY_MS = 86400000;

export type Status = "active" | "quiet" | "never";
export const STATUS_LABEL: Record<Status, string> = { active: "Reporting", quiet: "Gone quiet", never: "Never reported" };
export const STATUS_PILL: Record<Status, string> = {
  active: "bg-risk-low-soft text-risk-low",
  quiet: "bg-risk-mid-soft text-risk-mid",
  never: "bg-panel-muted text-muted",
};

export interface FacilityActivity {
  reports: CaseReport[];
  last: string | null;
  status: Status;
  weeks: number[]; // reports per week, oldest first, last WEEKS weeks
}

export function activityFor(reports: CaseReport[], todayMs: number): FacilityActivity {
  const weeks = new Array<number>(WEEKS).fill(0);
  let last: string | null = null;
  for (const r of reports) {
    if (!last || r.report_date > last) last = r.report_date;
    const ago = Math.floor((todayMs - Date.parse(`${r.report_date}T00:00:00Z`)) / (7 * DAY_MS));
    if (ago >= 0 && ago < WEEKS) weeks[WEEKS - 1 - ago]++;
  }
  const status: Status = !last ? "never" : todayMs - Date.parse(`${last}T00:00:00Z`) <= ACTIVE_DAYS * DAY_MS ? "active" : "quiet";
  return { reports, last, status, weeks };
}

/** Longest run of weeks with no report, counted from the first reported week. */
export function longestGap(weeks: number[]): number {
  const first = weeks.findIndex((w) => w > 0);
  if (first === -1) return 0;
  let best = 0;
  let run = 0;
  for (let i = first; i < weeks.length; i++) {
    run = weeks[i] > 0 ? 0 : run + 1;
    best = Math.max(best, run);
  }
  return best;
}

/** One cell per week for the last year — filled when the facility reported.
 * Gaps in reporting are visible at a glance. */
export function ReportingStrip({ weeks, todayMs }: { weeks: number[]; todayMs: number }) {
  const reported = weeks.filter((w) => w > 0).length;
  const gap = longestGap(weeks);
  const startLabel = formatDayLabel(new Date(todayMs - (WEEKS - 1) * 7 * DAY_MS).toISOString().slice(0, 10));
  return (
    <div>
      <div
        role="img"
        aria-label={`Reported in ${reported} of the last ${WEEKS} weeks${gap ? `; longest gap ${gap} weeks` : ""}`}
        className="grid gap-[2px]"
        style={{ gridTemplateColumns: `repeat(${WEEKS}, minmax(0, 1fr))` }}
      >
        {weeks.map((n, i) => {
          const weekStart = new Date(todayMs - (WEEKS - 1 - i) * 7 * DAY_MS).toISOString().slice(0, 10);
          return (
            <span
              key={i}
              title={`Week of ${formatDayLabel(weekStart)}: ${n} report${n === 1 ? "" : "s"}`}
              className={`h-5 rounded-[2px] ${n > 0 ? "bg-accent" : "bg-panel-muted"} ${i === WEEKS - 1 ? "ring-1 ring-border-strong" : ""}`}
              style={n > 1 ? { opacity: 1 } : n === 1 ? { opacity: 0.75 } : undefined}
            />
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[0.65rem] text-muted">
        <span>{startLabel}</span>
        <span>this week</span>
      </div>
      <p className="mt-1.5 mb-0 text-xs text-text-secondary">
        Reported in <strong className="text-text">{reported}</strong> of the last {WEEKS} weeks
        {gap >= 4 && (
          <>
            {" "}
            · longest gap <strong className="text-risk-mid">{gap} weeks</strong>
          </>
        )}
      </p>
    </div>
  );
}
