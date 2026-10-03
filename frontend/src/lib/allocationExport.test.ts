import { describe, expect, it } from "vitest";

import { exportRows, summaryHtml, type ExportMeta } from "./allocationExport";
import { deliveryBatches } from "./deliveryBatches";

const lines = [
  { county: "Kisumu", code: "K1", population: 1_000_000, risk: 0.8, doses: 6000, rationale: "high" },
  { county: "Siaya <b>", code: "K2", population: 500_000, risk: 0.4, doses: 4000, rationale: "lower" },
  { county: "Busia", code: "K3", population: null, risk: null, doses: 0, rationale: "none" },
];
const meta: ExportMeta = {
  periodStart: "2026-10-03",
  periodEnd: "2026-10-31",
  supply: 10_000,
  capPct: 60,
  floor: 0,
  runBy: "e2e_test",
  generatedAt: "2026-10-03T10:00:00Z",
  intervalWeeks: 2,
};
const batches = deliveryBatches(
  lines.map((l) => ({ code: l.code, name: l.county, doses: l.doses, risk: l.risk ?? 0 })),
  2,
);

describe("exportRows", () => {
  it("adds share, coverage and when each county's doses arrive", () => {
    const rows = exportRows(lines, batches, meta);
    expect(rows[0]).toMatchObject({ county: "Kisumu", share_pct: 60, coverage_pct: 0.6, delivered_in_batch: 2, delivered_by_week: 2 });
    expect(rows[1]).toMatchObject({ county: "Siaya <b>", delivered_in_batch: 2 });
    expect(rows[2]).toMatchObject({ county: "Busia", coverage_pct: "", delivered_in_batch: "" });
  });
});

describe("summaryHtml", () => {
  it("escapes county names and lists the schedule and unfunded counties", () => {
    const html = summaryHtml(lines, batches, meta);
    expect(html).toContain("Siaya &lt;b&gt;");
    expect(html).not.toContain("Siaya <b>");
    expect(html).toContain("No doses: Busia.");
    expect(html).toContain("Batch 2</strong> (week 2)");
    expect(html).toContain("at most 60% per county");
  });
});
