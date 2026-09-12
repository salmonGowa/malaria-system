import { useEffect, useState } from "react";
import { NavLink, Route, Routes, useLocation } from "react-router-dom";

import Allocations from "./pages/Allocations";
import CaseReports from "./pages/CaseReports";
import Dashboard from "./pages/Dashboard";
import Forecasts from "./pages/Forecasts";
import GenerateForecast from "./pages/GenerateForecast";
import RunAllocation from "./pages/RunAllocation";
import Simulations from "./pages/Simulations";
import SubmitCaseReport from "./pages/SubmitCaseReport";
import AuthWidget from "./components/AuthWidget";
import ThemeToggle from "./components/ThemeToggle";
import {
  AllocationIcon,
  AnalyticsIcon,
  CaseReportIcon,
  ForecastIcon,
  MenuIcon,
  PlusIcon,
  SimulationIcon,
  SparkleIcon,
  XIcon,
} from "./components/icons";

// Grouped so the sidebar reads as "view this data" / "do this thing" pairs,
// rather than one flat list of eight items with no structure.
const NAV_GROUPS = [
  {
    label: "Overview",
    items: [
      { to: "/", label: "Analytics", icon: AnalyticsIcon, end: true },
      { to: "/simulations", label: "Simulations", icon: SimulationIcon, end: false },
    ],
  },
  {
    label: "Case reports",
    items: [
      { to: "/case-reports", label: "Case Reports", icon: CaseReportIcon, end: false },
      { to: "/submit-case-report", label: "Submit Report", icon: PlusIcon, end: false },
    ],
  },
  {
    label: "Forecasting",
    items: [
      { to: "/forecasts", label: "Forecasts", icon: ForecastIcon, end: false },
      { to: "/generate-forecast", label: "Generate Forecast", icon: SparkleIcon, end: false },
    ],
  },
  {
    label: "Allocation",
    items: [
      { to: "/allocations", label: "Vaccine Allocation", icon: AllocationIcon, end: false },
      { to: "/run-allocation", label: "Run Allocation", icon: SparkleIcon, end: false },
    ],
  },
];

const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

export default function App() {
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
            <h1>Malaria System</h1>
            <p className="sidebar-tagline">Outbreak intelligence</p>
          </div>
          <button type="button" className="nav-close" onClick={() => setNavOpen(false)} aria-label="Close menu">
            <XIcon size={18} />
          </button>
        </div>
        {NAV_GROUPS.map((group) => (
          <div className="sidebar-group" key={group.label}>
            <p className="sidebar-group-label">{group.label}</p>
            <div className="sidebar-links">
              {group.items.map(({ to, label, icon: Icon, end }) => (
                <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
                  <Icon size={18} />
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="app-main">
        <header className="topbar">
          <button type="button" className="nav-toggle" onClick={() => setNavOpen(true)} aria-label="Open menu">
            <MenuIcon size={20} />
          </button>
          <span className="topbar-title">{activeItem?.label ?? "Malaria System"}</span>
          <div className="topbar-spacer" />
          <AuthWidget />
          <ThemeToggle />
        </header>
        <main className="content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/simulations" element={<Simulations />} />
            <Route path="/case-reports" element={<CaseReports />} />
            <Route path="/submit-case-report" element={<SubmitCaseReport />} />
            <Route path="/forecasts" element={<Forecasts />} />
            <Route path="/generate-forecast" element={<GenerateForecast />} />
            <Route path="/allocations" element={<Allocations />} />
            <Route path="/run-allocation" element={<RunAllocation />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
