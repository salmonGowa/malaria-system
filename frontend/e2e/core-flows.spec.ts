import { expect, test } from "@playwright/test";

import { E2E_USERNAME, selectOnlyCounty, signIn } from "./helpers";

/** The proposal's end-to-end backbone, formalized as a committed suite
 * instead of one-off ad hoc verification: sign in -> generate a forecast ->
 * run an allocation against it -> verify the case-report chain is intact.
 * Runs against the real dev stack (backend + ml_service + db + this
 * frontend) — see e2e/README.md for how to start it and seed the fixed
 * `e2e_test` user first.
 *
 * Serial, not parallel: run allocation depends on a forecast existing for
 * the county picked here, and this is a shared live database, not a fresh
 * one per test — see playwright.config.ts's fullyParallel: false. */
test.describe.serial("core flows", () => {
  test("sign in", async ({ page }) => {
    await page.goto("/dashboard");
    await signIn(page);
  });

  test("generate a forecast", async ({ page }) => {
    await page.goto("/dashboard");
    await signIn(page);

    await page.goto("/generate-forecast");
    await selectOnlyCounty(page, "Kisumu");
    await page.getByRole("button", { name: "Generate forecasts" }).click();

    // Real ml_service call (trained XGBoost model) — give it a moment.
    await expect(page.getByText(/Generated 1 forecast/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("generate-results-list")).toContainText("Kisumu");

    // Lands in the stored list, attributed to whoever triggered it (the
    // audit trail this suite is also implicitly exercising).
    await page.goto("/forecasts");
    const firstRow = page.locator("tbody tr").first();
    await expect(firstRow).toContainText("Kisumu");
    await expect(firstRow).toContainText(E2E_USERNAME);
  });

  test("run an allocation against that forecast", async ({ page }) => {
    await page.goto("/dashboard");
    await signIn(page);

    await page.goto("/run-allocation");
    await selectOnlyCounty(page, "Kisumu");
    await page.getByRole("button", { name: "Run allocation" }).click();

    // Real ml_service call (PuLP linear program).
    await expect(page.getByText(/Allocated [\d,]+ doses across 1 county/)).toBeVisible({ timeout: 15_000 });

    await page.goto("/allocations");
    const firstRow = page.locator("tbody tr").first();
    await expect(firstRow).toContainText("Kisumu");
    await expect(firstRow).toContainText(E2E_USERNAME);
  });

  test("verify chain reports intact (or names exactly where it isn't)", async ({ page }) => {
    await page.goto("/chain-integrity");

    // Whichever it is, the page must reach a real, non-error verdict from
    // the backend's verify_chain endpoint — not hang on "Verifying…".
    const headline = page.getByText(/^(Chain intact|Chain integrity failure)$/);
    await expect(headline).toBeVisible({ timeout: 10_000 });
    const isValid = (await headline.textContent()) === "Chain intact";

    if (isValid) {
      await expect(page.getByText(/All \d[\d,]* records verified/)).toBeVisible();
    } else {
      // This assertion doesn't get here on a normal run — a broken chain
      // means someone tampered with case_reports rows directly (e.g. a raw
      // SQL UPDATE in a Django shell, as docs/architecture.md's hash-chain
      // rationale discusses). Either way the requirement being tested is
      // the same: the UI must *report* it plainly, never mask it as valid.
      await expect(page.getByText(/records? failed verification/)).toBeVisible();
    }
  });
});
