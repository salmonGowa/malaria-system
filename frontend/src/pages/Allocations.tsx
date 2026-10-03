import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { api, VaccineAllocation } from "../api/client";
import Card from "../components/Card";
import Pagination from "../components/Pagination";
import { DownloadIcon, SparkleIcon } from "../components/icons";
import { RunLines, runSummary } from "../components/AllocationRunLines";
import { AllocationRun, groupAllocationRuns } from "../lib/allocationRuns";
import { BANNER_WARNING_CLASS } from "../lib/bannerClasses";
import { btnClass } from "../lib/buttonClasses";
import { downloadCsv } from "../lib/csv";
import { formatCompact, formatNumber, formatPeriod, formatRelativeTime } from "../lib/format";
import { useLanguage } from "../lib/i18n";
import { PLACEHOLDER_NOTE_CLASS } from "../lib/noteClasses";
import { isTestRun, readHideTestRuns, writeHideTestRuns } from "../lib/testRuns";

const HIDE_TEST_KEY = "malaria-system:allocations-hide-test-runs";
const EARLIER_PAGE = 10;
const LOG_PAGE = 25;

function RunMeta({ run }: { run: AllocationRun }) {
  return (
    <>
      {formatRelativeTime(run.generatedAt)} · by {run.user ?? "—"} · for {formatPeriod(run.periodStart, run.periodEnd)}
    </>
  );
}

