import { AlertIcon } from "./icons";
import { useLanguage } from "../lib/i18n";
import { useOnlineStatus } from "../lib/useOnlineStatus";

/** Shown app-wide whenever the browser reports no network connection. Pages
 * you've already visited keep rendering (the service worker's cached shell
 * + last-fetched API responses — see vite.config.ts's runtimeCaching), but
 * that data can be stale and nothing can be submitted, so this says so
 * explicitly rather than letting cached numbers pass as live. */
export default function OfflineBanner() {
  const online = useOnlineStatus();
  const { t } = useLanguage();
  if (online) return null;

  return (
    <div className="offline-banner" role="status">
      <AlertIcon size={14} />
      <span>{t("offline.banner")}</span>
    </div>
  );
}
