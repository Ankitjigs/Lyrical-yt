// Content script for in-page lyrics panel injection
import React from "react";
import { createRoot } from "react-dom/client";
import LyricsPanel from "./components/LyricsPanel";
import { useAppStore } from "./store";
import { log, warn, error, setDebugMode } from "./utils/logger";
import { fetchBoiduLyrics } from "../modules/sources/boidu";
import {
  fetchUnifiedSourceLyrics,
  fetchUnisonSourceLyrics,
} from "../modules/sources/unified";
import panelStyles from "./styles.css?inline";
import lyricsEffectsStyles from "./lyricsEffects.css?inline";
import shinyTextStyles from "./components/ShinyText.css?inline";
import { CUSTOM_THEMES_STORAGE_KEY, DEFAULT_THEME_ID } from "../themes";
import { resolveCustomThemes } from "../themes/customThemeUtils";

// DEBUG: Banner removed for production

const SHADOW_HOST_STYLES = `
  :host {
    all: initial;
    display: block;
    width: 100%;
    max-width: 100%;
    margin-bottom: 16px;
    font-family:
      system-ui,
      -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      sans-serif;
    color: #fff;
  }
`;

const CONTENT_SHADOW_STYLES = [
  SHADOW_HOST_STYLES,
  panelStyles,
  lyricsEffectsStyles,
  shinyTextStyles,
].join("\n");

// This script creates and manages the lyrics panel on YouTube/Spotify pages

// Sync UI state back to logic
useAppStore.subscribe((state, prevState) => {
  // Sync Offset
  if (state.userOffset !== prevState.userOffset) {
    userSongOffset = state.userOffset;
    currentSyncOffset = PLATFORM_OFFSET + userSongOffset;

    if (currentSongInfo) {
      const videoId = new URLSearchParams(window.location.search).get("v");
      const songKey = videoId
        ? `offset_${videoId}`
        : `${currentSongInfo.artist || "unknown"}__${currentSongInfo.title || "unknown"}`;
      chrome.storage.sync.get("songOffsets").then(({ songOffsets = {} }) => {
        songOffsets[songKey] = userSongOffset;
        chrome.storage.sync.set({ songOffsets });
      });
    }
  }

  // Sync Placement
  if (
    state.displayMode !== prevState.displayMode ||
    state.floatingPositionPreset !== prevState.floatingPositionPreset ||
    state.floatingCustomPosition !== prevState.floatingCustomPosition
  ) {
    applyWrapperPlacement();
  }
});

log("VERSION 2.1 - Script loaded!", window.location.href);
log("Panel Timestamp:", new Date().toISOString());

// Initialize debug state from storage
if (chrome.storage) {
  chrome.storage.sync.get(
    {
      showLogs: false,
      isRomanizationEnabled: false,
      isTranslateEnabled: false,
      translationLanguage: "en",
      compactMode: false,
      lyricsSizePreset: "standard",
      reduceAnimations: false,
      showCollapsedArtwork: true,
      displayMode: "sidebar",
      floatingPositionPreset: "right",
      floatingCustomPosition: null,
      themeId: DEFAULT_THEME_ID,
      romanizationExclusions: [],
      translationExclusions: [],
      [CUSTOM_THEMES_STORAGE_KEY]: [],
      sourcePreferences: null, // Default
    },
    (res) => {
      setDebugMode(res.showLogs); // Use logger utility
      // Sync global state
      isRomanizationEnabled = res.isRomanizationEnabled;
      isTranslateEnabled = res.isTranslateEnabled;
      currentTranslationLang = res.translationLanguage;

      const hydratedCustomThemes = resolveCustomThemes(
        res[CUSTOM_THEMES_STORAGE_KEY] || [],
      );

      // Sync to store
      const updates: any = {
        isRomanizationEnabled: res.isRomanizationEnabled,
        isTranslateEnabled: res.isTranslateEnabled,
        translationLanguage: res.translationLanguage,
        compactMode: res.compactMode,
        lyricsSizePreset: res.lyricsSizePreset || "standard",
        reduceAnimations: res.reduceAnimations,
        showCollapsedArtwork: res.showCollapsedArtwork ?? true,
        displayMode: res.displayMode || "sidebar",
        floatingPositionPreset: res.floatingPositionPreset || "right",
        floatingCustomPosition: res.floatingCustomPosition || null,
        romanizationExclusions: res.romanizationExclusions || [],
        translationExclusions: res.translationExclusions || [],
        customThemes: hydratedCustomThemes,
        themeId: res.themeId || DEFAULT_THEME_ID,
      };

      // Only set if exists, otherwise keep store default
      if (res.sourcePreferences) {
        updates.sourcePreferences = res.sourcePreferences;
      }

      useAppStore.getState().setSettings(updates);
      applyWrapperPlacement();

      log("Debug mode enabled via settings");
    },
  );
}

// 🔄 SYNC: Listen for updates from Extension Popup / Options
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace !== "sync") return;

  log("Storage changed:", changes);

  // 1. Source Preferences Change -> Re-fetch
  if (changes.sourcePreferences) {
    log("Sources changed, re-fetching...");
    useAppStore
      .getState()
      .setSourcePreferences(changes.sourcePreferences.newValue);
    useAppStore.setState({ isExpanded: true, lyricsSource: null });
    if (hasLocalStorageApi()) {
      chrome.storage.local.remove("activeLyricsSource").catch(() => {});
    }

    const oldPrefs = Array.isArray(changes.sourcePreferences.oldValue)
      ? changes.sourcePreferences.oldValue
      : [];
    const newPrefs = Array.isArray(changes.sourcePreferences.newValue)
      ? changes.sourcePreferences.newValue
      : [];
    const wasCaptionsEnabled = oldPrefs.find(
      (s) => s.id === "captions",
    )?.enabled;
    const isCaptionsEnabled = newPrefs.find(
      (s) => s.id === "captions",
    )?.enabled;

    // Determine if we need to re-fetch
    if (currentSongInfo) {
      lastFetchedVideoId = null; // Force re-fetch
      autoFetchLyrics(currentSongInfo, { reason: "source changed" });

      // If captions just got enabled, run a focused caption retry as well.
      if (!wasCaptionsEnabled && isCaptionsEnabled) {
        queueMicrotask(() => {
          waitForMainWorldCaptionSignals(3500)
            .then(() => tryDisplayCaptions())
            .catch((err) =>
              console.error(
                "[Lyrical] Captions re-enable recovery failed:",
                err,
              ),
            );
        });
      }
    }
  }

  // 2. Romanization/Translation Toggles
  if (changes.isRomanizationEnabled) {
    isRomanizationEnabled = changes.isRomanizationEnabled.newValue;
    log("Romanization toggle:", isRomanizationEnabled);
    if (fetchedLyrics.length) autoProcessLyrics();
  }

  if (changes.isTranslateEnabled) {
    isTranslateEnabled = changes.isTranslateEnabled.newValue;
    log("Translation toggle:", isTranslateEnabled);
    if (fetchedLyrics.length) autoProcessLyrics();
  }

  if (changes.translationLanguage) {
    currentTranslationLang = changes.translationLanguage.newValue;
    log("Translation Lang:", currentTranslationLang);
    // Clear cache for new language and re-process only if translation is enabled
    translatedLyrics = null;
    // Read from store (more reliable than local variable)
    const translateEnabled = useAppStore.getState().isTranslateEnabled;
    if (fetchedLyrics.length && translateEnabled) autoProcessLyrics();
  }

  // 3. Display Mode & Placement
  if (changes.displayMode) {
    useAppStore.setState({ displayMode: changes.displayMode.newValue });
    applyWrapperPlacement();
  }
  if (changes.floatingPositionPreset) {
    useAppStore.setState({
      floatingPositionPreset: changes.floatingPositionPreset.newValue,
    });
    applyWrapperPlacement();
  }
  if (changes.floatingCustomPosition) {
    useAppStore.setState({
      floatingCustomPosition: changes.floatingCustomPosition.newValue,
    });
    applyWrapperPlacement();
  }

  // 4. Debug Mode
  if (changes.showLogs) {
    setDebugMode(changes.showLogs.newValue);
  }

  // 5. Custom themes (Update BEFORE themeId so custom themes are present when themeId changes)
  if (changes[CUSTOM_THEMES_STORAGE_KEY]) {
    const hydratedCustomThemes = resolveCustomThemes(
      changes[CUSTOM_THEMES_STORAGE_KEY].newValue || [],
    );
    useAppStore.getState().setCustomThemes(hydratedCustomThemes);
  }

  // 6. Theme ID
  if (changes.themeId) {
    const nextThemeId = changes.themeId.newValue || DEFAULT_THEME_ID;
    if (
      nextThemeId.startsWith("custom-") &&
      useAppStore.getState().customThemes.length === 0
    ) {
      // Hydrate custom themes first if not present in store
      chrome.storage.sync.get([CUSTOM_THEMES_STORAGE_KEY], (res) => {
        const customThemes = resolveCustomThemes(
          res[CUSTOM_THEMES_STORAGE_KEY] || [],
        );
        useAppStore.setState({
          customThemes,
          themeId: nextThemeId,
        });
      });
    } else {
      useAppStore.getState().setThemeId(nextThemeId);
    }
  }

  // 7. Compact Mode
  if (changes.compactMode) {
    useAppStore
      .getState()
      .setCompactMode(Boolean(changes.compactMode.newValue));
  }

  // 8. Lyrics Size Preset
  if (changes.lyricsSizePreset) {
    useAppStore.setState({
      lyricsSizePreset: changes.lyricsSizePreset.newValue || "standard",
    });
  }

  // 9. Reduce Animations
  if (changes.reduceAnimations) {
    useAppStore
      .getState()
      .setReduceAnimations(Boolean(changes.reduceAnimations.newValue));
  }

  // 10. Show Collapsed Artwork
  if (changes.showCollapsedArtwork) {
    useAppStore.setState({
      showCollapsedArtwork: Boolean(changes.showCollapsedArtwork.newValue),
    });
  }
});

// Settings state
let isRomanizationEnabled = false;
let isTranslateEnabled = false;

/**
 * Detect lyrics language. If an explicit languageCode is given, use it.
 * Otherwise, sample the lyrics text for Devanagari characters → "hi".
 */
function detectLyricsLanguage(lyrics, languageCode = null) {
  if (languageCode && languageCode !== "auto") return languageCode;
  if (!lyrics || !lyrics.length) return null;
  const sample = lyrics
    .slice(0, 10)
    .map((l) => l.text || "")
    .join("");
  // Devanagari Unicode block: U+0900–U+097F
  if (/[\u0900-\u097F]/.test(sample)) return "hi";
  // Hiragana (U+3040–U+309F) + Katakana (U+30A0–U+30FF)
  if (
    /[\u3040-\u309F\u30A0-\u30FF\u3000-\u303F\u31F0-\u31FF\u4E00-\u9FFF]/.test(
      sample,
    )
  )
    return "ja";
  return languageCode || null;
}

/**
 * Language → Font configuration map.
 * Add an entry here to support a new language-specific font.
 * The font file must exist in public/assets/fonts/ and be listed in manifest.json web_accessible_resources.
 */
const LANGUAGE_FONTS = {
  hi: {
    family: "Noto Sans Devanagari",
    file: "assets/fonts/NotoSansDevanagari-Variable.ttf",
    weight: "100 900",
    stretch: "62.5% 100%",
    unicodeRange: "U+0900-097F, U+A8E0-A8FF",
  },
  ja: {
    family: "Noto Sans JP",
    file: "assets/fonts/NotoSansJP-Variable.ttf",
    weight: "100 900",
    stretch: "62.5% 100%",
    unicodeRange:
      "U+3000-303F, U+3040-30FF, U+31F0-31FF, U+4E00-9FFF, U+FF66-FF9F",
  },
};

const _injectedFonts = new Set();

/**
 * Inject @font-face for a given language (if configured in LANGUAGE_FONTS).
 * Uses chrome.runtime.getURL() for correct extension URL resolution.
 * Each language font is injected only once.
 */
