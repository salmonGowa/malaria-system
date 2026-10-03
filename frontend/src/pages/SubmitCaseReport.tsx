import { FormEvent, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { api, CaseReport, County, HealthFacility } from "../api/client";
import Card from "../components/Card";
import { AlertIcon, CheckCircleIcon, InfoIcon, ShieldCheckIcon, UserIcon } from "../components/icons";
import { useAuth } from "../lib/auth";
import { BANNER_WARNING_CLASS, FORM_BANNER_ERROR_CLASS } from "../lib/bannerClasses";
import { btnClass } from "../lib/buttonClasses";
import { FIELD_HINT_CLASS, FIELD_INPUT_CLASS, FIELD_LABEL_CLASS } from "../lib/fieldClasses";
import { formatDayLabel, formatNumber } from "../lib/format";
import { useLanguage } from "../lib/i18n";
import { PLACEHOLDER_NOTE_CLASS } from "../lib/noteClasses";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="m-0 min-w-0 border-0 border-t border-border p-0 pt-5 first:border-t-0 first:pt-0">
      <legend className="float-left mb-1 w-full p-0 text-sm font-semibold text-text">{title}</legend>
      {hint && <p className="clear-both mt-0 mb-3 text-xs text-muted">{hint}</p>}
      <div className="clear-both grid gap-4 min-[561px]:grid-cols-2 min-[961px]:grid-cols-3">{children}</div>
    </fieldset>
  );
}

