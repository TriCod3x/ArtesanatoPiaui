"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "theme";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  /** Alterna direto entre claro e escuro. */
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  setTheme: () => {},
  toggleTheme: () => {},
});

/**
 * Tema inicial: a preferência manual salva no localStorage tem prioridade.
 * Se o usuário nunca escolheu, usa `prefers-color-scheme` só como padrão da
 * primeira visita.
 */
function readInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === "dark" || saved === "light") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Sempre começa em "light" — igual ao servidor (que não tem acesso a
  // localStorage/matchMedia) — pra primeira renderização do cliente bater
  // com o HTML hidratado. Ler o tema real (localStorage ou prefers-color-scheme)
  // só acontece depois de montar, no useEffect abaixo; se isso rodasse aqui
  // dentro do useState (como antes), o cliente já renderizaria com o tema do
  // SO logo na hidratação — diferente do "light" do servidor sempre que o SO
  // estiver em dark mode, causando o erro #418.
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    // Sincroniza com localStorage/matchMedia (estado externo ao React) só
    // depois de montar — é o próprio propósito do efeito, não um anti-padrão.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThemeState(readInitialTheme());
  }, []);

  // Aplica a classe no <html>.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  // Enquanto o usuário não escolheu manualmente, acompanha o sistema ao vivo.
  // Depois do primeiro clique (localStorage preenchido) não alterna mais sozinho.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => {
      if (!window.localStorage.getItem(STORAGE_KEY)) {
        setThemeState(mq.matches ? "dark" : "light");
      }
    };
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, []);

  const setTheme = (t: Theme) => {
    window.localStorage.setItem(STORAGE_KEY, t);
    setThemeState(t);
  };

  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
