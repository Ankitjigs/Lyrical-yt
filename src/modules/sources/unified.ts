import { parseLRC, lrcFixers } from "../../content/lrcParser";
import type { LyricalLyricLine, SongInfo } from "../../types/lyrics";
import { parseTTML } from "./boidu";

type UnifiedSourceId =
  | "bLyrics-synced"
  | "binimum-richsynced"
  | "binimum-synced"
  | "portato-richsynced"
  | "legato-synced"
  | "musixmatch-synced";

type UnisonSourceId =
  | "unison-richsynced"
  | "unison-wordsynced"
  | "unison-synced"
  | "unison-plain";

interface SourceFetchResult {
  sourceId: string;
  label: string;
  lyrics: LyricalLyricLine[];
  language?: string | null;
}

interface UnifiedPayload {
  providers?: Record<string, any>;
  metadata?: any;
}

interface UnisonResponse {
  id?: number;
  lyrics?: string;
  format?: "ttml" | "lrc" | "plain";
  syncType?: "richsync" | "linesync" | "plain";
  duration?: number;
}

let unifiedCacheKey = "";
let unifiedCachePromise: Promise<UnifiedPayload | null> | null = null;

function currentVideoId() {
  return new URLSearchParams(window.location.search).get("v") || "";
}

function getSongCacheKey(songInfo: SongInfo) {
  return [
    currentVideoId(),
    songInfo.title || "",
    songInfo.artist || "",
    songInfo.album || "",
    Math.round(Number(songInfo.duration || 0)),
  ].join("|");
}

async function getUnifiedPayload(songInfo: SongInfo): Promise<UnifiedPayload | null> {
  const cacheKey = getSongCacheKey(songInfo);
  if (unifiedCachePromise && unifiedCacheKey === cacheKey) {
    return unifiedCachePromise;
  }

  unifiedCacheKey = cacheKey;
  unifiedCachePromise = window.CubeyProvider?.fetchUnifiedLyrics?.(songInfo) ?? Promise.resolve(null);
  return unifiedCachePromise;
}

function parseJsonLyrics(raw: unknown): string | null {
  if (!raw) return null;
  if (typeof raw !== "string") return null;

  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "string") return parsed;
    if (typeof parsed?.lyrics === "string") return parsed.lyrics;
    if (typeof parsed?.ttml === "string") return parsed.ttml;
  } catch {
    return raw;
  }

  return raw;
}

function parsePlainLyrics(text: string): LyricalLyricLine[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({
      time: 0,
      duration: 0,
      text: line,
      parts: null,
    }));
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

function parseQrcLineTiming(line: string) {
  const match = line.match(/^\[(\d+),(\d+)\]([\s\S]*)$/);
  if (!match) return null;
  return {
    startMs: Number(match[1]),
    durationMs: Number(match[2]),
    body: match[3] || "",
  };
}

function parseQrcWords(body: string) {
  const words: Array<{ text: string; timeMs: number; durationMs: number }> = [];
  const regex = /(.*?)\((\d+),(\d+)\)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(body)) !== null) {
    const text = decodeXmlEntities(match[1] || "");
    const timeMs = Number(match[2]);
    const durationMs = Number(match[3]);
    if (text && Number.isFinite(timeMs) && Number.isFinite(durationMs)) {
      words.push({ text, timeMs, durationMs });
    }
  }

  return words;
}

