/**
 * Robust Auto-Sync Detection Engine
 *
 * Synchronizes externally sourced/rich lyrics against YouTube timed captions.
 *
 * Design goals:
 * - Never assume the first lyric/caption pair is the correct pair.
 * - Generate many independent offset candidates across the song.
 * - Prefer a global consensus instead of a single lucky match.
 * - Validate the winning offset against the original caption stream.
 * - Keep 0s as a real detected result, not as the fallback for "unknown".
 * - Return enough evidence for main.tsx to safely fuse with SponsorBlock.
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
  isInstrumental?: boolean;
}

export interface AutoSyncDetectionResult {
  detectedOffset: number;
  rawOffset?: number;
  confidence: number;
  matchedLyricText: string;
  matchedCaptionText: string;

  /** Number of independent lyric/caption alignments supporting the result. */
  matchCount: number;
  /** Number of different time regions contributing evidence. */
  regionCount: number;
  /** Median absolute deviation of supporting offsets, in seconds. */
  offsetSpread: number;
  /** Median text similarity of the final supporting matches. */
  medianSimilarity: number;
}

export function getFirstVocalLyricTime(
  lyrics: LyricInputLine[] | any[],
): number | null {
  if (!Array.isArray(lyrics) || !lyrics.length) return null;
  for (const l of lyrics) {
    if ((l as any).isInstrumental) continue;
    if (isMetadataLine(l.text || "")) continue;
    const clean = normalizeSyncText(l.text || "");
    if (clean.length >= 1 && Number.isFinite(l.time) && l.time >= 0) {
      return l.time;
    }
  }
  return null;
}

export function getLastVocalLyricTime(
  lyrics: LyricInputLine[] | any[],
): number | null {
  if (!Array.isArray(lyrics) || !lyrics.length) return null;
  for (let i = lyrics.length - 1; i >= 0; i--) {
    const l = lyrics[i];
    if ((l as any).isInstrumental) continue;
    if (isMetadataLine(l.text || "")) continue;
    const clean = normalizeSyncText(l.text || "");
    if (clean.length >= 1 && Number.isFinite(l.time) && l.time >= 0) {
      return l.time;
    }
  }
  return null;
}

export function normalizeSyncWord(raw: string): string {
  if (!raw) return "";
  let w = raw.toLowerCase().trim();
  w = w.replace(/['’‘"`]/g, "");

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

  if (
    w.length >= 4 &&
    w.endsWith("in") &&
    !w.endsWith("ain") &&
    !w.endsWith("oin") &&
    !w.endsWith("ein") &&
    !w.endsWith("shin") &&
    !w.endsWith("chin") &&
    ![
      "twin",
      "spin",
      "skin",
      "thin",
      "grin",
      "join",
      "coin",
      "rain",
      "pain",
    ].includes(w)
  ) {
    w += "g";
  }

  return w;
}

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

export function isMusicOrNoiseTag(text: string): boolean {
  if (!text) return true;
  const clean = text.trim();
  if (/^[♪♫🎵🎶\s.,!?:;—\-–()\[\]{}]+$/u.test(clean)) return true;
  return /^[\[(（【][^\])）】]*(?:music|संगीत|musique|música|musik|musica|instrumental|applause|cheering|sound|noise|beat|intro)[^\])）】]*[\])）】]$/i.test(
    clean,
  );
}

