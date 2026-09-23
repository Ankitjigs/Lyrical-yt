import {
  normalizeLineTextFromParts,
  normalizeLyricPartSpacing,
} from "../../utils/lyricSpacing";

const BOIDU_API_BASE = "https://lyrics-api.boidu.dev";
const INSTRUMENTAL_GAP_MS = 5000;

function getLocalName(node: any) {
  return (node?.localName || node?.nodeName || "").toLowerCase();
}

function findFirstElementByLocalName(root: any, localName: string): any {
  return Array.from(root.getElementsByTagName("*")).find((node) => getLocalName(node) === localName) || null;
}

function findElementsByLocalName(root: any, localName: string): any[] {
  return Array.from(root.getElementsByTagName("*")).filter((node) => getLocalName(node) === localName);
}

function getChildElementsByLocalName(root: any, localName: string): any[] {
  return Array.from(root.children || []).filter((node) => getLocalName(node) === localName);
}

function parseTimeToMs(timeStr) {
  if (!timeStr) return 0;
  if (typeof timeStr === "number") return Math.round(timeStr * 1000);

  const clean = String(timeStr).replace(/"/g, "").trim();
  const offsetTimeMatch = clean.match(/^([\d.]+)(h|m|s|ms)$/);

  if (offsetTimeMatch) {
    const value = parseFloat(offsetTimeMatch[1]);
    const unit = offsetTimeMatch[2];
    if (unit === "h") return Math.round(value * 3600 * 1000);
    if (unit === "m") return Math.round(value * 60 * 1000);
    if (unit === "s") return Math.round(value * 1000);
    return Math.round(value);
  }

  const parts = clean
    .split(":")
    .map((part) => part.replace(/[^0-9.]/g, ""))
    .filter(Boolean);

  if (parts.length === 1) return Math.round(parseFloat(parts[0]) * 1000);
  if (parts.length === 2) {
    return Math.round(parseInt(parts[0], 10) * 60 * 1000 + parseFloat(parts[1]) * 1000);
  }
  if (parts.length === 3) {
    return Math.round(
      parseInt(parts[0], 10) * 3600 * 1000 +
        parseInt(parts[1], 10) * 60 * 1000 +
        parseFloat(parts[2]) * 1000,
    );
  }

  return 0;
}

function normalizeAgentId(rawId, agentMapping) {
  if (!rawId) return undefined;
  return agentMapping.get(rawId) ?? rawId;
}

function extractAgentMapping(xmlDoc: any) {
  const mapping = new Map<string, string>();
  const metadataNodes = findElementsByLocalName(xmlDoc, "metadata");
  let voiceIndex = 0;

  metadataNodes.forEach((metadataNode) => {
    getChildElementsByLocalName(metadataNode, "agent").forEach((agentNode: any) => {
      const originalId = agentNode.getAttribute("xml:id") || agentNode.getAttribute("id");
      const type = agentNode.getAttribute("type");
      if (!originalId) return;

      if (type === "person" || type === "character") {
        voiceIndex += 1;
        mapping.set(originalId, `v${voiceIndex}`);
      } else {
        mapping.set(originalId, "v1000");
      }
    });
  });

  return mapping;
}

function getElementText(node: any) {
  return Array.from(node.childNodes)
    .filter((child: any) => child.nodeType === Node.TEXT_NODE)
    .map((child: any) => child.textContent || "")
    .join("");
}

function parseTextNodesAsParts(text, beginTimeMs, isBackground = false) {
  if (!text) return [];

  return [
    {
      startTimeMs: beginTimeMs,
      durationMs: 0,
      words: text,
      isBackground,
    },
  ];
}

function parseSpanNode(node: any, fallbackBeginTimeMs: number, isBackground = false): any[] {
  const ownStartTimeMs = parseTimeToMs(node.getAttribute("begin"));
  const ownEndTimeMs = parseTimeToMs(node.getAttribute("end"));
  const hasOwnTiming =
    node.hasAttribute("begin") ||
    node.hasAttribute("end");

  if (hasOwnTiming) {
    const text = node.textContent || "";
    if (!text) return [];

    const startTimeMs = ownStartTimeMs || fallbackBeginTimeMs;
    const endTimeMs =
      ownEndTimeMs && ownEndTimeMs >= startTimeMs
        ? ownEndTimeMs
        : startTimeMs;

    return [
      {
        startTimeMs,
        durationMs: Math.max(0, endTimeMs - startTimeMs),
        words: text,
        isBackground,
      },
    ];
  }

  const nestedTimedSpans = Array.from(node.children).filter((child) => child.tagName?.toLowerCase().endsWith("span"));
  if (nestedTimedSpans.length > 0) {
    return nestedTimedSpans.flatMap((child: any) => parseSpanNode(child, fallbackBeginTimeMs, isBackground));
  }

  const text = node.textContent || "";
  if (!text) return [];

  const startTimeMs = parseTimeToMs(node.getAttribute("begin")) || fallbackBeginTimeMs;
  const endTimeMs = parseTimeToMs(node.getAttribute("end"));

  return [
    {
      startTimeMs,
      durationMs: Math.max(0, endTimeMs - startTimeMs),
      words: text,
      isBackground,
    },
  ];
}

function parseParagraphElement(paragraph: any, beginTimeMs: number) {
  let text = "";
  let parts = [];
  let isWordSynced = false;

  Array.from(paragraph.childNodes).forEach((childNode: any) => {
    if (childNode.nodeType === Node.TEXT_NODE) {
      const rawText = childNode.textContent || "";
      if (rawText) {
        text += rawText;
        parts.push(...parseTextNodesAsParts(rawText, beginTimeMs, false));
      }
      return;
    }

    if (childNode.nodeType !== Node.ELEMENT_NODE) return;

    const element = childNode;
    const role = element.getAttribute("role");
    const isBackground = role === "x-bg";

    if (isBackground) {
      Array.from(element.childNodes).forEach((nestedNode) => {
        if (nestedNode.nodeType === Node.TEXT_NODE) {
          const rawText = nestedNode.textContent || "";
          if (!rawText) return;
          text += rawText;
          parts.push(...parseTextNodesAsParts(rawText, beginTimeMs, true));
          return;
        }

        if (nestedNode.nodeType !== Node.ELEMENT_NODE) return;

        const nestedElement = nestedNode;
        const nestedParts = parseSpanNode(nestedElement, beginTimeMs, true);
        if (nestedParts.some((part) => part.durationMs > 0)) {
          isWordSynced = true;
        }
        nestedParts.forEach((part) => {
          text += part.words;
          parts.push(part);
        });
      });
      return;
    }

    const elementParts = parseSpanNode(element, beginTimeMs, false);
    if (elementParts.some((part) => part.durationMs > 0)) {
      isWordSynced = true;
    }
    elementParts.forEach((part) => {
      text += part.words;
      parts.push(part);
    });
  });

  if (!isWordSynced) {
    parts = [];
  } else {
    parts = parts.filter((part) => {
      if ((part.durationMs || 0) > 0) return true;
      return !part.words || part.words.trim().length === 0;
    });
  }

  return {
    text,
    parts,
    isWordSynced,
  };
}

function parseTranslationMetadata(xmlDoc) {
  const translationsByLine = new Map();
  const translationContainers = findElementsByLocalName(xmlDoc, "translations");

  translationContainers.forEach((container) => {
    const lang = container.getAttribute("lang");
    getChildElementsByLocalName(container, "translation").forEach((translationNode) => {
      const lineKey = translationNode.getAttribute("for");
      const textNode = findFirstElementByLocalName(translationNode, "text");
      const text = textNode?.textContent || "";
      if (!lineKey || !lang || !text) return;
      translationsByLine.set(lineKey, { text, lang });
    });
  });

  return translationsByLine;
}

function parseTransliterationMetadata(xmlDoc) {
  const transliterationsByLine = new Map();
  const transliterationContainers = findElementsByLocalName(xmlDoc, "transliterations");

  transliterationContainers.forEach((container) => {
    const lang = container.getAttribute("lang");
    getChildElementsByLocalName(container, "transliteration").forEach((transliterationNode) => {
      const lineKey = transliterationNode.getAttribute("for");
      const textNodes = getChildElementsByLocalName(transliterationNode, "text");
      if (!lineKey || textNodes.length === 0) return;

      const parts = [];
      let fullText = "";
      textNodes.forEach((textNode) => {
        const parsed = parseParagraphElement(textNode, 0);
        if (parsed.text) fullText += parsed.text;
        if (parsed.parts.length > 0) parts.push(...parsed.parts);
      });

      transliterationsByLine.set(lineKey, {
        lang: lang || null,
        text: fullText || transliterationNode.textContent || "",
        parts,
      });
    });
  });

  return transliterationsByLine;
}

function insertInstrumentalBreaks(lines, songDurationMs) {
  if (!Array.isArray(lines) || lines.length === 0) return [];

  const result = [];

  const createInstrumental = (startTimeMs, durationMs) => ({
    time: startTimeMs / 1000,
    duration: durationMs / 1000,
    text: "",
    parts: [],
    isInstrumental: true,
  });

  if (lines[0].time * 1000 > INSTRUMENTAL_GAP_MS) {
    result.push(createInstrumental(0, lines[0].time * 1000));
  }

  for (let i = 0; i < lines.length; i += 1) {
    const current = lines[i];
    result.push(current);

    if (i < lines.length - 1) {
      const currentEndMs = Math.round((current.time + (current.duration || 0)) * 1000);
      const nextStartMs = Math.round(lines[i + 1].time * 1000);
      const gapMs = nextStartMs - currentEndMs;

      if (gapMs > INSTRUMENTAL_GAP_MS) {
        result.push(createInstrumental(currentEndMs, gapMs));
      }
    }
  }

  if (songDurationMs > 0) {
    const last = lines[lines.length - 1];
    const lastEndMs = Math.round((last.time + (last.duration || 0)) * 1000);
    const outroGapMs = songDurationMs - lastEndMs;

    if (outroGapMs > INSTRUMENTAL_GAP_MS) {
      result.push(createInstrumental(lastEndMs, outroGapMs));
    }
  }

  return result;
}

function normalizeTimedParts(lines) {
  if (!Array.isArray(lines) || lines.length === 0) return lines;

  for (const line of lines) {
    if (!Array.isArray(line.parts) || line.parts.length === 0) continue;

    for (let i = 1; i < line.parts.length; i += 1) {
      const thisPart = line.parts[i];
      const prevPart = line.parts[i - 1];

      if (
        thisPart?.text === " " &&
        prevPart?.text !== " "
      ) {
        const deltaTime = (thisPart.duration || 0) - (prevPart.duration || 0);
        if (Math.abs(deltaTime) <= 0.015 || (thisPart.duration || 0) <= 0.1) {
          const durationChange = thisPart.duration || 0;
          prevPart.duration = (prevPart.duration || 0) + durationChange;
          thisPart.duration = Math.max(0, (thisPart.duration || 0) - durationChange);
          thisPart.time = (thisPart.time || 0) + durationChange;
        }
      }
    }
  }

  let shortDurationCount = 0;
  let durationCount = 0;

  for (const line of lines) {
    if (!Array.isArray(line.parts) || line.parts.length === 0) continue;

    for (let i = 0; i < line.parts.length - 2; i += 1) {
      const part = line.parts[i];
      if (part?.text !== " ") {
        if ((part.duration || 0) <= 0.1) {
          shortDurationCount += 1;
        }
        durationCount += 1;
      }
    }
  }

  if (durationCount > 0 && shortDurationCount / durationCount > 0.5) {
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (!Array.isArray(line.parts) || line.parts.length === 0) continue;

      for (let j = 0; j < line.parts.length; j += 1) {
        const part = line.parts[j];
        if (!part || part.text === " ") continue;
        if ((part.duration || 0) > 0.4) continue;

        let nextPart = null;
        if (j + 1 < line.parts.length) {
          nextPart = line.parts[j + 1];
        } else if (
          i + 1 < lines.length &&
          Array.isArray(lines[i + 1].parts) &&
          lines[i + 1].parts.length > 0
        ) {
          nextPart = lines[i + 1].parts[0];
        }

        if (!nextPart) {
          part.duration = 0.3;
          continue;
        }

        if (nextPart.text === " ") {
          part.duration = (part.duration || 0) + (nextPart.duration || 0);
          nextPart.time = (nextPart.time || 0) + (nextPart.duration || 0);
          nextPart.duration = 0;
        } else {
          part.duration = Math.max(0, (nextPart.time || 0) - (part.time || 0));
        }
      }
    }
  }

  for (const line of lines) {
    if (Array.isArray(line.parts) && line.parts.length > 0) {
      line.text = normalizeLineTextFromParts(line.text, line.parts);
      line.parts = normalizeLyricPartSpacing(line.parts);
    }

    if (Array.isArray(line.timedRomanization) && line.timedRomanization.length > 0) {
      line.timedRomanization = normalizeLyricPartSpacing(line.timedRomanization);
    }
  }

  return lines;
}

