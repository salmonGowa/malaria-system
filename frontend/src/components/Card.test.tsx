import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Card from "./Card";

describe("Card", () => {
  it("renders its children", () => {
    render(<Card>hello</Card>);
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("includes the base panel styling", () => {
    render(<Card>content</Card>);
    const el = screen.getByText("content");
    expect(el.className).toContain("bg-panel");
    expect(el.className).toContain("rounded-xl");
  });

  it("appends an extra className when given", () => {
    render(<Card className="error-boundary-card">content</Card>);
    expect(screen.getByText("content").className).toContain("error-boundary-card");
  });
});
