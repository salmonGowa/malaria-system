import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api, CaseReport } from "../api/client";
import Pagination from "../components/Pagination";
import { DownloadIcon } from "../components/icons";
import { downloadCsv } from "../lib/csv";
import { useAuth } from "../lib/auth";
import { useLanguage } from "../lib/i18n";

const PAGE_SIZE = 50; // matches backend/config/settings.py's REST_FRAMEWORK PAGE_SIZE

export default function CaseReports() {
  const { t } = useLanguage();
  const { username } = useAuth();
  const [reports, setReports] = useState<CaseReport[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .listCaseReports(page)
      .then((data) => {
        setReports(data.results);
        setCount(data.count);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [page]);

  const handleExport = async () => {
    const all = await api.listAllCaseReports();
    downloadCsv("case-reports.csv", all, [
      "report_date",
      "facility_name",
      "county_name",
      "confirmed_cases",
      "suspected_cases",
      "deaths",
      "record_hash",
    ]);
  };

  return (
    <div>
      <h2>{t("page.caseReports")}</h2>
      <p className="placeholder-note">
        Append-only and hash-chained — see docs/architecture.md's "Why CaseReport is hash-chained" for what that
        guarantees and doesn't. A mistaken report is never edited; instead a new report supersedes it — see "Correct"
        below, or Submit Report in the nav for a fresh one.
      </p>
      <div className="card">
        <div className="card-header-row">
          {error && <p style={{ color: "var(--risk-high)" }}>Could not reach backend: {error}</p>}
          {!loading && reports.length === 0 && !error && <p className="placeholder-note">No case reports yet.</p>}
          {reports.length > 0 && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleExport}>
              <DownloadIcon size={14} /> {t("common.exportCsv")}
            </button>
          )}
        </div>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Case reports table, scrollable horizontally">
          <table>
            <thead>
              <tr>
                <th>{t("table.date")}</th>
                <th>{t("table.facility")}</th>
                <th>{t("table.county")}</th>
                <th>{t("table.confirmed")}</th>
                <th>{t("table.suspected")}</th>
                <th>{t("table.deaths")}</th>
                <th>{t("table.recordHash")}</th>
                <th>{t("table.status")}</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id} className={r.superseded_by_id ? "row-muted" : undefined}>
                  <td>{r.report_date}</td>
                  <td>{r.facility_name}</td>
                  <td>{r.county_name}</td>
                  <td>{r.confirmed_cases}</td>
                  <td>{r.suspected_cases}</td>
                  <td>{r.deaths}</td>
                  <td className="mono" title={r.record_hash}>
                    {r.record_hash.slice(0, 10)}…
                  </td>
                  <td>
                    {r.superseded_by_id ? (
                      <span className="field-hint">corrected by #{r.superseded_by_id}</span>
                    ) : r.supersedes ? (
                      <span className="field-hint">corrects #{r.supersedes}</span>
                    ) : null}
                  </td>
                  <td>
                    {username && !r.superseded_by_id && (
                      <Link to={`/submit-case-report?correct=${r.id}`} className="btn btn-secondary btn-sm">
                        {t("common.correct")}
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={PAGE_SIZE} count={count} onPageChange={setPage} />
      </div>
    </div>
  );
}
