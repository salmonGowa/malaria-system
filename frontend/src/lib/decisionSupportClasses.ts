/** Decision Support's recommendation cards, summary filter chips, and
 * trend/action sub-pieces — also reused by Upload & Simulate's own
 * decision-support section. Plain class-string functions/constants, not
 * components, since call sites wrap different structures (a <Card>, a
 * <button>, a <details>) — see lib/buttonClasses.ts for the same reasoning. */

export type RecTone = "high" | "mid" | "low" | "no-data";

const TONE_BORDER_T: Record<RecTone, string> = {
  high: "border-t-risk-high",
  mid: "border-t-risk-mid",
  low: "border-t-risk-low",
  "no-data": "border-t-muted",
};

const TONE_BORDER_L: Record<RecTone, string> = {
  high: "border-l-risk-high",
  mid: "border-l-risk-mid",
  low: "border-l-risk-low",
  "no-data": "border-l-muted",
};

const TONE_TEXT: Record<RecTone, string> = {
  high: "text-risk-high",
  mid: "text-risk-mid",
  low: "text-risk-low",
  "no-data": "text-muted",
};

/** Combine with <Card>'s own className — adds just the tone's top accent. */
export function recCardClass(tone: RecTone): string {
  return `border-t-[3px] ${TONE_BORDER_T[tone]}`;
}

export const REC_CARD_HEADER_CLASS = "flex items-start justify-between gap-2.5 mb-3";
export const REC_CARD_TITLE_CLASS = "m-0 text-[1.0625rem]";
export const REC_CARD_TITLE_LINK_CLASS = "no-underline hover:underline";

export const REC_STATS_CLASS = "grid grid-cols-3 gap-2.5 p-3 mb-3 bg-panel-muted rounded-lg";
export const REC_STAT_CLASS = "flex flex-col gap-0.5";
export const REC_STAT_LABEL_CLASS = "text-[0.6875rem] uppercase tracking-[0.04em] text-muted font-semibold";
export const REC_STAT_VALUE_CLASS = "text-[1.0625rem] font-bold tabular-nums text-text";

export function trendBadgeClass(tone: "caution" | "good" | "neutral"): string {
  const TONE = { caution: "text-risk-mid", good: "text-risk-low", neutral: "text-muted" };
  return `inline-flex items-center gap-1.5 text-xs py-1 mb-3 ${TONE[tone]}`;
}

export const REC_ACTIONS_LABEL_CLASS = "text-xs font-bold uppercase tracking-[0.04em] text-muted mb-1.5";
export const REC_ACTIONS_CLASS = "list-none m-0 mb-2.5 p-0 flex flex-col gap-1.5";
export const REC_ACTION_ITEM_CLASS =
  "text-[0.8125rem] leading-normal pl-4 relative text-text-secondary " +
  "before:content-[''] before:absolute before:left-0 before:top-[0.55em] before:w-1.5 before:h-1.5 before:rounded-full before:bg-accent";

export const REC_WHY_CLASS = "text-[0.8125rem]";
export const REC_WHY_SUMMARY_CLASS = "cursor-pointer text-accent-text font-semibold";
export const REC_WHY_UL_CLASS = "mt-2 pl-[18px] text-muted flex flex-col gap-1";

export const REC_SUMMARY_CLASS = "grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3 mb-4";

export function recSummaryChipClass(tone: RecTone): string {
  return (
    "flex flex-col items-start gap-0.5 py-3.5 px-4 rounded-xl border border-border bg-panel cursor-pointer text-left " +
    `text-[0.8125rem] text-text-secondary transition duration-150 ease-in-out hover:-translate-y-px hover:shadow-[var(--shadow)] ` +
    `border-l-[3px] ${TONE_BORDER_L[tone]}`
  );
}

export function recSummaryCountClass(tone: RecTone): string {
  return `text-[1.75rem] font-bold tabular-nums ${TONE_TEXT[tone]}`;
}

export const REC_FILTERS_CLASS = "flex flex-wrap gap-2 mb-5";
export const REC_GRID_CLASS = "grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4";
