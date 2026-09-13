import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import {
  AllocationResponse,
  api,
  County,
  ForecastRun,
  mlApi,
  SimulationResponse,
} from "../api/client";
import LabeledSlider from "../components/LabeledSlider";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { formatCompact, formatNumber } from "../lib/format";
import { useLanguage } from "../lib/i18n";

export default function Simulations() {
  const { t } = useLanguage();
  return (
    <div>
      <h2>{t("page.simulations")}</h2>
      <p className="placeholder-note">
        Both panels below call the ml_service directly and recompute live as you drag —
        nothing here is saved to the database.
      </p>
      <AllocationSimulator />
      <OutbreakSimulator />
    </div>
  );
}

// --- Vaccine allocation what-if -------------------------------------------
// Real logic: this calls ml_service's PuLP linear-programming optimiser
// (app/allocation.py) exactly as a production allocation run would.

function AllocationSimulator() {
  const [counties, setCounties] = useState<County[]>([]);
  const [latestRiskByCounty, setLatestRiskByCounty] = useState<Map<number, number>>(new Map());
  const [riskOverrides, setRiskOverrides] = useState<Record<number, number>>({});
  const [totalDoses, setTotalDoses] = useState(50000);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [result, setResult] = useState<AllocationResponse | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    Promise.all([api.listAllCounties(), api.listAllForecasts()])
      .then(([c, forecasts]: [County[], ForecastRun[]]) => {
        setCounties(c);
        const latest = new Map<number, ForecastRun>();
        for (const f of forecasts) {
          const current = latest.get(f.county);
          if (!current || new Date(f.generated_at) > new Date(current.generated_at)) {
            latest.set(f.county, f);
          }
        }
        const riskMap = new Map<number, number>();
        const defaults: Record<number, number> = {};
        for (const county of c) {
          const risk = latest.get(county.id)?.risk_score ?? 0.5;
          riskMap.set(county.id, risk);
          defaults[county.id] = risk;
        }
        setLatestRiskByCounty(riskMap);
        setRiskOverrides(defaults);
      })
      .catch((err) => setLoadError(err.message));
  }, []);

  const debouncedRisk = useDebouncedValue(riskOverrides, 250);
  const debouncedDoses = useDebouncedValue(totalDoses, 250);

  useEffect(() => {
    if (counties.length === 0) return;
    setRunning(true);
    mlApi
      .allocate({
        total_available_doses: debouncedDoses,
        county_forecasts: counties.map((c) => ({
          county_code: c.code,
          forecast_period_start: new Date().toISOString().slice(0, 10),
          forecast_period_end: new Date().toISOString().slice(0, 10),
          predicted_cases: 0,
          risk_score: debouncedRisk[c.id] ?? 0.5,
          model_name: "simulation_input",
          model_version: "n/a",
        })),
        county_populations: Object.fromEntries(counties.map((c) => [c.code, c.population ?? 0])),
      })
      .then((res) => {
        setResult(res);
        setRunError(null);
      })
      .catch((err) => setRunError(err.message))
      .finally(() => setRunning(false));
  }, [counties, debouncedRisk, debouncedDoses]);

  const totalPopulation = useMemo(() => counties.reduce((sum, c) => sum + (c.population ?? 0), 0), [counties]);

  const chartData = useMemo(() => {
    if (!result) return [];
    const byCode = new Map(counties.map((c) => [c.code, c.name]));
    return result.allocations
      .map((a) => ({ name: byCode.get(a.county_code) ?? a.county_code, doses: a.recommended_doses }))
      .sort((a, b) => b.doses - a.doses);
  }, [result, counties]);

  if (loadError) {
    return (
      <div className="card">
        <h3>Vaccine allocation what-if</h3>
        <p style={{ color: "var(--risk-high)" }}>Could not load counties/forecasts: {loadError}</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h3>Vaccine allocation what-if</h3>
      <p className="card-subtitle">
        Adjust total available doses and per-county risk to see how the real allocation
        optimiser (risk-weighted linear program, ml_service/app/allocation.py) redistributes doses.
      </p>

      <div className="sim-layout">
        <div className="sim-controls">
          <LabeledSlider
            label="Total available doses"
            value={totalDoses}
            onChange={setTotalDoses}
            min={0}
            max={Math.max(totalPopulation, 100000)}
            step={1000}
            formatValue={formatNumber}
          />
          <div className="sim-county-sliders">
            {counties.map((c) => (
              <LabeledSlider
                key={c.id}
                label={c.name}
                value={riskOverrides[c.id] ?? latestRiskByCounty.get(c.id) ?? 0.5}
                onChange={(v) => setRiskOverrides((prev) => ({ ...prev, [c.id]: v }))}
                min={0}
                max={1}
                step={0.01}
                formatValue={(v) => v.toFixed(2)}
                hint={`pop. ${formatCompact(c.population ?? 0)}`}
              />
            ))}
          </div>
        </div>

        <div className="sim-output">
          {runError && <p style={{ color: "var(--risk-high)" }}>Simulation failed: {runError}</p>}
          {result && (
            <>
              <div className="kpi-row">
                <div className="kpi-card kpi-tone-neutral">
                  <div className="kpi-label">Allocated</div>
                  <div className="kpi-value">{formatNumber(result.total_allocated_doses)}</div>
                  <div className="kpi-hint">of {formatNumber(result.total_available_doses)} available</div>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={Math.max(220, chartData.length * 28)}>
                <BarChart data={chartData} layout="vertical" margin={{ left: 24 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis type="number" stroke="var(--muted)" fontSize={12} />
                  <YAxis type="category" dataKey="name" stroke="var(--muted)" fontSize={12} width={100} />
                  <Tooltip contentStyle={{ background: "var(--panel)", border: "1px solid var(--border)" }} />
                  <Bar dataKey="doses" fill="var(--accent)" radius={[0, 4, 4, 0]} isAnimationActive={!running} />
                </BarChart>
              </ResponsiveContainer>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Outbreak simulator (illustrative SEIR) -------------------------------
// This is NOT the trained forecasting model — see ml_service/app/simulation.py.

function OutbreakSimulator() {
  const [population, setPopulation] = useState(500000);
  const [initialInfectious, setInitialInfectious] = useState(50);
  const [transmissionRate, setTransmissionRate] = useState(0.35);
  const [interventionCoverage, setInterventionCoverage] = useState(0.3);
  const [horizonWeeks, setHorizonWeeks] = useState(24);
  const [result, setResult] = useState<SimulationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const params = useDebouncedValue(
    { population, initialInfectious, transmissionRate, interventionCoverage, horizonWeeks },
    250,
  );

  useEffect(() => {
    mlApi
      .simulate({
        population: params.population,
        initial_infectious: params.initialInfectious,
        transmission_rate: params.transmissionRate,
        incubation_period_days: 10,
        infectious_period_days: 14,
        intervention_coverage: params.interventionCoverage,
        horizon_weeks: params.horizonWeeks,
      })
      .then((res) => {
        setResult(res);
        setError(null);
      })
      .catch((err) => setError(err.message));
  }, [params]);

  return (
    <div className="card">
      <h3>Outbreak trajectory simulator</h3>
      <p className="banner-warning">
        {result?.disclaimer ??
          "Illustrative generic SEIR model — not the trained, data-fitted forecasting model. For exploring intervention trade-offs only."}
      </p>

      <div className="sim-layout">
        <div className="sim-controls">
          <LabeledSlider
            label="Population at risk"
            value={population}
            onChange={setPopulation}
            min={10000}
            max={3000000}
            step={10000}
            formatValue={formatCompact}
          />
          <LabeledSlider
            label="Initial infectious"
            value={initialInfectious}
            onChange={setInitialInfectious}
            min={1}
            max={1000}
            step={1}
            formatValue={formatNumber}
          />
          <LabeledSlider
            label="Transmission rate (β)"
            value={transmissionRate}
            onChange={setTransmissionRate}
            min={0.05}
            max={1.2}
            step={0.01}
            formatValue={(v) => v.toFixed(2)}
            hint="Higher = faster spread"
          />
          <LabeledSlider
            label="Intervention coverage"
            value={interventionCoverage}
            onChange={setInterventionCoverage}
            min={0}
            max={0.95}
            step={0.01}
            formatValue={(v) => `${Math.round(v * 100)}%`}
            hint="Bed nets / IRS / chemoprevention reducing effective transmission"
          />
          <LabeledSlider
            label="Horizon"
            value={horizonWeeks}
            onChange={setHorizonWeeks}
            min={4}
            max={52}
            step={1}
            formatValue={(v) => `${v} weeks`}
          />
        </div>

        <div className="sim-output">
          {error && <p style={{ color: "var(--risk-high)" }}>Simulation failed: {error}</p>}
          {result && (
            <>
              <div className="kpi-row">
                <div className="kpi-card kpi-tone-mid">
                  <div className="kpi-label">Peak infectious</div>
                  <div className="kpi-value">{formatCompact(result.peak_infectious)}</div>
                  <div className="kpi-hint">week {result.peak_week}</div>
                </div>
                <div className="kpi-card kpi-tone-neutral">
                  <div className="kpi-label">Projected total cases</div>
                  <div className="kpi-value">{formatCompact(result.total_projected_cases)}</div>
                  <div className="kpi-hint">over {horizonWeeks} weeks</div>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={result.weeks}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis dataKey="week" stroke="var(--muted)" fontSize={12} label={{ value: "week", position: "insideBottom", offset: -4, fill: "var(--muted)" }} />
                  <YAxis stroke="var(--muted)" fontSize={12} tickFormatter={formatCompact} />
                  <Tooltip contentStyle={{ background: "var(--panel)", border: "1px solid var(--border)" }} />
                  <Legend />
                  <Line type="monotone" dataKey="infectious" name="Infectious" stroke="var(--risk-high)" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="exposed" name="Exposed" stroke="var(--risk-mid)" dot={false} strokeWidth={1.5} />
                  <Line type="monotone" dataKey="new_cases" name="New cases/wk" stroke="var(--accent)" dot={false} strokeWidth={1.5} strokeDasharray="4 3" />
                </LineChart>
              </ResponsiveContainer>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
