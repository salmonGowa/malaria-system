import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { api, ClimateObservation, County, ForecastPreview, ForecastRun, HistoricalCaseData } from "../api/client";
import ChartTooltip from "./ChartTooltip";
import { AXIS, GRID, LINE_CURSOR, CURSOR } from "../lib/chartTheme";
import { formatCompact, formatDayLabel, formatMonthTick, formatNumber } from "../lib/format";
import type { DecisionThresholds } from "../lib/settings";

// Matches backend ForecastGenerationService.HISTORY_MONTHS — the trailing
// window of cases + rainfall actually sent to the model.
const MODEL_INPUT_MONTHS = 6;
const CONTEXT_MONTHS = 18;

// Forecast windows can start days apart (e.g. 12 and 13 Sep), so the risk
// chart labels by day, not month: "13 Sep".
const dayTick = (iso: string) => formatDayLabel(iso).split(" ").slice(0, 2).join(" ");

interface Props {
  county: County;
  /** Every saved forecast for this county (any order). */
  forecasts: ForecastRun[];
  /** The not-yet-saved prediction for the current settings, if any. */
  preview?: ForecastPreview | null;
  previewLabel?: string;
  asOfDate: string;
  thresholds: DecisionThresholds;
}

/** Two views of one county: its forecast risk over time (with the live
 * preview as a dashed final point), and the monthly cases + rainfall the
 * model reads — the window it actually uses shaded. */
