/** The shared `.field` form-input system — used by the auth widget and every
 * forecast/allocation/case-report form panel. Plain class-string constants
 * (not a wrapper component) since the actual `<input>`/`<select>`/`<textarea>`
 * tags vary in type and props across call sites — see lib/buttonClasses.ts
 * for the same reasoning. */

export const FIELD_CLASS = "flex flex-col gap-[5px] text-[0.8125rem] mb-3";

export const FIELD_LABEL_CLASS = "text-text-secondary font-medium";

export const FIELD_INPUT_CLASS =
  "[font:inherit] tabular-nums py-2 px-2.5 rounded-lg border border-border-strong bg-bg-elevated text-text w-full " +
  "transition duration-150 ease-in-out " +
  "focus-visible:outline-none focus-visible:border-accent focus-visible:shadow-[0_0_0_3px_var(--accent-soft)] " +
  "disabled:opacity-60 disabled:cursor-not-allowed";

export const FIELD_ERROR_CLASS = "text-risk-high text-xs m-0";

export const FIELD_HINT_CLASS = "text-muted text-[0.71875rem]";

export const FIELD_ROW_CLASS = "flex gap-3 flex-wrap";

export const FIELD_ROW_FIELD_CLASS = `${FIELD_CLASS} flex-1 min-w-[150px]`;
