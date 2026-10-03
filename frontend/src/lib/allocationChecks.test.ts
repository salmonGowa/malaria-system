import { describe, expect, it } from "vitest";

import type { County, ForecastRun } from "../api/client";
import { dataChecks, diffAgainst, placeableDoses } from "./allocationChecks";
import type { AllocationRun } from "./allocationRuns";

const county = (id: number, name: string, population: number | null) => ({ id, name, code: `KEN-${id}`, population }) as County;
const forecast = (county: number, generated_at: string) => ({ county, generated_at, risk_score: 0.5 }) as ForecastRun;
const now = new Date("2026-10-03T12:00:00Z");

describe("dataChecks", () => {
  const counties = [county(1, "Kisumu", 1_200_000), county(2, "Machakos", 45_670), county(3, "Kitui", null), county(4, "Busia", 900_000)];
  const forecasts = new Map([
    [1, forecast(1, "2026-10-01T00:00:00Z")],
    [2, forecast(2, "2026-07-01T00:00:00Z")],
    [3, forecast(3, "2026-10-01T00:00:00Z")],
  ]);

  it("flags missing forecasts and populations as blocking, odd figures as warnings", () => {
    const checks = dataChecks(counties, new Set([1, 2, 3, 4]), forecasts, now);
    expect(checks.map((c) => [c.county.name, c.kind, c.severity])).toEqual([
      ["Busia", "noForecast", "block"],
      ["Kitui", "noPopulation", "block"],
      ["Machakos", "staleForecast", "warn"],
      ["Machakos", "smallPopulation", "warn"],
    ]);
  });

  it("ignores counties that aren't selected, and passes clean ones", () => {
    expect(dataChecks(counties, new Set([1]), forecasts, now)).toEqual([]);
  });
});

describe("diffAgainst", () => {
  const previous = {
    lines: [
      { county_name: "Kisumu", recommended_doses: 30_000 },
      { county_name: "Kilifi", recommended_doses: 20_000 },
      { county_name: "Busia", recommended_doses: 0 },
    ],
  } as AllocationRun;

  it("lists each county's change, biggest first, skipping zero-to-zero", () => {
    const rows = diffAgainst(previous, new Map([["Kisumu", 25_000], ["Kilifi", 20_000], ["Siaya", 5_000], ["Busia", 0]]));
    expect(rows).toEqual([
      { name: "Kisumu", before: 30_000, after: 25_000, delta: -5_000 },
      { name: "Siaya", before: 0, after: 5_000, delta: 5_000 },
      { name: "Kilifi", before: 20_000, after: 20_000, delta: 0 },
    ]);
  });
});

describe("placeableDoses", () => {
  it("is limited by both the per-county cap and each population", () => {
    expect(placeableDoses([1_000_000, 1_000_000], 40, 100_000)).toBe(80_000);
    expect(placeableDoses([10_000, 1_000_000], 100, 100_000)).toBe(110_000);
    expect(placeableDoses([5_000, 0], 100, 100_000)).toBe(5_000);
  });
});
