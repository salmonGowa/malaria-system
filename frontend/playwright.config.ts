import { defineConfig, devices } from "@playwright/test";

/** Core-flow e2e suite (frontend/e2e/) — runs against the real dev stack
 * (backend + ml_service + db + this frontend), not a mock. See e2e/README.md
 * for how to start everything and seed the fixed test user first; this
 * config deliberately does NOT auto-start servers (`webServer`) because the
 * stack is four separate processes (scripts/dev-up.sh), not one `npm run
 * dev` this config could launch on its own. */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // tests share one live backend/DB — order and isolation matter more than speed
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
