import { County, ForecastRun, HistoricalCaseData, VaccineAllocation } from "../api/client";
import { riskBand } from "./format";
import { DecisionThresholds, DEFAULT_THRESHOLDS } from "./settings";

export type Priority = "high" | "mid" | "low" | "no-data";
export type Trend = "rising" | "falling" | "stable" | "unknown";

export interface CountyRecommendation {
  county: County;
  hasForecast: boolean;
  riskScore: number | null;
  priority: Priority;
  forecastAgeDays: number | null;
  forecastStale: boolean;
  dosesAllocated: number;
  hasAllocation: boolean;
  coveragePct: number | null;
  trend: Trend;
  trendChangePct: number | null;
  actions: string[];
  reasons: string[];
}

/** Month-over-month change from HistoricalCaseData — the modelled, synthetic
 * series (see HistoricalCaseData's docstring in cases/models.py), never the
 * real CaseReport stream, which is too sparse for a real county to trend
 * reliably yet. Every caller-facing use of this must say "modelled" — it is
 * NOT a live field-reporting signal. */
function computeTrend(rows: HistoricalCaseData[], trendThresholdPct: number): { trend: Trend; changePct: number | null } {
  if (rows.length < 2) return { trend: "unknown", changePct: null };
  const sorted = [...rows].sort((a, b) => a.period_start.localeCompare(b.period_start));
  const last = sorted[sorted.length - 1].confirmed_cases;
  const prev = sorted[sorted.length - 2].confirmed_cases;
  if (prev === 0) return { trend: "unknown", changePct: null };
  const changePct = ((last - prev) / prev) * 100;
  if (changePct > trendThresholdPct) return { trend: "rising", changePct };
  if (changePct < -trendThresholdPct) return { trend: "falling", changePct };
  return { trend: "stable", changePct };
}

/** One county's recommendation — built from real stored ForecastRun/
 * VaccineAllocation data plus a modelled trend signal, combined through
 * plain, fixed thresholds (not a trained model — every number here traces
 * back to something already on the Forecasts/Allocations pages, and the
 * `reasons` list says exactly which). `now` is injectable for testing. */
export function buildCountyRecommendation(
  county: County,
  latestForecast: ForecastRun | undefined,
  countyAllocations: VaccineAllocation[],
  historicalForCounty: HistoricalCaseData[],
  now: Date = new Date(),
  thresholds: DecisionThresholds = DEFAULT_THRESHOLDS,
): CountyRecommendation {
  const dosesAllocated = countyAllocations.reduce((sum, a) => sum + a.recommended_doses, 0);
  const hasAllocation = countyAllocations.length > 0;
  const coveragePct = county.population ? (dosesAllocated / county.population) * 100 : null;
  const { trend, changePct } = computeTrend(historicalForCounty, thresholds.trendThresholdPct);

  if (!latestForecast) {
    return {
      county,
      hasForecast: false,
      riskScore: null,
      priority: "no-data",
      forecastAgeDays: null,
      forecastStale: false,
      dosesAllocated,
      hasAllocation,
      coveragePct,
      trend,
      trendChangePct: changePct,
      actions: ["Generate a forecast for this county — without one, risk can't be assessed."],
      reasons: ["No forecast has been generated for this county yet."],
    };
  }

  const riskScore = latestForecast.risk_score;
  const priority = riskBand(riskScore, thresholds);
  const forecastAgeDays = Math.floor((now.getTime() - new Date(latestForecast.generated_at).getTime()) / 86_400_000);
  const forecastStale = forecastAgeDays > thresholds.staleForecastDays;
  const lowCoverage = !hasAllocation || (coveragePct !== null && coveragePct < thresholds.lowCoveragePct);

  const reasons = [
    `Latest forecast risk score: ${riskScore.toFixed(2)} (${latestForecast.model_name}, ${forecastAgeDays} day${forecastAgeDays === 1 ? "" : "s"} ago).`,
    hasAllocation
      ? `${dosesAllocated.toLocaleString()} doses allocated so far${coveragePct !== null ? ` (~${coveragePct.toFixed(2)}% of population)` : ""}.`
      : "No doses have been allocated to this county yet.",
  ];

  const actions: string[] = [];
  if (priority === "high") {
    actions.push(`Elevated outbreak risk (${Math.round(riskScore * 100)}%) — prioritise this county for vaccine allocation.`);
    if (lowCoverage) actions.push("No meaningful dose coverage for a high-risk county yet — run an allocation now.");
    actions.push("Increase facility case-reporting frequency and field surveillance.");
  } else if (priority === "mid") {
    actions.push(`Moderate risk (${Math.round(riskScore * 100)}%) — maintain current interventions and monitor closely.`);
    if (!hasAllocation) actions.push("Consider an allocation once higher-risk counties are covered.");
  } else {
    actions.push(`Low risk (${Math.round(riskScore * 100)}%) — routine monitoring is sufficient for now.`);
  }

  if (forecastStale) {
    actions.push(`This forecast is ${forecastAgeDays} days old — generate a new one for an up-to-date picture.`);
  }
  if (trend === "rising" && changePct !== null && changePct > 20) {
    actions.push(
      `Modelled case trend is up ${Math.round(changePct)}% recently — an early signal worth investigating, not a confirmed field report.`,
    );
  }

  return {
    county,
    hasForecast: true,
    riskScore,
    priority,
    forecastAgeDays,
    forecastStale,
    dosesAllocated,
    hasAllocation,
    coveragePct,
    trend,
    trendChangePct: changePct,
    actions,
    reasons,
  };
}

const PRIORITY_ORDER: Record<Priority, number> = { high: 0, "no-data": 1, mid: 2, low: 3 };

/** Builds and sorts recommendations for every county — highest-priority
 * (and data gaps, which are their own kind of urgent) first. */
export function buildRecommendations(
  counties: County[],
  forecasts: ForecastRun[],
  allocations: VaccineAllocation[],
  historical: HistoricalCaseData[],
  now: Date = new Date(),
  thresholds: DecisionThresholds = DEFAULT_THRESHOLDS,
): CountyRecommendation[] {
  const latestForecastByCounty = new Map<number, ForecastRun>();
  for (const f of forecasts) {
    const current = latestForecastByCounty.get(f.county);
    if (!current || new Date(f.generated_at) > new Date(current.generated_at)) latestForecastByCounty.set(f.county, f);
  }

  return counties
    .map((county) =>
      buildCountyRecommendation(
        county,
        latestForecastByCounty.get(county.id),
        allocations.filter((a) => a.county === county.id),
        historical.filter((h) => h.county === county.id),
        now,
        thresholds,
      ),
    )
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || (b.riskScore ?? 0) - (a.riskScore ?? 0));
}
