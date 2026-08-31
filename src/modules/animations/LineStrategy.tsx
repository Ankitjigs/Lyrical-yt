import React from "react";

const SCROLL_POS_OFFSET_RATIO = 0.5;

/**
 * Strategy for the default "Lyrical Line" behavior.
 * Simple line-by-line scrolling and highlighting.
 */
export class LyricalLineStrategy {
  name: string;
  lastScrolledIndex: number;
  lastProgrammaticScrollTime: number;

  constructor() {
    this.name = "Lyrical Line";
    this.lastScrolledIndex = -1;
    this.lastProgrammaticScrollTime = 0;
  }

  reset() {
    this.lastScrolledIndex = -1;
    this.lastProgrammaticScrollTime = 0;
  }

  wasRecentProgrammaticScroll() {
    return Date.now() - this.lastProgrammaticScrollTime < 1000;
  }

  /**
   * Renders the lyrics list.
   * @param {Array} syncedLyrics - Array of lyric objects {time, text}
   * @param {number} currentLineIndex - Index of currently active line
   * @param {Function} onLineClick - Handler for line clicks
   * @returns {JSX.Element}
   */
  renderLyrics(syncedLyrics, currentLineIndex, onLineClick) {
    if (!syncedLyrics || syncedLyrics.length === 0) return null;

    return (
      <div className="lyrical-line-container" style={{ paddingBottom: "28px" }}>
        {syncedLyrics.map((line, idx) => {
          const isActive = idx === currentLineIndex;
          const isPast = currentLineIndex >= 0 && idx < currentLineIndex;

          return (
            <div
              key={idx}
              data-line-index={idx}
              className={`lyrical-line-item ${isActive ? "active" : ""} ${
                isPast ? "past" : ""
              }`}
              onClick={() => onLineClick && onLineClick(line.time)}
            >
              {line.text}
            </div>
          );
        })}
        <div
          className="lyrical-line-spacer"
          style={{ height: "240px", minHeight: "240px", pointerEvents: "none" }}
          aria-hidden="true"
        />
      </div>
    );
  }

  /**
   * Updates the view state (scrolling).
   * @param {object} params
   * @param {number} params.currentTime
   * @param {number} params.currentLineIndex
   * @param {boolean} params.enableAutoScroll
   * @param {object} params.refs - { containerRef }
   */
  update({ currentLineIndex, enableAutoScroll, refs }) {
    if (
      enableAutoScroll &&
      currentLineIndex >= 0 &&
      currentLineIndex !== this.lastScrolledIndex &&
      refs.containerRef.current
    ) {
      const scrollContainer = refs.containerRef.current;
      const contentContainer = scrollContainer.children[0];

      if (contentContainer) {
        const lineElement = (contentContainer.querySelector(
          `[data-line-index="${currentLineIndex}"]`,
        ) || contentContainer.children[currentLineIndex]) as HTMLElement | null;

        // Ensure element is actually rendered and has dimensions
        if (lineElement && lineElement.clientHeight > 0) {
          const lineTop = lineElement.offsetTop;
          const lineHeight = lineElement.clientHeight;
          const containerHeight = scrollContainer.clientHeight;

          const scrollPosOffset = containerHeight * SCROLL_POS_OFFSET_RATIO;
          const targetScroll = lineTop + lineHeight / 2 - scrollPosOffset;
          const maxScroll = Math.max(
            0,
            scrollContainer.scrollHeight - containerHeight,
          );
          const clampedScroll = Math.max(0, Math.min(targetScroll, maxScroll));

          this.lastProgrammaticScrollTime = Date.now();
          scrollContainer.scrollTo({
            top: clampedScroll,
            behavior: "smooth",
          });

          this.lastScrolledIndex = currentLineIndex;
        }
      }
    }
  }
}
