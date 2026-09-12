import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { api, County, HealthFacility } from "../api/client";
import { UserIcon } from "../components/icons";
import { useAuth } from "../lib/auth";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function SubmitCaseReport() {
  const { username } = useAuth();
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

  useEffect(() => {
    api.listAllCounties().then(setCounties).catch(() => undefined);
    api.listAllFacilities().then(setFacilities).catch(() => undefined);
  }, []);

  const facilitiesInCounty = useMemo(() => facilities.filter((f) => f.county === countyId), [facilities, countyId]);

  useEffect(() => setFacilityId(""), [countyId]);

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
      });
      setSuccess(true);
      setConfirmedCases(0);
      setSuspectedCases(0);
      setDeaths(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit report");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h2>Submit Case Report</h2>
      <p className="placeholder-note">
        Appends a new, hash-chained record (see <code className="mono">CaseReport.save()</code> in
        cases/models.py) — corrections happen by submitting a new report, not editing an old one. See it land on{" "}
        <Link to="/case-reports">Case Reports</Link>.
      </p>

      <div className="card">
        {!username && (
          <p className="form-banner-error">
            <UserIcon size={14} /> Sign in (top right) to submit a report.
          </p>
        )}

        <form onSubmit={handleSubmit}>
          <div className="field-row">
            <label className="field">
              <span className="field-label">County</span>
              <select
                value={countyId}
                onChange={(e) => setCountyId(e.target.value ? Number(e.target.value) : "")}
                disabled={!username}
              >
                <option value="">Select county…</option>
                {counties.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Facility</span>
              <select
                value={facilityId}
                onChange={(e) => setFacilityId(e.target.value ? Number(e.target.value) : "")}
                disabled={!username || !countyId}
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

          <div className="field-row">
            <label className="field">
              <span className="field-label">Report date</span>
              <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} disabled={!username} />
            </label>
            <label className="field">
              <span className="field-label">Confirmed cases</span>
              <input
                type="number"
                min={0}
                value={confirmedCases}
                onChange={(e) => setConfirmedCases(Number(e.target.value))}
                disabled={!username}
              />
            </label>
            <label className="field">
              <span className="field-label">Suspected cases</span>
              <input
                type="number"
                min={0}
                value={suspectedCases}
                onChange={(e) => setSuspectedCases(Number(e.target.value))}
                disabled={!username}
              />
            </label>
            <label className="field">
              <span className="field-label">Deaths</span>
              <input type="number" min={0} value={deaths} onChange={(e) => setDeaths(Number(e.target.value))} disabled={!username} />
            </label>
          </div>

          {error && <p className="form-banner-error">{error}</p>}
          {success && <p className="form-banner-success">Report submitted — added to the chain.</p>}

          <button type="submit" className="btn btn-primary" disabled={!username || submitting || !countyId || !facilityId}>
            {submitting ? "Submitting…" : "Submit report"}
          </button>
        </form>
      </div>
    </div>
  );
}
