const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api";
const ML_BASE_URL = import.meta.env.VITE_ML_BASE_URL ?? "http://localhost:8001";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    throw new Error(`Request to ${url} failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export interface County {
  id: number;
  name: string;
  code: string;
  is_endemic_focus: boolean;
  population: number | null;
}

export interface CaseReport {
  id: number;
  county: number;
  county_name: string;
  facility: number;
  facility_name: string;
  report_date: string;
  confirmed_cases: number;
  suspected_cases: number;
  deaths: number;
  created_at: string;
  record_hash: string;
}

export interface ForecastRun {
  id: number;
  county: number;
  county_name: string;
  forecast_period_start: string;
  forecast_period_end: string;
  predicted_cases: number;
  risk_score: number;
  model_name: string;
}

export interface VaccineAllocation {
  id: number;
  county: number;
  county_name: string;
  period_start: string;
  recommended_doses: number;
  rationale: string;
}

// Django backend (source-of-truth data)
export const api = {
  listCounties: () => request<{ results: County[] }>(`${API_BASE_URL}/counties/`),
  listCaseReports: () => request<{ results: CaseReport[] }>(`${API_BASE_URL}/case-reports/`),
  listForecasts: () => request<{ results: ForecastRun[] }>(`${API_BASE_URL}/forecasts/`),
  listAllocations: () => request<{ results: VaccineAllocation[] }>(`${API_BASE_URL}/allocations/`),
};

// FastAPI ML service (on-demand forecast/allocation runs)
export const mlApi = {
  health: () => request<{ status: string }>(`${ML_BASE_URL}/health`),
};
