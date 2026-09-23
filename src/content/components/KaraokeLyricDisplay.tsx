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

export interface TimedKaraokeWord {
  text: string;
  time: number;
  duration: number;
  trailingSpace?: boolean;
}

/**
 * Calculates optimal singing duration and allocates word-by-word timestamps
 * for line-synced lyrics without syllable timestamps.
 *
 * Implements:
 * 1. Active singing ratio with breath/rest buffer (prevents unmount cutoff)
 * 2. Word count & character heuristic (natural pacing for short vs long lines)
 * 3. Proportional token distribution (sequential word illumination)
 * 4. Language-aware tokenization:
 *    - CJK (Japanese / Chinese): Tokenized character-by-character (each Kana/Kanji is a mora/syllable)
 *      with clause spaces preserved.
 *    - Non-CJK (Hindi, English, Spanish, etc.): Tokenized word-by-word, keeping ligatures intact.
 */
export function generateLineSyncedWords(
  text: string,
  lineStart: number,
  rawInterval: number,
  hasExplicitDuration: boolean,
  explicitDuration?: number,
): TimedKaraokeWord[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  // Detect CJK characters (Hiragana, Katakana, Kanji / Hanzi)
  const isCJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u.test(trimmed);

  interface RawToken {
    text: string;
    trailingSpace: boolean;
  }

  const tokens: RawToken[] = [];

  if (isCJK) {
    // For Japanese/Chinese: Each character is a syllable unit.
    // Preserve spaces only between clauses if the lyricist included them.
    const clauses = trimmed.split(/\s+/).filter(Boolean);
    clauses.forEach((clause, clauseIdx) => {
      const chars = Array.from(clause);
      const isLastClause = clauseIdx === clauses.length - 1;
      chars.forEach((char, charIdx) => {
        const isLastCharInClause = charIdx === chars.length - 1;
        tokens.push({
          text: char,
          trailingSpace: isLastCharInClause && !isLastClause,
        });
      });
    });
  } else {
    // For spaced languages (Hindi, English, Spanish, Korean, etc.):
    // Tokenize word-by-word. Preserves Devanagari ligatures and natural phrasing.
    const words = trimmed.split(/\s+/).filter(Boolean);
    words.forEach((w, idx) => {
      tokens.push({
        text: w,
        trailingSpace: idx < words.length - 1,
      });
    });
  }

  if (tokens.length === 0) return [];

  // Estimate singing duration based on token count and language density
  // Human singing average: ~0.32s per word (spaced) or ~0.22s per character (CJK)
  const estDuration = isCJK
    ? Math.max(0.8, tokens.length * 0.22 + 0.25)
    : Math.max(0.8, tokens.length * 0.32 + 0.25);

  const EARLY_PREPARE_S = 0.35;
  // Maximum safe duration: line unmounts at rawInterval - EARLY_PREPARE_S.
  // We reserve an additional 0.25s rest/breath buffer so the swipe completes to 100%
  // and stays fully lit before transitioning to the next line.
  const maxSafeDuration = Math.max(0.35, rawInterval - EARLY_PREPARE_S - 0.25);

  let effectiveDuration: number;

  if (hasExplicitDuration && explicitDuration && explicitDuration > 0) {
    effectiveDuration = Math.min(explicitDuration, maxSafeDuration);
  } else {
    // Target ~76% of raw interval to leave a natural singing pause
    let target = rawInterval * 0.76;

    if (estDuration > target) {
      // Word-heavy or fast-tempo line: give it as much safe time as possible
      target = Math.min(maxSafeDuration, estDuration);
    } else {
      // Few words with long gap (e.g. 3 words in 7s gap): don't crawl slowly;
      // bound duration to realistic singing speed
      target = Math.max(Math.min(target, estDuration * 1.25), 1.2);
    }

    effectiveDuration = Math.min(maxSafeDuration, Math.max(0.5, target));
  }

  // Weight distribution: word length + baseline weight to prevent short words from being instantaneous
  const weights = tokens.map((token) => Math.max(1, token.text.length) + (isCJK ? 0.5 : 1.5));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);

  let tCursor = lineStart;
  return tokens.map((token, idx) => {
    const wordDuration = (weights[idx] / totalWeight) * effectiveDuration;
    const clampedDuration = Math.max(wordDuration, 0.10);
    const item: TimedKaraokeWord = {
      text: token.text,
      time: tCursor,
      duration: clampedDuration,
      trailingSpace: token.trailingSpace,
    };
    tCursor += wordDuration;
    return item;
  });
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

      // Liquid level: at progress 0, Y = 22.5 (below note bottom at 21)
      // at progress 1, Y = 2.0 (above note top at 3)
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

      const NOTE_PATH =
        "M10 21q-1.65 0-2.825-1.175T6 17t1.175-2.825T10 13q.575 0 1.063.138t.937.412V4q0-.425.288-.712T13 3h4q.425 0 .713.288T18 4v2q0 .425-.288.713T17 7h-3v10q0 1.65-1.175 2.825T10 21";
      const clipId = `karaoke-inst-clip-${activeLineIndex}`;

      return (
        <div className="lyrical-karaoke-instrumental">
          <svg className="lyrical-karaoke-inst-icon" viewBox="0 0 24 24">
            <defs>
              <clipPath id={clipId}>
                <path d={wavePath} />
              </clipPath>
            </defs>
            {/* Background unfilled note (translucent) */}
            <path d={NOTE_PATH} fill="rgba(255, 255, 255, 0.32)" />
            {/* Liquid filling note (luminous white with subtle theme aura) */}
            <path
              d={NOTE_PATH}
              fill="#ffffff"
              clipPath={`url(#${clipId})`}
            />
          </svg>
        </div>
      );
    }

    const rawParts = activeLine.parts;
    const lineStart = Number(activeLine.time ?? 0);
    const nextLine = lyrics?.[activeLineIndex + 1];
    const rawInterval = nextLine
      ? Math.max(0.5, Number(nextLine.time) - lineStart)
      : Math.max(0.5, Number(activeLine.duration) || 3.5);

    let wordObjects: TimedKaraokeWord[];

    // Line-Synced: When syllable parts are not available, pace words proportionally
    if (!rawParts || rawParts.length === 0) {
      wordObjects = generateLineSyncedWords(
        activeOriginalText,
        lineStart,
        rawInterval,
        Boolean(activeLine.duration && activeLine.duration > 0),
        Number(activeLine.duration),
      );

      if (wordObjects.length === 0) {
        return activeOriginalText;
      }
    } else {
      const hasDurations = rawParts.some((p: any) => Number(p.duration || 0) > 0);

      wordObjects = hasDurations
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
    }

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
          {wordObj.trailingSpace !== undefined
            ? (wordObj.trailingSpace ? " " : null)
            : (shouldInsertSpaces && index < wordObjects.length - 1 ? " " : null)}
        </React.Fragment>
      );
    });
  };

  const renderRomanized = () => {
    if (!activeRomanized || activeLineIndex < 0) return null;

    const lineStart = Number(activeLine?.time ?? 0);
    const nextLine = lyrics?.[activeLineIndex + 1];
    const rawInterval = nextLine
      ? Math.max(0.5, Number(nextLine.time) - lineStart)
      : Math.max(0.5, Number(activeLine?.duration) || 3.5);

    const romData = romanizedLyrics?.[activeLineIndex];
    const timedRom = romData?.timedRomanization || activeLine?.timedRomanization;

    let wordObjects: TimedKaraokeWord[];

    if (timedRom && timedRom.length > 0) {
      wordObjects = timedRom.map((p: any) => ({
        text: p.text,
        time: Number(p.time ?? lineStart),
        duration: Math.max(Number(p.duration ?? 0), 0.12),
      }));
    } else {
      wordObjects = generateLineSyncedWords(
        activeRomanized,
        lineStart,
        rawInterval,
        Boolean(activeLine?.duration && activeLine.duration > 0),
        Number(activeLine?.duration),
      );
      if (wordObjects.length === 0) return activeRomanized;
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
          {wordObj.trailingSpace !== undefined
            ? (wordObj.trailingSpace ? " " : null)
            : (index < wordObjects.length - 1 ? " " : null)}
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

          {!activeLine?.isInstrumental && activeRomanized && isRomanizationEnabled && (
            <motion.div
              className="lyrical-karaoke-romanized"
              initial={reduceAnimations ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, delay: 0.04 }}
            >
              {renderRomanized()}
            </motion.div>
          )}

          {!activeLine?.isInstrumental && activeTranslated && isTranslateEnabled && (
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
