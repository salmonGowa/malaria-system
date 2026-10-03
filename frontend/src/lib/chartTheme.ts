/** Shared Recharts styling so every chart reads as one system: quiet axes
 * (no axis/tick lines, muted 11px labels), horizontal-only dashed grid, and
 * a soft hover band. Spread onto the matching Recharts element, e.g.
 * `<XAxis {...AXIS} dataKey="month" />`. */

export const AXIS = {
  tick: { fill: "var(--muted)", fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

/** Category axis on a horizontal bar chart: every label shown, never thinned. */
export const CATEGORY_AXIS = {
  ...AXIS,
  tick: { fill: "var(--text-secondary)", fontSize: 12 },
  interval: 0,
} as const;

export const GRID = { stroke: "var(--border)", strokeDasharray: "3 4", vertical: false } as const;
export const GRID_VERTICAL = { stroke: "var(--border)", strokeDasharray: "3 4", horizontal: false } as const;

export const CURSOR = { fill: "var(--panel-muted)", opacity: 0.7 } as const;
export const LINE_CURSOR = { stroke: "var(--border-strong)", strokeDasharray: "3 3" } as const;

/** Row height for horizontal bar charts — chart height scales with the
 * number of categories so labels never collide or get skipped. */
export const BAR_ROW = 26;
