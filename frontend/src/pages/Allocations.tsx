import { useEffect, useState } from "react";

import { api, VaccineAllocation } from "../api/client";
import Pagination from "../components/Pagination";
import { formatNumber } from "../lib/format";

const PAGE_SIZE = 50;

export default function Allocations() {
  const [allocations, setAllocations] = useState<VaccineAllocation[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .listAllocations(page)
      .then((data) => {
        setAllocations(data.results);
        setCount(data.count);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [page]);

  return (
    <div>
      <h2>Vaccine Allocation Recommendations</h2>
      <p className="placeholder-note">
        ml_service/app/allocation.py runs a real risk-weighted linear program (PuLP). To run a new allocation, see
        Run Allocation in the nav.
      </p>

      <div className="card">
        {error && <p style={{ color: "var(--risk-high)" }}>Could not reach backend: {error}</p>}
        {!loading && allocations.length === 0 && !error && <p className="placeholder-note">No allocation runs yet.</p>}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>County</th>
                <th>Period start</th>
                <th>Recommended doses</th>
                <th>Rationale</th>
              </tr>
            </thead>
            <tbody>
              {allocations.map((a) => (
                <tr key={a.id}>
                  <td>{a.county_name}</td>
                  <td>{a.period_start}</td>
                  <td className="mono">{formatNumber(a.recommended_doses)}</td>
                  <td>{a.rationale}</td>
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
