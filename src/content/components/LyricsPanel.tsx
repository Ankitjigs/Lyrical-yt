import React, { useEffect, useRef, useState, useMemo } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useAppStore } from "../store";
import {
  ChevronDown,
  X,
  Music,
  Settings,
  ArrowLeft,
  HelpCircle,
  Globe,
  Type,
} from "lucide-react";
import ShinyText from "./ShinyText";
import { useLyricsEngine } from "../../hooks/useLyricsEngine";
import { createInstrumentalElement } from "../../modules/animations/createInstrumentalElement";
import { Tooltip } from "../../components/ui/Tooltip";
import { getThemeCssVariables } from "../../themes";
import { useShallow } from "zustand/react/shallow";
import { t } from "../../i18n";
import LyricsDock from "./LyricsDock";

const GeniusIcon = ({ size = 14 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 1024 1024"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={{ borderRadius: "50%", flexShrink: 0, display: "block" }}
  >
    <path
      d="M1026 512C1026 794.77 796.77 1024 514 1024C231.23 1024 2 794.77 2 512C2 229.23 231.23 0 514 0C796.77 0 1026 229.23 1026 512Z"
      fill="#F6F069"
    />
    <path
      d="M772.152 469.327C771.919 456.018 770.519 442.863 768.343 429.786C759.869 380.417 739.035 336.851 706.618 298.702C703.276 294.756 699.777 290.964 696.124 287.25C693.869 284.929 690.993 284.696 688.739 286.244C686.562 287.714 685.94 289.958 686.873 293.131C687.106 293.905 687.417 294.601 687.65 295.298C700.088 328.339 706.463 362.464 706.696 397.75C706.385 404.173 706.074 410.595 705.763 417.018C704.83 434.583 702.032 451.839 697.601 468.786C683.375 523.339 655.855 570.232 614.343 608.536C560.237 658.446 495.947 684.137 422.251 686.226C403.671 686.768 385.247 685.22 366.979 682.048C348.322 678.875 330.053 673.923 312.406 667.113C308.519 665.643 305.799 666.339 304.244 669.048C302.689 671.601 303.311 674 306.343 676.863C308.908 679.262 311.473 681.583 314.117 683.905C364.802 727.625 423.806 750.143 490.739 752.077C506.908 752.542 523.078 751.304 539.092 748.673C596.774 739.387 647.148 714.857 688.739 674C745.799 617.976 773.707 549.494 772.152 469.327Z"
      fill="black"
    />
    <path
      d="M328.265 544.542C330.519 542.839 330.908 540.595 329.664 536.804C329.509 536.417 329.431 536.107 329.276 535.72C319.636 508.637 316.915 480.78 321.035 452.381C326.477 415.006 342.413 382.661 368.378 355.268C370.477 353.024 371.488 350.78 371.488 347.685C371.41 338.012 371.41 328.339 371.41 318.667C371.41 309.149 371.41 299.554 371.41 290.036C371.41 283.845 369.544 281.911 363.325 281.911C344.124 281.911 325 281.911 305.799 281.833C302.611 281.833 300.046 282.762 297.792 284.929C265.919 315.804 248.972 353.488 246.329 397.518C245.318 414.31 247.261 430.946 251.615 447.274C262.498 487.976 285.509 520.089 320.413 543.768C323.912 546.167 325.933 546.321 328.265 544.542Z"
      fill="black"
    />
    <path
      d="M434.534 423.208C439.276 458.494 472.781 483.411 508.074 477.762C539.403 472.732 562.18 446.19 562.18 414.542C562.18 408.196 562.18 401.929 562.18 395.583C562.18 387.304 562.18 379.101 562.18 370.821C562.18 365.56 563.58 364.244 568.866 364.167C573.763 364.089 578.739 364.244 583.636 364.089C588.145 363.935 590.166 361.226 589.389 356.893C589.233 356.119 589.155 355.345 589 354.649C583.092 329.81 572.364 307.369 556.816 287.095C553.94 283.381 550.753 281.988 546.244 282.065C533.184 282.22 520.124 282.065 506.986 282.143C505.587 282.143 504.11 282.22 502.71 282.452C499.445 282.994 497.968 284.542 497.502 287.792C497.346 289.03 497.424 290.345 497.424 291.661C497.424 311.935 497.424 332.131 497.424 352.405C497.424 360.762 495.792 368.81 492.371 376.47C482.265 398.601 464.774 410.905 440.675 414.155C435.622 414.851 434.145 416.476 434.378 421.429C434.456 421.893 434.456 422.589 434.534 423.208Z"
      fill="black"
    />
  </svg>
);

const GeniusSearchPill = ({
  artist,
  title,
  variant = "footer",
}: {
  artist?: string;
  title?: string;
  variant?: "footer" | "emptyState";
}) => {
  const handleSearch = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rawQuery = `${artist || ""} ${title || ""}`.trim();
    if (rawQuery) {
      const geniusSearchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(`!ducky site:genius.com ${rawQuery}`)}`;
      window.open(geniusSearchUrl, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <button
      type="button"
      onClick={handleSearch}
      title="Search song lyrics & annotations on Genius"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        padding: variant === "emptyState" ? "6px 14px" : "3.5px 10px",
        borderRadius: "9999px",
        background: "color-mix(in srgb, #F6F069 12%, transparent)",
        border: "1px solid color-mix(in srgb, #F6F069 26%, transparent)",
        color: "#F6F069",
        fontSize: variant === "emptyState" ? "12.5px" : "11px",
        fontWeight: 600,
        letterSpacing: "0.2px",
        cursor: "pointer",
        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
        outline: "none",
        textDecoration: "none",
        backdropFilter: "blur(6px)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background =
          "color-mix(in srgb, #F6F069 22%, transparent)";
        e.currentTarget.style.borderColor =
          "color-mix(in srgb, #F6F069 55%, transparent)";
        e.currentTarget.style.transform = "translateY(-1px)";
        e.currentTarget.style.boxShadow =
          "0 4px 12px color-mix(in srgb, #F6F069 20%, transparent)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background =
          "color-mix(in srgb, #F6F069 12%, transparent)";
        e.currentTarget.style.borderColor =
          "color-mix(in srgb, #F6F069 26%, transparent)";
        e.currentTarget.style.transform = "none";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <GeniusIcon size={variant === "emptyState" ? 15 : 13} />
      <span>Search on Genius</span>
    </button>
  );
};

const LYRICS_TYPOGRAPHY_PRESETS = {
  compact: {
    compact: {
      activeOriginal: "15px",
      inactiveOriginal: "13.5px",
      engineFontSize: "15px",
      secondary: "11.5px",
      contentPadding: "10px",
      linePadding: "7px 8px",
      lineGap: "5px",
      lineMargin: "9px 0",
      activeMinHeight: "36px",
      instrumentalMinHeight: "34px",
      romanizedPadding: "3px 8px",
    },
    expanded: {
      activeOriginal: "16.5px",
      inactiveOriginal: "14.5px",
      engineFontSize: "16.5px",
      secondary: "12px",
      contentPadding: "14px",
      linePadding: "8px 10px",
      lineGap: "6px",
      lineMargin: "13px 0",
      activeMinHeight: "44px",
      instrumentalMinHeight: "40px",
      romanizedPadding: "3px 9px",
    },
  },
  standard: {
    compact: {
      activeOriginal: "16.5px",
      inactiveOriginal: "14.5px",
      engineFontSize: "16.5px",
      secondary: "12px",
      contentPadding: "10px",
      linePadding: "8px 8px",
      lineGap: "6px",
      lineMargin: "12px 0",
      activeMinHeight: "40px",
      instrumentalMinHeight: "36px",
      romanizedPadding: "3px 9px",
    },
    expanded: {
      activeOriginal: "18.5px",
      inactiveOriginal: "15.5px",
      engineFontSize: "18.5px",
      secondary: "13px",
      contentPadding: "14px 12px",
      linePadding: "10px 10px",
      lineGap: "7px",
      lineMargin: "15px 0",
      activeMinHeight: "50px",
      instrumentalMinHeight: "44px",
      romanizedPadding: "4px 10px",
    },
  },
  large: {
    compact: {
      activeOriginal: "17.5px",
      inactiveOriginal: "15px",
      engineFontSize: "17.5px",
      secondary: "12.5px",
      contentPadding: "10px",
      linePadding: "8px 8px",
      lineGap: "6px",
      lineMargin: "13px 0",
      activeMinHeight: "44px",
      instrumentalMinHeight: "40px",
      romanizedPadding: "4px 10px",
    },
    expanded: {
      activeOriginal: "20.5px",
      inactiveOriginal: "16.5px",
      engineFontSize: "20.5px",
      secondary: "13.5px",
      contentPadding: "14px 10px",
      linePadding: "11px 10px",
      lineGap: "8px",
      lineMargin: "16px 0",
      activeMinHeight: "56px",
      instrumentalMinHeight: "48px",
      romanizedPadding: "4px 11px",
    },
  },
  cinematic: {
    compact: {
      activeOriginal: "19px",
      inactiveOriginal: "16px",
      engineFontSize: "19px",
      secondary: "13px",
      contentPadding: "9px",
      linePadding: "9px 8px",
      lineGap: "7px",
      lineMargin: "14px 0",
      activeMinHeight: "48px",
      instrumentalMinHeight: "42px",
      romanizedPadding: "4px 10px",
    },
    expanded: {
      activeOriginal: "22px",
      inactiveOriginal: "17.5px",
      engineFontSize: "22px",
      secondary: "14.5px",
      contentPadding: "14px 8px",
      linePadding: "12px 10px",
      lineGap: "9px",
      lineMargin: "18px 0",
      activeMinHeight: "62px",
      instrumentalMinHeight: "52px",
      romanizedPadding: "5px 12px",
    },
  },
} as const;

const getLyricsTypography = (
  preset: keyof typeof LYRICS_TYPOGRAPHY_PRESETS | undefined,
  compactMode: boolean,
) => {
  const selectedPreset =
    LYRICS_TYPOGRAPHY_PRESETS[preset || "standard"] ||
    LYRICS_TYPOGRAPHY_PRESETS.standard;
  return selectedPreset[compactMode ? "compact" : "expanded"];
};

const SECONDARY_TIME_TOLERANCE_SECONDS = 0.12;

function pickFirstTextValue(item: any, keys: string[]) {
  if (!item) return "";

  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function timedRomanizationToText(timedRomanization: any) {
  if (!Array.isArray(timedRomanization)) return "";

  return timedRomanization
    .map((part) => String(part?.text ?? part?.words ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

function findClosestSecondaryLine(
  sourceLines: any[],
  line: any,
  usedIndexes: Set<number>,
) {
  const targetTime = Number(line?.time);
  if (!Number.isFinite(targetTime)) return null;

  let bestIndex = -1;
  let bestDelta = Number.POSITIVE_INFINITY;

  sourceLines.forEach((item, index) => {
    if (usedIndexes.has(index)) return;

    const candidateTime = Number(item?.time);
    if (!Number.isFinite(candidateTime)) return;

    const delta = Math.abs(candidateTime - targetTime);
    if (delta <= SECONDARY_TIME_TOLERANCE_SECONDS && delta < bestDelta) {
      bestIndex = index;
      bestDelta = delta;
    }
  });

  if (bestIndex < 0) return null;

  usedIndexes.add(bestIndex);
  return sourceLines[bestIndex];
}

function alignSecondaryLyrics(lyrics: any[] = [], sourceLines: any[] = []) {
  const usedRomanizedIndexes = new Set<number>();
  const usedTranslatedIndexes = new Set<number>();

  return lyrics.reduce(
    (acc, line, index) => {
      const direct = sourceLines[index];
      const timedRomanization =
        direct?.timedRomanization || direct?.timedRomanized || null;
      const directRomanized =
        pickFirstTextValue(direct, ["romanized", "romanization", "romaji"]) ||
        timedRomanizationToText(timedRomanization);
      const directTranslated = pickFirstTextValue(direct, [
        "translated",
        "translation",
        "translatedText",
      ]);

      let romanizedSource = directRomanized ? direct : null;
      let translatedSource = directTranslated ? direct : null;

      if (romanizedSource && index < sourceLines.length) {
        usedRomanizedIndexes.add(index);
      } else {
        romanizedSource = findClosestSecondaryLine(
          sourceLines,
          line,
          usedRomanizedIndexes,
        );
      }

      if (translatedSource && index < sourceLines.length) {
        usedTranslatedIndexes.add(index);
      } else {
        translatedSource = findClosestSecondaryLine(
          sourceLines,
          line,
          usedTranslatedIndexes,
        );
      }

      const matchedTimedRomanization =
        romanizedSource?.timedRomanization ||
        romanizedSource?.timedRomanized ||
        line?.timedRomanization ||
        null;
      const romanized =
        pickFirstTextValue(romanizedSource, [
          "romanized",
          "romanization",
          "romaji",
        ]) || timedRomanizationToText(matchedTimedRomanization);
      const translated = pickFirstTextValue(translatedSource, [
        "translated",
        "translation",
        "translatedText",
      ]);

      acc.romanizedLyrics.push({
        time: line?.time,
        text: line?.text,
        romanized,
        timedRomanization: matchedTimedRomanization,
      });
      acc.translatedLyrics.push({
        time: line?.time,
        text: line?.text,
        translated,
      });

      return acc;
    },
    { romanizedLyrics: [], translatedLyrics: [] } as {
      romanizedLyrics: any[];
      translatedLyrics: any[];
    },
  );
}

function hasDisplayableSecondaryText(
  lines: any[],
  key: "romanized" | "translated",
) {
  return lines.some((line) => {
    const value = line?.[key];
    return typeof value === "string" && value.trim().length > 0;
  });
}

const ImperativeLyricsHost = React.memo(
  ({ resetKey }: { resetKey: string }) => {
    return (
      <div
        id="blyrics-root"
        style={{
          position: "relative",
          width: "100%",
          transition: "transform 260ms ease",
        }}
      />
    );
  },
  (prev, next) => prev.resetKey === next.resetKey,
);

const LyricsPanel = () => {
  const {
    songInfo,
    lyrics,
    lyricsSource, // Get source from store
    availableLyricsSources,
    rawTranslatedLyrics,
    rawRomanizedLyrics,
    isTranslateEnabled,
    isRomanizationEnabled,
    activeIndex, // Note: activeIndex is from store (synced by main.jsx timer).
    isExpanded,
    headerText,
    setExpanded,
    offset, // Total offset
    userOffset,
    isLoading,
    isProcessingLyrics,
    compactMode,
    lyricsSizePreset,
    lyricsLanguage,
    reduceAnimations,
    showCollapsedArtwork,
    displayMode,
    themeId,
    customThemes,
  } = useAppStore(
    useShallow((state) => ({
      songInfo: state.songInfo,
      lyrics: state.lyrics,
      lyricsSource: state.lyricsSource,
      availableLyricsSources: state.availableLyricsSources,
      rawTranslatedLyrics: state.translatedLyrics,
      rawRomanizedLyrics: state.romanizedLyrics,
      isTranslateEnabled: state.isTranslateEnabled,
      isRomanizationEnabled: state.isRomanizationEnabled,
      activeIndex: state.activeIndex,
      isExpanded: state.isExpanded,
      headerText: state.headerText,
      setExpanded: state.setExpanded,
      offset: state.offset,
      userOffset: state.userOffset,
      isLoading: state.isLoading,
      isProcessingLyrics: state.isProcessingLyrics,
      compactMode: state.compactMode,
      lyricsSizePreset: state.lyricsSizePreset,
      lyricsLanguage: state.lyricsLanguage,
      reduceAnimations: state.reduceAnimations,
      showCollapsedArtwork: state.showCollapsedArtwork,
      displayMode: state.displayMode,
      themeId: state.themeId,
      customThemes: state.customThemes,
    })),
  );
  const themeVars = getThemeCssVariables(themeId, customThemes);
  const lyricsTypography = getLyricsTypography(lyricsSizePreset, compactMode);
  const alignedRomanizedLyrics = useMemo(
    () =>
      alignSecondaryLyrics(
        lyrics || [],
        (Array.isArray(rawRomanizedLyrics) ? rawRomanizedLyrics : []) as any[],
      ).romanizedLyrics,
    [lyrics, rawRomanizedLyrics],
  );
  const alignedTranslatedLyrics = useMemo(
    () =>
      alignSecondaryLyrics(
        lyrics || [],
        (Array.isArray(rawTranslatedLyrics)
          ? rawTranslatedLyrics
          : []) as any[],
      ).translatedLyrics,
    [lyrics, rawTranslatedLyrics],
  );

  const translatedLyrics = isTranslateEnabled ? alignedTranslatedLyrics : [];
  const romanizedLyrics = isRomanizationEnabled ? alignedRomanizedLyrics : [];

  const hasRomanized = hasDisplayableSecondaryText(
    alignedRomanizedLyrics,
    "romanized",
  );
  const hasTranslated = hasDisplayableSecondaryText(
    alignedTranslatedLyrics,
    "translated",
  );
  const hasLyrics = Boolean(lyrics && lyrics.length > 0);
  const engineExtraData = useMemo(
    () => ({ romanizedLyrics, translatedLyrics }),
    [romanizedLyrics, translatedLyrics],
  );
  const seekToLyricTime = (time: number | undefined) => {
    if (typeof time !== "number" || Number.isNaN(time) || time < 0) return;

    const video = document.querySelector("video");
    if (!video) return;

    video.currentTime = time;
    void video.play?.();
  };
  const getAdjustedVideoTime = () => {
    const video = document.querySelector("video");
    return video ? video.currentTime + offset : null;
  };

  // Floating panel dragging
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const hasDraggedRef = useRef(false);

  const handlePointerDownHeader = (e: React.PointerEvent<HTMLDivElement>) => {
    if (displayMode !== "floating") return;
    if (e.button !== 0) return; // Left click only
    const target = e.target as HTMLElement;
    if (
      target.closest(
        "button, input, select, svg, .lyrical-btn, a, .lyrical-dock",
      )
    )
      return;

    const wrapper = document.getElementById("lyrical-panel-wrapper");
    if (!wrapper) return;

    e.preventDefault(); // Prevent text selection / native drag delay

    const rect = wrapper.getBoundingClientRect();
    isDraggingRef.current = true;
    hasDraggedRef.current = false;
    setIsDragging(true);

    const startPointerX = e.clientX;
    const startPointerY = e.clientY;
    const startLeft = rect.left;
    const startTop = rect.top;

    // Normalize wrapper to exact fixed top/left coordinates immediately
    wrapper.style.position = "fixed";
    wrapper.style.right = "auto";
    wrapper.style.left = `${startLeft}px`;
    wrapper.style.top = `${startTop}px`;
    wrapper.style.transform = "none";
    wrapper.style.transition = "none";
    wrapper.style.willChange = "transform";
    document.body.style.userSelect = "none";

    let currentDeltaX = 0;
    let currentDeltaY = 0;
    let rafId = 0;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const rawDeltaX = moveEvent.clientX - startPointerX;
      const rawDeltaY = moveEvent.clientY - startPointerY;

      if (Math.abs(rawDeltaX) > 2 || Math.abs(rawDeltaY) > 2) {
        hasDraggedRef.current = true;
      }

      const panelWidth = wrapper.offsetWidth || 402;
      const minLeft = 10;
      const maxLeft = Math.max(10, window.innerWidth - panelWidth - 10);
      const minTop = 10;
      const maxTop = Math.max(10, window.innerHeight - 80);

      const targetLeft = Math.max(
        minLeft,
        Math.min(maxLeft, startLeft + rawDeltaX),
      );
      const targetTop = Math.max(
        minTop,
        Math.min(maxTop, startTop + rawDeltaY),
      );

      currentDeltaX = targetLeft - startLeft;
      currentDeltaY = targetTop - startTop;

      if (!rafId) {
        rafId = requestAnimationFrame(() => {
          rafId = 0;
          if (!isDraggingRef.current) return;
          wrapper.style.transform = `translate3d(${currentDeltaX}px, ${currentDeltaY}px, 0)`;
        });
      }
    };

    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("pointercancel", onPointerUp, true);

      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }

      isDraggingRef.current = false;
      setIsDragging(false);
      document.body.style.userSelect = "";

      const finalLeft = Math.round(startLeft + currentDeltaX);
      const finalTop = Math.round(startTop + currentDeltaY);

      wrapper.style.transform = "none";
      wrapper.style.willChange = "auto";
      wrapper.style.left = `${finalLeft}px`;
      wrapper.style.top = `${finalTop}px`;
      wrapper.style.right = "auto";

      const finalPos = { top: finalTop, left: finalLeft };
      useAppStore.setState({ floatingCustomPosition: finalPos });
      if (chrome?.storage?.sync) {
        chrome.storage.sync.set({ floatingCustomPosition: finalPos });
      }
    };

    window.addEventListener("pointermove", onPointerMove, {
      capture: true,
      passive: true,
    });
    window.addEventListener("pointerup", onPointerUp, {
      capture: true,
      once: true,
    });
    window.addEventListener("pointercancel", onPointerUp, {
      capture: true,
      once: true,
    });
  };

  // Determine Strategy
  // If source is Better Lyrics or Musixmatch or Lyrical, enable animation engine
  const shouldUseAnimationEngine =
    lyricsSource === "better_lyrics" ||
    lyricsSource === "musixmatch" ||
    lyricsSource === "musixmatch-richsync" ||
    lyricsSource === "lyrical" ||
    lyricsSource === "unison-richsynced" ||
    lyricsSource === "binimum-richsynced" ||
    lyricsSource === "portato-richsynced" ||
    lyricsSource === "youlyplus-richsynced";

  let strategyName = "line";
  if (shouldUseAnimationEngine) {
    if (
      lyricsSource === "musixmatch" ||
      lyricsSource === "musixmatch-richsync"
    ) {
      strategyName = "word";
    } else if (
      lyricsSource === "lyrical" ||
      lyricsSource === "unison-richsynced" ||
      lyricsSource === "binimum-richsynced" ||
      lyricsSource === "youlyplus-richsynced"
    ) {
      strategyName = "syllable";
    } else if (lyricsSource === "portato-richsynced") {
      strategyName = "word";
    } else {
      strategyName = "better";
    }
  }

  // Refs for scrolling
  const contentRef = useRef(null);

  // User-scroll-pause for legacy/line-mode auto-scroll
  const [legacyScrollPaused, setLegacyScrollPaused] = useState(false);
  const [showResumeAutoscroll, setShowResumeAutoscroll] = useState(false);
  const legacyScrollTimerRef = useRef(null);
  const lastLegacyActiveIndexRef = useRef(-1);

  // Hook into Animation Engine
  // We need to pass currentTime. But we only have activeIndex from store.
  // main.jsx has the video logic.
  // Ideally, useLyricsEngine should listen to video time if possible?
  // Or we pass a dummy time?
  // BetterLyricsStrategy calculates position based on TIME.
  // If we only have activeIndex, BetterStrategy won't work well (it needs time for physics).

  // WORKAROUND: We need access to video time here?
  // `LyricsPanel` is in the same context as `main.jsx`.
  // We can't easily subscribe to video time in React without re-renders.
  // `useLyricsEngine` handles `requestAnimationFrame` which is good.
  // But it needs a base time.
  // main.jsx *already* has a `videoEventListeners` loop.
  // Maybe we rely on the `animationFrame` loop in `useLyricsEngine` to read `document.querySelector('video').currentTime`?

  // Let's modify useLyricsEngine to accept a `getTime` function instead of prop?
  // Or just reading it inside the strategy update since we are in Content Script context!

  // Track Playing State for Engine
  const [isPlaying, setIsPlaying] = useState(false);
  const [collapsedPreviewTime, setCollapsedPreviewTime] = useState(0);
  const [videoSessionKey, setVideoSessionKey] = useState(0);
  const activeVideoRef = useRef(null);
  const isPlayingRef = useRef(false);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    if (isExpanded || !lyrics || lyrics.length === 0) return;

    let rafId: number;
    let lastSetTime = -1;
    const tick = () => {
      const video = document.querySelector("video");
      if (video) {
        // Use - offset (matching ImperativeBetterStrategy and BetterLyricsStrategy)
        const t = video.currentTime - offset;
        // Only trigger re-render when time changed by > 16ms (≈60fps cap)
        if (Math.abs(t - lastSetTime) > 0.016) {
          lastSetTime = t;
          setCollapsedPreviewTime(t);
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isExpanded, lyrics, offset]);

  useEffect(() => {
    const onPlay = () => {
      isPlayingRef.current = true;
      setIsPlaying(true);
    };
    const onPause = () => {
      isPlayingRef.current = false;
      setIsPlaying(false);
    };
    const detachVideoListeners = (video) => {
      if (!video) return;
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
    };
    const attachVideo = (nextVideo) => {
      if (activeVideoRef.current === nextVideo) return;

      detachVideoListeners(activeVideoRef.current);
      activeVideoRef.current = nextVideo;

      if (!nextVideo) {
        isPlayingRef.current = false;
        setIsPlaying(false);
        return;
      }

      nextVideo.addEventListener("play", onPlay);
      nextVideo.addEventListener("pause", onPause);

      const nextIsPlaying = !nextVideo.paused;
      isPlayingRef.current = nextIsPlaying;
      setIsPlaying(nextIsPlaying);
      setVideoSessionKey((value) => value + 1);
    };

    const syncVideo = () => {
      attachVideo(document.querySelector("video"));
    };

    const scheduleSync = () => {
      queueMicrotask(syncVideo);
    };

    syncVideo();

    const observer = new MutationObserver(() => {
      scheduleSync();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const handleNavigation = () => {
      scheduleSync();
      window.setTimeout(syncVideo, 250);
    };

    window.addEventListener("yt-navigate-finish", handleNavigation);
    window.addEventListener("popstate", handleNavigation);

    return () => {
      detachVideoListeners(activeVideoRef.current);
      activeVideoRef.current = null;
      observer.disconnect();
      window.removeEventListener("yt-navigate-finish", handleNavigation);
      window.removeEventListener("popstate", handleNavigation);
    };
  }, []);

  const engineResetKey = useMemo(() => {
    const videoId = new URLSearchParams(window.location.search).get("v") || "";
    const title = songInfo?.title || "";
    const artist = songInfo?.artist || "";
    return `${lyricsSource || "none"}|${videoId}|${title}|${artist}|${videoSessionKey}|${reduceAnimations ? "reduced" : "full"}`;
  }, [
    lyricsSource,
    songInfo?.artist,
    songInfo?.title,
    reduceAnimations,
    videoSessionKey,
  ]);

  const { strategy, setIsUserScrolled } = useLyricsEngine(
    strategyName,
    lyrics,
    { isPlaying, offset }, // Pass total offset (base + user)
    contentRef,
    engineExtraData,
    engineResetKey,
  );

  useEffect(() => {
    if (
      !shouldUseAnimationEngine ||
      !strategy?.isImperative ||
      !strategy.updateSecondaryLyrics
    ) {
      return;
    }

    const nextExtraData = { romanizedLyrics, translatedLyrics };
    const rafId = requestAnimationFrame(() => {
      strategy.updateSecondaryLyrics(nextExtraData);
    });
    const timeoutId = window.setTimeout(() => {
      strategy.updateSecondaryLyrics(nextExtraData);
    }, 80);

    return () => {
      cancelAnimationFrame(rafId);
      window.clearTimeout(timeoutId);
    };
  }, [shouldUseAnimationEngine, strategy, romanizedLyrics, translatedLyrics]);

  // Invalidate scroll layout when compact mode toggles
  // The container height changes, so cached line positions become stale
  const prevCompactModeRef = useRef(compactMode);
  const strategyRef = useRef(strategy);
  strategyRef.current = strategy;
  useEffect(() => {
    if (prevCompactModeRef.current === compactMode) return;
    prevCompactModeRef.current = compactMode;

    // Imperative strategy: invalidate cached layout and force re-scroll
    if (strategyRef.current?.invalidateLayout) {
      strategyRef.current.invalidateLayout(400); // Match the CSS transition duration
    }

    // Legacy/line mode: reset scroll state so it recalculates positions
    setLegacyScrollPaused(false);
    setShowResumeAutoscroll(false);
    setIsUserScrolled(false);
    lastLegacyActiveIndexRef.current = -1;
  }, [compactMode]);

  // User scroll detection - pause auto-scroll when user manually scrolls
  // Tracks a programmatic scroll flag for legacy mode
  const legacyProgrammaticScrollRef = useRef(false);
  const userGestureTimeRef = useRef(0);

  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;

    let scrollDebounceTimer: any = null;
    let lastScrollTop = container.scrollTop;

    const markUserGesture = () => {
      userGestureTimeRef.current = Date.now();
    };

    container.addEventListener("wheel", markUserGesture, { passive: true });
    container.addEventListener("touchmove", markUserGesture, { passive: true });
    container.addEventListener("pointerdown", markUserGesture, {
      passive: true,
    });
    container.addEventListener("keydown", markUserGesture, { passive: true });

    const handleScroll = () => {
      const isDirectUserGesture =
        Date.now() - userGestureTimeRef.current < 1000;

      // If this scroll was NOT initiated by direct user physical interaction, ignore it!
      if (!isDirectUserGesture) {
        lastScrollTop = container.scrollTop;
        return;
      }

      // Ignore programmatic scrolls for animation engine strategies
      if (strategy?.wasRecentProgrammaticScroll?.()) {
        lastScrollTop = container.scrollTop;
        return;
      }

      // Ignore programmatic scrolls for legacy/line mode
      if (legacyProgrammaticScrollRef.current) {
        lastScrollTop = container.scrollTop;
        return;
      }

      // A sudden jump to exactly 0 is almost certainly the hook resetting the scroll container!
      if (
        container.scrollTop === 0 &&
        Math.abs(container.scrollTop - lastScrollTop) > 50
      ) {
        console.log(
          "[Lyrical] Ignoring sudden jump to 0 (likely reset mechanism)",
        );
        lastScrollTop = container.scrollTop;
        return;
      }

      // Check if scroll amount is significant (> 10px) to filter noise
      const scrollDelta = Math.abs(container.scrollTop - lastScrollTop);
      if (scrollDelta < 10) {
        return;
      }
      lastScrollTop = container.scrollTop;

      // Debounce: Only trigger pause once per scroll gesture
      if (scrollDebounceTimer) {
        clearTimeout(scrollDebounceTimer);
      }

      scrollDebounceTimer = setTimeout(() => {
        // Pause animation engine strategy auto-scroll
        if (strategy?.pauseAutoScroll) {
          strategy.pauseAutoScroll(24 * 60 * 60 * 1000);
        }

        // Pause legacy/line-mode auto-scroll until the user explicitly resumes.
        // This pauses BOTH the LineStrategy.update() scroll (via isUserScrolled)
        // AND the legacy useEffect scroll (via legacyScrollPaused)
        setLegacyScrollPaused(true);
        setShowResumeAutoscroll(true);
        setIsUserScrolled(true);
        if (legacyScrollTimerRef.current) {
          clearTimeout(legacyScrollTimerRef.current);
        }

        scrollDebounceTimer = null;
      }, 100);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      container.removeEventListener("scroll", handleScroll);
      container.removeEventListener("wheel", markUserGesture);
      container.removeEventListener("touchmove", markUserGesture);
      container.removeEventListener("pointerdown", markUserGesture);
      container.removeEventListener("keydown", markUserGesture);
      if (scrollDebounceTimer) clearTimeout(scrollDebounceTimer);
    };
  }, [strategy, isExpanded]);

  // When expanding from collapsed view, refresh imperative layout calculations
  useEffect(() => {
    if (!isExpanded) return;
    if (strategyRef.current?.invalidateLayout) {
      strategyRef.current.invalidateLayout(300);
    }
  }, [isExpanded]);

  // FIX: Clear lingering scroll-pause timers when the song changes
  useEffect(() => {
    return () => {
      if (legacyScrollTimerRef.current) {
        clearTimeout(legacyScrollTimerRef.current);
      }
      setLegacyScrollPaused(false);
      setShowResumeAutoscroll(false);
      setIsUserScrolled(false);
    };
  }, [lyrics]); // Triggers cleanup when lyrics array changes

  const resumeAutoscroll = () => {
    if (legacyScrollTimerRef.current) {
      clearTimeout(legacyScrollTimerRef.current);
      legacyScrollTimerRef.current = null;
    }

    strategy?.pauseAutoScroll?.(0);
    setLegacyScrollPaused(false);
    setShowResumeAutoscroll(false);
    setIsUserScrolled(false);

    const container = contentRef.current;
    const activeEl = (container?.querySelector(
      `[data-line-index="${activeIndex}"]`,
    ) || container?.children?.[activeIndex]) as HTMLElement | null;
    if (!container || !activeEl) return;

    const targetScroll = Math.max(
      0,
      activeEl.offsetTop +
        activeEl.clientHeight / 2 -
        container.clientHeight * 0.5,
    );
    legacyProgrammaticScrollRef.current = true;
    container.scrollTo({ top: targetScroll, behavior: "smooth" });
    window.setTimeout(() => {
      legacyProgrammaticScrollRef.current = false;
    }, 600);
  };

  // Auto-scroll effect (Legacy / Line Mode) — respects user-scroll pause
  useEffect(() => {
    if (
      !shouldUseAnimationEngine &&
      activeIndex >= 0 &&
      contentRef.current &&
      !legacyScrollPaused // Skip if user recently scrolled
    ) {
      const activeEl = (contentRef.current.querySelector(
        `[data-line-index="${activeIndex}"]`,
      ) || contentRef.current.children[activeIndex]) as HTMLElement | null;
      if (activeEl) {
        const container = contentRef.current;
        const containerHeight = container.clientHeight;
        const lineTop = activeEl.offsetTop;
        const lineHeight = activeEl.clientHeight;

        // Perfectly centered anchor (50%) matching syllable/word engine
        const anchorRatio = 0.5;
        const deadZonePx = Math.max(12, containerHeight * 0.04);
        const currentCenterInView =
          lineTop - container.scrollTop + lineHeight / 2;
        const desiredCenter = containerHeight * anchorRatio;

        if (Math.abs(currentCenterInView - desiredCenter) <= deadZonePx) {
          return;
        }

        let rawTargetScroll = lineTop + lineHeight / 2 - desiredCenter;
        rawTargetScroll = Math.max(0, rawTargetScroll);
        const maxScroll = Math.max(0, container.scrollHeight - containerHeight);
        const targetScroll = Math.max(0, Math.min(rawTargetScroll, maxScroll));
        const jumpedFar =
          lastLegacyActiveIndexRef.current === -1 ||
          Math.abs(activeIndex - lastLegacyActiveIndexRef.current) > 2;
        lastLegacyActiveIndexRef.current = activeIndex;

        // Mark as programmatic so the scroll listener ignores it
        legacyProgrammaticScrollRef.current = true;
        try {
          container.scrollTo({
            top: targetScroll,
            behavior: jumpedFar ? "auto" : "smooth",
          });
        } catch (e) {
          // Ignore
        }
        // Clear programmatic flag after scroll animation completes
        setTimeout(() => {
          legacyProgrammaticScrollRef.current = false;
        }, 1000);
      }
    }
  }, [activeIndex, shouldUseAnimationEngine, legacyScrollPaused]);

  if (!isExpanded) {
    // Collapsed view logic here if needed
  }

  // Memoize strategy lyrics generation to prevent re-renders on activeIndex changes
  // This decoupling allows the animation loop to handle styling via DOM classes
  const renderedStrategyLyrics = useMemo(() => {
    if (
      !lyrics ||
      lyrics.length === 0 ||
      !shouldUseAnimationEngine ||
      !strategy
    )
      return null;

    if (strategy.isImperative) {
      return (
        <ImperativeLyricsHost key={engineResetKey} resetKey={engineResetKey} />
      );
    }

    return strategy.renderLyrics(
      lyrics,
      -1, // No active index passed - handled via DOM class in update()
      (time) => {
        const video = document.querySelector("video");
        if (video) {
          console.log("[Lyrical] Seeking to time:", time);
          video.currentTime = time;
        }
      },
      { romanizedLyrics, translatedLyrics },
    );
  }, [
    lyrics,
    shouldUseAnimationEngine,
    strategy,
    engineResetKey,
    romanizedLyrics,
    translatedLyrics,
  ]);

  // Calculate active line for collapsed preview with early transition (0.35s early)
  // so entrance motion animation finishes BEFORE singing begins on the new line.
  const collapsedLineIndex = useMemo(() => {
    if (!lyrics || lyrics.length === 0) return -1;

    const EARLY_PREPARE_S = 0.35;
    const time = collapsedPreviewTime > 0 ? collapsedPreviewTime : 0;

    for (let i = 0; i < lyrics.length; i++) {
      const line = lyrics[i];
      const nextLine = lyrics[i + 1];
      const lineStart = Number(line.time ?? 0);
      const nextStart = nextLine ? Number(nextLine.time ?? Infinity) : Infinity;

      const effectiveStart = i === 0 ? 0 : lineStart - EARLY_PREPARE_S;
      const effectiveEnd = nextStart - EARLY_PREPARE_S;

      if (time >= effectiveStart && time < effectiveEnd) {
        return i;
      }
    }

    return Math.max(
      0,
      Math.min(activeIndex >= 0 ? activeIndex : 0, lyrics.length - 1),
    );
  }, [lyrics, collapsedPreviewTime, activeIndex]);
  const collapsedLine =
    collapsedLineIndex >= 0 ? lyrics[collapsedLineIndex] : null;
  const collapsedOriginalText =
    collapsedLine?.text?.trim() ||
    (collapsedLine?.isInstrumental ? "Instrumental" : "");
  const collapsedRomanized =
    collapsedLineIndex >= 0
      ? romanizedLyrics?.[collapsedLineIndex]?.romanized || ""
      : "";
  const collapsedTranslated =
    collapsedLineIndex >= 0
      ? translatedLyrics?.[collapsedLineIndex]?.translated || ""
      : "";
  const hasCollapsedPreview = !isExpanded && !!collapsedLine;
  // Use global availability (hasRomanized/hasTranslated) to size the panel,
  // not current line content. This prevents height jumps on instrumental ↔ lyric transitions.
  const collapsedSecondaryCount =
    (hasRomanized && isRomanizationEnabled ? 1 : 0) +
    (hasTranslated && isTranslateEnabled ? 1 : 0);
  const collapsedPanelHeight = hasCollapsedPreview ? "auto" : "64px";
  const collapsedPanelMinHeight = hasCollapsedPreview
    ? collapsedSecondaryCount > 1
      ? "122px"
      : collapsedSecondaryCount === 1
        ? "100px"
        : "78px"
    : "64px";

  const renderCollapsedOriginal = () => {
    // Instrumental: show a music note icon with rising fill instead of text
    if (collapsedLine?.isInstrumental) {
      const lineStart = Number(collapsedLine.time ?? 0);
      const nextLine = lyrics?.[collapsedLineIndex + 1];
      const lineDuration = Math.max(
        Number(
          collapsedLine.duration ?? (nextLine ? nextLine.time - lineStart : 3),
        ),
        0.5,
      );
      const lineEnd = lineStart + lineDuration;
      let progress = 0;
      if (collapsedPreviewTime >= lineEnd) {
        progress = 1;
      } else if (collapsedPreviewTime >= lineStart) {
        progress = Math.min(
          1,
          Math.max(0, (collapsedPreviewTime - lineStart) / lineDuration),
        );
      }

      // clipPath rect Y: 21 = fully hidden (bottom), 3 = fully revealed (top)
      const clipY = 21 - progress * 18;
      const NOTE_PATH =
        "M10 21q-1.65 0-2.825-1.175T6 17t1.175-2.825T10 13q.575 0 1.063.138t.937.412V4q0-.425.288-.712T13 3h4q.425 0 .713.288T18 4v2q0 .425-.288.713T17 7h-3v10q0 1.65-1.175 2.825T10 21";
      const clipId = `collapsed-inst-clip-${collapsedLineIndex}`;

      const filterId = `collapsed-inst-glow-${collapsedLineIndex}`;

      return (
        <svg
          className="lyrical-collapsed-instrumental-icon"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <clipPath id={clipId}>
              <rect x="0" y={clipY} width="24" height={24 - clipY} />
            </clipPath>
            <filter
              id={filterId}
              x="-100%"
              y="-100%"
              width="300%"
              height="300%"
            >
              <feGaussianBlur
                in="SourceGraphic"
                stdDeviation="3"
                result="blur"
              />
              <feColorMatrix
                in="blur"
                type="matrix"
                values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.6 0"
                result="fadedBlur"
              />
              <feMerge>
                <feMergeNode in="fadedBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {/* Background note (inactive — same as expanded view) */}
          <path d={NOTE_PATH} className="lyrical-collapsed-inst-bg" />
          {/* Fill note (active, clipped by rising rect — same as expanded view) */}
          <g
            filter={
              progress > 0 && progress < 1 ? `url(#${filterId})` : undefined
            }
          >
            <path
              d={NOTE_PATH}
              className="lyrical-collapsed-inst-fill"
              clipPath={`url(#${clipId})`}
            />
          </g>
        </svg>
      );
    }

    const rawParts = collapsedLine?.parts;

    // Line-Synced fallback: No parts available, highlight the whole line cleanly
    if (!rawParts || rawParts.length === 0) {
      return (
        collapsedOriginalText || songInfo?.title || t("lyricsPanel_loaded")
      );
    }

    const lineStart = Number(collapsedLine?.time ?? 0);
    const nextLine = lyrics?.[collapsedLineIndex + 1];
    const lineDuration = Math.max(
      Number(
        collapsedLine?.duration ?? (nextLine ? nextLine.time - lineStart : 3),
      ),
      0.5,
    );

    const hasDurations = rawParts.some((p: any) => Number(p.duration || 0) > 0);

    const wordObjects = hasDurations
      ? // Syllable Sync: Exact durations
        rawParts.map((p: any) => ({
          text: p.text,
          time: Number(p.time ?? lineStart),
          duration: Math.max(Number(p.duration ?? 0), 0.12),
        }))
      : // Word Sync: Duration derived from gap to next word (capped to 1.2s for last word)
        rawParts.map((p: any, i: number) => {
          const start = Number(p.time ?? lineStart);
          const isLastPart = i === rawParts.length - 1;
          const rawDuration = isLastPart
            ? nextLine
              ? Math.min(Math.max(nextLine.time - start, 0.4), 1.2)
              : 1.2
            : Number(rawParts[i + 1].time ?? start) - start;
          return {
            text: p.text,
            time: start,
            duration: Math.max(rawDuration, 0.12),
          };
        });

    const shouldInsertSpaces = /\s/.test(collapsedOriginalText);

    const EARLY_PREPARE_S = 0.35;
    const nextLineTime = nextLine
      ? Number(nextLine.time ?? Infinity)
      : Infinity;
    const unmountDeadline = nextLineTime - EARLY_PREPARE_S - 0.1;

    return wordObjects.map((wordObj, index) => {
      const start = wordObj.time;
      const duration = wordObj.duration;
      // Add duration * 0.1 lead-in (matching ImperativeBetterStrategy swipe delay)
      const currentTime = collapsedPreviewTime + duration * 0.1;

      const calcEnd = start + duration;
      // Clamp ALL words to complete before React unmounts the line
      const wordEnd = Math.min(calcEnd, unmountDeadline);
      const effectiveDuration = Math.max(wordEnd - start, 0.1);

      const isPast = collapsedPreviewTime >= wordEnd || currentTime >= wordEnd;
      const isActive = currentTime >= start && !isPast;

      // Compute continuous progress (0→1) for the swipe gradient
      let progress = 0;
      if (isPast) {
        progress = 1;
      } else if (isActive) {
        progress = Math.min(
          1,
          Math.max(0, (currentTime - start) / effectiveDuration),
        );
      }

      return (
        <React.Fragment key={`${index}-${start}-${wordObj.text}`}>
          <span
            className={[
              "lyrical-collapsed-word",
              isPast ? "is-past" : "",
              isActive ? "is-active" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            data-content={wordObj.text}
            style={
              {
                "--cw-progress": progress,
              } as React.CSSProperties
            }
          >
            {wordObj.text}
          </span>
          {shouldInsertSpaces && index < wordObjects.length - 1 ? " " : null}
        </React.Fragment>
      );
    });
  };

  const renderCollapsedRomanized = () => {
    if (!collapsedRomanized || collapsedLineIndex < 0) return null;

    const rawParts = collapsedLine?.parts;
    const lineStart = Number(collapsedLine?.time ?? 0);
    const nextLine = lyrics?.[collapsedLineIndex + 1];

    // Determine actual singing start and duration (derived from parts if available)
    // so romanized estimation finishes at the exact same time as the original line fill.
    let effectiveStart = lineStart;
    let effectiveDuration = Math.max(
      Number(
        collapsedLine?.duration ?? (nextLine ? nextLine.time - lineStart : 3),
      ),
      0.5,
    );

    if (rawParts && rawParts.length > 0) {
      const firstPartStart = Number(rawParts[0].time ?? lineStart);
      const lastPart = rawParts[rawParts.length - 1];
      const lastPartStart = Number(lastPart.time ?? lineStart);
      let lastPartDuration = Number(lastPart.duration || 0);
      if (lastPartDuration <= 0) {
        const gap = nextLine ? nextLine.time - lastPartStart : 1.2;
        lastPartDuration = Math.min(Math.max(gap, 0.4), 1.2);
      }
      const actualSingingEnd = lastPartStart + lastPartDuration;

      effectiveStart = firstPartStart;
      effectiveDuration = Math.max(actualSingingEnd - firstPartStart, 0.5);
    }

    const romData = romanizedLyrics?.[collapsedLineIndex];
    const timedRom = romData?.timedRomanization;

    let wordObjects: Array<{ text: string; time: number; duration: number }>;

    if (timedRom && timedRom.length > 0) {
      wordObjects = timedRom.map((p: any) => ({
        text: p.text,
        time: Number(p.time ?? effectiveStart),
        duration: Math.max(Number(p.duration ?? 0), 0.12),
      }));
    } else {
      // Character-weighted estimation matching ImperativeBetterStrategy.estimateTimedRomanization
      const rawWords = collapsedRomanized
        .split(/\s+/)
        .filter((w: string) => w.length > 0);
      if (rawWords.length === 0) return collapsedRomanized;

      const totalChars = rawWords.reduce(
        (sum: number, w: string) => sum + w.length,
        0,
      );
      let currentTime = effectiveStart;
      wordObjects = rawWords.map((w: string) => {
        const wordDuration = (w.length / totalChars) * effectiveDuration;
        const obj = {
          text: w,
          time: currentTime,
          duration: Math.max(wordDuration, 0.12),
        };
        currentTime += wordDuration;
        return obj;
      });
    }

    const EARLY_PREPARE_S = 0.35;
    const nextLineTime = nextLine
      ? Number(nextLine.time ?? Infinity)
      : Infinity;
    const unmountDeadline = nextLineTime - EARLY_PREPARE_S - 0.1;

    return wordObjects.map((wordObj, index) => {
      const start = wordObj.time;
      const duration = wordObj.duration;
      // Add duration * 0.1 lead-in (matching ImperativeBetterStrategy swipe delay)
      const currentTime = collapsedPreviewTime + duration * 0.1;

      const calcEnd = start + duration;
      // Clamp ALL words to complete before React unmounts the line
      const wordEnd = Math.min(calcEnd, unmountDeadline);
      const effectiveDuration = Math.max(wordEnd - start, 0.1);

      const isPast = collapsedPreviewTime >= wordEnd || currentTime >= wordEnd;
      const isActive = currentTime >= start && !isPast;

      let progress = 0;
      if (isPast) {
        progress = 1;
      } else if (isActive) {
        progress = Math.min(
          1,
          Math.max(0, (currentTime - start) / effectiveDuration),
        );
      }

      return (
        <React.Fragment key={`rom-${index}-${start}-${wordObj.text}`}>
          <span
            className={[
              "lyrical-collapsed-word",
              isPast ? "is-past" : "",
              isActive ? "is-active" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            data-content={wordObj.text}
            style={
              {
                "--cw-progress": progress,
              } as React.CSSProperties
            }
          >
            {wordObj.text}
          </span>
          {index < wordObjects.length - 1 ? " " : null}
        </React.Fragment>
      );
    });
  };

  return (
    <div
      id="lyrical-panel"
      data-reduce-animations={reduceAnimations ? "true" : "false"}
      data-compact={compactMode ? "true" : "false"}
      style={{
        ...themeVars,
        "--lyrical-active-lyric-size": lyricsTypography.activeOriginal,
        "--lyrical-inactive-lyric-size": lyricsTypography.inactiveOriginal,
        "--lyrical-secondary-lyric-size": lyricsTypography.secondary,
        "--lyrical-romanized-padding": lyricsTypography.romanizedPadding,
        "--lyrical-line-padding": lyricsTypography.linePadding,
        "--lyrical-line-margin": lyricsTypography.lineMargin,
        "--lyrical-line-gap": lyricsTypography.lineGap,
        "--blyrics-font-size": lyricsTypography.engineFontSize,
        marginBottom: "16px",
        background: "var(--lyrical-panel-bg)",
        borderRadius: "24px",
        padding: "0",
        boxSizing: "border-box", // Prevent external CSS interference
        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        color: "var(--lyrical-text-primary)",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        minHeight: isExpanded ? "auto" : collapsedPanelMinHeight,
        height: isExpanded ? "auto" : collapsedPanelHeight,
        overflow: "hidden",
        position: "relative",
        transition: "min-height 0.25s ease, height 0.25s ease",
      }}
    >
      {/* Header */}
      <div
        onClick={(e) => {
          if (hasDraggedRef.current) {
            e.stopPropagation();
            hasDraggedRef.current = false;
            return;
          }
          setExpanded(!isExpanded);
        }}
        onPointerDown={handlePointerDownHeader}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: hasCollapsedPreview ? "flex-start" : "center",
          padding: hasCollapsedPreview ? "10px 14px 12px 14px" : "0 18px",
          height: isExpanded ? "64px" : collapsedPanelHeight,
          minHeight: isExpanded ? "64px" : collapsedPanelMinHeight,
          borderBottom: isExpanded ? "1px solid var(--lyrical-border)" : "none",
          width: "100%",
          flexShrink: 0,
          cursor:
            displayMode === "floating"
              ? isDragging
                ? "grabbing"
                : "grab"
              : "pointer",
          boxSizing: "border-box",
          userSelect: "none",
        }}
      >
        {/* Artwork Watermark - Flush to panel boundary */}
        {hasCollapsedPreview && showCollapsedArtwork && songInfo?.artwork ? (
          <div className="lyrical-collapsed-watermark">
            <img
              src={songInfo.artwork}
              alt=""
              onError={(e) => {
                (e.target as HTMLElement).style.display = "none";
              }}
            />
          </div>
        ) : null}

        {hasCollapsedPreview ? (
          <div className="lyrical-collapsed-preview">
            <div className="lyrical-collapsed-title-row">
              <div className="lyrical-collapsed-title-left">
                <svg
                  style={{
                    flexShrink: 0,
                    color: "var(--lyrical-accent)",
                    width: "20px",
                    height: "20px",
                  }}
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                </svg>
                <div className="lyrical-collapsed-title">
                  {songInfo?.title || t("lyricsPanel_loaded")}
                </div>
              </div>
            </div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`${collapsedLineIndex}-${collapsedLine?.time ?? 0}`}
                className="lyrical-collapsed-lines"
                initial={
                  reduceAnimations ? false : { opacity: 0, y: 10, scale: 0.99 }
                }
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={
                  reduceAnimations
                    ? { opacity: 0 }
                    : { opacity: 0, y: -8, scale: 0.99 }
                }
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              >
                <div
                  className="lyrical-collapsed-original"
                  data-timed={
                    collapsedLine?.parts && collapsedLine.parts.length > 0
                      ? "true"
                      : "false"
                  }
                >
                  {renderCollapsedOriginal()}
                </div>
                {collapsedRomanized && (
                  <motion.div
                    className="lyrical-collapsed-romanized"
                    initial={reduceAnimations ? false : { opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18, delay: 0.04 }}
                  >
                    {renderCollapsedRomanized()}
                  </motion.div>
                )}
                {collapsedTranslated && (
                  <motion.div
                    className="lyrical-collapsed-translated"
                    initial={reduceAnimations ? false : { opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18, delay: 0.07 }}
                  >
                    {collapsedTranslated}
                  </motion.div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              overflow: "hidden",
              flex: 1,
            }}
          >
            <svg
              style={{
                flexShrink: 0,
                color: "var(--lyrical-accent)",
                width: "24px",
                height: "24px",
              }}
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
            </svg>
            <span
              style={{
                fontSize: "16px",
                fontWeight: "600",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: "260px",
                display: "flex",
                alignItems: "center",
              }}
            >
              {isExpanded ? (
                "Lyrical"
              ) : lyrics && lyrics.length > 0 ? (
                activeIndex >= 0 ? (
                  `🎵 ${lyrics[activeIndex].text}`
                ) : (
                  `♪ ${songInfo?.title || t("lyricsPanel_loaded")}`
                )
              ) : headerText && headerText.toLowerCase().includes("search") ? (
                <ShinyText
                  text={headerText}
                  disabled={reduceAnimations}
                  speed={3}
                  className="lyrical-searching-text-header"
                  color="var(--lyrical-text-primary)"
                  shineColor="var(--lyrical-text-secondary)"
                  spread={120}
                />
              ) : (
                headerText || "Lyrical"
              )}
            </span>
          </div>
        )}

        {/* Unified Persistent Expand/Collapse Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!isExpanded);
          }}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--lyrical-text-primary)",
            cursor: "pointer",
            width: "36px",
            height: "36px",
            minWidth: "36px",
            minHeight: "36px",
            padding: "0",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "50%",
            transition: "background 0.2s",
            flexShrink: 0,
            zIndex: 2,
            alignSelf: hasCollapsedPreview ? "flex-start" : "center",
            marginTop: hasCollapsedPreview ? "-2px" : "0",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "var(--lyrical-panel-hover)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = "transparent")
          }
          title={
            isExpanded ? t("lyricsPanel_collapse") : t("lyricsPanel_expand")
          }
        >
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{
              duration: reduceAnimations ? 0 : 0.28,
              ease: [0.4, 0, 0.2, 1],
            }}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ChevronDown size={20} />
          </motion.div>
        </button>
      </div>

      {/* Body */}
      {isExpanded && (
        <motion.div
          style={{
            padding: compactMode ? "16px 20px" : "20px",
            transition: "padding 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          <div>
            {/* Artwork & Info */}
            <div
              style={{
                display: "flex",
                flexDirection: compactMode ? "row" : "column",
                alignItems: "center",
                justifyContent: compactMode ? "flex-start" : "center",
                gap: compactMode ? "16px" : "0",
                marginBottom: compactMode ? "16px" : "20px",
                transition: [
                  "gap 0.35s cubic-bezier(0.4, 0, 0.2, 1) 0.05s",
                  "margin-bottom 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
                ].join(", "),
              }}
            >
              {/* Artwork */}
              <div
                style={{
                  width: compactMode ? "60px" : "180px",
                  height: compactMode ? "60px" : "180px",
                  marginBottom: compactMode ? "0" : "16px",
                  borderRadius: compactMode ? "10px" : "12px",
                  overflow: "hidden",
                  boxShadow: compactMode
                    ? "0 4px 14px rgba(0,0,0,0.35)"
                    : "0 8px 24px rgba(0,0,0,0.5)",
                  flexShrink: 0,
                  transition: [
                    "width 0.45s cubic-bezier(0.22, 1, 0.36, 1)",
                    "height 0.45s cubic-bezier(0.22, 1, 0.36, 1)",
                    "margin-bottom 0.3s cubic-bezier(0.4, 0, 0.2, 1) 0.05s",
                    "border-radius 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
                    "box-shadow 0.5s cubic-bezier(0.4, 0, 0.2, 1) 0.1s",
                  ].join(", "),
                }}
              >
                {songInfo?.artwork ? (
                  <img
                    src={songInfo.artwork}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                    alt={t("lyricsPanel_albumArt")}
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      background: "var(--lyrical-album-fallback)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Music
                      size={compactMode ? 24 : 40}
                      color="var(--lyrical-text-subtle)"
                    />
                  </div>
                )}
              </div>

              {/* Info */}
              <div
                style={{
                  textAlign: compactMode ? "left" : "center",
                  flex: compactMode ? 1 : "initial",
                  minWidth: 0,
                  transition: [
                    "flex 0.35s cubic-bezier(0.4, 0, 0.2, 1) 0.08s",
                  ].join(", "),
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: compactMode ? "flex-start" : "center",
                  alignItems: compactMode ? "flex-start" : "center",
                }}
              >
                <Tooltip content={songInfo?.title || headerText}>
                  <h2
                    className="songTitle"
                    style={{
                      fontSize: compactMode ? "15px" : "16px",
                      fontWeight: compactMode ? "700" : "600",
                      letterSpacing: compactMode ? "0.2px" : "normal",
                      margin: "0 0 4px 0",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      transition:
                        "font-size 0.3s cubic-bezier(0.4, 0, 0.2, 1) 0.08s, letter-spacing 0.3s cubic-bezier(0.4, 0, 0.2, 1) 0.08s",
                    }}
                  >
                    {(songInfo?.title || headerText)?.length > 18
                      ? (songInfo?.title || headerText).substring(0, 18) + "..."
                      : songInfo?.title || headerText}
                  </h2>
                </Tooltip>
                <Tooltip
                  content={songInfo?.artist || t("lyricsPanel_playSong")}
                >
                  <p
                    className="songArtist"
                    style={{
                      fontSize: compactMode ? "12px" : "14px",
                      fontWeight: compactMode ? "500" : "normal",
                      color: "var(--lyrical-text-secondary)",
                      margin: "0",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      transition:
                        "font-size 0.3s cubic-bezier(0.4, 0, 0.2, 1) 0.1s",
                    }}
                  >
                    {(songInfo?.artist || t("lyricsPanel_playSong"))?.length >
                    18
                      ? (
                          songInfo?.artist || t("lyricsPanel_playSong")
                        ).substring(0, 18) + "..."
                      : songInfo?.artist || t("lyricsPanel_playSong")}
                  </p>
                </Tooltip>
              </div>
            </div>
            <LyricsDock
              activeSource={lyricsSource}
              availableSources={availableLyricsSources}
              hasTranslated={hasTranslated}
              hasRomanized={hasRomanized}
              showResumeAutoscroll={showResumeAutoscroll}
              onResumeAutoscroll={resumeAutoscroll}
            />

            {/* Lyrics Content */}
            <motion.div
              ref={contentRef}
              id="lyrical-content"
              style={{
                position: "relative",
                height: !hasLyrics
                  ? "auto"
                  : compactMode
                    ? "clamp(220px, 30vh, 260px)"
                    : "clamp(320px, 50vh, 460px)",
                maxHeight: compactMode
                  ? "clamp(220px, 30vh, 260px)"
                  : "clamp(320px, 50vh, 480px)",
                minHeight: compactMode ? "160px" : "180px",
                display: !hasLyrics ? "flex" : "block",
                flexDirection: !hasLyrics ? "column" : undefined,
                justifyContent: !hasLyrics ? "center" : undefined,
                alignItems: !hasLyrics ? "center" : undefined,
                overflowY: "auto",
                overscrollBehavior: "contain",
                padding: lyricsTypography.contentPadding,
                paddingBottom: !hasLyrics
                  ? lyricsTypography.contentPadding
                  : "8px",
                background: "var(--lyrical-panel-surface)",
                borderRadius: "12px",
                boxShadow: "inset 0 4px 12px rgba(0,0,0,0.3)",
                transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
              }}
            >
              <AnimatePresence>
                {isProcessingLyrics && (
                  <motion.div
                    initial={
                      reduceAnimations
                        ? undefined
                        : { opacity: 0, y: -6, scale: 0.98 }
                    }
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={
                      reduceAnimations
                        ? undefined
                        : { opacity: 0, y: -6, scale: 0.98 }
                    }
                    transition={{ duration: 0.22, ease: "easeOut" }}
                    style={{
                      position: "sticky",
                      top: "4px",
                      zIndex: 10,
                      margin: "0 auto 8px auto",
                      width: "fit-content",
                      padding: "6px 14px",
                      background: "var(--lyrical-accent-soft)",
                      backdropFilter: "blur(8px)",
                      borderRadius: "8px",
                      textAlign: "center",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      pointerEvents: "none",
                    }}
                  >
                    <ShinyText
                      text={t("lyricsPanel_processing")}
                      disabled={reduceAnimations}
                      speed={3}
                      className="lyrical-processing-text"
                      color="var(--lyrical-accent)"
                      shineColor="var(--lyrical-text-primary)"
                      spread={120}
                    />
                    <style>{`
                      .lyrical-processing-text {
                        font-size: 13.5px;
                        font-weight: 600;
                        letter-spacing: 0.25px;
                      }
                    `}</style>
                  </motion.div>
                )}
              </AnimatePresence>
              {lyrics && lyrics.length > 0 ? (
                renderedStrategyLyrics ? (
                  <React.Fragment key={engineResetKey}>
                    {renderedStrategyLyrics}
                  </React.Fragment>
                ) : (
                  // Fallback / Line Logic
                  <>
                    {lyrics.map((line, idx) => {
                      // Get extra versions from REACTIVE store props
                      const romanized = romanizedLyrics?.[idx]?.romanized;
                      const translated = translatedLyrics?.[idx]?.translated;
                      const isActive = idx === activeIndex;
                      const isPast = activeIndex >= 0 && idx < activeIndex;
                      const lyricText = line.text?.trim() ?? "";
                      const isInstrumental = line.isInstrumental || !lyricText;
                      const nextLine = lyrics[idx + 1];
                      const lineDuration =
                        line.duration ??
                        (nextLine
                          ? Math.max(nextLine.time - line.time, 0.8)
                          : 2);
                      const paragraphAlign = "center";
                      const secondaryAlign = "center";
                      const canSeek = typeof line.time === "number";

                      return (
                        <div
                          key={idx}
                          data-line-index={idx}
                          className={`lyric-line ${isActive ? "active" : ""}`}
                          onClick={() => seekToLyricTime(line.time)}
                          role={canSeek ? "button" : undefined}
                          tabIndex={canSeek ? 0 : undefined}
                          onKeyDown={(event) => {
                            if (
                              !canSeek ||
                              (event.key !== "Enter" && event.key !== " ")
                            ) {
                              return;
                            }

                            event.preventDefault();
                            seekToLyricTime(line.time);
                          }}
                          style={{
                            padding: lyricsTypography.linePadding,
                            textAlign: paragraphAlign,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: lyricsTypography.lineGap,
                            borderRadius: "0",
                            minHeight: isInstrumental
                              ? lyricsTypography.instrumentalMinHeight
                              : "auto",
                            margin: lyricsTypography.lineMargin,
                            opacity: isActive ? 1 : isPast ? 0.76 : 0.62,
                            filter: "none",
                            transform: "none",
                            transition: "opacity 0.22s ease, color 0.22s ease",
                            background: "transparent",
                            boxShadow: "none",
                            cursor: canSeek ? "pointer" : "default",
                            outline: "none",
                          }}
                        >
                          {/* Main Text / Instrumental Indicator */}
                          {isInstrumental ? (
                            <div
                              className="lyric-instrumental"
                              style={{
                                display: "flex",
                                justifyContent: "center",
                                alignItems: "center",
                                minHeight:
                                  lyricsTypography.instrumentalMinHeight,
                                width: "100%",
                                opacity: isActive ? 1 : 0.68,
                                order: 1,
                              }}
                            >
                              <div
                                className="blyrics--instrumental lyrical-fallback-instrumental"
                                style={
                                  {
                                    "--blyrics-duration": `${Math.round(lineDuration * 1000)}ms`,
                                  } as React.CSSProperties
                                }
                                ref={(el) => {
                                  if (!el) return;

                                  const durationSeconds = Math.max(
                                    lineDuration,
                                    0.18,
                                  );
                                  const adjustedVideoTime =
                                    getAdjustedVideoTime();
                                  const elapsedSeconds =
                                    adjustedVideoTime === null ||
                                    typeof line.time !== "number"
                                      ? 0
                                      : Math.max(
                                          0,
                                          adjustedVideoTime - line.time,
                                        );
                                  const delaySeconds = isActive
                                    ? -Math.min(elapsedSeconds, durationSeconds)
                                    : 0;

                                  el.style.setProperty(
                                    "--blyrics-duration",
                                    `${Math.round(durationSeconds * 1000)}ms`,
                                  );
                                  el.style.setProperty(
                                    "--blyrics-anim-delay",
                                    `${delaySeconds}s`,
                                  );

                                  if (!el.dataset.instrumentalMounted) {
                                    el.dataset.instrumentalMounted = "true";
                                    const instrumentalElement =
                                      createInstrumentalElement(
                                        Math.round(durationSeconds * 1000),
                                        idx,
                                      );
                                    const svg =
                                      instrumentalElement.querySelector("svg");
                                    if (svg) {
                                      el.appendChild(svg);
                                    }
                                  }

                                  el.classList.remove(
                                    "blyrics--animating",
                                    "blyrics--pre-animating",
                                    "blyrics--paused",
                                  );

                                  if (isActive) {
                                    el.classList.add("blyrics--pre-animating");
                                    el.getBoundingClientRect();
                                    el.classList.add("blyrics--animating");
                                    if (!isPlaying) {
                                      el.classList.add("blyrics--paused");
                                    }
                                  } else if (!isPast) {
                                    el.classList.add("blyrics--pre-animating");
                                  }
                                }}
                              />
                            </div>
                          ) : (
                            <div
                              className="lyric-original"
                              style={{
                                fontSize: isActive
                                  ? lyricsTypography.activeOriginal
                                  : lyricsTypography.inactiveOriginal,
                                fontWeight: isActive
                                  ? "750"
                                  : isPast
                                    ? "600"
                                    : "560",
                                color: isActive
                                  ? "var(--lyrical-text-primary)"
                                  : isPast
                                    ? "var(--lyrical-text-secondary)"
                                    : "var(--lyrical-text-muted)",
                                lineHeight: "1.45",
                                letterSpacing: "0",
                                maxWidth: "100%",
                                order: 1,
                                overflowWrap: "break-word",
                                textShadow: "none",
                                textAlign: "center",
                                textWrap: "pretty",
                                whiteSpace: "pre-wrap",
                              }}
                            >
                              {lyricText}
                            </div>
                          )}

                          {/* Romanized */}
                          {!isInstrumental && romanized && (
                            <div
                              className="lyric-romanized"
                              style={{
                                alignSelf: secondaryAlign,
                                order: 5,
                                textAlign: paragraphAlign,
                              }}
                            >
                              {romanized}
                            </div>
                          )}

                          {/* Translated */}
                          {!isInstrumental && translated && (
                            <div
                              className="lyric-translated"
                              style={{
                                alignSelf: secondaryAlign,
                                order: 10,
                                textAlign: paragraphAlign,
                              }}
                            >
                              {translated}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <div
                      className="lyrical-line-spacer"
                      style={{
                        height: compactMode ? "130px" : "240px",
                        minHeight: compactMode ? "130px" : "240px",
                        pointerEvents: "none",
                        flexShrink: 0,
                      }}
                      aria-hidden="true"
                    />
                  </>
                )
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "12px",
                    padding: "32px",
                    color: "var(--lyrical-text-muted)",
                    height: "100%",
                    justifyContent: "center",
                  }}
                >
                  {isLoading ? (
                    <>
                      {/* <div
                        style={{
                          width: "24px",
                          height: "24px",
                          border: "3px solid rgba(255,255,255,0.1)",
                          borderTopColor: "#3ea6ff",
                          borderRadius: "50%",
                          animation: "spin 0.8s linear infinite",
                        }}
                      ></div> */}
                      <ShinyText
                        text={t("lyricsPanel_searching")}
                        disabled={reduceAnimations}
                        speed={2.4}
                        className="lyrical-searching-text"
                        color="var(--lyrical-text-secondary)"
                        shineColor="var(--lyrical-text-primary)"
                        spread={115}
                      />
                      <style>{`
                        .lyrical-searching-text {
                          font-size: 14px;
                          font-weight: 500;
                          margin: 0;
                        }
                      `}</style>
                    </>
                  ) : (
                    <>
                      <div style={{ opacity: 0.5 }}>
                        <svg
                          width="32"
                          height="32"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M9 18V5l12-2v13" />
                          <circle cx="6" cy="18" r="3" />
                          <circle cx="18" cy="16" r="3" />
                          <line x1="2" y1="2" x2="22" y2="22" />
                        </svg>
                      </div>
                      <p style={{ fontSize: "14px", margin: 0 }}>
                        {t("lyricsPanel_noLyrics")}
                      </p>
                    </>
                  )}
                </div>
              )}
            </motion.div>

            {/* Panel Footer Actions */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                padding: "5px 2px 0 0",
              }}
            >
              <GeniusSearchPill
                artist={songInfo?.artist}
                title={songInfo?.title}
              />
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default LyricsPanel;
