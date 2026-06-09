"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: ResolvedTheme;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  setTheme: () => {},
  resolvedTheme: "light",
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");

  useEffect(() => {
    const saved = localStorage.getItem("theme") as Theme | null;
    if (saved === "dark" || saved === "light" || saved === "system") {
      setThemeState(saved);
    }
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");

    const apply = (t: Theme) => {
      const resolved: ResolvedTheme =
        t === "dark" ? "dark" : t === "light" ? "light" : mq.matches ? "dark" : "light";
      setResolvedTheme(resolved);
      document.documentElement.classList.toggle("dark", resolved === "dark");
    };

    apply(theme);

    const listener = () => { if (theme === "system") apply("system"); };
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, [theme]);

  const setTheme = (t: Theme) => {
    localStorage.setItem("theme", t);
    setThemeState(t);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
