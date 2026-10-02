import React, { useState, useEffect, useRef, useMemo } from "react";
import { X, ExternalLink, RotateCcw } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useAppStore } from "../store";
import { useShallow } from "zustand/react/shallow";
import { getThemeCssVariables } from "../../themes";
import {
  generateLineSyncedWords,
  getLineTransitionLead,
  TimedKaraokeWord,
} from "./KaraokeLyricDisplay";
import SearchingVibeIcon from "./SearchingVibeIcons";
import ShinyText from "./ShinyText";
import { t } from "../../i18n";
import {
  isInstrumentalLine,
  INSTRUMENTAL_NOTE_PATH,
} from "../../modules/lyrics/lyricsNormalizer";

// Motion animations matching Lyrical's configuration
const getAlbumArtMotion = (
  transition: "shuffle" | "flip" | "push" | "crossfade" | "none",
  reduceAnimations: boolean,
) => {
  if (reduceAnimations || transition === "none") {
    return {
      initial: { opacity: 1 },
      animate: { opacity: 1 },
      exit: { opacity: 1 },
      transition: { duration: 0 },
    };
  }

  switch (transition) {
    case "shuffle":
      return {
        initial: { x: 32, y: 16, rotate: 8, opacity: 0, scale: 0.88 },
        animate: { x: 0, y: 0, rotate: 0, opacity: 1, scale: 1 },
        exit: { x: -32, y: -16, rotate: -8, opacity: 0, scale: 0.88 },
        transition: { type: "spring" as const, stiffness: 320, damping: 24 },
      };
    case "flip":
      return {
        initial: { rotateY: 90, opacity: 0, scale: 0.92 },
        animate: { rotateY: 0, opacity: 1, scale: 1 },
        exit: { rotateY: -90, opacity: 0, scale: 0.92 },
        transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const },
      };
    case "push":
      return {
        initial: { x: "100%", opacity: 0 },
        animate: { x: 0, opacity: 1 },
        exit: { x: "-100%", opacity: 0 },
        transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const },
      };
    case "crossfade":
    default:
      return {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.25, ease: "easeInOut" as const },
      };
  }
};

const getTitleMotion = (
  transition: "spring" | "push" | "crossfade" | "none",
  reduceAnimations: boolean,
) => {
  if (reduceAnimations || transition === "none") {
    return {
      initial: { opacity: 1 },
      animate: { opacity: 1 },
      exit: { opacity: 1 },
      transition: { duration: 0 },
    };
  }

  switch (transition) {
    case "spring":
      return {
        initial: { y: 14, opacity: 0 },
        animate: { y: 0, opacity: 1 },
        exit: { y: -14, opacity: 0 },
        transition: { type: "spring" as const, stiffness: 380, damping: 26 },
      };
    case "push":
      return {
        initial: { x: 24, opacity: 0 },
        animate: { x: 0, opacity: 1 },
        exit: { x: -24, opacity: 0 },
        transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] as const },
      };
    case "crossfade":
    default:
      return {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.2 },
      };
  }
};

// Mini progress bar driven by video.currentTime
const MiniProgressBar: React.FC = () => {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let rafId: number | null = null;
    let cachedVideo: HTMLVideoElement | null = null;

    const getVideo = () => {
      if (!cachedVideo || !cachedVideo.isConnected) {
        cachedVideo = getActiveMediaVideoElement();
      }
      return cachedVideo;
    };

    const update = () => {
      const video = getVideo();
      if (
        video &&
        video.duration &&
        !isNaN(video.duration) &&
        video.duration > 0 &&
        barRef.current
      ) {
        const ratio = Math.min(1, Math.max(0, video.currentTime / video.duration));
        barRef.current.style.width = `${(ratio * 100).toFixed(2)}%`;
      }
    };

    const isPlaying = (video: HTMLVideoElement | null) => {
      return Boolean(video && !video.paused && !video.ended);
    };

    const loop = () => {
      update();
      const video = getVideo();
      if (isPlaying(video)) {
        rafId = requestAnimationFrame(loop);
      } else {
        rafId = null;
      }
    };

    const startLoop = () => {
      if (!rafId) {
        rafId = requestAnimationFrame(loop);
      }
    };

    const onPlay = () => startLoop();
    const onPauseOrEnded = () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      update();
    };
    const onSeekOrTimeUpdate = () => {
      update();
      const video = getVideo();
      if (isPlaying(video) && !rafId) {
        startLoop();
      }
    };

    const video = getVideo();
    update();
    if (isPlaying(video)) {
      startLoop();
    }

    video?.addEventListener("play", onPlay);
    video?.addEventListener("playing", onPlay);
    video?.addEventListener("pause", onPauseOrEnded);
    video?.addEventListener("ended", onPauseOrEnded);
    video?.addEventListener("seeked", onSeekOrTimeUpdate);
    video?.addEventListener("seeking", onSeekOrTimeUpdate);
    video?.addEventListener("timeupdate", onSeekOrTimeUpdate);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      const v = getVideo();
      v?.removeEventListener("play", onPlay);
      v?.removeEventListener("playing", onPlay);
      v?.removeEventListener("pause", onPauseOrEnded);
      v?.removeEventListener("ended", onPauseOrEnded);
      v?.removeEventListener("seeked", onSeekOrTimeUpdate);
      v?.removeEventListener("seeking", onSeekOrTimeUpdate);
      v?.removeEventListener("timeupdate", onSeekOrTimeUpdate);
    };
  }, []);

  return (
    <div
      style={{
        width: "100%",
        height: "2.5px",
        background: "rgba(255, 255, 255, 0.12)",
        borderRadius: "2px",
        overflow: "hidden",
        marginTop: "5px",
      }}
    >
      <div
        ref={barRef}
        style={{
          width: "0%",
          height: "100%",
          background: "var(--lyrical-accent, #3ea6ff)",
          borderRadius: "2px",
          transition: "width 0.1s linear",
        }}
      />
    </div>
  );
};

