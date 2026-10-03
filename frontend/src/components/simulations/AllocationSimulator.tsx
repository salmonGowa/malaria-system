import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { AllocationResponse, api, County, ForecastRun, mlApi, SimulationStart } from "../../api/client";
import Card from "../Card";
import { KPI_HINT_CLASS, KPI_LABEL_CLASS, KPI_VALUE_CLASS, kpiCardClass } from "../KpiCard";
import LabeledSlider from "../LabeledSlider";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { BANNER_WARNING_CLASS } from "../../lib/bannerClasses";
import { btnClass } from "../../lib/buttonClasses";
import { completionBatch, deliveryBatches } from "../../lib/deliveryBatches";
import { FIELD_INPUT_CLASS } from "../../lib/fieldClasses";
import { formatCompact, formatNumber } from "../../lib/format";
import { useSimText } from "../../lib/i18n/simulations";
import { KENYA_RAINFALL_MM, OUTBREAK_DEFAULTS, toRequest, type OutbreakParams } from "../../lib/outbreakScenario";
import { formatPeople, Segmented, UpdatingBadge } from "./shared";

// Real logic: this calls ml_service's PuLP linear-programming optimiser
// (app/allocation.py) exactly as a production allocation run would. The
// impact and delivery sections layer illustrative estimates on top of it.

const DOSE_PRESETS = [10000, 50000, 100000, 250000];
const DOSES_SLIDER_MAX = 1000000;
const SUGGESTED_CAP_PCT = 40;
const FLOOR_PRESETS = [0, 1000, 2500, 5000];
const IMPACT_HORIZON_WEEKS = 24;
const BATCH_PALETTE = ["#3b82f6", "#8b5cf6", "#db2777", "#f59e0b", "#14b8a6", "#64748b"];

function fillStyle(value: number, min: number, max: number): CSSProperties {
  return { "--fill": `${((value - min) / (max - min)) * 100}%` } as CSSProperties;
}

interface CountyImpact {
  doses: number;
  protectedShare: number;
  without: number;
  with: number;
  averted: number;
  perThousand: number;
  hasCaseData: boolean;
  params: OutbreakParams;
}

