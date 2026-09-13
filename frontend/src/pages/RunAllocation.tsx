import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api, County, VaccineAllocation } from "../api/client";
import CountyPicker from "../components/CountyPicker";
import { UserIcon } from "../components/icons";
import { useAuth } from "../lib/auth";
import { formatNumber } from "../lib/format";
import { useLanguage } from "../lib/i18n";

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
      <p className="placeholder-note">
        Solves the risk-weighted allocation LP (ml_service/app/allocation.py) against each selected county's{" "}
        <em>latest stored forecast</em> — see <Link to="/generate-forecast">Generate Forecast</Link> first if a
        county has none yet. Results land on <Link to="/allocations">Vaccine Allocation</Link>.
      </p>

      <div className="card">
        {!username && (
          <p className="form-banner-error">
            <UserIcon size={14} /> Sign in (top right) to run an allocation.
          </p>
        )}

        <form onSubmit={handleSubmit}>
          <CountyPicker counties={counties} selected={selected} onChange={setSelected} />

          <div className="field-row">
            <label className="field">
              <span className="field-label">Total available doses</span>
              <input
                type="number"
                min={1}
                value={totalDoses}
                onChange={(e) => setTotalDoses(Number(e.target.value))}
                disabled={!username}
              />
            </label>
            <label className="field">
              <span className="field-label">Period start</span>
              <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} disabled={!username} />
              <span className="field-hint">4-week period, ending {addWeeksIso(periodStart, 4)}</span>
            </label>
            <label className="field">
              <span className="field-label">Max. share per county</span>
              <input
                type="number"
                min={1}
                max={100}
                value={maxSharePct}
                onChange={(e) => setMaxSharePct(Number(e.target.value))}
                disabled={!username}
              />
              <span className="field-hint">
                {maxSharePct >= 100
                  ? "100% = no cap — a linear objective concentrates doses in the single highest-risk county (see docs/architecture.md)"
                  : `No county gets more than ${maxSharePct}% of total doses — forces spread across multiple counties`}
              </span>
            </label>
          </div>

          {error && <p className="form-banner-error">{error}</p>}

          <button type="submit" className="btn btn-primary" disabled={!username || submitting}>
            {submitting ? t("common.allocating") : t("common.runAllocation")}
          </button>
        </form>

        {created && (
          <div className="generate-results">
            {created.length > 0 ? (
              <>
                <p className="form-banner-success">
                  Allocated {formatNumber(created.reduce((sum, a) => sum + a.recommended_doses, 0))} doses across{" "}
                  {created.length} {created.length === 1 ? "county" : "counties"}.
                </p>
                <ul className="generate-results-list">
                  {created
                    .slice()
                    .sort((a, b) => b.recommended_doses - a.recommended_doses)
                    .map((a) => (
                      <li key={a.id}>
                        <span>{a.county_name}</span>
                        <span className="risk-value">{formatNumber(a.recommended_doses)} doses</span>
                      </li>
                    ))}
                </ul>
              </>
            ) : (
              <p className="form-banner-error">No allocations were created — do the selected counties have a stored forecast?</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
