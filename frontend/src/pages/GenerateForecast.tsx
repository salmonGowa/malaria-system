import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { api, County, ForecastPreview, ForecastRun, GenerateForecastsError } from "../api/client";
import Card from "../components/Card";
import CountyForecastTrend from "../components/CountyForecastTrend";
import CountyPicker from "../components/CountyPicker";
import LabeledSlider from "../components/LabeledSlider";
import { AlertIcon, CheckCircleIcon, InfoIcon, SparkleIcon, TrendDownIcon, TrendFlatIcon, TrendUpIcon, UserIcon } from "../components/icons";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { latestForecastByCounty } from "../lib/analytics";
import { useAuth } from "../lib/auth";
import { priorityBadgeClass } from "../lib/badgeClasses";
import { FORM_BANNER_ERROR_CLASS } from "../lib/bannerClasses";
import { btnClass } from "../lib/buttonClasses";
import { FIELD_HINT_CLASS, FIELD_INPUT_CLASS, FIELD_LABEL_CLASS } from "../lib/fieldClasses";
import { formatDayLabel, formatNumber, formatPeriod, formatRelativeTime, riskBand } from "../lib/format";
import { useLanguage } from "../lib/i18n";
import { useThresholds } from "../lib/useThresholds";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const HORIZON_PRESETS = [2, 4, 8, 12];
const BAND_LABEL = { high: "High", mid: "Moderate", low: "Low" } as const;
const BAND_FILL = { high: "bg-risk-high", mid: "bg-risk-mid", low: "bg-risk-low" } as const;
// A change smaller than this between two forecasts isn't worth an arrow.
const CHANGE_EPSILON = 0.01;

