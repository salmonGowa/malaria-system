import { lazy, Suspense, useEffect, useState } from "react";
import { NavLink, Route, Routes, useLocation } from "react-router-dom";

// Lazy-loaded per route: each page becomes its own chunk instead of one
// 800KB+ bundle (recharts + leaflet + every page paid for on first load
// regardless of which one you actually opened). Dashboard is the one
// exception — it's the landing page, so eagerly importing it avoids an
// extra network round-trip + loading flash on the most common first paint.
import Dashboard from "./pages/Dashboard";
const Allocations = lazy(() => import("./pages/Allocations"));
const CaseReports = lazy(() => import("./pages/CaseReports"));
const ChainIntegrity = lazy(() => import("./pages/ChainIntegrity"));
const Counties = lazy(() => import("./pages/Counties"));
const CountyDetail = lazy(() => import("./pages/CountyDetail"));
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
      { to: "/", labelKey: "nav.analytics", icon: AnalyticsIcon, end: true },
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

  const activeItem = ALL_NAV_ITEMS.find((item) =>
    item.end ? location.pathname === item.to : location.pathname.startsWith(item.to),
  );

  return (
    <div className={navOpen ? "app-shell nav-open" : "app-shell"}>
      <a href="#main-content" className="skip-link">
        {t("skipLink")}
      </a>
      <button
        type="button"
        className="nav-scrim"
        aria-hidden={!navOpen}
        tabIndex={-1}
        onClick={() => setNavOpen(false)}
      />

      <nav className="sidebar" aria-label="Primary">
        <div className="sidebar-brand">
          <span className="sidebar-brand-mark" aria-hidden="true">
            M
          </span>
          <div className="sidebar-brand-text">
            <h1>{t("app.title")}</h1>
            <p className="sidebar-tagline">{t("app.tagline")}</p>
          </div>
          <button type="button" className="nav-close" onClick={() => setNavOpen(false)} aria-label="Close menu">
            <XIcon size={18} />
          </button>
        </div>
        {NAV_GROUPS.map((group) => (
          <div className="sidebar-group" key={group.labelKey}>
            <p className="sidebar-group-label">{t(group.labelKey)}</p>
            <div className="sidebar-links">
              {group.items.map(({ to, labelKey, icon: Icon, end }) => (
                <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
                  <Icon size={18} />
                  <span>{t(labelKey)}</span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="app-main">
        <OfflineBanner />
        <header className="topbar">
          <button type="button" className="nav-toggle" onClick={() => setNavOpen(true)} aria-label="Open menu">
            <MenuIcon size={20} />
          </button>
          <span className="topbar-title">{activeItem ? t(activeItem.labelKey) : t("app.title")}</span>
          <div className="topbar-spacer" />
          <AuthWidget />
          <LanguageToggle />
          <ThemeToggle />
        </header>
        <main className="content" id="main-content" tabIndex={-1}>
          {/* Keyed by path so navigating away from a crashed page remounts
              a fresh boundary rather than staying stuck in the error state. */}
          <ErrorBoundary key={location.pathname}>
            <Suspense fallback={<div className="route-loading placeholder-note">Loading…</div>}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
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
