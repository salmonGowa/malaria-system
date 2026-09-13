import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";

import en, { TranslationKey } from "./en";
import sw from "./sw";

export type { TranslationKey };

/** i18n scaffold + a first-pass Swahili translation (Objective 5's UAT
 * instrument and the proposal's Kenya deployment context both assume a
 * non-English-only audience). Deliberately scoped to the navigation,
 * chrome (buttons, banners), page headings, and shared table/KPI labels —
 * the strings every user sees on every page — NOT the longer explanatory
 * paragraphs, field hints, or error messages throughout the app, which
 * would be a much larger translation effort and are lower priority than
 * making the primary navigation and actions usable in Swahili first. See
 * lib/i18n/sw.ts's own docstring for the translation's provenance and
 * limits.
 *
 * A plain key->string lookup (not a library like react-i18next) — the
 * vocabulary here is small enough that a library would add a dependency
 * without adding capability this doesn't already have (interpolation via
 * {{var}}, persisted preference, live switching). */
export type Language = "en" | "sw";

const DICTIONARIES: Record<Language, Record<TranslationKey, string>> = { en, sw };
const STORAGE_KEY = "malaria-dashboard-language";

function isLanguage(value: string | null): value is Language {
  return value === "en" || value === "sw";
}

function getInitialLanguage(): Language {
  if (typeof window === "undefined") return "en";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isLanguage(stored)) return stored;
  } catch {
    /* localStorage unavailable (private mode, etc.) */
  }
  return "en";
}

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(getInitialLanguage);

  useEffect(() => {
    document.documentElement.setAttribute("lang", language);
    try {
      window.localStorage.setItem(STORAGE_KEY, language);
    } catch {
      /* ignore persistence failures */
    }
  }, [language]);

  const setLanguage = (lang: Language) => setLanguageState(lang);

  const t = useMemo(() => {
    const dict = DICTIONARIES[language];
    return (key: TranslationKey, vars?: Record<string, string | number>) => {
      let value = dict[key] ?? en[key] ?? key;
      if (vars) {
        for (const [name, v] of Object.entries(vars)) {
          value = value.replace(`{{${name}}}`, String(v));
        }
      }
      return value;
    };
  }, [language]);

  return <LanguageContext.Provider value={{ language, setLanguage, t }}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within a LanguageProvider");
  return ctx;
}