export default function Allocations() {
  const { t } = useLanguage();
  const [rows, setRows] = useState<VaccineAllocation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hideTestRuns, setHideTestRuns] = useState(() => readHideTestRuns(HIDE_TEST_KEY));
  const [shown, setShown] = useState(EARLIER_PAGE);
  const [logPage, setLogPage] = useState(1);

  useEffect(() => {
    api
      .listAllAllocations()
      .then((all) => {
        setRows(all);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const testRowCount = useMemo(() => rows.filter(isTestRun).length, [rows]);
  const visibleRows = useMemo(() => (hideTestRuns ? rows.filter((r) => !isTestRun(r)) : rows), [rows, hideTestRuns]);
  const runs = useMemo(() => groupAllocationRuns(visibleRows), [visibleRows]);
  const latest = runs[0] ?? null;
  const earlier = runs.slice(1);
  const latestSummary = latest ? runSummary(latest) : null;
  // Every line, newest first — the audit view (and what e2e/core-flows reads
  // as this page's first table row after a run).
  const logRows = useMemo(
    () => [...visibleRows].sort((a, b) => new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime()),
    [visibleRows],
  );

  const toggleHide = (hide: boolean) => {
    setHideTestRuns(hide);
    setShown(EARLIER_PAGE);
    setLogPage(1);
    writeHideTestRuns(HIDE_TEST_KEY, hide);
  };

  const handleExport = () =>
    downloadCsv("allocations.csv", visibleRows, [
      "county_name",
      "period_start",
      "period_end",
      "recommended_doses",
      "rationale",
      "generated_at",
      "generated_by_username",
    ]);

  return (
    <div>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="m-0 text-[1.6rem] font-bold tracking-[-0.02em] text-text">{t("page.vaccineAllocationRecommendations")}</h2>
          <p className="mt-1 mb-0 max-w-[72ch] text-sm text-muted">
            How each run split the available doses across counties, from the risk-weighted linear-programming optimiser.
          </p>
        </div>
        <Link className={btnClass("primary", { className: "no-underline" })} to="/run-allocation">
          <SparkleIcon size={15} />
          Run allocation
        </Link>
      </header>

      {error && <p className={BANNER_WARNING_CLASS}>Could not reach backend: {error}</p>}
      {loading && <p className={PLACEHOLDER_NOTE_CLASS}>Loading allocations…</p>}
      {!loading && !error && rows.length === 0 && (
        <p className={PLACEHOLDER_NOTE_CLASS}>
          No allocation runs yet. <Link to="/run-allocation">Run the first one</Link>.
        </p>
      )}

      {rows.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-[0.8125rem] text-muted">
            {runs.length} run{runs.length === 1 ? "" : "s"} · {formatNumber(visibleRows.length)} county lines
          </span>
          <div className="flex flex-wrap items-center gap-3">
            {testRowCount > 0 && (
              <label className="flex cursor-pointer items-center gap-2 text-[0.8125rem] text-text-secondary" title="Runs triggered by the automated test account (e2e_test)">
                <input
                  type="checkbox"
                  checked={hideTestRuns}
                  onChange={(e) => toggleHide(e.target.checked)}
                  className="size-4 cursor-pointer accent-[var(--accent)]"
                />
                Hide test runs
              </label>
            )}
            {visibleRows.length > 0 && (
              <button type="button" className={btnClass("secondary", { sm: true })} onClick={handleExport}>
                <DownloadIcon size={14} /> {t("common.exportCsv")}
              </button>
            )}
          </div>
        </div>
      )}

      {latest && latestSummary && (
        <Card>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="m-0 text-[0.95rem] font-semibold text-text">Latest run</h3>
              <p className="mt-1 mb-0 text-[0.8125rem] text-muted">
                <RunMeta run={latest} />
                {latest.capPct !== null && <> · capped at {latest.capPct}% per county</>}
              </p>
            </div>
          </div>

          <div className="mb-5 grid grid-cols-2 gap-3 min-[901px]:grid-cols-4">
            {[
              [
                "Doses allocated",
                formatCompact(latest.totalAllocated),
                latest.supply ? `of ${formatNumber(latest.supply)} available` : undefined,
              ],
              [
                "Supply used",
                latestSummary.usedPct !== null ? `${latestSummary.usedPct.toFixed(0)}%` : "—",
                latestSummary.usedPct !== null && latestSummary.usedPct < 99.5
                  ? latest.capPct !== null
                    ? "rest held back by the per-county cap"
                    : "rest held back by county populations"
                  : undefined,
              ],
              ["Counties funded", `${latestSummary.funded.length} of ${latest.lines.length}`, undefined],
              [
                "Largest share",
                `${(latestSummary.topShare * 100).toFixed(0)}%`,
                latestSummary.top ? latestSummary.top.county_name : undefined,
              ],
            ].map(([label, value, hint]) => (
              <div key={label} className="rounded-xl border border-border px-4 py-3">
                <div className="text-xs text-muted">{label}</div>
                <div className="mt-0.5 text-[1.35rem] font-bold tabular-nums text-text">{value}</div>
                {hint && <div className="truncate text-xs text-muted">{hint}</div>}
              </div>
            ))}
          </div>

          {latestSummary.funded.length === 1 && latestSummary.topShare >= 0.999 && latest.capPct === null && (
            <p className={BANNER_WARNING_CLASS}>
              Every dose went to {latestSummary.top?.county_name}. Without a per-county cap the optimiser funds only the
              single highest-risk county — set "Max share per county" on <Link to="/run-allocation">Run Allocation</Link>{" "}
              to spread supply, or try it first in <Link to="/simulations#allocation">Simulations</Link>.
            </p>
          )}

          <RunLines run={latest} />
        </Card>
      )}

      {earlier.length > 0 && (
        <Card>
          <h3 className="m-0 mb-1 text-[0.95rem] font-semibold text-text">Earlier runs</h3>
          <p className="mt-0 mb-3 text-[0.8125rem] text-muted">Newest first · select a run to see its split</p>
          <ul className="m-0 list-none overflow-hidden rounded-xl border border-border p-0">
            {earlier.slice(0, shown).map((run) => {
              const s = runSummary(run);
              return (
                <li key={run.key} className="border-t border-border first:border-t-0">
                  <details className="group">
                    <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-panel-muted min-[761px]:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_16px] [&::-webkit-details-marker]:hidden">
                      <span className="min-w-0 text-[0.8125rem]">
                        <span className="font-semibold text-text">{formatNumber(run.totalAllocated)} doses</span>
                        <span className="text-muted">{run.supply ? ` of ${formatNumber(run.supply)}` : ""}</span>
                        <span className="block truncate text-xs text-muted">
                          <RunMeta run={run} />
                        </span>
                      </span>
                      <span className="text-right text-[0.8125rem] text-text-secondary min-[761px]:text-left">
                        {s.funded.length} of {run.lines.length} {run.lines.length === 1 ? "county" : "counties"}
                      </span>
                      <span className="hidden truncate text-[0.8125rem] text-text-secondary min-[761px]:block">
                        {s.top ? `${s.top.county_name} ${(s.topShare * 100).toFixed(0)}%` : "—"}
                      </span>
                      <span className="hidden text-muted transition-transform group-open:rotate-90 min-[761px]:block" aria-hidden="true">
                        ›
                      </span>
                    </summary>
                    <div className="border-t border-border bg-panel-muted/40 px-4 py-4">
                      {run.capPct !== null && <p className="mt-0 mb-3 text-xs text-muted">Capped at {run.capPct}% per county.</p>}
                      <RunLines run={run} />
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
          {earlier.length > shown && (
            <button type="button" className={btnClass("secondary", { sm: true, className: "mt-3" })} onClick={() => setShown((n) => n + EARLIER_PAGE)}>
              Show {Math.min(EARLIER_PAGE, earlier.length - shown)} more of {earlier.length - shown}
            </button>
          )}
          <p className="mt-3 mb-0 text-xs text-muted">
            Runs are grouped from their rows (same user and period, written together). Hover a county for the optimiser's
            full rationale.
          </p>
        </Card>
      )}

      {logRows.length > 0 && (
        <Card>
          <h3 className="m-0 mb-1 text-[0.95rem] font-semibold text-text">Allocation log</h3>
          <p className="mt-0 mb-3 text-[0.8125rem] text-muted">Every county line from every run, newest first, with who triggered it.</p>
          <div className="relative overflow-x-auto" tabIndex={0} role="region" aria-label="Allocation log, scrollable horizontally">
            <table>
              <thead>
                <tr>
                  <th>{t("table.county")}</th>
                  <th className="text-right">{t("table.recommendedDoses")}</th>
                  <th>{t("table.period")}</th>
                  <th>Generated</th>
                  <th>{t("table.triggeredBy")}</th>
                </tr>
              </thead>
              <tbody>
                {logRows.slice((logPage - 1) * LOG_PAGE, logPage * LOG_PAGE).map((a) => (
                  <tr key={a.id} title={a.rationale}>
                    <td className="font-semibold">{a.county_name}</td>
                    <td className={`text-right tabular-nums ${a.recommended_doses === 0 ? "text-muted" : ""}`}>{formatNumber(a.recommended_doses)}</td>
                    <td className="whitespace-nowrap">{formatPeriod(a.period_start, a.period_end)}</td>
                    <td className="whitespace-nowrap text-muted" title={new Date(a.generated_at).toLocaleString()}>
                      {formatRelativeTime(a.generated_at)}
                    </td>
                    <td className="text-text-secondary">{a.generated_by_username ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={logPage} pageSize={LOG_PAGE} count={logRows.length} onPageChange={setLogPage} />
        </Card>
      )}
    </div>
  );
}
