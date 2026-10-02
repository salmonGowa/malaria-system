import { useLanguage } from "../lib/i18n";

const OPTION_BASE =
  "appearance-none border-none bg-panel-muted text-muted font-sans text-[0.6875rem] font-bold tracking-[0.02em] " +
  "py-[5px] px-2.5 cursor-pointer transition-colors duration-150 ease-in-out hover:bg-border hover:text-text";
const OPTION_ACTIVE = "bg-accent-soft text-accent-text";

/** EN/SW switch — see lib/i18n/index.tsx for scope (navigation, chrome,
 * headings, shared table/KPI labels; not yet every paragraph on every
 * page). Plain text toggle rather than a flag icon: a flag implies a
 * country, and language and nationality aren't the same thing. */
export default function LanguageToggle() {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="inline-flex border border-border-strong rounded-lg overflow-hidden shrink-0" role="group" aria-label="Language">
      <button
        type="button"
        className={`${OPTION_BASE} ${language === "en" ? OPTION_ACTIVE : ""}`}
        onClick={() => setLanguage("en")}
        aria-pressed={language === "en"}
      >
        EN
      </button>
      <button
        type="button"
        className={`${OPTION_BASE} border-l border-border-strong ${language === "sw" ? OPTION_ACTIVE : ""}`}
        onClick={() => setLanguage("sw")}
        aria-pressed={language === "sw"}
      >
        SW
      </button>
    </div>
  );
}
