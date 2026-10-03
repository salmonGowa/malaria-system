import type { ReactNode } from "react";

import { formatCompact, formatNumber } from "../../lib/format";
import { useSimText } from "../../lib/i18n/simulations";

/** People are whole: exact below 1,000, compact above ("926", "100.5K"). */
export function formatPeople(n: number) {
  return Math.abs(n) < 1000 ? formatNumber(Math.round(n)) : formatCompact(n);
}

export function ControlGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="m-0 mb-4 min-w-0 border-0 p-0 last:mb-0">
      <legend className="mb-3 p-0 text-xs font-semibold text-muted">{title}</legend>
      {children}
    </fieldset>
  );
}

export function UpdatingBadge({ show }: { show: boolean }) {
  const st = useSimText();
  return (
    <span
      aria-live="polite"
      className={`inline-flex items-center gap-1.5 text-xs text-muted transition-opacity ${show ? "opacity-100" : "opacity-0"}`}
    >
      <span className="size-1.5 animate-pulse rounded-full bg-accent" />
      {show ? st("common.updating") : ""}
    </span>
  );
}

/** Change vs. a reference run, coloured by whether lower is better. */
export function Delta({ now, before, against }: { now: number; before: number; against: string }) {
  const st = useSimText();
  const diff = now - before;
  const pct = before > 0 ? (diff / before) * 100 : 0;
  if (Math.abs(pct) < 0.5) return <span className="text-muted">{st("common.sameAs", { name: against })}</span>;
  return (
    <span className={diff < 0 ? "text-risk-low" : "text-risk-high"}>
      {diff < 0 ? "▼" : "▲"} {formatPeople(Math.abs(diff))} ({Math.abs(pct).toFixed(0)}%) {st("common.vs", { name: against })}
    </span>
  );
}

/** An on/off switch: a real checkbox (keyboard, screen readers, forms) styled as a toggle. */
export function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-[0.8125rem]">
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span
        aria-hidden="true"
        className={
          "relative mt-0.5 h-[18px] w-8 flex-none rounded-full transition-colors " +
          "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent " +
          (checked ? "bg-accent" : "bg-border-strong")
        }
      >
        <span
          className={`absolute top-[2px] size-[14px] rounded-full bg-white shadow transition-[left] ${checked ? "left-[16px]" : "left-[2px]"}`}
        />
      </span>
      <span>
        <span className="block font-medium text-text-secondary">{label}</span>
        {hint && <span className="mt-0.5 block text-[0.71875rem] text-muted">{hint}</span>}
      </span>
    </label>
  );
}

/** A small segmented control (radio group) for 2-3 mutually exclusive options. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-lg bg-panel-muted p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={
              "cursor-pointer rounded-md border-0 px-2 py-1.5 text-[0.78rem] font-semibold transition-colors " +
              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent " +
              (active ? "bg-panel text-text shadow-[var(--shadow-sm)]" : "bg-transparent text-muted hover:text-text")
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
