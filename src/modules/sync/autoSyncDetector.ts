/**
 * Auto-Sync Detection Engine
 * 
 * Automatically synchronizes rich lyrics to YouTube videos by cross-correlating
 * lyric line timestamps with YouTube's native captions (ASR / timedtext).
 */

import { isMetadataLine } from "../lyrics/lyricsNormalizer";

export interface CaptionLine {
  time: number;
  duration?: number;
  text: string;
}

export interface LyricInputLine {
  time: number;
  duration?: number;
  text: string;
}

export interface AutoSyncDetectionResult {
  detectedOffset: number; // in seconds (positive means video audio started later / intro delay)
  confidence: number;     // 0.0 to 1.0
  matchedLyricText: string;
  matchedCaptionText: string;
}

/**
 * Normalizes text for robust phonetic/word comparison:
 * - Strips music notes (♪, ♫, 🎵, 🎶)
 * - Removes bracketed meta annotations like [Verse 1], (Chorus)
 * - Removes punctuation while preserving international unicode letters & numbers
 * - Converts to lowercase and normalizes whitespace
 */
export function normalizeSyncText(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/[♪♫🎵🎶]/g, "")
    .replace(/\[[^\]]*\]|\([^)]*\)/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Computes token-level Dice coefficient between two normalized strings.
 * Returns a value between 0.0 (no match) and 1.0 (exact match).
 */
export function calculateTextSimilarity(strA: string, strB: string): number {
  const normA = normalizeSyncText(strA);
  const normB = normalizeSyncText(strB);

  if (!normA || !normB) return 0;
  if (normA === normB) return 1.0;

  // If one contains the other and is of substantial length
  if (normA.length >= 6 && normB.length >= 6) {
    if (normA.includes(normB)) return normB.length / normA.length;
    if (normB.includes(normA)) return normA.length / normB.length;
  }

  const wordsA = normA.split(" ").filter((w) => w.length > 0);
  const wordsB = normB.split(" ").filter((w) => w.length > 0);

  if (wordsA.length === 0 || wordsB.length === 0) return 0;

  const setB = new Set(wordsB);
  let intersection = 0;
  for (const word of wordsA) {
    if (setB.has(word)) {
      intersection++;
    }
  }

  return (2 * intersection) / (wordsA.length + wordsB.length);
}

/**
 * Detects the time offset between rich lyrics and YouTube captions.
 *
 * @param lyrics Parsed lyrics from LRCLIB/Unison/etc.
 * @param captions Parsed captions from YouTube's native timedtext track.
 * @returns AutoSyncDetectionResult if confident, or null if no confident alignment found.
 */
