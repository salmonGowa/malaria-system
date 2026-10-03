import type { Batch } from "./deliveryBatches";

/** One saved allocation line, with what the export needs alongside it. */
export interface ExportLine {
  county: string;
  code: string;
  population: number | null;
  risk: number | null;
  doses: number;
  rationale: string;
}

export interface ExportMeta {
  periodStart: string;
  periodEnd: string;
  supply: number;
  capPct: number;
  floor: number;
  runBy: string | null;
  generatedAt: string;
  intervalWeeks: number;
}

/** Batch (1-based) and week in which each county's last doses arrive. */
function deliveryOf(batches: Batch[], intervalWeeks: number) {
  const done = new Map<string, { batch: number; week: number }>();
  for (const b of batches) for (const item of b.items) done.set(item.code, { batch: b.index + 1, week: b.index * intervalWeeks });
  return done;
}

export function exportRows(lines: ExportLine[], batches: Batch[], meta: ExportMeta) {
  const total = lines.reduce((n, l) => n + l.doses, 0);
  const delivery = deliveryOf(batches, meta.intervalWeeks);
  return [...lines]
    .sort((a, b) => b.doses - a.doses || a.county.localeCompare(b.county))
    .map((l) => ({
      county: l.county,
      code: l.code,
      population: l.population ?? "",
      risk_score: l.risk ?? "",
      doses: l.doses,
      share_pct: total ? Number(((l.doses / total) * 100).toFixed(1)) : 0,
      coverage_pct: l.population ? Number(((l.doses / l.population) * 100).toFixed(2)) : "",
      delivered_in_batch: delivery.get(l.code)?.batch ?? "",
      delivered_by_week: delivery.get(l.code)?.week ?? "",
      period_start: meta.periodStart,
      period_end: meta.periodEnd,
      rationale: l.rationale,
    }));
}

const escape = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const num = (n: number) => n.toLocaleString("en");

/** A self-contained, printable one-page summary for county health teams. */
export function summaryHtml(lines: ExportLine[], batches: Batch[], meta: ExportMeta): string {
  const rows = exportRows(lines, batches, meta);
  const funded = rows.filter((r) => r.doses > 0);
  const unfunded = rows.filter((r) => r.doses === 0);
  const total = rows.reduce((n, r) => n + r.doses, 0);
  const settings = [
    `${num(meta.supply)} doses available, ${num(total)} allocated`,
    meta.capPct < 100 ? `at most ${meta.capPct}% per county` : "no per-county cap",
    meta.floor > 0 ? `at least ${num(meta.floor)} per county` : "no minimum per county",
  ].join(" · ");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Vaccine allocation ${escape(meta.periodStart)} to ${escape(meta.periodEnd)}</title>
<style>
  body { font: 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; color: #101828; margin: 32px; }
  h1 { font-size: 20px; margin: 0 0 4px; } h2 { font-size: 14px; margin: 24px 0 8px; }
  .meta { color: #475467; margin: 0 0 2px; }
  table { border-collapse: collapse; width: 100%; } th, td { border-bottom: 1px solid #e4e7ec; padding: 6px 8px; text-align: left; }
  th { font-size: 11px; text-transform: uppercase; letter-spacing: .03em; color: #475467; } td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; }
  ol { padding-left: 18px; } li { margin-bottom: 4px; } .note { color: #667085; font-size: 11px; margin-top: 24px; }
  @media print { body { margin: 12mm; } }
</style></head><body>
<h1>Vaccine allocation · ${escape(meta.periodStart)} to ${escape(meta.periodEnd)}</h1>
<p class="meta">${escape(settings)}</p>
<p class="meta">Run ${meta.runBy ? `by ${escape(meta.runBy)} ` : ""}on ${escape(new Date(meta.generatedAt).toLocaleString("en-GB"))}</p>
<h2>Doses per county</h2>
<table><thead><tr><th>County</th><th class="n">Doses</th><th class="n">Share</th><th class="n">Coverage</th><th class="n">Risk</th><th class="n">Delivered by</th></tr></thead><tbody>
${funded
  .map(
    (r) =>
      `<tr><td>${escape(r.county)}</td><td class="n">${num(r.doses)}</td><td class="n">${r.share_pct}%</td><td class="n">${r.coverage_pct === "" ? "—" : `${r.coverage_pct}%`}</td><td class="n">${r.risk_score === "" ? "—" : escape(r.risk_score)}</td><td class="n">${r.delivered_in_batch === "" ? "—" : `batch ${r.delivered_in_batch} (week ${r.delivered_by_week})`}</td></tr>`,
  )
  .join("\n")}
</tbody></table>
${unfunded.length ? `<p class="meta">No doses: ${unfunded.map((r) => escape(r.county)).join(", ")}.</p>` : ""}
${
  batches.length > 1
    ? `<h2>Delivery schedule</h2><ol>${batches
        .map(
          (b) =>
            `<li><strong>Batch ${b.index + 1}</strong> (${b.index === 0 ? "now" : `week ${b.index * meta.intervalWeeks}`}), ${num(b.total)} doses: ${b.items
              .map((i) => `${escape(i.name)} ${num(i.doses)}`)
              .join(", ")}</li>`,
        )
        .join("")}</ol>`
    : ""
}
<p class="note">Doses split by the risk-weighted linear-programming optimiser from each county's latest forecast. The delivery schedule is a rule of thumb (highest-risk counties first), not part of the optimisation.</p>
</body></html>`;
}
