import { FormEvent, lazy, Suspense, useMemo, useState, type ReactNode } from "react";

import { api, County, CountyReadiness } from "../api/client";
import Card from "./Card";
import CountyShape from "./CountyShape";
import { AlertIcon, MapPinIcon } from "./icons";
import { BANNER_WARNING_CLASS, FORM_BANNER_ERROR_CLASS } from "../lib/bannerClasses";
import { btnClass } from "../lib/buttonClasses";
import { FIELD_HINT_CLASS, FIELD_INPUT_CLASS, FIELD_LABEL_CLASS } from "../lib/fieldClasses";
import { formatCompact } from "../lib/format";
import { ROUTE_LOADING_CLASS } from "../lib/noteClasses";

const BoundaryLocator = lazy(() => import("./BoundaryLocator"));

const CODE_FORMAT = /^KEN-\d{3}$/;
// Kenya's smallest county (Lamu) has ~140k people; anything far below that
// is far more likely a typo (a dropped digit) than a real county.
const SMALLEST_COUNTY = 140_000;

interface Props {
  county: County;
  allCounties: County[];
  readiness: CountyReadiness | undefined;
  /** `dataStale`: the change affects generated data (population scales the
   * case history; a new boundary changes the rainfall average), so it should
   * be reloaded. `keepOpen`: a location-only save — leave the form open so
   * unsaved field edits aren't lost. */
  onSaved: (county: County, opts: { dataStale: boolean; keepOpen: boolean }) => void;
  onCancel: () => void;
}

function Field({
  label,
  changed,
  error,
  hint,
  warning,
  children,
}: {
  label: string;
  changed: boolean;
  error?: string | null;
  hint?: ReactNode;
  warning?: string | null;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-[0.8125rem]">
      <span className={FIELD_LABEL_CLASS}>
        {label}
        {changed && <span className="ml-2 text-[0.7rem] font-semibold text-accent-text">changed</span>}
      </span>
      {children}
      {error ? (
        <span className="flex items-center gap-1 text-xs font-medium text-risk-high">
          <AlertIcon size={12} /> {error}
        </span>
      ) : warning ? (
        <span className="text-xs text-risk-mid">{warning}</span>
      ) : (
        hint && <span className={FIELD_HINT_CLASS}>{hint}</span>
      )}
    </label>
  );
}

/** Edit a county's details and location. Checks duplicates and likely
 * typos before saving, and flags when a change (population) means its
 * generated data should be reloaded. */
