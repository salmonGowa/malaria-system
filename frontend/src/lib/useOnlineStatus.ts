import { useEffect, useState } from "react";

/** Tracks navigator.onLine, live. Used to show an explicit "you're offline,
 * this is last-fetched data" banner (see components/OfflineBanner.tsx) —
 * the PWA runtime cache (vite.config.ts) lets pages still render when
 * offline, but silently doing that with no indicator would misrepresent
 * cached numbers as live, which this project avoids everywhere else
 * (synthetic data labeling, forecast staleness, chain tamper detection). */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return online;
}
