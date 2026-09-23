import { parseLRC, lrcFixers } from "../../content/lrcParser";
import type { LyricalLyricLine, SongInfo } from "../../types/lyrics";

export type YouLyPlusSourceId = "youlyplus-richsynced" | "youlyplus-synced";

interface SourceFetchResult {
  sourceId: string;
  label: string;
  lyrics: LyricalLyricLine[];
  language?: string | null;
}

let youLyPlusCacheKey = "";
let youLyPlusCachePromise: Promise<any | null> | null = null;

export async function fetchYouLyPlusRaw(songInfo: SongInfo): Promise<any | null> {
  const cacheKey = [
    songInfo.title || "",
    songInfo.artist || "",
    songInfo.album || "",
    Math.round(Number(songInfo.duration || 0)),
  ].join("|");

  if (youLyPlusCachePromise && youLyPlusCacheKey === cacheKey) {
    return youLyPlusCachePromise;
  }

  youLyPlusCacheKey = cacheKey;
  youLyPlusCachePromise = (async () => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: "FETCH_YOULYPLUS_LYRICS",
        songInfo: {
          title: songInfo.title || "",
          artist: songInfo.artist || "",
          album: songInfo.album || "",
          duration: songInfo.duration || 0,
        },
      });

      if (response?.success && response.data) {
        return response.data;
      }
      return null;
    } catch (e) {
      console.debug("[Lyrical] YouLyPlus fetch error:", e);
      return null;
    }
  })();

  return youLyPlusCachePromise;
}

export async function fetchYouLyPlusSourceLyrics(
  songInfo: SongInfo,
  sourceId: YouLyPlusSourceId,
): Promise<SourceFetchResult | null> {
  const data = await fetchYouLyPlusRaw(songInfo);
  if (!data) return null;

  const rawLines: any[] = Array.isArray(data.lines)
    ? data.lines
    : Array.isArray(data.lyrics)
      ? data.lyrics
      : [];

  const isRich = sourceId === "youlyplus-richsynced";

  // Case 1: Structured JSON lines returned
  if (rawLines.length > 0) {
    const hasSyllables = rawLines.some(
      (l) => Array.isArray(l.syllabus) && l.syllabus.length > 0,
    );

    if (isRich && !hasSyllables) {
      // Requested rich sync but provider only has line sync
      return null;
    }

    const lyrics: LyricalLyricLine[] = rawLines.map((line: any) => {
      const time = (line.time || 0) / 1000;
      const duration = (line.duration || 0) / 1000;
      const parts =
        isRich && Array.isArray(line.syllabus) && line.syllabus.length > 0
          ? line.syllabus.map((s: any) => ({
              text: s.text || "",
              time: (s.time || 0) / 1000,
              duration: (s.duration || 0) / 1000,
            }))
          : null;

      const romanization = line.transliteration?.text || undefined;
      const translation = line.translation?.text || undefined;

      return {
        time,
        duration,
        text: (line.text || "").trim(),
        parts,
        romanized: romanization,
        translated: translation,
      };
    });

    const filtered = lyrics.filter(
      (l) => l.text?.trim() || (l.parts && l.parts.length > 0),
    );

    if (filtered.length > 0) {
      lrcFixers(filtered);
      return {
        sourceId,
        label: "YouLy+",
        lyrics: filtered,
        language: data.metadata?.language || null,
      };
    }
  }

  // Case 2: Standard LRC string returned
  if (typeof data.lyrics === "string" && !isRich) {
    const parsed = parseLRC(data.lyrics);
    if (parsed.length > 0) {
      lrcFixers(parsed);
      return {
        sourceId,
        label: "YouLy+",
        lyrics: parsed,
        language: data.metadata?.language || null,
      };
    }
  }

  return null;
}
