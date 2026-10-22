/** Rowing workout targets: cadence, heart rate, effort and pace per phase, and per-phase HR after the fact. */
import type { IntervalPhase, Span } from '../data/types';
import type { SessionRecord, Settings } from '../db/db';
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
