import React, { useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
import { getThemeCssVariables } from "../../themes";
import { useAppStore } from "../store";
import KaraokeLyricDisplay from "./KaraokeLyricDisplay";

const KARAOKE_WRAPPER_ID = "lyrical-karaoke-wrapper";

function getActiveVideo() {
  return (
    document.querySelector<HTMLVideoElement>("#movie_player video") ||
    document.querySelector<HTMLVideoElement>("video")
  );
}

function useVideoOverlayHost(isEnabled: boolean) {
  useEffect(() => {
    const wrapper = document.getElementById(KARAOKE_WRAPPER_ID);
    if (!wrapper) return;

    const updateHost = () => {
      const video = getActiveVideo();
      const player = document.querySelector<HTMLElement>("#movie_player");
      const host = player || video?.parentElement;

      if (!isEnabled || !host || !video) {
        wrapper.style.display = "none";
        return;
      }

      wrapper.style.display = "block";

      if (wrapper.parentElement !== host) {
        host.appendChild(wrapper);
      }

      wrapper.style.position = "absolute";
      wrapper.style.inset = "0";
      wrapper.style.width = "100%";
      wrapper.style.height = "100%";
    };

    let frameId = 0;
    const scheduleUpdate = () => {
      if (frameId) return;
      frameId = requestAnimationFrame(() => {
        frameId = 0;
        updateHost();
      });
    };

    updateHost();
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("fullscreenchange", scheduleUpdate);
    window.addEventListener("yt-navigate-finish", scheduleUpdate);

    const observer = new MutationObserver(scheduleUpdate);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("fullscreenchange", scheduleUpdate);
      window.removeEventListener("yt-navigate-finish", scheduleUpdate);
      observer.disconnect();
    };
  }, [isEnabled]);
}

export default function KaraokeOverlay() {
  const {
    customThemes,
    isKaraokeMode,
    isLoading,
    isRomanizationEnabled,
    isTranslateEnabled,
    karaokeCustomPosition,
    karaokeFontSize,
    karaokePosition,
    karaokeAnimationStyle,
    lyrics,
    lyricsSource,
    offset,
    reduceAnimations,
    romanizedLyrics,
    songInfo,
    themeId,
    translatedLyrics,
  } = useAppStore(
    useShallow((state) => ({
      customThemes: state.customThemes,
      isKaraokeMode: state.isKaraokeMode,
      isLoading: state.isLoading,
      isRomanizationEnabled: state.isRomanizationEnabled,
      isTranslateEnabled: state.isTranslateEnabled,
      karaokeCustomPosition: state.karaokeCustomPosition,
      karaokeFontSize: state.karaokeFontSize,
      karaokePosition: state.karaokePosition,
      karaokeAnimationStyle: state.karaokeAnimationStyle,
      lyrics: state.lyrics,
      lyricsSource: state.lyricsSource,
      offset: state.offset,
      reduceAnimations: state.reduceAnimations,
      romanizedLyrics: state.romanizedLyrics,
      songInfo: state.songInfo,
      themeId: state.themeId,
      translatedLyrics: state.translatedLyrics,
    })),
  );

  useVideoOverlayHost(isKaraokeMode);

  if (!isKaraokeMode) return null;

  const positionStyle: React.CSSProperties = (() => {
    switch (karaokePosition) {
      case "top":
        return {
          alignItems: "flex-start",
          paddingTop: "48px",
          paddingBottom: "0",
        };
      case "center":
        return {
          alignItems: "center",
          paddingTop: "0",
          paddingBottom: "0",
        };
      case "bottom":
        return {
          alignItems: "flex-end",
          paddingBottom: "68px",
          paddingTop: "0",
        };
      case "custom":
      default:
        return {
          paddingTop: "0",
          paddingBottom: "0",
        };
    }
  })();

  const containerStyle: React.CSSProperties =
    karaokePosition === "custom"
      ? {
          position: "absolute",
          top: `${karaokeCustomPosition}%`,
          left: "50%",
          transform: "translate(-50%, -50%)",
        }
      : {};

  return (
    <div
      className="lyrical-karaoke-overlay"
      data-reduce-animations={reduceAnimations ? "true" : "false"}
      data-karaoke-font={karaokeFontSize}
      data-karaoke-pos={karaokePosition}
      data-karaoke-animation={karaokeAnimationStyle}
      style={{ ...getThemeCssVariables(themeId, customThemes), ...positionStyle }}
      aria-live="off"
    >
      {lyrics && lyrics.length > 0 ? (
        <KaraokeLyricDisplay
          key={lyricsSource || "default"}
          lyrics={lyrics}
          romanizedLyrics={romanizedLyrics}
          translatedLyrics={translatedLyrics}
          isRomanizationEnabled={isRomanizationEnabled}
          isTranslateEnabled={isTranslateEnabled}
          offset={offset}
          reduceAnimations={reduceAnimations}
          songInfo={songInfo}
          fontSize={karaokeFontSize}
          containerStyle={containerStyle}
        />
      ) : isLoading ? (
        <div className="lyrical-karaoke-waiting" style={containerStyle}>
          Waiting for synced lyrics…
        </div>
      ) : null}
    </div>
  );
}
