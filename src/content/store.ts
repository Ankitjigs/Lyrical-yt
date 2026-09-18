import { create } from "zustand";
import { DEFAULT_THEME_ID } from "../themes";
import { vocalRemover } from "../modules/audio/vocalRemover";
import { normalizeLyricsPipeline } from "../modules/lyrics/lyricsNormalizer";
import type {
  CaptionTrackInfo,
  CustomTheme,
  LyricalLyricLine,
  LyricsSourceId,
  SongInfo,
  SourcePreference,
} from "../types/lyrics";

export const DEFAULT_SOURCE_PREFERENCES: SourcePreference[] = [
  {
    id: "lyrical",
    label: "Lyrical",
    enabled: true,
    tags: ["SYLLABLE"],
  },
  {
    id: "unison-richsynced",
    label: "Better Lyrics Unison",
    enabled: true,
    tags: ["SYLLABLE"],
  },
  {
    id: "binimum-richsynced",
    label: "BiniLyrics",
    enabled: true,
    tags: ["SYLLABLE"],
  },
  {
    id: "youlyplus-richsynced",
    label: "YouLy+",
    enabled: true,
    tags: ["SYLLABLE"],
  },
  {
    id: "better_lyrics",
    label: "Better Lyrics",
    enabled: true,
    tags: ["WORD"],
  },
  {
    id: "unison-wordsynced",
    label: "Better Lyrics Unison",
    enabled: true,
    tags: ["WORD"],
  },
  {
    id: "portato-richsynced",
    label: "Better Lyrics Portato",
    enabled: true,
    tags: ["WORD"],
  },
  { id: "musixmatch", label: "Musixmatch", enabled: true, tags: ["WORD"] },
  {
    id: "youlyplus-synced",
    label: "YouLy+",
    enabled: true,
    tags: ["LINE"],
  },
  {
    id: "bLyrics-synced",
    label: "Better Lyrics",
    enabled: true,
    tags: ["LINE"],
  },
  {
    id: "legato-synced",
    label: "Better Lyrics Legato",
    enabled: true,
    tags: ["LINE"],
  },
  {
    id: "musixmatch-synced",
    label: "Musixmatch",
    enabled: true,
    tags: ["LINE"],
  },
  {
    id: "unison-synced",
    label: "Better Lyrics Unison",
    enabled: true,
    tags: ["LINE"],
  },
  {
    id: "binimum-synced",
    label: "BiniLyrics",
    enabled: true,
    tags: ["LINE"],
  },
  {
    id: "captions",
    label: "YouTube Captions",
    enabled: true,
    tags: ["LINE"],
  },
  { id: "lrclib", label: "LRCLib", enabled: true, tags: ["LINE"] },
  {
    id: "unison-plain",
    label: "Better Lyrics Unison",
    enabled: true,
    tags: ["UNSYNCED"],
  },
];

export function normalizeSourcePreferences(prefs: unknown): SourcePreference[] {
  const incoming = Array.isArray(prefs) ? prefs : [];
  const defaultMap = new Map(
    DEFAULT_SOURCE_PREFERENCES.map((source) => [source.id, source]),
  );
  const normalized = [];
  const seen = new Set();

  for (const pref of incoming as Partial<SourcePreference>[]) {
    if (!pref?.id || seen.has(pref.id)) continue;
    const fallback = defaultMap.get(pref.id);
    if (!fallback) continue;

    normalized.push({
      id: fallback.id,
      label: fallback.label,
      enabled: typeof pref.enabled === "boolean" ? pref.enabled : fallback.enabled,
      tags: fallback.tags,
    });
    seen.add(pref.id);
  }

  for (const fallback of DEFAULT_SOURCE_PREFERENCES) {
    if (!seen.has(fallback.id)) {
      normalized.push({ ...fallback });
    }
  }

  return normalized;
}

export function isRichsyncSourceId(
  sourceId: LyricsSourceId | string | null | undefined,
  lyrics?: any[],
): boolean {
  if (sourceId) {
    const match = DEFAULT_SOURCE_PREFERENCES.find((s) => s.id === sourceId);
    if (match) {
      return match.tags.includes("SYLLABLE") || match.tags.includes("WORD");
    }
    const s = String(sourceId).toLowerCase();
    if (
      s.includes("richsync") ||
      s.includes("wordsync") ||
      s.includes("syllable") ||
      s.includes("portato") ||
      s === "better_lyrics" ||
      s === "lyrical" ||
      s === "musixmatch"
    ) {
      return true;
    }
  }
  if (Array.isArray(lyrics) && lyrics.length > 0) {
    return lyrics.some((l) => Array.isArray(l.parts) && l.parts.length > 0);
  }
  return false;
}

