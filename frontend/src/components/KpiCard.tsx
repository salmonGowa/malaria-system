export type KpiTone = "high" | "mid" | "low" | "neutral";

const TONE_BORDER: Record<KpiTone, string> = {
  high: "border-l-risk-high",
  mid: "border-l-risk-mid",
  low: "border-l-risk-low",
  neutral: "border-l-muted",
};

/** Was `.kpi-row`'s auto-fit grid. */
export const KPI_ROW_CLASS = "grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3.5 mb-5";

export function kpiCardClass(tone: KpiTone = "neutral"): string {
  return (
    `bg-panel border border-border border-l-[3px] ${TONE_BORDER[tone]} rounded-xl py-3.5 px-4 shadow-[var(--shadow-sm)] ` +
    "transition duration-150 ease-in-out hover:shadow-[var(--shadow)] hover:-translate-y-px"
  );
}

export const KPI_LABEL_CLASS = "text-muted text-xs uppercase tracking-[0.04em] mb-1.5 font-semibold";
export const KPI_VALUE_CLASS = "text-[1.75rem] max-[480px]:text-2xl font-bold leading-[1.1] tracking-[-0.02em]";
export const KPI_HINT_CLASS = "text-muted text-xs mt-1";

interface KpiCardProps {
  label: string;
  value: string;
  hint?: string;
  tone?: KpiTone;
}

export default function KpiCard({ label, value, hint, tone = "neutral" }: KpiCardProps) {
  return (
    <div className={kpiCardClass(tone)}>
      <div className={KPI_LABEL_CLASS}>{label}</div>
      <div className={KPI_VALUE_CLASS}>{value}</div>
      {hint && <div className={KPI_HINT_CLASS}>{hint}</div>}
    </div>
  );
}
