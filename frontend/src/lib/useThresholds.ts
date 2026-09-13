import { useEffect, useState } from "react";

import { DecisionThresholds, loadThresholds, subscribeToThresholds } from "./settings";

/** Live-reads the configurable Decision Support thresholds (see
 * lib/settings.ts) — a plain hook rather than a context, since unlike auth
 * (sent on every API call, must be a single source of truth) each reader
 * here just needs its own up-to-date copy, and there's no request path that
 * needs it synchronously before first render. */
export function useThresholds(): DecisionThresholds {
  const [thresholds, setThresholds] = useState(loadThresholds);

  useEffect(() => subscribeToThresholds(() => setThresholds(loadThresholds())), []);

  return thresholds;
}
