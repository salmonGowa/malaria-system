import { useEffect, useState } from "react";

import { api, VaccineAllocation } from "../api/client";
import Card, { CARD_HEADER_ROW_CLASS } from "../components/Card";
import Pagination from "../components/Pagination";
import { DownloadIcon } from "../components/icons";
import { btnClass } from "../lib/buttonClasses";
import { downloadCsv } from "../lib/csv";
import { FIELD_HINT_CLASS } from "../lib/fieldClasses";
import { formatNumber } from "../lib/format";
import { useLanguage } from "../lib/i18n";
import { PLACEHOLDER_NOTE_CLASS } from "../lib/noteClasses";

const PAGE_SIZE = 50;

export default function Allocations() {
  const { t } = useLanguage();
  const [allocations, setAllocations] = useState<VaccineAllocation[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .listAllocations(page)
      .then((data) => {
        setAllocations(data.results);
        setCount(data.count);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [page]);

  const handleExport = async () => {
    const all = await api.listAllAllocations();
    downloadCsv("allocations.csv", all, [
      "county_name",
      "period_start",
      "period_end",
      "recommended_doses",
      "rationale",
      "generated_by_username",
    ]);
  };

  return (
    <div>
      <h2>{t("page.vaccineAllocationRecommendations")}</h2>
      <p className={PLACEHOLDER_NOTE_CLASS}>
        ml_service/app/allocation.py runs a real risk-weighted linear program (PuLP). To run a new allocation, see
        Run Allocation in the nav.
      </p>

      <Card>
        <div className={CARD_HEADER_ROW_CLASS}>
          {error && <p style={{ color: "var(--risk-high)" }}>Could not reach backend: {error}</p>}
          {!loading && allocations.length === 0 && !error && <p className={PLACEHOLDER_NOTE_CLASS}>No allocation runs yet.</p>}
          {allocations.length > 0 && (
            <button type="button" className={btnClass("secondary", { sm: true })} onClick={handleExport}>
              <DownloadIcon size={14} /> {t("common.exportCsv")}
            </button>
          )}
        </div>
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Vaccine allocation table, scrollable horizontally">
          <table>
            <thead>
              <tr>
                <th>{t("table.county")}</th>
                <th>{t("table.periodStart")}</th>
                <th>{t("table.recommendedDoses")}</th>
                <th>{t("table.rationale")}</th>
                <th>{t("table.triggeredBy")}</th>
              </tr>
            </thead>
            <tbody>
              {allocations.map((a) => (
                <tr key={a.id}>
                  <td>{a.county_name}</td>
                  <td>{a.period_start}</td>
                  <td className="mono">{formatNumber(a.recommended_doses)}</td>
                  <td>{a.rationale}</td>
                  <td className={FIELD_HINT_CLASS}>{a.generated_by_username ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={PAGE_SIZE} count={count} onPageChange={setPage} />
      </Card>
    </div>
  );
}
