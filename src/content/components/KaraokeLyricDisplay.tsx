import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { LyricalLyricLine, SongInfo } from "../../types/lyrics";

interface KaraokeLyricDisplayProps {
  lyrics: LyricalLyricLine[];
  romanizedLyrics?: LyricalLyricLine[];
  translatedLyrics?: LyricalLyricLine[];
  isRomanizationEnabled: boolean;
  isTranslateEnabled: boolean;
  offset: number;
  reduceAnimations: boolean;
  songInfo?: SongInfo | null;
  fontSize?: "small" | "medium" | "large" | "xlarge";
  containerStyle?: React.CSSProperties;
}

function getActiveVideo(): HTMLVideoElement | null {
  return (
    document.querySelector<HTMLVideoElement>("#movie_player video") ||
    document.querySelector<HTMLVideoElement>("video")
  );
}

export default function KaraokeLyricDisplay({
  lyrics,
  romanizedLyrics,
  translatedLyrics,
  isRomanizationEnabled,
  isTranslateEnabled,
  offset,
  reduceAnimations,
  songInfo,
  fontSize = "medium",
  containerStyle,
}: KaraokeLyricDisplayProps) {
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);

  useEffect(() => {
    if (!lyrics || lyrics.length === 0) return;

    let rafId: number;
    let lastSetTime = -1;

    const updatePlayState = () => {
      const v = getActiveVideo();
      if (v) {
        setIsPlaying(!v.paused);
      }
    };

    const tick = () => {
      const video = getActiveVideo();
      if (video) {
        const t = Math.max(0, video.currentTime - offset);
        if (Math.abs(t - lastSetTime) > 0.016) {
          lastSetTime = t;
          setCurrentTime(t);
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    const onSync = () => {
      const video = getActiveVideo();
      if (video) {
        const t = Math.max(0, video.currentTime - offset);
        lastSetTime = t;
        setCurrentTime(t);
        setIsPlaying(!video.paused);
      }
    };

    const video = getActiveVideo();
    if (video) {
      updatePlayState();
      video.addEventListener("timeupdate", onSync);
      video.addEventListener("seeked", onSync);
      video.addEventListener("play", updatePlayState);
      video.addEventListener("pause", updatePlayState);
    }

    return () => {
      cancelAnimationFrame(rafId);
      if (video) {
        video.removeEventListener("timeupdate", onSync);
        video.removeEventListener("seeked", onSync);
        video.removeEventListener("play", updatePlayState);
        video.removeEventListener("pause", updatePlayState);
      }
    };
  }, [lyrics, offset]);

  // Active line calculation matching collapsedPreview early transition (0.35s early)
  const activeLineIndex = useMemo(() => {
    if (!lyrics || lyrics.length === 0) return -1;

    const EARLY_PREPARE_S = 0.35;
    const time = currentTime > 0 ? currentTime : 0;

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

    return Math.max(0, lyrics.length - 1);
  }, [lyrics, currentTime]);

  const activeLine = activeLineIndex >= 0 ? lyrics[activeLineIndex] : null;
  const activeOriginalText =
    activeLine?.text?.trim() ||
    (activeLine?.isInstrumental ? "Instrumental" : "");
  const activeRomanized =
    activeLineIndex >= 0
      ? romanizedLyrics?.[activeLineIndex]?.romanized ||
        activeLine?.romanized ||
        ""
      : "";
  const activeTranslated =
    activeLineIndex >= 0
      ? translatedLyrics?.[activeLineIndex]?.translated ||
        activeLine?.translated ||
        ""
      : "";

  const renderOriginal = () => {
    if (!activeLine) {
      return songInfo?.title || "";
    }

    // Instrumental section
    if (activeLine.isInstrumental) {
      const lineStart = Number(activeLine.time ?? 0);
      const nextLine = lyrics?.[activeLineIndex + 1];
      const lineDuration = Math.max(
        Number(
          activeLine.duration ?? (nextLine ? nextLine.time - lineStart : 3),
        ),
        0.5,
      );
      const lineEnd = lineStart + lineDuration;
      let progress = 0;
      if (currentTime >= lineEnd) {
        progress = 1;
      } else if (currentTime >= lineStart) {
        progress = Math.min(
          1,
          Math.max(0, (currentTime - lineStart) / lineDuration),
        );
      }

      const clipY = 21 - progress * 18;
      const NOTE_PATH =
        "M10 21q-1.65 0-2.825-1.175T6 17t1.175-2.825T10 13q.575 0 1.063.138t.937.412V4q0-.425.288-.712T13 3h4q.425 0 .713.288T18 4v2q0 .425-.288.713T17 7h-3v10q0 1.65-1.175 2.825T10 21";
      const clipId = `karaoke-inst-clip-${activeLineIndex}`;

      return (
        <div className="lyrical-karaoke-instrumental">
          <svg className="lyrical-karaoke-inst-icon" viewBox="0 0 24 24">
            <defs>
              <clipPath id={clipId}>
                <rect x="0" y={clipY} width="24" height={24 - clipY} />
              </clipPath>
            </defs>
            <path d={NOTE_PATH} fill="rgba(255, 255, 255, 0.38)" />
            <path
              d={NOTE_PATH}
              fill="var(--lyrical-accent, #38bdf8)"
              clipPath={`url(#${clipId})`}
            />
          </svg>
          <span className="lyrical-karaoke-inst-text">♪ Instrumental ♪</span>
        </div>
      );
    }

    const rawParts = activeLine.parts;

    // Line-Synced fallback when syllable parts are not available
    if (!rawParts || rawParts.length === 0) {
      const lineStart = Number(activeLine.time ?? 0);
      const nextLine = lyrics?.[activeLineIndex + 1];
      const lineDuration = Math.max(
        Number(
          activeLine.duration ?? (nextLine ? nextLine.time - lineStart : 3),
        ),
        0.5,
      );
      const isPast = currentTime >= lineStart + lineDuration;
      const isActive = currentTime >= lineStart && !isPast;
      let progress = 0;
      if (isPast) {
        progress = 1;
      } else if (isActive) {
        progress = Math.min(
          1,
          Math.max(0, (currentTime - lineStart) / lineDuration),
        );
      }

      return (
        <span
          className={[
            "lyrical-karaoke-word",
            isPast ? "is-past" : "",
            isActive ? "is-active" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          data-content={activeOriginalText}
          style={
            {
              "--cw-progress": progress,
              "--cw-duration": `${lineDuration}s`,
            } as React.CSSProperties
          }
        >
          {activeOriginalText}
        </span>
      );
    }

    const lineStart = Number(activeLine.time ?? 0);
    const nextLine = lyrics?.[activeLineIndex + 1];
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

    const shouldInsertSpaces = /\s/.test(activeOriginalText);
    const EARLY_PREPARE_S = 0.35;
    const nextLineTime = nextLine
      ? Number(nextLine.time ?? Infinity)
      : Infinity;
    const unmountDeadline = nextLineTime - EARLY_PREPARE_S - 0.1;

    return wordObjects.map((wordObj, index) => {
      const start = wordObj.time;
      const duration = wordObj.duration;
      const wordCurrentTime = currentTime + duration * 0.1;

      const calcEnd = start + duration;
      const wordEnd = Math.min(calcEnd, unmountDeadline);
      const effectiveDuration = Math.max(wordEnd - start, 0.1);

      const isPast = currentTime >= wordEnd || wordCurrentTime >= wordEnd;
      const isActive = wordCurrentTime >= start && !isPast;

      let progress = 0;
      if (isPast) {
        progress = 1;
      } else if (isActive) {
        progress = Math.min(
          1,
          Math.max(0, (wordCurrentTime - start) / effectiveDuration),
        );
      }

      return (
        <React.Fragment key={`${index}-${start}-${wordObj.text}`}>
          <span
            className={[
              "lyrical-karaoke-word",
              isPast ? "is-past" : "",
              isActive ? "is-active" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            data-content={wordObj.text}
            style={
              {
                "--cw-progress": progress,
                "--cw-duration": `${effectiveDuration}s`,
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

  const renderRomanized = () => {
    if (!activeRomanized || activeLineIndex < 0) return null;

    const lineStart = Number(activeLine?.time ?? 0);
    const nextLine = lyrics?.[activeLineIndex + 1];
    const lineDuration = Math.max(
      Number(
        activeLine?.duration ?? (nextLine ? nextLine.time - lineStart : 3),
      ),
      0.5,
    );

    const romData = romanizedLyrics?.[activeLineIndex];
    const timedRom = romData?.timedRomanization || activeLine?.timedRomanization;

    let wordObjects: Array<{ text: string; time: number; duration: number }>;

    if (timedRom && timedRom.length > 0) {
      wordObjects = timedRom.map((p: any) => ({
        text: p.text,
        time: Number(p.time ?? lineStart),
        duration: Math.max(Number(p.duration ?? 0), 0.12),
      }));
    } else {
      const rawWords = activeRomanized
        .split(/\s+/)
        .filter((w: string) => w.length > 0);
      if (rawWords.length === 0) return activeRomanized;

      // Distribute accurately across lineStart and lineDuration matching ArchiveTuneStrategy
      const totalChars = rawWords.reduce(
        (sum: number, w: string) => sum + w.length,
        0,
      );
      let tCursor = lineStart;
      wordObjects = rawWords.map((w: string) => {
        const wordDuration = (w.length / totalChars) * lineDuration;
        const obj = {
          text: w,
          time: tCursor,
          duration: Math.max(wordDuration, 0.12),
        };
        tCursor += wordDuration;
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
      const wordCurrentTime = currentTime + duration * 0.1;

      const calcEnd = start + duration;
      const wordEnd = Math.min(calcEnd, unmountDeadline);
      const effectiveDuration = Math.max(wordEnd - start, 0.1);

      const isPast = currentTime >= wordEnd || wordCurrentTime >= wordEnd;
      const isActive = wordCurrentTime >= start && !isPast;

      let progress = 0;
      if (isPast) {
        progress = 1;
      } else if (isActive) {
        progress = Math.min(
          1,
          Math.max(0, (wordCurrentTime - start) / effectiveDuration),
        );
      }

      return (
        <React.Fragment key={`rom-${index}-${start}-${wordObj.text}`}>
          <span
            className={[
              "lyrical-karaoke-rom-word",
              isPast ? "is-past" : "",
              isActive ? "is-active" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            data-content={wordObj.text}
            style={
              {
                "--cw-progress": progress,
                "--cw-duration": `${effectiveDuration}s`,
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
    <div className="lyrical-karaoke-container" style={containerStyle}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${activeLineIndex}-${activeLine?.time ?? 0}`}
          className="lyrical-karaoke-line-wrapper"
          data-paused={!isPlaying ? "true" : undefined}
          initial={
            reduceAnimations ? false : { opacity: 0, y: 18, scale: 0.96 }
          }
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={
            reduceAnimations
              ? { opacity: 0 }
              : { opacity: 0, y: -12, scale: 0.98 }
          }
          transition={
            reduceAnimations
              ? { duration: 0.15 }
              : {
                  type: "spring",
                  stiffness: 340,
                  damping: 24,
                  mass: 0.75,
                }
          }
        >
          <div className="lyrical-karaoke-original">{renderOriginal()}</div>

          {activeRomanized && isRomanizationEnabled && (
            <motion.div
              className="lyrical-karaoke-romanized"
              initial={reduceAnimations ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, delay: 0.04 }}
            >
              {renderRomanized()}
            </motion.div>
          )}

          {activeTranslated && isTranslateEnabled && (
            <motion.div
              className="lyrical-karaoke-translated"
              initial={reduceAnimations ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, delay: 0.07 }}
            >
              {activeTranslated}
            </motion.div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
