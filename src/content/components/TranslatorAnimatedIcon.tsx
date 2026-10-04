import React from "react";
import { motion } from "motion/react";

interface TranslatorAnimatedIconProps {
  size?: number;
  accentColor?: string;
  primaryColor?: string;
  reduceAnimations?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const TranslatorAnimatedIcon: React.FC<TranslatorAnimatedIconProps> = ({
  size = 20,
  accentColor = "var(--lyrical-accent, #30c7c7)",
  primaryColor = "var(--lyrical-text-primary, #ffffff)",
  reduceAnimations = false,
  className,
  style,
}) => {
  // Delta distance between top-left bubble center and bottom-right bubble center
  const deltaX = 214;
  const deltaY = 165;

  // Total animation cycle duration in seconds
  const cycleDuration = 3.2;

  // Keyframe timing fractions for smooth swapping and reading pauses:
  // 0% -> 22%: Pause in initial state (A in top bubble, 文 in bottom bubble)
  // 22% -> 46%: First swap: A moves down-right to bottom bubble, 文 moves up-left to top bubble
  // 46% -> 72%: Pause in swapped state (文 in top bubble, A in bottom bubble)
  // 72% -> 96%: Second swap: return back to original positions
  // 96% -> 100%: Settle into rest before looping
  const keyTimes = [0, 0.22, 0.46, 0.72, 0.96, 1];

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      width={size}
      height={size}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{
        display: "inline-block",
        verticalAlign: "middle",
        flexShrink: 0,
        overflow: "visible",
        ...style,
      }}
    >
      {/* 1. Back Bubble (Top-left, styled with theme accent color) */}
      <motion.g
        animate={
          reduceAnimations
            ? undefined
            : {
                scale: [1, 1, 1.05, 1, 1.05, 1],
              }
        }
        transition={{
          repeat: Infinity,
          duration: cycleDuration,
          times: [0, 0.22, 0.46, 0.72, 0.96, 1],
          ease: "easeInOut",
        }}
        style={{ transformOrigin: "148px 145px" }}
      >
        {/* Back Bubble outline with tail */}
        <path
          d="M 64 22 
             H 232 
             A 42 42 0 0 1 274 64 
             V 208 
             A 42 42 0 0 1 232 250 
             H 162 
             L 142 308 
             A 10 10 0 0 1 123 308 
             L 108 250 
             H 64 
             A 42 42 0 0 1 22 208 
             V 64 
             A 42 42 0 0 1 64 22 
             Z"
          stroke={accentColor}
          strokeWidth="36"
          fill="none"
        />
      </motion.g>

      {/* 2. Front Bubble (Bottom-right, styled with primary foreground color + solid surface mask) */}
      <motion.g
        animate={
          reduceAnimations
            ? undefined
            : {
                scale: [1, 1, 1.05, 1, 1.05, 1],
              }
        }
        transition={{
          repeat: Infinity,
          duration: cycleDuration,
          times: [0, 0.22, 0.46, 0.72, 0.96, 1],
          ease: "easeInOut",
        }}
        style={{ transformOrigin: "362px 310px" }}
      >
        {/* Front Bubble outline with tail (filled to mask back bubble tail) */}
        <path
          d="M 276 192 
             H 448 
             A 42 42 0 0 1 490 234 
             V 378 
             A 42 42 0 0 1 448 420 
             H 378 
             L 358 478 
             A 10 10 0 0 1 339 478 
             L 324 420 
             H 276 
             A 42 42 0 0 1 234 378 
             V 234 
             A 42 42 0 0 1 276 192 
             Z"
          stroke={primaryColor}
          strokeWidth="36"
          fill="var(--lyrical-bg-surface, #121214)"
        />
      </motion.g>

      {/* 3. Letter 'A' (Swaps from top-left to bottom-right and back) */}
      <motion.g
        animate={
          reduceAnimations
            ? undefined
            : {
                x: [0, 0, deltaX, deltaX, 0, 0],
                y: [0, 0, deltaY, deltaY, 0, 0],
                scale: [1, 1, 0.92, 1, 0.92, 1],
              }
        }
        transition={{
          repeat: Infinity,
          duration: cycleDuration,
          times: keyTimes,
          ease: [0.34, 1.25, 0.64, 1], // Playful elastic pop
        }}
        style={{ transformOrigin: "148px 145px" }}
      >
        <path
          d="M 100 206 L 148 84 L 196 206"
          stroke={accentColor}
          strokeWidth="38"
          fill="none"
        />
        <path
          d="M 115 168 H 181"
          stroke={accentColor}
          strokeWidth="34"
        />
      </motion.g>

      {/* 4. Character '文' (Swaps from bottom-right to top-left and back) */}
      <motion.g
        animate={
          reduceAnimations
            ? undefined
            : {
                x: [0, 0, -deltaX, -deltaX, 0, 0],
                y: [0, 0, -deltaY, -deltaY, 0, 0],
                scale: [1, 1, 0.92, 1, 0.92, 1],
              }
        }
        transition={{
          repeat: Infinity,
          duration: cycleDuration,
          times: keyTimes,
          ease: [0.34, 1.25, 0.64, 1], // Playful elastic pop
        }}
        style={{ transformOrigin: "362px 310px" }}
      >
        {/* Top dot */}
        <path
          d="M 362 244 V 268"
          stroke={primaryColor}
          strokeWidth="38"
          fill="none"
        />
        {/* Horizontal crossbar */}
        <path
          d="M 306 272 H 418"
          stroke={primaryColor}
          strokeWidth="38"
          fill="none"
        />
        {/* Left falling stroke (pie) */}
        <path
          d="M 374 286 Q 346 332 304 368"
          stroke={primaryColor}
          strokeWidth="38"
          fill="none"
        />
        {/* Right falling stroke (na) */}
        <path
          d="M 328 308 Q 366 336 420 368"
          stroke={primaryColor}
          strokeWidth="38"
          fill="none"
        />
      </motion.g>
    </svg>
  );
};

export default TranslatorAnimatedIcon;
