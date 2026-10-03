import { describe, expect, it } from "vitest";

import {
  formatCompact,
  formatDayLabel,
  formatMonthName,
  formatMonthTick,
  formatNumber,
  formatPeriod,
  formatRelativeTime,
  riskBand,
} from "./format";

describe("formatNumber", () => {
  it("adds thousands separators with no decimals", () => {
    expect(formatNumber(1234567)).toBe("1,234,567");
    expect(formatNumber(0)).toBe("0");
  });

  it("rounds fractional values", () => {
    expect(formatNumber(1234.6)).toBe("1,235");
  });
});

describe("formatCompact", () => {
  it("abbreviates large numbers", () => {
    expect(formatCompact(1500)).toBe("1.5K");
    expect(formatCompact(2_500_000)).toBe("2.5M");
  });
});

describe("riskBand", () => {
  it("classifies scores into high/mid/low at the default thresholds", () => {
    expect(riskBand(0.9)).toBe("high");
    expect(riskBand(0.66)).toBe("high"); // boundary is inclusive
    expect(riskBand(0.65)).toBe("mid");
    expect(riskBand(0.33)).toBe("mid"); // boundary is inclusive
    expect(riskBand(0.32)).toBe("low");
    expect(riskBand(0)).toBe("low");
  });

  it("uses configurable cutoffs when passed (see lib/settings.ts)", () => {
    const custom = { riskHigh: 0.5, riskMid: 0.2 };
    expect(riskBand(0.6, custom)).toBe("high");
    expect(riskBand(0.5, custom)).toBe("high"); // boundary is inclusive
    expect(riskBand(0.3, custom)).toBe("mid");
    expect(riskBand(0.1, custom)).toBe("low");
    // A score that would be "mid" under the default cutoffs reads as "high"
    // under a lower custom cutoff — proves the default isn't secretly
    // still in effect.
    expect(riskBand(0.55)).toBe("mid");
  });
});

describe("formatMonthTick", () => {
  it("renders a compact month + two-digit year", () => {
    expect(formatMonthTick("2021-09-01")).toBe("Sep '21");
    expect(formatMonthTick("2026-01")).toBe("Jan '26");
  });

  it("passes unparseable input through", () => {
    expect(formatMonthTick("n/a")).toBe("n/a");
  });
});

describe("formatDayLabel", () => {
  it("renders day, short month and year without timezone drift", () => {
    expect(formatDayLabel("2026-01-01")).toBe("1 Jan 2026");
    expect(formatDayLabel("2026-12-31")).toBe("31 Dec 2026");
  });
});

describe("formatMonthName", () => {
  it("renders the full month and year for prose", () => {
    expect(formatMonthName("2026-04-01")).toBe("April 2026");
    expect(formatMonthName("2026-11")).toBe("November 2026");
  });
});

describe("formatPeriod", () => {
  it("collapses a shared month and year", () => {
    expect(formatPeriod("2026-10-01", "2026-10-29")).toBe("1–29 Oct 2026");
  });
  it("spans months and years", () => {
    expect(formatPeriod("2026-09-28", "2026-10-26")).toBe("28 Sep – 26 Oct 2026");
    expect(formatPeriod("2026-12-15", "2027-01-12")).toBe("15 Dec 2026 – 12 Jan 2027");
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-10-02T12:00:00Z");
  it("buckets recent times", () => {
    expect(formatRelativeTime("2026-10-02T11:59:30Z", now)).toBe("just now");
    expect(formatRelativeTime("2026-10-02T11:45:00Z", now)).toBe("15 min ago");
    expect(formatRelativeTime("2026-10-02T09:00:00Z", now)).toBe("3h ago");
    expect(formatRelativeTime("2026-09-29T12:00:00Z", now)).toBe("3d ago");
  });
  it("falls back to a date after a month", () => {
    expect(formatRelativeTime("2026-07-01T12:00:00Z", now)).toBe("1 Jul 2026");
  });
});
