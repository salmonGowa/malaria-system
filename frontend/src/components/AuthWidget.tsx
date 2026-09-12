import { FormEvent, useEffect, useRef, useState } from "react";

import { LogOutIcon, UserIcon } from "./icons";
import { useAuth } from "../lib/auth";

export default function AuthWidget() {
  const { username, checking, login, logout } = useAuth();
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
    return <span className="auth-widget-skeleton" aria-hidden="true" />;
  }

  if (username) {
    return (
      <div className="auth-widget">
        <span className="auth-chip">
          <UserIcon size={14} />
          {username}
        </span>
        <button type="button" className="icon-button" onClick={logout} aria-label="Sign out" title="Sign out">
          <LogOutIcon size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="auth-widget" ref={rootRef}>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen((v) => !v)}>
        <UserIcon size={14} />
        <span>Sign in</span>
      </button>
      {open && (
        <div className="popover auth-popover" role="dialog" aria-label="Sign in">
          <form onSubmit={handleSubmit}>
            <label className="field">
              <span className="field-label">Username</span>
              <input
                type="text"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                autoFocus
                autoComplete="username"
                required
              />
            </label>
            <label className="field">
              <span className="field-label">Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            {error && <p className="field-error">{error}</p>}
            <button type="submit" className="btn btn-primary btn-sm btn-block" disabled={submitting}>
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
