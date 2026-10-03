import type { ReactNode } from "react";

export type KpiTone = "high" | "mid" | "low" | "neutral";

const TONE_BORDER: Record<KpiTone, string> = {
  high: "border-l-risk-high",
  mid: "border-l-risk-mid",
  low: "border-l-risk-low",
  neutral: "border-l-muted",
};

/** Was `.kpi-row`'s auto-fit grid. */
export const KPI_ROW_CLASS = "grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 mb-6";

export function kpiCardClass(tone: KpiTone = "neutral"): string {
  return (
    `bg-panel border border-border border-l-[3px] ${TONE_BORDER[tone]} rounded-xl py-4 px-[18px] shadow-[var(--shadow-sm)] ` +
    "transition duration-150 ease-in-out hover:shadow-[var(--shadow)] hover:-translate-y-px"
  );
}

export const KPI_LABEL_CLASS = "text-muted text-[0.8125rem] font-medium leading-snug mb-2";
export const KPI_VALUE_CLASS = "text-[1.9rem] max-[480px]:text-2xl font-bold leading-[1.1] tracking-[-0.02em] tabular-nums";

const TONE_ICON: Record<KpiTone, string> = {
  high: "bg-risk-high-soft text-risk-high",
  mid: "bg-risk-mid-soft text-risk-mid",
  low: "bg-risk-low-soft text-risk-low",
  neutral: "bg-panel-muted text-muted",
};
export const KPI_HINT_CLASS = "text-muted text-xs mt-1";

interface KpiCardProps {
  label: string;
  value: string;
  hint?: string;
  tone?: KpiTone;
  /** Optional glyph shown in a tone-tinted tile beside the label. */
  icon?: ReactNode;
}

export default function KpiCard({ label, value, hint, tone = "neutral", icon }: KpiCardProps) {
  return (
    <div className={kpiCardClass(tone)}>
      <div className="flex items-start justify-between gap-3">
        <div className={KPI_LABEL_CLASS}>{label}</div>
        {icon && (
          <span className={`grid size-8 flex-none place-items-center rounded-lg ${TONE_ICON[tone]}`} aria-hidden="true">
            {icon}
          </span>
        )}
      </div>
      <div className={KPI_VALUE_CLASS}>{value}</div>
      {hint && <div className={KPI_HINT_CLASS}>{hint}</div>}
    </div>
  );
}