export function detectAutoSyncOffset(
  lyrics: LyricInputLine[],
  captions: CaptionLine[],
): AutoSyncDetectionResult | null {
  if (!Array.isArray(lyrics) || lyrics.length === 0) return null;
  if (!Array.isArray(captions) || captions.length === 0) return null;

  // 1. Pick the first 6 non-empty lyric lines within the first 90 seconds of the song
  const candidateLyricLines = lyrics
    .filter((l) => {
      if ((l as any).isInstrumental) return false;
      if (isMetadataLine(l.text || "")) return false;
      const clean = normalizeSyncText(l.text || "");
      // Skip empty, pure instrumental, or single short words
      return clean.length >= 4 && l.time >= 0 && l.time <= 90;
    })
    .slice(0, 6);

  if (candidateLyricLines.length === 0) return null;

  // 2. Filter candidate captions within the first 120 seconds of the video
  const candidateCaptions = captions.filter(
    (c) => c.time >= 0 && c.time <= 120 && normalizeSyncText(c.text || "").length >= 3,
  );

  if (candidateCaptions.length === 0) return null;

  // Build merged sliding windows (1 to 3 adjacent caption segments)
  // because YouTube ASR often splits a single sentence across multiple tiny cue segments.
  const captionWindows: Array<{ text: string; time: number }> = [];
  for (let i = 0; i < candidateCaptions.length; i++) {
    const c1 = candidateCaptions[i];
    captionWindows.push({ text: c1.text, time: c1.time });

    if (i + 1 < candidateCaptions.length) {
      const c2 = candidateCaptions[i + 1];
      if (c2.time - c1.time < 5.0) {
        captionWindows.push({
          text: `${c1.text} ${c2.text}`,
          time: c1.time,
        });

        if (i + 2 < candidateCaptions.length) {
          const c3 = candidateCaptions[i + 2];
          if (c3.time - c2.time < 5.0) {
            captionWindows.push({
              text: `${c1.text} ${c2.text} ${c3.text}`,
              time: c1.time,
            });
          }
        }
      }
    }
  }

  // 3. For each lyric candidate, find best matching caption window
  interface MatchSample {
    offset: number;
    similarity: number;
    lyricText: string;
    captionText: string;
  }

  const matches: MatchSample[] = [];

  for (const lyricLine of candidateLyricLines) {
    let bestSim = 0;
    let bestWindow: { text: string; time: number } | null = null;

    for (const win of captionWindows) {
      const sim = calculateTextSimilarity(lyricLine.text, win.text);
      if (sim > bestSim) {
        bestSim = sim;
        bestWindow = win;
      }
    }

    // Require at least 70% token/content similarity
    if (bestSim >= 0.70 && bestWindow) {
      const offset = bestWindow.time - lyricLine.time;
      // Sanity check: offset between -10s and +45s (typical MV intros or pre-gap)
      if (offset >= -10 && offset <= 45) {
        matches.push({
          offset,
          similarity: bestSim,
          lyricText: lyricLine.text,
          captionText: bestWindow.text,
        });
      }
    }
  }

  if (matches.length === 0) return null;

  // 4. Cluster matches to find consensus offset (clustering with tolerance 0.75s)
  const TOLERANCE = 0.75;
  interface Cluster {
    offsets: number[];
    samples: MatchSample[];
    totalWeight: number;
  }

  const clusters: Cluster[] = [];

  for (const match of matches) {
    let placed = false;
    for (const cluster of clusters) {
      const avg =
        cluster.offsets.reduce((sum, val) => sum + val, 0) / cluster.offsets.length;
      if (Math.abs(match.offset - avg) <= TOLERANCE) {
        cluster.offsets.push(match.offset);
        cluster.samples.push(match);
        cluster.totalWeight += match.similarity;
        placed = true;
        break;
      }
    }
    if (!placed) {
      clusters.push({
        offsets: [match.offset],
        samples: [match],
        totalWeight: match.similarity,
      });
    }
  }

  // Sort clusters by vote weight
  clusters.sort((a, b) => b.totalWeight - a.totalWeight);
  const bestCluster = clusters[0];

  if (!bestCluster) return null;

  const count = bestCluster.samples.length;
  const topSample = bestCluster.samples.sort((a, b) => b.similarity - a.similarity)[0];
  const wordCount = normalizeSyncText(topSample.lyricText).split(" ").length;

  // Strict confidence requirements:
  // Must have at least 2 lines agreeing, OR 1 line with >= 90% similarity and >= 5 words
  if (count < 2 && (topSample.similarity < 0.90 || wordCount < 5)) {
    return null;
  }

  // Calculate weighted average offset
  let finalOffset =
    bestCluster.offsets.reduce((sum, o) => sum + o, 0) / bestCluster.offsets.length;

  // If offset is tiny (< 0.35s), it is already pre-synced to audio!
  if (Math.abs(finalOffset) < 0.35) {
    finalOffset = 0.0;
  }

  const confidence = count >= 2 ? Math.min(1.0, 0.85 + count * 0.05) : topSample.similarity * 0.9;

  return {
    detectedOffset: Number(finalOffset.toFixed(2)),
    confidence: Number(confidence.toFixed(2)),
    matchedLyricText: topSample.lyricText,
    matchedCaptionText: topSample.captionText,
  };
}
