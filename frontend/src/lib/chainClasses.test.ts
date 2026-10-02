import { describe, expect, it } from "vitest";

import { chainDetailClass, chainLinkClass, chainStatusClass } from "./chainClasses";

describe("chainStatusClass", () => {
  it("uses the low-risk tone when valid", () => {
    expect(chainStatusClass(true)).toContain("text-risk-low");
  });
  it("uses the high-risk tone when broken", () => {
    expect(chainStatusClass(false)).toContain("text-risk-high");
  });
});

describe("chainLinkClass", () => {
  it("applies the selected ring", () => {
    expect(chainLinkClass({ valid: true, selected: true })).toContain("border-accent");
  });
  it("omits the ring when not selected", () => {
    expect(chainLinkClass({ valid: true })).not.toContain("border-accent");
  });
  it("switches to the demo field layout", () => {
    const cls = chainLinkClass({ valid: true, demo: true });
    expect(cls).toContain("flex-col");
    expect(cls).toContain("cursor-default");
  });
});

describe("chainDetailClass", () => {
  it("colors the left border by validity", () => {
    expect(chainDetailClass(true)).toContain("border-l-risk-low");
    expect(chainDetailClass(false)).toContain("border-l-risk-high");
  });
});
