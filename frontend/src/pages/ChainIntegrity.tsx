import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { api, ChainRecordStatus, ChainVerificationResult } from "../api/client";
import Card from "../components/Card";
import ChainTamperDemo from "../components/ChainTamperDemo";
import { AlertIcon, CheckCircleIcon, ShieldCheckIcon } from "../components/icons";
import { priorityBadgeClass } from "../lib/badgeClasses";
import { BANNER_WARNING_CLASS } from "../lib/bannerClasses";
import { btnClass } from "../lib/buttonClasses";
import { CHAIN_STATUS_DETAIL_CLASS, CHAIN_STATUS_HEADLINE_CLASS, chainStatusClass } from "../lib/chainClasses";
import { formatDayLabel, formatNumber } from "../lib/format";
import { useLanguage } from "../lib/i18n";
import { PLACEHOLDER_NOTE_CLASS } from "../lib/noteClasses";

/** One record as a small tile in the chain map. */
function ChainTile({ record, selected, onSelect }: { record: ChainRecordStatus; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`Record #${record.id}, ${formatDayLabel(record.report_date)}, ${record.facility_name} — ${record.valid ? "verified" : "failed verification"}`}
      title={`#${record.id} · ${formatDayLabel(record.report_date)} · ${record.facility_name}`}
      className={
        "relative grid h-9 min-w-9 cursor-pointer place-items-center rounded-md border px-1 text-[0.65rem] font-semibold tabular-nums transition " +
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
        (record.valid
          ? "border-risk-low/40 bg-risk-low-soft text-risk-low hover:border-risk-low"
          : "border-risk-high bg-risk-high-soft text-risk-high") +
        (selected ? " ring-2 ring-accent ring-offset-2 ring-offset-panel" : "")
      }
    >
      {record.id}
    </button>
  );
}

function Check({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <div className={`flex items-start gap-2 text-[0.8125rem] ${ok ? "text-risk-low" : "text-risk-high"}`}>
      <span className="mt-px flex-none">{ok ? <CheckCircleIcon size={15} /> : <AlertIcon size={15} />}</span>
      <span className="text-text-secondary">{children}</span>
    </div>
  );
}

function HashBox({ label, hash, tone }: { label: string; hash: string; tone?: "ok" | "bad" }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-xs font-medium text-muted">{label}</div>
      <div
        className={
          "mono rounded-lg border px-2.5 py-2 text-xs break-all " +
          (tone === "bad" ? "border-risk-high/50 bg-risk-high-soft text-text" : "border-border bg-panel-muted text-text-secondary")
        }
      >
        {hash || "(none — this is the first record)"}
      </div>
    </div>
  );
}

function ChainDetail({
  record,
  previous,
  position,
  total,
  onStep,
}: {
  record: ChainRecordStatus;
  previous: ChainRecordStatus | null;
  position: number;
  total: number;
  onStep: (delta: number) => void;
}) {
  return (
    <div className={`rounded-xl border p-4 min-[561px]:p-5 ${record.valid ? "border-border" : "border-risk-high/50"}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h3 className="m-0 text-base font-bold text-text">Record #{record.id}</h3>
          <span className={priorityBadgeClass(record.valid ? "low" : "high")}>
            {record.valid ? <CheckCircleIcon size={13} /> : <AlertIcon size={13} />}
            {record.valid ? "Verified" : "Failed verification"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">
            {position + 1} of {total}
          </span>
          <button type="button" className={btnClass("secondary", { sm: true })} onClick={() => onStep(-1)} disabled={position === 0} aria-label="Previous record">
            ←
          </button>
          <button type="button" className={btnClass("secondary", { sm: true })} onClick={() => onStep(1)} disabled={position === total - 1} aria-label="Next record">
            →
          </button>
        </div>
      </div>

      <dl className="m-0 mb-4 grid grid-cols-2 gap-x-6 gap-y-3 min-[761px]:grid-cols-4">
        {[
          ["Report date", formatDayLabel(record.report_date)],
          ["County", record.county_name],
          ["Facility", record.facility_name],
          ["Confirmed cases", formatNumber(record.confirmed_cases)],
        ].map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-xs text-muted">{k}</dt>
            <dd className="m-0 mt-0.5 truncate text-[0.875rem] font-semibold text-text">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="mb-4 flex flex-col gap-1.5">
        <Check ok={record.self_valid}>
          {record.self_valid
            ? "Its stored hash matches its own content — nothing in it has been edited."
            : "Its stored hash no longer matches its own content — it was edited after it was created."}
        </Check>
        <Check ok={record.link_valid}>
          {previous
            ? record.link_valid
              ? `It points back to record #${previous.id}'s stored hash — the link is intact.`
              : `It should point back to record #${previous.id}'s stored hash, but doesn't — a record was inserted, removed or reordered.`
            : record.link_valid
              ? "It's the first record, so there's nothing before it to point back to."
              : "It's the first record but claims a previous hash — the start of the chain was altered."}
        </Check>
      </div>

      <div className="grid gap-3 min-[901px]:grid-cols-2">
        <HashBox label="Points back to (previous record's hash)" hash={record.previous_hash} tone={record.link_valid ? "ok" : "bad"} />
        <HashBox label="This record's hash" hash={record.record_hash} tone={record.self_valid ? "ok" : "bad"} />
      </div>
    </div>
  );
}

