import { FormEvent, useEffect, useMemo, useState, type ReactNode } from "react";

import { api, ForecastRun } from "../api/client";
import Card from "../components/Card";
import { AlertIcon, CheckCircleIcon, MoonIcon, SunIcon } from "../components/icons";
import { latestForecastByCounty } from "../lib/analytics";
import { useAuth } from "../lib/auth";
import { priorityBadgeClass } from "../lib/badgeClasses";
import { FORM_BANNER_ERROR_CLASS } from "../lib/bannerClasses";
import { btnClass } from "../lib/buttonClasses";
import { FIELD_INPUT_CLASS } from "../lib/fieldClasses";
import { riskBand } from "../lib/format";
import { Language, useLanguage } from "../lib/i18n";
import { DecisionThresholds, DEFAULT_THRESHOLDS, resetThresholds, saveThresholds } from "../lib/settings";
import { useTheme } from "../lib/theme";
import { useThresholds } from "../lib/useThresholds";

const KEYS: (keyof DecisionThresholds)[] = ["riskHigh", "riskMid", "staleForecastDays", "lowCoveragePct", "trendThresholdPct"];
const BAND_LABEL = { high: "high", mid: "moderate", low: "low" } as const;

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <Card>
      <div className="grid gap-5 min-[961px]:grid-cols-[260px_minmax(0,1fr)]">
        <div>
          <h3 className="m-0 text-[0.95rem] font-semibold text-text">{title}</h3>
          <p className="mt-1 mb-0 text-[0.8125rem] leading-relaxed text-muted">{description}</p>
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </Card>
  );
}

/** A number setting: label + explanation on the left, value with unit on the right. */
function NumberSetting({
  id,
  label,
  hint,
  value,
  onChange,
  min,
  max,
  step,
  unit,
  disabled,
  changed,
}: {
  id: string;
  label: string;
  hint: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  unit: string;
  disabled: boolean;
  changed: boolean;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 border-t border-border py-4 first:border-t-0 first:pt-0 last:pb-0">
      <div>
        <label htmlFor={id} className="text-[0.875rem] font-semibold text-text">
          {label}
          {changed && <span className="ml-2 align-middle text-[0.7rem] font-semibold text-accent-text">changed</span>}
        </label>
        <p className="mt-0.5 mb-0 text-[0.8125rem] leading-relaxed text-muted">{hint}</p>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-[96px]">
          <input
            id={id}
            type="number"
            className={`${FIELD_INPUT_CLASS} text-right`}
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            disabled={disabled}
          />
        </div>
        <span className="w-9 text-[0.8125rem] text-muted">{unit}</span>
      </div>
    </div>
  );
}

