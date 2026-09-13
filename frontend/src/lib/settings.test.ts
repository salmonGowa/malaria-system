import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_THRESHOLDS, loadThresholds, resetThresholds, saveThresholds, subscribeToThresholds } from "./settings";

beforeEach(() => {
  localStorage.clear();
});

describe("loadThresholds", () => {
  it("returns the defaults when nothing has been saved", () => {
    expect(loadThresholds()).toEqual(DEFAULT_THRESHOLDS);
  });

  it("returns saved values after saveThresholds", () => {
    const custom = { ...DEFAULT_THRESHOLDS, riskHigh: 0.8, staleForecastDays: 14 };
    saveThresholds(custom);
    expect(loadThresholds()).toEqual(custom);
  });

  it("falls back to defaults for a corrupted stored value rather than throwing", () => {
    localStorage.setItem("malaria-system:decision-thresholds", "{not valid json");
    expect(loadThresholds()).toEqual(DEFAULT_THRESHOLDS);
  });

  it("fills in missing/non-numeric fields from a partial or malformed stored object", () => {
    localStorage.setItem(
      "malaria-system:decision-thresholds",
      JSON.stringify({ riskHigh: 0.9, staleForecastDays: "not a number" }),
    );
    expect(loadThresholds()).toEqual({
      ...DEFAULT_THRESHOLDS,
      riskHigh: 0.9,
    });
  });
});

describe("resetThresholds", () => {
  it("clears a saved value back to defaults", () => {
    saveThresholds({ ...DEFAULT_THRESHOLDS, riskHigh: 0.9 });
    resetThresholds();
    expect(loadThresholds()).toEqual(DEFAULT_THRESHOLDS);
  });
});

describe("subscribeToThresholds", () => {
  it("notifies on saveThresholds and resetThresholds in the same tab", () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeToThresholds(onChange);

    saveThresholds({ ...DEFAULT_THRESHOLDS, riskHigh: 0.5 });
    expect(onChange).toHaveBeenCalledTimes(1);

    resetThresholds();
    expect(onChange).toHaveBeenCalledTimes(2);

    unsubscribe();
    saveThresholds({ ...DEFAULT_THRESHOLDS, riskHigh: 0.9 });
    expect(onChange).toHaveBeenCalledTimes(2); // not called again after unsubscribing
  });
});
