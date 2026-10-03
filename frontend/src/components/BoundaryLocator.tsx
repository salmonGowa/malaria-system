import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import type { GeoJsonObject } from "geojson";
import { GeoJSON, MapContainer, TileLayer, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

import { api, BoundarySuggestion, County } from "../api/client";
import { BANNER_WARNING_CLASS, FORM_BANNER_ERROR_CLASS } from "../lib/bannerClasses";
import { btnClass } from "../lib/buttonClasses";
import { RISK_MAP_CLASS } from "../lib/chartClasses";
import { FIELD_INPUT_CLASS } from "../lib/fieldClasses";
import { useTheme } from "../lib/theme";

// Roughly Kenya, for when there's nothing to frame yet.
const KENYA_BOUNDS = L.latLngBounds([-4.9, 33.8], [5.1, 42.0]);

function FitTo({ geometry }: { geometry: GeoJsonObject | null }) {
  const map = useMap();
  useEffect(() => {
    const b = geometry ? L.geoJSON(geometry as never).getBounds() : null;
    map.fitBounds(b && b.isValid() ? b.pad(0.6) : KENYA_BOUNDS, { animate: true });
  }, [geometry, map]);
  return null;
}

interface Props {
  county: County;
  /** Other counties, drawn faintly for context. */
  others: County[];
  onSaved: (county: County) => void;
  onCancel: () => void;
}

/** "Locate on map": finds the county's official GADM boundary by name, shows
 * it in place among the existing counties, and saves it on confirmation. If
 * the name doesn't match GADM, pick the right county from the list. Shapes
 * are never hand-drawn — climate data is averaged over the exact polygon. */
export default function BoundaryLocator({ county, others, onSaved, onCancel }: Props) {
  const { theme } = useTheme();
  const [suggestion, setSuggestion] = useState<BoundarySuggestion | null>(null);
  const [lookupName, setLookupName] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .countyBoundarySuggestion(county.id, lookupName)
      .then((s) => !cancelled && setSuggestion(s))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Couldn't look up the boundary"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [county.id, lookupName]);

  const geometry = (suggestion?.geometry ?? null) as GeoJsonObject | null;
  const context = useMemo(() => others.filter((c) => c.boundary && c.id !== county.id), [others, county.id]);
  const outline = theme === "dark" ? "#16212c" : "#ffffff";

  const save = async () => {
    if (!suggestion?.gadm_name) return;
    setSaving(true);
    setError(null);
    try {
      onSaved(await api.applyCountyBoundary(county.id, suggestion.gadm_name));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the boundary");
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="relative">
        <MapContainer bounds={KENYA_BOUNDS} scrollWheelZoom={false} className={RISK_MAP_CLASS}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {context.map((c) => (
            <GeoJSON
              key={`${c.id}-${theme}`}
              data={c.boundary as unknown as GeoJsonObject}
              style={{ color: outline, weight: 1, fillColor: "#8a97a3", fillOpacity: 0.35 }}
            >
              <Tooltip sticky>{c.name}</Tooltip>
            </GeoJSON>
          ))}
          {geometry && (
            <GeoJSON
              key={`${suggestion?.gadm_name}-${theme}`}
              data={geometry}
              style={{ color: "#14a37f", weight: 3, fillColor: "#2fae8f", fillOpacity: 0.45 }}
            >
              <Tooltip sticky>
                <strong>{county.name}</strong> — official boundary ({suggestion?.gadm_name})
              </Tooltip>
            </GeoJSON>
          )}
          <FitTo geometry={geometry} />
        </MapContainer>
        {loading && (
          <div className="absolute inset-0 z-400 grid place-items-center rounded-lg bg-panel/60 text-[0.8125rem] font-semibold text-text-secondary backdrop-blur-[1px]">
            Finding {lookupName ?? county.name}…
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {error && <p className={`${FORM_BANNER_ERROR_CLASS} mb-0`}>{error}</p>}

        {suggestion && !suggestion.matched && !loading && (
          <p className={`${BANNER_WARNING_CLASS} mb-0`}>
            No official county is called "{lookupName ?? county.name}". Pick the one it corresponds to below.
          </p>
        )}

        {suggestion && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex flex-wrap items-center gap-2 text-[0.8125rem] text-text-secondary">
              <span>{suggestion.matched ? "Not the right area? Use the boundary of" : "This county is"}</span>
              <span className="w-[200px]">
                <select
                  className={FIELD_INPUT_CLASS}
                  value={suggestion.gadm_name ?? ""}
                  onChange={(e) => e.target.value && setLookupName(e.target.value)}
                >
                  {!suggestion.matched && <option value="">Choose a county…</option>}
                  {suggestion.candidates.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </span>
            </label>
            <div className="flex gap-2">
              <button type="button" className={btnClass("secondary")} onClick={onCancel}>
                Not now
              </button>
              <button type="button" className={btnClass("primary")} onClick={save} disabled={!suggestion.matched || saving || loading}>
                {saving ? "Saving…" : `Save ${county.name}'s location`}
              </button>
            </div>
          </div>
        )}
        <p className="m-0 text-xs text-muted">
          Boundaries come from GADM, the official administrative boundary dataset, so rainfall and other map data line
          up exactly. The highlighted shape is what will be saved.
        </p>
      </div>
    </div>
  );
}