// Scrolling Title Component
const CompanionTitle: React.FC<{
  title: string;
  scrollLongTitles: boolean;
  reduceAnimations: boolean;
  titleTransition: "spring" | "push" | "crossfade" | "none";
}> = ({ title, scrollLongTitles, reduceAnimations, titleTransition }) => {
  const h2Ref = useRef<HTMLHeadingElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [overflowDistance, setOverflowDistance] = useState(0);

  useEffect(() => {
    const check = () => {
      if (h2Ref.current) {
        const clientW = h2Ref.current.clientWidth;
        const scrollW = h2Ref.current.scrollWidth;
        const measureW = measureRef.current
          ? Math.ceil(measureRef.current.getBoundingClientRect().width)
          : 0;
        const trueTextW = Math.max(scrollW, measureW);
        if (clientW > 0 && trueTextW > clientW + 4) {
          setOverflowDistance(trueTextW - clientW);
        } else {
          setOverflowDistance(0);
        }
      }
    };

    check();
    const rafId = requestAnimationFrame(check);
    const t1 = setTimeout(check, 100);
    const t2 = setTimeout(check, 400);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [title, scrollLongTitles]);

  const shouldScroll = Boolean(
    scrollLongTitles && overflowDistance > 0 && !reduceAnimations,
  );
  const duration = Math.max(6, Math.min(18, overflowDistance / 18 + 4));
  const motionProps = getTitleMotion(titleTransition, reduceAnimations);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        overflow: "hidden",
        scrollbarWidth: "none",
        msOverflowStyle: "none",
      }}
    >
      <span
        ref={measureRef}
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          visibility: "hidden",
          pointerEvents: "none",
          whiteSpace: "nowrap",
          fontSize: "13.5px",
          fontWeight: "600",
          fontFamily:
            "var(--lyrical-lyrics-font-stack, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif)",
          zIndex: -9999,
        }}
      >
        {title}
      </span>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={title}
          {...motionProps}
          style={{
            display: "block",
            width: "100%",
            maxWidth: "100%",
            overflow: "hidden",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}
        >
          <h2
            ref={h2Ref}
            style={{
              fontSize: "13.5px",
              fontWeight: "600",
              margin: 0,
              paddingLeft: "1px",
              paddingRight: shouldScroll ? "6px" : "0",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: shouldScroll ? "clip" : "ellipsis",
              maxWidth: "100%",
              textAlign: "left",
              color: "var(--lyrical-text-primary, #ffffff)",
              position: "relative",
              maskImage: shouldScroll
                ? "linear-gradient(to right, black 0%, black calc(100% - 14px), transparent 100%)"
                : "none",
              WebkitMaskImage: shouldScroll
                ? "linear-gradient(to right, black 0%, black calc(100% - 14px), transparent 100%)"
                : "none",
            }}
          >
            {shouldScroll ? (
              <span
                key={`scroll-text-${title}-${overflowDistance}`}
                style={{
                  display: "inline-block",
                  whiteSpace: "nowrap",
                  animation: `lyricalTitleMarquee ${duration}s ease-in-out infinite alternate`,
                  animationDelay: "1.2s",
                  ["--marquee-distance" as any]: `-${overflowDistance + 8}px`,
                  willChange: "transform",
                }}
              >
                {title}
              </span>
            ) : (
              title
            )}
          </h2>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

interface MiniCompanionProps {
  onDismiss?: () => void;
}

function isMiniplayerActive(): boolean {
  const mini = document.querySelector("ytd-miniplayer");
  if (!mini) return false;
  return mini.hasAttribute("active") || (mini as HTMLElement).offsetWidth > 0;
}


function getActiveMediaVideoElement(): HTMLVideoElement | null {
  if (isMiniplayerActive()) {
    const miniVideo = document.querySelector<HTMLVideoElement>("ytd-miniplayer video");
    if (miniVideo && miniVideo.isConnected) return miniVideo;
  }

  const player = document.getElementById("movie_player");
  if (player && !player.closest("ytd-inline-preview-player, #inline-preview-player")) {
    const v = player.querySelector<HTMLVideoElement>("video");
    if (v && v.isConnected) return v;
  }

  const allVideos = Array.from(document.querySelectorAll<HTMLVideoElement>("video"));
  for (const v of allVideos) {
    if (!v.closest("ytd-inline-preview-player, #inline-preview-player, ytd-thumbnail, ytd-rich-grid-media, ytd-video-preview")) {
      return v;
    }
  }

  return document.querySelector("video");
}

export const MiniCompanion: React.FC<MiniCompanionProps> = ({ onDismiss }) => {
  const {
    songInfo,
    lyrics,
    headerText,
    offset,
    themeId,
    customThemes,
    albumArtTransition,
    titleTransition,
    scrollLongTitles,
    showProgressBar,
    reduceAnimations,
    lyricsAnimationStyle,
    miniCompanionCustomPosition,
    isAdPlaying,
    isLoading,
    rawRomanizedLyrics,
    rawTranslatedLyrics,
    isRomanizationEnabled,
    isTranslateEnabled,
    showRomanizedLyrics,
    showTranslatedLyrics,
    storeActiveIndex,
    userOffset,
    isOffsetResolved,
    lyricsSource,
    searchingIndicatorStyle,
  } = useAppStore(
    useShallow((state) => ({
      songInfo: state.songInfo,
      lyrics: state.lyrics,
      headerText: state.headerText,
      offset: state.offset,
      themeId: state.themeId,
      customThemes: state.customThemes,
      albumArtTransition: state.albumArtTransition,
      titleTransition: state.titleTransition,
      scrollLongTitles: state.scrollLongTitles,
      showProgressBar: state.showProgressBar,
      reduceAnimations: state.reduceAnimations,
      lyricsAnimationStyle: state.lyricsAnimationStyle,
      miniCompanionCustomPosition: state.miniCompanionCustomPosition,
      isAdPlaying: state.isAdPlaying,
      isLoading: state.isLoading,
      rawRomanizedLyrics: state.romanizedLyrics,
      rawTranslatedLyrics: state.translatedLyrics,
      isRomanizationEnabled: state.isRomanizationEnabled,
      isTranslateEnabled: state.isTranslateEnabled,
      showRomanizedLyrics: state.showRomanizedLyrics,
      showTranslatedLyrics: state.showTranslatedLyrics,
      storeActiveIndex: state.activeIndex,
      userOffset: state.userOffset,
      isOffsetResolved: state.isOffsetResolved,
      lyricsSource: state.lyricsSource,
      searchingIndicatorStyle: state.searchingIndicatorStyle || "lofi",
    })),
  );

  const cardRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragPositionRef = useRef<{ top: number; left: number } | null>(null);
  const hasDraggedRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [rawVideoTime, setRawVideoTime] = useState(0);
  const [bottomOffset, setBottomOffset] = useState(236);
  const [rightOffset, setRightOffset] = useState(16);
  const [miniWidth, setMiniWidth] = useState(340);
  const [isDismissed, setIsDismissed] = useState(false);

  // Position calculation relative to YouTube's <ytd-miniplayer>
  useEffect(() => {
    const updatePosition = () => {
      const mini = document.querySelector("ytd-miniplayer");
      if (mini) {
        const rect = mini.getBoundingClientRect();
        const distFromBottom = Math.max(16, window.innerHeight - rect.top);
        setBottomOffset(distFromBottom + 12);
        const distFromRight = Math.max(16, window.innerWidth - rect.right);
        setRightOffset(distFromRight);
        if (rect.width > 0) {
          setMiniWidth(Math.max(300, Math.min(420, rect.width)));
        }
      }
    };

    updatePosition();
    const interval = setInterval(updatePosition, 800);
    window.addEventListener("resize", updatePosition);

    return () => {
      clearInterval(interval);
      window.removeEventListener("resize", updatePosition);
    };
  }, []);

  // Track playback time
  useEffect(() => {
    let rafId: number | null = null;
    let lastTime = -1;
    let cachedVideo: HTMLVideoElement | null = null;

    let currentVideo: HTMLVideoElement | null = getActiveMediaVideoElement();

    const isPlaying = (video: HTMLVideoElement | null) => {
      return Boolean(video && !video.paused && !video.ended);
    };

    const updateActiveVideo = () => {
      const live = getActiveMediaVideoElement();
      if (live && live !== currentVideo) {
        detachListeners(currentVideo);
        currentVideo = live;
        attachListeners(currentVideo);
      }
      return currentVideo;
    };

    const tick = () => {
      // Auto-rebind if current video became disconnected, paused, or replaced in player swap
      if (!currentVideo || !currentVideo.isConnected || currentVideo.paused) {
        updateActiveVideo();
      }

      if (currentVideo && currentVideo.isConnected) {
        const vTime = currentVideo.currentTime;
        const t = vTime - offset;
        if (Math.abs(t - lastTime) > 0.016) {
          lastTime = t;
          setCurrentTime(t);
          setRawVideoTime(vTime);
        }
      }
      if (isPlaying(currentVideo)) {
        rafId = requestAnimationFrame(tick);
      } else {
        rafId = null;
      }
    };

    const startTick = () => {
      if (!rafId) {
        rafId = requestAnimationFrame(tick);
      }
    };

    const onPlay = () => {
      updateActiveVideo();
      startTick();
    };
    const onPauseOrEnded = () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      tick();
    };
    const onSeek = () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      tick();
      if (isPlaying(currentVideo)) {
        startTick();
      }
    };

    const onTimeUpdate = () => {
      // Fallback: while playing, RAF is already ticking at 60 FPS; do not duplicate RAF callbacks.
      if (!isPlaying(currentVideo) || !rafId) {
        tick();
      }
    };

    const attachListeners = (v: HTMLVideoElement | null) => {
      if (!v) return;
      v.addEventListener("play", onPlay);
      v.addEventListener("playing", onPlay);
      v.addEventListener("pause", onPauseOrEnded);
      v.addEventListener("ended", onPauseOrEnded);
      v.addEventListener("seeked", onSeek);
      v.addEventListener("seeking", onSeek);
      v.addEventListener("timeupdate", onTimeUpdate);
    };

    const detachListeners = (v: HTMLVideoElement | null) => {
      if (!v) return;
      v.removeEventListener("play", onPlay);
      v.removeEventListener("playing", onPlay);
      v.removeEventListener("pause", onPauseOrEnded);
      v.removeEventListener("ended", onPauseOrEnded);
      v.removeEventListener("seeked", onSeek);
      v.removeEventListener("seeking", onSeek);
      v.removeEventListener("timeupdate", onTimeUpdate);
    };

    currentVideo = updateActiveVideo();
    attachListeners(currentVideo);
    tick();
    if (isPlaying(currentVideo)) {
      startTick();
    }

    const onPlayerSwap = () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      updateActiveVideo();
      tick();
      if (isPlaying(currentVideo)) {
        startTick();
      }
    };

    window.addEventListener("yt-navigate-finish", onPlayerSwap);
    document.addEventListener("visibilitychange", onPlayerSwap);
    window.addEventListener("focus", onPlayerSwap);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      detachListeners(currentVideo);
      window.removeEventListener("yt-navigate-finish", onPlayerSwap);
      document.removeEventListener("visibilitychange", onPlayerSwap);
      window.removeEventListener("focus", onPlayerSwap);
    };
  }, [lyrics, offset]);

  // Active line calculation matching collapsedPreview and karaokeDisplay adaptive early transition
  const activeLineIndex = useMemo(() => {
    if (!lyrics || lyrics.length === 0) return -1;

    const time = Math.max(0, currentTime);

    const firstLine = lyrics[0];
    const firstLineTime = Number(firstLine?.time ?? 0);
    const firstLead = getLineTransitionLead(0, firstLineTime);
    if (
      firstLineTime >= 4.5 &&
      !isInstrumentalLine(firstLine) &&
      time < firstLineTime - firstLead
    ) {
      return -1;
    }

    if (time < firstLineTime - firstLead) {
      return 0;
    }

    for (let i = 0; i < lyrics.length; i++) {
      const line = lyrics[i];
      const nextLine = lyrics[i + 1];
      const lineStart = Number(line.time ?? 0);
      const nextStart = nextLine ? Number(nextLine.time ?? Infinity) : Infinity;

      const prevLine = lyrics[i - 1];
      const prevStart = prevLine ? Number(prevLine.time ?? 0) : 0;
      const startLead = getLineTransitionLead(prevStart, lineStart, prevLine?.parts);
      const endLead = nextLine
        ? getLineTransitionLead(lineStart, nextStart, line.parts)
        : 0;

      const effectiveStart = lineStart - startLead;
      const effectiveEnd = nextStart - endLead;

      if (time >= effectiveStart && time < effectiveEnd) {
        return i;
      }
    }

    return lyrics.length - 1;
  }, [lyrics, currentTime]);

  const activeLine = activeLineIndex >= 0 ? lyrics[activeLineIndex] : null;
  const isInstrumental = isInstrumentalLine(activeLine);
  const activeText = activeLine?.text?.trim() || "";

  // Resolve romanized text for the active line, matching LyricsPanel's alignment logic:
  // 1. Check the lyrics line's own .romanized property
  // 2. Fall back to the raw romanized lyrics array by direct index
  // 3. Fall back to time-proximity matching against the raw array
  const activeRomanized = useMemo(() => {
    if (
      !isRomanizationEnabled ||
      !showRomanizedLyrics ||
      activeLineIndex < 0 ||
      !activeLine
    ) {
      return "";
    }
    if (isInstrumental) return "";

    // Direct property on the lyrics line itself
    if (activeLine.romanized) return activeLine.romanized;

    const rawArr = Array.isArray(rawRomanizedLyrics) ? rawRomanizedLyrics : [];
    // Direct index match
    const directMatch = rawArr[activeLineIndex];
    if (directMatch) {
      const rom =
        directMatch.romanized ||
        (directMatch as any).romanization ||
        (directMatch as any).romaji ||
        "";
      if (rom) return rom;
      // timedRomanization fallback
      const timed =
        directMatch.timedRomanization ||
        (directMatch as any).timedRomanized;
      if (Array.isArray(timed) && timed.length > 0) {
        return timed
          .map((p: any) => String(p?.text ?? "").trim())
          .filter(Boolean)
          .join(" ");
      }
    }

    // Time-proximity matching (0.12s tolerance, same as LyricsPanel)
    const lineTime = Number(activeLine.time ?? 0);
    for (const src of rawArr) {
      if (!src) continue;
      const srcTime = Number(src.time ?? -999);
      if (Math.abs(srcTime - lineTime) <= 0.12) {
        const rom =
          src.romanized ||
          (src as any).romanization ||
          (src as any).romaji ||
          "";
        if (rom) return rom;
      }
    }
    return "";
  }, [
    isRomanizationEnabled,
    showRomanizedLyrics,
    activeLineIndex,
    activeLine,
    isInstrumental,
    rawRomanizedLyrics,
  ]);

  // Resolve timedRomanization for the active line
  const activeTimedRomanization = useMemo(() => {
    if (
      !isRomanizationEnabled ||
      !showRomanizedLyrics ||
      activeLineIndex < 0 ||
      !activeLine
    ) {
      return null;
    }
    if (isInstrumental) return null;

    if (
      Array.isArray(activeLine.timedRomanization) &&
      activeLine.timedRomanization.length > 0
    ) {
      return activeLine.timedRomanization;
    }

    const rawArr = Array.isArray(rawRomanizedLyrics) ? rawRomanizedLyrics : [];
    const directMatch = rawArr[activeLineIndex];
    if (directMatch) {
      const timed =
        directMatch.timedRomanization || (directMatch as any).timedRomanized;
      if (Array.isArray(timed) && timed.length > 0) return timed;
    }

    const lineTime = Number(activeLine.time ?? 0);
    for (const src of rawArr) {
      if (!src) continue;
      const srcTime = Number(src.time ?? -999);
      if (Math.abs(srcTime - lineTime) <= 0.12) {
        const timed = src.timedRomanization || (src as any).timedRomanized;
        if (Array.isArray(timed) && timed.length > 0) return timed;
      }
    }
    return null;
  }, [
    isRomanizationEnabled,
    showRomanizedLyrics,
    activeLineIndex,
    activeLine,
    isInstrumental,
    rawRomanizedLyrics,
  ]);

  // Resolve translated text for the active line (same approach)
  const activeTranslated = useMemo(() => {
    if (
      !isTranslateEnabled ||
      !showTranslatedLyrics ||
      activeLineIndex < 0 ||
      !activeLine
    ) {
      return "";
    }
    if (isInstrumental) return "";

    if (activeLine.translated) return activeLine.translated;

    const rawArr = Array.isArray(rawTranslatedLyrics) ? rawTranslatedLyrics : [];
    const directMatch = rawArr[activeLineIndex];
    if (directMatch) {
      const trans =
        directMatch.translated ||
        (directMatch as any).translation ||
        (directMatch as any).translatedText ||
        "";
      if (trans) return trans;
    }

    const lineTime = Number(activeLine.time ?? 0);
    for (const src of rawArr) {
      if (!src) continue;
      const srcTime = Number(src.time ?? -999);
      if (Math.abs(srcTime - lineTime) <= 0.12) {
        const trans =
          src.translated ||
          (src as any).translation ||
          (src as any).translatedText ||
          "";
        if (trans) return trans;
      }
    }
    return "";
  }, [
    isTranslateEnabled,
    showTranslatedLyrics,
    activeLineIndex,
    activeLine,
    rawTranslatedLyrics,
  ]);

  // Navigate back to the full watch page
  const handleReturnToWatchPage = () => {
    const expandBtn = document.querySelector<HTMLButtonElement>(
      "ytd-miniplayer [aria-label*='Expand' i], ytd-miniplayer .ytp-miniplayer-expand-watch-page-button, ytd-miniplayer button.ytd-miniplayer",
    );
    if (expandBtn) {
      expandBtn.click();
    } else if (songInfo?.videoId) {
      window.location.href = `/watch?v=${songInfo.videoId}`;
    }
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDismissed(true);
    onDismiss?.();
  };

  const handleResetPosition = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (cardRef.current) {
      cardRef.current.style.transform = "none";
      cardRef.current.style.top = "auto";
      cardRef.current.style.left = "auto";
    }
    dragPositionRef.current = null;
    useAppStore.getState().setMiniCompanionCustomPosition(null);
  };

  // Dragging logic for adjusting position matching floating panel (LyricsPanel)
  // Uses an outer positioning div (cardRef) with GPU translate3d transforms,
  // completely isolated from Framer Motion transforms and React re-renders.
  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return; // Left click only
    if ((e.target as HTMLElement).closest("button, a")) return;

    const card = cardRef.current;
    if (!card) return;

    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const rect = card.getBoundingClientRect();
    const startLeft = rect.left;
    const startTop = rect.top;

    dragPositionRef.current = { top: startTop, left: startLeft };
    isDraggingRef.current = true;
    hasDraggedRef.current = false;
    setIsDragging(true);

    // Normalize card to exact fixed top/left coordinates immediately
    card.style.position = "fixed";
    card.style.right = "auto";
    card.style.bottom = "auto";
    card.style.left = `${startLeft}px`;
    card.style.top = `${startTop}px`;
    card.style.transform = "none";
    card.style.transition = "none";
    card.style.willChange = "transform";
    document.body.style.userSelect = "none";

    let currentDeltaX = 0;
    let currentDeltaY = 0;
    let rafId = 0;

    const onPointerMove = (moveEv: PointerEvent) => {
      const rawDeltaX = moveEv.clientX - startX;
      const rawDeltaY = moveEv.clientY - startY;

      if (Math.abs(rawDeltaX) > 2 || Math.abs(rawDeltaY) > 2) {
        hasDraggedRef.current = true;
      }

      const minLeft = 10;
      const maxLeft = Math.max(10, window.innerWidth - rect.width - 10);
      const minTop = 10;
      const maxTop = Math.max(10, window.innerHeight - rect.height - 10);

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
          if (cardRef.current) {
            cardRef.current.style.transform = `translate3d(${currentDeltaX}px, ${currentDeltaY}px, 0)`;
          }
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

      if (cardRef.current) {
        cardRef.current.style.transform = "none";
        cardRef.current.style.willChange = "auto";
      }

      if (hasDraggedRef.current) {
        const finalLeft = Math.round(startLeft + currentDeltaX);
        const finalTop = Math.round(startTop + currentDeltaY);

        if (cardRef.current) {
          cardRef.current.style.left = `${finalLeft}px`;
          cardRef.current.style.top = `${finalTop}px`;
          cardRef.current.style.right = "auto";
          cardRef.current.style.bottom = "auto";
        }

        const finalPos = { top: finalTop, left: finalLeft };
        useAppStore.getState().setMiniCompanionCustomPosition(finalPos);
      } else if (!hasCustomPos) {
        // Just a click, revert to default bottom/right anchoring
        if (cardRef.current) {
          cardRef.current.style.top = "auto";
          cardRef.current.style.left = "auto";
          cardRef.current.style.bottom = `${bottomOffset}px`;
          cardRef.current.style.right = `${rightOffset}px`;
        }
      }

      dragPositionRef.current = null;
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

  // Instrumental animation (liquid wave fill with white, matching KaraokeLyricDisplay / CollapsedLyricsPreview)
  const renderInstrumental = (fallbackStart?: number, fallbackDuration?: number) => {
    const lineStart =
      fallbackStart !== undefined ? fallbackStart : Number(activeLine?.time ?? 0);
    const nextLine = lyrics?.[activeLineIndex + 1];
    const lineDuration = Math.max(
      fallbackDuration !== undefined
        ? fallbackDuration
        : Number(
            activeLine?.duration ?? (nextLine ? nextLine.time - lineStart : 3),
          ),
      0.5,
    );
    const lineEnd = lineStart + lineDuration;
    let progress = 0;
    // Readiness gate: while offset is not resolved, hold liquid at 0%
    if (!isOffsetResolved) {
      progress = 0;
    } else if (currentTime >= lineEnd) {
      progress = 1;
    } else if (currentTime >= lineStart) {
      progress = Math.min(
        1,
        Math.max(0, (currentTime - lineStart) / lineDuration),
      );
    } else {
      progress = 0;
    }

    // Liquid level: at progress 0, Y = 22.5; at progress 1, Y = 2.0 (matching karaoke)
    const liquidY = 22.5 - progress * 20.5;
    const waveAmp = reduceAnimations ? 0 : 0.65;
    const phase = currentTime * 4.2;
    const y1 = liquidY + Math.sin(phase) * waveAmp;
    const y2 = liquidY - Math.sin(phase) * waveAmp;

    const wavePath =
      progress >= 1
        ? "M -2 0 L 26 0 L 26 26 L -2 26 Z"
        : progress <= 0
        ? "M -2 25 L 26 25 L 26 26 L -2 26 Z"
        : `M -2 ${liquidY.toFixed(2)} Q 5 ${y1.toFixed(2)} 12 ${liquidY.toFixed(2)} Q 19 ${y2.toFixed(2)} 26 ${liquidY.toFixed(2)} L 26 26 L -2 26 Z`;

    const clipId = `mini-inst-clip-${activeLineIndex < 0 ? "intro" : activeLineIndex}`;

    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "28px",
        }}
      >
        <svg
          style={{
            width: "24px",
            height: "24px",
          }}
          viewBox="0 0 24 24"
        >
          <defs>
            <clipPath id={clipId}>
              <path d={wavePath} />
            </clipPath>
          </defs>
          {/* Background unfilled note (translucent white) */}
          <path d={INSTRUMENTAL_NOTE_PATH} fill="rgba(255, 255, 255, 0.32)" />
          {/* Liquid filling note (luminous white matching karaoke) */}
          <path
            d={INSTRUMENTAL_NOTE_PATH}
            fill="#ffffff"
            clipPath={`url(#${clipId})`}
          />
        </svg>
      </div>
    );
  };

  // Single lyrics line with swipe (better-lyrics) or archivetune animation
  const renderSingleLineLyrics = () => {
    if (!activeLine || activeLineIndex < 0) {
      if (lyrics && lyrics.length > 0) {
        const firstVocalTime = Number(lyrics[0]?.time ?? 0);
        return renderInstrumental(0, Math.max(firstVocalTime, 3));
      }
      return null;
    }

    if (isInstrumental) {
      return renderInstrumental();
    }

    const isCJK =
      /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u.test(
        activeText,
      );
    const rawParts = activeLine.parts;
    const lineStart = Number(activeLine.time ?? 0);
    const nextLine = lyrics?.[activeLineIndex + 1];
    const rawInterval = nextLine
      ? Math.max(0.5, Number(nextLine.time) - lineStart)
      : Math.max(0.5, Number(activeLine.duration) || 3.5);

    let wordObjects: TimedKaraokeWord[];

    if (!rawParts || rawParts.length === 0) {
      wordObjects = generateLineSyncedWords(
        activeText,
        lineStart,
        rawInterval,
        Boolean(activeLine.duration && activeLine.duration > 0),
        Number(activeLine.duration),
      );
      if (wordObjects.length === 0) {
        return (
          <span style={{ color: "var(--lyrical-text-primary)" }}>
            {activeText}
          </span>
        );
      }
    } else {
      const hasDurations = rawParts.some(
        (p: any) => Number(p.duration || 0) > 0,
      );
      const baseParts: TimedKaraokeWord[] = hasDurations
        ? rawParts.map((p: any) => ({
            text: p.text,
            time: Number(p.time ?? lineStart),
            duration: Math.max(Number(p.duration ?? 0), 0.12),
          }))
        : rawParts.map((p: any, i: number) => {
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

      if (isCJK) {
        // Expand multi-character CJK parts so each Japanese/Chinese character springs individually!
        wordObjects = [];
        for (const bp of baseParts) {
          const chars = Array.from(bp.text);
          if (chars.length <= 1) {
            wordObjects.push(bp);
          } else {
            const charDuration = bp.duration / chars.length;
            chars.forEach((c, idx) => {
              wordObjects.push({
                text: c,
                time: bp.time + idx * charDuration,
                duration: Math.max(charDuration, 0.1),
                trailingSpace: idx === chars.length - 1 && bp.trailingSpace,
              });
            });
          }
        }
      } else {
        wordObjects = baseParts;
      }
    }

    const shouldInsertSpaces = /\s/.test(activeText);
    const nextLineTime = nextLine
      ? Number(nextLine.time ?? Infinity)
      : Infinity;
    const endLead = nextLine
      ? getLineTransitionLead(lineStart, nextLineTime, activeLine?.parts)
      : 0;
    const unmountDeadline = Math.max(
      lineStart + 0.1,
      nextLineTime - endLead - 0.02,
    );

    return (
      <div
        key={`mini-line-${activeLineIndex}`}
        className={
          lyricsAnimationStyle === "archivetune"
            ? "at-lyrics--line at-lyrics--active"
            : "lyrical-collapsed-original"
        }
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "flex-start",
          textAlign: "left",
          gap: "0px",
          width: "100%",
          fontSize: "14px",
          fontWeight: "650",
          lineHeight: "1.4",
        }}
      >
        {wordObjects.map((wordObj, index) => {
          const start = wordObj.time;
          const duration = Math.max(wordObj.duration, 0.08);
          const wordCurrentTime = currentTime + duration * 0.1;
          const calcEnd = start + duration;
          const wordEnd = Math.max(start + 0.05, Math.min(calcEnd, unmountDeadline));
          const effectiveDuration = Math.max(wordEnd - start, 0.05);

          const isLastWord = index === wordObjects.length - 1;
          const isPast =
            currentTime >= wordEnd || wordCurrentTime >= wordEnd;
          const isActive = wordCurrentTime >= start && !isPast;

          let progress = 0;
          if (isPast || (isLastWord && nextLine && currentTime >= nextLineTime - endLead - 0.06)) {
            progress = 1;
          } else if (isActive) {
            progress = Math.min(
              1,
              Math.max(0, (wordCurrentTime - start) / effectiveDuration),
            );
          }

          if (lyricsAnimationStyle === "archivetune") {
            return (
              <React.Fragment key={`${index}-${start}-${wordObj.text}`}>
                <span
                  className={[
                    "at-lyrics--word",
                    isActive ? "at-lyrics--animating" : "",
                    isPast ? "is-past" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  data-content={wordObj.text}
                  style={
                    {
                      "--at-duration": `${effectiveDuration}s`,
                      "--at-anim-delay": "0s",
                      "--at-transition-amount-start": isPast
                        ? 1.3
                        : isActive
                          ? -0.25 + progress * 1.55
                          : -0.25,
                      "--at-transition-amount-end": isPast
                        ? 1.4
                        : isActive
                          ? -0.15 + progress * 1.55
                          : -0.15,
                      display: "inline-block",
                      position: "relative",
                      color: isPast
                        ? "var(--lyrical-text-primary, #ffffff)"
                        : "var(--at-lyric-inactive-color, rgba(255, 255, 255, 0.35))",
                    } as React.CSSProperties
                  }
                >
                  {wordObj.text}
                </span>
                {wordObj.trailingSpace !== undefined
                  ? wordObj.trailingSpace
                    ? "\u00A0"
                    : null
                  : shouldInsertSpaces && index < wordObjects.length - 1
                    ? "\u00A0"
                    : null}
              </React.Fragment>
            );
          }

          // Default: better-lyrics swipe
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
                    display: "inline-block",
                    position: "relative",
                  } as React.CSSProperties
                }
              >
                {wordObj.text}
              </span>
              {wordObj.trailingSpace !== undefined
                ? wordObj.trailingSpace
                  ? "\u00A0"
                  : null
                : shouldInsertSpaces && index < wordObjects.length - 1
                  ? "\u00A0"
                  : null}
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  const renderSingleLineRomanized = () => {
    if (!activeLine || !activeRomanized || isInstrumental) return null;

    const lineStart = Number(activeLine.time ?? 0);
    const nextLine = lyrics?.[activeLineIndex + 1];
    const rawInterval = nextLine
      ? Math.max(0.5, Number(nextLine.time) - lineStart)
      : Math.max(0.5, Number(activeLine.duration) || 3.5);

    let wordObjects: TimedKaraokeWord[];

    if (activeTimedRomanization && activeTimedRomanization.length > 0) {
      wordObjects = activeTimedRomanization.map((p: any) => ({
        text: p.text,
        time: Number(p.time ?? lineStart),
        duration: Math.max(Number(p.duration ?? 0), 0.12),
        trailingSpace: p.trailingSpace,
      }));
    } else {
      wordObjects = generateLineSyncedWords(
        activeRomanized,
        lineStart,
        rawInterval,
        Boolean(activeLine.duration && activeLine.duration > 0),
        Number(activeLine.duration),
      );
      if (wordObjects.length === 0) {
        return <span>{activeRomanized}</span>;
      }
    }

    const EARLY_PREPARE_S = 0.35;
    const nextLineTime = nextLine
      ? Number(nextLine.time ?? Infinity)
      : Infinity;
    const endLead = nextLine
      ? getLineTransitionLead(lineStart, nextLineTime, activeLine?.parts)
      : 0;
    const unmountDeadline = Math.max(
      lineStart + 0.1,
      nextLineTime - endLead - 0.02,
    );

    return wordObjects.map((wordObj, index) => {
      const start = wordObj.time;
      const duration = Math.max(wordObj.duration, 0.08);
      const wordCurrentTime = currentTime + duration * 0.1;
      const calcEnd = start + duration;
      const wordEnd = Math.max(start + 0.05, Math.min(calcEnd, unmountDeadline));
      const effectiveDuration = Math.max(wordEnd - start, 0.05);

      const isLastWord = index === wordObjects.length - 1;
      const isPast =
        currentTime >= wordEnd || wordCurrentTime >= wordEnd;
      const isActive = wordCurrentTime >= start && !isPast;

      let progress = 0;
      if (isPast || (isLastWord && nextLine && currentTime >= nextLineTime - endLead - 0.06)) {
        progress = 1;
      } else if (isActive) {
        progress = Math.min(
          1,
          Math.max(0, (wordCurrentTime - start) / effectiveDuration),
        );
      }

      if (lyricsAnimationStyle === "archivetune") {
        return (
          <React.Fragment key={`rom-${index}-${start}-${wordObj.text}`}>
            <span
              className={[
                "at-lyrics--word-rom",
                isActive ? "at-lyrics--animating" : "",
                isPast ? "is-past" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              data-content={wordObj.text}
              style={
                {
                  "--at-duration": `${effectiveDuration}s`,
                  "--at-anim-delay": "0s",
                  "--at-transition-amount-start": isPast
                    ? 1.3
                    : isActive
                      ? -0.25 + progress * 1.55
                      : -0.25,
                  "--at-transition-amount-end": isPast
                    ? 1.4
                    : isActive
                      ? -0.15 + progress * 1.55
                      : -0.15,
                  display: "inline-block",
                  position: "relative",
                } as React.CSSProperties
              }
            >
              {wordObj.text}
            </span>
            {wordObj.trailingSpace !== undefined
              ? wordObj.trailingSpace
                ? "\u00A0"
                : null
              : index < wordObjects.length - 1
                ? "\u00A0"
                : null}
          </React.Fragment>
        );
      }

      // Classic ("better-lyrics") swipe
      return (
        <React.Fragment key={`rom-${index}-${start}-${wordObj.text}`}>
          <span
            className={[
              "lyrical-mini-rom-word",
              isPast ? "is-past" : "",
              isActive ? "is-active" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            data-content={wordObj.text}
            style={
              {
                "--cw-progress": progress,
                display: "inline-block",
                position: "relative",
              } as React.CSSProperties
            }
          >
            {wordObj.text}
          </span>
          {wordObj.trailingSpace !== undefined
            ? wordObj.trailingSpace
              ? "\u00A0"
              : null
            : index < wordObjects.length - 1
              ? "\u00A0"
              : null}
        </React.Fragment>
      );
    });
  };

  if (isDismissed) return null;

  const dynamicThemeTokens = useAppStore((state) => state.dynamicThemeTokens);
  const themeVars =
    themeId === "dynamic"
      ? getThemeCssVariables("dynamic", customThemes, dynamicThemeTokens)
      : getThemeCssVariables(themeId, customThemes);
  const title = songInfo?.title || headerText;
  const artist = songInfo?.artist || "Playing on YouTube";
  const artwork =
    songInfo?.artwork ||
    (songInfo?.videoId
      ? `https://i.ytimg.com/vi/${songInfo.videoId}/hqdefault.jpg`
      : null);

  const hasCustomPos = Boolean(miniCompanionCustomPosition);
  // During drag, don't apply position from React — the card's inline styles
  // are managed directly by the drag handler to prevent jitter from re-renders.
  const positionStyle: React.CSSProperties =
    isDraggingRef.current && dragPositionRef.current
      ? {
          top: `${dragPositionRef.current.top}px`,
          left: `${dragPositionRef.current.left}px`,
          bottom: "auto",
          right: "auto",
        }
      : hasCustomPos
        ? {
            top: `${miniCompanionCustomPosition!.top}px`,
            left: `${miniCompanionCustomPosition!.left}px`,
            bottom: "auto",
            right: "auto",
          }
        : {
            bottom: `${bottomOffset}px`,
            right: `${rightOffset}px`,
            top: "auto",
            left: "auto",
          };

  return (
    <div
      ref={cardRef}
      style={{
        ...themeVars,
        position: "fixed",
        ...positionStyle,
        width: `${miniWidth}px`,
        maxWidth: "calc(100vw - 32px)",
        zIndex: 2200,
        pointerEvents: "auto",
      }}
    >
      <AnimatePresence>
        <motion.div
          key="lyrical-mini-companion-card"
          data-reduce-animations={reduceAnimations ? "true" : "false"}
          initial={{ opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.96 }}
          transition={{
            duration: reduceAnimations ? 0 : 0.24,
            ease: [0.16, 1, 0.3, 1],
          }}
          style={{
            width: "100%",
            background: "var(--lyrical-card-bg, rgba(22, 22, 28, 0.94))",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border:
              "1px solid var(--lyrical-border-soft, rgba(255, 255, 255, 0.12))",
            borderRadius: "14px",
            boxShadow:
              "0 16px 36px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.05)",
            color: "var(--lyrical-text-primary, #ffffff)",
            overflow: "hidden",
            fontFamily:
              "var(--lyrical-lyrics-font-stack, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif)",
            display: "flex",
            flexDirection: "column",
            cursor: "default",
            userSelect: "none",
          }}
        >
        {/* Scoped CSS for swipe and archivetune animations in Mini Companion */}
        <style>{`
          .lyrical-collapsed-original {
            font-size: 14px !important;
            font-weight: 650 !important;
            line-height: 1.4 !important;
            text-align: left !important;
            justify-content: flex-start !important;
            transform: none !important;
          }
          .at-lyrics--line {
            font-size: 14px !important;
            font-weight: 650 !important;
            line-height: 1.4 !important;
            text-align: left !important;
            justify-content: flex-start !important;
            transform: none !important;
          }
          .at-lyrics--line.at-lyrics--active,
          .at-lyrics--line.at-lyrics--animating {
            transform: none !important;
          }
          .at-lyrics--line .at-lyrics--word {
            font-size: 14px !important;
            font-weight: 650 !important;
          }

          .lyrical-collapsed-word {
            position: relative;
            display: inline-block;
            vertical-align: baseline;
            color: color-mix(in srgb, var(--lyrical-text-primary, #ffffff) 40%, transparent);
            transition: text-shadow 0.2s ease;
          }
          .lyrical-collapsed-word::after {
            content: attr(data-content);
            position: absolute;
            inset: 0;
            color: transparent;
            background-image: linear-gradient(
              90deg,
              var(--lyrical-text-primary, #ffffff) 0%,
              var(--lyrical-text-primary, #ffffff) calc(var(--cw-progress, 0) * 110%),
              transparent calc(var(--cw-progress, 0) * 110% + 4%)
            );
            background-clip: text;
            -webkit-background-clip: text;
            pointer-events: none;
            white-space: nowrap;
          }
          .lyrical-collapsed-word.is-past {
            color: var(--lyrical-text-primary, #ffffff);
          }
          .lyrical-collapsed-word.is-past::after {
            content: none;
          }
          .lyrical-collapsed-word.is-active {
            text-shadow: 0 0 14px color-mix(in srgb, var(--lyrical-accent, #3ea6ff) 50%, transparent);
          }

          /* Classic Romanized Word in Mini Companion */
          .lyrical-mini-rom-word {
            position: relative;
            display: inline-block;
            vertical-align: baseline;
            color: color-mix(in srgb, var(--lyrical-romanized, #86efac) 60%, transparent);
            transition: text-shadow 0.2s ease;
          }
          .lyrical-mini-rom-word::after {
            content: attr(data-content);
            position: absolute;
            inset: 0;
            color: transparent;
            background-image: linear-gradient(
              90deg,
              var(--lyrical-text-primary, #ffffff) 0%,
              var(--lyrical-text-primary, #ffffff) calc(var(--cw-progress, 0) * 110%),
              transparent calc(var(--cw-progress, 0) * 110% + 4%)
            );
            background-clip: text;
            -webkit-background-clip: text;
            pointer-events: none;
            white-space: nowrap;
          }
          .lyrical-mini-rom-word.is-past {
            color: var(--lyrical-text-primary, #ffffff);
            transition: none;
          }
          .lyrical-mini-rom-word.is-past::after {
            content: none;
          }
          .lyrical-mini-rom-word.is-active {
            /* Clean gradient fill without harsh glow halo */
          }

          .at-lyrics--word {
            display: inline-block;
            transform: translateY(0px) scale(1);
            position: relative;
            transition: transform 350ms cubic-bezier(0.175, 0.885, 0.32, 1.275);
          }
          .at-lyrics--word.at-lyrics--animating {
            animation: at-sine-float var(--at-duration, 0.3s) ease forwards;
            will-change: transform;
          }
          .at-lyrics--word.is-past {
            color: var(--lyrical-text-primary, #ffffff) !important;
          }

          /* Modern Gentle Romanized Word in Mini Companion */
          .at-lyrics--word-rom {
            display: inline-block;
            vertical-align: baseline;
            transform: translateY(0px) scale(1);
            position: relative;
            color: color-mix(in srgb, var(--lyrical-romanized, #86efac) 60%, transparent);
            transition: transform 350ms cubic-bezier(0.175, 0.885, 0.32, 1.275), color 0.2s ease;
          }
          .at-lyrics--word-rom.at-lyrics--animating {
            animation: at-sine-float var(--at-duration, 0.3s) ease forwards;
            will-change: transform;
            color: var(--lyrical-text-primary, #ffffff);
          }
          .at-lyrics--word-rom.is-past {
            color: var(--lyrical-text-primary, #ffffff) !important;
            transform: translateY(0px) scale(1);
          }

          /* Reduced animations support */
          [data-reduce-animations="true"] .lyrical-mini-rom-word::after {
            display: none !important;
          }
          [data-reduce-animations="true"] .lyrical-mini-rom-word.is-active,
          [data-reduce-animations="true"] .lyrical-mini-rom-word.is-past,
          [data-reduce-animations="true"] .at-lyrics--word-rom.is-past,
          [data-reduce-animations="true"] .at-lyrics--word-rom.at-lyrics--animating {
            animation: none !important;
            transform: none !important;
            color: var(--lyrical-text-primary, #ffffff) !important;
          }

          @keyframes at-sine-float {
            0% { transform: translateY(0px) scale(1); }
            50% { transform: translateY(-3px) scale(1.02); }
            100% { transform: translateY(0px) scale(1); }
          }
          @keyframes at-transient-glow {
            0% { filter: drop-shadow(0 0 0px var(--lyrical-text-primary, #ffffff)); }
            50% { filter: drop-shadow(0 0 8px var(--lyrical-text-primary, #ffffff)); }
            100% { filter: drop-shadow(0 0 0px transparent); }
          }
        `}</style>

        {/* Header: Draggable handle with Artwork, Title, Artist, Action Buttons */}
        <div
          onPointerDown={handlePointerDown}
          title="Drag to reposition"
          style={{
            padding: "10px 12px 8px 12px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            borderBottom:
              lyrics && lyrics.length > 0
                ? "1px solid var(--lyrical-border-soft, rgba(255, 255, 255, 0.08))"
                : "none",
            cursor: isDragging ? "grabbing" : "grab",
            transition: "background 0.18s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background =
              "var(--lyrical-card-bg-elevated, rgba(255, 255, 255, 0.04))";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
        >
          {/* Artwork with configured transition */}
          <div
            style={{
              width: "38px",
              height: "38px",
              borderRadius: "8px",
              overflow: "hidden",
              flexShrink: 0,
              background: "rgba(255, 255, 255, 0.06)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.35)",
            }}
          >
            {isAdPlaying ? (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(234, 179, 8, 0.15)",
                  color: "#eab308",
                  fontWeight: 700,
                  fontSize: "13px",
                  letterSpacing: "0.5px",
                }}
              >
                AD
              </div>
            ) : artwork ? (
              <AnimatePresence mode="wait" initial={false}>
                <motion.img
                  key={songInfo?.videoId || songInfo?.title || "mini-artwork"}
                  src={artwork}
                  alt=""
                  {...getAlbumArtMotion(albumArtTransition, reduceAnimations)}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              </AnimatePresence>
            ) : (
              <span style={{ fontSize: "16px" }}>♫</span>
            )}
          </div>

          {/* Info & Progress */}
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {isAdPlaying ? (
              <>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <span
                    style={{
                      color: "#eab308",
                      fontSize: "12.5px",
                      fontWeight: 600,
                    }}
                  >
                    Ad in progress...
                  </span>
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: "11.5px",
                    color:
                      "var(--lyrical-text-secondary, rgba(255, 255, 255, 0.65))",
                  }}
                >
                  Advertisement
                </p>
              </>
            ) : (
              <>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <CompanionTitle
                    title={title}
                    scrollLongTitles={scrollLongTitles}
                    reduceAnimations={reduceAnimations}
                    titleTransition={titleTransition}
                  />
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: "11.5px",
                    color:
                      "var(--lyrical-text-secondary, rgba(255, 255, 255, 0.65))",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {artist}
                </p>
                {showProgressBar && <MiniProgressBar />}
              </>
            )}
          </div>

          {/* Action Buttons: Reset Pos (if moved), Expand & Close */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "2px",
              marginLeft: "4px",
              flexShrink: 0,
            }}
          >
            {hasCustomPos && (
              <button
                type="button"
                onClick={handleResetPosition}
                title="Reset position above miniplayer"
                style={{
                  background: "transparent",
                  border: "none",
                  color:
                    "var(--lyrical-text-muted, rgba(255, 255, 255, 0.5))",
                  cursor: "pointer",
                  padding: "4px",
                  borderRadius: "6px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "color 0.15s, background 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color =
                    "var(--lyrical-text-primary, #ffffff)";
                  e.currentTarget.style.background =
                    "rgba(255, 255, 255, 0.08)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color =
                    "var(--lyrical-text-muted, rgba(255, 255, 255, 0.5))";
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <RotateCcw size={12} />
              </button>
            )}

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleReturnToWatchPage();
              }}
              title="Expand to Watch Page"
              style={{
                background: "transparent",
                border: "none",
                color:
                  "var(--lyrical-text-muted, rgba(255, 255, 255, 0.5))",
                cursor: "pointer",
                padding: "4px",
                borderRadius: "6px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "color 0.15s, background 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color =
                  "var(--lyrical-text-primary, #ffffff)";
                e.currentTarget.style.background =
                  "rgba(255, 255, 255, 0.08)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color =
                  "var(--lyrical-text-muted, rgba(255, 255, 255, 0.5))";
                e.currentTarget.style.background = "transparent";
              }}
            >
              <ExternalLink size={13} />
            </button>

            <button
              type="button"
              onClick={handleClose}
              title="Dismiss Companion"
              style={{
                background: "transparent",
                border: "none",
                color:
                  "var(--lyrical-text-muted, rgba(255, 255, 255, 0.5))",
                cursor: "pointer",
                padding: "4px",
                borderRadius: "6px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "color 0.15s, background 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color =
                  "var(--lyrical-text-primary, #ffffff)";
                e.currentTarget.style.background =
                  "rgba(255, 255, 255, 0.08)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color =
                  "var(--lyrical-text-muted, rgba(255, 255, 255, 0.5))";
                e.currentTarget.style.background = "transparent";
              }}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Single Synced Lyrics Line Display or Ad In Progress Banner */}
        {isAdPlaying ? (
          <div
            style={{
              padding: "10px 14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "44px",
              gap: "8px",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "3px 8px",
                borderRadius: "6px",
                background: "rgba(234, 179, 8, 0.15)",
                border: "1px solid rgba(234, 179, 8, 0.3)",
                color: "#eab308",
                fontSize: "11px",
                fontWeight: "700",
                letterSpacing: "0.5px",
                textTransform: "uppercase",
              }}
            >
              Ad in progress
            </div>
            <span
              style={{
                fontSize: "12px",
                color:
                  "var(--lyrical-text-secondary, rgba(255, 255, 255, 0.65))",
              }}
            >
              Lyrics will load when video begins
            </span>
          </div>
        ) : lyrics && lyrics.length > 0 ? (
          <div
            style={{
              padding: "10px 14px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              minHeight: "44px",
              overflow: "hidden",
              gap: "0px",
            }}
          >
            {(() => {
              const lineStart = Number(activeLine?.time ?? 0);
              const nextLine = lyrics?.[activeLineIndex + 1];
              const rawInterval = nextLine
                ? Math.max(0.5, Number(nextLine.time) - lineStart)
                : 3.5;
              const isFastTempo = rawInterval < 1.2;

              return (
                <motion.div
                  key={`line-${activeLineIndex}`}
                  initial={
                    reduceAnimations
                      ? false
                      : { opacity: 0, y: isFastTempo ? 4 : 8, scale: 0.98 }
                  }
                  animate={{
                    opacity: 1,
                    y: 0,
                    scale: 1,
                    transition: {
                      duration: reduceAnimations
                        ? 0
                        : isFastTempo
                        ? 0.12
                        : 0.20,
                      ease: [0.22, 1, 0.36, 1],
                    },
                  }}
                  style={{
                    width: "100%",
                    textAlign: "left",
                  }}
                >
                  {/* Original lyrics line */}
                  <div
                    style={{
                      fontSize: "14px",
                      fontWeight: "650",
                      lineHeight: "1.4",
                      minHeight: "28px",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    {renderSingleLineLyrics()}
                  </div>

                  {/* Romanized sub-line */}
                  {activeRomanized && !isInstrumental && (
                    <div
                      style={{
                        marginTop: "5px",
                        fontSize: "11px",
                        fontWeight: "550",
                        lineHeight: "1.3",
                        color: "var(--lyrical-romanized, #86efac)",
                        width: "fit-content",
                        maxWidth: "100%",
                        padding: "1px 6px",
                        border:
                          "1px solid color-mix(in srgb, var(--lyrical-romanized, #86efac) 18%, transparent)",
                        borderRadius: "5px",
                        background:
                          "color-mix(in srgb, var(--lyrical-romanized, #86efac) 10%, transparent)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {renderSingleLineRomanized()}
                    </div>
                  )}

                  {/* Translated sub-line */}
                  {activeTranslated && !isInstrumental && (
                    <div
                      style={{
                        marginTop: "3px",
                        fontSize: "11px",
                        fontWeight: "500",
                        lineHeight: "1.35",
                        color:
                          "var(--lyrical-translated, rgba(255, 255, 255, 0.65))",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {activeTranslated}
                    </div>
                  )}
                </motion.div>
              );
            })()}
          </div>
        ) : isLoading || (headerText && headerText.toLowerCase().includes("search")) ? (
          <div
            style={{
              padding: "10px 14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "44px",
              gap: searchingIndicatorStyle === "none" ? "0px" : "8px",
              overflow: "hidden",
              fontSize: "12px",
              fontWeight: 550,
            }}
          >
            {searchingIndicatorStyle !== "none" && (
              <SearchingVibeIcon
                vibe={searchingIndicatorStyle}
                size={18}
                reduceAnimations={reduceAnimations}
              />
            )}
            <ShinyText
              text={t("lyricsPanel_searching") || "Searching for lyrics..."}
              disabled={reduceAnimations}
              speed={2.4}
              className="lyrical-searching-text"
              color="var(--lyrical-text-secondary, rgba(255, 255, 255, 0.65))"
              shineColor="var(--lyrical-text-primary, #ffffff)"
              spread={115}
            />
          </div>
        ) : (
          <div
            style={{
              padding: "10px 14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "44px",
              overflow: "hidden",
              fontSize: "12px",
              color: "var(--lyrical-text-secondary, rgba(255, 255, 255, 0.65))",
              fontWeight: 500,
            }}
          >
            {headerText && !headerText.toLowerCase().includes("search")
              ? headerText
              : t("lyricsPanel_noLyrics") || "No lyrics found"}
          </div>
        )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default MiniCompanion;
