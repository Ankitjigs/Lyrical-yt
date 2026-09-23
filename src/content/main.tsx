// Content script for in-page lyrics panel injection
import React from "react";
import { createRoot } from "react-dom/client";
import LyricsPanel from "./components/LyricsPanel";
import KaraokeOverlay from "./components/KaraokeOverlay";
import MiniCompanion from "./components/MiniCompanion";
import { useAppStore, isRichsyncSourceId } from "./store";
import { log, warn, error, setDebugMode } from "./utils/logger";
import { fetchBoiduLyrics } from "../modules/sources/boidu";
import {
  fetchUnifiedSourceLyrics,
  fetchUnisonSourceLyrics,
} from "../modules/sources/unified";
import { fetchYouLyPlusSourceLyrics } from "../modules/sources/youlyplus";
import panelStyles from "./styles.css?inline";
import lyricsEffectsStyles from "./lyricsEffects.css?inline";
import archivetuneEffectsStyles from "./archivetuneEffects.css?inline";
import karaokeEffectsStyles from "./karaokeEffects.css?inline";
import shinyTextStyles from "./components/ShinyText.css?inline";
import { CUSTOM_THEMES_STORAGE_KEY, DEFAULT_THEME_ID } from "../themes";
import { resolveCustomThemes } from "../themes/customThemeUtils";
import type { CaptionTrackInfo } from "../types/lyrics";
import { vocalRemover } from "../modules/audio/vocalRemover";
import {
  detectAutoSyncOffset,
  getFirstVocalLyricTime,
  getLastVocalLyricTime,
} from "../modules/sync/autoSyncDetector";
import { detectNonCaptionIntroOffset } from "../modules/sync/sponsorBlockSync";
import { normalizeLyricsPipeline } from "../modules/lyrics/lyricsNormalizer";

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
  archivetuneEffectsStyles,
  shinyTextStyles,
].join("\n");

const KARAOKE_SHADOW_STYLES = [
  CONTENT_SHADOW_STYLES,
  karaokeEffectsStyles,
].join("\n");

// Helper keys for per-song and per-source offset storage
function getSongVideoCacheKey(
  songInfo?: any,
  explicitVideoId?: string | null,
): string {
  const info = songInfo || currentSongInfo;
  const v =
    explicitVideoId ||
    getCurrentVideoId(info) ||
    "unknown_video";
  const title = (info?.title || "").trim();
  if (title) {
    return `${title} - ${v}`;
  }
  return v;
}

function getSourceOffsetProp(sourceId?: string | null): string {
  let s = (sourceId || useAppStore.getState().lyricsSource || "default").trim();
  if (s === "musixmatch-richsync") s = "musixmatch_richsync";
  else if (s === "musixmatch") s = "musixmatch";
  else if (s === "musixmatch-synced") s = "musixmatch_synced";
  else s = s.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();

  return s.endsWith("_offset") ? s : `${s}_offset`;
}

function parseSongKeyInfo(
  songKeyOrSongId?: string | null,
  sourceIdOverride?: string | null,
): { songId: string; videoId: string; prop: string; flatKey: string } {
  const currentSource =
    sourceIdOverride || useAppStore.getState().lyricsSource || "default";
  let extractedVideoId = getCurrentVideoId(currentSongInfo) || "unknown_video";
  let extractedSource = currentSource;

  if (songKeyOrSongId && songKeyOrSongId.startsWith("offset_")) {
    const parts = songKeyOrSongId.slice("offset_".length).split("_");
    if (parts.length >= 2) {
      extractedVideoId = parts[0];
      extractedSource = sourceIdOverride || parts.slice(1).join("_");
    } else if (parts.length === 1) {
      extractedVideoId = parts[0];
    }
  }

  const songId = getSongVideoCacheKey(currentSongInfo, extractedVideoId);
  const prop = getSourceOffsetProp(extractedSource);
  const flatKey = `offset_${extractedVideoId}_${extractedSource}`;

  return { songId, videoId: extractedVideoId, prop, flatKey };
}

function getSongOffsetKey(
  videoId: string | null | undefined,
  sourceId?: string | null | undefined,
): string {
  const v = videoId || getCurrentVideoId(currentSongInfo) || "unknown_video";
  const s = sourceId || useAppStore.getState().lyricsSource || "default";
  return `offset_${v}_${s}`;
}

function getLegacySongOffsetKey(videoId: string | null | undefined): string {
  const v = videoId || getCurrentVideoId(currentSongInfo);
  return v
    ? `offset_${v}`
    : `${currentSongInfo?.artist || "unknown"}__${currentSongInfo?.title || "unknown"}`;
}

// This script creates and manages the lyrics panel on YouTube/Spotify pages

