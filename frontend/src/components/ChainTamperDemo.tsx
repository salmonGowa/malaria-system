import { useEffect, useState } from "react";

import Card, { CARD_SUBTITLE_CLASS, CARD_TITLE_CLASS } from "./Card";
import { AlertIcon, CheckCircleIcon } from "./icons";
import { FORM_BANNER_ERROR_CLASS, FORM_BANNER_SUCCESS_CLASS } from "../lib/bannerClasses";
import { btnClass } from "../lib/buttonClasses";
import {
  CHAIN_CONNECTOR_CLASS,
  CHAIN_LINK_DEMO_FIELD_CLASS,
  CHAIN_LINK_DEMO_INPUT_CLASS,
  CHAIN_LINK_HASH_CLASS,
  CHAIN_LINK_INDEX_CLASS,
  CHAIN_LINK_STATUS_CLASS,
  CHAIN_LINK_WRAP_CLASS,
  CHAIN_SCROLL_CLASS,
  chainLinkClass,
} from "../lib/chainClasses";
import { sha256Hex } from "../lib/hash";
import { PLACEHOLDER_NOTE_CLASS } from "../lib/noteClasses";

const LABELS = ["Clinic report — Mon", "Clinic report — Tue", "Clinic report — Wed", "Clinic report — Thu"];
const INITIAL_CASES = [12, 8, 15, 6];

function buildPayload(previousHash: string, label: string, confirmedCases: number): string {
  return `${previousHash}|${label}|${confirmedCases}`;
}

async function computeChain(cases: number[]): Promise<string[]> {
  const hashes: string[] = [];
  for (let i = 0; i < cases.length; i++) {
    const previous = i === 0 ? "" : hashes[i - 1];
    hashes.push(await sha256Hex(buildPayload(previous, LABELS[i], cases[i])));
  }
  return hashes;
}

/** A self-contained, sandboxed mini hash-chain — same mechanism as the real
 * CaseReport chain (previous-hash-in-payload, one edit breaks that record's
 * own hash) but with its own tiny fake dataset, so a non-technical user can
 * edit a value and *watch* a real SHA-256 hash (Web Crypto, not a stand-in)
 * stop matching, with no risk to anything real. Never touches the backend. */
export default function ChainTamperDemo() {
  const [cases, setCases] = useState<number[]>(INITIAL_CASES);
  const [originalHashes, setOriginalHashes] = useState<string[] | null>(null); // frozen "as stored"
  const [liveHashes, setLiveHashes] = useState<string[] | null>(null); // recomputed from current values

  const resetDemo = async () => {
    setOriginalHashes(null);
    setCases(INITIAL_CASES);
    const hashes = await computeChain(INITIAL_CASES);
    setOriginalHashes(hashes);
    setLiveHashes(hashes);
  };

  useEffect(() => {
    resetDemo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!originalHashes) return;
    let cancelled = false;
    (async () => {
      const recomputed = await Promise.all(
        cases.map((c, i) => {
          // The previous-hash pointer is fixed at "creation" time (the
          // original chain) — it does NOT follow an edit, same as the real
          // previous_hash column never updating just because an earlier
          // row's content changed.
          const previous = i === 0 ? "" : originalHashes[i - 1];
          return sha256Hex(buildPayload(previous, LABELS[i], c));
        }),
      );
      if (!cancelled) setLiveHashes(recomputed);
    })();
    return () => {
      cancelled = true;
    };
  }, [cases, originalHashes]);

  const handleEdit = (index: number, value: number) => {
    setCases((prev) => prev.map((c, i) => (i === index ? value : c)));
  };

  if (!originalHashes || !liveHashes) {
    return (
      <Card>
        <h3 className={CARD_TITLE_CLASS}>Try it — see how tampering is caught</h3>
        <p className={PLACEHOLDER_NOTE_CLASS}>Computing…</p>
      </Card>
    );
  }

  const validity = liveHashes.map((h, i) => h === originalHashes[i]);
  const anyTampered = validity.some((v) => !v);

  return (
    <Card>
      <h3 className={CARD_TITLE_CLASS}>Try it — see how tampering is caught</h3>
      <p className={CARD_SUBTITLE_CLASS}>
        A separate, illustrative 4-record mini chain — real SHA-256 hashing, computed live in your browser (Web
        Crypto). Not connected to any real case data; edit a value below.
      </p>

      <div className={CHAIN_SCROLL_CLASS}>
        {cases.map((c, i) => (
          <div className={CHAIN_LINK_WRAP_CLASS} key={i}>
            <div className={chainLinkClass({ valid: validity[i], demo: true })}>
              <span className={CHAIN_LINK_INDEX_CLASS}>#{i + 1}</span>
              <label className={CHAIN_LINK_DEMO_FIELD_CLASS}>
                confirmed cases
                <input
                  type="number"
                  className={CHAIN_LINK_DEMO_INPUT_CLASS}
                  min={0}
                  value={c}
                  onChange={(e) => handleEdit(i, Number(e.target.value))}
                />
              </label>
              <span className={`mono ${CHAIN_LINK_HASH_CLASS}`}>{liveHashes[i].slice(0, 10)}…</span>
              <span className={CHAIN_LINK_STATUS_CLASS}>
                {validity[i] ? <CheckCircleIcon size={13} /> : <AlertIcon size={13} />}
                {validity[i] ? "matches stored hash" : "hash changed!"}
              </span>
            </div>
            {i < cases.length - 1 && <span className={CHAIN_CONNECTOR_CLASS} aria-hidden="true" />}
          </div>
        ))}
      </div>

      {anyTampered ? (
        <p className={FORM_BANNER_ERROR_CLASS}>
          You changed a value above — its hash immediately stopped matching what was "stored" when the chain was
          built. Records after it are untouched and still check out fine on their own: the tamper is caught exactly
          where it happened, not by chasing a cascade of mismatches downstream.
        </p>
      ) : (
        <p className={FORM_BANNER_SUCCESS_CLASS}>Every record's live hash matches what was stored — nothing has been edited yet.</p>
      )}

      <button type="button" className={btnClass("secondary", { sm: true })} onClick={resetDemo}>
        Reset demo
      </button>
    </Card>
  );
}
