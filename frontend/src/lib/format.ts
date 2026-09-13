export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}

export function formatCompact(n: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

/** Red/amber/green band for a 0-1 risk score. Cutoffs default to
 * DEFAULT_THRESHOLDS but are configurable — see lib/settings.ts and the
 * Settings page; pass the live value from `useThresholds()` wherever a
 * component should reflect the user's chosen cutoffs rather than the
 * built-in default (a standalone helper/test with no settings context can
 * omit it and gets the default, unchanged behaviour). */
export function riskBand(score: number, thresholds?: { riskHigh: number; riskMid: number }): "high" | "mid" | "low" {
  const riskHigh = thresholds?.riskHigh ?? 0.66;
  const riskMid = thresholds?.riskMid ?? 0.33;
  if (score >= riskHigh) return "high";
  if (score >= riskMid) return "mid";
  return "low";
}
