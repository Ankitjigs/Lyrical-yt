import { baseThemeTokens } from "./presets/base";
import midnightPreset from "./presets/midnight";

// In-memory cache to avoid re-extracting colors for the same artwork URL
const paletteCache = new Map<string, Record<string, string>>();

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

interface ColorBucket {
  hue: number;
  totalScore: number;
  avgS: number;
  avgL: number;
  count: number;
}

/**
 * Extracts dominant and accent colors from an image URL and produces
 * a full set of Lyrical CSS theme variables.
 */
export async function extractDynamicThemeTokens(
  artworkUrl: string | null | undefined
): Promise<Record<string, string> | null> {
  if (!artworkUrl || typeof artworkUrl !== "string") {
    return null;
  }

  if (paletteCache.has(artworkUrl)) {
    return paletteCache.get(artworkUrl)!;
  }

  try {
    const img = new Image();
    img.crossOrigin = "anonymous";

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => {
        // Retry once without crossOrigin or fail gracefully
        reject(new Error("Image load failed"));
      };
      img.src = artworkUrl;
    });

    const canvas = document.createElement("canvas");
    const width = 48;
    const height = 48;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;

    ctx.drawImage(img, 0, 0, width, height);
    const imgData = ctx.getImageData(0, 0, width, height).data;

    // 24 hue buckets (15 deg each)
    const buckets: ColorBucket[] = Array.from({ length: 24 }, (_, i) => ({
      hue: i * 15 + 7.5,
      totalScore: 0,
      avgS: 0,
      avgL: 0,
      count: 0,
    }));

    let totalValidPixels = 0;
    let fallbackR = 0;
    let fallbackG = 0;
    let fallbackB = 0;

    for (let i = 0; i < imgData.length; i += 4) {
      const r = imgData[i];
      const g = imgData[i + 1];
      const b = imgData[i + 2];
      const a = imgData[i + 3];

      if (a < 128) continue; // Skip transparency

      // Skip near-black / near-white letterbox bars
      const isExtreme = (r < 16 && g < 16 && b < 16) || (r > 242 && g > 242 && b > 242);
      if (isExtreme) continue;

      fallbackR += r;
      fallbackG += g;
      fallbackB += b;
      totalValidPixels++;

      const [h, s, l] = rgbToHsl(r, g, b);
      const bucketIdx = Math.floor(h / 15) % 24;
      const bucket = buckets[bucketIdx];

      // Weight saturated colors higher for better visual identity
      const weight = 1 + (s / 100) * 2;
      bucket.totalScore += weight;
      bucket.avgS += s;
      bucket.avgL += l;
      bucket.count++;
    }

    // Sort buckets by score descending
    const populated = buckets
      .filter((b) => b.count > 0)
      .map((b) => ({
        hue: b.hue,
        score: b.totalScore,
        s: Math.round(b.avgS / b.count),
        l: Math.round(b.avgL / b.count),
      }))
      .sort((a, b) => b.score - a.score);

    let domH = 220;
    let domS = 40;
    let accH = 200;
    let accS = 85;
    let accL = 62;

    if (populated.length > 0) {
      const top = populated[0];
      domH = top.hue;
      domS = Math.min(Math.max(top.s, 25), 65);

      // Find best vibrant accent differing from dominant hue
      const vibrantCandidate = populated.find(
        (b) => Math.abs(b.hue - domH) > 35 && b.s >= 35
      );

      if (vibrantCandidate) {
        accH = vibrantCandidate.hue;
        accS = Math.min(Math.max(vibrantCandidate.s, 65), 95);
        accL = Math.min(Math.max(vibrantCandidate.l, 48), 68);
      } else {
        // Harmonious analog shift for single-tone/monochrome covers
        accH = (domH + 40) % 360;
        accS = 80;
        accL = 60;
      }
    } else if (totalValidPixels > 0) {
      // Image was almost entirely solid color
      const [h, s, l] = rgbToHsl(
        fallbackR / totalValidPixels,
        fallbackG / totalValidPixels,
        fallbackB / totalValidPixels
      );
      domH = h;
      domS = Math.max(s, 25);
      accH = (domH + 35) % 360;
      accS = 75;
      accL = 60;
    }

    // Secondary hue for lush dark gradient
    const secH = (domH + 25) % 360;
    const secS = Math.round(domS * 0.85);

    // Deep, luxurious dark background tones (7% - 13% lightness)
    const bgStart = `hsl(${domH}, ${domS}%, 11%)`;
    const bgEnd = `hsl(${secH}, ${secS}%, 6%)`;
    const accentHex = hslToHex(accH, accS, accL);

    const tokens: Record<string, string> = {
      ...baseThemeTokens,
      "--lyrical-panel-bg": `linear-gradient(145deg, ${bgStart} 0%, ${bgEnd} 100%)`,
      "--lyrical-card-bg": `hsla(${domH}, ${Math.round(domS * 0.4)}%, 14%, 0.88)`,
      "--lyrical-card-bg-elevated": `hsla(${domH}, ${Math.round(domS * 0.5)}%, 19%, 0.95)`,
      "--lyrical-panel-surface": "rgba(0, 0, 0, 0.4)",
      "--lyrical-panel-surface-soft": "rgba(255, 255, 255, 0.06)",
      "--lyrical-panel-surface-strong": "rgba(255, 255, 255, 0.12)",
      "--lyrical-panel-hover": "rgba(255, 255, 255, 0.1)",
      "--lyrical-border": "rgba(255, 255, 255, 0.11)",
      "--lyrical-border-soft": "rgba(255, 255, 255, 0.05)",
      "--lyrical-text-primary": "#ffffff",
      "--lyrical-text-secondary": "#a8b0c0",
      "--lyrical-text-muted": "#757e91",
      "--lyrical-text-contrast": bgEnd,
      "--lyrical-accent": accentHex,
      "--lyrical-accent-soft": `hsla(${accH}, ${accS}%, ${accL}%, 0.16)`,
      "--lyrical-accent-strong": `hsla(${accH}, ${accS}%, ${accL}%, 0.32)`,
      "--lyrical-accent-glow": `hsla(${accH}, ${accS}%, ${accL}%, 0.38)`,
      "--lyrical-slider-rail": "rgba(255, 255, 255, 0.18)",
      "--lyrical-slider-gradient": `linear-gradient(to right, hsla(${domH}, 70%, 45%, 0.7), ${accentHex}, hsla(${(accH + 30) % 360}, 85%, 65%, 0.95))`,
      "--lyrical-slider-thumb": accentHex,
      "--lyrical-slider-thumb-ring": `hsla(${accH}, ${accS}%, ${accL}%, 0.28)`,
      "--lyrical-slider-thumb-border": "rgba(255, 255, 255, 0.65)",
      "--lyrical-romanized": `hsla(${(accH + 45) % 360}, 75%, 72%, 0.9)`,
      "--lyrical-translated": `${accentHex}e0`,
      "--blyrics-glow-color": `hsla(${accH}, ${accS}%, ${accL}%, 0.35)`,
    };

    paletteCache.set(artworkUrl, tokens);
    return tokens;
  } catch (err) {
    console.warn("[Lyrical] Dynamic palette extraction error:", err);
    return null;
  }
}

