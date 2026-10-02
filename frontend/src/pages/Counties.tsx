import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api, County } from "../api/client";
import Card, { CARD_SUBTITLE_CLASS } from "../components/Card";
import { COUNTY_PICKER_ITEM_CLASS } from "../components/CountyPicker";
import { PlusIcon, UserIcon } from "../components/icons";
import { useAuth } from "../lib/auth";
import { FORM_BANNER_ERROR_CLASS } from "../lib/bannerClasses";
import { btnClass } from "../lib/buttonClasses";
import { FIELD_INPUT_CLASS, FIELD_LABEL_CLASS, FIELD_ROW_CLASS, FIELD_ROW_FIELD_CLASS } from "../lib/fieldClasses";
import { formatNumber } from "../lib/format";
import { useLanguage } from "../lib/i18n";
import { PLACEHOLDER_NOTE_CLASS } from "../lib/noteClasses";
import { TRIGGER_PANEL_CLASS, TRIGGER_PANEL_HEADER_CLASS, TRIGGER_PANEL_TITLE_CLASS } from "../lib/triggerPanelClasses";

function AddCountyForm({ onCreated }: { onCreated: () => void }) {
  const { username } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [population, setPopulation] = useState("");
  const [isEndemicFocus, setIsEndemicFocus] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button type="button" className={btnClass("secondary")} onClick={() => setOpen(true)} disabled={!username}>
        <PlusIcon size={14} /> Add county
      </button>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.createCounty({
        name,
        code,
        population: population ? Number(population) : null,
        is_endemic_focus: isEndemicFocus,
      });
      setName("");
      setCode("");
      setPopulation("");
      setOpen(false);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create county");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={TRIGGER_PANEL_CLASS}>
      <div className={TRIGGER_PANEL_HEADER_CLASS}>
        <h3 className={TRIGGER_PANEL_TITLE_CLASS}>
          <PlusIcon size={16} /> Add county
        </h3>
      </div>
      <p className={CARD_SUBTITLE_CLASS} style={{ marginTop: -6 }}>
        Boundary geometry isn't set here — see data/scripts/load_county_boundaries.py once the county exists.
      </p>
      <form onSubmit={handleSubmit}>
        <div className={FIELD_ROW_CLASS}>
          <label className={FIELD_ROW_FIELD_CLASS}>
            <span className={FIELD_LABEL_CLASS}>Name</span>
            <input type="text" className={FIELD_INPUT_CLASS} value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className={FIELD_ROW_FIELD_CLASS}>
            <span className={FIELD_LABEL_CLASS}>Code</span>
            <input
              type="text"
              className={FIELD_INPUT_CLASS}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="KEN-032"
              required
            />
          </label>
          <label className={FIELD_ROW_FIELD_CLASS}>
            <span className={FIELD_LABEL_CLASS}>Population</span>
            <input type="number" className={FIELD_INPUT_CLASS} min={0} value={population} onChange={(e) => setPopulation(e.target.value)} />
          </label>
        </div>
        <label className={COUNTY_PICKER_ITEM_CLASS} style={{ marginBottom: 12 }}>
          <input type="checkbox" checked={isEndemicFocus} onChange={(e) => setIsEndemicFocus(e.target.checked)} />
          <span>In the project's endemic-county scope</span>
        </label>
        {error && <p className={FORM_BANNER_ERROR_CLASS}>{error}</p>}
        <div style={{ display: "flex", gap: 10 }}>
          <button type="submit" className={btnClass("primary")} disabled={submitting}>
            {submitting ? "Adding…" : "Add county"}
          </button>
          <button type="button" className={btnClass("secondary")} onClick={() => setOpen(false)}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

export default function Counties() {
  const { t } = useLanguage();
  const { username } = useAuth();
  const [counties, setCounties] = useState<County[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    api
      .listAllCounties()
      .then(setCounties)
      .catch((err) => setError(err.message));
  };

  useEffect(load, []);

  return (
    <div>
      <h2>{t("page.counties")}</h2>
      <p className={PLACEHOLDER_NOTE_CLASS}>
        The reference list every other page filters against — click through for a county's full case, climate,
        forecast, and allocation history.
      </p>

      {!username && (
        <p className={PLACEHOLDER_NOTE_CLASS}>
          <UserIcon size={14} /> Sign in to add a county.
        </p>
      )}
      <div style={{ marginBottom: 20 }}>
        <AddCountyForm onCreated={load} />
      </div>

      <Card>
        {error && <p style={{ color: "var(--risk-high)" }}>Could not reach backend: {error}</p>}
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Counties table, scrollable horizontally">
          <table>
            <thead>
              <tr>
                <th>{t("table.name")}</th>
                <th>{t("table.code")}</th>
                <th>{t("table.population")}</th>
                <th>{t("table.endemicFocus")}</th>
                <th>{t("table.boundary")}</th>
              </tr>
            </thead>
            <tbody>
              {counties.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link to={`/counties/${c.id}`}>{c.name}</Link>
                  </td>
                  <td className="mono">{c.code}</td>
                  <td className="mono">{c.population ? formatNumber(c.population) : "—"}</td>
                  <td>{c.is_endemic_focus ? "Yes" : "No"}</td>
                  <td>{c.boundary ? <span className="text-risk-low">Set</span> : <span className="text-risk-mid">Missing</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
