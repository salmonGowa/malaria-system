/** County reporting-coverage status, shared by the Facilities page and its
 * (lazy-loaded) CoverageMap — kept out of the map module so importing the
 * colours doesn't pull Leaflet into the page's own bundle. */
export type CoverageStatus = "active" | "quiet" | "none";

export const COVERAGE_COLORS: Record<CoverageStatus, string> = {
  active: "#2fae8f",
  quiet: "#e0a83b",
  none: "#8a97a3",
};

export const COVERAGE_LABEL: Record<CoverageStatus, string> = {
  active: "Reporting",
  quiet: "Gone quiet",
  none: "No facility",
};
