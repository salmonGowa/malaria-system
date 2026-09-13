# End-to-end suite

Playwright tests for the core flows through the real, running stack — not a
mocked frontend. This is deliberately different from `src/**/*.test.tsx`
(Vitest, isolated component/unit tests, no backend involved): this suite
exercises backend + ml_service + the database together, the same way a real
user would.

## Running it

1. Start the full dev stack (db + backend + ml_service + frontend):

   ```
   scripts/dev-up.sh
   ```

2. Seed (or reset) the fixed test user this suite signs in as:

   ```
   cd backend && python manage.py ensure_e2e_user
   ```

3. From `frontend/`:

   ```
   npx playwright test
   ```

   First run on a machine without the browser binaries cached yet also
   needs `npx playwright install chromium` once.

## What it covers

`core-flows.spec.ts` — sign in → generate a forecast (real ml_service /
XGBoost call) → run an allocation against it (real ml_service / PuLP call) →
verify the case-report hash chain reports a real verdict either way. Each
step also checks the audit trail (`generated_by`) lands correctly, since
that's naturally exercised by the same flow.

`accessibility.spec.ts` — an automated axe-core scan (`@axe-core/playwright`)
of every route, asserting zero violations. Not a substitute for a real
manual pass (axe catches roughly a third of real accessibility issues,
nothing about screen-reader usability or focus order), but it's cheap and
catches real regressions — see docs/architecture.md's "Frontend
quality-of-life features" for what a first pass with this exact tool found
and fixed (color contrast, an empty table header, a non-keyboard-reachable
scrollable table, a heading-level skip).

## Why this isn't wired into `npm test`

`npm test` (Vitest) runs in CI/any machine with no setup. This suite needs
four live processes and a seeded user, so it's a separate, deliberate step —
see `scripts/dev-up.sh` and this file, not a hook that silently expects a
stack to already be running.
