/** Client-side check of an Upload & Simulate CSV before it's sent, so a
 * wrong column name or a short file is caught instantly with a preview,
 * not after a round-trip. Mirrors ml_service/app/upload_simulation.py's
 * rules (required columns, date formats, non-negative cases, MIN_ROWS);
 * the server stays authoritative and re-validates everything. */

export const MIN_ROWS = 6;
const REQUIRED = ["date", "confirmed_cases"] as const;
const DATE_RE = /^\d{4}-\d{2}(-\d{2})?$/;
const MAX_ERRORS = 3;

export interface PreviewRow {
  date: string;
  cases: number;
  rainfall: number | null;
}

export interface CsvPreview {
  rows: PreviewRow[];
  hasRainfall: boolean;
  columns: string[];
  errors: string[];
}

/** Split one CSV line, honouring double-quoted cells ("1,200"). */
function splitLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      cells.push(cur);
      cur = "";
    } else cur += ch;
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

export function previewCaseCsv(text: string): CsvPreview {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => l.trim() !== "");
  if (headerIdx === -1) return { rows: [], hasRainfall: false, columns: [], errors: ["The file is empty."] };

  const columns = splitLine(lines[headerIdx]).map((c) => c.toLowerCase());
  const missing = REQUIRED.filter((c) => !columns.includes(c));
  if (missing.length > 0) {
    return {
      rows: [],
      hasRainfall: false,
      columns,
      errors: [
        `Missing column${missing.length > 1 ? "s" : ""} ${missing.map((m) => `"${m}"`).join(" and ")} — found ${
          columns.filter(Boolean).map((c) => `"${c}"`).join(", ") || "none"
        }.`,
      ],
    };
  }

  const col = (name: string) => columns.indexOf(name);
  const iDate = col("date");
  const iCases = col("confirmed_cases");
  const iRain = col("rainfall_mm");
  const rows: PreviewRow[] = [];
  const errors: string[] = [];

  for (let i = headerIdx + 1; i < lines.length && errors.length < MAX_ERRORS; i++) {
    if (lines[i].trim() === "") continue;
    const cells = splitLine(lines[i]);
    const lineNo = i + 1;
    const date = cells[iDate] ?? "";
    const casesRaw = (cells[iCases] ?? "").replace(/,/g, "");
    if (!date || !casesRaw) {
      errors.push(`Line ${lineNo}: date and confirmed_cases are both required.`);
      continue;
    }
    if (!DATE_RE.test(date)) {
      errors.push(`Line ${lineNo}: "${date}" isn't a date — use YYYY-MM-DD or YYYY-MM.`);
      continue;
    }
    const cases = Number(casesRaw);
    if (!Number.isFinite(cases)) {
      errors.push(`Line ${lineNo}: confirmed_cases "${cells[iCases]}" isn't a number.`);
      continue;
    }
    if (cases < 0) {
      errors.push(`Line ${lineNo}: confirmed_cases can't be negative.`);
      continue;
    }
    let rainfall: number | null = null;
    if (iRain !== -1 && cells[iRain]) {
      rainfall = Number(cells[iRain].replace(/,/g, ""));
      if (!Number.isFinite(rainfall)) {
        errors.push(`Line ${lineNo}: rainfall_mm "${cells[iRain]}" isn't a number.`);
        continue;
      }
    }
    rows.push({ date, cases, rainfall });
  }

  if (errors.length === 0 && rows.length < MIN_ROWS) {
    errors.push(`Need at least ${MIN_ROWS} monthly rows for a meaningful fit — this file has ${rows.length}.`);
  }

  return { rows, hasRainfall: rows.some((r) => r.rainfall !== null), columns, errors };
}
