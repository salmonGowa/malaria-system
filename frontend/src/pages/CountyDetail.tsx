import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { api, CaseReport, ClimateObservation, County, ForecastRun, HealthFacility, VaccineAllocation } from "../api/client";
import KpiCard from "../components/KpiCard";
import { caseTrend, historicalRainfallTrend } from "../lib/analytics";
import { formatNumber, riskBand } from "../lib/format";
import { useThresholds } from "../lib/useThresholds";

const tooltipStyle = { background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13 };

export default function CountyDetail() {
  const { id } = useParams<{ id: string }>();
  const countyId = Number(id);
  const thresholds = useThresholds();

  const [county, setCounty] = useState<County | null>(null);
  const [reports, setReports] = useState<CaseReport[]>([]);
  const [forecasts, setForecasts] = useState<ForecastRun[]>([]);
  const [allocations, setAllocations] = useState<VaccineAllocation[]>([]);
  const [rainfall, setRainfall] = useState<ClimateObservation[]>([]);
  const [facilities, setFacilities] = useState<HealthFacility[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!countyId) return;
    setLoading(true);
    Promise.all([
      api.getCounty(countyId),
      api.listAllCaseReports(countyId),
      api.listAllForecasts(countyId),
      api.listAllAllocations(countyId),
      api.listAllClimateObservations("CHIRPS", countyId),
      api.listAllFacilities(countyId),
    ])
      .then(([c, r, f, a, rain, fac]) => {
        setCounty(c);
        setReports(r);
        setForecasts(f);
        setAllocations(a);
        setRainfall(rain);
        setFacilities(fac);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [countyId]);

  const trend = useMemo(() => caseTrend(reports), [reports]);
  const rainfallTrend = useMemo(() => historicalRainfallTrend(rainfall), [rainfall]);

  const totalConfirmed = reports.reduce((sum, r) => sum + r.confirmed_cases, 0);
  const totalDeaths = reports.reduce((sum, r) => sum + r.deaths, 0);
  const totalDoses = allocations.reduce((sum, a) => sum + a.recommended_doses, 0);
  const casesPer1000 = county?.population ? (totalConfirmed / county.population) * 1000 : null;
  const latestForecast = forecasts
    .slice()
    .sort((a, b) => new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime())[0];

  if (loading) return <p className="placeholder-note">Loading…</p>;
  if (error) return <p style={{ color: "var(--risk-high)" }}>Could not reach backend: {error}</p>;
  if (!county) return <p className="placeholder-note">County not found.</p>;

  return (
    <div>
      <p className="placeholder-note" style={{ borderLeftColor: "var(--muted)" }}>
        <Link to="/counties">← All counties</Link>
      </p>
      <h2>
        {county.name} <span className="mono" style={{ color: "var(--muted)", fontSize: "1rem", fontWeight: 500 }}>{county.code}</span>
      </h2>
      <p className="placeholder-note">
        Population {county.population ? formatNumber(county.population) : "unknown"} ·{" "}
        {county.is_endemic_focus ? "in the project's endemic-focus scope" : "outside the endemic-focus scope"} ·{" "}
        boundary {county.boundary ? "set" : "missing"}
      </p>

      <div className="kpi-row">
        <KpiCard label="Confirmed cases (all time)" value={formatNumber(totalConfirmed)} />
        <KpiCard
          label="Cases per 1,000 population"
          value={casesPer1000 !== null ? casesPer1000.toFixed(1) : "—"}
          hint={casesPer1000 === null ? "population unknown" : undefined}
        />
        <KpiCard label="Deaths reported" value={formatNumber(totalDeaths)} tone={totalDeaths > 0 ? "high" : "neutral"} />
        <KpiCard
          label="Latest risk score"
          value={latestForecast ? latestForecast.risk_score.toFixed(3) : "—"}
          hint={latestForecast ? `${latestForecast.model_name}, ${latestForecast.forecast_period_start}` : "no forecast yet"}
          tone={latestForecast ? riskBand(latestForecast.risk_score, thresholds) : "neutral"}
        />
        <KpiCard label="Doses allocated" value={formatNumber(totalDoses)} hint={`${allocations.length} allocation run(s)`} />
      </div>

      <div className="chart-grid">
        <div className="card">
          <h3>Case trend</h3>
          <p className="card-subtitle">Confirmed &amp; suspected, real reports for {county.name}</p>
          {trend.length === 0 ? (
            <p className="placeholder-note">No case reports for this county yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id="countyConfirmedGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="date" stroke="var(--muted)" fontSize={11} />
                <YAxis stroke="var(--muted)" fontSize={12} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="confirmed" stroke="var(--accent)" fill="url(#countyConfirmedGradient)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card">
          <h3>Rainfall history</h3>
          <p className="card-subtitle">Mean monthly CHIRPS rainfall for {county.name}</p>
          {rainfallTrend.length === 0 ? (
            <p className="placeholder-note">No climate observations for this county yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={rainfallTrend}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="month" stroke="var(--muted)" fontSize={10} interval="preserveStartEnd" />
                <YAxis stroke="var(--muted)" fontSize={12} unit="mm" />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${Number(v).toFixed(1)} mm`, "Rainfall"]} />
                <Bar dataKey="rainfall" fill="var(--accent)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="chart-grid">
        <div className="card">
          <h3>Recent forecasts</h3>
          <p className="card-subtitle">Most recent 10 runs for {county.name}</p>
          {forecasts.length === 0 ? (
            <p className="placeholder-note">
              No forecasts yet — see <Link to="/generate-forecast">Generate Forecast</Link>.
            </p>
          ) : (
            <div className="table-scroll" tabIndex={0} role="region" aria-label="Recent forecasts table, scrollable horizontally">
              <table>
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>Predicted</th>
                    <th>Risk</th>
                    <th>Model</th>
                  </tr>
                </thead>
                <tbody>
                  {forecasts
                    .slice()
                    .sort((a, b) => new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime())
                    .slice(0, 10)
                    .map((f) => (
                      <tr key={f.id}>
                        <td>{f.forecast_period_start}</td>
                        <td className="mono">{f.predicted_cases.toFixed(1)}</td>
                        <td className={`mono text-risk-${riskBand(f.risk_score, thresholds)}`} style={{ fontWeight: 600 }}>
                          {f.risk_score.toFixed(3)}
                        </td>
                        <td>{f.model_name}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <h3>Recent allocations</h3>
          <p className="card-subtitle">Most recent 10 runs for {county.name}</p>
          {allocations.length === 0 ? (
            <p className="placeholder-note">
              No allocations yet — see <Link to="/run-allocation">Run Allocation</Link>.
            </p>
          ) : (
            <div className="table-scroll" tabIndex={0} role="region" aria-label="Recent allocations table, scrollable horizontally">
              <table>
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>Doses</th>
                  </tr>
                </thead>
                <tbody>
                  {allocations
                    .slice()
                    .sort((a, b) => new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime())
                    .slice(0, 10)
                    .map((a) => (
                      <tr key={a.id}>
                        <td>{a.period_start}</td>
                        <td className="mono">{formatNumber(a.recommended_doses)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h3>Facilities</h3>
        <p className="card-subtitle">
          Reporting sites in {county.name} — see <Link to="/facilities">Facilities</Link> to add one.
        </p>
        {facilities.length === 0 ? (
          <p className="placeholder-note">No facilities recorded for this county yet.</p>
        ) : (
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Facilities table, scrollable horizontally">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Level</th>
                  <th>KMHFL code</th>
                </tr>
              </thead>
              <tbody>
                {facilities.map((f) => (
                  <tr key={f.id}>
                    <td>{f.name}</td>
                    <td>{f.level.replace("_", " ")}</td>
                    <td className="mono">{f.kmhfl_code || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
