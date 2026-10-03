import { useMemo } from "react";
import L from "leaflet";
import type { GeoJsonObject } from "geojson";
import { GeoJSON, MapContainer, TileLayer, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";

import type { County } from "../api/client";
import { RISK_MAP_CLASS } from "../lib/chartClasses";
import { riskBand } from "../lib/format";
import { PLACEHOLDER_NOTE_CLASS } from "../lib/noteClasses";
import { useTheme } from "../lib/theme";
import { useThresholds } from "../lib/useThresholds";

const RISK_COLORS: Record<"high" | "mid" | "low", string> = {
  high: "#d9534f",
  mid: "#e0a83b",
  low: "#2fae8f",
};
const NO_DATA_COLOR = "#8a97a3";

interface RiskMapProps {
  counties: County[];
  riskByCountyId: Record<number, number | undefined>;
}

export default function RiskMap({ counties, riskByCountyId }: RiskMapProps) {
  const thresholds = useThresholds();
  const { theme } = useTheme();
  const withBoundary = useMemo(() => counties.filter((c) => c.boundary), [counties]);

  // Frame the modeled counties rather than a fixed view of half of East
  // Africa — they're two clusters (lake region + coast), small at zoom 6.
  const bounds = useMemo(() => {
    if (withBoundary.length === 0) return null;
    const b = L.geoJSON(withBoundary.map((c) => c.boundary as unknown as GeoJsonObject) as never).getBounds();
    return b.isValid() ? b : null;
  }, [withBoundary]);

  if (withBoundary.length === 0) {
    return (
      <p className={PLACEHOLDER_NOTE_CLASS}>
        No county boundary geometry in the database yet — this map renders once
        counties have a boundary polygon set (see County.boundary in the model, or
        add one via /admin).
      </p>
    );
  }

  // SVG presentation attributes can't resolve CSS vars, so the outline
  // color is picked per theme here: it should read as a gap between
  // neighbouring counties, i.e. match the panel behind the map.
  const outline = theme === "dark" ? "#16212c" : "#ffffff";

  const legend: [string, string][] = [
    [RISK_COLORS.high, `High · ≥ ${thresholds.riskHigh.toFixed(2)}`],
    [RISK_COLORS.mid, `Moderate · ≥ ${thresholds.riskMid.toFixed(2)}`],
    [RISK_COLORS.low, "Low"],
    [NO_DATA_COLOR, "No forecast"],
  ];

  return (
    <div className="relative">
      <MapContainer
        {...(bounds ? { bounds, boundsOptions: { padding: [28, 28] } } : { center: [0.3, 36.5], zoom: 6 })}
        scrollWheelZoom={false}
        className={RISK_MAP_CLASS}
      >
        {/* Plain OSM tiles (no API key needed) with a CSS dark-mode filter applied
            via .leaflet-tile-pane in index.css — hosted dark tile providers
            (CartoDB included) now gate their basemaps behind an account/API key. */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {withBoundary.map((county) => {
          const risk = riskByCountyId[county.id];
          const color = risk === undefined ? NO_DATA_COLOR : RISK_COLORS[riskBand(risk, thresholds)];
          const base = { color: outline, weight: 1.5, fillColor: color, fillOpacity: 0.72 };
          return (
            <GeoJSON
              key={`${county.id}-${risk ?? "none"}-${theme}`}
              data={county.boundary as unknown as GeoJsonObject}
              style={base}
              eventHandlers={{
                mouseover: (e) => (e.target as L.Path).setStyle({ weight: 3, fillOpacity: 0.9 }),
                mouseout: (e) => (e.target as L.Path).setStyle(base),
              }}
            >
              <Tooltip sticky>
                <strong>{county.name}</strong>
                <br />
                Risk: {risk !== undefined ? risk.toFixed(2) : "no forecast yet"}
                <br />
                Population: {county.population?.toLocaleString() ?? "—"}
              </Tooltip>
            </GeoJSON>
          );
        })}
      </MapContainer>
      <div
        className={
          "absolute bottom-3 left-3 z-400 flex flex-col gap-1.5 rounded-lg border border-border bg-panel/90 " +
          "px-3 py-2.5 text-xs text-text-secondary shadow-[var(--shadow)] backdrop-blur-sm"
        }
      >
        <span className="font-semibold text-text">Outbreak risk</span>
        {legend.map(([c, label]) => (
          <span key={label} className="flex items-center gap-2">
            <span className="size-2.5 rounded-[3px]" style={{ background: c }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
