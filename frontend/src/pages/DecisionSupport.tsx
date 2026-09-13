import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { api, County, ForecastRun, HistoricalCaseData, VaccineAllocation } from "../api/client";
import { AlertIcon, CheckCircleIcon, InfoIcon, TrendDownIcon, TrendFlatIcon, TrendUpIcon } from "../components/icons";
import { buildRecommendations, CountyRecommendation, Priority } from "../lib/recommendations";
import { useThresholds } from "../lib/useThresholds";
import { useLanguage } from "../lib/i18n";

const PRIORITY_LABEL: Record<Priority, string> = {
  high: "High priority",
  mid: "Moderate",
  low: "Stable",
  "no-data": "No data",
};

const PRIORITY_ICON: Record<Priority, typeof AlertIcon> = {
  high: AlertIcon,
  mid: AlertIcon,
  low: CheckCircleIcon,
  "no-data": InfoIcon,
};

const FILTERS: { value: Priority | "all"; label: string }[] = [
  { value: "all", label: "All counties" },
  { value: "high", label: "High priority" },
  { value: "mid", label: "Moderate" },
  { value: "low", label: "Stable" },
  { value: "no-data", label: "No data" },
];

function TrendBadge({ rec }: { rec: CountyRecommendation }) {
  if (rec.trend === "unknown") {
    return (
      <span className="trend-badge trend-badge-neutral">
        <TrendFlatIcon size={13} /> No modelled trend data
      </span>
    );
  }
  const pct = rec.trendChangePct !== null ? `${rec.trendChangePct > 0 ? "+" : ""}${Math.round(rec.trendChangePct)}%` : "";
  if (rec.trend === "rising") {
    return (
      <span className="trend-badge trend-badge-caution">
        <TrendUpIcon size={13} /> Modelled trend rising {pct}
      </span>
    );
  }
  if (rec.trend === "falling") {
    return (
      <span className="trend-badge trend-badge-good">
        <TrendDownIcon size={13} /> Modelled trend falling {pct}
      </span>
    );
  }
  return (
    <span className="trend-badge trend-badge-neutral">
      <TrendFlatIcon size={13} /> Modelled trend stable
    </span>
  );
}

function RecommendationCard({ rec }: { rec: CountyRecommendation }) {
  const Icon = PRIORITY_ICON[rec.priority];
  return (
    <div className={`rec-card rec-card-${rec.priority}`}>
      <div className="rec-card-header">
        <h3>
          <Link to={`/counties/${rec.county.id}`}>{rec.county.name}</Link>
        </h3>
        <span className={`priority-badge priority-badge-${rec.priority}`}>
          <Icon size={13} /> {PRIORITY_LABEL[rec.priority]}
        </span>
      </div>

      <div className="rec-stats">
        <div className="rec-stat">
          <span className="rec-stat-label">Risk score</span>
          <span className="rec-stat-value">{rec.riskScore !== null ? `${Math.round(rec.riskScore * 100)}%` : "—"}</span>
        </div>
        <div className="rec-stat">
          <span className="rec-stat-label">Dose coverage</span>
          <span className="rec-stat-value">{rec.coveragePct !== null ? `${rec.coveragePct.toFixed(1)}%` : "—"}</span>
        </div>
        <div className="rec-stat">
          <span className="rec-stat-label">Forecast age</span>
          <span className="rec-stat-value">{rec.forecastAgeDays !== null ? `${rec.forecastAgeDays}d` : "—"}</span>
        </div>
      </div>

      <TrendBadge rec={rec} />

      <p className="rec-actions-label">Recommended actions</p>
      <ul className="rec-actions">
        {rec.actions.map((a, i) => (
          <li key={i}>{a}</li>
        ))}
      </ul>

      <details className="rec-why">
        <summary>Why?</summary>
        <ul>
          {rec.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}

export default function DecisionSupport() {
  const { t } = useLanguage();
  const [counties, setCounties] = useState<County[]>([]);
  const [forecasts, setForecasts] = useState<ForecastRun[]>([]);
  const [allocations, setAllocations] = useState<VaccineAllocation[]>([]);
  const [historical, setHistorical] = useState<HistoricalCaseData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Priority | "all">("all");

  useEffect(() => {
    Promise.all([api.listAllCounties(), api.listAllForecasts(), api.listAllAllocations(), api.listAllHistoricalCaseData()])
      .then(([c, f, a, h]) => {
        setCounties(c);
        setForecasts(f);
        setAllocations(a);
        setHistorical(h);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const thresholds = useThresholds();
  const recommendations = useMemo(
    () => buildRecommendations(counties, forecasts, allocations, historical, new Date(), thresholds),
    [counties, forecasts, allocations, historical, thresholds],
  );

  const counts = useMemo(() => {
    const c: Record<Priority, number> = { high: 0, mid: 0, low: 0, "no-data": 0 };
    for (const r of recommendations) c[r.priority]++;
    return c;
  }, [recommendations]);

  const visible = filter === "all" ? recommendations : recommendations.filter((r) => r.priority === filter);

  if (loading) return <p className="placeholder-note">Loading…</p>;

  return (
    <div>
      <h2>{t("page.decisionSupport")}</h2>
      <p className="placeholder-note">
        Plain-language recommendations generated from your stored forecasts, allocations, and a modelled case
        trend — using simple, fixed rules over real numbers, not a separate opaque model. Every card's "Why?" shows
        exactly what drove it, and every card links back to the source (Forecasts, Vaccine Allocation). The cutoffs
        behind "high risk", "stale", "under-covered" are configurable in <Link to="/settings">Settings</Link>.
      </p>
      {error && <p style={{ color: "var(--risk-high)" }}>Could not reach backend: {error}</p>}

      <div className="rec-summary">
        <button type="button" className="rec-summary-chip rec-summary-chip-high" onClick={() => setFilter("high")}>
          <span className="rec-summary-count">{counts.high}</span>
          <span>high priority</span>
        </button>
        <button type="button" className="rec-summary-chip rec-summary-chip-mid" onClick={() => setFilter("mid")}>
          <span className="rec-summary-count">{counts.mid}</span>
          <span>moderate</span>
        </button>
        <button type="button" className="rec-summary-chip rec-summary-chip-low" onClick={() => setFilter("low")}>
          <span className="rec-summary-count">{counts.low}</span>
          <span>stable</span>
        </button>
        <button type="button" className="rec-summary-chip rec-summary-chip-no-data" onClick={() => setFilter("no-data")}>
          <span className="rec-summary-count">{counts["no-data"]}</span>
          <span>no data</span>
        </button>
      </div>

      <div className="rec-filters">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            className={`btn btn-sm ${filter === f.value ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="placeholder-note">No counties match this filter.</p>
      ) : (
        <div className="rec-grid">
          {visible.map((rec) => (
            <RecommendationCard key={rec.county.id} rec={rec} />
          ))}
        </div>
      )}
    </div>
  );
}