/**
 * Returns fallback tokens (Midnight preset) when no artwork is available.
 */
export function getDynamicThemeFallback(): Record<string, string> {
  return midnightPreset.tokens;
}

/**
 * Generates the sleek Obsidian Black popup tokens with the dynamic accent color.
 * (Selected Option A1).
 */
export function getObsidianPopupTokens(dynamicAccent?: string): Record<string, string> {
  const accent = dynamicAccent || "#3ea6ff";
  return {
    ...baseThemeTokens,
    "--lyrical-popup-bg": "#0c0d12",
    "--lyrical-popup-header-bg": "rgba(255, 255, 255, 0.03)",
    "--lyrical-page-bg": "#07080a",
    "--lyrical-card-bg": "#14151b",
    "--lyrical-card-bg-elevated": "#1c1e26",
    "--lyrical-panel-surface": "rgba(0, 0, 0, 0.5)",
    "--lyrical-panel-surface-soft": "rgba(255, 255, 255, 0.05)",
    "--lyrical-panel-surface-strong": "rgba(255, 255, 255, 0.09)",
    "--lyrical-panel-hover": "rgba(255, 255, 255, 0.08)",
    "--lyrical-border": "rgba(255, 255, 255, 0.09)",
    "--lyrical-border-soft": "rgba(255, 255, 255, 0.04)",
    "--lyrical-text-primary": "#ffffff",
    "--lyrical-text-secondary": "#a0a5b5",
    "--lyrical-text-muted": "#6a7082",
    "--lyrical-accent": accent,
    "--lyrical-accent-soft": `${accent}22`,
    "--lyrical-accent-strong": `${accent}44`,
    "--lyrical-accent-glow": `${accent}40`,
    "--lyrical-slider-thumb": accent,
    "--lyrical-slider-thumb-ring": `${accent}33`,
    "--lyrical-slider-gradient": `linear-gradient(to right, #ef4444, ${accent}, #10b981)`,
    "--lyrical-danger": "#ef4444",
    "--lyrical-danger-soft": "rgba(239, 68, 68, 0.14)",
    "--lyrical-danger-border": "rgba(239, 68, 68, 0.32)",
    "--lyrical-danger-text": "#f87171",
    "--lyrical-danger-hover": "rgba(239, 68, 68, 0.24)",
  };
}
