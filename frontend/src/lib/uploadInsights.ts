import { UploadSimulationResponse } from "../api/client";
import { DecisionThresholds, DEFAULT_THRESHOLDS } from "./settings";

/** Decision-support layer for Upload & Simulate — the same spirit as
 * lib/recommendations.ts (plain, fixed rules over real numbers a user can
 * trace, not a second opaque model), applied to an uploaded, unsaved
 * dataset instead of a stored county forecast. Deliberately does NOT
 * invent a 0-1 "risk score" that looks like the trained XGBoost model's
 * calibrated output (see docs/architecture.md's "Model results") — this
 * runs on a bring-your-own dataset the model was never trained on, so
 * anything dressed up as a calibrated probability here would be fake
 * confidence.
 *
 * `concern` is driven by comparing the *peak* of the projection to the
 * peak already seen in the uploaded window (`projectedPeak` vs
 * `historicalPeak`, both found by scanning every row, not just the
 * endpoints) — not by where the projection happens to land on its last
 * month. An earlier version compared only the first and last projected
 * values, which is wrong for exactly the shape this model tends to
 * produce: `forecast()` re-simulates a fresh SEIR wave forward from where
 * the fit left off, so a projection can rise, peak mid-window, and fall
 * again before the horizon ends — a real second wave that a first/last
 * comparison completely misses if the window happens to close on a low
 * point. Caught by testing against a real uploaded series (a single clean
 * outbreak) where the projected peak *matched* the historical peak but the
 * old logic still rated it "low concern" because month 6 was low. `trend`
 * (rising/falling/stable) is kept as a separate, purely descriptive
 * endpoint comparison for the narrative text — it no longer gates
 * `concern`. */

export type Concern = "high" | "mid" | "low";
export type Trend = "rising" | "falling" | "stable" | "unknown";

// Matches ml_service/app/upload_simulation.py's own fit_relative_error > 0.5
// warning threshold exactly — this is the same "is this fit trustworthy"
// line the backend already draws, re-expressed here for the concern rating
// rather than a second, possibly-drifting number.
const FIT_RELIABILITY_THRESHOLD = 0.5;
const LOW_REPORTING_FRACTION_THRESHOLD = 0.3;
// projectedPeak / historicalPeak ratio bands — the primary concern driver.
// >= 1.0: the projection reaches or exceeds the worst point already seen.
// >= 0.5: still a meaningful fraction of that worst point, worth watching.
const HIGH_PEAK_RATIO = 1.0;
const MID_PEAK_RATIO = 0.5;

export interface PeakPoint {
  date: string;
  value: number;
}

export interface UploadInsights {
  concern: Concern;
  fitIsReliable: boolean;
  historicalPeak: PeakPoint | null;
  projectedPeak: PeakPoint | null;
  totalProjectedCases: number | null;
  totalHistoricalCases: number;
  trend: Trend;
  trendChangePct: number | null;
  /** null when there isn't enough of a fitted reporting fraction to estimate
   * from, OR when the estimate itself is implausible (more estimated true
   * infections than the population) — see the reporting-fraction sanity
   * check below. Check `reportingFractionIsPlausible` to tell those two
   * "null" cases apart when explaining why nothing is shown. */
  estimatedTrueInfections: number | null;
  reportingFractionIsPlausible: boolean;
  attackRatePct: number | null;
  summary: string;
  actions: string[];
  reasons: string[];
}

function peakOf(rows: UploadSimulationResponse["series"], key: "actual" | "predicted"): PeakPoint | null {
  let best: PeakPoint | null = null;
  for (const r of rows) {
    const v = r[key];
    if (v === null) continue;
    if (!best || v > best.value) best = { date: r.date, value: v };
  }
  return best;
}

function computeTrend(projected: number[], trendThresholdPct: number): { trend: Trend; changePct: number | null } {
  if (projected.length < 2) return { trend: "unknown", changePct: null };
  const first = projected[0];
  const last = projected[projected.length - 1];
  if (first === 0) return { trend: "unknown", changePct: null };
  const changePct = ((last - first) / first) * 100;
  if (changePct > trendThresholdPct) return { trend: "rising", changePct };
  if (changePct < -trendThresholdPct) return { trend: "falling", changePct };
  return { trend: "stable", changePct };
}

