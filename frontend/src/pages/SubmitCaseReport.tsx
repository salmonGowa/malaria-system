import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { api, CaseReport, County, HealthFacility } from "../api/client";
import Card from "../components/Card";
import { AlertIcon, UserIcon } from "../components/icons";
import { useAuth } from "../lib/auth";
import { FORM_BANNER_ERROR_CLASS, FORM_BANNER_SUCCESS_CLASS } from "../lib/bannerClasses";
import { btnClass } from "../lib/buttonClasses";
import {
  FIELD_HINT_CLASS,
  FIELD_INPUT_CLASS,
  FIELD_LABEL_CLASS,
  FIELD_ROW_CLASS,
  FIELD_ROW_FIELD_CLASS,
} from "../lib/fieldClasses";
import { useLanguage } from "../lib/i18n";
import { PLACEHOLDER_NOTE_CLASS } from "../lib/noteClasses";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function SubmitCaseReport() {
  const { t } = useLanguage();
  const { username } = useAuth();
  const [searchParams] = useSearchParams();
  const correctId = searchParams.get("correct") ? Number(searchParams.get("correct")) : null;

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
  const [success, setSuccess] = useState(false);

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

  useEffect(() => {
    if (!original) setFacilityId("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countyId]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!countyId || !facilityId) {
      setError("Select a county and facility.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(false);
    try {
      await api.createCaseReport({
        county: countyId,
        facility: facilityId,
        report_date: reportDate,
        confirmed_cases: confirmedCases,
        suspected_cases: suspectedCases,
        deaths,
        ...(original ? { supersedes: original.id } : {}),
      });
      setSuccess(true);
      if (!original) {
        setConfirmedCases(0);
        setSuspectedCases(0);
        setDeaths(0);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit report");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h2>{original ? t("page.correctReport", { id: original.id }) : t("page.submitCaseReport")}</h2>
      <p className={PLACEHOLDER_NOTE_CLASS}>
        {original ? (
          <>
            Appends a new record that <strong>supersedes</strong> report #{original.id} — the original is never
            edited or deleted (see <code className="mono">CaseReport.save()</code> in cases/models.py), it stays in
            history dimmed on <Link to="/case-reports">Case Reports</Link> as "corrected by" this one. County,
            facility, and report date are locked to match what's being corrected.
          </>
        ) : (
          <>
            Appends a new, hash-chained record (see <code className="mono">CaseReport.save()</code> in
            cases/models.py) — corrections happen by submitting a new report, not editing an old one (see "Correct"
            on <Link to="/case-reports">Case Reports</Link>).
          </>
        )}
      </p>

      {correctId && loadingOriginal && <p className={PLACEHOLDER_NOTE_CLASS}>Loading report #{correctId}…</p>}
      {originalError && (
        <p className={FORM_BANNER_ERROR_CLASS}>
          <AlertIcon size={14} /> {originalError}
        </p>
      )}

      {(!correctId || original) && (
        <Card>
          {!username && (
            <p className={FORM_BANNER_ERROR_CLASS}>
              <UserIcon size={14} /> Sign in (top right) to submit a report.
            </p>
          )}

          {original && (
            <p className={FIELD_HINT_CLASS} style={{ marginBottom: 14 }}>
              Originally reported: {original.confirmed_cases} confirmed / {original.suspected_cases} suspected /{" "}
              {original.deaths} deaths on {original.report_date}.
            </p>
          )}

          <form onSubmit={handleSubmit}>
            <div className={FIELD_ROW_CLASS}>
              <label className={FIELD_ROW_FIELD_CLASS}>
                <span className={FIELD_LABEL_CLASS}>County</span>
                <select
                  className={FIELD_INPUT_CLASS}
                  value={countyId}
                  onChange={(e) => setCountyId(e.target.value ? Number(e.target.value) : "")}
                  disabled={!username || !!original}
                >
                  <option value="">Select county…</option>
                  {counties.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={FIELD_ROW_FIELD_CLASS}>
                <span className={FIELD_LABEL_CLASS}>Facility</span>
                <select
                  className={FIELD_INPUT_CLASS}
                  value={facilityId}
                  onChange={(e) => setFacilityId(e.target.value ? Number(e.target.value) : "")}
                  disabled={!username || !countyId || !!original}
                >
                  <option value="">{countyId ? "Select facility…" : "Select a county first"}</option>
                  {facilitiesInCounty.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className={FIELD_ROW_CLASS}>
              <label className={FIELD_ROW_FIELD_CLASS}>
                <span className={FIELD_LABEL_CLASS}>Report date</span>
                <input
                  type="date"
                  className={FIELD_INPUT_CLASS}
                  value={reportDate}
                  onChange={(e) => setReportDate(e.target.value)}
                  disabled={!username || !!original}
                />
              </label>
              <label className={FIELD_ROW_FIELD_CLASS}>
                <span className={FIELD_LABEL_CLASS}>Confirmed cases</span>
                <input
                  type="number"
                  className={FIELD_INPUT_CLASS}
                  min={0}
                  value={confirmedCases}
                  onChange={(e) => setConfirmedCases(Number(e.target.value))}
                  disabled={!username}
                />
              </label>
              <label className={FIELD_ROW_FIELD_CLASS}>
                <span className={FIELD_LABEL_CLASS}>Suspected cases</span>
                <input
                  type="number"
                  className={FIELD_INPUT_CLASS}
                  min={0}
                  value={suspectedCases}
                  onChange={(e) => setSuspectedCases(Number(e.target.value))}
                  disabled={!username}
                />
              </label>
              <label className={FIELD_ROW_FIELD_CLASS}>
                <span className={FIELD_LABEL_CLASS}>Deaths</span>
                <input
                  type="number"
                  className={FIELD_INPUT_CLASS}
                  min={0}
                  value={deaths}
                  onChange={(e) => setDeaths(Number(e.target.value))}
                  disabled={!username}
                />
              </label>
            </div>

            {error && <p className={FORM_BANNER_ERROR_CLASS}>{error}</p>}
            {success && (
              <p className={FORM_BANNER_SUCCESS_CLASS}>
                {original ? `Correction submitted — added to the chain, superseding #${original.id}.` : "Report submitted — added to the chain."}
              </p>
            )}

            <button type="submit" className={btnClass("primary")} disabled={!username || submitting || !countyId || !facilityId}>
              {submitting ? t("common.submitting") : original ? t("common.submitCorrection") : t("common.submitReport")}
            </button>
          </form>
        </Card>
      )}
    </div>
  );
}
