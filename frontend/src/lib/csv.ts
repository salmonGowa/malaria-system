/** Client-side CSV export — no backend endpoint needed, this just turns
 * whatever's already been fetched into a downloadable file. Exports every
 * matching row (via the caller passing an `listAll*` result), not just the
 * current page, since a decision-support tool's export button should hand
 * over the whole dataset, not whatever 50 rows happen to be on screen. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  // Quote (and escape embedded quotes) whenever the value could otherwise
  // break the CSV grid: a comma, a quote, or a newline.
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export function toCsv<T extends object>(rows: T[], columns: (keyof T)[]): string {
  const header = columns.map((c) => csvCell(String(c))).join(",");
  const body = rows.map((row) => columns.map((c) => csvCell(row[c])).join(","));
  return [header, ...body].join("\r\n");
}

export function downloadCsv<T extends object>(filename: string, rows: T[], columns: (keyof T)[]) {
  const csv = toCsv(rows, columns);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
