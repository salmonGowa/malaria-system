import { useEffect, useState } from "react";

import { api, County } from "../api/client";

export default function Dashboard() {
  const [counties, setCounties] = useState<County[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listCounties()
      .then((data) => setCounties(data.results))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div>
      <h2>Overview</h2>
      <p className="placeholder-note">
        Case trend charts, current risk map, and allocation summary land here once the
        forecasting model (Module 2) and allocation runs are producing real data.
        For now this confirms the backend connection by listing endemic-focus counties.
      </p>
      <div className="card">
        {error && <p style={{ color: "var(--risk-high)" }}>Could not reach backend: {error}</p>}
        {!error && counties.length === 0 && <p>No counties yet — seed some via /admin/.</p>}
        {counties.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>County</th>
                <th>Code</th>
                <th>Endemic focus</th>
                <th>Population</th>
              </tr>
            </thead>
            <tbody>
              {counties.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.code}</td>
                  <td>{c.is_endemic_focus ? "Yes" : "No"}</td>
                  <td>{c.population ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
