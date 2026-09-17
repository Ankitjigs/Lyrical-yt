import React, { useMemo, useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Languages,
  Minus,
  MicVocal,
  Plus,
  RotateCcw,
  Type,
} from "lucide-react";
import { useAppStore, DEFAULT_SOURCE_PREFERENCES } from "../store";
import { Tooltip } from "../../components/ui/Tooltip";
import { SyncTypeIcon } from "../../components/ui/SyncTypeIcon";
import type {
  CaptionTrackInfo,
  LyricsSourceId,
  SourcePreference,
} from "../../types/lyrics";
import { useShallow } from "zustand/react/shallow";

const PLATFORM_OFFSET = -0.45;
const OFFSET_STEP = 0.1;
const OFFSET_STEP_LARGE = 0.5;

const SOURCE_LABELS: Record<string, string> = {
  lyrical: "Lyrical",
  better_lyrics: "Better Lyrics",
  "musixmatch-richsync": "Musixmatch",
  musixmatch: "Musixmatch",
  "youlyplus-richsynced": "YouLy+",
  "youlyplus-synced": "YouLy+",
  "bLyrics-synced": "Better Lyrics",
  "unison-richsynced": "Better Lyrics Unison",
  "unison-synced": "Better Lyrics Unison",
  "unison-plain": "Better Lyrics Unison",
  "binimum-richsynced": "BiniLyrics",
  "binimum-synced": "BiniLyrics",
  "portato-richsynced": "Better Lyrics Portato",
  "legato-synced": "Better Lyrics Legato",
  "musixmatch-synced": "Musixmatch",
  captions: "YouTube Captions",
  lrclib: "LRCLib",
};

const DOCK_SHORT_LABELS: Record<string, string> = {
  lyrical: "Lyrical",
  better_lyrics: "Better Lyrics",
  "musixmatch-richsync": "Musixmatch",
  musixmatch: "Musixmatch",
  "youlyplus-richsynced": "YouLy+",
  "youlyplus-synced": "YouLy+",
  "bLyrics-synced": "Better Lyrics",
  "unison-richsynced": "Unison",
  "unison-synced": "Unison",
  "unison-plain": "Unison",
  "binimum-richsynced": "BiniLyrics",
  "binimum-synced": "BiniLyrics",
  "portato-richsynced": "Portato",
  "legato-synced": "Legato",
  "musixmatch-synced": "Musixmatch",
  captions: "Captions",
  lrclib: "LRCLib",
};

function normalizeSourceId(
  sourceId: LyricsSourceId | null | undefined,
): LyricsSourceId | null {
  if (!sourceId) return null;
  if (sourceId === "musixmatch-richsync") return "musixmatch";
  return sourceId;
}

function sourceOptionFor(sourceId: LyricsSourceId, prefs: SourcePreference[]) {
  return (
    prefs.find((source) => source.id === sourceId) ||
    DEFAULT_SOURCE_PREFERENCES.find((source) => source.id === sourceId) || {
      id: sourceId,
      label: SOURCE_LABELS[sourceId] || String(sourceId),
      enabled: true,
      tags: [],
    }
  );
}

