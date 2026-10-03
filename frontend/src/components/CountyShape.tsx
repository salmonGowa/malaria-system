import type { GeoJsonGeometry } from "../api/client";

type Ring = number[][];

/** Outer/inner rings of a Polygon or MultiPolygon, as [lon, lat] pairs. */
function ringsOf(geometry: GeoJsonGeometry): Ring[] {
  const g = geometry as { type: string; coordinates: unknown };
  if (g.type === "Polygon") return g.coordinates as Ring[];
  if (g.type === "MultiPolygon") return (g.coordinates as Ring[][]).flat();
  return [];
}

/** A county's outline as an inline SVG — no map library, so it's instant
 * and sits in a page header. Equirectangular projection with the longitude
 * scaled by cos(latitude), which is accurate at Kenya's scale. */
export default function CountyShape({
  geometry,
  fill,
  size = 120,
  label,
}: {
  geometry: GeoJsonGeometry;
  fill: string;
  size?: number;
  label: string;
}) {
  const rings = ringsOf(geometry);
  const pts = rings.flat();
  if (pts.length === 0) return null;
  const lons = pts.map((p) => p[0]);
  const lats = pts.map((p) => p[1]);
  const [minLon, maxLon, minLat, maxLat] = [Math.min(...lons), Math.max(...lons), Math.min(...lats), Math.max(...lats)];
  const k = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const w = (maxLon - minLon) * k || 1;
  const h = maxLat - minLat || 1;
  const scale = (size - 8) / Math.max(w, h);
  const ox = (size - w * scale) / 2;
  const oy = (size - h * scale) / 2;
  const d = rings
    .map(
      (ring) =>
        ring
          .map(([lon, lat], i) => `${i ? "L" : "M"}${(ox + (lon - minLon) * k * scale).toFixed(1)},${(oy + (maxLat - lat) * scale).toFixed(1)}`)
          .join("") + "Z",
    )
    .join("");

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
      <path d={d} fill={fill} fillOpacity={0.22} stroke={fill} strokeWidth={1.5} strokeLinejoin="round" fillRule="evenodd" />
    </svg>
  );
}
