import React from "react";
import { Ban } from "lucide-react";
import { SearchingIndicatorStyle } from "../store";

interface VibeIconProps {
  size?: number;
  reduceAnimations?: boolean;
  className?: string;
}

const VIBE_KEYFRAME_STYLES = `
@keyframes lyricalVinylSpin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes lyricalNoteFloat1 {
  0% {
    transform: translate(0, 0) scale(0.35) rotate(-6deg);
    opacity: 0;
  }
  22% {
    opacity: 1;
    transform: translate(3px, -5px) scale(1.1) rotate(4deg);
  }
  65% {
    opacity: 0.9;
  }
  100% {
    transform: translate(11px, -18px) scale(0.65) rotate(18deg);
    opacity: 0;
  }
}

@keyframes lyricalNoteFloat2 {
  0% {
    transform: translate(0, 0) scale(0.35) rotate(6deg);
    opacity: 0;
  }
  22% {
    opacity: 1;
    transform: translate(4px, -6px) scale(1.15) rotate(-4deg);
  }
  65% {
    opacity: 0.9;
  }
  100% {
    transform: translate(13px, -20px) scale(0.65) rotate(-16deg);
    opacity: 0;
  }
}

@keyframes lyricalDiscoScroll {
  from { transform: translateX(0); }
  to { transform: translateX(-24px); }
}

@keyframes lyricalSparkle1 {
  0%, 100% { transform: scale(0) rotate(0deg); opacity: 0; }
  45%, 55% { transform: scale(1.3) rotate(90deg); opacity: 1; }
}

@keyframes lyricalSparkle2 {
  0%, 100% { transform: scale(0) rotate(0deg); opacity: 0; }
  45%, 55% { transform: scale(1.15) rotate(-90deg); opacity: 1; }
}

@keyframes lyricalSparkle3 {
  0%, 100% { transform: scale(0) rotate(45deg); opacity: 0; }
  45%, 55% { transform: scale(1.05) rotate(135deg); opacity: 0.9; }
}

@keyframes lyricalRockBar1 { 0%, 100% { transform: scaleY(0.35); } 50% { transform: scaleY(1); } }
@keyframes lyricalRockBar2 { 0%, 100% { transform: scaleY(0.9); } 50% { transform: scaleY(0.35); } }
@keyframes lyricalRockBar3 { 0%, 100% { transform: scaleY(0.4); } 50% { transform: scaleY(1); } }
@keyframes lyricalRockBar4 { 0%, 100% { transform: scaleY(1); } 50% { transform: scaleY(0.4); } }

@keyframes lyricalSoothingHalo {
  0% { transform: scale(0.8); opacity: 0.8; }
  100% { transform: scale(1.6); opacity: 0; }
}

@keyframes lyricalSoothingOrb {
  0%, 100% { transform: scale(0.92); opacity: 0.85; }
  50% { transform: scale(1.1); opacity: 1; }
}

.lyrical-vibe-reduced * {
  animation-duration: 7s !important;
}
`;

/**
 * 💿 Lo-Fi Vinyl: Analog record spinning with melodic notes floating from top-right
 */
export const LoFiVinylIcon = ({
  size = 26,
  reduceAnimations = false,
  className = "",
}: VibeIconProps) => {
  return (
    <div
      className={`lyrical-vibe-container ${reduceAnimations ? "lyrical-vibe-reduced" : ""} ${className}`}
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <style>{VIBE_KEYFRAME_STYLES}</style>

      {/* Spinning Vinyl Disc */}
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.45)",
          flexShrink: 0,
          animation: "lyricalVinylSpin 3.2s linear infinite",
          transformOrigin: "center center",
        }}
      >
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Vinyl base plate */}
          <circle
            cx="12"
            cy="12"
            r="11"
            fill="#121215"
            stroke="rgba(255, 255, 255, 0.22)"
            strokeWidth="0.8"
          />
          {/* Groove rings */}
          <circle
            cx="12"
            cy="12"
            r="8.4"
            stroke="rgba(255, 255, 255, 0.12)"
            strokeWidth="0.65"
            strokeDasharray="4 1.5"
          />
          <circle
            cx="12"
            cy="12"
            r="6"
            stroke="rgba(255, 255, 255, 0.1)"
            strokeWidth="0.6"
          />
          {/* Center theme accent label */}
          <circle cx="12" cy="12" r="3.7" fill="var(--lyrical-accent)" />
          {/* Center spindle hole */}
          <circle cx="12" cy="12" r="1.3" fill="#09090b" />
        </svg>
      </div>

      {/* Floating Melodic Notes (Top-Right) */}
      <span
        style={{
          position: "absolute",
          top: "-4px",
          right: "-5px",
          fontSize: "11px",
          fontWeight: 700,
          lineHeight: 1,
          color: "var(--lyrical-accent)",
          filter:
            "drop-shadow(0 1px 4px color-mix(in srgb, var(--lyrical-accent) 60%, transparent))",
          pointerEvents: "none",
          userSelect: "none",
          opacity: 0,
          animation: "lyricalNoteFloat1 2s cubic-bezier(0.22, 1, 0.36, 1) infinite",
        }}
      >
        ♪
      </span>
      <span
        style={{
          position: "absolute",
          top: "-4px",
          right: "-5px",
          fontSize: "11px",
          fontWeight: 700,
          lineHeight: 1,
          color: "var(--lyrical-accent)",
          filter:
            "drop-shadow(0 1px 4px color-mix(in srgb, var(--lyrical-accent) 60%, transparent))",
          pointerEvents: "none",
          userSelect: "none",
          opacity: 0,
          animation: "lyricalNoteFloat2 2s cubic-bezier(0.22, 1, 0.36, 1) 1s infinite",
        }}
      >
        ♫
      </span>
    </div>
  );
};

