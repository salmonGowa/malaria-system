import { describe, expect, it } from "vitest";

import type { VaccineAllocation } from "../api/client";
import { groupAllocationRuns, parseRationale } from "./allocationRuns";

let nextId = 1;
function row(overrides: Partial<VaccineAllocation>): VaccineAllocation {
  return {
    id: nextId++,
    county: 1,
    county_name: "Kisumu",
    period_start: "2026-10-02",
    period_end: "2026-10-30",
    recommended_doses: 0,
    based_on_forecast: null,
    rationale: "Risk score 0.21; allocation maximises risk-weighted coverage under the 50000-dose constraint, capped at the county's at-risk population.",
    generated_at: "2026-10-02T09:38:05.100Z",
    generated_by_username: "sal",
    ...overrides,
  };
}

describe("parseRationale", () => {
  it("reads risk, supply and an optional cap", () => {
    expect(
      parseRationale(
        "Risk score 0.46; allocation maximises risk-weighted coverage under the 50000-dose constraint, capped at the county's at-risk population and at 40% of total doses (20000).",
      ),
    ).toEqual({ risk: 0.46, supply: 50000, capPct: 40 });
  });

  it("returns nulls for unrecognised wording", () => {
    expect(parseRationale("manual adjustment")).toEqual({ risk: null, supply: null, capPct: null });
  });
});

describe("groupAllocationRuns", () => {
  it("groups rows written together and splits runs seconds apart", () => {
    const runs = groupAllocationRuns([
      row({ county_name: "Kisumu", recommended_doses: 100, generated_at: "2026-10-02T09:38:05.100Z" }),
      row({ county_name: "Busia", recommended_doses: 300, generated_at: "2026-10-02T09:38:05.180Z" }),
      row({ county_name: "Kisumu", recommended_doses: 50, generated_at: "2026-10-02T09:37:55.000Z" }),
    ]);
    expect(runs).toHaveLength(2);
    expect(runs[0].lines.map((l) => l.county_name)).toEqual(["Busia", "Kisumu"]); // doses desc
    expect(runs[0].totalAllocated).toBe(400);
    expect(runs[0].supply).toBe(50000);
    expect(runs[0].lines[0].risk).toBe(0.21);
    expect(runs[1].totalAllocated).toBe(50);
  });

  it("never merges different users or periods, even at the same instant", () => {
    const at = "2026-10-02T09:38:05.100Z";
    const runs = groupAllocationRuns([
      row({ generated_at: at, generated_by_username: "sal" }),
      row({ generated_at: at, generated_by_username: "e2e_test" }),
      row({ generated_at: at, generated_by_username: "sal", period_start: "2026-11-01" }),
    ]);
    expect(runs).toHaveLength(3);
  });
});
