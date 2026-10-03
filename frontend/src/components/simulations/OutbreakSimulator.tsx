import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Area,
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

import {
  api,
  County,
  mlApi,
  SimulationResponse,
  SimulationStart,
} from "../../api/client";
import Card from "../Card";
import ChartTooltip from "../ChartTooltip";
import { InfoIcon } from "../icons";
import {
  KPI_HINT_CLASS,
  KPI_LABEL_CLASS,
  KPI_VALUE_CLASS,
  kpiCardClass,
} from "../KpiCard";
import LabeledSlider from "../LabeledSlider";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { BANNER_WARNING_CLASS } from "../../lib/bannerClasses";
import { btnClass } from "../../lib/buttonClasses";
import { downloadChartPng } from "../../lib/chartExport";
import { AXIS, GRID, LINE_CURSOR } from "../../lib/chartTheme";
import { downloadCsv } from "../../lib/csv";
import { FIELD_INPUT_CLASS } from "../../lib/fieldClasses";
import { formatCompact, formatNumber } from "../../lib/format";
import { useLanguage } from "../../lib/i18n";
import { useSimText, type SimKey } from "../../lib/i18n/simulations";
import {
  decodeScenario,
  encodeScenario,
  KENYA_RAINFALL_MM,
  OUTBREAK_DEFAULTS,
  overCapacity,
  reproductionNumbers,
  toRequest,
  type OutbreakParams,
} from "../../lib/outbreakScenario";
import {
  ControlGroup,
  Delta,
  formatPeople,
  Segmented,
  Toggle,
  UpdatingBadge,
} from "./shared";

// Illustrative model — NOT the trained forecasting model; see ml_service/app/simulation.py.

const MAX_SCENARIOS = 3;
const SECTIONS = ["levers", "place", "seasons", "capacity", "more"] as const;
type Section = (typeof SECTIONS)[number];
const EARLIER_BY_WEEKS = 4;
// Fixed hues distinct from the live run's red/orange/green series.
const SCENARIO_COLORS = ["#3b82f6", "#8b5cf6", "#db2777"];
const SCENARIO_LETTERS = ["A", "B", "C"];

const PRESETS: {
  key: "baseline" | "longRains" | "scaleUp" | "rainsScaleUp";
  transmissionRate: number;
  interventionCoverage: number;
}[] = [
  { key: "baseline", transmissionRate: 0.35, interventionCoverage: 0.3 },
  { key: "longRains", transmissionRate: 0.55, interventionCoverage: 0.3 },
  { key: "scaleUp", transmissionRate: 0.35, interventionCoverage: 0.75 },
  { key: "rainsScaleUp", transmissionRate: 0.55, interventionCoverage: 0.75 },
];

interface SavedScenario {
  id: number;
  name: string;
  color: string;
  params: OutbreakParams;
  result: SimulationResponse;
}

export interface IncomingScenario {
  params: OutbreakParams;
  /** Changes on every hand-off, so sending the same params twice still applies. */
  nonce: number;
}

function monthFormatter(language: string) {
  const fmt = new Intl.DateTimeFormat(language === "sw" ? "sw-KE" : "en-GB", {
    month: "short",
  });
  return (month: number) => fmt.format(new Date(2024, month - 1, 15));
}

/** Calendar month (1-12) a simulated week falls in. */
function monthOfWeek(startMonth: number, week: number) {
  return ((startMonth - 1 + Math.floor((week * 7) / (365.25 / 12))) % 12) + 1;
}

function initialParams(): OutbreakParams {
  if (typeof window === "undefined") return OUTBREAK_DEFAULTS;
  return (
    decodeScenario(new URLSearchParams(window.location.search).get("s")) ??
    OUTBREAK_DEFAULTS
  );
}