/**
 * 🪩 Disco Ball: Mirrored sphere casting sparkling diamond facet glints
 */
export const DiscoBallIcon = ({
  size = 26,
  reduceAnimations = false,
  className = "",
}: VibeIconProps) => {
  return (
    <div
      className={`lyrical-vibe-container ${reduceAnimations ? "lyrical-vibe-reduced" : ""} ${className}`}
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <style>{VIBE_KEYFRAME_STYLES}</style>

      {/* Mirrored Sphere Container */}
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          overflow: "hidden",
          position: "relative",
          flexShrink: 0,
          background:
            "radial-gradient(circle at 35% 30%, #ffffff 0%, #cbd5e1 32%, #475569 68%, #0f172a 100%)",
          boxShadow:
            "0 2px 10px rgba(0, 0, 0, 0.5), inset 0 0 4px rgba(255, 255, 255, 0.6)",
          border: "1px solid rgba(255, 255, 255, 0.45)",
          display: "block",
        }}
      >
        {/* Animated Horizontal Facet Grid Lines */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            width: "200%",
            height: "100%",
            display: "flex",
            animation: "lyricalDiscoScroll 2.4s linear infinite",
          }}
        >
          <svg
            width="200%"
            height="100%"
            viewBox="0 0 48 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Latitude rings */}
            <line x1="0" y1="5" x2="48" y2="5" stroke="rgba(255,255,255,0.3)" strokeWidth="0.55" />
            <line x1="0" y1="10" x2="48" y2="10" stroke="rgba(255,255,255,0.4)" strokeWidth="0.65" />
            <line x1="0" y1="15" x2="48" y2="15" stroke="rgba(255,255,255,0.4)" strokeWidth="0.65" />
            <line x1="0" y1="20" x2="48" y2="20" stroke="rgba(255,255,255,0.3)" strokeWidth="0.55" />
            {/* Longitude facet divisions */}
            {[0, 6, 12, 18, 24, 30, 36, 42, 48].map((x) => (
              <line
                key={x}
                x1={x}
                y1="0"
                x2={x}
                y2="24"
                stroke="rgba(0,0,0,0.38)"
                strokeWidth="0.7"
              />
            ))}
          </svg>
        </div>

        {/* Sphere 3D Sheen Highlight */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background:
              "radial-gradient(circle at 30% 25%, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.2) 42%, transparent 72%)",
            pointerEvents: "none",
          }}
        />
      </div>

      {/* Sparkling Specular Glints */}
      <span
        style={{
          position: "absolute",
          top: "-4px",
          right: "-4px",
          fontSize: "13px",
          lineHeight: 1,
          color: "var(--lyrical-accent, #ffffff)",
          filter:
            "drop-shadow(0 0 6px color-mix(in srgb, var(--lyrical-accent) 85%, white))",
          pointerEvents: "none",
          userSelect: "none",
          opacity: 0,
          animation: "lyricalSparkle1 1.6s ease-in-out infinite",
        }}
      >
        ✦
      </span>
      <span
        style={{
          position: "absolute",
          bottom: "-3px",
          left: "-4px",
          fontSize: "11px",
          lineHeight: 1,
          color: "#ffffff",
          filter:
            "drop-shadow(0 0 5px color-mix(in srgb, var(--lyrical-accent) 70%, white))",
          pointerEvents: "none",
          userSelect: "none",
          opacity: 0,
          animation: "lyricalSparkle2 1.6s ease-in-out 0.8s infinite",
        }}
      >
        ✧
      </span>
      <span
        style={{
          position: "absolute",
          top: "2px",
          right: "3px",
          fontSize: "9px",
          lineHeight: 1,
          color: "var(--lyrical-accent, #ffffff)",
          pointerEvents: "none",
          userSelect: "none",
          opacity: 0,
          animation: "lyricalSparkle3 1.8s ease-in-out 1.2s infinite",
        }}
      >
        ✦
      </span>
    </div>
  );
};

/**
 * ⚡ Rock Pulse: High-tempo dynamic audio equalizer bars
 */
