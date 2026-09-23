import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Database,
  RefreshCcw,
  Search,
  Trash2,
  Eye,
  EyeOff,
  Music,
  FileJson,
  ChevronDown,
  ChevronUp,
  Languages,
  Type,
  ListMusic,
  Check,
} from "lucide-react";
import { t } from "../../i18n";
import { useAppStore } from "../store";

const YouTubeIcon = ({ size = 16 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
  </svg>
);

const YouTubeBadgeButton = ({
  videoId,
  songKey,
}: {
  videoId: string | null;
  songKey: string;
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const href = videoId
    ? `https://www.youtube.com/watch?v=${videoId}`
    : `https://www.youtube.com/results?search_query=${encodeURIComponent(songKey.replace(/_/g, " "))}`;

  const hoverText = videoId ? "Watch" : "Search";
  const title = videoId ? "Open video on YouTube" : "Search video on YouTube";

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4.5px",
        padding: "2px 8px",
        borderRadius: "999px",
        background: isHovered
          ? "rgba(255, 0, 0, 0.22)"
          : "rgba(255, 0, 0, 0.12)",
        border: `1px solid ${
          isHovered ? "rgba(255, 0, 0, 0.45)" : "rgba(255, 0, 0, 0.25)"
        }`,
        color: isHovered ? "#ff6666" : "#ff4e4e",
        textDecoration: "none",
        fontSize: "11px",
        fontWeight: "600",
        transition: "all 0.18s cubic-bezier(0.16, 1, 0.3, 1)",
        lineHeight: "1.4",
      }}
    >
      <YouTubeIcon size={13} />
      <span>YouTube</span>
    </a>
  );
};

const SOURCE_LABELS = {
  lyrical: "Lyrical",
  "test-lyrical": "Test Lyrical",
  better_lyrics: "Better Lyrics",
  "youlyplus-richsynced": "YouLy+",
  "youlyplus-synced": "YouLy+",
  musixmatch: "Musixmatch",
  "musixmatch-richsync": "Musixmatch RichSync",
  lrclib: "LRCLib",
  captions: "YouTube Captions",
};

function getSourceLabel(sourceId) {
  if (!sourceId) return "";
  return t(`source_${sourceId.replace(/-/g, "_")}`, undefined, SOURCE_LABELS[sourceId] || sourceId);
}

function parseCacheKey(key) {
  if (key.startsWith("lyrics_versions_")) {
    const songKey = key.slice("lyrics_versions_".length);
    return {
      key,
      songKey,
      type: "versions",
      sourceId: null,
    };
  }

  if (key.startsWith("lyrics_")) {
    const rest = key.slice("lyrics_".length);
    const sourceSeparatorIndex = rest.lastIndexOf("__");
    const hasSourceSuffix = sourceSeparatorIndex !== -1;
    const songKey = hasSourceSuffix
      ? rest.slice(0, sourceSeparatorIndex)
      : rest;
    const sourceId = hasSourceSuffix
      ? rest.slice(sourceSeparatorIndex + 2)
      : null;

    return {
      key,
      songKey,
      type: sourceId ? "source-cache" : "primary-cache",
      sourceId,
    };
  }

  return null;
}

function formatSongLabel(songKey) {
  if (!songKey) return t("cacheEditor_unknownSong");
  return songKey.replaceAll("_", " • ");
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return t("cacheEditor_noTimestamp");
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 1) return t("cacheEditor_justNow");
  if (minutes < 60) return t("cacheEditor_minutesAgo", [String(minutes)]);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("cacheEditor_hoursAgo", [String(hours)]);
  const days = Math.floor(hours / 24);
  return t("cacheEditor_daysAgo", [String(days)]);
}

function formatSeconds(secs: number | undefined | null) {
  if (typeof secs !== "number" || isNaN(secs)) return "00:00.00";
  const m = Math.floor(secs / 60);
  const s = (secs % 60).toFixed(2);
  return `${m.toString().padStart(2, "0")}:${s.padStart(5, "0")}`;
}

function buildPreview(value, type) {
  if (type === "versions") {
    return Object.entries(value || {})
      .slice(0, 4)
      .map(([id, version]) => `${(version as any)?.label || id}`)
      .join(", ");
  }

  const lyrics = value?.lyrics || [];
  return lyrics
    .slice(0, 3)
    .map((line) => line?.text || "")
    .filter(Boolean)
    .join(" / ");
}

function formatTrackDisplayName(track: any): string {
  if (!track) return "Track";
  const rawLabel = track.label || "";
  const lang = track.language || "";
  const isAsr =
    track.isAsr ||
    rawLabel.toLowerCase().includes("auto") ||
    String(track.trackId || "").includes("asr");

  if (
    rawLabel &&
    !rawLabel.toLowerCase().startsWith("captions") &&
    rawLabel.toLowerCase() !== "youtube captions"
  ) {
    return isAsr && !rawLabel.toLowerCase().includes("auto")
      ? `${rawLabel} (auto)`
      : rawLabel;
  }

  const langMatch = rawLabel.match(/Captions\s*\(([^)]+)\)/i);
  const code = lang || (langMatch ? langMatch[1] : "");

  if (code && code !== "default" && code !== "auto") {
    try {
      const cleanCode = code.split("-")[0].toLowerCase();
      const intlName = new Intl.DisplayNames(["en"], { type: "language" }).of(cleanCode);
      if (intlName) {
        return isAsr ? `${intlName} (auto)` : intlName;
      }
    } catch {}
    return isAsr ? `${code.toUpperCase()} (auto)` : code.toUpperCase();
  }

  return isAsr ? "English (auto)" : "English";
}

