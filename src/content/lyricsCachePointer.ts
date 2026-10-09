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