function formatOffset(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}s`;
}

function clampOffset(value: number) {
  return Math.max(-120, Math.min(120, Math.round(value * 10) / 10));
}

type LyricsDockProps = {
  activeSource: LyricsSourceId | null;
  availableSources: LyricsSourceId[];
  hasTranslated: boolean;
  hasRomanized: boolean;
  showResumeAutoscroll: boolean;
  onResumeAutoscroll: () => void;
};

export default function LyricsDock({
  activeSource,
  availableSources,
  hasTranslated,
  hasRomanized,
  showResumeAutoscroll,
  onResumeAutoscroll,
}: LyricsDockProps) {
  const { isKaraokeMode, setKaraokeMode } = useAppStore(
    useShallow((state) => ({
      isKaraokeMode: state.isKaraokeMode,
      setKaraokeMode: state.setKaraokeMode,
    })),
  );
  const {
    sourcePreferences,
    userOffset,
    isTranslateEnabled,
    isRomanizationEnabled,
    isLoading,
    reduceAnimations,
    lyrics,
    availableCaptionTracks,
    selectedCaptionTrackId,
    captionLanguageLabel,
  } = useAppStore(
    useShallow((state) => ({
      sourcePreferences: state.sourcePreferences,
      userOffset: state.userOffset,
      isTranslateEnabled: state.isTranslateEnabled,
      isRomanizationEnabled: state.isRomanizationEnabled,
      isLoading: state.isLoading,
      reduceAnimations: state.reduceAnimations,
      lyrics: state.lyrics,
      availableCaptionTracks: state.availableCaptionTracks,
      selectedCaptionTrackId: state.selectedCaptionTrackId,
      captionLanguageLabel: state.captionLanguageLabel,
    })),
  );
  const [isOffsetOpen, setIsOffsetOpen] = useState(false);
  const [isSourceMenuOpen, setIsSourceMenuOpen] = useState(false);
  const [hoveredSourceId, setHoveredSourceId] = useState<string | null>(null);
  const sourceMenuRef = useRef<HTMLDivElement>(null);
  const sourcePillRef = useRef<HTMLButtonElement>(null);

  const activePreferenceId = normalizeSourceId(activeSource);
  const hasLyrics = Array.isArray(lyrics) && lyrics.length > 0;

  const sourceOptions = useMemo(() => {
    if (!hasLyrics && !isLoading) {
      return [];
    }

    const ids = new Set<LyricsSourceId>();
    for (const source of availableSources) {
      const normalized = normalizeSourceId(source);
      if (normalized) ids.add(normalized);
    }
    if (activePreferenceId) ids.add(activePreferenceId);

    const prefOrder = new Map(sourcePreferences.map((s, idx) => [s.id, idx]));

    return Array.from(ids)
      .map((id) => sourceOptionFor(id, sourcePreferences))
      .filter((source) => source.enabled)
      .sort((a, b) => {
        const orderA = prefOrder.has(a.id) ? prefOrder.get(a.id)! : 999;
        const orderB = prefOrder.has(b.id) ? prefOrder.get(b.id)! : 999;
        return orderA - orderB;
      });
  }, [
    activePreferenceId,
    availableSources,
    sourcePreferences,
    hasLyrics,
    isLoading,
  ]);

  const activeIndex = Math.max(
    0,
    sourceOptions.findIndex((source) => source.id === activePreferenceId),
  );
  const activeOption = sourceOptions[activeIndex] || null;
  const canCycleSources = hasLyrics && sourceOptions.length > 1;
  const canOpenMenu = hasLyrics && sourceOptions.length > 0;

  let displayName = "No source";
  let tooltipContent = "No lyrics source available";

  if (isLoading) {
    displayName = "Searching...";
    tooltipContent = "Searching for lyrics...";
  } else if (hasLyrics && activeOption) {
    if (activeOption.id === "captions") {
      let shortLang = (captionLanguageLabel || "EN").trim().toUpperCase();
      const codeMap: Record<string, string> = {
        ENGLISH: "EN",
        JAPANESE: "JA",
        SPANISH: "ES",
        FRENCH: "FR",
        GERMAN: "DE",
        HINDI: "HI",
        KOREAN: "KO",
        CHINESE: "ZH",
        RUSSIAN: "RU",
        ITALIAN: "IT",
        PORTUGUESE: "PT",
      };
      if (codeMap[shortLang]) {
        shortLang = codeMap[shortLang];
      } else if (shortLang.length > 4 && !shortLang.includes(" ")) {
        shortLang = shortLang.slice(0, 2);
      }
      displayName = `Captions (${shortLang})`;
      tooltipContent = `Click to pick source • YouTube Captions (${shortLang}) (${activeIndex + 1}/${sourceOptions.length || 1})`;
    } else {
      displayName = DOCK_SHORT_LABELS[activeOption.id] || activeOption.label;
      tooltipContent = `Click to pick source • ${activeOption.label} (${activeIndex + 1}/${sourceOptions.length || 1})`;
    }
  }

  useEffect(() => {
    if (!isSourceMenuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const path = event.composedPath ? event.composedPath() : [];
      const isInsideMenu =
        (sourceMenuRef.current && sourceMenuRef.current.contains(target)) ||
        (sourceMenuRef.current && path.includes(sourceMenuRef.current));
      const isInsidePill =
        (sourcePillRef.current && sourcePillRef.current.contains(target)) ||
        (sourcePillRef.current && path.includes(sourcePillRef.current));

      if (!isInsideMenu && !isInsidePill) {
        setIsSourceMenuOpen(false);
        setHoveredSourceId(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsSourceMenuOpen(false);
        setHoveredSourceId(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSourceMenuOpen]);

  const selectSource = (index: number) => {
    if (!canCycleSources) return;
    const nextIndex =
      (index + sourceOptions.length) % Math.max(sourceOptions.length, 1);
    const nextSource = sourceOptions[nextIndex];
    if (!nextSource || nextSource.id === activePreferenceId) return;

    window.dispatchEvent(
      new CustomEvent("lyrical-select-source", {
        detail: { sourceId: nextSource.id },
      }),
    );
  };

  const selectSourceById = (sourceId: LyricsSourceId) => {
    setIsSourceMenuOpen(false);
    setHoveredSourceId(null);
    if (sourceId === activePreferenceId) return;
    window.dispatchEvent(
      new CustomEvent("lyrical-select-source", {
        detail: { sourceId },
      }),
    );
  };

  const selectCaptionTrack = (track: CaptionTrackInfo) => {
    setIsSourceMenuOpen(false);
    setHoveredSourceId(null);
    window.dispatchEvent(
      new CustomEvent("lyrical-select-caption-track", {
        detail: { track },
      }),
    );
  };

  const updateOffset = (nextValue: number) => {
    const nextUserOffset = clampOffset(nextValue);
    useAppStore
      .getState()
      .setOffset(PLATFORM_OFFSET + nextUserOffset, nextUserOffset);
  };

  const nudgeOffset = (delta: number) => updateOffset(userOffset + delta);

  const toggleSetting = (
    key: "isTranslateEnabled" | "isRomanizationEnabled",
  ) => {
    const current =
      key === "isTranslateEnabled" ? isTranslateEnabled : isRomanizationEnabled;
    const next = !current;
    useAppStore.setState({ [key]: next });
  };

  const sourceTag = activeOption?.tags?.[0] || "LINE";

  return (
    <div className="lyrical-dock-wrap">
      <motion.div
        className="lyrical-dock"
        data-sync-type={sourceTag.toLowerCase()}
        layout={!reduceAnimations}
        transition={{ type: "spring", stiffness: 520, damping: 38 }}
      >
        <div className="lyrical-dock-source">
          {canCycleSources && (
            <Tooltip content="Previous available source" align="left">
              <button
                className="lyrical-dock-icon lyrical-dock-cycle"
                type="button"
                onClick={() => selectSource(activeIndex - 1)}
                aria-label="Previous lyrics source"
              >
                <ChevronLeft size={14} />
              </button>
            </Tooltip>
          )}

          <Tooltip content={tooltipContent} align="left">
            <motion.button
              ref={sourcePillRef}
              className={`lyrical-dock-source-pill ${!canOpenMenu ? "disabled" : ""}`}
              type="button"
              layout={!reduceAnimations}
              disabled={!canOpenMenu}
              aria-disabled={!canOpenMenu}
              onClick={(e) => {
                e.stopPropagation();
                if (!canOpenMenu) return;
                setIsSourceMenuOpen((prev) => !prev);
              }}
              aria-label="Current lyrics source picker"
              aria-expanded={isSourceMenuOpen}
            >
              <SyncTypeIcon type={hasLyrics ? sourceTag : "LINE"} />
              <span className="lyrical-dock-source-name">{displayName}</span>
              {hasLyrics && activeOption && sourceOptions.length > 0 && (
                <span className="lyrical-dock-source-count">
                  {activeIndex + 1}/{sourceOptions.length || 1}
                </span>
              )}
            </motion.button>
          </Tooltip>

          {canCycleSources && (
            <Tooltip content="Next available source" align="center">
              <button
                className="lyrical-dock-icon lyrical-dock-cycle"
                type="button"
                onClick={() => selectSource(activeIndex + 1)}
                aria-label="Next lyrics source"
              >
                <ChevronRight size={14} />
              </button>
            </Tooltip>
          )}

          <AnimatePresence>
            {isSourceMenuOpen && (
              <motion.div
                ref={sourceMenuRef}
                className="lyrical-dock-source-menu"
                initial={{ opacity: 0, y: 6, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.95 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                {sourceOptions.map((source) => {
                  const isSelected = source.id === activePreferenceId;
                  const tag = (source.tags?.[0] || "LINE").toLowerCase();
                  const isCaptions = source.id === "captions";
                  const hasMultipleCaptionTracks =
                    isCaptions && availableCaptionTracks.length > 1;

                  return (
                    <div
                      key={source.id}
                      className="lyrical-dock-source-item-wrap"
                      onMouseEnter={() => {
                        if (hasMultipleCaptionTracks) {
                          setHoveredSourceId("captions");
                        } else {
                          setHoveredSourceId(null);
                        }
                      }}
                      onMouseLeave={() => {
                        if (isCaptions) {
                          setHoveredSourceId(null);
                        }
                      }}
                    >
                      <button
                        type="button"
                        data-sync-type={tag}
                        className={`lyrical-dock-source-menu-item ${
                          isSelected ? "active" : ""
                        }`}
                        onPointerDown={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          selectSourceById(source.id);
                        }}
                      >
                        <span className="lyrical-dock-source-menu-icon">
                          <SyncTypeIcon type={tag} />
                        </span>
                        <span className="lyrical-dock-source-menu-label">
                          {source.label}
                        </span>
                        {hasMultipleCaptionTracks && (
                          <span className="lyrical-dock-source-chevron">
                            <ChevronRight size={13} />
                          </span>
                        )}
                      </button>

                      <AnimatePresence>
                        {isCaptions &&
                          hoveredSourceId === "captions" &&
                          hasMultipleCaptionTracks && (
                            <motion.div
                              className="lyrical-dock-source-submenu"
                              initial={{ opacity: 0, x: -6, scale: 0.96 }}
                              animate={{ opacity: 1, x: 0, scale: 1 }}
                              exit={{ opacity: 0, x: -6, scale: 0.96 }}
                              transition={{ duration: 0.14, ease: "easeOut" }}
                              onPointerDown={(e) => e.stopPropagation()}
                              onMouseDown={(e) => e.stopPropagation()}
                            >
                              {availableCaptionTracks.map((track, idx) => {
                                const trackLang = (track.languageCode || "").split("-")[0].toLowerCase();
                                const selectedLang = selectedCaptionTrackId
                                  ? selectedCaptionTrackId.replace(/^[a.]/, "").split("-")[0].toLowerCase()
                                  : null;
                                const activeLabelClean = (captionLanguageLabel || "")
                                  .replace(/^CAPTIONS\s*\(/i, "")
                                  .replace(/\)$/, "")
                                  .trim()
                                  .toLowerCase();
                                const isCurrentAsr = activeLabelClean.includes("auto");
                                const currentActiveLang = activeLabelClean.replace(/\(auto\)/i, "").trim();

                                const hasExactIdMatch = availableCaptionTracks.some(
                                  (t) => t.vssId === selectedCaptionTrackId,
                                );
                                const isTrackActive = hasExactIdMatch
                                  ? selectedCaptionTrackId === track.vssId
                                  : (selectedCaptionTrackId && selectedLang === trackLang && Boolean(track.isAsr) === (selectedCaptionTrackId.includes("asr") || selectedCaptionTrackId.startsWith("a."))) ||
                                    (currentActiveLang && (trackLang === currentActiveLang || track.name.toLowerCase().startsWith(currentActiveLang) || currentActiveLang.startsWith(trackLang)) && Boolean(track.isAsr) === isCurrentAsr) ||
                                    (!selectedCaptionTrackId && !currentActiveLang && idx === 0);
                                return (
                                  <button
                                    key={track.vssId || track.url}
                                    type="button"
                                    className={`lyrical-dock-source-submenu-item ${
                                      isTrackActive ? "active" : ""
                                    }`}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      selectCaptionTrack(track);
                                    }}
                                  >
                                    <span className="lyrical-dock-source-menu-label">
                                      {track.name}
                                    </span>
                                    {isTrackActive && (
                                      <Check
                                        size={12}
                                        className="lyrical-dock-submenu-check"
                                      />
                                    )}
                                  </button>
                                );
                              })}
                            </motion.div>
                          )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <span className="lyrical-dock-divider" />

        <Tooltip
          content={
            hasTranslated
              ? isTranslateEnabled
                ? "Hide translated lyrics"
                : "Show translated lyrics"
              : "No translated lyrics loaded"
          }
          align="center"
        >
          <button
            className="lyrical-dock-icon"
            type="button"
            data-toggle="translate"
            data-active={isTranslateEnabled && hasTranslated ? "true" : "false"}
            disabled={!hasTranslated}
            onClick={() => toggleSetting("isTranslateEnabled")}
            aria-label="Toggle translated lyrics"
            aria-pressed={isTranslateEnabled}
          >
            <Languages size={16} />
          </button>
        </Tooltip>

        <Tooltip
          content={
            hasRomanized
              ? isRomanizationEnabled
                ? "Hide romanized lyrics"
                : "Show romanized lyrics"
              : "No romanized lyrics loaded"
          }
          align="center"
        >
          <button
            className="lyrical-dock-icon"
            type="button"
            data-toggle="romanize"
            data-active={
              isRomanizationEnabled && hasRomanized ? "true" : "false"
            }
            disabled={!hasRomanized}
            onClick={() => toggleSetting("isRomanizationEnabled")}
            aria-label="Toggle romanized lyrics"
            aria-pressed={isRomanizationEnabled}
          >
            <Type size={16} />
          </button>
        </Tooltip>

        <Tooltip
          content={isKaraokeMode ? "Exit karaoke mode" : "Start karaoke mode"}
          align="center"
        >
          <button
            className="lyrical-dock-icon"
            type="button"
            data-active={isKaraokeMode ? "true" : "false"}
            onClick={() => setKaraokeMode(!isKaraokeMode)}
            aria-label="Toggle karaoke mode"
            aria-pressed={isKaraokeMode}
          >
            <MicVocal size={16} />
          </button>
        </Tooltip>

        <span className="lyrical-dock-divider" />

        <div className="lyrical-dock-offset">
          <Tooltip content="Sync offset slider" align="right">
            <button
              className="lyrical-dock-icon"
              type="button"
              data-active={isOffsetOpen ? "true" : "false"}
              onClick={() => setIsOffsetOpen((value) => !value)}
              aria-label="Open sync offset"
              aria-expanded={isOffsetOpen}
            >
              <Clock3 size={16} />
            </button>
          </Tooltip>

          <Tooltip
            content="Lyrics earlier (-0.1s, Shift for -0.5s)"
            align="right"
          >
            <button
              className="lyrical-dock-step"
              type="button"
              onClick={(event) =>
                nudgeOffset(event.shiftKey ? -OFFSET_STEP_LARGE : -OFFSET_STEP)
              }
              aria-label="Lyrics earlier"
            >
              <Minus size={14} />
            </button>
          </Tooltip>

          <motion.span
            key={formatOffset(userOffset)}
            className="lyrical-dock-offset-value"
            initial={reduceAnimations ? false : { y: -6, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.18 }}
            aria-live="polite"
          >
            {formatOffset(userOffset)}
          </motion.span>

          <Tooltip
            content="Lyrics later (+0.1s, Shift for +0.5s)"
            align="right"
          >
            <button
              className="lyrical-dock-step"
              type="button"
              onClick={(event) =>
                nudgeOffset(event.shiftKey ? OFFSET_STEP_LARGE : OFFSET_STEP)
              }
              aria-label="Lyrics later"
            >
              <Plus size={14} />
            </button>
          </Tooltip>

          <AnimatePresence>
            {isOffsetOpen && (
              <motion.div
                className="lyrical-dock-popover"
                initial={
                  reduceAnimations ? false : { opacity: 0, y: -8, scale: 0.96 }
                }
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={
                  reduceAnimations
                    ? { opacity: 0 }
                    : { opacity: 0, y: -6, scale: 0.98 }
                }
                transition={{ duration: 0.16 }}
              >
                <div className="lyrical-dock-popover-row">
                  <span>Lyrics Sync</span>
                  <strong>{formatOffset(userOffset)}</strong>
                </div>
                <input
                  className="lyrical-sync-slider"
                  type="range"
                  min="-120"
                  max="120"
                  step="0.5"
                  value={userOffset}
                  onChange={(event) =>
                    updateOffset(parseFloat(event.currentTarget.value))
                  }
                  onKeyDown={(event) => event.stopPropagation()}
                  aria-label="Lyrics sync offset"
                />
                <div className="lyrical-dock-popover-scale">
                  <span>-2min</span>
                  <button type="button" onClick={() => updateOffset(0)}>
                    <RotateCcw size={13} />
                    Reset
                  </button>
                  <span>+2min</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      <AnimatePresence>
        {showResumeAutoscroll && (
          <motion.button
            className="lyrical-resume-autoscroll"
            type="button"
            onClick={onResumeAutoscroll}
            initial={reduceAnimations ? false : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceAnimations ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
          >
            Resume Autoscroll
          </motion.button>
        )}
      </AnimatePresence>

      {isLoading && <span className="lyrical-dock-loading" />}
    </div>
  );
}
