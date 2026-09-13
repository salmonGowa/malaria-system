import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { County } from "../api/client";
import CountyPicker from "./CountyPicker";

const counties: County[] = [
  { id: 1, name: "Kisumu", code: "KEN-042", is_endemic_focus: true, population: 610000, boundary: null },
  { id: 2, name: "Siaya", code: "KEN-041", is_endemic_focus: true, population: 950000, boundary: null },
];

describe("CountyPicker", () => {
  it("shows a checked box for each selected county", () => {
    render(<CountyPicker counties={counties} selected={new Set([1])} onChange={vi.fn()} />);
    expect(screen.getByLabelText("Kisumu")).toBeChecked();
    expect(screen.getByLabelText("Siaya")).not.toBeChecked();
  });

  it("toggling one county adds it to the selection without disturbing the rest", () => {
    const onChange = vi.fn();
    render(<CountyPicker counties={counties} selected={new Set([1])} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Siaya"));
    expect(onChange).toHaveBeenCalledWith(new Set([1, 2]));
  });

  it("unchecking a selected county removes just that one", () => {
    const onChange = vi.fn();
    render(<CountyPicker counties={counties} selected={new Set([1, 2])} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Kisumu"));
    expect(onChange).toHaveBeenCalledWith(new Set([2]));
  });

  it("'All counties' selects everything when none are selected, clears when all are", () => {
    const onChange = vi.fn();
    const { rerender } = render(<CountyPicker counties={counties} selected={new Set()} onChange={onChange} />);
    fireEvent.click(screen.getByText(/All counties/));
    expect(onChange).toHaveBeenCalledWith(new Set([1, 2]));

    rerender(<CountyPicker counties={counties} selected={new Set([1, 2])} onChange={onChange} />);
    fireEvent.click(screen.getByText(/All counties/));
    expect(onChange).toHaveBeenCalledWith(new Set());
  });

  it("shows the selected/total count", () => {
    render(<CountyPicker counties={counties} selected={new Set([1])} onChange={vi.fn()} />);
    expect(screen.getByText("All counties (1/2)")).toBeInTheDocument();
  });
});