interface LyricalSettingsState {
  offset: number;
  userOffset: number;
  isRomanizationEnabled: boolean;
  isTranslateEnabled: boolean;
  translationLanguage: string;
  romanizationExclusions: string[];
  translationExclusions: string[];
  boiduApiKey: string;
  compactMode: boolean;
  lyricsSizePreset: "compact" | "standard" | "large" | "cinematic";
  lyricsAnimationStyle: "better-lyrics" | "archivetune";
  isKaraokeMode: boolean;
  karaokePosition: "top" | "bottom" | "center" | "custom";
  karaokeCustomPosition: number;
  karaokeFontSize: "small" | "medium" | "large" | "xlarge";
  karaokeAnimationStyle: "classic" | "modern";
  isVocalMuted: boolean;
  vocalCutDepth: number;
  vocalBassCutoff: number;
  vocalBalanceTrim: number;
  vocalReverbDampening: boolean;
  reduceAnimations: boolean;
  showCollapsedArtwork: boolean;
  displayMode: "sidebar" | "floating";
  floatingPositionPreset: "left" | "center" | "right";
  floatingCustomPosition: { top: number; left: number } | null;
  richsyncOffsetTrim: number;
  lineOffsetTrim: number;
  themeId: string;
  customThemes: CustomTheme[];
  sourcePreferences: SourcePreference[];
}

interface LyricalAppState extends LyricalSettingsState {
  songInfo: SongInfo | null;
  lyrics: LyricalLyricLine[];
  lyricsSource: LyricsSourceId | null;
  availableLyricsSources: LyricsSourceId[];
  lyricsLanguage: string | null;
  translatedLyrics: LyricalLyricLine[];
  romanizedLyrics: LyricalLyricLine[];
  availableCaptionTracks: CaptionTrackInfo[];
  selectedCaptionTrackId: string | null;
  captionLanguageLabel: string | null;
  activeIndex: number;
  isExpanded: boolean;
  isLoading: boolean;
  isProcessingLyrics: boolean;
  headerText: string;
  setSongInfo: (info: SongInfo | null) => void;
  setLyrics: (
    lyrics: LyricalLyricLine[],
    source?: LyricsSourceId | null,
    language?: string | null,
  ) => void;
  setAvailableLyricsSources: (sources: LyricsSourceId[]) => void;
  addAvailableLyricsSource: (source: LyricsSourceId | null | undefined) => void;
  clearAvailableLyricsSources: () => void;
  setAvailableCaptionTracks: (tracks: CaptionTrackInfo[]) => void;
  setSelectedCaptionTrackId: (id: string | null) => void;
  setCaptionLanguageLabel: (label: string | null) => void;
  setTranslatedLyrics: (translated: LyricalLyricLine[]) => void;
  setRomanizedLyrics: (romanized: LyricalLyricLine[]) => void;
  setActiveIndex: (index: number) => void;
  setExpanded: (expanded: boolean) => void;
  setLoading: (loading: boolean) => void;
  setIsProcessingLyrics: (processing: boolean) => void;
  setHeaderText: (text: string) => void;
  setOffset: (offset: number, userOffset: number) => void;
  setRichsyncOffsetTrim: (val: number) => void;
  setLineOffsetTrim: (val: number) => void;
  setSettings: (settings: Partial<LyricalSettingsState>) => void;
  setCompactMode: (isCompact: boolean) => void;
  setLyricsAnimationStyle: (style: "better-lyrics" | "archivetune") => void;
  setKaraokeMode: (enabled: boolean) => void;
  setKaraokePosition: (position: "top" | "bottom" | "center" | "custom") => void;
  setKaraokeCustomPosition: (percent: number) => void;
  setKaraokeFontSize: (size: "small" | "medium" | "large" | "xlarge") => void;
  setKaraokeAnimationStyle: (style: "classic" | "modern") => void;
  setVocalMuted: (muted: boolean) => void;
  setVocalRemoverSettings: (
    settings: Partial<{
      cutDepth: number;
      bassCutoff: number;
      balanceTrim: number;
      reverbDampening: boolean;
    }>,
  ) => void;
  setReduceAnimations: (reduceAnimations: boolean) => void;
  setThemeId: (themeId: string) => void;
  setCustomThemes: (customThemes: CustomTheme[]) => void;
  setBoiduApiKey: (key: string) => void;
  setSourcePreferences: (prefs: unknown) => void;
  toggleSource: (id: LyricsSourceId) => void;
  reset: () => void;
  resetLyricsOnly: () => void;
}