export default function OutbreakSimulator({
  incoming,
}: {
  incoming: IncomingScenario | null;
}) {
  const st = useSimText();
  const { language } = useLanguage();
  const monthName = useMemo(() => monthFormatter(language), [language]);

  const [params, setParams] = useState<OutbreakParams>(initialParams);
  const [result, setResult] = useState<SimulationResponse | null>(null);
  const [earlier, setEarlier] = useState<SimulationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [scenarios, setScenarios] = useState<SavedScenario[]>([]);
  const [counties, setCounties] = useState<County[]>([]);
  const [start, setStart] = useState<SimulationStart | null>(null);
  const [startError, setStartError] = useState<{
    countyId: number;
    message: string;
  } | null>(null);
  const [loadingCounty, setLoadingCounty] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("levers");
  const requestId = useRef(0);
  const nextScenarioId = useRef(1);
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .listAllCounties()
      .then((c) =>
        setCounties([...c].sort((a, b) => a.name.localeCompare(b.name))),
      )
      .catch(() => setCounties([]));
  }, []);

  // A scenario handed over from another tab (e.g. the allocation tab's "open in outbreak simulator").
  useEffect(() => {
    if (incoming) setParams(incoming.params);
  }, [incoming]);

  // Keep the "what came from the data" panel in step with the selected county,
  // including one arriving via a share link or a hand-off.
  useEffect(() => {
    if (params.countyId === null || start?.county === params.countyId) return;
    let cancelled = false;
    api
      .simulationStart(params.countyId)
      .then((s) => !cancelled && setStart(s))
      .catch(() => !cancelled && setStart(null));
    return () => {
      cancelled = true;
    };
  }, [params.countyId, start?.county]);

  const debounced = useDebouncedValue(params, 250);
  const earlierStart = Math.max(
    0,
    debounced.interventionStartWeek - EARLIER_BY_WEEKS,
  );
  const compareEarlier = debounced.interventionStartWeek > 0;

  useEffect(() => {
    const id = ++requestId.current;
    setPending(true);
    Promise.all([
      mlApi.simulate(toRequest(debounced)),
      compareEarlier
        ? mlApi.simulate(
            toRequest({
              ...debounced,
              interventionStartWeek: earlierStart,
              uncertainty: false,
            }),
          )
        : null,
    ])
      .then(([res, early]) => {
        if (id !== requestId.current) return; // a newer request superseded this one
        setResult(res);
        setEarlier(early);
        setError(null);
      })
      .catch(
        (err) =>
          id === requestId.current &&
          setError(err instanceof Error ? err.message : String(err)),
      )
      .finally(() => id === requestId.current && setPending(false));
  }, [debounced, compareEarlier, earlierStart]);

  const set =
    <K extends keyof OutbreakParams>(key: K) =>
    (value: OutbreakParams[K]) =>
      setParams((p) => ({ ...p, [key]: value }));

  const selectCounty = (value: string) => {
    setStartError(null);
    if (!value) {
      setParams((p) => ({
        ...p,
        countyId: null,
        countyName: null,
        rainfall: KENYA_RAINFALL_MM,
      }));
      setStart(null);
      return;
    }
    const countyId = Number(value);
    setLoadingCounty(true);
    api
      .simulationStart(countyId)
      .then((s) => {
        setStart(s);
        setParams((p) => ({
          ...p,
          countyId: s.county,
          countyName: s.county_name,
          population: s.population,
          initialInfectious: s.initial_infectious,
          startMonth: s.start_month,
          rainfall: s.seasonal_rainfall_mm ?? KENYA_RAINFALL_MM,
          seasonal: s.seasonal_rainfall_mm !== null,
        }));
      })
      .catch((err) =>
        setStartError({
          countyId,
          message:
            err instanceof Error
              ? err.message.replace(/^Request to .*? — /, "")
              : String(err),
        }),
      )
      .finally(() => setLoadingCounty(false));
  };

  const d = OUTBREAK_DEFAULTS;
  // Dot on a section tab when something in it differs from the defaults, so changed settings stay findable.
  const changed: Record<Section, boolean> = {
    levers: params.model !== d.model || params.interventionStartWeek > 0,
    place:
      params.countyId !== null ||
      params.population !== d.population ||
      params.initialInfectious !== d.initialInfectious ||
      params.horizonWeeks !== d.horizonWeeks,
    seasons: params.seasonal,
    capacity: params.capacityPerWeek > 0,
    more:
      params.incubationDays !== d.incubationDays ||
      params.infectiousDays !== d.infectiousDays ||
      params.vaccineProtected > 0,
  };

  const { before: rBefore, after: rAfter } = reproductionNumbers(params);
  const growing = rAfter > 1;
  const activePreset = PRESETS.find(
    (p) =>
      p.transmissionRate === params.transmissionRate &&
      p.interventionCoverage === params.interventionCoverage,
  );
  const updating = pending || params !== debounced;
  const fromCounty = start && params.countyId === start.county ? start : null;
  const countyEdited =
    fromCounty &&
    (params.population !== fromCounty.population ||
      params.initialInfectious !== fromCounty.initial_infectious);
  const infectiousMax = Math.max(
    1000,
    Math.ceil((params.population * 0.05) / 1000) * 1000,
  );

  const chartData = useMemo(() => {
    if (!result) return [];
    return result.weeks.map((w, i) => {
      const row: Record<string, number | number[] | undefined> = { ...w };
      const band = result.band?.[i];
      if (band) row.band = [band.infectious_low, band.infectious_high];
      for (const s of scenarios)
        row[`s${s.id}`] = s.result.weeks[i]?.infectious;
      return row;
    });
  }, [result, scenarios]);

  const newCases = result?.weeks.map((w) => w.new_cases) ?? [];
  const overRuns = overCapacity(newCases, params.capacityPerWeek);
  const weeksOver = overRuns.reduce((n, r) => n + r.to - r.from + 1, 0);
  const peakNewCases = Math.max(0, ...newCases.slice(1));
  const earlierNewCases = earlier?.weeks.map((w) => w.new_cases) ?? [];
  const earlierWeeksOver = overCapacity(
    earlierNewCases,
    params.capacityPerWeek,
  ).reduce((n, r) => n + r.to - r.from + 1, 0);
  const averted =
    result && earlier
      ? result.total_projected_cases - earlier.total_projected_cases
      : 0;

  const attackRate = result
    ? Math.min(result.total_projected_cases / params.population, 1)
    : 0;
  const reference = scenarios[0];

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice((n) => (n === message ? null : n)), 2500);
  };

  const describe = (p: OutbreakParams) =>
    [
      `β ${p.transmissionRate.toFixed(2)}`,
      st("scenario.coverageFrom", {
        pct: Math.round(p.interventionCoverage * 100),
        week: p.interventionStartWeek,
      }),
      p.model === "vector" ? st("model.vectorShort") : null,
      p.seasonal ? st("scenario.seasons") : null,
      p.countyName,
    ]
      .filter(Boolean)
      .join(" · ");

  const saveScenario = () => {
    if (!result || scenarios.length >= MAX_SCENARIOS) return;
    const used = new Set(scenarios.map((s) => s.color));
    const slot = SCENARIO_COLORS.findIndex((c) => !used.has(c));
    const id = nextScenarioId.current++;
    setScenarios((list) => [
      ...list,
      {
        id,
        name: st("scenario.defaultName", { letter: SCENARIO_LETTERS[slot] }),
        color: SCENARIO_COLORS[slot],
        params,
        result,
      },
    ]);
  };

  const shareLink = async () => {
    const url = new URL(window.location.href);
    url.search = `?s=${encodeScenario(params)}`;
    url.hash = "outbreak";
    try {
      await navigator.clipboard.writeText(url.toString());
      flash(st("share.copied"));
    } catch {
      window.prompt(st("share.copyPrompt"), url.toString());
    }
  };

  const exportCsv = () => {
    if (!result) return;
    const rows = result.weeks.map((w, i) => {
      const row: Record<string, string | number> = {
        week: w.week,
        month: monthName(monthOfWeek(params.startMonth, w.week)),
        susceptible: Math.round(w.susceptible),
        exposed: Math.round(w.exposed),
        infectious: Math.round(w.infectious),
        recovered: Math.round(w.recovered),
        new_cases: Math.round(w.new_cases),
      };
      if (result.band?.[i]) {
        row.infectious_low = Math.round(result.band[i].infectious_low);
        row.infectious_high = Math.round(result.band[i].infectious_high);
      }
      if (params.capacityPerWeek)
        row.treatment_capacity = params.capacityPerWeek;
      for (const s of scenarios)
        row[`infectious_${s.name}`] = Math.round(
          s.result.weeks[i]?.infectious ?? 0,
        );
      return row;
    });
    const slug = (params.countyName ?? "scenario")
      .toLowerCase()
      .replace(/\W+/g, "-");
    downloadCsv(`outbreak-${slug}.csv`, rows, Object.keys(rows[0]));
  };

  const exportPng = async () => {
    const svg = chartRef.current?.querySelector<SVGSVGElement>(
      "svg.recharts-surface",
    );
    if (!svg) return;
    const slug = (params.countyName ?? "scenario")
      .toLowerCase()
      .replace(/\W+/g, "-");
    try {
      await downloadChartPng(
        svg,
        `outbreak-${slug}.png`,
        `${st("chart.title")}${params.countyName ? ` — ${params.countyName}` : ""} · ${describe(params)}`,
      );
    } catch (err) {
      flash(err instanceof Error ? err.message : String(err));
    }
  };

  const weekLabel = (w: number | string) =>
    st("chart.weekLabel", {
      week: w,
      month: monthName(monthOfWeek(params.startMonth, Number(w))),
    });

  return (
    <Card>
      {/* Start from */}
      <div className="mb-5 rounded-xl border border-border bg-panel-muted/60 p-4">
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
          <label className="flex min-w-[220px] flex-col gap-1.5 text-[0.8125rem]">
            <span className="font-medium text-text-secondary">
              {st("start.label")}
            </span>
            <select
              className={FIELD_INPUT_CLASS}
              value={params.countyId ?? ""}
              onChange={(e) => selectCounty(e.target.value)}
              disabled={loadingCounty}
            >
              <option value="">{st("start.hypothetical")}</option>
              {counties.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <div className="min-w-[240px] flex-1 pb-1 text-[0.8125rem] text-text-secondary">
            {loadingCounty ? (
              st("start.loading")
            ) : fromCounty ? (
              <>
                <strong className="text-text">
                  {st("start.fromCounty", { county: fromCounty.county_name })}
                </strong>{" "}
                {st("start.summary", {
                  population: formatCompact(fromCounty.population),
                  infectious: formatNumber(fromCounty.initial_infectious),
                  month: monthName(Number(fromCounty.latest_month.slice(5, 7))),
                  cases: formatNumber(
                    Math.round(fromCounty.latest_month_cases),
                  ),
                })}
                {countyEdited && (
                  <button
                    type="button"
                    className="ml-2 cursor-pointer border-0 bg-transparent p-0 text-[0.8125rem] font-semibold text-accent-text hover:underline"
                    onClick={() =>
                      setParams((p) => ({
                        ...p,
                        population: fromCounty.population,
                        initialInfectious: fromCounty.initial_infectious,
                      }))
                    }
                  >
                    {st("start.restore")}
                  </button>
                )}
              </>
            ) : (
              st("start.hypotheticalHint")
            )}
          </div>
        </div>
        {startError && (
          <p className={`${BANNER_WARNING_CLASS} mt-3 mb-0`}>
            {startError.message}{" "}
            <Link to={`/counties/${startError.countyId}`}>
              {st("start.openCounty")}
            </Link>
          </p>
        )}
        {fromCounty && (
          <details className="mt-2 text-xs text-muted">
            <summary className="cursor-pointer font-semibold text-text-secondary">
              {st("start.whatsFromData")}
            </summary>
            <ul className="mt-1.5 mb-0 list-disc space-y-0.5 pl-5">
              <li>{st("start.assumeCases")}</li>
              <li>
                {st("start.assumeInfectious", { days: params.infectiousDays })}
              </li>
              <li>
                {fromCounty.seasonal_rainfall_mm
                  ? st("start.assumeRain")
                  : st("start.assumeNoRain")}
              </li>
              <li>
                <strong className="font-semibold text-text-secondary">
                  {st("start.assumeBeta")}
                </strong>
              </li>
            </ul>
          </details>
        )}
      </div>

      <div className="grid items-start gap-6 min-[1001px]:grid-cols-[320px_1fr]">
        {/* Controls: presets and save always visible; the rest in short tabbed sections so the panel stays about the chart's height. */}
        <div className="rounded-xl border border-border p-4 min-[1001px]:sticky min-[1001px]:top-24">
          <ControlGroup title={st("controls.presets")}>
            <div className="grid grid-cols-2 gap-2">
              {PRESETS.map((p) => {
                const active = activePreset === p;
                return (
                  <button
                    key={p.key}
                    type="button"
                    title={st(`preset.${p.key}.hint` as SimKey)}
                    aria-pressed={active}
                    onClick={() =>
                      setParams((cur) => ({
                        ...cur,
                        transmissionRate: p.transmissionRate,
                        interventionCoverage: p.interventionCoverage,
                      }))
                    }
                    className={
                      "cursor-pointer rounded-lg border px-2.5 py-2 text-left text-[0.8125rem] font-semibold transition-colors " +
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
                      (active
                        ? "border-accent bg-accent-soft text-accent-text"
                        : "border-border bg-panel text-text-secondary hover:border-border-strong")
                    }
                  >
                    {st(`preset.${p.key}` as SimKey)}
                  </button>
                );
              })}
            </div>
          </ControlGroup>

          <div
            role="tablist"
            aria-label={st("controls.sections")}
            className="mb-4 flex gap-0.5 rounded-lg bg-panel-muted p-1"
          >
            {SECTIONS.map((sec) => {
              const active = section === sec;
              return (
                <button
                  key={sec}
                  id={`outbreak-sec-${sec}`}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls="outbreak-sec-panel"
                  onClick={() => setSection(sec)}
                  className={
                    "relative flex-auto cursor-pointer rounded-md border-0 px-1 py-1.5 text-[0.72rem] font-semibold whitespace-nowrap transition-colors " +
                    "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent " +
                    (active
                      ? "bg-panel text-text shadow-[var(--shadow-sm)]"
                      : "bg-transparent text-muted hover:text-text")
                  }
                >
                  {st(`section.${sec}` as SimKey)}
                  {changed[sec] && (
                    <span
                      className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-accent"
                      aria-label={st("section.changed")}
                    />
                  )}
                </button>
              );
            })}
          </div>
          <div
            id="outbreak-sec-panel"
            role="tabpanel"
            aria-labelledby={`outbreak-sec-${section}`}
            className="min-h-[300px]"
          >
            {section === "levers" && (
              <div>
                <div className="mb-3.5">
                  <Segmented
                    label={st("model.label")}
                    value={params.model}
                    onChange={set("model")}
                    options={[
                      { value: "seir", label: st("model.seir") },
                      { value: "vector", label: st("model.vector") },
                    ]}
                  />
                  <p className="mt-1 mb-0 text-[0.71875rem] text-muted">
                    {st(
                      params.model === "vector"
                        ? "model.vectorHint"
                        : "model.seirHint",
                    )}
                  </p>
                </div>
                <LabeledSlider
                  label={st("lever.beta")}
                  value={params.transmissionRate}
                  onChange={set("transmissionRate")}
                  min={0.05}
                  max={1.2}
                  step={0.01}
                  formatValue={(v) =>
                    st("unit.perDay", { value: v.toFixed(2) })
                  }
                  hint={st("lever.betaHint")}
                />
                <LabeledSlider
                  label={st("lever.coverage")}
                  value={params.interventionCoverage}
                  onChange={set("interventionCoverage")}
                  min={0}
                  max={0.95}
                  step={0.01}
                  formatValue={(v) => `${Math.round(v * 100)}%`}
                  hint={st("lever.coverageHint")}
                />
                <LabeledSlider
                  label={st("lever.startWeek")}
                  value={Math.min(
                    params.interventionStartWeek,
                    params.horizonWeeks,
                  )}
                  onChange={set("interventionStartWeek")}
                  min={0}
                  max={params.horizonWeeks}
                  step={1}
                  formatValue={(v) =>
                    v === 0
                      ? st("lever.startNow")
                      : st("unit.week", { week: v })
                  }
                  hint={st("lever.startWeekHint")}
                />
              </div>
            )}

            {section === "place" && (
              <div>
                <LabeledSlider
                  label={st("setting.population")}
                  value={params.population}
                  onChange={set("population")}
                  min={10000}
                  max={5000000}
                  step={10000}
                  formatValue={formatCompact}
                />
                <LabeledSlider
                  label={st("setting.initial")}
                  value={Math.min(params.initialInfectious, infectiousMax)}
                  onChange={set("initialInfectious")}
                  min={1}
                  max={infectiousMax}
                  step={1}
                  formatValue={formatNumber}
                />
                <LabeledSlider
                  label={st("setting.horizon")}
                  value={params.horizonWeeks}
                  onChange={set("horizonWeeks")}
                  min={4}
                  max={104}
                  step={1}
                  formatValue={(v) => st("unit.weeks", { weeks: v })}
                />
              </div>
            )}

            {section === "seasons" && (
              <div>
                <Toggle
                  label={st("season.toggle")}
                  checked={params.seasonal}
                  onChange={set("seasonal")}
                  hint={
                    params.seasonal
                      ? fromCounty?.seasonal_rainfall_mm
                        ? st("season.sourceCounty", {
                            county: fromCounty.county_name,
                          })
                        : st("season.sourceKenya")
                      : st("season.offHint")
                  }
                />
                {params.seasonal && (
                  <div className="mt-3">
                    <RainStrip
                      rainfall={params.rainfall}
                      startMonth={params.startMonth}
                      horizonWeeks={params.horizonWeeks}
                      monthName={monthName}
                    />
                    <label className="mt-3 flex items-center justify-between gap-3 text-[0.8125rem] text-text-secondary">
                      {st("season.startMonth")}
                      <span className="w-[130px]">
                        <select
                          className={FIELD_INPUT_CLASS}
                          value={params.startMonth}
                          onChange={(e) =>
                            set("startMonth")(Number(e.target.value))
                          }
                        >
                          {Array.from({ length: 12 }, (_, i) => (
                            <option key={i + 1} value={i + 1}>
                              {monthName(i + 1)}
                            </option>
                          ))}
                        </select>
                      </span>
                    </label>
                    <div className="mt-3.5">
                      <LabeledSlider
                        label={st("adv.sensitivity")}
                        value={params.rainfallSensitivity}
                        onChange={set("rainfallSensitivity")}
                        min={0}
                        max={3}
                        step={0.1}
                        formatValue={(v) => `×${v.toFixed(1)}`}
                        hint={st("adv.sensitivityHint")}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {section === "capacity" && (
              <div>
                <label className="flex items-center justify-between gap-3 text-[0.8125rem] text-text-secondary">
                  {st("capacity.label")}
                  <span className="w-[130px]">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      inputMode="numeric"
                      className={`${FIELD_INPUT_CLASS} text-right tabular-nums`}
                      value={params.capacityPerWeek || ""}
                      placeholder={st("capacity.off")}
                      onChange={(e) =>
                        set("capacityPerWeek")(
                          Math.max(0, Math.round(Number(e.target.value) || 0)),
                        )
                      }
                    />
                  </span>
                </label>
                <p className="mt-1 mb-0 text-[0.71875rem] text-muted">
                  {st("capacity.hint")}
                </p>
                {!params.capacityPerWeek && peakNewCases > 0 && (
                  <button
                    type="button"
                    className="mt-1.5 cursor-pointer border-0 bg-transparent p-0 text-xs font-semibold text-accent-text hover:underline"
                    onClick={() =>
                      set("capacityPerWeek")(
                        Math.max(
                          10,
                          Math.round((peakNewCases * 0.6) / 10) * 10,
                        ),
                      )
                    }
                  >
                    {st("capacity.try", {
                      value: formatNumber(
                        Math.max(
                          10,
                          Math.round((peakNewCases * 0.6) / 10) * 10,
                        ),
                      ),
                    })}
                  </button>
                )}
              </div>
            )}

            {section === "more" && (
              <div>
                <LabeledSlider
                  label={st("adv.incubation")}
                  value={params.incubationDays}
                  onChange={set("incubationDays")}
                  min={5}
                  max={20}
                  step={1}
                  formatValue={(v) => st("unit.days", { days: v })}
                  hint={st("adv.incubationHint")}
                />
                <LabeledSlider
                  label={st("adv.infectious")}
                  value={params.infectiousDays}
                  onChange={set("infectiousDays")}
                  min={5}
                  max={30}
                  step={1}
                  formatValue={(v) => st("unit.days", { days: v })}
                  hint={st("adv.infectiousHint")}
                />
                <LabeledSlider
                  label={st("adv.vaccine")}
                  value={params.vaccineProtected}
                  onChange={set("vaccineProtected")}
                  min={0}
                  max={0.8}
                  step={0.01}
                  formatValue={(v) => `${Math.round(v * 100)}%`}
                  hint={st("adv.vaccineHint")}
                />
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            <button
              type="button"
              className={btnClass("primary", { sm: true })}
              disabled={
                !result || updating || scenarios.length >= MAX_SCENARIOS
              }
              onClick={saveScenario}
            >
              {st("scenario.save")}
            </button>
            <button
              type="button"
              className={btnClass("secondary", { sm: true })}
              onClick={() => setParams(OUTBREAK_DEFAULTS)}
            >
              {st("common.reset")}
            </button>
          </div>
          <p className="mt-2 mb-0 text-[0.71875rem] text-muted">
            {scenarios.length >= MAX_SCENARIOS
              ? st("scenario.full", { max: MAX_SCENARIOS })
              : scenarios.length
                ? st("scenario.savedHint", {
                    count: scenarios.length,
                    max: MAX_SCENARIOS,
                  })
                : st("scenario.emptyHint")}
          </p>
        </div>

        {/* Output — first on narrow screens so a slider's effect is visible without scrolling past every control. */}
        <div className="min-w-0 max-[1000px]:order-first">
          <div
            className={
              "mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-4 py-3 " +
              (growing
                ? "border-risk-high/40 bg-risk-high-soft"
                : "border-risk-low/40 bg-risk-low-soft")
            }
          >
            <div>
              <div className="text-xs font-medium text-text-secondary">
                {st("r.label")}
              </div>
              <div
                className={`text-[1.6rem] font-bold leading-tight tabular-nums ${growing ? "text-risk-high" : "text-risk-low"}`}
              >
                R = {rAfter.toFixed(2)}
              </div>
              {params.interventionStartWeek > 0 && (
                <div className="text-xs tabular-nums text-text-secondary">
                  {st("r.before", {
                    r: rBefore.toFixed(2),
                    week: params.interventionStartWeek,
                  })}
                </div>
              )}
            </div>
            <p className="m-0 min-w-[220px] max-w-[56ch] flex-1 text-[0.8125rem] text-text-secondary">
              {growing
                ? st("r.growing", { r: rAfter.toFixed(1) }) +
                  " " +
                  st(rAfter < 1.6 ? "r.close" : "r.far")
                : st("r.shrinking")}
              {params.model === "vector" &&
                params.interventionCoverage > 0 &&
                " " + st("r.vectorNote")}
              {params.seasonal &&
                " " +
                  st("r.seasonNote", { month: monthName(params.startMonth) })}
            </p>
          </div>

          {error && (
            <p className={BANNER_WARNING_CLASS}>
              {st("common.failed", { error })}
            </p>
          )}

          {result && (
            <>
              <div
                className={`mb-4 grid gap-3 ${params.capacityPerWeek ? "min-[561px]:grid-cols-2 min-[1201px]:grid-cols-4" : "min-[561px]:grid-cols-3"}`}
              >
                <div className={kpiCardClass("high")}>
                  <div className={KPI_LABEL_CLASS}>{st("kpi.peak")}</div>
                  <div className={KPI_VALUE_CLASS}>
                    {formatPeople(result.peak_infectious)}
                  </div>
                  <div className={KPI_HINT_CLASS}>
                    {reference ? (
                      <Delta
                        now={result.peak_infectious}
                        before={reference.result.peak_infectious}
                        against={reference.name}
                      />
                    ) : result.band ? (
                      st("kpi.peakRange", {
                        low: formatPeople(
                          Math.max(...result.band.map((b) => b.infectious_low)),
                        ),
                        high: formatPeople(
                          Math.max(
                            ...result.band.map((b) => b.infectious_high),
                          ),
                        ),
                        week: result.peak_week,
                      })
                    ) : (
                      st("kpi.inWeek", { week: result.peak_week })
                    )}
                  </div>
                </div>
                <div className={kpiCardClass()}>
                  <div className={KPI_LABEL_CLASS}>{st("kpi.total")}</div>
                  <div className={KPI_VALUE_CLASS}>
                    {formatPeople(result.total_projected_cases)}
                  </div>
                  <div className={KPI_HINT_CLASS}>
                    {reference ? (
                      <Delta
                        now={result.total_projected_cases}
                        before={reference.result.total_projected_cases}
                        against={reference.name}
                      />
                    ) : result.total_cases_low != null &&
                      result.total_cases_high != null ? (
                      st("kpi.range", {
                        low: formatPeople(result.total_cases_low),
                        high: formatPeople(result.total_cases_high),
                      })
                    ) : (
                      st("kpi.overWeeks", { weeks: params.horizonWeeks })
                    )}
                  </div>
                </div>
                <div className={kpiCardClass()}>
                  <div className={KPI_LABEL_CLASS}>{st("kpi.attack")}</div>
                  <div className={KPI_VALUE_CLASS}>
                    {(attackRate * 100).toFixed(1)}%
                  </div>
                  <div className={KPI_HINT_CLASS}>
                    {st("kpi.ofAtRisk", {
                      population: formatCompact(params.population),
                    })}
                  </div>
                </div>
                {params.capacityPerWeek > 0 && (
                  <div className={kpiCardClass(weeksOver ? "high" : "neutral")}>
                    <div className={KPI_LABEL_CLASS}>
                      {st("kpi.overCapacity")}
                    </div>
                    <div className={KPI_VALUE_CLASS}>
                      {weeksOver}{" "}
                      <span className="text-base font-medium text-muted">
                        {st("unit.weeksWord")}
                      </span>
                    </div>
                    <div className={KPI_HINT_CLASS}>
                      {st("kpi.peakNew", { value: formatPeople(peakNewCases) })}
                    </div>
                  </div>
                )}
              </div>

              {(params.capacityPerWeek > 0 || (compareEarlier && earlier)) && (
                <Insight
                  tone={weeksOver ? "warn" : "ok"}
                  lines={[
                    params.capacityPerWeek > 0
                      ? weeksOver
                        ? st("insight.over", {
                            capacity: formatNumber(params.capacityPerWeek),
                            weeks: overRuns
                              .map((r) =>
                                r.from === r.to
                                  ? `${r.from}`
                                  : `${r.from}–${r.to}`,
                              )
                              .join(", "),
                            peak: formatNumber(Math.round(peakNewCases)),
                          })
                        : st("insight.within", {
                            capacity: formatNumber(params.capacityPerWeek),
                          })
                      : null,
                    compareEarlier && earlier
                      ? st(
                          averted > 0.5
                            ? "insight.earlier"
                            : "insight.earlierNone",
                          {
                            weeks: EARLIER_BY_WEEKS,
                            week: earlierStart,
                            averted: formatPeople(averted),
                            pct:
                              result.total_projected_cases > 0
                                ? Math.round(
                                    (averted / result.total_projected_cases) *
                                      100,
                                  )
                                : 0,
                          },
                        ) +
                        (params.capacityPerWeek > 0 && weeksOver
                          ? " " +
                            (earlierWeeksOver === 0
                              ? st("insight.earlierWithin")
                              : st("insight.earlierWeeks", {
                                  weeks: earlierWeeksOver,
                                }))
                          : "")
                      : null,
                    params.capacityPerWeek > 0 &&
                    weeksOver &&
                    params.interventionStartWeek === 0
                      ? st("insight.alreadyNow")
                      : null,
                  ]}
                />
              )}

              <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs text-muted">
                  <LegendSwatch
                    className="bg-risk-high"
                    label={st("series.infectious")}
                  />
                  <LegendSwatch
                    className="bg-risk-mid"
                    label={st("series.exposed")}
                  />
                  <LegendSwatch
                    dashed
                    className="border-accent"
                    label={st("series.newCases")}
                  />
                  {result.band && (
                    <LegendSwatch
                      className="bg-risk-high/20"
                      label={st("series.band")}
                    />
                  )}
                  {params.capacityPerWeek > 0 && (
                    <LegendSwatch
                      dashed
                      className="border-text-secondary"
                      label={st("series.capacity")}
                    />
                  )}
                  {scenarios.map((s) => (
                    <span key={s.id} className="flex items-center gap-1.5">
                      <span
                        className="w-3.5 border-t-2 border-dashed"
                        style={{ borderColor: s.color }}
                      />{" "}
                      {s.name}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <UpdatingBadge show={updating} />
                  <Toggle
                    label={st("series.showBand")}
                    checked={params.uncertainty}
                    onChange={set("uncertainty")}
                  />
                </div>
              </div>

              <div
                ref={chartRef}
                className={`transition-opacity duration-200 ${updating ? "opacity-60" : "opacity-100"}`}
              >
                <ResponsiveContainer width="100%" height={340}>
                  <ComposedChart
                    data={chartData}
                    margin={{ top: 16, right: 12, left: -8, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient
                        id="infectiousGradient"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="var(--risk-high)"
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="100%"
                          stopColor="var(--risk-high)"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid {...GRID} />
                    <XAxis
                      {...AXIS}
                      dataKey="week"
                      tickFormatter={(w) => st("chart.weekTick", { week: w })}
                      minTickGap={24}
                    />
                    <YAxis {...AXIS} tickFormatter={formatCompact} width={52} />
                    <Tooltip
                      cursor={LINE_CURSOR}
                      content={
                        <ChartTooltip
                          labelFormatter={weekLabel}
                          valueFormatter={(v) => formatNumber(Math.round(v))}
                        />
                      }
                    />
                    {overRuns.map((r) => (
                      <ReferenceArea
                        key={r.from}
                        x1={Math.max(0, r.from - 0.5)}
                        x2={r.to + 0.5}
                        fill="var(--risk-high)"
                        fillOpacity={0.07}
                        ifOverflow="hidden"
                      />
                    ))}
                    {result.band && (
                      <Area
                        type="monotone"
                        dataKey="band"
                        name={st("series.band")}
                        stroke="none"
                        fill="var(--risk-high)"
                        fillOpacity={0.14}
                        isAnimationActive={false}
                        activeDot={false}
                        tooltipType="none"
                      />
                    )}
                    {scenarios.map((s) => (
                      <Line
                        key={s.id}
                        type="monotone"
                        dataKey={`s${s.id}`}
                        name={st("series.scenarioInfectious", { name: s.name })}
                        stroke={s.color}
                        strokeDasharray="5 4"
                        strokeWidth={1.75}
                        dot={false}
                        isAnimationActive={false}
                      />
                    ))}
                    <Area
                      type="monotone"
                      dataKey="infectious"
                      name={st("series.infectious")}
                      stroke="var(--risk-high)"
                      fill="url(#infectiousGradient)"
                      strokeWidth={2.2}
                      isAnimationActive={false}
                      activeDot={{ r: 4, strokeWidth: 0 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="exposed"
                      name={st("series.exposed")}
                      stroke="var(--risk-mid)"
                      strokeWidth={1.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="new_cases"
                      name={st("series.newCases")}
                      stroke="var(--accent)"
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                      dot={false}
                      isAnimationActive={false}
                    />
                    {params.capacityPerWeek > 0 && (
                      <ReferenceLine
                        y={params.capacityPerWeek}
                        stroke="var(--text-secondary)"
                        strokeDasharray="6 4"
                        ifOverflow="extendDomain"
                        label={{
                          value: st("series.capacity"),
                          position: "insideBottomRight",
                          fill: "var(--muted)",
                          fontSize: 11,
                        }}
                      />
                    )}
                    {params.interventionStartWeek > 0 &&
                      params.interventionStartWeek <= params.horizonWeeks && (
                        <ReferenceLine
                          x={params.interventionStartWeek}
                          stroke="var(--accent)"
                          label={{
                            value: st("chart.responseStarts"),
                            position:
                              params.interventionStartWeek >
                              params.horizonWeeks * 0.75
                                ? "insideBottomRight"
                                : "insideBottomLeft",
                            fill: "var(--accent-text)",
                            fontSize: 11,
                          }}
                        />
                      )}
                    {result.peak_week > 0 && (
                      <ReferenceLine
                        x={result.peak_week}
                        stroke="var(--border-strong)"
                        strokeDasharray="3 3"
                        label={{
                          value: st("chart.peak", { week: result.peak_week }),
                          // keep the label inside the plot when the peak is near the right edge
                          position:
                            result.peak_week > params.horizonWeeks * 0.75
                              ? "insideTopRight"
                              : "insideTopLeft",
                          fill: "var(--muted)",
                          fontSize: 11,
                        }}
                      />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="m-0 max-w-[60ch] text-xs leading-relaxed text-muted">
                  {st("chart.explain", {
                    incubation: params.incubationDays,
                    infectious: params.infectiousDays,
                  })}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    aria-live="polite"
                    className="text-xs font-semibold text-accent-text"
                  >
                    {notice}
                  </span>
                  <button
                    type="button"
                    className={btnClass("secondary", { sm: true })}
                    onClick={shareLink}
                  >
                    {st("share.link")}
                  </button>
                  <button
                    type="button"
                    className={btnClass("secondary", { sm: true })}
                    onClick={exportCsv}
                  >
                    CSV
                  </button>
                  <button
                    type="button"
                    className={btnClass("secondary", { sm: true })}
                    onClick={exportPng}
                  >
                    PNG
                  </button>
                </div>
              </div>

              {scenarios.length > 0 && (
                <ScenarioTable
                  current={{ params, result, r: rAfter }}
                  scenarios={scenarios}
                  describe={describe}
                  onRename={(id, name) =>
                    setScenarios((list) =>
                      list.map((s) => (s.id === id ? { ...s, name } : s)),
                    )
                  }
                  onLoad={(s) => setParams(s.params)}
                  onRemove={(id) =>
                    setScenarios((list) => list.filter((s) => s.id !== id))
                  }
                />
              )}
            </>
          )}

          <p className="mt-4 mb-0 flex gap-2 border-t border-border pt-3 text-xs leading-relaxed text-muted">
            <span className="mt-px flex-none">
              <InfoIcon size={14} />
            </span>
            {st(
              params.model === "vector"
                ? "disclaimer.vector"
                : "disclaimer.seir",
            )}
          </p>
        </div>
      </div>
    </Card>
  );
}

function LegendSwatch({
  className,
  label,
  dashed,
}: {
  className: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={
          dashed
            ? `w-3.5 border-t-2 border-dashed ${className}`
            : `size-2.5 rounded-[3px] ${className}`
        }
      />{" "}
      {label}
    </span>
  );
}

function Insight({
  tone,
  lines,
}: {
  tone: "warn" | "ok";
  lines: (string | null)[];
}) {
  const shown = lines.filter(Boolean);
  if (!shown.length) return null;
  return (
    <div
      className={
        "mb-4 rounded-xl border px-4 py-3 text-[0.8125rem] leading-relaxed text-text-secondary " +
        (tone === "warn"
          ? "border-risk-mid/40 bg-risk-mid-soft"
          : "border-border bg-panel-muted")
      }
    >
      {shown.map((l, i) => (
        <p key={i} className="m-0 [&+p]:mt-1">
          {l}
        </p>
      ))}
    </div>
  );
}

/** Monthly rainfall as a strip of bars; months the simulation covers are solid. */
function RainStrip({
  rainfall,
  startMonth,
  horizonWeeks,
  monthName,
}: {
  rainfall: number[];
  startMonth: number;
  horizonWeeks: number;
  monthName: (m: number) => string;
}) {
  const st = useSimText();
  const max = Math.max(1, ...rainfall);
  const covered = new Set(
    Array.from({ length: horizonWeeks + 1 }, (_, w) =>
      monthOfWeek(startMonth, w),
    ),
  );
  return (
    <figure className="m-0">
      <div
        className="flex h-12 items-end gap-[3px]"
        role="img"
        aria-label={st("season.stripLabel")}
      >
        {rainfall.map((mm, i) => (
          <div
            key={i}
            title={`${monthName(i + 1)}: ${Math.round(mm)} mm`}
            className={`flex-1 rounded-t-[3px] ${covered.has(i + 1) ? "bg-series-1" : "bg-series-1/25"} ${i + 1 === startMonth ? "outline-2 outline-offset-1 outline-accent" : ""}`}
            style={{ height: `${Math.max(6, (mm / max) * 100)}%` }}
          />
        ))}
      </div>
      <div
        className="mt-1 flex gap-[3px] text-center text-[0.6rem] text-muted"
        aria-hidden="true"
      >
        {rainfall.map((_, i) => (
          <span key={i} className="flex-1">
            {monthName(i + 1).slice(0, 1)}
          </span>
        ))}
      </div>
      <figcaption className="mt-1 text-[0.71875rem] text-muted">
        {st("season.stripCaption")}
      </figcaption>
    </figure>
  );
}

function ScenarioTable({
  current,
  scenarios,
  describe,
  onRename,
  onLoad,
  onRemove,
}: {
  current: { params: OutbreakParams; result: SimulationResponse; r: number };
  scenarios: SavedScenario[];
  describe: (p: OutbreakParams) => string;
  onRename: (id: number, name: string) => void;
  onLoad: (s: SavedScenario) => void;
  onRemove: (id: number) => void;
}) {
  const st = useSimText();
  const rows = [
    {
      key: "current",
      name: st("scenario.current"),
      color: "var(--risk-high)",
      params: current.params,
      result: current.result,
      saved: null,
    },
    ...scenarios.map((s) => ({
      key: String(s.id),
      name: s.name,
      color: s.color,
      params: s.params,
      result: s.result,
      saved: s,
    })),
  ];
  const best = Math.min(...rows.map((r) => r.result.total_projected_cases));

  return (
    <div className="mt-5">
      <h3 className="m-0 mb-2 text-[0.9rem] font-semibold text-text">
        {st("scenario.compareTitle")}
      </h3>
      <div className="relative overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[620px] border-collapse text-[0.8125rem]">
          <thead>
            <tr className="bg-panel-muted text-left text-xs text-muted">
              <th className="px-3 py-2.5 font-semibold">
                {st("scenario.col.name")}
              </th>
              <th className="px-3 py-2.5 text-right font-semibold">R</th>
              <th className="px-3 py-2.5 text-right font-semibold">
                {st("kpi.peak")}
              </th>
              <th className="px-3 py-2.5 text-right font-semibold">
                {st("scenario.col.peakWeek")}
              </th>
              <th className="px-3 py-2.5 text-right font-semibold">
                {st("kpi.total")}
              </th>
              <th className="px-3 py-2.5">
                <span className="sr-only">{st("scenario.col.actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const r = reproductionNumbers(row.params).after;
              const isBest =
                row.result.total_projected_cases === best && rows.length > 1;
              return (
                <tr key={row.key} className="border-t border-border align-top">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className={`w-3.5 flex-none border-t-2 ${row.saved ? "border-dashed" : ""}`}
                        style={{ borderColor: row.color }}
                      />
                      {row.saved ? (
                        <input
                          type="text"
                          aria-label={st("scenario.rename")}
                          value={row.name}
                          maxLength={30}
                          onChange={(e) =>
                            onRename(row.saved!.id, e.target.value)
                          }
                          className="w-full min-w-0 rounded border border-transparent bg-transparent px-1 py-0.5 font-semibold text-text hover:border-border focus:border-accent focus:outline-none"
                        />
                      ) : (
                        <span className="px-1 font-semibold text-text">
                          {row.name}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 max-w-[34ch] pl-[22px] text-xs text-muted">
                      {describe(row.params)}
                    </div>
                  </td>
                  <td
                    className={`px-3 py-2.5 text-right font-semibold tabular-nums ${r > 1 ? "text-risk-high" : "text-risk-low"}`}
                  >
                    {r.toFixed(2)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-text">
                    {formatPeople(row.result.peak_infectious)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-text-secondary">
                    {row.result.peak_week}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    <span className="font-semibold text-text">
                      {formatPeople(row.result.total_projected_cases)}
                    </span>
                    {isBest && (
                      <span className="ml-1.5 rounded-full bg-risk-low-soft px-1.5 py-0.5 text-[0.65rem] font-semibold text-risk-low">
                        {st("scenario.fewest")}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    {row.saved && (
                      <>
                        <button
                          type="button"
                          className={btnClass("secondary", { sm: true })}
                          onClick={() => onLoad(row.saved!)}
                        >
                          {st("scenario.load")}
                        </button>
                        <button
                          type="button"
                          aria-label={st("scenario.remove", { name: row.name })}
                          className="ml-1 cursor-pointer rounded-md border-0 bg-transparent px-2 py-1 text-muted hover:bg-panel-muted hover:text-text"
                          onClick={() => onRemove(row.saved!.id)}
                        >
                          ✕
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 mb-0 text-xs text-muted">{st("scenario.frozen")}</p>
    </div>
  );
}
