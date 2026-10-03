import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { api, County, ForecastRun, mlApi, VaccineAllocation } from "../api/client";
import { RunLines, runSummary } from "../components/AllocationRunLines";
import Card from "../components/Card";
import CountyPicker from "../components/CountyPicker";
import LabeledSlider from "../components/LabeledSlider";
import { AlertIcon, CheckCircleIcon, InfoIcon, SparkleIcon, UserIcon } from "../components/icons";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { groupAllocationRuns } from "../lib/allocationRuns";
import { latestForecastByCounty } from "../lib/analytics";
import { useAuth } from "../lib/auth";
import { BANNER_WARNING_CLASS, FORM_BANNER_ERROR_CLASS } from "../lib/bannerClasses";
import { btnClass } from "../lib/buttonClasses";
import { FIELD_HINT_CLASS, FIELD_INPUT_CLASS, FIELD_LABEL_CLASS } from "../lib/fieldClasses";
import { formatCompact, formatNumber, formatPeriod, formatRelativeTime } from "../lib/format";
import { useLanguage } from "../lib/i18n";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addWeeksIso(iso: string, weeks: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

const DOSE_PRESETS = [10000, 50000, 100000, 250000];
const SUGGESTED_CAP = 40;

export default function RunAllocation() {
  const { t } = useLanguage();
  const { username } = useAuth();
  const [counties, setCounties] = useState<County[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [latestForecast, setLatestForecast] = useState<Map<number, ForecastRun>>(new Map());
  const [totalDoses, setTotalDoses] = useState(50000);
  const [periodStart, setPeriodStart] = useState(todayIso());
  const [maxSharePct, setMaxSharePct] = useState(100);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<VaccineAllocation[] | null>(null);
  // Settings the shown result was run with — the controls may have moved since.
  const [ranWith, setRanWith] = useState<{ doses: number; capPct: number; key: string } | null>(null);

  // Live preview: the optimiser's split for the current settings, computed by
  // calling ml_service's /allocate directly with exactly what the backend's
  // AllocationGenerationService would send (each county's latest stored
  // forecast + population + cap). /allocate only computes; saving happens
  // only through "Run allocation".
  const [preview, setPreview] = useState<VaccineAllocation[] | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
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
      .then((fs) => setLatestForecast(latestForecastByCounty(fs)))
      .catch(() => undefined);
  }, []);

  // The optimiser works from each county's latest stored forecast; a selected
  // county without one can't be allocated to.
  const missingForecast = useMemo(
    () => counties.filter((c) => selected.has(c.id) && !latestForecast.has(c.id)),
    [counties, selected, latestForecast],
  );

  const previewCounties = useMemo(
    () => counties.filter((c) => selected.has(c.id) && latestForecast.has(c.id)),
    [counties, selected, latestForecast],
  );
  const previewKey = `${previewCounties.map((c) => c.id).join(",")}|${totalDoses}|${maxSharePct}|${periodStart}`;
  const debouncedKey = useDebouncedValue(previewKey, 300);

  useEffect(() => {
    if (!username || previewCounties.length === 0 || totalDoses <= 0) {
      setPreview(null);
      return;
    }
    const id = ++previewRequest.current;
    setPreviewing(true);
    const periodEnd = addWeeksIso(periodStart, 4);
    const now = new Date().toISOString();
    mlApi
      .allocate({
        total_available_doses: totalDoses,
        max_share_per_county: maxSharePct / 100,
        county_forecasts: previewCounties.map((c) => {
          const f = latestForecast.get(c.id)!;
          return {
            county_code: c.code,
            forecast_period_start: f.forecast_period_start,
            forecast_period_end: f.forecast_period_end,
            predicted_cases: f.predicted_cases,
            risk_score: f.risk_score,
            model_name: f.model_name,
            model_version: f.model_version,
          };
        }),
        county_populations: Object.fromEntries(previewCounties.map((c) => [c.code, c.population ?? 0])),
      })
      .then((res) => {
        if (id !== previewRequest.current) return;
        const byCode = new Map(previewCounties.map((c) => [c.code, c]));
        // Shaped like saved rows so the same RunLines view can draw it.
        setPreview(
          res.allocations.flatMap((a, i) => {
            const c = byCode.get(a.county_code);
            return c
              ? [
                  {
                    id: -1 - i,
                    county: c.id,
                    county_name: c.name,
                    period_start: periodStart,
                    period_end: periodEnd,
                    recommended_doses: a.recommended_doses,
                    based_on_forecast: latestForecast.get(c.id)?.id ?? null,
                    rationale: a.rationale,
                    generated_at: now,
                    generated_by_username: null,
                  },
                ]
              : [];
          }),
        );
        setPreviewError(null);
      })
      .catch((err) => id === previewRequest.current && setPreviewError(err instanceof Error ? err.message : "Preview failed"))
      .finally(() => id === previewRequest.current && setPreviewing(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedKey, username]);

  const previewRun = preview && preview.length > 0 ? groupAllocationRuns(preview)[0] : null;
  const previewSummary = previewRun ? runSummary(previewRun) : null;
  const previewStale = previewing || debouncedKey !== previewKey;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (selected.size === 0) {
      setError("Select at least one county.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setCreated(null);
    try {
      const res = await api.generateAllocations({
        total_available_doses: totalDoses,
        county_ids: [...selected],
        period_start: periodStart,
        period_end: addWeeksIso(periodStart, 4),
        max_share_per_county: maxSharePct / 100,
      });
      setCreated(res);
      setRanWith({ doses: totalDoses, capPct: maxSharePct, key: previewKey });
      requestAnimationFrame(() => document.getElementById("allocation-result")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run allocation");
    } finally {
      setSubmitting(false);
    }
  };

  const run = created && created.length > 0 ? groupAllocationRuns(created)[0] : null;
  const summary = run ? runSummary(run) : null;
  const allocatedTotal = created ? created.reduce((sum, a) => sum + a.recommended_doses, 0) : 0;

  return (
    <div>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="m-0 text-[1.6rem] font-bold tracking-[-0.02em] text-text">{t("page.runAllocation")}</h2>
          <p className="mt-1 mb-0 max-w-[72ch] text-sm text-muted">
            Splits a dose supply across counties by their latest forecast risk, using the linear-programming optimiser.
            Results are saved to <Link to="/allocations">Vaccine Allocation</Link>.
          </p>
        </div>
        <Link className={btnClass("secondary", { className: "no-underline" })} to="/simulations#allocation">
          Try it first in Simulations →
        </Link>
      </header>

      {!username && (
        <Card className="max-w-[640px]">
          <div className="flex items-start gap-3">
            <span className="grid size-10 flex-none place-items-center rounded-full bg-panel-muted text-muted">
              <UserIcon size={18} />
            </span>
            <div>
              <h3 className="m-0 text-base font-semibold text-text">Sign in to run an allocation</h3>
              <p className="mt-1 mb-0 text-[0.8125rem] text-muted">
                Every allocation run is saved and logged with who ran it. Use{" "}
                <strong className="text-text-secondary">Sign in</strong> at the top right. To explore without saving
                anything, use the <Link to="/simulations#allocation">allocation what-if</Link> in Simulations.
              </p>
            </div>
          </div>
        </Card>
      )}

      {username && (
        <form onSubmit={handleSubmit} className="grid items-start gap-5 min-[1101px]:grid-cols-[minmax(0,1fr)_360px]">
          <Card>
            <h3 className="m-0 text-[0.95rem] font-semibold text-text">Counties</h3>
            <p className="mt-1 mb-3 text-[0.8125rem] text-muted">Each shows the latest forecast risk the optimiser will use.</p>
            <CountyPicker
              counties={counties}
              selected={selected}
              onChange={setSelected}
              hint={(c) => {
                const f = latestForecast.get(c.id);
                return f ? `risk ${Math.round(f.risk_score * 100)}% · ${formatRelativeTime(f.generated_at)}` : "no forecast — skipped";
              }}
            />
            {missingForecast.length > 0 && (
              <p className={`${BANNER_WARNING_CLASS} mb-0`}>
                {missingForecast.length === 1 ? `${missingForecast[0].name} has` : `${missingForecast.length} selected counties have`} no
                stored forecast, so {missingForecast.length === 1 ? "it" : "they"} can't receive doses.{" "}
                <Link to="/generate-forecast">Generate forecasts</Link> first.
              </p>
            )}
          </Card>

          <Card className="min-[1101px]:sticky min-[1101px]:top-20">
            <h3 className="m-0 mb-4 text-[0.95rem] font-semibold text-text">Supply</h3>

            <label className="mb-2 flex flex-col gap-1.5 text-[0.8125rem]">
              <span className={FIELD_LABEL_CLASS}>Doses available</span>
              <input
                type="number"
                className={`${FIELD_INPUT_CLASS} tabular-nums`}
                min={1}
                step={1}
                value={totalDoses}
                onChange={(e) => setTotalDoses(Math.max(0, Number(e.target.value) || 0))}
              />
            </label>
            <div className="mb-4 flex flex-wrap gap-1.5">
              {DOSE_PRESETS.map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={totalDoses === d}
                  onClick={() => setTotalDoses(d)}
                  className={
                    "cursor-pointer rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums transition-colors " +
                    (totalDoses === d ? "border-accent bg-accent-soft text-accent-text" : "border-border bg-panel text-text-secondary hover:border-border-strong")
                  }
                >
                  {formatCompact(d)}
                </button>
              ))}
            </div>

            <label className="mb-4 flex flex-col gap-1.5 text-[0.8125rem]">
              <span className={FIELD_LABEL_CLASS}>Period start</span>
              <input type="date" className={FIELD_INPUT_CLASS} value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
              <span className={FIELD_HINT_CLASS}>Four weeks: {formatPeriod(periodStart, addWeeksIso(periodStart, 4))}.</span>
            </label>

            <LabeledSlider
              label="Max share for any one county"
              value={maxSharePct}
              onChange={setMaxSharePct}
              min={10}
              max={100}
              step={5}
              formatValue={(v) => (v >= 100 ? "No cap" : `${v}%`)}
              hint={
                maxSharePct >= 100
                  ? "No cap: the optimiser puts every dose into the single highest-risk county."
                  : `No county gets more than ${maxSharePct}% (${formatNumber(Math.floor((totalDoses * maxSharePct) / 100))} doses), so supply spreads.`
              }
            />
            {maxSharePct >= 100 && (
              <button type="button" className={btnClass("secondary", { sm: true, className: "-mt-1 mb-4" })} onClick={() => setMaxSharePct(SUGGESTED_CAP)}>
                Spread it: cap at {SUGGESTED_CAP}%
              </button>
            )}

            {error && <p className={FORM_BANNER_ERROR_CLASS}>{error}</p>}

            <button type="submit" className={btnClass("primary", { block: true })} disabled={submitting || selected.size === 0 || totalDoses <= 0}>
              {submitting ? (
                <>
                  <span className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />
                  {t("common.allocating")}
                </>
              ) : (
                <>
                  <SparkleIcon size={15} />
                  {t("common.runAllocation")}
                </>
              )}
            </button>
            <p className="mt-2.5 mb-0 flex gap-1.5 text-xs leading-relaxed text-muted">
              <span className="mt-px flex-none">
                <InfoIcon size={13} />
              </span>
              {selected.size === 0
                ? "Select at least one county."
                : `${formatNumber(totalDoses)} doses across ${selected.size - missingForecast.length} ${
                    selected.size - missingForecast.length === 1 ? "county" : "counties"
                  }. The run is saved and logged under your name.`}
            </p>
          </Card>
        </form>
      )}

      {username && previewCounties.length > 0 && (!created || ranWith?.key !== previewKey) && (
        <Card>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="m-0 text-[0.95rem] font-semibold text-text">
                {created ? "Preview with your new settings" : "Live preview"}
                <span className="ml-2 rounded-full bg-panel-muted px-2 py-0.5 align-middle text-[0.7rem] font-semibold text-muted">
                  not saved
                </span>
              </h3>
              <p className="mt-1 mb-0 text-[0.8125rem] text-muted">
                {previewSummary && previewRun
                  ? `${formatNumber(previewRun.totalAllocated)} of ${formatNumber(totalDoses)} doses to ${previewSummary.funded.length} of ${previewCounties.length} ${
                      previewCounties.length === 1 ? "county" : "counties"
                    }${maxSharePct < 100 ? ` · capped at ${maxSharePct}%` : " · no cap"}. Updates as you change the supply, cap or counties.`
                  : "The split the optimiser would make with these settings."}
              </p>
            </div>
            <span aria-live="polite" className={`inline-flex items-center gap-1.5 text-xs text-muted transition-opacity ${previewStale ? "opacity-100" : "opacity-0"}`}>
              <span className="size-1.5 animate-pulse rounded-full bg-accent" />
              {previewStale ? "Updating…" : ""}
            </span>
          </div>
          {previewError && <p className={FORM_BANNER_ERROR_CLASS}>Preview unavailable: {previewError}</p>}
          {previewSummary && previewSummary.funded.length === 1 && previewCounties.length > 1 && maxSharePct >= 100 && (
            <div className={`${BANNER_WARNING_CLASS} flex flex-wrap items-center justify-between gap-3`}>
              <span>With no cap, every dose goes to {previewSummary.top?.county_name}.</span>
              <button type="button" className={btnClass("secondary", { sm: true })} onClick={() => setMaxSharePct(SUGGESTED_CAP)}>
                Cap at {SUGGESTED_CAP}%
              </button>
            </div>
          )}
          <div className={`transition-opacity ${previewStale ? "opacity-60" : ""}`}>
            {previewRun ? <RunLines run={previewRun} /> : <div className="h-24 animate-pulse rounded-lg bg-panel-muted" />}
          </div>
        </Card>
      )}

      {created && (
        <section id="allocation-result" className="scroll-mt-6">
          {created.length === 0 ? (
            <p className={FORM_BANNER_ERROR_CLASS}>
              <AlertIcon size={14} /> No allocations were created — do the selected counties have a stored forecast?{" "}
              <Link to="/generate-forecast">Generate forecasts</Link>
            </p>
          ) : (
            run &&
            summary &&
            ranWith && (
              <Card>
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="grid size-9 flex-none place-items-center rounded-full bg-risk-low-soft text-risk-low">
                      <CheckCircleIcon size={18} />
                    </span>
                    <div>
                      <h3 className="m-0 text-base font-bold text-text">
                        Allocated {formatNumber(allocatedTotal)} doses across {created.length} {created.length === 1 ? "county" : "counties"}
                      </h3>
                      <p className="mt-1 mb-0 text-[0.8125rem] text-muted">
                        {summary.funded.length} funded · {((allocatedTotal / ranWith.doses) * 100).toFixed(0)}% of{" "}
                        {formatNumber(ranWith.doses)} available used
                        {ranWith.capPct < 100 ? ` · capped at ${ranWith.capPct}% per county` : " · no cap"}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link className={btnClass("secondary", { sm: true, className: "no-underline" })} to="/allocations">
                      View on Vaccine Allocation
                    </Link>
                  </div>
                </div>

                {summary.funded.length === 1 && created.length > 1 && ranWith.capPct >= 100 && (
                  <div className={`${BANNER_WARNING_CLASS} flex flex-wrap items-center justify-between gap-3`}>
                    <span>
                      Every dose went to {summary.top?.county_name}. Cap the share per county to spread supply, then run again.
                    </span>
                    <button
                      type="button"
                      className={btnClass("secondary", { sm: true })}
                      onClick={() => {
                        setMaxSharePct(SUGGESTED_CAP);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                    >
                      Set cap to {SUGGESTED_CAP}%
                    </button>
                  </div>
                )}

                <RunLines run={run} />
              </Card>
            )
          )}
        </section>
      )}
    </div>
  );
}
