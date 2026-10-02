import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api, County, VaccineAllocation } from "../api/client";
import Card from "../components/Card";
import CountyPicker from "../components/CountyPicker";
import { UserIcon } from "../components/icons";
import { useAuth } from "../lib/auth";
import { FORM_BANNER_ERROR_CLASS, FORM_BANNER_SUCCESS_CLASS } from "../lib/bannerClasses";
import { btnClass } from "../lib/buttonClasses";
import {
  FIELD_HINT_CLASS,
  FIELD_INPUT_CLASS,
  FIELD_LABEL_CLASS,
  FIELD_ROW_CLASS,
  FIELD_ROW_FIELD_CLASS,
} from "../lib/fieldClasses";
import { formatNumber } from "../lib/format";
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

function addWeeksIso(iso: string, weeks: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

export default function RunAllocation() {
  const { t } = useLanguage();
  const { username } = useAuth();
  const [counties, setCounties] = useState<County[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [totalDoses, setTotalDoses] = useState(50000);
  const [periodStart, setPeriodStart] = useState(todayIso());
  const [maxSharePct, setMaxSharePct] = useState(100);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<VaccineAllocation[] | null>(null);

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
    setCreated(null);
    try {
      const res = await api.generateAllocations({
        total_available_doses: totalDoses,
        county_ids: [...selected],
        period_start: periodStart,
        period_end: addWeeksIso(periodStart, 4),
        max_share_per_county: maxSharePct / 100,
      });
      setCreated(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run allocation");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h2>{t("page.runAllocation")}</h2>
      <p className={PLACEHOLDER_NOTE_CLASS}>
        Solves the risk-weighted allocation LP (ml_service/app/allocation.py) against each selected county's{" "}
        <em>latest stored forecast</em> — see <Link to="/generate-forecast">Generate Forecast</Link> first if a
        county has none yet. Results land on <Link to="/allocations">Vaccine Allocation</Link>.
      </p>

      <Card>
        {!username && (
          <p className={FORM_BANNER_ERROR_CLASS}>
            <UserIcon size={14} /> Sign in (top right) to run an allocation.
          </p>
        )}

        <form onSubmit={handleSubmit}>
          <CountyPicker counties={counties} selected={selected} onChange={setSelected} />

          <div className={FIELD_ROW_CLASS}>
            <label className={FIELD_ROW_FIELD_CLASS}>
              <span className={FIELD_LABEL_CLASS}>Total available doses</span>
              <input
                type="number"
                className={FIELD_INPUT_CLASS}
                min={1}
                value={totalDoses}
                onChange={(e) => setTotalDoses(Number(e.target.value))}
                disabled={!username}
              />
            </label>
            <label className={FIELD_ROW_FIELD_CLASS}>
              <span className={FIELD_LABEL_CLASS}>Period start</span>
              <input
                type="date"
                className={FIELD_INPUT_CLASS}
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                disabled={!username}
              />
              <span className={FIELD_HINT_CLASS}>4-week period, ending {addWeeksIso(periodStart, 4)}</span>
            </label>
            <label className={FIELD_ROW_FIELD_CLASS}>
              <span className={FIELD_LABEL_CLASS}>Max. share per county</span>
              <input
                type="number"
                className={FIELD_INPUT_CLASS}
                min={1}
                max={100}
                value={maxSharePct}
                onChange={(e) => setMaxSharePct(Number(e.target.value))}
                disabled={!username}
              />
              <span className={FIELD_HINT_CLASS}>
                {maxSharePct >= 100
                  ? "100% = no cap — a linear objective concentrates doses in the single highest-risk county (see docs/architecture.md)"
                  : `No county gets more than ${maxSharePct}% of total doses — forces spread across multiple counties`}
              </span>
            </label>
          </div>

          {error && <p className={FORM_BANNER_ERROR_CLASS}>{error}</p>}

          <button type="submit" className={btnClass("primary")} disabled={!username || submitting}>
            {submitting ? t("common.allocating") : t("common.runAllocation")}
          </button>
        </form>

        {created && (
          <div className={GENERATE_RESULTS_CLASS}>
            {created.length > 0 ? (
              <>
                <p className={FORM_BANNER_SUCCESS_CLASS}>
                  Allocated {formatNumber(created.reduce((sum, a) => sum + a.recommended_doses, 0))} doses across{" "}
                  {created.length} {created.length === 1 ? "county" : "counties"}.
                </p>
                <ul className={GENERATE_RESULTS_LIST_CLASS}>
                  {created
                    .slice()
                    .sort((a, b) => b.recommended_doses - a.recommended_doses)
                    .map((a) => (
                      <li key={a.id} className={GENERATE_RESULT_ITEM_CLASS}>
                        <span>{a.county_name}</span>
                        <span className={RISK_VALUE_CLASS}>{formatNumber(a.recommended_doses)} doses</span>
                      </li>
                    ))}
                </ul>
              </>
            ) : (
              <p className={FORM_BANNER_ERROR_CLASS}>No allocations were created — do the selected counties have a stored forecast?</p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
