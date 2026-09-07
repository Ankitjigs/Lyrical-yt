/**
 * Lyrical Captions Extractor
 * Runs in the MAIN WORLD to access YouTube's internal player API.
 */

let currentTrackedVideoId = null;
let extractionAttempts = 0;
let extractionTimer = null;
let postedCaptionsForCurrentVideo = false;
let isProcessingPlayerResponse = false;
let lastProcessedSignature = null;
let lastProcessedAt = 0;
let networkHooksInstalled = false;
const MAX_EXTRACTION_ATTEMPTS = 8;
const EXTRACTION_INTERVAL_MS = 1000;

function getVideoId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("v");
}

function getTrackVssId(track) {
  return track?.vssId || track?.vss_id || null;
}

function getTrackLang(track) {
  return track?.languageCode || track?.lang || track?.language || null;
}

function getTrackUrl(track, player = null) {
  let raw = track?.baseUrl || track?.url || null;
  if (!raw && player) {
    try {
      const response = resolvePlayerResponsePayload(
        player?.getPlayerResponse?.() || window.ytInitialPlayerResponse,
      );
      const captionTracks =
        response?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
      const exact = captionTracks.find(
        (ct) =>
          (getTrackVssId(ct) && getTrackVssId(ct) === getTrackVssId(track)) ||
          (getTrackLang(ct) && getTrackLang(ct) === getTrackLang(track)),
      );
      if (exact?.baseUrl) {
        raw = exact.baseUrl;
      } else if (captionTracks.length > 0 && captionTracks[0]?.baseUrl) {
        const base = new URL(captionTracks[0].baseUrl);
        const targetLang = getTrackLang(track);
        if (targetLang) {
          base.searchParams.set("tlang", targetLang);
          raw = base.toString();
        }
      }
    } catch {}
  }
  if (!raw) return null;
  return String(raw)
    .replace(/\\u0026/g, "&")
    .replace(/&amp;/g, "&");
}

function isTranslatedEnglishTrack(track) {
  if (getTrackLang(track) !== "en") return false;
  const url = (getTrackUrl(track) || "").toLowerCase();
  const name = String(
    track?.name?.simpleText || track?.name || "",
  ).toLowerCase();
  return (
    url.includes("tlang=en") ||
    name.includes("english (translated)") ||
    name.includes("translated english")
  );
}

function cleanCaptionText(text) {
  if (!text) return "";
  let words = String(text).replace(/\n/g, " ").trim();
  const notes = ["♪", "♫", "🎵", "🎶"];
  for (const note of notes) {
    if (words.startsWith(note)) words = words.slice(1).trim();
    if (words.endsWith(note)) words = words.slice(0, -1).trim();
  }
  return words.trim();
}

