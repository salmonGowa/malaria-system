import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { api, VaccineAllocation } from "../api/client";
import Card from "../components/Card";
import Pagination from "../components/Pagination";
import { DownloadIcon } from "../components/icons";
import { BANNER_WARNING_CLASS } from "../lib/bannerClasses";
import { btnClass } from "../lib/buttonClasses";
import { downloadCsv } from "../lib/csv";
import { FIELD_INPUT_CLASS } from "../lib/fieldClasses";
import { formatNumber, formatPeriod, formatRelativeTime } from "../lib/format";
import { useLanguage } from "../lib/i18n";
import { PLACEHOLDER_NOTE_CLASS } from "../lib/noteClasses";
import { isTestRun, readHideTestRuns, writeHideTestRuns } from "../lib/testRuns";

// Shared with Vaccine Allocation, so "Hide test runs" means the same on both pages.
const HIDE_TEST_KEY = "malaria-system:allocations-hide-test-runs";
const PAGE_SIZE = 25;

/** Every county line from every allocation run, newest first, with who
 * triggered it — the audit view. Searchable and filterable; exports exactly
 * what's shown. */
export default function AllocationLog() {
  const { t } = useLanguage();
  const [rows, setRows] = useState<VaccineAllocation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hideTestRuns, setHideTestRuns] = useState(() => readHideTestRuns(HIDE_TEST_KEY));
  const [query, setQuery] = useState("");
  const [county, setCounty] = useState("");
  const [user, setUser] = useState("");
  const [fundedOnly, setFundedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    api
      .listAllAllocations()
      .then((all) => {
        setRows([...all].sort((a, b) => new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime()));
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const testRowCount = useMemo(() => rows.filter(isTestRun).length, [rows]);
  const counties = useMemo(() => [...new Set(rows.map((r) => r.county_name))].sort(), [rows]);
  const users = useMemo(() => [...new Set(rows.map((r) => r.generated_by_username ?? "—"))].sort(), [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!hideTestRuns || !isTestRun(r)) &&
        (!county || r.county_name === county) &&
        (!user || (r.generated_by_username ?? "—") === user) &&
        (!fundedOnly || r.recommended_doses > 0) &&
        (!q || r.county_name.toLowerCase().includes(q) || r.rationale.toLowerCase().includes(q) || (r.generated_by_username ?? "").toLowerCase().includes(q)),
    );
  }, [rows, hideTestRuns, county, user, fundedOnly, query]);

  const totalDoses = filtered.reduce((n, r) => n + r.recommended_doses, 0);
  const activeFilters = [query.trim(), county, user, fundedOnly ? "funded" : ""].filter(Boolean).length;

  // Any filter change goes back to the first page.
  const withReset =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };

  const clearFilters = () => {
    setQuery("");
    setCounty("");
    setUser("");
    setFundedOnly(false);
    setPage(1);
  };

  const toggleRow = (id: number) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleExport = () =>
    downloadCsv("allocation-log.csv", filtered, [
      "county_name",
      "recommended_doses",
      "period_start",
      "period_end",
      "generated_at",
      "generated_by_username",
      "rationale",
    ]);

  return (
    <div>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="m-0 text-[1.6rem] font-bold tracking-[-0.02em] text-text">{t("page.allocationLog")}</h2>
          <p className="mt-1 mb-0 max-w-[72ch] text-sm text-muted">
            Every county line from every allocation run, newest first, with who triggered it. For the runs themselves,
            see <Link to="/allocations">Vaccine Allocation</Link>.
          </p>
        </div>
        {filtered.length > 0 && (
          <button type="button" className={btnClass("secondary")} onClick={handleExport}>
            <DownloadIcon size={14} /> {t("common.exportCsv")}
          </button>
        )}
      </header>

      {error && <p className={BANNER_WARNING_CLASS}>Could not reach backend: {error}</p>}
      {loading && <p className={PLACEHOLDER_NOTE_CLASS}>Loading the allocation log…</p>}
      {!loading && !error && rows.length === 0 && (
        <p className={PLACEHOLDER_NOTE_CLASS}>
          Nothing logged yet. <Link to="/run-allocation">Run the first allocation</Link>.
        </p>
      )}

      {rows.length > 0 && (
        <Card>
          <div className="mb-4 grid gap-3 min-[761px]:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <div className="flex flex-col gap-1.5 text-[0.8125rem]">
              <label htmlFor="log-search" className="font-medium text-text-secondary">Search</label>
              <input
                id="log-search"
                type="search"
                className={FIELD_INPUT_CLASS}
                placeholder="County, person or rationale…"
                value={query}
                onChange={(e) => withReset(setQuery)(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5 text-[0.8125rem]">
              <label htmlFor="log-county" className="font-medium text-text-secondary">County</label>
              <select id="log-county" className={FIELD_INPUT_CLASS} value={county} onChange={(e) => withReset(setCounty)(e.target.value)}>
                <option value="">All counties</option>
                {counties.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5 text-[0.8125rem]">
              <label htmlFor="log-user" className="font-medium text-text-secondary">{t("table.triggeredBy")}</label>
              <select id="log-user" className={FIELD_INPUT_CLASS} value={user} onChange={(e) => withReset(setUser)(e.target.value)}>
                <option value="">Anyone</option>
                {users.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <label className="flex cursor-pointer items-center gap-2 text-[0.8125rem] text-text-secondary">
                <input
                  type="checkbox"
                  checked={fundedOnly}
                  onChange={(e) => withReset(setFundedOnly)(e.target.checked)}
                  className="size-4 cursor-pointer accent-[var(--accent)]"
                />
                Only lines with doses
              </label>
              {testRowCount > 0 && (
                <label className="flex cursor-pointer items-center gap-2 text-[0.8125rem] text-text-secondary" title="Runs triggered by the automated test account (e2e_test)">
                  <input
                    type="checkbox"
                    checked={hideTestRuns}
                    onChange={(e) => {
                      withReset(setHideTestRuns)(e.target.checked);
                      writeHideTestRuns(HIDE_TEST_KEY, e.target.checked);
                    }}
                    className="size-4 cursor-pointer accent-[var(--accent)]"
                  />
                  Hide test runs
                </label>
              )}
            </div>
            <div className="flex items-center gap-3 text-[0.8125rem] text-muted" aria-live="polite">
              <span>
                <strong className="font-semibold text-text">{formatNumber(filtered.length)}</strong> of {formatNumber(rows.length)} lines ·{" "}
                {formatNumber(totalDoses)} doses
              </span>
              {activeFilters > 0 && (
                <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-[0.8125rem] font-semibold text-accent-text hover:underline" onClick={clearFilters}>
                  Clear filters
                </button>
              )}
            </div>
          </div>

          {filtered.length === 0 ? (
            <p className={PLACEHOLDER_NOTE_CLASS}>No lines match these filters.</p>
          ) : (
            <>
              <div className="relative overflow-x-auto" tabIndex={0} role="region" aria-label="Allocation log, scrollable horizontally">
                <table>
                  <thead>
                    <tr>
                      <th>{t("table.county")}</th>
                      <th className="text-right">{t("table.recommendedDoses")}</th>
                      <th>{t("table.period")}</th>
                      <th>Generated</th>
                      <th>{t("table.triggeredBy")}</th>
                      <th>
                        <span className="sr-only">{t("table.rationale")}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((a) => {
                      const open = expanded.has(a.id);
                      return (
                        <Fragment key={a.id}>
                          <tr>
                            <td className="font-semibold">
                              <Link to={`/counties/${a.county}`} className="text-text no-underline hover:underline">
                                {a.county_name}
                              </Link>
                            </td>
                            <td className={`text-right tabular-nums ${a.recommended_doses === 0 ? "text-muted" : ""}`}>{formatNumber(a.recommended_doses)}</td>
                            <td className="whitespace-nowrap">{formatPeriod(a.period_start, a.period_end)}</td>
                            <td className="whitespace-nowrap text-text-secondary" title={new Date(a.generated_at).toLocaleString()}>
                              {formatRelativeTime(a.generated_at)}
                            </td>
                            <td className="text-text-secondary">
                              {a.generated_by_username ?? "—"}
                              {isTestRun(a) && <span className="ml-1.5 rounded-full bg-panel-muted px-1.5 py-px text-[0.68rem] font-semibold text-muted">test</span>}
                            </td>
                            <td className="text-right">
                              <button
                                type="button"
                                aria-expanded={open}
                                aria-controls={`why-${a.id}`}
                                onClick={() => toggleRow(a.id)}
                                className="cursor-pointer whitespace-nowrap border-0 bg-transparent p-0 text-xs font-semibold text-accent-text hover:underline"
                              >
                                {open ? "Hide why" : "Why?"}
                              </button>
                            </td>
                          </tr>
                          {open && (
                            <tr id={`why-${a.id}`}>
                              <td colSpan={6} className="bg-panel-muted/50 text-xs leading-relaxed text-text-secondary">
                                {a.rationale || "No rationale recorded."}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination page={page} pageSize={PAGE_SIZE} count={filtered.length} onPageChange={setPage} />
            </>
          )}
        </Card>
      )}
    </div>
  );
}
