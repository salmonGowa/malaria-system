import { lazy, Suspense, useEffect, useState } from "react";
import { NavLink, Route, Routes, useLocation } from "react-router-dom";

// Lazy-loaded per route: each page becomes its own chunk instead of one
// 800KB+ bundle (recharts + leaflet + every page paid for on first load
// regardless of which one you actually opened). LandingPage is the one
// exception — it's what renders at "/" (see the early return below), so
// eagerly importing it avoids an extra network round-trip + loading flash
// on the most common first paint. Dashboard moved from "/" to "/dashboard"
// and is lazy like everything else now that it's no longer the entry point.
import LandingPage from "./pages/LandingPage";
const Allocations = lazy(() => import("./pages/Allocations"));
const AllocationLog = lazy(() => import("./pages/AllocationLog"));
const CaseReports = lazy(() => import("./pages/CaseReports"));
const ChainIntegrity = lazy(() => import("./pages/ChainIntegrity"));
const Counties = lazy(() => import("./pages/Counties"));
const CountyDetail = lazy(() => import("./pages/CountyDetail"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const DecisionSupport = lazy(() => import("./pages/DecisionSupport"));
const Facilities = lazy(() => import("./pages/Facilities"));
const Forecasts = lazy(() => import("./pages/Forecasts"));
const GenerateForecast = lazy(() => import("./pages/GenerateForecast"));
const RunAllocation = lazy(() => import("./pages/RunAllocation"));
const Settings = lazy(() => import("./pages/Settings"));
const Simulations = lazy(() => import("./pages/Simulations"));
const SubmitCaseReport = lazy(() => import("./pages/SubmitCaseReport"));
const UploadSimulate = lazy(() => import("./pages/UploadSimulate"));
import AuthWidget from "./components/AuthWidget";
import ErrorBoundary from "./components/ErrorBoundary";
import LanguageToggle from "./components/LanguageToggle";
import OfflineBanner from "./components/OfflineBanner";
import ThemeToggle from "./components/ThemeToggle";
import {
  AllocationIcon,
  LogIcon,
  AnalyticsIcon,
  CaseReportIcon,
  CompassIcon,
  ForecastIcon,
  HospitalIcon,
  MapPinIcon,
  MenuIcon,
  PlusIcon,
  SettingsIcon,
  ShieldCheckIcon,
  SimulationIcon,
  SparkleIcon,
  UploadIcon,
  XIcon,
} from "./components/icons";
import { TranslationKey, useLanguage } from "./lib/i18n";
import { ROUTE_LOADING_CLASS } from "./lib/noteClasses";

const NAV_LINK_BASE =
  "flex items-center gap-2.5 text-text-secondary no-underline py-2.5 px-2.5 rounded-lg text-sm font-medium " +
  "border-l-2 border-transparent transition duration-150 ease-in-out hover:bg-panel-muted hover:text-text " +
  "[&_svg]:shrink-0 [&_svg]:opacity-85";
const NAV_LINK_ACTIVE = "bg-accent-soft text-accent-text border-l-accent font-semibold [&_svg]:opacity-100";

interface NavItem {
  to: string;
  labelKey: TranslationKey;
  icon: typeof AnalyticsIcon;
  end: boolean;
}

interface NavGroup {
  labelKey: TranslationKey;
  items: NavItem[];
}

// Grouped so the sidebar reads as "view this data" / "do this thing" pairs,
// rather than one flat list of eleven items with no structure. labelKey (not
// a literal string) so this stays static/module-level — outside the
// component, where useLanguage()'s t() isn't callable — and translates at
// render time instead; see lib/i18n/index.tsx. Explicitly typed as
// NavGroup[] (not inferred/`as const`) so every item's type is the same
// union-of-fields shape ALL_NAV_ITEMS/.find() below need, rather than each
// array literal inferring its own narrow tuple type.
const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: "nav.group.overview",
    items: [
      { to: "/dashboard", labelKey: "nav.analytics", icon: AnalyticsIcon, end: false },
      { to: "/decision-support", labelKey: "nav.decisionSupport", icon: CompassIcon, end: false },
      { to: "/simulations", labelKey: "nav.simulations", icon: SimulationIcon, end: false },
      { to: "/upload-simulate", labelKey: "nav.uploadSimulate", icon: UploadIcon, end: false },
    ],
  },
  {
    labelKey: "nav.group.caseReports",
    items: [
      { to: "/case-reports", labelKey: "nav.caseReports", icon: CaseReportIcon, end: false },
      { to: "/submit-case-report", labelKey: "nav.submitReport", icon: PlusIcon, end: false },
      { to: "/chain-integrity", labelKey: "nav.chainIntegrity", icon: ShieldCheckIcon, end: false },
    ],
  },
  {
    labelKey: "nav.group.forecasting",
    items: [
      { to: "/forecasts", labelKey: "nav.forecasts", icon: ForecastIcon, end: false },
      { to: "/generate-forecast", labelKey: "nav.generateForecast", icon: SparkleIcon, end: false },
    ],
  },
  {
    labelKey: "nav.group.allocation",
    items: [
      { to: "/allocations", labelKey: "nav.vaccineAllocation", icon: AllocationIcon, end: false },
      { to: "/run-allocation", labelKey: "nav.runAllocation", icon: SparkleIcon, end: false },
      { to: "/allocation-log", labelKey: "nav.allocationLog", icon: LogIcon, end: false },
    ],
  },
  {
    labelKey: "nav.group.referenceData",
    items: [
      { to: "/counties", labelKey: "nav.counties", icon: MapPinIcon, end: false },
      { to: "/facilities", labelKey: "nav.facilities", icon: HospitalIcon, end: false },
      { to: "/settings", labelKey: "nav.settings", icon: SettingsIcon, end: false },
    ],
  },
];

