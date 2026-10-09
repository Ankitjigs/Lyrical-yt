type SyncCategory = "syllable" | "word" | "line" | "unsynced";

type CacheEntry = {
  key: string;
  value: any;
  type: "primary-cache" | "source-cache" | "versions";
  sourceId: string | null;
};

function getSongId(key: string): string | null {
  if (key.startsWith("lyrics_versions_")) {
    return key.slice("lyrics_versions_".length);
  }
  if (!key.startsWith("lyrics_")) return null;

  const rest = key.slice("lyrics_".length);
  const sourceIndex = rest.lastIndexOf("__");
  return sourceIndex < 0 ? rest : rest.slice(0, sourceIndex);
}

function getVideoId(value: any, seen = new Set<object>()): string | null {
  if (!value || typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);

  if (typeof value?.videoId === "string" && value.videoId.trim()) {
    return value.videoId.trim();
  }

  for (const nested of Object.values(value)) {
    const videoId = getVideoId(nested, seen);
    if (videoId) return videoId;
  }

  return null;
}

function getEntryType(key: string, value: any): CacheEntry["type"] | null {
  if (key.startsWith("lyrics_versions_")) return "versions";
  if (!key.startsWith("lyrics_")) return null;
  if (value?._lyricalCachePointer) return null;

  const rest = key.slice("lyrics_".length);
  const sourceIndex = rest.lastIndexOf("__");
  return sourceIndex < 0 ? "primary-cache" : "source-cache";
}

function getSourceId(key: string, type: CacheEntry["type"], value: any) {
  if (type === "source-cache") {
    return key.slice(key.lastIndexOf("__") + 2) || null;
  }
  return type === "primary-cache"
    ? value?.source || value?.sourceId || null
    : null;
}

function getEntryScore(entry: CacheEntry) {
  const value = entry.value;
  const romanized = value?.romanizedLyrics?.length || 0;
  const translated = value?.translatedLyrics?.length || 0;
  const lineCount = value?.lyrics?.length || 0;
  return (
    (romanized > 0 ? 1000 : 0) +
    (translated > 0 ? 1000 : 0) +
    lineCount * 10 +
    (value?.timestamp || 0) / 1e12
  );
}

export function getDeduplicatedCacheEntries(items: Record<string, any>) {
  const groups = new Map<string, Map<string, CacheEntry>>();

  for (const [key, value] of Object.entries(items)) {
    if (value?.missing === true) continue;
    const type = getEntryType(key, value);
    const songId = getSongId(key);
    if (!type || !songId) continue;

    const videoId = getVideoId(value);
    const groupId = videoId ? `video:${videoId}` : `song:${songId}`;
    const sourceId = getSourceId(key, type, value);
    const dedupId = type === "source-cache" ? `source:${sourceId}` : type;
    const candidate = { key, value, type, sourceId };
    const group = groups.get(groupId) || new Map<string, CacheEntry>();
    const current = group.get(dedupId);

    if (!current || getEntryScore(candidate) > getEntryScore(current)) {
      group.set(dedupId, candidate);
    }
    groups.set(groupId, group);
  }

  return Array.from(groups.values()).flatMap((group) => Array.from(group.values()));
}

export function countCacheSyncTypes(
  entries: Array<{ key: string; value: any; syncType?: string }>,
  detectSyncType: (value: any, key: string) => SyncCategory,
) {
  const counts: Record<SyncCategory, number> = {
    syllable: 0,
    word: 0,
    line: 0,
    unsynced: 0,
  };

  for (const entry of entries) {
    const category = entry.syncType || detectSyncType(entry.value, entry.key);
    counts[category in counts ? category : "unsynced"]++;
  }

  return counts;
}

export function countLyricsCacheSongs(items: Record<string, any>) {
  return new Set(
    getDeduplicatedCacheEntries(items).map((entry) => {
      const videoId = getVideoId(entry.value);
      return videoId || getSongId(entry.key);
    }),
  ).size;
}
