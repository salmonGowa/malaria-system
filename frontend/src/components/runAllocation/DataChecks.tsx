import { Link } from "react-router-dom";

import { AlertIcon, CheckCircleIcon } from "../icons";
import type { DataCheck } from "../../lib/allocationChecks";

const FIX: Record<DataCheck["kind"], { label: string; to: (countyId: number) => string }> = {
  noForecast: { label: "Generate forecast", to: () => "/generate-forecast" },
  staleForecast: { label: "Refresh forecast", to: () => "/generate-forecast" },
  noPopulation: { label: "Add population", to: (id) => `/counties/${id}` },
  smallPopulation: { label: "Check population", to: (id) => `/counties/${id}` },
};

/** Problems in the selected counties' data, each with a way to fix it or to
 * leave the county out of this run. */
export default function DataChecks({ checks, onLeaveOut }: { checks: DataCheck[]; onLeaveOut: (countyId: number) => void }) {
  const blocking = checks.filter((c) => c.severity === "block").length;
  const warnings = checks.length - blocking;

  return (
    <section aria-labelledby="data-checks-title" className="mt-5 border-t border-border pt-4">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <h4 id="data-checks-title" className="m-0 text-[0.8125rem] font-semibold text-text">
          Data checks
        </h4>
        {checks.length === 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-risk-low-soft px-2 py-0.5 text-xs font-semibold text-risk-low">
            <CheckCircleIcon size={12} /> All clear
          </span>
        ) : (
          <span className="text-xs font-semibold text-text-secondary">
            {blocking > 0 && <span className="text-risk-high">{blocking} skipped</span>}
            {blocking > 0 && warnings > 0 && " · "}
            {warnings > 0 && <span className="text-risk-mid">{warnings} to review</span>}
          </span>
        )}
      </div>
      {checks.length === 0 ? (
        <p className="m-0 text-xs text-muted">Every selected county has a recent forecast and a plausible population.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {checks.map((c) => (
            <li
              key={`${c.county.id}-${c.kind}`}
              className={
                "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-[0.8125rem] " +
                (c.severity === "block" ? "border-risk-high/30 bg-risk-high-soft" : "border-risk-mid/30 bg-risk-mid-soft")
              }
            >
              <span className={`flex-none ${c.severity === "block" ? "text-risk-high" : "text-risk-mid"}`} aria-hidden="true">
                <AlertIcon size={14} />
              </span>
              <span className="min-w-[180px] flex-1 text-text-secondary">
                <strong className="text-text">{c.county.name}</strong> — {c.detail}
              </span>
              <span className="flex flex-none items-center gap-3 text-xs font-semibold">
                <Link to={FIX[c.kind].to(c.county.id)}>{FIX[c.kind].label}</Link>
                {c.severity === "warn" && (
                  <button
                    type="button"
                    className="cursor-pointer border-0 bg-transparent p-0 text-xs font-semibold text-text-secondary hover:text-text hover:underline"
                    onClick={() => onLeaveOut(c.county.id)}
                  >
                    Leave out
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
