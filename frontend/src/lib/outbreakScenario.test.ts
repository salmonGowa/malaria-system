import { describe, expect, it } from "vitest";

import {
  decodeScenario,
  encodeScenario,
  OUTBREAK_DEFAULTS,
  overCapacity,
  reproductionNumbers,
  seasonalMultipliers,
  toRequest,
} from "./outbreakScenario";

describe("toRequest", () => {
  it("sends no rainfall pattern when seasons are off", () => {
    expect(toRequest(OUTBREAK_DEFAULTS).seasonal_rainfall_mm).toBeNull();
    expect(toRequest({ ...OUTBREAK_DEFAULTS, seasonal: true }).seasonal_rainfall_mm).toHaveLength(12);
  });

  it("keeps the start week and initial infections within range", () => {
    const r = toRequest({ ...OUTBREAK_DEFAULTS, interventionStartWeek: 99, horizonWeeks: 12, initialInfectious: 10_000, population: 500 });
    expect(r.intervention_start_week).toBe(12);
    expect(r.initial_infectious).toBe(500);
  });
});

describe("share links", () => {
  it("round-trip a scenario", () => {
    const p = { ...OUTBREAK_DEFAULTS, transmissionRate: 0.55, model: "vector" as const, seasonal: true, countyId: 3, countyName: "Kisumu" };
    expect(decodeScenario(encodeScenario(p))).toEqual(p);
  });

  it("encode only what differs from the defaults", () => {
    expect(encodeScenario(OUTBREAK_DEFAULTS)).toBe(btoa("{}").replace(/=+$/, ""));
  });

  it("clamp out-of-range values from an untrusted link", () => {
    const code = btoa(JSON.stringify({ p: -5, c: 3, h: 1000, m: "rocket", r: [1, 2] })).replace(/=+$/, "");
    const p = decodeScenario(code)!;
    expect(p.population).toBe(1);
    expect(p.interventionCoverage).toBe(0.95);
    expect(p.horizonWeeks).toBe(104);
    expect(p.model).toBe("seir");
    expect(p.rainfall).toEqual(OUTBREAK_DEFAULTS.rainfall);
  });

  it("return null for a malformed code instead of throwing", () => {
    expect(decodeScenario("%%%not-base64")).toBeNull();
    expect(decodeScenario(null)).toBeNull();
  });
});

describe("overCapacity", () => {
  it("finds consecutive runs of weeks above capacity", () => {
    expect(overCapacity([0, 5, 12, 15, 9, 20, 3], 10)).toEqual([
      { from: 2, to: 3 },
      { from: 5, to: 5 },
    ]);
    expect(overCapacity([50, 60], 0)).toEqual([]);
  });

  it("ignores week 0, which holds the starting infections", () => {
    expect(overCapacity([500, 5, 50], 10)).toEqual([{ from: 2, to: 2 }]);
  });
});

describe("reproductionNumbers", () => {
  it("matches the backend: beta x infectious days, cut by coverage", () => {
    const { before, after } = reproductionNumbers(OUTBREAK_DEFAULTS);
    expect(before).toBeCloseTo(0.35 * 14);
    expect(after).toBeCloseTo(0.35 * 14 * 0.7);
  });

  it("squares the coverage cut in the mosquito model", () => {
    expect(reproductionNumbers({ ...OUTBREAK_DEFAULTS, model: "vector" }).after).toBeCloseTo(0.35 * 14 * 0.49);
  });

  it("scales by the starting month's season, averaging 1 over the year", () => {
    const m = seasonalMultipliers(OUTBREAK_DEFAULTS.rainfall, 1);
    expect(m.reduce((a, b) => a + b, 0) / 12).toBeCloseTo(1);
    // May follows April, the wettest month, so it has the highest multiplier.
    expect(m.indexOf(Math.max(...m))).toBe(4);
    const may = reproductionNumbers({ ...OUTBREAK_DEFAULTS, seasonal: true, startMonth: 5 }).before;
    expect(may).toBeCloseTo(0.35 * 14 * m[4]);
  });
});
