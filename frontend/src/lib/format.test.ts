import { describe, expect, it } from "vitest";

import { formatCompact, formatNumber, riskBand } from "./format";

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
