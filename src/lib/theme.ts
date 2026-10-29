/** The look each person chose in Settings. Light ("Ivoire") is the default; "Hangar Night" is the dark option. */
export const THEME_COOKIE = "theme";
export const THEMES = ["dark", "light", "system"] as const;
export type Theme = (typeof THEMES)[number];

export const parseTheme = (value: string | undefined): Theme =>
  (THEMES as readonly string[]).includes(value ?? "") ? (value as Theme) : "light";