function parseQRC(qrcXml: string, songDurationSeconds?: number): LyricalLyricLine[] {
  if (!qrcXml) return [];

  const attrMatch = qrcXml.match(/LyricContent="([\s\S]*?)"\s*(?:\/?>|[a-zA-Z]+=)/);
  const lyricContent = attrMatch ? decodeXmlEntities(attrMatch[1]) : qrcXml;
  const parsedLines: LyricalLyricLine[] = [];

  for (const rawLine of lyricContent.split("\n")) {
    const trimmed = rawLine.trim();
    if (!trimmed || /^\[[a-zA-Z]+:/.test(trimmed)) continue;

    const lineTiming = parseQrcLineTiming(trimmed);
    if (!lineTiming) continue;

    const qrcWords = parseQrcWords(lineTiming.body);
    const text = qrcWords.map((word) => word.text).join("");
    if (!text) continue;

    parsedLines.push({
      time: lineTiming.startMs / 1000,
      duration: lineTiming.durationMs / 1000,
      text,
      parts: qrcWords.map((word) => ({
        time: word.timeMs / 1000,
        duration: word.durationMs / 1000,
        text: word.text,
      })),
    });
  }

  if (parsedLines.length === 0) return [];

  parsedLines.sort((a, b) => a.time - b.time);
  const songDuration = Number(songDurationSeconds || 0);
  parsedLines.forEach((line, index) => {
    if (!line.duration && parsedLines[index + 1]) {
      line.duration = Math.max(0, parsedLines[index + 1].time - line.time);
    } else if (!line.duration && songDuration > line.time) {
      line.duration = songDuration - line.time;
    }
  });

  return parsedLines;
}

function parseLrcLyrics(raw: string | null): LyricalLyricLine[] {
  if (!raw) return [];
  const lyrics = parseLRC(raw);
  lrcFixers(lyrics);
  return lyrics;
}

function parseTtmlLyrics(raw: string | null) {
  if (!raw) return null;
  try {
    return parseTTML(raw);
  } catch (error) {
    console.warn("[Lyrical] TTML parse failed:", error);
    return null;
  }
}

function result(sourceId: string, label: string, lyrics: LyricalLyricLine[], language?: string | null): SourceFetchResult | null {
  if (!Array.isArray(lyrics) || lyrics.length === 0) return null;
  return { sourceId, label, lyrics, language };
}

export async function fetchUnifiedSourceLyrics(
  songInfo: SongInfo,
  sourceId: UnifiedSourceId,
): Promise<SourceFetchResult | null> {
  const payload = await getUnifiedPayload(songInfo);
  const providers = payload?.providers;
  if (!providers) return null;

  switch (sourceId) {
    case "bLyrics-synced": {
      const raw = parseJsonLyrics(providers.golyrics?.lyrics);
      const parsed = parseTtmlLyrics(raw);
      if (!parsed || parsed.type !== "line") return null;
      return result(sourceId, "Better Lyrics", parsed.lyrics, parsed.language);
    }

    case "binimum-richsynced":
    case "binimum-synced": {
      const raw = parseJsonLyrics(providers.binimum?.lyrics);
      const parsed = parseTtmlLyrics(raw);
      if (!parsed) return null;

      const timingType = providers.binimum?.timingType || parsed.type;
      const wantsRich = sourceId === "binimum-richsynced";
      if (wantsRich && timingType !== "syllable") return null;
      if (!wantsRich && timingType !== "line") return null;

      return result(sourceId, "BiniLyrics", parsed.lyrics, parsed.language);
    }

    case "portato-richsynced": {
      const raw = parseJsonLyrics(providers.qq?.lyrics);
      const lyrics = parseQRC(raw || "", Number(songInfo.duration || 0));
      return result(sourceId, "Better Lyrics Portato", lyrics);
    }

    case "legato-synced": {
      const raw = parseJsonLyrics(providers.kugou?.lyrics);
      const lyrics = parseLrcLyrics(raw);
      return result(sourceId, "Better Lyrics Legato", lyrics);
    }

    case "musixmatch-synced": {
      const lyrics = parseLrcLyrics(providers.musixmatch?.synced || null);
      return result(sourceId, "Musixmatch", lyrics);
    }

    default:
      return null;
  }
}

export async function fetchUnisonSourceLyrics(
  songInfo: SongInfo,
  sourceId: UnisonSourceId,
): Promise<SourceFetchResult | null> {
  const response = await chrome.runtime.sendMessage({
    type: "FETCH_UNISON_LYRICS",
    songInfo: {
      title: songInfo.title || "",
      artist: songInfo.artist || "",
      album: songInfo.album || "",
      duration: songInfo.duration || 0,
      videoId: currentVideoId() || songInfo.videoId || "",
    },
  });

  if (!response?.success || !response.data) return null;

  const data = response.data as UnisonResponse;
  if (!data.lyrics || !data.format) return null;

  if (data.format === "ttml") {
    const parsed = parseTtmlLyrics(data.lyrics);
    if (!parsed) return null;
    if (sourceId === "unison-richsynced" && parsed.type === "syllable") {
      return result(sourceId, "Better Lyrics Unison", parsed.lyrics, parsed.language);
    }
    if (
      sourceId === "unison-wordsynced" &&
      (parsed.type === "word" || parsed.type === "syllable")
    ) {
      return result(sourceId, "Better Lyrics Unison", parsed.lyrics, parsed.language);
    }
    if (sourceId === "unison-synced" && parsed.type === "line") {
      return result(sourceId, "Better Lyrics Unison", parsed.lyrics, parsed.language);
    }
    return null;
  }

  if (data.format === "lrc") {
    const isWordSynced = data.syncType === "richsync";
    if (sourceId === "unison-wordsynced" && isWordSynced) {
      return result(sourceId, "Better Lyrics Unison", parseLrcLyrics(data.lyrics));
    }
    if (sourceId === "unison-synced" && !isWordSynced) {
      return result(sourceId, "Better Lyrics Unison", parseLrcLyrics(data.lyrics));
    }
  }

  if (data.format === "plain" && sourceId === "unison-plain") {
    return result(sourceId, "Better Lyrics Unison", parsePlainLyrics(data.lyrics));
  }

  return null;
}