function decodeXmlEntities(input) {
  if (!input) return "";
  return String(input)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

function readAttr(attrs, key) {
  const match = attrs.match(new RegExp(`${key}\\s*=\\s*["']([^"']+)["']`, "i"));
  return match ? match[1] : null;
}

function parseTimeLike(value) {
  if (value == null) return 0;
  const raw = String(value).trim().replace(",", ".");
  if (!raw) return 0;
  if (!raw.includes(":")) {
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : 0;
  }

  const parts = raw.split(":").map((p) => parseFloat(p));
  if (parts.some((n) => !Number.isFinite(n))) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

function parseXmlTimeToSeconds(value, preferMsHeuristic = false) {
  if (value == null) return 0;
  const raw = String(value).trim().toLowerCase().replace(",", ".");
  if (!raw) return 0;

  // Explicit units
  if (raw.endsWith("ms")) {
    return parseTimeLike(raw.slice(0, -2)) / 1000;
  }
  if (raw.endsWith("s")) {
    return parseTimeLike(raw.slice(0, -1));
  }

  // Clock-style values are already in seconds
  if (raw.includes(":")) {
    return parseTimeLike(raw);
  }

  const n = parseTimeLike(raw);
  if (!Number.isFinite(n)) return 0;

  // Heuristic for ambiguous plain numeric t/d attrs.
  // For large values, they are usually milliseconds.
  if (preferMsHeuristic && n >= 10000) return n / 1000;
  return n;
}

function parseCaptionPayload(text) {
  if (!text || !text.trim()) return null;

  // JSON (fmt=json3)
  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      const json = JSON.parse(text);
      const events = json?.events || [];
      const lyrics = events
        .filter((event) => Array.isArray(event?.segs) && event.segs.length > 0)
        .map((event) => {
          const words = cleanCaptionText(
            event.segs.map((seg) => seg?.utf8 || "").join(""),
          );
          return {
            time: (event.tStartMs || 0) / 1000,
            duration: (event.dDurationMs || 0) / 1000,
            text: words,
          };
        })
        .filter((line) => line.text);
      return lyrics.length > 0 ? lyrics : null;
    } catch {
      // fall through to XML parser
    }
  }

  // XML / TTML
  if (
    text.includes("<text") ||
    text.includes("<p") ||
    text.includes("<s") ||
    text.includes("<transcript") ||
    text.includes("<?xml")
  ) {
    try {
      // Avoid DOMParser in MAIN world due Trusted Types restrictions on some pages.
      const lyrics = [];
      const textNodeRegex = /<text\b([^>]*)>([\s\S]*?)<\/text>/gi;
      let match;
      while ((match = textNodeRegex.exec(text)) !== null) {
        const attrs = match[1] || "";
        const raw = decodeXmlEntities(match[2] || "");
        const start = readAttr(attrs, "start");
        const dur = readAttr(attrs, "dur");
        const t = readAttr(attrs, "t");
        const d = readAttr(attrs, "d");

        const time = t
          ? parseXmlTimeToSeconds(t, true)
          : parseXmlTimeToSeconds(start, false);
        const duration = d
          ? parseXmlTimeToSeconds(d, true)
          : parseXmlTimeToSeconds(dur, false);
        const cleaned = cleanCaptionText(raw);
        if (cleaned) {
          lyrics.push({ time, duration, text: cleaned });
        }
      }

      // TTML fallback: <p ...> ... <s ...> ... </s> ... </p>
      if (lyrics.length === 0) {
        const pNodeRegex = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
        while ((match = pNodeRegex.exec(text)) !== null) {
          const pAttrs = match[1] || "";
          const pBody = match[2] || "";
          const pStart = readAttr(pAttrs, "begin") || readAttr(pAttrs, "start");
          const pEnd = readAttr(pAttrs, "end");
          const pDur = readAttr(pAttrs, "dur");

          let lineText = "";
          const sNodeRegex = /<s\b[^>]*>([\s\S]*?)<\/s>/gi;
          let sMatch;
          while ((sMatch = sNodeRegex.exec(pBody)) !== null) {
            lineText += `${decodeXmlEntities(sMatch[1] || "")} `;
          }

          if (!lineText.trim()) {
            // Plain text directly inside <p>, strip inner tags if any remain.
            lineText = decodeXmlEntities(pBody.replace(/<[^>]+>/g, " "));
          }

          const cleaned = cleanCaptionText(lineText);
          if (!cleaned) continue;

          const startTime = parseXmlTimeToSeconds(pStart, false);
          let duration = parseXmlTimeToSeconds(pDur, false);
          if (!duration && pEnd) {
            duration = Math.max(
              0,
              parseXmlTimeToSeconds(pEnd, false) - startTime,
            );
          }

          lyrics.push({
            time: startTime,
            duration,
            text: cleaned,
          });
        }
      }

      return lyrics.length > 0 ? lyrics : null;
    } catch {
      return null;
    }
  }

  return null;
}

