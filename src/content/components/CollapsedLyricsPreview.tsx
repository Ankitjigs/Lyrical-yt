import React, { useState, useEffect, useMemo } from "react";
import { AnimatePresence, motion } from "motion/react";
import { t } from "../../i18n";
import type { LyricalLyricLine, SongInfo } from "../../types/lyrics";

interface CollapsedLyricsPreviewProps {
  lyrics: LyricalLyricLine[];
  offset: number;
  songInfo: SongInfo | null;
  activeIndex: number;
  reduceAnimations: boolean;
  romanizedLyrics: any[];
  translatedLyrics: any[];
}

export const CollapsedLyricsPreview: React.FC<CollapsedLyricsPreviewProps> = ({
  lyrics,
  offset,
  songInfo,
  activeIndex,
  reduceAnimations,
  romanizedLyrics,
  translatedLyrics,
}) => {
  const [collapsedPreviewTime, setCollapsedPreviewTime] = useState(0);

  useEffect(() => {
    if (!lyrics || lyrics.length === 0) return;

    let rafId: number | null = null;
    let lastSetTime = -1;
    let cachedVideo: HTMLVideoElement | null = null;

    const getVideo = () => {
      if (!cachedVideo || !cachedVideo.isConnected) {
        cachedVideo = document.querySelector("video");
      }
      return cachedVideo;
    };

    const isPlaying = (v: HTMLVideoElement | null) => {
      return Boolean(v && !v.paused && !v.ended && v.readyState > 2);
    };

    const tick = () => {
      const video = getVideo();
      if (video) {
        const t = Math.max(0, video.currentTime - offset);
        if (Math.abs(t - lastSetTime) > 0.016) {
          lastSetTime = t;
          setCollapsedPreviewTime(t);
        }
      }
      if (isPlaying(video)) {
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

    const onPlay = () => startTick();
    const onPauseOrEnded = () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      tick();
    };
    const onSeekOrTimeUpdate = () => {
      tick();
      const video = getVideo();
      if (isPlaying(video) && !rafId) {
        startTick();
      }
    };

    const video = getVideo();
    tick();
    if (isPlaying(video)) {
      startTick();
    }

    video?.addEventListener("play", onPlay);
    video?.addEventListener("playing", onPlay);
    video?.addEventListener("pause", onPauseOrEnded);
    video?.addEventListener("ended", onPauseOrEnded);
    video?.addEventListener("seeked", onSeekOrTimeUpdate);
    video?.addEventListener("timeupdate", onSeekOrTimeUpdate);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      const v = getVideo();
      v?.removeEventListener("play", onPlay);
      v?.removeEventListener("playing", onPlay);
      v?.removeEventListener("pause", onPauseOrEnded);
      v?.removeEventListener("ended", onPauseOrEnded);
      v?.removeEventListener("seeked", onSeekOrTimeUpdate);
      v?.removeEventListener("timeupdate", onSeekOrTimeUpdate);
    };
  }, [lyrics, offset]);

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
          <path d={NOTE_PATH} className="lyrical-collapsed-inst-bg" />
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

    const shouldInsertSpaces = /\s/.test(collapsedOriginalText);
    const EARLY_PREPARE_S = 0.35;
    const nextLineTime = nextLine
      ? Number(nextLine.time ?? Infinity)
      : Infinity;
    const unmountDeadline = nextLineTime - EARLY_PREPARE_S - 0.1;

    return wordObjects.map((wordObj, index) => {
      const start = wordObj.time;
      const duration = wordObj.duration;
      const currentTime = collapsedPreviewTime + duration * 0.1;
      const calcEnd = start + duration;
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
      const currentTime = collapsedPreviewTime + duration * 0.1;

      const calcEnd = start + duration;
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
  );
};

export default CollapsedLyricsPreview;
