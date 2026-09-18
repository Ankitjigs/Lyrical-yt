/**
 * Lyrics Normalizer & Metadata Stripper
 *
 * Implements clean, maintainable lyrics preprocessing modeled after Better Lyrics:
 * 1. Filters non-sung credit/metadata headers (e.g. "原唱 : ...", "作词 : ...", "Written by: ...").
 * 2. Automatically inserts instrumental breaks for intros and long instrumental solos (> 5.0s).
 * 3. Prepares lyrics so the animated musical note / instrumental soundwave triggers accurately.
 */

const KNOWN_METADATA_PREFIXES = new Set([
  // Chinese / Japanese Kanji variants
  "词",
  "詞",
  "作词",
  "作詞",
  "曲",
  "作曲",
  "编曲",
  "編曲",
  "演奏",
  "演奏者",
  "和声",
  "和音",
  "コーラス",
  "混音",
  "ミックス",
  "ミキシング",
  "母带",
  "母帶",
  "マスタリング",
  "吉他",
  "ギター",
  "贝斯",
  "貝斯",
  "ベース",
  "鼓",
  "ドラム",
  "键盘",
  "鍵盤",
  "キーボード",
  "钢琴",
  "鋼琴",
  "ピアノ",
  "制作人",
  "製作人",
  "制作",
  "製作",
  "プロデューサー",
  "プロデュース",
  "演唱",
  "歌",
  "唄",
  "ボーカル",
  "原唱",
  "翻唱",
  "原曲",
  "后期",
  "後記",
  "录音",
  "録音",
  "レコーディング",
  "策划",
  "企画",
  "企劃",
  "伴奏",
  "美工",
  "海报",
  "海報",
  "旁白",
  "出品",
  "发行",
  "發行",
  "监制",
  "監製",
  "监修",
  "監修",
  "总监",
  "總監",
  "音乐总监",
  "音樂總監",
  "音楽総監",
  "艺术总监",
  "藝術總監",
  "总策划",
  "總策劃",
  "总制作",
  "總製作",
  "总制作人",
  "總製作人",
  "录音师",
  "錄音師",
  "录音室",
  "錄音室",
  "混音师",
  "混音師",
  "混音室",
  "混音室",
  "混音工程",
  "母带师",
  "母帶師",
  "母带室",
  "母帶室",
  "母带工程",
  "母带制作",
  "母帶製作",
  "出品人",
  "出品方",
  "发行人",
  "發行人",
  "发行方",
  "發行方",
  "统筹",
  "統籌",
  "项目统筹",
  "企划",
  "企劃",
  "编写",
  "和声编写",
  "配唱制作人",
  "音乐",
  "音樂",
  "音楽",
  "版权",
  "版權",
  "op",
  "sp",
  "isrc",
  "upc",
  // English credits
  "writtenby",
  "producedby",
  "composedby",
  "arrangedby",
  "mixedby",
  "masteredby",
  "performedby",
  "recordedby",
  "engineeredby",
  "mixing",
  "mastering",
  "vocal",
  "vocals",
  "guitar",
  "bass",
  "drums",
  "piano",
  "producer",
  "lyricist",
  "composer",
  "arranger",
  "lyricsby",
  "wordsby",
  "musicby",
  "artist",
  "title",
  "album",
  "by",
]);

const METADATA_COLON_REGEX =
  /^(?:原唱|作词|作詞|作曲|编曲|編曲|和声|和音|コーラス|混音|ミックス|ミキシング|母带|母帶|マスタリング|吉他|ギター|贝斯|貝斯|ベース|鼓|ドラム|键盘|鍵盤|キーボード|钢琴|鋼琴|ピアノ|(?:音乐|音樂|音楽|艺术|藝術)?(?:总监|總監)|(?:总|總)?(?:制作人?|製作人?)|(?:总|總)?(?:策划|企画|企劃|统筹|統籌)|演唱|歌|唄|ボーカル|翻唱|原曲|后期|後記|(?:录音|録音|混音|母带|母帶)(?:师|師|室|工程)?|レコーディング|伴奏|美工|海报|海報|旁白|(?:出品|发行|發行)(?:人|方)?|监制|監製|监修|監修|音乐|音樂|音楽|词|詞|曲|版权|版權|op|sp|isrc|written\s*by|produced\s*by|composed\s*by|arranged\s*by|mixed\s*by|mastered\s*by|performed\s*by|recorded\s*by|mixing|mastering|vocals?|producer|lyricist|composer|arranger|lyrics\s*by|words\s*by|music\s*by|artist|title|album)\s*[:：\-–—]/i;

