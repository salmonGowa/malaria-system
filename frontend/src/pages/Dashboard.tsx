import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  api,
  CaseReport,
  ClimateObservation,
  County,
  ForecastRun,
  HistoricalCaseData,
  mlApi,
  ModelInfo,
  VaccineAllocation,
} from "../api/client";
import Card, { CARD_SUBTITLE_CLASS, CARD_TITLE_CLASS } from "../components/Card";
import KpiCard, { KPI_HINT_CLASS, KPI_LABEL_CLASS, KPI_ROW_CLASS, KPI_VALUE_CLASS, kpiCardClass } from "../components/KpiCard";
// Lazy: Leaflet (+ its CSS) is a big, map-only dependency that isn't needed
// for the rest of this landing page's first paint — see App.tsx's own
// per-route splitting for the same reasoning.
const RiskMap = lazy(() => import("../components/RiskMap"));
import {
  allocationByCounty,
  caseTrend,
  historicalCaseTrend,
  historicalRainfallTrend,
  latestForecastByCounty,
  seasonalClimatology,
} from "../lib/analytics";
import { CHART_GRID_CLASS } from "../lib/chartClasses";
import { FIELD_HINT_CLASS } from "../lib/fieldClasses";
import { formatCompact, formatNumber, riskBand } from "../lib/format";
import { useLanguage } from "../lib/i18n";
import { PLACEHOLDER_NOTE_CLASS, ROUTE_LOADING_CLASS } from "../lib/noteClasses";
import { useThresholds } from "../lib/useThresholds";

const RISK_COLORS: Record<"high" | "mid" | "low", string> = {
  high: "#d9534f",
  mid: "#e0a83b",
  low: "#2fae8f",
};

const tooltipStyle = { background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13 };

