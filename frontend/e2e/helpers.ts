import { expect, Page } from "@playwright/test";

export const E2E_USERNAME = process.env.E2E_USERNAME ?? "e2e_test";
export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "e2e-test-only-pass";

/** Signs in via the AuthWidget popover in the top bar — the same path a
 * real user takes, not a shortcut through localStorage/API tokens, since
 * the point of an e2e suite is exercising the real UI. */
export async function signIn(page: Page, username = E2E_USERNAME, password = E2E_PASSWORD) {
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("dialog").getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText(username, { exact: true })).toBeVisible();
}

/** Selects exactly one county in a CountyPicker (all counties start
 * selected) — keeps generate-forecast/run-allocation e2e runs to a single
 * ml_service call instead of all 14 seeded counties.
 *
 * Both pages using CountyPicker re-select every county whenever their own
 * `listAllCounties()` fetch resolves (including React 18 dev-mode's double
 * effect invocation), which can land *after* a single unchecked/checked
 * click pair and silently wipe it out. Polling — repeating the click pair
 * until the picker settles on exactly one county checked — is robust to
 * that race without needing to know when the last fetch will resolve. */
export async function selectOnlyCounty(page: Page, countyName: string) {
  const picker = page.locator(".county-picker");
  const countyBox = picker.getByLabel(countyName, { exact: true });
  const allBox = picker.getByLabel(/All counties/);

  await expect(countyBox).toBeChecked({ timeout: 10_000 }); // county list has loaded at least once

  await expect(async () => {
    if (await allBox.isChecked()) await allBox.uncheck();
    if (!(await countyBox.isChecked())) await countyBox.check();
    const checkedCount = await picker.locator('input[type="checkbox"]:checked').count();
    expect(checkedCount).toBe(1);
  }).toPass({ timeout: 5_000 });
}
