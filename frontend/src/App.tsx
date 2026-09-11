import { NavLink, Route, Routes } from "react-router-dom";

import Allocations from "./pages/Allocations";
import CaseReports from "./pages/CaseReports";
import Dashboard from "./pages/Dashboard";
import Forecasts from "./pages/Forecasts";

export default function App() {
  return (
    <div className="app-shell">
      <nav className="sidebar">
        <h1>Malaria System</h1>
        <NavLink to="/" end>
          Overview
        </NavLink>
        <NavLink to="/case-reports">Case Reports</NavLink>
        <NavLink to="/forecasts">Forecasts</NavLink>
        <NavLink to="/allocations">Vaccine Allocation</NavLink>
      </nav>
      <main className="content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/case-reports" element={<CaseReports />} />
          <Route path="/forecasts" element={<Forecasts />} />
          <Route path="/allocations" element={<Allocations />} />
        </Routes>
      </main>
    </div>
  );
}
