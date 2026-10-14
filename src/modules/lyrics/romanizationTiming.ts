import type { LyricalLyricLine, LyricalLyricPart } from "../../types/lyrics";

/**
 * Derive per-word romanization timings from any source's available timing.
 * Prefer exact word-to-part spans when source tokenization maps cleanly; for
 * character-granular or differently-tokenized sources, pace romanized words
 * over the source's timed parts. Line-level sources use the line's time window.
 * Return null only when no usable line or part timing is available.
 */
export function buildWordTimedRomanization(
  line: LyricalLyricLine | null | undefined,
  romanizedText: string | null | undefined,
  nextLine?: LyricalLyricLine | null,
): LyricalLyricPart[] | null {
  const text = String(romanizedText || "").trim();
  const parts = Array.isArray(line?.parts)
    ? line.parts.filter((part) => part && typeof part.text === "string")
    : [];
  const sourceText = String(line?.text || parts.map((part) => part.text).join(""));
  if (!text || !sourceText || parts.length === 0) return null;

  const romanizedTokens = text.split(/\s+/).filter(Boolean);
  if (romanizedTokens.length === 0) return null;

  // Segmenter is an optimization for exact token-to-token timing. Its absence
  // must not disable timing for a source that still provides line/part times.
  let sourceTokens: Array<{ start: number; end: number }> = [];
  const Segmenter = (Intl as any).Segmenter;
  if (typeof Segmenter === "function") {
    try {
      const locale = /[\u3040-\u30ff]/.test(sourceText)
        ? "ja"
        : /[\uac00-\ud7af]/.test(sourceText)
          ? "ko"
          : /[\u4e00-\u9fff]/.test(sourceText)
            ? "zh"
            : undefined;
      const segments = new Segmenter(locale, { granularity: "word" }).segment(sourceText);
      sourceTokens = Array.from(segments as Iterable<any>)
        .filter((segment) => segment.isWordLike)
        .map((segment) => ({
          start: Number(segment.index),
          end: Number(segment.index) + String(segment.segment).length,
        }));
    } catch {
      // Continue with interval-weighted timing below.
    }
  }

  // Build a non-whitespace character map for both representations. This allows
  // harmless spacing differences while still rejecting content mismatches.
  const lineStart = finite(line?.startTimeMs)
    ? Number(line?.startTimeMs) / 1000
    : finite(line?.time)
      ? Number(line?.time)
      : 0;
  const explicitLineEnd = finite(line?.durationMs)
    ? lineStart + Number(line?.durationMs) / 1000
    : finite(line?.duration) && Number(line?.duration) > 0
      ? lineStart + Number(line?.duration)
      : null;
  const nextLineStart = finite(nextLine?.startTimeMs)
    ? Number(nextLine?.startTimeMs) / 1000
    : finite(nextLine?.time)
      ? Number(nextLine?.time)
      : null;
  const lineEnd = explicitLineEnd ?? nextLineStart;

  const sourceChars: string[] = [];
  const sourceIndexToCompact: number[] = new Array(sourceText.length);
  for (let index = 0; index < sourceText.length; index += 1) {
    const char = sourceText[index];
    if (/\s/.test(char)) continue;
    sourceIndexToCompact[index] = sourceChars.length;
    sourceChars.push(char);
  }

  const partChars: string[] = [];
  const partIndexes: number[] = [];
  parts.forEach((part, partIndex) => {
    for (let index = 0; index < part.text.length; index += 1) {
      const char = part.text[index];
      if (/\s/.test(char)) continue;
      partChars.push(char);
      partIndexes.push(partIndex);
    }
  });

  const partsMatchSourceText = sourceChars.length === partChars.length &&
    sourceChars.every((char, index) => char === partChars[index]);
  const sourceWordPartRanges: Array<[number, number]> = [];
  let exactWordMapping = partsMatchSourceText && sourceTokens.length > 0 &&
    sourceTokens.length === romanizedTokens.length;
  if (exactWordMapping) {
    for (const token of sourceTokens) {
      const compactPositions: number[] = [];
      for (let index = token.start; index < token.end; index += 1) {
        const compactIndex = sourceIndexToCompact[index];
        if (compactIndex !== undefined) compactPositions.push(compactIndex);
      }
      if (compactPositions.length === 0) {
        exactWordMapping = false;
        break;
      }
      const coveredParts = [...new Set(compactPositions.map((index) => partIndexes[index]))]
        .sort((a, b) => a - b);
      const firstPart = coveredParts[0];
      const lastPart = coveredParts[coveredParts.length - 1];
      if (lastPart - firstPart + 1 !== coveredParts.length) exactWordMapping = false;
      sourceWordPartRanges.push([firstPart, lastPart]);
    }
  }

  const partStarts = parts.map((part, index) => {
    if (finite(part.startTimeMs)) return Number(part.startTimeMs) / 1000;
    if (finite(part.time)) return Number(part.time);
    return index === 0 ? lineStart : null;
  });

  const partWindows = parts.flatMap((part, index) => {
    if (!part.text.trim()) return [];
    const start = partStarts[index];
    if (start === null || start === undefined) return [];

    const explicitDuration = finite(part.durationMs)
      ? Number(part.durationMs) / 1000
      : finite(part.duration) && Number(part.duration) > 0
        ? Number(part.duration)
        : null;
    const nextTimedStart = partStarts
      .slice(index + 1)
      .find((nextStart) => nextStart !== null && nextStart !== undefined && nextStart > start);
    const end = explicitDuration !== null
      ? start + explicitDuration
      : nextTimedStart ?? lineEnd;
    if (end === null || end === undefined || end <= start) return [];
    return [{ start, end, duration: end - start }];
  });
  // Some providers only give line timestamps (e.g. LRC). Use those instead of
  // falling back to a view-specific estimate, so all views share one strategy.
  if (partWindows.length === 0 && lineEnd !== null && lineEnd > lineStart) {
    partWindows.push({ start: lineStart, end: lineEnd, duration: lineEnd - lineStart });
  }
  if (partWindows.length === 0) return null;

  const makeTimedWord = (text: string, start: number, end: number) => ({
    text,
    time: start,
    duration: Math.max(0.08, end - start),
  });

  if (exactWordMapping && sourceWordPartRanges.length === romanizedTokens.length) {
    const exactTimings = sourceWordPartRanges.map(([firstPart, lastPart], index) => {
      const start = partStarts[firstPart];
      const endPart = parts[lastPart];
      const explicitEnd = finite(endPart?.startTimeMs)
        ? Number(endPart.startTimeMs) / 1000 + (finite(endPart.durationMs) ? Number(endPart.durationMs) / 1000 : 0)
        : finite(endPart?.time)
          ? Number(endPart.time) + (finite(endPart.duration) ? Number(endPart.duration) : 0)
          : null;
      if (start === null || start === undefined || explicitEnd === null || explicitEnd <= start) return null;
      return makeTimedWord(romanizedTokens[index], start, explicitEnd);
    });
    if (exactTimings.every(Boolean)) return exactTimings as LyricalLyricPart[];
  }

  // Portato/QRC often timestamps Japanese character by character, while romaji
  // uses whitespace-delimited words. Preserve that detailed timing envelope by
  // distributing each romanized word across the concatenated source intervals.
  const totalSourceDuration = partWindows.reduce((sum, window) => sum + window.duration, 0);
  const totalRomanizedWeight = romanizedTokens.reduce((sum, word) => sum + word.length, 0);
  if (totalSourceDuration <= 0 || totalRomanizedWeight <= 0) return null;

  const timeAtSourceProgress = (progress: number) => {
    const target = Math.min(Math.max(progress, 0), totalSourceDuration);
    let elapsed = 0;
    for (const window of partWindows) {
      if (target <= elapsed + window.duration) {
        return window.start + Math.min(target - elapsed, window.duration);
      }
      elapsed += window.duration;
    }
    const lastWindow = partWindows[partWindows.length - 1];
    return lastWindow.end;
  };

  let consumedWeight = 0;
  return romanizedTokens.map((word) => {
    const start = timeAtSourceProgress(
      (consumedWeight / totalRomanizedWeight) * totalSourceDuration,
    );
    consumedWeight += word.length;
    const end = timeAtSourceProgress(
      (consumedWeight / totalRomanizedWeight) * totalSourceDuration,
    );
    return makeTimedWord(word, start, end);
  });
}

export function addDerivedWordTimings(
  lyrics: LyricalLyricLine[],
  romanizedLines: LyricalLyricLine[],
): LyricalLyricLine[] {
  return romanizedLines.map((romanizedLine, index) => {
    if (Array.isArray(romanizedLine?.timedRomanization) && romanizedLine.timedRomanization.length > 0) {
      return romanizedLine;
    }

    const sourceLine = lyrics[index];
    if (Array.isArray(sourceLine?.timedRomanization) && sourceLine.timedRomanization.length > 0) {
      return { ...romanizedLine, timedRomanization: sourceLine.timedRomanization };
    }
    const timedRomanization = buildWordTimedRomanization(
      sourceLine,
      romanizedLine?.romanized,
      lyrics[index + 1],
    );
    return timedRomanization
      ? { ...romanizedLine, timedRomanization }
      : romanizedLine;
  });
}

function finite(value: unknown): boolean {
  return value !== null && value !== undefined && Number.isFinite(Number(value));
}
