import { useState } from "react";

export type TooltipProps = {
  children: React.ReactNode;
  content: React.ReactNode;
  align?: "center" | "left" | "right";
};

export const Tooltip = ({
  children,
  content,
  align = "center",
}: TooltipProps) => {
  const [isVisible, setIsVisible] = useState(false);

  const getPositionStyles = () => {
    switch (align) {
      case "left":
        return {
          left: "0",
          transform: "none",
        };
      case "right":
        return {
          right: "0",
          left: "auto",
          transform: "none",
        };
      case "center":
      default:
        return {
          left: "50%",
          transform: "translateX(-50%)",
        };
    }
  };

  const getArrowStyles = () => {
    switch (align) {
      case "left":
        return {
          left: "10px",
          marginLeft: "0",
        };
      case "right":
        return {
          right: "10px",
          left: "auto",
          marginLeft: "0",
        };
      case "center":
      default:
        return {
          left: "50%",
          marginLeft: "-4px",
        };
    }
  };

  return (
    <div
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        maxWidth: "100%",
        minWidth: 0,
      }}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {isVisible && (
        <div
          style={{
            position: "absolute",
            bottom: "100%",
            marginBottom: "8px",
            padding: "6px 10px",
            background:
              "linear-gradient(180deg, color-mix(in srgb, var(--lyrical-card-bg-elevated, #241412) 95%, #ffffff 4%), color-mix(in srgb, var(--lyrical-popup-bg, #160d0b) 96%, #000000 4%))",
            color: "var(--lyrical-text-primary, #ffffff)",
            fontSize: "11px",
            fontWeight: 550,
            borderRadius: "8px",
            whiteSpace: "pre-line",
            zIndex: 99999,
            pointerEvents: "none",
            boxShadow:
              "0 12px 28px -4px rgba(0, 0, 0, 0.6), 0 0 0 1px color-mix(in srgb, var(--lyrical-border-soft, rgba(255, 255, 255, 0.08)) 80%, transparent)",
            border:
              "1px solid color-mix(in srgb, var(--lyrical-border, rgba(255, 255, 255, 0.16)) 80%, #ffffff 10%)",
            width: "max-content",
            maxWidth: "180px",
            textAlign: "center",
            lineHeight: "1.35",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            ...getPositionStyles(),
          }}
        >
          {content}
          {/* Arrow */}
          <div
            style={{
              position: "absolute",
              top: "100%",
              borderWidth: "4px",
              borderStyle: "solid",
              borderColor:
                "color-mix(in srgb, var(--lyrical-popup-bg, #160d0b) 96%, #000000 4%) transparent transparent transparent",
              ...getArrowStyles(),
            }}
          />
        </div>
      )}
    </div>
  );
};
