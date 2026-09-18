/**
 * SponsorBlock & Chapter-based Intro Offset Detector
 *
 * Automatically detects non-music video intros (dialogue, skits, credits, story preludes)
 * for YouTube music videos without needing audio DSP or native caption transcripts.
 */

export interface DetectedIntroOffset {
  offset: number;
  source: "sponsorblock" | "chapters";
  description?: string;
}

/**
 * Queries the public SponsorBlock API for 'music_offtopic' (non-music intro/skit) segments.
 *
 * SponsorBlock category 'music_offtopic' is specifically crowd-tagged for music videos
 * to mark sections that are not part of the song audio (e.g. video intros, dialogue, story skits).
 */
export async function fetchSponsorBlockIntroOffset(
  videoId: string,
  timeoutMs = 3500,
): Promise<number | null> {
  if (!videoId || videoId.length < 5) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `https://sponsor.ajay.app/api/skipSegments?videoID=${encodeURIComponent(
      videoId,
    )}&categories=${encodeURIComponent(JSON.stringify(["music_offtopic"]))}`;

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    clearTimeout(timeoutId);

    // 404 indicates no non-music segments were submitted for this video
    if (res.status === 404 || !res.ok) {
      return null;
    }

    const segments = await res.json();
    if (!Array.isArray(segments) || segments.length === 0) {
      return null;
    }

    // Find a segment that starts at or very close to video start (<= 3.5s)
    // and ends after at least 2.5s (meaning a real non-music intro exists).
    for (const seg of segments) {
      const start = seg.segment?.[0];
      const end = seg.segment?.[1];

      if (
        typeof start === "number" &&
        typeof end === "number" &&
        start <= 3.5 &&
        end >= 2.5 &&
        end <= 360 // Safety bound: intros longer than 6 minutes are ignored
      ) {
        const introDelay = Number(end.toFixed(2));
        return introDelay;
      }
    }
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name !== "AbortError") {
      console.warn("[Lyrical SponsorBlock] Fetch error:", err?.message || err);
    }
  }

  return null;
}

/**
 * Parses timestamps in format MM:SS or HH:MM:SS to total seconds.
 */
function parseTimestampToSeconds(text: string): number | null {
  const match = text.match(/(?:(\d{1,2}):)?(\d{1,2}):(\d{2})/);
  if (!match) return null;

  const hours = match[1] ? parseInt(match[1], 10) : 0;
  const minutes = parseInt(match[2], 10);
  const seconds = parseInt(match[3], 10);

  if (Number.isNaN(minutes) || Number.isNaN(seconds)) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Inspects YouTube DOM / description for video chapters marking where the song begins.
 * E.g., "0:00 Intro", "0:45 Song" or "0:45 Music Starts".
 */
export function detectChapterIntroOffset(): number | null {
  try {
    // 1. Inspect on-page chapter markers list if rendered
    const markerElements = document.querySelectorAll(
      "ytd-macro-markers-list-item-renderer, #endpoint.ytd-macro-markers-list-item-renderer",
    );

    if (markerElements.length >= 2) {
      let introEndedAt: number | null = null;
      let firstMarkerIsIntro = false;

      markerElements.forEach((el, index) => {
        const text = (el.textContent || "").toLowerCase();
        const timeEl = el.querySelector("#time, .ytd-macro-markers-list-item-renderer");
        const timeStr = timeEl?.textContent?.trim() || "";
        const timeSec = parseTimestampToSeconds(timeStr);

        if (index === 0 && /(intro|prologue|skit|dialogue|opening)/i.test(text)) {
          firstMarkerIsIntro = true;
        } else if (
          index === 1 &&
          firstMarkerIsIntro &&
          timeSec !== null &&
          timeSec > 2 &&
          timeSec < 300
        ) {
          introEndedAt = timeSec;
        } else if (
          timeSec !== null &&
          timeSec > 2 &&
          timeSec < 300 &&
          /(song|music|track|audio|lyrics?|start)/i.test(text)
        ) {
          introEndedAt = timeSec;
        }
      });

      if (introEndedAt !== null) {
        return introEndedAt;
      }
    }

    // 2. Inspect video description text if available in DOM
    const descEl = document.querySelector("#description-inline-expander, #description");
    if (descEl) {
      const descText = descEl.textContent || "";
      const lines = descText.split("\n");

      let foundIntro = false;
      for (const line of lines) {
        const trimmed = line.trim();
        const timeSec = parseTimestampToSeconds(trimmed);
        if (timeSec === null) continue;

        if (timeSec <= 3 && /(intro|skit|prologue|opening)/i.test(trimmed)) {
          foundIntro = true;
        } else if (
          (foundIntro || timeSec > 5) &&
          /(song|music|track|audio|start|lyrics?)/i.test(trimmed) &&
          timeSec < 300
        ) {
          return timeSec;
        }
      }
    }
  } catch (err) {
    console.warn("[Lyrical Chapters] Detection error:", err);
  }

  return null;
}

/**
 * Unified helper: attempts SponsorBlock first, then falls back to chapter timestamps.
 */
export async function detectNonCaptionIntroOffset(
  videoId: string,
): Promise<DetectedIntroOffset | null> {
  // 1. Try SponsorBlock (highest accuracy crowd-sourced non-music section)
  const sbOffset = await fetchSponsorBlockIntroOffset(videoId);
  if (sbOffset !== null && sbOffset > 0) {
    return {
      offset: sbOffset,
      source: "sponsorblock",
      description: `SponsorBlock non-music intro segment: +${sbOffset}s`,
    };
  }

  // 2. Try YouTube Chapters / Description timestamps
  const chapterOffset = detectChapterIntroOffset();
  if (chapterOffset !== null && chapterOffset > 0) {
    return {
      offset: chapterOffset,
      source: "chapters",
      description: `YouTube chapter marker: +${chapterOffset}s`,
    };
  }

  return null;
}
