import { log, warn } from "../../content/utils/logger";

/**
 * VocalRemover
 * Modular real-time center-channel phase inversion and bass-preserving crossover DSP.
 * Runs directly in the browser via Web Audio API without any external dependencies or servers.
 */
class VocalRemover {
  private audioCtx: AudioContext | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private connectedVideo: HTMLVideoElement | null = null;

  // Crossfade gain nodes (dry = untouched original, wet = vocal-canceled instrumental)
  private dryGain: GainNode | null = null;
  private wetGain: GainNode | null = null;

  private isMuted: boolean = false;
  private isInitialized: boolean = false;

  // WeakMap to ensure createMediaElementSource is called at most once per HTMLVideoElement
  private static sourceNodeCache = new WeakMap<
    HTMLVideoElement,
    { audioCtx: AudioContext; sourceNode: MediaElementAudioSourceNode }
  >();

  private findVideoElement(): HTMLVideoElement | null {
    return (
      document.querySelector<HTMLVideoElement>("#movie_player video") ||
      document.querySelector<HTMLVideoElement>("video")
    );
  }

  private initAudioGraph(video: HTMLVideoElement): boolean {
    try {
      if (this.isInitialized && this.connectedVideo === video && this.audioCtx) {
        return true;
      }

      // Check if this video element already has an AudioContext & sourceNode in the cache
      const cached = VocalRemover.sourceNodeCache.get(video);
      if (cached) {
        this.audioCtx = cached.audioCtx;
        this.sourceNode = cached.sourceNode;
      } else {
        const AudioContextClass =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        if (!AudioContextClass) {
          warn("Web Audio API not supported in this browser environment");
          return false;
        }
        this.audioCtx = new AudioContextClass();
        this.sourceNode = this.audioCtx.createMediaElementSource(video);
        VocalRemover.sourceNodeCache.set(video, {
          audioCtx: this.audioCtx,
          sourceNode: this.sourceNode,
        });
      }

      this.connectedVideo = video;

      // ─── 1. Dry Passthrough Path (100% untouched original audio) ───
      this.dryGain = this.audioCtx.createGain();
      this.dryGain.gain.setValueAtTime(this.isMuted ? 0 : 1, this.audioCtx.currentTime);
      this.sourceNode.connect(this.dryGain);
      this.dryGain.connect(this.audioCtx.destination);

      // ─── 2. Wet Vocal-Canceled Instrumental Path (Multi-Stage DSP Matrix) ───
      this.wetGain = this.audioCtx.createGain();
      this.wetGain.gain.setValueAtTime(this.isMuted ? 1 : 0, this.audioCtx.currentTime);

      // Split source into Left and Right channels
      const splitter = this.audioCtx.createChannelSplitter(2);
      this.sourceNode.connect(splitter);

      // ─── 2a. Sub-Bass Preservation (< 200 Hz) ───
      // Kick drum, sub-bass, and basslines are preserved with full dynamic punch.
      const bassFilterL = this.audioCtx.createBiquadFilter();
      bassFilterL.type = "lowpass";
      bassFilterL.frequency.setValueAtTime(200, this.audioCtx.currentTime);
      bassFilterL.Q.setValueAtTime(0.707, this.audioCtx.currentTime);

      const bassFilterR = this.audioCtx.createBiquadFilter();
      bassFilterR.type = "lowpass";
      bassFilterR.frequency.setValueAtTime(200, this.audioCtx.currentTime);
      bassFilterR.Q.setValueAtTime(0.707, this.audioCtx.currentTime);

      splitter.connect(bassFilterL, 0);
      splitter.connect(bassFilterR, 1);

      // Mono sum bass to center foundation
      const bassSum = this.audioCtx.createGain();
      bassSum.gain.setValueAtTime(0.5, this.audioCtx.currentTime);
      bassFilterL.connect(bassSum);
      bassFilterR.connect(bassSum);

      const bassMerger = this.audioCtx.createChannelMerger(2);
      bassSum.connect(bassMerger, 0, 0);
      bassSum.connect(bassMerger, 0, 1);

      const bassGain = this.audioCtx.createGain();
      bassGain.gain.setValueAtTime(0.85, this.audioCtx.currentTime);
      bassMerger.connect(bassGain);
      bassGain.connect(this.wetGain);

      // ─── 2b. Mid-Range Center Vocal Nulling & Formant Suppression (200 Hz – 5.5 kHz) ───
      // Isolate mid frequencies where human voice operates
      const midHpL = this.audioCtx.createBiquadFilter();
      midHpL.type = "highpass";
      midHpL.frequency.setValueAtTime(200, this.audioCtx.currentTime);
      midHpL.Q.setValueAtTime(0.707, this.audioCtx.currentTime);

      const midHpR = this.audioCtx.createBiquadFilter();
      midHpR.type = "highpass";
      midHpR.frequency.setValueAtTime(200, this.audioCtx.currentTime);
      midHpR.Q.setValueAtTime(0.707, this.audioCtx.currentTime);

      const midLpL = this.audioCtx.createBiquadFilter();
      midLpL.type = "lowpass";
      midLpL.frequency.setValueAtTime(5500, this.audioCtx.currentTime);
      midLpL.Q.setValueAtTime(0.707, this.audioCtx.currentTime);

      const midLpR = this.audioCtx.createBiquadFilter();
      midLpR.type = "lowpass";
      midLpR.frequency.setValueAtTime(5500, this.audioCtx.currentTime);
      midLpR.Q.setValueAtTime(0.707, this.audioCtx.currentTime);

      splitter.connect(midHpL, 0);
      splitter.connect(midHpR, 1);
      midHpL.connect(midLpL);
      midHpR.connect(midLpR);

      // Invert Right channel: Gain = -1.0
      const inverter = this.audioCtx.createGain();
      inverter.gain.setValueAtTime(-1.0, this.audioCtx.currentTime);
      midLpR.connect(inverter);

      // Sum: Left + (-Right) = Left - Right (Cancels center-panned vocals)
      const diffSum = this.audioCtx.createGain();
      diffSum.gain.setValueAtTime(1.0, this.audioCtx.currentTime);
      midLpL.connect(diffSum);
      inverter.connect(diffSum);

      // ─── 2c. Surgical Vocal Formant Notch Filters ───
      // Suppress residual stereo reverb and double-tracking leak in the human voice range:
      // Notch 1: Core Vocal Formant & Vowel Resonance (~1.85 kHz)
      const vocalNotch1 = this.audioCtx.createBiquadFilter();
      vocalNotch1.type = "peaking";
      vocalNotch1.frequency.setValueAtTime(1850, this.audioCtx.currentTime);
      vocalNotch1.Q.setValueAtTime(1.3, this.audioCtx.currentTime);
      vocalNotch1.gain.setValueAtTime(-14, this.audioCtx.currentTime);

      // Notch 2: Singer Articulation & Vocal Bite (~3.2 kHz)
      const vocalNotch2 = this.audioCtx.createBiquadFilter();
      vocalNotch2.type = "peaking";
      vocalNotch2.frequency.setValueAtTime(3200, this.audioCtx.currentTime);
      vocalNotch2.Q.setValueAtTime(1.5, this.audioCtx.currentTime);
      vocalNotch2.gain.setValueAtTime(-12, this.audioCtx.currentTime);

      // Notch 3: Upper Vocal Presence (~4.2 kHz)
      const vocalNotch3 = this.audioCtx.createBiquadFilter();
      vocalNotch3.type = "peaking";
      vocalNotch3.frequency.setValueAtTime(4200, this.audioCtx.currentTime);
      vocalNotch3.Q.setValueAtTime(1.6, this.audioCtx.currentTime);
      vocalNotch3.gain.setValueAtTime(-9, this.audioCtx.currentTime);

      diffSum.connect(vocalNotch1);
      vocalNotch1.connect(vocalNotch2);
      vocalNotch2.connect(vocalNotch3);

      // ─── 2d. Coherent Haas Decorrelation Stereo Reconstruction ───
      // Instead of 180° out-of-phase L and -(L-R), use 14ms Haas decorrelation delay
      // for a wide, natural stereo soundstage that does not cancel in mono.
      const leftDiffGain = this.audioCtx.createGain();
      leftDiffGain.gain.setValueAtTime(0.92, this.audioCtx.currentTime);
      vocalNotch3.connect(leftDiffGain);

      const haasDelay = this.audioCtx.createDelay(0.05);
      haasDelay.delayTime.setValueAtTime(0.014, this.audioCtx.currentTime); // 14ms
      const rightDiffGain = this.audioCtx.createGain();
      rightDiffGain.gain.setValueAtTime(0.88, this.audioCtx.currentTime);
      vocalNotch3.connect(haasDelay);
      haasDelay.connect(rightDiffGain);

      const midMerger = this.audioCtx.createChannelMerger(2);
      leftDiffGain.connect(midMerger, 0, 0);
      rightDiffGain.connect(midMerger, 0, 1);
      midMerger.connect(this.wetGain);

      // ─── 2e. High-Frequency Air & De-Esser Band (> 5.5 kHz) ───
      // Preserves acoustic guitar shimmer and stereo cymbals while cutting vocal sibilance.
      const highHpL = this.audioCtx.createBiquadFilter();
      highHpL.type = "highpass";
      highHpL.frequency.setValueAtTime(5500, this.audioCtx.currentTime);
      highHpL.Q.setValueAtTime(0.707, this.audioCtx.currentTime);

      const highHpR = this.audioCtx.createBiquadFilter();
      highHpR.type = "highpass";
      highHpR.frequency.setValueAtTime(5500, this.audioCtx.currentTime);
      highHpR.Q.setValueAtTime(0.707, this.audioCtx.currentTime);

      splitter.connect(highHpL, 0);
      splitter.connect(highHpR, 1);

      // De-esser peaking notch at 7.2 kHz to remove harsh "s", "sh", "t" vocal sibilance
      const deEssL = this.audioCtx.createBiquadFilter();
      deEssL.type = "peaking";
      deEssL.frequency.setValueAtTime(7200, this.audioCtx.currentTime);
      deEssL.Q.setValueAtTime(2.0, this.audioCtx.currentTime);
      deEssL.gain.setValueAtTime(-12, this.audioCtx.currentTime);

      const deEssR = this.audioCtx.createBiquadFilter();
      deEssR.type = "peaking";
      deEssR.frequency.setValueAtTime(7200, this.audioCtx.currentTime);
      deEssR.Q.setValueAtTime(2.0, this.audioCtx.currentTime);
      deEssR.gain.setValueAtTime(-12, this.audioCtx.currentTime);

      highHpL.connect(deEssL);
      highHpR.connect(deEssR);

      const highGainL = this.audioCtx.createGain();
      highGainL.gain.setValueAtTime(0.42, this.audioCtx.currentTime);
      const highGainR = this.audioCtx.createGain();
      highGainR.gain.setValueAtTime(0.42, this.audioCtx.currentTime);

      deEssL.connect(highGainL);
      deEssR.connect(highGainR);

      const highMerger = this.audioCtx.createChannelMerger(2);
      highGainL.connect(highMerger, 0, 0);
      highGainR.connect(highMerger, 0, 1);
      highMerger.connect(this.wetGain);

      // Route wet instrumental output to master destination
      this.wetGain.connect(this.audioCtx.destination);

      this.isInitialized = true;
      log("VocalRemover DSP audio graph successfully initialized");
      return true;
    } catch (err) {
      warn("Failed to initialize VocalRemover audio graph:", err);
      return false;
    }
  }

