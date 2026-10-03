import { useMemo } from "react";
import L from "leaflet";
import type { GeoJsonObject } from "geojson";
import { GeoJSON, MapContainer, TileLayer, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";

import type { County } from "../api/client";
import { RISK_MAP_CLASS } from "../lib/chartClasses";
import { COVERAGE_COLORS, COVERAGE_LABEL, type CoverageStatus } from "../lib/coverage";
import { useTheme } from "../lib/theme";

interface CoverageMapProps {
  counties: County[];
  status: Map<number, CoverageStatus>;
  /** Tooltip detail per county, e.g. "2 facilities · last report 12 Sep". */
  detail: (county: County) => string;
}

/** Counties shaded by whether anyone can report cases from them: a facility
 * that's reported recently, one that's gone quiet, or none at all. (Facility
 * locations on file are placeholders, so this maps counties, not points.) */
export default function CoverageMap({ counties, status, detail }: CoverageMapProps) {
  const { theme } = useTheme();
  const withBoundary = useMemo(() => counties.filter((c) => c.boundary), [counties]);
  const bounds = useMemo(() => {
    if (withBoundary.length === 0) return null;
    const b = L.geoJSON(withBoundary.map((c) => c.boundary as unknown as GeoJsonObject) as never).getBounds();
    return b.isValid() ? b : null;
  }, [withBoundary]);

  if (!bounds) return null;
  const outline = theme === "dark" ? "#16212c" : "#ffffff";

  return (
    <div className="relative">
      <MapContainer bounds={bounds} boundsOptions={{ padding: [24, 24] }} scrollWheelZoom={false} className={RISK_MAP_CLASS}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {withBoundary.map((county) => {
          const s = status.get(county.id) ?? "none";
          const base = {
            color: outline,
            weight: 1.5,
            fillColor: COVERAGE_COLORS[s],
            fillOpacity: s === "none" ? 0.35 : 0.75,
            dashArray: s === "none" ? "4 4" : undefined,
          };
          return (
            <GeoJSON
              key={`${county.id}-${s}-${theme}`}
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
                {COVERAGE_LABEL[s]} · {detail(county)}
              </Tooltip>
            </GeoJSON>
          );
        })}
      </MapContainer>
      <div className="absolute bottom-3 left-3 z-400 flex flex-col gap-1.5 rounded-lg border border-border bg-panel/90 px-3 py-2.5 text-xs text-text-secondary shadow-[var(--shadow)] backdrop-blur-sm">
        <span className="font-semibold text-text">Can report cases?</span>
        {(Object.keys(COVERAGE_COLORS) as CoverageStatus[]).map((s) => (
          <span key={s} className="flex items-center gap-2">
            <span className="size-2.5 rounded-[3px]" style={{ background: COVERAGE_COLORS[s], opacity: s === "none" ? 0.6 : 1 }} />
            {COVERAGE_LABEL[s]}
          </span>
        ))}
      </div>
    </div>
  );
}