export default function EditCounty({ county, allCounties, readiness, onSaved, onCancel }: Props) {
  const [name, setName] = useState(county.name);
  const [code, setCode] = useState(county.code);
  const [population, setPopulation] = useState(county.population ? String(county.population) : "");
  const [endemic, setEndemic] = useState(county.is_endemic_focus);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<{ field: "name" | "code" | null; message: string } | null>(null);
  const [relocating, setRelocating] = useState(false);
  const [shape, setShape] = useState(county.boundary);

  const others = useMemo(() => allCounties.filter((c) => c.id !== county.id), [allCounties, county.id]);
  const trimmedName = name.trim();
  const trimmedCode = code.trim().toUpperCase();
  const popNumber = population === "" ? null : Number(population);

  const nameError = !trimmedName
    ? "A name is required."
    : others.some((c) => c.name.toLowerCase() === trimmedName.toLowerCase())
      ? "Another county already has this name."
      : serverError?.field === "name"
        ? serverError.message
        : null;
  const codeError = !trimmedCode
    ? "A code is required."
    : others.some((c) => c.code.toUpperCase() === trimmedCode)
      ? `${others.find((c) => c.code.toUpperCase() === trimmedCode)?.name} already uses this code.`
      : serverError?.field === "code"
        ? serverError.message
        : null;
  const popError = popNumber !== null && (!Number.isInteger(popNumber) || popNumber < 0) ? "Enter a whole number." : null;

  const codeWarning = trimmedCode && !CODE_FORMAT.test(trimmedCode) ? "Kenya county codes look like KEN-016." : null;
  const popWarning =
    popNumber !== null && !popError && popNumber > 0 && popNumber < SMALLEST_COUNTY
      ? `That's smaller than any Kenyan county (the smallest has about ${formatCompact(SMALLEST_COUNTY)} people) — check for a missing digit.`
      : null;

  const changed = {
    name: trimmedName !== county.name,
    code: trimmedCode !== county.code,
    population: popNumber !== county.population,
    endemic: endemic !== county.is_endemic_focus,
  };
  const dirty = Object.values(changed).some(Boolean);
  const invalid = Boolean(nameError || codeError || popError);
  const hasGeneratedData = (readiness?.case_months ?? 0) > 0;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!dirty || invalid) return;
    setSaving(true);
    setServerError(null);
    try {
      const body: Partial<{ name: string; code: string; population: number | null; is_endemic_focus: boolean }> = {};
      if (changed.name) body.name = trimmedName;
      if (changed.code) body.code = trimmedCode;
      if (changed.population) body.population = popNumber;
      if (changed.endemic) body.is_endemic_focus = endemic;
      const saved = await api.updateCounty(county.id, body);
      onSaved({ ...saved, boundary: shape }, { dataStale: changed.population && hasGeneratedData, keepOpen: false });
    } catch (err) {
      const message = err instanceof Error ? err.message.replace(/^Request to .*? — /, "") : "Couldn't save changes";
      setServerError({ field: /\bcode\b/i.test(message) ? "code" : /\bname\b/i.test(message) ? "name" : null, message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="m-0 text-[0.95rem] font-semibold text-text">Edit {county.name}</h3>
          <p className="mt-0.5 mb-0 text-[0.8125rem] text-muted">Changes apply everywhere straight away.</p>
        </div>
      </div>

      <div className="grid gap-6 min-[1101px]:grid-cols-[minmax(0,1fr)_280px]">
        <form onSubmit={handleSubmit} noValidate>
          <div className="mb-4 grid gap-4 min-[641px]:grid-cols-2">
            <Field label="Name" changed={changed.name} error={nameError}>
              <input
                type="text"
                className={FIELD_INPUT_CLASS}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setServerError(null);
                }}
                aria-invalid={Boolean(nameError)}
              />
            </Field>
            <Field label="Code" changed={changed.code} error={codeError} warning={codeWarning} hint="Kenya county code, e.g. KEN-016.">
              <input
                type="text"
                className={`${FIELD_INPUT_CLASS} uppercase`}
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setServerError(null);
                }}
                aria-invalid={Boolean(codeError)}
              />
            </Field>
            <Field
              label="Population"
              changed={changed.population}
              error={popError}
              warning={popWarning}
              hint={popNumber ? `${formatCompact(popNumber)} people` : "Leave empty if unknown."}
            >
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                className={FIELD_INPUT_CLASS}
                value={population}
                onChange={(e) => setPopulation(e.target.value)}
                aria-invalid={Boolean(popError)}
              />
            </Field>
            <div className="flex flex-col gap-1.5 text-[0.8125rem]">
              <span className={FIELD_LABEL_CLASS}>
                Project scope
                {changed.endemic && <span className="ml-2 text-[0.7rem] font-semibold text-accent-text">changed</span>}
              </span>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border-strong px-3 py-2.5">
                <input type="checkbox" className="mt-0.5 size-4 cursor-pointer accent-[var(--accent)]" checked={endemic} onChange={(e) => setEndemic(e.target.checked)} />
                <span>
                  <span className="block font-medium text-text">In the endemic-focus scope</span>
                  <span className="block text-xs text-muted">One of the counties this project concentrates on.</span>
                </span>
              </label>
            </div>
          </div>

          {changed.population && hasGeneratedData && !popError && !popWarning && (
            <p className={`${BANNER_WARNING_CLASS} mb-4`}>
              Population scales {county.name}'s case history and vaccine coverage. After saving you'll be offered to reload its data so
              they match the new figure.
            </p>
          )}
          {serverError && !serverError.field && <p className={FORM_BANNER_ERROR_CLASS}>{serverError.message}</p>}

          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className={btnClass("primary")} disabled={!dirty || invalid || saving}>
              {saving ? "Saving…" : "Save changes"}
            </button>
            <button type="button" className={btnClass("secondary")} onClick={onCancel}>
              {dirty ? "Discard" : "Close"}
            </button>
            {!dirty && <span className="text-xs text-muted">No changes yet.</span>}
          </div>
        </form>

        <div className="min-w-0">
          <div className="mb-1.5 text-[0.8125rem] font-medium text-text-secondary">Location</div>
          <div className="flex items-center gap-3 rounded-xl border border-border p-3">
            <div className="grid size-[72px] flex-none place-items-center rounded-lg bg-panel-muted">
              {shape ? (
                <CountyShape geometry={shape} fill="#14a37f" size={64} label={`Current outline of ${county.name}`} />
              ) : (
                <MapPinIcon size={18} />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-[0.8125rem] font-semibold text-text">{shape ? "Official boundary set" : "Not on the map yet"}</div>
              <button
                type="button"
                className="mt-1 cursor-pointer border-0 bg-transparent p-0 text-[0.8125rem] font-semibold text-accent-text hover:underline"
                onClick={() => setRelocating((v) => !v)}
              >
                {relocating ? "Keep current location" : shape ? "Change location" : "Locate on map"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {relocating && (
        <div className="mt-5 border-t border-border pt-5">
          <Suspense fallback={<div className={ROUTE_LOADING_CLASS}>Loading map…</div>}>
            <BoundaryLocator
              county={county}
              others={allCounties}
              onCancel={() => setRelocating(false)}
              onSaved={(updated) => {
                setShape(updated.boundary);
                setRelocating(false);
                onSaved({ ...county, boundary: updated.boundary }, { dataStale: hasGeneratedData, keepOpen: true });
              }}
            />
          </Suspense>
        </div>
      )}
    </Card>
  );
}
