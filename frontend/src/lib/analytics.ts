import { CaseReport, ClimateObservation, ForecastRun, HistoricalCaseData, VaccineAllocation } from "../api/client";

export const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Most recent forecast per county, keyed by county id. */
export function latestForecastByCounty(forecasts: ForecastRun[]): Map<number, ForecastRun> {
  const latest = new Map<number, ForecastRun>();
  for (const f of forecasts) {
    const current = latest.get(f.county);
    if (!current || new Date(f.generated_at) > new Date(current.generated_at)) {
      latest.set(f.county, f);
    }
  }
  return latest;
}

/** Total confirmed/suspected cases per report_date, chronological. */
export function caseTrend(reports: CaseReport[]): { date: string; confirmed: number; suspected: number }[] {
  const byDate = new Map<string, { confirmed: number; suspected: number }>();
  for (const r of reports) {
    const entry = byDate.get(r.report_date) ?? { confirmed: 0, suspected: 0 };
    entry.confirmed += r.confirmed_cases;
    entry.suspected += r.suspected_cases;
    byDate.set(r.report_date, entry);
  }
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, ...v }));
}

/** Sum HistoricalCaseData.confirmed_cases by month. */
export function historicalCaseTrend(rows: HistoricalCaseData[]): { month: string; cases: number }[] {
  const byMonth = new Map<string, number>();
  for (const r of rows) {
    byMonth.set(r.period_start, (byMonth.get(r.period_start) ?? 0) + r.confirmed_cases);
  }
  return [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, cases]) => ({ month, cases }));
}

/** Mean CHIRPS rainfall_mm by month. */
export function historicalRainfallTrend(rows: ClimateObservation[]): { month: string; rainfall: number }[] {
  const byMonth = new Map<string, { sum: number; n: number }>();
  for (const r of rows) {
    if (r.rainfall_mm == null) continue;
    const entry = byMonth.get(r.observation_date) ?? { sum: 0, n: 0 };
    entry.sum += r.rainfall_mm;
    entry.n += 1;
    byMonth.set(r.observation_date, entry);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, { sum, n }]) => ({ month, rainfall: sum / n }));
}

/** Mean rainfall_mm by calendar month (Jan..Dec), across every year (and,
 * for a multi-county call site, every county) — Kenya's bimodal rain
 * pattern (long rains Mar-May, short rains Oct-Dec). */
export function seasonalClimatology(rows: ClimateObservation[]): { monthLabel: string; rainfall: number }[] {
  const sums = new Array(12).fill(0);
  const counts = new Array(12).fill(0);
  for (const r of rows) {
    if (r.rainfall_mm == null) continue;
    const m = new Date(r.observation_date).getUTCMonth();
    sums[m] += r.rainfall_mm;
    counts[m] += 1;
  }
  return MONTH_LABELS.map((label, i) => ({ monthLabel: label, rainfall: counts[i] ? sums[i] / counts[i] : 0 }));
}

/** Sum recommended_doses by county, sorted descending. */
export function allocationByCounty(allocations: VaccineAllocation[]): { name: string; doses: number }[] {
  const byCounty = new Map<string, number>();
  for (const a of allocations) {
    byCounty.set(a.county_name, (byCounty.get(a.county_name) ?? 0) + a.recommended_doses);
  }
  return [...byCounty.entries()].sort((a, b) => b[1] - a[1]).map(([name, doses]) => ({ name, doses }));
}

/** Pairs each ForecastRun with the actual HistoricalCaseData figure for the
 * same county+month, where one exists — the forecast-accuracy comparison.
 * Only forecast periods that fall inside the historical window have an
 * "actual" to compare against; the rest are dropped, not zero-filled. */
export function forecastAccuracy(
  forecasts: ForecastRun[],
  historical: HistoricalCaseData[],
): { period: string; predicted: number; actual: number }[] {
  const actualByKey = new Map<string, number>();
  for (const h of historical) {
    actualByKey.set(`${h.county}:${h.period_start}`, h.confirmed_cases);
  }
  const rows: { period: string; predicted: number; actual: number }[] = [];
  for (const f of forecasts) {
    const actual = actualByKey.get(`${f.county}:${f.forecast_period_start}`);
    if (actual !== undefined) {
      rows.push({ period: `${f.county_name} ${f.forecast_period_start}`, predicted: f.predicted_cases, actual });
    }
  }
  return rows.sort((a, b) => a.period.localeCompare(b.period));
}

/** The run a county's latest forecast should be compared against: the most
 * recent earlier run that actually differs — a different forecast window,
 * or a risk score that moved by at least `epsilon`. Back-to-back reruns of
 * the same window (e.g. repeated e2e test runs) are skipped, so "change
 * since previous" means a real change. `runs` must be newest first. */
export function previousDistinctForecast(runs: ForecastRun[], epsilon = 0.01): ForecastRun | null {
  const [latest, ...earlier] = runs;
  if (!latest) return null;
  return (
    earlier.find(
      (r) => r.forecast_period_start !== latest.forecast_period_start || Math.abs(r.risk_score - latest.risk_score) >= epsilon,
    ) ?? null
  );
}
