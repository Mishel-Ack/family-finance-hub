import { describe, expect, it } from "vitest";
import { isThemePreference, resolvesToDarkTheme } from "@/lib/theme-preference";

describe("theme preference", () => {
  it("accepts only supported persisted preferences", () => {
    expect(isThemePreference("light")).toBe(true);
    expect(isThemePreference("dark")).toBe(true);
    expect(isThemePreference("system")).toBe(true);
    expect(isThemePreference("automatic")).toBe(false);
    expect(isThemePreference(null)).toBe(false);
  });

  it("resolves explicit and system color preferences", () => {
    expect(resolvesToDarkTheme("dark", false)).toBe(true);
    expect(resolvesToDarkTheme("light", true)).toBe(false);
    expect(resolvesToDarkTheme("system", true)).toBe(true);
    expect(resolvesToDarkTheme("system", false)).toBe(false);
  });
});
