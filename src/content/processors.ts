// ✅ Auto-process lyrics (Translation/Romanization)
async function autoProcessLyrics() {
  if (!fetchedLyrics || !fetchedLyrics.length) return;

  console.log("[Lyrical] Auto-processing lyrics...", {
    romanize: isRomanizationEnabled,
    translate: isTranslateEnabled,
    lang: currentTranslationLang,
  });

  // Base lyrics
  let finalLyrics = [...fetchedLyrics];
  let hasRomanization = false;
  let hasTranslation = false;

  // 1. Romanization
  if (isRomanizationEnabled) {
    if (globalThis.kuroshiro) {
      // Only if library exists (not implemented yet)
      console.log("Romanizing...");
    } else {
      // Try to use "Better Lyrics" or "Musixmatch" romanization if available in future
      // For now, no-op or placeholder
    }
  }

  // 2. Translation
  if (isTranslateEnabled) {
    if (translatedLyrics && translatedLyrics.lang === currentTranslationLang) {
      // Use cache
      finalLyrics = translatedLyrics.lyrics;
      hasTranslation = true;
    } else {
      // Fetch Translation
      try {
        const translated = await translateLyrics(
          fetchedLyrics,
          currentTranslationLang
        );
        if (translated) {
          translatedLyrics = {
            lang: currentTranslationLang,
            lyrics: translated,
          };
          finalLyrics = translated;
          hasTranslation = true;
        }
      } catch (e) {
        console.error("Translation failed", e);
      }
    }
  }

  // Update State
  // If both enabled, we might need triple mode, but for now just replacing
  // TODO: Support "Triple Line" mode (Original + Roman + Translate)

  updateLyrics(finalLyrics, currentIndex);
}

// ✅ Translate Lyrics via Google API
async function translateLyrics(lyrics, targetLang) {
  console.log(`[Lyrical] Translating to ${targetLang}...`);

  // Chunking to avoid URL limits key
  const CHUNK_SIZE = 50;
  const chunks = [];
  for (let i = 0; i < lyrics.length; i += CHUNK_SIZE) {
    chunks.push(lyrics.slice(i, i + CHUNK_SIZE));
  }

  let allTranslated = [];

  for (const chunk of chunks) {
    const text = chunk.map((l) => l.text).join("\n");
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(
      text
    )}`;

    const res = await fetch(url);
    const data = await res.json();

    // Parse result: data[0] is array of [translated, original]
    if (data && data[0]) {
      const lines = data[0].map((item) => item[0].trim());
      // Map back to time
      chunk.forEach((line, idx) => {
        allTranslated.push({
          time: line.time,
          text: lines[idx] || line.text, // Fallback
        });
      });
    }
  }

  // Since mapping line-by-line via newlines isn't 100% reliable with Google API (sometimes it merges lines),
  // A better approach is translating line by line or robust parsing.
  // For now, let's assume 1:1, but better to map result array length.

  // Re-mapping logic:
  // The API might return fewer lines if it merged sentences.
  // We will use the original timestamps and try to fit the text.

  // Simplified: Just use the original length
  const result = lyrics.map((l, i) => ({
    time: l.time,
    text: allTranslated[i] ? allTranslated[i].text : l.text, // Need verification logic here
  }));

  return result;
}
