import { Fragment, useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Settings,
  Monitor,
  Languages,
  Info,
  Layers,
  Palette,
  Trash2,
  Download,
  Upload,
  PanelRight,
  PictureInPicture2,
  RotateCcw,
  Type,
  MicVocal,
  MicOff,
  ArrowUpToLine,
  ArrowDownToLine,
  AlignCenterHorizontal,
  Move,
  Sparkles,
} from "lucide-react";
import { useAppStore } from "../store";
import { log } from "../utils/logger";
import SourcePreferenceList from "./SourcePreferenceList";
import ThemeSelectionModal from "./ThemeSelectionModal";
import CustomThemeModal from "./CustomThemeModal";
import ThemeImportExportModal from "./ThemeImportExportModal";
import LanguageExclusionsModal from "./LanguageExclusionsModal";
import CacheEditorView from "./CacheEditorView";
import FloatingLyricsModal from "./FloatingLyricsModal";
import { AVAILABLE_LANGUAGES } from "../utils/languages";
import {
  CUSTOM_THEMES_STORAGE_KEY,
  DEFAULT_THEME_ID,
  getThemeById,
  getThemeCssVariables,
  getObsidianPopupTokens,
} from "../../themes";
import {
  createStoredCustomThemeFromDraft,
  createThemeCollectionExportPayload,
  createThemeExportPayload,
  resolveCustomThemes,
  updateStoredCustomThemeFromDraft,
} from "../../themes/customThemeUtils";
import { t } from "../../i18n";

function getCacheSongId(key) {
  if (key.startsWith("lyrics_versions_")) {
    return key.slice("lyrics_versions_".length);
  }

  if (key.startsWith("lyrics_")) {
    const rest = key.slice("lyrics_".length);
    const sourceSeparatorIndex = rest.lastIndexOf("__");
    return sourceSeparatorIndex === -1
      ? rest
      : rest.slice(0, sourceSeparatorIndex);
  }

  return null;
}

const LYRICS_SIZE_PRESETS = [
  {
    id: "compact",
    label: "Compact",
    description: "Tighter lyrics for small sidebars and dense playlists",
    activeSize: "15px",
  },
  {
    id: "standard",
    label: "Standard",
    description: "Balanced readability with spacious breathing room",
    activeSize: "16.5px",
  },
  {
    id: "large",
    label: "Large",
    description: "Bigger active lines with clean sub-layer spacing",
    activeSize: "18px",
  },
  {
    id: "cinematic",
    label: "Cinematic",
    description: "Strong bold focus line without text collisions",
    activeSize: "19.5px",
  },
];

