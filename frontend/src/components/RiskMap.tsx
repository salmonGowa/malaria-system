import type { GeoJsonObject } from "geojson";
import { GeoJSON, MapContainer, TileLayer, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";

import type { County } from "../api/client";
import { riskBand } from "../lib/format";
import { useThresholds } from "../lib/useThresholds";

const RISK_COLORS: Record<"high" | "mid" | "low", string> = {
  high: "#d9534f",
  mid: "#e0a83b",
  low: "#2fae8f",
};
const NO_DATA_COLOR = "#3a4b58";

interface RiskMapProps {
  counties: County[];
  riskByCountyId: Record<number, number | undefined>;
}

export default function RiskMap({ counties, riskByCountyId }: RiskMapProps) {
  const thresholds = useThresholds();
  const withBoundary = counties.filter((c) => c.boundary);

  if (withBoundary.length === 0) {
    return (
      <p className="placeholder-note">
        No county boundary geometry in the database yet — this map renders once
        counties have a boundary polygon set (see County.boundary in the model, or
        add one via /admin).
      </p>
    );
  }

  return (
    <MapContainer center={[0.3, 36.5]} zoom={6} scrollWheelZoom={false} className="risk-map">
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
        return (
          <GeoJSON
            key={`${county.id}-${risk ?? "none"}`}
            data={county.boundary as unknown as GeoJsonObject}
            style={{ color: "#0b1119", weight: 1, fillColor: color, fillOpacity: 0.75 }}
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
  );
}
