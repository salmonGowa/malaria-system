import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";

import { api, County, ForecastRun, HistoricalCaseData } from "../api/client";
import Card from "../components/Card";
import ChartTooltip from "../components/ChartTooltip";
import Pagination from "../components/Pagination";
import { DownloadIcon, SparkleIcon, TrendDownIcon, TrendFlatIcon, TrendUpIcon } from "../components/icons";
import { forecastAccuracy, previousDistinctForecast } from "../lib/analytics";
import { priorityBadgeClass } from "../lib/badgeClasses";
import { BANNER_WARNING_CLASS } from "../lib/bannerClasses";
import { btnClass } from "../lib/buttonClasses";
import { AXIS, GRID } from "../lib/chartTheme";
import { downloadCsv } from "../lib/csv";
import { FIELD_INPUT_CLASS } from "../lib/fieldClasses";
import { formatCompact, formatNumber, formatPeriod, formatRelativeTime, riskBand } from "../lib/format";
import { useThresholds } from "../lib/useThresholds";
import { useLanguage } from "../lib/i18n";
import { PLACEHOLDER_NOTE_CLASS } from "../lib/noteClasses";
import { isTestRun, readHideTestRuns, writeHideTestRuns } from "../lib/testRuns";

const PAGE_SIZE = 50;
const BAND_LABEL = { high: "High", mid: "Moderate", low: "Low" } as const;
const BAND_FILL = { high: "bg-risk-high", mid: "bg-risk-mid", low: "bg-risk-low" } as const;
// Below this, a change between two runs is noise, not a signal worth an arrow.
const RISK_CHANGE_EPSILON = 0.01;

// Off by default: the e2e suite checks its own run lands at the top of this table.
const HIDE_TEST_KEY = "malaria-system:forecasts-hide-test-runs";

const byNewest = (a: ForecastRun, b: ForecastRun) => new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime();

interface CountyLatest {
  county: County;
  latest: ForecastRun | null;
  previous: ForecastRun | null;
  runs: number;
}

