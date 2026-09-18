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
 * Normalizes colloquialisms, slang verb endings (-in' -> -ing),
 * contractions and phonetic variations common in pop songs vs ASR captions.
 */
export function normalizeSyncWord(raw: string): string {
  if (!raw) return "";
  let w = raw.toLowerCase().trim();

  // 1. Remove quotes/apostrophes inside word if any remain (e.g. you've -> youve)
  w = w.replace(/['’‘"`]/g, "");

  // 2. Common colloquial slang & phonetic mappings
  switch (w) {
    case "round":
      return "around";
    case "cause":
    case "cuz":
      return "because";
    case "em":
      return "them";
    case "til":
    case "till":
      return "until";
    case "gonna":
      return "going";
    case "wanna":
      return "want";
    case "tryna":
      return "trying";
    case "gotta":
      return "got";
    case "kinda":
      return "kind";
    case "sorta":
      return "sort";
    case "imma":
    case "ima":
      return "im";
    case "yea":
    case "yeah":
      return "yes";
    case "whoa":
      return "woah";
    case "aint":
      return "isnt";
  }

  // 3. Slang verb endings: runnin -> running, throwin -> throwing, feelin -> feeling
  if (
    w.length >= 4 &&
    w.endsWith("in") &&
    !w.endsWith("ain") &&
    !w.endsWith("oin") &&
    !w.endsWith("ein") &&
    !w.endsWith("shin") &&
    !w.endsWith("chin") &&
    w !== "twin" &&
    w !== "spin" &&
    w !== "skin" &&
    w !== "thin" &&
    w !== "grin" &&
    w !== "join" &&
    w !== "coin" &&
    w !== "rain" &&
    w !== "pain"
  ) {
    w = w + "g";
  }

  return w;
}

/**
 * Normalizes text for robust phonetic/word comparison:
 * - Strips music notes (♪, ♫, 🎵, 🎶)
 * - Removes bracketed meta annotations like [Verse 1], (Chorus)
 * - Strips apostrophes and quotation marks directly without adding extra space (you've -> youve)
 * - Removes other punctuation while preserving international unicode letters & numbers
 * - Converts to lowercase and normalizes whitespace
 */
export function normalizeSyncText(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/[♪♫🎵🎶]/g, "")
    .replace(/\[[^\]]*\]|\([^)]*\)/g, "")
    .replace(/['’‘"`]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Checks if a caption line is purely a music or sound effect indicator rather than sung/spoken words.
 * Handles international music indicators: [Music], [संगीत], [Musique], [Música], ♪, etc.
 */
export function isMusicOrNoiseTag(text: string): boolean {
  if (!text) return true;
  const clean = text.trim();
  if (/^[♪♫🎵🎶\s.,!?:;—\-–()\[\]{}]+$/u.test(clean)) return true;
  if (
    /^[\[(（【][^\])）】]*(?:music|संगीत|musique|música|musik|musica|instrumental|applause|cheering|sound|noise|beat|intro)[^\])）】]*[\])）】]$/i.test(
      clean,
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Computes token-level Dice coefficient between two normalized strings with
 * colloquial stemming and fuzzy word tolerance.
 * Returns a value between 0.0 (no match) and 1.0 (exact match).
 */
export function calculateTextSimilarity(strA: string, strB: string): number {
  const normA = normalizeSyncText(strA);
  const normB = normalizeSyncText(strB);

  if (!normA || !normB) return 0;
  if (normA === normB) return 1.0;

  const rawWordsA = normA.split(" ").filter((w) => w.length > 0);
  const rawWordsB = normB.split(" ").filter((w) => w.length > 0);

  if (rawWordsA.length === 0 || rawWordsB.length === 0) return 0;

  const wordsA = rawWordsA.map(normalizeSyncWord);
  const wordsB = rawWordsB.map(normalizeSyncWord);

  const setB = new Set(wordsB);
  let matchedScore = 0;

  for (const wa of wordsA) {
    if (setB.has(wa)) {
      matchedScore += 1.0;
    } else {
      // Fuzzy check: shared stem / prefix of >= 4 chars, or 1 edit distance
      const isFuzzy = wordsB.some((wb) => {
        if (wa.length >= 4 && wb.length >= 4) {
          if (wa.startsWith(wb.slice(0, 4)) || wb.startsWith(wa.slice(0, 4))) {
            return true;
          }
        }
        if (Math.abs(wa.length - wb.length) <= 1 && wa.length >= 5) {
          let diff = 0;
          const minLen = Math.min(wa.length, wb.length);
          for (let k = 0; k < minLen; k++) {
            if (wa[k] !== wb[k]) diff++;
            if (diff > 1) break;
          }
          return diff <= 1;
        }
        return false;
      });
      if (isFuzzy) {
        matchedScore += 0.85;
      }
    }
  }

  // Also check containment ratio for long phrases
  const joinedA = wordsA.join(" ");
  const joinedB = wordsB.join(" ");
  if (joinedA.length >= 10 && joinedB.length >= 10) {
    if (joinedA.includes(joinedB)) {
      return Math.max((2 * matchedScore) / (wordsA.length + wordsB.length), joinedB.length / joinedA.length);
    }
    if (joinedB.includes(joinedA)) {
      return Math.max((2 * matchedScore) / (wordsA.length + wordsB.length), joinedA.length / joinedB.length);
    }
  }

  return (2 * matchedScore) / (wordsA.length + wordsB.length);
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
    captionTime: number;
    lyricTime: number;
  }

  const matches: MatchSample[] = [];
  let lastMatchedCaptionTime = -1;

  for (let idx = 0; idx < candidateLyricLines.length; idx++) {
    const lyricLine = candidateLyricLines[idx];
    let bestScore = 0;
    let bestWindow: { text: string; time: number } | null = null;
    let bestRawSim = 0;

    for (const win of captionWindows) {
      // Monotonic constraint: line N+1 must not match a caption before line N (with 1.5s tolerance)
      if (lastMatchedCaptionTime >= 0 && win.time < lastMatchedCaptionTime - 1.5) {
        continue;
      }

      const sim = calculateTextSimilarity(lyricLine.text, win.text);
      if (sim < 0.50) continue;

      // Relative Cadence Disambiguation:
      // If we have an anchor match, penalize windows whose relative elapsed time
      // diverges significantly from the lyric elapsed time (preventing repeated chorus/verse jumps).
      let cadenceScore = sim;
      if (matches.length > 0) {
        const anchor = matches[0];
        const expectedCaptionTime = anchor.captionTime + (lyricLine.time - anchor.lyricTime);
        const timeDiff = Math.abs(win.time - expectedCaptionTime);
        if (timeDiff <= 2.0) {
          cadenceScore += 0.25; // Bonus for consistent tempo/cadence
        } else if (timeDiff > 6.0) {
          cadenceScore -= 0.35; // Heavy penalty for matching wrong verse repetition
        }
      }

      if (cadenceScore > bestScore) {
        bestScore = cadenceScore;
        bestRawSim = sim;
        bestWindow = win;
      }
    }

    // Require at least 65% token/content similarity
    if (bestRawSim >= 0.65 && bestWindow) {
      const offset = bestWindow.time - lyricLine.time;
      // Sanity check: offset between -30s and +60s (typical MV intros or pre-gap)
      if (offset >= -30 && offset <= 60) {
        matches.push({
          offset,
          similarity: bestRawSim,
          lyricText: lyricLine.text,
          captionText: bestWindow.text,
          captionTime: bestWindow.time,
          lyricTime: lyricLine.time,
        });
        lastMatchedCaptionTime = bestWindow.time;
      }
    }
  }

  // 4. Cluster matches to find consensus offset (clustering with tolerance 1.0s)
  if (matches.length > 0) {
    const TOLERANCE = 1.0;
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

    clusters.sort((a, b) => b.totalWeight - a.totalWeight);
    const bestCluster = clusters[0];

    if (bestCluster) {
      const count = bestCluster.samples.length;
      const topSample = bestCluster.samples.sort((a, b) => b.similarity - a.similarity)[0];
      const wordCount = normalizeSyncText(topSample.lyricText).split(" ").length;

      // Strict confidence requirements:
      // Must have at least 2 lines agreeing, OR 1 line with >= 90% similarity and >= 5 words
      if (count >= 2 || (topSample.similarity >= 0.90 && wordCount >= 5)) {
        let finalOffset =
          bestCluster.offsets.reduce((sum, o) => sum + o, 0) / bestCluster.offsets.length;

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
    }
  }

  // 5. FALLBACK: Speech-Onset & Cadence Cross-Correlation (Language-Agnostic)
  // When captions are in a different language/script (e.g. translated Hindi, Japanese, Spanish)
  // or token comparison failed, we correlate the timestamp of speech onset and phrase rhythm.
  const vocalCaptions = candidateCaptions.filter(
    (c) => !isMusicOrNoiseTag(c.text) && normalizeSyncText(c.text).length >= 2,
  );

  if (vocalCaptions.length === 0 || candidateLyricLines.length === 0) {
    return null;
  }

  const firstVocalLyric = candidateLyricLines[0];
  const firstVocalCaption = vocalCaptions[0];
  const onsetOffset = firstVocalCaption.time - firstVocalLyric.time;

  // Realistic offset boundary (-30s to +60s)
  if (onsetOffset < -30 || onsetOffset > 60) {
    return null;
  }

  // Cadence verification: check if subsequent vocal interval matches
  let cadenceMatched = false;
  if (candidateLyricLines.length > 1 && vocalCaptions.length > 1) {
    const lyricInterval = candidateLyricLines[1].time - candidateLyricLines[0].time;
    for (let k = 1; k < Math.min(vocalCaptions.length, 5); k++) {
      const captionInterval = vocalCaptions[k].time - firstVocalCaption.time;
      if (Math.abs(captionInterval - lyricInterval) <= 1.8) {
        cadenceMatched = true;
        break;
      }
    }
  }

  const hasPrecedingMusicTag = candidateCaptions.some(
    (c) => c.time < firstVocalCaption.time && isMusicOrNoiseTag(c.text),
  );

  let confidence = 0.65;
  if (cadenceMatched) {
    confidence = 0.82;
  } else if (hasPrecedingMusicTag || firstVocalCaption.time >= 4.0) {
    confidence = 0.72;
  }

  let finalOffset = onsetOffset;
  if (Math.abs(finalOffset) < 0.35) {
    finalOffset = 0.0;
  }

  return {
    detectedOffset: Number(finalOffset.toFixed(2)),
    confidence: Number(confidence.toFixed(2)),
    matchedLyricText: firstVocalLyric.text,
    matchedCaptionText: firstVocalCaption.text,
  };
}
