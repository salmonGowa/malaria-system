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
    <div
      className="sticky top-0 z-31 flex items-center gap-2 py-2 px-5 bg-risk-mid-soft border-b border-risk-mid text-text text-[0.8125rem]"
      role="status"
    >
      <AlertIcon size={14} />
      <span>{t("offline.banner")}</span>
    </div>
  );
}
