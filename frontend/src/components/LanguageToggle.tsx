import { useLanguage } from "../lib/i18n";

/** EN/SW switch — see lib/i18n/index.tsx for scope (navigation, chrome,
 * headings, shared table/KPI labels; not yet every paragraph on every
 * page). Plain text toggle rather than a flag icon: a flag implies a
 * country, and language and nationality aren't the same thing. */
export default function LanguageToggle() {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="language-toggle" role="group" aria-label="Language">
      <button
        type="button"
        className={language === "en" ? "language-toggle-option active" : "language-toggle-option"}
        onClick={() => setLanguage("en")}
        aria-pressed={language === "en"}
      >
        EN
      </button>
      <button
        type="button"
        className={language === "sw" ? "language-toggle-option active" : "language-toggle-option"}
        onClick={() => setLanguage("sw")}
        aria-pressed={language === "sw"}
      >
        SW
      </button>
    </div>
  );
}
