import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api, County, FACILITY_LEVELS, HealthFacility } from "../api/client";
import Card from "../components/Card";
import Pagination from "../components/Pagination";
import { PlusIcon, UserIcon } from "../components/icons";
import { useAuth } from "../lib/auth";
import { FORM_BANNER_ERROR_CLASS } from "../lib/bannerClasses";
import { btnClass } from "../lib/buttonClasses";
import { FIELD_INPUT_CLASS, FIELD_LABEL_CLASS, FIELD_ROW_CLASS, FIELD_ROW_FIELD_CLASS } from "../lib/fieldClasses";
import { useLanguage } from "../lib/i18n";
import { TRIGGER_PANEL_CLASS, TRIGGER_PANEL_HEADER_CLASS, TRIGGER_PANEL_TITLE_CLASS } from "../lib/triggerPanelClasses";
import { PLACEHOLDER_NOTE_CLASS } from "../lib/noteClasses";

const PAGE_SIZE = 50;

function AddFacilityForm({ counties, onCreated }: { counties: County[]; onCreated: () => void }) {
  const { username } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [countyId, setCountyId] = useState<number | "">("");
  const [level, setLevel] = useState<string>(FACILITY_LEVELS[0].value);
  const [kmhflCode, setKmhflCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button type="button" className={btnClass("secondary")} onClick={() => setOpen(true)} disabled={!username}>
        <PlusIcon size={14} /> Add facility
      </button>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!countyId) {
      setError("Select a county.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.createFacility({ name, county: countyId, level, kmhfl_code: kmhflCode || undefined });
      setName("");
      setKmhflCode("");
      setOpen(false);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create facility");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={TRIGGER_PANEL_CLASS}>
      <div className={TRIGGER_PANEL_HEADER_CLASS}>
        <h3 className={TRIGGER_PANEL_TITLE_CLASS}>
          <PlusIcon size={16} /> Add facility
        </h3>
      </div>
      <form onSubmit={handleSubmit}>
        <div className={FIELD_ROW_CLASS}>
          <label className={FIELD_ROW_FIELD_CLASS}>
            <span className={FIELD_LABEL_CLASS}>Name</span>
            <input type="text" className={FIELD_INPUT_CLASS} value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className={FIELD_ROW_FIELD_CLASS}>
            <span className={FIELD_LABEL_CLASS}>County</span>
            <select
              className={FIELD_INPUT_CLASS}
              value={countyId}
              onChange={(e) => setCountyId(e.target.value ? Number(e.target.value) : "")}
              required
            >
              <option value="">Select county…</option>
              {counties.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className={FIELD_ROW_FIELD_CLASS}>
            <span className={FIELD_LABEL_CLASS}>Level</span>
            <select className={FIELD_INPUT_CLASS} value={level} onChange={(e) => setLevel(e.target.value)}>
              {FACILITY_LEVELS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label className={FIELD_ROW_FIELD_CLASS}>
            <span className={FIELD_LABEL_CLASS}>KMHFL code (optional)</span>
            <input type="text" className={FIELD_INPUT_CLASS} value={kmhflCode} onChange={(e) => setKmhflCode(e.target.value)} />
          </label>
        </div>
        {error && <p className={FORM_BANNER_ERROR_CLASS}>{error}</p>}
        <div style={{ display: "flex", gap: 10 }}>
          <button type="submit" className={btnClass("primary")} disabled={submitting}>
            {submitting ? "Adding…" : "Add facility"}
          </button>
          <button type="button" className={btnClass("secondary")} onClick={() => setOpen(false)}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

export default function Facilities() {
  const { t } = useLanguage();
  const { username } = useAuth();
  const [counties, setCounties] = useState<County[]>([]);
  const [facilities, setFacilities] = useState<HealthFacility[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    api
      .listFacilities(page)
      .then((data) => {
        setFacilities(data.results);
        setCount(data.count);
        setError(null);
      })
      .catch((err) => setError(err.message));
  };

  useEffect(() => {
    api.listAllCounties().then(setCounties).catch(() => undefined);
  }, []);
  useEffect(load, [page]);

  return (
    <div>
      <h2>{t("page.facilities")}</h2>
      <p className={PLACEHOLDER_NOTE_CLASS}>Reporting sites case reports are submitted against.</p>

      {!username && (
        <p className={PLACEHOLDER_NOTE_CLASS}>
          <UserIcon size={14} /> Sign in to add a facility.
        </p>
      )}
      <div style={{ marginBottom: 20 }}>
        <AddFacilityForm counties={counties} onCreated={load} />
      </div>

      <Card>
        {error && <p style={{ color: "var(--risk-high)" }}>Could not reach backend: {error}</p>}
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Health facilities table, scrollable horizontally">
          <table>
            <thead>
              <tr>
                <th>{t("table.name")}</th>
                <th>{t("table.county")}</th>
                <th>Level</th>
                <th>KMHFL code</th>
              </tr>
            </thead>
            <tbody>
              {facilities.map((f) => (
                <tr key={f.id}>
                  <td>{f.name}</td>
                  <td>
                    <Link to={`/counties/${f.county}`}>{f.county_name}</Link>
                  </td>
                  <td>{f.level.replace("_", " ")}</td>
                  <td className="mono">{f.kmhfl_code || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={PAGE_SIZE} count={count} onPageChange={setPage} />
      </Card>
    </div>
  );
}
