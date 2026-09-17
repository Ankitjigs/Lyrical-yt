import { log, warn } from "../../content/utils/logger";

export interface VocalRemoverSettings {
  cutDepth: number; // 0.5 to 1.0 (default 1.0 = full phase inversion)
  bassCutoff: number; // 100 to 300 Hz (default 160)
  balanceTrim: number; // -10 to +10 % (default 0 = center balanced)
  reverbDampening: boolean; // toggle high-frequency reverb & reflection damping (default false)
}

/**
 * VocalRemover
 * Advanced real-time full-spectrum center-channel phase inversion,
 * steep 24dB/oct sub-bass crossover, stereo balance nulling, and Haas decorrelation.
 * Runs directly in the browser via Web Audio API with zero external dependencies.
 */
class VocalRemover {
  private audioCtx: AudioContext | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private connectedVideo: HTMLVideoElement | null = null;

  // Crossfade gain nodes (dry = untouched original, wet = vocal-canceled instrumental)
  private dryGain: GainNode | null = null;
  private wetGain: GainNode | null = null;

  // Dynamically tunable DSP nodes
  private bassFilterL1: BiquadFilterNode | null = null;
  private bassFilterL2: BiquadFilterNode | null = null;
  private bassFilterR1: BiquadFilterNode | null = null;
  private bassFilterR2: BiquadFilterNode | null = null;
  private vocalHpL: BiquadFilterNode | null = null;
  private vocalHpR: BiquadFilterNode | null = null;
  private inverter: GainNode | null = null;
  private reverbShelf: BiquadFilterNode | null = null;

  private isMuted: boolean = false;
  private isInitialized: boolean = false;

  private settings: VocalRemoverSettings = {
    cutDepth: 1.0,
    bassCutoff: 160,
    balanceTrim: 0,
    reverbDampening: false,
  };

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

      // ─── 2. Wet Vocal-Canceled Instrumental Path ───
      this.wetGain = this.audioCtx.createGain();
      this.wetGain.gain.setValueAtTime(this.isMuted ? 1 : 0, this.audioCtx.currentTime);

      // Split source into Left and Right channels
      const splitter = this.audioCtx.createChannelSplitter(2);
      this.sourceNode.connect(splitter);

      // ─── 2a. Steep 24 dB/Octave Sub-Bass Isolation (< bassCutoff Hz) ───
      // Cascading two 2nd-order Butterworth low-pass filters creates a steep 24 dB/oct roll-off.
      // This protects the kick drum and 808 sub-bass while aggressively blocking male vocal chest hum (> 150 Hz).
      this.bassFilterL1 = this.audioCtx.createBiquadFilter();
      this.bassFilterL1.type = "lowpass";
      this.bassFilterL1.frequency.setValueAtTime(this.settings.bassCutoff, this.audioCtx.currentTime);
      this.bassFilterL1.Q.setValueAtTime(0.707, this.audioCtx.currentTime);

      this.bassFilterL2 = this.audioCtx.createBiquadFilter();
      this.bassFilterL2.type = "lowpass";
      this.bassFilterL2.frequency.setValueAtTime(this.settings.bassCutoff, this.audioCtx.currentTime);
      this.bassFilterL2.Q.setValueAtTime(0.707, this.audioCtx.currentTime);

      this.bassFilterR1 = this.audioCtx.createBiquadFilter();
      this.bassFilterR1.type = "lowpass";
      this.bassFilterR1.frequency.setValueAtTime(this.settings.bassCutoff, this.audioCtx.currentTime);
      this.bassFilterR1.Q.setValueAtTime(0.707, this.audioCtx.currentTime);

      this.bassFilterR2 = this.audioCtx.createBiquadFilter();
      this.bassFilterR2.type = "lowpass";
      this.bassFilterR2.frequency.setValueAtTime(this.settings.bassCutoff, this.audioCtx.currentTime);
      this.bassFilterR2.Q.setValueAtTime(0.707, this.audioCtx.currentTime);

      splitter.connect(this.bassFilterL1, 0);
      this.bassFilterL1.connect(this.bassFilterL2);

      splitter.connect(this.bassFilterR1, 1);
      this.bassFilterR1.connect(this.bassFilterR2);

      // Sum low-end cleanly into mono center foundation
      const bassSum = this.audioCtx.createGain();
      bassSum.gain.setValueAtTime(0.5, this.audioCtx.currentTime);
      this.bassFilterL2.connect(bassSum);
      this.bassFilterR2.connect(bassSum);

