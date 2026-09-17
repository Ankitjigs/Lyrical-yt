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
            background: "var(--lyrical-card-bg-elevated, #27272a)",
            color: "var(--lyrical-text-primary, #fff)",
            fontSize: "11px",
            fontWeight: 500,
            borderRadius: "7px",
            whiteSpace: "pre-line",
            zIndex: 99999,
            pointerEvents: "none",
            boxShadow: "0 8px 20px rgba(0,0,0,0.45)",
            border: "1px solid var(--lyrical-border, rgba(255,255,255,0.15))",
            width: "max-content",
            maxWidth: "180px",
            textAlign: "center",
            lineHeight: "1.35",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
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
                "var(--lyrical-card-bg-elevated, #27272a) transparent transparent transparent",
              ...getArrowStyles(),
            }}
          />
        </div>
      )}
    </div>
  );
};
