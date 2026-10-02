import { ReactNode } from "react";

/** The shared `.card` panel — a plain, variant-less wrapper (unlike
 * lib/buttonClasses.ts's btnClass(), which needs real variant/size logic
 * and sits on more than one element type), so a small component reads more
 * naturally here than a class-string function: `<Card>...</Card>` instead
 * of `<div className={cardClass()}>`. Part of the incremental Tailwind
 * migration — see index.css's own "Tailwind" header comment. */

interface CardProps {
  children: ReactNode;
  className?: string;
}

export default function Card({ children, className }: CardProps) {
  return (
    <div
      className={[
        "bg-panel border border-border rounded-xl p-5 max-[480px]:p-4 mb-5 shadow-[var(--shadow-sm)]",
        "transition duration-150 ease-in-out hover:border-border-strong hover:shadow-[var(--shadow)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}

/** A card's own title — was the implicit `.card h3` descendant rule
 * (margin-bottom 4px, 1rem, semibold); now applied directly since Card no
 * longer renders a literal `.card` class for CSS to key off. */
export const CARD_TITLE_CLASS = "mb-1 text-base font-semibold";

/** Was `.card-subtitle`. */
export const CARD_SUBTITLE_CLASS = "text-muted text-[0.8125rem] mb-3.5";

/** Was `.card-header-row` — title/status on the left, an action button on
 * the right; collapses to nothing (and takes no space) when empty, e.g. no
 * error and no export button to show. */
export const CARD_HEADER_ROW_CLASS = "flex items-center justify-between gap-3 flex-wrap mb-3 empty:hidden";
