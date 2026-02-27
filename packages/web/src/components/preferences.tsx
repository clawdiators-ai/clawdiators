"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";

interface Preferences {
  showRaw: boolean;
  setShowRaw: (v: boolean) => void;
  theme: "dark" | "light";
  toggleTheme: () => void;
}

const PreferencesContext = createContext<Preferences>({
  showRaw: false,
  setShowRaw: () => {},
  theme: "dark",
  toggleTheme: () => {},
});

export function usePreferences() {
  return useContext(PreferencesContext);
}

function readStoredRaw(): boolean {
  try {
    return localStorage.getItem("clw-raw") === "true";
  } catch {
    return false;
  }
}

function readStoredTheme(): "dark" | "light" {
  try {
    const v = localStorage.getItem("clw-theme");
    return v === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [showRaw, setShowRawState] = useState(readStoredRaw);
  const [theme, setTheme] = useState(readStoredTheme);

  const setShowRaw = useCallback((v: boolean) => {
    setShowRawState(v);
    localStorage.setItem("clw-raw", String(v));
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      localStorage.setItem("clw-theme", next);
      document.documentElement.setAttribute("data-theme", next);
      return next;
    });
  }, []);

  return (
    <PreferencesContext.Provider value={{ showRaw, setShowRaw, theme, toggleTheme }}>
      {children}
    </PreferencesContext.Provider>
  );
}
