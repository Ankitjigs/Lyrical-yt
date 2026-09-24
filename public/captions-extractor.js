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
let lastKnownPoToken = null;
const cachedTimedTextByVideo = new Map();
const pendingTimedTextResolvers = new Set();
let currentVideoDetails = null;
let currentTracks = null;
let currentSelectedTrack = null;
const MAX_EXTRACTION_ATTEMPTS = 8;
const EXTRACTION_INTERVAL_MS = 1000;

function ensureCaptionHiderStyle() {
  if (document.getElementById("lyrical-caption-hider")) return;
  try {
    const style = document.createElement("style");
    style.id = "lyrical-caption-hider";
    style.textContent = `
      .ytp-caption-window-bottom,
      .caption-window,
      .ytp-caption-window-rollup {
        opacity: 0 !important;
        pointer-events: none !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  } catch {}
}

/**
 * Disable YouTube's native CC rendering after Lyrical has extracted caption data.
 * This prevents the CC button from lighting up and stops YouTube from showing
 * its own caption overlay / switching tracks when Lyrical switches tracks.
 */
function disableNativeCaptions() {
  try {
    const player = document.getElementById("movie_player");
    if (!player) return;
    // Turn off active caption track display without unloading the module
    if (typeof player.setOption === "function") {
      player.setOption("captions", "track", {});
    }
  } catch (err) {
    console.debug("[Lyrical Extractor] Could not disable native captions:", err);
  }
}

function isHtmlOrBlockPage(text) {
  if (!text || typeof text !== "string") return true;
  const lower = text.toLowerCase();
  return (
    lower.includes("<!doctype html") ||
    lower.includes("<html") ||
    lower.includes("<body") ||
    lower.includes("automated queries") ||
    lower.includes("unusual traffic") ||
    lower.includes("we can't process your request") ||
    lower.includes("our systems have detected") ||
    lower.includes("google.com/sorry")
  );
}

function handleInterceptedTimedText(text, url) {
  if (!text || !text.trim()) return;

  if (isHtmlOrBlockPage(text)) {
    console.log("[Lyrical Extractor] Ignored timedtext response: HTML or bot-block page detected");
    return;
  }

  const player = document.getElementById("movie_player");
  if (isAdPlaying(player)) {
    console.log("[Lyrical Extractor] Ignored timedtext response: ad is currently playing");
    return;
  }

  const currentVideoId = getVideoId();
  try {
    const u = new URL(url, window.location.origin);
    const timedTextVideoId = u.searchParams.get("v");
    if (timedTextVideoId && currentVideoId && timedTextVideoId !== currentVideoId) {
      console.log(
        "[Lyrical Extractor] Ignored timedtext for different/ad video:",
        timedTextVideoId,
        "current main video:",
        currentVideoId,
      );
      return;
    }
  } catch {}

  // Capture and remember any runtime PO token from the player's request URL
  try {
    const u = new URL(url, window.location.origin);
    const pot = u.searchParams.get("pot");
    if (pot) {
      lastKnownPoToken = pot;
      console.log("[Lyrical Extractor] Captured PO Token from player request");
    }
  } catch {}

  const lyrics = parseCaptionPayload(text);
  if (!lyrics || lyrics.length === 0) return;

  console.log(
    "[Lyrical Extractor] Intercepted timedtext response: parsed",
    lyrics.length,
    "lines",
  );

  let interceptedLang = "";
  let interceptedVss = "";
  try {
    const u = new URL(url, window.location.origin);
    interceptedLang = (u.searchParams.get("tlang") || u.searchParams.get("lang") || "").toLowerCase();
    interceptedVss = (u.searchParams.get("vss_id") || "").toLowerCase();
  } catch {}

  if (currentVideoId) {
    if (interceptedVss) cachedTimedTextByVideo.set(`${currentVideoId}:${interceptedVss}`, lyrics);
    if (interceptedLang) cachedTimedTextByVideo.set(`${currentVideoId}:${interceptedLang}`, lyrics);
    cachedTimedTextByVideo.set(`${currentVideoId}:latest`, lyrics);
  }

  // Resolve matching pending wait promises
  for (const item of Array.from(pendingTimedTextResolvers)) {
    const targetClean = (item.targetLang || "").split("-")[0];
    const interClean = (interceptedLang || "").split("-")[0];
    const langMatch =
      !item.targetLang ||
      !interceptedLang ||
      item.targetLang === interceptedLang ||
      (targetClean && targetClean === interClean);
    const vssMatch = !item.targetVss || !interceptedVss || item.targetVss === interceptedVss;
    if (langMatch || vssMatch) {
      try {
        item.resolver(lyrics);
      } catch {}
      pendingTimedTextResolvers.delete(item);
    }
  }

  // If we haven't successfully posted lyrics for this video yet, post now!
  if (!postedCaptionsForCurrentVideo && currentVideoId) {
    const player = document.getElementById("movie_player");
    const tracks = currentTracks || getTracksFromPlayer(player) || [];
    const selectedTrack = currentSelectedTrack || selectBestTrack(tracks);

    postCaptionData({
      tracks,
      selectedTrack,
      lyrics,
      videoDetails: currentVideoDetails,
      videoId: currentVideoId,
      phase: "lyrics",
    });
    postedCaptionsForCurrentVideo = true;
    extractionAttempts = 0;
    clearExtractionTimer();
  }
}

function getVideoId() {
  try {
    const player = document.getElementById("movie_player");
    const playerV = player?.getVideoData?.()?.video_id;
    if (playerV) return playerV;
  } catch {}

  const params = new URLSearchParams(window.location.search);
  const v = params.get("v");
  if (v) return v;

  // 1. The playing video title link inside the HTML5 player controls (.ytp-title-link always has the playing video)
  try {
    const titleLink = document.querySelector(
      "ytd-miniplayer .ytp-title-link[href*='watch?v='], ytd-miniplayer a.ytp-title-link, .ytp-title-link[href*='watch?v=']"
    );
    if (titleLink && titleLink.href) {
      const match = titleLink.href.match(/[?&]v=([^&]+)/);
      if (match && match[1]) return match[1];
    }
  } catch {}

  // 2. Selected playlist queue item inside miniplayer
  try {
    const selItem = document.querySelector(
      "ytd-miniplayer ytd-playlist-panel-video-renderer[selected] a[href*='watch?v='], ytd-miniplayer [aria-selected='true'] a[href*='watch?v='], ytd-miniplayer .selected a[href*='watch?v=']"
    );
    if (selItem && selItem.href) {
      const match = selItem.href.match(/[?&]v=([^&]+)/);
      if (match && match[1]) return match[1];
    }
  } catch {}

  // 3. MediaSession artwork
  if ("mediaSession" in navigator && navigator.mediaSession.metadata?.artwork) {
    try {
      const arts = navigator.mediaSession.metadata.artwork;
      for (let i = arts.length - 1; i >= 0; i--) {
        const m = arts[i]?.src?.match(/\/vi\/([a-zA-Z0-9_-]{11})\//);
        if (m && m[1]) return m[1];
      }
    } catch {}
  }

  // 4. Fallback: miniplayer info bar or any miniplayer link
  try {
    const miniLink = document.querySelector(
      "ytd-miniplayer .info-bar a[href*='watch?v='], ytd-miniplayer .metadata a[href*='watch?v='], ytd-miniplayer a[href*='watch?v=']"
    );
    if (miniLink && miniLink.href) {
      const match = miniLink.href.match(/[?&]v=([^&]+)/);
      if (match && match[1]) return match[1];
    }
  } catch {}

  return null;
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
  let words = decodeXmlEntities(String(text)).replace(/\r?\n/g, " ").trim();

  // 1. Remove YouTube speaker change markers (e.g. ">> ", ">>> ", "> ")
  words = words.replace(/^(?:>{1,3}|&gt;{1,3})\s*/i, "");

  // 2. Remove musical notes
  words = words.replace(/[♪♫🎵🎶]/g, "").trim();

  // 3. Remove sound effect annotations at start and end
  words = words.replace(
    /^\s*\[(?:music|applause|laughter|cheering|chuckles|groans|sighs|gasp|screaming)[^\]]*\]\s*/gi,
    "",
  );
  words = words.replace(
    /^\s*\((?:music|applause|laughter|cheering|chuckles|groans|sighs|gasp|screaming)[^)]*\)\s*/gi,
    "",
  );
  words = words.replace(
    /\s*\[(?:music|applause|laughter|cheering|chuckles|groans|sighs|gasp|screaming)[^\]]*\]\s*$/gi,
    "",
  );
  words = words.replace(
    /\s*\((?:music|applause|laughter|cheering|chuckles|groans|sighs|gasp|screaming)[^)]*\)\s*$/gi,
    "",
  );

  // 4. Normalize multiple spaces
  words = words.replace(/\s+/g, " ");

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
  if (isHtmlOrBlockPage(text)) return null;

  // JSON (fmt=json3)
  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      const json = JSON.parse(text);
      const events = json?.events || [];
      const lyrics = events
        .filter((event) => Array.isArray(event?.segs) && event.segs.length > 0)
        .map((event) => {
          let firstWordOffsetMs = 0;
          for (const seg of event.segs) {
            const t = cleanCaptionText(seg?.utf8 || "");
            if (t.length > 0) {
              firstWordOffsetMs = Number(seg?.tOffsetMs) || 0;
              break;
            }
          }

          const words = cleanCaptionText(
            event.segs.map((seg) => seg?.utf8 || "").join(""),
          );
          return {
            time: ((event.tStartMs || 0) + firstWordOffsetMs) / 1000,
            duration: Math.max(
              0.2,
              ((event.dDurationMs || 0) - firstWordOffsetMs) / 1000,
            ),
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

          // CRITICAL: A valid TTML caption line MUST have timing attributes (begin, start, or t).
          // An HTML <p> tag from an error page has no timing attributes and must be rejected!
          if (!pStart && !pAttrs.includes("t=") && !pAttrs.includes("begin=") && !pAttrs.includes("start=")) {
            continue;
          }

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

async function requestPlayerCaptionTrack(track) {
  const player = document.getElementById("movie_player");
  if (!player) return null;

  ensureCaptionHiderStyle();

  const currentVideoId = getVideoId();
  const targetLang = (getTrackLang(track) || "").toLowerCase();
  const targetVss = (getTrackVssId(track) || "").toLowerCase();

  if (currentVideoId) {
    if (targetVss && cachedTimedTextByVideo.has(`${currentVideoId}:${targetVss}`)) {
      return cachedTimedTextByVideo.get(`${currentVideoId}:${targetVss}`);
    }
    if (targetLang && cachedTimedTextByVideo.has(`${currentVideoId}:${targetLang}`)) {
      return cachedTimedTextByVideo.get(`${currentVideoId}:${targetLang}`);
    }
    const cleanLang = (targetLang || "").split("-")[0];
    if (cleanLang && cachedTimedTextByVideo.has(`${currentVideoId}:${cleanLang}`)) {
      return cachedTimedTextByVideo.get(`${currentVideoId}:${cleanLang}`);
    }
    if (cachedTimedTextByVideo.has(`${currentVideoId}:latest`)) {
      return cachedTimedTextByVideo.get(`${currentVideoId}:latest`);
    }
  }

  try {
    if (typeof player.loadModule === "function") {
      try {
        player.loadModule("captions");
      } catch {}
    }

    // Set up a promise that resolves when /api/timedtext for this specific language is intercepted
    let resolverObj = null;
    const interceptedPromise = new Promise((resolve) => {
      resolverObj = {
        resolver: resolve,
        targetLang,
        targetVss,
      };
      setTimeout(() => {
        pendingTimedTextResolvers.delete(resolverObj);
        resolve(null);
      }, 4000);
    });

    pendingTimedTextResolvers.add(resolverObj);

    // Find matching track from player's internal tracklist
    const playerTracks = player.getOption?.("captions", "tracklist") || [];

    let matchingTrack = playerTracks.find(
      (t) =>
        (targetVss && (getTrackVssId(t) || "").toLowerCase() === targetVss) ||
        (targetLang && (getTrackLang(t) || "").toLowerCase() === targetLang),
    );

    const trackObj = matchingTrack || {
      languageCode: targetLang || "en",
      vss_id: targetVss || undefined,
    };

    console.log(
      "[Lyrical Extractor] Triggering player to load caption track:",
      trackObj,
    );

    if (typeof player.setOption === "function") {
      const activeTrack = player.getOption?.("captions", "track");
      const isActiveSame =
        activeTrack &&
        ((targetLang && (getTrackLang(activeTrack) || "").toLowerCase() === targetLang) ||
          (targetVss && (getTrackVssId(activeTrack) || "").toLowerCase() === targetVss));

      if (isActiveSame) {
        try {
          player.setOption("captions", "reload", true);
        } catch {}
        try {
          player.setOption("captions", "track", {});
          await new Promise((r) => setTimeout(r, 60));
          player.setOption("captions", "track", trackObj);
        } catch {}
      } else {
        player.setOption("captions", "track", trackObj);
      }
    }

    const lyrics = await interceptedPromise;
    // After extracting caption data, disable YouTube's native CC display
    disableNativeCaptions();
    if (lyrics && lyrics.length > 0) {
      return lyrics;
    }
  } catch (err) {
    console.debug("[Lyrical Extractor] Error requesting player caption track:", err);
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
    if (lastKnownPoToken && !u1.searchParams.has("pot")) {
      u1.searchParams.set("pot", lastKnownPoToken);
    }
    candidateUrls.push(u1.toString());
  } catch {}

  try {
    const u2 = new URL(rawTrackUrl);
    u2.searchParams.set("fmt", "srv3");
    if (lastKnownPoToken && !u2.searchParams.has("pot")) {
      u2.searchParams.set("pot", lastKnownPoToken);
    }
    candidateUrls.push(u2.toString());
  } catch {}

  try {
    // Try candidate with exp=xpe removed
    const u3 = new URL(rawTrackUrl);
    if (u3.searchParams.has("exp")) {
      u3.searchParams.delete("exp");
      u3.searchParams.set("fmt", "json3");
      if (track?.kind === "asr" && !u3.searchParams.has("kind")) {
        u3.searchParams.set("kind", "asr");
      }
      candidateUrls.push(u3.toString());
    }
  } catch {}

  if (!candidateUrls.includes(rawTrackUrl)) {
    candidateUrls.push(rawTrackUrl);
  }

  const maxAttempts = track?.kind === "asr" ? 3 : 2;
  const retryBaseDelayMs = track?.kind === "asr" ? 200 : 150;

  let hitBotBlock = false;
  for (const url of candidateUrls) {
    if (hitBotBlock) break;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await fetch(url, {
          credentials: "include",
        });
        if (!res.ok) {
          if (res.status === 429) {
            console.log(
              "[Lyrical Extractor] Timedtext returned 429 — falling back to player API",
            );
            hitBotBlock = true;
          }
          break;
        }

        const text = await res.text();

        // HARD GUARD: If response is HTML or Google bot-block page, stop direct fetch immediately
        if (isHtmlOrBlockPage(text)) {
          console.log(
            "[Lyrical Extractor] Timedtext returned HTML or bot-block page — falling back to player API",
          );
          hitBotBlock = true;
          break;
        }
        if (!text || !text.trim()) {
          // Empty body (e.g. 200 OK with 0 chars due to missing PO token)
          break; // Don't waste time repeating same URL if empty
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
        console.debug("[Lyrical Extractor] Fetch timedtext error:", err);
      }
      if (attempt < maxAttempts) {
        await new Promise((resolve) =>
          setTimeout(resolve, retryBaseDelayMs * attempt),
        );
      }
    }
  }

  // If direct fetch didn't yield captions (e.g. PO token required by server),
  // fallback to having the YouTube player itself fetch the track!
  console.log(
    "[Lyrical Extractor] Direct fetch yielded no captions, requesting via YouTube player...",
  );
  return await requestPlayerCaptionTrack(track);
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
  cachedTimedTextByVideo.clear();
  pendingTimedTextResolvers.clear();
  currentVideoDetails = null;
  currentTracks = null;
  currentSelectedTrack = null;

  try {
    window.postMessage(
      {
        type: "LYRICAL_CLEAR_CAPTIONS",
        videoId,
      },
      "*",
    );
  } catch {}
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
  const responseVideoId = response?.videoDetails?.videoId;
  if (responseVideoId && responseVideoId !== currentVideoId) {
    return false;
  }

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

  const player = document.getElementById("movie_player");
  if (isAdPlaying(player)) {
    console.log("[Lyrical Extractor] Ignored playerResponse payload: ad is playing");
    return false;
  }

  isProcessingPlayerResponse = true;
  try {
    console.log(
      "[Lyrical Extractor] Processing captions from",
      source,
      "tracks:",
      tracks.length,
    );

    currentVideoDetails = response?.videoDetails;
    currentTracks = tracks;
    currentSelectedTrack = selectedTrack;

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
      // After Lyrical has the data, turn off YouTube's native CC
      disableNativeCaptions();
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

function isAdPlaying(player) {
  if (!player) return false;
  try {
    // 1. Check if movie_player itself has ad-showing or ad-interrupting class
    const hasAdClass =
      player.classList?.contains("ad-showing") ||
      player.classList?.contains("ad-interrupting") ||
      document.querySelector(".ad-showing, .ad-interrupting") !== null;

    // 2. Check if the player's internal video-ads module has active child elements
    const adModule = player.querySelector(".video-ads.ytp-ad-module");
    const hasAdModuleChildren = Boolean(adModule && adModule.children.length > 0);

    // 3. Check for active video ad overlay elements inside the player
    const hasAdOverlay = Boolean(
      player.querySelector(
        ".ytp-ad-player-overlay, .ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-ad-preview-container, .ytp-ad-text",
      ),
    );

    // 4. Check player API for ad state
    const adState = typeof player.getAdState === "function" ? player.getAdState() : null;
    const isAdApi = adState !== null && adState !== 0 && adState !== -1;
    const isAdPlayingMethod = typeof player.isAdPlaying === "function" ? player.isAdPlaying() : false;

    if (hasAdClass || hasAdModuleChildren || hasAdOverlay || isAdApi || isAdPlayingMethod) {
      return true;
    }
  } catch {}
  return false;
}

function observeAdState(player) {
  if (!player || player.__lyricalAdObserverAttached) return;
  player.__lyricalAdObserverAttached = true;

  try {
    let wasAdShowing = isAdPlaying(player);
    if (wasAdShowing) {
      window.postMessage({ type: "LYRICAL_AD_STATE_CHANGED", isAd: true }, "*");
    }

    const observer = new MutationObserver(() => {
      const isNowAd = isAdPlaying(player);
      if (wasAdShowing !== isNowAd) {
        window.postMessage(
          { type: "LYRICAL_AD_STATE_CHANGED", isAd: isNowAd },
          "*",
        );
      }
      if (wasAdShowing && !isNowAd) {
        console.log(
          "[Lyrical Extractor] Ad finished — restarting extraction for main video",
        );
        extractionAttempts = 0;
        postedCaptionsForCurrentVideo = false;
        lastProcessedSignature = null;
        const currentVid = getVideoId();
        if (currentVid) {
          cachedTimedTextByVideo.delete(currentVid);
        }
        window.postMessage(
          { type: "LYRICAL_CLEAR_AD_CAPTIONS", videoId: currentVid },
          "*",
        );
        scheduleExtraction(300);
      }
      wasAdShowing = isNowAd;
    });

    observer.observe(player, {
      attributes: true,
      attributeFilter: ["class"],
      childList: true,
      subtree: true,
    });
  } catch {}
}

function attachPlayerListeners(player) {
  if (!player || player.__lyricalListenersAttached) return;

  player.__lyricalListenersAttached = true;
  observeAdState(player);

  try {
    player.addEventListener("onApiChange", () => {
      console.log(
        "[Lyrical Extractor] onApiChange fired — rechecking captions",
      );
      scheduleExtraction(300);
    });
  } catch {}

  try {
    player.addEventListener("onVideoDataChange", () => {
      console.log("[Lyrical Extractor] onVideoDataChange fired — video changed");
      onVideoChange();
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
      const currentVid = getVideoId();
      if (currentVid && currentVid !== currentTrackedVideoId) {
        console.log("[Lyrical Extractor] onStateChange detected video ID change:", currentVid);
        onVideoChange();
      } else if (e === 1 || e === 3) {
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
    observeAdState(player);

    if (isAdPlaying(player)) {
      console.log(
        "[Lyrical Extractor] Ad is playing — pausing extraction until ad finishes",
      );
      window.postMessage({ type: "LYRICAL_AD_STATE_CHANGED", isAd: true }, "*");
      scheduleExtraction(1500);
      return;
    }

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
    console.debug("[Lyrical Extractor] Error:", e);
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
        if (typeof url === "string" && url.includes("/api/timedtext")) {
          const clone = response.clone();
          clone
            .text()
            .then((text) => {
              if (text && text.trim().length > 0) {
                handleInterceptedTimedText(text, url);
              }
            })
            .catch(() => {});
        } else if (isPlayerResponseUrl(url)) {
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
    console.debug("[Lyrical Extractor] Failed to install fetch interceptor", e);
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
        if (typeof url === "string" && url.includes("/api/timedtext")) {
          this.addEventListener("load", () => {
            try {
              const text = this.responseText;
              if (text && text.trim().length > 0) {
                handleInterceptedTimedText(text, url);
              }
            } catch {}
          });
        } else if (isPlayerResponseUrl(url)) {
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
    console.debug("[Lyrical Extractor] Failed to install XHR interceptor", e);
  }
}

function onVideoChange() {
  const currentVideoId = getVideoId();
  if (currentVideoId && currentVideoId !== currentTrackedVideoId) {
    console.log("[Lyrical Extractor] New video:", currentVideoId);
    resetTrackingForVideo(currentVideoId);
    scheduleExtraction(500);
  }
}

// Listen for YouTube navigation and miniplayer events
document.addEventListener("yt-navigate-finish", onVideoChange);
document.addEventListener("yt-page-data-updated", onVideoChange);

// Observe miniplayer for in-place track switching
let miniplayerTrackingInstalled = false;
function setupMiniplayerTracking() {
  if (miniplayerTrackingInstalled) return;
  const mini = document.querySelector("ytd-miniplayer");
  if (mini) {
    miniplayerTrackingInstalled = true;
    const observer = new MutationObserver(() => {
      const currentVid = getVideoId();
      if (currentVid && currentVid !== currentTrackedVideoId) {
        console.log("[Lyrical Extractor] Miniplayer video change detected:", currentVid);
        onVideoChange();
      }
    });
    observer.observe(mini, { childList: true, subtree: true, attributes: true });
  }
}
setInterval(setupMiniplayerTracking, 1000);

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
      ) ||
      tracks[0];

    if (!match) {
      window.postMessage(
        { type: "LYRICAL_FETCH_TRACK_RESPONSE", requestId, success: false },
        "*",
      );
      return;
    }

    const lyrics = await fetchLyricsForTrack(match);
    // After fetching track data, disable YouTube's native CC to prevent it from switching
    disableNativeCaptions();
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
