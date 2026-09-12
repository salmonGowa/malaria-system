import { createContext, ReactNode, useContext, useEffect, useState } from "react";

import { api, setAuthToken } from "../api/client";

const STORAGE_KEY = "malaria-dashboard-auth-token";

interface AuthContextValue {
  username: string | null;
  /** True while a token restored from localStorage is being verified against
   * the backend — avoids a flash of "signed out" before that check resolves. */
  checking: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      /* private mode / storage disabled */
    }

    if (!stored) {
      setChecking(false);
      return;
    }

    setAuthToken(stored);
    api
      .me()
      .then((res) => setUsername(res.username))
      .catch(() => {
        // Stored token is stale/invalid — clear it rather than keep sending it.
        setAuthToken(null);
        try {
          window.localStorage.removeItem(STORAGE_KEY);
        } catch {
          /* ignore */
        }
      })
      .finally(() => setChecking(false));
  }, []);

  const login = async (usernameInput: string, password: string) => {
    const res = await api.login(usernameInput, password);
    setAuthToken(res.token);
    setUsername(res.username);
    try {
      window.localStorage.setItem(STORAGE_KEY, res.token);
    } catch {
      /* ignore */
    }
  };

  const logout = () => {
    setAuthToken(null);
    setUsername(null);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  };

  return <AuthContext.Provider value={{ username, checking, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
