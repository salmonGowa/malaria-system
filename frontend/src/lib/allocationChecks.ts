import type { County, ForecastRun } from "../api/client";
import type { AllocationRun } from "./allocationRuns";

/** Kenya's smallest county (Lamu) has ~140k people; a population far below
 * that is far more likely a typo (a dropped digit) than a real county. */
export const SMALLEST_COUNTY = 140_000;
/** A forecast older than this is flagged before it drives a real allocation. */
export const STALE_FORECAST_DAYS = 30;

export type CheckKind = "noForecast" | "noPopulation" | "smallPopulation" | "staleForecast";

export interface DataCheck {
  county: County;
  kind: CheckKind;
  /** "block": the county can't receive doses as things stand. "warn": it can, but the figure looks wrong. */
  severity: "block" | "warn";
  detail: string;
}

const DAY_MS = 86_400_000;

/** Problems in the selected counties' data that would distort — or silently
 * change — a real allocation. One entry per problem, blocking ones first. */
export function dataChecks(
  counties: County[],
  selected: Set<number>,
  latestForecast: Map<number, ForecastRun>,
  now: Date = new Date(),
): DataCheck[] {
  const checks: DataCheck[] = [];
  for (const county of counties) {
    if (!selected.has(county.id)) continue;
    const forecast = latestForecast.get(county.id);
    if (!forecast) {
      checks.push({ county, kind: "noForecast", severity: "block", detail: "No stored forecast, so it's skipped." });
    } else {
      const ageDays = Math.floor((now.getTime() - new Date(forecast.generated_at).getTime()) / DAY_MS);
      if (ageDays > STALE_FORECAST_DAYS) {
        checks.push({ county, kind: "staleForecast", severity: "warn", detail: `Latest forecast is ${ageDays} days old.` });
      }
    }
    if (!county.population) {
      checks.push({ county, kind: "noPopulation", severity: "block", detail: "No population recorded, so it can't receive doses." });
    } else if (county.population < SMALLEST_COUNTY) {
      checks.push({
        county,
        kind: "smallPopulation",
        severity: "warn",
        detail: `Population ${county.population.toLocaleString("en")} is smaller than any Kenyan county — likely a missing digit. It also inflates coverage.`,
      });
    }
  }
  return checks.sort((a, b) => (a.severity === b.severity ? a.county.name.localeCompare(b.county.name) : a.severity === "block" ? -1 : 1));
}

export interface DiffRow {
  name: string;
  before: number;
  after: number;
  delta: number;
}

/** Per-county change from a previous run to new doses (by county name, the
 * one key both a saved run and a preview share). Biggest moves first;
 * counties at zero in both are left out. */
export function diffAgainst(previous: AllocationRun, next: Map<string, number>): DiffRow[] {
  const before = new Map(previous.lines.map((l) => [l.county_name, l.recommended_doses]));
  const names = new Set([...before.keys(), ...next.keys()]);
  return [...names]
    .map((name) => {
      const b = before.get(name) ?? 0;
      const a = next.get(name) ?? 0;
      return { name, before: b, after: a, delta: a - b };
    })
    .filter((r) => r.before > 0 || r.after > 0)
    .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta) || x.name.localeCompare(y.name));
}

/** The most doses the optimiser can place: each county takes at most its
 * population and the per-county cap. Below the supply, the rest is left over. */
export function placeableDoses(populations: number[], capPct: number, supply: number): number {
  const cap = Math.floor((supply * capPct) / 100);
  return populations.reduce((n, p) => n + Math.min(Math.max(p, 0), cap), 0);
}
