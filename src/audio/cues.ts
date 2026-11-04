/**
 * Short sound cues for the rowing screen. `cuesBetween` decides what to play from two consecutive
 * snapshots (pure, tested); `sound` plays them with Web Audio oscillators (no audio files) and is a
 * no-op where Web Audio is missing or not yet unlocked by a tap.
 */
import type { Medal } from '../db/db';
import { COMBO_GRACE_SEC } from '../logic/rowgame';

export type Cue = 'tick' | 'go' | 'levelup' | 'drift' | Medal;

export interface CueSnapshot {
  phaseIndex: number;
  /** Whole seconds left in the block (as shown on the ring). */
  remainingSec: number;
  hasNext: boolean;
  multiplier: number;
  offRun: number;
  medals: (Medal | null)[];
  at: number;
}

/** At most one "off target" tone per this many ms. */
export const DRIFT_COOLDOWN_MS = 15_000;

export function cuesBetween(prev: CueSnapshot | undefined, cur: CueSnapshot, lastDriftAt: number): { cues: Cue[]; driftAt: number } {
  const cues: Cue[] = [];
  let driftAt = lastDriftAt;
  if (!prev) return { cues, driftAt };
  if (cur.phaseIndex > prev.phaseIndex) cues.push('go');
  else if (cur.hasNext && cur.remainingSec >= 1 && cur.remainingSec <= 3 && cur.remainingSec !== prev.remainingSec) cues.push('tick');
  if (cur.medals.length > prev.medals.length) {
    const m = cur.medals[cur.medals.length - 1];
    if (m) cues.push(m);
  }
  if (cur.multiplier > prev.multiplier) cues.push('levelup');
  if (cur.offRun >= COMBO_GRACE_SEC && prev.offRun < COMBO_GRACE_SEC && cur.at - lastDriftAt >= DRIFT_COOLDOWN_MS) {
    cues.push('drift');
    driftAt = cur.at;
  }
  return { cues, driftAt };
}

/** Notes per cue: [frequency Hz, duration ms] played one after another. */
const NOTES: Record<Cue, [number, number][]> = {
  tick: [[880, 110]],
  go: [[1320, 380]],
  levelup: [
    [660, 120],
    [990, 200],
  ],
  drift: [[300, 320]],
  bronze: [[784, 220]],
  silver: [
    [784, 160],
    [988, 240],
  ],
  gold: [
    [784, 140],
    [988, 140],
    [1319, 300],
  ],
};

class Sound {
  private ctx?: AudioContext;

  get supported(): boolean {
    return typeof window !== 'undefined' && ('AudioContext' in window || 'webkitAudioContext' in window);
  }

  /** True once a tap has let the page make sound. */
  get unlocked(): boolean {
    return this.ctx?.state === 'running';
  }

  /** Call from a tap handler: creates / resumes the audio context (browsers require a gesture). */
  unlock(): void {
    if (!this.supported) return;
    try {
      const Ctor = (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext) as typeof AudioContext;
      this.ctx ??= new Ctor();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      /* no audio on this device */
    }
  }

  play(cue: Cue): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    let t = ctx.currentTime + 0.01;
    for (const [freq, ms] of NOTES[cue]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = cue === 'drift' ? 'triangle' : 'sine';
      osc.frequency.value = freq;
      // Short attack / release so the tones do not click; loud enough over a flywheel.
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.6, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + ms / 1000 + 0.02);
      t += ms / 1000 + 0.03;
    }
  }
}

export const sound = new Sound();