function Change({ now, before }: { now: number; before: ForecastRun | undefined }) {
  if (!before) return <span className="text-xs text-muted">first forecast</span>;
  const diff = now - before.risk_score;
  if (Math.abs(diff) < CHANGE_EPSILON)
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted">
        <TrendFlatIcon size={13} /> unchanged
      </span>
    );
  const up = diff > 0;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${up ? "text-risk-high" : "text-risk-low"}`}>
      {up ? <TrendUpIcon size={13} /> : <TrendDownIcon size={13} />}
      {up ? "+" : "−"}
      {Math.abs(diff * 100).toFixed(0)} pts
    </span>
  );
}

export default function GenerateForecast() {
  const { t } = useLanguage();
  const { username } = useAuth();
  const thresholds = useThresholds();
  const [counties, setCounties] = useState<County[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [asOfDate, setAsOfDate] = useState(todayIso());
  const [horizonWeeks, setHorizonWeeks] = useState(4);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: ForecastRun[]; errors: GenerateForecastsError[] } | null>(null);
  // Each county's latest forecast *before* this run — for the picker's "last
  // run" hints and the results' "change since previous" column.
  const [previous, setPrevious] = useState<Map<number, ForecastRun>>(new Map());
  const [allForecasts, setAllForecasts] = useState<ForecastRun[]>([]);

  // Live preview: a dry run (POST /forecasts/preview/) of exactly what
  // "Generate" would save for the current settings — nothing is stored.
  const [previews, setPreviews] = useState<Map<number, ForecastPreview>>(new Map());
  const [previewErrors, setPreviewErrors] = useState<GenerateForecastsError[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [previewFailed, setPreviewFailed] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<number | null>(null);
  const previewRequest = useRef(0);

  useEffect(() => {
    api
      .listAllCounties()
      .then((cs) => {
        setCounties(cs);
        setSelected(new Set(cs.map((c) => c.id)));
      })
      .catch(() => undefined);
    api
      .listAllForecasts()
      .then((fs) => {
        setAllForecasts(fs);
        setPrevious(latestForecastByCounty(fs));
      })
      .catch(() => undefined);
  }, []);

  const selectedKey = useMemo(() => [...selected].sort((a, b) => a - b).join(","), [selected]);
  const previewInput = useDebouncedValue(`${selectedKey}|${asOfDate}|${horizonWeeks}`, 600);

  useEffect(() => {
    if (!username || !selectedKey) {
      setPreviews(new Map());
      setPreviewErrors([]);
      return;
    }
    const [ids, asOf, horizon] = previewInput.split("|");
    if (!ids) return;
    const id = ++previewRequest.current;
    setPreviewing(true);
    api
      .previewForecasts({ county_ids: ids.split(",").map(Number), as_of_date: asOf, horizon_weeks: Number(horizon) })
      .then((res) => {
        if (id !== previewRequest.current) return;
        setPreviews(new Map(res.previews.map((p) => [p.county, p])));
        setPreviewErrors(res.errors);
        setPreviewFailed(null);
      })
      .catch((err) => id === previewRequest.current && setPreviewFailed(err instanceof Error ? err.message : "Preview failed"))
      .finally(() => id === previewRequest.current && setPreviewing(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewInput, username]);

  const previewList = useMemo(() => [...previews.values()].sort((a, b) => b.risk_score - a.risk_score), [previews]);
  const previewStale = previewing || previewInput !== `${selectedKey}|${asOfDate}|${horizonWeeks}`;
  const focusedCounty =
    counties.find((c) => c.id === focusedId) ?? counties.find((c) => c.id === previewList[0]?.county) ?? null;
  const focusedForecasts = useMemo(
    () => (focusedCounty ? allForecasts.filter((f) => f.county === focusedCounty.id) : []),
    [allForecasts, focusedCounty],
  );

  const staleCount = useMemo(
    () => counties.filter((c) => !previous.has(c.id) || Date.now() - new Date(previous.get(c.id)!.generated_at).getTime() > 7 * 86400000).length,
    [counties, previous],
  );

  const selectStale = () =>
    setSelected(
      new Set(
        counties
          .filter((c) => !previous.has(c.id) || Date.now() - new Date(previous.get(c.id)!.generated_at).getTime() > 7 * 86400000)
          .map((c) => c.id),
      ),
    );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (selected.size === 0) {
      setError("Select at least one county.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.generateForecasts({
        county_ids: [...selected],
        as_of_date: asOfDate,
        horizon_weeks: horizonWeeks,
      });
      setResult(res);
      requestAnimationFrame(() => document.getElementById("generate-results")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate forecasts");
    } finally {
      setSubmitting(false);
    }
  };

  const sortedCreated = result ? [...result.created].sort((a, b) => b.risk_score - a.risk_score) : [];
  const createdBands = sortedCreated.reduce(
    (acc, f) => {
      acc[riskBand(f.risk_score, thresholds)]++;
      return acc;
    },
    { high: 0, mid: 0, low: 0 },
  );

  // After a run, refresh "previous" so a second run compares against this one.
  const acceptAndReset = () => {
    if (result) {
      setPrevious((prev) => {
        const next = new Map(prev);
        for (const f of result.created) next.set(f.county, f);
        return next;
      });
      setAllForecasts((prev) => [...result.created, ...prev]);
    }
    setResult(null);
  };

  return (
    <div>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="m-0 text-[1.6rem] font-bold tracking-[-0.02em] text-text">{t("page.generateForecast")}</h2>
          <p className="mt-1 mb-0 max-w-[72ch] text-sm text-muted">
            Runs the trained XGBoost model for each selected county on its recent rainfall and case history, and saves the
            result to <Link to="/forecasts">Forecasts</Link>.
          </p>
        </div>
      </header>

      {!username && (
        <Card className="max-w-[640px]">
          <div className="flex items-start gap-3">
            <span className="grid size-10 flex-none place-items-center rounded-full bg-panel-muted text-muted">
              <UserIcon size={18} />
            </span>
            <div>
              <h3 className="m-0 text-base font-semibold text-text">Sign in to generate forecasts</h3>
              <p className="mt-1 mb-0 text-[0.8125rem] text-muted">
                Every forecast run is logged with who triggered it. Use <strong className="text-text-secondary">Sign in</strong> at
                the top right; the form opens once you're signed in. You can browse existing forecasts on{" "}
                <Link to="/forecasts">Forecasts</Link> without signing in.
              </p>
            </div>
          </div>
        </Card>
      )}

      {username && (
        <form onSubmit={handleSubmit} className="grid items-start gap-5 min-[1101px]:grid-cols-[minmax(0,1fr)_340px]">
          <Card>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h3 className="m-0 text-[0.95rem] font-semibold text-text">Counties</h3>
                <p className="mt-1 mb-0 text-[0.8125rem] text-muted">Each county shows when it was last forecast.</p>
              </div>
              {staleCount > 0 && staleCount < counties.length && (
                <button type="button" className={btnClass("secondary", { sm: true })} onClick={selectStale}>
                  Select {staleCount} not forecast this week
                </button>
              )}
            </div>
            <CountyPicker
              counties={counties}
              selected={selected}
              onChange={setSelected}
              hint={(c) => {
                const f = previous.get(c.id);
                return f ? `last ${formatRelativeTime(f.generated_at)}` : "never forecast";
              }}
            />
          </Card>

          <Card className="min-[1101px]:sticky min-[1101px]:top-20">
            <h3 className="m-0 mb-4 text-[0.95rem] font-semibold text-text">Settings</h3>
            <label className="mb-4 flex flex-col gap-1.5 text-[0.8125rem]">
              <span className={FIELD_LABEL_CLASS}>Forecast as of</span>
              <input type="date" className={FIELD_INPUT_CLASS} value={asOfDate} max={todayIso()} onChange={(e) => setAsOfDate(e.target.value)} />
              <span className={FIELD_HINT_CLASS}>Uses data up to this date. Today for a current forecast.</span>
            </label>
            <LabeledSlider
              label="Look ahead"
              value={horizonWeeks}
              onChange={setHorizonWeeks}
              min={1}
              max={26}
              formatValue={(v) => `${v} week${v === 1 ? "" : "s"}`}
            />
            <div className="-mt-1 mb-5 flex flex-wrap gap-1.5">
              {HORIZON_PRESETS.map((w) => (
                <button
                  key={w}
                  type="button"
                  aria-pressed={horizonWeeks === w}
                  onClick={() => setHorizonWeeks(w)}
                  className={
                    "cursor-pointer rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors " +
                    (horizonWeeks === w ? "border-accent bg-accent-soft text-accent-text" : "border-border bg-panel text-text-secondary hover:border-border-strong")
                  }
                >
                  {w} wk
                </button>
              ))}
            </div>

            {error && <p className={FORM_BANNER_ERROR_CLASS}>{error}</p>}

            <button type="submit" className={btnClass("primary", { block: true })} disabled={submitting || selected.size === 0}>
              {submitting ? (
                <>
                  <span className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />
                  {t("common.generating")}
                </>
              ) : (
                <>
                  <SparkleIcon size={15} />
                  {t("common.generateForecasts")}
                </>
              )}
            </button>
            <p className="mt-2.5 mb-0 flex gap-1.5 text-xs leading-relaxed text-muted">
              <span className="mt-px flex-none">
                <InfoIcon size={13} />
              </span>
              {selected.size === 0
                ? "Select at least one county."
                : `${selected.size} ${selected.size === 1 ? "county" : "counties"} · ${horizonWeeks}-week window from ${formatDayLabel(asOfDate)}. Each run is saved and logged under your name.`}
            </p>
          </Card>
        </form>
      )}

      {/* Before a run: the preview sits right under the settings it reflects.
          After: saved results first, then the trend. CSS order, one copy each. */}
      <div className="flex flex-col">
        {username && (previewList.length > 0 || previewStale || previewFailed) && (
          <Card className={result ? "order-2" : "order-1"}>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="m-0 text-[0.95rem] font-semibold text-text">
                  {result ? "Trend" : "Live preview"}
                  {!result && (
                    <span className="ml-2 rounded-full bg-panel-muted px-2 py-0.5 align-middle text-[0.7rem] font-semibold text-muted">
                      not saved
                    </span>
                  )}
                </h3>
                <p className="mt-1 mb-0 text-[0.8125rem] text-muted">
                  {result
                    ? "Where the new forecasts sit against each county's history. Select a county."
                    : "What generating with these settings would produce, from the same model and data. Updates as you change settings; select a county for its trend."}
                </p>
              </div>
              <span aria-live="polite" className={`inline-flex items-center gap-1.5 text-xs text-muted transition-opacity ${previewStale && !result ? "opacity-100" : "opacity-0"}`}>
                <span className="size-1.5 animate-pulse rounded-full bg-accent" />
                {previewStale && !result ? "Updating…" : ""}
              </span>
            </div>

            {previewFailed && !result && <p className={FORM_BANNER_ERROR_CLASS}>Preview unavailable: {previewFailed}</p>}

            <div className="grid gap-6 min-[1101px]:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
              <ul
                aria-label="Counties in the preview"
                className={`m-0 list-none self-start overflow-hidden rounded-xl border border-border p-0 transition-opacity ${previewStale && !result ? "opacity-60" : ""}`}
              >
                {(result
                  ? [...result.created].sort((a, b) => b.risk_score - a.risk_score)
                  : previewList
                ).map((p) => {
                  const band = riskBand(p.risk_score, thresholds);
                  const focused = focusedCounty?.id === p.county;
                  const before = result ? undefined : previous.get(p.county);
                  return (
                    <li key={p.county} className="border-t border-border first:border-t-0">
                      <button
                        type="button"
                        aria-pressed={focused}
                        onClick={() => setFocusedId(p.county)}
                        className={
                          "grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto_74px] items-center gap-3 border-0 px-3.5 py-2.5 text-left text-[0.8125rem] transition-colors " +
                          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent " +
                          (focused ? "bg-panel-muted shadow-[inset_3px_0_0_var(--accent)]" : "bg-transparent hover:bg-panel-muted") /* neutral tint keeps the muted "46% →" text at AA contrast */
                        }
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span className={`size-2 flex-none rounded-full ${BAND_FILL[band]}`} />
                          <span className="truncate font-semibold text-text">{p.county_name}</span>
                        </span>
                        <span className="flex items-center gap-1.5 tabular-nums">
                          {before && <span className="text-xs text-muted">{Math.round(before.risk_score * 100)}% →</span>}
                          <span className={priorityBadgeClass(band)}>{Math.round(p.risk_score * 100)}%</span>
                        </span>
                        <span className="text-right">
                          {result ? (
                            <span className="text-xs text-muted">{formatNumber(Math.round(p.predicted_cases))}</span>
                          ) : (
                            <Change now={p.risk_score} before={before} />
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
                {!result &&
                  previewErrors.map((e) => (
                    <li key={e.county_code} className="flex flex-wrap justify-between gap-2 border-t border-border bg-risk-high-soft px-3.5 py-2.5 text-[0.8125rem] first:border-t-0">
                      <span className="font-semibold text-text">{e.county_name}</span>
                      <span className="text-risk-high">{e.error}</span>
                    </li>
                  ))}
                {!result && previewList.length === 0 && previewErrors.length === 0 && (
                  <li className="px-3.5 py-6 text-center text-[0.8125rem] text-muted">Preparing preview…</li>
                )}
              </ul>

              <div className="min-w-0">
                {focusedCounty ? (
                  <>
                    <div className="mb-3 text-sm font-semibold text-text">{focusedCounty.name}</div>
                    <CountyForecastTrend
                      county={focusedCounty}
                      forecasts={focusedForecasts}
                      preview={result ? result.created.find((f) => f.county === focusedCounty.id) ?? null : previews.get(focusedCounty.id) ?? null}
                      previewLabel={result ? "New forecast" : "Preview"}
                      asOfDate={asOfDate}
                      thresholds={thresholds}
                    />
                  </>
                ) : (
                  <p className="m-0 text-[0.8125rem] text-muted">Select a county to see its trend.</p>
                )}
              </div>
            </div>
          </Card>
        )}

        {result && (
          <section id="generate-results" className="order-1 scroll-mt-6">
            <Card>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span
                    className={`grid size-9 flex-none place-items-center rounded-full ${result.errors.length && !result.created.length ? "bg-risk-high-soft text-risk-high" : "bg-risk-low-soft text-risk-low"}`}
                  >
                    {result.errors.length && !result.created.length ? <AlertIcon size={18} /> : <CheckCircleIcon size={18} />}
                  </span>
                  <div>
                    <h3 className="m-0 text-base font-bold text-text">
                      {result.created.length > 0
                        ? `Generated ${result.created.length} forecast${result.created.length === 1 ? "" : "s"}`
                        : "No forecasts generated"}
                      {result.errors.length > 0 && (
                        <span className="font-normal text-risk-high">
                          {" "}
                          · {result.errors.length} failed
                        </span>
                      )}
                    </h3>
                    {result.created.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {(["high", "mid", "low"] as const)
                          .filter((b) => createdBands[b] > 0)
                          .map((b) => (
                            <span key={b} className={priorityBadgeClass(b)}>
                              {createdBands[b]} {BAND_LABEL[b].toLowerCase()} risk
                            </span>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={btnClass("secondary", { sm: true })} onClick={acceptAndReset}>
                    Run again
                  </button>
                  <Link className={btnClass("secondary", { sm: true, className: "no-underline" })} to="/forecasts">
                    View on Forecasts
                  </Link>
                  {result.created.length > 0 && (
                    <Link className={btnClass("primary", { sm: true, className: "no-underline" })} to="/run-allocation">
                      Allocate doses →
                    </Link>
                  )}
                </div>
              </div>

              <ul className="m-0 list-none overflow-hidden rounded-xl border border-border p-0" data-testid="generate-results-list">
                {sortedCreated.map((f) => {
                  const band = riskBand(f.risk_score, thresholds);
                  return (
                    <li
                      key={f.id}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-t border-border px-4 py-3 text-[0.8125rem] first:border-t-0 min-[761px]:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_90px_minmax(0,1fr)]"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className={`size-2 flex-none rounded-full ${BAND_FILL[band]}`} />
                        <span className="truncate font-semibold text-text">{f.county_name}</span>
                      </span>
                      <span className="flex items-center gap-3">
                        <span className={priorityBadgeClass(band)}>
                          {Math.round(f.risk_score * 100)}% · {BAND_LABEL[band]}
                        </span>
                        <Change now={f.risk_score} before={previous.get(f.county)} />
                      </span>
                      <span className="text-right tabular-nums text-text-secondary min-[761px]:text-left">
                        {formatNumber(Math.round(f.predicted_cases))}
                        <span className="text-xs text-muted"> cases</span>
                      </span>
                      <span className="hidden text-text-secondary min-[761px]:block">{formatPeriod(f.forecast_period_start, f.forecast_period_end)}</span>
                    </li>
                  );
                })}
                {result.errors.map((e) => (
                  <li
                    key={e.county_code}
                    className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-risk-high-soft px-4 py-3 text-[0.8125rem] first:border-t-0"
                  >
                    <span className="flex items-center gap-2 font-semibold text-text">
                      <AlertIcon size={14} /> {e.county_name}
                    </span>
                    <span className="text-risk-high">{e.error}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        )}
      </div>
    </div>
  );
}
