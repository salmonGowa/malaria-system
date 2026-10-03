import { FormEvent, lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { api, CaseReport, County, ForecastRun, HealthFacility, ReadinessResponse } from "../api/client";
import Card from "../components/Card";
import { COUNTY_PICKER_ITEM_CLASS } from "../components/CountyPicker";
import CountySetup from "../components/CountySetup";
import { MapPinIcon, PlusIcon } from "../components/icons";
import { latestForecastByCounty } from "../lib/analytics";
import { useAuth } from "../lib/auth";
import { priorityBadgeClass } from "../lib/badgeClasses";
import { BANNER_WARNING_CLASS, FORM_BANNER_ERROR_CLASS } from "../lib/bannerClasses";
import { btnClass } from "../lib/buttonClasses";
import { FIELD_HINT_CLASS, FIELD_INPUT_CLASS, FIELD_LABEL_CLASS } from "../lib/fieldClasses";
import { formatCompact, formatDayLabel, formatNumber, formatRelativeTime, riskBand } from "../lib/format";
import { useLanguage } from "../lib/i18n";
import { PLACEHOLDER_NOTE_CLASS, ROUTE_LOADING_CLASS } from "../lib/noteClasses";
import { useThresholds } from "../lib/useThresholds";

// Lazy for the same reason as Dashboard: Leaflet is a big, map-only dependency.
const RiskMap = lazy(() => import("../components/RiskMap"));

const BAND_LABEL = { high: "High", mid: "Moderate", low: "Low" } as const;
const BAND_FILL = { high: "bg-risk-high", mid: "bg-risk-mid", low: "bg-risk-low" } as const;

type SortKey = "risk" | "name" | "population";

function AddCountyForm({ onCreated, onCancel }: { onCreated: (county: County) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [population, setPopulation] = useState("");
  const [isEndemicFocus, setIsEndemicFocus] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      onCreated(await api.createCounty({ name, code, population: population ? Number(population) : null, is_endemic_focus: isEndemicFocus }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create county");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <h3 className="m-0 text-[0.95rem] font-semibold text-text">Add county</h3>
      <p className="mt-1 mb-4 text-[0.8125rem] text-muted">
        Next you'll place it on the map using its official boundary.
      </p>
      <form onSubmit={handleSubmit}>
        <div className="mb-3 grid gap-4 min-[761px]:grid-cols-3">
          <label className="flex flex-col gap-1.5 text-[0.8125rem]">
            <span className={FIELD_LABEL_CLASS}>Name</span>
            <input type="text" className={FIELD_INPUT_CLASS} value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1.5 text-[0.8125rem]">
            <span className={FIELD_LABEL_CLASS}>Code</span>
            <input type="text" className={FIELD_INPUT_CLASS} value={code} onChange={(e) => setCode(e.target.value)} placeholder="KEN-032" required />
            <span className={FIELD_HINT_CLASS}>Format KEN-### (Kenya county code).</span>
          </label>
          <label className="flex flex-col gap-1.5 text-[0.8125rem]">
            <span className={FIELD_LABEL_CLASS}>Population</span>
            <input type="number" className={FIELD_INPUT_CLASS} min={0} value={population} onChange={(e) => setPopulation(e.target.value)} />
          </label>
        </div>
        <label className={`${COUNTY_PICKER_ITEM_CLASS} mb-4`}>
          <input type="checkbox" checked={isEndemicFocus} onChange={(e) => setIsEndemicFocus(e.target.checked)} />
          <span>In the project's endemic-county scope</span>
        </label>
        {error && <p className={FORM_BANNER_ERROR_CLASS}>{error}</p>}
        <div className="flex gap-2.5">
          <button type="submit" className={btnClass("primary")} disabled={submitting}>
            {submitting ? "Adding…" : "Add and locate on map"}
          </button>
          <button type="button" className={btnClass("secondary")} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}

export default function Counties() {
  const { t } = useLanguage();
  const { username } = useAuth();
  const thresholds = useThresholds();
  const [counties, setCounties] = useState<County[]>([]);
  const [forecasts, setForecasts] = useState<ForecastRun[]>([]);
  const [facilities, setFacilities] = useState<HealthFacility[]>([]);
  const [reports, setReports] = useState<CaseReport[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  // The county being set up (located + data loaded), if any.
  const [setupId, setSetupId] = useState<number | null>(null);
  const [readiness, setReadiness] = useState<ReadinessResponse | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("risk");

  const load = () => {
    api
      .listAllCounties()
      .then(setCounties)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
    api.countyReadiness().then(setReadiness).catch(() => undefined);
  };

  useEffect(() => {
    load();
    api.listAllForecasts().then(setForecasts).catch(() => undefined);
    api.listAllFacilities().then(setFacilities).catch(() => undefined);
    api.listAllCaseReports().then(setReports).catch(() => undefined);
  }, []);

  const latest = useMemo(() => latestForecastByCounty(forecasts), [forecasts]);
  const facilityCount = useMemo(() => {
    const m = new Map<number, number>();
    for (const f of facilities) m.set(f.county, (m.get(f.county) ?? 0) + 1);
    return m;
  }, [facilities]);
  const lastReport = useMemo(() => {
    const m = new Map<number, string>();
    for (const r of reports) if (!m.has(r.county) || r.report_date > m.get(r.county)!) m.set(r.county, r.report_date);
    return m;
  }, [reports]);

  const riskByCountyId: Record<number, number | undefined> = {};
  for (const c of counties) riskByCountyId[c.id] = latest.get(c.id)?.risk_score;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = counties.filter((c) => !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q));
    return rows.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "population") return (b.population ?? 0) - (a.population ?? 0);
      return (latest.get(b.id)?.risk_score ?? -1) - (latest.get(a.id)?.risk_score ?? -1);
    });
  }, [counties, query, sort, latest]);

  const totalPopulation = counties.reduce((s, c) => s + (c.population ?? 0), 0);
  // Counties that can't be forecast yet (no boundary, or no history loaded).
  const notReady = readiness ? counties.filter((c) => readiness.counties[String(c.id)] && !readiness.counties[String(c.id)].forecast_ready) : [];
  const setupCounty = counties.find((c) => c.id === setupId) ?? null;
  const noFacility = counties.filter((c) => !facilityCount.get(c.id));

  return (
    <div>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="m-0 text-[1.6rem] font-bold tracking-[-0.02em] text-text">{t("page.counties")}</h2>
          <p className="mt-1 mb-0 max-w-[72ch] text-sm text-muted">
            {counties.length > 0
              ? `${counties.length} counties, ${formatCompact(totalPopulation)} people. Select one for its full case, climate, forecast and allocation history.`
              : "The counties every other page works from."}
          </p>
        </div>
        {username ? (
          !adding && (
            <button type="button" className={btnClass("primary")} onClick={() => setAdding(true)}>
              <PlusIcon size={15} /> Add county
            </button>
          )
        ) : (
          <span className="text-xs text-muted">Sign in to add a county</span>
        )}
      </header>

      {adding && (
        <AddCountyForm
          onCreated={(county) => {
            setAdding(false);
            setSetupId(county.id);
            load();
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      {setupCounty && (
        <CountySetup
          key={setupCounty.id}
          county={setupCounty}
          readiness={readiness?.counties[String(setupCounty.id)]}
          zones={readiness?.zones ?? []}
          allCounties={counties}
          onChanged={load}
          onClose={() => setSetupId(null)}
        />
      )}

      {error && <p className={BANNER_WARNING_CLASS}>Could not reach backend: {error}</p>}
      {loading && <p className={PLACEHOLDER_NOTE_CLASS}>Loading counties…</p>}

      {(notReady.length > 0 || (facilities.length > 0 && noFacility.length > 0)) && (
        <div className={`${BANNER_WARNING_CLASS} flex flex-col gap-1`}>
          {noFacility.length > 0 && facilities.length > 0 && (
            <span>
              <strong>{noFacility.length} {noFacility.length === 1 ? "county has" : "counties have"} no reporting facility</strong>
              {" "}— no case reports can be submitted there. <Link to="/facilities">Add facilities</Link>.
            </span>
          )}
          {notReady.length > 0 && (
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <span>
                {notReady.map((c) => c.name).join(", ")} can't be forecast yet
                {notReady.some((c) => !c.boundary) ? " — not on the map and no data loaded." : " — no data loaded."}
              </span>
              {username &&
                notReady
                  .filter((c) => c.id !== setupId)
                  .map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={btnClass("secondary", { sm: true })}
                      onClick={() => {
                        setSetupId(c.id);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                    >
                      <MapPinIcon size={13} /> Set up {c.name}
                    </button>
                  ))}
            </span>
          )}
        </div>
      )}

      {counties.length > 0 && (
        <Card>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="m-0 text-[0.95rem] font-semibold text-text">Outbreak risk map</h3>
            <span className="text-xs text-muted">Latest forecast per county · hover for details</span>
          </div>
          <Suspense fallback={<div className={ROUTE_LOADING_CLASS}>Loading map…</div>}>
            <RiskMap counties={counties} riskByCountyId={riskByCountyId} />
          </Suspense>
        </Card>
      )}

      {counties.length > 0 && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="min-w-[200px] flex-1 min-[761px]:max-w-[300px]">
              <input
                type="search"
                aria-label="Search counties"
                placeholder="Search county or code…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className={FIELD_INPUT_CLASS}
              />
            </div>
            <div role="group" aria-label="Sort counties" className="flex gap-1 rounded-[10px] border border-border bg-panel p-1">
              {(
                [
                  ["risk", "Highest risk"],
                  ["population", "Population"],
                  ["name", "A–Z"],
                ] as [SortKey, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={sort === key}
                  onClick={() => setSort(key)}
                  className={
                    "cursor-pointer rounded-md border-0 px-3 py-1.5 text-xs font-semibold transition-colors " +
                    (sort === key ? "bg-accent-soft text-accent-text" : "bg-transparent text-text-secondary hover:text-text")
                  }
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="ml-auto text-xs text-muted">
              {visible.length === counties.length ? `${counties.length} counties` : `${visible.length} of ${counties.length}`}
            </span>
          </div>

          {visible.length === 0 ? (
            <p className={PLACEHOLDER_NOTE_CLASS}>No counties match "{query}".</p>
          ) : (
            <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 min-[641px]:grid-cols-2 min-[1101px]:grid-cols-3">
              {visible.map((c) => {
                const f = latest.get(c.id);
                const band = f ? riskBand(f.risk_score, thresholds) : null;
                const nFacilities = facilityCount.get(c.id) ?? 0;
                const last = lastReport.get(c.id);
                return (
                  <li key={c.id}>
                    <Link
                      to={`/counties/${c.id}`}
                      className={
                        "group flex h-full flex-col rounded-xl border border-border bg-panel p-4 text-inherit no-underline shadow-[var(--shadow-sm)] " +
                        "transition hover:-translate-y-px hover:border-border-strong hover:shadow-[var(--shadow)] " +
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      }
                    >
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-base font-bold text-text group-hover:text-accent-text">{c.name}</div>
                          <div className="mono text-xs text-muted">{c.code}</div>
                        </div>
                        {band ? (
                          <span className={priorityBadgeClass(band)}>{BAND_LABEL[band]}</span>
                        ) : (
                          <span className={priorityBadgeClass("no-data")}>No forecast</span>
                        )}
                      </div>

                      <div className="mb-1 flex items-baseline justify-between text-xs text-muted">
                        <span>Outbreak risk</span>
                        <span className="text-[0.95rem] font-bold tabular-nums text-text">{f ? `${Math.round(f.risk_score * 100)}%` : "—"}</span>
                      </div>
                      <div className="relative mb-4 h-1.5 rounded-full bg-panel-muted">
                        {f && band && (
                          <span
                            className={`absolute inset-y-0 left-0 rounded-full ${BAND_FILL[band]}`}
                            style={{ width: `${Math.max(f.risk_score * 100, 2)}%` }}
                          />
                        )}
                      </div>

                      <dl className="m-0 mt-auto grid grid-cols-3 gap-2 border-t border-border pt-3 text-xs">
                        <div>
                          <dt className="text-muted">Population</dt>
                          <dd className="m-0 mt-0.5 font-semibold tabular-nums text-text">{c.population ? formatCompact(c.population) : "—"}</dd>
                        </div>
                        <div>
                          <dt className="text-muted">Facilities</dt>
                          <dd className={`m-0 mt-0.5 font-semibold tabular-nums ${nFacilities ? "text-text" : "text-risk-mid"}`}>
                            {nFacilities || "None"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted">Last report</dt>
                          <dd className="m-0 mt-0.5 truncate font-semibold text-text" title={last ? formatDayLabel(last) : undefined}>
                            {last ? formatRelativeTime(`${last}T12:00:00Z`) : "—"}
                          </dd>
                        </div>
                      </dl>
                      {(!c.is_endemic_focus || !c.boundary || (readiness && readiness.counties[String(c.id)] && !readiness.counties[String(c.id)].forecast_ready)) && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {!c.is_endemic_focus && (
                            <span className="rounded-full bg-panel-muted px-2 py-0.5 text-[0.7rem] text-muted">Outside endemic scope</span>
                          )}
                          {!c.boundary && <span className="rounded-full bg-risk-mid-soft px-2 py-0.5 text-[0.7rem] text-risk-mid">Not on map</span>}
                          {c.boundary && readiness && readiness.counties[String(c.id)] && !readiness.counties[String(c.id)].forecast_ready && (
                            <span className="rounded-full bg-risk-mid-soft px-2 py-0.5 text-[0.7rem] text-risk-mid">No data loaded</span>
                          )}
                        </div>
                      )}
                      {f && (
                        <div className="mt-3 text-[0.7rem] text-muted">
                          {formatNumber(Math.round(f.predicted_cases))} cases forecast · updated {formatRelativeTime(f.generated_at)}
                        </div>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