const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

export default function App() {
  const { t } = useLanguage();
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();

  // Close the mobile drawer whenever the route changes.
  useEffect(() => setNavOpen(false), [location.pathname]);

  // Lock page scroll while the drawer is open.
  useEffect(() => {
    document.body.style.overflow = navOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [navOpen]);

  // The public landing page owns "/" entirely — its own nav, no sidebar or
  // topbar chrome (see pages/LandingPage.tsx). Every other path gets the
  // authenticated app shell below, with Dashboard now living at
  // "/dashboard" instead of "/".
  if (location.pathname === "/") {
    return <LandingPage />;
  }

  const activeItem = ALL_NAV_ITEMS.find((item) =>
    item.end ? location.pathname === item.to : location.pathname.startsWith(item.to),
  );

  return (
    <div className="flex min-h-screen">
      <a
        href="#main-content"
        className="absolute -top-full left-3 z-[100] bg-accent text-white py-2.5 px-4 rounded-lg font-semibold text-sm no-underline focus-visible:top-3"
      >
        {t("skipLink")}
      </a>
      <button
        type="button"
        className={[
          "hidden max-[900px]:block fixed inset-0 z-40 bg-[rgba(8,12,18,0.55)] border-none p-0 transition-opacity duration-200 ease-in-out",
          navOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        ].join(" ")}
        aria-hidden={!navOpen}
        tabIndex={-1}
        onClick={() => setNavOpen(false)}
      />

      <nav
        className={[
          "w-62 shrink-0 bg-panel border-r border-border py-5 px-3.5 flex flex-col gap-2 overflow-y-auto",
          "max-[900px]:fixed max-[900px]:inset-y-0 max-[900px]:left-0 max-[900px]:w-[min(280px,82vw)] max-[900px]:z-50",
          "max-[900px]:shadow-[var(--shadow-lg)] max-[900px]:transition-transform max-[900px]:duration-[250ms] max-[900px]:ease-[var(--ease)]",
          navOpen ? "max-[900px]:translate-x-0" : "max-[900px]:-translate-x-full",
        ].join(" ")}
        aria-label="Primary"
      >
        <div className="flex items-center gap-2.5 pt-1 px-1.5">
          <span
            className="grid place-items-center w-8 h-8 rounded-[9px] bg-accent-soft text-accent-text font-bold text-[15px] shrink-0"
            aria-hidden="true"
          >
            M
          </span>
          <div className="min-w-0">
            <h1 className="text-[0.9375rem] font-bold text-text m-0 whitespace-nowrap overflow-hidden text-ellipsis">{t("app.title")}</h1>
            <p className="mt-px mr-0 mb-0 ml-0 text-xs text-muted">{t("app.tagline")}</p>
          </div>
          <button
            type="button"
            className="hidden max-[900px]:inline-flex ml-auto bg-transparent border-none text-muted p-1.5 rounded-lg cursor-pointer hover:bg-panel-muted hover:text-text"
            onClick={() => setNavOpen(false)}
            aria-label="Close menu"
          >
            <XIcon size={18} />
          </button>
        </div>
        {NAV_GROUPS.map((group, index) => (
          <div className={index === 0 ? "mt-1.5" : "mt-4"} key={group.labelKey}>
            <p className="m-0 mb-1.5 ml-2.5 text-[0.6875rem] font-bold tracking-[0.06em] uppercase text-muted">{t(group.labelKey)}</p>
            <div className="flex flex-col gap-0.5">
              {group.items.map(({ to, labelKey, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) => `${NAV_LINK_BASE} ${isActive ? NAV_LINK_ACTIVE : ""}`}
                >
                  <Icon size={18} />
                  <span>{t(labelKey)}</span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="flex-1 min-w-0 flex flex-col">
        <OfflineBanner />
        <header className="sticky top-0 z-30 flex items-center gap-3 h-14 px-5 border-b border-border bg-[color-mix(in_srgb,var(--panel)_90%,transparent)] backdrop-blur-[8px] backdrop-saturate-[1.4]">
          <button
            type="button"
            className="hidden max-[900px]:inline-flex items-center justify-center bg-transparent border-none text-text p-1.5 -m-1.5 rounded-lg cursor-pointer hover:bg-panel-muted"
            onClick={() => setNavOpen(true)}
            aria-label="Open menu"
          >
            <MenuIcon size={20} />
          </button>
          <span className="hidden max-[900px]:block min-w-0 truncate font-semibold text-[0.9375rem]">
            {activeItem ? t(activeItem.labelKey) : t("app.title")}
          </span>
          <div className="flex-1" />
          <AuthWidget />
          <LanguageToggle />
          <ThemeToggle />
        </header>
        <main
          className="flex-1 pt-7 px-8 pb-12 max-[900px]:pt-5 max-[900px]:px-4.5 max-[900px]:pb-10 max-[480px]:pt-4 max-[480px]:px-3.5 max-[480px]:pb-9"
          id="main-content"
          tabIndex={-1}
        >
          {/* Keyed by path so navigating away from a crashed page remounts
              a fresh boundary rather than staying stuck in the error state. */}
          <ErrorBoundary key={location.pathname}>
            <Suspense fallback={<div className={ROUTE_LOADING_CLASS}>Loading…</div>}>
              <Routes>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/decision-support" element={<DecisionSupport />} />
                <Route path="/simulations" element={<Simulations />} />
                <Route path="/upload-simulate" element={<UploadSimulate />} />
                <Route path="/counties" element={<Counties />} />
                <Route path="/counties/:id" element={<CountyDetail />} />
                <Route path="/case-reports" element={<CaseReports />} />
                <Route path="/submit-case-report" element={<SubmitCaseReport />} />
                <Route path="/forecasts" element={<Forecasts />} />
                <Route path="/generate-forecast" element={<GenerateForecast />} />
                <Route path="/allocations" element={<Allocations />} />
                <Route path="/allocation-log" element={<AllocationLog />} />
                <Route path="/run-allocation" element={<RunAllocation />} />
                <Route path="/facilities" element={<Facilities />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/chain-integrity" element={<ChainIntegrity />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
