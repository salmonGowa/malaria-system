import type { VaccineAllocation } from "../api/client";

/** Fields ml_service/app/allocation.py writes into each line's rationale:
 * "Risk score 0.21; … under the 50000-dose constraint, capped at … [and at
 * 40% of total doses (20000)]." Parsed, not trusted — every field is null
 * when the wording doesn't match, and the UI falls back gracefully. */
export interface RationaleFields {
  risk: number | null;
  supply: number | null;
  capPct: number | null;
}

export function parseRationale(text: string): RationaleFields {
  const risk = /Risk score ([\d.]+)/.exec(text);
  const supply = /under the (\d+)-dose constraint/.exec(text);
  const cap = /at (\d+)% of total doses/.exec(text);
  return {
    risk: risk ? Number(risk[1]) : null,
    supply: supply ? Number(supply[1]) : null,
    capPct: cap ? Number(cap[1]) : null,
  };
}

export interface AllocationLineView extends VaccineAllocation {
  risk: number | null;
}

export interface AllocationRun {
  key: string;
  generatedAt: string;
  user: string | null;
  periodStart: string;
  periodEnd: string;
  lines: AllocationLineView[];
  totalAllocated: number;
  /** Doses that were available to the optimiser, when the rationale says. */
  supply: number | null;
  capPct: number | null;
}

// One "Run Allocation" click writes all its rows within milliseconds; two
// separate clicks are seconds apart at the very least.
const SAME_RUN_GAP_MS = 2000;

/** Group allocation rows into the runs that created them: same user, same
 * period, written within a couple of seconds of each other. The API has no
 * run id, so this is inferred — newest run first, lines by doses desc. */
export function groupAllocationRuns(rows: VaccineAllocation[]): AllocationRun[] {
  const sorted = [...rows].sort((a, b) => new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime());
  const runs: AllocationRun[] = [];
  let current: AllocationRun | null = null;
  let lastTime = 0;

  for (const row of sorted) {
    const t = new Date(row.generated_at).getTime();
    const fields = parseRationale(row.rationale);
    const continues =
      current !== null &&
      current.user === row.generated_by_username &&
      current.periodStart === row.period_start &&
      current.periodEnd === row.period_end &&
      lastTime - t <= SAME_RUN_GAP_MS;
    if (!continues) {
      current = {
        key: `${row.generated_at}-${row.id}`,
        generatedAt: row.generated_at,
        user: row.generated_by_username,
        periodStart: row.period_start,
        periodEnd: row.period_end,
        lines: [],
        totalAllocated: 0,
        supply: fields.supply,
        capPct: fields.capPct,
      };
      runs.push(current);
    }
    current!.lines.push({ ...row, risk: fields.risk });
    current!.totalAllocated += row.recommended_doses;
    lastTime = t;
  }

  for (const run of runs) run.lines.sort((a, b) => b.recommended_doses - a.recommended_doses || a.county_name.localeCompare(b.county_name));
  return runs;
}