async function fetchLyricsForTrack(track) {
  const player = document.getElementById("movie_player");
  const rawTrackUrl = getTrackUrl(track, player);
  if (!rawTrackUrl) return null;

  const candidateUrls = [];
  try {
    const u1 = new URL(rawTrackUrl);
    u1.searchParams.set("fmt", "json3");
    if (track?.kind === "asr" && !u1.searchParams.has("kind")) {
      u1.searchParams.set("kind", "asr");
    }
    candidateUrls.push(u1.toString());
  } catch {}

  try {
    const u2 = new URL(rawTrackUrl);
    u2.searchParams.set("fmt", "srv3");
    candidateUrls.push(u2.toString());
  } catch {}

  if (!candidateUrls.includes(rawTrackUrl)) {
    candidateUrls.push(rawTrackUrl);
  }

  const maxAttempts = track?.kind === "asr" ? 4 : 2;
  const retryBaseDelayMs = track?.kind === "asr" ? 250 : 180;

  for (const url of candidateUrls) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await fetch(url, {
          credentials: "include",
        });
        if (!res.ok) break;

        const text = await res.text();

        // HARD GUARD: YouTube sometimes returns HTML instead of captions
        if (text.startsWith("<!DOCTYPE html") || text.startsWith("<html")) {
          console.log(
            "[Lyrical Extractor] Timedtext returned HTML — retrying warm",
          );
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }
        if (!text || !text.trim()) {
          if (attempt < maxAttempts) {
            await new Promise((resolve) =>
              setTimeout(resolve, retryBaseDelayMs * attempt),
            );
          }
          continue;
        }

        const lyrics = parseCaptionPayload(text);
        if (lyrics && lyrics.length > 0) {
          console.log(
            "[Lyrical Extractor] Parsed prefetched captions:",
            lyrics.length,
            "lines",
          );
          return lyrics;
        }
      } catch (err) {
        console.warn("[Lyrical Extractor] Fetch timedtext error:", err);
      }
      if (attempt < maxAttempts) {
        await new Promise((resolve) =>
          setTimeout(resolve, retryBaseDelayMs * attempt),
        );
      }
    }
  }

  return null;
}

function selectBestTrack(tracks) {
  if (!tracks || tracks.length === 0) return null;
  const validTracks = tracks.filter((t) => !!getTrackUrl(t));
  if (validTracks.length === 0) return tracks[0] || null;

  return (
    validTracks.find(
      (t) =>
        t.kind !== "asr" &&
        getTrackLang(t) === "en" &&
        !isTranslatedEnglishTrack(t),
    ) ||
    validTracks.find((t) => t.kind !== "asr" && !isTranslatedEnglishTrack(t)) ||
    validTracks.find((t) => t.kind !== "asr" && isTranslatedEnglishTrack(t)) ||
    validTracks.find((t) => t.kind === "asr" && getTrackLang(t) === "en") ||
    validTracks.find((t) => t.kind === "asr") ||
    validTracks[0]
  );
}

function isPlayerWarm(player) {
  try {
    const s = player?.getPlayerState?.();
    return s === 1 || s === 2 || s === 3; // playing, paused, buffering
  } catch {
    return false;
  }
}

function clearExtractionTimer() {
  if (extractionTimer) {
    clearTimeout(extractionTimer);
    extractionTimer = null;
  }
}

function scheduleExtraction(delay = EXTRACTION_INTERVAL_MS) {
  clearExtractionTimer();
  extractionTimer = setTimeout(extractCaptions, delay);
}

function resetTrackingForVideo(videoId) {
  currentTrackedVideoId = videoId;
  extractionAttempts = 0;
  postedCaptionsForCurrentVideo = false;
  isProcessingPlayerResponse = false;
  lastProcessedSignature = null;
  lastProcessedAt = 0;
}

function isPlayerResponseUrl(url) {
  if (!url) return false;
  const u = String(url);
  return (
    u.includes("/youtubei/v1/player") ||
    u.includes("get_video_info") ||
    u.includes("/youtubei/v1/next")
  );
}

function resolvePlayerResponsePayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  if (Array.isArray(payload)) {
    // If passed array of tracks directly (from player.getOption("captions", "tracklist"))
    return {
      captions: {
        playerCaptionsTracklistRenderer: {
          captionTracks: payload,
        },
      },
    };
  }
  if (payload?.captions?.playerCaptionsTracklistRenderer?.captionTracks) {
    return payload;
  }
  if (
    payload?.playerResponse?.captions?.playerCaptionsTracklistRenderer
      ?.captionTracks
  ) {
    return payload.playerResponse;
  }
  return null;
}

