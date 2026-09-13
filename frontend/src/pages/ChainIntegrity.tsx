import { useEffect, useState } from "react";

import { api, ChainRecordStatus, ChainVerificationResult } from "../api/client";
import ChainTamperDemo from "../components/ChainTamperDemo";
import { AlertIcon, CheckCircleIcon, ShieldCheckIcon } from "../components/icons";
import { formatNumber } from "../lib/format";
import { useLanguage } from "../lib/i18n";

function ChainLink({ record, selected, onClick }: { record: ChainRecordStatus; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`chain-link ${record.valid ? "chain-link-valid" : "chain-link-broken"} ${selected ? "chain-link-selected" : ""}`}
      onClick={onClick}
      title={`Record #${record.id} — ${record.valid ? "verified" : "tampered"}`}
    >
      {record.valid ? <CheckCircleIcon size={13} /> : <AlertIcon size={13} />}
      <span className="chain-link-date">{record.report_date}</span>
      <span className="mono chain-link-hash">{record.record_hash.slice(0, 8)}…</span>
    </button>
  );
}

function ChainDetail({ record }: { record: ChainRecordStatus }) {
  return (
    <div className={`chain-detail ${record.valid ? "chain-detail-valid" : "chain-detail-broken"}`}>
      <div className="chain-detail-header">
        <h3>Record #{record.id}</h3>
        <span className={`priority-badge ${record.valid ? "priority-badge-low" : "priority-badge-high"}`}>
          {record.valid ? <CheckCircleIcon size={13} /> : <AlertIcon size={13} />}
          {record.valid ? "Verified" : "Tampered"}
        </span>
      </div>
      <dl className="chain-detail-grid">
        <dt>Date</dt>
        <dd>{record.report_date}</dd>
        <dt>County</dt>
        <dd>{record.county_name}</dd>
        <dt>Facility</dt>
        <dd>{record.facility_name}</dd>
        <dt>Confirmed cases</dt>
        <dd>{record.confirmed_cases}</dd>
        <dt>This record's hash</dt>
        <dd className="mono chain-detail-hash">{record.record_hash}</dd>
        <dt>Points back to</dt>
        <dd className="mono chain-detail-hash">{record.previous_hash || "(nothing — this is the first record)"}</dd>
      </dl>
      {!record.valid && (
        <p className="form-banner-error" style={{ marginTop: 12, marginBottom: 0 }}>
          {!record.self_valid
            ? "This record's stored hash no longer matches its own content — it was edited after creation."
            : "This record's \"points back to\" hash doesn't match the previous record's stored hash — a record was inserted, removed, or reordered."}
        </p>
      )}
    </div>
  );
}

export default function ChainIntegrity() {
  const { t } = useLanguage();
  const [result, setResult] = useState<ChainVerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const runVerification = () => {
    setChecking(true);
    setError(null);
    api
      .verifyChain()
      .then((res) => {
        setResult(res);
        setCheckedAt(new Date());
        setSelectedId((current) => current ?? res.records[res.records.length - 1]?.id ?? null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Verification failed"))
      .finally(() => setChecking(false));
  };

  useEffect(runVerification, []);

  const selectedRecord = result?.records.find((r) => r.id === selectedId) ?? null;

  return (
    <div>
      <h2>{t("page.chainIntegrity")}</h2>
      <p className="placeholder-note">
        Every case report is created with a hash over its own content plus the previous record's hash — an
        append-only chain, not a database column anyone can quietly edit. Click any link below to see exactly what's
        inside it, or try tampering with the sandbox further down to see the mechanism for yourself.
      </p>

      <div className="card">
        {error && <p style={{ color: "var(--risk-high)" }}>Could not reach backend: {error}</p>}

        {checking && !result && <p className="placeholder-note">{t("common.verifying")}</p>}

        {result && (
          <>
            <div className={`chain-status chain-status-${result.valid ? "valid" : "broken"}`}>
              <ShieldCheckIcon size={28} />
              <div>
                <div className="chain-status-headline">{result.valid ? "Chain intact" : "Chain integrity failure"}</div>
                <div className="chain-status-detail">
                  {result.valid
                    ? `All ${formatNumber(result.total_records)} records verified — each record's hash matches its content, and each links correctly to the one before it.`
                    : `${formatNumber(result.records.filter((r) => !r.valid).length)} of ${formatNumber(result.total_records)} records failed verification — click the red link(s) below for details.`}
                </div>
              </div>
            </div>

            {checkedAt && <p className="field-hint" style={{ marginTop: 14 }}>Last checked {checkedAt.toLocaleTimeString()}</p>}

            <button type="button" className="btn btn-secondary" onClick={runVerification} disabled={checking} style={{ marginTop: 10, marginBottom: 20 }}>
              {checking ? t("common.verifying") : t("common.reverify")}
            </button>

            {result.records.length > 0 && (
              <>
                <p className="rec-actions-label">The chain — {result.records.length} records, oldest to newest</p>
                <div className="chain-scroll">
                  {result.records.map((r, i) => (
                    <div className="chain-link-wrap" key={r.id}>
                      <ChainLink record={r} selected={r.id === selectedId} onClick={() => setSelectedId(r.id)} />
                      {i < result.records.length - 1 && <span className="chain-connector" aria-hidden="true" />}
                    </div>
                  ))}
                </div>

                {selectedRecord && <ChainDetail record={selectedRecord} />}
              </>
            )}
          </>
        )}
      </div>

      <ChainTamperDemo />
    </div>
  );
}
