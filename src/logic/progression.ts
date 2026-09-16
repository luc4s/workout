import { PRESCRIPTIONS, PULLUP_ROADMAP } from '../data/program';
import type { Prescription, Variation } from '../data/types';
import type { SessionRecord, SetRecord, Settings } from '../db/db';
import type { SlotPlan } from './runner';

export const LOAD_STEP_KG = 2.5;
const DAY = 24 * 3600 * 1000;

export interface SlotSession {
  sessionId: number;
  at: number;
  badDay: boolean;
  deload: boolean;
  sets: SetRecord[];
}

export type SuggestionKind =
  | 'first'
  | 'add-reps'
  | 'add-load'
  | 'next-variation'
  | 'stage-up'
  | 'hold'
  | 'bad-day'
  | 'deload'
  | 'changed';

export interface Suggestion {
  slot: string;
  kind: SuggestionKind;
  plan: SlotPlan;
  /** Target reps per planned set. */
  repsTarget: number[];
  message: string;
  stall?: 'deload' | 'add-set';
  /** Pull-up roadmap: index of the stage the user can advance to. */
  nextStage?: number;
}

/** Group a slot's logged sets into sessions, newest first. */
export function groupBySession(sets: SetRecord[], sessions: SessionRecord[]): SlotSession[] {
  const byId = new Map(sessions.map((s) => [s.id!, s]));
  const groups = new Map<number, SetRecord[]>();
  for (const set of sets) {
    if (!groups.has(set.sessionId)) groups.set(set.sessionId, []);
    groups.get(set.sessionId)!.push(set);
  }
  return [...groups.entries()]
    .map(([sessionId, list]) => {
      const s = byId.get(sessionId);
      const sorted = list.sort((a, b) => a.setNumber - b.setNumber);
      return {
        sessionId,
        at: s?.startedAt ?? sorted[0].completedAt,
        badDay: s?.flags.badDay ?? !!sorted[0].badDay,
        deload: s?.flags.deload ?? !!sorted[0].deload,
        sets: sorted,
      };
    })
    .sort((a, b) => b.at - a.at);
}

/** Apply the pull-up roadmap stage to Session A pull-ups. */
export function applyStage(p: Prescription, settings: Pick<Settings, 'pullupStage'>): Prescription {
  if (p.key !== 'A.pullup') return p;
  const stage = PULLUP_ROADMAP[clampStage(settings.pullupStage)];
  return {
    ...p,
    name: stage.loadable ? 'Weighted pull-up' : 'Pull-up',
    sets: { min: stage.sets, max: stage.sets },
    reps: stage.reps,
    loadable: !!stage.loadable,
  };
}

export function clampStage(stage: number) {
  return Math.max(0, Math.min(PULLUP_ROADMAP.length - 1, stage | 0));
}

/** Variations that form the easiest → hardest progression chain. */
export function chainOf(p: Prescription): Variation[] {
  return (p.variations ?? []).filter((v) => !v.alt);
}

export function variationOf(p: Prescription, id?: string): Variation | undefined {
  return p.variations?.find((v) => v.id === id);
}

export function isLoadable(p: Prescription, variationId?: string): boolean {
  const v = variationOf(p, variationId);
  return v ? !!v.loadable : !!p.loadable;
}

/** The variation to use when none has been chosen yet. */
export function defaultVariationFor(p: Prescription, settings: Settings): string | undefined {
  if (settings.variations[p.key]) return settings.variations[p.key];
  if (p.key === 'M.pushup') {
    // Micro push-ups: one notch easier than the Session B variation.
    const b = PRESCRIPTIONS['B.pushup'];
    const bVar = settings.variations['B.pushup'] ?? b.defaultVariation;
    const list = p.variations ?? [];
    const idx = list.findIndex((v) => v.id === bVar);
    if (idx > 0) return list[idx - 1].id;
  }
  return p.defaultVariation;
}

