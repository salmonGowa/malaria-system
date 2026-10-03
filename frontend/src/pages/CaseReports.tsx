import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { api, CaseReport } from "../api/client";
import Card from "../components/Card";
import Pagination from "../components/Pagination";
import { DownloadIcon, PlusIcon, ShieldCheckIcon } from "../components/icons";
import { useAuth } from "../lib/auth";
import { BANNER_WARNING_CLASS } from "../lib/bannerClasses";
import { btnClass } from "../lib/buttonClasses";
import { downloadCsv } from "../lib/csv";
import { FIELD_INPUT_CLASS } from "../lib/fieldClasses";
import { formatDayLabel, formatNumber } from "../lib/format";
import { useLanguage } from "../lib/i18n";
import { PLACEHOLDER_NOTE_CLASS } from "../lib/noteClasses";

const PAGE_SIZE = 50;

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-panel px-4 py-3 shadow-[var(--shadow-sm)]">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-0.5 truncate text-[1.35rem] font-bold tabular-nums text-text">{value}</div>
      {hint && <div className="truncate text-xs text-muted">{hint}</div>}
    </div>
  );
}

/** Where a report sits in a correction chain: an original, a correction of
 * an earlier report, or an original that's since been corrected. */
function StatusPill({ report }: { report: CaseReport }) {
  if (report.superseded_by_id) {
    return (
      <span className="inline-flex whitespace-nowrap rounded-full bg-panel-muted px-2 py-0.5 text-xs font-medium text-muted">
        Corrected → #{report.superseded_by_id}
      </span>
    );
  }
  if (report.supersedes) {
    return (
      <span className="inline-flex whitespace-nowrap rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent-text">
        Correction of #{report.supersedes}
      </span>
    );
  }
  return <span className="text-xs text-muted">Original</span>;
}

