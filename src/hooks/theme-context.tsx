import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  isThemePreference,
  resolvesToDarkTheme,
  type ThemePreference,
} from "@/lib/theme-preference";

interface ThemeContextValue {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);
const storageKey = "familybudget-theme";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemePreference>("system");

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    if (isThemePreference(saved)) setTheme(saved);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      document.documentElement.classList.toggle("dark", resolvesToDarkTheme(theme, media.matches));
      document.documentElement.dataset["theme"] = theme;
      window.localStorage.setItem(storageKey, theme);
    };
    applyTheme();
    if (theme !== "system") return;
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

// The hook is intentionally exported alongside its provider as the context API.
// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}
