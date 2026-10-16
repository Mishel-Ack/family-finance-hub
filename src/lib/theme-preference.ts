export type ThemePreference = "light" | "dark" | "system";

export function isThemePreference(value: string | null): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export function resolvesToDarkTheme(theme: ThemePreference, systemPrefersDark: boolean) {
  return theme === "dark" || (theme === "system" && systemPrefersDark);
}
