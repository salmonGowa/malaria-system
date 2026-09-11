import { useEffect, useState } from "react";

import { api, CaseReport } from "../api/client";

export default function CaseReports() {
  const [reports, setReports] = useState<CaseReport[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listCaseReports()
      .then((data) => setReports(data.results))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div>
      <h2>Case Reports</h2>
      <p className="placeholder-note">
        Read-only list for now. The submission form (with facility/reporter selection)
        is the next piece — the API already accepts authenticated POSTs to
        /api/case-reports/, it just needs a UI.
      </p>
      <div className="card">
        {error && <p style={{ color: "var(--risk-high)" }}>Could not reach backend: {error}</p>}
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Facility</th>
              <th>County</th>
              <th>Confirmed</th>
              <th>Suspected</th>
              <th>Deaths</th>
              <th>Record hash</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.id}>
                <td>{r.report_date}</td>
                <td>{r.facility_name}</td>
                <td>{r.county_name}</td>
                <td>{r.confirmed_cases}</td>
                <td>{r.suspected_cases}</td>
                <td>{r.deaths}</td>
                <td title={r.record_hash}>{r.record_hash.slice(0, 10)}…</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