function extractVideoId(val: any): string | null {
  if (!val) return null;
  if (typeof val.videoId === "string" && val.videoId.trim()) {
    return val.videoId.trim();
  }
  if (typeof val.tracks === "object" && val.tracks) {
    for (const tr of Object.values(val.tracks)) {
      if (typeof (tr as any)?.videoId === "string" && (tr as any).videoId.trim()) {
        return (tr as any).videoId.trim();
      }
    }
  }
  if (typeof val === "object") {
    for (const v of Object.values(val)) {
      if (typeof (v as any)?.videoId === "string" && (v as any).videoId.trim()) {
        return (v as any).videoId.trim();
      }
    }
  }
  return null;
}

function extractVideoIdFromGroup(grp: any): string | null {
  if (!grp) return null;
  if (grp.videoId) return grp.videoId;
  if (Array.isArray(grp.entries)) {
    for (const e of grp.entries) {
      const vid = extractVideoId(e.value);
      if (vid) return vid;
    }
  }
  return null;
}

function normalizeCacheGroups(
  items: Record<string, any>,
  activeContext?: { videoId?: string | null; songKey?: string | null },
) {
  const grouped = new Map();

  const currentStoreSong = useAppStore.getState().songInfo;
  const storeSongKey = currentStoreSong
    ? `${currentStoreSong.artist || ""}_${currentStoreSong.title || ""}`
    : null;
  const storeVideoId = currentStoreSong?.videoId || null;

  Object.entries(items).forEach(([key, value]: [string, any]) => {
    if (value?.missing === true) return;
    const parsed = parseCacheKey(key);
    if (!parsed) return;

    const sizeBytes = new Blob([JSON.stringify(value)]).size;
    const lyrics = Array.isArray(value?.lyrics) ? value.lyrics : [];
    const romanizedLyrics = Array.isArray(value?.romanizedLyrics)
      ? value.romanizedLyrics
      : [];
    const translatedLyrics = Array.isArray(value?.translatedLyrics)
      ? value.translatedLyrics
      : [];
    const romanizedCount = romanizedLyrics.filter(
      (l: any) => Boolean(l?.romanized || l?.romanization),
    ).length;
    const translatedCount = translatedLyrics.filter(
      (l: any) => Boolean(l?.translated || l?.translation),
    ).length;

    const preview = buildPreview(value, parsed.type);
    const versionCount =
      parsed.type === "versions" ? Object.keys(value || {}).length : 0;

    const entry = {
      ...parsed,
      sizeBytes,
      preview,
      timestamp: value?.timestamp || null,
      lineCount: lyrics.length,
      versionCount,
      romanizedCount,
      translatedCount,
      romanizedLyrics,
      translatedLyrics,
      value,
      sourceLabel: parsed.sourceId
        ? getSourceLabel(parsed.sourceId)
        : parsed.type === "versions"
          ? t("cacheEditor_savedVersions")
          : t("cacheEditor_primaryCache"),
    };

    if (!grouped.has(parsed.songKey)) {
      grouped.set(parsed.songKey, {
        id: parsed.songKey,
        title: formatSongLabel(parsed.songKey),
        entries: [],
        videoId: null,
      });
    }

    const grp = grouped.get(parsed.songKey);
    grp.entries.push(entry);

    if (!grp.videoId) {
      const vid = extractVideoId(value);
      if (vid) {
        grp.videoId = vid;
      }
    }

    if (!grp.videoId && storeVideoId && storeSongKey) {
      const normA = parsed.songKey.toLowerCase().replace(/[^a-z0-9]/g, "");
      const normB = storeSongKey.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (normA === normB || parsed.songKey === storeSongKey) {
        grp.videoId = storeVideoId;
      }
    }

    if (!grp.videoId && activeContext?.videoId && activeContext.songKey) {
      const normA = parsed.songKey.toLowerCase().replace(/[^a-z0-9]/g, "");
      const normB = activeContext.songKey.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (normA === normB || parsed.songKey === activeContext.songKey) {
        grp.videoId = activeContext.videoId;
      }
    }
  });

  // Merge groups that share the same non-null videoId
  const videoIdToGroup = new Map<string, any>();
  const finalGroups: any[] = [];

  for (const group of grouped.values()) {
    if (group.videoId) {
      if (videoIdToGroup.has(group.videoId)) {
        const primary = videoIdToGroup.get(group.videoId);
        primary.entries.push(...group.entries);
        if (!primary.altIds) {
          primary.altIds = [primary.id];
        }
        primary.altIds.push(group.id);

        // If the current group matches active songKey, prioritize its title/id
        if (
          (storeSongKey &&
            group.id.toLowerCase().replace(/[^a-z0-9]/g, "") ===
              storeSongKey.toLowerCase().replace(/[^a-z0-9]/g, "")) ||
          (activeContext?.songKey &&
            group.id.toLowerCase().replace(/[^a-z0-9]/g, "") ===
              activeContext.songKey.toLowerCase().replace(/[^a-z0-9]/g, ""))
        ) {
          primary.title = group.title;
          primary.id = group.id;
        }
        continue;
      } else {
        group.altIds = [group.id];
        videoIdToGroup.set(group.videoId, group);
      }
    }
    finalGroups.push(group);
  }

  return finalGroups
    .map((group: any) => ({
      ...group,
      totalBytes: group.entries.reduce(
        (sum: number, entry: any) => sum + entry.sizeBytes,
        0,
      ),
      latestTimestamp: group.entries.reduce(
        (latest: number, entry: any) => Math.max(latest, entry.timestamp || 0),
        0,
      ),
      entries: group.entries.sort((a: any, b: any) => {
        const priority: Record<string, number> = {
          "primary-cache": 0,
          "source-cache": 1,
          versions: 2,
        };
        return (
          (priority[a.type] ?? 99) - (priority[b.type] ?? 99) ||
          (b.timestamp || 0) - (a.timestamp || 0)
        );
      }),
    }))
    .sort((a: any, b: any) => (b.latestTimestamp || 0) - (a.latestTimestamp || 0));
}

