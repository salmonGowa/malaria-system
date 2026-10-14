import { expect, test } from "@playwright/test";

/** "/" is the public landing page (pages/LandingPage.tsx) — no sidebar,
 * its own nav, no auth required. Formalizes what was manually verified
 * when it was wired up: the landing page's real "go do this" calls to
 * action land on real, working app routes (not dead anchors), while its
 * own in-page demo (the flow-matching scenario toggle) never navigates
 * away. The page is styled with Tailwind utilities only (no page CSS), so
 * hooks here are data-testid / roles rather than class names. */
test.describe("landing page", () => {
  test("renders at / without the app shell", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("landing-page")).toBeVisible();
    // The authenticated app's sidebar/topbar must not be present here.
    await expect(page.locator(".sidebar")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1, name: "Predict outbreaks before the season peaks." })).toBeVisible();
  });

  test("nav CTA routes into the real dashboard", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "See the platform" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("'Try the simulator' routes to the real upload-simulate page", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Try the simulator" }).click();
    await expect(page).toHaveURL(/\/upload-simulate$/);
  });

  test("the in-page simulation switches scenario without navigating away", async ({ page }) => {
    await page.goto("/");
    const longRains = page.getByRole("button", { name: "Long rains" });
    await longRains.click();
    await expect(longRains).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL(/\/$/);
  });

  test("closing CTA 'Simulate a tampered record' routes to the real chain-integrity page", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Simulate a tampered record" }).click();
    await expect(page).toHaveURL(/\/chain-integrity$/);
  });
});
