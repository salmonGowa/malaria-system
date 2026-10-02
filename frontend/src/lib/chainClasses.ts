/** The hash-chain visualization shared by the real Chain Integrity page and
 * its sandboxed tamper demo — a pill-shaped "link" per record plus its
 * detail panel. Plain class-string functions/constants (not components)
 * since call sites need the tone to vary per record and some need extra
 * structural variants (e.g. the demo's editable fields) — see
 * lib/buttonClasses.ts for the same reasoning. */

export function chainStatusClass(valid: boolean): string {
  return (
    "flex items-start gap-3.5 py-4 px-4 rounded-lg border " +
    (valid ? "bg-risk-low-soft border-risk-low text-risk-low" : "bg-risk-high-soft border-risk-high text-risk-high")
  );
}

export const CHAIN_STATUS_HEADLINE_CLASS = "text-[1.0625rem] font-bold text-text mb-1";
export const CHAIN_STATUS_DETAIL_CLASS = "text-text-secondary text-sm leading-normal";

export const CHAIN_SCROLL_CLASS = "flex items-center overflow-x-auto px-1 pt-1 pb-4";
export const CHAIN_LINK_WRAP_CLASS = "flex items-center shrink-0";
export const CHAIN_CONNECTOR_CLASS = "w-5 h-0.5 bg-border-strong shrink-0 mx-0.5";

export interface ChainLinkOptions {
  valid: boolean;
  selected?: boolean;
  demo?: boolean;
}

export function chainLinkClass({ valid, selected, demo }: ChainLinkOptions): string {
  const base = demo
    ? "flex flex-col items-start gap-1.5 py-3 px-3.5 rounded-lg min-w-[150px] cursor-default"
    : "flex items-center gap-1.5 py-2 px-3 rounded-full cursor-pointer hover:-translate-y-px";
  const tone = valid
    ? "border-risk-low text-risk-low hover:bg-risk-low-soft"
    : "border-risk-high text-risk-high bg-risk-high-soft";
  const selectedCls = selected ? "shadow-[0_0_0_3px_var(--accent-soft)] border-accent" : "";
  return [
    base,
    "border-[1.5px] border-border-strong bg-panel-muted text-text-secondary text-xs whitespace-nowrap shrink-0",
    "transition duration-150 ease-in-out",
    tone,
    selectedCls,
  ]
    .filter(Boolean)
    .join(" ");
}

export const CHAIN_LINK_DATE_CLASS = "font-semibold";
export const CHAIN_LINK_HASH_CLASS = "text-muted";
export const CHAIN_LINK_INDEX_CLASS = "font-bold text-text text-[0.8125rem]";
export const CHAIN_LINK_STATUS_CLASS = "flex items-center gap-[5px] text-[0.6875rem] font-semibold";

export const CHAIN_LINK_DEMO_FIELD_CLASS =
  "flex flex-col gap-[3px] text-[0.6875rem] text-muted uppercase tracking-[0.03em] font-semibold w-full";

export const CHAIN_LINK_DEMO_INPUT_CLASS =
  "[font:inherit] tabular-nums normal-case tracking-normal py-[5px] px-2 rounded-md border border-border-strong " +
  "bg-bg-elevated text-text w-full focus-visible:outline-none focus-visible:border-accent " +
  "focus-visible:shadow-[0_0_0_3px_var(--accent-soft)]";

export function chainDetailClass(valid: boolean): string {
  return `mt-2 p-4 rounded-lg border border-border border-l-[3px] bg-panel-muted ${valid ? "border-l-risk-low" : "border-l-risk-high"}`;
}

export const CHAIN_DETAIL_HEADER_CLASS = "flex items-center justify-between gap-2.5 mb-3";
export const CHAIN_DETAIL_TITLE_CLASS = "m-0 text-[0.9375rem]";
export const CHAIN_DETAIL_GRID_CLASS = "grid grid-cols-[max-content_1fr] gap-x-3.5 gap-y-1.5 m-0 text-[0.8125rem]";
export const CHAIN_DETAIL_DT_CLASS = "text-muted font-semibold";
export const CHAIN_DETAIL_DD_CLASS = "m-0 text-text break-all";
export const CHAIN_DETAIL_HASH_CLASS = "font-mono text-xs text-text-secondary";