function injectFontForLanguage(lang) {
  if (!lang || _injectedFonts.has(lang)) return;
  const config = LANGUAGE_FONTS[lang];
  if (!config) return;
  _injectedFonts.add(lang);

  const fontUrl = chrome.runtime.getURL(config.file);
  const style = document.createElement("style");
  style.id = `lyrical-font-${lang}`;
  style.textContent = `
    @font-face {
      font-family: "${config.family}";
      src: url("${fontUrl}") format("truetype");
      font-weight: ${config.weight || "400"};
      ${config.stretch ? `font-stretch: ${config.stretch};` : ""}
      ${config.unicodeRange ? `unicode-range: ${config.unicodeRange};` : ""}
      font-display: swap;
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}

function injectAllLyricFonts() {
  Object.keys(LANGUAGE_FONTS).forEach(injectFontForLanguage);
}

injectAllLyricFonts();

const GLOBAL_PROPERTIES = `
@property --lyric-transition-amount-start {
  syntax: "<number>";
  inherits: true;
  initial-value: 0;
}

@property --lyric-transition-amount-end {
  syntax: "<number>";
  inherits: true;
  initial-value: 0;
}

`;

function injectGlobalProperties() {
  if (document.getElementById("lyrical-global-properties")) return;
  const style = document.createElement("style");
  style.id = "lyrical-global-properties";
  style.textContent = GLOBAL_PROPERTIES;
  (document.head || document.documentElement).appendChild(style);
}

injectGlobalProperties();

function updateSecondaryLyricsState(nextState) {
  useAppStore.setState(nextState);
}

// Captions state (from Main World)
let availableCaptions = [];
let captionUrlFromMainWorld = null;
let captionUrlRawFromMainWorld = null;
let pendingMainWorldCaptionLyrics = null;
let pendingMainWorldCaptionLanguage = null;
let pendingMainWorldCaptionVideoId = null;
let pendingMainWorldCaptionFailed = false;
let mainWorldCaptionTracksVideoId = null;
let currentFetchVideoId = null;
let captionSourceReachedForCurrentFetch = false;
let currentFetchWinningSourceId = null;

function resetCurrentFetchSourceGuard() {
  currentFetchWinningSourceId = null;
}

function lockCurrentFetchWinner(sourceId) {
  if (!sourceId) return true;
  if (!currentFetchWinningSourceId) {
    currentFetchWinningSourceId = sourceId;
    log("Locked current fetch session to source:", sourceId);
    return true;
  }
  return currentFetchWinningSourceId === sourceId;
}

function canDisplayCaptionsForCurrentFetch() {
  const liveVideoId = new URLSearchParams(window.location.search).get("v");

  if (
    currentFetchVideoId &&
    liveVideoId &&
    currentFetchVideoId !== liveVideoId
  ) {
    log(
      "Ignoring caption display for stale fetch session:",
      currentFetchVideoId,
      "current:",
      liveVideoId,
    );
    return false;
  }

  if (!captionSourceReachedForCurrentFetch) {
    log(
      "Caption data queued, but source priority has not reached captions yet",
    );
    return false;
  }

  if (
    currentFetchWinningSourceId &&
    currentFetchWinningSourceId !== "captions"
  ) {
    log(
      "Ignoring caption display because source already won this session:",
      currentFetchWinningSourceId,
    );
    return false;
  }

  return true;
}

// Listen for captions found in Main World (captions-extractor.js)
// This receives caption track info from the MAIN world (captions-extractor.js)
// Captions are only used as a fallback when all other lyric sources fail
window.addEventListener("message", (event) => {
  if (event.source !== window) return;

  if (event.data.type === "LYRICAL_CAPTIONS_FOUND") {
    const tracks = event.data.tracks || [];
    const eventVideoId = event.data.videoId || null;
    const currentVideoId = new URLSearchParams(window.location.search).get("v");
    if (eventVideoId && currentVideoId && eventVideoId !== currentVideoId) {
      log(
        "Ignoring caption payload for stale video:",
        eventVideoId,
        "current:",
        currentVideoId,
      );
      return;
    }

    const lyrics = event.data.lyrics; // Lyrics now fetched in main world
    const phase = event.data.phase || "unknown";
    log(
      "Received captions from Main World:",
      tracks.length,
      "tracks, lyrics:",
      lyrics?.length,
      "phase:",
      phase,
    );
    availableCaptions = tracks;
    mainWorldCaptionTracksVideoId = currentVideoId || eventVideoId || null;

    // Queue MAIN-world prefetched lyrics. They should only be consumed when
    // source order reaches "captions" (after earlier sources fail).
    if (phase === "failed") {
      pendingMainWorldCaptionFailed = true;
      log(
        "MAIN-world caption fetch failed. Marking to skip direct fetch delay.",
      );
    } else if (lyrics && lyrics.length > 0 && event.data.selectedTrack) {
      pendingMainWorldCaptionFailed = false;
      pendingMainWorldCaptionLyrics = lyrics;
      pendingMainWorldCaptionLanguage = getCaptionTrackLang(
        event.data.selectedTrack,
      );
      pendingMainWorldCaptionVideoId = currentVideoId || eventVideoId || null;
      log(
        "Queued pre-fetched captions from main world:",
        lyrics.length,
        "lines",
      );

      // Recovery hook: when lyrics arrive late from MAIN world, run a delayed
      // caption retry if nothing is currently shown.
      if (currentVideoId && (!fetchedLyrics || fetchedLyrics.length === 0)) {
        log("Late MAIN-world captions arrived; triggering delayed recovery");
        setTimeout(() => {
          const liveVideoId = new URLSearchParams(window.location.search).get(
            "v",
          );
          if (liveVideoId !== currentVideoId) return;
          if (!canDisplayCaptionsForCurrentFetch()) return;
          tryDisplayCaptions().catch((err) => {
            console.error(
              "[Lyrical] Late MAIN-world caption recovery failed:",
              err,
            );
          });
        }, 500);
      }
    }

    // Store video details for potential caption fetch later
    if (event.data.videoDetails) {
      window.ytVideoDetails = event.data.videoDetails;
    }

    // Do not auto-render captions from this side-channel here.
    // Ordered source loop owns when captions are displayed.
  }
});

function decodeXmlEntities(input: any): string {
  if (!input) return "";
  return String(input)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

function cleanCaptionText(value: any): string {
  if (!value) return "";
  let words = decodeXmlEntities(String(value)).replace(/\r?\n/g, " ").trim();

  // 1. Remove YouTube speaker change markers (e.g. ">> ", ">>> ", "> ")
  words = words.replace(/^(?:>{1,3}|&gt;{1,3})\s*/i, "");

  // 2. Remove musical notes
  const notes = ["♪", "♫", "🎵", "🎶"];
  for (const note of notes) {
    if (words.startsWith(note)) words = words.slice(1).trim();
    if (words.endsWith(note)) words = words.slice(0, -1).trim();
  }

  // 3. Remove sound effect annotations at start
  words = words.replace(
    /^\s*\[(?:music|applause|laughter|cheering|chuckles|groans|sighs|gasp|screaming)\]\s*/gi,
    "",
  );
  words = words.replace(
    /^\s*\((?:music|applause|laughter|cheering|chuckles|groans|sighs|gasp|screaming)\)\s*/gi,
    "",
  );

  // 4. Normalize multiple spaces
  words = words.replace(/\s+/g, " ");

  return words.trim();
}

/**
 * Fetch caption content from content script (ISOLATED world)
 * This is the same approach better-lyrics uses - their main script runs in ISOLATED world
 */
async function fetchCaptionsFromContentScript(url) {

  const readAttr = (attrs, key) => {
    const match = attrs.match(
      new RegExp(`${key}\\s*=\\s*["']([^"']+)["']`, "i"),
    );
    return match ? match[1] : null;
  };

  const parseTimeLike = (value) => {
    if (value == null) return 0;
    const raw = String(value).trim().toLowerCase().replace(",", ".");
    if (!raw) return 0;
    if (raw.includes(":")) {
      const parts = raw.split(":").map((p) => parseFloat(p));
      if (parts.some((n) => !Number.isFinite(n))) return 0;
      if (parts.length === 2) return parts[0] * 60 + parts[1];
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : 0;
  };

  const parseXmlTimeToSeconds = (value, preferMsHeuristic = false) => {
    if (value == null) return 0;
    const raw = String(value).trim().toLowerCase().replace(",", ".");
    if (!raw) return 0;
    if (raw.endsWith("ms")) return parseTimeLike(raw.slice(0, -2)) / 1000;
    if (raw.endsWith("s")) return parseTimeLike(raw.slice(0, -1));
    if (raw.includes(":")) return parseTimeLike(raw);
    const n = parseTimeLike(raw);
    if (!Number.isFinite(n)) return 0;
    if (preferMsHeuristic && n >= 10000) return n / 1000;
    return n;
  };

  try {
    log("Fetching captions from content script:", url.substring(0, 100));

    const response = await fetch(url, {
      credentials: "include",
    });

    log("Caption fetch response status:", response.status);

    if (!response.ok) {
      log("Caption fetch failed:", response.status, response.statusText);
      return null;
    }

    // Get as text FIRST to see what we actually received
    const text = await response.text();
    log("Caption response length:", text.length, "chars");
    log("Caption response preview:", text.substring(0, 200));

    if (!text || text.length === 0) {
      log("Caption response is EMPTY");
      return null;
    }

    // Try JSON parse first (fmt=json3)
    if (text.startsWith("{") || text.startsWith("[")) {
      try {
        const captionData = JSON.parse(text);
        log("Caption data events:", captionData.events?.length);

        if (!captionData.events) {
          return null;
        }

        // Parse events into lyrics array (same logic as better-lyrics)
        const lyrics = captionData.events
          .filter((event) => event.segs && event.segs.length > 0)
          .map((event) => {
            let words = "";
            for (let seg of event.segs) {
              words += seg.utf8 || "";
            }
            words = words.replace(/\n/g, " ").trim();

            // Remove music notes
            const musicNotes = ["♪", "♫", "🎵", "🎶"];
            for (let note of musicNotes) {
              if (words.startsWith(note)) words = words.substring(1).trim();
              if (words.endsWith(note)) words = words.slice(0, -1).trim();
            }

            return {
              time: (event.tStartMs || 0) / 1000,
              text: cleanCaptionText(words),
              duration: (event.dDurationMs || 0) / 1000,
            };
          })
          .filter((lyric) => lyric.text.length > 0);

        log("Parsed lyrics (JSON):", lyrics.length, "lines");
        return lyrics;
      } catch (e) {
        log("JSON parse failed, trying XML...");
      }
    }

    // Fallback: Try XML / TTML parse (default format)
    if (
      text.includes("<text") ||
      text.includes("<p") ||
      text.includes("<s") ||
      text.includes("<transcript") ||
      text.includes("<?xml")
    ) {
      try {
        const lyrics = [];
        const textNodeRegex = /<text\b([^>]*)>([\s\S]*?)<\/text>/gi;
        let match;

        while ((match = textNodeRegex.exec(text)) !== null) {
          const attrs = match[1] || "";
          const raw = decodeXmlEntities(match[2] || "");
          const start = readAttr(attrs, "start");
          const dur = readAttr(attrs, "dur");
          const t = readAttr(attrs, "t");
          const d = readAttr(attrs, "d");
          const cleaned = cleanCaptionText(raw);
          if (!cleaned) continue;

          lyrics.push({
            time: t
              ? parseXmlTimeToSeconds(t, true)
              : parseXmlTimeToSeconds(start, false),
            duration: d
              ? parseXmlTimeToSeconds(d, true)
              : parseXmlTimeToSeconds(dur, false),
            text: cleaned,
          });
        }

        // TTML fallback: parse <p begin/end/dur> blocks with optional <s> children.
        if (lyrics.length === 0) {
          const pNodeRegex = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
          while ((match = pNodeRegex.exec(text)) !== null) {
            const pAttrs = match[1] || "";
            const pBody = match[2] || "";
            const pStart =
              readAttr(pAttrs, "begin") || readAttr(pAttrs, "start");
            const pEnd = readAttr(pAttrs, "end");
            const pDur = readAttr(pAttrs, "dur");

            let lineText = "";
            const sNodeRegex = /<s\b[^>]*>([\s\S]*?)<\/s>/gi;
            let sMatch;
            while ((sMatch = sNodeRegex.exec(pBody)) !== null) {
              lineText += `${decodeXmlEntities(sMatch[1] || "")} `;
            }

            if (!lineText.trim()) {
              lineText = decodeXmlEntities(pBody.replace(/<[^>]+>/g, " "));
            }

            const cleaned = cleanCaptionText(lineText);
            if (!cleaned) continue;

            const startTime = parseXmlTimeToSeconds(pStart, false);
            let duration = parseXmlTimeToSeconds(pDur, false);
            if (!duration && pEnd) {
              duration = Math.max(
                0,
                parseXmlTimeToSeconds(pEnd, false) - startTime,
              );
            }

            lyrics.push({ time: startTime, duration, text: cleaned });
          }
        }

        log("Parsed lyrics (XML):", lyrics.length, "lines");
        return lyrics.length > 0 ? lyrics : null;
      } catch (e) {
        log("XML parse also failed:", e);
      }
    }

    log("Could not parse caption response as JSON or XML");
    return null;
  } catch (err) {
    console.error("[Lyrical] Caption fetch error:", err);
    return null;
  }
}
// Panel state
let lyricsPanel = null;
let isExpanded = true;
let currentLyricText = ""; // Track current lyric for collapsed header display

// YouTube SPA navigation guard
let hasHandledFirstNavigation = false;
let youtubeNavListenerAttached = false;
let lastInjectedVideoId = null; // Prevent duplicate inject attempts
let lastFetchedVideoId = null; // Prevent duplicate lyrics fetches (source of truth)
let activeFetchSessionId = 0; // Prevent stale concurrent runs from clobbering state

// Sync optimization
const PLATFORM_OFFSET = -0.45; // YouTube's systemic delay (constant)
let userSongOffset = 0; // Per-song correction from slider
let currentSyncOffset = PLATFORM_OFFSET; // Live offset (platform + user correction)

// Multi-language lyrics support
let currentLyricsVersion = "default"; // 'default', 'translated', 'romanized', 'user', etc.
let lyricsByVersion: any = {}; // Store multiple lyric versions

// Translation state
let translatedLyrics = null; // Cached translated lyrics
let currentTranslationLang = null; // Current translation language
let isTranslationMode = false; // True when showing translated lyrics
let isTripleLineMode = false; // True when showing triple-line display (original + romanized + translated)

// Manual tap-to-sync state
let manualSyncIndex = 0;
let isManualSyncing = false;

// Header update throttling
let headerUpdateTimer = null;

function hasLocalStorageApi() {
  return !!chrome?.storage?.local?.get;
}

// Inject lyric styles once (deferred for document_start compatibility)
// function injectStyles() removed - unused in React version

// VIDEO-DRIVEN INJECTION - The only stable signal on YouTube first load
// YouTube's DOM is unstable on first load. The <video> element with readyState >= 2
// is the only reliable indicator that the watch layout is finalized.
let waitForVideoInProgress = false;
function waitForStableVideo(callback) {
  if (waitForVideoInProgress) {
    log("[Lyrical Panel] waitForStableVideo already in progress, skipping");
    return;
  }
  waitForVideoInProgress = true;

  let checkCount = 0;
  const maxChecks = 600; // ~10 seconds at 60fps

  const check = () => {
    checkCount++;
    const video = document.querySelector("video");
    const secondary = document.querySelector("#secondary");

    // Log every 60 frames (~1 second) for debugging
    if (checkCount % 60 === 0) {
      log("waitForStableVideo check #" + checkCount, {
        hasVideo: !!video,
        videoReadyState: video?.readyState,
        hasSecondary: !!secondary,
      });
    }

    // Video ready + layout container exists = safe to inject
    if (video && video.readyState >= 2 && secondary) {
      log(
        "[Lyrical Panel] ✅ Video stable, layout ready - proceeding with injection",
      );
      waitForVideoInProgress = false;
      callback();
      return;
    }

    // Timeout fallback - if we've waited 10 seconds, try anyway with MutationObserver
    if (checkCount >= maxChecks) {
      log(
        "[Lyrical Panel] ⚠️ Timeout waiting for stable video, falling back to injection",
      );
      waitForVideoInProgress = false;
      callback();
      return;
    }

    requestAnimationFrame(check);
  };
  check();
}
log("waitForStableVideo helper registered");

// Create the lyrics panel HTML
function createLyricsPanel() {
  // Inject Inter font from Google Fonts CDN (lightweight, ~100KB Latin)
  if (!document.getElementById("lyrical-font-inter")) {
    const link = document.createElement("link");
    link.id = "lyrical-font-inter";
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap";
    (document.head || document.documentElement).appendChild(link);
  }

  const wrapper = document.createElement("div");
  wrapper.id = "lyrical-panel-wrapper";
  wrapper.style.width = "100%";
  wrapper.style.display = "block";
  const shadowRoot = wrapper.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = CONTENT_SHADOW_STYLES;
  shadowRoot.appendChild(style);

  const mountPoint = document.createElement("div");
  mountPoint.id = "lyrical-panel-root";
  shadowRoot.appendChild(mountPoint);

  const root = createRoot(mountPoint);
  log("Creating React Root and Rendering...");
  root.render(<LyricsPanel />);
  wrapper._reactRoot = root;

  return wrapper;
}

function findVisibleSecondaryColumn() {
  const secondaries = document.querySelectorAll("#secondary");
  for (const s of secondaries) {
    if (s.offsetWidth > 0 && s.offsetHeight > 0) {
      return s;
    }
  }
  return document.querySelector("#secondary") || null;
}

function isStandardYouTubeWatchPage() {
  const host = window.location.hostname;
  return (
    (host === "www.youtube.com" || host === "youtube.com") &&
    window.location.pathname.includes("/watch")
  );
}

function applyWrapperPlacement(wrapper = lyricsPanel) {
  if (!wrapper) return;
  const state = useAppStore.getState();
  const { displayMode, floatingPositionPreset, floatingCustomPosition } = state;
  const isFloatingAllowed =
    displayMode === "floating" && isStandardYouTubeWatchPage();

  if (isFloatingAllowed) {
    wrapper.style.position = "fixed";
    wrapper.style.zIndex = "99999";
    wrapper.style.maxWidth = "402px";
    wrapper.style.width = "402px";
    wrapper.style.marginBottom = "0";

    if (floatingCustomPosition) {
      wrapper.style.top = `${floatingCustomPosition.top}px`;
      wrapper.style.left = `${floatingCustomPosition.left}px`;
      wrapper.style.right = "auto";
    } else {
      wrapper.style.top = "80px";
      if (floatingPositionPreset === "left") {
        wrapper.style.left = "24px";
        wrapper.style.right = "auto";
      } else if (floatingPositionPreset === "center") {
        const leftPos = Math.max(24, Math.round((window.innerWidth - 402) / 2));
        wrapper.style.left = `${leftPos}px`;
        wrapper.style.right = "auto";
      } else {
        // default "right"
        wrapper.style.left = "auto";
        wrapper.style.right = "24px";
      }
    }

    if (wrapper.parentElement !== document.body) {
      document.body.appendChild(wrapper);
    }
  } else {
    // Sidebar mode
    wrapper.style.position = "static";
    wrapper.style.zIndex = "auto";
    wrapper.style.width = "100%";
    wrapper.style.maxWidth = "100%";
    wrapper.style.marginBottom = "0px";
    wrapper.style.top = "auto";
    wrapper.style.left = "auto";
    wrapper.style.right = "auto";

    const secondary = findVisibleSecondaryColumn();
    if (secondary && wrapper.parentElement !== secondary) {
      secondary.insertBefore(wrapper, secondary.firstChild);
    }
  }
}

// Inject panel into YouTube page
function injectIntoYouTube() {
  log("Attempting YouTube injection...");

  // ✅ Remove any existing panel from DOM before re-injecting
  const existingPanel = document.getElementById("lyrical-panel-wrapper");
  if (existingPanel) {
    if (existingPanel._reactRoot) {
      existingPanel._reactRoot.unmount();
    }
    existingPanel.remove();
  }
  lyricsPanel = null;

  // ✅ Watch-page intent check (flexible OR logic)
  const isWatchLikePage = () => {
    if (window.location.href.includes("/watch")) return true;

    const watchFlexy = document.querySelector("ytd-watch-flexy");
    if (watchFlexy && watchFlexy.hasAttribute("is-watch-page")) return true;

    return false;
  };

  const tryInject = () => {
    // ✅ Watch-page intent check (broad)
    if (!isWatchLikePage()) return false;

    const rawDisplayMode = useAppStore.getState().displayMode || "sidebar";
    const isFloatingAllowed =
      rawDisplayMode === "floating" && isStandardYouTubeWatchPage();

    let secondary = null;
    if (!isFloatingAllowed) {
      secondary = findVisibleSecondaryColumn();
      if (!secondary) {
        log("No #secondary found for sidebar mode, waiting...");
        return false;
      }
      log("[Lyrical Panel] Found #secondary for sidebar mode");
    }

    // 🔧 Prevent duplicate - double-check DOM for any stale panels
    const stalePanel = document.getElementById("lyrical-panel-wrapper");
    if (stalePanel) {
      log("Found stale panel in DOM, removing before inject");
      if (stalePanel._reactRoot) stalePanel._reactRoot.unmount();
      stalePanel.remove();
    }

    log("Watch layout confirmed, injecting panel");
    lyricsPanel = createLyricsPanel();
    applyWrapperPlacement(lyricsPanel);

    lyricsPanel.style.display = "block";
    lyricsPanel.style.visibility = "visible";
    lyricsPanel.style.opacity = "1";

    attachEventListeners();

    // ✅ Track injected video
    const videoId = new URLSearchParams(window.location.search).get("v");
    lastInjectedVideoId = videoId;
    log("✅ Panel injected for video:", videoId);

    // 🔄 POST-INJECTION VERIFICATION: YouTube may destroy #secondary after injection
    // Check multiple times to ensure panel survives DOM churn
    let verifyCount = 0;
    const verifyPanel = () => {
      verifyCount++;
      if (lyricsPanel && document.body.contains(lyricsPanel)) {
        if (verifyCount >= 3) {
          log(
            "[Lyrical Panel] ✅ Panel verified stable after",
            verifyCount,
            "checks",
          );
          return; // Panel is stable
        }
      } else if (verifyCount <= 10) {
        log(
          "[Lyrical Panel] ⚠️ Panel was destroyed or detached, re-injecting (attempt",
          verifyCount,
          ")",
        );
        setTimeout(() => {
          if (!lyricsPanel) {
            lyricsPanel = createLyricsPanel();
          }
          applyWrapperPlacement(lyricsPanel);
          lyricsPanel.style.display = "block";
          lyricsPanel.style.visibility = "visible";
          lyricsPanel.style.opacity = "1";
          attachEventListeners();
          lastInjectedVideoId = videoId;
          log("✅ Panel re-injected successfully");

          const info = window.getSongInfoFromPage?.();
          if (info?.title) autoFetchLyrics(info);
        }, 150);
      } else {
        log("[Lyrical Panel] ❌ Panel re-injection failed after max attempts");
        return;
      }
      setTimeout(verifyPanel, 500); // Check every 500ms
    };
    setTimeout(verifyPanel, 500); // Start verification after 500ms setTimeout(verifyPanel, 500); // Start verification after 500ms

    // �🔧 Trigger song detection immediately after injection (no setTimeout)
    queueMicrotask(() => {
      const info = window.getSongInfoFromPage?.();
      if (info?.title) {
        log("[Lyrical Panel] Song detected after injection:", info.title);
        autoFetchLyrics(info);
      } else {
        // First-load metadata on YouTube can be late; hydrate panel info lazily.
        hydrateSongInfoWithRetry(8, 350).catch(() => {});
      }
    });

    return true;
  };

  // Try immediate injection first
  if (tryInject()) return;

  // Observe DOM until watch page is ready
  log("Watch page not ready, starting observer...");
  const observer = new MutationObserver(() => {
    if (tryInject()) {
      observer.disconnect();
    }
  });

  // ✅ MUST observe document.body - YouTube creates #secondary outside ytd-app on first load
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

// Inject panel into Spotify page
function injectIntoSpotify() {
  const main = document.querySelector(".Root__main-view");
  if (!main) {
    log("Spotify main view not found, retrying...");
    setTimeout(injectIntoSpotify, 1000);
    return;
  }

  if (!lyricsPanel) {
    lyricsPanel = createLyricsPanel();
    main.appendChild(lyricsPanel);
    attachEventListeners();
    log("Lyrical panel injected into Spotify");
  }
}

// Attach event listeners to panel controls
function attachEventListeners() {
  const toggleBtn = document.getElementById("lyrical-toggle");
  const closeBtn = document.getElementById("lyrical-close");
  const body = document.getElementById("lyrical-body");
  const lyricsContent = document.getElementById("lyrical-content");

  toggleBtn?.addEventListener("click", () => {
    isExpanded = !isExpanded;
    body.style.display = isExpanded ? "block" : "none";
    toggleBtn.style.transform = isExpanded ? "rotate(0deg)" : "rotate(-90deg)";
    updateHeaderText(); // Update header when toggling
  });

  closeBtn?.addEventListener("click", () => {
    if (lyricsPanel) {
      // ✅ OPTIMIZATION: Proper memory cleanup
      lyricsPanel.remove();
      lyricsPanel = null;
    }

    // Clean up video event listeners
    if (videoEventListeners) {
      const video = document.querySelector("video");
      if (video) {
        video.removeEventListener(
          "timeupdate",
          videoEventListeners.onTimeUpdate,
        );
        video.removeEventListener("pause", videoEventListeners.onPause);
        video.removeEventListener("play", videoEventListeners.onPlay);
        log("✅ Cleaned up video listeners");
      }
      videoEventListeners = null;
    }
  });

  // Sync slider event listener
  const syncSlider = document.getElementById("lyrical-sync-slider");
  const offsetValue = document.getElementById("lyrical-offset-value");

  if (syncSlider && offsetValue) {
    syncSlider.addEventListener("input", async (e) => {
      const songOffset = parseFloat(e.target.value);

      // ✅ Only user correction (no double platform offset!)
      userSongOffset = songOffset;
      currentSyncOffset = PLATFORM_OFFSET + userSongOffset;

      // Update display (show both total and user offset for clarity)
      offsetValue.textContent = `${currentSyncOffset.toFixed(
        2,
      )}s (user: ${userSongOffset.toFixed(2)}s)`;

      // Save to storage
      if (currentSongInfo) {
        const songKey = `${currentSongInfo.artist || "unknown"}__${
          currentSongInfo.title || "unknown"
        }`;
        try {
          const { songOffsets = {} } =
            await chrome.storage.sync.get("songOffsets");
          songOffsets[songKey] = songOffset;
          await chrome.storage.sync.set({ songOffsets });
          log("💾 Saved offset for", songKey, ":", songOffset.toFixed(2), "s");
        } catch (err) {
          console.error("[Lyrical Panel] Failed to save offset:", err);
        }
      }
    });
  }

  // ✅ Language selector event listener (supports Genius translations + local versions)
  const languageSelect = document.getElementById("lyrical-language-select");
  if (languageSelect) {
    languageSelect.addEventListener("change", (e) => {
      handleTranslationSelection(e.target.value);
    });
  }

  // ✅ Add lyrics modal event handlers
  const addLyricsBtn = document.getElementById("lyrical-add-lyrics");
  const pasteModal = document.getElementById("lyrical-paste-modal");
  const langNameInput = document.getElementById("lyrical-lang-name");
  const pasteArea = document.getElementById("lyrical-paste-area");
  const saveBtn = document.getElementById("lyrical-save-lyrics");
  const cancelBtn = document.getElementById("lyrical-cancel-lyrics");

  addLyricsBtn?.addEventListener("click", () => {
    pasteModal.style.display = "flex";
    langNameInput.value = "";
    pasteArea.value = "";
  });

  cancelBtn?.addEventListener("click", () => {
    pasteModal.style.display = "none";
  });

  pasteModal?.addEventListener("click", (e) => {
    if (e.target === pasteModal) pasteModal.style.display = "none";
  });

  saveBtn?.addEventListener("click", async () => {
    const langName = langNameInput.value.trim();
    const pastedText = pasteArea.value.trim();

    if (!langName || !pastedText) {
      alert("Please enter language name and paste lyrics");
      return;
    }

    const parsed = parsePastedLyrics(pastedText);
    if (!parsed) {
      alert("Could not parse lyrics");
      return;
    }

    const versionId = langName.toLowerCase().replace(/[^a-z0-9]/g, "_");

    // ✅ FIX: Preserve synced metadata
    lyricsByVersion[versionId] = {
      id: versionId,
      label: langName,
      synced: parsed.synced,
      lyrics: parsed.lyrics,
    };

    if (currentSongInfo) {
      const songKey = `lyrics_versions_${currentSongInfo.artist}_${currentSongInfo.title}`;
      try {
        if (!hasLocalStorageApi() || !chrome?.storage?.local?.set) {
          throw new Error("chrome.storage.local unavailable");
        }
        const stored = await chrome.storage.local.get(songKey);
        const versions = stored[songKey] || {};
        versions[versionId] = {
          label: langName,
          synced: parsed.synced,
          lyrics: parsed.lyrics,
          timestamp: Date.now(),
        };
        await chrome.storage.local.set({ [songKey]: versions });

        const option = document.createElement("option");
        option.value = versionId;
        option.textContent = `${langName} (${
          parsed.synced ? "Synced" : "Unsynced"
        })`;
        languageSelect.appendChild(option);
        languageSelect.value = versionId;
        currentLyricsVersion = versionId;

        lyricsRendered = false;
        updateLyrics(parsed.lyrics, -1);

        // ✅ Only start timer if synced
        if (parsed.synced) {
          startLyricsTimer(parsed.lyrics);
        }

        pasteModal.style.display = "none";
        log("Saved version:", versionId);
      } catch (err) {
        console.error("[Lyrical Panel] Save failed:", err);
        alert("Failed to save");
      }
    }
  });

  // ✅ Delete version button
  const deleteBtn = document.getElementById("lyrical-delete-version");
  deleteBtn?.addEventListener("click", () => {
    if (currentLyricsVersion !== "default") {
      deleteLyricsVersion(currentLyricsVersion);
    }
  });

  // ✅ Export lyrics button
  const exportBtn = document.getElementById("lyrical-export-lyrics");
  exportBtn?.addEventListener("click", () => {
    const version = lyricsByVersion[currentLyricsVersion];
    const format =
      version?.synced || version?.lyrics?.[0]?.time ? "lrc" : "json";
    exportLyrics(currentLyricsVersion, format);
  });

  // ✅ Import lyrics button
  const importBtn = document.getElementById("lyrical-import-lyrics");
  const fileInput = document.getElementById("lyrical-file-input");

  importBtn?.addEventListener("click", () => {
    fileInput?.click();
  });

  fileInput?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const label = prompt("Enter language name:", detectLanguage(text));
    if (label) {
      await importLyrics(text, label);
    }
    fileInput.value = ""; // Reset
  });

  // ✅ Manual sync button
  const manualSyncBtn = document.getElementById("lyrical-manual-sync");
  manualSyncBtn?.addEventListener("click", () => {
    if (isManualSyncing) {
      handleTapToSync();
    } else {
      startManualSync();
    }
  });

  // ✅ Translation button (Chrome native)
  const translateBtn = document.getElementById("lyrical-translate");
  translateBtn?.addEventListener("click", () => {
    const version = lyricsByVersion[currentLyricsVersion];
    const lyrics = version?.lyrics || version;

    if (!lyrics || !lyrics.length) {
      alert("No lyrics to translate");
      return;
    }

    // Combine lyrics into a single text block
    const text = lyrics.map((l) => l.text).join("\n");

    // Create temporary element for selection
    const temp = document.createElement("div");
    temp.textContent = text;
    temp.style.position = "fixed";
    temp.style.left = "-9999px";
    temp.style.whiteSpace = "pre-wrap";
    document.body.appendChild(temp);

    // Select the text
    const range = document.createRange();
    range.selectNodeContents(temp);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    // Show user guidance
    alert(
      "✅ Lyrics selected!\n\n" +
        "1. Right-click → Translate to English\n" +
        "2. Copy the translated text\n" +
        "3. Click 💾 Save to store as a version",
    );

    // Clean up after 3 seconds
    setTimeout(() => {
      selection.removeAllRanges();
      temp.remove();
    }, 3000);
  });

  // ✅ Save Translation button
  const saveTranslationBtn = document.getElementById(
    "lyrical-save-translation",
  );
  saveTranslationBtn?.addEventListener("click", () => {
    const pasteModal = document.getElementById("lyrical-paste-modal");
    const langNameInput = document.getElementById("lyrical-lang-name");

    pasteModal.style.display = "flex";
    langNameInput.value = "English (Translated)";
    langNameInput.focus();
  });

  // ✅ Back to Original button
  const backOriginalBtn = document.getElementById("lyrical-back-original");
  backOriginalBtn?.addEventListener("click", () => {
    if (currentLyricsVersion === "default") {
      return; // Already on original
    }

    currentLyricsVersion = "default";
    const defaultLyrics =
      lyricsByVersion.default?.lyrics || lyricsByVersion.default;

    if (defaultLyrics) {
      lyricsRendered = false;
      lyricsRendered = false;
      useAppStore.setState({ lyrics: defaultLyrics, activeIndex: -1 });

      // Update language selector
      const languageSelect = document.getElementById("lyrical-language-select");
      if (languageSelect) {
        languageSelect.value = "default";
      }

      // Restart sync if synced
      const version = lyricsByVersion.default;
      if (version?.synced || defaultLyrics[0]?.time > 0) {
        startLyricsTimer(defaultLyrics);
      }
    }
  });

  // ✅ Auto-detect language on paste
  if (pasteArea) {
    pasteArea.addEventListener("input", (e) => {
      if (!langNameInput.value && e.target.value) {
        const detected = detectLanguage(e.target.value);
        langNameInput.placeholder = `Detected: ${detected}`;
      }
    });
  }

  // // Disable auto-scroll when user hovers over lyrics
  // if (lyricsContent) {
  //   lyricsContent.addEventListener("mouseenter", () => {
  //     userScrolling = true;
  //     log("User hovering - auto-scroll disabled");
  //   });

  //   lyricsContent.addEventListener("mouseleave", () => {
  //     userScrolling = false;
  //     log("User left - auto-scroll enabled");
  //   });
  // }
}

// Update song info
// Update song info
function updateSongInfo(songInfo) {
  log("React Update: Song Info", songInfo);
  if (!songInfo) return;

  // Merge partial updates so first-load sparse metadata doesn't wipe existing fields.
  const merged = {
    ...(currentSongInfo || {}),
    ...songInfo,
  };

  if (!merged.title && currentSongInfo?.title) {
    merged.title = currentSongInfo.title;
  }
  if (!merged.artist && currentSongInfo?.artist) {
    merged.artist = currentSongInfo.artist;
  }
  if (!merged.artwork && currentSongInfo?.artwork) {
    merged.artwork = currentSongInfo.artwork;
  }

  currentSongInfo = merged;
  useAppStore.getState().setSongInfo(merged);
}

async function hydrateSongInfoWithRetry(maxAttempts = 6, delayMs = 350) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let info = null;
    try {
      info = window.getSongInfoFromPage?.() || null;
    } catch {
      info = null;
    }

    if (info && (info.title || info.artist || info.artwork)) {
      updateSongInfo(info);
      if (info.title && info.artwork) {
        return true;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return !!currentSongInfo;
}

// Update lyrics content
let previousLineIndex = -1;
let lyricsRendered = false;

// ========== ADVANCED LYRICS FEATURES ==========

// Persist lyrics versions to storage
async function persistLyricsVersions() {
  if (!currentSongInfo) return;
  const key = `lyrics_versions_${currentSongInfo.artist}_${currentSongInfo.title}`;
  try {
    if (!chrome?.storage?.local?.set) {
      log(
        "[Lyrical Panel] storage.local.set unavailable, skipping persistence",
      );
      return;
    }
    await chrome.storage.local.set({ [key]: lyricsByVersion });
    log("[Lyrical Panel] Persisted versions:", Object.keys(lyricsByVersion));
  } catch (err) {
    if (err.message?.includes("Extension context invalidated")) {
      log(
        "[Lyrical Panel] Extension context invalidated (reloaded). Stopping execution.",
      );
      return;
    }
    console.error("[Lyrical Panel] Failed to persist versions:", err);
  }
}

function getLyricsCacheKey(songInfo, sourceId = null) {
  if (!songInfo?.artist || !songInfo?.title) return null;
  const baseKey = `lyrics_${songInfo.artist}_${songInfo.title}`;
  return sourceId ? `${baseKey}__${sourceId}` : baseKey;
}

function getCacheLookupIdsForSource(sourceId: string): string[] {
  switch (sourceId) {
    case "musixmatch":
      return ["musixmatch", "musixmatch-richsync"];
    case "musixmatch-synced":
      return ["musixmatch-synced"];
    case "unison-richsynced":
      return ["unison-richsynced"];
    case "unison-synced":
      return ["unison-synced", "unison-plain"];
    case "binimum-richsynced":
      return ["binimum-richsynced"];
    case "binimum-synced":
      return ["binimum-synced"];
    case "better_lyrics":
      return ["better_lyrics"];
    case "bLyrics-synced":
      return ["bLyrics-synced"];
    case "portato-richsynced":
      return ["portato-richsynced"];
    case "legato-synced":
      return ["legato-synced"];
    default:
      return [sourceId];
  }
}

function getCacheLabelForSource(sourceId, fallbackLabel = "") {
  switch (sourceId) {
    case "lyrical":
      return "Lyrical (Boidu)";
    case "better_lyrics":
      return "Better Lyrics";
    case "bLyrics-synced":
      return "Better Lyrics";
    case "unison-richsynced":
    case "unison-synced":
    case "unison-plain":
      return "Better Lyrics Unison";
    case "binimum-richsynced":
    case "binimum-synced":
      return "BiniLyrics";
    case "portato-richsynced":
      return "Better Lyrics Portato";
    case "legato-synced":
      return "Better Lyrics Legato";
    case "musixmatch":
    case "musixmatch-richsync":
    case "musixmatch-synced":
      return "Musixmatch";
    case "lrclib":
      return "LRCLib";
    case "captions":
      return "YouTube Captions";
    default:
      return fallbackLabel || "Cached";
  }
}

const LYRICS_CACHE_SCHEMA_VERSION = 2;
const PARAGRAPH_AWARE_CACHE_SOURCES = new Set([
  "lyrical",
  "better_lyrics",
  "bLyrics-synced",
  "unison-richsynced",
  "unison-synced",
  "unison-plain",
  "binimum-richsynced",
  "binimum-synced",
  "portato-richsynced",
  "legato-synced",
  "musixmatch-synced",
]);

function shouldRefreshParagraphAwareCache(entry, sourceId) {
  const effectiveSourceId = entry?.source || sourceId;
  if (!PARAGRAPH_AWARE_CACHE_SOURCES.has(effectiveSourceId)) return false;
  return (entry?.cacheSchemaVersion || 0) < LYRICS_CACHE_SCHEMA_VERSION;
}

async function persistLyricsCache(songInfo, sourceId, lyrics, extra = {}) {
  if (!Array.isArray(lyrics) || lyrics.length === 0 || !sourceId) return;

  const genericKey = getLyricsCacheKey(songInfo);
  const sourceKey = getLyricsCacheKey(songInfo, sourceId);
  if (!genericKey || !sourceKey) return;

  const entry = {
    lyrics,
    source: sourceId,
    cacheSchemaVersion: LYRICS_CACHE_SCHEMA_VERSION,
    timestamp: Date.now(),
    ...extra,
  };

  try {
    if (!hasLocalStorageApi() || !chrome?.storage?.local?.set) {
      throw new Error("chrome.storage.local.set unavailable");
    }
    await chrome.storage.local.set({
      [genericKey]: entry,
      [sourceKey]: entry,
    });
  } catch (err) {
    if (err?.message?.includes("Extension context invalidated")) return;
    console.warn("[Lyrical Panel] Cache persist failed:", err);
  }
}

function restoreLyricsFromCacheEntry(
  entry,
  fallbackSourceId,
  fallbackLabel = "",
) {
  if (!entry?.lyrics || entry.lyrics.length === 0) return false;
  if (shouldRefreshParagraphAwareCache(entry, fallbackSourceId)) return false;

  fetchedLyrics = entry.lyrics;
  lyricsByVersion.default = {
    id: `${fallbackSourceId || entry.source || "cached"}-cache`,
    label:
      entry.label ||
      getCacheLabelForSource(entry.source || fallbackSourceId, fallbackLabel),
    synced: true,
    lyrics: entry.lyrics,
  };

  lyricsJustLoaded = true;
  lyricsRendered = false;
  isTripleLineMode = false;

  useAppStore
    .getState()
    .setLyrics(
      entry.lyrics,
      entry.source || fallbackSourceId || "unknown",
      detectLyricsLanguage(entry.lyrics, entry.language),
    );

  if (entry.romanizedLyrics?.length || entry.translatedLyrics?.length) {
    updateSecondaryLyricsState({
      romanizedLyrics: entry.romanizedLyrics || [],
      translatedLyrics: entry.translatedLyrics || [],
    });
  }

  startLyricsTimer(entry.lyrics);
  autoProcessLyrics();

  setTimeout(() => {
    lyricsJustLoaded = false;
  }, 2000);

  useAppStore.setState({ isLoading: false });
  return true;
}

async function tryRestoreCachedLyricsForSource(
  songInfo,
  source,
  maxCacheAgeMs,
) {
  const sourceCacheKeys = getCacheLookupIdsForSource(source.id)
    .map((cacheSourceId) => getLyricsCacheKey(songInfo, cacheSourceId))
    .filter(Boolean);
  if (sourceCacheKeys.length === 0) return false;

  const cachedEntries = await chrome.storage.local.get(sourceCacheKeys);
  for (const cacheKeyForSource of sourceCacheKeys) {
    const entry = cachedEntries[cacheKeyForSource];
    if (!entry?.lyrics?.length) continue;

    const cacheAge = Date.now() - entry.timestamp;
    if (cacheAge >= maxCacheAgeMs) continue;

    log(
      "[Lyrical Panel] Using source-priority cache for",
      source.id,
      "(age:",
      Math.floor(cacheAge / 1000 / 60),
      "minutes)",
    );

    return restoreLyricsFromCacheEntry(entry, source.id, source.label);
  }

  return false;
}

// ========== END ADVANCED FEATURES ==========

// Lyrics fetching and management
let currentSongInfo = null;
let fetchedLyrics = null;
let currentLineIndex = -1;
let lyricsTimer = null;
let lyricsJustLoaded = false; // Flag to prevent auto-scroll on initial load
let userScrolling = false; // Flag to prevent auto-scroll when user is interacting

// Normalize lyrics (sort + fix duplicates/backward jumps)
function normalizeLyrics(lyrics) {
  if (!lyrics || !lyrics.length) return lyrics;

  // 1️⃣ Sort by time
  lyrics.sort((a, b) => a.time - b.time);

  // 2️⃣ Fix duplicate / backward timestamps and trim text
  for (let i = 0; i < lyrics.length; i++) {
    if (lyrics[i].text) {
      lyrics[i].text = String(lyrics[i].text).trim();
    }
    if (i > 0 && lyrics[i].time <= lyrics[i - 1].time) {
      lyrics[i].time = lyrics[i - 1].time + 0.2; // 200ms gap
    }
  }

  return lyrics;
}

// Reset all lyrics state (clean slate for new song)
function resetLyricsState(reason = "", options: any = {}) {
  const { preserveCaptionCacheForVideoId = null } = options;
  log("🔄 Resetting lyrics state:", reason);

  const hasSameVideoPendingPrefetch =
    preserveCaptionCacheForVideoId &&
    pendingMainWorldCaptionLyrics &&
    pendingMainWorldCaptionLyrics.length > 0 &&
    pendingMainWorldCaptionVideoId === preserveCaptionCacheForVideoId;

  const hasSameVideoTracks =
    preserveCaptionCacheForVideoId &&
    availableCaptions &&
    availableCaptions.length > 0 &&
    mainWorldCaptionTracksVideoId === preserveCaptionCacheForVideoId;

  const shouldPreserveCaptionCache =
    hasSameVideoPendingPrefetch || hasSameVideoTracks;

  // Reset caption-track cache unless we're in a same-video transition where
  // MAIN-world caption data arrived before autoFetch triggered.
  if (!shouldPreserveCaptionCache) {
    availableCaptions = [];
    captionUrlFromMainWorld = null;
    captionUrlRawFromMainWorld = null;
    pendingMainWorldCaptionLyrics = null;
    pendingMainWorldCaptionLanguage = null;
    pendingMainWorldCaptionVideoId = null;
    pendingMainWorldCaptionFailed = false;
    mainWorldCaptionTracksVideoId = null;
  } else {
    log(
      "Preserving MAIN-world caption cache for video:",
      preserveCaptionCacheForVideoId,
    );
  }

  fetchedLyrics = null;
  lyricsByVersion = {};
  currentLyricsVersion = "default";

  // Reset translation state
  translatedLyrics = null;
  currentTranslationLang = null;
  isTranslationMode = false;

  previousLineIndex = -1;
  lyricsRendered = false;
  currentLyricText = "";

  // Stop sync
  if (videoEventListeners) {
    const video = document.querySelector("video");
    if (video) {
      video.removeEventListener("timeupdate", videoEventListeners.onTimeUpdate);
      video.removeEventListener("pause", videoEventListeners.onPause);
      video.removeEventListener("play", videoEventListeners.onPlay);
    }
    videoEventListeners = null;
  }

  // UI Reset via Store
  if (reason === "source changed") {
    updateSecondaryLyricsState({
      lyrics: [],
      translatedLyrics: [],
      romanizedLyrics: [],
      activeIndex: -1,
      isLoading: true,
      isProcessingLyrics: false,
      headerText: "Searching for lyrics...",
      lyricsSource: null,
      lyricsLanguage: null,
      isExpanded: true,
    });
    if (hasLocalStorageApi()) {
      chrome.storage.local.remove("activeLyricsSource").catch(() => {});
    }
  } else if (reason === "all sources failed") {
    useAppStore.getState().resetLyricsOnly();
  } else {
    useAppStore.getState().reset();
  }
}

import { parseLRC as parseLRCNew, lrcFixers } from "./lrcParser";

function setFetchedSourceLyrics({
  sourceId,
  label,
  lyrics,
  language = null,
  synced = true,
}) {
  if (!Array.isArray(lyrics) || lyrics.length === 0) return false;

  fetchedLyrics = lyrics;
  lyricsByVersion.default = {
    id: sourceId,
    label,
    synced,
    lyrics,
  };

  lyricsJustLoaded = true;
  lyricsRendered = false;
  isTripleLineMode = false;

  useAppStore
    .getState()
    .setLyrics(lyrics, sourceId, detectLyricsLanguage(lyrics, language));

  persistLyricsCache(currentSongInfo, sourceId, lyrics, {
    label,
    language,
    synced,
  });

  const inlineRomanized = lyrics.map((line) => ({
    time: line.time,
    romanized: line.romanization || "",
    timedRomanization: line.timedRomanization || null,
  }));
  const inlineTranslated = lyrics.map((line) => ({
    time: line.time,
    translated: line.translation || "",
  }));

  if (
    inlineRomanized.some((line) => line.romanized) ||
    inlineTranslated.some((line) => line.translated)
  ) {
    updateSecondaryLyricsState({
      romanizedLyrics: inlineRomanized,
      translatedLyrics: inlineTranslated,
    });
  }

  if (synced) {
    startLyricsTimer(lyrics);
  } else {
    stopLyricsTimer();
    useAppStore.getState().setActiveIndex(-1);
  }

  autoProcessLyrics();
  setTimeout(() => (lyricsJustLoaded = false), 2000);

  return true;
}

/**
 * Try to fetch from Cubey (Better Lyrics / Musixmatch aggregator)
 */
async function tryFetchCubey(songInfo, preferredIdentity = "better_lyrics") {
  if (!window.CubeyProvider) return false;

  log("Attempting Cubey fetch...");
  const data = await window.CubeyProvider.fetchLyrics(songInfo);
  if (!data) return false;

  // PRIORITY 1: RichSync (Word-by-Word)
  if (data.musixmatchWordByWordLyrics) {
    log("💎 Found RichSync (Syllable) Data!");
    const richLyrics = parseLRCNew(data.musixmatchWordByWordLyrics);
    lrcFixers(richLyrics); // Fix gaps/short durations

    if (richLyrics && richLyrics.length) {
      const richSourceIdentity =
        preferredIdentity === "musixmatch"
          ? "musixmatch-richsync"
          : "better_lyrics";
      const richLabel =
        preferredIdentity === "musixmatch" ? "Musixmatch" : "Better Lyrics";

      fetchedLyrics = richLyrics;
      lyricsByVersion.default = {
        id: "cubey-rich",
        label: richLabel,
        synced: true,
        lyrics: richLyrics,
      };

      lyricsJustLoaded = true;
      lyricsRendered = false;
      isTripleLineMode = false;

      // Update store with explicit "better_lyrics" source to trigger animation engine
      useAppStore
        .getState()
        .setLyrics(
          richLyrics,
          richSourceIdentity,
          detectLyricsLanguage(richLyrics),
        );
      persistLyricsCache(currentSongInfo, richSourceIdentity, richLyrics, {
        label: richLabel,
      });

      startLyricsTimer(richLyrics);
      autoProcessLyrics();
      setTimeout(() => (lyricsJustLoaded = false), 2000);
      return true;
    }
  }

  // PRIORITY 2: Line Synced (Standard)
  const rawLrc = data.musixmatchSyncedLyrics || data.lrclibSyncedLyrics;

  if (rawLrc) {
    // Legacy parser for standard LRC if new one fails (or just use new one for both?)
    // New parser supports standard LRC too, so let's stick to it for consistency
    const lyrics = parseLRCNew(rawLrc);

    if (lyrics && lyrics.length) {
      log(`[Lyrical] ✅ Cubey found Line-Synced lyrics.`);

      fetchedLyrics = lyrics;
      lyricsByVersion.default = {
        id: "cubey",
        label: data.musixmatchSyncedLyrics ? "Musixmatch" : "LRCLib",
        synced: true,
        lyrics: lyrics,
      };

      lyricsJustLoaded = true;
      lyricsRendered = false;
      isTripleLineMode = false;

      useAppStore
        .getState()
        .setLyrics(lyrics, "musixmatch", detectLyricsLanguage(lyrics));
      persistLyricsCache(currentSongInfo, "musixmatch", lyrics, {
        label: data.musixmatchSyncedLyrics ? "Musixmatch" : "LRCLib",
      });

      startLyricsTimer(lyrics);
      autoProcessLyrics();
      setTimeout(() => (lyricsJustLoaded = false), 2000);

      return true;
    }
  }
  return false;
}

async function tryFetchUnifiedSource(songInfo, sourceId) {
  const data = await fetchUnifiedSourceLyrics(songInfo, sourceId);
  if (!data) return false;

  return setFetchedSourceLyrics({
    sourceId: data.sourceId,
    label: data.label,
    lyrics: data.lyrics,
    language: data.language,
    synced: true,
  });
}

async function tryFetchUnisonSource(songInfo, sourceId) {
  const data = await fetchUnisonSourceLyrics(songInfo, sourceId);
  if (!data) return false;

  return setFetchedSourceLyrics({
    sourceId: data.sourceId,
    label: data.label,
    lyrics: data.lyrics,
    language: data.language,
    synced: sourceId !== "unison-plain",
  });
}

/**
 * Display pre-fetched caption lyrics (directly from captions-extractor.js)
 */
async function displayPrefetchedCaptions(lyrics, languageCode) {
  if (!lyrics || lyrics.length === 0) {
    log("displayPrefetchedCaptions: No lyrics provided");
    return false;
  }

  log(
    "Displaying pre-fetched captions:",
    lyrics.length,
    "lines, lang:",
    languageCode,
  );

  fetchedLyrics = normalizeCaptionTiming(lyrics);
  const currentVideoId = new URLSearchParams(window.location.search).get("v");
  if (currentVideoId) {
    // MAIN world already resolved captions for this video.
    lastFetchedVideoId = currentVideoId;
  }
  lyricsByVersion.default = {
    id: "captions",
    label: `Captions (${languageCode || "auto"})`,
    synced: true,
    lyrics: fetchedLyrics,
  };

  lyricsJustLoaded = true;
  lyricsRendered = false;
  useAppStore
    .getState()
    .setLyrics(
      fetchedLyrics,
      "captions",
      detectLyricsLanguage(fetchedLyrics, languageCode),
    );
  persistLyricsCache(currentSongInfo, "captions", fetchedLyrics, {
    label: `Captions (${languageCode || "auto"})`,
    language: languageCode || null,
  });
  startLyricsTimer(fetchedLyrics);
  if (window.initTranslationDropdown) {
    window.initTranslationDropdown();
  }
  autoProcessLyrics();

  setTimeout(() => {
    lyricsJustLoaded = false;
  }, 2000);

  return true;
}

async function sendMessageWithTimeout(payload, timeoutMs = 120000) {
  return await Promise.race([
    chrome.runtime.sendMessage(payload),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`Timed out waiting for ${payload.type}`)),
        timeoutMs,
      ),
    ),
  ]);
}

/**
 * Fetch and parse caption lyrics via BACKGROUND SCRIPT
 * This bypasses CORS and uses the extension's host permissions
 */

/**
 * Fetch captions using youtube-caption-extractor via BACKGROUND SCRIPT
 * This bypasses CORS and uses the new library for robust fetching
 * SECONDARY / FALLBACK METHOD
 */
async function fetchCaptionsViaLib(_videoId = null) {
  // baseUrl arg is ignored, we extract videoId from page
  const videoId = new URLSearchParams(window.location.search).get("v");
  if (!videoId) return null;

  try {
    log("Fetching captions via library for:", videoId);

    // Request background script to fetch
    const response = await chrome.runtime.sendMessage({
      type: "FETCH_YOUTUBE_SUBTITLES",
      videoId: videoId,
      lang: "en",
    });

    if (!response || !response.success || !response.data) {
      log("Library fetch failed:", response?.error || "No data");
      return null;
    }

    const rawSubtitles = response.data; // [{start, dur, text}, ...]
    log("Library returned subtitles:", rawSubtitles.length);

    // Convert to Lyrical format
    const lyrics = rawSubtitles
      .map((item) => ({
        time: parseFloat(item.start),
        duration: parseFloat(item.duration || item.dur),
        text: cleanCaptionText(item.text),
      }))
      .filter((l) => l.text && l.text.trim());

    return lyrics;
  } catch (err) {
    console.error("[Lyrical] Fetch caption error:", err);
    return null;
  }
}

function normalizeCaptionTiming(lyrics) {
  if (!Array.isArray(lyrics) || lyrics.length === 0) return lyrics;

  const normalized = lyrics.map((line) => ({
    ...line,
    time: Number.isFinite(line.time) ? line.time : 0,
    duration: Number.isFinite(line.duration) ? line.duration : 0,
  }));

  const maxTime = normalized.reduce((m, l) => Math.max(m, l.time || 0), 0);

  // Heuristic: if we have a lot of lines but tiny max time, timestamps are likely
  // compressed by wrong unit conversion (e.g., seconds treated as milliseconds).
  if (normalized.length > 200 && maxTime > 0 && maxTime < 30) {
    for (const line of normalized) {
      line.time *= 1000;
      line.duration *= 1000;
    }
  }

  // Ensure strictly increasing timeline to avoid binary-search jumping to the end.
  for (let i = 1; i < normalized.length; i++) {
    if (normalized[i].time <= normalized[i - 1].time) {
      normalized[i].time = normalized[i - 1].time + 0.02;
    }
  }

  return normalized;
}

function getCaptionTrackLang(track) {
  return track?.languageCode || track?.lang || null;
}

function getCaptionTrackName(track) {
  return track?.name?.simpleText || track?.name || "";
}

function getCaptionTrackUrl(track) {
  const raw = track?.baseUrl || track?.url || null;
  if (!raw) return null;
  return String(raw)
    .replace(/\\u0026/g, "&")
    .replace(/&amp;/g, "&");
}

function isTranslatedEnglishTrack(track) {
  if (getCaptionTrackLang(track) !== "en") return false;
  const url = (getCaptionTrackUrl(track) || "").toLowerCase();
  const name = getCaptionTrackName(track).toLowerCase();
  return (
    url.includes("tlang=en") ||
    name.includes("english (translated)") ||
    name.includes("translated english")
  );
}

/**
 * Try to display captions (Hybrid Strategy)
 * Aligned with ytCaptions.ts approach from better-lyrics:
 * 1. Prefer manual captions over auto-generated (ASR)
 * 2. Try Direct Fetch with json3 format first
 * 3. Fallback to Library Fetch (youtube-caption-extractor)
 *
 * Key differences from ytCaptions.ts:
 * - We run in isolated content script world, not main world
 * - We get caption tracks from postMessage (captions-extractor.js in MAIN world)
 * - We use fetch + library fallback instead of direct API access
 */
async function tryDisplayCaptions() {
  const videoId = new URLSearchParams(window.location.search).get("v");
  if (!videoId) return false;
  if (!canDisplayCaptionsForCurrentFetch()) return false;

  log("Attempting to load captions for video:", videoId);

  let lyrics = null;
  let methodUsed = "none";
  let languageCode = null;

  // METHOD 0: Consume MAIN-world prefetched captions, but only when this
  // ordered captions source is being evaluated.
  if (
    pendingMainWorldCaptionLyrics &&
    pendingMainWorldCaptionLyrics.length > 0 &&
    (!pendingMainWorldCaptionVideoId ||
      pendingMainWorldCaptionVideoId === videoId)
  ) {
    lyrics = pendingMainWorldCaptionLyrics;
    languageCode = pendingMainWorldCaptionLanguage || "auto";
    methodUsed = "main-world-prefetch";
    log("Using queued MAIN-world prefetched captions:", lyrics.length);
  }

  // --- METHOD 1: Direct Fetch (Aligned with ytCaptions.ts approach) ---
  if (!lyrics && availableCaptions && availableCaptions.length > 0) {
    log(
      "Available caption tracks:",
      availableCaptions.map((t) => ({
        lang: getCaptionTrackLang(t),
        kind: t.kind,
        name: getCaptionTrackName(t),
      })),
    );

    const manualTracks = availableCaptions.filter(
      (t) =>
        t.kind !== "asr" &&
        !getCaptionTrackName(t).toLowerCase().includes("auto-generated"),
    );
    const asrTracks = availableCaptions.filter(
      (t) =>
        t.kind === "asr" ||
        getCaptionTrackName(t).toLowerCase().includes("auto-generated"),
    );

    const orderedTracks = [...manualTracks, ...asrTracks];
    const selectedTrack = orderedTracks[0];

    if (selectedTrack) {
      const selectedTrackUrl = getCaptionTrackUrl(selectedTrack);
      if (selectedTrackUrl) {
        lyrics = await fetchCaptionsFromContentScript(selectedTrackUrl);
        if (lyrics && lyrics.length > 0) {
          methodUsed = "direct";
          languageCode = getCaptionTrackLang(selectedTrack) || languageCode;
        }
      }
    }
  }

  // --- METHOD 2: Library Fallback (youtube-caption-extractor) ---
  if (!lyrics) {
    log("Direct fetch failed or no tracks. Trying Library Fallback...");
    lyrics = await fetchCaptionsViaLib(videoId);
    if (lyrics) {
      methodUsed = "library";
      languageCode = languageCode || "auto";
    }
  }

  log(
    "Caption fetch result:",
    lyrics ? `${lyrics.length} lines (${methodUsed})` : "null/empty",
  );

  if (lyrics && lyrics.length > 0) {
    if (!lockCurrentFetchWinner("captions")) {
      log(
        "Skipping caption display because another source already won this session",
      );
      return false;
    }

    // Clean up any remaining artifacts and filter blanks
    lyrics = lyrics
      .map((line) => ({
        ...line,
        text: cleanCaptionText(line.text),
      }))
      .filter((line) => Boolean(line.text && line.text.trim()));

    log("Captions loaded:", lyrics.length);

    // Apply ALL CAPS fix (same as ytCaptions.ts)
    const allCaps = lyrics.every(
      (line) => line.text && line.text.toUpperCase() === line.text,
    );
    if (allCaps) {
      log("Applying ALL CAPS fix to captions");
      lyrics = lyrics.map((line) => ({
        ...line,
        text:
          line.text.substring(0, 1).toUpperCase() +
          line.text.substring(1).toLowerCase(),
      }));
    }

    fetchedLyrics = normalizeCaptionTiming(lyrics);
    const currentVideoId = new URLSearchParams(window.location.search).get("v");
    if (currentVideoId) {
      lastFetchedVideoId = currentVideoId;
    }
    lyricsByVersion.default = {
      id: "captions",
      label: `Captions (${languageCode || "auto"})`,
      synced: true,
      lyrics: fetchedLyrics,
    };

    lyricsJustLoaded = true;
    lyricsRendered = false;
    useAppStore
      .getState()
      .setLyrics(
        fetchedLyrics,
        "captions",
        detectLyricsLanguage(fetchedLyrics, languageCode),
      );
    persistLyricsCache(currentSongInfo, "captions", fetchedLyrics, {
      label: `Captions (${languageCode || "auto"})`,
      language: languageCode || null,
    });
    startLyricsTimer(fetchedLyrics);

    // Init translation if needed (restored)
    if (window.initTranslationDropdown) window.initTranslationDropdown();

    autoProcessLyrics();

    // Keep title/artwork in sync even when captions arrive before song metadata.
    if (!currentSongInfo?.title || !currentSongInfo?.artwork) {
      hydrateSongInfoWithRetry(8, 300).catch(() => {});
    }

    setTimeout(() => {
      lyricsJustLoaded = false;
    }, 2000);

    if (methodUsed === "main-world-prefetch") {
      pendingMainWorldCaptionLyrics = null;
      pendingMainWorldCaptionLanguage = null;
      pendingMainWorldCaptionVideoId = null;
    }

    return true;
  }

  return false;
}

async function waitForMainWorldCaptionSignals(timeoutMs = 2500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (
      pendingMainWorldCaptionFailed ||
      (pendingMainWorldCaptionLyrics &&
        pendingMainWorldCaptionLyrics.length > 0)
    ) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  return false;
}

async function waitForCaptionsAndRetry(timeoutMs = 12000) {
  const start = Date.now();
  let lastRetryAt = 0;
  const minRetryGapMs = 900;

  while (Date.now() - start < timeoutMs) {
    if (pendingMainWorldCaptionFailed) {
      log("Aborting caption wait: MAIN world confirmed extraction failure.");
      return false;
    }

    const hasCaptionSignals =
      (availableCaptions && availableCaptions.length > 0) ||
      (pendingMainWorldCaptionLyrics &&
        pendingMainWorldCaptionLyrics.length > 0);

    if (hasCaptionSignals) {
      const now = Date.now();
      if (now - lastRetryAt >= minRetryGapMs) {
        lastRetryAt = now;
        log("Late caption tracks detected, retrying caption source...");
        const ok = await tryDisplayCaptions();
        if (ok) return true;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

// Auto-fetch lyrics function
let fetchDebounceTimer = null;

// Auto-fetch lyrics for a song
/**
 * Try to fetch from Boidu API (High Priority)
 */
async function tryFetchBoidu(songInfo, sourceId = "lyrical") {
  const { boiduApiKey } = useAppStore.getState();
  log("Fetching lyrics from Boidu (Better Lyrics TTML path)...");

  // Call the dedicated service module
  const data = await fetchBoiduLyrics(songInfo, boiduApiKey);

  if (data) {
    log(
      `[Boidu] Found ${data.type || "unknown"} lyrics with ${data.lyrics.length} lines.`,
    );

    if (data.lyrics && data.lyrics.length) {
      fetchedLyrics = data.lyrics;

      // Register version for potential switching
      lyricsByVersion.default = {
        id: "lyrical-boidu",
        label:
          sourceId === "test-lyrical"
            ? "Test Lyrical (Boidu)"
            : "Lyrical (Boidu)",
        synced: true,
        lyrics: data.lyrics,
        source: "boidu",
      };

      lyricsJustLoaded = true;
      lyricsRendered = false;

      // Trigger Store Update
      useAppStore
        .getState()
        .setLyrics(
          data.lyrics,
          sourceId,
          detectLyricsLanguage(data.lyrics, data.language),
        );
      persistLyricsCache(currentSongInfo, sourceId, data.lyrics, {
        label:
          sourceId === "test-lyrical"
            ? "Test Lyrical (Boidu)"
            : "Lyrical (Boidu)",
        language: data.language || null,
      });

      const inlineRomanized = data.lyrics.map((line) => ({
        time: line.time,
        romanized: line.romanization || "",
        timedRomanization: line.timedRomanization || null,
      }));
      const inlineTranslated = data.lyrics.map((line) => ({
        time: line.time,
        translated: line.translation || "",
      }));

      if (
        inlineRomanized.some((line) => line.romanized) ||
        inlineTranslated.some((line) => line.translated)
      ) {
        updateSecondaryLyricsState({
          romanizedLyrics: inlineRomanized,
          translatedLyrics: inlineTranslated,
        });
      }

      startLyricsTimer(data.lyrics);
      autoProcessLyrics();

      setTimeout(() => (lyricsJustLoaded = false), 2000);
      return true;
    }
  }

  return false;
}

/**
 * Try to fetch from LRCLIB
 */
async function tryFetchLRCLib(songInfo) {
  const query = `${songInfo.title} ${songInfo.artist}`.trim();
  log("Fetching lyrics from lrclib for:", query);

  try {
    const response = await fetch(
      `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`,
      { signal: AbortSignal.timeout(3500) },
    );
    const results = await response.json();

    if (Array.isArray(results) && results.length > 0) {
      const match = results.find((candidate) => {
        if (!candidate?.syncedLyrics) return false;
        const parsed = parseLRCNew(candidate.syncedLyrics);
        return Array.isArray(parsed) && parsed.length > 0;
      });

      if (!match) {
        log("LRCLib returned results, but none contained usable synced lyrics");
        return false;
      }

      // Update song info from API response if we have better data
      if (match.artistName && match.trackName) {
        // Update our stored song info with API data
        const newInfo = {
          ...currentSongInfo,
          artist: match.artistName,
          title: match.trackName,
          album: match.albumName || currentSongInfo.album,
        };
        currentSongInfo = newInfo;
        // Update the display immediately
        updateSongInfo(currentSongInfo);
      }

      const parsedLyrics = parseLRCNew(match.syncedLyrics);

      if (parsedLyrics && parsedLyrics.length > 0) {
        fetchedLyrics = parsedLyrics;
        lyricsByVersion.default = {
          id: "lrclib",
          label: "LRCLib",
          synced: true,
          lyrics: parsedLyrics,
        };

        lyricsJustLoaded = true;
        lyricsRendered = false;
        isTripleLineMode = false;
        isTripleLineMode = false;
        isTripleLineMode = false;
        useAppStore
          .getState()
          .setLyrics(
            parsedLyrics,
            "lrclib",
            detectLyricsLanguage(parsedLyrics),
          );
        persistLyricsCache(currentSongInfo, "lrclib", parsedLyrics, {
          label: "LRCLib",
        });
        startLyricsTimer(parsedLyrics);
        autoProcessLyrics();

        setTimeout(() => {
          lyricsJustLoaded = false;
        }, 2000);
        return true;
      }

      log("LRCLib match was selected but produced no parsed lines");
    }
  } catch (e) {
    log("LRCLib fetch failed:", e?.message || e);
  }
  return false;
}

async function preScanAvailableCachedSources(
  songInfo: any,
  enabledSources: any[],
  maxCacheAgeMs: number,
) {
  if (!songInfo?.artist || !songInfo?.title) return;
  useAppStore.getState().clearAvailableLyricsSources();

  const allKeysMap = new Map<string, string>();
  for (const source of enabledSources) {
    const lookupIds = getCacheLookupIdsForSource(source.id);
    for (const subId of lookupIds) {
      const key = getLyricsCacheKey(songInfo, subId);
      if (key) allKeysMap.set(key, subId);
    }
  }

  if (allKeysMap.size === 0) return;
  const keysArray = Array.from(allKeysMap.keys());
  try {
    const cachedEntries = await chrome.storage.local.get(keysArray);
    for (const key of keysArray) {
      const entry = cachedEntries[key];
      if (entry?.lyrics?.length) {
        const cacheAge = Date.now() - entry.timestamp;
        if (cacheAge < maxCacheAgeMs) {
          const actualSourceId = allKeysMap.get(key);
          if (actualSourceId) {
            useAppStore.getState().addAvailableLyricsSource(actualSourceId);
          }
        }
      }
    }
  } catch (e) {
    // ignore
  }
}

async function backgroundPreScanAllSources(
  songInfo: any,
  enabledSources: any[],
  winningSourceId: string,
  fetchSessionId: number,
) {
  if (!songInfo?.artist || !songInfo?.title) return;

  const isStale = () =>
    fetchSessionId !== activeFetchSessionId ||
    currentFetchVideoId !==
      new URLSearchParams(window.location.search).get("v");

  const alreadyAvailable = new Set(
    useAppStore.getState().availableLyricsSources,
  );
  if (winningSourceId) alreadyAvailable.add(winningSourceId);

  const remainingSources = enabledSources.filter(
    (s) => !alreadyAvailable.has(s.id),
  );
  if (remainingSources.length === 0) return;

  log(
    `[Lyrical Background Discovery] Pre-scanning ${remainingSources.length} remaining sources for: "${songInfo.title}"`,
  );

  for (const source of remainingSources) {
    if (isStale()) return;
    if (useAppStore.getState().availableLyricsSources.includes(source.id))
      continue;

    try {
      // 1. Check if already cached in storage
      const lookupIds = getCacheLookupIdsForSource(source.id);
      let isCached = false;
      for (const subId of lookupIds) {
        const key = getLyricsCacheKey(songInfo, subId);
        if (key) {
          const res = await chrome.storage.local.get(key);
          const entry = res?.[key];
          if (entry?.lyrics?.length) {
            const cacheAge = Date.now() - (entry.timestamp || 0);
            if (cacheAge < 1000 * 60 * 60 * 24 * 7) {
              isCached = true;
              useAppStore.getState().addAvailableLyricsSource(source.id);
              break;
            }
          }
        }
      }
      if (isCached || isStale()) continue;

      // 2. Silent background fetch for uncached source
      let fetchedData: any = null;
      if (
        [
          "bLyrics-synced",
          "binimum-richsynced",
          "binimum-synced",
          "portato-richsynced",
          "legato-synced",
          "musixmatch-synced",
          "musixmatch-richsync",
        ].includes(source.id)
      ) {
        fetchedData = await fetchUnifiedSourceLyrics(songInfo, source.id);
      } else if (
        ["unison-richsynced", "unison-synced", "unison-plain"].includes(
          source.id,
        )
      ) {
        fetchedData = await fetchUnisonSourceLyrics(songInfo, source.id);
      } else if (source.id === "lyrical" || source.id === "test-lyrical") {
        const boiduRes = await fetchBoiduLyrics(
          songInfo,
          useAppStore.getState().boiduApiKey,
        );
        if (boiduRes?.lyrics?.length) {
          fetchedData = {
            sourceId: source.id,
            label:
              source.id === "test-lyrical"
                ? "Test Lyrical (Boidu)"
                : "Lyrical (Boidu)",
            lyrics: boiduRes.lyrics,
            language: boiduRes.language || null,
          };
        }
      } else if (source.id === "musixmatch" || source.id === "better_lyrics") {
        if (window.CubeyProvider) {
          const cubeyData = await window.CubeyProvider.fetchLyrics(songInfo);
          if (cubeyData?.musixmatchWordByWordLyrics) {
            const parsed = parseLRCNew(cubeyData.musixmatchWordByWordLyrics);
            lrcFixers(parsed);
            if (parsed && parsed.length) {
              fetchedData = {
                sourceId: source.id,
                label:
                  source.id === "musixmatch" ? "Musixmatch" : "Better Lyrics",
                lyrics: parsed,
                language: null,
              };
            }
          }
        }
      } else if (source.id === "lrclib") {
        const query = `${songInfo.title} ${songInfo.artist}`.trim();
        const response = await fetch(
          `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`,
        );
        const results = await response.json();
        if (Array.isArray(results) && results.length > 0) {
          const match = results.find((c) => c?.syncedLyrics);
          if (match?.syncedLyrics) {
            const parsed = parseLRCNew(match.syncedLyrics);
            if (parsed && parsed.length > 0) {
              fetchedData = {
                sourceId: "lrclib",
                label: "LRCLib",
                lyrics: parsed,
                language: null,
              };
            }
          }
        }
      }

      if (isStale()) return;

      if (fetchedData?.lyrics?.length) {
        persistLyricsCache(
          songInfo,
          fetchedData.sourceId || source.id,
          fetchedData.lyrics,
          {
            label: fetchedData.label || source.label,
            language: fetchedData.language || null,
            synced: true,
          },
        );
        useAppStore.getState().addAvailableLyricsSource(source.id);
        log(
          `[Lyrical Background Discovery] ✅ Discovered & cached lyrics for ${source.label}`,
        );
      }
    } catch (e) {
      log(
        `[Lyrical Background Discovery] ${source.id} background scan note:`,
        e?.message || e,
      );
    }
  }
}

// Auto-fetch lyrics for a song
async function autoFetchLyrics(songInfo, options: any = {}) {
  if (!songInfo || !songInfo.title) return;

  // 🔥 Use videoId as source of truth (not title/artist)
  const videoId = new URLSearchParams(window.location.search).get("v");
  if (!videoId) return;

  if (
    fetchedLyrics &&
    fetchedLyrics.length > 0 &&
    lastFetchedVideoId === videoId &&
    useAppStore.getState().lyricsSource === "captions"
  ) {
    log(
      "Skipping fetch loop: captions already loaded for current video",
      videoId,
    );
    return;
  }

  // Same video → do nothing
  if (videoId === lastFetchedVideoId) return;

  // GUARD: Ensure panel is ready before updating
  if (!lyricsPanel || !document.body.contains(lyricsPanel)) {
    setTimeout(() => autoFetchLyrics(songInfo), 300);
    return;
  }

  // 🔥 DEBOUNCE
  if (fetchDebounceTimer) clearTimeout(fetchDebounceTimer);

  const isFirstVideoFetch = !lastFetchedVideoId;

  // New video detected
  lastFetchedVideoId = videoId;
  const fetchSessionId = ++activeFetchSessionId;
  currentFetchVideoId = videoId;
  captionSourceReachedForCurrentFetch = false;
  const { sourcePreferences } = useAppStore.getState();
  const enabledSources = sourcePreferences.filter((s) => s.enabled);
  resetCurrentFetchSourceGuard();
  log("New video detected:", videoId);

  const isStaleFetch = () =>
    fetchSessionId !== activeFetchSessionId ||
    videoId !== new URLSearchParams(window.location.search).get("v");

  // Reset state
  resetLyricsState(options.reason || "video changed", {
    preserveCaptionCacheForVideoId: videoId,
  });
  currentSongInfo = songInfo;
  updateSongInfo(songInfo);
  if (!songInfo?.artwork) {
    hydrateSongInfoWithRetry(8, 280).catch(() => {});
  }

  // Set loading state in store
  useAppStore.setState({
    isLoading: true,
    headerText: "Searching for lyrics...",
  });

  const MAX_CACHE_AGE = 1000 * 60 * 60 * 24 * 7; // 7 days

  preScanAvailableCachedSources(songInfo, enabledSources, MAX_CACHE_AGE).catch(
    () => {},
  );

  try {
    if (isStaleFetch()) return;
    log(
      "[Lyrical] Fetching with priority:",
      enabledSources.map((s) => s.id),
    );

    let found = false;
    let captionsTried = false;

    for (const source of enabledSources) {
      if (isStaleFetch()) return;
      if (found) break;
      log(`[Lyrical] Trying source: ${source.label}`);

      // Always try to restore from cache first to respect source priority
      found = await tryRestoreCachedLyricsForSource(
        songInfo,
        source,
        MAX_CACHE_AGE,
      );
      if (isStaleFetch()) return;
      if (found) {
        lockCurrentFetchWinner(source.id);
        break;
      }

      switch (source.id) {
        case "lyrical":
          try {
            found = await tryFetchBoidu(songInfo);
          } catch (e) {
            console.error("Boidu fetch crashed loop", e);
            found = false;
          }
          break;
        case "test-lyrical":
          try {
            found = await tryFetchBoidu(songInfo, "test-lyrical");
          } catch (e) {
            console.error("Test Boidu fetch crashed loop", e);
            found = false;
          }
          break;
        case "better_lyrics":
          // Placeholder for now, typically same as Cubey but maybe different endpoint?
          // Using Cubey provider for Better Lyrics too for now as they are likely same backend
          found = await tryFetchCubey(songInfo, "better_lyrics");
          break;
        case "unison-richsynced":
        case "unison-synced":
        case "unison-plain":
          found = await tryFetchUnisonSource(songInfo, source.id);
          break;
        case "bLyrics-synced":
        case "binimum-richsynced":
        case "binimum-synced":
        case "portato-richsynced":
        case "legato-synced":
        case "musixmatch-synced":
          found = await tryFetchUnifiedSource(songInfo, source.id);
          break;
        case "musixmatch":
          found = await tryFetchCubey(songInfo, "musixmatch");
          break;
        case "lrclib":
          found = await tryFetchLRCLib(songInfo);
          break;
        case "captions":
          captionsTried = true;
          captionSourceReachedForCurrentFetch = true;
          if (
            (!availableCaptions || availableCaptions.length === 0) &&
            (!pendingMainWorldCaptionLyrics ||
              pendingMainWorldCaptionLyrics.length === 0)
          ) {
            const signalWaitMs = isFirstVideoFetch ? 5000 : 2000;
            log(
              "Waiting for main-world caption signals before caption fetch...",
              signalWaitMs,
              "ms",
            );
            await waitForMainWorldCaptionSignals(signalWaitMs);
            if (isStaleFetch()) return;
          }
          found = await tryDisplayCaptions();
          break;
      }

      if (found && !currentFetchWinningSourceId) {
        lockCurrentFetchWinner(source.id);
      }

      // Captions can be injected asynchronously via MAIN world postMessage while
      // this source loop is still running. Treat that as a successful fetch.
      if (!found && fetchedLyrics && fetchedLyrics.length > 0) {
        found = true;
        log("Lyrics already loaded asynchronously - stopping source loop");
        break;
      }
    }

    // YouTube captions can arrive after source loop starts (postMessage timing).
    if (!found && captionsTried) {
      if (isStaleFetch()) return;
      const hasCaptionSignals =
        (availableCaptions && availableCaptions.length > 0) ||
        (pendingMainWorldCaptionLyrics &&
          pendingMainWorldCaptionLyrics.length > 0);

      // One delayed retry after ordered loop: helps first-load readiness lag.
      if (hasCaptionSignals) {
        log("Running delayed caption recovery retry...");
        await new Promise((resolve) => setTimeout(resolve, 1000));
        if (isStaleFetch()) return;
        found = await tryDisplayCaptions();
      }

      if (!found) {
        const captionWaitTimeoutMs = isFirstVideoFetch ? 20000 : 12000;
        found = await waitForCaptionsAndRetry(captionWaitTimeoutMs);
      }
    }

    if (!found && fetchedLyrics && fetchedLyrics.length > 0) {
      found = true;
      log("Lyrics were loaded asynchronously after source loop");
    }

    if (found) {
      const winningId =
        currentFetchWinningSourceId ||
        useAppStore.getState().lyricsSource ||
        "";
      backgroundPreScanAllSources(
        songInfo,
        enabledSources,
        winningId,
        fetchSessionId,
      ).catch(() => {});
    }

    if (!found) {
      if (isStaleFetch()) return;

      const captionsEnabled = enabledSources.some(
        (s) => s.id === "captions" && s.enabled,
      );
      const hasCaptionSignalsForCurrentVideo =
        captionsEnabled &&
        ((availableCaptions &&
          availableCaptions.length > 0 &&
          mainWorldCaptionTracksVideoId === videoId) ||
          (pendingMainWorldCaptionLyrics &&
            pendingMainWorldCaptionLyrics.length > 0 &&
            pendingMainWorldCaptionVideoId === videoId));

      // Last-second guard: don't reset immediately if caption signals are present.
      // Try one more caption recovery pass first.
      if (hasCaptionSignalsForCurrentVideo) {
        log(
          "Caption signals detected at final stage, running one more recovery pass",
        );
        await new Promise((resolve) => setTimeout(resolve, 800));
        if (isStaleFetch()) return;
        const recovered = await tryDisplayCaptions();
        if (recovered) {
          log("Recovered captions at final stage; skipping reset");
          return;
        }
      }

      const existingLyrics = useAppStore.getState().lyrics || [];
      const shouldKeepExistingLyrics =
        options.reason !== "source changed" && existingLyrics.length > 0;
      if (
        (fetchedLyrics && fetchedLyrics.length > 0) ||
        shouldKeepExistingLyrics
      ) {
        log("Not resetting lyrics: another fetch path already loaded data");
        return;
      }
      log("No lyrics found from any enabled source");
      resetLyricsState("all sources failed", {
        preserveCaptionCacheForVideoId: videoId,
      });
    }
  } catch (error) {
    console.error("[Lyrical Panel] Fetch error:", error);
  } finally {
    useAppStore.setState({ isLoading: false });
  }
}

window.addEventListener("lyrical-select-source", async (event: any) => {
  const sourceId = event.detail?.sourceId;
  if (!sourceId || !currentSongInfo) return;

  log("[Lyrical] User manually selected source:", sourceId);
  const { sourcePreferences } = useAppStore.getState();
  const sourceObj = sourcePreferences.find((s) => s.id === sourceId) || {
    id: sourceId,
    label: sourceId,
    enabled: true,
    tags: [],
  };

  const MAX_CACHE_AGE = 1000 * 60 * 60 * 24 * 7;
  const restored = await tryRestoreCachedLyricsForSource(
    currentSongInfo,
    sourceObj,
    MAX_CACHE_AGE,
  );
  if (restored) {
    log("[Lyrical] Successfully switched to cached source:", sourceId);
    return;
  }

  // If not in cache, try fetching from that source directly
  useAppStore.setState({ isLoading: true });
  let found = false;
  switch (sourceId) {
    case "lyrical":
      try {
        found = await tryFetchBoidu(currentSongInfo);
      } catch (e) {}
      break;
    case "better_lyrics":
      found = await tryFetchCubey(currentSongInfo, "better_lyrics");
      break;
    case "unison-richsynced":
    case "unison-synced":
    case "unison-plain":
      found = await tryFetchUnisonSource(currentSongInfo, sourceId);
      break;
    case "bLyrics-synced":
    case "binimum-richsynced":
    case "binimum-synced":
    case "portato-richsynced":
    case "legato-synced":
    case "musixmatch-synced":
      found = await tryFetchUnifiedSource(currentSongInfo, sourceId);
      break;
    case "musixmatch":
      found = await tryFetchCubey(currentSongInfo, "musixmatch");
      break;
    case "lrclib":
      found = await tryFetchLRCLib(currentSongInfo);
      break;
    case "captions":
      found = await tryDisplayCaptions();
      break;
  }
  useAppStore.setState({ isLoading: false });
});

/**
 * Auto-process lyrics based on settings (React Store Version)
 */
async function autoProcessLyrics() {
  if (!fetchedLyrics || fetchedLyrics.length === 0) {
    log("No lyrics to auto-process");
    return;
  }
  try {
    let {
      isRomanizationEnabled,
      isTranslateEnabled,
      translationLanguage,
      romanizationExclusions,
      translationExclusions,
    }: any = await new Promise((resolve) =>
      chrome.storage.sync.get(
        {
          isRomanizationEnabled: false,
          isTranslateEnabled: false,
          translationLanguage: "en",
          romanizationExclusions: [],
          translationExclusions: [],
        },
        resolve,
      ),
    );

    const lyricsLanguage = useAppStore.getState().lyricsLanguage || "";

    if (
      isRomanizationEnabled &&
      lyricsLanguage &&
      romanizationExclusions.includes(lyricsLanguage.toLowerCase())
    ) {
      log("Auto-process: Romanization excluded for language", lyricsLanguage);
      isRomanizationEnabled = false;
    }

    if (
      isTranslateEnabled &&
      lyricsLanguage &&
      translationExclusions.includes(lyricsLanguage.toLowerCase())
    ) {
      log("Auto-process: Translation excluded for language", lyricsLanguage);
      isTranslateEnabled = false;
    }

    // Reset if nothing enabled
    if (!isRomanizationEnabled && !isTranslateEnabled) {
      log("Auto-process: All disabled or excluded");
      updateSecondaryLyricsState({ translatedLyrics: [], romanizedLyrics: [] });
      return;
    }

    log("Auto-processing lyrics:", {
      romanize: isRomanizationEnabled,
      translate: isTranslateEnabled,
      lang: translationLanguage,
    });

    // Set loading indicator via store
    useAppStore.getState().setIsProcessingLyrics(true);

    let romanizedData: any = [];
    let translatedData: any = [];

    const processingTimeoutMs = Math.max(
      120000,
      (fetchedLyrics?.length || 0) * 1200,
    );

    // Romanize (via Background)
    if (isRomanizationEnabled) {
      try {
        log("Sending ROMANIZE_LYRICS to background...");
        romanizedData = await sendMessageWithTimeout(
          {
            type: "ROMANIZE_LYRICS",
            lyrics: fetchedLyrics,
            sourceLang: "auto",
          },
          processingTimeoutMs,
        );
        if (romanizedData?.error) {
          console.warn(
            "[Lyrical Panel] Romanization error:",
            romanizedData.error,
          );
          romanizedData = [];
        }
      } catch (err) {
        console.warn("[Lyrical Panel] Romanization failed:", err);
        romanizedData = [];
      }
    }

    // Translate (via Background)
    if (isTranslateEnabled) {
      try {
        const lyricsLanguage = useAppStore.getState().lyricsLanguage;

        if (
          lyricsLanguage &&
          lyricsLanguage.toLowerCase() === translationLanguage.toLowerCase()
        ) {
          log(
            "Skipping translation - source language matches target:",
            translationLanguage,
          );
          translatedData = fetchedLyrics.map((lyric) => ({
            time: lyric.time,
            text: lyric.text,
            translated: "",
            skipped: true,
            error: false,
          }));
        } else {
          log(
            "[Lyrical Panel] Sending TRANSLATE_LYRICS to background...",
            translationLanguage,
          );
          translatedData = await sendMessageWithTimeout(
            {
              type: "TRANSLATE_LYRICS",
              lyrics: fetchedLyrics,
              targetLang: translationLanguage,
            },
            processingTimeoutMs,
          );
        }
        if (translatedData?.error) {
          console.warn(
            "[Lyrical Panel] Translation error:",
            translatedData.error,
          );
          translatedData = [];
        }
      } catch (err) {
        console.warn("[Lyrical Panel] Translation failed:", err);
        translatedData = [];
      }
    }

    log("Updating store with processed lyrics");
    updateSecondaryLyricsState({
      romanizedLyrics: romanizedData || [],
      translatedLyrics: translatedData || [],
      isProcessingLyrics: false,
    });

    // Persist processed translations and romanizations into persistent cache
    const currentSourceId = useAppStore.getState().lyricsSource;
    if (currentSongInfo && currentSourceId && fetchedLyrics?.length) {
      persistLyricsCache(currentSongInfo, currentSourceId, fetchedLyrics, {
        romanizedLyrics: romanizedData || [],
        translatedLyrics: translatedData || [],
      });
    }
  } catch (err) {
    useAppStore.getState().setIsProcessingLyrics(false);
    if (err.message?.includes("Extension context invalidated")) return;
    console.error("[Lyrical Panel] Auto-process error:", err);
  }
}

/**
 * Stop the lyrics sync timer
 */
function stopLyricsTimer() {
  activeTimerSessionId++;
  if (videoEventListeners) {
    const video = document.querySelector("video");
    if (video && videoEventListeners.onTimeUpdate) {
      video.removeEventListener("timeupdate", videoEventListeners.onTimeUpdate);
      if (videoEventListeners.onPause) {
        video.removeEventListener("pause", videoEventListeners.onPause);
      }
      if (videoEventListeners.onPlay) {
        video.removeEventListener("play", videoEventListeners.onPlay);
      }
    }
    videoEventListeners = null;
  }
}

// Binary search for finding lyric index (much faster than loop)
function findLyricIndex(lyrics, time) {
  let low = 0,
    high = lyrics.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lyrics[mid].time <= time) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return high;
}

// Start lyrics sync with video timeupdate event (industry-standard)
let videoEventListeners = null;
let activeTimerSessionId = 0;

async function startLyricsTimer(lyrics) {
  const timerSessionId = ++activeTimerSessionId;
  if (!Array.isArray(lyrics) || lyrics.length === 0) {
    log("startLyricsTimer skipped: no parsed lyrics available");
    return;
  }
  const video = document.querySelector("video");
  if (!video) {
    console.warn("[Lyrical Panel] Video element not found");
    return;
  }

  // Clean up old listeners
  if (videoEventListeners) {
    video.removeEventListener("timeupdate", videoEventListeners.onTimeUpdate);
    video.removeEventListener("pause", videoEventListeners.onPause);
    video.removeEventListener("play", videoEventListeners.onPlay);
  }

  let currentIndex = -1;

  // PER-SONG OFFSET: Load stored correction for this specific song
  const videoId = new URLSearchParams(window.location.search).get("v");
  const songKey = videoId
    ? `offset_${videoId}`
    : `${currentSongInfo?.artist || "unknown"}__${currentSongInfo?.title || "unknown"}`;
  let songOffset = 0;

  try {
    const { songOffsets = {} } = await chrome.storage.sync.get("songOffsets");
    if (timerSessionId !== activeTimerSessionId) return;
    songOffset = songOffsets[songKey] ?? 0;

    // Safety clamp: prevent disasters (wider range for long intros - 2 minutes)
    songOffset = Math.min(120.0, Math.max(-120.0, songOffset));

    if (songOffset !== 0) {
      log(
        "[Lyrical Panel] 📝 Using stored offset for this song:",
        songOffset.toFixed(2),
        "s",
      );
    }
  } catch (err) {
    if (timerSessionId !== activeTimerSessionId) return;
    if (err.message.includes("Extension context invalidated")) {
      log(
        "[Lyrical Panel] Extension context invalidated (reloaded). Stopping execution.",
      );
      return;
    }
    console.warn("[Lyrical Panel] Could not load song offset:", err);
  }

  // FINAL OFFSET: Platform + Song-specific (set globally for live updates)
  if (timerSessionId !== activeTimerSessionId) return;
  userSongOffset = songOffset;
  currentSyncOffset = PLATFORM_OFFSET + userSongOffset;

  // 🔥 SYNC REACT STORE WITH STORED OFFSET (This updates the slider UI)
  useAppStore.getState().setOffset(currentSyncOffset, userSongOffset);

  log(
    "[Lyrical Panel] 📝 Loaded saved offset for song:",
    songKey,
    "offset:",
    userSongOffset.toFixed(2),
    "s",
  );

  log(
    "[Lyrical Panel] Starting lyrics sync (platform:",
    PLATFORM_OFFSET,
    "s, song:",
    userSongOffset.toFixed(2),
    "s, total:",
    currentSyncOffset.toFixed(2),
    "s)",
  );

  console.table(
    lyrics.slice(0, 10).map((l) => ({
      time: l.time.toFixed(2),
      text: l.text.slice(0, 30),
    })),
  );

  const onTimeUpdate = () => {
    // 🔒 SYNC ENGINE (DO NOT TOUCH)
    const adjustedTime = video.currentTime + currentSyncOffset;
    const newIndex = findLyricIndex(lyrics, adjustedTime);

    if (newIndex !== currentIndex && newIndex >= 0) {
      currentIndex = newIndex;
      log(
        "[Lyrical Panel] Line",
        currentIndex,
        "at",
        adjustedTime.toFixed(1),
        "s:",
        lyrics[currentIndex].text,
      );

      const {
        romanizedLyrics = [],
        translatedLyrics = [],
        isRomanizationEnabled: romanizationEnabled,
        isTranslateEnabled: translationEnabled,
      } = useAppStore.getState();
      const romanizedEntry: any = romanizedLyrics?.[currentIndex] || {};
      const translatedEntry: any = translatedLyrics?.[currentIndex] || {};
      const romanizedLine =
        romanizedEntry.romanized || romanizedEntry.romanization || "";
      const translatedLine =
        translatedEntry.translated || translatedEntry.translation || "";

      log(
        "[Lyrical Panel] Line",
        currentIndex,
        "romanized:",
        romanizedLine || "(empty)",
        "| enabled:",
        Boolean(romanizationEnabled),
      );
      log(
        "[Lyrical Panel] Line",
        currentIndex,
        "translated:",
        translatedLine || "(empty)",
        "| enabled:",
        Boolean(translationEnabled),
      );

      // Update store directly
      useAppStore.getState().setActiveIndex(currentIndex);
    }
  };

  const onPause = () => {
    log("Video paused - sync paused");
  };

  const onPlay = () => {
    log("Video playing - sync active");
  };

  // Store listeners for cleanup
  videoEventListeners = { onTimeUpdate, onPause, onPlay };

  // Attach event listeners (no more setInterval!)
  video.addEventListener("timeupdate", onTimeUpdate);
  video.addEventListener("pause", onPause);
  video.addEventListener("play", onPlay);

  // Initial sync
  onTimeUpdate();
}

// Check if we should inject based on URL
function shouldInject() {
  const url = window.location.href;
  const hostname = window.location.hostname;

  if (hostname.includes("youtube.com")) {
    return url.includes("/watch") && url.includes("v=");
  }

  if (hostname.includes("spotify.com")) {
    return true;
  }

  return false;
}

// 🔧 Helper to check if we're on YouTube watch page
function isYouTubeWatchPage() {
  return (
    window.location.hostname.includes("youtube.com") &&
    window.location.href.includes("/watch") &&
    window.location.href.includes("v=") &&
    document.querySelector("ytd-watch-flexy")
  );
}

// Initialize panel
async function initialize() {
  log("Initialize called");
  log("Current URL:", window.location.hostname);

  if (
    !window.location.hostname.includes("youtube.com") &&
    !window.location.hostname.includes("spotify.com")
  ) {
    log("Not a supported site, skipping init");
    return;
  }

  log("Is a music site, proceeding with injection...");

  // Inject panel based on site
  if (window.location.hostname.includes("youtube.com")) {
    log("Setting up YouTube navigation listener");

    // yt-page-data-updated is already attached globally at top-level
    // Only need to attach yt-navigate-finish here
    // Song detection now happens immediately after injection via queueMicrotask

    // ✅ OPTIMIZATION: Event-based detection instead of polling
    // Listen for YouTube navigation events (fires when user navigates to new video)
    function onYouTubeNavigation() {
      log(
        "[Lyrical Panel] yt-navigate-finish fired, URL:",
        window.location.href,
      );

      // 🔥 FIX: On first navigation, don't blindly ignore - check if it's a watch page
      // With document_start, the URL isn't ready in initialize(), so this IS the real first-load
      if (!hasHandledFirstNavigation) {
        hasHandledFirstNavigation = true;

        const isWatchUrl =
          window.location.href.includes("/watch") &&
          window.location.href.includes("v=");
        if (isWatchUrl) {
          log(
            "[Lyrical Panel] First navigation IS a watch page - treating as first-load",
          );
          waitForStableVideo(() => {
            injectIntoYouTube();
            const info = window.getSongInfoFromPage?.();
            if (info) autoFetchLyrics(info);
          });
        } else {
          log("[Lyrical Panel] First navigation ignored (not a watch page)");
        }
        return;
      }

      log("YouTube navigation detected");

      // � FIX: Use URL-based check instead of isYouTubeWatchPage() which requires DOM elements
      const isWatchUrl =
        window.location.href.includes("/watch") &&
        window.location.href.includes("v=");

      // �🔴 If NOT on watch page → remove panel
      if (!isWatchUrl) {
        if (lyricsPanel) {
          lyricsPanel.remove();
          lyricsPanel = null;
          log("Left watch page — panel removed");
        }
        return;
      }

      // ✅ On watch page → reset state and use video-driven injection
      log(
        "[Lyrical Panel] On watch page, using waitForStableVideo for injection",
      );
      lyricsRendered = false;
      lastInjectedVideoId = null; // Reset to allow reinjection

      waitForStableVideo(() => {
        injectIntoYouTube();
        const info = window.getSongInfoFromPage?.();
        if (info) autoFetchLyrics(info);
      });
    }

    // ✅ FIX 2: Attach listener only once
    if (!youtubeNavListenerAttached) {
      window.addEventListener("yt-navigate-finish", onYouTubeNavigation);
      youtubeNavListenerAttached = true;
      log("YouTube navigation listener attached");
    } else {
      log("Navigation listener already attached");
    }

    // 🔥 CRITICAL: Video-driven first-load injection
    // Inject ONLY after video is stable (readyState >= 2) and #secondary exists
    // This solves the first-load issue permanently - video is the only stable signal
    log("[Lyrical Panel] Checking first-load URL:", window.location.href);
    const isWatchUrl =
      window.location.href.includes("/watch") &&
      window.location.href.includes("v=");
    log("isWatchUrl:", isWatchUrl);
    if (isWatchUrl) {
      log(
        "[Lyrical Panel] First-load watch URL detected, waiting for stable video...",
      );
      waitForStableVideo(() => {
        injectIntoYouTube();
        const info = window.getSongInfoFromPage?.();
        if (info) autoFetchLyrics(info);
      });
    } else {
      log(
        "[Lyrical Panel] Not a watch URL on first load, skipping first-load injection",
      );
    }
  } else if (window.location.hostname.includes("spotify.com")) {
    log("Injecting into Spotify");
    // injectIntoSpotify();

    // Immediate first fetch
    setTimeout(async () => {
      const response = await chrome.runtime
        .sendMessage({ action: "get_song_info" })
        .catch(() => null);
      if (response && response.title) {
        autoFetchLyrics(response);
      }
    }, 2000);

    // Start auto-detecting song changes
    setInterval(() => {
      if (typeof window.getSongInfoFromPage === "function") {
        const response = window.getSongInfoFromPage();

        if (response && response.title) {
          const songKey = `${response.artist}_${response.title}`;
          const currentKey = currentSongInfo
            ? `${currentSongInfo.artist}_${currentSongInfo.title}`
            : null;

          if (songKey !== currentKey) {
            log("New song detected!");
            autoFetchLyrics(response);
          }
        }
      }
    }, 3000);
  }
}

// Settings UI Instance
let settingsUI = null;

// Listen for settings changes to trigger instant updates
window.addEventListener("lyrical-setting-change", (e) => {
  const { setting, value } = e.detail;
  log(`[Lyrical Panel] Setting changed: ${setting} = ${value}`);
  autoProcessLyrics();
});

// Listen for messages from background/popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  log("Message received:", request.action, request);

  if (request.action === "update_lyrics") {
    updateLyrics(request.syncedLyrics, request.currentLineIndex);
    if (request.songInfo) {
      updateSongInfo(request.songInfo);
    }
    sendResponse({ success: true });
  } else if (request.action === "toggle_panel") {
    if (lyricsPanel) {
      lyricsPanel.style.display =
        lyricsPanel.style.display === "none" ? "block" : "none";
    }
    sendResponse({ success: true });
  } else if (request.type === "TOGGLE_SETTINGS") {
    if (!settingsUI && window.SettingsUI) {
      settingsUI = new SettingsUI();
    }
    if (settingsUI) {
      settingsUI.toggle();
    }
    sendResponse({ success: true });
  }
  return true;
});

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  initialize();
}

// Pause sync when tab is hidden (save CPU)
document.addEventListener("visibilitychange", () => {
  const video = document.querySelector("video");
  if (document.hidden && videoEventListeners && video) {
    log("Tab hidden - removing event listeners");
    video.removeEventListener("timeupdate", videoEventListeners.onTimeUpdate);
    video.removeEventListener("pause", videoEventListeners.onPause);
    video.removeEventListener("play", videoEventListeners.onPlay);
  } else if (!document.hidden && fetchedLyrics && video) {
    log("Tab visible - resuming sync");
    startLyricsTimer(fetchedLyrics);
  }
});

// ✅ URL polling removed - using yt-navigate-finish event instead (see above)
// This prevents double re-initialization and saves CPU
