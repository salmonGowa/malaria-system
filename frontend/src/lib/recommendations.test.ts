import { describe, expect, it } from "vitest";

import type { County, ForecastRun, HistoricalCaseData, VaccineAllocation } from "../api/client";
import { buildCountyRecommendation, buildRecommendations } from "./recommendations";
import { DEFAULT_THRESHOLDS } from "./settings";

const NOW = new Date("2026-09-13T00:00:00Z");

function county(overrides: Partial<County> = {}): County {
  return { id: 1, name: "Kisumu", code: "KEN-042", is_endemic_focus: true, population: 610000, boundary: null, ...overrides };
}

function forecast(overrides: Partial<ForecastRun> = {}): ForecastRun {
  return {
    id: 1,
    county: 1,
    county_name: "Kisumu",
    forecast_period_start: "2026-09-01",
    forecast_period_end: "2026-09-29",
    predicted_cases: 100,
    risk_score: 0.8,
    model_name: "xgboost_v1",
    model_version: "1",
    generated_at: "2026-09-10T00:00:00Z", // 3 days before NOW
    generated_by_username: null,
    ...overrides,
  };
}

function allocation(overrides: Partial<VaccineAllocation> = {}): VaccineAllocation {
  return {
    id: 1,
    county: 1,
    county_name: "Kisumu",
    period_start: "2026-09-01",
    period_end: "2026-09-29",
    recommended_doses: 10000,
    based_on_forecast: 1,
    rationale: "",
    generated_at: "2026-09-10T00:00:00Z",
    generated_by_username: null,
    ...overrides,
  };
}

describe("buildCountyRecommendation", () => {
  it("recommends generating a forecast when none exists", () => {
    const rec = buildCountyRecommendation(county(), undefined, [], [], NOW);
    expect(rec.priority).toBe("no-data");
    expect(rec.hasForecast).toBe(false);
    expect(rec.actions[0]).toMatch(/generate a forecast/i);
  });

  it("flags a high-risk, zero-coverage county as urgent with a clear call to action", () => {
    const rec = buildCountyRecommendation(county(), forecast({ risk_score: 0.9 }), [], [], NOW);
    expect(rec.priority).toBe("high");
    expect(rec.hasAllocation).toBe(false);
    expect(rec.actions.some((a) => /run an allocation now/i.test(a))).toBe(true);
  });

  it("does not repeat the zero-coverage warning once a high-risk county has meaningful coverage", () => {
    const rec = buildCountyRecommendation(
      county({ population: 100000 }),
      forecast({ risk_score: 0.9 }),
      [allocation({ recommended_doses: 5000 })], // 5% coverage, above the 1% floor
      [],
      NOW,
    );
    expect(rec.priority).toBe("high");
    expect(rec.actions.some((a) => /run an allocation now/i.test(a))).toBe(false);
  });

  it("respects configurable thresholds (see lib/settings.ts) instead of hardcoded cutoffs", () => {
    // 0.5 reads as "mid" under the defaults, but "high" under a lower
    // custom riskHigh cutoff — proves the priority isn't still hardcoded.
    const withDefaults = buildCountyRecommendation(county(), forecast({ risk_score: 0.5 }), [], [], NOW);
    expect(withDefaults.priority).toBe("mid");

    const withCustom = buildCountyRecommendation(county(), forecast({ risk_score: 0.5 }), [], [], NOW, {
      ...DEFAULT_THRESHOLDS,
      riskHigh: 0.4,
    });
    expect(withCustom.priority).toBe("high");
  });

  it("respects a configurable stale-forecast threshold", () => {
    const rec = buildCountyRecommendation(
      county(),
      forecast({ generated_at: "2026-09-01T00:00:00Z" }), // 12 days before NOW
      [],
      [],
      NOW,
      { ...DEFAULT_THRESHOLDS, staleForecastDays: 5 },
    );
    expect(rec.forecastStale).toBe(true);
  });

  it("labels a mid-risk county as moderate, not urgent", () => {
    const rec = buildCountyRecommendation(county(), forecast({ risk_score: 0.5 }), [], [], NOW);
    expect(rec.priority).toBe("mid");
    expect(rec.actions[0]).toMatch(/moderate risk/i);
  });

  it("labels a low-risk county as routine monitoring", () => {
    const rec = buildCountyRecommendation(county(), forecast({ risk_score: 0.1 }), [], [], NOW);
    expect(rec.priority).toBe("low");
    expect(rec.actions[0]).toMatch(/low risk/i);
  });

  it("flags a stale forecast regardless of risk band", () => {
    const rec = buildCountyRecommendation(county(), forecast({ generated_at: "2026-07-01T00:00:00Z" }), [], [], NOW);
    expect(rec.forecastStale).toBe(true);
    expect(rec.actions.some((a) => /days old/i.test(a))).toBe(true);
  });

  it("does not flag a recent forecast as stale", () => {
    const rec = buildCountyRecommendation(county(), forecast({ generated_at: "2026-09-12T00:00:00Z" }), [], [], NOW);
    expect(rec.forecastStale).toBe(false);
  });

  it("surfaces a rising modelled trend as a labeled, non-alarmist note", () => {
    const historical: HistoricalCaseData[] = [
      { id: 1, county: 1, county_name: "Kisumu", period_start: "2026-07-01", confirmed_cases: 1000, source: "synthetic_v1" },
      { id: 2, county: 1, county_name: "Kisumu", period_start: "2026-08-01", confirmed_cases: 1500, source: "synthetic_v1" },
    ];
    const rec = buildCountyRecommendation(county(), forecast(), [], historical, NOW);
    expect(rec.trend).toBe("rising");
    expect(rec.actions.some((a) => /modelled case trend/i.test(a) && /not a confirmed field report/i.test(a))).toBe(true);
  });

  it("treats a small month-over-month change as stable, not a trend", () => {
    const historical: HistoricalCaseData[] = [
      { id: 1, county: 1, county_name: "Kisumu", period_start: "2026-07-01", confirmed_cases: 1000, source: "synthetic_v1" },
      { id: 2, county: 1, county_name: "Kisumu", period_start: "2026-08-01", confirmed_cases: 1030, source: "synthetic_v1" },
    ];
    const rec = buildCountyRecommendation(county(), forecast(), [], historical, NOW);
    expect(rec.trend).toBe("stable");
  });

  it("reports unknown trend with fewer than 2 historical points, not a false stable/rising reading", () => {
    const rec = buildCountyRecommendation(county(), forecast(), [], [], NOW);
    expect(rec.trend).toBe("unknown");
    expect(rec.trendChangePct).toBeNull();
  });
});

