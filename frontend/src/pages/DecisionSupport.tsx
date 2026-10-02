import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { api, County, ForecastRun, HistoricalCaseData, VaccineAllocation } from "../api/client";
import Card from "../components/Card";
import { AlertIcon, CheckCircleIcon, InfoIcon, TrendDownIcon, TrendFlatIcon, TrendUpIcon } from "../components/icons";
import { priorityBadgeClass } from "../lib/badgeClasses";
import { btnClass } from "../lib/buttonClasses";
import {
  recCardClass,
  REC_ACTION_ITEM_CLASS,
  REC_ACTIONS_CLASS,
  REC_ACTIONS_LABEL_CLASS,
  REC_CARD_HEADER_CLASS,
  REC_CARD_TITLE_CLASS,
  REC_CARD_TITLE_LINK_CLASS,
  REC_FILTERS_CLASS,
  REC_GRID_CLASS,
  REC_STAT_CLASS,
  REC_STAT_LABEL_CLASS,
  REC_STAT_VALUE_CLASS,
  REC_STATS_CLASS,
  REC_SUMMARY_CLASS,
  REC_WHY_CLASS,
  REC_WHY_SUMMARY_CLASS,
  REC_WHY_UL_CLASS,
  recSummaryChipClass,
  recSummaryCountClass,
  trendBadgeClass,
} from "../lib/decisionSupportClasses";
import { PLACEHOLDER_NOTE_CLASS } from "../lib/noteClasses";
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
      <span className={trendBadgeClass("neutral")}>
        <TrendFlatIcon size={13} /> No modelled trend data
      </span>
    );
  }
  const pct = rec.trendChangePct !== null ? `${rec.trendChangePct > 0 ? "+" : ""}${Math.round(rec.trendChangePct)}%` : "";
  if (rec.trend === "rising") {
    return (
      <span className={trendBadgeClass("caution")}>
        <TrendUpIcon size={13} /> Modelled trend rising {pct}
      </span>
    );
  }
  if (rec.trend === "falling") {
    return (
      <span className={trendBadgeClass("good")}>
        <TrendDownIcon size={13} /> Modelled trend falling {pct}
      </span>
    );
  }
  return (
    <span className={trendBadgeClass("neutral")}>
      <TrendFlatIcon size={13} /> Modelled trend stable
    </span>
  );
}

function RecommendationCard({ rec }: { rec: CountyRecommendation }) {
  const Icon = PRIORITY_ICON[rec.priority];
  return (
    <Card className={recCardClass(rec.priority)}>
      <div className={REC_CARD_HEADER_CLASS}>
        <h3 className={REC_CARD_TITLE_CLASS}>
          <Link to={`/counties/${rec.county.id}`} className={REC_CARD_TITLE_LINK_CLASS}>
            {rec.county.name}
          </Link>
        </h3>
        <span className={priorityBadgeClass(rec.priority)}>
          <Icon size={13} /> {PRIORITY_LABEL[rec.priority]}
        </span>
      </div>

      <div className={REC_STATS_CLASS}>
        <div className={REC_STAT_CLASS}>
          <span className={REC_STAT_LABEL_CLASS}>Risk score</span>
          <span className={REC_STAT_VALUE_CLASS}>{rec.riskScore !== null ? `${Math.round(rec.riskScore * 100)}%` : "—"}</span>
        </div>
        <div className={REC_STAT_CLASS}>
          <span className={REC_STAT_LABEL_CLASS}>Dose coverage</span>
          <span className={REC_STAT_VALUE_CLASS}>{rec.coveragePct !== null ? `${rec.coveragePct.toFixed(1)}%` : "—"}</span>
        </div>
        <div className={REC_STAT_CLASS}>
          <span className={REC_STAT_LABEL_CLASS}>Forecast age</span>
          <span className={REC_STAT_VALUE_CLASS}>{rec.forecastAgeDays !== null ? `${rec.forecastAgeDays}d` : "—"}</span>
        </div>
      </div>

      <TrendBadge rec={rec} />

      <p className={REC_ACTIONS_LABEL_CLASS}>Recommended actions</p>
      <ul className={REC_ACTIONS_CLASS}>
        {rec.actions.map((a, i) => (
          <li key={i} className={REC_ACTION_ITEM_CLASS}>
            {a}
          </li>
        ))}
      </ul>

      <details className={REC_WHY_CLASS}>
        <summary className={REC_WHY_SUMMARY_CLASS}>Why?</summary>
        <ul className={REC_WHY_UL_CLASS}>
          {rec.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </details>
    </Card>
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

  if (loading) return <p className={PLACEHOLDER_NOTE_CLASS}>Loading…</p>;

  return (
    <div>
      <h2>{t("page.decisionSupport")}</h2>
      <p className={PLACEHOLDER_NOTE_CLASS}>
        Plain-language recommendations generated from your stored forecasts, allocations, and a modelled case
        trend — using simple, fixed rules over real numbers, not a separate opaque model. Every card's "Why?" shows
        exactly what drove it, and every card links back to the source (Forecasts, Vaccine Allocation). The cutoffs
        behind "high risk", "stale", "under-covered" are configurable in <Link to="/settings">Settings</Link>.
      </p>
      {error && <p style={{ color: "var(--risk-high)" }}>Could not reach backend: {error}</p>}

      <div className={REC_SUMMARY_CLASS}>
        <button type="button" className={recSummaryChipClass("high")} onClick={() => setFilter("high")}>
          <span className={recSummaryCountClass("high")}>{counts.high}</span>
          <span>high priority</span>
        </button>
        <button type="button" className={recSummaryChipClass("mid")} onClick={() => setFilter("mid")}>
          <span className={recSummaryCountClass("mid")}>{counts.mid}</span>
          <span>moderate</span>
        </button>
        <button type="button" className={recSummaryChipClass("low")} onClick={() => setFilter("low")}>
          <span className={recSummaryCountClass("low")}>{counts.low}</span>
          <span>stable</span>
        </button>
        <button type="button" className={recSummaryChipClass("no-data")} onClick={() => setFilter("no-data")}>
          <span className={recSummaryCountClass("no-data")}>{counts["no-data"]}</span>
          <span>no data</span>
        </button>
      </div>

      <div className={REC_FILTERS_CLASS}>
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            className={btnClass(filter === f.value ? "primary" : "secondary", { sm: true })}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className={PLACEHOLDER_NOTE_CLASS}>No counties match this filter.</p>
      ) : (
        <div className={REC_GRID_CLASS}>
          {visible.map((rec) => (
            <RecommendationCard key={rec.county.id} rec={rec} />
          ))}
        </div>
      )}
    </div>
  );
}
