import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/** Automated accessibility regression check across every route
 * that doesn't need seeded data to render something meaningful. Not a
 * substitute for a real manual pass (keyboard-only navigation, a screen
 * reader) — axe catches maybe a third of real accessibility issues — but
 * it's cheap, real, and catches exactly the kind of thing that crept back
 * in silently otherwise: this suite exists because a first pass (see
 * docs/architecture.md's "Frontend quality-of-life features") found and
 * fixed color-contrast, an empty table header, a non-keyboard-reachable
 * scrollable table, and a heading-level skip — all through this same tool. */
const ROUTES = [
  "/",
  "/dashboard",
  "/decision-support",
  "/simulations",
  "/upload-simulate",
  "/counties",
  "/case-reports",
  "/submit-case-report",
  "/forecasts",
  "/generate-forecast",
  "/allocations",
  "/run-allocation",
  "/allocation-log",
  "/facilities",
  "/chain-integrity",
  "/settings",
];

for (const route of ROUTES) {
  test(`no axe violations on ${route}`, async ({ page }) => {
    await page.goto(route, { waitUntil: "load" });
    await page.waitForTimeout(500); // let client-side data fetches settle
    const results = await new AxeBuilder({ page }).analyze();
    const summary = results.violations.map((v) => `[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node(s))`);
    expect(summary, summary.join("\n")).toEqual([]);
  });
}
