import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import Pagination from "./Pagination";

describe("Pagination", () => {
  it("renders nothing when count is 0", () => {
    const { container } = render(<Pagination page={1} pageSize={50} count={0} onPageChange={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the correct range summary", () => {
    render(<Pagination page={2} pageSize={50} count={120} onPageChange={vi.fn()} />);
    expect(screen.getByText("51–100 of 120")).toBeInTheDocument();
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
  });

  it("disables Previous on the first page and Next on the last page", () => {
    render(<Pagination page={1} pageSize={50} count={40} onPageChange={vi.fn()} />);
    expect(screen.getByText("Previous")).toBeDisabled();
    expect(screen.getByText("Next")).toBeDisabled(); // only 1 page total
  });

  it("calls onPageChange with the next/previous page number", () => {
    const onPageChange = vi.fn();
    render(<Pagination page={2} pageSize={50} count={200} onPageChange={onPageChange} />);
    fireEvent.click(screen.getByText("Next"));
    expect(onPageChange).toHaveBeenCalledWith(3);
    fireEvent.click(screen.getByText("Previous"));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });
});
