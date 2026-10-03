import { describe, expect, it } from "vitest";

import { completionBatch, deliveryBatches } from "./deliveryBatches";

const alloc = [
  { code: "LOW", name: "Low", doses: 30, risk: 0.2 },
  { code: "HIGH", name: "High", doses: 50, risk: 0.9 },
  { code: "MID", name: "Mid", doses: 20, risk: 0.5 },
  { code: "NONE", name: "None", doses: 0, risk: 0.99 },
];

describe("deliveryBatches", () => {
  it("ships the highest-risk county first, in equal batches", () => {
    const batches = deliveryBatches(alloc, 2);
    expect(batches.map((b) => b.total)).toEqual([50, 50]);
    expect(batches[0].items).toEqual([{ code: "HIGH", name: "High", doses: 50 }]);
    expect(batches[1].items.map((i) => i.code)).toEqual(["MID", "LOW"]);
  });

  it("splits a county across batches when it doesn't fit, and loses no doses", () => {
    const batches = deliveryBatches(alloc, 3);
    expect(batches.reduce((n, b) => n + b.total, 0)).toBe(100);
    expect(batches[0].items).toEqual([{ code: "HIGH", name: "High", doses: 34 }]);
    expect(batches[1].items[0]).toEqual({ code: "HIGH", name: "High", doses: 16 });
    expect(completionBatch(batches).get("HIGH")).toBe(1);
    expect(completionBatch(batches).get("LOW")).toBe(2);
  });

  it("skips unfunded counties and handles empty or single-batch input", () => {
    expect(deliveryBatches([], 3)).toEqual([]);
    const one = deliveryBatches(alloc, 1);
    expect(one).toHaveLength(1);
    expect(one[0].items.map((i) => i.code)).toEqual(["HIGH", "MID", "LOW"]);
  });
});
