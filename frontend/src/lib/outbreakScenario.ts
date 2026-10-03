import type { SimulationRequest } from "../api/client";

/** Everything that defines one outbreak what-if — what's sent to the
 * simulator, saved as a compared scenario, and encoded into a share link. */
export interface OutbreakParams {
  population: number;
  initialInfectious: number;
  transmissionRate: number;
  interventionCoverage: number;
  interventionStartWeek: number;
  horizonWeeks: number;
  model: "seir" | "vector";
  seasonal: boolean;
  rainfall: number[]; // 12 monthly means, Jan..Dec
  rainfallSensitivity: number;
  startMonth: number; // 1-12
  incubationDays: number;
  infectiousDays: number;
  vaccineProtected: number; // 0-1 share protected from week 0
  uncertainty: boolean;
  /** People treated per week the health system can manage; 0 = not shown. */
  capacityPerWeek: number;
  countyId: number | null;
  countyName: string | null;
}

/** Mean monthly CHIRPS rainfall across the project's counties, Sep 2021 –
 * Aug 2026 — the bimodal long-rains (Mar–May) / short-rains (Oct–Dec)
 * pattern. Used when seasons are on but no county is selected. */
export const KENYA_RAINFALL_MM = [60, 100, 168, 226, 180, 84, 81, 92, 109, 123, 177, 128];

export const OUTBREAK_DEFAULTS: OutbreakParams = {
  population: 500000,
  initialInfectious: 50,
  transmissionRate: 0.35,
  interventionCoverage: 0.3,
  interventionStartWeek: 0,
  horizonWeeks: 24,
  model: "seir",
  seasonal: false,
  rainfall: KENYA_RAINFALL_MM,
  rainfallSensitivity: 1,
  startMonth: new Date().getMonth() + 1,
  incubationDays: 10,
  infectiousDays: 14,
  vaccineProtected: 0,
  uncertainty: false,
  capacityPerWeek: 0,
  countyId: null,
  countyName: null,
};

export function toRequest(p: OutbreakParams): SimulationRequest {
  return {
    population: p.population,
    initial_infectious: Math.min(p.initialInfectious, p.population),
    transmission_rate: p.transmissionRate,
    incubation_period_days: p.incubationDays,
    infectious_period_days: p.infectiousDays,
    intervention_coverage: p.interventionCoverage,
    horizon_weeks: p.horizonWeeks,
    model: p.model,
    intervention_start_week: Math.min(p.interventionStartWeek, p.horizonWeeks),
    vaccine_protected_fraction: p.vaccineProtected,
    seasonal_rainfall_mm: p.seasonal ? p.rainfall : null,
    rainfall_sensitivity: p.rainfallSensitivity,
    start_month: p.startMonth,
    uncertainty: p.uncertainty,
  };
}

// --- Share links ------------------------------------------------------------
// Short keys keep the URL readable. Values are clamped on decode: a shared
// link is untrusted input, and must never produce an invalid request.

const KEYS: Record<keyof OutbreakParams, string> = {
  population: "p",
  initialInfectious: "i",
  transmissionRate: "b",
  interventionCoverage: "c",
  interventionStartWeek: "s",
  horizonWeeks: "h",
  model: "m",
  seasonal: "se",
  rainfall: "r",
  rainfallSensitivity: "k",
  startMonth: "sm",
  incubationDays: "inc",
  infectiousDays: "inf",
  vaccineProtected: "v",
  uncertainty: "u",
  capacityPerWeek: "cap",
  countyId: "cid",
  countyName: "cn",
};

const clamp = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(Math.max(v, min), max) : fallback;

function toBase64Url(text: string) {
  return btoa(unescape(encodeURIComponent(text))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(code: string) {
  const b64 = code.replace(/-/g, "+").replace(/_/g, "/");
  return decodeURIComponent(escape(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4))));
}

export function encodeScenario(p: OutbreakParams): string {
  const compact: Record<string, unknown> = {};
  for (const [key, short] of Object.entries(KEYS) as [keyof OutbreakParams, string][]) {
    if (JSON.stringify(p[key]) !== JSON.stringify(OUTBREAK_DEFAULTS[key])) compact[short] = p[key];
  }
  return toBase64Url(JSON.stringify(compact));
}

