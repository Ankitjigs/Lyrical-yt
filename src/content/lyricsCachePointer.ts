export const LYRICS_CACHE_POINTER_VERSION = 1;

export interface LyricsCachePointer {
  _lyricalCachePointer: number;
  sourceId: string;
  sourceKey: string;
  timestamp?: number;
  videoId?: string;
}

export function isLyricsCachePointer(value: any): value is LyricsCachePointer {
  return (
    value?._lyricalCachePointer === LYRICS_CACHE_POINTER_VERSION &&
    typeof value.sourceId === "string" &&
    value.sourceId.length > 0 &&
    typeof value.sourceKey === "string" &&
    value.sourceKey.length > 0
  );
}

export function createLyricsCachePointer(
  genericKey: string,
  sourceId: string,
  sourceEntry: any,
): LyricsCachePointer {
  return {
    _lyricalCachePointer: LYRICS_CACHE_POINTER_VERSION,
    sourceId,
    sourceKey: `${genericKey}__${sourceId}`,
    ...(typeof sourceEntry?.timestamp === "number"
      ? { timestamp: sourceEntry.timestamp }
      : {}),
    ...(typeof sourceEntry?.videoId === "string"
      ? { videoId: sourceEntry.videoId }
      : {}),
  };
}

export function resolveLyricsCachePointer(
  genericKey: string,
  pointer: any,
  storageItems: Record<string, any>,
): any | null {
  if (!isLyricsCachePointer(pointer)) return null;
  if (pointer.sourceKey !== `${genericKey}__${pointer.sourceId}`) return null;

  const sourceEntry = storageItems[pointer.sourceKey];
  if (sourceEntry?.source && sourceEntry.source !== pointer.sourceId) return null;
  if (sourceEntry?.sourceId && sourceEntry.sourceId !== pointer.sourceId) return null;
  return Array.isArray(sourceEntry?.lyrics) ? sourceEntry : null;
}

export function getLegacyPrimaryPointerUpdates(
  storageItems: Record<string, any>,
): Record<string, LyricsCachePointer> {
  const updates: Record<string, LyricsCachePointer> = {};

  for (const [genericKey, primaryEntry] of Object.entries(storageItems)) {
    if (!genericKey.startsWith("lyrics_") || genericKey.startsWith("lyrics_versions_")) {
      continue;
    }
    if (genericKey.slice("lyrics_".length).includes("__")) continue;
    if (!Array.isArray((primaryEntry as any)?.lyrics)) continue;

    const sourceId =
      (primaryEntry as any)?.source || (primaryEntry as any)?.sourceId;
    if (typeof sourceId !== "string" || !sourceId) continue;

    const sourceKey = `${genericKey}__${sourceId}`;
    const sourceEntry = storageItems[sourceKey];
    if (!Array.isArray(sourceEntry?.lyrics)) continue;
    if (JSON.stringify(primaryEntry) !== JSON.stringify(sourceEntry)) continue;

    updates[genericKey] = createLyricsCachePointer(
      genericKey,
      sourceId,
      sourceEntry,
    );
  }

  return updates;
}

export const LYRICS_VIDEO_POINTER_VERSION = 1;

export interface LyricsVideoCachePointer {
  _lyricalVideoPointer: number;
  videoId: string;
  artist?: string;
  title?: string;
  primarySourceId: string;
  primarySourceKey: string;
  sources: Record<string, string>; // sourceId -> sourceKey
  timestamp?: number;
}

export function isLyricsVideoPointer(
  value: any,
  expectedVideoId?: string,
): value is LyricsVideoCachePointer {
  if (!(
    value?._lyricalVideoPointer === LYRICS_VIDEO_POINTER_VERSION &&
    typeof value.videoId === "string" &&
    value.videoId.length > 0 &&
    typeof value.primarySourceId === "string" &&
    value.primarySourceId.length > 0 &&
    typeof value.primarySourceKey === "string" &&
    value.primarySourceKey.length > 0 &&
    typeof value.sources === "object" &&
    value.sources !== null
  )) return false;

  if (expectedVideoId && value.videoId !== expectedVideoId) return false;
  if (!Object.entries(value.sources).every(([id, key]) =>
    typeof id === "string" && id.length > 0 &&
    typeof key === "string" && key.endsWith(`__${id}`)
  )) return false;

  return value.sources[value.primarySourceId] === value.primarySourceKey;
}

export function createLyricsVideoPointer(
  videoId: string,
  sourceId: string,
  sourceKey: string,
  existingPointer?: any,
  meta?: { artist?: string; title?: string },
  options: { makePrimary?: boolean } = {},
): LyricsVideoCachePointer {
  const validExisting = isLyricsVideoPointer(existingPointer, videoId)
    ? existingPointer
    : null;
  const sources = {
    ...(validExisting?.sources || {}),
    [sourceId]: sourceKey,
  };
  const keepExistingPrimary =
    !options.makePrimary &&
    validExisting &&
    Boolean(sources[validExisting.primarySourceId]);
  const primarySourceId = keepExistingPrimary
    ? validExisting.primarySourceId
    : sourceId;

  return {
    _lyricalVideoPointer: LYRICS_VIDEO_POINTER_VERSION,
    videoId,
    artist: meta?.artist || validExisting?.artist || "",
    title: meta?.title || validExisting?.title || "",
    primarySourceId,
    primarySourceKey: sources[primarySourceId],
    sources,
    timestamp: Date.now(),
  };
}

export function removeLyricsVideoPointerSources(
  pointer: any,
  removedSourceKeys: Set<string>,
): LyricsVideoCachePointer | null {
  if (!isLyricsVideoPointer(pointer)) return null;

  const sources = Object.fromEntries(
    Object.entries(pointer.sources).filter(([, sourceKey]) =>
      !removedSourceKeys.has(sourceKey),
    ),
  );
  const remainingSourceIds = Object.keys(sources);
  if (remainingSourceIds.length === 0) return null;

  const changed = remainingSourceIds.length !== Object.keys(pointer.sources).length;
  const primarySourceId = sources[pointer.primarySourceId]
    ? pointer.primarySourceId
    : remainingSourceIds[0];
  return {
    ...pointer,
    primarySourceId,
    primarySourceKey: sources[primarySourceId],
    sources,
    timestamp: changed || primarySourceId !== pointer.primarySourceId
      ? Date.now()
      : pointer.timestamp,
  };
}