function getTracksFromPlayer(player) {
  let tracks = null;
  const response = resolvePlayerResponsePayload(
    player?.getPlayerResponse?.() || window.ytInitialPlayerResponse,
  );
  const responseTracks =
    response?.captions?.playerCaptionsTracklistRenderer?.captionTracks || null;

  try {
    tracks = player?.getOption?.("captions", "tracklist");
  } catch {}
  if (!tracks || tracks.length === 0) {
    try {
      tracks = player?.getOption?.("captions", "captionTracks");
    } catch {}
  }
  if (!tracks || tracks.length === 0) {
    tracks = responseTracks;
  }
  if (!tracks || tracks.length === 0) return null;

  const baseTimedTextUrl =
    responseTracks?.[0]?.baseUrl ||
    tracks.find((t) => t.baseUrl || t.url)?.baseUrl ||
    tracks.find((t) => t.baseUrl || t.url)?.url ||
    null;

  return tracks.map((t) => {
    const vssId = getTrackVssId(t);
    let existingUrl = getTrackUrl(t);
    if (!existingUrl && baseTimedTextUrl) {
      const lang = getTrackLang(t);
      if (lang) {
        try {
          const u = new URL(baseTimedTextUrl);
          u.searchParams.set("tlang", lang);
          existingUrl = u.toString();
        } catch {}
      }
    }
    return {
      ...t,
      vssId: vssId || undefined,
      url: existingUrl || undefined,
      baseUrl: existingUrl || t.baseUrl || undefined,
    };
  });
}

function postCaptionData({
  tracks,
  selectedTrack,
  lyrics,
  videoDetails,
  videoId,
  phase = "tracks",
}) {
  window.postMessage(
    {
      type: "LYRICAL_CAPTIONS_FOUND",
      tracks: tracks || [],
      selectedTrack: selectedTrack || undefined,
      lyrics: lyrics || undefined,
      videoDetails: videoDetails,
      videoId: videoId,
      phase,
    },
    "*",
  );
}

async function processPlayerResponsePayload(payload, source = "unknown") {
  const currentVideoId = getVideoId();
  if (!currentVideoId) return false;

  const response = resolvePlayerResponsePayload(payload);
  const tracks =
    response?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!tracks || tracks.length === 0) return false;

  const selectedTrack = selectBestTrack(tracks);
  const selectedTrackUrl = getTrackUrl(selectedTrack) || "";
  const signature = `${currentVideoId}|${tracks.length}|${selectedTrackUrl}`;
  const now = Date.now();

  // Ignore noisy duplicate payloads from multiple fetch/xhr hooks in quick burst.
  if (
    signature === lastProcessedSignature &&
    now - lastProcessedAt < 600 &&
    postedCaptionsForCurrentVideo
  ) {
    return true;
  }

  if (isProcessingPlayerResponse) return true;
  isProcessingPlayerResponse = true;
  try {
    console.log(
      "[Lyrical Extractor] Processing captions from",
      source,
      "tracks:",
      tracks.length,
    );

    // Phase 1: send tracks immediately so content script knows captions exist.
    postCaptionData({
      tracks,
      selectedTrack,
      videoDetails: response?.videoDetails,
      videoId: currentVideoId,
      phase: "tracks",
    });

    let prefetchedLyrics = null;
    let successfulTrack = selectedTrack;
    const player = document.getElementById("movie_player");

    // Small warmup delay for YouTube caption backend
    await new Promise((r) => setTimeout(r, 600));

    // If player not playing yet, wait briefly
    if (!isPlayerWarm(player)) {
      await new Promise((r) => setTimeout(r, 1000));
    }

    // Multi-track fallback: try selectedTrack first, then any alternate tracks
    const tracksToTry = [selectedTrack, ...tracks.filter((t) => t !== selectedTrack)];

    for (const trackCandidate of tracksToTry) {
      prefetchedLyrics = await fetchLyricsForTrack(trackCandidate);

      if (prefetchedLyrics && prefetchedLyrics.length > 0) {
        successfulTrack = trackCandidate;
        break;
      }
    }

    // Phase 2: send parsed lyrics when available.
    if (prefetchedLyrics && prefetchedLyrics.length > 0) {
      postCaptionData({
        tracks,
        selectedTrack: successfulTrack,
        lyrics: prefetchedLyrics,
        videoDetails: response?.videoDetails,
        videoId: currentVideoId,
        phase: "lyrics",
      });
      postedCaptionsForCurrentVideo = true;
      extractionAttempts = 0;
      clearExtractionTimer();
    } else {
      console.log("[Lyrical Extractor] Captions not ready yet — will retry");
      postedCaptionsForCurrentVideo = false;
    }

    lastProcessedSignature = signature;
    lastProcessedAt = Date.now();
    return true;
  } finally {
    isProcessingPlayerResponse = false;
  }
}

