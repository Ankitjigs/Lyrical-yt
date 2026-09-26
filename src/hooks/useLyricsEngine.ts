import { useState, useEffect, useRef, useMemo } from "react";
import { LyricalLineStrategy } from "../modules/animations/LineStrategy";
import { ImperativeBetterStrategy } from "../modules/animations/ImperativeBetterStrategy";
import { PerWordStrategy } from "../modules/animations/PerWordStrategy";
import { ArchiveTuneStrategy } from "../modules/animations/ArchiveTuneStrategy";

function createStrategy(strategyName: string, animationStyle = "better-lyrics"): any {
  const normalizedName = strategyName.toLowerCase();

  if (animationStyle === "archivetune") {
    if (
      normalizedName.includes("syllable") ||
      normalizedName.includes("better") ||
      normalizedName.includes("word")
    ) {
      return new ArchiveTuneStrategy();
    }
  }

  if (normalizedName.includes("syllable") || normalizedName.includes("better")) {
    return new ImperativeBetterStrategy();
  }

  if (normalizedName.includes("word")) {
    return new PerWordStrategy();
  }

  return new LyricalLineStrategy();
}

function buildLyricsFingerprint(
  rawLyrics: any[] | null | undefined,
  strategyName: string,
  resetKey: string,
  animationStyle = "better-lyrics",
) {
  if (!rawLyrics || rawLyrics.length === 0) {
    return `${strategyName}|${animationStyle}|${resetKey}|empty`;
  }

  const lastIndex = rawLyrics.length - 1;
  const middleIndex = Math.floor(lastIndex / 2);
  const sampleIndexes = [...new Set([0, 1, middleIndex, lastIndex - 1, lastIndex])]
    .filter((index) => index >= 0 && index < rawLyrics.length);

  const sample = sampleIndexes
    .map((index) => {
      const line = rawLyrics[index] || {};
      const time =
        typeof line.time === "number" ? line.time.toFixed(2) : "na";
      const partsCount = Array.isArray(line.parts) ? line.parts.length : 0;
      return `${index}:${time}:${partsCount}:${line.text || ""}`;
    })
    .join("|");

  return `${strategyName}|${resetKey}|${rawLyrics.length}|${sample}`;
}

function buildLyricsContentFingerprint(rawLyrics: any[] | null | undefined, strategyName: string) {
  return buildLyricsFingerprint(rawLyrics, strategyName, "");
}

function buildExtraDataFingerprint(extraData: any = {}) {
  const romanizedLyrics = extraData?.romanizedLyrics || [];
  const translatedLyrics = extraData?.translatedLyrics || [];
  const isRomanizationEnabled = extraData?.isRomanizationEnabled ? "1" : "0";
  const isTranslateEnabled = extraData?.isTranslateEnabled ? "1" : "0";
  const sampleIndexes = [
    0,
    Math.floor(Math.max(romanizedLyrics.length, translatedLyrics.length) / 2),
    Math.max(romanizedLyrics.length, translatedLyrics.length) - 1,
  ].filter((index, position, array) => index >= 0 && array.indexOf(index) === position);

  const romanizedSample = sampleIndexes
    .map((index) => romanizedLyrics[index]?.romanized || "")
    .join("|");
  const translatedSample = sampleIndexes
    .map((index) => translatedLyrics[index]?.translated || "")
    .join("|");

  return `${isRomanizationEnabled}|${isTranslateEnabled}|${romanizedLyrics.length}|${translatedLyrics.length}|${romanizedSample}|${translatedSample}`;
}

/**
 * Hook to manage lyrics animation engine.
 * @param {string} strategyName - Name of the strategy to use ('line', 'better')
 * @param {Array} syncedLyrics - Array of styled lyrics
 * @param {object} songInfo - Current song info { currentTime, isPlaying }
 * @param {object} containerRef - Ref to the scroll container
 */
