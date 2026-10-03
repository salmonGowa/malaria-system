import { describe, expect, it } from "vitest";

import { previewCaseCsv } from "./csvPreview";

const months = (n: number) =>
  Array.from({ length: n }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}-01,${(i + 1) * 100},${i * 10}`).join("\n");

describe("previewCaseCsv", () => {
  it("parses a valid file, case-insensitive headers, with rainfall", () => {
    const p = previewCaseCsv(`Date,Confirmed_Cases,rainfall_mm\n${months(6)}\n`);
    expect(p.errors).toEqual([]);
    expect(p.rows).toHaveLength(6);
    expect(p.rows[0]).toEqual({ date: "2026-01-01", cases: 100, rainfall: 0 });
    expect(p.hasRainfall).toBe(true);
  });

  it("accepts YYYY-MM dates, quoted thousands and no rainfall column", () => {
    const body = Array.from({ length: 6 }, (_, i) => `2026-0${i + 1},"1,${i}00"`).join("\n");
    const p = previewCaseCsv(`date,confirmed_cases\n${body}`);
    expect(p.errors).toEqual([]);
    expect(p.rows[2].cases).toBe(1200);
    expect(p.hasRainfall).toBe(false);
  });

  it("names the missing column and what it found instead", () => {
    const p = previewCaseCsv("month,cases\n2026-01,5");
    expect(p.errors[0]).toContain('"date" and "confirmed_cases"');
    expect(p.errors[0]).toContain('"month", "cases"');
  });

  it("reports bad rows by line number, capped at three", () => {
    const p = previewCaseCsv("date,confirmed_cases\nJan 2026,5\n2026-02,-1\n2026-03,abc\n2026-04,x\n");
    expect(p.errors).toEqual([
      'Line 2: "Jan 2026" isn\'t a date — use YYYY-MM-DD or YYYY-MM.',
      "Line 3: confirmed_cases can't be negative.",
      'Line 4: confirmed_cases "abc" isn\'t a number.',
    ]);
  });

  it("requires the minimum number of rows", () => {
    expect(previewCaseCsv(`date,confirmed_cases,rainfall_mm\n${months(4)}`).errors[0]).toContain("at least 6");
  });

  it("flags an empty file", () => {
    expect(previewCaseCsv("\n\n").errors).toEqual(["The file is empty."]);
  });
});
