export type LyricsSourceId =
  | "lyrical"
  | "better_lyrics"
  | "musixmatch"
  | "musixmatch-richsync"
  | "youlyplus-richsynced"
  | "youlyplus-synced"
  | "captions"
  | "lrclib"
  | string;

export interface CaptionTrackInfo {
  vssId: string;
  languageCode: string;
  name: string;
  kind?: string;
  url: string;
  isAsr?: boolean;
}

export interface SongInfo {
  title?: string;
  artist?: string;
  artwork?: string;
  album?: string;
  duration?: number;
  videoId?: string;
  isAd?: boolean;
}

export interface LyricalLyricPart {
  text: string;
  time: number;
  duration: number;
  startTimeMs?: number;
  durationMs?: number;
  words?: string;
  isBackground?: boolean;
}

export interface LyricalLyricLine {
  time: number;
  text?: string;
  duration?: number;
  parts?: LyricalLyricPart[] | null;
  startTimeMs?: number;
  durationMs?: number;
  words?: string;
  agent?: string;
  isInstrumental?: boolean;
  translated?: string;
  romanized?: string;
  timedRomanization?: LyricalLyricPart[] | null;
}

export interface SourcePreference {
  id: LyricsSourceId;
  label: string;
  enabled: boolean;
  tags: string[];
}

export interface ThemeTokenMap {
  [key: string]: string | number | undefined;
}

export interface CustomTheme {
  id: string;
  name: string;
  tokens?: ThemeTokenMap;
  [key: string]: unknown;
}
