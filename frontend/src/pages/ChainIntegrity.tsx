import { useEffect, useState } from "react";

import { api, ChainRecordStatus, ChainVerificationResult } from "../api/client";
import Card from "../components/Card";
import ChainTamperDemo from "../components/ChainTamperDemo";
import { AlertIcon, CheckCircleIcon, ShieldCheckIcon } from "../components/icons";
import { priorityBadgeClass } from "../lib/badgeClasses";
import { FORM_BANNER_ERROR_CLASS } from "../lib/bannerClasses";
import { btnClass } from "../lib/buttonClasses";
import {
  CHAIN_CONNECTOR_CLASS,
  CHAIN_DETAIL_DD_CLASS,
  CHAIN_DETAIL_DT_CLASS,
  CHAIN_DETAIL_GRID_CLASS,
  CHAIN_DETAIL_HASH_CLASS,
  CHAIN_DETAIL_HEADER_CLASS,
  CHAIN_DETAIL_TITLE_CLASS,
  CHAIN_LINK_DATE_CLASS,
  CHAIN_LINK_HASH_CLASS,
  CHAIN_LINK_WRAP_CLASS,
  CHAIN_SCROLL_CLASS,
  CHAIN_STATUS_DETAIL_CLASS,
  CHAIN_STATUS_HEADLINE_CLASS,
  chainDetailClass,
  chainLinkClass,
  chainStatusClass,
} from "../lib/chainClasses";
import { REC_ACTIONS_LABEL_CLASS } from "../lib/decisionSupportClasses";
import { FIELD_HINT_CLASS } from "../lib/fieldClasses";
import { formatNumber } from "../lib/format";
import { useLanguage } from "../lib/i18n";
import { PLACEHOLDER_NOTE_CLASS } from "../lib/noteClasses";

function ChainLink({ record, selected, onClick }: { record: ChainRecordStatus; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={chainLinkClass({ valid: record.valid, selected })}
      onClick={onClick}
      title={`Record #${record.id} — ${record.valid ? "verified" : "tampered"}`}
    >
      {record.valid ? <CheckCircleIcon size={13} /> : <AlertIcon size={13} />}
      <span className={CHAIN_LINK_DATE_CLASS}>{record.report_date}</span>
      <span className={`mono ${CHAIN_LINK_HASH_CLASS}`}>{record.record_hash.slice(0, 8)}…</span>
    </button>
  );
}

function ChainDetail({ record }: { record: ChainRecordStatus }) {
  return (
    <div className={chainDetailClass(record.valid)}>
      <div className={CHAIN_DETAIL_HEADER_CLASS}>
        <h3 className={CHAIN_DETAIL_TITLE_CLASS}>Record #{record.id}</h3>
        <span className={priorityBadgeClass(record.valid ? "low" : "high")}>
          {record.valid ? <CheckCircleIcon size={13} /> : <AlertIcon size={13} />}
          {record.valid ? "Verified" : "Tampered"}
        </span>
      </div>
      <dl className={CHAIN_DETAIL_GRID_CLASS}>
        <dt className={CHAIN_DETAIL_DT_CLASS}>Date</dt>
        <dd className={CHAIN_DETAIL_DD_CLASS}>{record.report_date}</dd>
        <dt className={CHAIN_DETAIL_DT_CLASS}>County</dt>
        <dd className={CHAIN_DETAIL_DD_CLASS}>{record.county_name}</dd>
        <dt className={CHAIN_DETAIL_DT_CLASS}>Facility</dt>
        <dd className={CHAIN_DETAIL_DD_CLASS}>{record.facility_name}</dd>
        <dt className={CHAIN_DETAIL_DT_CLASS}>Confirmed cases</dt>
        <dd className={CHAIN_DETAIL_DD_CLASS}>{record.confirmed_cases}</dd>
        <dt className={CHAIN_DETAIL_DT_CLASS}>This record's hash</dt>
        <dd className={`mono ${CHAIN_DETAIL_HASH_CLASS}`}>{record.record_hash}</dd>
        <dt className={CHAIN_DETAIL_DT_CLASS}>Points back to</dt>
        <dd className={`mono ${CHAIN_DETAIL_HASH_CLASS}`}>{record.previous_hash || "(nothing — this is the first record)"}</dd>
      </dl>
      {!record.valid && (
        <p className={FORM_BANNER_ERROR_CLASS} style={{ marginTop: 12, marginBottom: 0 }}>
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
      <p className={PLACEHOLDER_NOTE_CLASS}>
        Every case report is created with a hash over its own content plus the previous record's hash — an
        append-only chain, not a database column anyone can quietly edit. Click any link below to see exactly what's
        inside it, or try tampering with the sandbox further down to see the mechanism for yourself.
      </p>

      <Card>
        {error && <p style={{ color: "var(--risk-high)" }}>Could not reach backend: {error}</p>}

        {checking && !result && <p className={PLACEHOLDER_NOTE_CLASS}>{t("common.verifying")}</p>}

        {result && (
          <>
            <div className={chainStatusClass(result.valid)}>
              <ShieldCheckIcon size={28} />
              <div>
                <div className={CHAIN_STATUS_HEADLINE_CLASS}>{result.valid ? "Chain intact" : "Chain integrity failure"}</div>
                <div className={CHAIN_STATUS_DETAIL_CLASS}>
                  {result.valid
                    ? `All ${formatNumber(result.total_records)} records verified — each record's hash matches its content, and each links correctly to the one before it.`
                    : `${formatNumber(result.records.filter((r) => !r.valid).length)} of ${formatNumber(result.total_records)} records failed verification — click the red link(s) below for details.`}
                </div>
              </div>
            </div>

            {checkedAt && <p className={FIELD_HINT_CLASS} style={{ marginTop: 14 }}>Last checked {checkedAt.toLocaleTimeString()}</p>}

            <button
              type="button"
              className={btnClass("secondary")}
              onClick={runVerification}
              disabled={checking}
              style={{ marginTop: 10, marginBottom: 20 }}
            >
              {checking ? t("common.verifying") : t("common.reverify")}
            </button>

            {result.records.length > 0 && (
              <>
                <p className={REC_ACTIONS_LABEL_CLASS}>The chain — {result.records.length} records, oldest to newest</p>
                <div className={CHAIN_SCROLL_CLASS}>
                  {result.records.map((r, i) => (
                    <div className={CHAIN_LINK_WRAP_CLASS} key={r.id}>
                      <ChainLink record={r} selected={r.id === selectedId} onClick={() => setSelectedId(r.id)} />
                      {i < result.records.length - 1 && <span className={CHAIN_CONNECTOR_CLASS} aria-hidden="true" />}
                    </div>
                  ))}
                </div>

                {selectedRecord && <ChainDetail record={selectedRecord} />}
              </>
            )}
          </>
        )}
      </Card>

      <ChainTamperDemo />
    </div>
  );
}
