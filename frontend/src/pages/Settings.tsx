import { FormEvent, useEffect, useState } from "react";

import Card from "../components/Card";
import { AlertIcon, UserIcon } from "../components/icons";
import { useAuth } from "../lib/auth";
import { FORM_BANNER_ERROR_CLASS, FORM_BANNER_SUCCESS_CLASS } from "../lib/bannerClasses";
import { btnClass } from "../lib/buttonClasses";
import { FIELD_CLASS, FIELD_HINT_CLASS, FIELD_INPUT_CLASS, FIELD_LABEL_CLASS } from "../lib/fieldClasses";
import { useLanguage } from "../lib/i18n";
import { PLACEHOLDER_NOTE_CLASS } from "../lib/noteClasses";
import { DecisionThresholds, DEFAULT_THRESHOLDS, resetThresholds, saveThresholds } from "../lib/settings";
import { useThresholds } from "../lib/useThresholds";

interface FieldSpec {
  key: keyof DecisionThresholds;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  suffix?: string;
}

const FIELDS: FieldSpec[] = [
  {
    key: "riskHigh",
    label: "High-risk cutoff",
    hint: "A forecast's risk score at or above this reads as high risk (red) everywhere in the app — Dashboard's map, Forecasts, Decision Support.",
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: "riskMid",
    label: "Moderate-risk cutoff",
    hint: "At or above this (and below the high-risk cutoff) reads as moderate risk (amber); below it reads as low risk (green).",
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: "staleForecastDays",
    label: "Stale forecast threshold",
    hint: "A county's latest forecast older than this many days is flagged as stale on Decision Support.",
    min: 1,
    max: 365,
    step: 1,
    suffix: "days",
  },
  {
    key: "lowCoveragePct",
    label: "Low coverage threshold",
    hint: "Doses allocated covering less than this % of a county's population count as \"effectively uncovered\".",
    min: 0,
    max: 100,
    step: 0.1,
    suffix: "%",
  },
  {
    key: "trendThresholdPct",
    label: "Trend noise threshold",
    hint: "Month-over-month modelled case change smaller than this % (either direction) reads as \"stable\" rather than a rising/falling trend.",
    min: 0,
    max: 100,
    step: 1,
    suffix: "%",
  },
];

export default function Settings() {
  const { t } = useLanguage();
  const { username } = useAuth();
  const liveThresholds = useThresholds();
  const [draft, setDraft] = useState<DecisionThresholds>(liveThresholds);
  const [baseline, setBaseline] = useState<DecisionThresholds>(liveThresholds);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDirty = FIELDS.some((f) => draft[f.key] !== baseline[f.key]);

  // Picks up a change made in another tab (or this page's own Reset) as
  // long as this form has no unsaved edits of its own — never clobbers
  // something the user is mid-way through typing.
  useEffect(() => {
    if (!isDirty) setDraft(liveThresholds);
    setBaseline(liveThresholds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveThresholds]);

  const handleChange = (key: keyof DecisionThresholds, value: number) => {
    setSaved(false);
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (draft.riskMid >= draft.riskHigh) {
      setError("The moderate-risk cutoff must be lower than the high-risk cutoff.");
      return;
    }
    saveThresholds(draft);
    setSaved(true);
  };

  const handleReset = () => {
    resetThresholds();
    setDraft(DEFAULT_THRESHOLDS);
    setBaseline(DEFAULT_THRESHOLDS);
    setSaved(true);
    setError(null);
  };

  return (
    <div>
      <h2>{t("page.settings")}</h2>
      <p className={PLACEHOLDER_NOTE_CLASS}>
        These cutoffs turn raw forecast/allocation numbers into the red/amber/green risk colors and "stale" /
        "under-covered" / "trending" labels used across the app (see lib/recommendations.ts and lib/format.ts's{" "}
        <code className="mono">riskBand</code>) — not model parameters, just where the line is drawn for "this
        needs attention". Saved to this browser only (see lib/settings.ts).
      </p>

      <Card>
        {!username && (
          <p className={FORM_BANNER_ERROR_CLASS}>
            <UserIcon size={14} /> Sign in (top right) to change these — everyone can see the current values below.
          </p>
        )}

        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-4.5 max-w-[480px]">
            {FIELDS.map((f) => (
              <label className={FIELD_CLASS} key={f.key}>
                <span className={FIELD_LABEL_CLASS}>
                  {f.label}
                  {f.suffix ? ` (${f.suffix})` : ""}
                </span>
                <input
                  type="number"
                  className={FIELD_INPUT_CLASS}
                  min={f.min}
                  max={f.max}
                  step={f.step}
                  value={draft[f.key]}
                  onChange={(e) => handleChange(f.key, Number(e.target.value))}
                  disabled={!username}
                />
                <span className={`${FIELD_HINT_CLASS} mt-0.5`}>{f.hint}</span>
              </label>
            ))}
          </div>

          {error && (
            <p className={FORM_BANNER_ERROR_CLASS}>
              <AlertIcon size={14} /> {error}
            </p>
          )}
          {saved && !isDirty && <p className={FORM_BANNER_SUCCESS_CLASS}>Saved — applied across the app immediately.</p>}

          <div className="flex gap-2.5 mt-4.5">
            <button type="submit" className={btnClass("primary")} disabled={!username || !isDirty}>
              {t("common.save")}
            </button>
            <button type="button" className={btnClass("secondary")} onClick={handleReset} disabled={!username}>
              {t("common.resetToDefaults")}
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
