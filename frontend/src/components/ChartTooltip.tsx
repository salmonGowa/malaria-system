/** Shared Recharts tooltip body, so every chart's hover card matches the app
 * panels instead of Recharts' default white box. Pass as an element —
 * `<Tooltip content={<ChartTooltip valueFormatter={...} />} />` — and
 * Recharts injects `active`/`payload`/`label`.
 *
 * Swatch color comes from the datum's own `fill` first (per-bar colors set
 * on the data, e.g. risk bands), then the series color. */

interface Entry {
  name?: string | number;
  value?: unknown;
  color?: string;
  fill?: string;
  stroke?: string;
  payload?: { fill?: string };
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<Entry>;
  label?: string | number;
  labelFormatter?: (label: string | number) => string;
  valueFormatter?: (value: number, name: string) => string;
}

export default function ChartTooltip({ active, payload, label, labelFormatter, valueFormatter }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  const heading = label === undefined || label === "" ? null : labelFormatter ? labelFormatter(label) : String(label);

  return (
    <div className="min-w-[160px] rounded-lg border border-border bg-panel px-3 py-2.5 text-[0.8125rem] shadow-[var(--shadow-lg)]">
      {heading && <div className="mb-1.5 font-semibold text-text">{heading}</div>}
      {payload.map((entry, i) => {
        const name = String(entry.name ?? "");
        const raw = Number(entry.value);
        const shown = Number.isFinite(raw) && valueFormatter ? valueFormatter(raw, name) : String(entry.value ?? "—");
        const swatch = entry.payload?.fill ?? entry.color ?? entry.fill ?? entry.stroke;
        return (
          <div key={`${name}-${i}`} className="flex items-center justify-between gap-5 py-0.5">
            <span className="flex items-center gap-1.5 text-muted">
              <span className="size-2 flex-none rounded-full" style={{ background: swatch }} />
              {name}
            </span>
            <span className="font-semibold tabular-nums text-text">{shown}</span>
          </div>
        );
      })}
    </div>
  );
}
