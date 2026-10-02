/** The shared `.priority-badge` pill — used for risk/priority tones across
 * Decision Support, Chain Integrity, and Upload & Simulate. A plain
 * class-string function (not a component) since each call site also needs
 * its own icon/label children — see lib/buttonClasses.ts for the same
 * reasoning. */

export type BadgeTone = "high" | "mid" | "low" | "no-data";

const BASE =
  "inline-flex items-center gap-[5px] py-1 px-[9px] rounded-full text-[0.71875rem] font-bold whitespace-nowrap shrink-0";

const TONES: Record<BadgeTone, string> = {
  high: "bg-risk-high-soft text-risk-high",
  mid: "bg-risk-mid-soft text-risk-mid",
  low: "bg-risk-low-soft text-risk-low",
  "no-data": "bg-panel-muted text-muted",
};

export function priorityBadgeClass(tone: BadgeTone): string {
  return `${BASE} ${TONES[tone]}`;
}