export function parseTTML(ttmlString) {
  try {
    const xmlDoc = new DOMParser().parseFromString(ttmlString, "text/xml");
    if (xmlDoc.querySelector("parsererror")) {
      console.debug("[Boidu] TTML parser error");
      return null;
    }

    const ttNode = findFirstElementByLocalName(xmlDoc, "tt");
    const bodyNode = findFirstElementByLocalName(xmlDoc, "body");
    if (!ttNode || !bodyNode) return null;

    const agentMapping = extractAgentMapping(xmlDoc);
    const translationsByLine = parseTranslationMetadata(xmlDoc);
    const transliterationsByLine = parseTransliterationMetadata(xmlDoc);
    const lineKeyMap = new Map();
    const parsedLines = [];
    let hasWordSyncedLine = false;

    const lineNodes = findElementsByLocalName(bodyNode, "div");
    lineNodes.forEach((lineNode, lineIndex) => {
      const paragraphNodes = getChildElementsByLocalName(lineNode, "p");
      if (paragraphNodes.length === 0) return;

      paragraphNodes.forEach((paragraphNode, paragraphIndex) => {
        const key =
          paragraphNode.getAttribute("key") ||
          lineNode.getAttribute("key") ||
          `line_${lineIndex}_${paragraphIndex}`;
        const paragraphBegin = paragraphNode.getAttribute("begin");
        const paragraphEnd = paragraphNode.getAttribute("end");
        const beginTimeMs =
          paragraphBegin !== null
            ? parseTimeToMs(paragraphBegin)
            : parseTimeToMs(lineNode.getAttribute("begin"));
        let endTimeMs =
          paragraphEnd !== null
            ? parseTimeToMs(paragraphEnd)
            : parseTimeToMs(lineNode.getAttribute("end"));
        const parsed = parseParagraphElement(paragraphNode, beginTimeMs);

        if (endTimeMs <= beginTimeMs && parsed.parts.length > 0) {
          const lastPartEndMs = Math.max(
            ...parsed.parts.map(
              (part) => (part.startTimeMs || 0) + (part.durationMs || 0),
            ),
          );
          if (lastPartEndMs > beginTimeMs) {
            endTimeMs = lastPartEndMs;
          }
        }

        const text = parsed.text.trim();
        if (!text && parsed.parts.length === 0) return;

        const lineIsWordSynced = parsed.parts.length > 0;

        hasWordSyncedLine = hasWordSyncedLine || lineIsWordSynced;

        const duplicateCount = lineKeyMap.get(key) || 0;
        lineKeyMap.set(key, duplicateCount + 1);
        const normalizedKey = `${key}_${duplicateCount + 1}`;

        const translation = translationsByLine.get(key) || null;
        const transliteration = transliterationsByLine.get(key) || null;

        parsedLines.push({
          key: normalizedKey,
          sourceKey: key,
          time: beginTimeMs / 1000,
          duration: Math.max(0, endTimeMs - beginTimeMs) / 1000,
          text,
          parts: lineIsWordSynced
            ? parsed.parts.map((part) => ({
                time: part.startTimeMs / 1000,
                duration: part.durationMs / 1000,
                text: part.words,
                isBackground: part.isBackground || false,
              }))
            : [],
          agent: normalizeAgentId(
            paragraphNode.getAttribute("agent") || lineNode.getAttribute("agent"),
            agentMapping,
          ),
          translation: translation?.text || undefined,
          translationLang: translation?.lang || undefined,
          romanization: transliteration?.text || undefined,
          timedRomanization:
            transliteration?.parts?.map((part) => ({
              time: part.startTimeMs / 1000,
              duration: part.durationMs / 1000,
              text: part.words,
            })) || undefined,
        });
      });
    });

    if (parsedLines.length === 0) return null;

    normalizeTimedParts(parsedLines);

    const songDurationMs =
      parseTimeToMs(ttNode.getAttribute("dur")) || parseTimeToMs(bodyNode.getAttribute("dur"));
    const lyrics = insertInstrumentalBreaks(parsedLines, songDurationMs);

    return {
      source: "lyrical-boidu",
      type: hasWordSyncedLine ? "syllable" : "line",
      language: ttNode.getAttribute("lang") || bodyNode.getAttribute("lang") || null,
      lyrics,
    };
  } catch (error) {
    console.error("[Boidu] TTML Parse Error", error);
    return null;
  }
}

