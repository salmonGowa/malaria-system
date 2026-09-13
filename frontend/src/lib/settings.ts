/** Configurable Decision Support thresholds — the fixed numbers that turn
 * raw forecast/allocation data into "high risk", "stale", "low coverage",
 * "rising trend" (see lib/recommendations.ts and lib/format.ts's riskBand).
 * These were hardcoded module constants; different deployments (or just a
 * different judgment call by whoever's running this) may reasonably want a
 * different cutoff for what counts as "high risk" or "stale" — so they're
 * a small settings object instead, editable from the Settings page.
 *
 * Stored in localStorage, the same place ThemeToggle keeps its preference
 * (see components/ThemeToggle.tsx) — a deliberate choice, not an oversight:
 * this project has no multi-tenant deployment or per-organisation backend
 * config store yet (docs/roadmap.md), so a client-side preference is the
 * honest scope rather than a backend model this prototype doesn't need.
 * Every reader falls back to DEFAULT_THRESHOLDS, so a fresh browser/private
 * window behaves exactly as before this existed. */

export interface DecisionThresholds {
  /** risk_score >= this reads as "high" (red). */
  riskHigh: number;
  /** risk_score >= this (and < riskHigh) reads as "mid" (amber); below reads as "low" (green). */
  riskMid: number;
  /** A forecast older than this many days is flagged stale. */
  staleForecastDays: number;
  /** Doses allocated covering less than this % of population counts as "effectively uncovered". */
  lowCoveragePct: number;
  /** Month-over-month case change below this % (in either direction) reads as "stable", not a trend. */
  trendThresholdPct: number;
}

export const DEFAULT_THRESHOLDS: DecisionThresholds = {
  riskHigh: 0.66,
  riskMid: 0.33,
  staleForecastDays: 30,
  lowCoveragePct: 1,
  trendThresholdPct: 10,
};

const STORAGE_KEY = "malaria-system:decision-thresholds";
const CHANGE_EVENT = "malaria-system:thresholds-changed";

function clampedNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function loadThresholds(): DecisionThresholds {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_THRESHOLDS;
    const parsed = JSON.parse(raw) as Partial<DecisionThresholds>;
    return {
      riskHigh: clampedNumber(parsed.riskHigh, DEFAULT_THRESHOLDS.riskHigh),
      riskMid: clampedNumber(parsed.riskMid, DEFAULT_THRESHOLDS.riskMid),
      staleForecastDays: clampedNumber(parsed.staleForecastDays, DEFAULT_THRESHOLDS.staleForecastDays),
      lowCoveragePct: clampedNumber(parsed.lowCoveragePct, DEFAULT_THRESHOLDS.lowCoveragePct),
      trendThresholdPct: clampedNumber(parsed.trendThresholdPct, DEFAULT_THRESHOLDS.trendThresholdPct),
    };
  } catch {
    // Private browsing, corrupted value, storage disabled — behave as
    // though nothing was ever saved rather than crashing the page.
    return DEFAULT_THRESHOLDS;
  }
}

export function saveThresholds(thresholds: DecisionThresholds): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(thresholds));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    // If storage is unavailable there's nothing more to do — the caller's
    // in-memory state (this session only) still reflects the change.
  }
}

export function resetThresholds(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    // As above.
  }
}

/** Fires on every save/reset in this tab, plus the browser's native
 * `storage` event for changes made in another tab — so any page showing
 * risk colors stays in sync without a manual refresh. */
export function subscribeToThresholds(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
