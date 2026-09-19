// Content script for in-page lyrics panel injection
import React from "react";
import { createRoot } from "react-dom/client";
import LyricsPanel from "./components/LyricsPanel";
import KaraokeOverlay from "./components/KaraokeOverlay";
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
import { detectAutoSyncOffset } from "../modules/sync/autoSyncDetector";
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
function getSongOffsetKey(
  videoId: string | null | undefined,
  sourceId?: string | null | undefined,
): string {
  const v =
    videoId ||
    new URLSearchParams(window.location.search).get("v") ||
    "unknown_video";
  let s = sourceId || useAppStore.getState().lyricsSource || "default";
  if (s === "musixmatch-richsync") s = "musixmatch";
  return `offset_${v}_${s}`;
}

function getLegacySongOffsetKey(videoId: string | null | undefined): string {
  const v =
    videoId || new URLSearchParams(window.location.search).get("v");
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
    currentSyncOffset = (isCaptions ? 0 : PLATFORM_OFFSET) + userSongOffset + trim;

    if (offsetChanged && currentSongInfo && !isCaptions) {
      const videoId = new URLSearchParams(window.location.search).get("v");
      const songKey = getSongOffsetKey(videoId, state.lyricsSource);
      saveStoredSongOffset(songKey, userSongOffset).catch(() => {});
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
        karaokeCustomPosition: typeof res.karaokeCustomPosition === "number" ? res.karaokeCustomPosition : 80,
        karaokeFontSize: res.karaokeFontSize || "medium",
        karaokeAnimationStyle: res.karaokeAnimationStyle || "classic",
        isVocalMuted: Boolean(res.isVocalMuted),
        vocalCutDepth: typeof res.vocalCutDepth === "number" ? res.vocalCutDepth : 1.0,
        vocalBassCutoff: typeof res.vocalBassCutoff === "number" ? res.vocalBassCutoff : 160,
        vocalBalanceTrim: typeof res.vocalBalanceTrim === "number" ? res.vocalBalanceTrim : 0,
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
      karaokeAnimationStyle: changes.karaokeAnimationStyle.newValue || "classic",
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
    useAppStore
      .getState()
      .setLineOffsetTrim(changes.lineOffsetTrim.newValue);
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

    // ⚡ Late arrival auto-sync: if rich lyrics are already active for this video,
    // but the user hasn't set a manual offset yet, run auto-sync now that captions are here!
    const liveSyncVideoId =
      (typeof currentVideoId !== "undefined" && currentVideoId) ||
      new URLSearchParams(window.location.search).get("v");
    if (liveSyncVideoId) {
      const state = useAppStore.getState();
      if (state.lyricsSource !== "captions") {
        const activeLyrics = state.lyrics;
        if (Array.isArray(activeLyrics) && activeLyrics.length > 0) {
          const activeSongKey = getSongOffsetKey(liveSyncVideoId, state.lyricsSource);
          const fallbackKey = getLegacySongOffsetKey(liveSyncVideoId);
          getStoredSongOffset(activeSongKey, fallbackKey).then((stored) => {
            if (stored === null) {
              tryAutoDetectOffset(activeLyrics, activeSongKey).then((detected) => {
                if (detected !== null && detected !== userSongOffset) {
                  userSongOffset = detected;
                  const isRich = isRichsyncSourceId(state.lyricsSource, activeLyrics);
                  const trim = isRich
                    ? state.richsyncOffsetTrim || 0
                    : state.lineOffsetTrim || 0;
                  currentSyncOffset = PLATFORM_OFFSET + userSongOffset + trim;
                  useAppStore.getState().setOffset(currentSyncOffset, userSongOffset);
                  log("[Lyrical Auto-Sync] ⚡ Applied late auto-detected offset:", detected, "s");
                }
              });
            }
          }).catch(() => {});
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

async function getStoredSongOffset(
  songKey: string,
  fallbackKey?: string,
): Promise<number | null> {
  const isPortato = songKey.includes("portato");
  const isMusixmatch = songKey.endsWith("_musixmatch");

  const isValidOffset = (key: string, val: any): boolean => {
    if (typeof val !== "number" || !Number.isFinite(val)) return false;
    // Discard the known corrupt repetitive-line jump offset (~ -19.2s) on Attention (nfs8NYg7yQM)
    // so the new monotonic auto-sync engine can calculate the true in-sync -10.8s offset!
    if (key.includes("nfs8NYg7yQM") && Math.abs(val - (-19.2)) <= 0.25) {
      return false;
    }
    return true;
  };

  try {
    const local = await chrome.storage.local.get("songOffsets");
    const offsets = local?.songOffsets || {};

    if (isValidOffset(songKey, offsets[songKey])) {
      return offsets[songKey];
    }
    // Backward compatibility for legacy Musixmatch RichSync key
    if (isMusixmatch) {
      const legacyRichKey = songKey + "-richsync";
      if (isValidOffset(legacyRichKey, offsets[legacyRichKey])) {
        return offsets[legacyRichKey];
      }
    }
    // Only fall back to generic legacy video offset if it is a meaningful NON-ZERO offset (> 0.05s)
    // AND NOT Portato! Portato must not inherit a generic western video offset because QQ Music masters
    // have independent pre-roll/intro timing. Portato must auto-detect its own timing.
    if (
      !isPortato &&
      fallbackKey &&
      isValidOffset(fallbackKey, offsets[fallbackKey]) &&
      Math.abs(offsets[fallbackKey]) > 0.05
    ) {
      return offsets[fallbackKey];
    }
  } catch {}

  try {
    const sync = await chrome.storage.sync.get("songOffsets");
    const offsets = sync?.songOffsets || {};

    if (isValidOffset(songKey, offsets[songKey])) {
      return offsets[songKey];
    }
    if (isMusixmatch) {
      const legacyRichKey = songKey + "-richsync";
      if (isValidOffset(legacyRichKey, offsets[legacyRichKey])) {
        return offsets[legacyRichKey];
      }
    }
    if (
      !isPortato &&
      fallbackKey &&
      isValidOffset(fallbackKey, offsets[fallbackKey]) &&
      Math.abs(offsets[fallbackKey]) > 0.05
    ) {
      return offsets[fallbackKey];
    }
  } catch {}

  return null;
}

async function saveStoredSongOffset(songKey: string, offset: number): Promise<void> {
  try {
    const local = (await chrome.storage.local.get("songOffsets")) || {};
    const songOffsets = local.songOffsets || {};
    songOffsets[songKey] = offset;
    if (songKey.endsWith("_musixmatch")) {
      songOffsets[songKey + "-richsync"] = offset;
    }
    await chrome.storage.local.set({ songOffsets });
  } catch (e) {
    console.warn("[Lyrical Sync] Failed to save offset to local:", e);
  }

  try {
    const sync = (await chrome.storage.sync.get("songOffsets")) || {};
    const songOffsets = sync.songOffsets || {};
    songOffsets[songKey] = offset;
    if (songKey.endsWith("_musixmatch")) {
      songOffsets[songKey + "-richsync"] = offset;
    }
    await chrome.storage.sync.set({ songOffsets });
  } catch {}
}

async function getAvailableCaptionLines(): Promise<Array<{ time: number; duration?: number; text: string }> | null> {
  // 1. Try to fetch the video's original/native language track (e.g. English ASR or matching song language)
  if (Array.isArray(availableCaptions) && availableCaptions.length > 0) {
    const storeLang = (useAppStore.getState().lyricsLanguage || "").toLowerCase().split("-")[0];

    const track =
      availableCaptions.find((t: any) => {
        const lang = String(t?.languageCode || t?.lang || "").toLowerCase();
        const name = String(t?.name || "").toLowerCase();
        return !name.includes("translated") && (lang === storeLang || lang.startsWith(storeLang));
      }) ||
      availableCaptions.find((t: any) => {
        const name = String(t?.name || "").toLowerCase();
        return !name.includes("translated");
      }) ||
      availableCaptions[0];

    const trackUrl = track?.baseUrl || track?.url;
    if (trackUrl) {
      try {
        const fetched = await fetchCaptionsFromContentScript(trackUrl);
        if (Array.isArray(fetched) && fetched.length > 0) {
          return fetched;
        }
      } catch (err) {
        console.warn("[Lyrical Auto-Sync] Could not fetch caption track for auto-sync:", err);
      }
    }
  }

  // 2. Fallback to active player caption track (whatever is currently active on the player)
  if (Array.isArray(pendingMainWorldCaptionLyrics) && pendingMainWorldCaptionLyrics.length > 0) {
    return pendingMainWorldCaptionLyrics;
  }

  return null;
}

async function tryAutoDetectOffset(
  lyrics: any[],
  songKey: string,
): Promise<number | null> {
  if (!Array.isArray(lyrics) || lyrics.length === 0) return null;

  // Never auto-detect on native YouTube captions: they are already 1:1 synced to the video
  const currentSource = useAppStore.getState().lyricsSource;
  if (currentSource === "captions") {
    log("[Lyrical Auto-Sync] Active source is YouTube Captions; offset is locked to 0.0s");
    return null;
  }

  const videoId = new URLSearchParams(window.location.search).get("v") || "";
  let sponsorBlockResult: { offset: number; source: string; description?: string } | null = null;
  let captionsResult: { detectedOffset: number; confidence: number; matchedLyricText: string; matchedCaptionText: string } | null = null;

  try {
    // 1. Check non-caption intro indicators (SponsorBlock 'music_offtopic' + YouTube chapters)
    if (videoId) {
      sponsorBlockResult = await detectNonCaptionIntroOffset(videoId);
    }

    // 2. Cross-correlate with native YouTube caption cues if available
    const captionLines = await getAvailableCaptionLines();
    if (captionLines && captionLines.length > 0) {
      captionsResult = detectAutoSyncOffset(lyrics, captionLines);
    }

    // Find the timestamp of the first actual sung vocal line in this source
    const firstVocalLine = lyrics.find(
      (l) => !l.isInstrumental && (l.text || "").trim().length > 0,
    );
    const firstVocalTime =
      firstVocalLine && typeof firstVocalLine.time === "number"
        ? firstVocalLine.time
        : 0;

    // 📊 Log statement showing SponsorBlock offset, Captions offset, and first vocal line
    const sbLogStr =
      sponsorBlockResult && sponsorBlockResult.offset > 0
        ? `+${sponsorBlockResult.offset}s (${sponsorBlockResult.source})`
        : "0.0s (No non-music intro)";

    const capLogStr =
      captionsResult && captionsResult.confidence >= 0.68
        ? `${captionsResult.detectedOffset > 0 ? "+" : ""}${captionsResult.detectedOffset}s (confidence: ${captionsResult.confidence})`
        : "Inconclusive / None";

    console.groupCollapsed?.(
      `[Lyrical Auto-Sync] 📊 Sync Analysis for "${currentSongInfo?.title || videoId}" (${currentSource || "source"})`,
    );
    console.log(`🎬 SponsorBlock Intro Offset: ${sbLogStr}`);
    console.log(`💬 Captions Auto-Sync Offset: ${capLogStr}`);
    console.log(`🎵 First Vocal Time in Source: ${firstVocalTime.toFixed(2)}s`);

    let chosenOffset: number | null = null;
    let chosenSource = "Default In-Sync";

    // PRIORITY 1: High-confidence Captions Cross-Correlation
    // Captions compare the actual spoken words in YouTube audio to the lyrics text of THIS source.
    // If it confidently finds an offset (even 0.0s), it represents the true ground truth for this source.
    if (captionsResult && captionsResult.confidence >= 0.68) {
      chosenOffset = captionsResult.detectedOffset;
      chosenSource = `Captions Cross-Correlation (${Math.round(captionsResult.confidence * 100)}% conf)`;
    }
    // PRIORITY 2: SponsorBlock / Chapter Intro Skip
    // Only apply if the lyrics have NOT already factored in the video intro!
    else if (sponsorBlockResult && sponsorBlockResult.offset > 0) {
      const sbOffset = sponsorBlockResult.offset;
      // If the first vocal line already begins AFTER the intro segment (with 1.5s tolerance),
      // the lyrics were created specifically for the music video and are already synced!
      if (firstVocalTime >= sbOffset - 1.5) {
        console.log(
          `🛡️ Source first vocal (${firstVocalTime.toFixed(1)}s) is >= intro skip (${sbOffset.toFixed(1)}s - 1.5s). Source appears already synced to video! Retaining 0.0s.`,
        );
        chosenOffset = 0.0;
        chosenSource = `Pre-Synced to Video (SponsorBlock intro detected but bypassed)`;
      } else {
        // Lyrics start before the music begins in the video -> Album-timed lyrics needing offset
        chosenOffset = sbOffset;
        chosenSource = `SponsorBlock (${sponsorBlockResult.source})`;
      }
    }
    // PRIORITY 3: Moderate captions confidence when supported by SponsorBlock
    else if (
      captionsResult &&
      captionsResult.confidence >= 0.50 &&
      sponsorBlockResult &&
      sponsorBlockResult.offset > 0 &&
      Math.abs(captionsResult.detectedOffset - sponsorBlockResult.offset) <= 2.5
    ) {
      chosenOffset = captionsResult.detectedOffset;
      chosenSource = "Captions Cross-Correlation (confirmed by SponsorBlock)";
    }

    if (chosenOffset !== null) {
      console.log(
        `🎯 Final Applied Offset: ${chosenOffset > 0 ? "+" : ""}${chosenOffset}s (via ${chosenSource})`,
      );
      console.groupEnd?.();
      await saveStoredSongOffset(songKey, chosenOffset);
      return chosenOffset;
    }

    console.log("🎯 Final Applied Offset: 0.00s (Default In-Sync)");
    console.groupEnd?.();
  } catch (err) {
    console.warn("[Lyrical Auto-Sync] Auto-detection error:", err);
  }

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
    if (currentVideoId && lyricsByVersion && typeof lyricsByVersion === "object") {
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

function isValidCachedTrackLyrics(cachedTrack: any, expectedLang: string): boolean {
  if (!cachedTrack?.lyrics || !Array.isArray(cachedTrack.lyrics) || cachedTrack.lyrics.length === 0) {
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
            String(extra.label || "").toLowerCase().includes("auto"));
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
            String(oldTrack.label || "").toLowerCase().includes("auto");

          // Clean up any historical corrupted entries where key is ja/japanese but language was saved as en
          if (
            (key.toLowerCase().includes("ja") || key.toLowerCase().includes("japanese")) &&
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
            extra.romanizedLyrics ||
            prevTracks[trackId]?.romanizedLyrics ||
            [],
          translatedLyrics:
            extra.translatedLyrics ||
            prevTracks[trackId]?.translatedLyrics ||
            [],
          timestamp: Date.now(),
        };

        tracksMap = updatedTracks;
      }
    } catch (e) {
      console.warn("[Lyrical Panel] Error preparing captions track cache:", e);
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

  const isCaptionsSource = currentSource === "captions" || fallbackSourceId === "captions";
  const cleanActiveLyrics = isCaptionsSource ? activeLyrics : normalizeLyrics(activeLyrics);

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
            String(t.label || "").toLowerCase().includes("auto");
          const vssId = t.trackId || `${rawLang.toLowerCase()}-${isAsr ? "asr" : "manual"}-${idx}`;
          const displayName = formatCaptionLanguageLabel(
            rawLang,
            isAsr,
            t.label || "",
            vssId,
          );
          const dedupKey = t.trackId || `${rawLang.toLowerCase()}-${isAsr ? "asr" : "manual"}`;
          if (!dedupMap.has(dedupKey) || (t.lyrics?.length && !dedupMap.get(dedupKey)?.url)) {
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
          selectedCaptionTrackId:
            activeTrackId || normalizedTracks[0]?.vssId,
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
    .setLyrics(cleanLyrics, sourceId, detectLyricsLanguage(cleanLyrics, language));

  persistLyricsCache(currentSongInfo, sourceId, cleanLyrics, {
    label,
    language,
    synced,
  });

  const inlineRomanized = cleanLyrics.map((line) => ({
    time: line.time,
    romanized: line.isInstrumental ? "" : (line.romanized || line.romanization || ""),
    timedRomanization: line.isInstrumental ? null : (line.timedRomanization || null),
  }));
  const inlineTranslated = cleanLyrics.map((line) => ({
    time: line.time,
    translated: line.isInstrumental ? "" : (line.translated || line.translation || ""),
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
    const vssId = t.vssId || `${rawLang.toLowerCase()}-${isAsr ? "asr" : "manual"}-${idx}`;
    const displayName = formatCaptionLanguageLabel(rawLang, isAsr, cleanName, vssId);
    const dedupKey = t.vssId || `${rawLang.toLowerCase()}-${isAsr ? "asr" : "manual"}`;

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
              String(ct.label || "").toLowerCase().includes("auto");
            const vssId =
              ct.trackId || `${rawLang.toLowerCase()}-${isAsr ? "asr" : "manual"}-${idx}`;
            const dedupKey = ct.trackId || `${rawLang.toLowerCase()}-${isAsr ? "asr" : "manual"}`;

            if (trackDedupMap.has(dedupKey)) {
              const existing = trackDedupMap.get(dedupKey)!;
              if (!existing.url && ct.url) {
                existing.url = ct.url;
              }
            } else {
              const existingLiveMatch = Array.from(trackDedupMap.values()).find(
                (lt) =>
                  lt.vssId === vssId ||
                  (lt.languageCode === rawLang.toLowerCase() && lt.isAsr === isAsr),
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
    const currentLabel = (useAppStore.getState().captionLanguageLabel || "").toLowerCase();
    let activeId = currentSelected;
    if (!activeId || !finalTracks.some((t) => t.vssId === activeId)) {
      const match =
        finalTracks.find((t) => currentLabel.includes(t.languageCode.toLowerCase()) && !t.isAsr) ||
        finalTracks.find((t) => currentLabel.includes(t.languageCode.toLowerCase())) ||
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
  const videoId = new URLSearchParams(window.location.search).get("v");
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
    selectedTrack = orderedTracks[0];

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
        romanized: line.isInstrumental ? "" : (line.romanized || line.romanization || ""),
        timedRomanization: line.isInstrumental ? null : (line.timedRomanization || null),
      }));
      const inlineTranslated = cleanLyrics.map((line) => ({
        time: line.time,
        translated: line.isInstrumental ? "" : (line.translated || line.translation || ""),
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
          .setLyrics(
            cleanLyrics,
            "lrclib",
            detectLyricsLanguage(cleanLyrics),
          );
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

  // 🔥 Use videoId as source of truth (not title/artist)
  const videoId = new URLSearchParams(window.location.search).get("v");
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
    console.error("[Lyrical Panel] Fetch error:", error);
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
    case "lrclib":
      found = await tryFetchLRCLib(currentSongInfo);
      break;
    case "captions":
      found = await tryDisplayCaptions();
      break;
  }
  useAppStore.setState({ isLoading: false });
});


function requestCaptionTrackFromMainWorld(track: CaptionTrackInfo): Promise<any[] | null> {
  return new Promise((resolve) => {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const timer = setTimeout(() => {
      window.removeEventListener("message", handler);
      resolve(null);
    }, 4500);

    const handler = (event: MessageEvent) => {
      if (event.source !== window || event.data?.type !== "LYRICAL_FETCH_TRACK_RESPONSE") return;
      if (event.data?.requestId !== requestId) return;
      clearTimeout(timer);
      window.removeEventListener("message", handler);
      if (event.data.success && Array.isArray(event.data.lyrics) && event.data.lyrics.length > 0) {
        resolve(event.data.lyrics);
      } else {
        resolve(null);
      }
    };

    window.addEventListener("message", handler);
    window.postMessage({
      type: "LYRICAL_FETCH_TRACK_REQUEST",
      requestId,
      trackId: track.vssId,
      languageCode: track.languageCode,
      isAsr: track.isAsr,
    }, "*");
  });
}

window.addEventListener("lyrical-select-caption-track", async (event: any) => {
  const track = event.detail?.track as CaptionTrackInfo;
  if (!track || (!track.url && !track.vssId && !track.languageCode)) return;

  log("[Lyrical] User manually selected caption track:", track.name, track.languageCode);
  useAppStore.setState({
    isLoading: true,
    selectedCaptionTrackId: track.vssId,
    captionLanguageLabel: track.languageCode.toUpperCase(),
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
        if (cachedTrack && !isValidCachedTrackLyrics(cachedTrack, track.languageCode)) {
          log("[Lyrical] Cached track content is mismatched/corrupted for language:", track.name, track.languageCode);
          cachedTrack = null;
        }

        if (cachedTrack?.lyrics?.length > 0) {
          log("[Lyrical] Restoring caption track directly from local cache:", track.name);
          fetchedLyrics = cachedTrack.lyrics;
          const currentVideoId = new URLSearchParams(window.location.search).get("v");
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
          chrome.storage.local.set({ [sourceKey]: entry, [genericKey]: entry }).catch(() => {});

          startLyricsTimer(fetchedLyrics);
          if (window.initTranslationDropdown) window.initTranslationDropdown();

          setTimeout(() => {
            lyricsJustLoaded = false;
          }, 2000);

          restoredFromCache = true;
        }
      } catch (cacheErr) {
        console.warn("[Lyrical] Caption cache check failed:", cacheErr);
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
      log("[Lyrical] Fetching captions from live URL:", fetchUrl.substring(0, 100));
      const rawLyrics = await fetchCaptionsFromContentScript(fetchUrl);
      if (rawLyrics && rawLyrics.length > 0) {
        lyrics = rawLyrics;
      }
    }

    // Secondary fallback: Request directly from Main World extractor via postMessage
    if (!lyrics || lyrics.length === 0) {
      log("[Lyrical] Requesting caption track directly from Main World extractor:", track.name);
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
      const currentVideoId = new URLSearchParams(window.location.search).get("v");
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
              console.warn(
                "[Lyrical Panel] Romanization error:",
                data.error,
              );
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
              console.warn(
                "[Lyrical Panel] Translation error:",
                data.error,
              );
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

  // PER-SONG OFFSET: Load stored correction for this specific song & source
  const videoId = new URLSearchParams(window.location.search).get("v");
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
      const stored = await getStoredSongOffset(songKey, legacyKey);
      if (timerSessionId !== activeTimerSessionId) return;

      if (stored !== null) {
        songOffset = stored;
        log(
          "[Lyrical Panel] 📝 Using stored offset for this song/source:",
          songOffset.toFixed(2),
          "s",
        );
      } else {
        // ⚡ ADAPTIVE SYNC: If user has no saved offset, cross-correlate with YouTube captions
        const autoDetected = await tryAutoDetectOffset(lyrics, songKey);
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
      console.warn("[Lyrical Panel] Could not load song offset:", err);
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
    // 🔒 SYNC ENGINE: Captions use video.currentTime directly (0 default, or manual userSongOffset)
    const adjustedTime = isCaptions
      ? video.currentTime +
        userSongOffset +
        (useAppStore.getState().lineOffsetTrim || 0)
      : video.currentTime + currentSyncOffset;
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
