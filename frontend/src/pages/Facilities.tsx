import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api, County, FACILITY_LEVELS, HealthFacility } from "../api/client";
import Pagination from "../components/Pagination";
import { PlusIcon, UserIcon } from "../components/icons";
import { useAuth } from "../lib/auth";
import { useLanguage } from "../lib/i18n";

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
      <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)} disabled={!username}>
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
    <div className="trigger-panel">
      <div className="trigger-panel-header">
        <h3>
          <PlusIcon size={16} /> Add facility
        </h3>
      </div>
      <form onSubmit={handleSubmit}>
        <div className="field-row">
          <label className="field">
            <span className="field-label">Name</span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="field">
            <span className="field-label">County</span>
            <select value={countyId} onChange={(e) => setCountyId(e.target.value ? Number(e.target.value) : "")} required>
              <option value="">Select county…</option>
              {counties.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Level</span>
            <select value={level} onChange={(e) => setLevel(e.target.value)}>
              {FACILITY_LEVELS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">KMHFL code (optional)</span>
            <input type="text" value={kmhflCode} onChange={(e) => setKmhflCode(e.target.value)} />
          </label>
        </div>
        {error && <p className="form-banner-error">{error}</p>}
        <div style={{ display: "flex", gap: 10 }}>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? "Adding…" : "Add facility"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
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
      <p className="placeholder-note">Reporting sites case reports are submitted against.</p>

      {!username && (
        <p className="placeholder-note">
          <UserIcon size={14} /> Sign in to add a facility.
        </p>
      )}
      <div style={{ marginBottom: 20 }}>
        <AddFacilityForm counties={counties} onCreated={load} />
      </div>

      <div className="card">
        {error && <p style={{ color: "var(--risk-high)" }}>Could not reach backend: {error}</p>}
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Health facilities table, scrollable horizontally">
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
      </div>
    </div>
  );
}
