import { ImperativeBetterStrategy } from "./ImperativeBetterStrategy";

/**
 * Dedicated per-word strategy for Musixmatch richsync.
 * Uses the high-performance imperative engine with word-level rendering.
 */
export class PerWordStrategy extends ImperativeBetterStrategy {
  constructor() {
    super();
    this.name = "Lyrical Per-Word";
  }
}

