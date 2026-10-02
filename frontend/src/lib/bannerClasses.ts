/** Inline status banners — form success/error messages and the standalone
 * illustrative-model warning. Plain constants (not a component) since every
 * call site is just a `<p>` with its own text/children — see
 * lib/noteClasses.ts for the same reasoning. */

const BASE = "rounded-lg py-2.5 px-3.5 text-[0.8125rem] text-text";

export const FORM_BANNER_SUCCESS_CLASS = `${BASE} bg-risk-low-soft border border-risk-low mb-3.5`;
export const FORM_BANNER_ERROR_CLASS = `${BASE} bg-risk-high-soft border border-risk-high mb-3.5`;
export const BANNER_WARNING_CLASS = `${BASE} bg-risk-mid-soft border border-risk-mid mb-4`;
