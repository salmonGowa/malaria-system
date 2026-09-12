export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}

export function formatCompact(n: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

/** Red/amber/green band for a 0-1 risk score. */
export function riskBand(score: number): "high" | "mid" | "low" {
  if (score >= 0.66) return "high";
  if (score >= 0.33) return "mid";
  return "low";
}
