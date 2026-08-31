import { createTheme } from "./presets/base";

const THEME_EXPORT_APP = "Lyrical";
const THEME_EXPORT_VERSION = 1;
const THEME_DRAFT_FIELDS = [
  "panelStart",
  "panelEnd",
  "accent",
  "cardBg",
  "textPrimary",
  "textSecondary",
  "romanized",
  "translated",
];

const HEX_COLOR_RE = /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i;
const RGB_COLOR_RE =
  /^rgba?\(\s*([+\-]?\d*\.?\d+)\s*,\s*([+\-]?\d*\.?\d+)\s*,\s*([+\-]?\d*\.?\d+)(?:\s*,\s*([+\-]?\d*\.?\d+)\s*)?\)$/i;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function expandHex(hex) {
  if (hex.length === 3 || hex.length === 4) {
    return hex
      .split("")
      .map((part) => part + part)
      .join("");
  }
  return hex;
}

export function parseColorString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();

  const hexMatch = trimmed.match(HEX_COLOR_RE);
  if (hexMatch) {
    const normalized = expandHex(hexMatch[1]);
    const hasAlpha = normalized.length === 8;
    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);
    const a = hasAlpha ? parseInt(normalized.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a };
  }

  const rgbMatch = trimmed.match(RGB_COLOR_RE);
  if (rgbMatch) {
    return {
      r: clamp(Number(rgbMatch[1]), 0, 255),
      g: clamp(Number(rgbMatch[2]), 0, 255),
      b: clamp(Number(rgbMatch[3]), 0, 255),
      a:
        rgbMatch[4] === undefined ? 1 : clamp(Number(rgbMatch[4]), 0, 1),
    };
  }

  return null;
}

export function isValidThemeColor(value) {
  return Boolean(parseColorString(value));
}

function toRgbaString(color, alpha = color.a) {
  return `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(
    color.b,
  )}, ${clamp(alpha, 0, 1).toFixed(3).replace(/0+$/, "").replace(/\.$/, "")})`;
}

function withAlpha(colorValue, alpha) {
  const parsed = parseColorString(colorValue);
  if (!parsed) return colorValue;
  return toRgbaString(parsed, alpha);
}

function mixColors(colorA, colorB, ratio = 0.5) {
  const parsedA = parseColorString(colorA);
  const parsedB = parseColorString(colorB);
  if (!parsedA || !parsedB) {
    return colorA;
  }

  const mixRatio = clamp(ratio, 0, 1);
  const inverseRatio = 1 - mixRatio;

  return toRgbaString({
    r: parsedA.r * inverseRatio + parsedB.r * mixRatio,
    g: parsedA.g * inverseRatio + parsedB.g * mixRatio,
    b: parsedA.b * inverseRatio + parsedB.b * mixRatio,
    a: parsedA.a * inverseRatio + parsedB.a * mixRatio,
  });
}

function getRelativeLuminance(colorValue) {
  const parsed = parseColorString(colorValue);
  if (!parsed) return 0;

  const transform = (channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };

  return (
    0.2126 * transform(parsed.r) +
    0.7152 * transform(parsed.g) +
    0.0722 * transform(parsed.b)
  );
}

function getContrastInk(colorValue) {
  return getRelativeLuminance(colorValue) > 0.58 ? "#121212" : "#f8fafc";
}