export default function CountyForecastTrend({ county, forecasts, preview, previewLabel = "Preview", asOfDate, thresholds }: Props) {
  const [cases, setCases] = useState<HistoricalCaseData[]>([]);
  const [rain, setRain] = useState<ClimateObservation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([api.listAllHistoricalCaseData(county.id), api.listAllClimateObservations("CHIRPS", county.id)])
      .then(([h, c]) => {
        if (cancelled) return;
        setCases(h);
        setRain(c);
      })
      .catch(() => undefined)
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [county.id]);

  // One point per forecast window (the latest run for it), oldest first.
  const riskSeries = useMemo(() => {
    const byWindow = new Map<string, ForecastRun>();
    for (const f of forecasts) {
      const cur = byWindow.get(f.forecast_period_start);
      if (!cur || new Date(f.generated_at) > new Date(cur.generated_at)) byWindow.set(f.forecast_period_start, f);
    }
    const rows: { date: string; saved?: number; preview?: number }[] = [...byWindow.values()]
      .sort((a, b) => a.forecast_period_start.localeCompare(b.forecast_period_start))
      .map((f) => ({ date: f.forecast_period_start, saved: f.risk_score }));
    if (preview) {
      const same = rows.find((r) => r.date === preview.forecast_period_start);
      if (same) same.preview = preview.risk_score;
      else {
        // Join the dashed preview segment to the last saved point.
        if (rows.length) rows[rows.length - 1].preview = rows[rows.length - 1].saved;
        rows.push({ date: preview.forecast_period_start, preview: preview.risk_score });
      }
    }
    return rows;
  }, [forecasts, preview]);

  // Monthly cases + rainfall up to the as-of date.
  const inputSeries = useMemo(() => {
    const month = (iso: string) => iso.slice(0, 7);
    const asOf = month(asOfDate);
    const byMonth = new Map<string, { month: string; cases?: number; rainfall?: number }>();
    for (const h of cases) {
      const m = month(h.period_start);
      if (m >= asOf) continue;
      byMonth.set(m, { ...(byMonth.get(m) ?? { month: m }), cases: h.confirmed_cases });
    }
    for (const r of rain) {
      const m = month(r.observation_date);
      if (m >= asOf || r.rainfall_mm === null) continue;
      byMonth.set(m, { ...(byMonth.get(m) ?? { month: m }), rainfall: r.rainfall_mm });
    }
    return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-CONTEXT_MONTHS);
  }, [cases, rain, asOfDate]);

  const inputWindowStart = inputSeries.length >= MODEL_INPUT_MONTHS ? inputSeries[inputSeries.length - MODEL_INPUT_MONTHS].month : null;
  const lastMonth = inputSeries[inputSeries.length - 1]?.month;
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="m-0 text-[0.875rem] font-semibold text-text">Outbreak risk over time</h4>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-series-1" /> Saved forecasts
            </span>
            {preview && (
              <span className="flex items-center gap-1.5">
                <span className="w-3.5 border-t-2 border-dashed border-accent" /> {previewLabel}
              </span>
            )}
          </div>
        </div>
        {riskSeries.length === 0 ? (
          <p className="m-0 rounded-lg border border-dashed border-border px-4 py-8 text-center text-[0.8125rem] text-muted">
            No forecasts for {county.name} yet.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={190}>
            <ComposedChart data={riskSeries} margin={{ top: 8, right: 12, left: -6, bottom: 0 }}>
              <CartesianGrid {...GRID} />
              <XAxis {...AXIS} dataKey="date" tickFormatter={dayTick} minTickGap={20} />
              <YAxis {...AXIS} domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} tickFormatter={pct} width={50} />
              <ReferenceLine y={thresholds.riskMid} stroke="var(--risk-mid)" strokeDasharray="3 4" strokeOpacity={0.7} />
              <ReferenceLine y={thresholds.riskHigh} stroke="var(--risk-high)" strokeDasharray="3 4" strokeOpacity={0.7} />
              <Tooltip
                cursor={LINE_CURSOR}
                content={<ChartTooltip labelFormatter={(l) => `Window from ${formatDayLabel(String(l))}`} valueFormatter={(v) => pct(v)} />}
              />
              <Line type="monotone" dataKey="saved" name="Saved forecast" stroke="var(--series-1)" strokeWidth={2} dot={{ r: 3.5, strokeWidth: 0, fill: "var(--series-1)" }} connectNulls isAnimationActive={false} />
              {preview && (
                <Line
                  type="monotone"
                  dataKey="preview"
                  name={previewLabel}
                  stroke="var(--accent)"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={{ r: 5, strokeWidth: 2, stroke: "var(--accent)", fill: "var(--panel)" }}
                  connectNulls
                  isAnimationActive={false}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
        <p className="mt-1 mb-0 text-xs text-muted">
          Dashed lines mark the moderate ({pct(thresholds.riskMid)}) and high ({pct(thresholds.riskHigh)}) thresholds.
        </p>
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="m-0 text-[0.875rem] font-semibold text-text">What the model sees</h4>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px] bg-series-2" /> Cases
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3.5 border-t-2 border-series-1" /> Rainfall (mm)
            </span>
          </div>
        </div>
        {loading ? (
          <div className="h-[190px] animate-pulse rounded-lg bg-panel-muted" />
        ) : inputSeries.length === 0 ? (
          <p className="m-0 rounded-lg border border-dashed border-border px-4 py-8 text-center text-[0.8125rem] text-muted">
            No case or rainfall history before this date.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={190}>
            <ComposedChart data={inputSeries} margin={{ top: 8, right: 0, left: -6, bottom: 0 }}>
              <CartesianGrid {...GRID} />
              {inputWindowStart && lastMonth && (
                <ReferenceArea
                  x1={inputWindowStart}
                  x2={lastMonth}
                  yAxisId="cases"
                  fill="var(--accent)"
                  fillOpacity={0.08}
                  label={{ value: "model input", position: "insideTopLeft", fill: "var(--muted)", fontSize: 10 }}
                />
              )}
              <XAxis {...AXIS} dataKey="month" tickFormatter={formatMonthTick} minTickGap={24} />
              <YAxis {...AXIS} yAxisId="cases" tickFormatter={formatCompact} width={52} />
              <YAxis {...AXIS} yAxisId="rain" orientation="right" tickFormatter={(v) => `${v}`} width={36} />
              <Tooltip
                cursor={CURSOR}
                content={
                  <ChartTooltip
                    labelFormatter={(l) => formatMonthTick(String(l))}
                    valueFormatter={(v, name) => (name.startsWith("Rain") ? `${v.toFixed(0)} mm` : formatNumber(Math.round(v)))}
                  />
                }
              />
              <Bar yAxisId="cases" dataKey="cases" name="Cases" fill="var(--series-2)" fillOpacity={0.75} radius={[2, 2, 0, 0]} isAnimationActive={false} />
              <Line yAxisId="rain" type="monotone" dataKey="rainfall" name="Rainfall" stroke="var(--series-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
        <p className="mt-1 mb-0 text-xs text-muted">
          Monthly cases (synthetic_v1) and CHIRPS rainfall. The shaded {MODEL_INPUT_MONTHS} months are what the model reads.
        </p>
      </div>
    </div>
  );
}