export function buildUploadInsights(
  result: UploadSimulationResponse,
  thresholds: DecisionThresholds = DEFAULT_THRESHOLDS,
): UploadInsights {
  const historicalRows = result.series.filter((r) => r.actual !== null);
  const projectedRows = result.series.filter((r) => r.predicted !== null);

  const historicalPeak = peakOf(historicalRows, "actual");
  const projectedPeak = projectedRows.length > 0 ? peakOf(projectedRows, "predicted") : null;

  const totalHistoricalCases = historicalRows.reduce((sum, r) => sum + (r.actual ?? 0), 0);
  const totalProjectedCases = projectedRows.length > 0 ? projectedRows.reduce((sum, r) => sum + (r.predicted ?? 0), 0) : null;

  const { trend, changePct } = computeTrend(
    projectedRows.map((r) => r.predicted as number),
    thresholds.trendThresholdPct,
  );

  const fitIsReliable = result.fit_relative_error <= FIT_RELIABILITY_THRESHOLD;

  const reportingFraction = result.fitted_params.reporting_fraction;
  const rawEstimatedTrueInfections = reportingFraction > 0 ? Math.round(totalHistoricalCases / reportingFraction) : null;
  // A fitted reporting fraction can be poorly constrained (this tool fits
  // to whatever series it's handed, with no prior on what a plausible
  // reporting rate looks like) and imply more "true infections" than the
  // population itself — caught by testing against a real upload where a
  // near-zero rainfall-sensitivity fit (k) came with a 1.1% reporting
  // fraction, backing out 622K infections against a 500K population. Rather
  // than present that confidently, treat it as implausible and say so.
  const reportingFractionIsPlausible =
    rawEstimatedTrueInfections === null || rawEstimatedTrueInfections <= result.population;
  const estimatedTrueInfections = reportingFractionIsPlausible ? rawEstimatedTrueInfections : null;

  const attackRatePct =
    result.population > 0
      ? ((totalHistoricalCases + (totalProjectedCases ?? 0)) / result.population) * 100
      : null;

  const peakRatio =
    projectedPeak !== null && historicalPeak !== null && historicalPeak.value > 0
      ? projectedPeak.value / historicalPeak.value
      : null;

  let concern: Concern;
  if (!fitIsReliable) {
    concern = "mid"; // an unreliable fit can't honestly be called "low risk" either — the uncertainty itself is what needs attention
  } else if (peakRatio !== null) {
    if (peakRatio >= HIGH_PEAK_RATIO) concern = "high";
    else if (peakRatio >= MID_PEAK_RATIO) concern = "mid";
    else concern = "low";
  } else if (trend === "rising") {
    // Defensive fallback for the edge case where a peak ratio can't be
    // computed at all (e.g. a zero historical peak) — falls back to the
    // endpoint trend rather than defaulting to "low" with no signal behind it.
    concern = "mid";
  } else {
    concern = "low";
  }

  const reasons: string[] = [];
  if (historicalPeak) {
    reasons.push(`Highest point in your uploaded data: ${Math.round(historicalPeak.value).toLocaleString()} cases around ${historicalPeak.date}.`);
  }
  if (projectedPeak) {
    reasons.push(
      `Highest point in the projection: ${Math.round(projectedPeak.value).toLocaleString()} cases around ${projectedPeak.date}` +
        (peakRatio !== null ? ` — ${Math.round(peakRatio * 100)}% of the historical peak.` : "."),
    );
  }
  reasons.push(
    trend === "unknown"
      ? "Not enough projected months to judge whether the projection ends higher or lower than it starts."
      : `By the end of the projection window the trajectory is ${trend}${changePct !== null ? ` (${changePct > 0 ? "+" : ""}${Math.round(changePct)}% from the first to the last projected month)` : ""} — a separate, purely descriptive reading from the peak comparison above, since a projection can rise, peak mid-window, and fall again before the horizon ends.`,
  );
  reasons.push(
    `Fit quality: typical error is ~${Math.round(Math.min(result.fit_relative_error, 5) * 100)}% of the mean case count — ${fitIsReliable ? "within the range this tool treats as trustworthy" : "beyond the range this tool treats as trustworthy (see the warning above the chart)"}.`,
  );
  if (estimatedTrueInfections !== null) {
    reasons.push(
      `Fitted reporting fraction ${(reportingFraction * 100).toFixed(1)}% implies roughly ${estimatedTrueInfections.toLocaleString()} true infections behind the ${Math.round(totalHistoricalCases).toLocaleString()} confirmed cases in your uploaded window.`,
    );
  } else if (!reportingFractionIsPlausible && rawEstimatedTrueInfections !== null) {
    reasons.push(
      `Fitted reporting fraction ${(reportingFraction * 100).toFixed(1)}% would imply ${rawEstimatedTrueInfections.toLocaleString()} true infections — more than the ${result.population.toLocaleString()} population, so treated as an unreliable estimate rather than shown as a number (the "Est. true infections" tile above is blank for this reason).`,
    );
  }

  const actions: string[] = [];
  if (!fitIsReliable) {
    actions.push(
      "The model's fit to your data isn't reliable — before acting on anything below, try uploading a shorter window around one emerging outbreak rather than a full endemic year (see the warning above the chart for why).",
    );
  } else if (concern === "high") {
    actions.push(
      "The projection reaches or exceeds the worst point already in your data at some point in the window — treat this as an early warning worth escalating (notify the relevant health office, review surge capacity), even if the window happens to end lower than it peaks.",
    );
    actions.push(
      "If this series represents a real county, consider generating a real forecast for it (Generate Forecast) so it can feed a proper vaccine allocation run — this tool never saves data or triggers allocation itself.",
    );
  } else if (concern === "mid") {
    actions.push(
      "The projection reaches a meaningful fraction of the worst point already seen — worth monitoring closely and re-running this simulation as new data comes in, rather than an immediate escalation.",
    );
  } else {
    actions.push(
      "The projection stays well below the worst point already seen in your data — routine monitoring looks sufficient based on this data alone.",
    );
  }
  if (!result.used_rainfall) {
    actions.push(
      "No rainfall_mm column was included, so the projection assumes transmission conditions stay flat at recent levels — add rainfall data for a climate-aware projection.",
    );
  }
  if (!reportingFractionIsPlausible) {
    actions.push(
      "The fitted reporting fraction isn't reliable for this dataset (see the note below) — treat the reporting-related numbers here as uninformative rather than as evidence of a surveillance gap.",
    );
  } else if (reportingFraction > 0 && reportingFraction < LOW_REPORTING_FRACTION_THRESHOLD) {
    actions.push(
      `The fit estimates a wide gap between confirmed and true infections (~${(reportingFraction * 100).toFixed(0)}% reporting) — worth asking whether surveillance/testing capacity is a bottleneck here.`,
    );
  }

  const summaryParts: string[] = [];
  summaryParts.push(
    `Based on the ${historicalRows.length}-month series you uploaded${historicalPeak ? `, cases peaked at ${Math.round(historicalPeak.value).toLocaleString()} around ${historicalPeak.date}` : ""}.`,
  );
  if (projectedRows.length > 0 && projectedPeak) {
    summaryParts.push(
      `Over the next ${projectedRows.length} month${projectedRows.length === 1 ? "" : "s"}, the projection reaches roughly ${Math.round(projectedPeak.value).toLocaleString()} cases around ${projectedPeak.date}` +
        (peakRatio !== null ? ` — ${Math.round(peakRatio * 100)}% of the historical peak` : "") +
        (totalProjectedCases !== null ? `, with about ${Math.round(totalProjectedCases).toLocaleString()} projected cases in total over that window` : "") +
        `. By the end of the window the trajectory is ${trend === "unknown" ? "not yet clear" : trend}.`,
    );
  }
  if (!fitIsReliable) {
    summaryParts.push("Treat this cautiously — the fit doesn't track your uploaded data well (see the warning above).");
  }
  const summary = summaryParts.join(" ");

  return {
    concern,
    fitIsReliable,
    historicalPeak,
    projectedPeak,
    totalProjectedCases,
    totalHistoricalCases,
    trend,
    trendChangePct: changePct,
    estimatedTrueInfections,
    reportingFractionIsPlausible,
    attackRatePct,
    summary,
    actions,
    reasons,
  };
}
