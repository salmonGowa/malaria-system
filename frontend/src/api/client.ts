const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api";
const ML_BASE_URL = import.meta.env.VITE_ML_BASE_URL ?? "http://localhost:8001";

// Token auth (see backend/cases/auth_views.py) — a plain Authorization
// header, not a cookie, so there's no CSRF dance for this cross-origin SPA.
// Set once by AuthProvider (src/lib/auth.tsx) on login/logout/startup;
// `request()` below just reads it.
let authToken: string | null = null;
export function setAuthToken(token: string | null) {
  authToken = token;
}

/** DRF validation errors come back as `{"field": ["message"]}` (or
 * `{"detail": "message"}` for framework-level errors) — pull out the first
 * human-readable message instead of showing the raw JSON blob to the user. */
function extractErrorMessage(body: string): string {
  try {
    const parsed = JSON.parse(body);
    if (typeof parsed.detail === "string") return parsed.detail;
    for (const value of Object.values(parsed)) {
      if (typeof value === "string") return value;
      if (Array.isArray(value) && typeof value[0] === "string") return value[0];
    }
  } catch {
    // Not JSON — fall through to returning the raw body below.
  }
  return body;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {};
  // A FormData body (file uploads) needs the browser to set its own
  // Content-Type with the multipart boundary — setting it ourselves (even to
  // the "right" value) breaks the boundary and the server can't parse it.
  if (!(options?.body instanceof FormData)) headers["Content-Type"] = "application/json";
  if (authToken) headers.Authorization = `Token ${authToken}`;

  const res = await fetch(url, {
    ...options,
    headers: { ...headers, ...(options?.headers as Record<string, string> | undefined) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Request to ${url} failed: ${res.status} ${res.statusText}${body ? ` — ${extractErrorMessage(body)}` : ""}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// Minimal GeoJSON typing — just enough for Leaflet's <GeoJSON> / marker props,
// not a full @types/geojson dependency.
export type GeoJsonGeometry = { type: string; coordinates: unknown } | null;

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/** Follows DRF's `next` cursor to collect every page. Fine at this app's data
 * scale (tens to low hundreds of rows); revisit if that changes. */
async function fetchAll<T>(firstPageUrl: string): Promise<T[]> {
  const all: T[] = [];
  let url: string | null = firstPageUrl;
  while (url) {
    const page: Paginated<T> = await request<Paginated<T>>(url);
    all.push(...page.results);
    url = page.next;
  }
  return all;
}

export interface County {
  id: number;
  name: string;
  code: string;
  is_endemic_focus: boolean;
  population: number | null;
  boundary: GeoJsonGeometry;
}

export interface HealthFacility {
  id: number;
  name: string;
  county: number;
  county_name: string;
  level: string;
  kmhfl_code: string;
  location: GeoJsonGeometry;
}

export interface ClimateObservation {
  id: number;
  county: number;
  observation_date: string;
  rainfall_mm: number | null;
  temperature_c: number | null;
  humidity_pct: number | null;
  source: string;
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
  reported_by: number | null;
  reported_by_username: string | null;
  supersedes: number | null;
  superseded_by_id: number | null;
  created_at: string;
  previous_hash: string;
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
  model_version: string;
  generated_at: string;
  generated_by_username: string | null;
}

export interface HistoricalCaseData {
  id: number;
  county: number;
  county_name: string;
  period_start: string;
  confirmed_cases: number;
  source: string;
}

export interface VaccineAllocation {
  id: number;
  county: number;
  county_name: string;
  period_start: string;
  period_end: string;
  recommended_doses: number;
  based_on_forecast: number | null;
  rationale: string;
  generated_at: string;
  generated_by_username: string | null;
}

export interface LoginResponse {
  token: string;
  username: string;
}

export interface MeResponse {
  username: string;
}

export interface NewCaseReport {
  county: number;
  facility: number;
  report_date: string;
  confirmed_cases: number;
  suspected_cases: number;
  deaths: number;
  supersedes?: number;
}

export interface GenerateForecastsRequest {
  county_ids?: number[];
  as_of_date?: string;
  horizon_weeks?: number;
}

export interface GenerateForecastsError {
  county_code: string;
  county_name: string;
  error: string;
}

export interface GenerateForecastsResponse {
  created: ForecastRun[];
  errors: GenerateForecastsError[];
}

export interface GenerateAllocationsRequest {
  total_available_doses: number;
  county_ids?: number[];
  period_start?: string;
  period_end?: string;
  max_share_per_county?: number;
}

export interface NewCounty {
  name: string;
  code: string;
  population?: number | null;
  is_endemic_focus?: boolean;
}

export const FACILITY_LEVELS = [
  { value: "dispensary", label: "Dispensary" },
  { value: "health_centre", label: "Health Centre" },
  { value: "community_unit", label: "Community Health Unit" },
  { value: "hospital", label: "Hospital" },
] as const;

export interface NewHealthFacility {
  name: string;
  county: number;
  level: string;
  kmhfl_code?: string;
}

export interface ChainRecordStatus {
  id: number;
  report_date: string;
  county_name: string;
  facility_name: string;
  confirmed_cases: number;
  record_hash: string;
  previous_hash: string;
  self_valid: boolean;
  link_valid: boolean;
  valid: boolean;
}

export interface ChainVerificationResult {
  valid: boolean;
  total_records: number;
  broken_at_id: number | null;
  reason: string | null;
  records: ChainRecordStatus[];
}

// Django backend (source-of-truth data)
export const api = {
  login: (username: string, password: string) =>
    request<LoginResponse>(`${API_BASE_URL}/auth/login/`, { method: "POST", body: JSON.stringify({ username, password }) }),
  me: () => request<MeResponse>(`${API_BASE_URL}/auth/me/`),

  listCounties: () => request<Paginated<County>>(`${API_BASE_URL}/counties/`),
  listAllCounties: () => fetchAll<County>(`${API_BASE_URL}/counties/`),
  getCounty: (id: number) => request<County>(`${API_BASE_URL}/counties/${id}/`),
  createCounty: (body: NewCounty) =>
    request<County>(`${API_BASE_URL}/counties/`, { method: "POST", body: JSON.stringify(body) }),
  updateCounty: (id: number, body: Partial<NewCounty>) =>
    request<County>(`${API_BASE_URL}/counties/${id}/`, { method: "PATCH", body: JSON.stringify(body) }),
  listFacilities: (page = 1) => request<Paginated<HealthFacility>>(`${API_BASE_URL}/facilities/?page=${page}`),
  listAllFacilities: (county?: number) =>
    fetchAll<HealthFacility>(`${API_BASE_URL}/facilities/${county ? `?county=${county}` : ""}`),
  createFacility: (body: NewHealthFacility) =>
    request<HealthFacility>(`${API_BASE_URL}/facilities/`, { method: "POST", body: JSON.stringify(body) }),
  updateFacility: (id: number, body: Partial<NewHealthFacility>) =>
    request<HealthFacility>(`${API_BASE_URL}/facilities/${id}/`, { method: "PATCH", body: JSON.stringify(body) }),
  listCaseReports: (page = 1, county?: number) =>
    request<Paginated<CaseReport>>(`${API_BASE_URL}/case-reports/?page=${page}${county ? `&county=${county}` : ""}`),
  listAllCaseReports: (county?: number) =>
    fetchAll<CaseReport>(`${API_BASE_URL}/case-reports/${county ? `?county=${county}` : ""}`),
  createCaseReport: (body: NewCaseReport) =>
    request<CaseReport>(`${API_BASE_URL}/case-reports/`, { method: "POST", body: JSON.stringify(body) }),
  getCaseReport: (id: number) => request<CaseReport>(`${API_BASE_URL}/case-reports/${id}/`),
  verifyChain: () => request<ChainVerificationResult>(`${API_BASE_URL}/case-reports/verify_chain/`),
  listHistoricalCaseData: (params: { county?: number; page?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.county) q.set("county", String(params.county));
    q.set("page", String(params.page ?? 1));
    return request<Paginated<HistoricalCaseData>>(`${API_BASE_URL}/historical-case-data/?${q}`);
  },
  listAllHistoricalCaseData: (county?: number) =>
    fetchAll<HistoricalCaseData>(`${API_BASE_URL}/historical-case-data/${county ? `?county=${county}` : ""}`),
  listAllClimateObservations: (source?: string, county?: number) => {
    const q = new URLSearchParams();
    if (source) q.set("source", source);
    if (county) q.set("county", String(county));
    const qs = q.toString();
    return fetchAll<ClimateObservation>(`${API_BASE_URL}/climate-observations/${qs ? `?${qs}` : ""}`);
  },
  listForecasts: (page = 1, county?: number) =>
    request<Paginated<ForecastRun>>(`${API_BASE_URL}/forecasts/?page=${page}${county ? `&county=${county}` : ""}`),
  listAllForecasts: (county?: number) =>
    fetchAll<ForecastRun>(`${API_BASE_URL}/forecasts/${county ? `?county=${county}` : ""}`),
  generateForecasts: (body: GenerateForecastsRequest) =>
    request<GenerateForecastsResponse>(`${API_BASE_URL}/forecasts/generate/`, { method: "POST", body: JSON.stringify(body) }),
  listAllocations: (page = 1, county?: number) =>
    request<Paginated<VaccineAllocation>>(`${API_BASE_URL}/allocations/?page=${page}${county ? `&county=${county}` : ""}`),
  listAllAllocations: (county?: number) =>
    fetchAll<VaccineAllocation>(`${API_BASE_URL}/allocations/${county ? `?county=${county}` : ""}`),
  generateAllocations: (body: GenerateAllocationsRequest) =>
    request<VaccineAllocation[]>(`${API_BASE_URL}/allocations/generate/`, { method: "POST", body: JSON.stringify(body) }),
};

// --- FastAPI ML service (on-demand forecast/allocation/simulation runs) ---

export interface CountyForecast {
  county_code: string;
  forecast_period_start: string;
  forecast_period_end: string;
  predicted_cases: number;
  risk_score: number;
  model_name: string;
  model_version: string;
}

export interface AllocationRequest {
  total_available_doses: number;
  county_forecasts: CountyForecast[];
  county_populations: Record<string, number>;
}

export interface AllocationLine {
  county_code: string;
  recommended_doses: number;
  rationale: string;
}

export interface AllocationResponse {
  total_available_doses: number;
  total_allocated_doses: number;
  allocations: AllocationLine[];
}

export interface SimulationRequest {
  population: number;
  initial_infectious: number;
  transmission_rate: number;
  incubation_period_days: number;
  infectious_period_days: number;
  intervention_coverage: number;
  horizon_weeks: number;
}

export interface SimulationWeek {
  week: number;
  susceptible: number;
  exposed: number;
  infectious: number;
  recovered: number;
  new_cases: number;
}

export interface SimulationResponse {
  weeks: SimulationWeek[];
  peak_week: number;
  peak_infectious: number;
  total_projected_cases: number;
  model_name: string;
  disclaimer: string;
}

export interface ModelClassificationMetrics {
  accuracy: number;
  auc: number;
  sensitivity: number;
  specificity: number;
  n: number;
  n_positive: number;
}

export interface ModelInfo {
  trained_at: string;
  model_name: string;
  feature_names: string[];
  counties: string[];
  test_months: number;
  cv_folds: number;
  cv_mean_auc: number;
  cv_mean_accuracy: number;
  held_out_test_metrics: ModelClassificationMetrics;
  held_out_test_mae_cases: number;
  climate_free_baseline_metrics: ModelClassificationMetrics;
  climate_contribution_to_auc: number;
  seir_benchmark_metrics: ModelClassificationMetrics;
  training_data_disclaimer: string;
}

export interface UploadSimulationRow {
  date: string;
  actual: number | null;
  fitted: number | null;
  predicted: number | null;
}

export interface UploadSimulationResponse {
  population: number;
  rows_used: number;
  used_rainfall: boolean;
  fitted_params: { beta0: number; k: number; reporting_fraction: number };
  fit_relative_error: number;
  series: UploadSimulationRow[];
  warnings: string[];
  disclaimer: string;
}

export const mlApi = {
  health: () => request<{ status: string }>(`${ML_BASE_URL}/health`),
  modelInfo: () => request<ModelInfo>(`${ML_BASE_URL}/model-info`),
  allocate: (body: AllocationRequest) =>
    request<AllocationResponse>(`${ML_BASE_URL}/allocate`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  simulate: (body: SimulationRequest) =>
    request<SimulationResponse>(`${ML_BASE_URL}/simulate`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  simulateUpload: (file: File, population: number, horizonMonths: number) => {
    const form = new FormData();
    form.append("file", file);
    form.append("population", String(population));
    form.append("horizon_months", String(horizonMonths));
    return request<UploadSimulationResponse>(`${ML_BASE_URL}/simulate-upload`, { method: "POST", body: form });
  },
};