function parseSegmentArray(segments) {
  const lyrics = [];
  const parser = new DOMParser();

  segments.forEach((segment) => {
    const rawText = segment.text || "";
    if (!rawText) return;

    const doc = parser.parseFromString(`<div>${rawText}</div>`, "text/html");
    const spans = doc.querySelectorAll("span");
    const parts = [];
    let lineStartTime = null;

    spans.forEach((span) => {
      const begin = parseTimeToMs(span.getAttribute("begin"));
      const end = parseTimeToMs(span.getAttribute("end"));
      const text = span.textContent || "";

      if (begin >= 0 && end >= begin && text) {
        if (lineStartTime === null) lineStartTime = begin;

        parts.push({
          time: begin / 1000,
          duration: Math.max(0, end - begin) / 1000,
          text,
        });
      }
    });

    if (parts.length > 0) {
      lyrics.push({
        time: (lineStartTime || 0) / 1000,
        duration: parts.reduce((sum, part) => sum + (part.duration || 0), 0),
        text: normalizeLineTextFromParts(
          parts.map((part) => part.text).join("").trim(),
          parts,
        ),
        parts: normalizeLyricPartSpacing(parts),
      });
    }
  });

  if (lyrics.length === 0) return null;

  return {
    source: "lyrical-boidu",
    type: "syllable",
    lyrics,
  };
}

