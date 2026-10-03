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

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Compact month tick for long time axes: "2021-09-01" → "Sep '21".
 * Parsed by hand (not `new Date`) so a bare ISO date isn't shifted a day
 * by the viewer's timezone. Unparseable input comes back unchanged. */
export function formatMonthTick(iso: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${MONTHS[Number(m[2]) - 1]} '${m[1].slice(2)}`;
}

/** Short day label: "2026-01-12" → "12 Jan 2026". Same no-timezone parsing. */
export function formatDayLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Month for running text: "2026-04-01" → "April 2026". Same no-timezone parsing. */
export function formatMonthName(iso: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${MONTH_NAMES[Number(m[2]) - 1]} ${m[1]}`;
}

/** Forecast window for display: "1–29 Oct 2026", "28 Sep – 26 Oct 2026",
 * "15 Dec 2026 – 12 Jan 2027". Parsed by hand like the other date helpers. */
export function formatPeriod(startIso: string, endIso: string): string {
  const s = /^(\d{4})-(\d{2})-(\d{2})/.exec(startIso);
  const e = /^(\d{4})-(\d{2})-(\d{2})/.exec(endIso);
  if (!s || !e) return `${startIso} – ${endIso}`;
  const [sd, sm, sy] = [Number(s[3]), MONTHS[Number(s[2]) - 1], s[1]];
  const [ed, em, ey] = [Number(e[3]), MONTHS[Number(e[2]) - 1], e[1]];
  if (sy !== ey) return `${sd} ${sm} ${sy} – ${ed} ${em} ${ey}`;
  if (sm !== em) return `${sd} ${sm} – ${ed} ${em} ${ey}`;
  return `${sd}–${ed} ${em} ${ey}`;
}

/** "just now", "5 min ago", "3h ago", "2d ago", then a plain date. */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const secs = Math.round((now.getTime() - then.getTime()) / 1000);
  if (!Number.isFinite(secs)) return iso;
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)} min ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 86400 * 30) return `${Math.floor(secs / 86400)}d ago`;
  return formatDayLabel(then.toISOString());
}
