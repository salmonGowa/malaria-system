import { FormEvent, lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { api, CaseReport, County, FACILITY_LEVELS, HealthFacility } from "../api/client";
import Card from "../components/Card";
import { HospitalIcon, PlusIcon } from "../components/icons";
import { activityFor, ReportingStrip, STATUS_LABEL, STATUS_PILL, type Status } from "../components/ReportingStrip";
import { useAuth } from "../lib/auth";
import { BANNER_WARNING_CLASS, FORM_BANNER_ERROR_CLASS } from "../lib/bannerClasses";
import { COVERAGE_COLORS, COVERAGE_LABEL, type CoverageStatus } from "../lib/coverage";
import { btnClass } from "../lib/buttonClasses";
import { FIELD_HINT_CLASS, FIELD_INPUT_CLASS, FIELD_LABEL_CLASS } from "../lib/fieldClasses";
import { formatDayLabel, formatNumber, formatRelativeTime } from "../lib/format";
import { useLanguage } from "../lib/i18n";
import { PLACEHOLDER_NOTE_CLASS, ROUTE_LOADING_CLASS } from "../lib/noteClasses";

const CoverageMap = lazy(() => import("../components/CoverageMap"));

const LEVEL_LABEL: Record<string, string> = Object.fromEntries(FACILITY_LEVELS.map((l) => [l.value, l.label]));

function AddFacilityForm({
  counties,
  initialCounty,
  onCreated,
  onCancel,
}: {
  counties: County[];
  initialCounty: number | "";
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [countyId, setCountyId] = useState<number | "">(initialCounty);
  const [level, setLevel] = useState<string>(FACILITY_LEVELS[0].value);
  const [kmhflCode, setKmhflCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => setCountyId(initialCounty), [initialCounty]);
  useEffect(() => nameRef.current?.focus(), []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!countyId) {
      setError("Select a county.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.createFacility({ name, county: countyId, level, kmhfl_code: kmhflCode || undefined });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create facility");
    } finally {
      setSubmitting(false);
    }
  };

  const countyName = counties.find((c) => c.id === countyId)?.name;

  return (
    <Card>
      <h3 className="m-0 text-[0.95rem] font-semibold text-text">{countyName ? `Add a facility in ${countyName}` : "Add facility"}</h3>
      <p className="mt-1 mb-4 text-[0.8125rem] text-muted">Once added, case reports can be submitted from it straight away.</p>
      <form onSubmit={handleSubmit}>
        <div className="mb-4 grid gap-4 min-[761px]:grid-cols-2 min-[1101px]:grid-cols-4">
          <label className="flex flex-col gap-1.5 text-[0.8125rem]">
            <span className={FIELD_LABEL_CLASS}>Name</span>
            <input ref={nameRef} type="text" className={FIELD_INPUT_CLASS} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bungoma County Referral Hospital" required />
          </label>
          <label className="flex flex-col gap-1.5 text-[0.8125rem]">
            <span className={FIELD_LABEL_CLASS}>County</span>
            <select className={FIELD_INPUT_CLASS} value={countyId} onChange={(e) => setCountyId(e.target.value ? Number(e.target.value) : "")} required>
              <option value="">Select county…</option>
              {counties.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-[0.8125rem]">
            <span className={FIELD_LABEL_CLASS}>Level</span>
            <select className={FIELD_INPUT_CLASS} value={level} onChange={(e) => setLevel(e.target.value)}>
              {FACILITY_LEVELS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-[0.8125rem]">
            <span className={FIELD_LABEL_CLASS}>KMHFL code (optional)</span>
            <input type="text" className={FIELD_INPUT_CLASS} value={kmhflCode} onChange={(e) => setKmhflCode(e.target.value)} />
            <span className={FIELD_HINT_CLASS}>Kenya Master Health Facility List number.</span>
          </label>
        </div>
        {error && <p className={FORM_BANNER_ERROR_CLASS}>{error}</p>}
        <div className="flex gap-2.5">
          <button type="submit" className={btnClass("primary")} disabled={submitting}>
            {submitting ? "Adding…" : "Add facility"}
          </button>
          <button type="button" className={btnClass("secondary")} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}

export default function Facilities() {
  const { t } = useLanguage();
  const { username } = useAuth();
  const [counties, setCounties] = useState<County[]>([]);
  const [facilities, setFacilities] = useState<HealthFacility[]>([]);
  const [reports, setReports] = useState<CaseReport[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<{ county: number | "" } | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [levelFilter, setLevelFilter] = useState("");
  const todayMs = useMemo(() => Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`), []);

  const load = () => {
    api
      .listAllFacilities()
      .then((rows) => {
        setFacilities(rows);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    api.listAllCounties().then(setCounties).catch(() => undefined);
    api.listAllCaseReports().then(setReports).catch(() => undefined);
  }, []);

  const activity = useMemo(() => {
    const byFacility = new Map<number, CaseReport[]>();
    for (const r of reports) {
      if (r.superseded_by_id) continue; // a corrected report isn't a separate submission
      byFacility.set(r.facility, [...(byFacility.get(r.facility) ?? []), r]);
    }
    return new Map(facilities.map((f) => [f.id, activityFor(byFacility.get(f.id) ?? [], todayMs)]));
  }, [facilities, reports, todayMs]);

  const countyStatus = useMemo(() => {
    const m = new Map<number, CoverageStatus>();
    for (const c of counties) {
      const here = facilities.filter((f) => f.county === c.id);
      m.set(c.id, here.length === 0 ? "none" : here.some((f) => activity.get(f.id)?.status === "active") ? "active" : "quiet");
    }
    return m;
  }, [counties, facilities, activity]);

  const statusCounts = { active: 0, quiet: 0, never: 0 };
  for (const a of activity.values()) statusCounts[a.status]++;
  const coverage = { active: 0, quiet: 0, none: 0 };
  for (const s of countyStatus.values()) coverage[s]++;
  const uncovered = counties.filter((c) => countyStatus.get(c.id) === "none").sort((a, b) => a.name.localeCompare(b.name));

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const order: Record<Status, number> = { quiet: 0, never: 1, active: 2 };
    return facilities
      .filter(
        (f) =>
          (statusFilter === "all" || activity.get(f.id)?.status === statusFilter) &&
          (!levelFilter || f.level === levelFilter) &&
          (!q || f.name.toLowerCase().includes(q) || f.county_name.toLowerCase().includes(q) || (f.kmhfl_code ?? "").toLowerCase().includes(q)),
      )
      // Facilities needing a nudge first, then by name.
      .sort((a, b) => order[activity.get(a.id)!.status] - order[activity.get(b.id)!.status] || a.name.localeCompare(b.name));
  }, [facilities, activity, query, statusFilter, levelFilter]);

  const startAdding = (county: number | "") => {
    setAdding({ county });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const countyDetail = (c: County) => {
    const here = facilities.filter((f) => f.county === c.id);
    if (here.length === 0) return "no facility to report from";
    const last = here.map((f) => activity.get(f.id)?.last).filter(Boolean).sort().pop();
    return `${here.length} ${here.length === 1 ? "facility" : "facilities"} · ${last ? `last report ${formatDayLabel(last)}` : "no reports yet"}`;
  };

  const coveredPct = counties.length ? ((coverage.active + coverage.quiet) / counties.length) * 100 : 0;

  return (
    <div>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="m-0 text-[1.6rem] font-bold tracking-[-0.02em] text-text">{t("page.facilities")}</h2>
          <p className="mt-1 mb-0 max-w-[72ch] text-sm text-muted">
            The facilities case reports come from — where the network covers the counties, and how steadily each one reports.
          </p>
        </div>
        {username ? (
          !adding && (
            <button type="button" className={btnClass("primary")} onClick={() => startAdding("")}>
              <PlusIcon size={15} /> Add facility
            </button>
          )
        ) : (
          <span className="text-xs text-muted">Sign in to add a facility</span>
        )}
      </header>

      {adding && (
        <AddFacilityForm
          counties={counties}
          initialCounty={adding.county}
          onCreated={() => {
            setAdding(null);
            load();
          }}
          onCancel={() => setAdding(null)}
        />
      )}

      {error && <p className={BANNER_WARNING_CLASS}>Could not reach backend: {error}</p>}

      {counties.length > 0 && !loading && (
        <Card>
          <div className="grid gap-6 min-[1101px]:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <div className="min-w-0">
              <h3 className="m-0 mb-3 text-[0.95rem] font-semibold text-text">Reporting network</h3>
              <Suspense fallback={<div className={ROUTE_LOADING_CLASS}>Loading map…</div>}>
                <CoverageMap counties={counties} status={countyStatus} detail={countyDetail} />
              </Suspense>
            </div>

            <div className="flex min-w-0 flex-col gap-5">
              <div>
                <div className="text-xs text-muted">Counties that can report cases</div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-[2.2rem] font-bold leading-none tabular-nums text-text">{coverage.active + coverage.quiet}</span>
                  <span className="text-base text-muted">of {counties.length}</span>
                </div>
                <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-panel-muted" aria-hidden="true">
                  <span style={{ width: `${(coverage.active / counties.length) * 100}%`, background: COVERAGE_COLORS.active }} />
                  <span style={{ width: `${(coverage.quiet / counties.length) * 100}%`, background: COVERAGE_COLORS.quiet }} />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary">
                  {(["active", "quiet", "none"] as CoverageStatus[]).map((s) => (
                    <span key={s} className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full" style={{ background: COVERAGE_COLORS[s] }} />
                      {coverage[s]} {COVERAGE_LABEL[s].toLowerCase()}
                    </span>
                  ))}
                </div>
                {coveredPct < 100 && (
                  <p className="mt-2 mb-0 text-xs text-muted">
                    Case data — and so every forecast — rests on {Math.round(coveredPct)}% of counties.
                  </p>
                )}
              </div>

              {uncovered.length > 0 && (
                <div className="min-h-0 border-t border-border pt-4">
                  <div className="mb-2 flex items-baseline justify-between gap-2">
                    <span className="text-[0.8125rem] font-semibold text-text">No facility yet</span>
                    <span className="text-xs text-muted">{uncovered.length} counties</span>
                  </div>
                  <ul className="m-0 grid max-h-[260px] list-none grid-cols-2 gap-1 overflow-y-auto p-0">
                    {uncovered.map((c) => (
                      <li key={c.id}>
                        {username ? (
                          <button
                            type="button"
                            onClick={() => startAdding(c.id)}
                            className="group flex w-full cursor-pointer items-center justify-between gap-2 rounded-md border-0 bg-transparent px-2 py-1.5 text-left text-[0.8125rem] text-text-secondary hover:bg-panel-muted hover:text-text"
                          >
                            {c.name}
                            <span className="flex items-center gap-1 text-xs font-semibold text-accent-text group-hover:underline">
                              <PlusIcon size={12} /> Add
                            </span>
                          </button>
                        ) : (
                          <Link to={`/counties/${c.id}`} className="block rounded-md px-2 py-1.5 text-[0.8125rem] text-text-secondary no-underline hover:bg-panel-muted">
                            {c.name}
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      <div className="mt-8 mb-4 flex flex-wrap items-center gap-2">
        <h3 className="m-0 mr-2 text-[1.05rem] font-bold text-text">Facilities</h3>
        <div role="group" aria-label="Filter by reporting status" className="flex gap-1 rounded-[10px] border border-border bg-panel p-1">
          {(
            [
              ["all", `All ${facilities.length}`],
              ["active", `Reporting ${statusCounts.active}`],
              ["quiet", `Gone quiet ${statusCounts.quiet}`],
              ["never", `Never ${statusCounts.never}`],
            ] as [Status | "all", string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={statusFilter === key}
              onClick={() => setStatusFilter(key)}
              className={
                "cursor-pointer rounded-md border-0 px-3 py-1.5 text-xs font-semibold tabular-nums transition-colors " +
                (statusFilter === key ? "bg-accent-soft text-accent-text" : "bg-transparent text-text-secondary hover:text-text")
              }
            >
              {label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <div className="w-[200px]">
            <input type="search" aria-label="Search facilities" placeholder="Search facilities…" value={query} onChange={(e) => setQuery(e.target.value)} className={FIELD_INPUT_CLASS} />
          </div>
          <div className="w-[160px]">
            <select aria-label="Filter by level" value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} className={FIELD_INPUT_CLASS}>
              <option value="">All levels</option>
              {FACILITY_LEVELS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading && <p className={PLACEHOLDER_NOTE_CLASS}>Loading facilities…</p>}
      {!loading && facilities.length === 0 && !error && <p className={PLACEHOLDER_NOTE_CLASS}>No facilities yet — add the first one.</p>}
      {!loading && facilities.length > 0 && visible.length === 0 && <p className={PLACEHOLDER_NOTE_CLASS}>No facilities match these filters.</p>}

      <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 min-[961px]:grid-cols-2">
        {visible.map((f) => {
          const a = activity.get(f.id)!;
          const confirmed = a.reports.reduce((s, r) => s + r.confirmed_cases, 0);
          return (
            <li key={f.id} className="flex flex-col rounded-xl border border-border bg-panel p-4 shadow-[var(--shadow-sm)] min-[561px]:p-5">
              <div className="mb-1 flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="grid size-9 flex-none place-items-center rounded-lg bg-panel-muted text-muted">
                    <HospitalIcon size={17} />
                  </span>
                  <div className="min-w-0">
                    <h4 className="m-0 truncate text-[0.95rem] font-bold text-text">{f.name}</h4>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
                      <Link to={`/counties/${f.county}`} className="text-text-secondary">
                        {f.county_name}
                      </Link>
                      <span>·</span>
                      <span>{LEVEL_LABEL[f.level] ?? f.level}</span>
                      {f.kmhfl_code && (
                        <>
                          <span>·</span>
                          <span className="mono">KMHFL {f.kmhfl_code}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <span className={`flex-none rounded-full px-2.5 py-1 text-[0.7rem] font-bold ${STATUS_PILL[a.status]}`}>{STATUS_LABEL[a.status]}</span>
              </div>

              <div className="my-4">
                <ReportingStrip weeks={a.weeks} todayMs={todayMs} />
              </div>

              <dl className="m-0 mt-auto grid grid-cols-3 gap-2 border-t border-border pt-3 text-xs">
                <div>
                  <dt className="text-muted">Reports</dt>
                  <dd className="m-0 mt-0.5 text-[0.95rem] font-bold tabular-nums text-text">{formatNumber(a.reports.length)}</dd>
                </div>
                <div>
                  <dt className="text-muted">Confirmed cases</dt>
                  <dd className="m-0 mt-0.5 text-[0.95rem] font-bold tabular-nums text-text">{formatNumber(confirmed)}</dd>
                </div>
                <div>
                  <dt className="text-muted">Last report</dt>
                  <dd className={`m-0 mt-0.5 text-[0.95rem] font-bold ${a.status === "quiet" ? "text-risk-mid" : "text-text"}`} title={a.last ? formatDayLabel(a.last) : undefined}>
                    {a.last ? formatRelativeTime(`${a.last}T12:00:00Z`) : "—"}
                  </dd>
                </div>
              </dl>

              {username && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link className={btnClass(a.status === "active" ? "secondary" : "primary", { sm: true, className: "no-underline" })} to={`/submit-case-report?facility=${f.id}`}>
                    <PlusIcon size={13} /> Submit a report
                  </Link>
                  <Link className={btnClass("secondary", { sm: true, className: "no-underline" })} to={`/case-reports?q=${encodeURIComponent(f.name)}`}>
                    View reports
                  </Link>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