export default function AllocationSimulator({ onOpenOutbreak }: { onOpenOutbreak: (params: OutbreakParams) => void }) {
  const st = useSimText();
  const [counties, setCounties] = useState<County[]>([]);
  const [forecastRisk, setForecastRisk] = useState<Map<number, number>>(new Map());
  const [riskOverrides, setRiskOverrides] = useState<Record<number, number>>({});
  const [totalDoses, setTotalDoses] = useState(50000);
  const [maxSharePct, setMaxSharePct] = useState(100);
  const [floor, setFloor] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [result, setResult] = useState<AllocationResponse | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    Promise.all([api.listAllCounties(), api.listAllForecasts()])
      .then(([c, forecasts]: [County[], ForecastRun[]]) => {
        const latest = new Map<number, ForecastRun>();
        for (const f of forecasts) {
          const current = latest.get(f.county);
          if (!current || new Date(f.generated_at) > new Date(current.generated_at)) latest.set(f.county, f);
        }
        const riskMap = new Map<number, number>();
        const defaults: Record<number, number> = {};
        for (const county of c) {
          const risk = latest.get(county.id)?.risk_score ?? 0.5;
          riskMap.set(county.id, risk);
          defaults[county.id] = risk;
        }
        // Fixed order (forecast risk, high first) so rows don't jump around
        // while someone is dragging a slider.
        setCounties([...c].sort((a, b) => (riskMap.get(b.id) ?? 0) - (riskMap.get(a.id) ?? 0)));
        setForecastRisk(riskMap);
        setRiskOverrides(defaults);
      })
      .catch((err) => setLoadError(err.message));
  }, []);

  const debouncedRisk = useDebouncedValue(riskOverrides, 250);
  const debouncedDoses = useDebouncedValue(totalDoses, 250);
  const debouncedShare = useDebouncedValue(maxSharePct, 250);
  const debouncedFloor = useDebouncedValue(floor, 250);

  // The optimiser rejects a floor the supply can't cover; say so up front
  // (in the reader's language) instead of round-tripping a 422.
  const floorNeeded = counties.reduce((n, c) => n + Math.min(debouncedFloor, c.population ?? 0), 0);
  const floorTooHigh = debouncedFloor > 0 && floorNeeded > debouncedDoses;

  useEffect(() => {
    if (counties.length === 0 || floorTooHigh) return;
    const id = ++requestId.current;
    setPending(true);
    const today = new Date().toISOString().slice(0, 10);
    mlApi
      .allocate({
        total_available_doses: debouncedDoses,
        county_forecasts: counties.map((c) => ({
          county_code: c.code,
          forecast_period_start: today,
          forecast_period_end: today,
          predicted_cases: 0,
          risk_score: debouncedRisk[c.id] ?? 0.5,
          model_name: "simulation_input",
          model_version: "n/a",
        })),
        county_populations: Object.fromEntries(counties.map((c) => [c.code, c.population ?? 0])),
        max_share_per_county: debouncedShare / 100,
        min_doses_per_county: debouncedFloor,
      })
      .then((res) => {
        if (id !== requestId.current) return;
        setResult(res);
        setRunError(null);
      })
      .catch(
        (err) =>
          id === requestId.current && setRunError(err instanceof Error ? err.message.replace(/^Request to .*? — /, "") : String(err)),
      )
      .finally(() => id === requestId.current && setPending(false));
  }, [counties, debouncedRisk, debouncedDoses, debouncedShare, debouncedFloor, floorTooHigh]);

  const dosesByCode = useMemo(() => new Map(result?.allocations.map((a) => [a.county_code, a.recommended_doses]) ?? []), [result]);
  const maxDoses = Math.max(1, ...dosesByCode.values());
  const funded = [...dosesByCode.values()].filter((d) => d > 0).length;
  const topCounty = counties.reduce<County | null>(
    (best, c) => ((dosesByCode.get(c.code) ?? 0) > (best ? (dosesByCode.get(best.code) ?? 0) : -1) ? c : best),
    null,
  );
  const topShare =
    result && topCounty && result.total_allocated_doses > 0 ? (dosesByCode.get(topCounty.code) ?? 0) / result.total_allocated_doses : 0;
  const editedCount = counties.filter((c) => riskOverrides[c.id] !== forecastRisk.get(c.id)).length;
  const updating =
    pending ||
    debouncedDoses !== totalDoses ||
    debouncedShare !== maxSharePct ||
    debouncedRisk !== riskOverrides ||
    debouncedFloor !== floor;

  if (loadError) {
    return (
      <Card>
        <p className={BANNER_WARNING_CLASS}>{st("alloc.loadFailed", { error: loadError })}</p>
      </Card>
    );
  }

  return (
    <>
      <Card>
        {/* Supply controls */}
        <div className="mb-5 grid gap-5 rounded-xl border border-border p-4 min-[901px]:grid-cols-2 min-[1281px]:grid-cols-[1.3fr_1fr_1fr]">
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <label htmlFor="sim-total-doses" className="whitespace-nowrap text-[0.8125rem] font-medium text-text-secondary">
                {st("alloc.doses")}
              </label>
              <div className="w-[130px] flex-none">
                <input
                  id="sim-total-doses"
                  type="number"
                  min={0}
                  step={1}
                  value={totalDoses}
                  onChange={(e) => setTotalDoses(Math.max(0, Math.round(Number(e.target.value) || 0)))}
                  className={`${FIELD_INPUT_CLASS} text-right tabular-nums`}
                />
              </div>
            </div>
            <input
              type="range"
              className="range-input"
              aria-label={st("alloc.doses")}
              min={0}
              max={DOSES_SLIDER_MAX}
              step={5000}
              value={Math.min(totalDoses, DOSES_SLIDER_MAX)}
              onChange={(e) => setTotalDoses(Number(e.target.value))}
              style={fillStyle(Math.min(totalDoses, DOSES_SLIDER_MAX), 0, DOSES_SLIDER_MAX)}
            />
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {DOSE_PRESETS.map((d) => (
                <Chip key={d} active={totalDoses === d} onClick={() => setTotalDoses(d)}>
                  {formatCompact(d)}
                </Chip>
              ))}
            </div>
          </div>
          <LabeledSlider
            label={st("alloc.maxShare")}
            value={maxSharePct}
            onChange={setMaxSharePct}
            min={10}
            max={100}
            step={5}
            formatValue={(v) => (v >= 100 ? st("alloc.noCap") : `${v}%`)}
            hint={st("alloc.maxShareHint")}
          />
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <label htmlFor="sim-floor" className="text-[0.8125rem] font-medium text-text-secondary">
                {st("alloc.floor")}
              </label>
              <div className="w-[110px] flex-none">
                <input
                  id="sim-floor"
                  type="number"
                  min={0}
                  step={1}
                  value={floor || ""}
                  placeholder={st("alloc.floorNone")}
                  onChange={(e) => setFloor(Math.max(0, Math.round(Number(e.target.value) || 0)))}
                  className={`${FIELD_INPUT_CLASS} text-right tabular-nums`}
                  aria-describedby="sim-floor-hint"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {FLOOR_PRESETS.map((f) => (
                <Chip key={f} active={floor === f} onClick={() => setFloor(f)}>
                  {f === 0 ? st("alloc.floorNone") : formatCompact(f)}
                </Chip>
              ))}
            </div>
            <p id="sim-floor-hint" className="mt-1.5 mb-0 text-[0.71875rem] text-muted">
              {floor > 0 && counties.length
                ? st("alloc.floorUses", { needed: formatCompact(floorNeeded), pct: totalDoses ? Math.round((floorNeeded / totalDoses) * 100) : 0 })
                : st("alloc.floorHint")}
            </p>
          </div>
        </div>

        {floorTooHigh && (
          <p className={BANNER_WARNING_CLASS}>
            {st("alloc.floorTooHigh", { floor: formatNumber(debouncedFloor), needed: formatNumber(floorNeeded), available: formatNumber(debouncedDoses) })}
          </p>
        )}
        {runError && !floorTooHigh && <p className={BANNER_WARNING_CLASS}>{st("common.failed", { error: runError })}</p>}

        {result && funded === 1 && maxSharePct >= 100 && topCounty && (
          <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-risk-mid/40 bg-risk-mid-soft px-4 py-3 text-[0.8125rem] text-text-secondary">
            <span className="flex-1">
              <strong className="text-text">{st("alloc.allToOne", { county: topCounty.name })}</strong> {st("alloc.allToOneWhy")}
            </span>
            <button type="button" className={btnClass("secondary", { sm: true })} onClick={() => setMaxSharePct(SUGGESTED_CAP_PCT)}>
              {st("alloc.capAt", { pct: SUGGESTED_CAP_PCT })}
            </button>
            <button type="button" className={btnClass("secondary", { sm: true })} onClick={() => setFloor(1000)}>
              {st("alloc.floorAt", { value: formatCompact(1000) })}
            </button>
          </div>
        )}

        {result && (
          <div className="mb-5 grid gap-3 min-[561px]:grid-cols-3">
            <div className={kpiCardClass()}>
              <div className={KPI_LABEL_CLASS}>{st("alloc.kpiAllocated")}</div>
              <div className={KPI_VALUE_CLASS}>{formatCompact(result.total_allocated_doses)}</div>
              <div className={KPI_HINT_CLASS}>{st("alloc.ofAvailable", { available: formatNumber(result.total_available_doses) })}</div>
            </div>
            <div className={kpiCardClass()}>
              <div className={KPI_LABEL_CLASS}>{st("alloc.kpiCounties")}</div>
              <div className={KPI_VALUE_CLASS}>
                {funded} <span className="text-base font-medium text-muted">{st("alloc.ofCounties", { count: counties.length })}</span>
              </div>
            </div>
            <div className={kpiCardClass(topShare > 0.6 ? "mid" : "neutral")}>
              <div className={KPI_LABEL_CLASS}>{st("alloc.kpiLargest")}</div>
              <div className={KPI_VALUE_CLASS}>{(topShare * 100).toFixed(0)}%</div>
              <div className={KPI_HINT_CLASS}>{topCounty && funded > 0 ? topCounty.name : "—"}</div>
            </div>
          </div>
        )}

        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="m-0 text-[0.8125rem] text-muted">{st("alloc.dragHint")}</p>
          <div className="flex items-center gap-3">
            <UpdatingBadge show={updating} />
            {editedCount > 0 && (
              <button type="button" className={btnClass("secondary", { sm: true })} onClick={() => setRiskOverrides(Object.fromEntries(forecastRisk))}>
                {st("alloc.resetEdited", { count: editedCount })}
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[640px] border-collapse text-[0.8125rem]">
            <thead>
              <tr className="bg-panel-muted text-left text-xs text-muted">
                <th className="px-4 py-2.5 font-semibold">{st("alloc.col.county")}</th>
                <th className="px-4 py-2.5 font-semibold">{st("alloc.col.risk")}</th>
                <th className="px-4 py-2.5 font-semibold">{st("alloc.col.doses")}</th>
                <th className="px-4 py-2.5 text-right font-semibold">{st("alloc.col.coverage")}</th>
              </tr>
            </thead>
            <tbody className={`transition-opacity duration-200 ${updating ? "opacity-70" : ""}`}>
              {counties.map((c) => {
                const risk = riskOverrides[c.id] ?? 0.5;
                const original = forecastRisk.get(c.id) ?? 0.5;
                const edited = risk !== original;
                const doses = dosesByCode.get(c.code) ?? 0;
                const coverage = c.population ? (doses / c.population) * 100 : null;
                const atFloor = debouncedFloor > 0 && doses > 0 && doses === Math.min(debouncedFloor, c.population ?? 0);
                return (
                  <tr key={c.id} className="border-t border-border">
                    <td className="px-4 py-2.5">
                      <div className="font-semibold text-text">{c.name}</div>
                      <div className="text-xs text-muted">{st("alloc.pop", { population: formatCompact(c.population ?? 0) })}</div>
                    </td>
                    <td className="w-[38%] px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <div className="relative flex-1">
                          <input
                            type="range"
                            className="range-input"
                            aria-label={st("alloc.riskOf", { county: c.name })}
                            min={0}
                            max={1}
                            step={0.01}
                            value={risk}
                            onChange={(e) => setRiskOverrides((prev) => ({ ...prev, [c.id]: Number(e.target.value) }))}
                            style={fillStyle(risk, 0, 1)}
                          />
                          <span
                            aria-hidden="true"
                            title={st("alloc.latestForecast", { risk: original.toFixed(2) })}
                            className="pointer-events-none absolute top-[-3px] h-3 w-0.5 rounded bg-text-secondary/60"
                            style={{ left: `calc(${original * 100}% - 1px)` }}
                          />
                        </div>
                        <span className={`w-9 text-right font-mono text-xs font-semibold ${edited ? "text-accent-text" : "text-text-secondary"}`}>
                          {risk.toFixed(2)}
                        </span>
                        <button
                          type="button"
                          aria-label={st("alloc.resetOne", { county: c.name })}
                          title={st("alloc.resetOneTitle")}
                          onClick={() => setRiskOverrides((prev) => ({ ...prev, [c.id]: original }))}
                          className={`grid size-6 cursor-pointer place-items-center rounded-md border-0 bg-transparent text-muted hover:bg-panel-muted hover:text-text ${edited ? "visible" : "invisible"}`}
                        >
                          ↺
                        </button>
                      </div>
                    </td>
                    <td className="w-[34%] px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-panel-muted">
                          <div
                            className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
                            style={{ width: `${(doses / maxDoses) * 100}%` }}
                          />
                        </div>
                        <span className={`w-14 text-right font-semibold tabular-nums ${doses > 0 ? "text-text" : "text-muted"}`}>
                          {doses > 0 ? formatCompact(doses) : "0"}
                        </span>
                      </div>
                      {atFloor && <div className="mt-0.5 text-[0.7rem] text-muted">{st("alloc.atFloor")}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">
                      {coverage !== null ? `${coverage < 0.1 && coverage > 0 ? "<0.1" : coverage.toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 mb-0 text-xs text-muted">
          {st("alloc.footer")} <Link to="/run-allocation">{st("alloc.footerLink")}</Link>.
        </p>
      </Card>

      {result && result.total_allocated_doses > 0 && (
        <>
          <ImpactPanel counties={counties} dosesByCode={dosesByCode} allocating={updating} onOpenOutbreak={onOpenOutbreak} />
          <DeliveryPanel counties={counties} dosesByCode={dosesByCode} risk={debouncedRisk} />
        </>
      )}
    </>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
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

// --- What the doses buy ----------------------------------------------------
// For each funded county: the outbreak simulator run twice — without the
// vaccine and with (doses / population x efficacy) protected from week 0 —
// started from the county's own cases and rainfall where it has them.

function ImpactPanel({
  counties,
  dosesByCode,
  allocating,
  onOpenOutbreak,
}: {
  counties: County[];
  dosesByCode: Map<string, number>;
  allocating: boolean;
  onOpenOutbreak: (params: OutbreakParams) => void;
}) {
  const st = useSimText();
  const [efficacy, setEfficacy] = useState(0.4);
  const [beta, setBeta] = useState(0.35);
  const [otherCoverage, setOtherCoverage] = useState(0.3);
  const [impact, setImpact] = useState<Map<string, CountyImpact>>(new Map());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const starts = useRef(new Map<number, SimulationStart | null>());
  const requestId = useRef(0);

  const settings = useMemo(() => ({ efficacy, beta, otherCoverage, dosesByCode }), [efficacy, beta, otherCoverage, dosesByCode]);
  const debounced = useDebouncedValue(settings, 400);

  useEffect(() => {
    const fundedCounties = counties.filter((c) => (debounced.dosesByCode.get(c.code) ?? 0) > 0 && (c.population ?? 0) > 0);
    const id = ++requestId.current;
    setPending(true);

    const startFor = async (c: County) => {
      if (!starts.current.has(c.id)) {
        starts.current.set(c.id, await api.simulationStart(c.id).catch(() => null));
      }
      return starts.current.get(c.id) ?? null;
    };

    Promise.all(
      fundedCounties.map(async (c) => {
        const population = c.population ?? 0;
        const doses = debounced.dosesByCode.get(c.code) ?? 0;
        const start = await startFor(c);
        const protectedShare = Math.min(doses / population, 1) * debounced.efficacy;
        const base: OutbreakParams = {
          ...OUTBREAK_DEFAULTS,
          population,
          initialInfectious: start?.initial_infectious ?? Math.max(1, Math.round(population * 0.001)),
          transmissionRate: debounced.beta,
          interventionCoverage: debounced.otherCoverage,
          horizonWeeks: IMPACT_HORIZON_WEEKS,
          seasonal: Boolean(start?.seasonal_rainfall_mm),
          rainfall: start?.seasonal_rainfall_mm ?? KENYA_RAINFALL_MM,
          startMonth: start?.start_month ?? OUTBREAK_DEFAULTS.startMonth,
          countyId: c.id,
          countyName: c.name,
        };
        const vaccinated = { ...base, vaccineProtected: Math.min(protectedShare, 0.95) };
        const [without, withVaccine] = await Promise.all([mlApi.simulate(toRequest(base)), mlApi.simulate(toRequest(vaccinated))]);
        const averted = Math.max(0, without.total_projected_cases - withVaccine.total_projected_cases);
        return [
          c.code,
          {
            doses,
            protectedShare,
            without: without.total_projected_cases,
            with: withVaccine.total_projected_cases,
            averted,
            perThousand: (averted / doses) * 1000,
            hasCaseData: Boolean(start),
            params: vaccinated,
          },
        ] as const;
      }),
    )
      .then((entries) => {
        if (id !== requestId.current) return;
        setImpact(new Map(entries));
        setError(null);
      })
      .catch((err) => id === requestId.current && setError(err instanceof Error ? err.message : String(err)))
      .finally(() => id === requestId.current && setPending(false));
  }, [counties, debounced]);

  const rows = counties
    .map((c) => ({ county: c, impact: impact.get(c.code) }))
    .filter((r): r is { county: County; impact: CountyImpact } => Boolean(r.impact))
    .sort((a, b) => b.impact.perThousand - a.impact.perThousand);
  const totalAverted = rows.reduce((n, r) => n + r.impact.averted, 0);
  const totalDoses = rows.reduce((n, r) => n + r.impact.doses, 0);
  const best = rows[0];
  const maxPerThousand = Math.max(1, ...rows.map((r) => r.impact.perThousand));
  const busy = pending || allocating || debounced !== settings;
  const missingData = rows.filter((r) => !r.impact.hasCaseData).length;

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="m-0 text-[0.95rem] font-semibold text-text">{st("impact.title")}</h3>
          <p className="mt-0.5 mb-0 max-w-[70ch] text-[0.8125rem] text-muted">{st("impact.subtitle", { weeks: IMPACT_HORIZON_WEEKS })}</p>
        </div>
        <UpdatingBadge show={busy} />
      </div>

      <div className="mb-5 grid gap-x-5 rounded-xl border border-border p-4 min-[901px]:grid-cols-3">
        <LabeledSlider
          label={st("impact.efficacy")}
          value={efficacy}
          onChange={setEfficacy}
          min={0.1}
          max={0.9}
          step={0.05}
          formatValue={(v) => `${Math.round(v * 100)}%`}
          hint={st("impact.efficacyHint")}
        />
        <LabeledSlider
          label={st("lever.beta")}
          value={beta}
          onChange={setBeta}
          min={0.05}
          max={1.2}
          step={0.01}
          formatValue={(v) => st("unit.perDay", { value: v.toFixed(2) })}
          hint={st("impact.betaHint")}
        />
        <LabeledSlider
          label={st("impact.otherCoverage")}
          value={otherCoverage}
          onChange={setOtherCoverage}
          min={0}
          max={0.95}
          step={0.01}
          formatValue={(v) => `${Math.round(v * 100)}%`}
          hint={st("impact.otherCoverageHint")}
        />
      </div>

      {error && <p className={BANNER_WARNING_CLASS}>{st("common.failed", { error })}</p>}

      {rows.length > 0 && (
        <>
          <div className="mb-5 grid gap-3 min-[561px]:grid-cols-3">
            <div className={kpiCardClass("low")}>
              <div className={KPI_LABEL_CLASS}>{st("impact.kpiAverted")}</div>
              <div className={KPI_VALUE_CLASS}>{formatPeople(totalAverted)}</div>
              <div className={KPI_HINT_CLASS}>{st("impact.overWeeks", { weeks: IMPACT_HORIZON_WEEKS })}</div>
            </div>
            <div className={kpiCardClass()}>
              <div className={KPI_LABEL_CLASS}>{st("impact.kpiPerThousand")}</div>
              <div className={KPI_VALUE_CLASS}>{totalDoses ? formatNumber(Math.round((totalAverted / totalDoses) * 1000)) : "—"}</div>
              <div className={KPI_HINT_CLASS}>{st("impact.casesAverted")}</div>
            </div>
            <div className={kpiCardClass()}>
              <div className={KPI_LABEL_CLASS}>{st("impact.kpiBest")}</div>
              <div className={KPI_VALUE_CLASS}>{best.county.name}</div>
              <div className={KPI_HINT_CLASS}>{st("impact.perThousandValue", { value: formatNumber(Math.round(best.impact.perThousand)) })}</div>
            </div>
          </div>

          <div className={`relative overflow-x-auto rounded-xl border border-border transition-opacity ${busy ? "opacity-70" : ""}`}>
            <table className="w-full min-w-[720px] border-collapse text-[0.8125rem]">
              <thead>
                <tr className="bg-panel-muted text-left text-xs text-muted">
                  <th className="px-4 py-2.5 font-semibold">{st("alloc.col.county")}</th>
                  <th className="px-4 py-2.5 text-right font-semibold">{st("alloc.col.doses")}</th>
                  <th className="px-4 py-2.5 text-right font-semibold">{st("impact.col.protected")}</th>
                  <th className="px-4 py-2.5 text-right font-semibold">{st("impact.col.averted")}</th>
                  <th className="px-4 py-2.5 font-semibold">{st("impact.col.perThousand")}</th>
                  <th className="px-4 py-2.5">
                    <span className="sr-only">{st("scenario.col.actions")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ county, impact: im }) => (
                  <tr key={county.id} className="border-t border-border">
                    <td className="px-4 py-2.5">
                      <div className="font-semibold text-text">
                        {county.name}
                        {!im.hasCaseData && <span className="text-muted">*</span>}
                      </div>
                      <div className="text-xs text-muted">
                        {st("impact.withoutWith", { without: formatPeople(im.without), with: formatPeople(im.with) })}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">{formatCompact(im.doses)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">
                      {im.protectedShare * 100 < 0.1 ? "<0.1" : (im.protectedShare * 100).toFixed(1)}%
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-text">{formatPeople(im.averted)}</td>
                    <td className="w-[26%] px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-panel-muted">
                          <div className="h-full rounded-full bg-risk-low" style={{ width: `${(im.perThousand / maxPerThousand) * 100}%` }} />
                        </div>
                        <span className="w-12 text-right font-semibold tabular-nums text-text">{formatNumber(Math.round(im.perThousand))}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <button type="button" className={btnClass("secondary", { sm: true })} onClick={() => onOpenOutbreak(im.params)}>
                        {st("impact.open")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 mb-0 text-xs leading-relaxed text-muted">
            {st("impact.footnote")}
            {missingData > 0 && ` ${st("impact.noCaseData")}`}
          </p>
        </>
      )}
    </Card>
  );
}

// --- Delivery schedule -----------------------------------------------------

function DeliveryPanel({
  counties,
  dosesByCode,
  risk,
}: {
  counties: County[];
  dosesByCode: Map<string, number>;
  risk: Record<number, number>;
}) {
  const st = useSimText();
  const [batchCount, setBatchCount] = useState("3");
  const [interval, setIntervalWeeks] = useState("2");

  const batches = useMemo(
    () =>
      deliveryBatches(
        counties.map((c) => ({ code: c.code, name: c.name, doses: dosesByCode.get(c.code) ?? 0, risk: risk[c.id] ?? 0.5 })),
        Number(batchCount),
      ),
    [counties, dosesByCode, risk, batchCount],
  );
  const done = completionBatch(batches);
  const colorOf = new Map(
    counties
      .filter((c) => (dosesByCode.get(c.code) ?? 0) > 0)
      .sort((a, b) => (risk[b.id] ?? 0) - (risk[a.id] ?? 0))
      .map((c, i) => [c.code, BATCH_PALETTE[i % BATCH_PALETTE.length]]),
  );
  const weekOf = (index: number) => index * Number(interval);

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="m-0 text-[0.95rem] font-semibold text-text">{st("delivery.title")}</h3>
          <p className="mt-0.5 mb-0 max-w-[70ch] text-[0.8125rem] text-muted">{st("delivery.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-[190px]">
            <div className="mb-1 text-xs font-semibold text-muted">{st("delivery.batches")}</div>
            <Segmented
              label={st("delivery.batches")}
              value={batchCount}
              onChange={setBatchCount}
              options={["1", "2", "3", "4"].map((v) => ({ value: v, label: v }))}
            />
          </div>
          <div className="w-[190px]">
            <div className="mb-1 text-xs font-semibold text-muted">{st("delivery.every")}</div>
            <Segmented
              label={st("delivery.every")}
              value={interval}
              onChange={setIntervalWeeks}
              options={["1", "2", "4"].map((v) => ({ value: v, label: st("delivery.weeksShort", { weeks: v }) }))}
            />
          </div>
        </div>
      </div>

      <ol className="m-0 grid list-none gap-3 p-0">
        {batches.map((b) => (
          <li key={b.index} className="rounded-xl border border-border p-3">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-[0.8125rem] font-semibold text-text">
                {st("delivery.batch", { n: b.index + 1 })}{" "}
                <span className="font-normal text-muted">· {b.index === 0 ? st("delivery.now") : st("unit.week", { week: weekOf(b.index) })}</span>
              </span>
              <span className="text-xs font-semibold tabular-nums text-text-secondary">{st("delivery.doses", { doses: formatNumber(b.total) })}</span>
            </div>
            <div className="mb-2 flex h-3 gap-px overflow-hidden rounded-full bg-panel-muted" aria-hidden="true">
              {b.items.map((it) => (
                <div key={it.code} style={{ width: `${(it.doses / b.total) * 100}%`, background: colorOf.get(it.code) }} title={`${it.name}: ${formatNumber(it.doses)}`} />
              ))}
            </div>
            <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs text-text-secondary">
              {b.items.map((it) => (
                <li key={it.code} className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ background: colorOf.get(it.code) }} />
                  <span className="font-semibold text-text">{it.name}</span>
                  <span className="tabular-nums">{formatCompact(it.doses)}</span>
                  {done.get(it.code) === b.index ? (
                    <span className="text-risk-low">✓ {st("delivery.complete")}</span>
                  ) : (
                    <span className="text-muted">{st("delivery.continues")}</span>
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      <p className="mt-3 mb-0 text-xs text-muted">{st("delivery.footnote")}</p>
    </Card>
  );
}
