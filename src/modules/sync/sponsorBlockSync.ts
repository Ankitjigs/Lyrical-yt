/**
 * SponsorBlock & Chapter-based Intro Evidence Detector
 *
 * Detects likely non-music intro boundaries for YouTube music videos.
 *
 * IMPORTANT:
 * SponsorBlock / chapter timestamps are NOT treated as guaranteed lyric
 * synchronization offsets. They are secondary evidence used together with
 * caption-based synchronization.
 */

export type IntroEvidenceSource = "sponsorblock" | "chapters";

export interface DetectedIntroOffset {
  offset: number;
  source: IntroEvidenceSource;
  description?: string;

  /**
   * Confidence in this being a useful intro boundary.
   * This is intentionally lower than strong caption evidence.
   */
  confidence: number;

  /**
   * Timestamp in seconds where an outro non-music section starts, if detected.
   */
  outroStart?: number;
}

/**
 * Internal representation of a SponsorBlock segment.
 */
interface SponsorBlockSegment {
  start: number;
  end: number;
  category?: string;
}

/**
 * Queries SponsorBlock for music_offtopic segments.
 *
 * SponsorBlock returns segment timestamps as:
 *
 *   [startTime, endTime]
 *
 * We use the end of a qualifying beginning-of-video music_offtopic segment
 * as a candidate boundary where the actual song may begin.
 */
