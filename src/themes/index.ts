import presetThemes from "./presets";

export const THEME_STORAGE_KEY = "themeId";
export const CUSTOM_THEMES_STORAGE_KEY = "customThemes";
export const DEFAULT_THEME_ID = "midnight";
export const PRESET_THEMES = presetThemes;
export const THEMES = PRESET_THEMES;

export function getAllThemes(customThemes = []) {
  return [...PRESET_THEMES, ...(Array.isArray(customThemes) ? customThemes : [])];
}

export function getThemeById(themeId, customThemes = []) {
  const allThemes = getAllThemes(customThemes);
  return (
    allThemes.find((theme) => theme.id === themeId) ||
    PRESET_THEMES.find((theme) => theme.id === DEFAULT_THEME_ID) ||
    PRESET_THEMES[0]
  );
}

export function getThemeCssVariables(themeId, customThemes = [], dynamicTokens = null) {
  const baseTokens = getThemeById(themeId, customThemes).tokens;
  if (themeId === "dynamic" && dynamicTokens) {
    return { ...baseTokens, ...dynamicTokens };
  }
  return baseTokens;
}

export {
  extractDynamicThemeTokens,
  getDynamicThemeFallback,
  getObsidianPopupTokens,
} from "./dynamicTheme";
