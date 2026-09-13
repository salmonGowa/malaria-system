/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // autoUpdate: a new deploy replaces the cached shell in the background
      // and takes effect on the next full load — no "reload to update"
      // prompt to build, matching this project's other quick-win-scoped
      // features rather than a fuller update-flow UI.
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "apple-touch-icon.png"],
      manifest: {
        name: "Malaria Tracking & Forecasting Dashboard",
        short_name: "Malaria System",
        description: "AI-powered malaria case tracking, outbreak forecasting, and vaccine allocation for Kenya.",
        theme_color: "#0b1119",
        background_color: "#0b1119",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Precache the built app shell (JS/CSS/HTML — see App.tsx's own
        // route-level code splitting, so this stays small chunk by chunk)
        // plus a runtime cache for real backend/ml_service GET responses,
        // so a page already visited while online still renders — with its
        // last-fetched data, clearly not live — when the connection drops.
        // Never caches writes: NetworkOnly is workbox's default for
        // anything not matched below, and none of these patterns match a
        // POST/PATCH (generate forecast, submit report, run allocation).
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        runtimeCaching: [
          {
            urlPattern: ({ url, request }) => url.pathname.startsWith("/api/") && request.method === "GET",
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }) => url.hostname.includes("fonts.googleapis.com") || url.hostname.includes("fonts.gstatic.com"),
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
      devOptions: {
        // Registers a service worker under `vite dev` too, so
        // navigator.serviceWorker / the offline banner (see
        // components/OfflineBanner.tsx) are reachable in the day-to-day
        // dev workflow (scripts/dev-up.sh) without a separate build step.
        // Real, full offline coverage (precached shell + cached API data
        // still rendering after a reload with no network) only holds for a
        // production build (`npm run build && npx vite preview`) —
        // verified there, not here: Vite dev serves the module graph
        // on-demand per request rather than as a precacheable bundle, so
        // the dev-mode worker can register and pass through requests but
        // doesn't give a full offline reload the way `generateSW`'s
        // build-time precache manifest does.
        enabled: true,
        type: "module",
      },
    }),
  ],
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        // Split large, rarely-changing vendor libraries into their own
        // chunks: they cache independently of app code (most deploys don't
        // touch React itself) and keep any single chunk under the 500KB
        // warning threshold alongside the per-route splitting in App.tsx.
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-recharts": ["recharts"],
        },
      },
    },
  },
  test: {
    // Vitest, not Jest — same describe/it/expect API (the proposal's 3.4
    // names Jest generically for "frontend testing"; Vitest is that same
    // API with zero-config Vite/TS/ESM support, which Jest itself doesn't
    // have without extra transform config). See src/setupTests.ts.
    environment: "jsdom",
    setupFiles: ["./src/setupTests.ts"],
    globals: true,
    css: false,
    // frontend/e2e/ is a separate Playwright suite (real backend/ml_service/
    // db, run via `npm run test:e2e` — see e2e/README.md), not a Vitest
    // spec; without this exclusion Vitest's default *.spec.ts matching
    // picks it up and fails trying to run Playwright's test() as its own.
    exclude: ["node_modules/**", "e2e/**"],
  },
});