function attachPlayerListeners(player) {
  if (!player || player.__lyricalListenersAttached) return;

  player.__lyricalListenersAttached = true;

  try {
    player.addEventListener("onApiChange", () => {
      console.log(
        "[Lyrical Extractor] onApiChange fired — rechecking captions",
      );
      scheduleExtraction(300);
    });
  } catch {}

  try {
    player.addEventListener("onCaptionsTrackListChanged", () => {
      console.log(
        "[Lyrical Extractor] onCaptionsTrackListChanged fired — rechecking captions",
      );
      scheduleExtraction(200);
    });
  } catch {}

  try {
    player.addEventListener("onReady", () => {
      console.log("[Lyrical Extractor] player ready — rechecking captions");
      scheduleExtraction(400);
    });
  } catch {}

  try {
    player.addEventListener("onStateChange", (e) => {
      if (e === 1 || e === 3) {
        // playing or buffering
        scheduleExtraction(400);
      }
    });
  } catch {}
}

async function extractCaptions() {
  try {
    const currentVideoId = getVideoId();
    if (!currentVideoId) return;

    // Video changed: reset state and start fresh polling cycle
    if (currentTrackedVideoId !== currentVideoId) {
      resetTrackingForVideo(currentVideoId);
    }

    // We already successfully posted captions for this video.
    if (postedCaptionsForCurrentVideo) return;

    const player = document.getElementById("movie_player");
    attachPlayerListeners(player);

    if (!player) {
      extractionAttempts++;
      if (extractionAttempts < MAX_EXTRACTION_ATTEMPTS) {
        scheduleExtraction();
      }
      return;
    }

    // 1. First try direct player API (better-lyrics-master approach)
    const directTracks = getTracksFromPlayer(player);
    let processed = false;
    if (directTracks && directTracks.length > 0) {
      processed = await processPlayerResponsePayload(directTracks, "playerApi");
    }

    // 2. Fallback to getPlayerResponse / initial state
    if (!processed) {
      const response =
        player?.getPlayerResponse?.() || window.ytInitialPlayerResponse;
      processed = await processPlayerResponsePayload(response, "poll");
    }

    if (processed) {
      console.log("[Lyrical Extractor] Captions successfully extracted");
      clearExtractionTimer();
      return;
    } else {
      // No captions found, retry
      extractionAttempts++;
      if (extractionAttempts < MAX_EXTRACTION_ATTEMPTS) {
        console.log(
          `[Lyrical Extractor] No captions yet (${extractionAttempts}/${MAX_EXTRACTION_ATTEMPTS}), retrying...`,
        );
        scheduleExtraction(1000);
      } else {
        console.log(
          `[Lyrical Extractor] Reached max extraction attempts (${MAX_EXTRACTION_ATTEMPTS}) for video ${currentVideoId}. Stopping retries.`,
        );
        window.postMessage(
          {
            type: "LYRICAL_CAPTIONS_FOUND",
            tracks: [],
            videoId: currentVideoId,
          },
          "*",
        );
        clearExtractionTimer();
      }
    }
  } catch (e) {
    console.error("[Lyrical Extractor] Error:", e);
    scheduleExtraction(2000);
  }
}

function installNetworkInterceptors() {
  if (networkHooksInstalled) return;
  networkHooksInstalled = true;

  try {
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
      const response = await originalFetch.apply(this, args);
      try {
        const req = args[0];
        const url = typeof req === "string" ? req : req?.url;
        if (isPlayerResponseUrl(url)) {
          const clone = response.clone();
          clone
            .text()
            .then((text) => {
              if (!text) return;
              let payload = null;
              try {
                payload = JSON.parse(text);
              } catch {
                payload = null;
              }
              if (payload) {
                processPlayerResponsePayload(payload, "fetch").catch(() => {});
              }
            })
            .catch(() => {});
        }
      } catch {
        // ignore interception errors
      }
      return response;
    };
  } catch (e) {
    console.warn("[Lyrical Extractor] Failed to install fetch interceptor", e);
  }

  try {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this.__lyricalUrl = url;
      return originalOpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function (...args) {
      try {
        const url = this.__lyricalUrl;
        if (isPlayerResponseUrl(url)) {
          this.addEventListener("load", () => {
            try {
              const text = this.responseText;
              if (!text) return;
              const payload = JSON.parse(text);
              processPlayerResponsePayload(payload, "xhr").catch(() => {});
            } catch {
              // ignore parse failures
            }
          });
        }
      } catch {
        // ignore
      }
      return originalSend.apply(this, args);
    };
  } catch (e) {
    console.warn("[Lyrical Extractor] Failed to install XHR interceptor", e);
  }
}