  public async setMuted(mute: boolean): Promise<boolean> {
    this.isMuted = mute;

    // If disabling vocal mute and audio graph was never initialized, no-op immediately
    if (!mute && !this.isInitialized) {
      return true;
    }

    const video = this.findVideoElement();
    if (!video) {
      warn("No active video element found to attach vocal remover");
      return false;
    }

    if (!this.isInitialized || this.connectedVideo !== video) {
      const ok = this.initAudioGraph(video);
      if (!ok) return false;
    }

    if (!this.audioCtx || !this.dryGain || !this.wetGain) {
      return false;
    }

    // Resume AudioContext if suspended (browser autoplay policy)
    if (this.audioCtx.state === "suspended") {
      try {
        await this.audioCtx.resume();
      } catch (e) {
        warn("AudioContext resume failed:", e);
      }
    }

    const now = this.audioCtx.currentTime;
    const RAMP_TIME = 0.035; // 35ms micro-crossfade to eliminate any audio pops/clicks

    if (mute) {
      // Switch to vocal-canceled instrumental
      this.dryGain.gain.cancelScheduledValues(now);
      this.dryGain.gain.setValueAtTime(this.dryGain.gain.value, now);
      this.dryGain.gain.linearRampToValueAtTime(0, now + RAMP_TIME);

      this.wetGain.gain.cancelScheduledValues(now);
      this.wetGain.gain.setValueAtTime(this.wetGain.gain.value, now);
      this.wetGain.gain.linearRampToValueAtTime(1, now + RAMP_TIME);
      log("VocalRemover: Vocal cancellation enabled (Sing-along instrumental)");
    } else {
      // Revert to untouched full-fidelity original audio
      this.wetGain.gain.cancelScheduledValues(now);
      this.wetGain.gain.setValueAtTime(this.wetGain.gain.value, now);
      this.wetGain.gain.linearRampToValueAtTime(0, now + RAMP_TIME);

      this.dryGain.gain.cancelScheduledValues(now);
      this.dryGain.gain.setValueAtTime(this.dryGain.gain.value, now);
      this.dryGain.gain.linearRampToValueAtTime(1, now + RAMP_TIME);
      log("VocalRemover: Reverted to full original audio");
    }

    return true;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  public reset(): void {
    if (this.audioCtx && this.dryGain && this.wetGain) {
      const now = this.audioCtx.currentTime;
      this.dryGain.gain.cancelScheduledValues(now);
      this.dryGain.gain.setValueAtTime(1, now);
      this.wetGain.gain.cancelScheduledValues(now);
      this.wetGain.gain.setValueAtTime(0, now);
    }
    this.isMuted = false;
  }
}

export const vocalRemover = new VocalRemover();