describe("buildRecommendations", () => {
  it("sorts high-risk and data-gap counties ahead of mid/low, highest risk first within a tier", () => {
    const counties = [
      county({ id: 1, name: "Low" }),
      county({ id: 2, name: "High-lower" }),
      county({ id: 3, name: "NoData" }),
      county({ id: 4, name: "High-higher" }),
      county({ id: 5, name: "Mid" }),
    ];
    const forecasts = [
      forecast({ id: 1, county: 1, risk_score: 0.1 }),
      forecast({ id: 2, county: 2, risk_score: 0.7 }),
      // county 3 (NoData) deliberately has no forecast
      forecast({ id: 4, county: 4, risk_score: 0.95 }),
      forecast({ id: 5, county: 5, risk_score: 0.5 }),
    ];

    const result = buildRecommendations(counties, forecasts, [], [], NOW);
    expect(result.map((r) => r.county.name)).toEqual(["High-higher", "High-lower", "NoData", "Mid", "Low"]);
  });

  it("only counts a county's own allocations toward its coverage, not another county's", () => {
    const counties = [county({ id: 1, name: "A", population: 100000 }), county({ id: 2, name: "B", population: 100000 })];
    const forecasts = [forecast({ id: 1, county: 1, risk_score: 0.9 }), forecast({ id: 2, county: 2, risk_score: 0.9 })];
    const allocations = [allocation({ id: 1, county: 1, recommended_doses: 50000 })]; // only county A

    const result = buildRecommendations(counties, forecasts, allocations, [], NOW);
    const a = result.find((r) => r.county.name === "A")!;
    const b = result.find((r) => r.county.name === "B")!;
    expect(a.dosesAllocated).toBe(50000);
    expect(b.dosesAllocated).toBe(0);
  });
});
