import { useEffect, useRef, type ReactNode } from "react";

import { AlertIcon, SparkleIcon } from "../icons";
import { btnClass } from "../../lib/buttonClasses";

export interface ConfirmFact {
  label: string;
  value: ReactNode;
}

/** Last look before a run is saved: the key facts and anything worth a
 * second thought. Saving creates real records, so it takes a deliberate click. */
export default function ConfirmRunDialog({
  facts,
  cautions,
  username,
  submitting,
  onCancel,
  onConfirm,
}: {
  facts: ConfirmFact[];
  cautions: string[];
  username: string;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  // Read through refs so the effect runs once: re-running it would move focus every render.
  const latest = useRef({ onCancel, submitting });
  latest.current = { onCancel, submitting };

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !latest.current.submitting) latest.current.onCancel();
      // Keep Tab inside the dialog.
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled])");
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previouslyFocused?.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onMouseDown={(e) => e.target === e.currentTarget && !submitting && onCancel()}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-run-title"
        className="max-h-[90vh] w-full max-w-[520px] overflow-y-auto rounded-2xl border border-border bg-panel p-5 shadow-[var(--shadow-lg)]"
      >
        <h3 id="confirm-run-title" className="m-0 text-base font-bold text-text">
          Save this allocation?
        </h3>
        <p className="mt-1 mb-4 text-[0.8125rem] text-muted">It's recorded on Vaccine Allocation and logged under {username}.</p>

        <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-panel-muted p-4">
          {facts.map((f) => (
            <div key={f.label} className="min-w-0">
              <dt className="text-xs text-muted">{f.label}</dt>
              <dd className="m-0 text-[0.875rem] font-semibold text-text">{f.value}</dd>
            </div>
          ))}
        </dl>

        {cautions.length > 0 && (
          <div className="mt-4">
            <div className="mb-1.5 text-xs font-semibold text-text-secondary">Before you save</div>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {cautions.map((c) => (
                <li key={c} className="flex gap-2 text-[0.8125rem] text-text-secondary">
                  <span className="mt-0.5 flex-none text-risk-mid" aria-hidden="true">
                    <AlertIcon size={13} />
                  </span>
                  {c}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className={btnClass("secondary")} onClick={onCancel} disabled={submitting}>
            Back to edit
          </button>
          <button ref={confirmRef} type="button" className={btnClass("primary")} onClick={onConfirm} disabled={submitting}>
            {submitting ? (
              <>
                <span className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />
                Saving…
              </>
            ) : (
              <>
                <SparkleIcon size={15} />
                Confirm and save
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