export function suggest(
  p: Prescription,
  plannedSets: number,
  history: SlotSession[],
  settings: Settings,
  ctx: { badDay: boolean; deload: boolean },
): Suggestion {
  const variationId = defaultVariationFor(p, settings);
  const loadKg = settings.loads[p.key] ?? lastLoad(history);
  const plan: SlotPlan = { variationId, loadKg: isLoadable(p, variationId) ? loadKg ?? 0 : undefined };
  const fill = (n: number) => Array.from({ length: plannedSets }, () => n);
  const base = { slot: p.key, plan };

  const relevant = history.filter((h) => !h.badDay && !h.deload);
  const last = relevant[0];
  const lastAny = history[0];

  if (ctx.deload) {
    return { ...base, kind: 'deload', repsTarget: fill(p.reps.min), message: 'Deload: same load, stop at ~3–4 RIR.' };
  }
  if (ctx.badDay) {
    const reps = lastAny ? repsOf(lastAny, plannedSets, p) : fill(p.reps.min);
    return { ...base, kind: 'bad-day', repsTarget: reps, message: "Bad day: ~3 RIR, don't chase progression. Showing up is the win." };
  }
  if (!last) {
    const loadable = isLoadable(p, variationId);
    const what = p.assisted ? 'the assistance' : p.variations ? (loadable ? 'a variation and load' : 'a variation') : loadable ? 'a load' : undefined;
    return {
      ...base,
      kind: 'first',
      repsTarget: fill(p.reps.min),
      message: what
        ? `First log: choose ${what} so ${rangeText(p.reps)} reps lands at ${rangeText(p.rir)} RIR.`
        : `First log: full range only, stop at ${rangeText(p.rir)} RIR.`,
    };
  }

  const stall = detectStall(p, relevant);
  const lastVariation = last.sets[0]?.variationId;
  const lastLoadKg = last.sets[0]?.loadKg ?? 0;
  const sameVariation = !p.variations || !lastVariation || lastVariation === variationId;
  const sameLoad = !plan.loadKg || plan.loadKg === lastLoadKg;
  if (!sameVariation || !sameLoad) {
    return {
      ...base,
      kind: 'changed',
      stall,
      repsTarget: fill(p.reps.min),
      message: `New ${sameVariation ? 'load' : 'variation'} since last time — start at the bottom of the range (${p.reps.min}).`,
    };
  }

  const lastReps = repsOf(last, plannedSets, p);
  const topHit = last.sets.length >= plannedSets && last.sets.every((s) => s.reps >= p.reps.max);

  if (topHit && p.key === 'A.pullup') {
    const stageIdx = clampStage(settings.pullupStage);
    const stage = PULLUP_ROADMAP[stageIdx];
    const needed = stage.confirmSessions ?? 1;
    const streak = topStreak(relevant, plannedSets, p.reps.max);
    if (stageIdx < PULLUP_ROADMAP.length - 1) {
      if (streak >= needed) {
        const next = PULLUP_ROADMAP[stageIdx + 1];
        return {
          ...base,
          kind: 'stage-up',
          repsTarget: fill(p.reps.max),
          nextStage: stageIdx + 1,
          message: `Roadmap: you own ${stage.label}. Advance to ${next.label}.`,
        };
      }
      return {
        ...base,
        kind: 'hold',
        repsTarget: fill(p.reps.max),
        message: `Top of range hit — repeat ${stage.label} ${needed - streak} more time to own it.`,
      };
    }
  }

  if (topHit) {
    if (isLoadable(p, variationId)) {
      const step = settings.loadStep || LOAD_STEP_KG;
      return {
        ...base,
        kind: 'add-load',
        plan: { ...plan, loadKg: (plan.loadKg ?? 0) + step },
        repsTarget: fill(p.reps.min),
        message: `Top of range on all sets → add ${step} kg, back to ${p.reps.min} reps.`,
      };
    }
    const chain = chainOf(p);
    const idx = chain.findIndex((v) => v.id === variationId);
    if (idx >= 0 && idx < chain.length - 1) {
      const next = chain[idx + 1];
      return {
        ...base,
        kind: 'next-variation',
        plan: { ...plan, variationId: next.id, loadKg: next.loadable ? 0 : undefined },
        repsTarget: fill(p.reps.min),
        message: `Top of range on all sets → move to ${next.name}, back to ${p.reps.min} reps.`,
      };
    }
    if (p.assisted) {
      return {
        ...base,
        kind: 'hold',
        repsTarget: fill(p.reps.max),
        message: 'Top of range — use less assistance and drop back to the bottom of the range.',
      };
    }
    return {
      ...base,
      kind: 'hold',
      repsTarget: fill(p.reps.max),
      message: 'Top of range on the hardest option — slow the lowering or add a set.',
    };
  }

  const targets = [...lastReps];
  let weakest = 0;
  targets.forEach((r, i) => {
    if (r < targets[weakest]) weakest = i;
  });
  targets[weakest] = Math.min(p.reps.max, targets[weakest] + 1);
  return {
    ...base,
    kind: 'add-reps',
    stall,
    repsTarget: targets,
    message: `Beat last time: ${lastReps.join('-')} → ${targets.join('-')}.`,
  };
}