const ID_TAG_REGEX = /^\[(?:ti|ar|al|by|offset|re|ve|length):/i;

/**
 * Checks if a line is a credit/metadata header rather than a sung lyric line.
 */
export function isMetadataLine(text: string): boolean {
  if (!text) return false;
  let trimmed = text.trim();
  if (!trimmed) return false;

  // Strip wrapping brackets or parentheses (e.g. "(音乐总监 : 陈建骐)" or "[作词:xxx]")
  if (
    (trimmed.startsWith("(") && trimmed.endsWith(")")) ||
    (trimmed.startsWith("（") && trimmed.endsWith("）")) ||
    (trimmed.startsWith("【") && trimmed.endsWith("】"))
  ) {
    trimmed = trimmed.slice(1, -1).trim();
  }

  // 1. Tag format: [ar:Artist], [ti:Title]
  if (ID_TAG_REGEX.test(trimmed)) {
    return true;
  }

  // 2. Direct regex match on prefix + colon/dash: "原唱 : Charlie Puth", "音乐总监 : 陈建骐", "Written by: ..."
  if (METADATA_COLON_REGEX.test(trimmed)) {
    return true;
  }

  // 3. Normalize prefix before colon / dash (supports ASCII :, fullwidth ：, and dashes)
  const delimiterMatch = trimmed.match(/[:：\-–—]/);
  const colonIdx = delimiterMatch ? delimiterMatch.index! : -1;
  if (colonIdx > 0 && colonIdx <= 25) {
    const rawPrefix = trimmed.slice(0, colonIdx).trim().toLowerCase();
    const cleanPrefix = rawPrefix.replace(/\s+/g, "");

    if (
      KNOWN_METADATA_PREFIXES.has(cleanPrefix) ||
      cleanPrefix.endsWith("词") ||
      cleanPrefix.endsWith("詞") ||
      cleanPrefix.endsWith("曲") ||
      cleanPrefix.endsWith("声") ||
      cleanPrefix.endsWith("音") ||
      cleanPrefix.endsWith("唄") ||
      cleanPrefix.endsWith("歌") ||
      cleanPrefix.endsWith("总监") ||
      cleanPrefix.endsWith("總監") ||
      cleanPrefix.endsWith("监") ||
      cleanPrefix.endsWith("監") ||
      cleanPrefix.endsWith("师") ||
      cleanPrefix.endsWith("師") ||
      cleanPrefix.endsWith("室") ||
      cleanPrefix.endsWith("人") ||
      cleanPrefix.endsWith("制作") ||
      cleanPrefix.endsWith("製作") ||
      cleanPrefix.endsWith("统筹") ||
      cleanPrefix.endsWith("統籌") ||
      cleanPrefix.endsWith("策划") ||
      cleanPrefix.endsWith("策劃") ||
      cleanPrefix.endsWith("企划") ||
      cleanPrefix.endsWith("企劃") ||
      cleanPrefix.endsWith("工程") ||
      cleanPrefix.endsWith("设计") ||
      cleanPrefix.endsWith("設計") ||
      cleanPrefix.endsWith("编辑") ||
      cleanPrefix.endsWith("編輯")
    ) {
      return true;
    }

    // Compound credits: "词/曲", "作词/作曲", "作詞・作曲", "词 / 曲"
    const subParts = rawPrefix.split(/[/\-・\s]+/).filter(Boolean);
    if (
      subParts.length > 1 &&
      subParts.every(
        (p) =>
          KNOWN_METADATA_PREFIXES.has(p) ||
          p.endsWith("词") ||
          p.endsWith("詞") ||
          p.endsWith("曲") ||
          p.endsWith("总监") ||
          p.endsWith("總監") ||
          p.endsWith("监") ||
          p.endsWith("監") ||
          p.endsWith("师") ||
          p.endsWith("室") ||
          p.endsWith("人"),
      )
    ) {
      return true;
    }
  }

  return false;
}

function normalizeCompareText(str: string): string {
  return str
    .toLowerCase()
    .replace(/[\u3000-\u303f\uff00-\uffef]/g, " ")
    .replace(/\([^)]*\)|\[[^\]]*\]|（[^）]*）|【[^】]*】/g, " ")
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g, "")
    .trim();
}

