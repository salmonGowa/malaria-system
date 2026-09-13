/** Real SHA-256, computed in the browser via the Web Crypto API — used only
 * by the Chain Integrity page's sandboxed tampering demo (its own small,
 * illustrative dataset, never real case-report data). The actual chain's
 * authoritative verification always happens server-side
 * (CaseReportService.verify_chain) — this exists purely so the demo can
 * show a *real* hash actually changing when you edit a value, not a fake
 * one, without inventing a second source of truth for real records. */
export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