const SettingsContent = () => {
  const [activeTab, setActiveTab] = useState("general");
  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);
  const [isLyricsSizeModalOpen, setIsLyricsSizeModalOpen] = useState(false);
  const [isCustomThemeModalOpen, setIsCustomThemeModalOpen] = useState(false);
  const [isThemeImportModalOpen, setIsThemeImportModalOpen] = useState(false);
  const [isExclusionsModalOpen, setIsExclusionsModalOpen] = useState(false);
  const [isCacheEditorOpen, setIsCacheEditorOpen] = useState(false);
  const [isFloatingLyricsModalOpen, setIsFloatingLyricsModalOpen] = useState(false);
  const [editingCustomThemeId, setEditingCustomThemeId] = useState(null);
  const [customThemeRecords, setCustomThemeRecords] = useState([]);
  const [customThemes, setCustomThemes] = useState([]);
  const [settings, setSettings] = useState({
    showLogs: false,
    compactMode: false,
    lyricsSizePreset: "standard",
    lyricsAnimationStyle: "better-lyrics",
    reduceAnimations: false,
    showCollapsedArtwork: true,
    displayMode: "sidebar",
    floatingPositionPreset: "right",
    floatingCustomPosition: null,
    romanization: false,
    autoTranslate: false,
    translationLang: "en",
    themeId: DEFAULT_THEME_ID,
    romanizationExclusions: [],
    translationExclusions: [],
    isKaraokeMode: false,
    karaokePosition: "bottom",
    karaokeCustomPosition: 80,
    karaokeFontSize: "medium",
    karaokeAnimationStyle: "classic",
    isVocalMuted: false,
    showMiniCompanion: true,
  });
  const [cacheInfo, setCacheInfo] = useState({ bytes: 0, songCount: 0 });
  const themeId = settings.themeId || DEFAULT_THEME_ID;
  const currentTheme = getThemeById(themeId, customThemes);
  const currentThemeName = currentTheme.isCustom
    ? currentTheme.name
    : t(`theme_${currentTheme.id}_name`, undefined, currentTheme.name);
  const currentThemeDescription = currentTheme.isCustom
    ? currentTheme.description
    : t(
        `theme_${currentTheme.id}_description`,
        undefined,
        currentTheme.description,
      );
  const currentLyricsSizePreset =
    LYRICS_SIZE_PRESETS.find(
      (preset) => preset.id === settings.lyricsSizePreset,
    ) || LYRICS_SIZE_PRESETS[1];
  const dynamicThemeTokens = useAppStore((state) => state.dynamicThemeTokens);
  const dynamicArtworkUrl = useAppStore(
    (state) => state.dynamicArtworkUrl || state.songInfo?.artwork,
  );
  const isInsidePopup =
    typeof window !== "undefined" &&
    window.location.pathname.includes("popup");
  const themeVars = useMemo(() => {
    if (themeId === "dynamic") {
      if (isInsidePopup) {
        return getObsidianPopupTokens(dynamicThemeTokens?.["--lyrical-accent"]);
      }
      return getThemeCssVariables("dynamic", customThemes, dynamicThemeTokens);
    }
    return getThemeCssVariables(themeId, customThemes);
  }, [themeId, customThemes, dynamicThemeTokens, isInsidePopup]);
  const editingCustomTheme =
    customThemes.find((theme) => theme.id === editingCustomThemeId) || null;
  const sectionCardStyle = {
    background: "var(--lyrical-card-bg)",
    borderRadius: "12px",
    padding: "16px",
    border: "1px solid var(--lyrical-border-soft)",
  };
  const sectionTitleStyle = {
    fontSize: "18px",
    fontWeight: "700",
    color: "var(--lyrical-text-primary)",
    margin: 0,
  };
  const sectionDescriptionStyle = {
    color: "var(--lyrical-text-muted)",
    fontSize: "13px",
    marginTop: "4px",
    marginBottom: "20px",
  };
  const dividerStyle = {
    height: "1px",
    background: "var(--lyrical-border-soft)",
    margin: "12px 0",
  };
  const inputStyle = {
    width: "100%",
    padding: "10px",
    background: "var(--lyrical-card-bg-elevated)",
    border: "1px solid var(--lyrical-border)",
    borderRadius: "8px",
    color: "var(--lyrical-text-primary)",
    fontSize: "13px",
    outline: "none",
    cursor: "pointer",
  };

  const refreshCacheInfo = useCallback(() => {
    chrome.storage.local.get(null, (items) => {
      const lyricsKeys = Object.keys(items).filter(
        (key) =>
          key.startsWith("lyrics_") || key.startsWith("lyrics_versions_"),
      );
      const uniqueSongs = new Set(
        lyricsKeys.map((key) => getCacheSongId(key)).filter(Boolean),
      );

      chrome.storage.local.getBytesInUse(null, (bytes) => {
        setCacheInfo({ bytes, songCount: uniqueSongs.size });
      });
    });
  }, []);

  const tabs = [
    { id: "general", label: t("settings_tab_general") },
    { id: "display", label: t("settings_tab_display") },
    { id: "themes", label: t("settings_tab_themes") },
    { id: "language", label: t("settings_tab_language") },
    { id: "sources", label: t("settings_tab_sources") },
    { id: "about", label: t("settings_tab_about") },
  ];

  // Load settings on mount
  useEffect(() => {
    chrome.storage.sync.get(
      {
        showLogs: false,
        compactMode: false,
        lyricsSizePreset: "standard",
        lyricsAnimationStyle: "better-lyrics",
        reduceAnimations: false,
        showCollapsedArtwork: true,
        displayMode: "sidebar",
        floatingPositionPreset: "right",
        floatingCustomPosition: null,
        isRomanizationEnabled: false,
        isTranslateEnabled: false,
        translationLanguage: "en",
        themeId: DEFAULT_THEME_ID,
        romanizationExclusions: [],
        translationExclusions: [],
        [CUSTOM_THEMES_STORAGE_KEY]: [],
        sourcePreferences: null, // Will be null if never saved
        isKaraokeMode: false,
        karaokePosition: "bottom",
        karaokeCustomPosition: 80,
        karaokeFontSize: "medium",
        karaokeAnimationStyle: "classic",
        isVocalMuted: false,
        albumArtTransition: "shuffle",
        titleTransition: "spring",
        scrollLongTitles: true,
        showProgressBar: true,
        reopenFloatingLyricsAutomatically: false,
      },
      (items: any) => {
        setSettings({
          showLogs: items.showLogs,
          compactMode: items.compactMode,
          lyricsSizePreset: items.lyricsSizePreset || "standard",
          lyricsAnimationStyle: items.lyricsAnimationStyle || "better-lyrics",
          reduceAnimations: items.reduceAnimations,
          showCollapsedArtwork: items.showCollapsedArtwork,
          displayMode: items.displayMode || "sidebar",
          floatingPositionPreset: items.floatingPositionPreset || "right",
          floatingCustomPosition: items.floatingCustomPosition || null,
          romanization: items.isRomanizationEnabled,
          autoTranslate: items.isTranslateEnabled,
          translationLang: items.translationLanguage,
          themeId: items.themeId,
          romanizationExclusions: items.romanizationExclusions,
          translationExclusions: items.translationExclusions,
          isKaraokeMode: Boolean(items.isKaraokeMode),
          karaokePosition: items.karaokePosition || "bottom",
          karaokeCustomPosition: typeof items.karaokeCustomPosition === "number" ? items.karaokeCustomPosition : 80,
          karaokeFontSize: items.karaokeFontSize || "medium",
          karaokeAnimationStyle: items.karaokeAnimationStyle || "classic",
          isVocalMuted: Boolean(items.isVocalMuted),
          showMiniCompanion: items.showMiniCompanion ?? true,
        });
        const nextCustomThemeRecords = items[CUSTOM_THEMES_STORAGE_KEY] || [];
        const nextCustomThemes = resolveCustomThemes(nextCustomThemeRecords);
        setCustomThemeRecords(nextCustomThemeRecords);
        setCustomThemes(nextCustomThemes);

        // Sync to Store
        useAppStore.setState({
          isRomanizationEnabled: items.isRomanizationEnabled,
          isTranslateEnabled: items.isTranslateEnabled,
          translationLanguage: items.translationLanguage,
          compactMode: items.compactMode,
          lyricsSizePreset: items.lyricsSizePreset || "standard",
          lyricsAnimationStyle: items.lyricsAnimationStyle || "better-lyrics",
          reduceAnimations: items.reduceAnimations,
          showCollapsedArtwork: items.showCollapsedArtwork,
          displayMode: items.displayMode || "sidebar",
          floatingPositionPreset: items.floatingPositionPreset || "right",
          floatingCustomPosition: items.floatingCustomPosition || null,
          romanizationExclusions: items.romanizationExclusions,
          translationExclusions: items.translationExclusions,
          themeId: items.themeId,
          customThemes: nextCustomThemes,
          isKaraokeMode: Boolean(items.isKaraokeMode),
          karaokePosition: items.karaokePosition || "bottom",
          karaokeCustomPosition: typeof items.karaokeCustomPosition === "number" ? items.karaokeCustomPosition : 80,
          karaokeFontSize: items.karaokeFontSize || "medium",
          karaokeAnimationStyle: items.karaokeAnimationStyle || "classic",
          isVocalMuted: Boolean(items.isVocalMuted),
          albumArtTransition: items.albumArtTransition || "shuffle",
          titleTransition: items.titleTransition || "spring",
          scrollLongTitles: items.scrollLongTitles ?? true,
          showProgressBar: items.showProgressBar ?? true,
          reopenFloatingLyricsAutomatically:
            items.reopenFloatingLyricsAutomatically ?? false,
          showMiniCompanion: items.showMiniCompanion ?? true,
        });

        // Load source preferences if saved
        if (items.sourcePreferences) {
          useAppStore
            .getState()
            .setSourcePreferences(items.sourcePreferences);
        }
      },
    );

    // Load active lyrics source from local storage (for popup to show ACTIVE badge)
    chrome.storage.local.get("activeLyricsSource", (result: any) => {
      if (result.activeLyricsSource) {
        useAppStore.setState({ lyricsSource: result.activeLyricsSource });
      }
    });

    const handleStorageChange = (changes: any, namespace) => {
      if (
        namespace === "local" &&
        Object.prototype.hasOwnProperty.call(changes, "activeLyricsSource")
      ) {
        useAppStore.setState({
          lyricsSource: changes.activeLyricsSource.newValue || null,
        });
      }

      if (
        namespace === "sync" &&
        Object.prototype.hasOwnProperty.call(changes, "compactMode")
      ) {
        const nextCompactMode = Boolean(changes.compactMode.newValue);
        setSettings((prev) => ({ ...prev, compactMode: nextCompactMode }));
        useAppStore.getState().setCompactMode(nextCompactMode);
      }

      if (
        namespace === "sync" &&
        Object.prototype.hasOwnProperty.call(changes, "lyricsSizePreset")
      ) {
        const nextPreset = changes.lyricsSizePreset.newValue || "standard";
        setSettings((prev) => ({ ...prev, lyricsSizePreset: nextPreset }));
        useAppStore.setState({ lyricsSizePreset: nextPreset });
      }

      if (
        namespace === "sync" &&
        Object.prototype.hasOwnProperty.call(changes, "lyricsAnimationStyle")
      ) {
        const nextStyle =
          changes.lyricsAnimationStyle.newValue || "better-lyrics";
        setSettings((prev) => ({ ...prev, lyricsAnimationStyle: nextStyle }));
        useAppStore.setState({ lyricsAnimationStyle: nextStyle });
      }

      if (
        namespace === "sync" &&
        Object.prototype.hasOwnProperty.call(changes, "reduceAnimations")
      ) {
        const nextReduceAnimations = Boolean(changes.reduceAnimations.newValue);
        setSettings((prev) => ({
          ...prev,
          reduceAnimations: nextReduceAnimations,
        }));
        useAppStore.getState().setReduceAnimations(nextReduceAnimations);
      }

      if (
        namespace === "sync" &&
        Object.prototype.hasOwnProperty.call(changes, "themeId")
      ) {
        const nextThemeId = changes.themeId.newValue || DEFAULT_THEME_ID;
        setSettings((prev) => ({ ...prev, themeId: nextThemeId }));
        useAppStore.getState().setThemeId(nextThemeId);
      }

      if (
        namespace === "sync" &&
        Object.prototype.hasOwnProperty.call(changes, CUSTOM_THEMES_STORAGE_KEY)
      ) {
        const nextCustomThemeRecords =
          changes[CUSTOM_THEMES_STORAGE_KEY].newValue || [];
        const nextCustomThemes = resolveCustomThemes(nextCustomThemeRecords);
        setCustomThemeRecords(nextCustomThemeRecords);
        setCustomThemes(nextCustomThemes);
        useAppStore.getState().setCustomThemes(nextCustomThemes);
      }

      if (
        namespace === "sync" &&
        Object.prototype.hasOwnProperty.call(changes, "isVocalMuted")
      ) {
        const nextVocalMuted = Boolean(changes.isVocalMuted.newValue);
        setSettings((prev) => ({ ...prev, isVocalMuted: nextVocalMuted }));
        useAppStore.getState().setVocalMuted(nextVocalMuted);
      }

      if (
        namespace === "sync" &&
        Object.prototype.hasOwnProperty.call(changes, "albumArtTransition")
      ) {
        const nextArt = changes.albumArtTransition.newValue || "shuffle";
        useAppStore.setState({ albumArtTransition: nextArt });
      }

      if (
        namespace === "sync" &&
        Object.prototype.hasOwnProperty.call(changes, "titleTransition")
      ) {
        const nextTitle = changes.titleTransition.newValue || "spring";
        useAppStore.setState({ titleTransition: nextTitle });
      }

      if (
        namespace === "sync" &&
        Object.prototype.hasOwnProperty.call(changes, "scrollLongTitles")
      ) {
        const nextScroll =
          changes.scrollLongTitles.newValue !== undefined
            ? Boolean(changes.scrollLongTitles.newValue)
            : true;
        useAppStore.setState({ scrollLongTitles: nextScroll });
      }

      if (
        namespace === "sync" &&
        Object.prototype.hasOwnProperty.call(changes, "showProgressBar")
      ) {
        const nextProgress =
          changes.showProgressBar.newValue !== undefined
            ? Boolean(changes.showProgressBar.newValue)
            : true;
        useAppStore.setState({ showProgressBar: nextProgress });
      }

      if (
        namespace === "sync" &&
        Object.prototype.hasOwnProperty.call(
          changes,
          "reopenFloatingLyricsAutomatically",
        )
      ) {
        const nextReopen = Boolean(
          changes.reopenFloatingLyricsAutomatically.newValue,
        );
        useAppStore.setState({
          reopenFloatingLyricsAutomatically: nextReopen,
        });
      }

      if (
        namespace === "sync" &&
        Object.prototype.hasOwnProperty.call(changes, "showMiniCompanion")
      ) {
        const nextShow =
          changes.showMiniCompanion.newValue !== undefined
            ? Boolean(changes.showMiniCompanion.newValue)
            : true;
        setSettings((prev) => ({ ...prev, showMiniCompanion: nextShow }));
        useAppStore.setState({ showMiniCompanion: nextShow });
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);

    refreshCacheInfo();

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, [refreshCacheInfo]);

  const karaokePositionDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushKaraokePosition = useCallback((value: number) => {
    if (karaokePositionDebounceTimer.current) {
      clearTimeout(karaokePositionDebounceTimer.current);
      karaokePositionDebounceTimer.current = null;
    }
    if (typeof chrome !== "undefined" && chrome?.storage?.sync) {
      chrome.storage.sync.set({ karaokeCustomPosition: value }, () => {
        if (chrome.runtime?.lastError) {
          log("Karaoke position sync throttled:", chrome.runtime.lastError.message);
        } else {
          log("Settings Updated:", { karaokeCustomPosition: value });
        }
      });
    }
  }, []);

  const updateSetting = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));

    // Sync to store immediately for instantaneous UI/overlay updates
    if (key === "compactMode") useAppStore.getState().setCompactMode(value);
    if (key === "lyricsSizePreset")
      useAppStore.setState({ lyricsSizePreset: value });
    if (key === "lyricsAnimationStyle")
      useAppStore.setState({ lyricsAnimationStyle: value });
    if (key === "reduceAnimations")
      useAppStore.getState().setReduceAnimations(value);
    if (key === "showCollapsedArtwork")
      useAppStore.setState({ showCollapsedArtwork: value });
    if (key === "displayMode")
      useAppStore.setState({ displayMode: value });
    if (key === "floatingPositionPreset")
      useAppStore.setState({ floatingPositionPreset: value });
    if (key === "floatingCustomPosition")
      useAppStore.setState({ floatingCustomPosition: value });
    if (key === "romanization")
      useAppStore.setState({ isRomanizationEnabled: value });
    if (key === "autoTranslate")
      useAppStore.setState({ isTranslateEnabled: value });
    if (key === "translationLang")
      useAppStore.setState({ translationLanguage: value });
    if (key === "themeId") {
      useAppStore.setState({
        customThemes: customThemes,
        themeId: value,
      });
    }
    if (key === "romanizationExclusions")
      useAppStore.setState({ romanizationExclusions: value });
    if (key === "translationExclusions")
      useAppStore.setState({ translationExclusions: value });
    if (key === "isKaraokeMode")
      useAppStore.setState({ isKaraokeMode: Boolean(value) });
    if (key === "karaokePosition")
      useAppStore.setState({ karaokePosition: value });
    if (key === "karaokeCustomPosition")
      useAppStore.setState({ karaokeCustomPosition: value });
    if (key === "karaokeFontSize")
      useAppStore.setState({ karaokeFontSize: value });
    if (key === "karaokeAnimationStyle")
      useAppStore.setState({ karaokeAnimationStyle: value });
    if (key === "isVocalMuted")
      useAppStore.getState().setVocalMuted(Boolean(value));

    // Handle high-frequency slider drag with trailing debounce to prevent MAX_WRITE_OPERATIONS_PER_MINUTE quota error
    if (key === "karaokeCustomPosition") {
      if (karaokePositionDebounceTimer.current) {
        clearTimeout(karaokePositionDebounceTimer.current);
      }
      karaokePositionDebounceTimer.current = setTimeout(() => {
        karaokePositionDebounceTimer.current = null;
        if (typeof chrome !== "undefined" && chrome?.storage?.sync) {
          chrome.storage.sync.set({ karaokeCustomPosition: value }, () => {
            if (chrome.runtime?.lastError) {
              log("Karaoke position sync throttled:", chrome.runtime.lastError.message);
            } else {
              log("Settings Updated:", { karaokeCustomPosition: value });
            }
          });
        }
      }, 250);
      return;
    }

    let storageUpdate: Record<string, any> = {};
    if (key === "showLogs") storageUpdate.showLogs = value;
    if (key === "compactMode") {
      storageUpdate.compactMode = value; // Use new key
    }
    if (key === "lyricsSizePreset") {
      storageUpdate.lyricsSizePreset = value;
    }
    if (key === "lyricsAnimationStyle") {
      storageUpdate.lyricsAnimationStyle = value;
    }
    if (key === "reduceAnimations") {
      storageUpdate.reduceAnimations = value;
    }
    if (key === "showCollapsedArtwork") {
      storageUpdate.showCollapsedArtwork = value;
    }
    if (key === "displayMode") {
      storageUpdate.displayMode = value;
    }
    if (key === "floatingPositionPreset") {
      storageUpdate.floatingPositionPreset = value;
    }
    if (key === "floatingCustomPosition") {
      storageUpdate.floatingCustomPosition = value;
    }
    if (key === "romanization") storageUpdate.isRomanizationEnabled = value;
    if (key === "autoTranslate") storageUpdate.isTranslateEnabled = value;
    if (key === "translationLang") storageUpdate.translationLanguage = value;
    if (key === "themeId") storageUpdate.themeId = value;
    if (key === "romanizationExclusions")
      storageUpdate.romanizationExclusions = value;
    if (key === "translationExclusions")
      storageUpdate.translationExclusions = value;
    if (key === "isKaraokeMode") storageUpdate.isKaraokeMode = value;
    if (key === "karaokePosition") storageUpdate.karaokePosition = value;
    if (key === "karaokeFontSize") storageUpdate.karaokeFontSize = value;
    if (key === "karaokeAnimationStyle") storageUpdate.karaokeAnimationStyle = value;
    if (key === "isVocalMuted") storageUpdate.isVocalMuted = value;

    if (typeof chrome !== "undefined" && chrome?.storage?.sync) {
      chrome.storage.sync.set(storageUpdate, () => {
        if (chrome.runtime?.lastError) {
          log("Settings sync warning:", chrome.runtime.lastError.message);
        } else {
          log("Settings Updated:", storageUpdate);
        }
      });
    }
  };

  const persistCustomThemes = (nextCustomThemeRecords) =>
    new Promise((resolve, reject) => {
      const safeThemeRecords = Array.isArray(nextCustomThemeRecords)
        ? nextCustomThemeRecords
        : [];

      chrome.storage.sync.set(
        { [CUSTOM_THEMES_STORAGE_KEY]: safeThemeRecords },
        () => {
          if (chrome.runtime?.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          const hydratedThemes = resolveCustomThemes(safeThemeRecords);
          setCustomThemeRecords(safeThemeRecords);
          setCustomThemes(hydratedThemes);
          useAppStore.getState().setCustomThemes(hydratedThemes);
          resolve(hydratedThemes);
        },
      );
    });

  const saveCustomTheme = async (draft) => {
    if (editingCustomThemeId) {
      const existingThemeRecord = customThemeRecords.find(
        (theme) => theme.id === editingCustomThemeId,
      );

      if (!existingThemeRecord) {
        throw new Error("The theme you are editing could not be found.");
      }

      const updatedThemeRecord = updateStoredCustomThemeFromDraft(
        existingThemeRecord,
        draft,
      );
      const nextThemeRecords = customThemeRecords.map((theme) =>
        theme.id === editingCustomThemeId ? updatedThemeRecord : theme,
      );
      await persistCustomThemes(nextThemeRecords);
      updateSetting("themeId", updatedThemeRecord.id);
      setEditingCustomThemeId(null);
      return;
    }

    const storedTheme = createStoredCustomThemeFromDraft(draft);
    const nextThemeRecords = [...customThemeRecords, storedTheme];
    await persistCustomThemes(nextThemeRecords);
    updateSetting("themeId", storedTheme.id);
  };

  const deleteCustomTheme = (themeIdToDelete) => {
    const nextThemeRecords = customThemeRecords.filter(
      (theme) => theme.id !== themeIdToDelete,
    );
    persistCustomThemes(nextThemeRecords);

    if (themeId === themeIdToDelete) {
      updateSetting("themeId", DEFAULT_THEME_ID);
    }
  };

  const downloadJson = (fileName, payload) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const getThemeFileName = (theme, suffix = "theme") => {
    const slug = String(theme?.name || "lyrical-theme")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);
    return `${slug || "lyrical"}-${suffix}.json`;
  };

  const exportCustomTheme = (themeIdToExport) => {
    const theme = customThemes.find((item) => item.id === themeIdToExport);
    if (!theme) return;

    downloadJson(getThemeFileName(theme), createThemeExportPayload(theme));
  };

  const exportAllCustomThemes = () => {
    if (customThemes.length === 0) return;
    downloadJson(
      "lyrical-custom-themes.json",
      createThemeCollectionExportPayload(customThemes),
    );
  };

  const importCustomThemes = async (themeRecords) => {
    const importedRecords = Array.isArray(themeRecords) ? themeRecords : [];
    if (importedRecords.length === 0) return;

    const nextThemeRecords = [...customThemeRecords, ...importedRecords];
    await persistCustomThemes(nextThemeRecords);
    updateSetting("themeId", importedRecords[0].id);
  };

  const openCreateCustomThemeModal = () => {
    setEditingCustomThemeId(null);
    setIsCustomThemeModalOpen(true);
  };

  const openEditCustomThemeModal = (themeIdToEdit) => {
    setEditingCustomThemeId(themeIdToEdit);
    setIsThemeModalOpen(false);
    setIsCustomThemeModalOpen(true);
  };

  return (
    <div
      style={{
        ...themeVars,
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
        color: "var(--lyrical-text-primary)",
      }}
    >
      {/* Tabs */}
      <div
        style={{
          paddingTop: "12px",
          flexShrink: 0,
        }}
      >
        <div
          className="settings-tabs-row"
          style={{
            display: "flex",
            padding: "0 24px 16px",
            gap: "8px",
            overflowX: "auto",
            overflowY: "hidden",
            flexShrink: 0,
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  background: isActive
                    ? "var(--lyrical-card-bg-elevated)"
                    : "transparent",
                  border: "none",
                  padding: "8px 16px",
                  color: isActive
                    ? "var(--lyrical-text-primary)"
                    : "var(--lyrical-text-muted)",
                  fontWeight: isActive ? "600" : "500",
                  fontSize: "14px",
                  borderRadius: "20px",
                  cursor: "pointer",
                  transition: "color 0.2s, font-weight 0.2s, background 0.2s",
                  whiteSpace: "nowrap",
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content Area */}
      <div
        style={{
          flex: 1,
          background: "var(--lyrical-page-bg)",
          padding: "24px",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            maxWidth: "540px",
            margin: "0 auto",
          }}
        >
          {/* General Tab */}
          {activeTab === "general" && (
            <div className="animate-fade-in">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  marginBottom: "8px",
                }}
              >
                <Settings size={20} color="var(--lyrical-text-primary)" />
                <h2 style={sectionTitleStyle}>
                  {t("settings_general_title")}
                </h2>
              </div>
              <p style={sectionDescriptionStyle}>
                {t("settings_general_description")}
              </p>

              <div style={sectionCardStyle}>
                <ToggleItem
                  label={t("settings_showLogs_label")}
                  checked={settings.showLogs}
                  onChange={(v) => updateSetting("showLogs", v)}
                  desc={t("settings_showLogs_desc")}
                />
                <div style={dividerStyle} />
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "14px", fontWeight: "500" }}>
                        {t("settings_cache_label")}
                      </div>
                      <div
                        style={{
                          fontSize: "12px",
                          color: "var(--lyrical-text-muted)",
                        }}
                      >
                        {t("settings_cache_desc")}
                      </div>
                    </div>
                    <button
                      type="button"
                      style={{
                        background:
                          "var(--lyrical-danger-soft, rgba(239, 68, 68, 0.14))",
                        color: "var(--lyrical-danger-text, #f87171)",
                        border:
                          "1px solid var(--lyrical-danger-border, rgba(239, 68, 68, 0.32))",
                        padding: "7px 13px",
                        borderRadius: "8px",
                        fontSize: "12px",
                        fontWeight: "600",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        transition: "all 0.16s ease",
                        boxShadow: "0 2px 6px rgba(239, 68, 68, 0.08)",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background =
                          "var(--lyrical-danger-hover, rgba(239, 68, 68, 0.24))";
                        e.currentTarget.style.borderColor =
                          "rgba(239, 68, 68, 0.55)";
                        e.currentTarget.style.color = "#ffffff";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background =
                          "var(--lyrical-danger-soft, rgba(239, 68, 68, 0.14))";
                        e.currentTarget.style.borderColor =
                          "var(--lyrical-danger-border, rgba(239, 68, 68, 0.32))";
                        e.currentTarget.style.color =
                          "var(--lyrical-danger-text, #f87171)";
                      }}
                      onClick={() => {
                        chrome.storage.local.clear(() => {
                          refreshCacheInfo();
                          alert(t("settings_cache_cleared"));
                        });
                      }}
                    >
                      <Trash2 size={14} />
                      {t("settings_cache_clear")}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsCacheEditorOpen(true)}
                    style={{
                      background: "var(--lyrical-card-bg-elevated)",
                      color: "var(--lyrical-text-primary)",
                      border: "1px solid var(--lyrical-border)",
                      padding: "10px 14px",
                      borderRadius: "10px",
                      fontSize: "12px",
                      fontWeight: "700",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "8px",
                      alignSelf: "flex-start",
                    }}
                  >
                    {t("settings_cache_openEditor")}
                  </button>
                  {/* Cache Info Display */}
                  <div
                    style={{
                      background: "var(--lyrical-accent-soft)",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "12px",
                        color: "var(--lyrical-text-secondary)",
                      }}
                    >
                      {t("settings_cache_storageUsed")}
                    </span>
                    <span
                      style={{
                        fontSize: "12px",
                        color: "var(--lyrical-accent)",
                        fontWeight: "600",
                      }}
                    >
                      {cacheInfo.bytes >= 1024 * 1024
                        ? `${(cacheInfo.bytes / (1024 * 1024)).toFixed(2)} MB`
                        : cacheInfo.bytes >= 1024
                          ? `${(cacheInfo.bytes / 1024).toFixed(1)} KB`
                          : `${cacheInfo.bytes} bytes`}
                      {" - "}
                      {cacheInfo.songCount === 1
                        ? t("settings_cache_songCached", [
                            String(cacheInfo.songCount),
                          ])
                        : t("settings_cache_songsCached", [
                            String(cacheInfo.songCount),
                          ])}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Display Tab */}
          {activeTab === "display" && (
            <div className="animate-fade-in">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  marginBottom: "8px",
                }}
              >
                <Monitor size={20} color="var(--lyrical-text-primary)" />
                <h2 style={sectionTitleStyle}>
                  {t("settings_display_title")}
                </h2>
              </div>
              <p style={sectionDescriptionStyle}>
                {t("settings_display_description")}
              </p>

              <div style={sectionCardStyle}>
                <button
                  type="button"
                  onClick={() => setIsLyricsSizeModalOpen(true)}
                  style={{
                    width: "100%",
                    padding: "0",
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    textAlign: "left",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "14px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        width: "34px",
                        height: "34px",
                        borderRadius: "10px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "var(--lyrical-accent)",
                        background: "var(--lyrical-accent-soft)",
                        border: "1px solid var(--lyrical-border-soft)",
                        flexShrink: 0,
                      }}
                    >
                      <Type size={18} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          color: "var(--lyrical-text-primary)",
                          fontSize: "14px",
                          fontWeight: "600",
                          marginBottom: "3px",
                        }}
                      >
                        Lyrics Typography
                      </div>
                      <div
                        style={{
                          color: "var(--lyrical-text-muted)",
                          fontSize: "12px",
                          lineHeight: 1.35,
                        }}
                      >
                        Scale lyrics in compact and expanded panel views
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        color: "var(--lyrical-text-primary)",
                        background: "var(--lyrical-card-bg-elevated)",
                        border: "1px solid var(--lyrical-border)",
                        borderRadius: "999px",
                        padding: "5px 10px",
                        fontSize: "12px",
                        fontWeight: "700",
                      }}
                    >
                      {currentLyricsSizePreset.label}
                    </span>
                    <span
                      aria-hidden="true"
                      style={{
                        color: "var(--lyrical-text-muted)",
                        fontSize: "18px",
                        lineHeight: 1,
                      }}
                    >
                      ›
                    </span>
                  </div>
                </button>
                <div style={dividerStyle} />
                <ToggleItem
                  label={t("settings_compactMode_label")}
                  checked={settings.compactMode}
                  onChange={(v) => updateSetting("compactMode", v)}
                  desc={t("settings_compactMode_desc")}
                />
                <div style={dividerStyle} />
                <ToggleItem
                  label={t("settings_reduceAnimations_label")}
                  checked={settings.reduceAnimations}
                  onChange={(v) => updateSetting("reduceAnimations", v)}
                  desc={t("settings_reduceAnimations_desc")}
                />
                <div style={dividerStyle} />
                <ToggleItem
                  label={t(
                    "settings_showCollapsedArtwork_label",
                    undefined,
                    "Collapsed Album Cover",
                  )}
                  checked={settings.showCollapsedArtwork ?? true}
                  onChange={(v) => updateSetting("showCollapsedArtwork", v)}
                  desc={t(
                    "settings_showCollapsedArtwork_desc",
                    undefined,
                    "Show faded album cover watermark on the right side in collapsed view",
                  )}
                />

                <div style={dividerStyle} />

                {/* Lyrics Animation Engine Style */}
                <div style={{ padding: "4px 0" }}>
                  <div style={{ fontSize: "14px", fontWeight: "600", color: "var(--lyrical-text-primary)", marginBottom: "4px" }}>
                    Lyrics Animation Engine
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--lyrical-text-muted)", marginBottom: "12px" }}>
                    Choose the animation style used for syllable, word, and line synchronized lyrics
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "10px",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => updateSetting("lyricsAnimationStyle", "better-lyrics")}
                      style={{
                        padding: "12px",
                        borderRadius: "10px",
                        border:
                          (settings.lyricsAnimationStyle || "better-lyrics") === "better-lyrics"
                            ? "1px solid var(--lyrical-accent)"
                            : "1px solid var(--lyrical-border-soft)",
                        background:
                          (settings.lyricsAnimationStyle || "better-lyrics") === "better-lyrics"
                            ? "var(--lyrical-accent-soft)"
                            : "var(--lyrical-card-bg)",
                        color: "var(--lyrical-text-primary)",
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "all 0.2s ease",
                      }}
                    >
                      <div style={{ fontWeight: "700", fontSize: "13px", marginBottom: "4px" }}>
                        Classic
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--lyrical-text-muted)", lineHeight: 1.35 }}>
                        Dynamic 3D wobble rotation and liquid fluid swipe fill
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => updateSetting("lyricsAnimationStyle", "archivetune")}
                      style={{
                        padding: "12px",
                        borderRadius: "10px",
                        border:
                          settings.lyricsAnimationStyle === "archivetune"
                            ? "1px solid var(--lyrical-accent)"
                            : "1px solid var(--lyrical-border-soft)",
                        background:
                          settings.lyricsAnimationStyle === "archivetune"
                            ? "var(--lyrical-accent-soft)"
                            : "var(--lyrical-card-bg)",
                        color: "var(--lyrical-text-primary)",
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "all 0.2s ease",
                      }}
                    >
                      <div style={{ fontWeight: "700", fontSize: "13px", marginBottom: "4px" }}>
                        Modern Gentle
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--lyrical-text-muted)", lineHeight: 1.35 }}>
                        Vertical sine float, feathered gradient mask & spring word ripple
                      </div>
                    </button>
                  </div>
                </div>

                <div style={dividerStyle} />

                {/* Panel Placement Section */}
                <div style={{ padding: "4px 0" }}>
                  <div style={{ fontSize: "14px", fontWeight: "600", color: "var(--lyrical-text-primary)", marginBottom: "4px" }}>
                    Panel Placement
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--lyrical-text-muted)", marginBottom: "12px" }}>
                    Choose whether the lyrics panel sits in the page sidebar or floats above content
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "10px",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => updateSetting("displayMode", "sidebar")}
                      style={{
                        padding: "14px 12px",
                        borderRadius: "12px",
                        border: settings.displayMode === "sidebar"
                          ? "2px solid var(--lyrical-accent)"
                          : "1px solid var(--lyrical-border)",
                        background: settings.displayMode === "sidebar"
                          ? "var(--lyrical-accent-soft)"
                          : "var(--lyrical-card-bg-elevated)",
                        color: "var(--lyrical-text-primary)",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "6px",
                        transition: "all 0.18s ease",
                      }}
                    >
                      <PanelRight
                        size={22}
                        color={
                          settings.displayMode === "sidebar"
                            ? "var(--lyrical-accent)"
                            : "var(--lyrical-text-secondary)"
                        }
                      />
                      <span style={{ fontSize: "13px", fontWeight: "600" }}>Sidebar</span>
                      <span style={{ fontSize: "11px", color: "var(--lyrical-text-muted)" }}>In-page column</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => updateSetting("displayMode", "floating")}
                      style={{
                        padding: "14px 12px",
                        borderRadius: "12px",
                        border: settings.displayMode === "floating"
                          ? "2px solid var(--lyrical-accent)"
                          : "1px solid var(--lyrical-border)",
                        background: settings.displayMode === "floating"
                          ? "var(--lyrical-accent-soft)"
                          : "var(--lyrical-card-bg-elevated)",
                        color: "var(--lyrical-text-primary)",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "6px",
                        transition: "all 0.18s ease",
                      }}
                    >
                      <PictureInPicture2
                        size={22}
                        color={
                          settings.displayMode === "floating"
                            ? "var(--lyrical-accent)"
                            : "var(--lyrical-text-secondary)"
                        }
                      />
                      <span style={{ fontSize: "13px", fontWeight: "600" }}>Floating Panel</span>
                      <span style={{ fontSize: "11px", color: "var(--lyrical-text-muted)" }}>Screen overlay</span>
                    </button>
                  </div>

                  {settings.displayMode === "floating" && (
                    <div
                      style={{
                        background: "var(--lyrical-panel-surface-soft)",
                        border: "1px solid var(--lyrical-border-soft)",
                        borderRadius: "14px",
                        padding: "16px",
                        marginTop: "14px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "12px",
                      }}
                    >
                      <div style={{ fontSize: "13px", fontWeight: "600", color: "var(--lyrical-text-primary)" }}>
                        Floating Position
                      </div>
                      
                      {/* Preset position options (matching user modal screenshot) */}
                      <div style={{ display: "flex", gap: "8px" }}>
                        {[
                          { id: "left", label: "Left" },
                          { id: "center", label: "Center" },
                          { id: "right", label: "Right" },
                        ].map((pos) => {
                          const isActive =
                            settings.floatingPositionPreset === pos.id &&
                            !settings.floatingCustomPosition;
                          return (
                            <button
                              key={pos.id}
                              type="button"
                              onClick={() => {
                                updateSetting("floatingCustomPosition", null);
                                updateSetting("floatingPositionPreset", pos.id);
                              }}
                              style={{
                                flex: 1,
                                padding: "8px 12px",
                                borderRadius: "10px",
                                border: isActive
                                  ? "1px solid var(--lyrical-accent)"
                                  : "1px solid var(--lyrical-border)",
                                background: isActive
                                  ? "var(--lyrical-accent-soft)"
                                  : "var(--lyrical-card-bg-elevated)",
                                color: isActive
                                  ? "var(--lyrical-accent)"
                                  : "var(--lyrical-text-primary)",
                                fontSize: "12px",
                                fontWeight: "600",
                                cursor: "pointer",
                              }}
                            >
                              {pos.label}
                            </button>
                          );
                        })}
                      </div>

                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px" }}>
                        <span style={{ fontSize: "11px", color: "var(--lyrical-text-muted)" }}>
                          {settings.floatingCustomPosition
                            ? "Custom dragged position active"
                            : `Preset: ${settings.floatingPositionPreset}`}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            updateSetting("floatingCustomPosition", null);
                            updateSetting("floatingPositionPreset", "right");
                          }}
                          className="lyrical-hover-btn"
                          style={{
                            background: "var(--lyrical-card-bg-elevated)",
                            color: "var(--lyrical-text-primary)",
                            border: "1px solid var(--lyrical-border)",
                            padding: "6px 14px",
                            borderRadius: "8px",
                            fontSize: "12px",
                            fontWeight: "600",
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            transition: "all 0.18s ease",
                          }}
                        >
                          <RotateCcw size={13} />
                          Reset Position
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div style={dividerStyle} />

                {/* Floating lyrics window Modal Trigger */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "14px",
                    padding: "4px 0",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: "14px",
                        fontWeight: "600",
                        color: "var(--lyrical-text-primary)",
                        marginBottom: "3px",
                      }}
                    >
                      Header & Transition Animations
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "var(--lyrical-text-muted)",
                        lineHeight: 1.35,
                      }}
                    >
                      Album art & title transitions, progress bar, and scrolling title
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsFloatingLyricsModalOpen(true)}
                    style={{
                      background: "var(--lyrical-card-bg-elevated)",
                      color: "var(--lyrical-text-primary)",
                      border: "1px solid var(--lyrical-border)",
                      padding: "7px 14px",
                      borderRadius: "8px",
                      fontSize: "12px",
                      fontWeight: "600",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      flexShrink: 0,
                      transition: "all 0.18s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background =
                        "var(--lyrical-panel-surface, rgba(255,255,255,0.1))";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background =
                        "var(--lyrical-card-bg-elevated, #27272a)";
                    }}
                  >
                    Customize
                  </button>
                </div>

                {/* Mini Companion Toggle */}
                <div style={dividerStyle} />
                <ToggleItem
                  label="Mini Companion"
                  checked={settings.showMiniCompanion ?? true}
                  onChange={(checked) => {
                    updateSetting("showMiniCompanion", checked);
                    useAppStore.getState().setShowMiniCompanion(checked);
                  }}
                  desc="Show compact lyrics card above YouTube's miniplayer on homepage and search"
                />
              </div>

              {/* ─── Karaoke Mode Section ─── */}
              <div style={{ marginTop: "20px" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    marginBottom: "8px",
                  }}
                >
                  <MicVocal size={20} color="var(--lyrical-text-primary)" />
                  <h2 style={sectionTitleStyle}>Karaoke Mode</h2>
                </div>
                <p style={sectionDescriptionStyle}>
                  Overlay lyrics on the video player while watching.
                </p>

                <div style={sectionCardStyle}>
                  {/* Karaoke Toggle */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "14px",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontWeight: "600",
                          fontSize: "13px",
                          color: "var(--lyrical-text-primary)",
                        }}
                      >
                        Enable Karaoke
                      </div>
                      <div
                        style={{
                          fontSize: "11.5px",
                          color: "var(--lyrical-text-secondary)",
                          marginTop: "2px",
                        }}
                      >
                        Show lyrics over the YouTube video
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={settings.isKaraokeMode}
                      onClick={() =>
                        updateSetting("isKaraokeMode", !settings.isKaraokeMode)
                      }
                      style={{
                        position: "relative",
                        width: "40px",
                        height: "22px",
                        borderRadius: "999px",
                        border: "none",
                        cursor: "pointer",
                        background: settings.isKaraokeMode
                          ? "var(--lyrical-accent)"
                          : "var(--lyrical-card-bg-elevated)",
                        transition: "background 0.2s ease",
                        flexShrink: 0,
                      }}
                    >
                      <span
                        style={{
                          position: "absolute",
                          top: "2px",
                          left: settings.isKaraokeMode ? "20px" : "2px",
                          width: "18px",
                          height: "18px",
                          borderRadius: "999px",
                          background: settings.isKaraokeMode
                            ? "#fff"
                            : "var(--lyrical-text-secondary)",
                          transition: "left 0.2s ease",
                        }}
                      />
                    </button>
                  </div>

                  {/* Position Presets — shown only when karaoke is on */}
                  {settings.isKaraokeMode && (
                    <div style={{ marginTop: "16px" }}>
                      <div
                        style={{
                          fontWeight: "600",
                          fontSize: "13px",
                          color: "var(--lyrical-text-primary)",
                          marginBottom: "8px",
                        }}
                      >
                        Lyrics Position
                      </div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(4, 1fr)",
                          gap: "6px",
                        }}
                      >
                        {(
                          [
                            { id: "top", label: "Top", icon: <ArrowUpToLine size={15} /> },
                            { id: "bottom", label: "Bottom", icon: <ArrowDownToLine size={15} /> },
                            { id: "center", label: "Center", icon: <AlignCenterHorizontal size={15} /> },
                            { id: "custom", label: "Custom", icon: <Move size={15} /> },
                          ] as const
                        ).map((pos) => (
                          <button
                            key={pos.id}
                            type="button"
                            onClick={() =>
                              updateSetting("karaokePosition", pos.id)
                            }
                            style={{
                              padding: "8px 4px",
                              borderRadius: "8px",
                              border:
                                settings.karaokePosition === pos.id
                                  ? "1.5px solid var(--lyrical-accent)"
                                  : "1px solid var(--lyrical-border)",
                              background:
                                settings.karaokePosition === pos.id
                                  ? "var(--lyrical-accent-soft)"
                                  : "transparent",
                              cursor: "pointer",
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              gap: "4px",
                              transition: "all 0.18s ease",
                            }}
                          >
                            <span
                              style={{
                                color:
                                  settings.karaokePosition === pos.id
                                    ? "var(--lyrical-accent)"
                                    : "var(--lyrical-text-secondary)",
                              }}
                            >
                              {pos.icon}
                            </span>
                            <span
                              style={{
                                fontSize: "11px",
                                fontWeight: "600",
                                color:
                                  settings.karaokePosition === pos.id
                                    ? "var(--lyrical-accent)"
                                    : "var(--lyrical-text-secondary)",
                              }}
                            >
                              {pos.label}
                            </span>
                          </button>
                        ))}
                      </div>

                      {/* Custom Position Slider */}
                      {settings.karaokePosition === "custom" && (
                        <div style={{ marginTop: "12px" }}>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              marginBottom: "6px",
                            }}
                          >
                            <span
                              style={{
                                fontSize: "12px",
                                fontWeight: "500",
                                color: "var(--lyrical-text-secondary)",
                              }}
                            >
                              Vertical Position
                            </span>
                            <span
                              style={{
                                fontSize: "12px",
                                fontWeight: "600",
                                color: "var(--lyrical-accent)",
                                fontVariantNumeric: "tabular-nums",
                              }}
                            >
                              {settings.karaokeCustomPosition}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min={8}
                            max={88}
                            step={1}
                            value={settings.karaokeCustomPosition}
                            onChange={(e) =>
                              updateSetting(
                                "karaokeCustomPosition",
                                Number(e.target.value),
                              )
                            }
                            onPointerUp={(e) =>
                              flushKaraokePosition(Number(e.currentTarget.value))
                            }
                            onKeyUp={(e) =>
                              flushKaraokePosition(Number(e.currentTarget.value))
                            }
                            style={{
                              width: "100%",
                              accentColor: "var(--lyrical-accent)",
                              cursor: "pointer",
                            }}
                          />
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              fontSize: "10px",
                              color: "var(--lyrical-text-secondary)",
                              opacity: 0.7,
                              marginTop: "2px",
                            }}
                          >
                            <span>Top (8%)</span>
                            <span>Bottom (88%)</span>
                          </div>
                        </div>
                      )}

                      {/* Font Size Presets */}
                      <div style={{ marginTop: "16px" }}>
                        <div
                          style={{
                            fontWeight: "600",
                            fontSize: "13px",
                            color: "var(--lyrical-text-primary)",
                            marginBottom: "8px",
                          }}
                        >
                          Karaoke Font Size
                        </div>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(4, 1fr)",
                            gap: "6px",
                          }}
                        >
                          {(
                            [
                              { id: "small", label: "Small" },
                              { id: "medium", label: "Medium" },
                              { id: "large", label: "Large" },
                              { id: "xlarge", label: "X-Large" },
                            ] as const
                          ).map((sz) => (
                            <button
                              key={sz.id}
                              type="button"
                              onClick={() =>
                                updateSetting("karaokeFontSize", sz.id)
                              }
                              style={{
                                padding: "8px 4px",
                                borderRadius: "8px",
                                border:
                                  settings.karaokeFontSize === sz.id
                                    ? "1.5px solid var(--lyrical-accent)"
                                    : "1px solid var(--lyrical-border)",
                                background:
                                  settings.karaokeFontSize === sz.id
                                    ? "var(--lyrical-accent-soft)"
                                    : "transparent",
                                cursor: "pointer",
                                textAlign: "center",
                                transition: "all 0.18s ease",
                              }}
                            >
                              <span
                                style={{
                                  fontSize: "11px",
                                  fontWeight: "600",
                                  color:
                                    settings.karaokeFontSize === sz.id
                                      ? "var(--lyrical-accent)"
                                      : "var(--lyrical-text-secondary)",
                                }}
                              >
                                {sz.label}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Karaoke Animation Style (Classic vs Modern Gentle Spring) */}
                      <div style={{ marginTop: "16px" }}>
                        <div
                          style={{
                            fontWeight: "600",
                            fontSize: "13px",
                            color: "var(--lyrical-text-primary)",
                            marginBottom: "8px",
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                        >
                          <Sparkles size={14} color="var(--lyrical-accent)" />
                          Karaoke Lines Animation Engine
                        </div>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: "8px",
                          }}
                        >
                          {(
                            [
                              {
                                id: "classic",
                                label: "Classic",
                                desc: "Steady elevated highlight",
                                icon: <Layers size={14} />,
                              },
                              {
                                id: "modern",
                                label: "Modern (Gentle Spring)",
                                desc: "Dynamic spring bounce & glow",
                                icon: <Sparkles size={14} />,
                              },
                            ] as const
                          ).map((styleOpt) => {
                            const isSelected =
                              (settings.karaokeAnimationStyle || "classic") ===
                              styleOpt.id;
                            return (
                              <button
                                key={styleOpt.id}
                                type="button"
                                onClick={() =>
                                  updateSetting("karaokeAnimationStyle", styleOpt.id)
                                }
                                style={{
                                  padding: "10px 10px",
                                  borderRadius: "8px",
                                  border: isSelected
                                    ? "1.5px solid var(--lyrical-accent)"
                                    : "1px solid var(--lyrical-border)",
                                  background: isSelected
                                    ? "var(--lyrical-accent-soft)"
                                    : "transparent",
                                  cursor: "pointer",
                                  display: "flex",
                                  flexDirection: "column",
                                  alignItems: "flex-start",
                                  textAlign: "left",
                                  gap: "3px",
                                  transition: "all 0.18s ease",
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "5px",
                                    color: isSelected
                                      ? "var(--lyrical-accent)"
                                      : "var(--lyrical-text-primary)",
                                    fontSize: "11.5px",
                                    fontWeight: "600",
                                  }}
                                >
                                  {styleOpt.icon}
                                  <span>{styleOpt.label}</span>
                                </div>
                                <span
                                  style={{
                                    fontSize: "10px",
                                    color: "var(--lyrical-text-secondary)",
                                    lineHeight: "1.3",
                                    opacity: isSelected ? 0.95 : 0.7,
                                  }}
                                >
                                  {styleOpt.desc}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Real-time Vocal Removal Toggle */}
                      <div
                        style={{
                          marginTop: "16px",
                          paddingTop: "14px",
                          borderTop: "1px solid var(--lyrical-border-soft)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "14px",
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontWeight: "600",
                              fontSize: "13px",
                              color: "var(--lyrical-text-primary)",
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                            }}
                          >
                            <MicOff size={14} color="var(--lyrical-accent)" />
                            Mute Vocals (Instrumental)
                          </div>
                          <div
                            style={{
                              fontSize: "11.5px",
                              color: "var(--lyrical-text-secondary)",
                              marginTop: "2px",
                              lineHeight: "1.35",
                            }}
                          >
                            Suppresses center lead vocals in real time so you can sing along
                          </div>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={settings.isVocalMuted}
                          onClick={() =>
                            updateSetting("isVocalMuted", !settings.isVocalMuted)
                          }
                          style={{
                            position: "relative",
                            width: "40px",
                            height: "22px",
                            borderRadius: "999px",
                            border: "none",
                            cursor: "pointer",
                            background: settings.isVocalMuted
                              ? "var(--lyrical-accent)"
                              : "var(--lyrical-card-bg-elevated)",
                            transition: "background 0.2s ease",
                            flexShrink: 0,
                          }}
                        >
                          <span
                            style={{
                              position: "absolute",
                              top: "2px",
                              left: settings.isVocalMuted ? "20px" : "2px",
                              width: "18px",
                              height: "18px",
                              borderRadius: "999px",
                              background: settings.isVocalMuted
                                ? "#fff"
                                : "var(--lyrical-text-secondary)",
                              transition: "left 0.2s ease",
                            }}
                          />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === "themes" && (
            <div className="animate-fade-in">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  marginBottom: "8px",
                }}
              >
                <Palette size={20} color="var(--lyrical-text-primary)" />
                <h2 style={sectionTitleStyle}>
                  {t("settings_themes_title")}
                </h2>
              </div>
              <p style={sectionDescriptionStyle}>
                {t("settings_themes_description")}
              </p>

              <div style={sectionCardStyle}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "16px",
                    marginBottom: "18px",
                  }}
                >
                  <div
                    style={{
                      flex: "1 1 auto",
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        fontSize: "14px",
                        fontWeight: "600",
                        color: "var(--lyrical-text-primary)",
                        marginBottom: "6px",
                      }}
                    >
                      {t("settings_theme_label")}
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "var(--lyrical-text-muted)",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {t("settings_theme_byAuthor", [
                        currentThemeName,
                        currentTheme.author,
                      ])}
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: "10px",
                      flex: "0 0 auto",
                      alignItems: "stretch",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <button
                      type="button"
                      onClick={openCreateCustomThemeModal}
                      style={{
                        padding: "10px 16px",
                        borderRadius: "12px",
                        border: "1px solid var(--lyrical-border)",
                        background: "var(--lyrical-panel-surface-soft)",
                        color: "var(--lyrical-text-primary)",
                        fontSize: "14px",
                        fontWeight: "600",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {t("settings_theme_createCustom")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsThemeModalOpen(true)}
                      style={{
                        padding: "10px 16px",
                        borderRadius: "12px",
                        border: "1px solid var(--lyrical-border)",
                        background: "var(--lyrical-card-bg-elevated)",
                        color: "var(--lyrical-text-primary)",
                        fontSize: "14px",
                        fontWeight: "600",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {t("settings_theme_choose")}
                    </button>
                  </div>
                </div>

                {(() => {
                  const isDynamicTheme = currentTheme.id === "dynamic";
                  const activeThemeTokens =
                    isDynamicTheme && dynamicThemeTokens
                      ? dynamicThemeTokens
                      : currentTheme.tokens;
                  return (
                    <div
                      style={{
                        borderRadius: "16px",
                        overflow: "hidden",
                        border: isDynamicTheme
                          ? `1px solid ${activeThemeTokens["--lyrical-accent-strong"] || "var(--lyrical-border)"}`
                          : "1px solid var(--lyrical-border)",
                        background: "var(--lyrical-panel-surface-soft)",
                        transition: "all 0.25s ease",
                      }}
                    >
                      <div
                        style={{
                          height: "116px",
                          background:
                            activeThemeTokens["--lyrical-panel-bg"] ||
                            currentTheme.tokens["--lyrical-panel-bg"],
                          position: "relative",
                          transition: "background 0.5s ease",
                        }}
                      >
                        {/* Artwork Preview (if dynamic and artwork available) */}
                        {isDynamicTheme && dynamicArtworkUrl && (
                          <div
                            style={{
                              position: "absolute",
                              top: "16px",
                              left: "18px",
                              width: "44px",
                              height: "44px",
                              borderRadius: "12px",
                              backgroundImage: `url("${dynamicArtworkUrl}")`,
                              backgroundSize: "cover",
                              backgroundPosition: "center",
                              backgroundColor:
                                activeThemeTokens["--lyrical-panel-surface-soft"],
                              border: `1px solid ${activeThemeTokens["--lyrical-border"]}`,
                              boxShadow: "0 8px 18px rgba(0, 0, 0, 0.24)",
                            }}
                          />
                        )}

                        {/* Dynamic Slider Scrubber Swatch */}
                        <div
                          style={{
                            position: "absolute",
                            right: "18px",
                            bottom: "22px",
                            width: "72px",
                            height: "8px",
                            borderRadius: "999px",
                            background:
                              activeThemeTokens["--lyrical-slider-gradient"],
                            boxShadow: `0 0 10px ${activeThemeTokens["--lyrical-accent-glow"] || "transparent"}`,
                          }}
                        />

                        <div
                          style={{
                            position: "absolute",
                            left: "18px",
                            bottom: "18px",
                            padding: "6px 12px",
                            borderRadius: "999px",
                            background: isDynamicTheme
                              ? activeThemeTokens["--lyrical-accent-soft"] ||
                                "rgba(62,166,255,0.15)"
                              : activeThemeTokens[
                                  "--lyrical-panel-surface-soft"
                                ],
                            color: isDynamicTheme
                              ? activeThemeTokens["--lyrical-accent"] ||
                                "#3ea6ff"
                              : activeThemeTokens["--lyrical-text-primary"],
                            border: `1px solid ${isDynamicTheme ? activeThemeTokens["--lyrical-accent-strong"] || activeThemeTokens["--lyrical-border"] : activeThemeTokens["--lyrical-border"]}`,
                            fontSize: "12px",
                            fontWeight: "700",
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                        >
                          {isDynamicTheme && (
                            <Sparkles
                              size={13}
                              style={{
                                color:
                                  activeThemeTokens["--lyrical-accent"] ||
                                  "#3ea6ff",
                              }}
                            />
                          )}
                          {t("settings_theme_active")}
                        </div>
                      </div>
                      <div style={{ padding: "16px" }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: "16px",
                            marginBottom: "8px",
                          }}
                        >
                          <div
                            style={{
                              fontSize: "18px",
                              fontWeight: "700",
                              color: "var(--lyrical-text-primary)",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "8px",
                            }}
                          >
                            {isDynamicTheme && (
                              <Sparkles
                                size={16}
                                style={{
                                  color:
                                    activeThemeTokens["--lyrical-accent"] ||
                                    "#3ea6ff",
                                }}
                              />
                            )}
                            {currentThemeName}
                          </div>
                          <div
                            style={{
                              fontSize: "12px",
                              color: isDynamicTheme
                                ? activeThemeTokens["--lyrical-accent"] ||
                                  "var(--lyrical-accent)"
                                : "var(--lyrical-accent)",
                              fontWeight: "700",
                              letterSpacing: "0.08em",
                              textTransform: "uppercase",
                            }}
                          >
                            {currentTheme.isCustom
                              ? t("common_custom")
                              : t("common_preset")}
                          </div>
                        </div>
                        <p
                          style={{
                            margin: 0,
                            fontSize: "13px",
                            lineHeight: "1.6",
                            color: "var(--lyrical-text-muted)",
                          }}
                        >
                          {currentThemeDescription}
                        </p>
                      </div>
                    </div>
                  );
                })()}

                <div
                  style={{
                    marginTop: "14px",
                    padding: "12px",
                    borderRadius: "14px",
                    border: "1px solid var(--lyrical-border-soft)",
                    background:
                      "var(--lyrical-panel-surface-soft, rgba(255,255,255,0.05))",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "12px",
                    flexWrap: "nowrap",
                  }}
                >
                  <div
                    style={{
                      flex: "1 1 auto",
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        fontSize: "13px",
                        fontWeight: 700,
                        color: "var(--lyrical-text-primary)",
                        marginBottom: "3px",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {t("settings_theme_library")}
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "var(--lyrical-text-muted)",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {t("settings_theme_customSaved", [
                        String(customThemes.length),
                      ])}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: "8px",
                      flex: "0 0 auto",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setIsThemeImportModalOpen(true)}
                      style={{
                        minHeight: "36px",
                        padding: "8px 12px",
                        borderRadius: "10px",
                        border: "1px solid var(--lyrical-border)",
                        background: "var(--lyrical-card-bg-elevated)",
                        color: "var(--lyrical-text-primary)",
                        fontSize: "13px",
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "8px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <Upload size={14} />
                      {t("common_import")}
                    </button>
                    <button
                      type="button"
                      onClick={exportAllCustomThemes}
                      disabled={customThemes.length === 0}
                      style={{
                        minHeight: "36px",
                        padding: "8px 12px",
                        borderRadius: "10px",
                        border: "1px solid var(--lyrical-border)",
                        background: "var(--lyrical-panel-surface-soft)",
                        color:
                          customThemes.length === 0
                            ? "var(--lyrical-text-subtle)"
                            : "var(--lyrical-text-primary)",
                        fontSize: "13px",
                        fontWeight: 700,
                        cursor:
                          customThemes.length === 0 ? "not-allowed" : "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "8px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <Download size={14} />
                      {t("common_export")}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Language Tab */}
          {activeTab === "language" && (
            <div className="animate-fade-in">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  marginBottom: "8px",
                }}
              >
                <Languages size={20} color="var(--lyrical-text-primary)" />
                <h2 style={sectionTitleStyle}>
                  {t("settings_language_title")}
                </h2>
              </div>
              <p style={sectionDescriptionStyle}>
                {t("settings_language_description")}
              </p>

              <div style={sectionCardStyle}>
                <ToggleItem
                  label={t("settings_language_romanization")}
                  checked={settings.romanization}
                  onChange={(v) => updateSetting("romanization", v)}
                  desc={t("settings_language_romanizationDesc")}
                />
                <div style={dividerStyle} />
                <ToggleItem
                  label={t("settings_language_autoTranslate")}
                  checked={settings.autoTranslate}
                  onChange={(v) => updateSetting("autoTranslate", v)}
                  desc={t("settings_language_autoTranslateDesc")}
                />
                <div style={{ marginTop: "16px" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "13px",
                      color: "var(--lyrical-text-primary)",
                      marginBottom: "8px",
                      fontWeight: "500",
                    }}
                  >
                    {t("settings_language_translationLanguage")}
                  </label>
                  <select
                    value={settings.translationLang}
                    onChange={(e) =>
                      updateSetting("translationLang", e.target.value)
                    }
                    style={inputStyle}
                  >
                    {AVAILABLE_LANGUAGES.map((lang) => (
                      <option key={lang.code} value={lang.code}>
                        {lang.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={dividerStyle} />
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: "16px",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: "14px",
                        fontWeight: "600",
                        color: "var(--lyrical-text-primary)",
                      }}
                    >
                      {t("settings_language_exclusions")}
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "var(--lyrical-text-muted)",
                        marginTop: "4px",
                      }}
                    >
                      {t("settings_language_exclusionsDesc")}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsExclusionsModalOpen(true)}
                    style={{
                      background: "var(--lyrical-card-bg-elevated)",
                      color: "var(--lyrical-text-primary)",
                      border: "1px solid var(--lyrical-border)",
                      padding: "8px 14px",
                      borderRadius: "10px",
                      fontSize: "13px",
                      fontWeight: "600",
                      cursor: "pointer",
                      transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background =
                        "var(--lyrical-panel-surface, rgba(255,255,255,0.1))";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background =
                        "var(--lyrical-card-bg-elevated, #27272a)";
                    }}
                  >
                    {t("common_manage")}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Sources Tab */}
          {activeTab === "sources" && (
            <div className="animate-fade-in">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  marginBottom: "8px",
                }}
              >
                <Layers size={20} color="var(--lyrical-text-primary)" />
                <h2 style={sectionTitleStyle}>
                  {t("settings_sources_title")}
                </h2>
              </div>
              <p style={sectionDescriptionStyle}>
                {t("settings_sources_description")}
              </p>

              <div
                style={{
                  ...sectionCardStyle,
                  padding: "0 16px",
                }}
              >
                <SourcePreferenceList />
              </div>
            </div>
          )}

          {/* About Tab */}
          {activeTab === "about" && (
            <div className="animate-fade-in">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  marginBottom: "8px",
                }}
              >
                <Info size={20} color="var(--lyrical-text-primary)" />
                <h2 style={sectionTitleStyle}>{t("settings_about_title")}</h2>
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  textAlign: "center",
                  paddingTop: "40px",
                }}
              >
                <img
                  src={chrome.runtime.getURL("icon128.png")}
                  alt={t("popup_logoAlt")}
                  style={{
                    width: "80px",
                    height: "80px",
                    marginBottom: "16px",
                    borderRadius: "50%",
                    boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
                  }}
                />
                <h3
                  style={{
                    margin: "0 0 8px 0",
                    color: "var(--lyrical-text-primary)",
                    fontSize: "24px",
                    fontWeight: "700",
                  }}
                >
                  Lyrical
                </h3>
                <p
                  style={{
                    margin: "0 0 24px 0",
                    color: "var(--lyrical-text-secondary)",
                    fontSize: "14px",
                    lineHeight: "1.5",
                  }}
                >
                  {t("settings_about_description")
                    .split("\n")
                    .map((line, index) => (
                      <Fragment key={line}>
                        {index > 0 && <br />}
                        {line}
                      </Fragment>
                    ))}
                </p>
                <div
                  style={{
                    display: "inline-block",
                    padding: "4px 12px",
                    background: "var(--lyrical-card-bg-elevated)",
                    borderRadius: "20px",
                    fontSize: "12px",
                    color: "var(--lyrical-text-primary)",
                  }}
                >
                  {t("settings_about_version")}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      {isLyricsSizeModalOpen && (
        <div
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsLyricsSizeModalOpen(false);
            }
          }}
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            background: "rgba(0, 0, 0, 0.42)",
            backdropFilter: "blur(10px)",
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Lyrics typography presets"
            style={{
              width: "min(100%, 460px)",
              maxHeight: "100%",
              overflowY: "auto",
              background: "var(--lyrical-panel-bg)",
              border: "1px solid var(--lyrical-border)",
              borderRadius: "18px",
              boxShadow: "0 24px 80px rgba(0, 0, 0, 0.48)",
              padding: "18px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "16px",
                marginBottom: "16px",
              }}
            >
              <div>
                <h3
                  style={{
                    margin: 0,
                    color: "var(--lyrical-text-primary)",
                    fontSize: "18px",
                    fontWeight: "750",
                  }}
                >
                  Lyrics Typography
                </h3>
                <p
                  style={{
                    margin: "5px 0 0",
                    color: "var(--lyrical-text-muted)",
                    fontSize: "13px",
                    lineHeight: 1.45,
                  }}
                >
                  Choose how strongly the current lyric line should stand out.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsLyricsSizeModalOpen(false)}
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "10px",
                  border: "1px solid var(--lyrical-border-soft)",
                  background: "var(--lyrical-card-bg-elevated)",
                  color: "var(--lyrical-text-primary)",
                  cursor: "pointer",
                  fontSize: "18px",
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr",
                gap: "10px",
              }}
            >
              {LYRICS_SIZE_PRESETS.map((preset) => {
                const isActive = settings.lyricsSizePreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => updateSetting("lyricsSizePreset", preset.id)}
                    style={{
                      padding: "14px",
                      borderRadius: "14px",
                      border: isActive
                        ? "1px solid var(--lyrical-accent)"
                        : "1px solid var(--lyrical-border-soft)",
                      background: isActive
                        ? "var(--lyrical-accent-soft)"
                        : "var(--lyrical-card-bg)",
                      color: "var(--lyrical-text-primary)",
                      cursor: "pointer",
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      gap: "12px",
                      textAlign: "left",
                      boxShadow: isActive
                        ? "inset 0 1px 0 rgba(255, 255, 255, 0.08)"
                        : "none",
                      transition:
                        "border-color 0.18s ease, background 0.18s ease, transform 0.18s ease",
                    }}
                  >
                    <span style={{ minWidth: 0 }}>
                      <span
                        style={{
                          display: "block",
                          fontSize: "14px",
                          fontWeight: "700",
                          marginBottom: "4px",
                        }}
                      >
                        {preset.label}
                      </span>
                      <span
                        style={{
                          display: "block",
                          color: "var(--lyrical-text-muted)",
                          fontSize: "12px",
                          lineHeight: 1.4,
                        }}
                      >
                        {preset.description}
                      </span>
                    </span>
                    <span
                      style={{
                        alignSelf: "start",
                        borderRadius: "999px",
                        padding: "4px 9px",
                        fontSize: "12px",
                        fontWeight: "700",
                        color: isActive
                          ? "var(--lyrical-accent)"
                          : "var(--lyrical-text-secondary)",
                        background: "var(--lyrical-panel-surface-soft)",
                        border: "1px solid var(--lyrical-border-soft)",
                      }}
                    >
                      {preset.activeSize}
                    </span>
                  </button>
                );
              })}
            </div>

            <div
              style={{
                marginTop: "14px",
                padding: "14px",
                borderRadius: "14px",
                background: "var(--lyrical-panel-surface)",
                border: "1px solid var(--lyrical-border-soft)",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  color: "var(--lyrical-text-primary)",
                  fontSize: currentLyricsSizePreset.activeSize,
                  fontWeight: "800",
                  lineHeight: 1.25,
                  transition: "font-size 0.18s ease",
                }}
              >
                乗り越えて進め
              </div>
              <div
                style={{
                  display: "inline-block",
                  marginTop: "8px",
                  padding: "4px 10px",
                  borderRadius: "999px",
                  color: "var(--lyrical-romanized)",
                  background:
                    "color-mix(in srgb, var(--lyrical-romanized) 16%, transparent)",
                  border:
                    "1px solid color-mix(in srgb, var(--lyrical-romanized) 22%, transparent)",
                  fontSize: "13px",
                  fontWeight: "700",
                }}
              >
                norikoete susume
              </div>
              <div
                style={{
                  marginTop: "8px",
                  color: "var(--lyrical-translated)",
                  fontSize: "13px",
                  fontWeight: "650",
                  lineHeight: 1.35,
                }}
              >
                Cross over it and move forward
              </div>
            </div>
          </div>
        </div>
      )}
      <ThemeSelectionModal
        isOpen={isThemeModalOpen}
        onClose={() => setIsThemeModalOpen(false)}
        selectedThemeId={themeId}
        onSelectTheme={(nextThemeId) => updateSetting("themeId", nextThemeId)}
        customThemes={customThemes}
        onEditCustomTheme={openEditCustomThemeModal}
        onDeleteCustomTheme={deleteCustomTheme}
        onExportCustomTheme={exportCustomTheme}
      />
      <CustomThemeModal
        isOpen={isCustomThemeModalOpen}
        onClose={() => {
          setIsCustomThemeModalOpen(false);
          setEditingCustomThemeId(null);
        }}
        onSaveTheme={saveCustomTheme}
        seedTheme={editingCustomTheme || currentTheme}
        mode={editingCustomTheme ? "edit" : "create"}
      />
      <ThemeImportExportModal
        isOpen={isThemeImportModalOpen}
        onClose={() => setIsThemeImportModalOpen(false)}
        onImportThemes={importCustomThemes}
        existingThemes={customThemeRecords}
      />
      <CacheEditorView
        isOpen={isCacheEditorOpen}
        onClose={() => setIsCacheEditorOpen(false)}
        onCacheChange={refreshCacheInfo}
      />
      <LanguageExclusionsModal
        isOpen={isExclusionsModalOpen}
        onClose={() => setIsExclusionsModalOpen(false)}
        romanizationExclusions={settings.romanizationExclusions}
        translationExclusions={settings.translationExclusions}
        onUpdateExclusions={(newExclusions) => {
          updateSetting("romanizationExclusions", newExclusions.romanization);
          updateSetting("translationExclusions", newExclusions.translation);
        }}
      />
      <FloatingLyricsModal
        isOpen={isFloatingLyricsModalOpen}
        onClose={() => setIsFloatingLyricsModalOpen(false)}
      />
    </div>
  );
};

// Helper Component (Same as before)
const ToggleItem = ({ label, checked, onChange, desc }) => (
  <div style={{ marginBottom: "0" }}>
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "4px",
      }}
    >
      <span
        style={{
          fontSize: "14px",
          fontWeight: "500",
          color: "var(--lyrical-text-primary, #fff)",
        }}
      >
        {label}
      </span>
      <div
        onClick={() => onChange(!checked)}
        style={{
          width: "44px",
          height: "24px",
          background: checked
            ? "var(--lyrical-accent, #3ea6ff)"
            : "var(--lyrical-card-bg-elevated, #3f3f46)",
          borderRadius: "12px",
          position: "relative",
          cursor: "pointer",
          transition: "background 0.2s",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "2px",
            left: checked ? "22px" : "2px",
            width: "20px",
            height: "20px",
            background: "var(--lyrical-text-primary, white)",
            borderRadius: "50%",
            transition: "left 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
            boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
          }}
        />
      </div>
    </div>
    {desc && (
      <p
        style={{
          margin: 0,
          fontSize: "12px",
          color: "var(--lyrical-text-muted, #71717a)",
        }}
      >
        {desc}
      </p>
    )}
  </div>
);

export default SettingsContent;
