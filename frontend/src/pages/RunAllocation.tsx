import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { api, County, ForecastRun, mlApi, VaccineAllocation } from "../api/client";
import Card from "../components/Card";
import CountyPicker from "../components/CountyPicker";
import { CheckCircleIcon, DownloadIcon, InfoIcon, SparkleIcon, UserIcon } from "../components/icons";
import LabeledSlider from "../components/LabeledSlider";
import AllocationInsights from "../components/runAllocation/AllocationInsights";
import ConfirmRunDialog from "../components/runAllocation/ConfirmRunDialog";
import DataChecks from "../components/runAllocation/DataChecks";
import type { DeliveryPlan } from "../components/simulations/AllocationSimulator";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { dataChecks, diffAgainst } from "../lib/allocationChecks";
import { exportRows, summaryHtml, type ExportLine, type ExportMeta } from "../lib/allocationExport";
import { groupAllocationRuns, type AllocationRun } from "../lib/allocationRuns";
import { latestForecastByCounty } from "../lib/analytics";
import { useAuth } from "../lib/auth";
import { BANNER_WARNING_CLASS, FORM_BANNER_ERROR_CLASS } from "../lib/bannerClasses";
import { btnClass } from "../lib/buttonClasses";
import { downloadCsv } from "../lib/csv";
import { deliveryBatches } from "../lib/deliveryBatches";
import { FIELD_HINT_CLASS, FIELD_INPUT_CLASS, FIELD_LABEL_CLASS } from "../lib/fieldClasses";
import { formatCompact, formatNumber, formatPeriod, formatRelativeTime } from "../lib/format";
import { useLanguage } from "../lib/i18n";
import { TEST_ACCOUNTS } from "../lib/testRuns";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addWeeksIso(iso: string, weeks: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

const DOSE_PRESETS = [10000, 50000, 100000, 250000];
const FLOOR_PRESETS = [0, 1000, 2500, 5000];
const SUGGESTED_CAP = 40;

interface Settings {
  doses: number;
  capPct: number;
  floor: number;
  periodStart: string;
  key: string;
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={
        "cursor-pointer rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums transition-colors " +
        (active ? "border-accent bg-accent-soft text-accent-text" : "border-border bg-panel text-text-secondary hover:border-border-strong")
      }
    >
      {children}
    </button>
  );
}

/** A numbered step heading, so the page reads top to bottom as choose → set → review. */
function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span
        className={`grid size-6 flex-none place-items-center rounded-full text-xs font-bold ${done ? "bg-accent text-white" : "bg-panel-muted text-text-secondary"}`}
        aria-hidden="true"
      >
        {n}
      </span>
      <h3 className="m-0 text-[0.95rem] font-semibold text-text">{title}</h3>
      {children}
    </div>
  );
}