export default function CaseReports() {
  const { t } = useLanguage();
  const { username } = useAuth();
  const [reports, setReports] = useState<CaseReport[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [searchParams] = useSearchParams();
  // ?q= pre-fills the search (e.g. "View reports" from a facility card).
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [county, setCounty] = useState("");
  const [showSuperseded, setShowSuperseded] = useState(true);

  // All reports at once: filtering by county/facility and the summary
  // numbers need the whole set, and the list is small (one row per
  // facility-week), so paginating is a client-side slice.
  useEffect(() => {
    api
      .listAllCaseReports()
      .then((rows) => {
        setReports(rows);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const counties = useMemo(() => [...new Set(reports.map((r) => r.county_name))].sort(), [reports]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return reports.filter(
      (r) =>
        (showSuperseded || !r.superseded_by_id) &&
        (!county || r.county_name === county) &&
        (!q || r.facility_name.toLowerCase().includes(q) || r.county_name.toLowerCase().includes(q) || String(r.id) === q.replace("#", "")),
    );
  }, [reports, query, county, showSuperseded]);

  // Summary counts only reports still in force — a corrected original
  // shouldn't count twice alongside its correction.
  const summary = useMemo(() => {
    const active = filtered.filter((r) => !r.superseded_by_id);
    return {
      reports: active.length,
      confirmed: active.reduce((s, r) => s + r.confirmed_cases, 0),
      deaths: active.reduce((s, r) => s + r.deaths, 0),
      facilities: new Set(active.map((r) => r.facility)).size,
      latest: active.reduce<string | null>((m, r) => (!m || r.report_date > m ? r.report_date : m), null),
      corrections: filtered.filter((r) => r.supersedes).length,
    };
  }, [filtered]);

  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const filtering = query !== "" || county !== "" || !showSuperseded;

  const resetPage = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  const handleExport = () =>
    downloadCsv(county ? `case-reports-${county.toLowerCase().replace(/\s+/g, "-")}.csv` : "case-reports.csv", filtered, [
      "id",
      "report_date",
      "facility_name",
      "county_name",
      "confirmed_cases",
      "suspected_cases",
      "deaths",
      "reported_by_username",
      "supersedes",
      "superseded_by_id",
      "record_hash",
    ]);

  return (
    <div>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="m-0 text-[1.6rem] font-bold tracking-[-0.02em] text-text">{t("page.caseReports")}</h2>
          <p className="mt-1 mb-0 max-w-[72ch] text-sm text-muted">
            Facility case reports, newest first. Reports are never edited — a mistake is fixed by a correction that
            supersedes it, and every record is hash-chained.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link className={btnClass("secondary", { className: "no-underline" })} to="/chain-integrity">
            <ShieldCheckIcon size={15} />
            Verify chain
          </Link>
          <Link className={btnClass("primary", { className: "no-underline" })} to="/submit-case-report">
            <PlusIcon size={15} />
            Submit report
          </Link>
        </div>
      </header>

      {error && <p className={BANNER_WARNING_CLASS}>Could not reach backend: {error}</p>}

      {reports.length > 0 && (
        <div className="mb-5 grid grid-cols-2 gap-3 min-[901px]:grid-cols-4">
          <Stat label="Reports in force" value={formatNumber(summary.reports)} hint={`${summary.corrections} correction${summary.corrections === 1 ? "" : "s"}`} />
          <Stat label="Confirmed cases" value={formatNumber(summary.confirmed)} hint={`${formatNumber(summary.deaths)} deaths`} />
          <Stat label="Facilities reporting" value={formatNumber(summary.facilities)} />
          <Stat label="Latest report" value={summary.latest ? formatDayLabel(summary.latest) : "—"} />
        </div>
      )}

      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {/* Width lives on wrappers: FIELD_INPUT_CLASS sets w-full, and a second width utility on the same element wouldn't reliably win. */}
          <div className="min-w-[200px] flex-1 min-[761px]:max-w-[300px]">
            <input
              type="search"
              aria-label="Search by facility, county or report number"
              placeholder="Search facility, county or #id…"
              value={query}
              onChange={(e) => resetPage(setQuery)(e.target.value)}
              className={FIELD_INPUT_CLASS}
            />
          </div>
          <div className="w-[170px]">
            <select aria-label="Filter by county" value={county} onChange={(e) => resetPage(setCounty)(e.target.value)} className={FIELD_INPUT_CLASS}>
              <option value="">All counties</option>
              {counties.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <label className="flex cursor-pointer items-center gap-2 px-1 text-[0.8125rem] text-text-secondary">
            <input
              type="checkbox"
              checked={showSuperseded}
              onChange={(e) => resetPage(setShowSuperseded)(e.target.checked)}
              className="size-4 cursor-pointer accent-[var(--accent)]"
            />
            Show corrected originals
          </label>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-muted">
              {filtering ? `${filtered.length} of ${reports.length}` : `${reports.length}`} reports
            </span>
            {filtered.length > 0 && (
              <button type="button" className={btnClass("secondary", { sm: true })} onClick={handleExport}>
                <DownloadIcon size={14} /> {t("common.exportCsv")}
              </button>
            )}
          </div>
        </div>

        {loading && <p className={PLACEHOLDER_NOTE_CLASS}>Loading reports…</p>}
        {!loading && !error && reports.length === 0 && (
          <p className={PLACEHOLDER_NOTE_CLASS}>
            No case reports yet. <Link to="/submit-case-report">Submit the first one</Link>.
          </p>
        )}
        {!loading && reports.length > 0 && filtered.length === 0 && (
          <p className={PLACEHOLDER_NOTE_CLASS}>No reports match these filters.</p>
        )}

        {visible.length > 0 && (
          <div className="relative overflow-x-auto" tabIndex={0} role="region" aria-label="Case reports table, scrollable horizontally">
            <table>
              <thead>
                <tr>
                  <th>{t("table.date")}</th>
                  <th>{t("table.facility")}</th>
                  <th className="text-right">{t("table.confirmed")}</th>
                  <th className="text-right">{t("table.suspected")}</th>
                  <th className="text-right">{t("table.deaths")}</th>
                  <th>Reported by</th>
                  <th>{t("table.status")}</th>
                  <th>{t("table.recordHash")}</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const superseded = !!r.superseded_by_id;
                  return (
                    <tr key={r.id} className={superseded ? "row-muted" : undefined}>
                      <td className="whitespace-nowrap">
                        <div className={superseded ? "line-through decoration-muted/60" : ""}>{formatDayLabel(r.report_date)}</div>
                        <div className="text-xs text-muted">#{r.id}</div>
                      </td>
                      <td>
                        <div className="font-medium">{r.facility_name}</div>
                        <div className="text-xs text-muted">{r.county_name}</div>
                      </td>
                      <td className="text-right font-semibold tabular-nums">{formatNumber(r.confirmed_cases)}</td>
                      <td className="text-right tabular-nums">{formatNumber(r.suspected_cases)}</td>
                      <td className={`text-right tabular-nums ${r.deaths > 0 && !superseded ? "font-semibold text-risk-high" : ""}`}>
                        {formatNumber(r.deaths)}
                      </td>
                      <td className="text-text-secondary">{r.reported_by_username ?? <span className="text-muted">—</span>}</td>
                      <td>
                        <StatusPill report={r} />
                      </td>
                      <td>
                        <Link
                          to={`/chain-integrity?record=${r.id}`}
                          title={`${r.record_hash}\nOpen this record in the chain`}
                          className="mono rounded bg-panel-muted px-1.5 py-0.5 text-xs text-text-secondary no-underline hover:text-accent-text"
                        >
                          {r.record_hash.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="text-right">
                        {username && !superseded && (
                          <Link
                            to={`/submit-case-report?correct=${r.id}`}
                            className="text-[0.8125rem] font-semibold text-accent-text no-underline hover:underline"
                          >
                            {t("common.correct")}
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} count={filtered.length} onPageChange={setPage} />
      </Card>
    </div>
  );
}