export default function Dashboard() {
  const { t } = useLanguage();
  const thresholds = useThresholds();
  const [counties, setCounties] = useState<County[]>([]);
  const [reports, setReports] = useState<CaseReport[]>([]);
  const [forecasts, setForecasts] = useState<ForecastRun[]>([]);
  const [allocations, setAllocations] = useState<VaccineAllocation[]>([]);
  const [historicalCases, setHistoricalCases] = useState<HistoricalCaseData[]>([]);
  const [rainfall, setRainfall] = useState<ClimateObservation[]>([]);
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [modelInfoError, setModelInfoError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.listAllCounties(),
      api.listAllCaseReports(),
      api.listAllForecasts(),
      api.listAllAllocations(),
      api.listAllHistoricalCaseData(),
      api.listAllClimateObservations("CHIRPS"),
    ])
      .then(([c, r, f, a, hist, rain]) => {
        setCounties(c);
        setReports(r);
        setForecasts(f);
        setAllocations(a);
        setHistoricalCases(hist);
        setRainfall(rain);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));

    mlApi
      .modelInfo()
      .then(setModelInfo)
      .catch((err) => setModelInfoError(err instanceof Error ? err.message : "Model info unavailable"));
  }, []);

  const latestForecasts = useMemo(() => latestForecastByCounty(forecasts), [forecasts]);
  const trend = useMemo(() => caseTrend(reports), [reports]);
  const historicalTrend = useMemo(() => historicalCaseTrend(historicalCases), [historicalCases]);
  const rainfallTrend = useMemo(() => historicalRainfallTrend(rainfall), [rainfall]);
  const climatology = useMemo(() => seasonalClimatology(rainfall), [rainfall]);
  const allocationData = useMemo(() => allocationByCounty(allocations), [allocations]);

  const totalConfirmed = reports.reduce((sum, r) => sum + r.confirmed_cases, 0);
  const totalDeaths = reports.reduce((sum, r) => sum + r.deaths, 0);
  const totalDosesAllocated = allocations.reduce((sum, a) => sum + a.recommended_doses, 0);

  // Per-population rate, not just a raw count — a county's case load only
  // means something relative to how many people are actually there.
  const countiesWithPopulation = counties.filter((c) => c.population);
  const totalPopulation = countiesWithPopulation.reduce((sum, c) => sum + (c.population ?? 0), 0);
  const casesPer1000 = totalPopulation > 0 ? (totalConfirmed / totalPopulation) * 1000 : null;

  const riskValues = [...latestForecasts.values()].map((f) => f.risk_score);
  const avgRisk = riskValues.length > 0 ? riskValues.reduce((a, b) => a + b, 0) / riskValues.length : null;

  const forecastsAreAllPlaceholder =
    latestForecasts.size > 0 && [...latestForecasts.values()].every((f) => f.model_name === "placeholder_not_trained");

  const riskByCountyId: Record<number, number | undefined> = {};
  const riskChartData = counties
    .map((c) => {
      const f = latestForecasts.get(c.id);
      riskByCountyId[c.id] = f?.risk_score;
      return { name: c.name, risk: f?.risk_score ?? 0, hasData: f !== undefined };
    })
    .sort((a, b) => b.risk - a.risk)
    .slice(0, 12);

  const modelComparisonData = modelInfo
    ? [
        { name: "Climate-free baseline", auc: modelInfo.climate_free_baseline_metrics.auc, fill: "var(--series-1)" },
        { name: "SEIR benchmark", auc: modelInfo.seir_benchmark_metrics.auc, fill: "var(--series-2)" },
        { name: "Full model (XGBoost)", auc: modelInfo.held_out_test_metrics.auc, fill: "var(--series-3)" },
      ]
    : [];

  if (loading) {
    return <p className={PLACEHOLDER_NOTE_CLASS}>Loading analytics…</p>;
  }

  return (
    <div>
      <h2>{t("page.analyticsOverview")}</h2>
      {error && <p style={{ color: "var(--risk-high)" }}>Could not reach backend: {error}</p>}

      {!error && counties.length === 0 && (
        <p className={PLACEHOLDER_NOTE_CLASS}>No data yet — seed counties, facilities, and case reports via /admin/.</p>
      )}

      {counties.length > 0 && (
        <>
          <div className={KPI_ROW_CLASS}>
            <KpiCard label={t("kpi.confirmedCasesAllTime")} value={formatNumber(totalConfirmed)} />
            <KpiCard
              label={t("kpi.casesPer1000")}
              value={casesPer1000 !== null ? casesPer1000.toFixed(1) : "—"}
              hint={casesPer1000 !== null ? `${countiesWithPopulation.length} counties with known population` : "no population data"}
            />
            <KpiCard label={t("kpi.deathsReported")} value={formatNumber(totalDeaths)} tone={totalDeaths > 0 ? "high" : "neutral"} />
            <KpiCard
              label={t("kpi.avgOutbreakRisk")}
              value={avgRisk !== null ? avgRisk.toFixed(2) : "—"}
              hint={avgRisk !== null ? `across ${latestForecasts.size} counties` : "no forecast runs yet"}
              tone={avgRisk !== null ? riskBand(avgRisk, thresholds) : "neutral"}
            />
            <KpiCard
              label={t("kpi.dosesAllocated")}
              value={formatCompact(totalDosesAllocated)}
              hint={`${allocations.length} allocation run(s)`}
            />
          </div>

          {forecastsAreAllPlaceholder && (
            <p className={PLACEHOLDER_NOTE_CLASS}>
              Every forecast currently on record is from the untrained placeholder model
              (predicted_cases and risk_score both 0) — see ml_service/app/forecasting.py.
              Risk figures below aren't meaningful until a real forecast has been generated.
            </p>
          )}

          <div className={CHART_GRID_CLASS}>
            <Card>
              <h3 className={CARD_TITLE_CLASS}>Case trend</h3>
              <p className={CARD_SUBTITLE_CLASS}>Confirmed &amp; suspected cases, real reports, summed across all counties</p>
              {trend.length === 0 ? (
                <p className={PLACEHOLDER_NOTE_CLASS}>No case reports yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={trend}>
                    <defs>
                      <linearGradient id="confirmedGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                    <XAxis dataKey="date" stroke="var(--muted)" fontSize={12} />
                    <YAxis stroke="var(--muted)" fontSize={12} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Area
                      type="monotone"
                      dataKey="confirmed"
                      name="Confirmed"
                      stroke="var(--accent)"
                      fill="url(#confirmedGradient)"
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="suspected"
                      name="Suspected"
                      stroke="var(--risk-mid)"
                      fill="none"
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card>
              <h3 className={CARD_TITLE_CLASS}>Risk by county</h3>
              <p className={CARD_SUBTITLE_CLASS}>Latest forecast run per county, top 12</p>
              {riskChartData.length === 0 ? (
                <p className={PLACEHOLDER_NOTE_CLASS}>No forecast runs yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={riskChartData} layout="vertical" margin={{ left: 24 }}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                    <XAxis type="number" domain={[0, 1]} stroke="var(--muted)" fontSize={12} />
                    <YAxis type="category" dataKey="name" stroke="var(--muted)" fontSize={12} width={100} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="risk" radius={[0, 4, 4, 0]}>
                      {riskChartData.map((entry) => (
                        <Cell
                          key={entry.name}
                          fill={entry.hasData ? RISK_COLORS[riskBand(entry.risk, thresholds)] : "var(--border)"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>

          <Card>
            <h3 className={CARD_TITLE_CLASS}>Outbreak risk map</h3>
            <p className={CARD_SUBTITLE_CLASS}>Counties shaded by latest forecast risk score</p>
            <Suspense fallback={<div className={ROUTE_LOADING_CLASS}>Loading map…</div>}>
              <RiskMap counties={counties} riskByCountyId={riskByCountyId} />
            </Suspense>
          </Card>

          <h2 style={{ marginTop: 28 }}>Climate &amp; Historical Signal</h2>
          <p className={PLACEHOLDER_NOTE_CLASS}>
            The forecasting model's actual training data — real CHIRPS rainfall driving a synthetic case series (see
            docs/architecture.md's "Model results"), not the short real-reporting window above.
          </p>

          <div className={CHART_GRID_CLASS}>
            <Card>
              <h3 className={CARD_TITLE_CLASS}>Historical rainfall</h3>
              <p className={CARD_SUBTITLE_CLASS}>Mean monthly CHIRPS rainfall across counties, 5-year window</p>
              {rainfallTrend.length === 0 ? (
                <p className={PLACEHOLDER_NOTE_CLASS}>No climate observations yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={rainfallTrend}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                    <XAxis dataKey="month" stroke="var(--muted)" fontSize={11} interval="preserveStartEnd" />
                    <YAxis stroke="var(--muted)" fontSize={12} unit="mm" />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${Number(v).toFixed(1)} mm`, "Rainfall"]} />
                    <Bar dataKey="rainfall" fill="var(--accent)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card>
              <h3 className={CARD_TITLE_CLASS}>Historical case trend</h3>
              <p className={CARD_SUBTITLE_CLASS}>Confirmed cases (synthetic_v1), summed across counties, 5-year window</p>
              {historicalTrend.length === 0 ? (
                <p className={PLACEHOLDER_NOTE_CLASS}>
                  No historical case data yet — run data/scripts/generate_synthetic_case_history.py.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={historicalTrend}>
                    <defs>
                      <linearGradient id="historicalGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.45} />
                        <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                    <XAxis dataKey="month" stroke="var(--muted)" fontSize={11} interval="preserveStartEnd" />
                    <YAxis stroke="var(--muted)" fontSize={12} tickFormatter={formatCompact} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => [formatNumber(Number(v)), "Cases"]} />
                    <Area type="monotone" dataKey="cases" stroke="var(--series-1)" fill="url(#historicalGradient)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>

          <div className={CHART_GRID_CLASS}>
            <Card>
              <h3 className={CARD_TITLE_CLASS}>Seasonal rainfall pattern</h3>
              <p className={CARD_SUBTITLE_CLASS}>Mean rainfall by calendar month, every year &amp; county averaged together</p>
              {climatology.every((m) => m.rainfall === 0) ? (
                <p className={PLACEHOLDER_NOTE_CLASS}>No climate observations yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={climatology}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                    <XAxis dataKey="monthLabel" stroke="var(--muted)" fontSize={12} />
                    <YAxis stroke="var(--muted)" fontSize={12} unit="mm" />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${Number(v).toFixed(1)} mm`, "Avg. rainfall"]} />
                    <Bar dataKey="rainfall" fill="var(--risk-low)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
              <p className={FIELD_HINT_CLASS} style={{ marginTop: 8 }}>
                Kenya's bimodal rains — long rains (Mar–May) and short rains (Oct–Dec) — described in the proposal's
                Chapter 2.2, visible directly in real CHIRPS data.
              </p>
            </Card>

            <Card>
              <h3 className={CARD_TITLE_CLASS}>Vaccine allocation by county</h3>
              <p className={CARD_SUBTITLE_CLASS}>Total recommended doses, all allocation runs on record</p>
              {allocationData.length === 0 ? (
                <p className={PLACEHOLDER_NOTE_CLASS}>No allocation runs yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={allocationData} layout="vertical" margin={{ left: 24 }}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                    <XAxis type="number" stroke="var(--muted)" fontSize={12} tickFormatter={formatCompact} />
                    <YAxis type="category" dataKey="name" stroke="var(--muted)" fontSize={12} width={80} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => [formatNumber(Number(v)), "Doses"]} />
                    <Bar dataKey="doses" fill="var(--accent)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>

          <Card>
            <h3 className={CARD_TITLE_CLASS}>Model performance</h3>
            <p className={CARD_SUBTITLE_CLASS}>
              Held-out test AUC — the model has never seen these months. Objective 2's target is 0.8.
            </p>
            {modelInfoError ? (
              <p className={PLACEHOLDER_NOTE_CLASS}>Model performance unavailable: {modelInfoError}</p>
            ) : !modelInfo ? (
              <p className={PLACEHOLDER_NOTE_CLASS}>Loading…</p>
            ) : (
              <div className="grid grid-cols-[1.4fr_1fr] gap-5 items-center max-[900px]:grid-cols-[1fr]">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={modelComparisonData} layout="vertical" margin={{ left: 8, right: 32 }}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" domain={[0, 1]} stroke="var(--muted)" fontSize={12} />
                    <YAxis type="category" dataKey="name" stroke="var(--muted)" fontSize={12} width={150} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => [Number(v).toFixed(3), "AUC"]} />
                    <Bar dataKey="auc" radius={[0, 4, 4, 0]}>
                      {modelComparisonData.map((entry) => (
                        <Cell key={entry.name} fill={entry.fill} />
                      ))}
                      <LabelList dataKey="auc" position="right" formatter={(v) => Number(v).toFixed(3)} fill="var(--text)" fontSize={12} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>

                <div className="flex flex-col gap-3">
                  <div className={kpiCardClass("low")}>
                    <div className={KPI_LABEL_CLASS}>Climate contribution to AUC</div>
                    <div className={KPI_VALUE_CLASS}>+{modelInfo.climate_contribution_to_auc.toFixed(3)}</div>
                    <div className={KPI_HINT_CLASS}>rainfall + temperature + humidity vs. case history alone</div>
                  </div>
                  <div className={kpiCardClass()}>
                    <div className={KPI_LABEL_CLASS}>Full model sensitivity / specificity</div>
                    <div className={KPI_VALUE_CLASS}>
                      {(modelInfo.held_out_test_metrics.sensitivity * 100).toFixed(0)}% /{" "}
                      {(modelInfo.held_out_test_metrics.specificity * 100).toFixed(0)}%
                    </div>
                    <div className={KPI_HINT_CLASS}>on {modelInfo.held_out_test_metrics.n} held-out county-months</div>
                  </div>
                </div>
              </div>
            )}
            {modelInfo && (
              <p className={FIELD_HINT_CLASS} style={{ marginTop: 12 }}>
                {modelInfo.training_data_disclaimer}
              </p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
