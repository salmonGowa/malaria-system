import { describe, expect, it } from "vitest";

import type { UploadSimulationResponse } from "../api/client";
import { buildUploadInsights } from "./uploadInsights";
import { DEFAULT_THRESHOLDS } from "./settings";

function response(overrides: Partial<UploadSimulationResponse> = {}): UploadSimulationResponse {
  return {
    population: 500000,
    rows_used: 6,
    used_rainfall: true,
    fitted_params: { beta0: 0.5, k: 1.0, reporting_fraction: 0.6 },
    fit_relative_error: 0.1,
    series: [
      { date: "2026-01-01", actual: 100, fitted: 95, predicted: null },
      { date: "2026-02-01", actual: 200, fitted: 190, predicted: null },
      { date: "2026-03-01", actual: 400, fitted: 380, predicted: null },
      { date: "2026-04-01", actual: 300, fitted: 310, predicted: null },
      { date: "2026-05-01", actual: 150, fitted: 160, predicted: null },
      { date: "2026-06-01", actual: 80, fitted: 85, predicted: null },
      { date: "2026-07-01", actual: null, fitted: null, predicted: 500 },
      { date: "2026-08-01", actual: null, fitted: null, predicted: 600 },
    ],
    warnings: [],
    disclaimer: "SEIR fit to your uploaded data, not the trained XGBoost model.",
    ...overrides,
  };
}

