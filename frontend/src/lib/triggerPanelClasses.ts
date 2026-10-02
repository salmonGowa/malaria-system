/** The "generate" trigger panels (Counties/Facilities "Add" forms, Generate
 * Forecast / Run Allocation result lists). Plain constants, not a component,
 * since each call site wraps different form/result content — see
 * lib/noteClasses.ts for the same reasoning. */

export const TRIGGER_PANEL_CLASS = "border border-border rounded-lg py-4 px-4 bg-panel-muted mb-5";
export const TRIGGER_PANEL_HEADER_CLASS = "flex items-center justify-between gap-3 mb-3";
export const TRIGGER_PANEL_TITLE_CLASS = "m-0";

export const GENERATE_RESULTS_CLASS = "mt-3.5";
export const GENERATE_RESULTS_LIST_CLASS = "list-none m-0 p-0 flex flex-col gap-1 text-[0.8125rem]";
export const GENERATE_RESULT_ITEM_CLASS = "flex justify-between gap-2.5 py-1.5 px-2.5 rounded-md bg-panel border border-border";
export const RISK_VALUE_CLASS = "font-mono font-semibold text-accent-text";