export default function ChainIntegrity() {
  const { t } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("record") ? Number(searchParams.get("record")) : null;
  const [result, setResult] = useState<ChainVerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(requested);

  const runVerification = () => {
    setChecking(true);
    setError(null);
    api
      .verifyChain()
      .then((res) => {
        setResult(res);
        setCheckedAt(new Date());
        // Default to the first broken record if there is one, else the newest.
        setSelectedId(
          (current) =>
            current ?? res.records.find((r) => !r.valid)?.id ?? res.records[res.records.length - 1]?.id ?? null,
        );
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Verification failed"))
      .finally(() => setChecking(false));
  };

  useEffect(runVerification, []);

  const records = result?.records ?? [];
  const position = records.findIndex((r) => r.id === selectedId);
  const selected = position >= 0 ? records[position] : null;
  const failed = useMemo(() => records.filter((r) => !r.valid), [records]);

  const select = (id: number) => {
    setSelectedId(id);
    setSearchParams({ record: String(id) }, { replace: true });
  };
  const step = (delta: number) => {
    const next = records[position + delta];
    if (next) select(next.id);
  };

  return (
    <div>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="m-0 text-[1.6rem] font-bold tracking-[-0.02em] text-text">{t("page.chainIntegrity")}</h2>
          <p className="mt-1 mb-0 max-w-[75ch] text-sm text-muted">
            Every case report carries a hash of its own content plus the previous record's hash, so editing, removing or
            reordering any record breaks the chain from that point on.
          </p>
        </div>
        <button type="button" className={btnClass("secondary")} onClick={runVerification} disabled={checking}>
          <ShieldCheckIcon size={15} />
          {checking ? t("common.verifying") : t("common.reverify")}
        </button>
      </header>

      {error && <p className={BANNER_WARNING_CLASS}>Could not reach backend: {error}</p>}
      {checking && !result && <p className={PLACEHOLDER_NOTE_CLASS}>{t("common.verifying")}</p>}

      {result && (
        <>
          <div className={`${chainStatusClass(result.valid)} mb-5`}>
            <ShieldCheckIcon size={28} />
            <div className="min-w-0 flex-1">
              <div className={CHAIN_STATUS_HEADLINE_CLASS}>{result.valid ? "Chain intact" : "Chain integrity failure"}</div>
              <div className={CHAIN_STATUS_DETAIL_CLASS}>
                {result.valid
                  ? `All ${formatNumber(result.total_records)} records verified — each record's hash matches its content, and each links correctly to the one before it.`
                  : `${formatNumber(failed.length)} of ${formatNumber(result.total_records)} records failed verification — they're marked red in the chain below.`}
              </div>
            </div>
            {checkedAt && <div className="text-xs text-muted">Checked {checkedAt.toLocaleTimeString()}</div>}
          </div>

          {records.length > 0 && (
            <Card>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3 className="m-0 text-[0.95rem] font-semibold text-text">The chain</h3>
                  <p className="mt-1 mb-0 text-[0.8125rem] text-muted">
                    {formatNumber(records.length)} records, oldest to newest ({formatDayLabel(records[0].report_date)} –{" "}
                    {formatDayLabel(records[records.length - 1].report_date)}). Select one to inspect it.
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted">
                  <span className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-sm bg-risk-low" /> Verified
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-sm bg-risk-high" /> Failed
                  </span>
                  {failed.length > 0 && (
                    <button type="button" className={btnClass("secondary", { sm: true })} onClick={() => select(failed[0].id)}>
                      Jump to first failure
                    </button>
                  )}
                </div>
              </div>

              <div role="group" aria-label="Chain records, oldest to newest" className="mb-5 flex flex-wrap gap-1.5">
                {records.map((r) => (
                  <ChainTile key={r.id} record={r} selected={r.id === selectedId} onSelect={() => select(r.id)} />
                ))}
              </div>

              {selected && (
                <ChainDetail
                  record={selected}
                  previous={position > 0 ? records[position - 1] : null}
                  position={position}
                  total={records.length}
                  onStep={step}
                />
              )}
              {requested && !selected && !checking && (
                <p className={PLACEHOLDER_NOTE_CLASS}>Record #{requested} isn't in the chain.</p>
              )}
              <p className="mt-3 mb-0 text-xs text-muted">
                Tiles show each record's number, the same # as in <Link to="/case-reports">Case Reports</Link>.
              </p>
            </Card>
          )}
        </>
      )}

      <ChainTamperDemo />
    </div>
  );
}