/** Decode a share code; anything missing, malformed or out of range falls
 * back to the default (never throws). */
export function decodeScenario(code: string | null | undefined): OutbreakParams | null {
  if (!code) return null;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(fromBase64Url(code));
    if (typeof raw !== "object" || raw === null) return null;
  } catch {
    return null;
  }
  const d = OUTBREAK_DEFAULTS;
  const get = (k: keyof OutbreakParams) => raw[KEYS[k]];
  const rain = get("rainfall");
  const population = Math.round(clamp(get("population"), 1, 50_000_000, d.population));
  return {
    population,
    initialInfectious: Math.round(clamp(get("initialInfectious"), 0, population, d.initialInfectious)),
    transmissionRate: clamp(get("transmissionRate"), 0.01, 2, d.transmissionRate),
    interventionCoverage: clamp(get("interventionCoverage"), 0, 0.95, d.interventionCoverage),
    interventionStartWeek: Math.round(clamp(get("interventionStartWeek"), 0, 104, d.interventionStartWeek)),
    horizonWeeks: Math.round(clamp(get("horizonWeeks"), 4, 104, d.horizonWeeks)),
    model: get("model") === "vector" ? "vector" : "seir",
    seasonal: get("seasonal") === true,
    rainfall:
      Array.isArray(rain) && rain.length === 12 && rain.every((x) => typeof x === "number" && Number.isFinite(x) && x >= 0)
        ? (rain as number[])
        : d.rainfall,
    rainfallSensitivity: clamp(get("rainfallSensitivity"), 0, 5, d.rainfallSensitivity),
    startMonth: Math.round(clamp(get("startMonth"), 1, 12, d.startMonth)),
    incubationDays: clamp(get("incubationDays"), 1, 60, d.incubationDays),
    infectiousDays: clamp(get("infectiousDays"), 1, 120, d.infectiousDays),
    vaccineProtected: clamp(get("vaccineProtected"), 0, 0.95, d.vaccineProtected),
    uncertainty: get("uncertainty") === true,
    capacityPerWeek: Math.round(clamp(get("capacityPerWeek"), 0, 10_000_000, d.capacityPerWeek)),
    countyId: typeof get("countyId") === "number" ? (get("countyId") as number) : null,
    countyName: typeof get("countyName") === "string" ? (get("countyName") as string).slice(0, 60) : null,
  };
}

/** Weeks where new cases exceed weekly capacity, as [first, last] runs.
 * Week 0 is skipped: the simulator reports the starting infections there,
 * not a week's new cases. */
export function overCapacity(newCases: number[], capacity: number): { from: number; to: number }[] {
  if (!capacity) return [];
  const runs: { from: number; to: number }[] = [];
  newCases.forEach((n, week) => {
    if (week === 0 || n <= capacity) return;
    const last = runs[runs.length - 1];
    if (last && last.to === week - 1) last.to = week;
    else runs.push({ from: week, to: week });
  });
  return runs;
}

// --- Reproduction number ----------------------------------------------------
// Mirrors ml_service/app/simulation.py (_seasonal_multipliers and
// _reproduction_numbers) so the R banner responds instantly while a slider
// is dragged, before the debounced /simulate call returns.

const RAINFALL_SCALE_MM = 40;

/** Per-calendar-month transmission multipliers (index 0 = January), mean 1;
 * each month is driven by the previous month's rainfall. */
export function seasonalMultipliers(rainfall: number[], sensitivity: number): number[] {
  const raw = rainfall.map((_, m) => 1 + sensitivity * Math.log1p(Math.max(rainfall[(m + 11) % 12], 0) / RAINFALL_SCALE_MM));
  const mean = raw.reduce((a, b) => a + b, 0) / 12;
  return raw.map((r) => r / mean);
}

export function reproductionNumbers(p: OutbreakParams): { before: number; after: number } {
  const season = p.seasonal ? seasonalMultipliers(p.rainfall, p.rainfallSensitivity)[p.startMonth - 1] : 1;
  const before = p.transmissionRate * season * p.infectiousDays * (1 - p.vaccineProtected);
  return { before, after: before * (1 - p.interventionCoverage) ** (p.model === "vector" ? 2 : 1) };
}