let karaokeCustomPosTimer: ReturnType<typeof setTimeout> | null = null;
let vocalSettingsSyncTimer: ReturnType<typeof setTimeout> | null = null;

export const useAppStore = create<LyricalAppState>((set) => ({
  // Content Data
  songInfo: null, // { title, artist, artwork }
  lyrics: [], // Array of { time, text }
  lyricsSource: null, // 'better_lyrics', 'musixmatch', 'musixmatch-richsync', 'lyrical', 'captions', 'lrclib'
  availableLyricsSources: [],
  availableCaptionTracks: [],
  selectedCaptionTrackId: null,
  captionLanguageLabel: null,
  lyricsLanguage: null, // e.g. 'hi', 'en', 'ko' — used for conditional font loading
  translatedLyrics: [], // Array of { time, text, translated }
  romanizedLyrics: [], // Array of { time, text, romanized }
  activeIndex: -1,

  // UI State
  isExpanded: true,
  isLoading: false,

  isProcessingLyrics: false,
  headerText: "Waiting for music...",

  // Settings (synced from storage/events)
  offset: -0.45, // Platform constant + user offset
  userOffset: 0,
  isRomanizationEnabled: false,
  isTranslateEnabled: false,
  translationLanguage: "en",
  romanizationExclusions: [],
  translationExclusions: [],
  boiduApiKey: "", // Custom API Key for Boidu
  compactMode: false, // Added compactMode
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
  customThemes: [],
  richsyncOffsetTrim: 0,
  lineOffsetTrim: 0,

  // Source Preferences

  // Source Preferences
  sourcePreferences: normalizeSourcePreferences(DEFAULT_SOURCE_PREFERENCES),

  // Actions
  setSongInfo: (info) => set({ songInfo: info }),
  setLyrics: (lyrics, source, language) => {
    const isCaptions = source === "captions";
    const songInfo = useAppStore.getState().songInfo;
    const songDuration = Number(songInfo?.duration || 0);
    const cleanLyrics = isCaptions ? lyrics : normalizeLyricsPipeline(lyrics, songDuration, songInfo);

    set((state) => {
      const nextSource = source || null;
      const isDifferentSource = nextSource !== state.lyricsSource;
      return {
        lyrics: cleanLyrics,
        lyricsSource: nextSource,
        lyricsLanguage: language || null,
        ...(isCaptions ? { offset: 0, userOffset: 0 } : {}),
        ...(isDifferentSource
          ? {
              romanizedLyrics: [],
              translatedLyrics: [],
            }
          : {}),
        availableLyricsSources:
          source && !state.availableLyricsSources.includes(source)
            ? [...state.availableLyricsSources, source]
            : state.availableLyricsSources,
      };
    });
    // Persist active source to storage for popup access
    if (source) {
      chrome.storage.local.set({ activeLyricsSource: source });
    }
  },
  setAvailableLyricsSources: (sources) =>
    set({
      availableLyricsSources: Array.from(new Set(sources.filter(Boolean))),
    }),
  addAvailableLyricsSource: (source) =>
    set((state) => {
      if (!source || state.availableLyricsSources.includes(source)) {
        return state;
      }

      return {
        availableLyricsSources: [...state.availableLyricsSources, source],
      };
    }),
  clearAvailableLyricsSources: () => set({ availableLyricsSources: [] }),
  setAvailableCaptionTracks: (tracks) =>
    set({
      availableCaptionTracks: Array.isArray(tracks) ? tracks : [],
    }),
  setSelectedCaptionTrackId: (id) => set({ selectedCaptionTrackId: id }),
  setCaptionLanguageLabel: (label) => set({ captionLanguageLabel: label }),
  setTranslatedLyrics: (translated) => set({ translatedLyrics: translated }),
  setRomanizedLyrics: (romanized) => set({ romanizedLyrics: romanized }),
  setActiveIndex: (index) => set({ activeIndex: index }),
  setExpanded: (expanded) => set({ isExpanded: expanded }),
  setLoading: (loading) => set({ isLoading: loading }),
  setIsProcessingLyrics: (processing) =>
    set({ isProcessingLyrics: processing }),
  setHeaderText: (text) => set({ headerText: text }),
  setOffset: (offset, userOffset) => set({ offset, userOffset }),
  setRichsyncOffsetTrim: (val) => {
    const trimmed = Math.round(val * 10) / 10;
    set((state) => {
      const isRich = isRichsyncSourceId(state.lyricsSource, state.lyrics);
      const isCaptions = state.lyricsSource === "captions";
      const trim = isRich ? trimmed : state.lineOffsetTrim;
      const nextOffset = (isCaptions ? 0 : -0.45) + state.userOffset + trim;
      return {
        richsyncOffsetTrim: trimmed,
        ...(isRich ? { offset: nextOffset } : {}),
      };
    });
    try {
      if (typeof chrome !== "undefined" && chrome?.storage?.sync) {
        chrome.storage.sync.set({ richsyncOffsetTrim: trimmed });
      }
    } catch {}
  },
  setLineOffsetTrim: (val) => {
    const trimmed = Math.round(val * 10) / 10;
    set((state) => {
      const isRich = isRichsyncSourceId(state.lyricsSource, state.lyrics);
      const isCaptions = state.lyricsSource === "captions";
      const trim = isRich ? state.richsyncOffsetTrim : trimmed;
      const nextOffset = (isCaptions ? 0 : -0.45) + state.userOffset + trim;
      return {
        lineOffsetTrim: trimmed,
        ...(!isRich ? { offset: nextOffset } : {}),
      };
    });
    try {
      if (typeof chrome !== "undefined" && chrome?.storage?.sync) {
        chrome.storage.sync.set({ lineOffsetTrim: trimmed });
      }
    } catch {}
  },
  setSettings: (settings) =>
    set((state) => ({
      ...state,
      ...settings,
      sourcePreferences:
        settings.sourcePreferences !== undefined
          ? normalizeSourcePreferences(settings.sourcePreferences)
          : state.sourcePreferences,
    })),
  setCompactMode: (isCompact) => set({ compactMode: isCompact }), // Added action
  setLyricsAnimationStyle: (style) => {
    set({ lyricsAnimationStyle: style });
    chrome.storage.sync.set({ lyricsAnimationStyle: style });
  },
  setKaraokeMode: (enabled) => {
    set({ isKaraokeMode: enabled });
    if (!enabled) {
      void vocalRemover.setMuted(false);
      set({ isVocalMuted: false });
      if (typeof chrome !== "undefined" && chrome?.storage?.sync) {
        chrome.storage.sync.set({ isVocalMuted: false }, () => {
          void chrome.runtime?.lastError;
        });
      }
    }
    if (typeof chrome !== "undefined" && chrome?.storage?.sync) {
      chrome.storage.sync.set({ isKaraokeMode: enabled }, () => {
        void chrome.runtime?.lastError;
      });
    }
  },

  setKaraokePosition: (position) => {
    set({ karaokePosition: position });
    if (typeof chrome !== "undefined" && chrome?.storage?.sync) {
      chrome.storage.sync.set({ karaokePosition: position }, () => {
        void chrome.runtime?.lastError;
      });
    }
  },
  setKaraokeCustomPosition: (percent) => {
    const clamped = Math.max(8, Math.min(88, percent));
    set({ karaokeCustomPosition: clamped });
    if (karaokeCustomPosTimer) clearTimeout(karaokeCustomPosTimer);
    karaokeCustomPosTimer = setTimeout(() => {
      if (typeof chrome !== "undefined" && chrome?.storage?.sync) {
        chrome.storage.sync.set({ karaokeCustomPosition: clamped }, () => {
          void chrome.runtime?.lastError;
        });
      }
    }, 250);
  },
  setKaraokeFontSize: (size) => {
    set({ karaokeFontSize: size });
    if (typeof chrome !== "undefined" && chrome?.storage?.sync) {
      chrome.storage.sync.set({ karaokeFontSize: size }, () => {
        void chrome.runtime?.lastError;
      });
    }
  },
  setKaraokeAnimationStyle: (style) => {
    set({ karaokeAnimationStyle: style });
    if (typeof chrome !== "undefined" && chrome?.storage?.sync) {
      chrome.storage.sync.set({ karaokeAnimationStyle: style }, () => {
        void chrome.runtime?.lastError;
      });
    }
  },
  setVocalMuted: (muted) => {
    set({ isVocalMuted: muted });
    void vocalRemover.setMuted(muted);
    if (typeof chrome !== "undefined" && chrome?.storage?.sync) {
      chrome.storage.sync.set({ isVocalMuted: muted }, () => {
        void chrome.runtime?.lastError;
      });
    }
  },
  setVocalRemoverSettings: (settings) => {
    set((state) => {
      const nextCutDepth =
        settings.cutDepth !== undefined ? settings.cutDepth : state.vocalCutDepth;
      const nextBassCutoff =
        settings.bassCutoff !== undefined
          ? settings.bassCutoff
          : state.vocalBassCutoff;
      const nextBalanceTrim =
        settings.balanceTrim !== undefined
          ? settings.balanceTrim
          : state.vocalBalanceTrim;
      const nextReverbDamp =
        settings.reverbDampening !== undefined
          ? settings.reverbDampening
          : state.vocalReverbDampening;

      vocalRemover.updateSettings({
        cutDepth: nextCutDepth,
        bassCutoff: nextBassCutoff,
        balanceTrim: nextBalanceTrim,
        reverbDampening: nextReverbDamp,
      });

      if (vocalSettingsSyncTimer) clearTimeout(vocalSettingsSyncTimer);
      vocalSettingsSyncTimer = setTimeout(() => {
        if (typeof chrome !== "undefined" && chrome?.storage?.sync) {
          chrome.storage.sync.set(
            {
              vocalCutDepth: nextCutDepth,
              vocalBassCutoff: nextBassCutoff,
              vocalBalanceTrim: nextBalanceTrim,
              vocalReverbDampening: nextReverbDamp,
            },
            () => {
              void chrome.runtime?.lastError;
            },
          );
        }
      }, 200);

      return {
        vocalCutDepth: nextCutDepth,
        vocalBassCutoff: nextBassCutoff,
        vocalBalanceTrim: nextBalanceTrim,
        vocalReverbDampening: nextReverbDamp,
      };
    });
  },
  setReduceAnimations: (reduceAnimations) => set({ reduceAnimations }),
  setThemeId: (themeId) => set({ themeId }),
  setCustomThemes: (customThemes) =>
    set({ customThemes: Array.isArray(customThemes) ? customThemes : [] }),
  setBoiduApiKey: (key) => {
    set({ boiduApiKey: key });
    chrome.storage.sync.set({ boiduApiKey: key });
  },
  setSourcePreferences: (prefs) => {
    const normalized = normalizeSourcePreferences(prefs);
    set({ sourcePreferences: normalized });
    // Persist to chrome.storage
    chrome.storage.sync.set({ sourcePreferences: normalized });
  },

  toggleSource: (id) =>
    set((state) => {
      const newPrefs = state.sourcePreferences.map((s) =>
        s.id === id ? { ...s, enabled: !s.enabled } : s,
      );
      // Persist to storage immediately
      chrome.storage.sync.set({ sourcePreferences: newPrefs });
      return { sourcePreferences: newPrefs };
    }),

  reset: () => {
    vocalRemover.reset();
    set({
      isVocalMuted: false,
      songInfo: null,
      lyrics: [],
      lyricsSource: null,
      availableLyricsSources: [],
      availableCaptionTracks: [],
      selectedCaptionTrackId: null,
      captionLanguageLabel: null,
      translatedLyrics: [],
      romanizedLyrics: [],
      activeIndex: -1,
      headerText: "Waiting for music...",
      isLoading: false,
      isProcessingLyrics: false,
      lyricsLanguage: null,
    });
  },

  resetLyricsOnly: () =>
    set({
      lyrics: [],
      lyricsSource: null,
      availableLyricsSources: [],
      availableCaptionTracks: [],
      selectedCaptionTrackId: null,
      captionLanguageLabel: null,
      translatedLyrics: [],
      romanizedLyrics: [],
      activeIndex: -1,
      isProcessingLyrics: false,
      headerText: "No lyrics found",
      isLoading: false, // Ensure loading is off
      lyricsLanguage: null,
    }),
}));
