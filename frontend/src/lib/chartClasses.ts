/** Chart/map layout wrappers shared by Dashboard, CountyDetail, and the
 * Leaflet risk map. The Leaflet-generated DOM itself (`.leaflet-container`,
 * `.leaflet-tile-pane`, `.leaflet-popup-content-wrapper`, `.leaflet-tooltip`)
 * is rendered by the react-leaflet library, not our own JSX, so those class
 * names can't be swapped for Tailwind utilities — they stay as scoped CSS
 * overrides in index.css's "Charts / map" section targeting the library's
 * own classes. */
export const CHART_GRID_CLASS = "grid grid-cols-[1.3fr_1fr] gap-5 mb-5 max-[900px]:grid-cols-[1fr]";
export const RISK_MAP_CLASS = "h-[420px] w-full rounded-lg overflow-hidden";