describe("buildUploadInsights", () => {
  it("rates 'high' when the projection is rising past the historical peak with a reliable fit", () => {
    const insights = buildUploadInsights(response(), DEFAULT_THRESHOLDS);
    expect(insights.trend).toBe("rising");
    expect(insights.concern).toBe("high");
    expect(insights.historicalPeak).toEqual({ date: "2026-03-01", value: 400 });
    expect(insights.projectedPeak).toEqual({ date: "2026-08-01", value: 600 });
    expect(insights.actions.some((a) => /escalating|escalat/i.test(a))).toBe(true);
  });

  it("rates 'mid' when the projected peak reaches a meaningful but not majority-exceeding share of the historical peak", () => {
    const res = response({
      series: [
        { date: "2026-01-01", actual: 100, fitted: 95, predicted: null },
        { date: "2026-02-01", actual: 500, fitted: 490, predicted: null },
        { date: "2026-03-01", actual: 900, fitted: 880, predicted: null },
        { date: "2026-04-01", actual: 400, fitted: 410, predicted: null },
        { date: "2026-05-01", actual: 200, fitted: 210, predicted: null },
        { date: "2026-06-01", actual: 100, fitted: 105, predicted: null },
        { date: "2026-07-01", actual: null, fitted: null, predicted: 400 },
        { date: "2026-08-01", actual: null, fitted: null, predicted: 600 },
      ],
    });
    const insights = buildUploadInsights(res, DEFAULT_THRESHOLDS);
    // historical peak 900, projected peak 600 -> 67% of it: "mid", not "low" or "high".
    expect(insights.concern).toBe("mid");
  });

  it("rates 'high' from a projected peak that exceeds the historical peak even when the window ends low (a mid-window second wave)", () => {
    // Mirrors what a real SEIR forward-projection can do: rise, peak partway
    // through the horizon, then fall again before the window ends. A
    // first/last-only trend comparison would call this "falling" and miss
    // it entirely — this is exactly the bug an earlier version had, caught
    // by testing against the real ml_service (see this file's own docstring).
    const res = response({
      series: [
        { date: "2026-01-01", actual: 100, fitted: 95, predicted: null },
        { date: "2026-02-01", actual: 300, fitted: 290, predicted: null },
        { date: "2026-03-01", actual: 500, fitted: 490, predicted: null },
        { date: "2026-04-01", actual: 300, fitted: 310, predicted: null },
        { date: "2026-05-01", actual: 150, fitted: 160, predicted: null },
        { date: "2026-06-01", actual: 80, fitted: 85, predicted: null },
        { date: "2026-07-01", actual: null, fitted: null, predicted: 100 },
        { date: "2026-08-01", actual: null, fitted: null, predicted: 900 }, // mid-window peak, exceeds the 500 historical peak
        { date: "2026-09-01", actual: null, fitted: null, predicted: 50 }, // window ends low
      ],
    });
    const insights = buildUploadInsights(res, DEFAULT_THRESHOLDS);
    expect(insights.trend).toBe("falling"); // first (100) -> last (50) of the projection alone
    expect(insights.projectedPeak).toEqual({ date: "2026-08-01", value: 900 });
    expect(insights.concern).toBe("high"); // the peak, not the endpoint, drives concern
  });

  it("rates 'low' when the projection is falling or stable", () => {
    const res = response({
      series: [
        { date: "2026-01-01", actual: 100, fitted: 95, predicted: null },
        { date: "2026-02-01", actual: 400, fitted: 390, predicted: null },
        { date: "2026-03-01", actual: 900, fitted: 880, predicted: null },
        { date: "2026-04-01", actual: 400, fitted: 410, predicted: null },
        { date: "2026-05-01", actual: 200, fitted: 210, predicted: null },
        { date: "2026-06-01", actual: 100, fitted: 105, predicted: null },
        { date: "2026-07-01", actual: null, fitted: null, predicted: 80 },
        { date: "2026-08-01", actual: null, fitted: null, predicted: 40 },
      ],
    });
    const insights = buildUploadInsights(res, DEFAULT_THRESHOLDS);
    expect(insights.trend).toBe("falling");
    expect(insights.concern).toBe("low");
  });

  it("rates 'mid' when the fit is unreliable, regardless of trend", () => {
    const insights = buildUploadInsights(response({ fit_relative_error: 0.8 }), DEFAULT_THRESHOLDS);
    expect(insights.fitIsReliable).toBe(false);
    expect(insights.concern).toBe("mid");
    expect(insights.actions[0]).toMatch(/fit.*isn't reliable/i);
  });

  it("estimates true infections from the fitted reporting fraction", () => {
    const insights = buildUploadInsights(response({ fitted_params: { beta0: 0.5, k: 1.0, reporting_fraction: 0.5 } }));
    // total actual = 100+200+400+300+150+80 = 1230; /0.5 = 2460
    expect(insights.totalHistoricalCases).toBe(1230);
    expect(insights.estimatedTrueInfections).toBe(2460);
  });

  it("treats an implausible reporting fraction (implying more infections than the population) as unreliable rather than showing a fabricated number", () => {
    // total actual = 1230; a 0.15% reporting fraction implies 820,000 true
    // infections against a 500,000 population — impossible, so this should
    // be surfaced as an unreliable estimate, not a headline number.
    const insights = buildUploadInsights(response({ fitted_params: { beta0: 0.5, k: 1.0, reporting_fraction: 0.0015 } }));
    expect(insights.reportingFractionIsPlausible).toBe(false);
    expect(insights.estimatedTrueInfections).toBeNull();
    expect(insights.actions.some((a) => /isn't reliable for this dataset/i.test(a))).toBe(true);
    // The actual "surveillance/testing capacity may be a bottleneck" suggestion
    // (a different action string) must not also fire — the caveat message
    // above mentions "surveillance" in passing, so match on its distinct wording.
    expect(insights.actions.some((a) => /worth asking whether surveillance/i.test(a))).toBe(false);
    expect(insights.reasons.some((r) => /more than the 500,000 population/i.test(r))).toBe(true);
  });

  it("flags a low reporting fraction as a surveillance-capacity suggestion", () => {
    const insights = buildUploadInsights(response({ fitted_params: { beta0: 0.5, k: 1.0, reporting_fraction: 0.15 } }));
    expect(insights.actions.some((a) => /surveillance|testing capacity/i.test(a))).toBe(true);
  });

  it("suggests adding rainfall data when none was used", () => {
    const insights = buildUploadInsights(response({ used_rainfall: false }));
    expect(insights.actions.some((a) => /rainfall/i.test(a))).toBe(true);
  });

  it("treats a single-month projection as an unknown trend rather than guessing", () => {
    const res = response({
      series: [
        { date: "2026-01-01", actual: 100, fitted: 95, predicted: null },
        { date: "2026-02-01", actual: 200, fitted: 190, predicted: null },
        { date: "2026-03-01", actual: 400, fitted: 380, predicted: null },
        { date: "2026-04-01", actual: 300, fitted: 310, predicted: null },
        { date: "2026-05-01", actual: 150, fitted: 160, predicted: null },
        { date: "2026-06-01", actual: 80, fitted: 85, predicted: null },
        { date: "2026-07-01", actual: null, fitted: null, predicted: 500 },
      ],
    });
    const insights = buildUploadInsights(res);
    expect(insights.trend).toBe("unknown");
  });

  it("respects a configurable trend threshold instead of a hardcoded cutoff", () => {
    // +25% from first to last projected month reads as "rising" under the
    // default 10% threshold but "stable" under a looser custom 30% one.
    const res = response({
      series: [
        { date: "2026-01-01", actual: 100, fitted: 95, predicted: null },
        { date: "2026-02-01", actual: 100, fitted: 95, predicted: null },
        { date: "2026-03-01", actual: 100, fitted: 95, predicted: null },
        { date: "2026-04-01", actual: 100, fitted: 95, predicted: null },
        { date: "2026-05-01", actual: 100, fitted: 95, predicted: null },
        { date: "2026-06-01", actual: 100, fitted: 95, predicted: null },
        { date: "2026-07-01", actual: null, fitted: null, predicted: 100 },
        { date: "2026-08-01", actual: null, fitted: null, predicted: 125 },
      ],
    });
    expect(buildUploadInsights(res, DEFAULT_THRESHOLDS).trend).toBe("rising");
    expect(buildUploadInsights(res, { ...DEFAULT_THRESHOLDS, trendThresholdPct: 30 }).trend).toBe("stable");
  });
});