function RiskChange({ latest, previous }: { latest: ForecastRun; previous: ForecastRun | null }) {
  if (!previous) return <span className="whitespace-nowrap text-xs text-muted">no earlier run</span>;
  const diff = latest.risk_score - previous.risk_score;
  if (Math.abs(diff) < RISK_CHANGE_EPSILON) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted">
        <TrendFlatIcon size={13} /> unchanged
      </span>
    );
  }
  const up = diff > 0;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${up ? "text-risk-high" : "text-risk-low"}`}>
      {up ? <TrendUpIcon size={13} /> : <TrendDownIcon size={13} />}
      {up ? "+" : "−"}
      {Math.abs(diff * 100).toFixed(0)} pts
    </span>
  );
}

const OVERVIEW_GRID =
  "grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(0,0.8fr)] items-center gap-4 " +
  "min-[901px]:grid-cols-[minmax(0,1.1fr)_minmax(0,1.5fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,0.8fr)]";

export default function Forecasts() {
  const { t } = useLanguage();
  const thresholds = useThresholds();
  const [page, setPage] = useState(1);
  const [countyFilter, setCountyFilter] = useState<number | null>(null);
  const [hideTestRuns, setHideTestRuns] = useState(() => readHideTestRuns(HIDE_TEST_KEY));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [counties, setCounties] = useState<County[]>([]);
  const [allForecasts, setAllForecasts] = useState<ForecastRun[]>([]);
  const [historical, setHistorical] = useState<HistoricalCaseData[]>([]);

  // One fetch of every run feeds the overview, the history table and the
  // accuracy chart, so the county filter and the test-run toggle always
  // agree across all three (and paginating is just a slice).
  useEffect(() => {
    api
      .listAllForecasts()
      .then((rows) => {
        setAllForecasts([...rows].sort(byNewest));
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
    api.listAllCounties().then(setCounties).catch(() => undefined);
    api.listAllHistoricalCaseData().then(setHistorical).catch(() => undefined);
  }, []);

  const testRunCount = useMemo(() => allForecasts.filter(isTestRun).length, [allForecasts]);
  const runs = useMemo(() => (hideTestRuns ? allForecasts.filter((f) => !isTestRun(f)) : allForecasts), [allForecasts, hideTestRuns]);
  const historyRows = useMemo(() => (countyFilter ? runs.filter((f) => f.county === countyFilter) : runs), [runs, countyFilter]);
  const forecasts = historyRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleHideTest = (hide: boolean) => {
    setHideTestRuns(hide);
    setPage(1);
    writeHideTestRuns(HIDE_TEST_KEY, hide);
  };

  const overview = useMemo<CountyLatest[]>(() => {
    const byCounty = new Map<number, ForecastRun[]>();
    for (const f of runs) {
      const list = byCounty.get(f.county) ?? [];
      list.push(f);
      byCounty.set(f.county, list);
    }
    return counties
      .map((county) => {
        const countyRuns = byCounty.get(county.id) ?? []; // already newest first
        return {
          county,
          latest: countyRuns[0] ?? null,
          previous: previousDistinctForecast(countyRuns, RISK_CHANGE_EPSILON),
          runs: countyRuns.length,
        };
      })
      .sort((a, b) => (b.latest?.risk_score ?? -1) - (a.latest?.risk_score ?? -1));
  }, [counties, runs]);

  const bandCounts = useMemo(() => {
    const c = { high: 0, mid: 0, low: 0, none: 0 };
    for (const o of overview) {
      if (o.latest) c[riskBand(o.latest.risk_score, thresholds)]++;
      else c.none++;
    }
    return c;
  }, [overview, thresholds]);

  const newest = runs[0] ?? null;
  const accuracyData = useMemo(() => forecastAccuracy(runs, historical), [runs, historical]);
  const accuracyMax = accuracyData.reduce((m, d) => Math.max(m, d.predicted, d.actual), 0) * 1.05;
  const filteredCounty = counties.find((c) => c.id === countyFilter);

  const historyRef = useRef<HTMLDivElement>(null);
  const filterTo = (id: number | null, reveal = false) => {
    setCountyFilter(id);
    setPage(1);
    // From the overview, the table being filtered may be off-screen.
    if (reveal) historyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const exportRows = historyRows;

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="m-0 text-[1.6rem] font-bold tracking-[-0.02em] text-text">{t("page.outbreakForecasts")}</h2>
          <p className="mt-1 mb-0 max-w-[72ch] text-sm text-muted">
            Outbreak risk for the next four weeks, from the trained XGBoost model.
            {newest && <> Last run {formatRelativeTime(newest.generated_at)}.</>}
          </p>
        </div>
        <Link className={btnClass("primary", { className: "no-underline" })} to="/generate-forecast">
          <SparkleIcon size={15} />
          Generate forecast
        </Link>
      </header>

      {/* Latest per county — what most visitors came for. Deliberately not a
          <table>: the history table below stays the page's first tbody. */}
      {overview.length > 0 && (
        <div className="mb-5 overflow-hidden rounded-xl border border-border bg-panel shadow-[var(--shadow-sm)]">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-3">
            <div>
              <h3 className="m-0 text-[0.95rem] font-semibold text-text">Latest forecast per county</h3>
              <p className="mt-1 mb-0 text-[0.8125rem] text-muted">Highest risk first · select a county to see its history
                {hideTestRuns && testRunCount > 0 ? " · test runs hidden" : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5 text-xs">
              {(["high", "mid", "low"] as const).map((b) => (
                <span key={b} className={priorityBadgeClass(b)}>
                  {bandCounts[b]} {BAND_LABEL[b].toLowerCase()}
                </span>
              ))}
              {bandCounts.none > 0 && <span className={priorityBadgeClass("no-data")}>{bandCounts.none} no forecast</span>}
            </div>
          </div>
          <div
            className={`${OVERVIEW_GRID} border-y border-border bg-panel-muted px-5 py-2 text-xs font-semibold text-muted`}
            aria-hidden="true"
          >
            <span>County</span>
            <span>Outbreak risk</span>
            <span className="text-right min-[901px]:text-left">Predicted cases</span>
            <span className="hidden min-[901px]:block">Period</span>
            <span className="hidden min-[901px]:block">Updated</span>
          </div>
          <ul className="m-0 list-none p-0">
            {overview.map(({ county, latest, previous, runs }) => {
              const band = latest ? riskBand(latest.risk_score, thresholds) : null;
              const selected = countyFilter === county.id;
              return (
                <li key={county.id} className="border-t border-border first:border-t-0">
                  <button
                    type="button"
                    onClick={() => filterTo(selected ? null : county.id, !selected)}
                    aria-pressed={selected}
                    className={
                      `${OVERVIEW_GRID} w-full cursor-pointer border-0 px-5 py-2.5 text-left text-[0.8125rem] transition-colors ` +
                      "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent " +
                      (selected ? "bg-accent-soft" : "bg-transparent hover:bg-panel-muted")
                    }
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={`size-2 flex-none rounded-full ${band ? BAND_FILL[band] : "bg-muted"}`} />
                      <span className="truncate font-semibold text-text">{county.name}</span>
                      <span className="hidden text-xs text-muted min-[1101px]:inline">· {runs} run{runs === 1 ? "" : "s"}</span>
                    </span>
                    {latest && band ? (
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="w-9 text-right font-semibold tabular-nums text-text">
                          {Math.round(latest.risk_score * 100)}%
                        </span>
                        <span className="relative h-1.5 min-w-[40px] flex-1 rounded-full bg-panel-muted">
                          <span
                            className={`absolute inset-y-0 left-0 rounded-full ${BAND_FILL[band]}`}
                            style={{ width: `${Math.max(latest.risk_score * 100, 2)}%` }}
                          />
                        </span>
                        <span className="hidden w-[92px] whitespace-nowrap min-[641px]:block">
                          <RiskChange latest={latest} previous={previous} />
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted">No forecast yet</span>
                    )}
                    <span className="text-right tabular-nums text-text-secondary min-[901px]:text-left">
                      {latest ? formatNumber(Math.round(latest.predicted_cases)) : "—"}
                    </span>
                    <span className="hidden text-text-secondary min-[901px]:block">
                      {latest ? formatPeriod(latest.forecast_period_start, latest.forecast_period_end) : "—"}
                    </span>
                    <span className="hidden text-muted min-[901px]:block">{latest ? formatRelativeTime(latest.generated_at) : "—"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {accuracyData.length > 0 && (
        <Card>
          <h3 className="m-0 text-[0.95rem] font-semibold text-text">Forecast accuracy</h3>
          <p className="mt-1 mb-4 text-[0.8125rem] text-muted">
            Predicted vs. actual cases where a forecast's period overlaps the historical series (synthetic_v1). Points on the
            dashed line were exactly right. {accuracyData.length} comparable forecast{accuracyData.length === 1 ? "" : "s"}.
          </p>
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart margin={{ top: 8, right: 16, bottom: 16, left: 0 }}>
              <CartesianGrid {...GRID} vertical />
              <XAxis
                {...AXIS}
                type="number"
                dataKey="predicted"
                name="Predicted"
                domain={[0, accuracyMax]}
                tickFormatter={formatCompact}
                label={{ value: "Predicted cases", position: "insideBottom", offset: -10, fill: "var(--muted)", fontSize: 11 }}
              />
              <YAxis
                {...AXIS}
                type="number"
                dataKey="actual"
                name="Actual"
                domain={[0, accuracyMax]}
                tickFormatter={formatCompact}
                width={56}
              />
              <ReferenceLine
                segment={[
                  { x: 0, y: 0 },
                  { x: accuracyMax, y: accuracyMax },
                ]}
                stroke="var(--border-strong)"
                strokeDasharray="4 4"
              />
              <Tooltip cursor={{ strokeDasharray: "3 3" }} content={<ChartTooltip valueFormatter={(v) => formatNumber(Math.round(v))} />} />
              <Scatter data={accuracyData} fill="var(--series-1)" fillOpacity={0.8} />
            </ScatterChart>
          </ResponsiveContainer>
        </Card>
      )}

      <div ref={historyRef} className="scroll-mt-4" />
      <Card>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="m-0 text-[0.95rem] font-semibold text-text">Forecast history</h3>
            <p className="mt-1 mb-0 text-[0.8125rem] text-muted">
              {historyRows.length} run{historyRows.length === 1 ? "" : "s"}, newest first
              {filteredCounty ? ` — ${filteredCounty.name} only` : ""}
              {hideTestRuns && testRunCount > 0 ? `, ${testRunCount} test runs hidden` : ""}. Each one is logged with who
              triggered it.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {testRunCount > 0 && (
              <label className="flex cursor-pointer items-center gap-2 text-[0.8125rem] text-text-secondary" title="Runs triggered by the automated test account (e2e_test)">
                <input
                  type="checkbox"
                  checked={hideTestRuns}
                  onChange={(e) => toggleHideTest(e.target.checked)}
                  className="size-4 cursor-pointer accent-[var(--accent)]"
                />
                Hide test runs <span className="text-muted">({testRunCount})</span>
              </label>
            )}
            <label className="flex items-center gap-2 text-[0.8125rem] text-text-secondary">
              <span className="sr-only min-[561px]:not-sr-only">County</span>
              <select
                className={`${FIELD_INPUT_CLASS} !w-[170px]`}
                value={countyFilter ?? ""}
                onChange={(e) => filterTo(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">All counties</option>
                {[...counties]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
            {exportRows.length > 0 && (
              <button
                type="button"
                className={btnClass("secondary", { sm: true })}
                onClick={() =>
                  downloadCsv(filteredCounty ? `forecasts-${filteredCounty.name.toLowerCase().replace(/\s+/g, "-")}.csv` : "forecasts.csv", exportRows, [
                    "county_name",
                    "forecast_period_start",
                    "forecast_period_end",
                    "predicted_cases",
                    "risk_score",
                    "model_name",
                    "generated_at",
                    "generated_by_username",
                  ])
                }
              >
                <DownloadIcon size={14} /> {t("common.exportCsv")}
              </button>
            )}
          </div>
        </div>

        {error && <p className={BANNER_WARNING_CLASS}>Could not reach backend: {error}</p>}
        {!loading && forecasts.length === 0 && !error && (
          <p className={PLACEHOLDER_NOTE_CLASS}>
            {hideTestRuns && testRunCount > 0 ? "No forecast runs besides test runs" : "No forecast runs yet"}
            {filteredCounty ? ` for ${filteredCounty.name}` : ""}. <Link to="/generate-forecast">Generate one</Link>.
          </p>
        )}

        {forecasts.length > 0 && (
          <div
            className={`overflow-x-auto transition-opacity ${loading ? "opacity-60" : ""}`}
            tabIndex={0}
            role="region"
            aria-label="Forecast history table, scrollable horizontally"
          >
            <table>
              <thead>
                <tr>
                  <th>{t("table.county")}</th>
                  <th>{t("table.period")}</th>
                  <th className="text-right">{t("table.predictedCases")}</th>
                  <th>{t("table.riskScore")}</th>
                  <th>Generated</th>
                  <th>{t("table.triggeredBy")}</th>
                  <th>{t("table.model")}</th>
                </tr>
              </thead>
              <tbody>
                {forecasts.map((f) => {
                  const band = riskBand(f.risk_score, thresholds);
                  const placeholder = f.model_name === "placeholder_not_trained";
                  return (
                    <tr key={f.id}>
                      <td className="font-semibold">{f.county_name}</td>
                      <td className="whitespace-nowrap">{formatPeriod(f.forecast_period_start, f.forecast_period_end)}</td>
                      <td className="text-right tabular-nums">{formatNumber(Math.round(f.predicted_cases))}</td>
                      <td>
                        <span className={priorityBadgeClass(band)}>
                          {Math.round(f.risk_score * 100)}% · {BAND_LABEL[band]}
                        </span>
                      </td>
                      <td className="whitespace-nowrap text-muted" title={new Date(f.generated_at).toLocaleString()}>
                        {formatRelativeTime(f.generated_at)}
                      </td>
                      <td className="text-text-secondary">{f.generated_by_username ?? "—"}</td>
                      <td className={placeholder ? "text-risk-mid" : "text-muted"}>
                        <span className="mono text-xs">{f.model_name}</span>
                        {placeholder && <span className="ml-1 text-xs">(untrained)</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} count={historyRows.length} onPageChange={setPage} />
      </Card>
    </div>
  );
}
