import YouTubeTranscriptApi from "youtube-captions-api";
const youtubeCaptionApi = new YouTubeTranscriptApi();

// Background service worker
// Handles Google Translate API requests for lyrics translation

chrome.runtime.onInstalled.addListener(() => {
  console.log("Lyrical Extension Installed");
});

// Translation cache to avoid repeated API calls
const translationCache = new Map();
const romanizationCache = new Map();
const TRANSLATE_TIMEOUT_MS = 12000;

async function fetchJsonWithTimeout(
  url,
  options = {},
  timeoutMs = TRANSLATE_TIMEOUT_MS,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

// Message handler for translation requests
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "TRANSLATE_LINE") {
    translateLine(request.text, request.targetLang)
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true; // Keep channel open for async response
  }

  if (request.type === "ROMANIZE_LINE") {
    romanizeLine(request.text, request.sourceLang)
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (request.type === "TRANSLATE_LYRICS") {
    translateLyrics(request.lyrics, request.targetLang)
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (request.type === "ROMANIZE_LYRICS") {
    romanizeLyrics(request.lyrics, request.sourceLang)
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  // --- Cubey Proxy Handlers ---
  if (request.type === "CUBEY_VERIFY_TURNSTILE") {
    handleCubeyVerify(request.token)
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (request.type === "CUBEY_FETCH_LYRICS") {
    handleCubeyFetch(request.url, request.jwt)
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (request.type === "CUBEY_FETCH_UNIFIED_LYRICS") {
    handleCubeyUnifiedFetch(request.songInfo, request.jwt)
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (request.type === "FETCH_UNISON_LYRICS") {
    fetchUnisonLyrics(request.songInfo)
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  // --- Boidu Proxy Handler ---
  // Fixes CORS issues by fetching from Background context
  if (request.type === "FETCH_BOIDU") {
    fetchBoidu(request.url, request.headers)
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  // --- YouTube Captions Proxy Handler (LEGACY/FALLBACK) ---
  if (request.type === "FETCH_CAPTIONS") {
    fetchCaptions(request.url).catch((err) =>
      sendResponse({ error: err.message }),
    );
    return true;
  }

  // --- NEW: YouTube Caption Extractor Library Handler ---
  if (request.type === "FETCH_YOUTUBE_SUBTITLES") {
    console.log(
      "[Lyrical BG] Handling FETCH_YOUTUBE_SUBTITLES for",
      request.videoId,
    );
    youtubeCaptionApi
      .fetch(request.videoId, { languages: [request.lang || "en"] })
      .then((transcript) => {
        console.log(
          "[Lyrical BG] Library returned subtitles:",
          transcript?.snippets?.length,
        );
        sendResponse({ success: true, data: transcript.snippets });
      })
      .catch((err) => {
        const message = err?.message || String(err);
        const isExpected403 =
          message.includes("Player API failed: 403") ||
          message.includes("failed: 403") ||
          message.includes("403");
        if (isExpected403) {
          console.warn(
            "[Lyrical BG] Library fallback blocked (403), relying on direct caption track fetch",
          );
          sendResponse({ success: false, error: message, status: 403 });
          return;
        }

        console.error("[Lyrical BG] Library error:", err);
        sendResponse({ success: false, error: message });
      });
    return true;
  }
});

async function handleCubeyVerify(token) {
  const res = await fetch(
    "https://lyrics.api.dacubeking.com/verify-turnstile",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      credentials: "include",
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Verification failed: ${res.status} ${text}`);
  }
  return await res.json();
}

async function handleCubeyFetch(url, jwt) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${jwt}` },
    credentials: "include",
  });
  // Handle 403 specially? simpler to pass status back?
  // Let's passed parsed JSON or error
  if (res.status === 403) {
    return { status: 403 }; // Signal to refresh
  }
  if (!res.ok) {
    throw new Error(`API Error: ${res.status}`);
  }
  const data = await res.json();
  return { status: 200, data };
}

function findIsrc(value, visited = new Set(), depth = 0) {
  if (value == null || depth > 6 || visited.has(value)) return null;
  if (typeof value === "string") {
    const candidate = value.trim().toUpperCase();
    return /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(candidate) ? candidate : null;
  }
  if (typeof value !== "object") return null;

  visited.add(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findIsrc(item, visited, depth + 1);
      if (found) return found;
    }
    return null;
  }

  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string" && key.toLowerCase().includes("isrc")) {
      const found = findIsrc(item, visited, depth + 1);
      if (found) return found;
    }
  }

  for (const item of Object.values(value)) {
    const found = findIsrc(item, visited, depth + 1);
    if (found) return found;
  }

  return null;
}

async function handleCubeyUnifiedFetch(songInfo, jwt) {
  const body = new URLSearchParams();
  body.append("videoId", songInfo?.videoId || "");
  body.append("song", songInfo?.title || "");
  body.append("artist", songInfo?.artist || "");
  body.append("duration", String(Math.round(Number(songInfo?.duration || 0))));
  body.append("alwaysFetchMetadata", "false");
  body.append("token", jwt);

  if (songInfo?.album) body.append("album", songInfo.album);

  const isrc = findIsrc(songInfo);
  if (isrc) body.append("isrc", isrc);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await fetch("https://lyrics.api.dacubeking.com/v2/lyrics", {
      method: "POST",
      body,
      signal: controller.signal,
    });

    if (res.status === 403) return { status: 403 };
    if (res.status === 404) return { status: 404 };
    if (!res.ok) return { status: res.status };

    const reader = res.body?.getReader();
    if (!reader) return { status: 200, data: { providers: {} } };

    const decoder = new TextDecoder();
    let buffer = "";
    const data = { providers: {}, metadata: null };

    const parseMessage = (message) => {
      let event = "";
      let dataText = "";

      for (const line of message.split(/\r?\n/)) {
        if (line.startsWith("event:")) {
          event = line.slice(line.indexOf(":") + 1).trim();
        } else if (line.startsWith("data:")) {
          dataText += line.slice(line.indexOf(":") + 1).trim();
        }
      }

      if (!dataText || dataText === "[DONE]") return;

      try {
        const parsed = JSON.parse(dataText);
        if (event === "metadata") {
          data.metadata = parsed;
        } else if (event === "provider" && parsed?.provider) {
          data.providers[parsed.provider] = parsed.results || {};
        }
      } catch (err) {
        console.warn("[Lyrical BG] Unified stream parse warning:", err.message);
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (value) {
        buffer += decoder.decode(value, { stream: true });
        const messages = buffer.split(/\n\n|\r\n\r\n/);
        buffer = messages.pop() || "";
        messages.forEach(parseMessage);
      }
      if (done) {
        if (buffer.trim()) parseMessage(buffer);
        break;
      }
    }

    return { status: 200, data };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchUnisonLyrics(songInfo) {
  const url = new URL("https://unison.boidu.dev/lyrics");
  url.searchParams.set("v", songInfo?.videoId || "");
  url.searchParams.set("song", songInfo?.title || "");
  url.searchParams.set("artist", songInfo?.artist || "");
  url.searchParams.set(
    "duration",
    String(Math.round(Number(songInfo?.duration || 0))),
  );
  if (songInfo?.album) url.searchParams.set("album", songInfo.album);

  const res = await fetchJsonWithTimeout(url.toString(), {}, 10000);
  if (!res.ok) return { success: false, status: res.status };

  const json = await res.json();
  return { success: true, status: 200, data: json?.data || null };
}

async function fetchBoidu(url, headers) {
  console.log("[Lyrical BG] Proxying Boidu fetch:", url);
  try {
    const res = await fetchJsonWithTimeout(url, { headers }, 3500);

    // Pass status code back to handle 401/403/404 explicitly in content script
    if (!res.ok) {
      return { success: false, status: res.status };
    }

    const data = await res.json();
    return { success: true, status: 200, data };
  } catch (err) {
    console.warn(
      "[Lyrical BG] Boidu fetch timed out or failed:",
      err?.message || err,
    );
    return { success: false, status: 408, error: err?.message || "timeout" };
  }
}

/**
 * Fetch YouTube captions XML from timedtext API
 * This runs in the background script to bypass CORS restrictions
 */
async function fetchCaptions(trackUrl) {
  try {
    // Use URL as-is first, YouTube's caption URLs usually work directly
    console.log("[Lyrical BG] Fetching captions from:", trackUrl);

    // Include credentials to send YouTube cookies
    const res = await fetch(trackUrl, {
      credentials: "include",
    });

    console.log("[Lyrical BG] Response status:", res.status);

    if (!res.ok) {
      throw new Error(`Caption fetch failed: ${res.status}`);
    }

    const text = await res.text();
    console.log("[Lyrical BG] Caption response length:", text.length);
    console.log(
      "[Lyrical BG] Caption response preview:",
      text.substring(0, 200),
    );

    return { success: true, data: text };
  } catch (err) {
    console.error("[Lyrical BG] Caption fetch error:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Google Translate API URL for translation
 */
function getTranslateUrl(targetLang, text) {
  return `https://translate.googleapis.com/translate_a/single?client=dict-chrome-ex&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(
    text,
  )}`;
}

/**
 * Google Translate API URL for romanization
 */
function getRomanizeUrl(sourceLang, text) {
  const lang = !sourceLang || sourceLang === "auto" ? "auto" : sourceLang;
  const target = lang === "auto" ? "en" : `${lang}-Latn`;
  return `https://translate.googleapis.com/translate_a/single?client=dict-chrome-ex&sl=${lang}&tl=${target}&dt=t&dt=rm&q=${encodeURIComponent(text)}`;
}

/**
 * Translate a block of multiple lines in a single HTTP request using newline separators
 */
async function translateBlock(lines, targetLang) {
  if (!lines || lines.length === 0) return [];
  const joinedText = lines.join("\n");

  try {
    const url = getTranslateUrl(targetLang, joinedText);
    const response = await fetchJsonWithTimeout(url, { cache: "force-cache" });

    if (!response.ok) {
      console.warn(`[Lyrical BG] translateBlock status=${response.status}`);
      return null;
    }

    const data = await response.json();
    let fullTranslated = "";
    if (data[0]) {
      data[0].forEach((part) => {
        if (part[0]) fullTranslated += part[0];
      });
    }

    const detectedLang = data[2] || "auto";
    const translatedParts = fullTranslated.split("\n").map((s) => s.trim());

    if (translatedParts.length === lines.length) {
      return lines.map((original, i) => {
        const tr = translatedParts[i] || "";
        const isSame = original.trim().toLowerCase() === tr.toLowerCase();
        const res = {
          translated: isSame ? "" : tr,
          original,
          detectedLang,
          skipped: isSame,
          sameLanguage: detectedLang === targetLang,
        };
        translationCache.set(`${targetLang}_${original}`, res);
        return res;
      });
    }
  } catch (err) {
    console.warn("[Lyrical BG] translateBlock error:", err.message);
  }
  return null;
}

/**
 * Translate a single line of text
 */
async function translateLine(text, targetLang) {
  if (!text?.trim()) return { translated: "", original: text };

  const cacheKey = `${targetLang}_${text}`;
  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey);
  }

  try {
    const url = getTranslateUrl(targetLang, text);
    console.log(`[Lyrical BG] translateLine: "${text.substring(0, 40)}" -> ${targetLang}`);
    const response = await fetchJsonWithTimeout(url, { cache: "force-cache" });

    if (!response.ok) {
      console.warn(`[Lyrical BG] translateLine FAILED: status=${response.status}`);
      throw new Error(`Translation failed: ${response.status}`);
    }

    const data = await response.json();
    console.log(`[Lyrical BG] translateLine RAW:`, JSON.stringify(data).substring(0, 300));

    // Extract translated text from response
    let translatedText = "";
    if (data[0]) {
      data[0].forEach((part) => {
        if (part[0]) translatedText += part[0];
      });
    }

    // Get detected source language
    const detectedLang = data[2] || "auto";

    // Check if translation is same as original (e.g., English to English)
    const isSameAsOriginal =
      text.trim().toLowerCase() === translatedText.trim().toLowerCase();

    // IMPORTANT: Still return the translated text even if same - let the UI decide to display or not
    // This fixes the issue where English lyrics wouldn't show translation when target is non-English
    // but detected language happens to return same text (e.g., proper nouns, short phrases)
    const result = {
      translated: isSameAsOriginal ? "" : translatedText,
      original: text,
      detectedLang: detectedLang,
      skipped: isSameAsOriginal,
      // If source language is detected as target language, mark as same-language
      sameLanguage: detectedLang === targetLang,
    };

    console.log(`[Lyrical BG] translateLine RESULT: translated="${result.translated?.substring(0, 40)}", detected=${detectedLang}, skipped=${isSameAsOriginal}`);
    translationCache.set(cacheKey, result);
    return result;
  } catch (err) {
    console.warn("[Lyrical BG] Translation warning:", err.message);
    throw err;
  }
}

/**
 * Romanize a block of multiple lines in a single HTTP request using newline separators
 */
async function romanizeBlock(lines, sourceLang) {
  if (!lines || lines.length === 0) return [];
  const joinedText = lines.join("\n");

  try {
    const url = getRomanizeUrl(sourceLang, joinedText);
    const response = await fetchJsonWithTimeout(url, { cache: "force-cache" });

    if (!response.ok) {
      console.warn(`[Lyrical BG] romanizeBlock status=${response.status}`);
      return null;
    }

    const data = await response.json();
    let fullRomanized = "";

    if (Array.isArray(data[0])) {
      const lastItem = data[0][data[0].length - 1];
      if (
        Array.isArray(lastItem) &&
        (lastItem[0] === null || lastItem[0] === undefined) &&
        typeof lastItem[2] === "string" &&
        lastItem[2].trim()
      ) {
        fullRomanized = lastItem[2].trim();
      } else if (
        Array.isArray(lastItem) &&
        (lastItem[0] === null || lastItem[0] === undefined) &&
        typeof lastItem[3] === "string" &&
        lastItem[3].trim()
      ) {
        fullRomanized = lastItem[3].trim();
      }

      if (!fullRomanized) {
        const parts = [];
        for (const seg of data[0]) {
          if (!Array.isArray(seg)) continue;
          if (typeof seg[3] === "string" && seg[3].trim()) {
            parts.push(seg[3].trim());
          } else if (
            typeof seg[2] === "string" &&
            seg[2].trim() &&
            seg[2] !== seg[1] &&
            seg[2] !== seg[0]
          ) {
            parts.push(seg[2].trim());
          }
        }
        if (parts.length > 0) fullRomanized = parts.join(" ");
      }
    }

    if (!fullRomanized && data[0] && data[0][1]) {
      fullRomanized = data[0][1][3] || data[0][1][2] || "";
    }
    if (!fullRomanized && data[0] && data[0][0]) {
      fullRomanized = data[0][0][3] || data[0][0][2] || "";
    }

    const romanizedParts = fullRomanized.split("\n").map((s) => s.trim());

    if (romanizedParts.length === lines.length) {
      return lines.map((original, i) => {
        const rom = romanizedParts[i] || "";
        const isSame = original.trim().toLowerCase() === rom.toLowerCase();
        const res = {
          romanized: isSame ? "" : rom,
          original,
          skipped: isSame,
        };
        romanizationCache.set(`rom_${sourceLang}_${original}`, res);
        return res;
      });
    }
  } catch (err) {
    console.warn("[Lyrical BG] romanizeBlock error:", err.message);
  }
  return null;
}

/**
 * Romanize a single line of text (convert to Latin alphabet)
 */
async function romanizeLine(text, sourceLang) {
  if (!text?.trim()) return { romanized: "", original: text };

  // Fast-path: Check if the text consists entirely of Latin script, punctuation, numbers, and symbols.
  // If so, it doesn't need romanization (e.g. English, Spanish), bypassing the API call entirely.
  const isOnlyLatin = /^[\p{Script=Latin}\p{P}\p{Z}\p{N}\p{S}\p{M}]+$/u.test(
    text.trim(),
  );
  if (isOnlyLatin || sourceLang === "en") {
    return { romanized: "", original: text, skipped: true };
  }

  const cacheKey = `rom_${sourceLang}_${text}`;
  if (romanizationCache.has(cacheKey)) {
    return romanizationCache.get(cacheKey);
  }

  try {
    const url = getRomanizeUrl(sourceLang, text);
    console.log(`[Lyrical BG] romanizeLine: "${text.substring(0, 40)}" lang=${sourceLang}, URL: ${url.substring(0, 120)}`);
    const response = await fetchJsonWithTimeout(url, { cache: "force-cache" });

    if (!response.ok) {
      console.warn(`[Lyrical BG] romanizeLine FAILED: status=${response.status}`);
      throw new Error(`Romanization failed: ${response.status}`);
    }

    const data = await response.json();
    console.log(`[Lyrical BG] romanizeLine RAW:`, JSON.stringify(data).substring(0, 500));

    // Extract romanized text from response
    // The romanization is in data[0][1][3] or data[0][1][2]
    let romanizedText = "";
    if (data[0] && data[0][1]) {
      romanizedText = data[0][1][3] || data[0][1][2] || "";
    }

    // Fallback: try to get from first part
    if (!romanizedText && data[0] && data[0][0]) {
      romanizedText = data[0][0][0] || "";
    }

    console.log(`[Lyrical BG] romanizeLine EXTRACTED: "${romanizedText?.substring(0, 60)}"`);

    // Skip if romanization is same as original
    if (text.trim().toLowerCase() === romanizedText.trim().toLowerCase()) {
      console.log(`[Lyrical BG] romanizeLine SKIPPED: same as original`);
      return { romanized: "", original: text, skipped: true };
    }

    const result = {
      romanized: romanizedText,
      original: text,
    };

    console.log(`[Lyrical BG] romanizeLine RESULT: "${romanizedText?.substring(0, 60)}"`);
    romanizationCache.set(cacheKey, result);
    return result;
  } catch (err) {
    // Use warn instead of error to prevent triggering the "Errors" badge in Chrome extensions panel
    console.warn("[Lyrical BG] Romanization warning:", err.message);
    throw err;
  }
}

/**
 * Translate all lyrics lines (batch operation)
 */
async function translateLyrics(lyrics, targetLang) {
  console.log(
    "[Lyrical BG] Translating",
    lyrics.length,
    "lines to",
    targetLang,
  );

  const uniqueTexts: string[] = Array.from(
    new Set<string>(
      lyrics
        .map((l: any) => String(l.text || "").trim())
        .filter(Boolean),
    ),
  );
  const translatedLookup = new Map();

  // Check cache first
  const uncachedTexts: string[] = [];
  for (const text of uniqueTexts) {
    const cacheKey = `${targetLang}_${text}`;
    if (translationCache.has(cacheKey)) {
      translatedLookup.set(text, translationCache.get(cacheKey));
    } else {
      uncachedTexts.push(text);
    }
  }

  // Chunk uncached lines into blocks of 20 (reduces 100 HTTP requests down to 5!)
  const blockSize = 20;
  for (let i = 0; i < uncachedTexts.length; i += blockSize) {
    const block = uncachedTexts.slice(i, i + blockSize);
    const blockResults = await translateBlock(block, targetLang);

    if (blockResults && blockResults.length === block.length) {
      block.forEach((text, idx) => {
        translatedLookup.set(text, blockResults[idx]);
      });
    } else {
      // Fallback: Translate individually with gentle pacing (120ms delay)
      for (const text of block) {
        try {
          const res = await translateLine(text, targetLang);
          translatedLookup.set(text, res);
        } catch {
          translatedLookup.set(text, {
            text,
            translated: "",
            skipped: false,
            error: true,
          });
        }
        await new Promise((r) => setTimeout(r, 120));
      }
    }

    if (i + blockSize < uncachedTexts.length) {
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  const results = lyrics.map((lyric) => {
    const key = String(lyric.text || "").trim();
    const translated = translatedLookup.get(key) || {};
    return {
      time: lyric.time,
      text: lyric.text,
      translated: translated.translated || "",
      skipped: translated.skipped || false,
      error: translated.error || false,
    };
  });

  console.log("[Lyrical BG] Translation complete");
  return results;
}

/**
 * Romanize all lyrics lines (batch operation)
 */
async function romanizeLyrics(lyrics, sourceLang) {
  console.log("[Lyrical BG] Romanizing", lyrics.length, "lines from", sourceLang);

  const uniqueTexts: string[] = Array.from(
    new Set<string>(
      lyrics
        .map((l: any) => String(l.text || "").trim())
        .filter(Boolean),
    ),
  );
  const romanizedLookup = new Map();

  // Check cache and Latin fast-path first
  const uncachedTexts: string[] = [];
  for (const text of uniqueTexts) {
    const isOnlyLatin = /^[\p{Script=Latin}\p{P}\p{Z}\p{N}\p{S}\p{M}]+$/u.test(
      text.trim(),
    );
    if (isOnlyLatin || sourceLang === "en") {
      romanizedLookup.set(text, { romanized: "", original: text, skipped: true });
      continue;
    }

    const cacheKey = `rom_${sourceLang}_${text}`;
    if (romanizationCache.has(cacheKey)) {
      romanizedLookup.set(text, romanizationCache.get(cacheKey));
    } else {
      uncachedTexts.push(text);
    }
  }

  // Chunk uncached lines into blocks of 20 (reduces 100 HTTP requests down to 5!)
  const blockSize = 20;
  for (let i = 0; i < uncachedTexts.length; i += blockSize) {
    const block = uncachedTexts.slice(i, i + blockSize);
    const blockResults = await romanizeBlock(block, sourceLang);

    if (blockResults && blockResults.length === block.length) {
      block.forEach((text, idx) => {
        romanizedLookup.set(text, blockResults[idx]);
      });
    } else {
      // Fallback: Romanize individually with gentle pacing (120ms delay)
      for (const text of block) {
        try {
          const res = await romanizeLine(text, sourceLang);
          romanizedLookup.set(text, res);
        } catch {
          romanizedLookup.set(text, {
            text,
            romanized: "",
            skipped: false,
            error: true,
          });
        }
        await new Promise((r) => setTimeout(r, 120));
      }
    }

    if (i + blockSize < uncachedTexts.length) {
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  const results = lyrics.map((lyric) => {
    const key = String(lyric.text || "").trim();
    const romanized = romanizedLookup.get(key) || {};
    return {
      time: lyric.time,
      text: lyric.text,
      romanized: romanized.romanized || "",
      skipped: romanized.skipped || false,
      error: romanized.error || false,
    };
  });

  console.log("[Lyrical BG] Romanization complete");
  return results;
}
