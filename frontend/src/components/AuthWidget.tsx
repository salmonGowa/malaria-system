import { FormEvent, useEffect, useRef, useState } from "react";

import { LogOutIcon, UserIcon } from "./icons";
import { useAuth } from "../lib/auth";
import { btnClass, iconButtonClass } from "../lib/buttonClasses";
import { FIELD_CLASS, FIELD_ERROR_CLASS, FIELD_INPUT_CLASS, FIELD_LABEL_CLASS } from "../lib/fieldClasses";
import { useLanguage } from "../lib/i18n";

export default function AuthWidget() {
  const { username, checking, login, logout } = useAuth();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [usernameInput, setUsernameInput] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(usernameInput, password);
      setOpen(false);
      setUsernameInput("");
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^Request to .*? — /, "") : "Sign in failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (checking) {
    return <span className="inline-block w-21 h-7.5 rounded-full bg-panel-muted" aria-hidden="true" />;
  }

  if (username) {
    return (
      <div className="relative flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1.5 text-[0.8125rem] font-semibold text-text-secondary bg-panel-muted border border-border py-1 px-2.5 rounded-full">
          <UserIcon size={14} />
          {username}
        </span>
        <button type="button" className={iconButtonClass()} onClick={logout} aria-label={t("common.signOut")} title={t("common.signOut")}>
          <LogOutIcon size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="relative flex items-center gap-1.5" ref={rootRef}>
      <button type="button" className={btnClass("secondary", { sm: true })} onClick={() => setOpen((v) => !v)}>
        <UserIcon size={14} />
        <span>{t("common.signIn")}</span>
      </button>
      {open && (
        <div
          className="absolute top-[calc(100%+8px)] right-0 z-50 bg-panel border border-border rounded-xl shadow-(--shadow-lg) p-4 w-60"
          role="dialog"
          aria-label={t("common.signIn")}
        >
          <form onSubmit={handleSubmit} className="flex flex-col">
            <label className={FIELD_CLASS} style={{ marginBottom: 10 }}>
              <span className={FIELD_LABEL_CLASS}>{t("common.username")}</span>
              <input
                type="text"
                className={FIELD_INPUT_CLASS}
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                autoFocus
                autoComplete="username"
                required
              />
            </label>
            <label className={FIELD_CLASS} style={{ marginBottom: 10 }}>
              <span className={FIELD_LABEL_CLASS}>{t("common.password")}</span>
              <input
                type="password"
                className={FIELD_INPUT_CLASS}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            {error && <p className={FIELD_ERROR_CLASS}>{error}</p>}
            <button type="submit" className={btnClass("primary", { sm: true, block: true })} disabled={submitting}>
              {submitting ? t("common.signingIn") : t("common.signIn")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
