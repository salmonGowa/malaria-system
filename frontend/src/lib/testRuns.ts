/** Accounts whose runs are automated test traffic, not real forecasting or
 * allocation work — matches the e2e suite's default login
 * (frontend/e2e/helpers.ts E2E_USERNAME). Pages offer a "Hide test runs"
 * toggle built on this; it's off by default because the e2e suite checks
 * that its own runs appear. */
export const TEST_ACCOUNTS = new Set(["e2e_test"]);

export function isTestRun(row: { generated_by_username: string | null }): boolean {
  return row.generated_by_username !== null && TEST_ACCOUNTS.has(row.generated_by_username);
}

/** Persisted per page, so the choice survives reloads. */
export function readHideTestRuns(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function writeHideTestRuns(key: string, hide: boolean): void {
  try {
    window.localStorage.setItem(key, hide ? "1" : "0");
  } catch {
    /* preference just won't persist */
  }
}
