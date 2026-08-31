import { useRef, useState } from "react";
import { useLyricsEngine } from "../hooks/useLyricsEngine";
import "../content/lyricsEffects.css";

export default function LyricsView({
  lyrics,
  syncedLyrics,
  songInfo,
  isLoading,
  error,
}) {
  const containerRef = useRef(null);
  const [activeStrategy, setActiveStrategy] = useState("better"); // Defaulting to 'better' for testing

  const { strategy, currentLineIndex, setIsUserScrolled } = useLyricsEngine(
    activeStrategy,
    syncedLyrics,
    songInfo,
    containerRef
  );

  const handleLineClick = (time) => {
    if (time === undefined || time === null) return;

    // Send seek command to active tab
    chrome.tabs?.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "seek",
          time: time,
        });
      }
    });
  };

  return (
    <div className="w-full flex-1 bg-surface-light dark:bg-surface-dark rounded-2xl p-6 mb-6 shadow-inner relative overflow-hidden flex flex-col items-center justify-center text-center transition-colors duration-300">
      {/* Dev Toggle for Strategies (Optional - can be removed or moved to settings later) */}
      <div className="absolute top-2 right-2 flex gap-2 z-10 opacity-0 hover:opacity-100 transition-opacity">
        <button
          onClick={() => setActiveStrategy("line")}
          className={`text-xs px-2 py-1 rounded ${
            activeStrategy === "line"
              ? "bg-primary text-white"
              : "bg-gray-200 text-black"
          }`}
        >
          Line
        </button>
        <button
          onClick={() => setActiveStrategy("better")}
          className={`text-xs px-2 py-1 rounded ${
            activeStrategy === "better"
              ? "bg-primary text-white"
              : "bg-gray-200 text-black"
          }`}
        >
          Better
        </button>
      </div>

      <div
        ref={containerRef}
        className="lyrics-scroll w-full h-full overflow-y-auto text-sm leading-relaxed scroll-smooth" // scroll-smooth might conflict with physics engine, but good for LineStrategy
        onMouseEnter={() => setIsUserScrolled(true)}
        onMouseLeave={() => setIsUserScrolled(false)}
      >
        {isLoading ? (
          <div className="flex flex-col items-center gap-3 animate-pulse mt-20">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm font-medium text-text-secondary-light dark:text-text-secondary-dark">
              Loading lyrics...
            </p>
          </div>
        ) : error ? (
          <p className="text-sm text-text-secondary-light dark:text-text-secondary-dark italic mt-20">
            {error}
          </p>
        ) : syncedLyrics && syncedLyrics.length > 0 ? (
          // Delegate rendering to the active strategy
          strategy?.renderLyrics(
            syncedLyrics,
            currentLineIndex,
            handleLineClick
          )
        ) : lyrics ? (
          // Plain text lyrics fallback
          <pre className="whitespace-pre-wrap text-text-primary-light dark:text-text-primary-dark font-display">
            {lyrics}
          </pre>
        ) : (
          <p className="text-sm text-text-secondary-light dark:text-text-secondary-dark italic mt-20">
            Lyrics will appear here...
          </p>
        )}
      </div>
    </div>
  );
}