export function parseBoiduResponse(data) {
  if (!data) return null;
  if (data.ttml) return parseTTML(data.ttml);
  if (Array.isArray(data)) return parseSegmentArray(data);
  if (Array.isArray(data.lyrics)) return parseSegmentArray(data.lyrics);
  return null;
}

export async function fetchBoiduLyrics(songInfo, apiKey = null): Promise<any> {
  if (!songInfo?.artist || !songInfo?.title) return null;

  const url = new URL(`${BOIDU_API_BASE}/getLyrics`);
  url.searchParams.set("a", songInfo.artist);
  url.searchParams.set("s", songInfo.title);

  if (songInfo.duration) {
    url.searchParams.set("d", String(Math.round(songInfo.duration)));
  }

  if (songInfo.album) {
    url.searchParams.set("al", songInfo.album);
  }

  const headers = {};
  if (apiKey?.trim()) {
    headers["X-API-Key"] = apiKey.trim();
  }

  try {
    const timeoutPromise = new Promise<{ success: false; error: string }>((resolve) =>
      setTimeout(() => resolve({ success: false, error: "timeout" }), 4000),
    );

    const messagePromise = chrome.runtime.sendMessage({
      type: "FETCH_BOIDU",
      url: url.toString(),
      headers,
    });

    const response: any = await Promise.race([messagePromise, timeoutPromise]);

    if (!response?.success) {
      if (response?.status !== 401 && response?.status !== 403 && response?.status !== 404) {
        console.debug("[Boidu] Proxy API Error Status:", response?.status || "Unknown");
      }
      return null;
    }

    return parseBoiduResponse(response.data);
  } catch (error: any) {
    console.debug("[Boidu] Fetch failed:", error?.message || error);
    return null;
  }
}