export function extractGradientEndpoints(gradientValue) {
  if (typeof gradientValue !== "string") return null;
  const matches = gradientValue.match(/(#[\da-f]{3,8}|rgba?\([^)]+\))/gi);
  if (!matches || matches.length < 2) return null;
  return { start: matches[0], end: matches[1] };
}

export function getCustomThemeInitialDraft(theme) {
  if (theme?.draft) {
    return {
      ...theme.draft,
      name: theme.name || theme.draft.name || "",
    };
  }

  const endpoints = extractGradientEndpoints(theme?.tokens?.["--lyrical-panel-bg"]);

  return {
    name: theme?.isCustom ? theme.name : "",
    panelStart: endpoints?.start || "#1a1a2e",
    panelEnd: endpoints?.end || "#16213e",
    accent: theme?.tokens?.["--lyrical-accent"] || "#3ea6ff",
    cardBg: theme?.tokens?.["--lyrical-card-bg"] || "#18181b",
    textPrimary: theme?.tokens?.["--lyrical-text-primary"] || "#ffffff",
    textSecondary: theme?.tokens?.["--lyrical-text-secondary"] || "#a1a1aa",
    romanized:
      theme?.tokens?.["--lyrical-romanized"] || "rgba(187, 134, 252, 0.8)",
    translated:
      theme?.tokens?.["--lyrical-translated"] || "rgba(62, 166, 255, 0.8)",
  };
}

function buildCustomThemeTokens(draft) {
  const panelSurfaceSoft = withAlpha(draft.textPrimary, 0.055);
  const panelSurfaceStrong = withAlpha(draft.textPrimary, 0.11);
  const cardElevated = mixColors(draft.cardBg, draft.textPrimary, 0.08);
  const accentSoft = withAlpha(draft.accent, 0.12);
  const accentStrong = withAlpha(draft.accent, 0.24);
  const accentGlow = withAlpha(draft.accent, 0.28);
  const border = withAlpha(draft.textPrimary, 0.14);
  const borderSoft = withAlpha(draft.textPrimary, 0.07);
  const textMuted = withAlpha(draft.textSecondary, 0.78);
  const textSubtle = withAlpha(draft.textSecondary, 0.58);

  return {
    "--lyrical-popup-bg": mixColors(draft.cardBg, draft.panelStart, 0.2),
    "--lyrical-popup-header-bg": withAlpha(draft.textPrimary, 0.03),
    "--lyrical-page-bg": mixColors(draft.cardBg, draft.panelEnd, 0.15),
    "--lyrical-panel-bg": `linear-gradient(135deg, ${draft.panelStart} 0%, ${draft.panelEnd} 100%)`,
    "--lyrical-card-bg": draft.cardBg,
    "--lyrical-card-bg-elevated": cardElevated,
    "--lyrical-panel-surface": withAlpha("#000000", 0.28),
    "--lyrical-panel-surface-soft": panelSurfaceSoft,
    "--lyrical-panel-surface-strong": panelSurfaceStrong,
    "--lyrical-panel-hover": withAlpha(draft.accent, 0.18),
    "--lyrical-border": border,
    "--lyrical-border-soft": borderSoft,
    "--lyrical-text-primary": draft.textPrimary,
    "--lyrical-text-secondary": draft.textSecondary,
    "--lyrical-text-muted": textMuted,
    "--lyrical-text-subtle": textSubtle,
    "--lyrical-text-contrast": getContrastInk(draft.accent),
    "--lyrical-accent": draft.accent,
    "--lyrical-accent-soft": accentSoft,
    "--lyrical-accent-strong": accentStrong,
    "--lyrical-accent-glow": accentGlow,
    "--lyrical-romanized": draft.romanized,
    "--lyrical-translated": draft.translated,
    "--lyrical-album-fallback": mixColors(draft.panelStart, draft.panelEnd, 0.5),
    "--lyrical-slider-rail": withAlpha(draft.textPrimary, 0.22),
    "--lyrical-slider-gradient": `linear-gradient(to right, ${draft.romanized}, ${draft.accent}, ${draft.translated})`,
    "--lyrical-slider-thumb": draft.accent,
    "--lyrical-slider-thumb-ring": withAlpha(draft.accent, 0.28),
    "--lyrical-slider-thumb-border": withAlpha(draft.textPrimary, 0.64),
    "--lyrical-scrollbar-track": withAlpha("#000000", 0.12),
    "--lyrical-scrollbar-thumb": withAlpha(draft.textPrimary, 0.2),
    "--lyrical-scrollbar-thumb-hover": withAlpha(draft.textPrimary, 0.32),
    "--lyrical-line-active-glow": withAlpha(draft.accent, 0.22),
    "--lyrical-word-inactive": withAlpha(draft.textPrimary, 0.42),
    "--lyrical-tag-word": draft.accent,
    "--lyrical-tag-line": draft.translated,
    "--lyrical-tag-syllable": draft.romanized,
    "--blyrics-lyric-active-color": draft.textPrimary,
    "--blyrics-glow-color": withAlpha(draft.accent, 0.4),
  };
}

export function createStoredCustomThemeFromDraft(draft) {
  const timestamp = Date.now();
  const safeName = draft.name.trim();
  const slug = safeName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  return {
    id: `custom-${slug || "theme"}-${timestamp}`,
    name: safeName,
    author: "You",
    description: "Custom style created in Lyrical.",
    isCustom: true,
    createdAt: timestamp,
    draft: {
      panelStart: draft.panelStart,
      panelEnd: draft.panelEnd,
      accent: draft.accent,
      cardBg: draft.cardBg,
      textPrimary: draft.textPrimary,
      textSecondary: draft.textSecondary,
      romanized: draft.romanized,
      translated: draft.translated,
    },
  };
}

export function updateStoredCustomThemeFromDraft(existingTheme, draft) {
  const safeName = draft.name.trim();

  return {
    ...existingTheme,
    name: safeName,
    author: existingTheme?.author || "You",
    description: existingTheme?.description || "Custom style created in Lyrical.",
    isCustom: true,
    draft: {
      panelStart: draft.panelStart,
      panelEnd: draft.panelEnd,
      accent: draft.accent,
      cardBg: draft.cardBg,
      textPrimary: draft.textPrimary,
      textSecondary: draft.textSecondary,
      romanized: draft.romanized,
      translated: draft.translated,
    },
  };
}

export function hydrateCustomTheme(customTheme) {
  if (!customTheme || typeof customTheme !== "object") return null;

  if (customTheme.draft) {
    return createTheme({
      ...customTheme,
      tokens: buildCustomThemeTokens({
        ...customTheme.draft,
        name: customTheme.name,
      }),
    });
  }

  if (customTheme.tokens) {
    return createTheme(customTheme);
  }

  return null;
}

export function resolveCustomThemes(customThemes = []) {
  return (Array.isArray(customThemes) ? customThemes : [])
    .map((theme) => hydrateCustomTheme(theme))
    .filter(Boolean);
}

export function createCustomThemeFromDraft(draft) {
  return hydrateCustomTheme(createStoredCustomThemeFromDraft(draft));
}

function normalizeImportedDraft(rawDraft, fallbackName = "") {
  if (!rawDraft || typeof rawDraft !== "object") {
    throw new Error("Theme file is missing editable color values.");
  }

  const name =
    typeof rawDraft.name === "string" && rawDraft.name.trim()
      ? rawDraft.name.trim()
      : fallbackName.trim();

  if (!name) {
    throw new Error("Theme file is missing a theme name.");
  }

  const draft = { name };

  for (const field of THEME_DRAFT_FIELDS) {
    const value = rawDraft[field];
    if (typeof value !== "string" || !isValidThemeColor(value)) {
      throw new Error("Theme file contains an invalid color value.");
    }
    draft[field] = value.trim();
  }

  return draft;
}

function payloadToDrafts(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Theme file is not valid JSON.");
  }

  if (payload.app && payload.app !== THEME_EXPORT_APP) {
    throw new Error("This theme was not exported from Lyrical.");
  }

  if (payload.type === "custom-theme") {
    const theme = payload.theme || payload;
    return [
      normalizeImportedDraft(
        theme.draft || theme,
        typeof theme.name === "string" ? theme.name : "",
      ),
    ];
  }

  if (payload.type === "custom-theme-collection") {
    if (!Array.isArray(payload.themes) || payload.themes.length === 0) {
      throw new Error("Theme collection does not contain any themes.");
    }

    return payload.themes.map((theme) =>
      normalizeImportedDraft(
        theme.draft || theme,
        typeof theme.name === "string" ? theme.name : "",
      ),
    );
  }

  if (payload.draft || payload.name) {
    return [
      normalizeImportedDraft(
        payload.draft || payload,
        typeof payload.name === "string" ? payload.name : "",
      ),
    ];
  }

  throw new Error("Theme file type is not supported.");
}

function getUniqueThemeName(name, existingThemes = []) {
  const existingNames = new Set(
    existingThemes
      .map((theme) => (typeof theme?.name === "string" ? theme.name : ""))
      .filter(Boolean),
  );

  if (!existingNames.has(name)) return name;

  const importedName = `${name} (Imported)`;
  if (!existingNames.has(importedName)) return importedName;

  let index = 2;
  while (existingNames.has(`${importedName} ${index}`)) {
    index += 1;
  }
  return `${importedName} ${index}`;
}

export function createThemeExportPayload(theme) {
  if (!theme) {
    throw new Error("Select a theme to export.");
  }

  const draft = getCustomThemeInitialDraft(theme);
  return {
    app: THEME_EXPORT_APP,
    type: "custom-theme",
    version: THEME_EXPORT_VERSION,
    exportedAt: Date.now(),
    theme: {
      name: theme.name || draft.name,
      author: theme.author || "You",
      description: theme.description || "Custom style created in Lyrical.",
      draft,
    },
  };
}

export function createThemeCollectionExportPayload(themes = []) {
  return {
    app: THEME_EXPORT_APP,
    type: "custom-theme-collection",
    version: THEME_EXPORT_VERSION,
    exportedAt: Date.now(),
    themes: themes.map((theme) => createThemeExportPayload(theme).theme),
  };
}

export function parseThemeImportPayload(value, existingThemes = []) {
  let payload = value;

  if (typeof value === "string") {
    try {
      payload = JSON.parse(value);
    } catch {
      throw new Error("Theme file is not valid JSON.");
    }
  }

  const drafts = payloadToDrafts(payload);
  const namePool = [...existingThemes];

  return drafts.map((draft) => {
    const themeRecord = createStoredCustomThemeFromDraft({
      ...draft,
      name: getUniqueThemeName(draft.name, namePool),
    });
    namePool.push(themeRecord);
    return themeRecord;
  });
}