const CacheEditorView = ({ isOpen, onClose, onCacheChange }) => {
  const [groups, setGroups] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState(() => new Set());
  const [expandedGroups, setExpandedGroups] = useState(() => new Set());
  const [viewTabs, setViewTabs] = useState<Record<string, "formatted" | "raw">>({});
  const [selectedEntryTracks, setSelectedEntryTracks] = useState<Record<string, string>>({});
  const [openTrackDropdownKey, setOpenTrackDropdownKey] = useState<string | null>(null);

  const refreshCache = async () => {
    setLoading(true);
    try {
      let activeTabVideoId: string | null = null;
      let activeTabSongKey: string | null = null;

      try {
        if (typeof chrome !== "undefined" && chrome.tabs?.query) {
          const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
          const activeTab = tabs[0];
          if (activeTab?.url && activeTab.url.includes("youtube.com/watch")) {
            activeTabVideoId = new URL(activeTab.url).searchParams.get("v");
          }
        }
      } catch (e) {
        // ignore
      }

      if (!activeTabVideoId && typeof window !== "undefined" && window.location?.search) {
        activeTabVideoId = new URLSearchParams(window.location.search).get("v");
      }

      const currentStoreSong = useAppStore.getState().songInfo;
      if (currentStoreSong?.title && currentStoreSong?.artist) {
        activeTabSongKey = `${currentStoreSong.artist}_${currentStoreSong.title}`;
      }

      const items = await chrome.storage.local.get(null);
      const normalized = normalizeCacheGroups(items, {
        videoId: activeTabVideoId,
        songKey: activeTabSongKey,
      });

      // Silently backfill videoId into storage for any group that resolved it
      // so it persists permanently for subsequent opens
      for (const grp of normalized) {
        if (grp.videoId) {
          for (const entry of grp.entries) {
            if (entry.key && !entry.value?.videoId) {
              chrome.storage.local.set({
                [entry.key]: {
                  ...entry.value,
                  videoId: grp.videoId,
                },
              }).catch(() => {});
            }
          }
        }
      }

      setGroups(normalized);
      onCacheChange?.();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    refreshCache();
  }, [isOpen]);

  useEffect(() => {
    if (!openTrackDropdownKey) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest(`[data-track-dropdown="${openTrackDropdownKey}"]`)) {
        setOpenTrackDropdownKey(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenTrackDropdownKey(null);
      }
    };

    window.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [openTrackDropdownKey]);

  const filteredGroups = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return groups;

    return groups
      .map((group) => {
        const matchingEntries = group.entries.filter((entry) => {
          const searchableText = [
            group.title,
            entry.key,
            entry.sourceLabel,
            entry.preview,
          ]
            .join(" ")
            .toLowerCase();
          return searchableText.includes(query);
        });

        if (group.title.toLowerCase().includes(query)) {
          return group;
        }

        if (matchingEntries.length === 0) return null;
        return { ...group, entries: matchingEntries };
      })
      .filter(Boolean);
  }, [groups, searchTerm]);

  const toggleExpanded = (key) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleGroupExpanded = (groupId) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const removeOffsetsForSong = async ({
    videoId,
    songKey,
    altSongKeys,
    sourceId,
  }: {
    videoId?: string | null;
    songKey?: string | null;
    altSongKeys?: string[] | null;
    sourceId?: string | null;
  }) => {
    try {
      const targetVid = videoId?.trim();
      const targetSong = songKey?.trim();
      const targetSource = sourceId?.trim();
      const allTargetSongs = Array.from(
        new Set([targetSong, ...(altSongKeys || [])].filter(Boolean) as string[]),
      );

      const [localData, syncData] = await Promise.all([
        chrome.storage.local.get("songOffsets"),
        chrome.storage.sync.get("songOffsets"),
      ]);

      const cleanOffsets = (offsetsObj: Record<string, any> | undefined) => {
        if (!offsetsObj || typeof offsetsObj !== "object") return offsetsObj;
        const next = { ...offsetsObj };
        let changed = false;

        for (const key of Object.keys(next)) {
          let shouldRemove = false;

          if (targetSource && targetVid) {
            // Specific source offset deletion for a known video
            const sourceMatch =
              targetSource === "musixmatch" || targetSource === "musixmatch-richsync"
                ? key.includes("musixmatch")
                : key.includes(`_${targetSource}`);
            if (key.includes(targetVid) && sourceMatch) {
              shouldRemove = true;
            }
          } else if (targetVid) {
            // Entire video / song group offset deletion
            if (key.includes(targetVid)) {
              shouldRemove = true;
            }
          }

          // Check if key matches songKey / artist__title
          if (!shouldRemove && allTargetSongs.length > 0) {
            const normKeyClean = key.toLowerCase().replace(/[^a-z0-9]/g, "");
            for (const s of allTargetSongs) {
              const normSong = s.toLowerCase().replace(/[^a-z0-9]/g, "");
              if (
                normKeyClean.includes(normSong) ||
                key.includes(s) ||
                key.includes(s.replace(/_/g, "__"))
              ) {
                if (targetSource) {
                  const sourceMatch =
                    targetSource === "musixmatch" || targetSource === "musixmatch-richsync"
                      ? key.includes("musixmatch")
                      : key.includes(`_${targetSource}`);
                  if (sourceMatch) shouldRemove = true;
                } else {
                  shouldRemove = true;
                }
                break;
              }
            }
          }

          if (shouldRemove) {
            delete next[key];
            changed = true;
          }
        }

        return changed ? next : offsetsObj;
      };

      const newLocalOffsets = cleanOffsets(localData?.songOffsets);
      const newSyncOffsets = cleanOffsets(syncData?.songOffsets);

      const saves: Promise<any>[] = [];
      if (newLocalOffsets !== localData?.songOffsets) {
        saves.push(chrome.storage.local.set({ songOffsets: newLocalOffsets }));
      }
      if (newSyncOffsets !== syncData?.songOffsets) {
        saves.push(chrome.storage.sync.set({ songOffsets: newSyncOffsets }));
      }

      if (saves.length > 0) {
        await Promise.all(saves);
      }

      // If this song/video is currently active in the player, reset the live offset
      const currentSong = useAppStore.getState().songInfo;
      const currentVid =
        currentSong?.videoId ||
        (typeof window !== "undefined" && window.location?.search
          ? new URLSearchParams(window.location.search).get("v")
          : null);

      const isCurrentVideo =
        (targetVid && currentVid === targetVid) ||
        (targetSong &&
          currentSong &&
          `${currentSong.artist}_${currentSong.title}`
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "") ===
            targetSong.toLowerCase().replace(/[^a-z0-9]/g, ""));

      if (isCurrentVideo) {
        const currentSource = useAppStore.getState().lyricsSource;
        if (!targetSource || targetSource === currentSource) {
          useAppStore.getState().setOffset(-0.45, 0);
        }
      }
    } catch (err) {
      console.warn("[CacheEditor] Failed to clean up song offsets:", err);
    }
  };

  const deleteEntry = async (entryOrKey: any, group?: any) => {
    const key = typeof entryOrKey === "string" ? entryOrKey : entryOrKey?.key;
    if (!key) return;

    await chrome.storage.local.remove(key);

    const entry = typeof entryOrKey === "object" ? entryOrKey : null;
    const vid =
      extractVideoId(entry?.value) ||
      group?.videoId ||
      extractVideoIdFromGroup(group) ||
      null;
    const songKey = entry?.songKey || group?.id || null;
    const sourceId = entry?.sourceId || null;

    await removeOffsetsForSong({
      videoId: vid,
      songKey,
      sourceId,
    });

    await refreshCache();
  };

  const deleteSongGroup = async (group: any) => {
    const allStorage = await chrome.storage.local.get(null);
    const targetIds: string[] =
      group.altIds && group.altIds.length > 0 ? group.altIds : [group.id];
    const keysToRemove = Object.keys(allStorage).filter((key) =>
      targetIds.some((id) => key.includes(id)),
    );
    await chrome.storage.local.remove(
      keysToRemove.length > 0
        ? keysToRemove
        : group.entries.map((entry: any) => entry.key),
    );

    const vid = extractVideoIdFromGroup(group);
    await removeOffsetsForSong({
      videoId: vid,
      songKey: group.id,
      altSongKeys: group.altIds,
    });

    await refreshCache();
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 140,
        background: "var(--lyrical-page-bg)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "18px 24px",
          borderBottom: "1px solid var(--lyrical-border-soft)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "999px",
              border: "1px solid var(--lyrical-border)",
              background: "var(--lyrical-card-bg-elevated)",
              color: "var(--lyrical-text-primary)",
              display: "grid",
              placeItems: "center",
              cursor: "pointer",
            }}
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <div
              style={{
                fontSize: "18px",
                fontWeight: "700",
                color: "var(--lyrical-text-primary)",
              }}
            >
              {t("cacheEditor_title")}
            </div>
            <div
              style={{
                fontSize: "12px",
                color: "var(--lyrical-text-muted)",
                marginTop: "2px",
              }}
            >
              {t("cacheEditor_description")}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={refreshCache}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 14px",
            borderRadius: "12px",
            border: "1px solid var(--lyrical-border)",
            background: "var(--lyrical-card-bg-elevated)",
            color: "var(--lyrical-text-primary)",
            fontSize: "13px",
            fontWeight: "600",
            cursor: "pointer",
          }}
        >
          <RefreshCcw size={14} />
          {t("common_refresh")}
        </button>
      </div>

      <div
        style={{
          padding: "18px 24px 16px",
          flexShrink: 0,
          borderBottom: "1px solid var(--lyrical-border-soft)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "12px 14px",
            borderRadius: "14px",
            background: "var(--lyrical-card-bg-elevated)",
            border: "1px solid var(--lyrical-border)",
          }}
        >
          <Search size={16} color="var(--lyrical-text-muted)" />
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder={t("cacheEditor_searchPlaceholder")}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--lyrical-text-primary)",
              fontSize: "13px",
            }}
          />
        </div>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "scroll",
          padding: "18px 28px 24px 24px",
          display: "flex",
          flexDirection: "column",
          gap: "14px",
        }}
      >
        {loading ? (
          <div
            style={{
              padding: "20px",
              borderRadius: "16px",
              background: "var(--lyrical-card-bg)",
              border: "1px solid var(--lyrical-border-soft)",
              color: "var(--lyrical-text-secondary)",
              textAlign: "center",
            }}
          >
            {t("cacheEditor_loading")}
          </div>
        ) : filteredGroups.length === 0 ? (
          <div
            style={{
              padding: "28px 20px",
              borderRadius: "16px",
              background: "var(--lyrical-card-bg)",
              border: "1px solid var(--lyrical-border-soft)",
              color: "var(--lyrical-text-secondary)",
              textAlign: "center",
            }}
          >
            {t("cacheEditor_noMatches")}
          </div>
        ) : (
          filteredGroups.map((group) => {
            const isGroupExpanded = expandedGroups.has(group.id);
            return (
              <div
                key={group.id}
                style={{
                  borderRadius: "18px",
                  background: "var(--lyrical-card-bg)",
                  border: "1px solid var(--lyrical-border-soft)",
                }}
              >
                <div
                  style={{
                    padding: "16px 18px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "12px",
                    background: "var(--lyrical-panel-surface-soft)",
                    cursor: "pointer",
                    userSelect: "none",
                    borderRadius: "18px",
                  }}
                  onClick={() => toggleGroupExpanded(group.id)}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        marginBottom: "6px",
                      }}
                    >
                      <Music size={14} color="var(--lyrical-accent)" />
                      <span
                        style={{
                          fontSize: "14px",
                          fontWeight: "700",
                          color: "var(--lyrical-text-primary)",
                        }}
                      >
                        {group.title}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "var(--lyrical-text-muted)",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        flexWrap: "wrap",
                      }}
                    >
                      <span>
                        {group.entries.length} entries •{" "}
                        {formatBytes(group.totalBytes)}
                      </span>
                      <span style={{ opacity: 0.5 }}>•</span>
                      <YouTubeBadgeButton videoId={group.videoId} songKey={group.id} />
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      flexShrink: 0,
                    }}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSongGroup(group);
                      }}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "7px 12px",
                        borderRadius: "8px",
                        border:
                          "1px solid var(--lyrical-danger-border, rgba(239, 68, 68, 0.32))",
                        background:
                          "var(--lyrical-danger-soft, rgba(239, 68, 68, 0.14))",
                        color: "var(--lyrical-danger-text, #f87171)",
                        cursor: "pointer",
                        fontSize: "12px",
                        fontWeight: "600",
                        transition: "all 0.16s ease",
                        boxShadow: "0 2px 6px rgba(239, 68, 68, 0.08)",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background =
                          "var(--lyrical-danger-hover, rgba(239, 68, 68, 0.24))";
                        e.currentTarget.style.borderColor =
                          "rgba(239, 68, 68, 0.55)";
                        e.currentTarget.style.color = "#ffffff";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background =
                          "var(--lyrical-danger-soft, rgba(239, 68, 68, 0.14))";
                        e.currentTarget.style.borderColor =
                          "var(--lyrical-danger-border, rgba(239, 68, 68, 0.32))";
                        e.currentTarget.style.color =
                          "var(--lyrical-danger-text, #f87171)";
                      }}
                    >
                      <Trash2 size={14} />
                      {t("cacheEditor_deleteSong")}
                    </button>
                    <button
                      type="button"
                      style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "8px",
                        border: "1px solid var(--lyrical-border-soft)",
                        background: "var(--lyrical-card-bg-elevated)",
                        color: "var(--lyrical-text-primary)",
                        display: "grid",
                        placeItems: "center",
                        cursor: "pointer",
                      }}
                    >
                      {isGroupExpanded ? (
                        <ChevronUp size={16} />
                      ) : (
                        <ChevronDown size={16} />
                      )}
                    </button>
                  </div>
                </div>

                {isGroupExpanded && (
                  <div
                    style={{
                      padding: "10px 12px 14px",
                      display: "grid",
                      gap: "10px",
                    }}
                  >
                    {group.entries.map((entry) => {
                      const isExpanded = expandedKeys.has(entry.key);

                      const rawTracks =
                        entry.value?.tracks &&
                        typeof entry.value.tracks === "object"
                          ? Object.values(entry.value.tracks)
                          : [];

                      const trackDedupMap = new Map<string, any>();
                      for (const t of rawTracks as any[]) {
                        if (!t) continue;
                        const displayName = formatTrackDisplayName(t);
                        const isAsr = Boolean(
                          t.isAsr ||
                            String(t.trackId || "").includes("asr") ||
                            String(t.label || "").toLowerCase().includes("auto"),
                        );
                        const dedupKey = `${displayName.toLowerCase()}_${isAsr ? "asr" : "manual"}`;
                        const existing = trackDedupMap.get(dedupKey);
                        if (
                          !existing ||
                          (t.lyrics?.length && !existing.lyrics?.length) ||
                          (t.translatedLyrics?.length || 0) >
                            (existing.translatedLyrics?.length || 0) ||
                          (t.romanizedLyrics?.length || 0) >
                            (existing.romanizedLyrics?.length || 0)
                        ) {
                          trackDedupMap.set(dedupKey, t);
                        }
                      }
                      const availableTracks = Array.from(trackDedupMap.values());

                      const activeTrackId =
                        selectedEntryTracks[entry.key] ||
                        entry.value?.activeTrackId ||
                        (availableTracks[0] as any)?.trackId ||
                        (availableTracks[0] as any)?.language ||
                        null;

                      const activeTrackData: any =
                        availableTracks.length > 0
                          ? (entry.value?.tracks?.[activeTrackId] ||
                            availableTracks[0])
                          : null;

                      const currentLyrics =
                        activeTrackData?.lyrics ||
                        entry.value?.lyrics ||
                        [];
                      const currentRomanized =
                        activeTrackData?.romanizedLyrics ||
                        entry.romanizedLyrics ||
                        [];
                      const currentTranslated =
                        activeTrackData?.translatedLyrics ||
                        entry.translatedLyrics ||
                        [];
                      const currentLineCount = currentLyrics.length;
                      const currentRomanizedCount =
                        currentRomanized.filter((l: any) =>
                          Boolean(l?.romanized || l?.romanization),
                        ).length;
                      const currentTranslatedCount =
                        currentTranslated.filter((l: any) =>
                          Boolean(l?.translated || l?.translation),
                        ).length;
                      const currentPreview =
                        activeTrackData?.lyrics?.length
                          ? buildPreview(activeTrackData, entry.type)
                          : entry.preview;

                      return (
                        <div
                          key={entry.key}
                          style={{
                            borderRadius: "14px",
                            border: "1px solid var(--lyrical-border-soft)",
                            background: "var(--lyrical-card-bg-elevated)",
                            position: "relative",
                            zIndex: openTrackDropdownKey === entry.key ? 50 : 1,
                            overflow: "visible",
                          }}
                        >
                          <div
                            style={{
                              padding: "14px 14px 12px",
                              display: "grid",
                              gap: "10px",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                gap: "12px",
                                alignItems: "flex-start",
                              }}
                            >
                              <div style={{ minWidth: 0 }}>
                                <div
                                  style={{
                                    display: "flex",
                                    flexWrap: "wrap",
                                    gap: "8px",
                                    alignItems: "center",
                                    marginBottom: "6px",
                                  }}
                                >
                                  <span
                                    style={{
                                      padding: "4px 8px",
                                      borderRadius: "999px",
                                      background: "var(--lyrical-accent-soft)",
                                      color: "var(--lyrical-accent)",
                                      fontSize: "11px",
                                      fontWeight: "700",
                                      letterSpacing: "0.04em",
                                      textTransform: "uppercase",
                                    }}
                                  >
                                    {entry.type === "versions"
                                      ? t("cacheEditor_savedVersions")
                                      : entry.sourceLabel}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: "11px",
                                      color: "var(--lyrical-text-muted)",
                                    }}
                                  >
                                    {entry.timestamp
                                      ? formatRelativeTime(entry.timestamp)
                                      : t("cacheEditor_noTimestamp")}
                                  </span>
                                </div>
                                <div
                                  style={{
                                    fontSize: "12px",
                                    color: "var(--lyrical-text-secondary)",
                                    fontFamily: "monospace",
                                    wordBreak: "break-all",
                                  }}
                                >
                                  {entry.key}
                                </div>
                              </div>
                              <div
                                style={{
                                  display: "flex",
                                  gap: "8px",
                                  flexShrink: 0,
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() => toggleExpanded(entry.key)}
                                  style={{
                                    width: "34px",
                                    height: "34px",
                                    borderRadius: "10px",
                                    border: "1px solid var(--lyrical-border)",
                                    background: "transparent",
                                    color: "var(--lyrical-text-primary)",
                                    display: "grid",
                                    placeItems: "center",
                                    cursor: "pointer",
                                  }}
                                >
                                  {isExpanded ? (
                                    <EyeOff size={15} />
                                  ) : (
                                    <Eye size={15} />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteEntry(entry, group)}
                                  style={{
                                    width: "34px",
                                    height: "34px",
                                    borderRadius: "8px",
                                    border:
                                      "1px solid var(--lyrical-danger-border, rgba(239, 68, 68, 0.32))",
                                    background:
                                      "var(--lyrical-danger-soft, rgba(239, 68, 68, 0.14))",
                                    color:
                                      "var(--lyrical-danger-text, #f87171)",
                                    display: "grid",
                                    placeItems: "center",
                                    cursor: "pointer",
                                    transition: "all 0.16s ease",
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.background =
                                      "var(--lyrical-danger-hover, rgba(239, 68, 68, 0.24))";
                                    e.currentTarget.style.borderColor =
                                      "rgba(239, 68, 68, 0.55)";
                                    e.currentTarget.style.color = "#ffffff";
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.background =
                                      "var(--lyrical-danger-soft, rgba(239, 68, 68, 0.14))";
                                    e.currentTarget.style.borderColor =
                                      "var(--lyrical-danger-border, rgba(239, 68, 68, 0.32))";
                                    e.currentTarget.style.color =
                                      "var(--lyrical-danger-text, #f87171)";
                                  }}
                                >
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            </div>

                            <div
                              style={{
                                display: "flex",
                                flexWrap: "wrap",
                                alignItems: "center",
                                gap: "8px",
                                fontSize: "12px",
                                color: "var(--lyrical-text-secondary)",
                              }}
                            >
                              <span>{formatBytes(entry.sizeBytes)}</span>
                              <span style={{ opacity: 0.4 }}>•</span>
                              {entry.type === "versions" ? (
                                <span>
                                  {t("cacheEditor_versions", [
                                    String(entry.versionCount),
                                  ])}
                                </span>
                              ) : (
                                <span>
                                  {t("cacheEditor_lyricLines", [
                                    String(currentLineCount),
                                  ])}
                                </span>
                              )}

                              {availableTracks.length > 1 && (
                                <div
                                  data-track-dropdown={entry.key}
                                  style={{
                                    position: "relative",
                                    display: "inline-block",
                                  }}
                                >
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenTrackDropdownKey(
                                        openTrackDropdownKey === entry.key
                                          ? null
                                          : entry.key,
                                      );
                                    }}
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "5px",
                                      padding: "3px 9px",
                                      borderRadius: "999px",
                                      background: "rgba(56, 189, 248, 0.12)",
                                      color: "#7dd3fc",
                                      border: "1px solid rgba(56, 189, 248, 0.28)",
                                      fontSize: "11px",
                                      fontWeight: "600",
                                      cursor: "pointer",
                                      transition: "all 0.16s ease",
                                    }}
                                  >
                                    <Languages size={11} style={{ opacity: 0.85 }} />
                                    <span>
                                      {formatTrackDisplayName(activeTrackData)}
                                    </span>
                                    <ChevronDown
                                      size={11}
                                      style={{ opacity: 0.7 }}
                                    />
                                  </button>
                                  {openTrackDropdownKey === entry.key && (
                                    <div
                                      style={{
                                        position: "absolute",
                                        top: "calc(100% + 5px)",
                                        left: 0,
                                        zIndex: 1000,
                                        minWidth: "150px",
                                        padding: "4px",
                                        borderRadius: "9px",
                                        background:
                                          "color-mix(in srgb, var(--lyrical-panel-surface-strong, #13131d) 94%, #000000 6%)",
                                        border:
                                          "1px solid rgba(255, 255, 255, 0.14)",
                                        boxShadow:
                                          "0 12px 30px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
                                        backdropFilter: "blur(24px)",
                                        WebkitBackdropFilter: "blur(24px)",
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: "2px",
                                        boxSizing: "border-box",
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {availableTracks.map((t: any) => {
                                        const trackKey =
                                          t.trackId || t.language;
                                        const isCurrent =
                                          trackKey ===
                                          (activeTrackData?.trackId ||
                                            activeTrackData?.language);
                                        const trackName = formatTrackDisplayName(t);
                                        return (
                                          <button
                                            key={trackKey}
                                            type="button"
                                            onClick={() => {
                                              setSelectedEntryTracks(
                                                (prev) => ({
                                                  ...prev,
                                                  [entry.key]: trackKey,
                                                }),
                                              );
                                              setOpenTrackDropdownKey(null);
                                            }}
                                            style={{
                                              display: "flex",
                                              alignItems: "center",
                                              justifyContent:
                                                "space-between",
                                              padding: "6px 9px",
                                              borderRadius: "6px",
                                              border: "none",
                                              background: isCurrent
                                                ? "rgba(255, 255, 255, 0.12)"
                                                : "transparent",
                                              color: isCurrent
                                                ? "#ffffff"
                                                : "var(--lyrical-text-secondary)",
                                              fontSize: "11px",
                                              fontWeight: isCurrent
                                                ? "650"
                                                : "500",
                                              cursor: "pointer",
                                              textAlign: "left",
                                              whiteSpace: "nowrap",
                                              transition: "background 0.12s ease",
                                            }}
                                          >
                                            <span>{trackName}</span>
                                            {isCurrent && (
                                              <Check
                                                size={11}
                                                style={{
                                                  marginLeft: 8,
                                                  color: "#38bdf8",
                                                  flexShrink: 0,
                                                }}
                                              />
                                            )}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              )}

                              {currentRomanizedCount > 0 ? (
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "4px",
                                    padding: "2px 7px",
                                    borderRadius: "999px",
                                    background: "rgba(168, 85, 247, 0.14)",
                                    color: "#c084fc",
                                    border:
                                      "1px solid rgba(168, 85, 247, 0.25)",
                                    fontSize: "11px",
                                    fontWeight: "600",
                                  }}
                                  title={`${currentRomanizedCount} romanized lines cached`}
                                >
                                  <Type size={11} />
                                  <span>
                                    Romanized ({currentRomanizedCount})
                                  </span>
                                </span>
                              ) : null}

                              {currentTranslatedCount > 0 ? (
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "4px",
                                    padding: "2px 7px",
                                    borderRadius: "999px",
                                    background: "rgba(59, 130, 246, 0.14)",
                                    color: "#60a5fa",
                                    border:
                                      "1px solid rgba(59, 130, 246, 0.25)",
                                    fontSize: "11px",
                                    fontWeight: "600",
                                  }}
                                  title={`${currentTranslatedCount} translated lines cached`}
                                >
                                  <Languages size={11} />
                                  <span>
                                    Translated ({currentTranslatedCount})
                                  </span>
                                </span>
                              ) : null}
                            </div>

                            {currentPreview ? (
                              <div
                                style={{
                                  fontSize: "12px",
                                  color: "var(--lyrical-text-muted)",
                                  lineHeight: "1.5",
                                }}
                              >
                                {currentPreview}
                              </div>
                            ) : null}
                          </div>

                          {isExpanded ? (
                            <div
                              style={{
                                padding: "0 14px 14px",
                              }}
                            >
                              <div
                                style={{
                                  borderRadius: "12px",
                                  background: "rgba(0,0,0,0.22)",
                                  border:
                                    "1px solid var(--lyrical-border-soft)",
                                  padding: "14px",
                                }}
                              >
                                {entry.lineCount > 0 ? (
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "space-between",
                                      marginBottom: "12px",
                                      borderBottom:
                                        "1px solid var(--lyrical-border-soft)",
                                      paddingBottom: "8px",
                                      flexWrap: "wrap",
                                      gap: "8px",
                                    }}
                                  >
                                    <div style={{ display: "flex", gap: "6px" }}>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setViewTabs((prev) => ({
                                            ...prev,
                                            [entry.key]: "formatted",
                                          }))
                                        }
                                        style={{
                                          display: "inline-flex",
                                          alignItems: "center",
                                          gap: "5px",
                                          padding: "5px 10px",
                                          borderRadius: "8px",
                                          border: "none",
                                          background:
                                            (viewTabs[entry.key] ||
                                              "formatted") === "formatted"
                                              ? "var(--lyrical-accent)"
                                              : "transparent",
                                          color:
                                            (viewTabs[entry.key] ||
                                              "formatted") === "formatted"
                                              ? "var(--lyrical-text-on-accent, #fff)"
                                              : "var(--lyrical-text-secondary)",
                                          fontSize: "11px",
                                          fontWeight: "700",
                                          cursor: "pointer",
                                          transition: "all 0.15s ease",
                                        }}
                                      >
                                        <ListMusic size={13} />
                                        <span>Formatted Lyrics</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setViewTabs((prev) => ({
                                            ...prev,
                                            [entry.key]: "raw",
                                          }))
                                        }
                                        style={{
                                          display: "inline-flex",
                                          alignItems: "center",
                                          gap: "5px",
                                          padding: "5px 10px",
                                          borderRadius: "8px",
                                          border: "none",
                                          background:
                                            viewTabs[entry.key] === "raw"
                                              ? "var(--lyrical-accent)"
                                              : "transparent",
                                          color:
                                            viewTabs[entry.key] === "raw"
                                              ? "var(--lyrical-text-on-accent, #fff)"
                                              : "var(--lyrical-text-secondary)",
                                          fontSize: "11px",
                                          fontWeight: "700",
                                          cursor: "pointer",
                                          transition: "all 0.15s ease",
                                        }}
                                      >
                                        <FileJson size={13} />
                                        <span>Raw JSON</span>
                                      </button>
                                    </div>

                                    <div
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "10px",
                                        fontSize: "11px",
                                      }}
                                    >
                                      {entry.romanizedCount > 0 ? (
                                        <span
                                          style={{
                                            color: "#c084fc",
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: "3px",
                                          }}
                                        >
                                          <Type size={11} />{" "}
                                          {entry.romanizedCount} romanized
                                        </span>
                                      ) : null}
                                      {entry.translatedCount > 0 ? (
                                        <span
                                          style={{
                                            color: "#60a5fa",
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: "3px",
                                          }}
                                        >
                                          <Languages size={11} />{" "}
                                          {entry.translatedCount} translated
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                ) : (
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "8px",
                                      marginBottom: "10px",
                                      color: "var(--lyrical-text-primary)",
                                      fontSize: "12px",
                                      fontWeight: "700",
                                    }}
                                  >
                                    <FileJson size={14} />
                                    {t("cacheEditor_rawPreview")}
                                  </div>
                                )}

                                {currentLineCount > 0 &&
                                (viewTabs[entry.key] || "formatted") ===
                                  "formatted" ? (
                                  <div
                                    style={{
                                      maxHeight: "320px",
                                      overflowY: "auto",
                                      display: "flex",
                                      flexDirection: "column",
                                      gap: "8px",
                                      paddingRight: "4px",
                                    }}
                                  >
                                    {currentLyrics.map(
                                      (line: any, idx: number) => {
                                        const rom =
                                          currentRomanized?.[idx]
                                            ?.romanized ||
                                          currentRomanized?.[idx]
                                            ?.romanization;
                                        const trans =
                                          currentTranslated?.[idx]
                                            ?.translated ||
                                          currentTranslated?.[idx]
                                            ?.translation;

                                        return (
                                          <div
                                            key={idx}
                                            style={{
                                              padding: "8px 12px",
                                              background:
                                                "rgba(255, 255, 255, 0.03)",
                                              borderRadius: "8px",
                                              border:
                                                "1px solid rgba(255, 255, 255, 0.05)",
                                            }}
                                          >
                                            <div
                                              style={{
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent:
                                                  "space-between",
                                                marginBottom: "4px",
                                              }}
                                            >
                                              <span
                                                style={{
                                                  fontSize: "10.5px",
                                                  fontFamily: "monospace",
                                                  color:
                                                    "var(--lyrical-text-muted)",
                                                }}
                                              >
                                                {formatSeconds(line.time)}
                                              </span>
                                              <span
                                                style={{
                                                  fontSize: "10px",
                                                  color:
                                                    "var(--lyrical-text-subtle)",
                                                }}
                                              >
                                                #{idx + 1}
                                              </span>
                                            </div>
                                            <div
                                              style={{
                                                fontSize: "13px",
                                                fontWeight: "600",
                                                color:
                                                  "var(--lyrical-text-primary)",
                                                lineHeight: "1.4",
                                                marginBottom:
                                                  rom || trans ? "3px" : "0",
                                              }}
                                            >
                                              {line.text}
                                            </div>
                                            {rom ? (
                                              <div
                                                style={{
                                                  fontSize: "11.5px",
                                                  color: "#c084fc",
                                                  lineHeight: "1.4",
                                                  display: "flex",
                                                  alignItems: "flex-start",
                                                  gap: "4px",
                                                  marginBottom:
                                                    trans ? "2px" : "0",
                                                }}
                                              >
                                                <Type
                                                  size={11}
                                                  style={{
                                                    marginTop: "2px",
                                                    flexShrink: 0,
                                                  }}
                                                />
                                                <span
                                                  style={{
                                                    fontStyle: "italic",
                                                  }}
                                                >
                                                  {rom}
                                                </span>
                                              </div>
                                            ) : null}
                                            {trans ? (
                                              <div
                                                style={{
                                                  fontSize: "11.5px",
                                                  color: "#60a5fa",
                                                  lineHeight: "1.4",
                                                  display: "flex",
                                                  alignItems: "flex-start",
                                                  gap: "4px",
                                                }}
                                              >
                                                <Languages
                                                  size={11}
                                                  style={{
                                                    marginTop: "2px",
                                                    flexShrink: 0,
                                                  }}
                                                />
                                                <span>{trans}</span>
                                              </div>
                                            ) : null}
                                          </div>
                                        );
                                      },
                                    )}
                                  </div>
                                ) : (
                                  <pre
                                    style={{
                                      margin: 0,
                                      fontSize: "11px",
                                      lineHeight: "1.6",
                                      color: "var(--lyrical-text-secondary)",
                                      whiteSpace: "pre-wrap",
                                      wordBreak: "break-word",
                                      maxHeight: "260px",
                                      overflowY: "auto",
                                    }}
                                  >
                                    {JSON.stringify(entry.value, null, 2)}
                                  </pre>
                                )}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default CacheEditorView;
