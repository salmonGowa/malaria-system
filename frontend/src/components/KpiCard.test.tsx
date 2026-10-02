import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import KpiCard, { kpiCardClass } from "./KpiCard";

describe("KpiCard", () => {
  it("renders label, value, and hint", () => {
    render(<KpiCard label="Doses allocated" value="1,200" hint="36 runs" />);
    expect(screen.getByText("Doses allocated")).toBeInTheDocument();
    expect(screen.getByText("1,200")).toBeInTheDocument();
    expect(screen.getByText("36 runs")).toBeInTheDocument();
  });

  it("omits the hint when not given", () => {
    render(<KpiCard label="Doses allocated" value="1,200" />);
    expect(screen.queryByText("36 runs")).not.toBeInTheDocument();
  });

  it("applies the tone's border color", () => {
    expect(kpiCardClass("high")).toContain("border-l-risk-high");
    expect(kpiCardClass()).toContain("border-l-muted");
  });
});
