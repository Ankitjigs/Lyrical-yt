import React from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAppStore } from "../store";
import { GripVertical } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { t } from "../../i18n";
import { SyncTypeIcon } from "../../components/ui/SyncTypeIcon";

// Sortable Item Component
const SortableItem = ({ source, toggleSource, isActive }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: source.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 2 : 1,
    position: "relative",
    opacity: isDragging ? 0.5 : 1,
  };

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
  const sourceLabelKey = `source_${source.id.replace(/-/g, "_")}`;

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        display: "flex",
        alignItems: "center",
        padding: "12px 16px",
        background: isActive
          ? "var(--lyrical-success-soft, rgba(46, 204, 113, 0.15))"
          : "var(--lyrical-panel-surface-soft, rgba(255,255,255,0.05))",
        borderRadius: "8px",
        marginBottom: "8px",
        border: isActive
          ? "1px solid var(--lyrical-success-border, rgba(46, 204, 113, 0.4))"
          : "1px solid var(--lyrical-border-soft, rgba(255,255,255,0.05))",
      } as React.CSSProperties}
    >
      <div
        {...attributes}
        {...listeners}
        style={{
          cursor: "grab",
          marginRight: "12px",
          color: "var(--lyrical-text-subtle, #666)",
          display: "flex",
        }}
      >
        <GripVertical size={20} />
      </div>

      <div
        onClick={() => toggleSource(source.id)}
        style={{
          position: "relative",
          width: "36px",
          height: "20px",
          background: source.enabled
            ? "var(--lyrical-accent, #3ea6ff) "
            : "var(--lyrical-card-bg-elevated, #444)",
          borderRadius: "10px",
          marginRight: "12px",
          cursor: "pointer",
          transition: "background 0.2s",
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
          }}
        />
      </div>

      <div style={{ flex: 1, fontWeight: "600", fontSize: "14px" }}>
        {t(sourceLabelKey, undefined, source.label)}
      </div>

      <div style={{ display: "flex", gap: "4px" }}>
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
              animation: "pulse 2s ease-in-out infinite",
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
              <SyncTypeIcon type={tag} size={12} className="" style={{ fill: badgeStyle.color }} />
              {tag}
            </span>
          );
        })}
      </div>
    </div>
  );
};

const SourcePreferenceList = () => {
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

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sourcePreferences.findIndex((s) => s.id === active.id);
    const newIndex = sourcePreferences.findIndex((s) => s.id === over.id);
    setSourcePreferences(arrayMove(sourcePreferences, oldIndex, newIndex));
  };

  // Map lyricsSource to source id (handle variations)
  const getActiveSourceId = (source) => {
    if (!source) return null;
    // Handle different naming conventions
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

      <div>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={sourcePreferences}
            strategy={verticalListSortingStrategy}
          >
            {sourcePreferences.map((source) => (
              <SortableItem
                key={source.id}
                source={source}
                toggleSource={toggleSource}
                isActive={source.id === activeSourceId}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
};

export default SourcePreferenceList;
