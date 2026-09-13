import { describe, expect, it } from "vitest";

import type { CaseReport, ClimateObservation, ForecastRun, HistoricalCaseData, VaccineAllocation } from "../api/client";
import {
  allocationByCounty,
  caseTrend,
  forecastAccuracy,
  historicalCaseTrend,
  historicalRainfallTrend,
  latestForecastByCounty,
  seasonalClimatology,
} from "./analytics";

function report(overrides: Partial<CaseReport>): CaseReport {
  return {
    id: 1,
    county: 1,
    county_name: "Kisumu",
    facility: 1,
    facility_name: "Test Facility",
    report_date: "2026-01-01",
    confirmed_cases: 10,
    suspected_cases: 2,
    deaths: 0,
    reported_by: 1,
    reported_by_username: "tester",
    supersedes: null,
    superseded_by_id: null,
    created_at: "2026-01-01T00:00:00Z",
    previous_hash: "",
    record_hash: "abc",
    ...overrides,
  };
}

function forecast(overrides: Partial<ForecastRun>): ForecastRun {
  return {
    id: 1,
    county: 1,
    county_name: "Kisumu",
    forecast_period_start: "2026-01-01",
    forecast_period_end: "2026-01-29",
    predicted_cases: 100,
    risk_score: 0.5,
    model_name: "test",
    model_version: "1",
    generated_at: "2026-01-01T00:00:00Z",
    generated_by_username: null,
    ...overrides,
  };
}

describe("caseTrend", () => {
  it("sums confirmed/suspected across counties, chronologically", () => {
    const rows = [
      report({ report_date: "2026-01-02", confirmed_cases: 5, suspected_cases: 1, county: 2 }),
      report({ report_date: "2026-01-01", confirmed_cases: 10, suspected_cases: 2, county: 1 }),
      report({ report_date: "2026-01-01", confirmed_cases: 3, suspected_cases: 1, county: 2 }),
    ];
    const trend = caseTrend(rows);
    expect(trend).toEqual([
      { date: "2026-01-01", confirmed: 13, suspected: 3 },
      { date: "2026-01-02", confirmed: 5, suspected: 1 },
    ]);
  });
});

describe("historicalCaseTrend", () => {
  it("sums confirmed_cases by month across counties", () => {
    const rows: HistoricalCaseData[] = [
      { id: 1, county: 1, county_name: "A", period_start: "2026-01-01", confirmed_cases: 100, source: "synthetic_v1" },
      { id: 2, county: 2, county_name: "B", period_start: "2026-01-01", confirmed_cases: 50, source: "synthetic_v1" },
    ];
    expect(historicalCaseTrend(rows)).toEqual([{ month: "2026-01-01", cases: 150 }]);
  });
});

describe("historicalRainfallTrend", () => {
  it("averages rainfall_mm by month, skipping nulls", () => {
    const rows: ClimateObservation[] = [
      { id: 1, county: 1, observation_date: "2026-01-01", rainfall_mm: 100, temperature_c: null, humidity_pct: null, source: "CHIRPS" },
      { id: 2, county: 2, observation_date: "2026-01-01", rainfall_mm: 50, temperature_c: null, humidity_pct: null, source: "CHIRPS" },
      { id: 3, county: 3, observation_date: "2026-01-01", rainfall_mm: null, temperature_c: null, humidity_pct: null, source: "CHIRPS" },
    ];
    expect(historicalRainfallTrend(rows)).toEqual([{ month: "2026-01-01", rainfall: 75 }]);
  });
});

describe("seasonalClimatology", () => {
  it("averages by calendar month regardless of year, indexed Jan..Dec", () => {
    const rows: ClimateObservation[] = [
      { id: 1, county: 1, observation_date: "2021-03-01", rainfall_mm: 100, temperature_c: null, humidity_pct: null, source: "CHIRPS" },
      { id: 2, county: 1, observation_date: "2024-03-01", rainfall_mm: 200, temperature_c: null, humidity_pct: null, source: "CHIRPS" },
    ];
    const result = seasonalClimatology(rows);
    expect(result).toHaveLength(12);
    expect(result[2]).toEqual({ monthLabel: "Mar", rainfall: 150 }); // index 2 = March
    expect(result[0]).toEqual({ monthLabel: "Jan", rainfall: 0 }); // no data -> 0, not NaN
  });
});

describe("allocationByCounty", () => {
  it("sums doses per county and sorts descending", () => {
    const allocations: VaccineAllocation[] = [
      { id: 1, county: 1, county_name: "Low", period_start: "2026-01-01", period_end: "2026-01-29", recommended_doses: 100, based_on_forecast: null, rationale: "", generated_at: "", generated_by_username: null },
      { id: 2, county: 2, county_name: "High", period_start: "2026-01-01", period_end: "2026-01-29", recommended_doses: 500, based_on_forecast: null, rationale: "", generated_at: "", generated_by_username: null },
      { id: 3, county: 1, county_name: "Low", period_start: "2026-02-01", period_end: "2026-02-29", recommended_doses: 50, based_on_forecast: null, rationale: "", generated_at: "", generated_by_username: null },
    ];
    expect(allocationByCounty(allocations)).toEqual([
      { name: "High", doses: 500 },
      { name: "Low", doses: 150 },
    ]);
  });
});

describe("latestForecastByCounty", () => {
  it("picks the most recently generated forecast per county", () => {
    const older = forecast({ id: 1, county: 1, generated_at: "2026-01-01T00:00:00Z", risk_score: 0.2 });
    const newer = forecast({ id: 2, county: 1, generated_at: "2026-02-01T00:00:00Z", risk_score: 0.8 });
    const result = latestForecastByCounty([older, newer]);
    expect(result.get(1)?.id).toBe(2);
    expect(result.get(1)?.risk_score).toBe(0.8);
  });
});

describe("forecastAccuracy", () => {
  it("pairs a forecast with the actual historical figure for the same county+month", () => {
    const forecasts = [forecast({ county: 1, county_name: "Kisumu", forecast_period_start: "2026-01-01", predicted_cases: 120 })];
    const historical: HistoricalCaseData[] = [
      { id: 1, county: 1, county_name: "Kisumu", period_start: "2026-01-01", confirmed_cases: 100, source: "synthetic_v1" },
    ];
    expect(forecastAccuracy(forecasts, historical)).toEqual([{ period: "Kisumu 2026-01-01", predicted: 120, actual: 100 }]);
  });

  it("drops forecasts with no matching historical month rather than zero-filling", () => {
    const forecasts = [forecast({ county: 1, forecast_period_start: "2099-01-01" })];
    expect(forecastAccuracy(forecasts, [])).toEqual([]);
  });
});
