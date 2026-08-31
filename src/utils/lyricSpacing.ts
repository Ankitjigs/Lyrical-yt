type TextPart = Record<string, any>;

const NO_SPACE_SCRIPT_RE =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;
const WORD_END_RE = /[\p{L}\p{N}]$/u;
const WORD_START_RE = /^[\p{L}\p{N}]/u;
const CLOSING_PUNCTUATION_RE = /^[,.;:!?%)}\]>"'\u201d\u2019\u3001\u3002\uff01\uff1f]/u;
const SPACE_AFTER_PUNCTUATION_RE = /[,.;:!?)}\]\u201d\u2019]$/u;
const OPENING_PUNCTUATION_RE = /[(\[{<"\u201c\u2018]$/u;

function hasInnerWhitespace(text: string) {
  return /\S\s+\S/.test(text);
}

function getTextValue(part: TextPart, key: string) {
  return String(part?.[key] ?? "");
}

export function shouldInsertLyricSpace(left: string, right: string) {
  if (!left || !right) return false;
  if (/\s$/.test(left) || /^\s/.test(right)) return false;

  const trimmedLeft = left.trimEnd();
  const trimmedRight = right.trimStart();
  if (!trimmedLeft || !trimmedRight) return false;

  if (NO_SPACE_SCRIPT_RE.test(trimmedLeft) || NO_SPACE_SCRIPT_RE.test(trimmedRight)) {
    return false;
  }
  if (CLOSING_PUNCTUATION_RE.test(trimmedRight)) return false;
  if (OPENING_PUNCTUATION_RE.test(trimmedLeft)) return false;

  if (SPACE_AFTER_PUNCTUATION_RE.test(trimmedLeft) && WORD_START_RE.test(trimmedRight)) {
    return true;
  }

  return WORD_END_RE.test(trimmedLeft) && WORD_START_RE.test(trimmedRight);
}

export function joinLyricTokens(tokens: Array<string | null | undefined>) {
  let text = "";

  tokens.forEach((token, index) => {
    const value = String(token ?? "");
    text += value;

    const next = tokens[index + 1];
    if (shouldInsertLyricSpace(value, String(next ?? ""))) {
      text += " ";
    }
  });

  return text;
}

export function normalizeLyricPartSpacing<T extends TextPart>(
  parts: T[] | null | undefined,
  textKey = "text",
): T[] {
  if (!Array.isArray(parts) || parts.length === 0) return [];

  let changed = false;
  const normalized = parts.map((part, index) => {
    const current = getTextValue(part, textKey);
    const next = getTextValue(parts[index + 1], textKey);

    if (!shouldInsertLyricSpace(current, next)) {
      return part;
    }

    changed = true;
    return {
      ...part,
      [textKey]: `${current} `,
    };
  });

  return changed ? normalized : parts;
}

export function normalizeLineTextFromParts(
  text: string | null | undefined,
  parts: TextPart[] | null | undefined,
  textKey = "text",
) {
  const original = String(text ?? "");
  if (!Array.isArray(parts) || parts.length === 0) return original;

  const joined = joinLyricTokens(parts.map((part) => getTextValue(part, textKey))).trim();
  if (!joined) return original;

  if (!original.trim()) return joined;
  if (!hasInnerWhitespace(original) && hasInnerWhitespace(joined)) return joined;

  return original;
}
