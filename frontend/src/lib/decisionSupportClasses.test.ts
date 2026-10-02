import { describe, expect, it } from "vitest";

import { recCardClass, recSummaryChipClass, recSummaryCountClass, trendBadgeClass } from "./decisionSupportClasses";

describe("recCardClass", () => {
  it("colors the top accent by tone", () => {
    expect(recCardClass("high")).toContain("border-t-risk-high");
    expect(recCardClass("no-data")).toContain("border-t-muted");
  });
});

describe("recSummaryChipClass / recSummaryCountClass", () => {
  it("colors the chip's left border and the count text by the same tone", () => {
    expect(recSummaryChipClass("mid")).toContain("border-l-risk-mid");
    expect(recSummaryCountClass("mid")).toContain("text-risk-mid");
  });
});

describe("trendBadgeClass", () => {
  it("maps caution/good/neutral to distinct risk colors", () => {
    expect(trendBadgeClass("caution")).toContain("text-risk-mid");
    expect(trendBadgeClass("good")).toContain("text-risk-low");
    expect(trendBadgeClass("neutral")).toContain("text-muted");
  });
});
