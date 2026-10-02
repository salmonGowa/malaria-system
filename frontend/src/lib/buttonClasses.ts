/** Tailwind class-string builders for the shared button styling — part of
 * the incremental Tailwind migration (see index.css's own "Tailwind"
 * comment). Replaces the old `.btn`/`.btn-primary`/`.btn-secondary`/
 * `.btn-danger-ghost`/`.btn-sm`/`.btn-block`/`.icon-button` CSS classes.
 *
 * A plain function rather than a wrapping <Button> component on purpose:
 * call sites here are a mix of <button>, <Link>, and the occasional <a>,
 * several with existing onClick/disabled/type/style props that would just
 * need forwarding through a wrapper anyway — `className={btnClass(...)}`
 * drops onto any of them with no indirection. See lib/recommendations.ts
 * etc. for the project's existing convention of plain `lib/` helpers over
 * components where there's no shared render logic, only shared styling. */

export type ButtonVariant = "primary" | "secondary" | "danger-ghost";

export interface ButtonClassOptions {
  /** Matches the old .btn-sm — smaller padding/font. */
  sm?: boolean;
  /** Matches the old .btn-block — width: 100%. */
  block?: boolean;
  /** Extra classes to append (e.g. margin utilities specific to one call site). */
  className?: string;
}

// Deliberately excludes padding/font-size — those depend on `sm` and must
// fully replace each other, never both be present at once. Two same-
// specificity utility classes for the same property (e.g. both px-4 and
// px-3) don't resolve by source order in the className string the way
// plain CSS classes would; which one wins depends on Tailwind's internal
// generation order, not intent — so `btnClass` picks exactly one set below
// instead of layering a second on top (caught by this file's own test).
const BASE =
  "inline-flex items-center justify-center gap-1.5 border border-transparent rounded-lg font-semibold " +
  "cursor-pointer whitespace-nowrap transition duration-150 ease-in-out " +
  "enabled:active:translate-y-px disabled:opacity-[0.55] disabled:cursor-not-allowed";

const SIZE = {
  default: "text-[0.8125rem] px-4 py-[9px]",
  sm: "text-xs px-3 py-1.5",
};

// --ease: cubic-bezier(0.4,0,0.2,1) in index.css is Tailwind's own built-in
// `ease-in-out` value exactly, and --radius-sm (8px) is Tailwind's built-in
// `rounded-lg` exactly — both used directly above rather than re-declared,
// since they already match without needing an arbitrary value or a new
// @theme entry (seeindex.css's note on why --radius-sm/--font-sans aren't
// mapped into @theme).
const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent border-accent text-[#04231b] enabled:hover:brightness-[1.08] enabled:hover:shadow-[var(--shadow)]",
  secondary: "bg-panel-muted border-border-strong text-text enabled:hover:bg-border",
  "danger-ghost": "bg-transparent border-risk-high text-risk-high enabled:hover:bg-risk-high-soft",
};

export function btnClass(variant: ButtonVariant = "secondary", options: ButtonClassOptions = {}): string {
  const parts = [BASE, options.sm ? SIZE.sm : SIZE.default, VARIANTS[variant]];
  parts.push(options.block ? "w-full" : "");
  if (options.className) parts.push(options.className);
  return parts.filter(Boolean).join(" ");
}

/** Matches the old .icon-button — a plain square icon-only button (theme
 * toggle, sign-out, close, …), no border/background until hovered. */
export function iconButtonClass(extra = ""): string {
  return [
    "inline-flex items-center justify-center w-[30px] h-[30px] flex-shrink-0 border-none rounded-lg",
    "bg-transparent text-muted cursor-pointer transition-colors duration-150 ease-in-out",
    "hover:bg-panel-muted hover:text-text",
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}