export function calculateTextSimilarity(strA: string, strB: string): number {
  const normA = normalizeSyncText(strA);
  const normB = normalizeSyncText(strB);
  if (!normA || !normB) return 0;
  if (normA === normB) return 1;

  const wordsA = normA.split(" ").filter(Boolean).map(normalizeSyncWord);
  const wordsB = normB.split(" ").filter(Boolean).map(normalizeSyncWord);
  if (!wordsA.length || !wordsB.length) return 0;

  let matchedScore = 0;
  const usedB = new Set<number>();

  for (const wa of wordsA) {
    let bestIndex = -1;
    let bestScore = 0;

    for (let i = 0; i < wordsB.length; i++) {
      if (usedB.has(i)) continue;
      const wb = wordsB[i];
      let score = 0;

      if (wa === wb) {
        score = 1;
      } else if (
        wa.length >= 4 &&
        wb.length >= 4 &&
        (wa.startsWith(wb.slice(0, 4)) || wb.startsWith(wa.slice(0, 4)))
      ) {
        score = 0.85;
      } else if (Math.abs(wa.length - wb.length) <= 1 && wa.length >= 5) {
        let diff = 0;
        const minLen = Math.min(wa.length, wb.length);
        for (let k = 0; k < minLen; k++) {
          if (wa[k] !== wb[k]) diff++;
          if (diff > 1) break;
        }
        if (diff <= 1) score = 0.85;
      }

      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    if (bestIndex >= 0) {
      matchedScore += bestScore;
      usedB.add(bestIndex);
    }
  }

  const dice = (2 * matchedScore) / (wordsA.length + wordsB.length);
  const joinedA = wordsA.join(" ");
  const joinedB = wordsB.join(" ");

  if (joinedA.length >= 10 && joinedB.length >= 10) {
    if (joinedA.includes(joinedB))
      return Math.max(dice, joinedB.length / joinedA.length);
    if (joinedB.includes(joinedA))
      return Math.max(dice, joinedA.length / joinedB.length);
  }

  return Math.min(1, dice);
}

interface CaptionWindow {
  text: string;
  time: number;
  endTime: number;
}

interface OffsetCandidate {
  offset: number;
  similarity: number;
  lyricTime: number;
  captionTime: number;
  lyricText: string;
  captionText: string;
  lyricWordCount: number;
}

interface OffsetCluster {
  samples: OffsetCandidate[];
  weight: number;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function weightedMedian(samples: OffsetCandidate[]): number {
  if (!samples.length) return 0;
  const sorted = [...samples].sort((a, b) => a.offset - b.offset);
  const total = sorted.reduce((sum, s) => sum + candidateWeight(s), 0);
  let cumulative = 0;
  for (const sample of sorted) {
    cumulative += candidateWeight(sample);
    if (cumulative >= total / 2) return sample.offset;
  }
  return sorted[sorted.length - 1].offset;
}

function candidateWeight(sample: OffsetCandidate): number {
  const wordBoost = Math.min(1.6, 0.7 + sample.lyricWordCount / 8);
  return Math.max(0.05, sample.similarity * wordBoost);
}

function buildCaptionWindows(captions: CaptionLine[]): CaptionWindow[] {
  const source = captions
    .filter((c) => Number.isFinite(c.time) && c.time >= 0 && c.time <= 240)
    .filter((c) => normalizeSyncText(c.text || "").length >= 2)
    .filter((c) => !isMusicOrNoiseTag(c.text || ""));

  const windows: CaptionWindow[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < source.length; i++) {
    const c1 = source[i];
    const d1 = Math.max(0.2, Number(c1.duration) || 0.2);
    const key1 = `${i}:1`;
    if (!seen.has(key1)) {
      windows.push({ text: c1.text, time: c1.time, endTime: c1.time + d1 });
      seen.add(key1);
    }

    if (i + 1 < source.length) {
      const c2 = source[i + 1];
      if (c2.time - c1.time <= 4.5) {
        windows.push({
          text: `${c1.text} ${c2.text}`,
          time: c1.time,
          endTime: Math.max(
            c1.time + d1,
            c2.time + Math.max(0.2, Number(c2.duration) || 0.2),
          ),
        });

        if (i + 2 < source.length) {
          const c3 = source[i + 2];
          if (c3.time - c2.time <= 4.5) {
            windows.push({
              text: `${c1.text} ${c2.text} ${c3.text}`,
              time: c1.time,
              endTime: Math.max(
                c1.time + d1,
                c2.time + Math.max(0.2, Number(c2.duration) || 0.2),
                c3.time + Math.max(0.2, Number(c3.duration) || 0.2),
              ),
            });
          }
        }
      }
    }
  }

  return windows;
}

function makeCandidate(
  lyric: LyricInputLine,
  window: CaptionWindow,
  similarity: number,
): OffsetCandidate | null {
  const offset = window.time - lyric.time;
  if (offset < -60 || offset > 120) return null;

  const lyricText = normalizeSyncText(lyric.text || "");
  const lyricWordCount = lyricText.split(" ").filter(Boolean).length;
  if (lyricWordCount < 2) return null;

  return {
    offset,
    similarity,
    lyricTime: lyric.time,
    captionTime: window.time,
    lyricText: lyric.text,
    captionText: window.text,
    lyricWordCount,
  };
}

function buildCandidates(
  lyrics: LyricInputLine[],
  windows: CaptionWindow[],
): OffsetCandidate[] {
  const candidates: OffsetCandidate[] = [];
  const maxLyricTime = 240;

  const lyricLines = lyrics
    .filter(
      (l) => Number.isFinite(l.time) && l.time >= 0 && l.time <= maxLyricTime,
    )
    .filter((l) => !(l as any).isInstrumental)
    .filter((l) => !isMetadataLine(l.text || ""))
    .filter((l) => normalizeSyncText(l.text || "").length >= 4)
    .slice(0, 48);

  for (const lyric of lyricLines) {
    const scored: OffsetCandidate[] = [];

    for (const window of windows) {
      // Search broadly. Do not use the first match as an anchor.
      const similarity = calculateTextSimilarity(lyric.text, window.text);
      if (similarity < 0.48) continue;

      const candidate = makeCandidate(lyric, window, similarity);
      if (candidate) scored.push(candidate);
    }

    scored.sort((a, b) => {
      const scoreA = a.similarity + Math.min(0.12, a.lyricWordCount / 100);
      const scoreB = b.similarity + Math.min(0.12, b.lyricWordCount / 100);
      return scoreB - scoreA;
    });

    // Keep multiple alternatives per lyric. A repeated chorus must not erase the true offset.
    candidates.push(...scored.slice(0, 6));
  }

  return candidates;
}

function clusterCandidates(candidates: OffsetCandidate[]): OffsetCluster[] {
  const sorted = [...candidates].sort((a, b) => a.offset - b.offset);
  const clusters: OffsetCluster[] = [];
  const tolerance = 0.65;

  for (const candidate of sorted) {
    let bestCluster: OffsetCluster | null = null;
    let bestDistance = Infinity;

    for (const cluster of clusters) {
      const center = weightedMedian(cluster.samples);
      const distance = Math.abs(candidate.offset - center);
      if (distance <= tolerance && distance < bestDistance) {
        bestCluster = cluster;
        bestDistance = distance;
      }
    }

    if (bestCluster) {
      bestCluster.samples.push(candidate);
      bestCluster.weight += candidateWeight(candidate);
    } else {
      clusters.push({
        samples: [candidate],
        weight: candidateWeight(candidate),
      });
    }
  }

  return clusters.sort((a, b) => b.weight - a.weight);
}

function selectIndependentSamples(
  samples: OffsetCandidate[],
): OffsetCandidate[] {
  const selected: OffsetCandidate[] = [];
  const usedLyricTimes: number[] = [];
  const usedCaptionTimes: number[] = [];

  const sorted = [...samples].sort((a, b) => {
    const scoreA = candidateWeight(a);
    const scoreB = candidateWeight(b);
    return scoreB - scoreA;
  });

  for (const sample of sorted) {
    // One lyric line should contribute only once.
    if (usedLyricTimes.some((t) => Math.abs(t - sample.lyricTime) < 0.5))
      continue;
    // Avoid multiple overlapping caption windows counting as separate proof.
    if (usedCaptionTimes.some((t) => Math.abs(t - sample.captionTime) < 2.0))
      continue;

    selected.push(sample);
    usedLyricTimes.push(sample.lyricTime);
    usedCaptionTimes.push(sample.captionTime);
  }

  return selected.sort((a, b) => a.lyricTime - b.lyricTime);
}

function countRegions(samples: OffsetCandidate[]): number {
  if (!samples.length) return 0;
  const regions = new Set<number>();
  for (const sample of samples) regions.add(Math.floor(sample.lyricTime / 30));
  return regions.size;
}

function validateOffset(
  offset: number,
  lyrics: LyricInputLine[],
  captions: CaptionLine[],
): {
  matched: OffsetCandidate[];
  medianSimilarity: number;
  regionCount: number;
  spread: number;
} {
  const cleanCaptions = captions
    .filter((c) => Number.isFinite(c.time) && c.time >= 0 && c.time <= 240)
    .filter((c) => normalizeSyncText(c.text || "").length >= 2)
    .filter((c) => !isMusicOrNoiseTag(c.text || ""));

  const cleanLyrics = lyrics
    .filter((l) => Number.isFinite(l.time) && l.time >= 0 && l.time <= 240)
    .filter((l) => !(l as any).isInstrumental)
    .filter((l) => !isMetadataLine(l.text || ""))
    .filter((l) => normalizeSyncText(l.text || "").length >= 4)
    .slice(0, 48);

  const matches: OffsetCandidate[] = [];

  for (const lyric of cleanLyrics) {
    const expected = lyric.time + offset;
    let best: OffsetCandidate | null = null;

    for (const caption of cleanCaptions) {
      const timeDistance = Math.abs(caption.time - expected);
      if (timeDistance > 1.25) continue;

      const similarity = calculateTextSimilarity(lyric.text, caption.text);
      if (similarity < 0.48) continue;

      const candidate = makeCandidate(
        lyric,
        {
          text: caption.text,
          time: caption.time,
          endTime: caption.time + (caption.duration || 0.2),
        },
        similarity,
      );
      if (!candidate) continue;

      if (!best || similarity > best.similarity) best = candidate;
    }

    if (best) matches.push(best);
  }

  const independent = selectIndependentSamples(matches);
  const similarities = independent.map((m) => m.similarity);
  const medianSimilarity = median(similarities);
  const offsets = independent.map((m) => m.offset);
  const center = median(offsets);
  const spread = median(offsets.map((o) => Math.abs(o - center)));

  return {
    matched: independent,
    medianSimilarity,
    regionCount: countRegions(independent),
    spread,
  };
}

function confidenceForEvidence(
  matchCount: number,
  regionCount: number,
  medianSimilarity: number,
  spread: number,
): number {
  if (matchCount === 0) return 0;

  let confidence = 0.25;
  confidence += Math.min(0.3, matchCount * 0.06);
  confidence += Math.min(0.18, Math.max(0, regionCount - 1) * 0.09);
  confidence += Math.max(0, medianSimilarity - 0.55) * 0.55;

  if (spread <= 0.2) confidence += 0.1;
  else if (spread <= 0.4) confidence += 0.06;
  else if (spread <= 0.7) confidence += 0.02;
  else confidence -= 0.08;

  if (
    matchCount >= 5 &&
    regionCount >= 3 &&
    medianSimilarity >= 0.78 &&
    spread <= 0.5
  ) {
    confidence += 0.08;
  }

  return Math.max(0, Math.min(0.99, confidence));
}

export function detectAutoSyncOffset(
  lyrics: LyricInputLine[],
  captions: CaptionLine[],
): AutoSyncDetectionResult | null {
  if (!Array.isArray(lyrics) || !lyrics.length) return null;
  if (!Array.isArray(captions) || !captions.length) return null;

  const windows = buildCaptionWindows(captions);
  if (!windows.length) return null;

  const candidates = buildCandidates(lyrics, windows);
  if (!candidates.length) return null;

  const clusters = clusterCandidates(candidates);

  // Evaluate the top few clusters independently. This avoids accepting a large
  // but accidental cluster without checking the original caption stream.
  let bestResult: AutoSyncDetectionResult | null = null;
  let bestScore = -Infinity;

  for (const cluster of clusters.slice(0, 8)) {
    if (cluster.samples.length < 2) continue;

    const provisionalOffset = weightedMedian(cluster.samples);
    const validation = validateOffset(provisionalOffset, lyrics, captions);
    const { matched, medianSimilarity, regionCount, spread } = validation;

    const isSmallStrongCluster =
      matched.length === 2 && medianSimilarity >= 0.7 && spread <= 0.45;
    if (matched.length < 2 || (matched.length === 2 && !isSmallStrongCluster))
      continue;
    if (regionCount < 2 && matched.length < 5 && !isSmallStrongCluster)
      continue;
    if (medianSimilarity < 0.55) continue;
    if (spread > 1.1) continue;

    const finalOffset = weightedMedian(matched);
    const finalValidation = validateOffset(finalOffset, lyrics, captions);
    const finalMatches = finalValidation.matched;

    const isFinalSmallStrong =
      finalMatches.length === 2 &&
      finalValidation.medianSimilarity >= 0.7 &&
      finalValidation.spread <= 0.45;
    if (
      finalMatches.length < 2 ||
      (finalMatches.length === 2 && !isFinalSmallStrong)
    )
      continue;

    const finalConfidence = confidenceForEvidence(
      finalMatches.length,
      finalValidation.regionCount,
      finalValidation.medianSimilarity,
      finalValidation.spread,
    );

    // Large offsets are possible for videos with long intros, so do not use a
    // hard maximum here. However, a large offset is also exactly where a
    // repeated chorus/verse can produce a false caption match.
    // Require balanced independent evidence across progressive distance tiers.
    const absFinalOffset = Math.abs(finalOffset);

    // Progressive confidence and evidence scaling for non-zero offsets
    if (absFinalOffset > 35) {
      const passesExtreme =
        finalMatches.length >= 5 &&
        finalValidation.regionCount >= 3 &&
        finalValidation.medianSimilarity >= 0.72 &&
        finalValidation.spread <= 0.55 &&
        finalConfidence >= 0.74;
      if (!passesExtreme) continue;
    } else if (absFinalOffset > 10) {
      const passesModerateIntro =
        finalMatches.length >= 3 &&
        finalValidation.regionCount >= 2 &&
        finalValidation.medianSimilarity >= 0.6 &&
        finalValidation.spread <= 0.7 &&
        finalConfidence >= 0.62;
      if (!passesModerateIntro) continue;
    } else if (absFinalOffset > 1.5) {
      const passesSmallShift =
        finalMatches.length >= 3 &&
        finalValidation.regionCount >= 2 &&
        finalValidation.medianSimilarity >= 0.55 &&
        finalValidation.spread <= 0.8 &&
        finalConfidence >= 0.58;
      if (!passesSmallShift) continue;
    } else {
      // |offset| <= 1.5s: normal validation threshold
      if (finalConfidence < 0.52) continue;
    }

    const topSample = [...finalMatches].sort(
      (a, b) => b.similarity - a.similarity,
    )[0];
    const lateOccurrencePenalty = Math.min(
      0.6,
      Math.max(0, absFinalOffset - 20) / 70,
    );

    const score =
      finalConfidence * 2 +
      finalValidation.medianSimilarity +
      Math.min(0.5, finalMatches.length * 0.05) +
      Math.min(0.3, finalValidation.regionCount * 0.1) -
      finalValidation.spread * 0.25 -
      lateOccurrencePenalty;

    if (score > bestScore) {
      bestScore = score;
      const rawOffset = Number(finalOffset.toFixed(2));
      const deadbandOffset = Math.abs(rawOffset) <= 0.5 ? 0 : rawOffset;

      bestResult = {
        detectedOffset: deadbandOffset,
        rawOffset,
        confidence: Number(finalConfidence.toFixed(2)),
        matchedLyricText: topSample.lyricText,
        matchedCaptionText: topSample.captionText,
        matchCount: finalMatches.length,
        regionCount: finalValidation.regionCount,
        offsetSpread: Number(finalValidation.spread.toFixed(2)),
        medianSimilarity: Number(finalValidation.medianSimilarity.toFixed(2)),
      };
    }
  }

  return bestResult;
}