/** The 0–100% risk scale split into the three bands at the draft cutoffs. */
function BandScale({ mid, high }: { mid: number; high: number }) {
  const valid = mid < high;
  const m = Math.min(Math.max(mid, 0), 1) * 100;
  const h = Math.min(Math.max(high, 0), 1) * 100;
  return (
    <div aria-hidden="true">
      <div className="flex h-3 overflow-hidden rounded-full">
        <div className="bg-risk-low" style={{ width: `${valid ? m : 0}%` }} />
        <div className="bg-risk-mid" style={{ width: `${valid ? h - m : 0}%` }} />
        <div className="flex-1 bg-risk-high" />
      </div>
      <div className="relative mt-1.5 h-4 text-[0.7rem] tabular-nums text-muted">
        <span className="absolute left-0">0%</span>
        {valid && (
          <>
            <span className="absolute -translate-x-1/2 font-semibold text-text-secondary" style={{ left: `${m}%` }}>
              {Math.round(m)}%
            </span>
            <span className="absolute -translate-x-1/2 font-semibold text-text-secondary" style={{ left: `${h}%` }}>
              {Math.round(h)}%
            </span>
          </>
        )}
        <span className="absolute right-0">100%</span>
      </div>
      <div className="mt-1 flex justify-between text-[0.7rem] font-semibold">
        <span className="text-risk-low">Low</span>
        <span className="text-risk-mid">Moderate</span>
        <span className="text-risk-high">High</span>
      </div>
    </div>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex gap-1 rounded-[10px] border border-border bg-panel-muted p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={
            "inline-flex cursor-pointer items-center gap-1.5 rounded-md border-0 px-3.5 py-1.5 text-[0.8125rem] font-semibold transition-colors " +
            (value === o.value ? "bg-panel text-text shadow-[var(--shadow-sm)]" : "bg-transparent text-muted hover:text-text")
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function Settings() {
  const { t, language, setLanguage } = useLanguage();
  const { theme, setTheme } = useTheme();
  const { username } = useAuth();
  const liveThresholds = useThresholds();
  const [draft, setDraft] = useState<DecisionThresholds>(liveThresholds);
  const [baseline, setBaseline] = useState<DecisionThresholds>(liveThresholds);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forecasts, setForecasts] = useState<ForecastRun[]>([]);

  const isDirty = KEYS.some((k) => draft[k] !== baseline[k]);
  const isDefault = KEYS.every((k) => liveThresholds[k] === DEFAULT_THRESHOLDS[k]);
  const disabled = !username;

  // Picks up a change made in another tab (or this page's own Reset) as
  // long as this form has no unsaved edits of its own — never clobbers
  // something the user is mid-way through typing.
  useEffect(() => {
    if (!isDirty) setDraft(liveThresholds);
    setBaseline(liveThresholds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveThresholds]);

  useEffect(() => {
    api.listAllForecasts().then(setForecasts).catch(() => undefined);
  }, []);

  // What the draft cutoffs would do to today's latest forecasts.
  const impact = useMemo(() => {
    const latest = [...latestForecastByCounty(forecasts).values()];
    const count = (th: DecisionThresholds) => {
      const c = { high: 0, mid: 0, low: 0 };
      for (const f of latest) c[riskBand(f.risk_score, th)]++;
      return c;
    };
    const moved = latest
      .filter((f) => riskBand(f.risk_score, draft) !== riskBand(f.risk_score, baseline))
      .map((f) => ({ name: f.county_name, from: riskBand(f.risk_score, baseline), to: riskBand(f.risk_score, draft) }));
    return { total: latest.length, now: count(draft), moved };
  }, [forecasts, draft, baseline]);

  const set = (key: keyof DecisionThresholds) => (value: number) => {
    setSaved(false);
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const bandsInvalid = draft.riskMid >= draft.riskHigh;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (bandsInvalid) {
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
    <div className="pb-20">
      <header className="mb-5">
        <h2 className="m-0 text-[1.6rem] font-bold tracking-[-0.02em] text-text">{t("page.settings")}</h2>
        <p className="mt-1 mb-0 max-w-[75ch] text-sm text-muted">
          Where the app draws the line for "needs attention". These don't change any model — they decide how its numbers
          are labelled. Saved in this browser only.
        </p>
      </header>

      <Section title="Display" description="Applies straight away, in this browser.">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-[0.875rem] font-semibold text-text">Theme</span>
            <Segmented
              label="Theme"
              value={theme}
              onChange={setTheme}
              options={[
                { value: "light", label: <><SunIcon size={14} /> Light</> },
                { value: "dark", label: <><MoonIcon size={14} /> Dark</> },
              ]}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <span className="text-[0.875rem] font-semibold text-text">Language</span>
            <Segmented<Language>
              label="Language"
              value={language}
              onChange={setLanguage}
              options={[
                { value: "en", label: "English" },
                { value: "sw", label: "Kiswahili" },
              ]}
            />
          </div>
        </div>
      </Section>

      {!username && (
        <p className="mb-5 rounded-xl border border-border bg-panel px-4 py-3 text-[0.8125rem] text-muted">
          The cutoffs below are shown read-only. <strong className="text-text-secondary">Sign in</strong> at the top right to
          change them.
        </p>
      )}

      <form onSubmit={handleSubmit}>
        <Section
          title="Risk bands"
          description="How a forecast's risk score becomes red, amber or green — on the map, Forecasts, Decision Support and everywhere else."
        >
          <div className="mb-5">
            <BandScale mid={draft.riskMid} high={draft.riskHigh} />
          </div>
          <NumberSetting
            id="riskMid"
            label="Moderate from"
            hint="Scores at or above this (and below the high cutoff) are amber; below it, green."
            value={Math.round(draft.riskMid * 100)}
            onChange={(v) => set("riskMid")(v / 100)}
            min={0}
            max={100}
            step={1}
            unit="%"
            disabled={disabled}
            changed={draft.riskMid !== baseline.riskMid}
          />
          <NumberSetting
            id="riskHigh"
            label="High from"
            hint="Scores at or above this are red — the counties to prioritise."
            value={Math.round(draft.riskHigh * 100)}
            onChange={(v) => set("riskHigh")(v / 100)}
            min={0}
            max={100}
            step={1}
            unit="%"
            disabled={disabled}
            changed={draft.riskHigh !== baseline.riskHigh}
          />
          {bandsInvalid && (
            <p className={`${FORM_BANNER_ERROR_CLASS} mt-3`}>
              <AlertIcon size={14} /> "Moderate from" must be lower than "High from".
            </p>
          )}

          {impact.total > 0 && !bandsInvalid && (
            <div className="mt-4 rounded-xl border border-border bg-panel-muted/60 px-4 py-3" aria-live="polite">
              <div className="mb-2 text-xs font-semibold text-muted">With these cutoffs, today's {impact.total} county forecasts read as</div>
              <div className="flex flex-wrap gap-1.5">
                {(["high", "mid", "low"] as const).map((b) => (
                  <span key={b} className={priorityBadgeClass(b)}>
                    {impact.now[b]} {BAND_LABEL[b]}
                  </span>
                ))}
              </div>
              {impact.moved.length > 0 && (
                <p className="mt-2 mb-0 text-[0.8125rem] text-text-secondary">
                  {impact.moved.map((m, i) => (
                    <span key={m.name}>
                      {i > 0 && ", "}
                      <strong>{m.name}</strong> {BAND_LABEL[m.from]} → {BAND_LABEL[m.to]}
                    </span>
                  ))}
                  .
                </p>
              )}
            </div>
          )}
        </Section>

        <Section title="Decision Support flags" description="When a county gets flagged for an out-of-date forecast, thin vaccine coverage or a moving case trend.">
          <NumberSetting
            id="staleForecastDays"
            label="Forecast goes stale after"
            hint="A county's latest forecast older than this is flagged for regeneration."
            value={draft.staleForecastDays}
            onChange={set("staleForecastDays")}
            min={1}
            max={365}
            step={1}
            unit="days"
            disabled={disabled}
            changed={draft.staleForecastDays !== baseline.staleForecastDays}
          />
          <NumberSetting
            id="lowCoveragePct"
            label="Low coverage below"
            hint="Allocated doses covering less than this share of a county's population count as effectively uncovered."
            value={draft.lowCoveragePct}
            onChange={set("lowCoveragePct")}
            min={0}
            max={100}
            step={0.1}
            unit="%"
            disabled={disabled}
            changed={draft.lowCoveragePct !== baseline.lowCoveragePct}
          />
          <NumberSetting
            id="trendThresholdPct"
            label="Trend counts as moving above"
            hint="A month-over-month change in modelled cases smaller than this, either way, reads as stable."
            value={draft.trendThresholdPct}
            onChange={set("trendThresholdPct")}
            min={0}
            max={100}
            step={1}
            unit="%"
            disabled={disabled}
            changed={draft.trendThresholdPct !== baseline.trendThresholdPct}
          />
        </Section>

        {error && (
          <p className={FORM_BANNER_ERROR_CLASS}>
            <AlertIcon size={14} /> {error}
          </p>
        )}

        {/* Save bar: pinned while there's something to save, a quiet footer otherwise. */}
        {username && (
          <div
            className={
              "sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-shadow " +
              (isDirty ? "border-accent bg-panel shadow-[var(--shadow-lg)]" : "border-border bg-panel")
            }
          >
            <span className="flex items-center gap-2 text-[0.8125rem]">
              {isDirty ? (
                <span className="font-semibold text-text">You have unsaved changes</span>
              ) : saved ? (
                <span className="flex items-center gap-1.5 text-risk-low">
                  <CheckCircleIcon size={15} /> Saved — applied across the app.
                </span>
              ) : (
                <span className="text-muted">{isDefault ? "Using the default cutoffs." : "Using your saved cutoffs."}</span>
              )}
            </span>
            <div className="flex flex-wrap gap-2">
              {isDirty && (
                <button type="button" className={btnClass("secondary")} onClick={() => setDraft(baseline)}>
                  Discard
                </button>
              )}
              {!isDirty && !isDefault && (
                <button type="button" className={btnClass("secondary")} onClick={handleReset}>
                  {t("common.resetToDefaults")}
                </button>
              )}
              <button type="submit" className={btnClass("primary")} disabled={!isDirty || bandsInvalid}>
                {t("common.save")}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
