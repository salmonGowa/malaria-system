import { useEffect, useState } from "react";

import { api, CaseReport } from "../api/client";
import Pagination from "../components/Pagination";

const PAGE_SIZE = 50; // matches backend/config/settings.py's REST_FRAMEWORK PAGE_SIZE

export default function CaseReports() {
  const [reports, setReports] = useState<CaseReport[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .listCaseReports(page)
      .then((data) => {
        setReports(data.results);
        setCount(data.count);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [page]);

  return (
    <div>
      <h2>Case Reports</h2>
      <p className="placeholder-note">
        Append-only and hash-chained — see docs/architecture.md's "Why CaseReport is hash-chained" for what that
        guarantees and doesn't. Submitting a new report lives on its own page — see Submit Report in the nav.
      </p>
      <div className="card">
        {error && <p style={{ color: "var(--risk-high)" }}>Could not reach backend: {error}</p>}
        {!loading && reports.length === 0 && !error && <p className="placeholder-note">No case reports yet.</p>}
        <div className="table-scroll">
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
                  <td className="mono" title={r.record_hash}>
                    {r.record_hash.slice(0, 10)}…
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={PAGE_SIZE} count={count} onPageChange={setPage} />
      </div>
    </div>
  );
}