/** Number input with −/+ buttons — counts are entered on phones in the field. */
function CountField({
  id,
  label,
  value,
  onChange,
  disabled,
  before,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled: boolean;
  before?: number;
}) {
  const step = (d: number) => onChange(Math.max(0, value + d));
  const stepBtn =
    "grid size-9 flex-none cursor-pointer place-items-center rounded-lg border border-border-strong bg-panel text-lg leading-none text-text-secondary " +
    "hover:bg-panel-muted disabled:cursor-not-allowed disabled:opacity-50";
  return (
    <div className="flex flex-col gap-1.5 text-[0.8125rem]">
      <label htmlFor={id} className={FIELD_LABEL_CLASS}>
        {label}
      </label>
      <div className="flex items-center gap-1.5">
        <button type="button" className={stepBtn} onClick={() => step(-1)} disabled={disabled || value <= 0} aria-label={`Decrease ${label.toLowerCase()}`}>
          −
        </button>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          className={`${FIELD_INPUT_CLASS} text-center`}
          value={value}
          onChange={(e) => onChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
          onFocus={(e) => e.target.select()}
          disabled={disabled}
        />
        <button type="button" className={stepBtn} onClick={() => step(1)} disabled={disabled} aria-label={`Increase ${label.toLowerCase()}`}>
          +
        </button>
      </div>
      {before !== undefined && before !== value && <span className={FIELD_HINT_CLASS}>was {formatNumber(before)}</span>}
    </div>
  );
}

function SummaryRow({ label, value, before }: { label: string; value: ReactNode; before?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-border py-2 first:border-t-0">
      <dt className="text-[0.8125rem] text-muted">{label}</dt>
      <dd className="m-0 text-right text-[0.8125rem] font-semibold tabular-nums text-text">
        {before !== undefined && <span className="mr-1.5 font-normal text-muted line-through">{before}</span>}
        {value}
      </dd>
    </div>
  );
}

export default function SubmitCaseReport() {
  const { t } = useLanguage();
  const { username } = useAuth();
  const [searchParams] = useSearchParams();
  const correctId = searchParams.get("correct") ? Number(searchParams.get("correct")) : null;
  // ?facility= pre-selects a facility (and its county), e.g. from a Facilities card.
  const presetFacility = searchParams.get("facility") ? Number(searchParams.get("facility")) : null;
  const pendingFacility = useRef<number | null>(correctId ? null : presetFacility);

  const [counties, setCounties] = useState<County[]>([]);
  const [facilities, setFacilities] = useState<HealthFacility[]>([]);
  const [countyId, setCountyId] = useState<number | "">("");
  const [facilityId, setFacilityId] = useState<number | "">("");
  const [reportDate, setReportDate] = useState(todayIso());
  const [confirmedCases, setConfirmedCases] = useState(0);
  const [suspectedCases, setSuspectedCases] = useState(0);
  const [deaths, setDeaths] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<CaseReport | null>(null);
  const [countyReports, setCountyReports] = useState<CaseReport[]>([]);

  // Correction mode: load the report being corrected and pre-fill from it.
  // County/facility/report_date are then locked — the backend requires a
  // correction to match all three (see CaseReportService.create_report),
  // since that's what makes it a correction of *that* report rather than an
  // unrelated new one.
  const [original, setOriginal] = useState<CaseReport | null>(null);
  const [loadingOriginal, setLoadingOriginal] = useState(!!correctId);
  const [originalError, setOriginalError] = useState<string | null>(null);

  useEffect(() => {
    api.listAllCounties().then(setCounties).catch(() => undefined);
    api.listAllFacilities().then(setFacilities).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!correctId) return;
    setLoadingOriginal(true);
    api
      .getCaseReport(correctId)
      .then((report) => {
        if (report.superseded_by_id) {
          setOriginalError(
            `Report #${report.id} has already been corrected by #${report.superseded_by_id} — correct that one instead.`,
          );
          return;
        }
        setOriginal(report);
        setCountyId(report.county);
        setFacilityId(report.facility);
        setReportDate(report.report_date);
        setConfirmedCases(report.confirmed_cases);
        setSuspectedCases(report.suspected_cases);
        setDeaths(report.deaths);
      })
      .catch((err) => setOriginalError(err instanceof Error ? err.message : "Could not load that report"))
      .finally(() => setLoadingOriginal(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [correctId]);

  const facilitiesInCounty = useMemo(() => facilities.filter((f) => f.county === countyId), [facilities, countyId]);

  // Apply a ?facility= preset once facilities have loaded: choose its county
  // first, then the county effect below picks the facility up from the ref.
  useEffect(() => {
    const id = pendingFacility.current;
    const f = id ? facilities.find((x) => x.id === id) : undefined;
    if (f) setCountyId(f.county);
  }, [facilities]);

  useEffect(() => {
    if (!original) {
      const pending = facilities.find((x) => x.id === pendingFacility.current && x.county === countyId);
      setFacilityId(pending ? pending.id : "");
      if (pending) pendingFacility.current = null;
    }
    setCountyReports([]);
    if (countyId) api.listAllCaseReports(countyId).then(setCountyReports).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countyId]);

  // Context for the chosen facility: its most recent report, and whether one
  // already exists for this exact date (then a correction is probably meant).
  const facilityReports = useMemo(
    () => countyReports.filter((r) => r.facility === facilityId && !r.superseded_by_id),
    [countyReports, facilityId],
  );
  const lastReport = facilityReports.find((r) => r.id !== original?.id) ?? null;
  const sameDay = original ? null : facilityReports.find((r) => r.report_date === reportDate) ?? null;

  const warnings: string[] = [];
  if (deaths > confirmedCases + suspectedCases) warnings.push("Deaths are higher than confirmed and suspected cases combined.");
  if (lastReport && lastReport.confirmed_cases >= 10 && confirmedCases >= lastReport.confirmed_cases * 5) {
    warnings.push(
      `Confirmed cases are ${Math.round(confirmedCases / lastReport.confirmed_cases)}× this facility's last report (${formatNumber(lastReport.confirmed_cases)}) — double-check before submitting.`,
    );
  }

  const unchanged =
    !!original &&
    original.confirmed_cases === confirmedCases &&
    original.suspected_cases === suspectedCases &&
    original.deaths === deaths;
  const canSubmit = !!username && !submitting && !!countyId && !!facilityId && !!reportDate && !unchanged;

  const county = counties.find((c) => c.id === countyId);
  const facility = facilities.find((f) => f.id === facilityId);

  const resetForAnother = () => {
    setSubmitted(null);
    setConfirmedCases(0);
    setSuspectedCases(0);
    setDeaths(0);
    if (countyId) api.listAllCaseReports(countyId).then(setCountyReports).catch(() => undefined);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!countyId || !facilityId) {
      setError("Select a county and facility.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const created = await api.createCaseReport({
        county: countyId,
        facility: facilityId,
        report_date: reportDate,
        confirmed_cases: confirmedCases,
        suspected_cases: suspectedCases,
        deaths,
        ...(original ? { supersedes: original.id } : {}),
      });
      setSubmitted(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit report");
    } finally {
      setSubmitting(false);
    }
  };

  const title = original ? t("page.correctReport", { id: original.id }) : t("page.submitCaseReport");

  // --- Success ----------------------------------------------------------
  if (submitted) {
    return (
      <div>
        <h2 className="m-0 mb-5 text-[1.6rem] font-bold tracking-[-0.02em] text-text">{title}</h2>
        <Card className="max-w-[640px]">
          <div className="flex items-start gap-3">
            <span className="grid size-10 flex-none place-items-center rounded-full bg-risk-low-soft text-risk-low">
              <CheckCircleIcon size={20} />
            </span>
            <div className="min-w-0">
              <h3 className="m-0 text-lg font-bold text-text">
                {original ? `Correction #${submitted.id} added to the chain` : `Report #${submitted.id} added to the chain`}
              </h3>
              <p className="mt-1 mb-0 text-[0.8125rem] text-muted">
                {original
                  ? `It supersedes report #${original.id}, which stays in the history marked as corrected.`
                  : "It's now permanent: it can be corrected later, never edited or deleted."}
              </p>
            </div>
          </div>
          <dl className="my-4 rounded-xl border border-border px-4 py-1">
            <SummaryRow label="Facility" value={`${submitted.facility_name}, ${submitted.county_name}`} />
            <SummaryRow label="Report date" value={formatDayLabel(submitted.report_date)} />
            <SummaryRow
              label="Confirmed / suspected / deaths"
              value={`${formatNumber(submitted.confirmed_cases)} / ${formatNumber(submitted.suspected_cases)} / ${formatNumber(submitted.deaths)}`}
            />
            <SummaryRow label="Record hash" value={<span className="mono text-xs font-normal break-all">{submitted.record_hash}</span>} />
          </dl>
          <div className="flex flex-wrap gap-2">
            {!original && (
              <button type="button" className={btnClass("primary")} onClick={resetForAnother}>
                Submit another
              </button>
            )}
            <Link className={btnClass("secondary", { className: "no-underline" })} to="/case-reports">
              View case reports
            </Link>
            <Link className={btnClass("secondary", { className: "no-underline" })} to={`/chain-integrity?record=${submitted.id}`}>
              <ShieldCheckIcon size={15} /> See it in the chain
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <header className="mb-5">
        <h2 className="m-0 text-[1.6rem] font-bold tracking-[-0.02em] text-text">{title}</h2>
        <p className="mt-1 mb-0 max-w-[75ch] text-sm text-muted">
          {original ? (
            <>
              Adds a new record that supersedes report #{original.id}. The original is never edited — it stays in{" "}
              <Link to="/case-reports">Case Reports</Link> marked as corrected.
            </>
          ) : (
            <>
              Adds a permanent, hash-chained record. Mistakes are fixed later with a correction, never by editing — use
              "Correct" on <Link to="/case-reports">Case Reports</Link>.
            </>
          )}
        </p>
      </header>

      {correctId && loadingOriginal && <p className={PLACEHOLDER_NOTE_CLASS}>Loading report #{correctId}…</p>}
      {originalError && (
        <p className={FORM_BANNER_ERROR_CLASS}>
          <AlertIcon size={14} /> {originalError}
        </p>
      )}

      {!username && (
        <Card className="max-w-[640px]">
          <div className="flex items-start gap-3">
            <span className="grid size-10 flex-none place-items-center rounded-full bg-panel-muted text-muted">
              <UserIcon size={18} />
            </span>
            <div>
              <h3 className="m-0 text-base font-semibold text-text">Sign in to submit a report</h3>
              <p className="mt-1 mb-0 text-[0.8125rem] text-muted">
                Every report is attributed to the person who submitted it, so the chain records who reported what. Use{" "}
                <strong className="text-text-secondary">Sign in</strong> at the top right — this form opens once you're
                signed in.
              </p>
            </div>
          </div>
        </Card>
      )}

      {username && (!correctId || original) && (
        <form onSubmit={handleSubmit} className="grid items-start gap-5 min-[1101px]:grid-cols-[minmax(0,1fr)_340px]">
          <Card>
            <div className="flex flex-col gap-5">
              <Section title="Where" hint={original ? "Locked — a correction must match the original report." : undefined}>
                <label className="flex flex-col gap-1.5 text-[0.8125rem]">
                  <span className={FIELD_LABEL_CLASS}>County</span>
                  <select
                    className={FIELD_INPUT_CLASS}
                    value={countyId}
                    onChange={(e) => setCountyId(e.target.value ? Number(e.target.value) : "")}
                    disabled={!!original}
                  >
                    <option value="">Select county…</option>
                    {counties.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-[0.8125rem] min-[961px]:col-span-2">
                  <span className={FIELD_LABEL_CLASS}>Facility</span>
                  <select
                    className={FIELD_INPUT_CLASS}
                    value={facilityId}
                    onChange={(e) => setFacilityId(e.target.value ? Number(e.target.value) : "")}
                    disabled={!countyId || !!original}
                  >
                    <option value="">
                      {!countyId ? "Select a county first" : facilitiesInCounty.length ? "Select facility…" : "No facilities in this county"}
                    </option>
                    {facilitiesInCounty.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                        {f.level ? ` · ${f.level}` : ""}
                      </option>
                    ))}
                  </select>
                  {lastReport && (
                    <span className={FIELD_HINT_CLASS}>
                      Last report {formatDayLabel(lastReport.report_date)}: {formatNumber(lastReport.confirmed_cases)} confirmed,{" "}
                      {formatNumber(lastReport.suspected_cases)} suspected, {formatNumber(lastReport.deaths)} deaths.
                    </span>
                  )}
                </label>
              </Section>

              <Section title="When">
                <label className="flex flex-col gap-1.5 text-[0.8125rem]">
                  <span className={FIELD_LABEL_CLASS}>Report date</span>
                  <input
                    type="date"
                    className={FIELD_INPUT_CLASS}
                    value={reportDate}
                    max={todayIso()}
                    onChange={(e) => setReportDate(e.target.value)}
                    disabled={!!original}
                  />
                  <span className={FIELD_HINT_CLASS}>The day the reporting period ends.</span>
                </label>
              </Section>

              {sameDay && (
                <p className={`${BANNER_WARNING_CLASS} mb-0`}>
                  {facility?.name ?? "This facility"} already has a report for {formatDayLabel(reportDate)} (#{sameDay.id}).
                  If it was wrong, <Link to={`/submit-case-report?correct=${sameDay.id}`}>correct report #{sameDay.id}</Link> instead
                  of adding a second one.
                </p>
              )}

              <Section title="Counts">
                <CountField id="confirmed" label="Confirmed cases" value={confirmedCases} onChange={setConfirmedCases} disabled={false} before={original?.confirmed_cases} />
                <CountField id="suspected" label="Suspected cases" value={suspectedCases} onChange={setSuspectedCases} disabled={false} before={original?.suspected_cases} />
                <CountField id="deaths" label="Deaths" value={deaths} onChange={setDeaths} disabled={false} before={original?.deaths} />
              </Section>

              {warnings.length > 0 && (
                <div className={`${BANNER_WARNING_CLASS} mb-0`}>
                  {warnings.map((w) => (
                    <div key={w}>{w}</div>
                  ))}
                  <div className="mt-1 text-xs opacity-80">You can still submit — this is just a check.</div>
                </div>
              )}
            </div>
          </Card>

          {/* Review — what will be written, right before it's written. */}
          <Card className="min-[1101px]:sticky min-[1101px]:top-20">
            <h3 className="m-0 mb-3 text-[0.95rem] font-semibold text-text">{original ? "Review correction" : "Review"}</h3>
            <dl className="m-0 mb-4">
              <SummaryRow label="County" value={county?.name ?? "—"} />
              <SummaryRow label="Facility" value={facility?.name ?? "—"} />
              <SummaryRow label="Date" value={reportDate ? formatDayLabel(reportDate) : "—"} />
              <SummaryRow
                label="Confirmed"
                value={formatNumber(confirmedCases)}
                before={original && original.confirmed_cases !== confirmedCases ? formatNumber(original.confirmed_cases) : undefined}
              />
              <SummaryRow
                label="Suspected"
                value={formatNumber(suspectedCases)}
                before={original && original.suspected_cases !== suspectedCases ? formatNumber(original.suspected_cases) : undefined}
              />
              <SummaryRow
                label="Deaths"
                value={formatNumber(deaths)}
                before={original && original.deaths !== deaths ? formatNumber(original.deaths) : undefined}
              />
              <SummaryRow label="Reported by" value={username} />
            </dl>

            {error && <p className={FORM_BANNER_ERROR_CLASS}>{error}</p>}

            <button type="submit" className={btnClass("primary", { block: true })} disabled={!canSubmit}>
              {submitting ? t("common.submitting") : original ? t("common.submitCorrection") : t("common.submitReport")}
            </button>
            <p className="mt-2.5 mb-0 flex gap-1.5 text-xs leading-relaxed text-muted">
              <span className="mt-px flex-none">
                <InfoIcon size={13} />
              </span>
              {unchanged
                ? "Change at least one count to submit a correction."
                : !countyId || !facilityId
                  ? "Choose a county and facility to continue."
                  : "Once submitted, this record is hash-chained and can't be edited — only corrected."}
            </p>
          </Card>
        </form>
      )}
    </div>
  );
}
