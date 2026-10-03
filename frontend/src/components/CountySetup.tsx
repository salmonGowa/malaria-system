import { lazy, Suspense, useState } from "react";
import { Link } from "react-router-dom";

import { api, County, CountyReadiness, MalariaZone, PrepareDataResponse } from "../api/client";
import Card from "./Card";
import { CheckCircleIcon, MapPinIcon, SparkleIcon } from "./icons";
import { FORM_BANNER_ERROR_CLASS } from "../lib/bannerClasses";
import { btnClass } from "../lib/buttonClasses";
import { formatMonthName } from "../lib/format";
import { ROUTE_LOADING_CLASS } from "../lib/noteClasses";

const BoundaryLocator = lazy(() => import("./BoundaryLocator"));

type Step = "locate" | "prepare" | "done";

interface Props {
  county: County;
  readiness: CountyReadiness | undefined;
  zones: MalariaZone[];
  allCounties: County[];
  /** Called after each saved step so the page can refresh its data. */
  onChanged: () => void;
  onClose: () => void;
  /** Start at a given step — e.g. "prepare" to reload data after an edit. */
  initialStep?: Step;
  title?: string;
  subtitle?: string;
}

function StepDot({ n, state, label }: { n: number; state: "done" | "current" | "todo"; label: string }) {
  return (
    <li className="flex items-center gap-2 text-[0.8125rem]">
      <span
        className={
          "grid size-6 flex-none place-items-center rounded-full text-xs font-bold " +
          (state === "done" ? "bg-risk-low text-white" : state === "current" ? "bg-accent text-white" : "bg-panel-muted text-muted")
        }
      >
        {state === "done" ? "✓" : n}
      </span>
      <span className={state === "todo" ? "text-muted" : "font-semibold text-text"}>{label}</span>
    </li>
  );
}

/** Guided setup for a county added from the dashboard:
 * 1. locate it (official GADM boundary), 2. load the data the model needs,
 * 3. done — with links to forecast it and add a reporting facility. */
export default function CountySetup({ county, readiness, zones, allCounties, onChanged, onClose, initialStep, title, subtitle }: Props) {
  const [step, setStep] = useState<Step>(
    () => initialStep ?? (!county.boundary && !readiness?.has_boundary ? "locate" : readiness?.forecast_ready ? "done" : "prepare"),
  );
  const [zone, setZone] = useState<string>("");
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PrepareDataResponse | null>(null);

  const prepare = async () => {
    setPreparing(true);
    setError(null);
    try {
      const res = await api.prepareCountyData(county.id, zone);
      setResult(res);
      setStep("done");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^Request to .*? — /, "") : "Couldn't prepare the data");
    } finally {
      setPreparing(false);
    }
  };

  const order: Step[] = ["locate", "prepare", "done"];
  const stateOf = (s: Step) =>
    step === "done" || order.indexOf(s) < order.indexOf(step) ? "done" : s === step ? "current" : "todo";
  const zoneLabel = zones.find((z) => z.id === (result?.zone ?? zone))?.label;

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid size-9 flex-none place-items-center rounded-full bg-accent-soft text-accent-text">
            <MapPinIcon size={17} />
          </span>
          <div>
            <h3 className="m-0 text-[0.95rem] font-semibold text-text">{title ?? `Set up ${county.name}`}</h3>
            <p className="mt-0.5 mb-0 text-[0.8125rem] text-muted">{subtitle ?? "Two steps to put it on the map and make it forecastable."}</p>
          </div>
        </div>
        <button type="button" className={btnClass("secondary", { sm: true })} onClick={onClose}>
          {step === "done" ? "Close" : "Not now"}
        </button>
      </div>

      <ol className="m-0 mb-5 flex list-none flex-wrap gap-x-6 gap-y-2 border-b border-border p-0 pb-4">
        <StepDot n={1} state={stateOf("locate")} label="Locate on map" />
        <StepDot n={2} state={stateOf("prepare")} label="Load its data" />
        <StepDot n={3} state={stateOf("done")} label="Ready" />
      </ol>

      {step === "locate" && (
        <Suspense fallback={<div className={ROUTE_LOADING_CLASS}>Loading map…</div>}>
          <BoundaryLocator
            county={county}
            others={allCounties}
            onCancel={onClose}
            onSaved={() => {
              onChanged();
              setStep("prepare");
            }}
          />
        </Suspense>
      )}

      {step === "prepare" && (
        <div>
          <h4 className="m-0 text-[0.875rem] font-semibold text-text">Which malaria zone is {county.name} in?</h4>
          <p className="mt-1 mb-3 text-[0.8125rem] text-muted">
            This sets its typical case level and climate. Rainfall is real: CHIRPS satellite data over its boundary.
          </p>
          <div role="radiogroup" aria-label="Malaria epidemiological zone" className="mb-4 grid gap-2 min-[761px]:grid-cols-2">
            {zones.map((z) => {
              const selected = zone === z.id;
              return (
                <button
                  key={z.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setZone(z.id)}
                  className={
                    "flex cursor-pointer flex-col items-start gap-0.5 rounded-xl border px-4 py-3 text-left transition-colors " +
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
                    (selected ? "border-accent bg-accent-soft" : "border-border bg-panel hover:border-border-strong")
                  }
                >
                  <span className="text-[0.875rem] font-semibold text-text">{z.label}</span>
                  <span className="text-xs leading-snug text-text-secondary">{z.description}</span>
                </button>
              );
            })}
          </div>
          {error && <p className={FORM_BANNER_ERROR_CLASS}>{error}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={btnClass("primary")} disabled={!zone || preparing} onClick={prepare}>
              {preparing ? (
                <>
                  <span className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />
                  Loading 5 years of data…
                </>
              ) : (
                "Load data"
              )}
            </button>
            <span className="text-xs text-muted">
              Temperature, humidity and case history are synthetic, labelled exactly like the other counties'.
            </span>
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="flex items-start gap-3">
          <span className="grid size-9 flex-none place-items-center rounded-full bg-risk-low-soft text-risk-low">
            <CheckCircleIcon size={18} />
          </span>
          <div className="min-w-0">
            <h4 className="m-0 text-[0.95rem] font-semibold text-text">{county.name} is ready to forecast</h4>
            {result && (
              <ul className="mt-2 mb-0 flex flex-col gap-1 pl-5 text-[0.8125rem] text-text-secondary">
                <li>
                  Real CHIRPS rainfall for {result.rainfall_months} months ({formatMonthName(result.first_month)} – {formatMonthName(result.last_month)})
                  {result.rainfall_failed.length > 0 && `, ${result.rainfall_failed.length} skipped`}.
                </li>
                <li>
                  Synthetic temperature, humidity and case history for the same months{zoneLabel ? `, using the ${zoneLabel} profile` : ""}.
                </li>
              </ul>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Link className={btnClass("primary", { sm: true, className: "no-underline" })} to="/generate-forecast">
                <SparkleIcon size={14} /> Generate a forecast
              </Link>
              {(readiness?.facilities ?? 0) === 0 && (
                <Link className={btnClass("secondary", { sm: true, className: "no-underline" })} to="/facilities">
                  Add a reporting facility
                </Link>
              )}
              <Link className={btnClass("secondary", { sm: true, className: "no-underline" })} to={`/counties/${county.id}`}>
                View {county.name}
              </Link>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
