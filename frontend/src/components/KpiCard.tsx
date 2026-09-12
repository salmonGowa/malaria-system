interface KpiCardProps {
  label: string;
  value: string;
  hint?: string;
  tone?: "high" | "mid" | "low" | "neutral";
}

export default function KpiCard({ label, value, hint, tone = "neutral" }: KpiCardProps) {
  return (
    <div className={`kpi-card kpi-tone-${tone}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {hint && <div className="kpi-hint">{hint}</div>}
    </div>
  );
}