function repsOf(s: SlotSession, planned: number, p: Prescription): number[] {
  return Array.from({ length: planned }, (_, i) => {
    const r = s.sets[i] ? s.sets[i].reps : p.reps.min;
    return Math.max(p.reps.min, Math.min(p.reps.max, r));
  });
}

function lastLoad(history: SlotSession[]): number | undefined {
  for (const h of history) {
    const kg = h.sets.find((s) => s.loadKg !== undefined)?.loadKg;
    if (kg !== undefined) return kg;
  }
  return undefined;
}

function topStreak(relevant: SlotSession[], planned: number, top: number): number {
  let n = 0;
  for (const h of relevant) {
    if (h.sets.length >= planned && h.sets.every((s) => s.reps >= top)) n++;
    else break;
  }
  return n;
}

/** Comparable performance score: harder variation > more load > more total reps. */
export function scoreOf(p: Prescription, s: SlotSession): number {
  const chain = chainOf(p);
  const v = s.sets[0]?.variationId;
  const rank = Math.max(0, chain.findIndex((c) => c.id === v));
  const load = s.sets[0]?.loadKg ?? 0;
  const total = s.sets.reduce((a, x) => a + x.reps, 0);
  return rank * 1e6 + load * 1e3 + total;
}

/**
 * Stall rules: 2 sessions without progress → consider a deload;
 * 3+ weeks without progress → add a set / grow the micro session.
 */
export function detectStall(p: Prescription, relevantNewestFirst: SlotSession[]): 'deload' | 'add-set' | undefined {
  if (relevantNewestFirst.length < 3) return undefined;
  const chrono = [...relevantNewestFirst].reverse();
  let best = scoreOf(p, chrono[0]);
  let bestAt = chrono[0].at;
  let sinceImprovement = 0;
  for (const s of chrono.slice(1)) {
    const score = scoreOf(p, s);
    if (score > best) {
      best = score;
      bestAt = s.at;
      sinceImprovement = 0;
    } else {
      sinceImprovement++;
    }
  }
  const latest = chrono[chrono.length - 1].at;
  if (sinceImprovement >= 2 && latest - bestAt >= 21 * DAY) return 'add-set';
  if (sinceImprovement >= 2) return 'deload';
  return undefined;
}

export function rangeText(r: { min: number; max: number }): string {
  return r.min === r.max ? `${r.min}` : `${r.min}–${r.max}`;
}

/** Estimated bodyweight pull-up max from a logged set (reps + reps in reserve). */
export function estimatePullupMax(set: Pick<SetRecord, 'exerciseId' | 'variationId' | 'loadKg' | 'reps' | 'rir'>): number | undefined {
  const bodyweightPull = set.exerciseId === 'pullup' || set.variationId === 'bodyweight';
  if (!bodyweightPull || (set.loadKg ?? 0) > 0) return undefined;
  return set.reps + (set.rir ?? 0);
}

export function weeksSince(ts: number | undefined, now: number): number | undefined {
  return ts === undefined ? undefined : Math.floor((now - ts) / (7 * DAY));
}