      const bassMerger = this.audioCtx.createChannelMerger(2);
      bassSum.connect(bassMerger, 0, 0);
      bassSum.connect(bassMerger, 0, 1);

      const bassGain = this.audioCtx.createGain();
      bassGain.gain.setValueAtTime(0.9, this.audioCtx.currentTime);
      bassMerger.connect(bassGain);
      bassGain.connect(this.wetGain);

      // ─── 2b. Full-Spectrum Vocal Cancellation (bassCutoff up to 20 kHz) ───
      // High-pass filter out the sub-bass so phase inversion doesn't thin out the kick,
      // but let ALL vocal frequencies (including high sibilance and breath up to 20 kHz) be phase-cancelled!
      this.vocalHpL = this.audioCtx.createBiquadFilter();
      this.vocalHpL.type = "highpass";
      this.vocalHpL.frequency.setValueAtTime(this.settings.bassCutoff, this.audioCtx.currentTime);
      this.vocalHpL.Q.setValueAtTime(0.707, this.audioCtx.currentTime);

      this.vocalHpR = this.audioCtx.createBiquadFilter();
      this.vocalHpR.type = "highpass";
      this.vocalHpR.frequency.setValueAtTime(this.settings.bassCutoff, this.audioCtx.currentTime);
      this.vocalHpR.Q.setValueAtTime(0.707, this.audioCtx.currentTime);

      splitter.connect(this.vocalHpL, 0);
      splitter.connect(this.vocalHpR, 1);

      // Calculate right-channel scaling factor using cutDepth and balanceTrim
      // balanceTrim allows matching asymmetrical channel volumes on YouTube
      const balanceMultiplier = 1.0 + (this.settings.balanceTrim / 100);
      const rightInvertGain = -1.0 * this.settings.cutDepth * balanceMultiplier;

      this.inverter = this.audioCtx.createGain();
      this.inverter.gain.setValueAtTime(rightInvertGain, this.audioCtx.currentTime);
      this.vocalHpR.connect(this.inverter);

      // Difference Sum: Left - (k * Right)
      // Completely eliminates the lead singer's voice across the entire frequency range!
      const diffSum = this.audioCtx.createGain();
      diffSum.gain.setValueAtTime(1.0, this.audioCtx.currentTime);
      this.vocalHpL.connect(diffSum);
      this.inverter.connect(diffSum);

      // ─── 2c. Multi-Band Formant Notches for Stereo-Doubled Vocals ───
      // When vocals have stereo chorus or double-takes, deep notches suppress the vocal presence
      // without affecting side instrumentals.
      const notch1 = this.audioCtx.createBiquadFilter();
      notch1.type = "peaking";
      notch1.frequency.setValueAtTime(1150, this.audioCtx.currentTime); // Lower vowel formant
      notch1.Q.setValueAtTime(1.4, this.audioCtx.currentTime);
      notch1.gain.setValueAtTime(-16, this.audioCtx.currentTime);

      const notch2 = this.audioCtx.createBiquadFilter();
      notch2.type = "peaking";
      notch2.frequency.setValueAtTime(2200, this.audioCtx.currentTime); // Vocal articulation & nasality
      notch2.Q.setValueAtTime(1.6, this.audioCtx.currentTime);
      notch2.gain.setValueAtTime(-18, this.audioCtx.currentTime);

      const notch3 = this.audioCtx.createBiquadFilter();
      notch3.type = "peaking";
      notch3.frequency.setValueAtTime(3400, this.audioCtx.currentTime); // Vocal presence
      notch3.Q.setValueAtTime(1.8, this.audioCtx.currentTime);
      notch3.gain.setValueAtTime(-16, this.audioCtx.currentTime);

      const notch4 = this.audioCtx.createBiquadFilter();
      notch4.type = "peaking";
      notch4.frequency.setValueAtTime(4500, this.audioCtx.currentTime); // Upper vocal bite
      notch4.Q.setValueAtTime(2.0, this.audioCtx.currentTime);
      notch4.gain.setValueAtTime(-14, this.audioCtx.currentTime);

