import type {
  ExerciseId,
  IntervalPhase,
  Prescription,
  Range,
  SessionTemplate,
} from '../data/types';
import { getVariant } from '../data/program';

export interface WarmupStep {
  kind: 'warmup';
  id: string;
  title: string;
  durationSec: number;
  checklist: string[];
}

export interface WorkStep {
  kind: 'work';
  id: string;
  blockTitle: string;
  slot: string;
  exerciseId: ExerciseId;
  name: string;
  setNumber: number;
  totalSets: number;
  reps: Range;
  rir: Range;
  perSide: boolean;
  notes: string;
  hint?: string;
  restPause?: { mini: number; of: number };
}

export interface RestStep {
  kind: 'rest';
  id: string;
  durationSec: number;
  label: string;
}

export interface IntervalStep {
  kind: 'interval';
  id: string;
  title: string;
  exerciseId: ExerciseId;
  phases: IntervalPhase[];
}

export type Step = WarmupStep | WorkStep | RestStep | IntervalStep;

export interface BuildOptions {
  finisher: boolean;
  deload: boolean;
  badDay: boolean;
  /** Slot key for the rest-pause finisher (defaults to the first option). */
  restPauseSlot?: string;
  /** Multiplier applied to rest durations. */
  restScale?: number;
  /** Adjust a prescription before steps are generated (e.g. pull-up roadmap stage). */
  override?: (p: Prescription) => Prescription;
}

export const BAD_DAY_RIR: Range = { min: 3, max: 3 };
export const DELOAD_RIR: Range = { min: 3, max: 4 };
export const DELOAD_MAX_SETS = 2;

export function effectiveRir(p: Prescription, opts: Pick<BuildOptions, 'badDay' | 'deload'>): Range {
  if (opts.deload) return DELOAD_RIR;
  if (opts.badDay) return BAD_DAY_RIR;
  return p.rir;
}

export function plannedSets(p: Prescription, opts: Pick<BuildOptions, 'deload'>): number {
  return opts.deload ? Math.min(DELOAD_MAX_SETS, p.sets.max) : p.sets.max;
}

export function buildSteps(template: SessionTemplate, variantId: string | undefined, opts: BuildOptions): Step[] {
  const variant = getVariant(template, variantId);
  const steps: Step[] = [];
  const scale = opts.restScale ?? 1;
  let restCounter = 0;
  const rest = (sec: number, label: string): RestStep => ({
    kind: 'rest',
    id: `rest:${++restCounter}`,
    durationSec: Math.round(sec * scale),
    label,
  });

  variant.blocks.forEach((block, bi) => {
    switch (block.kind) {
      case 'warmup':
        steps.push({ kind: 'warmup', id: `warmup:${bi}`, ...pick(block, 'title', 'durationSec', 'checklist') });
        break;
      case 'interval':
        steps.push({ kind: 'interval', id: `interval:${bi}`, ...pick(block, 'title', 'exerciseId', 'phases') });
        break;
      case 'pair': {
        if (block.optional && !opts.finisher) break;
        const exercises = block.exercises.map((p) => (opts.override ? opts.override(p) : p));
        const setsPer = exercises.map((p) => plannedSets(p, opts));
        const rounds = Math.max(...setsPer);
        for (let r = 1; r <= rounds; r++) {
          exercises.forEach((p, ei) => {
            if (r > setsPer[ei]) return;
            steps.push(workStep(p, block.title, r, setsPer[ei], opts));
            steps.push(rest(block.restSec, 'Rest'));
          });
        }
        break;
      }
      case 'rest-pause': {
        if (!opts.finisher) break;
        const base = block.exercises.find((e) => e.key === opts.restPauseSlot) ?? block.exercises[0];
        const p = opts.override ? opts.override(base) : base;
        for (let m = 1; m <= block.miniSets; m++) {
          const w = workStep(p, block.title, m, block.miniSets, opts);
          w.id = `rp:${p.key}#${m}`;
          w.restPause = { mini: m, of: block.miniSets };
          w.rir = { min: 0, max: 0 };
          steps.push(w);
          if (m < block.miniSets) steps.push(rest(block.miniRestSec, 'Rest-pause — 15–20 s'));
        }
        break;
      }
    }
  });

  return normalizeRests(steps);
}

function workStep(p: Prescription, blockTitle: string, setNumber: number, totalSets: number, opts: BuildOptions): WorkStep {
  return {
    kind: 'work',
    id: `${p.key}#${setNumber}`,
    blockTitle,
    slot: p.key,
    exerciseId: p.exerciseId,
    name: p.name,
    setNumber,
    totalSets,
    reps: p.reps,
    rir: effectiveRir(p, opts),
    perSide: !!p.perSide,
    notes: p.notes,
    hint: p.hint,
  };
}

/** Remove rests that are leading, trailing, doubled, or directly before a non-work step without purpose. */
export function normalizeRests(steps: Step[]): Step[] {
  const out: Step[] = [];
  for (const s of steps) {
    if (s.kind === 'rest') {
      const prev = out[out.length - 1];
      if (!prev || prev.kind !== 'work') continue;
    }
    out.push(s);
  }
  while (out.length && out[out.length - 1].kind === 'rest') out.pop();
  return out;
}

/** Drop the remaining sets of a slot after `fromIndex` (for "2–3 sets" ranges or bailing on an exercise). */
export function dropRemainingSets(steps: Step[], fromIndex: number, slot: string): Step[] {
  const kept = steps.filter((s, i) => i <= fromIndex || s.kind !== 'work' || s.slot !== slot);
  return normalizeRests(kept);
}

export function remainingSetsOf(steps: Step[], fromIndex: number, slot: string): number {
  return steps.filter((s, i) => i > fromIndex && s.kind === 'work' && s.slot === slot).length;
}

export function nextWorkStep(steps: Step[], fromIndex: number): WorkStep | IntervalStep | undefined {
  for (let i = fromIndex + 1; i < steps.length; i++) {
    const s = steps[i];
    if (s.kind === 'work' || s.kind === 'interval') return s;
  }
  return undefined;
}

export function estimateDurationSec(steps: Step[]): number {
  return steps.reduce((sum, s) => {
    switch (s.kind) {
      case 'warmup':
      case 'rest':
        return sum + s.durationSec;
      case 'interval':
        return sum + s.phases.reduce((a, p) => a + p.durationSec, 0);
      case 'work':
        return sum + (s.perSide ? 80 : 40);
    }
  }, 0);
}

function pick<T, K extends keyof T>(obj: T, ...keys: K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const k of keys) out[k] = obj[k];
  return out;
}