export async function fetchSponsorBlockIntroOffset(
  videoId: string,
  timeoutMs = 3500,
): Promise<{ offset: number; outroStart?: number } | null> {
  if (!videoId || videoId.length < 5) {
    return null;
  }

  const controller = new AbortController();

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const url =
      `https://sponsor.ajay.app/api/skipSegments` +
      `?videoID=${encodeURIComponent(videoId)}` +
      `&categories=${encodeURIComponent(JSON.stringify(["music_offtopic"]))}`;

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    if (res.status === 404 || !res.ok) {
      return null;
    }

    const segments = await res.json();

    if (!Array.isArray(segments) || segments.length === 0) {
      return null;
    }

    const candidates: SponsorBlockSegment[] = [];
    let outroSegment: SponsorBlockSegment | null = null;

    for (const item of segments) {
      const start = item?.segment?.[0];
      const end = item?.segment?.[1];

      if (
        typeof start !== "number" ||
        typeof end !== "number" ||
        !Number.isFinite(start) ||
        !Number.isFinite(end)
      ) {
        continue;
      }

      if (end <= start) {
        continue;
      }

      /*
       * We are interested in a non-music section near the beginning.
       *
       * Don't require start === 0.
       *
       * A small amount of actual video/audio can exist before the
       * non-music section.
       */
      const beginsNearStart = start <= 8.0;

      /*
       * Ignore absurdly long segments. A music_offtopic segment lasting
       * several minutes is unlikely to be a useful intro boundary.
       */
      const reasonableLength = end - start >= 1.5 && end <= 180;

      if (beginsNearStart && reasonableLength) {
        candidates.push({
          start,
          end,
          category: item?.category,
        });
      }

      // Check for outro segment (non-music section near the end of the video, e.g. start >= 60)
      if (start >= 60 && (outroSegment === null || start < outroSegment.start)) {
        outroSegment = { start, end, category: item?.category };
      }
    }

    if (candidates.length === 0) {
      return null;
    }

    /*
     * Prefer the segment that:
     *
     * 1. starts closest to the beginning of the video
     * 2. has a meaningful duration
     *
     * We don't simply use the first API result because API ordering
     * should not be treated as semantic priority.
     */
    candidates.sort((a, b) => {
      const startDifference = a.start - b.start;

      if (Math.abs(startDifference) > 0.25) {
        return startDifference;
      }

      return b.end - a.end;
    });

    const best = candidates[0];

    /*
     * Require at least a small amount of actual intro material.
     *
     * Example:
     *
     *   [0.0, 0.2]
     *
     * is not useful as a lyric offset.
     */
    if (best.end < 2.0) {
      return null;
    }

    return {
      offset: Number(best.end.toFixed(2)),
      outroStart: outroSegment ? Number(outroSegment.start.toFixed(2)) : undefined,
    };
  } catch (err: any) {
    if (err?.name !== "AbortError") {
      console.debug("[Lyrical SponsorBlock] Fetch error:", err?.message || err);
    }

    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Parses:
 *
 *   MM:SS
 *   HH:MM:SS
 *
 * into seconds.
 */
function parseTimestampToSeconds(text: string): number | null {
  if (!text) {
    return null;
  }

  const match = text.match(/(?:(\d{1,2}):)?(\d{1,2}):(\d{2})/);

  if (!match) {
    return null;
  }

  const hours = match[1] ? parseInt(match[1], 10) : 0;
  const minutes = parseInt(match[2], 10);
  const seconds = parseInt(match[3], 10);

  if (Number.isNaN(hours) || Number.isNaN(minutes) || Number.isNaN(seconds)) {
    return null;
  }

  if (minutes >= 60 || seconds >= 60) {
    return null;
  }

  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Checks whether chapter text looks like an intro/non-music section.
 */
function isIntroChapterText(text: string): boolean {
  return /(intro|prologue|skit|dialogue|opening|prelude|story|scene|spoken)/i.test(
    text,
  );
}

/**
 * Checks whether chapter text looks like the actual song.
 */
function isSongChapterText(text: string): boolean {
  return /(song|music|track|audio|lyrics?|official audio|music video)/i.test(
    text,
  );
}

/**
 * Inspects YouTube chapter markers / description timestamps.
 *
 * This is secondary evidence only.
 */
export function detectChapterIntroOffset(): number | null {
  try {
    const candidates: number[] = [];

    /*
     * ------------------------------------------------------------
     * 1. Rendered YouTube chapter list
     * ------------------------------------------------------------
     */
    const markerElements = document.querySelectorAll(
      "ytd-macro-markers-list-item-renderer, #endpoint.ytd-macro-markers-list-item-renderer",
    );

    if (markerElements.length >= 2) {
      const chapters: Array<{
        time: number;
        text: string;
      }> = [];

      markerElements.forEach((el) => {
        const text = (el.textContent || "").trim();

        const timeEl = el.querySelector(
          "#time, .ytd-macro-markers-list-item-renderer",
        );

        const timeStr = timeEl?.textContent?.trim() || "";
        const time = parseTimestampToSeconds(timeStr);

        if (time !== null && time >= 0 && time < 300) {
          chapters.push({
            time,
            text,
          });
        }
      });

      chapters.sort((a, b) => a.time - b.time);

      /*
       * Pattern A:
       *
       * 0:00 Intro
       * 0:12 Song
       */
      for (let i = 0; i < chapters.length - 1; i++) {
        const current = chapters[i];
        const next = chapters[i + 1];

        if (
          current.time <= 8 &&
          isIntroChapterText(current.text) &&
          next.time > current.time &&
          next.time < 300
        ) {
          candidates.push(next.time);
        }
      }

      /*
       * Pattern B:
       *
       * 0:00 Intro
       * 0:15 Music
       */
      for (const chapter of chapters) {
        if (
          chapter.time > 2 &&
          chapter.time < 300 &&
          isSongChapterText(chapter.text)
        ) {
          candidates.push(chapter.time);
        }
      }
    }

    /*
     * ------------------------------------------------------------
     * 2. Description timestamps
     * ------------------------------------------------------------
     */
    const descEl = document.querySelector(
      "#description-inline-expander, #description",
    );

    if (descEl) {
      const descText = descEl.textContent || "";
      const lines = descText.split("\n");

      let introSeen = false;

      for (const line of lines) {
        const trimmed = line.trim();

        if (!trimmed) {
          continue;
        }

        const timeSec = parseTimestampToSeconds(trimmed);

        if (timeSec === null || timeSec < 0 || timeSec >= 300) {
          continue;
        }

        if (timeSec <= 8 && isIntroChapterText(trimmed)) {
          introSeen = true;
          continue;
        }

        if (
          timeSec > 2 &&
          isSongChapterText(trimmed) &&
          (introSeen || timeSec >= 5)
        ) {
          candidates.push(timeSec);
        }
      }
    }

    /*
     * ------------------------------------------------------------
     * Select best chapter candidate
     * ------------------------------------------------------------
     */
    if (candidates.length === 0) {
      return null;
    }

    /*
     * Deduplicate timestamps that come from both the chapter DOM
     * and the description.
     */
    const uniqueCandidates = Array.from(
      new Set(candidates.map((value) => Number(value.toFixed(2)))),
    );

    /*
     * Prefer the earliest reasonable candidate.
     *
     * We only want the point where the actual song likely begins.
     */
    uniqueCandidates.sort((a, b) => a - b);

    return uniqueCandidates[0] ?? null;
  } catch (err) {
    console.debug("[Lyrical Chapters] Detection error:", err);

    return null;
  }
}

/**
 * Unified intro evidence.
 *
 * Priority:
 *
 *   SponsorBlock
 *       ↓
 *   Chapters
 *
 * SponsorBlock gets higher confidence because it represents a dedicated
 * community annotation for non-music segments.
 *
 * Neither result is treated as definitive lyric synchronization.
 */
export async function detectNonCaptionIntroOffset(
  videoId: string,
): Promise<DetectedIntroOffset | null> {
  /*
   * ------------------------------------------------------------
   * 1. SponsorBlock
   * ------------------------------------------------------------
   */
  const sbResult = await fetchSponsorBlockIntroOffset(videoId);

  if (sbResult !== null && sbResult.offset > 0) {
    return {
      offset: sbResult.offset,
      source: "sponsorblock",
      confidence: 0.62,
      description: `SponsorBlock non-music intro boundary: +${sbResult.offset}s`,
      outroStart: sbResult.outroStart,
    };
  }

  /*
   * ------------------------------------------------------------
   * 2. YouTube chapters / description
   * ------------------------------------------------------------
   */
  const chapterOffset = detectChapterIntroOffset();

  if (chapterOffset !== null && chapterOffset > 0) {
    return {
      offset: chapterOffset,
      source: "chapters",
      confidence: 0.48,
      description: `YouTube chapter/description song boundary: +${chapterOffset}s`,
    };
  }

  return null;
}