export function useLyricsEngine(
  strategyName = "line",
  rawLyrics,
  songInfo,
  containerRef,
  extraData = {},
  resetKey = "",
  lyricsAnimationStyle = "better-lyrics",
) {
  const [currentTime, setCurrentTime] = useState(0);
  const [currentLineIndex, setCurrentLineIndex] = useState(-1);
  const [isUserScrolled, setIsUserScrolled] = useState(false);

  // Note: We pass rawLyrics directly. Offset is applied in the strategy's update() method.
  const syncedLyrics = rawLyrics || [];

  // Select strategy
  const strategy = useMemo(() => {
    return createStrategy(strategyName, lyricsAnimationStyle);
  }, [strategyName, resetKey, lyricsAnimationStyle]);

  // Track previous lyrics fingerprint to detect actual content changes
  const prevLyricsFingerprintRef = useRef<string | null>(null);
  const prevLyricsContentFingerprintRef = useRef<string | null>(null);
  const prevExtraDataFingerprintRef = useRef<string | null>(null);
  const prevStrategyRef = useRef<any>(null);

  // Reset strategy when lyrics ACTUALLY change (not just re-references with same data)
  useEffect(() => {
    const strategyChanged = prevStrategyRef.current !== strategy;
    prevStrategyRef.current = strategy;

    // Build a fingerprint from lyrics content to detect real changes
    const fingerprint = buildLyricsFingerprint(
      rawLyrics,
      strategyName,
      resetKey,
      lyricsAnimationStyle,
    );
    const contentFingerprint = buildLyricsContentFingerprint(
      rawLyrics,
      strategyName,
    );
    const extraDataFingerprint = buildExtraDataFingerprint(extraData);

    const isActualChange = fingerprint !== prevLyricsFingerprintRef.current;
    const isContentChange =
      contentFingerprint !== prevLyricsContentFingerprintRef.current;
    const isLayoutChange =
      extraDataFingerprint !== prevExtraDataFingerprintRef.current;
    prevLyricsFingerprintRef.current = fingerprint;
    prevLyricsContentFingerprintRef.current = contentFingerprint;
    prevExtraDataFingerprintRef.current = extraDataFingerprint;

    if (!isActualChange && !strategyChanged && !isLayoutChange) return;

    // Smooth secondary lyrics update without destroying DOM or playback sync
    if (!isActualChange && !strategyChanged && isLayoutChange) {
      if (strategy && strategy.updateSecondaryLyrics) {
        strategy.updateSecondaryLyrics(extraData);
      }
      return;
    }

    if (strategy && strategy.reset) {
      strategy.reset();

      // FIX: Mark as programmatic so the jump to 0 isn't flagged as a manual human scroll
      if (strategy.state) {
        strategy.state.lastProgrammaticScrollTime = Date.now();
      }
    }

    // Reset scroll container to top only for genuinely new lyrics
    if (containerRef?.current && isContentChange) {
      containerRef.current.scrollTop = 0;
    }
    // Reset playback tracking only for genuine lyrics changes.
    if (isContentChange) {
      setCurrentTime(0);
      setCurrentLineIndex(-1);
      setIsUserScrolled(false);
    }
  }, [extraData, rawLyrics, strategy]);

  // Refs for strategies to access
  const refs = useRef<any>({ containerRef });
  useEffect(() => {
    refs.current.containerRef = containerRef;

    // Imperative Mount Lifecycle: ensure container is mounted whenever DOM or lyrics are ready
    if (strategy && strategy.mount && containerRef.current && syncedLyrics && syncedLyrics.length > 0) {
      const rootId = strategy.rootId || "blyrics-root";
      const root = containerRef.current.querySelector(`#${rootId}`);
      const isAlreadyMounted =
        root &&
        ((strategy.container && root.contains(strategy.container)) ||
          root.firstElementChild !== null);
      if (root && !isAlreadyMounted) {
        strategy.mount(containerRef.current, syncedLyrics, extraData);
      }
    }
  }, [containerRef.current, strategy, syncedLyrics, extraData, songInfo?.isExpanded]);

  const currentTimeRef = useRef(currentTime);
  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  // Timer Logic: Sync with Prop
  useEffect(() => {
    if (songInfo?.currentTime !== undefined) {
      setCurrentTime(songInfo.currentTime);
      currentTimeRef.current = songInfo.currentTime;
    }
  }, [songInfo?.currentTime]);

  // Animation Loop - Runs whenever playing and reacts to media events/seeking
  useEffect(() => {
    if (!syncedLyrics || syncedLyrics.length === 0) return;

    let animationFrameId: number | undefined;
    let lastTime = performance.now();

    const getVideo = () =>
      document.querySelector<HTMLVideoElement>(
        "#movie_player video, video",
      );

    const checkIsActuallyPlaying = () => {
      const video = getVideo();
      return Boolean(
        (video && !video.paused && !video.ended && video.readyState > 2) ||
          songInfo?.isPlaying,
      );
    };

    const updateStrategy = () => {
      const now = performance.now();
      const dt = (now - lastTime) / 1000;
      const safeDt = Math.min(dt, 0.1);
      lastTime = now;

      const video = getVideo();
      const isPlaying = checkIsActuallyPlaying();

      let trackedTime = video ? video.currentTime : currentTimeRef.current;

      if (isPlaying && !video) {
        setCurrentTime((t) => {
          const next = t + safeDt;
          currentTimeRef.current = next;
          return next;
        });
        trackedTime += safeDt;
      }

      // Special Imperative Update Loop
      if (strategy && strategy.isImperative) {
        strategy.update({
          currentTime: trackedTime,
          offset: songInfo?.offset || 0,
          isPlaying,
        });
        return;
      }

      if (strategy && strategy.update) {
        // Skip LineStrategy scroll when LyricsPanel handles its own legacy scroll.
        if (strategy.name === "Lyrical Line") return;

        strategy.update({
          currentTime: trackedTime,
          currentLineIndex,
          enableAutoScroll: !isUserScrolled,
          refs: refs.current,
          isPlaying,
          offset: songInfo?.offset || 0,
          syncedLyrics,
        });
      }
    };

    const loop = () => {
      updateStrategy();
      if (checkIsActuallyPlaying()) {
        animationFrameId = requestAnimationFrame(loop);
      } else {
        animationFrameId = undefined;
      }
    };

    if (checkIsActuallyPlaying()) {
      animationFrameId = requestAnimationFrame(loop);
    } else {
      // Do ONE update when paused to freeze current state
      updateStrategy();
    }

    const video = getVideo();
    const onVideoSync = () => {
      updateStrategy();
      if (checkIsActuallyPlaying() && !animationFrameId) {
        lastTime = performance.now();
        animationFrameId = requestAnimationFrame(loop);
      }
    };

    video?.addEventListener("play", onVideoSync);
    video?.addEventListener("playing", onVideoSync);
    video?.addEventListener("pause", onVideoSync);
    video?.addEventListener("ended", onVideoSync);
    video?.addEventListener("seeked", onVideoSync);
    video?.addEventListener("timeupdate", onVideoSync);

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      video?.removeEventListener("play", onVideoSync);
      video?.removeEventListener("playing", onVideoSync);
      video?.removeEventListener("pause", onVideoSync);
      video?.removeEventListener("ended", onVideoSync);
      video?.removeEventListener("seeked", onVideoSync);
      video?.removeEventListener("timeupdate", onVideoSync);
    };
  }, [
    songInfo?.isPlaying,
    songInfo?.offset,
    songInfo?.isExpanded,
    strategy,
    isUserScrolled,
    syncedLyrics,
    currentLineIndex,
  ]);

  // Find Tracking Index
  useEffect(() => {
    if (syncedLyrics && syncedLyrics.length > 0) {
      const index = syncedLyrics.findIndex((line, i) => {
        const nextLine = syncedLyrics[i + 1];
        return (
          currentTime >= line.time && (!nextLine || currentTime < nextLine.time)
        );
      });

      if (index >= 0 && index !== currentLineIndex) {
        setCurrentLineIndex(index);
      }
    }
  }, [currentTime, syncedLyrics]);

  return {
    strategy,
    currentTime,
    currentLineIndex,
    isUserScrolled,
    setIsUserScrolled,
  };
}
