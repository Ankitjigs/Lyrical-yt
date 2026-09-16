import {
  createInstrumentalElement,
  setupInstrumentalAnimations,
  InstrumentalAnimations,
  INSTRUMENTAL_WAVE_CYCLE_MS,
} from "./createInstrumentalElement";
import { normalizeLyricPartSpacing } from "../../utils/lyricSpacing";

const LYRIC_ENDING_THRESHOLD_S = 0.5;
const EARLY_SCROLL_CONSIDER_S = 0.62;
const QUEUE_SCROLL_THRESHOLD_MS = 150;
const TIME_JUMP_THRESHOLD_S = 0.5;
const SCROLL_POS_OFFSET_RATIO = 0.5;
const LINE_SYNC_ANIMATION_DELAY_S = 0.05;
const WORD_BREAK_CHAR = /([\s\u200B\u00AD\p{Dash_Punctuation}])/u;

export class ArchiveTuneStrategy {
  name: string;
  rootId: string;
  isImperative: boolean;
  scrollContainer: HTMLElement | null;
  root: HTMLElement | null;
  container: HTMLElement | null;
  lines: any[];
  cachedDurations: Map<string, number>;
  state: Record<string, any>;
  resizeObserver: ResizeObserver | null;

  constructor() {
    this.name = "ArchiveTune Engine (Spring Float & Feathered Mask)";
    this.rootId = "archivetune-root";
    this.isImperative = true;
    this.scrollContainer = null;
    this.root = null;
    this.container = null;
    this.lines = [];
    this.cachedDurations = new Map();
    this.state = this.createState();
    this.resizeObserver = null;
  }

  createState() {
    return {
      scrollResumeTime: 0,
      scrollPos: -1,
      selectedElementIndex: 0,
      nextScrollAllowedTime: 0,
      lastTime: 0,
      lastPlayState: false,
      lastWallTime: 0,
      lastActiveLines: [],
      queuedScroll: false,
      doneFirstInstantScroll: false,
      lastProgrammaticScrollTime: 0,
      hasValidLayout: false,
      lastOffset: undefined,
    };
  }

  renderLyrics() {
    return (
      <div
        key="archivetune-strategy"
        id="archivetune-root"
        style={{
          position: "relative",
          width: "100%",
          transition: "transform 260ms ease",
        }}
      />
    );
  }

  reset() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    if (this.root) {
      this.root.innerHTML = "";
    }

    this.lines.forEach((line) => {
      if (line.instrumentalAnimations?.cancel) {
        line.instrumentalAnimations.cancel();
      }
    });

