import { describe, expect, it } from "vitest";

import { resolveCssVars } from "./chartExport";

describe("resolveCssVars", () => {
  const vars: Record<string, string> = { "--accent": " #14a37f", "--muted": "#667085" };
  const lookup = (n: string) => vars[n] ?? "";

  it("replaces custom properties with their current values", () => {
    expect(resolveCssVars('<path stroke="var(--accent)" fill="var(--muted)"/>', lookup)).toBe('<path stroke="#14a37f" fill="#667085"/>');
  });

  it("uses the fallback, then currentColor, for unknown properties", () => {
    expect(resolveCssVars('stroke="var(--nope, red)"', lookup)).toBe('stroke="red"');
    expect(resolveCssVars('stroke="var(--nope)"', lookup)).toBe('stroke="currentColor"');
  });
});