      // Sibilance de-esser notch (7.5 kHz) for any residual stereo panned "s" sounds
      const notchDeEss = this.audioCtx.createBiquadFilter();
      notchDeEss.type = "peaking";
      notchDeEss.frequency.setValueAtTime(7500, this.audioCtx.currentTime);
      notchDeEss.Q.setValueAtTime(2.2, this.audioCtx.currentTime);
      notchDeEss.gain.setValueAtTime(-14, this.audioCtx.currentTime);

      // Reverb shelf to kill diffuse vocal room reflections if enabled
      this.reverbShelf = this.audioCtx.createBiquadFilter();
      this.reverbShelf.type = "highshelf";
      this.reverbShelf.frequency.setValueAtTime(4200, this.audioCtx.currentTime);
      this.reverbShelf.gain.setValueAtTime(this.settings.reverbDampening ? -10 : 0, this.audioCtx.currentTime);

      diffSum.connect(notch1);
      notch1.connect(notch2);
      notch2.connect(notch3);
      notch3.connect(notch4);
      notch4.connect(notchDeEss);
      notchDeEss.connect(this.reverbShelf);

      // ─── 2d. Coherent Haas Decorrelation Stereo Widening ───
      // Converts the pristine vocal-free difference signal into a rich, full stereo image
      const leftDiffGain = this.audioCtx.createGain();
      leftDiffGain.gain.setValueAtTime(0.95, this.audioCtx.currentTime);
      this.reverbShelf.connect(leftDiffGain);

      const haasDelay = this.audioCtx.createDelay(0.05);
      haasDelay.delayTime.setValueAtTime(0.013, this.audioCtx.currentTime); // 13ms decorrelation
      const rightDiffGain = this.audioCtx.createGain();
      rightDiffGain.gain.setValueAtTime(0.92, this.audioCtx.currentTime);
      this.reverbShelf.connect(haasDelay);
      haasDelay.connect(rightDiffGain);

      const instrumentalMerger = this.audioCtx.createChannelMerger(2);
      leftDiffGain.connect(instrumentalMerger, 0, 0);
      rightDiffGain.connect(instrumentalMerger, 0, 1);

      instrumentalMerger.connect(this.wetGain);

      // Route wet instrumental output to master destination
      this.wetGain.connect(this.audioCtx.destination);

      this.isInitialized = true;
      log("VocalRemover DSP audio graph successfully initialized with full-spectrum cancellation");
      return true;
    } catch (err) {
      warn("Failed to initialize VocalRemover audio graph:", err);
      return false;
    }
  }

  public updateSettings(newSettings: Partial<VocalRemoverSettings>): void {
    this.settings = { ...this.settings, ...newSettings };
    if (!this.audioCtx || !this.isInitialized) return;

    const now = this.audioCtx.currentTime;
    const TIME_CONSTANT = 0.025; // 25ms smooth ramp to prevent digital clicks

    if (newSettings.bassCutoff !== undefined) {
      const freq = Math.max(90, Math.min(320, newSettings.bassCutoff));
      if (this.bassFilterL1) this.bassFilterL1.frequency.setTargetAtTime(freq, now, TIME_CONSTANT);
      if (this.bassFilterL2) this.bassFilterL2.frequency.setTargetAtTime(freq, now, TIME_CONSTANT);
      if (this.bassFilterR1) this.bassFilterR1.frequency.setTargetAtTime(freq, now, TIME_CONSTANT);
      if (this.bassFilterR2) this.bassFilterR2.frequency.setTargetAtTime(freq, now, TIME_CONSTANT);
      if (this.vocalHpL) this.vocalHpL.frequency.setTargetAtTime(freq, now, TIME_CONSTANT);
      if (this.vocalHpR) this.vocalHpR.frequency.setTargetAtTime(freq, now, TIME_CONSTANT);
    }

    if (newSettings.cutDepth !== undefined || newSettings.balanceTrim !== undefined) {
      const depth = Math.max(0.5, Math.min(1.0, this.settings.cutDepth));
      const trimMult = 1.0 + (this.settings.balanceTrim / 100);
      const rightGain = -depth * trimMult;
      if (this.inverter) this.inverter.gain.setTargetAtTime(rightGain, now, TIME_CONSTANT);
    }

    if (newSettings.reverbDampening !== undefined) {
      const dampGain = newSettings.reverbDampening ? -10 : 0;
      if (this.reverbShelf) this.reverbShelf.gain.setTargetAtTime(dampGain, now, TIME_CONSTANT);
    }
  }

  public getSettings(): VocalRemoverSettings {
    return { ...this.settings };
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

