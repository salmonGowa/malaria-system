import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api, County, ForecastRun, GenerateForecastsError } from "../api/client";
import Card from "../components/Card";
import CountyPicker from "../components/CountyPicker";
import { UserIcon } from "../components/icons";
import { useAuth } from "../lib/auth";
import { FORM_BANNER_ERROR_CLASS, FORM_BANNER_SUCCESS_CLASS } from "../lib/bannerClasses";
import { btnClass } from "../lib/buttonClasses";
import { FIELD_INPUT_CLASS, FIELD_LABEL_CLASS, FIELD_ROW_CLASS, FIELD_ROW_FIELD_CLASS } from "../lib/fieldClasses";
import { useLanguage } from "../lib/i18n";
import { PLACEHOLDER_NOTE_CLASS } from "../lib/noteClasses";
import {
  GENERATE_RESULT_ITEM_CLASS,
  GENERATE_RESULTS_CLASS,
  GENERATE_RESULTS_LIST_CLASS,
  RISK_VALUE_CLASS,
} from "../lib/triggerPanelClasses";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function GenerateForecast() {
  const { t } = useLanguage();
  const { username } = useAuth();
  const [counties, setCounties] = useState<County[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [asOfDate, setAsOfDate] = useState(todayIso());
  const [horizonWeeks, setHorizonWeeks] = useState(4);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: ForecastRun[]; errors: GenerateForecastsError[] } | null>(null);

  useEffect(() => {
    api
      .listAllCounties()
      .then((cs) => {
        setCounties(cs);
        setSelected(new Set(cs.map((c) => c.id)));
      })
      .catch(() => undefined);
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (selected.size === 0) {
      setError("Select at least one county.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.generateForecasts({
        county_ids: [...selected],
        as_of_date: asOfDate,
        horizon_weeks: horizonWeeks,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate forecasts");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h2>{t("page.generateForecast")}</h2>
      <p className={PLACEHOLDER_NOTE_CLASS}>
        Calls the trained model (ml_service/app/forecasting.py) for each selected county using its real recent
        rainfall + case history, and stores the result. See results on <Link to="/forecasts">Forecasts</Link>.
      </p>

      <Card>
        {!username && (
          <p className={FORM_BANNER_ERROR_CLASS}>
            <UserIcon size={14} /> Sign in (top right) to generate forecasts.
          </p>
        )}

        <form onSubmit={handleSubmit}>
          <CountyPicker counties={counties} selected={selected} onChange={setSelected} />

          <div className={FIELD_ROW_CLASS}>
            <label className={FIELD_ROW_FIELD_CLASS}>
              <span className={FIELD_LABEL_CLASS}>As of date</span>
              <input
                type="date"
                className={FIELD_INPUT_CLASS}
                value={asOfDate}
                onChange={(e) => setAsOfDate(e.target.value)}
                disabled={!username}
              />
            </label>
            <label className={FIELD_ROW_FIELD_CLASS}>
              <span className={FIELD_LABEL_CLASS}>Horizon (weeks)</span>
              <input
                type="number"
                className={FIELD_INPUT_CLASS}
                min={1}
                max={26}
                value={horizonWeeks}
                onChange={(e) => setHorizonWeeks(Number(e.target.value))}
                disabled={!username}
              />
            </label>
          </div>

          {error && <p className={FORM_BANNER_ERROR_CLASS}>{error}</p>}

          <button type="submit" className={btnClass("primary")} disabled={!username || submitting}>
            {submitting ? t("common.generating") : t("common.generateForecasts")}
          </button>
        </form>

        {result && (
          <div className={GENERATE_RESULTS_CLASS}>
            {result.created.length > 0 && (
              <p className={FORM_BANNER_SUCCESS_CLASS}>
                Generated {result.created.length} forecast{result.created.length === 1 ? "" : "s"}.
              </p>
            )}
            <ul className={GENERATE_RESULTS_LIST_CLASS} data-testid="generate-results-list">
              {result.created.map((f) => (
                <li key={f.id} className={GENERATE_RESULT_ITEM_CLASS}>
                  <span>{f.county_name}</span>
                  <span className={RISK_VALUE_CLASS}>risk {f.risk_score.toFixed(3)}</span>
                </li>
              ))}
              {result.errors.map((e) => (
                <li key={e.county_code} className={GENERATE_RESULT_ITEM_CLASS}>
                  <span>{e.county_name}</span>
                  <span style={{ color: "var(--risk-high)" }}>{e.error}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}
