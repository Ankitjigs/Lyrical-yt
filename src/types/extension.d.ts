import type { SongInfo } from "./lyrics";
import type { Root } from "react-dom/client";

declare module "*.css?inline" {
  const content: string;
  export default content;
}

declare module "*.css" {
  const classes: Record<string, string>;
  export default classes;
}

declare global {
  const chrome: any;

  function updateHeaderText(...args: any[]): any;
  function handleTranslationSelection(...args: any[]): any;
  function parsePastedLyrics(...args: any[]): any;
  function updateLyrics(...args: any[]): any;
  function deleteLyricsVersion(...args: any[]): any;
  function exportLyrics(...args: any[]): any;
  function detectLanguage(...args: any[]): any;
  function importLyrics(...args: any[]): any;
  function handleTapToSync(...args: any[]): any;
  function startManualSync(...args: any[]): any;
  const SettingsUI: any;
  var fetchedLyrics: any;
  var isRomanizationEnabled: any;
  var isTranslateEnabled: any;
  var currentTranslationLang: any;
  var translatedLyrics: any;
  var currentIndex: any;

  interface Window {
    CubeyProvider?: {
      fetchLyrics: (songInfo: SongInfo) => Promise<any>;
      fetchUnifiedLyrics?: (songInfo: SongInfo) => Promise<any>;
    };
    SettingsUI?: new () => unknown;
    initTranslationDropdown?: () => void;
    getSongInfoFromPage?: () => SongInfo | null;
    ytVideoDetails?: unknown;
    __LYRICAL_DEBUG__?: boolean;
    __LYRICAL_CAPTION_TRACKS__?: unknown;
  };

  interface Element {
    offsetWidth: number;
    offsetHeight: number;
    style: CSSStyleDeclaration;
    dataset: DOMStringMap;
    value?: any;
    files?: FileList | null;
    default?: any;
    placeholder?: string;
    _reactRoot?: Root;
  }

  interface HTMLElement {
    value?: any;
    files?: FileList | null;
    default?: any;
    _reactRoot?: Root;
  }

  interface EventTarget {
    value?: any;
    files?: FileList | null;
  }

  interface Event {
    detail?: any;
  }

  interface Document {
    startViewTransition?: (callback: () => void) => {
      finished: Promise<void>;
      ready: Promise<void>;
      updateCallbackDone: Promise<void>;
    };
  }

  interface Object {
    [key: string]: any;
  }

  interface ObjectConstructor {
    entries(o: any): [string, any][];
    values(o: any): any[];
  }

  interface ArrayConstructor {
    from(arrayLike: any, mapFn?: any, thisArg?: any): any[];
  }

  namespace React {
    interface CSSProperties {
      [key: `--${string}`]: string | number | undefined;
    }
  }
}

export {};
