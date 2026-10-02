import { describe, expect, it } from "vitest";

import { priorityBadgeClass } from "./badgeClasses";

describe("priorityBadgeClass", () => {
  it("applies the high-risk tone", () => {
    const cls = priorityBadgeClass("high");
    expect(cls).toContain("text-risk-high");
    expect(cls).toContain("bg-risk-high-soft");
  });

  it("applies the no-data tone", () => {
    const cls = priorityBadgeClass("no-data");
    expect(cls).toContain("text-muted");
    expect(cls).toContain("bg-panel-muted");
  });

  it("always includes the shared pill shape", () => {
    expect(priorityBadgeClass("low")).toContain("rounded-full");
  });
});
