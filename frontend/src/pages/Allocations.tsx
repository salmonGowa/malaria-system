import { useEffect, useState } from "react";

import { api, VaccineAllocation } from "../api/client";

export default function Allocations() {
  const [allocations, setAllocations] = useState<VaccineAllocation[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listAllocations()
      .then((data) => setAllocations(data.results))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div>
      <h2>Vaccine Allocation Recommendations</h2>
      <p className="placeholder-note">
        ml_service/app/allocation.py already runs a real risk-weighted linear
        program (PuLP) — it just needs real forecast data feeding it and a Django
        endpoint that calls it and stores the result as VaccineAllocation records.
      </p>
      <div className="card">
        {error && <p style={{ color: "var(--risk-high)" }}>Could not reach backend: {error}</p>}
        {allocations.length === 0 && !error && <p>No allocation runs yet.</p>}
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
                <td>{a.recommended_doses}</td>
                <td>{a.rationale}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