export const RockWaveIcon = ({
  size = 26,
  reduceAnimations = false,
  className = "",
}: VibeIconProps) => {
  const barWidth = Math.max(2.5, Math.floor(size * 0.12));
  const barHeight = Math.max(14, Math.floor(size * 0.65));

  return (
    <div
      className={`lyrical-vibe-container ${reduceAnimations ? "lyrical-vibe-reduced" : ""} ${className}`}
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "2.5px",
        flexShrink: 0,
      }}
    >
      <style>{VIBE_KEYFRAME_STYLES}</style>

      <div
        style={{
          width: `${barWidth}px`,
          height: `${barHeight}px`,
          borderRadius: "3px",
          background: "var(--lyrical-accent)",
          transformOrigin: "bottom center",
          boxShadow: "0 0 6px color-mix(in srgb, var(--lyrical-accent) 45%, transparent)",
          animation: "lyricalRockBar1 0.65s ease-in-out infinite alternate",
        }}
      />
      <div
        style={{
          width: `${barWidth}px`,
          height: `${barHeight}px`,
          borderRadius: "3px",
          background: "var(--lyrical-accent)",
          transformOrigin: "bottom center",
          boxShadow: "0 0 6px color-mix(in srgb, var(--lyrical-accent) 45%, transparent)",
          animation: "lyricalRockBar2 0.55s ease-in-out infinite alternate",
        }}
      />
      <div
        style={{
          width: `${barWidth}px`,
          height: `${barHeight}px`,
          borderRadius: "3px",
          background: "var(--lyrical-accent)",
          transformOrigin: "bottom center",
          boxShadow: "0 0 6px color-mix(in srgb, var(--lyrical-accent) 45%, transparent)",
          animation: "lyricalRockBar3 0.7s ease-in-out infinite alternate",
        }}
      />
      <div
        style={{
          width: `${barWidth}px`,
          height: `${barHeight}px`,
          borderRadius: "3px",
          background: "var(--lyrical-accent)",
          transformOrigin: "bottom center",
          boxShadow: "0 0 6px color-mix(in srgb, var(--lyrical-accent) 45%, transparent)",
          animation: "lyricalRockBar4 0.6s ease-in-out infinite alternate",
        }}
      />
    </div>
  );
};

/**
 * 🌙 Soothing Halo: Calm acoustic ambient halo with gentle expanding waves
 */
export const SoothingHaloIcon = ({
  size = 26,
  reduceAnimations = false,
  className = "",
}: VibeIconProps) => {
  return (
    <div
      className={`lyrical-vibe-container ${reduceAnimations ? "lyrical-vibe-reduced" : ""} ${className}`}
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <style>{VIBE_KEYFRAME_STYLES}</style>

      {/* Outer Halo Ripples */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          border: "1.4px solid var(--lyrical-accent)",
          pointerEvents: "none",
          opacity: 0,
          animation: "lyricalSoothingHalo 2.2s ease-out infinite",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          border: "1.4px solid var(--lyrical-accent)",
          pointerEvents: "none",
          opacity: 0,
          animation: "lyricalSoothingHalo 2.2s ease-out 1.1s infinite",
        }}
      />

      {/* Center Breathing Orb */}
      <div
        style={{
          width: Math.max(12, Math.floor(size * 0.48)),
          height: Math.max(12, Math.floor(size * 0.48)),
          borderRadius: "50%",
          background: "var(--lyrical-accent)",
          boxShadow: "0 0 10px color-mix(in srgb, var(--lyrical-accent) 65%, transparent)",
          animation: "lyricalSoothingOrb 2s ease-in-out infinite",
          flexShrink: 0,
        }}
      />
    </div>
  );
};

/**
 * Universal searching indicator router based on active vibe style
 */
export const SearchingVibeIcon = ({
  vibe = "lofi",
  size = 26,
  reduceAnimations = false,
  className = "",
  showNoneFallback = false,
}: {
  vibe?: SearchingIndicatorStyle;
  size?: number;
  reduceAnimations?: boolean;
  className?: string;
  showNoneFallback?: boolean;
}) => {
  switch (vibe) {
    case "disco":
      return (
        <DiscoBallIcon
          size={size}
          reduceAnimations={reduceAnimations}
          className={className}
        />
      );
    case "rock":
      return (
        <RockWaveIcon
          size={size}
          reduceAnimations={reduceAnimations}
          className={className}
        />
      );
    case "soothing":
      return (
        <SoothingHaloIcon
          size={size}
          reduceAnimations={reduceAnimations}
          className={className}
        />
      );
    case "none":
      if (showNoneFallback) {
        return (
          <div
            className={className}
            style={{
              width: size,
              height: size,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--lyrical-text-muted)",
              opacity: 0.75,
            }}
          >
            <Ban size={Math.round(size * 0.75)} strokeWidth={2.2} />
          </div>
        );
      }
      return null;
    case "lofi":
    default:
      return (
        <LoFiVinylIcon
          size={size}
          reduceAnimations={reduceAnimations}
          className={className}
        />
      );
  }
};

export default SearchingVibeIcon;