// Sync UI state back to logic
useAppStore.subscribe((state, prevState) => {
  // Sync Offset
  const offsetChanged = state.userOffset !== prevState.userOffset;
  const trimChanged =
    state.richsyncOffsetTrim !== prevState.richsyncOffsetTrim ||
    state.lineOffsetTrim !== prevState.lineOffsetTrim;

  if (offsetChanged || trimChanged) {
    userSongOffset = state.userOffset;
    const isCaptions = state.lyricsSource === "captions";
    const isRich = isRichsyncSourceId(state.lyricsSource, state.lyrics);
    const trim = isRich
      ? state.richsyncOffsetTrim || 0
      : state.lineOffsetTrim || 0;
    currentSyncOffset =
      (isCaptions ? 0 : PLATFORM_OFFSET) + userSongOffset + trim;

    if (offsetChanged && currentSongInfo && !isCaptions) {
      if (suppressNextOffsetPersistence) {
        suppressNextOffsetPersistence = false;
      } else {
        const videoId = getCurrentVideoId(currentSongInfo);
        const songKey = getSongOffsetKey(videoId, state.lyricsSource);
        saveStoredSongOffset(songKey, userSongOffset).catch(() => {});
      }
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

  // Ensure Karaoke Overlay is mounted whenever Karaoke Mode is active
  if (state.isKaraokeMode) {
    ensureKaraokeOverlay();
  }
});

log("VERSION 2.1 - Script loaded!", window.location.href);
log("Panel Timestamp:", new Date().toISOString());

// Initialize debug state from storage
if (chrome.storage) {
  chrome.storage.sync.get(
    {
      showLogs: false,
      richsyncOffsetTrim: 0,
      lineOffsetTrim: 0,
      isRomanizationEnabled: false,
      isTranslateEnabled: false,
      translationLanguage: "en",
      compactMode: false,
      lyricsSizePreset: "standard",
      lyricsAnimationStyle: "better-lyrics",
      isKaraokeMode: false,
      karaokePosition: "bottom",
      karaokeCustomPosition: 80,
      karaokeFontSize: "medium",
      karaokeAnimationStyle: "classic",
      isVocalMuted: false,
      vocalCutDepth: 1.0,
      vocalBassCutoff: 160,
      vocalBalanceTrim: 0,
      vocalReverbDampening: false,
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
      albumArtTransition: "shuffle",
      titleTransition: "spring",
      scrollLongTitles: true,
      showProgressBar: true,
      reopenFloatingLyricsAutomatically: false,
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
        richsyncOffsetTrim:
          typeof res.richsyncOffsetTrim === "number"
            ? res.richsyncOffsetTrim
            : 0,
        lineOffsetTrim:
          typeof res.lineOffsetTrim === "number" ? res.lineOffsetTrim : 0,
        isRomanizationEnabled: res.isRomanizationEnabled,
        isTranslateEnabled: res.isTranslateEnabled,
        translationLanguage: res.translationLanguage,
        compactMode: res.compactMode,
        lyricsSizePreset: res.lyricsSizePreset || "standard",
        lyricsAnimationStyle: res.lyricsAnimationStyle || "better-lyrics",
        isKaraokeMode: Boolean(res.isKaraokeMode),
        karaokePosition: res.karaokePosition || "bottom",
        karaokeCustomPosition:
          typeof res.karaokeCustomPosition === "number"
            ? res.karaokeCustomPosition
            : 80,
        karaokeFontSize: res.karaokeFontSize || "medium",
        karaokeAnimationStyle: res.karaokeAnimationStyle || "classic",
        isVocalMuted: Boolean(res.isVocalMuted),
        vocalCutDepth:
          typeof res.vocalCutDepth === "number" ? res.vocalCutDepth : 1.0,
        vocalBassCutoff:
          typeof res.vocalBassCutoff === "number" ? res.vocalBassCutoff : 160,
        vocalBalanceTrim:
          typeof res.vocalBalanceTrim === "number" ? res.vocalBalanceTrim : 0,
        vocalReverbDampening: Boolean(res.vocalReverbDampening),
        reduceAnimations: res.reduceAnimations,
        showCollapsedArtwork: res.showCollapsedArtwork ?? true,
        displayMode: res.displayMode || "sidebar",
        floatingPositionPreset: res.floatingPositionPreset || "right",
        floatingCustomPosition: res.floatingCustomPosition || null,
        romanizationExclusions: res.romanizationExclusions || [],
        translationExclusions: res.translationExclusions || [],
        customThemes: hydratedCustomThemes,
        themeId: res.themeId || DEFAULT_THEME_ID,
        albumArtTransition: res.albumArtTransition || "shuffle",
        titleTransition: res.titleTransition || "spring",
        scrollLongTitles: res.scrollLongTitles ?? true,
        showProgressBar: res.showProgressBar ?? true,
        reopenFloatingLyricsAutomatically:
          res.reopenFloatingLyricsAutomatically ?? false,
      };

      vocalRemover.updateSettings({
        cutDepth: updates.vocalCutDepth,
        bassCutoff: updates.vocalBassCutoff,
        balanceTrim: updates.vocalBalanceTrim,
        reverbDampening: updates.vocalReverbDampening,
      });

      // Only set if exists, otherwise keep store default
      if (res.sourcePreferences) {
        updates.sourcePreferences = res.sourcePreferences;
      }

      useAppStore.getState().setSettings(updates);
      applyWrapperPlacement();
      if (res.isKaraokeMode) {
        ensureKaraokeOverlay();
      }

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

  // 10. Lyrics Animation Style
  if (changes.lyricsAnimationStyle) {
    useAppStore.setState({
      lyricsAnimationStyle:
        changes.lyricsAnimationStyle.newValue || "better-lyrics",
    });
  }

  // 11. Show Collapsed Artwork
  if (changes.showCollapsedArtwork) {
    useAppStore.setState({
      showCollapsedArtwork: Boolean(changes.showCollapsedArtwork.newValue),
    });
  }

  // 12. Karaoke Mode & Position
  if (changes.isKaraokeMode) {
    const isKaraoke = Boolean(changes.isKaraokeMode.newValue);
    useAppStore.getState().setSettings({ isKaraokeMode: isKaraoke });
    if (isKaraoke) {
      ensureKaraokeOverlay();
    } else {
      useAppStore.setState({ isVocalMuted: false });
      void vocalRemover.setMuted(false);
    }
  }

  if (changes.karaokePosition) {
    useAppStore.setState({
      karaokePosition: changes.karaokePosition.newValue || "bottom",
    });
  }

  if (changes.karaokeCustomPosition) {
    useAppStore.setState({
      karaokeCustomPosition:
        typeof changes.karaokeCustomPosition.newValue === "number"
          ? changes.karaokeCustomPosition.newValue
          : 80,
    });
  }

  if (changes.karaokeFontSize) {
    useAppStore.setState({
      karaokeFontSize: changes.karaokeFontSize.newValue || "medium",
    });
  }

  if (changes.karaokeAnimationStyle) {
    useAppStore.setState({
      karaokeAnimationStyle:
        changes.karaokeAnimationStyle.newValue || "classic",
    });
  }

  // 13. Real-time Vocal Removal (Instrumental Filter)
  if (changes.isVocalMuted !== undefined) {
    const isMuted = Boolean(changes.isVocalMuted.newValue);
    useAppStore.setState({ isVocalMuted: isMuted });
    void vocalRemover.setMuted(isMuted);
  }

  if (
    changes.vocalCutDepth !== undefined ||
    changes.vocalBassCutoff !== undefined ||
    changes.vocalBalanceTrim !== undefined ||
    changes.vocalReverbDampening !== undefined
  ) {
    const cutDepth =
      typeof changes.vocalCutDepth?.newValue === "number"
        ? changes.vocalCutDepth.newValue
        : useAppStore.getState().vocalCutDepth;
    const bassCutoff =
      typeof changes.vocalBassCutoff?.newValue === "number"
        ? changes.vocalBassCutoff.newValue
        : useAppStore.getState().vocalBassCutoff;
    const balanceTrim =
      typeof changes.vocalBalanceTrim?.newValue === "number"
        ? changes.vocalBalanceTrim.newValue
        : useAppStore.getState().vocalBalanceTrim;
    const reverbDampening =
      typeof changes.vocalReverbDampening?.newValue === "boolean"
        ? changes.vocalReverbDampening.newValue
        : useAppStore.getState().vocalReverbDampening;

    useAppStore.setState({
      vocalCutDepth: cutDepth,
      vocalBassCutoff: bassCutoff,
      vocalBalanceTrim: balanceTrim,
      vocalReverbDampening: reverbDampening,
    });
    vocalRemover.updateSettings({
      cutDepth,
      bassCutoff,
      balanceTrim,
      reverbDampening,
    });
  }

  // 14. Sync Trims (Richsync & Linesync)
  if (
    changes.richsyncOffsetTrim &&
    typeof changes.richsyncOffsetTrim.newValue === "number"
  ) {
    useAppStore
      .getState()
      .setRichsyncOffsetTrim(changes.richsyncOffsetTrim.newValue);
  }
  if (
    changes.lineOffsetTrim &&
    typeof changes.lineOffsetTrim.newValue === "number"
  ) {
    useAppStore.getState().setLineOffsetTrim(changes.lineOffsetTrim.newValue);
  }

  // 15. Floating Window & Transition Settings
  if (changes.albumArtTransition) {
    useAppStore.setState({
      albumArtTransition: changes.albumArtTransition.newValue || "shuffle",
    });
  }
  if (changes.titleTransition) {
    useAppStore.setState({
      titleTransition: changes.titleTransition.newValue || "spring",
    });
  }
  if (changes.scrollLongTitles) {
    useAppStore.setState({
      scrollLongTitles:
        changes.scrollLongTitles.newValue !== undefined
          ? Boolean(changes.scrollLongTitles.newValue)
          : true,
    });
  }
  if (changes.showProgressBar) {
    useAppStore.setState({
      showProgressBar:
        changes.showProgressBar.newValue !== undefined
          ? Boolean(changes.showProgressBar.newValue)
          : true,
    });
  }
  if (changes.reopenFloatingLyricsAutomatically) {
    useAppStore.setState({
      reopenFloatingLyricsAutomatically:
        changes.reopenFloatingLyricsAutomatically.newValue !== undefined
          ? Boolean(changes.reopenFloatingLyricsAutomatically.newValue)
          : false,
    });
  }
  if (changes.showMiniCompanion !== undefined) {
    useAppStore.setState({
      showMiniCompanion:
        changes.showMiniCompanion.newValue !== undefined
          ? Boolean(changes.showMiniCompanion.newValue)
          : true,
    });
    checkAndManageMiniCompanion();
  }
  if (changes.miniCompanionCustomPosition !== undefined) {
    useAppStore.setState({
      miniCompanionCustomPosition:
        changes.miniCompanionCustomPosition.newValue || null,
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

@property --at-transition-amount-start {
  syntax: "<number>";
  inherits: true;
  initial-value: 0;
}

@property --at-transition-amount-end {
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
let pendingMainWorldCaptionTrack: any = null;
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
  const liveVideoId = getCurrentVideoId(currentSongInfo);

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

  if (useAppStore.getState().isAdPlaying) {
    log("Cannot display captions while ad is playing");
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

  if (
    event.data?.type === "LYRICAL_CLEAR_CAPTIONS" ||
    event.data?.type === "LYRICAL_CLEAR_AD_CAPTIONS"
  ) {
    log(
      "[Lyrical] Clearing captions and resetting caption state for video:",
      event.data?.videoId || "unknown",
    );
    availableCaptions = [];
    pendingMainWorldCaptionLyrics = null;
    pendingMainWorldCaptionTrack = null;
    pendingMainWorldCaptionLanguage = null;
    pendingMainWorldCaptionVideoId = null;
    mainWorldCaptionTracksVideoId = null;
    if (useAppStore.getState().lyricsSource === "captions") {
      fetchedLyrics = null;
      currentFetchWinningSourceId = null;
      useAppStore.getState().resetLyricsOnly();
    }
    return;
  }

  if (event.data?.type === "LYRICAL_AD_STATE_CHANGED") {
    const isAd = Boolean(event.data.isAd);
    log("[Lyrical] Ad state changed:", isAd ? "Ad playing" : "Ad finished");
    useAppStore.getState().setIsAdPlaying(isAd);

    if (isAd) {
      useAppStore.setState({
        headerText: "Ad in progress...",
      });
      // Try to ensure we already have the real video title from the page DOM
      const realInfo = window.getSongInfoFromPage?.();
      if (
        realInfo &&
        realInfo.title &&
        realInfo.title.toUpperCase() !== "UNLABELED"
      ) {
        updateSongInfo(realInfo);
      }
    } else {
      // Ad finished! Clear any stale ad captions and re-hydrate for the real video
      log("[Lyrical] Re-hydrating song info for real video after ad finished");
      availableCaptions = [];
      pendingMainWorldCaptionLyrics = null;
      pendingMainWorldCaptionTrack = null;
      pendingMainWorldCaptionLanguage = null;
      pendingMainWorldCaptionVideoId = null;
      mainWorldCaptionTracksVideoId = null;
      if (useAppStore.getState().lyricsSource === "captions") {
        fetchedLyrics = null;
        currentFetchWinningSourceId = null;
        useAppStore.getState().resetLyricsOnly();
      }

      hydrateSongInfoWithRetry(8, 250).then(() => {
        const info = currentSongInfo || window.getSongInfoFromPage?.();
        if (info && info.title && info.title.toUpperCase() !== "UNLABELED") {
          updateSongInfo(info);
          autoFetchLyrics(info, { reason: "ad finished" });
        }
      });
    }
    return;
  }

  if (event.data.type === "LYRICAL_CAPTIONS_FOUND") {
    if (useAppStore.getState().isAdPlaying) {
      log(
        "[Lyrical] Ignoring caption tracks/lyrics received while ad is playing",
      );
      return;
    }

    const tracks = event.data.tracks || [];
    const eventVideoId = event.data.videoId || null;
    const currentVideoId = getCurrentVideoId(currentSongInfo);
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

    // Normalize caption tracks and store them for the dock picker
    syncAvailableCaptionTracks(tracks);

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
      pendingMainWorldCaptionTrack = event.data.selectedTrack;
      pendingMainWorldCaptionVideoId = currentVideoId || eventVideoId || null;
      log(
        "Queued pre-fetched captions from main world:",
        lyrics.length,
        "lines",
        "lang:",
        pendingMainWorldCaptionLanguage,
      );

      // Recovery hook: when lyrics arrive late from MAIN world, run a delayed
      // caption retry if nothing is currently shown.
      if (currentVideoId && (!fetchedLyrics || fetchedLyrics.length === 0)) {
        log("Late MAIN-world captions arrived; triggering delayed recovery");
        setTimeout(() => {
          const liveVideoId = getCurrentVideoId(currentSongInfo);
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

    // ⚡ Late arrival auto-sync: if rich lyrics are already active for this video,
    // but the user hasn't set a manual offset yet, run auto-sync now that captions are here!
    const liveSyncVideoId =
      (typeof currentVideoId !== "undefined" && currentVideoId) ||
      getCurrentVideoId(currentSongInfo);
    if (liveSyncVideoId) {
      const state = useAppStore.getState();
      if (state.lyricsSource !== "captions") {
        const activeLyrics = state.lyrics;
        if (Array.isArray(activeLyrics) && activeLyrics.length > 0) {
          const activeSongKey = getSongOffsetKey(
            liveSyncVideoId,
            state.lyricsSource,
          );
          const fallbackKey = getLegacySongOffsetKey(liveSyncVideoId);
          getStoredSongOffset(activeSongKey, fallbackKey)
            .then((stored) => {
              const lastVocalTime = getLastVocalLyricTime(activeLyrics);
              const video = getActiveMediaVideoElement();
              const videoDuration = video?.duration || 0;
              const isInvalidStoredIntro =
                stored !== null &&
                stored >= 1.5 &&
                lastVocalTime !== null &&
                videoDuration > 0 &&
                lastVocalTime + stored > videoDuration + 2.0;

              const isZeroNonCaptionOffset =
                stored !== null &&
                Math.abs(stored) <= 0.05 &&
                state.lyricsSource !== "captions";

              if (stored === null || isInvalidStoredIntro || isZeroNonCaptionOffset) {
                tryAutoDetectOffset(
                  activeLyrics,
                  activeSongKey,
                  liveSyncVideoId,
                ).then((detected) => {
                  if (detected !== null && detected !== userSongOffset) {
                    userSongOffset = detected;
                    const isRich = isRichsyncSourceId(
                      state.lyricsSource,
                      activeLyrics,
                    );
                    const trim = isRich
                      ? state.richsyncOffsetTrim || 0
                      : state.lineOffsetTrim || 0;
                    currentSyncOffset = PLATFORM_OFFSET + userSongOffset + trim;
                    useAppStore
                      .getState()
                      .setOffset(currentSyncOffset, userSongOffset);
                    log(
                      "[Lyrical Auto-Sync] ⚡ Applied late auto-detected offset:",
                      detected,
                      "s",
                    );
                  }
                });
              }
            })
            .catch(() => {});
        }
      }
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
  words = words.replace(/[♪♫🎵🎶]/g, "").trim();

  // 3. Remove sound effect annotations at start and end
  words = words.replace(
    /^\s*\[(?:music|applause|laughter|cheering|chuckles|groans|sighs|gasp|screaming)[^\]]*\]\s*/gi,
    "",
  );
  words = words.replace(
    /^\s*\((?:music|applause|laughter|cheering|chuckles|groans|sighs|gasp|screaming)[^)]*\)\s*/gi,
    "",
  );
  words = words.replace(
    /\s*\[(?:music|applause|laughter|cheering|chuckles|groans|sighs|gasp|screaming)[^\]]*\]\s*$/gi,
    "",
  );
  words = words.replace(
    /\s*\((?:music|applause|laughter|cheering|chuckles|groans|sighs|gasp|screaming)[^)]*\)\s*$/gi,
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
async function fetchCaptionsFromContentScript(url, track = null) {
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

  const isAsr =
    track?.kind === "asr" ||
    track?.isAsr ||
    String(track?.vssId || track?.name || "")
      .toLowerCase()
      .includes("auto");

  const candidateUrls = [];
  try {
    const u1 = new URL(url);
    u1.searchParams.set("fmt", "json3");
    if (isAsr && !u1.searchParams.has("kind")) {
      u1.searchParams.set("kind", "asr");
    }
    candidateUrls.push(u1.toString());
  } catch {}

  try {
    const u2 = new URL(url);
    u2.searchParams.set("fmt", "srv3");
    if (isAsr && !u2.searchParams.has("kind")) {
      u2.searchParams.set("kind", "asr");
    }
    candidateUrls.push(u2.toString());
  } catch {}

  try {
    const u3 = new URL(url);
    if (u3.searchParams.has("exp")) {
      u3.searchParams.delete("exp");
      u3.searchParams.set("fmt", "json3");
      if (isAsr && !u3.searchParams.has("kind")) {
        u3.searchParams.set("kind", "asr");
      }
      candidateUrls.push(u3.toString());
    }
  } catch {}

  if (!candidateUrls.includes(url)) {
    candidateUrls.push(url);
  }

  for (const fetchUrl of candidateUrls) {
    try {
      log("Fetching captions from content script:", fetchUrl.substring(0, 100));

      const response = await fetch(fetchUrl, {
        credentials: "include",
      });

      log("Caption fetch response status:", response.status);

      if (!response.ok) {
        log("Caption fetch failed:", response.status, response.statusText);
        if (response.status === 429) {
          log(
            "Caption fetch returned 429 (Rate Limited) — stopping direct fetch candidates and falling back to player API",
          );
          return null;
        }
        continue;
      }

      // Get as text FIRST to see what we actually received
      const text = await response.text();
      log("Caption response length:", text.length, "chars");
      log("Caption response preview:", text.substring(0, 200));

      if (!text || text.length === 0) {
        log("Caption response is EMPTY for", fetchUrl.substring(0, 80));
        continue;
      }

      const lowerText = text.toLowerCase();
      if (
        lowerText.includes("<!doctype html") ||
        lowerText.includes("<html") ||
        lowerText.includes("<body") ||
        lowerText.includes("automated queries") ||
        lowerText.includes("unusual traffic") ||
        lowerText.includes("we can't process your request") ||
        lowerText.includes("our systems have detected") ||
        lowerText.includes("google.com/sorry")
      ) {
        log(
          "Caption response is HTML / Google bot-block page, stopping direct fetch candidates",
        );
        break; // Stop spamming candidate URLs directly, fallback to MAIN world player API
      }

      // Try JSON parse first (fmt=json3)
      if (text.startsWith("{") || text.startsWith("[")) {
        try {
          const captionData = JSON.parse(text);
          log("Caption data events:", captionData.events?.length);

          if (Array.isArray(captionData.events) && captionData.events.length > 0) {
            const lyrics: Array<{ time: number; text: string; duration: number }> = [];

            for (const event of captionData.events) {
              if (!event) continue;

              let words = "";
              if (Array.isArray(event.segs)) {
                for (const seg of event.segs) {
                  if (typeof seg === "string") {
                    words += seg;
                  } else if (seg && typeof seg === "object") {
                    words += seg.utf8 || seg.text || seg.content || "";
                  }
                }
              }
              if (!words) {
                words = event.text || event.utf8 || event.content || "";
              }

              const cleaned = cleanCaptionText(words);
              if (!cleaned) continue;

              const time = (event.tStartMs || 0) / 1000;
              const duration = (event.dDurationMs || 0) / 1000;

              if (cleaned.includes("\n")) {
                const subLines = cleaned.split("\n").map((s) => s.trim()).filter(Boolean);
                for (let i = 0; i < subLines.length; i++) {
                  lyrics.push({
                    time: time + (i * 0.5),
                    duration: Math.max(0.5, duration / subLines.length),
                    text: subLines[i],
                  });
                }
              } else {
                lyrics.push({
                  time,
                  duration,
                  text: cleaned,
                });
              }
            }

            log("Parsed lyrics (JSON):", lyrics.length, "lines");
            if (lyrics.length >= 3) {
              return lyrics;
            } else if (lyrics.length > 0) {
              log(
                "Parsed JSON only yielded",
                lyrics.length,
                "lines; continuing to XML fallback for complete track",
              );
            }
          }
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

              // CRITICAL: A valid TTML caption line MUST have timing attributes (begin, start, or t).
              // An HTML <p> tag from an error page has no timing attributes and must be rejected!
              if (
                !pStart &&
                !pAttrs.includes("t=") &&
                !pAttrs.includes("begin=") &&
                !pAttrs.includes("start=")
              ) {
                continue;
              }

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

          if (lyrics.length > 0) {
            log("Parsed lyrics (XML):", lyrics.length, "lines");
            return lyrics;
          }
        } catch (e) {
          log("XML parse also failed:", e);
        }
      }

      log("Could not parse caption response as JSON or XML");
    } catch (err) {
      console.error("[Lyrical] Caption fetch error:", err);
    }
  }

  return null;
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
// Prevent an uncertain auto-sync result (or unknown -> 0 fallback) from being persisted.
let suppressNextOffsetPersistence = false;
let currentSyncOffset = PLATFORM_OFFSET; // Live offset (platform + user correction)

async function getStoredSongOffset(
  songKey: string,
  fallbackKey?: string,
  sourceIdOverride?: string | null,
): Promise<number | null> {
  const { songId, videoId, prop, flatKey } = parseSongKeyInfo(
    songKey,
    sourceIdOverride,
  );

  const isValidOffset = (val: any): boolean => {
    if (typeof val !== "number" || !Number.isFinite(val)) return false;
    // Discard the known corrupt repetitive-line jump offset (~ -19.2s) on Attention (nfs8NYg7yQM)
    if (songId.includes("nfs8NYg7yQM") && Math.abs(val - -19.2) <= 0.25) {
      return false;
    }
    return true;
  };

  const checkStorage = (offsets: Record<string, any>): number | null => {
    if (!offsets || typeof offsets !== "object") return null;

    // 1. Primary check: check structured object {"Title - videoId": {"source_offset": ...}}
    if (offsets[songId] && typeof offsets[songId] === "object") {
      if (isValidOffset(offsets[songId][prop])) {
        return offsets[songId][prop];
      }
    }

    // 2. Secondary check: check structured object by videoId {"videoId": {"source_offset": ...}}
    if (videoId && offsets[videoId] && typeof offsets[videoId] === "object") {
      if (isValidOffset(offsets[videoId][prop])) {
        return offsets[videoId][prop];
      }
    }

    // 3. Fallback to direct flat key (e.g. "offset_videoId_source") for backward compatibility
    if (isValidOffset(offsets[flatKey])) {
      return offsets[flatKey];
    }
    if (isValidOffset(offsets[songKey])) {
      return offsets[songKey];
    }

    // Legacy Musixmatch alias keys
    if (prop.startsWith("musixmatch")) {
      const legacyRichKey = `offset_${videoId}_musixmatch-richsync`;
      const legacyWordKey = `offset_${videoId}_musixmatch`;
      if (isValidOffset(offsets[legacyRichKey])) return offsets[legacyRichKey];
      if (isValidOffset(offsets[legacyWordKey])) return offsets[legacyWordKey];
    }

    // 4. Fallback key if explicitly provided and sourceId matches
    if (fallbackKey && isValidOffset(offsets[fallbackKey]) && Math.abs(offsets[fallbackKey]) > 0.05) {
      // Do not allow fallbackKey to cross contaminate across different sources!
      const currentSource = sourceIdOverride || useAppStore.getState().lyricsSource || "default";
      if (fallbackKey.includes(currentSource)) {
        return offsets[fallbackKey];
      }
    }

    return null;
  };

  try {
    const local = await chrome.storage.local.get("songOffsets");
    const val = checkStorage(local?.songOffsets);
    if (val !== null) return val;
  } catch {}

  try {
    const sync = await chrome.storage.sync.get("songOffsets");
    const val = checkStorage(sync?.songOffsets);
    if (val !== null) return val;
  } catch {}

  return null;
}

async function saveStoredSongOffset(
  songKey: string,
  offset: number,
  sourceIdOverride?: string | null,
): Promise<void> {
  const { songId, videoId, prop, flatKey } = parseSongKeyInfo(
    songKey,
    sourceIdOverride,
  );

  try {
    const local = (await chrome.storage.local.get("songOffsets")) || {};
    const songOffsets = local.songOffsets || {};

    // 1. Save in structured object: "We dont talk anymore - w12236": { "musixmatch_richsync_offset": 0.34 }
    if (!songOffsets[songId] || typeof songOffsets[songId] !== "object") {
      songOffsets[songId] = {};
    }
    songOffsets[songId][prop] = offset;

    // 2. Also keep flat key so legacy readers continue to find it
    songOffsets[flatKey] = offset;
    songOffsets[songKey] = offset;

    if (flatKey.endsWith("_musixmatch")) {
      songOffsets[flatKey + "-richsync"] = offset;
    }

    await chrome.storage.local.set({ songOffsets });
    log(
      `[Lyrical Sync] 💾 Saved offset for "${songId}" [${prop}]: ${offset > 0 ? "+" : ""}${offset}s`,
    );
  } catch (e) {
    warn("[Lyrical Sync] Failed to save offset to local:", e);
  }

  try {
    const sync = (await chrome.storage.sync.get("songOffsets")) || {};
    const songOffsets = sync.songOffsets || {};

    if (!songOffsets[songId] || typeof songOffsets[songId] !== "object") {
      songOffsets[songId] = {};
    }
    songOffsets[songId][prop] = offset;
    songOffsets[flatKey] = offset;
    songOffsets[songKey] = offset;

    if (flatKey.endsWith("_musixmatch")) {
      songOffsets[flatKey + "-richsync"] = offset;
    }

    await chrome.storage.sync.set({ songOffsets });
  } catch {}
}

function requestCaptionTrackFromMainWorld(
  track: any,
): Promise<any[] | null> {
  return new Promise((resolve) => {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const timer = setTimeout(() => {
      window.removeEventListener("message", handler);
      resolve(null);
    }, 4500);

    const handler = (event: MessageEvent) => {
      if (
        event.source !== window ||
        event.data?.type !== "LYRICAL_FETCH_TRACK_RESPONSE"
      )
        return;
      if (event.data?.requestId !== requestId) return;
      clearTimeout(timer);
      window.removeEventListener("message", handler);
      if (
        event.data.success &&
        Array.isArray(event.data.lyrics) &&
        event.data.lyrics.length > 0
      ) {
        resolve(event.data.lyrics);
      } else {
        resolve(null);
      }
    };

    window.addEventListener("message", handler);
    const lang = String(track?.languageCode || track?.lang || "");
    const vss = String(track?.vssId || track?.vss_id || "");
    const isAsr = Boolean(
      track?.isAsr || track?.kind === "asr" || vss.startsWith("a."),
    );
    window.postMessage(
      {
        type: "LYRICAL_FETCH_TRACK_REQUEST",
        requestId,
        trackId: vss,
        languageCode: lang,
        isAsr,
      },
      "*",
    );
  });
}

async function getAvailableCaptionLines(): Promise<Array<{
  time: number;
  duration?: number;
  text: string;
}> | null> {
  const currentVid = getCurrentVideoId(currentSongInfo);

  // 1. FAST PATH: Check if MAIN world already extracted captions from the player for this video
  if (
    Array.isArray(pendingMainWorldCaptionLyrics) &&
    pendingMainWorldCaptionLyrics.length >= 3 &&
    (!pendingMainWorldCaptionVideoId ||
      pendingMainWorldCaptionVideoId === currentVid)
  ) {
    log(
      `[Lyrical Auto-Sync] ⚡ Using player-extracted captions (${pendingMainWorldCaptionLyrics.length} lines)`,
    );
    return pendingMainWorldCaptionLyrics;
  }

  // 2. Candidate tracks from availableCaptions
  if (Array.isArray(availableCaptions) && availableCaptions.length > 0) {
    const storeLang = (useAppStore.getState().lyricsLanguage || "")
      .toLowerCase()
      .split("-")[0];

    const candidateTracks: Array<{ track: any; priority: number }> = [];
    for (const t of availableCaptions) {
      if (!t) continue;
      const lang = String(t?.languageCode || t?.lang || "").toLowerCase();
      const name = String(t?.name?.simpleText || t?.name || "").toLowerCase();
      const vss = String(t?.vssId || "").toLowerCase();
      const isTranslated = name.includes("translated");
      const isMatchLang = Boolean(
        storeLang && (lang === storeLang || lang.startsWith(storeLang)),
      );
      const isEnglish = lang === "en" || lang.startsWith("en");
      const isAsr =
        name.includes("auto") || vss.startsWith("a.") || vss.includes("asr");

      let priority = 10;
      if (isMatchLang && !isAsr && !isTranslated) priority = 1;
      else if (isEnglish && !isAsr && !isTranslated) priority = 2;
      else if (isMatchLang && isAsr) priority = 3;
      else if (isEnglish && isAsr) priority = 4;
      else if (!isTranslated && !isAsr) priority = 5;
      else priority = 6;

      candidateTracks.push({ track: t, priority });
    }

    candidateTracks.sort((a, b) => a.priority - b.priority);

    // Try direct fetch first on candidate tracks (up to 3 tracks)
    for (const { track } of candidateTracks.slice(0, 3)) {
      const trackUrl = track?.baseUrl || track?.url;
      if (!trackUrl) continue;
      try {
        const fetched = await fetchCaptionsFromContentScript(trackUrl, track);
        if (Array.isArray(fetched) && fetched.length >= 3) {
          log(
            `[Lyrical Auto-Sync] Selected caption track "${track?.name?.simpleText || track?.name || track?.languageCode || "captions"}" (${fetched.length} lines)`,
          );
          return fetched;
        }
      } catch (err) {
        warn("[Lyrical Auto-Sync] Candidate direct caption fetch failed:", err);
      }
    }

    // 3. Fallback: If direct fetch failed (e.g. YouTube returned 0 bytes / empty body due to PO token / session),
    // request the top candidate track directly from the MAIN World extractor via the player API!
    const bestCandidate = candidateTracks[0]?.track;
    if (bestCandidate) {
      try {
        log(
          `[Lyrical Auto-Sync] Direct fetch returned no lines; requesting "${bestCandidate?.name?.simpleText || bestCandidate?.languageCode || "captions"}" from Main World player API...`,
        );
        const mainWorldFetched =
          await requestCaptionTrackFromMainWorld(bestCandidate);
        if (Array.isArray(mainWorldFetched) && mainWorldFetched.length >= 3) {
          log(
            `[Lyrical Auto-Sync] Successfully received captions from Main World player (${mainWorldFetched.length} lines)`,
          );
          return mainWorldFetched;
        }
      } catch (err) {
        warn("[Lyrical Auto-Sync] Main World track request failed:", err);
      }
    }
  }

  // 4. Final check: if pendingMainWorldCaptionLyrics arrived while waiting
  if (
    Array.isArray(pendingMainWorldCaptionLyrics) &&
    pendingMainWorldCaptionLyrics.length >= 3
  ) {
    log(
      `[Lyrical Auto-Sync] Using player-extracted captions fallback (${pendingMainWorldCaptionLyrics.length} lines)`,
    );
    return pendingMainWorldCaptionLyrics;
  }

  return null;
}

async function tryAutoDetectOffset(
  lyrics: any[],
  songKey: string,
  explicitVideoId?: string | null,
): Promise<number | null> {
  // 1. Immediate Ad Guard
  if (useAppStore.getState().isAdPlaying || isYouTubeAdPlaying()) {
    log("[Lyrical Auto-Sync] Skipping auto-sync while ad is playing");
    return null;
  }

  if (!Array.isArray(lyrics) || lyrics.length === 0) return null;

  const currentSource = useAppStore.getState().lyricsSource;
  if (currentSource === "captions") {
    log(
      "[Lyrical Auto-Sync] Active source is YouTube Captions; offset is locked to 0.0s",
    );
    return null;
  }

  // Unless this run proves the offset strongly enough to persist, the next
  // store update from this auto-sync attempt must not save a guessed 0/SponsorBlock value.
  suppressNextOffsetPersistence = true;

  const videoId = explicitVideoId || getCurrentVideoId(currentSongInfo) || "";

  type SponsorEvidence = {
    offset: number;
    source: string;
    description?: string;
    outroStart?: number;
  } | null;

  let sponsorBlockResult: SponsorEvidence = null;
  let captionsResult: ReturnType<typeof detectAutoSyncOffset> = null;

  try {
    // Run both evidence sources independently. Neither one is allowed to
    // overwrite the other before the final fusion decision.
    const [sbResult, captionLines] = await Promise.all([
      videoId ? detectNonCaptionIntroOffset(videoId) : Promise.resolve(null),
      getAvailableCaptionLines(),
    ]);

    sponsorBlockResult = sbResult;

    if (captionLines && captionLines.length > 0) {
      captionsResult = detectAutoSyncOffset(lyrics, captionLines);
    }

    const sbOffset =
      sponsorBlockResult && Number.isFinite(sponsorBlockResult.offset)
        ? sponsorBlockResult.offset
        : null;

    const captionOffset =
      captionsResult && Number.isFinite(captionsResult.detectedOffset)
        ? captionsResult.detectedOffset
        : null;

    console.groupCollapsed?.(
      `[Lyrical Auto-Sync] 📊 Sync Analysis for "${currentSongInfo?.title || videoId}" (${currentSource || "source"})`,
    );

    console.log(
      "🎬 SponsorBlock evidence:",
      sbOffset !== null
        ? `${sbOffset > 0 ? "+" : ""}${sbOffset.toFixed(2)}s`
        : "None",
      sponsorBlockResult?.source || "",
    );

    console.log(
      "💬 Caption evidence:",
      captionsResult
        ? {
            offset: captionOffset,
            rawOffset: captionsResult.rawOffset,
            confidence: captionsResult.confidence,
            matches: captionsResult.matchCount,
            regions: captionsResult.regionCount,
            spread: captionsResult.offsetSpread,
            similarity: captionsResult.medianSimilarity,
          }
        : "None",
    );

    let chosenOffset: number | null = null;
    let chosenConfidence = 0;
    let chosenSource = "Unknown";
    let shouldPersist = false;

    const CAPTION_STRONG = 0.72;
    const CAPTION_MEDIUM = 0.6;
    const CAPTION_LARGE_OFFSET_STRONG = 0.82;
    const SPONSOR_AGREEMENT = 1.25;

    const firstVocalTime = getFirstVocalLyricTime(lyrics);

    if (captionsResult && captionOffset !== null) {
      // Captions directly compare lyric text against the video's actual timed
      // speech. Therefore they remain the primary source whenever validated.
      let finalOffsetToUse = captionOffset;

      // Calibration: captionOffset = (captionTime - lyricTime).
      // 1. YouTube ASR subtitles appear ~0.35s before vocal articulation (lead time).
      // 2. Playback engine subtracts PLATFORM_OFFSET (-0.45s) from userSongOffset.
      // Calibrate captionOffset into userSongOffset space:
      if (Math.abs(captionOffset) > 0.5) {
        const ASR_VOCAL_LEAD = 0.35;
        finalOffsetToUse = Number(
          (captionOffset - PLATFORM_OFFSET + ASR_VOCAL_LEAD).toFixed(2),
        );
      }

      // Deadband exception: If detector normalized to 0, but SponsorBlock and raw caption offset
      // strongly agree on a micro-offset (e.g. +0.48s and +0.50s), use the agreed micro-offset!
      if (
        captionOffset === 0 &&
        typeof captionsResult.rawOffset === "number" &&
        captionsResult.rawOffset !== 0 &&
        sbOffset !== null &&
        Math.abs(captionsResult.rawOffset - sbOffset) <= 0.35 &&
        captionsResult.confidence >= 0.7
      ) {
        finalOffsetToUse = captionsResult.rawOffset;
        chosenConfidence = Math.min(0.99, captionsResult.confidence + 0.1);
        chosenSource = `Captions + SponsorBlock agreement on micro-offset (${finalOffsetToUse}s)`;
      } else {
        chosenConfidence = captionsResult.confidence;
        chosenSource = `Captions (${Math.round(captionsResult.confidence * 100)}% validated)`;
      }

      chosenOffset = finalOffsetToUse;

      if (sbOffset !== null) {
        const difference = Math.abs(finalOffsetToUse - sbOffset);

        if (difference <= SPONSOR_AGREEMENT) {
          chosenConfidence = Math.min(0.99, chosenConfidence + 0.1);
          chosenSource = `Captions + SponsorBlock agreement (${difference.toFixed(2)}s apart)`;
        } else if (
          Math.abs(finalOffsetToUse) <= 0.5 &&
          firstVocalTime !== null &&
          firstVocalTime >= sbOffset - 3.0
        ) {
          // Pre-synced lyrics (e.g. LRCLib video-synced):
          // Captions validate near-zero offset (0.00s) because lyrics already start after the intro!
          // SponsorBlock detects the video's intro segment, but the lyrics already account for it.
          // This is NOT a disagreement; it confirms the lyrics are natively synced to the video.
          chosenOffset = 0;
          chosenConfidence = Math.max(0.85, captionsResult.confidence);
          chosenSource = `Captions validated pre-synced lyrics (0.00s, intro ${sbOffset.toFixed(1)}s already included)`;
        } else {
          const isLargeCaptionOffset = Math.abs(finalOffsetToUse) > 30;
          const largeOffsetEvidenceIsStrong =
            !isLargeCaptionOffset ||
            (captionsResult.confidence >= CAPTION_LARGE_OFFSET_STRONG &&
              captionsResult.matchCount >= 5 &&
              captionsResult.regionCount >= 3 &&
              captionsResult.medianSimilarity >= 0.78 &&
              captionsResult.offsetSpread <= 0.45);

          // A large caption offset that strongly disagrees with an independent
          // intro boundary is a common repeated-lyrics false match. Do not let
          // it overwrite the source-specific timing unless the detector has
          // unusually strong evidence for the large offset.
          if (!largeOffsetEvidenceIsStrong) {
            log(
              "[Lyrical Auto-Sync] Rejecting suspicious large caption offset:",
              {
                captionOffset: finalOffsetToUse,
                sponsorBlockOffset: sbOffset,
                difference,
                confidence: captionsResult.confidence,
                matches: captionsResult.matchCount,
                regions: captionsResult.regionCount,
                similarity: captionsResult.medianSimilarity,
                spread: captionsResult.offsetSpread,
              },
            );
            chosenOffset = null;
            chosenConfidence = 0;
            chosenSource = "Suspicious large caption offset";
          } else {
            // Do NOT average conflicting evidence. SponsorBlock marks a segment
            // boundary, not a lyric alignment, so it is secondary evidence.
            log(
              "[Lyrical Auto-Sync] SponsorBlock disagrees with validated captions:",
              JSON.stringify({
                captionOffset: finalOffsetToUse,
                sponsorBlockOffset: sbOffset,
                difference,
              }),
            );

            if (captionsResult.confidence >= CAPTION_STRONG) {
              chosenSource = `Captions only (SponsorBlock disagrees by ${difference.toFixed(2)}s)`;
            } else if (captionsResult.confidence < CAPTION_MEDIUM) {
              // Weak caption evidence + conflicting SponsorBlock is not safe enough.
              chosenOffset = null;
              chosenConfidence = 0;
              chosenSource = "Conflicting weak evidence";
            }
          }
        }
      }

      // If captions validated near-zero offset with multiple matches, persist 0.0s!
      if (
        chosenOffset !== null &&
        Math.abs(chosenOffset) <= 0.5 &&
        captionsResult.matchCount >= 2
      ) {
        chosenOffset = 0;
        shouldPersist = true;
      } else {
        shouldPersist =
          chosenOffset !== null && chosenConfidence >= CAPTION_STRONG;
      }
    } else if (sbOffset !== null) {
      // Conservative SponsorBlock Fallback:
      // Only use SponsorBlock if:
      // 1. Captions are unavailable or unusable
      // 2. The offset is within a sensible intro range (1.5s <= offset <= 60s)
      // 3. User does not already have a stored custom offset
      const isSensibleIntro = sbOffset >= 1.5 && sbOffset <= 60;
      let hasStoredCustomOffset = false;
      try {
        const stored = await getStoredSongOffset(songKey);
        hasStoredCustomOffset = stored !== null && Math.abs(stored) > 0.05;
      } catch {}

      if (isSensibleIntro && !hasStoredCustomOffset) {
        const lastVocalTime = getLastVocalLyricTime(lyrics);
        const video = getActiveMediaVideoElement();
        const videoDuration =
          video?.duration && Number.isFinite(video.duration) && video.duration > 0
            ? video.duration
            : (Number(currentSongInfo?.duration) || 0);

        // Check if lyrics are already pre-synced to the video:
        // Lyrics are pre-synced ONLY IF:
        // 1. Adding sbOffset would overshoot the total video duration (+2s buffer), OR
        // 2. A distinct outro segment exists AND the unshifted lyrics already reach the outro
        //    (within 5s), AND adding sbOffset overshoots outroStart by a substantial margin (>= 5s or 70% of intro).
        // 3. Pre-synced lyrics CANNOT have their first vocal before the intro skit ends (sbOffset - 1.5s).
        const startsBeforeIntro =
          firstVocalTime !== null &&
          sbOffset >= 3.0 &&
          firstVocalTime < sbOffset - 1.5;

        const overshootsVideo =
          lastVocalTime !== null &&
          videoDuration > 0 &&
          lastVocalTime + sbOffset > videoDuration + 2.0;

        const outroStart = sponsorBlockResult?.outroStart;
        const overshootsOutro =
          !startsBeforeIntro &&
          typeof outroStart === "number" &&
          outroStart > 0 &&
          lastVocalTime !== null &&
          lastVocalTime >= outroStart - 5.0 &&
          lastVocalTime + sbOffset > outroStart + Math.max(10.0, sbOffset * 0.85);

        const wouldOvershoot =
          !startsBeforeIntro && (overshootsVideo || overshootsOutro);

        if (wouldOvershoot) {
          // The lyrics already span the full video timeline; do not double-delay them.
          chosenOffset = 0;
          chosenConfidence = 0.7;
          chosenSource = `Lyrics pre-synced to video (last vocal ${lastVocalTime?.toFixed(1)}s + intro ${sbOffset.toFixed(1)}s exceeds bounds)`;
          shouldPersist = true;
          log(
            `[Lyrical Auto-Sync] 🎯 Lyrics span full video timeline. Locking offset to 0.00s.`,
          );
        } else {
          chosenOffset = sbOffset;
          chosenConfidence = 0.65;
          chosenSource = `SponsorBlock fallback (${sponsorBlockResult?.source || "segment"})`;
          shouldPersist = true;

          console.log(
            `🛡️ Applied SponsorBlock intro offset (+${sbOffset.toFixed(2)}s); album lyrics fit video music window.`,
          );
        }
      } else {
        console.log(
          `🛡️ Skipping SponsorBlock offset (+${sbOffset}s): ${
            hasStoredCustomOffset
              ? "user/stored offset already exists"
              : "offset outside sensible intro range (1.5s-60s)"
          }`,
        );
        chosenOffset = null;
        chosenConfidence = 0;
        chosenSource = "Rejected SponsorBlock estimate";
      }
    }

    // 2. Exit Ad Guard: check if an ad started while async requests were resolving
    if (useAppStore.getState().isAdPlaying || isYouTubeAdPlaying()) {
      log(
        "[Lyrical Auto-Sync] Aborting offset application: ad started during detection",
      );
      console.groupEnd?.();
      suppressNextOffsetPersistence = false;
      return null;
    }

    if (chosenOffset !== null) {
      const safeOffset = Number(
        Math.min(120, Math.max(-120, chosenOffset)).toFixed(2),
      );

      console.log(
        `🎯 Final Applied Offset: ${safeOffset > 0 ? "+" : ""}${safeOffset}s via ${chosenSource}`,
      );
      console.log(
        `💾 Persisted: ${shouldPersist ? "yes" : "no (temporary/uncertain)"}`,
      );
      console.groupEnd?.();

      if (shouldPersist) {
        suppressNextOffsetPersistence = false;
        await saveStoredSongOffset(songKey, safeOffset);
      }

      return safeOffset;
    }

    // IMPORTANT: unknown is NOT the same as confidently synced at 0s.
    // Returning null allows late-caption recovery to try again.
    console.log(
      "🎯 No sufficiently validated offset. Leaving result unknown; no 0s guess saved.",
    );
    console.groupEnd?.();
  } catch (err) {
    log("[Lyrical Auto-Sync] Auto-detection error:", err);
  }

  // No offset was applied, so there is no store update for the suppression
  // flag to consume. Clear it explicitly so it cannot affect a later manual
  // or source change.
  suppressNextOffsetPersistence = false;
  return null;
}

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
export function getActiveMediaVideoElement(): HTMLVideoElement | null {
  // 1. If in miniplayer, prefer the miniplayer's video
  const miniVideo = document.querySelector<HTMLVideoElement>("ytd-miniplayer video");
  if (miniVideo) return miniVideo;

  // 2. Main YouTube watch video (exclude inline hover preview players)
  const player = document.getElementById("movie_player");
  if (player && !player.closest("ytd-inline-preview-player, #inline-preview-player")) {
    const v = player.querySelector<HTMLVideoElement>("video");
    if (v) return v;
  }

  const watchFlexyVideo = document.querySelector<HTMLVideoElement>("ytd-watch-flexy video");
  if (watchFlexyVideo) return watchFlexyVideo;

  // 3. Fallback: filter out any video elements belonging to inline previews or thumbnail hover cards
  const allVideos = Array.from(document.querySelectorAll<HTMLVideoElement>("video"));
  for (const v of allVideos) {
    if (!v.closest("ytd-inline-preview-player, #inline-preview-player, ytd-thumbnail, ytd-rich-grid-media, ytd-video-preview")) {
      return v;
    }
  }

  return document.querySelector("video");
}

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
    const video = getActiveMediaVideoElement();
    const secondary = findVisibleSecondaryColumn() || document.querySelector("#secondary");

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

let karaokeOverlayElement: HTMLElement | null = null;

function ensureKaraokeOverlay() {
  if (document.getElementById("lyrical-karaoke-wrapper")) {
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.id = "lyrical-karaoke-wrapper";
  wrapper.style.display = "none";
  wrapper.style.position = "absolute";
  wrapper.style.inset = "0";
  wrapper.style.width = "100%";
  wrapper.style.height = "100%";
  wrapper.style.pointerEvents = "none";
  wrapper.style.zIndex = "40"; // Above player controls layer

  const shadowRoot = wrapper.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = KARAOKE_SHADOW_STYLES;
  shadowRoot.appendChild(style);

  const mountPoint = document.createElement("div");
  mountPoint.id = "lyrical-karaoke-root";
  mountPoint.style.position = "absolute";
  mountPoint.style.inset = "0";
  mountPoint.style.width = "100%";
  mountPoint.style.height = "100%";
  shadowRoot.appendChild(mountPoint);

  const root = createRoot(mountPoint);
  root.render(<KaraokeOverlay />);
  (wrapper as any)._reactRoot = root;

  document.body.appendChild(wrapper);
  karaokeOverlayElement = wrapper;
  log("✅ Karaoke overlay initialized and mounted");
}

let miniCompanionElement: HTMLElement | null = null;
let miniplayerObserver: MutationObserver | null = null;
let miniplayerPollInterval: any = null;
let adObserver: MutationObserver | null = null;

function isYouTubeAdPlaying(): boolean {
  if (!window.location.hostname.includes("youtube.com")) return false;
  const player = document.getElementById("movie_player");
  if (!player) return false;
  const hasAdClass =
    player.classList?.contains("ad-showing") ||
    player.classList?.contains("ad-interrupting");
  const adModule = player.querySelector(".video-ads.ytp-ad-module");
  const hasAdChildren = Boolean(adModule && adModule.children.length > 0);
  const hasAdOverlay = Boolean(
    player.querySelector(
      ".ytp-ad-player-overlay, .ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-ad-preview-container",
    ),
  );
  return Boolean(hasAdClass || (hasAdChildren && hasAdOverlay));
}

function setupAdObserver() {
  if (adObserver) return;
  const player = document.getElementById("movie_player");
  if (!player) return;

  let prevAdState = isYouTubeAdPlaying();
  useAppStore.getState().setIsAdPlaying(prevAdState);

  adObserver = new MutationObserver(() => {
    const currentlyAd = isYouTubeAdPlaying();
    if (currentlyAd !== prevAdState) {
      prevAdState = currentlyAd;
      useAppStore.getState().setIsAdPlaying(currentlyAd);
      log(
        `[Lyrical Ad Observer] Ad state changed: ${currentlyAd ? "AD PLAYING" : "AD ENDED"}`,
      );
      if (!currentlyAd) {
        // Ad just finished! Automatically trigger lyrics fetch for real track
        setTimeout(() => {
          const info = window.getSongInfoFromPage?.();
          if (info && !info.isAd && info.title) {
            autoFetchLyrics(info, { reason: "ad finished" });
          }
        }, 400);
      } else {
        useAppStore.setState({
          isLoading: true,
          headerText: "Ad in progress...",
        });
      }
    }
  });

  adObserver.observe(player, {
    attributes: true,
    attributeFilter: ["class"],
    childList: true,
    subtree: true,
  });
}

function getCurrentVideoId(songInfo?: any): string | null {
  const isWatchUrl =
    window.location.hostname.includes("youtube.com") &&
    window.location.pathname.includes("/watch");

  if (isWatchUrl) {
    const urlV = new URLSearchParams(window.location.search).get("v");
    if (urlV) return urlV;
  } else {
    // On non-watch page (home feed, etc.), ONLY check miniplayer!
    const miniLink = document.querySelector<HTMLAnchorElement>(
      "ytd-miniplayer a[href*='watch?v='], ytd-miniplayer [href*='watch?v=']",
    );
    if (miniLink?.href) {
      try {
        const v = new URL(miniLink.href).searchParams.get("v");
        if (v) return v;
      } catch {}
    }
  }

  if (songInfo?.videoId) return songInfo.videoId;
  if (currentSongInfo?.videoId) return currentSongInfo.videoId;
  const storeSongInfo = useAppStore.getState().songInfo;
  if (storeSongInfo?.videoId) return storeSongInfo.videoId;

  if (isWatchUrl) {
    try {
      const player = document.getElementById("movie_player") as any;
      if (player && !player.closest?.("ytd-inline-preview-player, #inline-preview-player")) {
        const playerV = player?.getVideoData?.()?.video_id;
        if (playerV) return playerV;
      }
    } catch {}
  }

  return null;
}

function isMiniplayerActive(): boolean {
  const isWatchUrl =
    window.location.href.includes("/watch") &&
    window.location.href.includes("v=");
  if (isWatchUrl) return false;

  const mini = document.querySelector("ytd-miniplayer");
  if (!mini) return false;

  const hasActive = mini.hasAttribute("active");
  const isVisible =
    (mini as HTMLElement).offsetParent !== null ||
    window.getComputedStyle(mini).display !== "none";
  const hasVideo =
    !!mini.querySelector("video") || !!document.querySelector("video");

  return (hasActive || isVisible) && hasVideo;
}

function ensureMiniCompanion() {
  const showMiniCompanion = useAppStore.getState().showMiniCompanion ?? true;
  if (!showMiniCompanion) {
    removeMiniCompanion();
    return;
  }

  if (document.getElementById("lyrical-mini-companion-wrapper")) {
    return;
  }

  // Ensure song info and lyrics are fetched if not present
  const currentSongInfo = useAppStore.getState().songInfo;
  const stateLyrics = useAppStore.getState().lyrics;
  if (!currentSongInfo || !stateLyrics?.length) {
    const info = window.getSongInfoFromPage?.();
    if (info?.title && !info.isAd) {
      autoFetchLyrics(info);
    }
  } else {
    // If lyrics are already loaded, ensure lyrics timer is active on the miniplayer video
    startLyricsTimer(stateLyrics);
  }

  const wrapper = document.createElement("div");
  wrapper.id = "lyrical-mini-companion-wrapper";
  wrapper.style.position = "fixed";
  wrapper.style.inset = "0";
  wrapper.style.width = "100%";
  wrapper.style.height = "100%";
  wrapper.style.pointerEvents = "none";
  wrapper.style.zIndex = "2200";

  const shadowRoot = wrapper.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = KARAOKE_SHADOW_STYLES;
  shadowRoot.appendChild(style);

  const mountPoint = document.createElement("div");
  mountPoint.id = "lyrical-mini-companion-root";
  mountPoint.style.position = "absolute";
  mountPoint.style.inset = "0";
  mountPoint.style.pointerEvents = "none";
  shadowRoot.appendChild(mountPoint);

  const root = createRoot(mountPoint);
  root.render(
    <MiniCompanion
      onDismiss={() => {
        removeMiniCompanion(true);
      }}
    />,
  );
  (wrapper as any)._reactRoot = root;

  document.body.appendChild(wrapper);
  miniCompanionElement = wrapper;
  log("✅ Mini Companion mounted above miniplayer");
}

let isMiniCompanionDismissed = false;
let lastMiniplayerSongKey: string | null = null;
let lastMiniplayerAdState: boolean | null = null;

function removeMiniCompanion(isUserDismissed = false) {
  if (isUserDismissed) {
    isMiniCompanionDismissed = true;
  }
  const existing = document.getElementById("lyrical-mini-companion-wrapper");
  if (existing) {
    if ((existing as any)._reactRoot) {
      (existing as any)._reactRoot.unmount();
    }
    existing.remove();
  }
  miniCompanionElement = null;
}

function checkAndManageMiniCompanion() {
  const isWatchUrl =
    window.location.href.includes("/watch") &&
    window.location.href.includes("v=");

  if (isWatchUrl) {
    isMiniCompanionDismissed = false;
    removeMiniCompanion();
    ensureWatchPanelMounted();
    return;
  }

  const showMiniCompanion = useAppStore.getState().showMiniCompanion ?? true;
  if (!showMiniCompanion || isMiniCompanionDismissed) {
    removeMiniCompanion();
    return;
  }

  if (isMiniplayerActive()) {
    ensureMiniCompanion();
  } else {
    removeMiniCompanion();
  }
}

function checkMiniplayerSongChange() {
  if (!isMiniplayerActive()) return;

  // Check Ad state in miniplayer
  const isAd = isYouTubeAdPlaying();
  if (isAd !== lastMiniplayerAdState) {
    lastMiniplayerAdState = isAd;
    useAppStore.getState().setIsAdPlaying(isAd);
    if (isAd) {
      useAppStore.setState({
        isLoading: true,
        headerText: "Ad in progress...",
      });
    } else {
      // Ad finished, fetch real track
      setTimeout(() => {
        const info = window.getSongInfoFromPage?.();
        if (info && !info.isAd && info.title) {
          autoFetchLyrics(info, { reason: "miniplayer ad ended" });
        }
      }, 350);
    }
  }

  if (isAd) return;

  const info = window.getSongInfoFromPage?.();
  if (!info || !info.title) return;

  // Guard: Validate against the actual miniplayer video to prevent hover-preview
  // thumbnails from changing the lyrics. The miniplayer DOM always has an anchor
  // with the real playing video's ID.
  try {
    const miniLink = document.querySelector<HTMLAnchorElement>(
      "ytd-miniplayer a[href*='watch?v='], ytd-miniplayer .ytp-title-link[href*='watch?v=']",
    );
    if (miniLink?.href) {
      const match = miniLink.href.match(/[?&]v=([^&]+)/);
      const miniVideoId = match?.[1];
      if (miniVideoId && info.videoId && miniVideoId !== info.videoId) {
        // The info is from a hover preview, not the actual miniplayer video — skip
        return;
      }
    }
  } catch {}

  const songKey = `${info.artist || ""}_${info.title || ""}`;
  if (songKey && songKey !== lastMiniplayerSongKey) {
    lastMiniplayerSongKey = songKey;
    isMiniCompanionDismissed = false; // Reset dismissal on new track
    log("[Lyrical Miniplayer] 🎵 New song detected in miniplayer:", songKey);
    // Purge stale captions immediately to prevent cross-song desync
    availableCaptions = [];
    pendingMainWorldCaptionLyrics = null;
    pendingMainWorldCaptionTrack = null;
    pendingMainWorldCaptionLanguage = null;
    pendingMainWorldCaptionVideoId = null;
    mainWorldCaptionTracksVideoId = null;
    autoFetchLyrics(info, { reason: "miniplayer song change" });
  }
}

function setupMiniplayerObserver() {
  if (miniplayerObserver) return;
  const target =
    document.querySelector("ytd-miniplayer") ||
    document.querySelector("ytd-app") ||
    document.body;

  if (target) {
    miniplayerObserver = new MutationObserver(() => {
      checkAndManageMiniCompanion();
      checkMiniplayerSongChange();
    });

    miniplayerObserver.observe(target, {
      attributes: true,
      attributeFilter: ["active", "hidden", "style", "class"],
      childList: true,
      subtree: true,
    });
  }

  if (!miniplayerPollInterval) {
    miniplayerPollInterval = setInterval(() => {
      checkAndManageMiniCompanion();
      checkMiniplayerSongChange();
    }, 800);
  }
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
    if (secondary) {
      const targetContainer =
        secondary.querySelector<HTMLElement>("#secondary-inner") || secondary;
      if (wrapper.parentElement !== targetContainer || targetContainer.firstChild !== wrapper) {
        targetContainer.insertBefore(wrapper, targetContainer.firstChild);
      }
    }
  }
}

let secondaryColumnObserver: MutationObserver | null = null;

function ensureWatchPanelMounted() {
  if (!isStandardYouTubeWatchPage()) return;
  const state = useAppStore.getState();
  const isFloatingAllowed = state.displayMode === "floating";
  if (isFloatingAllowed) return;

  const secondary = findVisibleSecondaryColumn();
  if (!secondary) return;

  const targetContainer =
    secondary.querySelector<HTMLElement>("#secondary-inner") || secondary;
  const existing = document.getElementById("lyrical-panel-wrapper");

  if (!existing || !document.body.contains(existing)) {
    log("[Lyrical Panel] Panel detached from watch layout, re-injecting...");
    injectIntoYouTube();
  } else if (existing.parentElement !== targetContainer || targetContainer.firstChild !== existing) {
    log("[Lyrical Panel] Moving panel back to top of secondary container...");
    targetContainer.insertBefore(existing, targetContainer.firstChild);
  }

  // Set up observer on targetContainer to survive playlist mounting/DOM churn
  if (!secondaryColumnObserver && targetContainer) {
    secondaryColumnObserver = new MutationObserver(() => {
      if (!isStandardYouTubeWatchPage()) {
        secondaryColumnObserver?.disconnect();
        secondaryColumnObserver = null;
        return;
      }
      const panel = document.getElementById("lyrical-panel-wrapper");
      const currentContainer =
        findVisibleSecondaryColumn()?.querySelector<HTMLElement>("#secondary-inner") ||
        findVisibleSecondaryColumn();
      if (currentContainer && (!panel || !document.body.contains(panel) || panel.parentElement !== currentContainer || currentContainer.firstChild !== panel)) {
        ensureWatchPanelMounted();
      }
    });

    secondaryColumnObserver.observe(targetContainer, {
      childList: true,
    });
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
    ensureKaraokeOverlay();

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
          ensureKaraokeOverlay();
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
        const currentVideoId =
          currentSongInfo?.videoId ||
          (typeof window !== "undefined" && window.location?.search
            ? new URLSearchParams(window.location.search).get("v")
            : null) ||
          null;
        versions[versionId] = {
          label: langName,
          synced: parsed.synced,
          lyrics: parsed.lyrics,
          timestamp: Date.now(),
          ...(currentVideoId ? { videoId: currentVideoId } : {}),
        };
        if (currentVideoId && !versions.videoId) {
          versions.videoId = currentVideoId;
        }
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
    const currentVideoId =
      currentSongInfo?.videoId ||
      (typeof window !== "undefined" && window.location?.search
        ? new URLSearchParams(window.location.search).get("v")
        : null) ||
      null;
    if (
      currentVideoId &&
      lyricsByVersion &&
      typeof lyricsByVersion === "object"
    ) {
      (lyricsByVersion as any).videoId = currentVideoId;
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
  const artist = songInfo?.originalArtist || songInfo?.artist;
  const title = songInfo?.originalTitle || songInfo?.title;
  if (!artist || !title) return null;
  const baseKey = `lyrics_${artist}_${title}`;
  return sourceId ? `${baseKey}__${sourceId}` : baseKey;
}

function getCacheLookupIdsForSource(sourceId: string): string[] {
  switch (sourceId) {
    case "musixmatch":
      return ["musixmatch", "musixmatch-richsync"];
    case "musixmatch-synced":
      return ["musixmatch-synced"];
    case "youlyplus-richsynced":
      return ["youlyplus-richsynced"];
    case "youlyplus-synced":
      return ["youlyplus-synced"];
    case "unison-richsynced":
      return ["unison-richsynced"];
    case "unison-wordsynced":
      return ["unison-wordsynced"];
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
    case "youlyplus-richsynced":
    case "youlyplus-synced":
      return "YouLy+";
    case "unison-richsynced":
    case "unison-wordsynced":
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
  "youlyplus-richsynced",
  "youlyplus-synced",
  "unison-richsynced",
  "unison-wordsynced",
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

function formatCaptionLanguageLabel(
  language?: string | null,
  isAsr = false,
  fallbackLabel = "",
  vssId = "",
): string {
  const isCode =
    !fallbackLabel ||
    fallbackLabel.length <= 3 ||
    /^[a-z]{2,3}(-[a-z0-9]+)?$/i.test(fallbackLabel.trim());

  if (
    !isCode &&
    !fallbackLabel.toLowerCase().startsWith("captions") &&
    fallbackLabel.toLowerCase() !== "youtube captions"
  ) {
    let label = fallbackLabel;
    const rawTag = (language || vssId || "").toLowerCase();
    if (
      label.trim().toLowerCase() === "english" &&
      (rawTag.includes("en-us") ||
        rawTag.includes("en.us") ||
        rawTag.includes("-us") ||
        rawTag.includes(".us"))
    ) {
      label = "English-US";
    }
    return isAsr && !label.toLowerCase().includes("auto")
      ? `${label} (auto)`
      : label;
  }

  const rawCode = (language || fallbackLabel || "en").replace("_", "-").trim();
  const parts = rawCode.split("-");
  const cleanCode = parts[0].toLowerCase();
  const region = parts[1]
    ? parts[1].toUpperCase()
    : vssId.toLowerCase().includes("us")
      ? "US"
      : "";

  if (cleanCode && cleanCode !== "default" && cleanCode !== "auto") {
    let name = cleanCode.toUpperCase();
    try {
      name =
        new Intl.DisplayNames(["en"], { type: "language" }).of(cleanCode) ||
        cleanCode.toUpperCase();
    } catch {}

    const formattedName = region ? `${name}-${region}` : name;
    return isAsr ? `${formattedName} (auto)` : formattedName;
  }

  const fallback = region ? `English-${region}` : "English";
  return isAsr ? `${fallback} (auto)` : fallback;
}

function isValidCachedTrackLyrics(
  cachedTrack: any,
  expectedLang: string,
): boolean {
  if (
    !cachedTrack?.lyrics ||
    !Array.isArray(cachedTrack.lyrics) ||
    cachedTrack.lyrics.length === 0
  ) {
    return false;
  }
  if (!expectedLang || expectedLang === "auto") return true;
  const cleanLang = expectedLang.split("-")[0].toLowerCase();

  const sample = cachedTrack.lyrics
    .slice(0, 25)
    .map((l: any) => l?.text || "")
    .join(" ");

  // If expected language is Japanese, it MUST contain Japanese characters (Hiragana/Katakana/CJK)
  if (cleanLang === "ja") {
    return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(sample);
  }
  // If expected language is Hindi, must contain Devanagari
  if (cleanLang === "hi") {
    return /[\u0900-\u097F]/.test(sample);
  }
  // If expected language is Korean, must contain Hangul
  if (cleanLang === "ko") {
    return /[\uAC00-\uD7AF\u1100-\u11FF]/.test(sample);
  }
  // If expected language is Russian, must contain Cyrillic
  if (cleanLang === "ru") {
    return /[\u0400-\u04FF]/.test(sample);
  }
  // If expected language is Arabic, must contain Arabic
  if (cleanLang === "ar") {
    return /[\u0600-\u06FF]/.test(sample);
  }

  return true;
}

async function persistLyricsCache(songInfo, sourceId, lyrics, extra: any = {}) {
  if (!Array.isArray(lyrics) || lyrics.length === 0 || !sourceId) return;

  const genericKey = getLyricsCacheKey(songInfo);
  const sourceKey = getLyricsCacheKey(songInfo, sourceId);
  if (!genericKey || !sourceKey) return;

  let tracksMap: Record<string, any> | undefined = undefined;
  let activeTrackId: string | undefined = undefined;

  if (sourceId === "captions") {
    try {
      if (hasLocalStorageApi() && chrome?.storage?.local?.get) {
        const existing = await chrome.storage.local.get([sourceKey]);
        const prevEntry = existing?.[sourceKey] || {};
        const prevTracks = prevEntry.tracks || {};
        const rawLang =
          extra.language || useAppStore.getState().lyricsLanguage || "auto";
        const isAsr =
          extra.isAsr ??
          (String(extra.trackId || "").includes("asr") ||
            String(extra.label || "")
              .toLowerCase()
              .includes("auto"));
        const trackId =
          extra.trackId ||
          `${rawLang.toLowerCase()}-${isAsr ? "asr" : "manual"}`;
        const trackLabel = formatCaptionLanguageLabel(
          rawLang,
          isAsr,
          extra.label || "",
          trackId,
        );

        activeTrackId = trackId;

        const updatedTracks: Record<string, any> = {};
        for (const [key, oldTrack] of Object.entries(prevTracks) as [
          string,
          any,
        ][]) {
          const oldLang = (oldTrack.language || "").toLowerCase();
          const oldIsAsr =
            Boolean(oldTrack.isAsr) ||
            String(key).includes("asr") ||
            String(oldTrack.label || "")
              .toLowerCase()
              .includes("auto");

          // Clean up any historical corrupted entries where key is ja/japanese but language was saved as en
          if (
            (key.toLowerCase().includes("ja") ||
              key.toLowerCase().includes("japanese")) &&
            (oldLang === "en" || oldLang.startsWith("en-"))
          ) {
            continue;
          }

          if (
            key === trackId ||
            (oldTrack.trackId && oldTrack.trackId === trackId) ||
            (oldLang === rawLang.toLowerCase() && oldIsAsr === isAsr)
          ) {
            continue; // replace old key with current unique trackId
          }
          updatedTracks[key] = oldTrack;
        }

        updatedTracks[trackId] = {
          trackId,
          language: rawLang.toLowerCase(),
          label: trackLabel,
          isAsr,
          lyrics,
          romanizedLyrics:
            extra.romanizedLyrics || prevTracks[trackId]?.romanizedLyrics || [],
          translatedLyrics:
            extra.translatedLyrics ||
            prevTracks[trackId]?.translatedLyrics ||
            [],
          timestamp: Date.now(),
        };

        tracksMap = updatedTracks;
      }
    } catch (e) {
      warn("[Lyrical Panel] Error preparing captions track cache:", e);
    }
  }

  const currentVideoId =
    songInfo?.videoId ||
    (typeof window !== "undefined" && window.location?.search
      ? new URLSearchParams(window.location.search).get("v")
      : null) ||
    extra?.videoId ||
    null;

  const entry: any = {
    lyrics,
    source: sourceId,
    cacheSchemaVersion: LYRICS_CACHE_SCHEMA_VERSION,
    timestamp: Date.now(),
    ...(currentVideoId ? { videoId: currentVideoId } : {}),
    ...extra,
  };

  if (tracksMap) {
    entry.tracks = tracksMap;
    entry.activeTrackId = activeTrackId;
  }

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
    warn("[Lyrical Panel] Cache persist failed:", err);
  }
}

function restoreLyricsFromCacheEntry(
  entry,
  fallbackSourceId,
  fallbackLabel = "",
) {
  if (!entry?.lyrics || entry.lyrics.length === 0) return false;
  if (shouldRefreshParagraphAwareCache(entry, fallbackSourceId)) return false;

  const currentSource = entry.source || fallbackSourceId || "unknown";
  let activeLyrics = entry.lyrics;
  let activeLang = entry.language || "auto";
  let activeRomanized = entry.romanizedLyrics || [];
  let activeTranslated = entry.translatedLyrics || [];
  let activeTrackId = entry.activeTrackId || null;

  if (currentSource === "captions" || fallbackSourceId === "captions") {
    if (entry.tracks && typeof entry.tracks === "object") {
      const activeTrack = activeTrackId
        ? entry.tracks[activeTrackId]
        : Object.values(entry.tracks)[0];
      if (
        activeTrack?.lyrics?.length > 0 &&
        isValidCachedTrackLyrics(
          activeTrack,
          activeTrack.language || activeLang,
        )
      ) {
        activeLyrics = activeTrack.lyrics;
        activeLang = activeTrack.language || activeLang;
        activeRomanized = activeTrack.romanizedLyrics || activeRomanized;
        activeTranslated = activeTrack.translatedLyrics || activeTranslated;
        activeTrackId = activeTrack.trackId || activeTrackId;
      }
    }
  }

  const isCaptionsSource =
    currentSource === "captions" || fallbackSourceId === "captions";
  const cleanActiveLyrics = isCaptionsSource
    ? activeLyrics
    : normalizeLyrics(activeLyrics);

  fetchedLyrics = cleanActiveLyrics;
  lyricsByVersion.default = {
    id: `${fallbackSourceId || entry.source || "cached"}-cache`,
    label:
      entry.label ||
      getCacheLabelForSource(entry.source || fallbackSourceId, fallbackLabel),
    synced: true,
    lyrics: cleanActiveLyrics,
  };

  lyricsJustLoaded = true;
  lyricsRendered = false;
  isTripleLineMode = false;

  useAppStore
    .getState()
    .setLyrics(
      cleanActiveLyrics,
      currentSource,
      detectLyricsLanguage(cleanActiveLyrics, activeLang),
    );

  if (currentSource === "captions" || fallbackSourceId === "captions") {
    userSongOffset = 0;
    currentSyncOffset = 0;
    useAppStore.getState().setOffset(0, 0);
    const shortLang = (activeLang || "auto").split("-")[0].toUpperCase();
    useAppStore.setState({
      captionLanguageLabel: shortLang,
      selectedCaptionTrackId: activeTrackId,
    });

    if (availableCaptions && availableCaptions.length > 0) {
      syncAvailableCaptionTracks(availableCaptions);
    } else if (entry.tracks && typeof entry.tracks === "object") {
      const cachedTrackList = Object.values(entry.tracks);
      if (cachedTrackList.length > 0) {
        const dedupMap = new Map<string, CaptionTrackInfo>();
        cachedTrackList.forEach((t: any, idx: number) => {
          const rawLang = t.language || "auto";
          const isAsr =
            Boolean(t.isAsr) ||
            String(t.trackId || "").includes("asr") ||
            String(t.label || "")
              .toLowerCase()
              .includes("auto");
          const vssId =
            t.trackId ||
            `${rawLang.toLowerCase()}-${isAsr ? "asr" : "manual"}-${idx}`;
          const displayName = formatCaptionLanguageLabel(
            rawLang,
            isAsr,
            t.label || "",
            vssId,
          );
          const dedupKey =
            t.trackId || `${rawLang.toLowerCase()}-${isAsr ? "asr" : "manual"}`;
          if (
            !dedupMap.has(dedupKey) ||
            (t.lyrics?.length && !dedupMap.get(dedupKey)?.url)
          ) {
            dedupMap.set(dedupKey, {
              vssId,
              languageCode: rawLang.toLowerCase(),
              name: displayName,
              kind: isAsr ? "asr" : "manual",
              url: t.url || "",
              isAsr,
            });
          }
        });
        const normalizedTracks = Array.from(dedupMap.values());
        const nameCounts = new Map<string, number>();
        normalizedTracks.forEach((nt) => {
          nameCounts.set(nt.name, (nameCounts.get(nt.name) || 0) + 1);
        });
        normalizedTracks.forEach((nt) => {
          if ((nameCounts.get(nt.name) || 0) > 1) {
            const isUs =
              nt.vssId.toLowerCase().includes("us") ||
              nt.languageCode.toLowerCase().includes("us");
            if (isUs && nt.name.toLowerCase().startsWith("english")) {
              nt.name = nt.isAsr ? "English-US (auto)" : "English-US";
            }
          }
        });
        useAppStore.setState({
          availableCaptionTracks: normalizedTracks,
          selectedCaptionTrackId: activeTrackId || normalizedTracks[0]?.vssId,
          captionLanguageLabel: (
            activeLang ||
            normalizedTracks[0]?.languageCode ||
            "auto"
          )
            .split("-")[0]
            .toUpperCase(),
        });
      }
    }
  }

  if (activeRomanized?.length || activeTranslated?.length) {
    updateSecondaryLyricsState({
      romanizedLyrics: activeRomanized,
      translatedLyrics: activeTranslated,
      isProcessingLyrics: false,
    });
  } else {
    autoProcessLyrics();
  }

  startLyricsTimer(cleanActiveLyrics);

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
  const candidateSongInfos = [songInfo];
  if (
    songInfo?.originalTitle &&
    songInfo?.title &&
    songInfo.originalTitle !== songInfo.title
  ) {
    candidateSongInfos.push({
      ...songInfo,
      artist: songInfo.artist,
      title: songInfo.title,
      originalArtist: songInfo.artist,
      originalTitle: songInfo.title,
    });
  }

  const sourceCacheKeys = Array.from(
    new Set(
      candidateSongInfos.flatMap((info) =>
        getCacheLookupIdsForSource(source.id)
          .map((cacheSourceId) => getLyricsCacheKey(info, cacheSourceId))
          .filter(Boolean),
      ),
    ),
  );
  if (sourceCacheKeys.length === 0) return false;
  if (typeof chrome === "undefined" || !chrome?.storage?.local?.get)
    return false;

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

// Normalize lyrics (sort + strip metadata + insert instrumental breaks + fix duplicates)
function normalizeLyrics(lyrics) {
  if (!lyrics || !lyrics.length) return lyrics;
  const songDuration = Number(currentSongInfo?.duration || 0);
  return normalizeLyricsPipeline(lyrics, songDuration, currentSongInfo);
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
    pendingMainWorldCaptionTrack = null;
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

  // Always reset offset state to 0.0s for new song/video/source transitions
  suppressNextOffsetPersistence = true;
  userSongOffset = 0;
  currentSyncOffset = PLATFORM_OFFSET;
  useAppStore.getState().setOffset(PLATFORM_OFFSET, 0);
  suppressNextOffsetPersistence = false;

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

  const cleanLyrics = normalizeLyrics(lyrics);
  fetchedLyrics = cleanLyrics;
  lyricsByVersion.default = {
    id: sourceId,
    label,
    synced,
    lyrics: cleanLyrics,
  };

  lyricsJustLoaded = true;
  lyricsRendered = false;
  isTripleLineMode = false;

  useAppStore
    .getState()
    .setLyrics(
      cleanLyrics,
      sourceId,
      detectLyricsLanguage(cleanLyrics, language),
    );

  persistLyricsCache(currentSongInfo, sourceId, cleanLyrics, {
    label,
    language,
    synced,
  });

  const inlineRomanized = cleanLyrics.map((line) => ({
    time: line.time,
    romanized: line.isInstrumental
      ? ""
      : line.romanized || line.romanization || "",
    timedRomanization: line.isInstrumental
      ? null
      : line.timedRomanization || null,
  }));
  const inlineTranslated = cleanLyrics.map((line) => ({
    time: line.time,
    translated: line.isInstrumental
      ? ""
      : line.translated || line.translation || "",
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
    startLyricsTimer(cleanLyrics);
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
async function tryFetchCubey(songInfo, preferredIdentity = "musixmatch") {
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
        preferredIdentity === "better_lyrics"
          ? "better_lyrics"
          : "musixmatch-richsync";
      const richLabel = "Musixmatch";

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

async function tryFetchYouLyPlusSource(songInfo, sourceId) {
  const data = await fetchYouLyPlusSourceLyrics(songInfo, sourceId);
  if (!data) return false;

  return setFetchedSourceLyrics({
    sourceId: data.sourceId,
    label: data.label,
    lyrics: data.lyrics,
    language: data.language,
    synced: true,
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
  const currentVideoId = getCurrentVideoId(currentSongInfo);
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
  syncAvailableCaptionTracks(availableCaptions);
  useAppStore
    .getState()
    .setLyrics(
      fetchedLyrics,
      "captions",
      detectLyricsLanguage(fetchedLyrics, languageCode),
    );
  userSongOffset = 0;
  currentSyncOffset = 0;
  useAppStore.getState().setOffset(0, 0);
  useAppStore.setState({
    captionLanguageLabel: (languageCode || "auto").toUpperCase(),
  });
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

function getCaptionTrackLang(track: any) {
  return track?.languageCode || track?.lang || null;
}

function getCaptionTrackName(track: any): string {
  if (!track) return "";
  if (track.name?.simpleText) return track.name.simpleText;
  if (Array.isArray(track.name?.runs) && track.name.runs[0]?.text) {
    return track.name.runs.map((r: any) => r?.text || "").join("");
  }
  if (typeof track.name === "string") return track.name;
  if (track.languageName) return track.languageName;
  return track.languageCode || track.lang || "";
}

function getCaptionTrackUrl(track: any) {
  const raw = track?.baseUrl || track?.url || track?.link || null;
  if (!raw) return null;
  return String(raw)
    .replace(/\\u0026/g, "&")
    .replace(/&amp;/g, "&");
}

async function syncAvailableCaptionTracks(tracks: any[]) {
  const trackList = Array.isArray(tracks) ? tracks : [];
  const trackDedupMap = new Map<string, CaptionTrackInfo>();

  trackList.forEach((t: any, idx: number) => {
    const rawLang = getCaptionTrackLang(t) || "auto";
    const rawName = getCaptionTrackName(t) || rawLang;
    const url = getCaptionTrackUrl(t) || "";
    const isAsr =
      t.kind === "asr" ||
      String(t.vssId || "").startsWith("a.") ||
      String(rawName).toLowerCase().includes("auto-generated") ||
      String(rawName).toLowerCase().includes("auto-gen") ||
      String(rawName).toLowerCase().includes("auto");
    const cleanName =
      String(rawName)
        .replace(/\(auto-generated\)/i, "")
        .replace(/\(auto-gen\)/i, "")
        .replace(/\(auto\)/i, "")
        .trim() || rawName;
    const vssId =
      t.vssId || `${rawLang.toLowerCase()}-${isAsr ? "asr" : "manual"}-${idx}`;
    const displayName = formatCaptionLanguageLabel(
      rawLang,
      isAsr,
      cleanName,
      vssId,
    );
    const dedupKey =
      t.vssId || `${rawLang.toLowerCase()}-${isAsr ? "asr" : "manual"}`;

    trackDedupMap.set(dedupKey, {
      vssId,
      languageCode: rawLang.toLowerCase(),
      name: displayName,
      kind: isAsr ? "asr" : "manual",
      url,
      isAsr,
    });
  });

  if (currentSongInfo && hasLocalStorageApi() && chrome?.storage?.local?.get) {
    try {
      const sourceKey = getLyricsCacheKey(currentSongInfo, "captions");
      if (sourceKey) {
        const stored = await chrome.storage.local.get([sourceKey]);
        const cachedTracks = stored?.[sourceKey]?.tracks;
        if (cachedTracks && typeof cachedTracks === "object") {
          Object.values(cachedTracks).forEach((ct: any, idx: number) => {
            const rawLang = ct.language || "auto";
            const isAsr =
              Boolean(ct.isAsr) ||
              String(ct.trackId || "").includes("asr") ||
              String(ct.label || "")
                .toLowerCase()
                .includes("auto");
            const vssId =
              ct.trackId ||
              `${rawLang.toLowerCase()}-${isAsr ? "asr" : "manual"}-${idx}`;
            const dedupKey =
              ct.trackId ||
              `${rawLang.toLowerCase()}-${isAsr ? "asr" : "manual"}`;

            if (trackDedupMap.has(dedupKey)) {
              const existing = trackDedupMap.get(dedupKey)!;
              if (!existing.url && ct.url) {
                existing.url = ct.url;
              }
            } else {
              const existingLiveMatch = Array.from(trackDedupMap.values()).find(
                (lt) =>
                  lt.vssId === vssId ||
                  (lt.languageCode === rawLang.toLowerCase() &&
                    lt.isAsr === isAsr),
              );
              if (existingLiveMatch) {
                if (!existingLiveMatch.url && ct.url) {
                  existingLiveMatch.url = ct.url;
                }
              } else {
                const displayName = formatCaptionLanguageLabel(
                  rawLang,
                  isAsr,
                  ct.label || "",
                  vssId,
                );
                trackDedupMap.set(dedupKey, {
                  vssId,
                  languageCode: rawLang.toLowerCase(),
                  name: displayName,
                  kind: isAsr ? "asr" : "manual",
                  url: ct.url || "",
                  isAsr,
                });
              }
            }
          });
        }
      }
    } catch {}
  }

  const finalTracks = Array.from(trackDedupMap.values());
  const nameCounts = new Map<string, number>();
  finalTracks.forEach((t) => {
    nameCounts.set(t.name, (nameCounts.get(t.name) || 0) + 1);
  });
  finalTracks.forEach((t) => {
    if ((nameCounts.get(t.name) || 0) > 1) {
      const isUs =
        t.vssId.toLowerCase().includes("us") ||
        t.languageCode.toLowerCase().includes("us");
      if (isUs && t.name.toLowerCase().startsWith("english")) {
        t.name = t.isAsr ? "English-US (auto)" : "English-US";
      } else if (t.languageCode && t.languageCode.includes("-")) {
        const reg = t.languageCode.split("-")[1].toUpperCase();
        t.name = `${t.name}-${reg}`;
      }
    }
  });
  if (finalTracks.length > 0) {
    const currentSelected = useAppStore.getState().selectedCaptionTrackId;
    const currentLabel = (
      useAppStore.getState().captionLanguageLabel || ""
    ).toLowerCase();
    let activeId = currentSelected;
    if (!activeId || !finalTracks.some((t) => t.vssId === activeId)) {
      const match =
        finalTracks.find(
          (t) =>
            currentLabel.includes(t.languageCode.toLowerCase()) && !t.isAsr,
        ) ||
        finalTracks.find((t) =>
          currentLabel.includes(t.languageCode.toLowerCase()),
        ) ||
        finalTracks[0];
      activeId = match?.vssId || null;
    }
    useAppStore.setState({
      availableCaptionTracks: finalTracks,
      ...(activeId ? { selectedCaptionTrackId: activeId } : {}),
    });
  }
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
  const videoId = getCurrentVideoId(currentSongInfo);
  if (!videoId) return false;
  if (!canDisplayCaptionsForCurrentFetch()) return false;

  log("Attempting to load captions for video:", videoId);

  let lyrics = null;
  let methodUsed = "none";
  let languageCode = null;
  let selectedTrack: any = null;

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
    selectedTrack = pendingMainWorldCaptionTrack;
    methodUsed = "main-world-prefetch";
    log("Using queued MAIN-world prefetched captions:", lyrics.length);
  }

  // If we don't have availableCaptions or lyrics yet, wait briefly (up to 1000ms)
  // for the MAIN world captions extractor to announce tracks or finish prefetching.
  if (!lyrics && (!availableCaptions || availableCaptions.length === 0)) {
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 200));
      if (
        pendingMainWorldCaptionLyrics &&
        pendingMainWorldCaptionLyrics.length > 0 &&
        (!pendingMainWorldCaptionVideoId ||
          pendingMainWorldCaptionVideoId === videoId)
      ) {
        lyrics = pendingMainWorldCaptionLyrics;
        languageCode = pendingMainWorldCaptionLanguage || "auto";
        selectedTrack = pendingMainWorldCaptionTrack;
        methodUsed = "main-world-prefetch-delayed";
        log("Captured late MAIN-world prefetched captions:", lyrics.length);
        break;
      }
      if (availableCaptions && availableCaptions.length > 0) {
        break;
      }
    }
  }

  // --- METHOD 1: Direct Fetch & MAIN-world Fallback ---
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
    selectedTrack = orderedTracks[0];

    if (selectedTrack) {
      const selectedTrackUrl = getCaptionTrackUrl(selectedTrack);
      if (selectedTrackUrl) {
        lyrics = await fetchCaptionsFromContentScript(
          selectedTrackUrl,
          selectedTrack,
        );
        if (lyrics && lyrics.length > 0) {
          methodUsed = "direct";
          languageCode = getCaptionTrackLang(selectedTrack) || languageCode;
        }
      }

      // If direct fetch couldn't get lyrics (e.g. content script CORS/cookie restrictions),
      // fallback to requesting via MAIN world which has direct YouTube player API access!
      if (!lyrics) {
        log(
          "Direct fetch yielded no captions, requesting track via MAIN world...",
        );
        const mainWorldLyrics = await requestCaptionTrackFromMainWorld({
          vssId: selectedTrack.vssId,
          languageCode: getCaptionTrackLang(selectedTrack) || "en",
          isAsr:
            selectedTrack.kind === "asr" ||
            String(selectedTrack.vssId || "").startsWith("a."),
          url: selectedTrackUrl || "",
          name: getCaptionTrackName(selectedTrack),
          kind: selectedTrack.kind,
        });
        if (mainWorldLyrics && mainWorldLyrics.length > 0) {
          lyrics = mainWorldLyrics;
          methodUsed = "main-world-request";
          languageCode = getCaptionTrackLang(selectedTrack) || languageCode;
        }
      }
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
    const currentVideoId = getCurrentVideoId(currentSongInfo);
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
    syncAvailableCaptionTracks(availableCaptions);
    useAppStore
      .getState()
      .setLyrics(
        fetchedLyrics,
        "captions",
        detectLyricsLanguage(fetchedLyrics, languageCode),
      );
    userSongOffset = 0;
    currentSyncOffset = 0;
    useAppStore.getState().setOffset(0, 0);
    useAppStore.setState({
      captionLanguageLabel: (languageCode || "auto").toUpperCase(),
      selectedCaptionTrackId: selectedTrack
        ? selectedTrack.vssId ||
          `${languageCode}-${selectedTrack.kind || "std"}`
        : null,
    });
    persistLyricsCache(currentSongInfo, "captions", fetchedLyrics, {
      label: `Captions (${languageCode || "auto"})`,
      language: languageCode || null,
      trackId: selectedTrack
        ? selectedTrack.vssId ||
          `${languageCode}-${selectedTrack.kind || "std"}`
        : null,
      isAsr: selectedTrack?.kind === "asr",
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
      pendingMainWorldCaptionTrack = null;
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
      const cleanLyrics = normalizeLyrics(data.lyrics);
      fetchedLyrics = cleanLyrics;

      // Register version for potential switching
      lyricsByVersion.default = {
        id: "lyrical-boidu",
        label:
          sourceId === "test-lyrical"
            ? "Test Lyrical (Boidu)"
            : "Lyrical (Boidu)",
        synced: true,
        lyrics: cleanLyrics,
        source: "boidu",
      };

      lyricsJustLoaded = true;
      lyricsRendered = false;

      // Trigger Store Update
      useAppStore
        .getState()
        .setLyrics(
          cleanLyrics,
          sourceId,
          detectLyricsLanguage(cleanLyrics, data.language),
        );
      persistLyricsCache(currentSongInfo, sourceId, cleanLyrics, {
        label:
          sourceId === "test-lyrical"
            ? "Test Lyrical (Boidu)"
            : "Lyrical (Boidu)",
        language: data.language || null,
      });

      const inlineRomanized = cleanLyrics.map((line) => ({
        time: line.time,
        romanized: line.isInstrumental
          ? ""
          : line.romanized || line.romanization || "",
        timedRomanization: line.isInstrumental
          ? null
          : line.timedRomanization || null,
      }));
      const inlineTranslated = cleanLyrics.map((line) => ({
        time: line.time,
        translated: line.isInstrumental
          ? ""
          : line.translated || line.translation || "",
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

      startLyricsTimer(cleanLyrics);
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
        // Update our stored song info with API data while preserving original keys
        const newInfo = {
          ...currentSongInfo,
          originalArtist:
            currentSongInfo?.originalArtist ||
            currentSongInfo?.artist ||
            match.artistName,
          originalTitle:
            currentSongInfo?.originalTitle ||
            currentSongInfo?.title ||
            match.trackName,
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
        const cleanLyrics = normalizeLyrics(parsedLyrics);
        fetchedLyrics = cleanLyrics;
        lyricsByVersion.default = {
          id: "lrclib",
          label: "LRCLib",
          synced: true,
          lyrics: cleanLyrics,
        };

        lyricsJustLoaded = true;
        lyricsRendered = false;
        isTripleLineMode = false;
        useAppStore
          .getState()
          .setLyrics(cleanLyrics, "lrclib", detectLyricsLanguage(cleanLyrics));
        persistLyricsCache(currentSongInfo, "lrclib", cleanLyrics, {
          label: "LRCLib",
        });
        startLyricsTimer(cleanLyrics);
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

  const candidateSongInfos = [songInfo];
  if (
    songInfo?.originalTitle &&
    songInfo?.title &&
    songInfo.originalTitle !== songInfo.title
  ) {
    candidateSongInfos.push({
      ...songInfo,
      artist: songInfo.artist,
      title: songInfo.title,
      originalArtist: songInfo.artist,
      originalTitle: songInfo.title,
    });
  }

  const allKeysMap = new Map<string, string>();
  for (const info of candidateSongInfos) {
    for (const source of enabledSources) {
      const lookupIds = getCacheLookupIdsForSource(source.id);
      for (const subId of lookupIds) {
        const key = getLyricsCacheKey(info, subId);
        if (key) allKeysMap.set(key, subId);
      }
    }
  }

  if (allKeysMap.size === 0) return;
  if (typeof chrome === "undefined" || !chrome?.storage?.local?.get) return;
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
    currentFetchVideoId !== getCurrentVideoId(songInfo);

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
      if (typeof chrome === "undefined" || !chrome?.storage?.local?.get) break;
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
        [
          "unison-richsynced",
          "unison-wordsynced",
          "unison-synced",
          "unison-plain",
        ].includes(source.id)
      ) {
        fetchedData = await fetchUnisonSourceLyrics(songInfo, source.id);
      } else if (
        source.id === "youlyplus-richsynced" ||
        source.id === "youlyplus-synced"
      ) {
        fetchedData = await fetchYouLyPlusSourceLyrics(songInfo, source.id);
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
      } else if (source.id === "musixmatch") {
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

  // 🛑 AD GUARD: Do not attempt lyrics search while an ad is playing
  if (isYouTubeAdPlaying() || songInfo?.isAd) {
    useAppStore.getState().setIsAdPlaying(true);
    useAppStore.setState({
      isLoading: true,
      headerText: "Ad in progress...",
    });
    log(
      "[Lyrical] Ad is currently playing — pausing lyrics search until ad ends",
    );
    return;
  }

  // 🔥 Use videoId as source of truth (from URL or miniplayer or songInfo)
  const isWatchUrl =
    window.location.href.includes("/watch") &&
    window.location.href.includes("v=");

  const videoId = getCurrentVideoId(songInfo);
  if (!videoId) return;

  if (videoId && !songInfo.videoId) {
    songInfo.videoId = videoId;
  }
  if (!songInfo.originalTitle) {
    songInfo.originalTitle = songInfo.title;
  }
  if (!songInfo.originalArtist) {
    songInfo.originalArtist = songInfo.artist;
  }

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

  // GUARD: Ensure panel is ready before updating ONLY on watch page
  // On homepage/search with miniplayer, lyricsPanel is not in the DOM
  if (isWatchUrl && (!lyricsPanel || !document.body.contains(lyricsPanel))) {
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
  const enabledSources = (sourcePreferences || []).filter((s) => s.enabled);
  resetCurrentFetchSourceGuard();
  log("New video detected:", videoId);

  const isStaleFetch = () =>
    fetchSessionId !== activeFetchSessionId ||
    (isWatchUrl &&
      videoId !== new URLSearchParams(window.location.search).get("v"));

  // Reset state
  resetLyricsState(options.reason || "video changed", {
    preserveCaptionCacheForVideoId: videoId,
  });
  // If ad is playing or title is UNLABELED, try to get real video info from page
  if (
    useAppStore.getState().isAdPlaying ||
    songInfo?.title?.toUpperCase() === "UNLABELED"
  ) {
    const realInfo = window.getSongInfoFromPage?.();
    if (
      realInfo &&
      !realInfo.isAd &&
      realInfo.title &&
      realInfo.title.toUpperCase() !== "UNLABELED"
    ) {
      songInfo = realInfo;
    }
  }

  currentSongInfo = songInfo;
  updateSongInfo(songInfo);

  if (useAppStore.getState().isAdPlaying || isYouTubeAdPlaying()) {
    log(
      "[Lyrical] Ad is currently playing — pausing lyrics search until ad ends",
    );
    useAppStore.setState({
      isLoading: true,
      headerText: "Ad in progress...",
    });
    return;
  }

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
            warn("Boidu fetch crashed loop", e);
            found = false;
          }
          break;
        case "test-lyrical":
          try {
            found = await tryFetchBoidu(songInfo, "test-lyrical");
          } catch (e) {
            warn("Test Boidu fetch crashed loop", e);
            found = false;
          }
          break;
        case "unison-richsynced":
        case "unison-wordsynced":
        case "unison-synced":
        case "unison-plain":
          found = await tryFetchUnisonSource(songInfo, source.id);
          break;
        case "youlyplus-richsynced":
        case "youlyplus-synced":
          found = await tryFetchYouLyPlusSource(songInfo, source.id);
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
    warn("[Lyrical Panel] Fetch error:", error);
  } finally {
    useAppStore.setState({ isLoading: false });
  }
}

window.addEventListener("lyrical-select-source", async (event: any) => {
  const sourceId = event.detail?.sourceId;
  if (!sourceId || !currentSongInfo) return;

  log("[Lyrical] User manually selected source:", sourceId);
  if (sourceId === "captions") {
    userSongOffset = 0;
    currentSyncOffset = 0;
    useAppStore.getState().setOffset(0, 0);
  } else {
    suppressNextOffsetPersistence = true;
    userSongOffset = 0;
    currentSyncOffset = PLATFORM_OFFSET;
    useAppStore.getState().setOffset(PLATFORM_OFFSET, 0);
    suppressNextOffsetPersistence = false;
  }
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
    case "musixmatch":
      found = await tryFetchCubey(currentSongInfo, "musixmatch");
      break;
    case "unison-richsynced":
    case "unison-wordsynced":
    case "unison-synced":
    case "unison-plain":
      found = await tryFetchUnisonSource(currentSongInfo, sourceId);
      break;
    case "youlyplus-richsynced":
    case "youlyplus-synced":
      found = await tryFetchYouLyPlusSource(currentSongInfo, sourceId);
      break;
    case "bLyrics-synced":
    case "binimum-richsynced":
    case "binimum-synced":
    case "portato-richsynced":
    case "legato-synced":
    case "musixmatch-synced":
      found = await tryFetchUnifiedSource(currentSongInfo, sourceId);
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



window.addEventListener("lyrical-select-caption-track", async (event: any) => {
  const track = event.detail?.track as CaptionTrackInfo;
  if (!track || (!track.url && !track.vssId && !track.languageCode)) return;

  log(
    "[Lyrical] User manually selected caption track:",
    track.name,
    track.languageCode,
  );
  useAppStore.setState({
    isLoading: true,
  });

  try {
    const sourceKey = getLyricsCacheKey(currentSongInfo, "captions");
    let restoredFromCache = false;

    if (sourceKey && hasLocalStorageApi() && chrome?.storage?.local?.get) {
      try {
        const stored = await chrome.storage.local.get([sourceKey]);
        const entry = stored?.[sourceKey];
        let cachedTrack =
          entry?.tracks?.[track.vssId] ||
          (entry?.tracks &&
            Object.values(entry.tracks).find(
              (ct: any) =>
                ct.trackId === track.vssId ||
                ((ct.language || "").split("-")[0].toLowerCase() ===
                  track.languageCode.split("-")[0].toLowerCase() &&
                  Boolean(ct.isAsr) === Boolean(track.isAsr)),
            ));

        // Validate cachedTrack lyrics language
        if (
          cachedTrack &&
          !isValidCachedTrackLyrics(cachedTrack, track.languageCode)
        ) {
          log(
            "[Lyrical] Cached track content is mismatched/corrupted for language:",
            track.name,
            track.languageCode,
          );
          cachedTrack = null;
        }

        if (cachedTrack?.lyrics?.length > 0) {
          log(
            "[Lyrical] Restoring caption track directly from local cache:",
            track.name,
          );
          fetchedLyrics = cachedTrack.lyrics;
          const currentVideoId = getCurrentVideoId(currentSongInfo);
          if (currentVideoId) {
            lastFetchedVideoId = currentVideoId;
          }
          lyricsByVersion.default = {
            id: "captions",
            label: `Captions (${track.languageCode ? track.languageCode.toUpperCase() : "auto"})`,
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
              detectLyricsLanguage(fetchedLyrics, track.languageCode),
            );
          useAppStore.setState({
            captionLanguageLabel: track.languageCode.toUpperCase(),
            selectedCaptionTrackId: track.vssId,
          });

          updateSecondaryLyricsState({
            romanizedLyrics: cachedTrack.romanizedLyrics || [],
            translatedLyrics: cachedTrack.translatedLyrics || [],
            isProcessingLyrics: false,
          });

          // Sync activeTrackId in storage
          entry.activeTrackId = track.vssId;
          entry.lyrics = fetchedLyrics;
          entry.language = track.languageCode;
          const genericKey = getLyricsCacheKey(currentSongInfo);
          chrome.storage.local
            .set({ [sourceKey]: entry, [genericKey]: entry })
            .catch(() => {});

          startLyricsTimer(fetchedLyrics);
          if (window.initTranslationDropdown) window.initTranslationDropdown();

          setTimeout(() => {
            lyricsJustLoaded = false;
          }, 2000);

          restoredFromCache = true;
        }
      } catch (cacheErr) {
        warn("[Lyrical] Caption cache check failed:", cacheErr);
      }
    }

    if (restoredFromCache) {
      useAppStore.setState({ isLoading: false });
      return;
    }

    let lyrics: any[] | null = null;
    let fetchUrl = track.url;
    if (
      !fetchUrl &&
      Array.isArray(availableCaptions) &&
      availableCaptions.length > 0
    ) {
      const match =
        availableCaptions.find(
          (at: any) => at.vssId && at.vssId === track.vssId,
        ) ||
        availableCaptions.find((at: any) => {
          const atLang = (getCaptionTrackLang(at) || "").toLowerCase();
          const targetLang = (track.languageCode || "").toLowerCase();
          const atIsAsr =
            at.kind === "asr" ||
            String(at.vssId || "").startsWith("a.") ||
            getCaptionTrackName(at).toLowerCase().includes("auto");
          return atLang === targetLang && atIsAsr === Boolean(track.isAsr);
        }) ||
        availableCaptions.find((at: any) => {
          const atLang = (getCaptionTrackLang(at) || "")
            .split("-")[0]
            .toLowerCase();
          const targetLang = (track.languageCode || "")
            .split("-")[0]
            .toLowerCase();
          const atIsAsr =
            at.kind === "asr" ||
            String(at.vssId || "").startsWith("a.") ||
            getCaptionTrackName(at).toLowerCase().includes("auto");
          return atLang === targetLang && atIsAsr === Boolean(track.isAsr);
        }) ||
        availableCaptions.find((at: any) => {
          const atLang = (getCaptionTrackLang(at) || "").toLowerCase();
          const targetLang = (track.languageCode || "").toLowerCase();
          return atLang === targetLang;
        }) ||
        availableCaptions.find((at: any) => {
          const atLang = (getCaptionTrackLang(at) || "")
            .split("-")[0]
            .toLowerCase();
          const targetLang = (track.languageCode || "")
            .split("-")[0]
            .toLowerCase();
          return atLang === targetLang;
        });
      fetchUrl = getCaptionTrackUrl(match) || "";
    }

    if (fetchUrl) {
      log(
        "[Lyrical] Fetching captions from live URL:",
        fetchUrl.substring(0, 100),
      );
      const rawLyrics = await fetchCaptionsFromContentScript(fetchUrl);
      if (rawLyrics && rawLyrics.length > 0) {
        lyrics = rawLyrics;
      }
    }

    // Secondary fallback: Request directly from Main World extractor via postMessage
    if (!lyrics || lyrics.length === 0) {
      log(
        "[Lyrical] Requesting caption track directly from Main World extractor:",
        track.name,
      );
      const mainWorldLyrics = await requestCaptionTrackFromMainWorld(track);
      if (mainWorldLyrics && mainWorldLyrics.length > 0) {
        lyrics = mainWorldLyrics;
      }
    }

    if (lyrics && lyrics.length > 0) {
      let cleaned = lyrics
        .map((line: any) => ({
          ...line,
          text: cleanCaptionText(line.text),
        }))
        .filter((line: any) => Boolean(line.text && line.text.trim()));

      const allCaps = cleaned.every(
        (line: any) => line.text && line.text.toUpperCase() === line.text,
      );
      if (allCaps) {
        cleaned = cleaned.map((line: any) => ({
          ...line,
          text:
            line.text.substring(0, 1).toUpperCase() +
            line.text.substring(1).toLowerCase(),
        }));
      }

      fetchedLyrics = normalizeCaptionTiming(cleaned);
      const currentVideoId = getCurrentVideoId(currentSongInfo);
      if (currentVideoId) {
        lastFetchedVideoId = currentVideoId;
      }
      lyricsByVersion.default = {
        id: "captions",
        label: `Captions (${track.languageCode ? track.languageCode.toUpperCase() : "auto"})`,
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
          detectLyricsLanguage(fetchedLyrics, track.languageCode),
        );
      useAppStore.setState({
        captionLanguageLabel: track.languageCode.toUpperCase(),
        selectedCaptionTrackId: track.vssId,
      });

      updateSecondaryLyricsState({
        romanizedLyrics: [],
        translatedLyrics: [],
        isProcessingLyrics: true,
      });

      persistLyricsCache(currentSongInfo, "captions", fetchedLyrics, {
        label: `Captions (${track.languageCode || "auto"})`,
        language: track.languageCode || null,
        trackId: track.vssId,
        isAsr: track.isAsr,
        url: fetchUrl,
      });
      startLyricsTimer(fetchedLyrics);

      if (window.initTranslationDropdown) window.initTranslationDropdown();
      autoProcessLyrics();

      if (!currentSongInfo?.title || !currentSongInfo?.artwork) {
        hydrateSongInfoWithRetry(8, 300).catch(() => {});
      }

      setTimeout(() => {
        lyricsJustLoaded = false;
      }, 2000);
    } else {
      log("[Lyrical] Failed to fetch captions for selected track:", track.name);
    }
  } catch (err) {
    console.error("[Lyrical] Error fetching selected caption track:", err);
  } finally {
    useAppStore.setState({ isLoading: false });
  }
});

/**
 * Auto-process lyrics based on settings (React Store Version)
 */
async function autoProcessLyrics() {
  const storeLyrics = useAppStore.getState().lyrics;
  const rawCandidate =
    Array.isArray(storeLyrics) && storeLyrics.length > 0
      ? storeLyrics
      : fetchedLyrics;
  if (!rawCandidate || rawCandidate.length === 0) {
    log("No lyrics to auto-process");
    return;
  }
  try {
    // Ensure lyrics sent to translation and romanization are strictly normalized
    // so credit headers and metadata lines are never sent to translation/romanization APIs
    const lyricsToProcess = normalizeLyrics(rawCandidate);
    fetchedLyrics = lyricsToProcess;

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
      (lyricsToProcess?.length || 0) * 1200,
    );

    // Execute Romanization and Translation in parallel to take advantage of
    // background Unison coalescing (1 shared API call) and faster load times.
    const romanizePromise = isRomanizationEnabled
      ? (async () => {
          try {
            log("Sending ROMANIZE_LYRICS to background...");
            const data = await sendMessageWithTimeout(
              {
                type: "ROMANIZE_LYRICS",
                lyrics: lyricsToProcess,
                sourceLang: "auto",
                targetLang: translationLanguage || "en",
                videoId: currentSongInfo?.videoId,
              },
              processingTimeoutMs,
            );
            if (data?.error) {
              console.warn("[Lyrical Panel] Romanization error:", data.error);
              return [];
            }
            return data || [];
          } catch (err) {
            console.warn("[Lyrical Panel] Romanization failed:", err);
            return [];
          }
        })()
      : Promise.resolve([]);

    const translatePromise = isTranslateEnabled
      ? (async () => {
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
              return lyricsToProcess.map((lyric) => ({
                time: lyric.time,
                text: lyric.text,
                translated: "",
                skipped: true,
                error: false,
              }));
            }

            log(
              "[Lyrical Panel] Sending TRANSLATE_LYRICS to background...",
              translationLanguage,
            );
            const data = await sendMessageWithTimeout(
              {
                type: "TRANSLATE_LYRICS",
                lyrics: lyricsToProcess,
                targetLang: translationLanguage,
                sourceLang: lyricsLanguage || "auto",
                videoId: currentSongInfo?.videoId,
              },
              processingTimeoutMs,
            );
            if (data?.error) {
              console.warn("[Lyrical Panel] Translation error:", data.error);
              return [];
            }
            return data || [];
          } catch (err) {
            console.warn("[Lyrical Panel] Translation failed:", err);
            return [];
          }
        })()
      : Promise.resolve([]);

    const [resolvedRomanized, resolvedTranslated] = await Promise.all([
      romanizePromise,
      translatePromise,
    ]);
    romanizedData = resolvedRomanized;
    translatedData = resolvedTranslated;

    log("Updating store with processed lyrics");
    updateSecondaryLyricsState({
      romanizedLyrics: romanizedData || [],
      translatedLyrics: translatedData || [],
      isProcessingLyrics: false,
    });

    // Persist processed translations and romanizations into persistent cache
    const currentSourceId = useAppStore.getState().lyricsSource;
    if (currentSongInfo && currentSourceId && lyricsToProcess?.length) {
      persistLyricsCache(currentSongInfo, currentSourceId, lyricsToProcess, {
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
    const video = getActiveMediaVideoElement();
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
  const video = getActiveMediaVideoElement();
  if (!video) {
    warn("[Lyrical Panel] Video element not found");
    return;
  }

  // Clean up old listeners
  if (videoEventListeners) {
    video.removeEventListener("timeupdate", videoEventListeners.onTimeUpdate);
    video.removeEventListener("pause", videoEventListeners.onPause);
    video.removeEventListener("play", videoEventListeners.onPlay);
  }

  let currentIndex = -1;

  // PER-SONG OFFSET: Load stored correction for this specific song & source
  const videoId = getCurrentVideoId(currentSongInfo);
  const activeSource = useAppStore.getState().lyricsSource;
  const isCaptions = activeSource === "captions";
  const songKey = getSongOffsetKey(videoId, activeSource);
  const legacyKey = getLegacySongOffsetKey(videoId);
  let songOffset = 0;

  if (isCaptions) {
    // YouTube Captions are already natively timed to the video!
    userSongOffset = 0;
    currentSyncOffset = 0;
    useAppStore.getState().setOffset(0, 0);
    log(
      "[Lyrical Panel] 📝 YouTube Captions active: offset locked to 0.0s (native video sync)",
    );
  } else {
    try {
      let stored = await getStoredSongOffset(songKey, legacyKey);
      if (timerSessionId !== activeTimerSessionId) return;

      const firstVocalTime = getFirstVocalLyricTime(lyrics);

      // Migration check 1: If stored offset is negative (legacy workaround for previous '+' bug)
      // but an intro delay exists, re-detect so the unified positive offset is applied
      if (stored !== null && stored < -1.0) {
        log(
          "[Lyrical Panel] Detected legacy negative offset:",
          stored,
          "- verifying with auto-sync",
        );
        const autoDetected = await tryAutoDetectOffset(
          lyrics,
          songKey,
          videoId,
        );
        if (timerSessionId !== activeTimerSessionId) return;
        if (autoDetected !== null && autoDetected > 0) {
          stored = autoDetected;
          songOffset = autoDetected;
        }
      }

      // Migration check 2: If a positive intro offset was erroneously saved on PRE-SYNCED lyrics
      // (e.g. LRCLib saved 21.8s when lyrics already start at 28.2s, resulting in double-delay)
      const lastVocalTime = getLastVocalLyricTime(lyrics);
      const video = getActiveMediaVideoElement();
      const videoDuration =
        video?.duration && Number.isFinite(video.duration) && video.duration > 0
          ? video.duration
          : (Number(currentSongInfo?.duration) || 0);

      const isOvershootingStoredIntro =
        stored !== null &&
        stored >= 1.5 &&
        lastVocalTime !== null &&
        videoDuration > 0 &&
        lastVocalTime + stored > videoDuration + 2.0;

      if (isOvershootingStoredIntro) {
        log(
          "[Lyrical Panel] Detected invalid overshooting intro offset on pre-synced lyrics:",
          stored,
          `s (last vocal ${lastVocalTime.toFixed(1)}s + offset > duration ${videoDuration.toFixed(1)}s) - re-detecting`,
        );
        const autoDetected = await tryAutoDetectOffset(
          lyrics,
          songKey,
          videoId,
        );
        if (timerSessionId !== activeTimerSessionId) return;
        if (autoDetected !== null) {
          stored = autoDetected;
          songOffset = autoDetected;
          await saveStoredSongOffset(songKey, autoDetected);
        }
      }

      // If stored is non-zero (custom user offset), respect it.
      // If stored is 0 baseline (or null) for a non-caption source, verify via auto-detect:
      if (stored !== null && Math.abs(stored) > 0.05) {
        songOffset = stored;
        log(
          "[Lyrical Panel] 📝 Using stored offset for this song/source:",
          songOffset.toFixed(2),
          "s",
        );
      } else {
        // ⚡ ADAPTIVE SYNC: If user has no saved offset (or baseline 0), cross-correlate with YouTube captions & SponsorBlock
        const autoDetected = await tryAutoDetectOffset(
          lyrics,
          songKey,
          videoId,
        );
        if (timerSessionId !== activeTimerSessionId) return;
        if (autoDetected !== null) {
          songOffset = autoDetected;
        } else if (stored !== null) {
          songOffset = stored;
        }
      }

      // Safety clamp: prevent disasters (wider range for long intros - 2 minutes)
      songOffset = Math.min(120.0, Math.max(-120.0, songOffset));
    } catch (err: any) {
      if (timerSessionId !== activeTimerSessionId) return;
      if (err.message?.includes("Extension context invalidated")) {
        log(
          "[Lyrical Panel] Extension context invalidated (reloaded). Stopping execution.",
        );
        return;
      }
      warn("[Lyrical Panel] Could not load song offset:", err);
    }

    // FINAL OFFSET: Platform + Song-specific + Sync-type trim (set globally for live updates)
    if (timerSessionId !== activeTimerSessionId) return;
    userSongOffset = songOffset;
    const isRich = isRichsyncSourceId(activeSource, lyrics);
    const appState = useAppStore.getState();
    const trim = isRich
      ? appState.richsyncOffsetTrim || 0
      : appState.lineOffsetTrim || 0;
    currentSyncOffset = PLATFORM_OFFSET + userSongOffset + trim;

    // 🔥 SYNC REACT STORE WITH STORED OFFSET (This updates the slider UI)
    useAppStore.getState().setOffset(currentSyncOffset, userSongOffset);

    log(
      "[Lyrical Panel] 📝 Loaded saved offset for song/source:",
      songKey,
      "offset:",
      userSongOffset.toFixed(2),
      "s (trim:",
      trim.toFixed(2),
      "s)",
    );
  }

  log(
    "[Lyrical Panel] Starting lyrics sync (platform:",
    isCaptions ? 0 : PLATFORM_OFFSET,
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
    // 🔒 SYNC ENGINE: Unified subtractive timing (video.currentTime - currentSyncOffset)
    // matching ArchiveTuneStrategy (Musixmatch-richsync), ImperativeBetterStrategy (Portato), and KaraokeOverlay
    const adjustedTime = isCaptions
      ? video.currentTime -
        userSongOffset -
        (useAppStore.getState().lineOffsetTrim || 0)
      : video.currentTime - currentSyncOffset;
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

      // 🔴 If NOT on watch page → remove watch panel and check mini companion
      const isWatchUrl =
        window.location.href.includes("/watch") &&
        window.location.href.includes("v=");

      if (!isWatchUrl) {
        if (lyricsPanel) {
          lyricsPanel.remove();
          lyricsPanel = null;
          log("Left watch page — panel removed");
        }
        checkAndManageMiniCompanion();
        setupMiniplayerObserver();
        return;
      } else {
        removeMiniCompanion();
      }

      // ✅ On watch page → reset state and use video-driven injection
      log(
        "[Lyrical Panel] On watch page, using waitForStableVideo for injection",
      );
      lyricsRendered = false;
      lastInjectedVideoId = null; // Reset to allow reinjection
      waitForVideoInProgress = false; // Reset waiting flag for fresh navigation

      // Re-hydrate floating & transition settings from storage to ensure perfect sync across video navigations
      if (typeof chrome !== "undefined" && chrome?.storage?.sync) {
        chrome.storage.sync.get(
          {
            albumArtTransition: "shuffle",
            titleTransition: "spring",
            scrollLongTitles: true,
            showProgressBar: true,
            reopenFloatingLyricsAutomatically: false,
            showMiniCompanion: true,
            miniCompanionCustomPosition: null,
          },
          (res) => {
            useAppStore.setState({
              albumArtTransition: res.albumArtTransition || "shuffle",
              titleTransition: res.titleTransition || "spring",
              scrollLongTitles: res.scrollLongTitles ?? true,
              showProgressBar: res.showProgressBar ?? true,
              reopenFloatingLyricsAutomatically:
                res.reopenFloatingLyricsAutomatically ?? false,
              showMiniCompanion: res.showMiniCompanion ?? true,
              miniCompanionCustomPosition:
                res.miniCompanionCustomPosition || null,
            });
          },
        );
      }

      waitForStableVideo(() => {
        injectIntoYouTube();
        setupAdObserver();
        ensureWatchPanelMounted();
        const info = window.getSongInfoFromPage?.();
        if (info && !info.isAd) {
          // Guard against stale hover preview metadata:
          // Ensure info.videoId matches current URL videoId if on watch page
          const urlV = new URLSearchParams(window.location.search).get("v");
          if (urlV && info.videoId && info.videoId !== urlV) {
            log("[Lyrical Panel] Detected stale hover preview info on navigation, correcting videoId:", urlV);
            info.videoId = urlV;
          }
          autoFetchLyrics(info);
        }
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
        setupAdObserver();
        const info = window.getSongInfoFromPage?.();
        if (info && !info.isAd) autoFetchLyrics(info);
      });
    } else {
      log(
        "[Lyrical Panel] Not a watch URL on first load, checking mini companion",
      );
      checkAndManageMiniCompanion();
      setupMiniplayerObserver();
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
  } else if (request.action === "setting_changed") {
    const { key, value } = request;
    if (key === "themeId") {
      const nextThemeId = value || DEFAULT_THEME_ID;
      if (
        nextThemeId.startsWith("custom-") &&
        useAppStore.getState().customThemes.length === 0
      ) {
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
    } else if (key === "compactMode") {
      useAppStore.getState().setCompactMode(Boolean(value));
    } else if (key === "lyricsSizePreset") {
      useAppStore.setState({ lyricsSizePreset: value });
    } else if (key === "lyricsAnimationStyle") {
      useAppStore.setState({ lyricsAnimationStyle: value });
    } else if (key === "reduceAnimations") {
      useAppStore.getState().setReduceAnimations(Boolean(value));
    } else if (key === "showCollapsedArtwork") {
      useAppStore.setState({ showCollapsedArtwork: Boolean(value) });
    } else if (key === "displayMode") {
      useAppStore.setState({ displayMode: value });
    } else if (key === "floatingPositionPreset") {
      useAppStore.setState({ floatingPositionPreset: value });
    } else if (key === "floatingCustomPosition") {
      useAppStore.setState({ floatingCustomPosition: value });
    } else if (key === "romanization") {
      useAppStore.setState({ isRomanizationEnabled: Boolean(value) });
    } else if (key === "autoTranslate") {
      useAppStore.setState({ isTranslateEnabled: Boolean(value) });
    } else if (key === "translationLang") {
      useAppStore.setState({ translationLanguage: value });
    }
    sendResponse({ success: true });
  } else if (request.action === "custom_themes_changed") {
    const hydrated = resolveCustomThemes(request.customThemes || []);
    useAppStore.getState().setCustomThemes(hydrated);
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