function onVideoChange() {
  const currentVideoId = getVideoId();
  if (currentVideoId) {
    console.log("[Lyrical Extractor] New video:", currentVideoId);
    resetTrackingForVideo(currentVideoId);
    scheduleExtraction(800);
  }
}

// Listen for YouTube navigation
document.addEventListener("yt-navigate-finish", onVideoChange);
document.addEventListener("yt-page-data-updated", onVideoChange);

installNetworkInterceptors();
// Initial check
if (window.ytInitialPlayerResponse) {
  processPlayerResponsePayload(window.ytInitialPlayerResponse, "initial").catch(
    () => {},
  );
}

if (getVideoId()) {
  scheduleExtraction(500); // Start polling for movie_player sooner
}

window.addEventListener("message", async (event) => {
  if (
    event.source !== window ||
    event.data?.type !== "LYRICAL_FETCH_TRACK_REQUEST"
  )
    return;
  const { trackId, languageCode, isAsr, requestId } = event.data;
  try {
    const player = document.getElementById("movie_player");
    const tracks = getTracksFromPlayer(player);
    if (!tracks || tracks.length === 0) {
      window.postMessage(
        { type: "LYRICAL_FETCH_TRACK_RESPONSE", requestId, success: false },
        "*",
      );
      return;
    }
    const targetCode = (languageCode || "").toLowerCase();
    const cleanTarget = (languageCode || "").split("-")[0].toLowerCase();
    const match =
      tracks.find(
        (t) =>
          (t.vssId && t.vssId === trackId) ||
          (t.vss_id && t.vss_id === trackId),
      ) ||
      tracks.find((t) => {
        const lang = (getTrackLang(t) || "").toLowerCase();
        const atIsAsr =
          t.kind === "asr" ||
          String(t.vssId || t.vss_id || "").startsWith("a.");
        return lang === targetCode && atIsAsr === Boolean(isAsr);
      }) ||
      tracks.find((t) => {
        const lang = (getTrackLang(t) || "").split("-")[0].toLowerCase();
        const atIsAsr =
          t.kind === "asr" ||
          String(t.vssId || t.vss_id || "").startsWith("a.");
        return lang === cleanTarget && atIsAsr === Boolean(isAsr);
      }) ||
      tracks.find(
        (t) => (getTrackLang(t) || "").toLowerCase() === targetCode,
      ) ||
      tracks.find(
        (t) => (getTrackLang(t) || "").split("-")[0].toLowerCase() === cleanTarget,
      );

    if (!match) {
      window.postMessage(
        { type: "LYRICAL_FETCH_TRACK_RESPONSE", requestId, success: false },
        "*",
      );
      return;
    }

    const lyrics = await fetchLyricsForTrack(match);
    if (lyrics && lyrics.length > 0) {
      window.postMessage(
        {
          type: "LYRICAL_FETCH_TRACK_RESPONSE",
          requestId,
          success: true,
          lyrics,
          trackId: match.vssId || trackId,
          languageCode: getTrackLang(match) || languageCode,
          isAsr: match.kind === "asr" || Boolean(isAsr),
        },
        "*",
      );
    } else {
      window.postMessage(
        { type: "LYRICAL_FETCH_TRACK_RESPONSE", requestId, success: false },
        "*",
      );
    }
  } catch (err) {
    window.postMessage(
      {
        type: "LYRICAL_FETCH_TRACK_RESPONSE",
        requestId,
        success: false,
        error: String(err),
      },
      "*",
    );
  }
});

console.log("[Lyrical Extractor] Loaded");
