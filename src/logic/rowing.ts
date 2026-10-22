/** Rowing workout targets: cadence, heart rate, effort and pace per phase, and per-phase HR after the fact. */
import type { IntervalPhase, Span } from '../data/types';
import type { RowerSummary, SessionRecord, SessionRower, Settings } from '../db/db';
import { hrMaxOf, statsBetween } from '../hr/metrics';

export function spanText(s: Span | undefined): string | undefined {
  if (s === undefined) return undefined;
  return typeof s === 'number' ? `${s}` : s[0] === s[1] ? `${s[0]}` : `${s[0]}–${s[1]}`;
}

/** Seconds per 500 m → "m:ss". */
export function fmtPace(sec: number): string {
  const total = Math.round(sec);
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** "2:05" / "2.05" / "125" → seconds per 500 m, or undefined when it is not a plausible split. */
export function parsePace(text: string): number | undefined {
  const t = text.trim().replace(',', '.');
  const m = /^(\d{1,2})[:.](\d{1,2})$/.exec(t);
  const sec = m ? Number(m[1]) * 60 + Number(m[2]) : /^\d{2,3}$/.test(t) ? Number(t) : undefined;
  return sec !== undefined && sec >= 60 && sec <= 240 ? sec : undefined;
}

export interface HrTarget {
  min?: number;
  max?: number;
}

/** HR target in bpm: the phase's % band, else the old intensity rule (hard ≥ 85 %, steady 70–80 %, easy ≤ 70 %). */
export function hrTargetBpm(phase: Pick<IntervalPhase, 'intensity' | 'hrPct'>, hrMax: number): HrTarget {
  if (phase.hrPct) {
    const [lo, hi] = phase.hrPct;
    return { ...(lo > 0 ? { min: Math.round((hrMax * lo) / 100) } : {}), ...(hi < 100 ? { max: Math.round((hrMax * hi) / 100) } : {}) };
  }
  if (phase.intensity === 'hard') return { min: Math.round(hrMax * 0.85) };
  if (phase.intensity === 'steady') return { min: Math.round(hrMax * 0.7), max: Math.round(hrMax * 0.8) };
  return { max: Math.round(hrMax * 0.7) };
}

export function hrTargetText(t: HrTarget): string {
  if (t.min !== undefined && t.max !== undefined) return `${t.min}–${t.max}`;
  if (t.min !== undefined) return `≥ ${t.min}`;
  if (t.max !== undefined) return `≤ ${t.max}`;
  return '—';
}

export type HrVerdict = 'on' | 'low' | 'high' | 'lag';

/** Live HR against the phase target; during the HR lag of a hard interval the reading is informative only. */
export function hrVerdict(bpm: number, target: HrTarget, phaseElapsedSec: number, lagSec?: number): HrVerdict {
  if (target.min !== undefined && bpm < target.min) return lagSec !== undefined && phaseElapsedSec < lagSec ? 'lag' : 'low';
  if (target.max !== undefined && bpm > target.max) return 'high';
  return 'on';
}

export interface PhaseTargets {
  spm?: string;
  hrPct?: string;
  hrBpm: HrTarget;
  rpe?: string;
  /** "+12–18 s → 2:05–2:11", or just the offset when no 2k pace is set. */
  pace?: string;
  /** The two halves of `pace`: "+12–18 s" and, with a 2k pace, "2:05–2:11". */
  paceOffset?: string;
  paceSplit?: string;
  lagSec?: number;
  hint?: string;
}

export function phaseTargets(phase: IntervalPhase, settings: Pick<Settings, 'hrMax' | 'birthYear' | 'pace2kSec'>): PhaseTargets {
  const out: PhaseTargets = { hrBpm: hrTargetBpm(phase, hrMaxOf(settings)) };
  out.spm = spanText(phase.spm);
  if (phase.hrPct) {
    const [lo, hi] = phase.hrPct;
    out.hrPct = lo > 0 ? `${lo}–${hi} %` : `≤ ${hi} %`;
  }
  out.rpe = spanText(phase.rpe);
  if (phase.paceOffset2k) {
    const [lo, hi] = phase.paceOffset2k;
    const offset = `+${lo}–${hi} s`;
    out.paceOffset = offset;
    if (settings.pace2kSec) out.paceSplit = `${fmtPace(settings.pace2kSec + lo)}–${fmtPace(settings.pace2kSec + hi)}`;
    out.pace = out.paceSplit ? `${offset} → ${out.paceSplit}` : offset;
  }
  out.lagSec = phase.hrLagSec;
  out.hint = phase.hint;
  return out;
}

/** The work intervals of a workout (the phases that count as "hard interval x of y"). */
export function isWorkPhase(p: Pick<IntervalPhase, 'intensity' | 'kind'>): boolean {
  return p.kind ? p.kind === 'work' : p.intensity === 'hard';
}

export interface PhaseHr {
  label: string;
  mean?: number;
  max?: number;
  target: HrTarget;
  verdict?: HrVerdict;
}

/** Mean / max HR per phase of a finished rowing session, against each phase's target. Needs the strap and the phase start time. */
export function phaseHrReport(session: Pick<SessionRecord, 'hr' | 'rowing'>, phases: IntervalPhase[], settings: Pick<Settings, 'hrMax' | 'birthYear'> = {}): PhaseHr[] {
  const hr = session.hr;
  const start = session.rowing?.phaseStartedAt;
  if (!hr || !start) return [];
  const hrMax = hr.summary?.hrMax ?? hrMaxOf(settings);
  const out: PhaseHr[] = [];
  let at = start;
  for (const p of phases) {
    const target = hrTargetBpm(p, hrMax);
    // Skip the HR lag of hard intervals so the mean reflects the steady part.
    const from = at + Math.min(p.hrLagSec ?? 0, p.durationSec / 2) * 1000;
    const st = statsBetween(hr, from, at + p.durationSec * 1000);
    out.push({ label: p.label, mean: st.mean, max: st.max, target, verdict: st.mean !== undefined ? hrVerdict(st.mean, target, p.durationSec) : undefined });
    at += p.durationSec * 1000;
  }
  return out;
}

/* ---------- rowing machine (FTMS console) ---------- */

/** Mean of the valid (> 0) samples. */
function meanOf(xs: number[]): number | undefined {
  const v = xs.filter((x) => x > 0);
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : undefined;
}

/** Summary of a rower recording, or undefined when it holds too little to mean anything. */
export function rowerSummary(rec: Pick<SessionRower, 'spm' | 'paceSec' | 'watts' | 'distanceM' | 'strokes'>): RowerSummary | undefined {
  const n = Math.max(rec.spm.length, rec.paceSec.length, rec.watts.length, rec.distanceM.length);
  if (n < 30) return undefined;
  // The console counts from its last reset: a counter that starts near zero is the session's own,
  // otherwise the metres already on it are subtracted.
  const dist = rec.distanceM.filter((d) => d >= 0);
  const base = dist.length && dist[0] > 50 ? dist[0] : 0;
  const distanceM = dist.length ? Math.max(...dist) - base : 0;
  const valid = new Set<number>();
  for (let i = 0; i < n; i++) if ((rec.spm[i] ?? -1) >= 0 || (rec.paceSec[i] ?? -1) >= 0 || (rec.watts[i] ?? -1) >= 0 || (rec.distanceM[i] ?? -1) >= 0) valid.add(i);
  const watts = rec.watts.filter((w) => w > 0);
  const avgSpm = meanOf(rec.spm);
  const avgPaceSec = meanOf(rec.paceSec);
  const avgWatts = meanOf(rec.watts);
  return {
    distanceM: Math.round(distanceM),
    strokes: rec.strokes,
    avgPaceSec: avgPaceSec === undefined ? undefined : Math.round(avgPaceSec),
    avgSpm: avgSpm === undefined ? undefined : Math.round(avgSpm * 10) / 10,
    avgWatts: avgWatts === undefined ? undefined : Math.round(avgWatts),
    maxWatts: watts.length ? Math.max(...watts) : undefined,
    samples: valid.size,
    coverage: Math.round((valid.size / n) * 100) / 100,
  };
}

export type RangeVerdict = 'on' | 'low' | 'high';

/** Stroke rate against the phase's span (undefined when the phase has none). */
export function spmVerdict(spm: number, phase: Pick<IntervalPhase, 'spm'>): RangeVerdict | undefined {
  if (phase.spm === undefined) return undefined;
  const [lo, hi] = typeof phase.spm === 'number' ? [phase.spm, phase.spm] : phase.spm;
  return spm < lo - 0.5 ? 'low' : spm > hi + 0.5 ? 'high' : 'on';
}

/** Pace against the phase's split band (needs the 2k pace); "low" = slower than the band, "high" = faster. */
export function paceVerdict(paceSec: number, phase: Pick<IntervalPhase, 'paceOffset2k'>, settings: Pick<Settings, 'pace2kSec'>): RangeVerdict | undefined {
  if (!phase.paceOffset2k || !settings.pace2kSec) return undefined;
  const [lo, hi] = phase.paceOffset2k;
  return paceSec > settings.pace2kSec + hi + 1 ? 'low' : paceSec < settings.pace2kSec + lo - 1 ? 'high' : 'on';
}

export interface PhaseRower {
  label: string;
  spm?: number;
  paceSec?: number;
  watts?: number;
  distanceM?: number;
}

/** Mean cadence / split / power and distance per phase of a finished rowing session (after the HR lag of hard intervals). */
export function phaseRowerReport(session: Pick<SessionRecord, 'rower' | 'rowing'>, phases: IntervalPhase[]): PhaseRower[] {
  const rec = session.rower;
  const start = session.rowing?.phaseStartedAt;
  if (!rec || !start) return [];
  const idx = (ts: number) => Math.floor((ts - rec.startedAt) / 1000);
  const out: PhaseRower[] = [];
  let at = start;
  for (const p of phases) {
    const a = Math.max(0, idx(at));
    const b = idx(at + p.durationSec * 1000);
    const slice = (xs: number[]) => xs.slice(a, b + 1);
    const dist = slice(rec.distanceM).filter((d) => d >= 0);
    out.push({
      label: p.label,
      spm: meanOf(slice(rec.spm)),
      paceSec: (() => {
        const m = meanOf(slice(rec.paceSec));
        return m === undefined ? undefined : Math.round(m);
      })(),
      watts: (() => {
        const m = meanOf(slice(rec.watts));
        return m === undefined ? undefined : Math.round(m);
      })(),
      distanceM: dist.length >= 2 ? Math.max(...dist) - Math.min(...dist) : undefined,
    });
    at += p.durationSec * 1000;
  }
  return out;
}

/** The doc's own check: if the last work interval is clearly slower than the first, the start was too fast. */
export function splitConsistency(work: PhaseRower[]): { firstSec: number; lastSec: number; deltaSec: number; verdict: 'even' | 'faded' | 'negative' } | undefined {
  const withPace = work.filter((p) => p.paceSec !== undefined);
  if (withPace.length < 2) return undefined;
  const firstSec = withPace[0].paceSec!;
  const lastSec = withPace[withPace.length - 1].paceSec!;
  const deltaSec = lastSec - firstSec;
  return { firstSec, lastSec, deltaSec, verdict: deltaSec > 3 ? 'faded' : deltaSec < -3 ? 'negative' : 'even' };
}