export default function RunAllocation() {
  const { t } = useLanguage();
  const { username } = useAuth();
  const [counties, setCounties] = useState<County[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [latestForecast, setLatestForecast] = useState<Map<number, ForecastRun>>(new Map());
  // Saved runs, newest first. The preview compares against the newest; a
  // just-saved result against the one before it.
  const [history, setHistory] = useState<AllocationRun[]>([]);
  const [totalDoses, setTotalDoses] = useState(50000);
  const [periodStart, setPeriodStart] = useState(todayIso());
  const [maxSharePct, setMaxSharePct] = useState(100);
  const [floor, setFloor] = useState(0);
  const [plan, setPlan] = useState<DeliveryPlan>({ batches: "3", interval: "2" });
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<VaccineAllocation[] | null>(null);
  // Settings the shown result was run with — the controls may have moved since.
  const [ranWith, setRanWith] = useState<Settings | null>(null);
  const [printNote, setPrintNote] = useState<string | null>(null);

  // Live preview: the optimiser's split for the current settings, computed by
  // calling ml_service's /allocate directly with exactly what the backend's
  // AllocationGenerationService would send (each county's latest stored
  // forecast + population + cap + floor). /allocate only computes; saving
  // happens only through "Run allocation" → "Confirm and save".
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
    api
      .listAllAllocations()
      .then((rows) => setHistory(groupAllocationRuns(rows)))
      .catch(() => undefined);
  }, []);

  const checks = useMemo(() => dataChecks(counties, selected, latestForecast), [counties, selected, latestForecast]);

  // Counties the optimiser actually works with: selected and with a forecast.
  const previewCounties = useMemo(
    () => counties.filter((c) => selected.has(c.id) && latestForecast.has(c.id)),
    [counties, selected, latestForecast],
  );
  const risk = useMemo(
    () => Object.fromEntries(previewCounties.map((c) => [c.id, latestForecast.get(c.id)?.risk_score ?? 0.5])),
    [previewCounties, latestForecast],
  );
  const floorNeeded = previewCounties.reduce((n, c) => n + Math.min(floor, c.population ?? 0), 0);
  const floorTooHigh = floor > 0 && floorNeeded > totalDoses;

  const previewKey = `${previewCounties.map((c) => c.id).join(",")}|${totalDoses}|${maxSharePct}|${floor}|${periodStart}`;
  const debouncedKey = useDebouncedValue(previewKey, 300);

  useEffect(() => {
    if (!username || previewCounties.length === 0 || totalDoses <= 0 || floorTooHigh) {
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
        min_doses_per_county: floor,
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
        // Shaped like saved rows so the same views can draw it.
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
      .catch(
        (err) =>
          id === previewRequest.current &&
          setPreviewError(err instanceof Error ? err.message.replace(/^Request to .*? — /, "") : "Preview failed"),
      )
      .finally(() => id === previewRequest.current && setPreviewing(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedKey, username]);

  const previewRun = preview && preview.length > 0 ? { ...groupAllocationRuns(preview)[0], supply: totalDoses } : null;
  const previewStale = previewing || debouncedKey !== previewKey;

  const run = created && created.length > 0 ? groupAllocationRuns(created)[0] : null;
  const showPreview = previewCounties.length > 0 && (!created || ranWith?.key !== previewKey);
  // Compare with real work, not the e2e suite's automated runs — unless the
  // test account itself is signed in.
  const comparable = history.filter((r) => (username && TEST_ACCOUNTS.has(username)) || !(r.user && TEST_ACCOUNTS.has(r.user)));
  const savedKey = run?.key;
  const previousForPreview = comparable[0] ?? null;
  // The saved result compares with the run before it.
  const previousForResult = created ? (comparable.find((r) => r.key !== savedKey) ?? null) : null;

  const blocked = checks.filter((c) => c.severity === "block");
  const warnings = checks.filter((c) => c.severity === "warn");
  const canReview = !!previewRun && !previewStale && !previewError && !floorTooHigh && selected.size > 0 && totalDoses > 0;

  const openReview = (e: FormEvent) => {
    e.preventDefault();
    if (selected.size === 0) {
      setError("Select at least one county.");
      return;
    }
    if (!canReview) return;
    setError(null);
    setConfirming(true);
  };

  const save = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.generateAllocations({
        total_available_doses: totalDoses,
        county_ids: [...selected],
        period_start: periodStart,
        period_end: addWeeksIso(periodStart, 4),
        max_share_per_county: maxSharePct / 100,
        min_doses_per_county: floor,
      });
      setCreated(res);
      setRanWith({ doses: totalDoses, capPct: maxSharePct, floor, periodStart, key: previewKey });
      if (res.length) setHistory((h) => [groupAllocationRuns(res)[0], ...h]);
      setConfirming(false);
      requestAnimationFrame(() => document.getElementById("allocation-result")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^Request to .*? — /, "") : "Failed to run allocation");
      setConfirming(false);
    } finally {
      setSubmitting(false);
    }
  };

  const cancelConfirm = useCallback(() => setConfirming(false), []);
  const leaveOut = (countyId: number) =>
    setSelected((s) => {
      const next = new Set(s);
      next.delete(countyId);
      return next;
    });

  // --- Export (saved result) ---
  const exportInputs = (): { lines: ExportLine[]; meta: ExportMeta; batches: ReturnType<typeof deliveryBatches> } | null => {
    if (!run || !ranWith) return null;
    const byId = new Map(counties.map((c) => [c.id, c]));
    const lines: ExportLine[] = run.lines.map((l) => ({
      county: l.county_name,
      code: byId.get(l.county)?.code ?? String(l.county),
      population: byId.get(l.county)?.population ?? null,
      risk: l.risk,
      doses: l.recommended_doses,
      rationale: l.rationale,
    }));
    const batches = deliveryBatches(
      lines.map((l) => ({ code: l.code, name: l.county, doses: l.doses, risk: l.risk ?? 0 })),
      Number(plan.batches),
    );
    const meta: ExportMeta = {
      periodStart: run.periodStart,
      periodEnd: run.periodEnd,
      supply: ranWith.doses,
      capPct: ranWith.capPct,
      floor: ranWith.floor,
      runBy: run.user,
      generatedAt: run.generatedAt,
      intervalWeeks: Number(plan.interval),
    };
    return { lines, meta, batches };
  };

  const downloadResultCsv = () => {
    const x = exportInputs();
    if (!x) return;
    const rows = exportRows(x.lines, x.batches, x.meta);
    downloadCsv(`allocation-${x.meta.periodStart}.csv`, rows, Object.keys(rows[0]) as (keyof (typeof rows)[number])[]);
  };

  const printSummary = () => {
    const x = exportInputs();
    if (!x) return;
    const html = summaryHtml(x.lines, x.batches, x.meta);
    const win = window.open("", "_blank");
    if (!win) {
      setPrintNote("Your browser blocked the print window — allow pop-ups for this site and try again.");
      return;
    }
    setPrintNote(null);
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  };

  // --- Confirmation contents ---
  const confirmFacts = previewRun
    ? (() => {
        const funded = previewRun.lines.filter((l) => l.recommended_doses > 0);
        const top = [...funded].sort((a, b) => b.recommended_doses - a.recommended_doses)[0];
        return [
          { label: "Period", value: formatPeriod(periodStart, addWeeksIso(periodStart, 4)) },
          { label: "Doses", value: `${formatNumber(previewRun.totalAllocated)} of ${formatNumber(totalDoses)}` },
          { label: "Counties funded", value: `${funded.length} of ${previewRun.lines.length}` },
          {
            label: "Largest share",
            value: top ? `${top.county_name} · ${((top.recommended_doses / Math.max(1, previewRun.totalAllocated)) * 100).toFixed(0)}%` : "—",
          },
          { label: "Cap per county", value: maxSharePct >= 100 ? "No cap" : `${maxSharePct}%` },
          { label: "Minimum per county", value: floor > 0 ? formatNumber(floor) : "None" },
        ];
      })()
    : [];
  const confirmCautions = (() => {
    const out: string[] = [];
    const skipped = [...new Set(blocked.map((c) => c.county.name))];
    if (skipped.length) out.push(`${skipped.join(", ")} ${skipped.length === 1 ? "is" : "are"} skipped (missing forecast or population).`);
    for (const w of warnings) out.push(`${w.county.name}: ${w.detail}`);
    if (previewRun && previewRun.totalAllocated < totalDoses) out.push(`${formatNumber(totalDoses - previewRun.totalAllocated)} doses stay unallocated.`);
    if (previewRun && previousForPreview) {
      const moved = diffAgainst(previousForPreview, new Map(previewRun.lines.map((l) => [l.county_name, l.recommended_doses]))).reduce(
        (n, r) => n + Math.max(r.delta, 0),
        0,
      );
      if (moved > 0) out.push(`${formatNumber(moved)} doses move between counties compared with the last run (${formatRelativeTime(previousForPreview.generatedAt)}).`);
    }
    if (maxSharePct >= 100 && previewRun && previewRun.lines.filter((l) => l.recommended_doses > 0).length === 1 && previewRun.lines.length > 1)
      out.push("With no cap, every dose goes to a single county.");
    return out;
  })();

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
        <form onSubmit={openReview} className="grid items-start gap-5 min-[1101px]:grid-cols-[minmax(0,1fr)_360px]">
          <Card>
            <Step n={1} title="Choose counties" done={previewCounties.length > 0}>
              <span className="ml-auto text-xs text-muted">
                {previewCounties.length} of {counties.length} will be considered
              </span>
            </Step>
            <p className="mt-0 mb-3 text-[0.8125rem] text-muted">Each shows the latest forecast risk the optimiser will use.</p>
            <CountyPicker
              counties={counties}
              selected={selected}
              onChange={setSelected}
              hint={(c) => {
                const f = latestForecast.get(c.id);
                return f ? `risk ${Math.round(f.risk_score * 100)}% · ${formatRelativeTime(f.generated_at)}` : "no forecast — skipped";
              }}
            />
            <DataChecks checks={checks} onLeaveOut={leaveOut} />
          </Card>

          <Card className="min-[1101px]:sticky min-[1101px]:top-20">
            <Step n={2} title="Set the supply" done={totalDoses > 0 && !floorTooHigh} />

            <label className="mb-2 flex flex-col gap-1.5 text-[0.8125rem]">
              <span className={FIELD_LABEL_CLASS}>Doses available</span>
              <input
                type="number"
                className={`${FIELD_INPUT_CLASS} tabular-nums`}
                min={1}
                step={1}
                value={totalDoses}
                onChange={(e) => setTotalDoses(Math.max(0, Math.round(Number(e.target.value) || 0)))}
              />
            </label>
            <div className="mb-4 flex flex-wrap gap-1.5">
              {DOSE_PRESETS.map((d) => (
                <Chip key={d} active={totalDoses === d} onClick={() => setTotalDoses(d)}>
                  {formatCompact(d)}
                </Chip>
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
                  ? "No cap: the optimiser can put every dose into the single highest-risk county."
                  : `No county gets more than ${maxSharePct}% (${formatNumber(Math.floor((totalDoses * maxSharePct) / 100))} doses), so supply spreads.`
              }
            />
            {maxSharePct >= 100 && (
              <button type="button" className={btnClass("secondary", { sm: true, className: "-mt-1 mb-4" })} onClick={() => setMaxSharePct(SUGGESTED_CAP)}>
                Spread it: cap at {SUGGESTED_CAP}%
              </button>
            )}

            <div className="mb-4 text-[0.8125rem]">
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <label htmlFor="run-floor" className={FIELD_LABEL_CLASS}>
                  Minimum per county
                </label>
                <div className="w-[110px] flex-none">
                  <input
                    id="run-floor"
                    type="number"
                    min={0}
                    step={1}
                    value={floor || ""}
                    placeholder="None"
                    onChange={(e) => setFloor(Math.max(0, Math.round(Number(e.target.value) || 0)))}
                    className={`${FIELD_INPUT_CLASS} text-right tabular-nums`}
                    aria-describedby="run-floor-hint"
                    aria-invalid={floorTooHigh}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {FLOOR_PRESETS.map((f) => (
                  <Chip key={f} active={floor === f} onClick={() => setFloor(f)}>
                    {f === 0 ? "None" : formatCompact(f)}
                  </Chip>
                ))}
              </div>
              <p id="run-floor-hint" className={`mt-1.5 mb-0 text-[0.71875rem] ${floorTooHigh ? "font-medium text-risk-high" : "text-muted"}`}>
                {floorTooHigh
                  ? `Needs ${formatNumber(floorNeeded)} doses for ${previewCounties.length} counties — more than the ${formatNumber(totalDoses)} available.`
                  : floor > 0
                    ? `Guarantees every county doses first: ${formatNumber(floorNeeded)} (${totalDoses ? Math.round((floorNeeded / totalDoses) * 100) : 0}% of supply), the rest by risk.`
                    : "An equity floor: every county gets at least this many (or its population, if smaller)."}
              </p>
            </div>

            {error && <p className={FORM_BANNER_ERROR_CLASS}>{error}</p>}

            <button type="submit" className={btnClass("primary", { block: true })} disabled={!canReview || submitting}>
              <SparkleIcon size={15} />
              {t("common.runAllocation")}
            </button>
            <p className="mt-2.5 mb-0 flex gap-1.5 text-xs leading-relaxed text-muted">
              <span className="mt-px flex-none">
                <InfoIcon size={13} />
              </span>
              {selected.size === 0
                ? "Select at least one county."
                : previewStale && previewCounties.length > 0
                  ? "Updating the preview…"
                  : `You'll review the split before it's saved. ${formatNumber(totalDoses)} doses across ${previewCounties.length} ${
                      previewCounties.length === 1 ? "county" : "counties"
                    }.`}
            </p>
          </Card>
        </form>
      )}

      {username && showPreview && (
        <Card>
          <Step n={3} title={created ? "Preview with your new settings" : "Review the split"}>
            <span className="rounded-full bg-panel-muted px-2 py-0.5 text-[0.7rem] font-semibold text-muted">not saved</span>
            <span
              aria-live="polite"
              className={`ml-auto inline-flex items-center gap-1.5 text-xs text-muted transition-opacity ${previewStale ? "opacity-100" : "opacity-0"}`}
            >
              <span className="size-1.5 animate-pulse rounded-full bg-accent" />
              {previewStale ? "Updating…" : ""}
            </span>
          </Step>
          <p className="mt-0 mb-4 text-[0.8125rem] text-muted">
            What the optimiser would do with these settings. Everything here updates as you change counties, supply, cap or minimum.
          </p>
          {floorTooHigh && <p className={BANNER_WARNING_CLASS}>Lower the minimum per county (or add doses) to see a split.</p>}
          {previewError && !floorTooHigh && <p className={FORM_BANNER_ERROR_CLASS}>Preview unavailable: {previewError}</p>}
          {previewRun ? (
            <AllocationInsights
              run={previewRun}
              counties={previewCounties}
              supply={totalDoses}
              capPct={maxSharePct}
              floor={floor}
              previous={previousForPreview}
              risk={risk}
              plan={plan}
              onPlanChange={setPlan}
              busy={previewStale}
              onRaiseCap={setMaxSharePct}
            />
          ) : (
            !floorTooHigh && !previewError && <div className="h-24 animate-pulse rounded-lg bg-panel-muted" />
          )}
        </Card>
      )}

      {created && (
        <section id="allocation-result" className="scroll-mt-6">
          {created.length === 0 ? (
            <p className={FORM_BANNER_ERROR_CLASS}>
              No allocations were created — do the selected counties have a stored forecast? <Link to="/generate-forecast">Generate forecasts</Link>
            </p>
          ) : (
            run &&
            ranWith && (
              <Card>
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="grid size-9 flex-none place-items-center rounded-full bg-risk-low-soft text-risk-low">
                      <CheckCircleIcon size={18} />
                    </span>
                    <div>
                      <h3 className="m-0 text-base font-bold text-text">
                        Allocated {formatNumber(run.totalAllocated)} doses across {created.length} {created.length === 1 ? "county" : "counties"}
                      </h3>
                      <p className="mt-1 mb-0 text-[0.8125rem] text-muted">
                        Saved {formatRelativeTime(run.generatedAt)} · {formatPeriod(run.periodStart, run.periodEnd)}
                        {ranWith.capPct < 100 ? ` · capped at ${ranWith.capPct}% per county` : " · no cap"}
                        {ranWith.floor > 0 ? ` · at least ${formatNumber(ranWith.floor)} each` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={btnClass("secondary", { sm: true })} onClick={downloadResultCsv}>
                      <DownloadIcon size={14} /> CSV
                    </button>
                    <button type="button" className={btnClass("secondary", { sm: true })} onClick={printSummary}>
                      Print summary
                    </button>
                    <Link className={btnClass("secondary", { sm: true, className: "no-underline" })} to="/allocations">
                      View on Vaccine Allocation
                    </Link>
                  </div>
                </div>
                {printNote && <p className={BANNER_WARNING_CLASS}>{printNote}</p>}

                <AllocationInsights
                  run={{ ...run, supply: ranWith.doses }}
                  counties={counties.filter((c) => run.lines.some((l) => l.county === c.id))}
                  supply={ranWith.doses}
                  capPct={ranWith.capPct}
                  floor={ranWith.floor}
                  previous={previousForResult}
                  risk={Object.fromEntries(run.lines.map((l) => [l.county, l.risk ?? 0.5]))}
                  plan={plan}
                  onPlanChange={setPlan}
                />
                <p className="mt-4 mb-0 text-xs text-muted">
                  The CSV and printed summary include the delivery schedule shown in the Delivery tab ({plan.batches}{" "}
                  {plan.batches === "1" ? "batch" : "batches"}, every {plan.interval} {plan.interval === "1" ? "week" : "weeks"}).
                </p>
              </Card>
            )
          )}
        </section>
      )}

      {confirming && username && (
        <ConfirmRunDialog
          facts={confirmFacts}
          cautions={confirmCautions}
          username={username}
          submitting={submitting}
          onCancel={cancelConfirm}
          onConfirm={save}
        />
      )}
    </div>
  );
}