/**
 * Checks if a line near the start of the song echoes track title/artist metadata,
 * which should be dropped so the instrumental intro break can display properly.
 */
export function isOpeningTitleOrArtistEcho(
  line: any,
  index: number,
  songInfo?: { title?: string; artist?: string } | null,
): boolean {
  if (index > 4) return false;
  const time = Number(line?.time ?? 0);
  if (time > 15.0) return false;

  const rawText = String(line?.text || "").trim();
  if (!rawText) return false;

  // 1. Syllable duration uniformity heuristic (dummy header tag in LRC/QRC)
  if (Array.isArray(line?.parts) && line.parts.length > 2) {
    const firstDur =
      line.parts[0]?.durationMs ??
      (line.parts[0]?.duration ? line.parts[0].duration * 1000 : 0);
    if (firstDur > 0) {
      const allIdentical = line.parts.every((p: any) => {
        const d =
          p?.durationMs ??
          (p?.duration ? p.duration * 1000 : 0);
        return Math.abs(d - firstDur) <= 15;
      });
      if (allIdentical) return true;
    }
  }

  // 2. Compare with songInfo title & artist
  if (songInfo) {
    const normText = normalizeCompareText(rawText);
    const normTitle = normalizeCompareText(songInfo.title || "");
    const normArtist = normalizeCompareText(songInfo.artist || "");

    if (normTitle && normTitle.length >= 2) {
      if (normText.includes(normTitle)) {
        if (normArtist && normText.includes(normArtist)) return true;
        if (normText.length <= normTitle.length + 12) return true;
      }
    }

    if (normArtist && normArtist.length >= 2 && normText === normArtist) {
      return true;
    }
  }

  // 3. Fallback generic banner detection for opening line (time <= 3.0s, index <= 1)
  if (time <= 3.0 && index <= 1) {
    // Has "Title - Artist" separator pattern (e.g. "前前前世 - 你的名字")
    if (/^.+?\s+[-–—]\s+.+?$/.test(rawText) && rawText.length > 6) {
      return true;
    }
    // Has release/version tag in brackets: (环绕立体声版), (Official Audio), etc.
    if (
      /[（(【\[](?:环绕|立体声|高清|官方|伴奏|原版|无损|Remix|Cover|Live|Official|Audio|Video|OST|Theme|Version|Ver\.|HD|4K)[^)）】\]]*[)）】\]]/i.test(
        rawText,
      )
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Strips metadata/credit lines from the opening of the lyrics array.
 * We inspect lines occurring within the first 8 lines or before 35.0s,
 * removing credit headers and title/artist banners without short-circuiting.
 */
export function stripOpeningMetadataLines(
  lyrics: any[],
  songInfo?: { title?: string; artist?: string } | null,
): any[] {
  if (!Array.isArray(lyrics) || lyrics.length === 0) return lyrics;

  const result: any[] = [];
  const OPENING_CHECK_MAX_INDEX = 8;
  const OPENING_CHECK_MAX_TIME_S = 35.0;

  for (let i = 0; i < lyrics.length; i++) {
    const line = lyrics[i];
    const text = String(line?.text || "").trim();
    const time = Number(line?.time ?? 0);

    if (i < OPENING_CHECK_MAX_INDEX && time < OPENING_CHECK_MAX_TIME_S) {
      // 1. Drop credit lines: "词 : 野田洋次郎", "作词 : ...", "Written by: ..."
      if (isMetadataLine(text)) {
        continue;
      }

      // 2. Drop title/artist banner echo lines
      if (isOpeningTitleOrArtistEcho(line, i, songInfo)) {
        continue;
      }
    }

    result.push(line);
  }

  return result;
}

const INSTRUMENTAL_GAP_THRESHOLD_S = 4.5;

/**
 * Inserts `{ isInstrumental: true }` lines for:
 * 1. Intro gap (from 0:00 to first vocal line if >= 4.5s)
 * 2. Mid-song instrumental solos / interludes where gap >= 5.0s
 */
export function insertInstrumentalBreaks(lyrics: any[], songDurationSec?: number): any[] {
  if (!Array.isArray(lyrics) || lyrics.length === 0) return lyrics;

  const result: any[] = [];

  const createInstrumental = (startTime: number, duration: number) => ({
    time: Number(startTime.toFixed(2)),
    duration: Number(duration.toFixed(2)),
    text: "",
    parts: [],
    isInstrumental: true,
  });

  // 1. Intro instrumental: If first vocal line starts after threshold
  const firstVocalTime = Number(lyrics[0]?.time ?? 0);
  if (firstVocalTime >= INSTRUMENTAL_GAP_THRESHOLD_S && !lyrics[0]?.isInstrumental) {
    result.push(createInstrumental(0, firstVocalTime));
  }

  // 2. Scan through lines and check for mid-song instrumental breaks
  for (let i = 0; i < lyrics.length; i++) {
    result.push(lyrics[i]);

    if (i < lyrics.length - 1) {
      const current = lyrics[i];
      const next = lyrics[i + 1];

      if (current.isInstrumental || next.isInstrumental) continue;

      const currentStart = Number(current.time ?? 0);
      const currentDuration = Number(current.duration ?? 0.5);
      const currentEnd = currentStart + Math.max(0.5, currentDuration);
      const nextStart = Number(next.time ?? 0);
      const gap = nextStart - currentEnd;

      if (gap >= INSTRUMENTAL_GAP_THRESHOLD_S) {
        result.push(createInstrumental(currentEnd, gap));
      }
    }
  }

  // 3. Optional Outro instrumental if song duration is provided and there's a large gap
  if (songDurationSec && songDurationSec > 0 && result.length > 0) {
    const last = result[result.length - 1];
    const lastEnd = Number(last.time ?? 0) + Number(last.duration ?? 0.5);
    const outroGap = songDurationSec - lastEnd;

    if (outroGap >= INSTRUMENTAL_GAP_THRESHOLD_S && !last.isInstrumental) {
      result.push(createInstrumental(lastEnd, outroGap));
    }
  }

  return result;
}

/**
 * Complete, maintainable normalization pipeline for any lyrics source:
 * 1. Sorts by timestamp
 * 2. Filters opening metadata/credit header lines
 * 3. Automatically inserts instrumental breaks (intros & interludes)
 * 4. Normalizes spacing and duplicate timestamps
 */
export function normalizeLyricsPipeline(
  lyrics: any[],
  songDurationSec?: number,
  songInfo?: { title?: string; artist?: string } | null,
): any[] {
  if (!Array.isArray(lyrics) || lyrics.length === 0) return lyrics;

  // Clone array
  let processed = lyrics.map((l) => ({ ...l }));

  // 1. Sort by time
  processed.sort((a, b) => (Number(a.time) || 0) - (Number(b.time) || 0));

  // 2. Strip opening metadata lines (原唱, 作词, title banners, etc.)
  processed = stripOpeningMetadataLines(processed, songInfo);

  // 3. Fix backward timestamps
  for (let i = 0; i < processed.length; i++) {
    if (processed[i].text) {
      processed[i].text = String(processed[i].text).trim();
    }
    if (i > 0 && processed[i].time <= processed[i - 1].time) {
      processed[i].time = processed[i - 1].time + 0.2;
    }
  }

  // 4. Insert instrumental breaks
  processed = insertInstrumentalBreaks(processed, songDurationSec);

  return processed;
}
