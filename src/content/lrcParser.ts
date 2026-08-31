/**
 * Lyrical - Enhanced LRC Parser
 * Ported and optimized from Better Lyrics project.
 * Handles standard LRC ([mm:ss.xx]) and Enhanced LRC (<mm:ss.xx>) for syllable sync.
 */

import type { LyricalLyricLine, LyricalLyricPart } from "../types/lyrics";

// Helper: Parse time string to seconds (float)
export function parseTime(timeStr: string | number | null | undefined): number {
  if (!timeStr) return 0;
  if (typeof timeStr === "number") return timeStr;

  // Handle <mm:ss.xx> or [mm:ss.xx] format
  const cleanStr = timeStr.replace(/[<>\[\]]/g, "");
  const parts = cleanStr.split(":");

  let totalSeconds = 0;

  if (parts.length === 2) {
    // mm:ss.xx
    const minutes = parseInt(parts[0], 10);
    const seconds = parseFloat(parts[1]);
    totalSeconds = minutes * 60 + seconds;
  } else if (parts.length === 3) {
    // hh:mm:ss.xx
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const seconds = parseFloat(parts[2]);
    totalSeconds = hours * 3600 + minutes * 60 + seconds;
  } else {
    // ss.xx
    totalSeconds = parseFloat(cleanStr);
  }

  return isNaN(totalSeconds) ? 0 : totalSeconds;
}

/**
 * Parse LRC text into structured data.
 * Supports Enhanced LRC (Word/Syllable level).
 * @param {string} lrcText - Raw LRC string
 * @returns {Array} Array of lyric lines with { time, text, duration, parts? }
 */
export function parseLRC(lrcText: string): LyricalLyricLine[] {
  if (!lrcText) return [];

  const lines = lrcText.split("\n");
  const result: LyricalLyricLine[] = [];

  const timeTagRegex = /\[(\d{2}:\d{2}\.\d{2,3})\]/g;
  const enhancedWordRegex = /<(\d{2}:\d{2}\.\d{2,3})>/g;

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    // 1. Extract Line Start Time
    // Matches [mm:ss.xx] at start
    const startMatch = line.match(/^\[(\d{2}:\d{2}\.\d{2,3})\]/);
    if (!startMatch) continue;

    const startTime = parseTime(startMatch[1]);

    // Remove the start tag to process content
    let content = line.replace(timeTagRegex, "").trim();
    if (!content) continue;

    // 2. Check for Enhanced LRC (Word Timestamps)
    // Format: "Word <time> Word <time>" or "<time>Word <time>Word"
    const parts: LyricalLyricPart[] = [];
    let plainText = "";

    // Check if line actually has explicit word tags
    if (enhancedWordRegex.test(content)) {
      // Reset regex state
      enhancedWordRegex.lastIndex = 0;

      // Split by the enhanced tags
      // Segment 0 is usually text before first tag (or empty)
      // Segment 1 is timestamp, Segment 2 is text, etc.
      const fragments = content.split(enhancedWordRegex);

      let lastWordTime = startTime; // Start at line start

      // Note: split with capturing group returns: [text, time, text, time, ...]
      for (let i = 0; i < fragments.length; i++) {
        const fragment = fragments[i];

        if (i % 2 === 0) {
          // Text fragment
          let text = fragment;
          if (!text) continue;

          // CLEANUP: Trim whitespace to prevent double-spacing (gap + space)
          text = text.trim();
          if (!text) continue; // Skip empty after trim

          plainText += text + " "; // Add space for plain text reconstruction

          if (parts.length > 0) {
            if (!parts[parts.length - 1].text) {
              parts[parts.length - 1].text = text;
            } else {
              parts[parts.length - 1].text += " " + text;
            }
          } else {
            // First word/text of the line (before first internal tag)
            parts.push({
              text: text,
              time: startTime,
              duration: 0, // Will fill later
            });
          }
        } else {
          // Time fragment (Capture Group)
          const time = parseTime(fragment);

          if (parts.length > 0) {
            // Close previous part duration
            const lastPart = parts[parts.length - 1];
            lastPart.duration = Math.max(0, time - lastPart.time);
          }

          // Start new part (placeholder text, will be filled by next loop)
          parts.push({
            text: "", // Will be filled by next text fragment
            time: time,
            duration: 0,
          });

          lastWordTime = time;
        }
      }
    } else {
      // Plain line fallback
      plainText = content;
      parts.push({
        text: content,
        time: startTime,
        duration: 0,
      });
    }

    // Filter empty parts
    const validParts = parts.filter((p) => p.text);

    result.push({
      time: startTime,
      text: plainText.trim(),
      duration: 0, // Will calculate from next line
      parts: validParts.length > 0 ? validParts : null,
    });
  }

  // 3. Post-Process Durations (Line & Last Word)
  for (let i = 0; i < result.length; i++) {
    const line = result[i];
    const nextLine = result[i + 1];

    // Calculate Line Duration
    if (nextLine) {
      line.duration = nextLine.time - line.time;
    } else {
      line.duration = 5; // Default for last line
    }

    // Fix Parts Durations (Last word of line)
    if (line.parts) {
      const lastPart = line.parts[line.parts.length - 1];
      if (lastPart && lastPart.duration === 0) {
        // Last word lasts until line ends
        lastPart.duration = Math.max(
          0.2,
          line.duration - (lastPart.time - line.time)
        );
      }
    }
  }

  return result;
}

/**
 * Heuristics to fix common LRC timing issues (short gaps, etc.)
 * @param {Array} lyrics
 */
export function lrcFixers(lyrics: LyricalLyricLine[] | null | undefined): void {
  if (!lyrics) return;

  // 1. Merge short spaces into previous word
  lyrics.forEach((line) => {
    if (!line.parts) return;

    for (let i = 1; i < line.parts.length; i++) {
      const part = line.parts[i];
      const prev = line.parts[i - 1];

      // If part is just a space
      if (part.text === " " && prev.text !== " ") {
        // Give its duration to previous word
        prev.duration += part.duration;
        // Mark for removal (or zero out)
        part.duration = 0;
        part.text = "";
      }
    }
    // Clean empty parts
    line.parts = line.parts.filter((p) => p.text);
  });

  // 2. Clamp minimum durations
  lyrics.forEach((line) => {
    if (!line.parts) return;
    line.parts.forEach((part) => {
      if (part.duration < 0.1) part.duration = 0.1; // Min 100ms
    });
  });
}
