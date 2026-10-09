import { useState, type CSSProperties, type ReactNode } from "react";

type CacheStatsTooltipProps = {
  id: string;
  children: ReactNode;
  content: ReactNode;
  icon?: ReactNode;
  ariaLabel: string;
  style?: CSSProperties;
  tooltipStyle?: CSSProperties;
  contentStyle?: CSSProperties;
  accentColor?: string;
  size?: "badge" | "comfortable";
  align?: "start" | "center" | "end";
};

export default function CacheStatsTooltip({
  id,
  children,
  content,
  icon,
  ariaLabel,
  style,
  tooltipStyle,
  contentStyle,
  accentColor,
  size = "badge",
  align = "center",
}: CacheStatsTooltipProps) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const visible = hovered || focused;
  const isComfortable = size === "comfortable";

  return (
    <span
      role="group"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-describedby={visible ? id : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        position: "relative",
        display: "inline-flex",
        borderRadius: 4,
        outline: focused ? "2px solid var(--lyrical-accent, #f43f5e)" : undefined,
        outlineOffset: 3,
        ...style,
      }}
    >
      {children}
      {visible && (
        <div
          id={id}
          role="tooltip"
          style={{
            position: "absolute",
            zIndex: 5,
            left: align === "start" ? 0 : align === "end" ? "100%" : "50%",
            top: "-8px",
            transform:
              align === "start"
                ? "translate(0, -100%)"
                : align === "end"
                  ? "translate(-100%, -100%)"
                  : "translate(-50%, -100%)",
            display: "flex",
            alignItems: "center",
            gap: accentColor && !isComfortable ? "5px" : "8px",
            minHeight: accentColor && !isComfortable ? "22px" : undefined,
            padding: accentColor && !isComfortable ? "0 7px 0 6px" : "9px 12px",
            borderRadius: accentColor && !isComfortable ? "6px" : "10px",
            border: accentColor
              ? `1px solid color-mix(in srgb, ${accentColor} ${isComfortable ? 38 : 25}%, transparent)`
              : "1px solid rgba(255,255,255,0.12)",
            background: accentColor
              ? `color-mix(in srgb, ${accentColor} ${isComfortable ? 13 : 15}%, #25272b)`
              : "#25272b",
            color: "var(--lyrical-text-primary, #fff)",
            boxShadow: accentColor && !isComfortable
              ? "rgba(0, 0, 0, 0.05) 0 8px 8px -3px, inset rgba(255, 255, 255, 0.08) 0 1px 0 0"
              : "0 8px 24px rgba(0,0,0,0.35)",
            fontSize: accentColor && !isComfortable ? "11px" : "12px",
            fontWeight: accentColor ? 600 : 500,
            lineHeight: 1,
            whiteSpace: "nowrap",
            pointerEvents: "none",
            ...tooltipStyle,
          }}
        >
          {icon && (
            <span style={{ display: "inline-flex", flexShrink: 0, alignItems: "center" }}>
              {icon}
            </span>
          )}
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: accentColor && !isComfortable ? "5px" : "8px",
              color: accentColor,
              ...contentStyle,
            }}
          >
            {content}
          </span>
        </div>
      )}
    </span>
  );
}