    this.scrollContainer = null;
    this.root = null;
    this.container = null;
    this.lines = [];
    this.cachedDurations.clear();
    this.state = this.createState();
  }

  invalidateLayout(transitionDurationMs = 450) {
    this.state.hasValidLayout = false;
    this.state.doneFirstInstantScroll = false;
    this.state.nextScrollAllowedTime = 0;
    this.state.queuedScroll = true;

    const remeasureAndScroll = () => {
      this.measureLayout();
      if (this.state.hasValidLayout) {
        this.state.queuedScroll = true;
        this.state.lastProgrammaticScrollTime = Date.now();
      }
    };

    setTimeout(remeasureAndScroll, Math.round(transitionDurationMs * 0.6));
    setTimeout(remeasureAndScroll, transitionDurationMs + 50);
    setTimeout(remeasureAndScroll, transitionDurationMs + 200);
  }

  pauseAutoScroll(durationMs = 4000) {
    this.state.scrollResumeTime = Date.now() + durationMs;
  }

  wasRecentProgrammaticScroll() {
    return Date.now() - this.state.lastProgrammaticScrollTime < 400;
  }

  getCSSDurationInMs(element: Element | null, property: string) {
    if (!element) return 0;

    let duration = this.cachedDurations.get(property);
    if (duration !== undefined) {
      return duration;
    }

    const value = window.getComputedStyle(element).getPropertyValue(property);
    const trimmed = value.trim();

    if (trimmed.endsWith("ms")) {
      duration = parseFloat(trimmed);
    } else if (trimmed.endsWith("s")) {
      duration = parseFloat(trimmed) * 1000;
    } else {
      duration = 0;
    }

    this.cachedDurations.set(property, duration);
    return duration;
  }

  reflow(element: HTMLElement) {
    void element.offsetHeight;
  }

  buildFallbackParts(line: any, nextLine: any) {
    const words = String(line.text || "\u266a").split(" ");
    const baseTime = Number(line.time ?? 0);

    return words.map((word, index) => ({
      text: word.trim().length > 0 ? `${word} ` : word,
      time: baseTime + index * LINE_SYNC_ANIMATION_DELAY_S,
      duration: 0,
    }));
  }

  estimateTimedRomanization(text: string, time: number, duration: number) {
    const rawWords = text.split(/\s+/).filter((w) => w.length > 0);
    if (rawWords.length === 0) return [];
    const totalChars = rawWords.reduce((sum, w) => sum + w.length, 0);
    let currentTime = time;
    return rawWords.map((w) => {
      const wordDuration = (w.length / totalChars) * duration;
      const obj = {
        text: w + " ",
        time: currentTime,
        duration: wordDuration,
      };
      currentTime += wordDuration;
      return obj;
    });
  }

  createBreakElem(lineElement: HTMLElement, order: number) {
    const breakEl = document.createElement("span");
    breakEl.className = `at-lyrics--break at-lyrics--break-${order}`;
    breakEl.style.order = String(order);
    lineElement.appendChild(breakEl);
    return breakEl;
  }

  groupByWordAndInsert(lineElement: HTMLElement, lyricElementsBuffer: HTMLElement[]) {
    let wordGroupBuffer: HTMLElement[] = [];
    let isCurrentBufferBg = false;

    const pushWordGroupBuffer = () => {
      if (wordGroupBuffer.length === 0) return;

      const group = document.createElement("span");
      wordGroupBuffer.forEach((word) => {
        group.appendChild(word);
      });

      if (isCurrentBufferBg) {
        group.classList.add("at-lyrics--background");
      }

      lineElement.appendChild(group);
      wordGroupBuffer = [];
    };

    lyricElementsBuffer.forEach((part) => {
      const isBackground = part.classList.contains("at-lyrics--background");
      const isNonMatchingType = isCurrentBufferBg !== isBackground;
      const text = part.textContent || "";
      const endsAtBreak =
        text.length > 0 && WORD_BREAK_CHAR.test(text[text.length - 1]);
      const isElmJustSpace = !(text.length === 1 && text[0] === " ");

      if (!isNonMatchingType) {
        wordGroupBuffer.push(part);
      }

      if (endsAtBreak || isNonMatchingType) {
        pushWordGroupBuffer();
      }

      if (isNonMatchingType && isElmJustSpace) {
        wordGroupBuffer.push(part);
        isCurrentBufferBg = isBackground;
      }
    });

    pushWordGroupBuffer();
  }

  createWordSpans(wordObjects: any[], lineElement: HTMLElement, lineData: any) {
    const lyricElementsBuffer: HTMLElement[] = [];

    normalizeLyricPartSpacing(wordObjects).forEach((wordObj) => {
      const text = wordObj.text ?? wordObj.words ?? "";
      const duration = Math.max(
        0,
        Number(wordObj.duration ?? wordObj.dur ?? wordObj.durationMs ?? 0),
      );
      const time = Number(wordObj.time ?? wordObj.start ?? 0);
      const span = document.createElement("span");

      span.className = "at-lyrics--word";
      if (wordObj.isBackground) {
        span.classList.add("at-lyrics--background");
      }
      if (duration === 0) {
        span.classList.add("at-lyrics-zero-dur-animate");
      }
      span.textContent = text;
      span.dataset.time = String(time);
      span.dataset.duration = String(duration);
      span.dataset.content = text;
      span.style.setProperty(
        "--at-duration",
        `${Math.max(duration * 1000, 180)}ms`,
      );

      if (text.trim().length === 0) {
        span.style.display = "inline";
      } else {
        lineData.parts.push({
          time,
          duration,
          lyricElement: span,
          animationStartTimeMs: Infinity,
        });
      }

      lyricElementsBuffer.push(span);
    });

    this.groupByWordAndInsert(lineElement, lyricElementsBuffer);
  }

  mount(domContainer: HTMLElement, lyrics: any[], extraData: any = {}) {
    this.reset();
    this.scrollContainer = domContainer;
    this.root = domContainer.querySelector("#archivetune-root");
    if (!this.root) return;

    this.root.innerHTML = "";
    this.lines = [];
    this.cachedDurations.clear();
    this.state = this.createState();

    this.container = document.createElement("div");
    this.container.className = "at-lyrics-container";
    this.container.style.cssText = [
      "position:relative",
      "width:100%",
      "padding-top:28px",
      "padding-bottom:28px",
    ].join(";");
    this.container.dataset.sync = lyrics.some(
      (line) =>
        Array.isArray(line.parts) &&
        line.parts.some((part: any) => Number(part.duration ?? 0) > 0),
    )
      ? "richsync"
      : "synced";

    const {
      romanizedLyrics = [],
      translatedLyrics = [],
      isRomanizationEnabled = true,
      isTranslateEnabled = true,
    } = extraData || {};
    const fragment = document.createDocumentFragment();

    lyrics.forEach((line, lineIndex) => {
      const lineDiv = document.createElement("div");
      lineDiv.className = "at-lyrics--line";
      lineDiv.dataset.lineIndex = String(lineIndex);
      lineDiv.dataset.time = String(Number(line.time ?? 0));
      lineDiv.dataset.duration = String(Number(line.duration ?? 0));
      lineDiv.style.cssText = [
        "padding:var(--lyrical-line-padding, 8px 8px)",
        "margin:var(--lyrical-line-margin, 8px 0)",
        "text-align:center",
        "display:flex",
        "flex-flow:row wrap",
        "justify-content:center",
        "transform-origin:center",
        "cursor:pointer",
        "transition:transform 350ms cubic-bezier(0.175, 0.885, 0.32, 1.275)",
      ].join(";");

      lineDiv.onclick = () => {
        const video = document.querySelector("video");
        if (video) {
          video.currentTime = Number(line.time ?? 0);
        }
      };

      const nextLine = lyrics[lineIndex + 1];
      const lineData: any = {
        lyricElement: lineDiv,
        time: Number(line.time ?? 0),
        duration: Math.max(
          Number(line.duration ?? (nextLine ? nextLine.time - line.time : 0.5)),
          0.5,
        ),
        parts: [],
        isScrolled: false,
        isAnimationPlayStatePlaying: false,
        accumulatedOffsetMs: 0,
        isAnimating: false,
        lastAnimSetupAt: 0,
        isSelected: false,
        animationStartTimeMs: Infinity,
        height: -1,
        position: -1,
      };

      const wordObjects =
        Array.isArray(line.parts) && line.parts.length > 0
          ? line.parts
          : this.buildFallbackParts(line, nextLine);

      lineDiv.style.setProperty(
        "--at-duration",
        `${Math.max(lineData.duration * 1000, 180)}ms`,
      );

      if (line.isInstrumental) {
        lineData.isInstrumental = true;
        const durationMs = Math.round(lineData.duration * 1000);
        const instrumentalEl = createInstrumentalElement(
          durationMs,
          lineIndex,
        );
        lineDiv.appendChild(instrumentalEl);
        lineData.instrumentalElement = instrumentalEl;
        lineData.instrumentalAnimations = setupInstrumentalAnimations(
          instrumentalEl,
          durationMs,
        );
      } else {
        this.createWordSpans(wordObjects, lineDiv, lineData);
      }
      this.createBreakElem(lineDiv, 1);

      const romanized = romanizedLyrics?.[lineIndex]?.romanized;
      if (romanized) {
        const break4 = this.createBreakElem(lineDiv, 4);
        const romanizedEl = document.createElement("div");
        romanizedEl.className = "at-lyrics--romanized";
        if (!isRomanizationEnabled) {
          romanizedEl.classList.add("at-lyrics--hidden");
          break4.classList.add("at-lyrics--hidden");
        }
        romanizedEl.dataset.romanizedText = romanized;
        romanizedEl.style.cssText = [
          "order:5",
          "transition:opacity 0.3s ease",
        ].join(";");

        const timedRom = romanizedLyrics?.[lineIndex]?.timedRomanization;
        const finalTimedRom =
          timedRom && timedRom.length > 0
            ? timedRom
            : this.estimateTimedRomanization(
                romanized,
                lineData.time,
                lineData.duration,
              );

        if (finalTimedRom && finalTimedRom.length > 0) {
          this.createWordSpans(finalTimedRom, romanizedEl, lineData);
        } else {
          romanizedEl.textContent = romanized;
        }

        lineDiv.appendChild(romanizedEl);
      }

      const translated = translatedLyrics?.[lineIndex]?.translated;
      if (translated) {
        const break6 = this.createBreakElem(lineDiv, 6);
        const translatedEl = document.createElement("div");
        translatedEl.className = "at-lyrics--translated";
        if (!isTranslateEnabled) {
          translatedEl.classList.add("at-lyrics--hidden");
          break6.classList.add("at-lyrics--hidden");
        }
        translatedEl.textContent = translated;
        translatedEl.dataset.translatedText = translated;
        translatedEl.style.cssText = [
          "order:7",
          "transition:opacity 0.3s ease",
        ].join(";");
        lineDiv.appendChild(translatedEl);
      }

      fragment.appendChild(lineDiv);
      this.lines.push(lineData);
    });

    this.container.appendChild(fragment);
    const spacer = document.createElement("div");
    spacer.style.height = "40%";
    this.container.appendChild(spacer);
    this.root.appendChild(this.container);

    this.measureLayout();

    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => {
        this.measureLayout();
        if (this.state.hasValidLayout) {
          this.state.queuedScroll = true;
        }
      });
      this.resizeObserver.observe(this.root);
      this.resizeObserver.observe(this.container);
      this.resizeObserver.observe(this.scrollContainer);
    } else {
      setTimeout(() => this.measureLayout(), 100);
      requestAnimationFrame(() => this.measureLayout());
    }
  }

  updateSecondaryLyrics(extraData: any = {}) {
    if (!this.container || this.lines.length === 0) return;

    const {
      romanizedLyrics = [],
      translatedLyrics = [],
      isRomanizationEnabled = true,
      isTranslateEnabled = true,
    } = extraData || {};

    this.lines.forEach((lineData, lineIndex) => {
      const lineDiv = lineData.lyricElement;
      if (!lineDiv) return;

      // 1. Update Romanized
      const romanized = romanizedLyrics?.[lineIndex]?.romanized;
      const romanizedEl = lineDiv.querySelector(".at-lyrics--romanized") as HTMLElement | null;
      let break4 = (lineDiv.querySelector(".at-lyrics--break-4") ||
        lineDiv.querySelector('.at-lyrics--break[style*="order: 4"], .at-lyrics--break[style*="order:4"]')) as HTMLElement | null;

      if (romanized) {
        if (!break4) {
          break4 = this.createBreakElem(lineDiv, 4);
        }

        if (romanizedEl && romanizedEl.dataset.romanizedText === romanized) {
          const isHidden = !isRomanizationEnabled;
          romanizedEl.classList.toggle("at-lyrics--hidden", isHidden);
          break4.classList.toggle("at-lyrics--hidden", isHidden);
        } else {
          let targetEl = romanizedEl;
          if (!targetEl) {
            targetEl = document.createElement("div");
            targetEl.className = "at-lyrics--romanized";
            targetEl.style.cssText = "order:5;transition:opacity 0.3s ease;";
            lineDiv.appendChild(targetEl);
          }
          targetEl.classList.toggle("at-lyrics--hidden", !isRomanizationEnabled);
          break4.classList.toggle("at-lyrics--hidden", !isRomanizationEnabled);
          targetEl.dataset.romanizedText = romanized;

          const timedRom = romanizedLyrics?.[lineIndex]?.timedRomanization;
          const finalTimedRom =
            timedRom && timedRom.length > 0
              ? timedRom
              : this.estimateTimedRomanization(
                  romanized,
                  lineData.time,
                  lineData.duration,
                );

          lineData.parts = lineData.parts.filter(
            (p: any) => !targetEl.contains(p.lyricElement),
          );
          targetEl.innerHTML = "";

          if (finalTimedRom && finalTimedRom.length > 0) {
            this.createWordSpans(finalTimedRom, targetEl, lineData);
          } else {
            targetEl.textContent = romanized;
          }

          if (lineData.isAnimating) {
            this.resetLineAnimation(lineData);
          }
        }
      } else {
        if (romanizedEl) {
          lineData.parts = lineData.parts.filter(
            (p: any) => !romanizedEl.contains(p.lyricElement),
          );
          romanizedEl.remove();
        }
        if (break4) {
          break4.remove();
        }
      }

      // 2. Update Translated
      const translated = translatedLyrics?.[lineIndex]?.translated;
      const translatedEl = lineDiv.querySelector(".at-lyrics--translated") as HTMLElement | null;
      let break6 = (lineDiv.querySelector(".at-lyrics--break-6") ||
        lineDiv.querySelector('.at-lyrics--break[style*="order: 6"], .at-lyrics--break[style*="order:6"]')) as HTMLElement | null;

      if (translated) {
        if (!break6) {
          break6 = this.createBreakElem(lineDiv, 6);
        }

        if (translatedEl && translatedEl.dataset.translatedText === translated) {
          translatedEl.classList.toggle("at-lyrics--hidden", !isTranslateEnabled);
          break6.classList.toggle("at-lyrics--hidden", !isTranslateEnabled);
        } else {
          let targetEl = translatedEl;
          if (!targetEl) {
            targetEl = document.createElement("div");
            targetEl.className = "at-lyrics--translated";
            targetEl.style.cssText = "order:7;transition:opacity 0.3s ease;";
            lineDiv.appendChild(targetEl);
          }
          targetEl.classList.toggle("at-lyrics--hidden", !isTranslateEnabled);
          break6.classList.toggle("at-lyrics--hidden", !isTranslateEnabled);
          targetEl.textContent = translated;
          targetEl.dataset.translatedText = translated;
        }
      } else {
        if (translatedEl) {
          translatedEl.remove();
        }
        if (break6) {
          break6.remove();
        }
      }
    });

    this.measureLayout();
    this.state.queuedScroll = true;
  }

  measureLayout() {
    if (!this.container) return;

    const containerRect = this.container.getBoundingClientRect();
    if (containerRect.width === 0 || containerRect.height === 0) {
      this.state.hasValidLayout = false;
      return;
    }

    this.lines.forEach((line) => {
      const lineRect = line.lyricElement.getBoundingClientRect();
      line.height = lineRect.height;
      line.position = lineRect.top - containerRect.top;
    });

    this.state.hasValidLayout =
      this.lines.length > 0 && this.lines[0].height > 0;
  }

  getAnimationTargets(line: any) {
    if (line.instrumentalElement) {
      return [
        {
          lyricElement: line.instrumentalElement,
          time: line.time,
          duration: line.duration,
          animationStartTimeMs: line.animationStartTimeMs,
        },
      ];
    }
    return [line, ...line.parts];
  }

  setLineVisualState(line: any) {
    line.lyricElement.classList.toggle("at-lyrics--active", line.isScrolled);
    if (line.instrumentalElement) {
      line.instrumentalElement.classList.toggle("at-lyrics--active", line.isScrolled);
    }
    line.lyricElement.style.opacity = line.isScrolled ? "1" : "0.76";
    line.lyricElement.style.filter = "none";
    if (!line.isScrolled && !line.isAnimating) {
      line.lyricElement.style.transform = "";
    }
  }

  resetLineAnimation(line: any) {
    const children = this.getAnimationTargets(line);
    children.forEach((part: any) => {
      part.lyricElement.style.setProperty("--at-swipe-delay", "");
      part.lyricElement.style.setProperty("--at-anim-delay", "");
      part.lyricElement.classList.remove(
        "at-lyrics--animating",
        "at-lyrics--pre-animating",
        "at-lyrics--paused",
      );
      part.animationStartTimeMs = Infinity;
    });
    if (line.instrumentalAnimations) {
      if (line.instrumentalAnimations.fillFade) {
        line.instrumentalAnimations.fillFade.currentTime = 0;
        line.instrumentalAnimations.fillFade.pause();
      }
      if (line.instrumentalAnimations.fillTravel) {
        line.instrumentalAnimations.fillTravel.currentTime = 0;
        line.instrumentalAnimations.fillTravel.pause();
      }
      if (line.instrumentalAnimations.waveFlatten) {
        line.instrumentalAnimations.waveFlatten.currentTime = 0;
        line.instrumentalAnimations.waveFlatten.pause();
      }
      if (line.instrumentalAnimations.waveOscillation) {
        line.instrumentalAnimations.waveOscillation.currentTime = 0;
        line.instrumentalAnimations.waveOscillation.pause();
      }
    }
    line.isSelected = false;
    line.isAnimating = false;
    line.accumulatedOffsetMs = 0;
  }

  applyPausedState(line: any, isPlaying: boolean, now: number) {
    if (isPlaying === line.isAnimationPlayStatePlaying) return;

    line.isAnimationPlayStatePlaying = isPlaying;
    const children = this.getAnimationTargets(line);
    if (!isPlaying) {
      children.forEach((part: any) => {
        if (part.animationStartTimeMs > now) {
          part.lyricElement.classList.remove(
            "at-lyrics--animating",
            "at-lyrics--pre-animating",
          );
        } else {
          part.lyricElement.classList.add("at-lyrics--paused");
        }
      });
      return;
    }

    children.forEach((part: any) => {
      part.lyricElement.classList.remove("at-lyrics--paused");
    });
    if (line.instrumentalAnimations?.waveOscillation && line.isAnimating) {
      line.instrumentalAnimations.waveOscillation.play();
    }
    line.isAnimating = false;
  }

  prepareLineAnimation(line: any, currentTime: number) {
    this.getAnimationTargets(line).forEach((part: any) => {
      const duration = Math.max(part.duration, 0.18);
      const timeDelta = currentTime - part.time;
      const swipeAnimationDelay = `${-timeDelta - duration * 0.05}s`;
      const animDelay = `${-timeDelta}s`;

      part.lyricElement.style.setProperty(
        "--at-swipe-delay",
        swipeAnimationDelay,
      );
      part.lyricElement.style.setProperty(
        "--at-anim-delay",
        animDelay,
      );

      // Completed words already finished their animation; leave them alone so they don't flicker.
      // Active and future words prepare cleanly so transitions align accurately.
      const isCompleted = currentTime >= part.time + duration;
      if (!isCompleted || !part.lyricElement.classList.contains("at-lyrics--animating")) {
        part.lyricElement.classList.remove("at-lyrics--paused", "at-lyrics--animating");
        part.lyricElement.classList.add("at-lyrics--pre-animating");
      }
    });
  }

  commitLineAnimation(line: any, currentTime: number, now: number) {
    this.getAnimationTargets(line).forEach((part: any) => {
      const timeDelta = currentTime - part.time;
      part.lyricElement.classList.remove("at-lyrics--pre-animating");
      part.lyricElement.classList.add("at-lyrics--animating");
      part.animationStartTimeMs = now - timeDelta * 1000;
    });
    line.isAnimating = true;
    line.lastAnimSetupAt = now;
    line.isAnimationPlayStatePlaying = true;
    line.accumulatedOffsetMs = 0;
  }

  scrollToPosition(scrollPos: number, smoothScroll: boolean) {
    if (!this.scrollContainer) return;

    this.state.lastProgrammaticScrollTime = Date.now();
    this.state.scrollPos = scrollPos;

    if (smoothScroll && this.root) {
      const currentScrollTop = this.scrollContainer.scrollTop;
      const delta = currentScrollTop - scrollPos;
      const transitionDuration =
        this.getCSSDurationInMs(this.root, "transition-duration") || 260;

      if (Math.abs(delta) > 2) {
        this.root.style.transitionProperty = "";
        this.root.style.transitionTimingFunction = "";
        this.root.style.transitionDuration = "";
        this.root.style.transition = "none";
        this.root.style.transform = `translate(0px, ${-delta}px)`;
        this.reflow(this.root);
        this.root.style.transition = "transform 260ms ease";
        this.root.style.transform = "translate(0px, 0px)";
        this.state.nextScrollAllowedTime = Date.now() + transitionDuration + 20;
      } else {
        this.state.nextScrollAllowedTime =
          Date.now() + QUEUE_SCROLL_THRESHOLD_MS;
      }

      this.scrollContainer.scrollTop = scrollPos;
      return;
    }

    this.state.nextScrollAllowedTime = Date.now() + QUEUE_SCROLL_THRESHOLD_MS;
    this.scrollContainer.scrollTop = scrollPos;
  }

  update({ currentTime, offset = 0, isPlaying = true }: { currentTime: number; offset?: number; isPlaying?: boolean }) {
    if (!this.scrollContainer || !this.container || this.lines.length === 0) {
      return;
    }

    if (
      !this.state.hasValidLayout ||
      (this.lines.length > 0 &&
        (this.lines[0].height <= 0 || this.lines[0].position < 0))
    ) {
      this.measureLayout();
      if (!this.state.hasValidLayout) return;
    }

    const now = Date.now();
    const video = document.querySelector("video");
    let mediaTime = video ? video.currentTime - offset : currentTime - offset;

    const offsetChanged =
      this.state.lastOffset !== undefined &&
      Math.abs(this.state.lastOffset - offset) > 0.001;
    this.state.lastOffset = offset;

    const timeJumped =
      offsetChanged ||
      (this.state.lastWallTime > 0 &&
        Math.abs(
          mediaTime -
            this.state.lastTime -
            (now - this.state.lastWallTime) / 1000,
        ) > TIME_JUMP_THRESHOLD_S);

    if (timeJumped) {
      this.state.scrollResumeTime = 0;
    }

    this.state.lastTime = mediaTime;
    this.state.lastPlayState = isPlaying;
    this.state.lastWallTime = now;

    const lyricScrollTime = mediaTime;
    const viewportHeight = this.scrollContainer.clientHeight;
    let scrollTop = this.scrollContainer.scrollTop;

    const activeLines: any[] = [];
    const linesToAnimate: any[] = [];
    let newLyricSelected = timeJumped;

    this.lines.forEach((line, index) => {
      const nextTime = this.lines[index + 1]?.time ?? Infinity;

      if (
        lyricScrollTime >= line.time - EARLY_SCROLL_CONSIDER_S &&
        (lyricScrollTime < nextTime ||
          lyricScrollTime < line.time + line.duration)
      ) {
        activeLines.push(line);
        if (
          !this.state.lastActiveLines.includes(line) &&
          lyricScrollTime >= line.time
        ) {
          newLyricSelected = true;
        }
        this.state.selectedElementIndex = index;
        line.isScrolled = true;
      } else {
        line.isScrolled = false;
      }

      const setUpAnimationEarlyTime = 0.15;
      const effectiveEndTime = Math.max(
        nextTime,
        line.time + line.duration + 0.05,
      );

      if (
        mediaTime + setUpAnimationEarlyTime >= line.time &&
        mediaTime < effectiveEndTime
      ) {
        line.isSelected = true;

        if (line.isInstrumental && line.instrumentalAnimations) {
          const durationMs = Math.round(line.duration * 1000);
          const elapsedMs = (mediaTime - line.time) * 1000;
          const clampedElapsedMs = Math.min(Math.max(0, elapsedMs), durationMs);

          if (line.instrumentalAnimations.fillFade) {
            line.instrumentalAnimations.fillFade.currentTime =
              elapsedMs >= 0 ? 300 : 0;
          }
          if (line.instrumentalAnimations.fillTravel) {
            line.instrumentalAnimations.fillTravel.currentTime = clampedElapsedMs;
          }
          if (line.instrumentalAnimations.waveFlatten) {
            line.instrumentalAnimations.waveFlatten.currentTime = clampedElapsedMs;
          }
          if (line.instrumentalAnimations.waveOscillation) {
            line.instrumentalAnimations.waveOscillation.currentTime =
              Math.max(0, elapsedMs) % INSTRUMENTAL_WAVE_CYCLE_MS;
            if (isPlaying && elapsedMs >= 0 && elapsedMs < durationMs) {
              if (line.instrumentalAnimations.waveOscillation.playState !== "running") {
                line.instrumentalAnimations.waveOscillation.play();
              }
            } else {
              line.instrumentalAnimations.waveOscillation.pause();
            }
          }
        }

        const timeDelta = mediaTime - line.time;
        const animationTimingOffset =
          (now - line.animationStartTimeMs) / 1000 - timeDelta;
        line.accumulatedOffsetMs = line.accumulatedOffsetMs / 1.08;
        line.accumulatedOffsetMs += animationTimingOffset * 1000 * 0.4;
        if (
          line.isAnimating &&
          Math.abs(line.accumulatedOffsetMs) > 100 &&
          isPlaying
        ) {
          line.isAnimating = false;
        }

        this.applyPausedState(line, isPlaying, now);

        if (!line.isAnimating) {
          linesToAnimate.push(line);
        }
      } else if (line.isSelected) {
        this.resetLineAnimation(line);
      }
    });

    this.lines.forEach((line) => {
      this.setLineVisualState(line);
    });

    if (linesToAnimate.length > 0) {
      linesToAnimate.forEach((line) =>
        this.prepareLineAnimation(line, mediaTime),
      );
      this.reflow(linesToAnimate[0].lyricElement);
      linesToAnimate.forEach((line) =>
        this.commitLineAnimation(line, mediaTime, now),
      );
    }

    if (this.state.scrollResumeTime < Date.now()) {
      const visibleActiveLines =
        activeLines.length > 0 ? activeLines : [this.lines[0]];

      this.state.lastActiveLines = visibleActiveLines.filter(
        (line) => lyricScrollTime >= line.time,
      );

      const scrollPosOffset = viewportHeight * SCROLL_POS_OFFSET_RATIO;
      const lyricPositions = visibleActiveLines
        .filter((line, index) => {
          return (
            lyricScrollTime <
              line.time + line.duration - LYRIC_ENDING_THRESHOLD_S ||
            index === visibleActiveLines.length - 1
          );
        })
        .map((line) => line.position + line.height / 2);

      const avgPos =
        lyricPositions.reduce((sum, value) => sum + value, 0) /
        lyricPositions.length;

      let targetScroll = avgPos - scrollPosOffset;
      targetScroll = Math.max(0, targetScroll);
      const maxScroll = Math.max(
        0,
        this.scrollContainer.scrollHeight - viewportHeight,
      );
      targetScroll = Math.min(targetScroll, maxScroll);

      let smoothScroll = true;
      if (
        scrollTop === 0 &&
        !this.state.doneFirstInstantScroll &&
        this.state.hasValidLayout
      ) {
        smoothScroll = false;
        this.state.doneFirstInstantScroll = true;
        this.state.nextScrollAllowedTime = 0;
      }

      if (newLyricSelected || this.state.queuedScroll) {
        if (Date.now() > this.state.nextScrollAllowedTime) {
          this.state.queuedScroll = false;
          scrollTop = targetScroll;
          this.scrollToPosition(scrollTop, smoothScroll);
        } else {
          this.state.queuedScroll = true;
        }
      }
    }
  }
}
