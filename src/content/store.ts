import { create } from "zustand";
import { DEFAULT_THEME_ID } from "../themes";
import type {
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
  reduceAnimations: boolean;
  showCollapsedArtwork: boolean;
  displayMode: "sidebar" | "floating";
  floatingPositionPreset: "left" | "center" | "right";
  floatingCustomPosition: { top: number; left: number } | null;
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
  setTranslatedLyrics: (translated: LyricalLyricLine[]) => void;
  setRomanizedLyrics: (romanized: LyricalLyricLine[]) => void;
  setActiveIndex: (index: number) => void;
  setExpanded: (expanded: boolean) => void;
  setLoading: (loading: boolean) => void;
  setIsProcessingLyrics: (processing: boolean) => void;
  setHeaderText: (text: string) => void;
  setOffset: (offset: number, userOffset: number) => void;
  setSettings: (settings: Partial<LyricalSettingsState>) => void;
  setCompactMode: (isCompact: boolean) => void;
  setReduceAnimations: (reduceAnimations: boolean) => void;
  setThemeId: (themeId: string) => void;
  setCustomThemes: (customThemes: CustomTheme[]) => void;
  setBoiduApiKey: (key: string) => void;
  setSourcePreferences: (prefs: unknown) => void;
  toggleSource: (id: LyricsSourceId) => void;
  reset: () => void;
  resetLyricsOnly: () => void;
}

export const useAppStore = create<LyricalAppState>((set) => ({
  // Content Data
  songInfo: null, // { title, artist, artwork }
  lyrics: [], // Array of { time, text }
  lyricsSource: null, // 'better_lyrics', 'musixmatch', 'musixmatch-richsync', 'lyrical', 'captions', 'lrclib'
  availableLyricsSources: [],
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
  reduceAnimations: false,
  showCollapsedArtwork: true,
  displayMode: "sidebar",
  floatingPositionPreset: "right",
  floatingCustomPosition: null,
  themeId: DEFAULT_THEME_ID,
  customThemes: [],

  // Source Preferences

  // Source Preferences
  sourcePreferences: normalizeSourcePreferences(DEFAULT_SOURCE_PREFERENCES),

  // Actions
  setSongInfo: (info) => set({ songInfo: info }),
  setLyrics: (lyrics, source, language) => {
    set((state) => ({
      lyrics,
      lyricsSource: source || null,
      lyricsLanguage: language || null,
      availableLyricsSources:
        source && !state.availableLyricsSources.includes(source)
          ? [...state.availableLyricsSources, source]
          : state.availableLyricsSources,
    }));
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
  setTranslatedLyrics: (translated) => set({ translatedLyrics: translated }),
  setRomanizedLyrics: (romanized) => set({ romanizedLyrics: romanized }),
  setActiveIndex: (index) => set({ activeIndex: index }),
  setExpanded: (expanded) => set({ isExpanded: expanded }),
  setLoading: (loading) => set({ isLoading: loading }),
  setIsProcessingLyrics: (processing) =>
    set({ isProcessingLyrics: processing }),
  setHeaderText: (text) => set({ headerText: text }),
  setOffset: (offset, userOffset) => set({ offset, userOffset }),
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

  reset: () =>
    set({
      songInfo: null,
      lyrics: [],
      lyricsSource: null,
      availableLyricsSources: [],
      translatedLyrics: [],
      romanizedLyrics: [],
      activeIndex: -1,
      headerText: "Waiting for music...",
      isLoading: false,
      isProcessingLyrics: false,
      lyricsLanguage: null,
    }),

  resetLyricsOnly: () =>
    set({
      lyrics: [],
      lyricsSource: null,
      availableLyricsSources: [],
      translatedLyrics: [],
      romanizedLyrics: [],
      activeIndex: -1,
      isProcessingLyrics: false,
      headerText: "No lyrics found",
      isLoading: false, // Ensure loading is off
      lyricsLanguage: null,
    }),
}));
