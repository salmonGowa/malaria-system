import { describe, expect, it } from "vitest";

import { btnClass, iconButtonClass } from "./buttonClasses";

describe("btnClass", () => {
  it("defaults to the secondary variant", () => {
    expect(btnClass()).toContain("bg-panel-muted");
  });

  it("includes the base layout/interaction classes every button needs", () => {
    const cls = btnClass("primary");
    expect(cls).toContain("inline-flex");
    expect(cls).toContain("rounded-lg");
    expect(cls).toContain("disabled:cursor-not-allowed");
  });

  it("applies each variant's distinct colors", () => {
    expect(btnClass("primary")).toContain("bg-accent");
    expect(btnClass("secondary")).toContain("bg-panel-muted");
    expect(btnClass("danger-ghost")).toContain("text-risk-high");
  });

  it("swaps in smaller padding/text for sm", () => {
    const cls = btnClass("secondary", { sm: true });
    expect(cls).toContain("px-3");
    expect(cls).toContain("text-xs");
    expect(cls).not.toContain("px-4");
  });

  it("adds w-full for block", () => {
    expect(btnClass("primary", { block: true })).toContain("w-full");
    expect(btnClass("primary")).not.toContain("w-full");
  });

  it("appends an extra className when given", () => {
    expect(btnClass("primary", { className: "mt-4" })).toContain("mt-4");
  });

  it("combines sm, block, and an extra className together", () => {
    const cls = btnClass("primary", { sm: true, block: true, className: "mt-2" });
    expect(cls).toContain("px-3");
    expect(cls).toContain("w-full");
    expect(cls).toContain("mt-2");
  });
});

describe("iconButtonClass", () => {
  it("returns the fixed square icon-button classes", () => {
    const cls = iconButtonClass();
    expect(cls).toContain("w-[30px]");
    expect(cls).toContain("h-[30px]");
    expect(cls).toContain("hover:text-text");
  });

  it("appends extra classes when given", () => {
    expect(iconButtonClass("ml-2")).toContain("ml-2");
  });
});
