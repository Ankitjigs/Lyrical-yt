import React, { useEffect, useRef } from "react";
import Sortable from "sortablejs";
import { useAppStore } from "../store";
import { GripVertical } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { t } from "../../i18n";
import { SyncTypeIcon } from "../../components/ui/SyncTypeIcon";

const getBadgeStyles = (tag: string) => {
  const norm = (tag || "").toLowerCase();
  switch (norm) {
    case "syllable":
      return {
        color: "#fde69b",
        background: "rgba(253, 230, 155, 0.12)",
        border: "1px solid rgba(253, 230, 155, 0.25)",
      };
    case "word":
      return {
        color: "#aad1ff",
        background: "rgba(170, 209, 255, 0.12)",
        border: "1px solid rgba(170, 209, 255, 0.25)",
      };
    case "line":
      return {
        color: "#c9f8da",
        background: "rgba(201, 248, 218, 0.12)",
        border: "1px solid rgba(201, 248, 218, 0.25)",
      };
    case "unsynced":
    default:
      return {
        color: "rgba(255, 255, 255, 0.7)",
        background: "rgba(255, 255, 255, 0.06)",
        border: "1px solid rgba(255, 255, 255, 0.12)",
      };
  }
};

function arrayMove<T>(array: T[], from: number, to: number): T[] {
  const newArray = array.slice();
  newArray.splice(to < 0 ? newArray.length + to : to, 0, newArray.splice(from, 1)[0]);
  return newArray;
}

const SourcePreferenceList: React.FC = () => {
  const {
    sourcePreferences,
    setSourcePreferences,
    toggleSource,
    lyricsSource,
  } = useAppStore(
    useShallow((state) => ({
      sourcePreferences: state.sourcePreferences,
      setSourcePreferences: state.setSourcePreferences,
      toggleSource: state.toggleSource,
      lyricsSource: state.lyricsSource,
    })),
  );

  const listRef = useRef<HTMLDivElement>(null);
  const sortableRef = useRef<Sortable | null>(null);
  const prefsRef = useRef(sourcePreferences);
  prefsRef.current = sourcePreferences;

  useEffect(() => {
    if (!listRef.current) return;

    sortableRef.current = new Sortable(listRef.current, {
      animation: 150,
      ghostClass: "lyrical-sortable-ghost",
      chosenClass: "lyrical-sortable-chosen",
      dragClass: "lyrical-sortable-dragging",
      forceFallback: true,
      fallbackTolerance: 3,
      filter: ".lyrical-source-toggle",
      preventOnFilter: false,
      onEnd: (evt) => {
        const { oldIndex, newIndex } = evt;
        if (
          oldIndex === undefined ||
          newIndex === undefined ||
          oldIndex === newIndex
        ) {
          return;
        }
        const currentPrefs = prefsRef.current;
        const reordered = arrayMove(currentPrefs, oldIndex, newIndex);
        setSourcePreferences(reordered);
      },
    });

    return () => {
      sortableRef.current?.destroy();
      sortableRef.current = null;
    };
  }, [setSourcePreferences]);

  const getActiveSourceId = (source: string | null) => {
    if (!source) return null;
    if (
      source === "cubey" ||
      source === "musixmatch" ||
      source === "musixmatch-richsync"
    )
      return "musixmatch";
    if (source === "better_lyrics") return "better_lyrics";
    if (source === "lrclib") return "lrclib";
    if (source === "captions") return "captions";
    return source;
  };

  const activeSourceId = getActiveSourceId(lyricsSource);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "20px",
        padding: "20px",
        color: "var(--lyrical-text-primary, white)",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          textAlign: "center",
        }}
      >
        <h2 style={{ fontSize: "18px" }}>
          {t("sourcePreferences_title")}
        </h2>
        <p
          style={{
            margin: 0,
            fontSize: "12px",
            color: "var(--lyrical-text-muted, #888)",
          }}
        >
          {t("sourcePreferences_description")}
        </p>
      </div>

      <div
        ref={listRef}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          width: "100%",
        }}
      >
        {sourcePreferences.map((source) => {
          const isActive = source.id === activeSourceId;
          const sourceLabelKey = `source_${source.id.replace(/-/g, "_")}`;

          return (
            <div
              key={source.id}
              data-id={source.id}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "12px 16px",
                background: isActive
                  ? "var(--lyrical-success-soft, rgba(46, 204, 113, 0.15))"
                  : "var(--lyrical-panel-surface-soft, rgba(255,255,255,0.05))",
                borderRadius: "8px",
                border: isActive
                  ? "1px solid var(--lyrical-success-border, rgba(46, 204, 113, 0.4))"
                  : "1px solid var(--lyrical-border-soft, rgba(255,255,255,0.05))",
                cursor: "grab",
                userSelect: "none",
                transition: "background 0.15s, border-color 0.15s",
              }}
            >
              <div
                style={{
                  marginRight: "12px",
                  color: "var(--lyrical-text-subtle, #888)",
                  display: "flex",
                  alignItems: "center",
                  pointerEvents: "none",
                }}
              >
                <GripVertical size={20} />
              </div>

              <div
                className="lyrical-source-toggle"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleSource(source.id);
                }}
                style={{
                  position: "relative",
                  width: "36px",
                  height: "20px",
                  background: source.enabled
                    ? "var(--lyrical-accent, #3ea6ff)"
                    : "var(--lyrical-card-bg-elevated, #444)",
                  borderRadius: "10px",
                  marginRight: "12px",
                  cursor: "pointer",
                  transition: "background 0.2s",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: "2px",
                    left: source.enabled ? "18px" : "2px",
                    width: "16px",
                    height: "16px",
                    background: "var(--lyrical-text-primary, white)",
                    borderRadius: "50%",
                    transition: "left 0.2s",
                    pointerEvents: "none",
                  }}
                />
              </div>

              <div
                style={{
                  flex: 1,
                  fontWeight: "600",
                  fontSize: "14px",
                  pointerEvents: "none",
                }}
              >
                {t(sourceLabelKey, undefined, source.label)}
              </div>

              <div
                style={{
                  display: "flex",
                  gap: "4px",
                  pointerEvents: "none",
                }}
              >
                {isActive && (
                  <span
                    style={{
                      fontSize: "10px",
                      fontWeight: "700",
                      color: "var(--lyrical-text-primary, #fff)",
                      background:
                        "linear-gradient(135deg, var(--lyrical-success-strong, #2ecc71), var(--lyrical-success-deep, #27ae60))",
                      padding: "2px 8px",
                      borderRadius: "4px",
                      textTransform: "uppercase",
                      boxShadow:
                        "0 0 8px var(--lyrical-success-glow, rgba(46, 204, 113, 0.5))",
                    }}
                  >
                    {t("sourcePreferences_active")}
                  </span>
                )}
                {source.tags.map((tag) => {
                  const badgeStyle = getBadgeStyles(tag);
                  return (
                    <span
                      key={tag}
                      style={{
                        fontSize: "10px",
                        fontWeight: "700",
                        color: badgeStyle.color,
                        background: badgeStyle.background,
                        border: badgeStyle.border,
                        padding: "2px 7px",
                        borderRadius: "5px",
                        textTransform: "uppercase",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        letterSpacing: "0.4px",
                      }}
                    >
                      <SyncTypeIcon
                        type={tag}
                        size={12}
                        className=""
                        style={{ fill: badgeStyle.color }}
                      />
                      {tag}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SourcePreferenceList;
