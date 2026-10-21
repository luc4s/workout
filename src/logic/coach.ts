/**
 * Rule-based coach: deterministic, offline advice before, during and after a session.
 * The Claude layer (src/coach/) reads these verdicts and adds judgement on top; it never replaces them.
 */
import { getTemplate, PRESCRIPTIONS, templateOfKey } from '../data/program';
import type { Prescription, TemplateId } from '../data/types';
import type { SessionFlags, SessionRecord, SetRecord, Settings } from '../db/db';
import { applyStage, detectStall, groupBySession, isLoadable, rangeText, variationOf, weeksSince, type SuggestionKind } from './progression';
import { sessionElapsedMs, type RunnerState } from './runner';
import { isFull, labelOf, ROTATION, sessionsInWeek, suggestNext, warningsFor, weekStart } from './schedule';
import type { Preparation } from './session';
import { effectiveRir, estimateDurationSec, isOptionalSlot, type WorkStep } from './steps';
import { targetFor } from './targets';

const DAY = 24 * 3600 * 1000;

/* ---------- shared ---------- */

export type CoachSuggestionKind = 'deload' | 'bad-day' | 'drop-sets' | 'hold' | 'variation' | 'load' | 'rest' | 'skip-finisher' | 'switch-session';

/** A concrete, one-tap change. Both the rule layer and Claude emit these; the app maps each kind to an existing mechanism. */
export interface CoachSuggestion {
  kind: CoachSuggestionKind;
  slot?: string;
  value?: string | number;
  reason: string;
}

export const SUGGESTION_KINDS: CoachSuggestionKind[] = ['deload', 'bad-day', 'drop-sets', 'hold', 'variation', 'load', 'rest', 'skip-finisher', 'switch-session'];

export interface StallHint {
  slot: string;
  name: string;
  stall: 'deload' | 'add-set';
}

/** Slots whose recent (non bad-day, non deload) sessions show a stall. */
export function stallsOf(sets: SetRecord[], sessions: SessionRecord[], settings: Settings): StallHint[] {
  const out: StallHint[] = [];
  for (const [slot, base] of Object.entries(PRESCRIPTIONS)) {
    if (slot.includes('.rp-') || slot === 'M.pullup') continue;
    const p = applyStage(base, settings);
    const history = groupBySession(
      sets.filter((s) => s.slot === slot),
      sessions,
    ).filter((h) => !h.badDay && !h.deload);
    const stall = detectStall(p, history.slice(0, 6));
    if (stall) out.push({ slot, name: p.name, stall });
  }
  return out;
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function slotName(slot: string): string {
  return PRESCRIPTIONS[slot]?.name ?? slot;
}

/** Reps of a set, counting both legs for per-side exercises. */
export function repsDone(s: Pick<SetRecord, 'reps' | 'repsLeft' | 'repsRight'>): number {
  return s.repsLeft !== undefined ? (s.repsLeft ?? 0) + (s.repsRight ?? 0) : s.reps;
}

/* ---------- before: which session ---------- */

export interface SessionRecommendation {
  templateId: TemplateId;
  variantId?: string;
  reason: string;
  why: string[];
  warnings: string[];
  /** Presets for the setup screen. */
  flags: Partial<SessionFlags>;
  readiness: 'go' | 'caution' | 'rest';
  confidence: 'high' | 'medium' | 'low';
  daysSinceFull?: number;
  week: { done: TemplateId[]; missing: TemplateId[] };
  stalls: StallHint[];
  weeksSinceDeload?: number;
  suggestions: CoachSuggestion[];
}

export function recommendSession(sessions: SessionRecord[], sets: SetRecord[], settings: Settings, now: number): SessionRecommendation {
  const done = sessions.filter((s) => s.endedAt).sort((a, b) => b.startedAt - a.startedAt);
  const base = suggestNext(sessions, now);
  const week = sessionsInWeek(sessions, weekStart(now));
  const doneT = [...new Set(week.map((s) => s.templateId))];
  const missing = ROTATION.filter((t) => !doneT.includes(t));
  const dayIdx = (new Date(now).getDay() + 6) % 7; // Mon = 0
  const why: string[] = [];
  let templateId = base.templateId;
  let reason = base.reason;

  const lastFull = done.find((s) => isFull(s.templateId));
  const daysSinceFull = lastFull ? Math.floor((now - lastFull.startedAt) / DAY) : undefined;
  const todayDone = done.some((s) => s.startedAt >= startOfDay(now));
  const otherFull = (t: TemplateId | undefined): TemplateId => (t === 'A' ? 'B' : 'A');

  // Full sessions come first: a missing A/B beats the rotation when it proposes a full session already
  // done this week, or (late in the week) a micro / rowing session.
  const missingFull = missing.filter(isFull);
  const fullTooRecent = !!lastFull && now - lastFull.startedAt < DAY;
  const rotationRepeatsFull = isFull(templateId) && doneT.includes(templateId) && missingFull.length === 1;
  if (missingFull.length && !fullTooRecent && (rotationRepeatsFull || (!isFull(templateId) && dayIdx >= 4))) {
    templateId = missingFull.length === 2 ? otherFull(lastFull?.templateId) : missingFull[0];
    reason = `${labelOf(templateId)} is not done this week — the two full sessions come first.`;
    why.push(reason);
  } else if (!isFull(templateId) && daysSinceFull !== undefined && daysSinceFull >= 5) {
    templateId = otherFull(lastFull!.templateId);
    reason = `${daysSinceFull} days since a full session — ${labelOf(templateId)} comes before ${labelOf(base.templateId).toLowerCase() === 'micro' ? 'the micro session' : 'rowing'}.`;
    why.push(reason);
  }

  const warnings = templateId === base.templateId ? base.warnings : warningsFor(templateId, sessions, now);
  const stalls = stallsOf(sets, sessions, settings);
  const templateStalls = stalls.filter((s) => templateOfKey(s.slot) === templateId);
  const firstAt = done.length ? Math.min(...done.map((s) => s.startedAt)) : undefined;
  const weeksSinceDeload = weeksSince(settings.lastDeloadAt ?? firstAt, now);

  const flags: Partial<SessionFlags> = {};
  const suggestions: CoachSuggestion[] = [];
  // Two or more stalled lifts (of either kind) with no recent deload → a deload week.
  if (stalls.length >= 2 && (weeksSinceDeload ?? 0) >= 6) {
    flags.deload = true;
    const names = stalls.map((s) => s.name).join(' and ');
    suggestions.push({
      kind: 'deload',
      reason: `${names} have not progressed for 2+ sessions and it has been ${weeksSinceDeload} weeks since a deload — take a deload week (1–2 sets, ~3–4 RIR, same load).`,
    });
    why.push(`Deload week suggested: ${names} stalled.`);
  } else {
    for (const s of templateStalls) {
      why.push(
        s.stall === 'add-set'
          ? `${s.name}: no progress for 3+ weeks — add a set to that pattern, or grow the micro session for it.`
          : `${s.name}: no progress in 2 sessions — if recovery is normal, consider a deload week.`,
      );
    }
    if (stalls.some((s) => s.stall === 'add-set') && templateId !== 'micro' && !doneT.includes('micro')) {
      const names = stalls.filter((s) => s.stall === 'add-set').map((s) => s.name).join(', ');
      suggestions.push({ kind: 'switch-session', value: 'micro', reason: `${names} stalled for 3+ weeks and the micro session is not done this week — extra easy volume helps.` });
    }
  }
  if (!flags.deload && weeksSinceDeload !== undefined && weeksSinceDeload >= 10) {
    why.push(`${weeksSinceDeload} weeks since your last deload — expect one roughly every 8–12 weeks, on a stall or when run-down.`);
  }
  if (daysSinceFull !== undefined && daysSinceFull >= 7 && isFull(templateId)) {
    why.push(`${daysSinceFull} days since a full session — expect the first sets to feel heavy; the targets still stand.`);
  }

  const variantId = templateId === 'row' && flags.deload ? 'steady' : undefined;
  const readiness: SessionRecommendation['readiness'] = todayDone ? 'rest' : warnings.length || templateStalls.length ? 'caution' : 'go';
  const confidence: SessionRecommendation['confidence'] = done.length < 3 ? 'low' : why.length || warnings.length ? 'medium' : 'high';

  return {
    templateId,
    variantId,
    reason,
    why,
    warnings,
    flags,
    readiness,
    confidence,
    daysSinceFull,
    week: { done: doneT, missing },
    stalls,
    weeksSinceDeload,
    suggestions,
  };
}

/* ---------- before: what the session holds ---------- */

export interface OverviewRow {
  slot: string;
  name: string;
  variationName?: string;
  sets: number;
  /** Target reps per set (empty for rest-pause mini-sets). */
  target: number[];
  reps: string;
  rir: string;
  loadKg?: number;
  perSide: boolean;
  restPause: boolean;
  change: SuggestionKind;
  message: string;
  lastReps?: number[];
  lastKg?: number;
  /** Reps on one set that would be a new best at this variation / load. */
  prChance?: number;
}

export interface SessionOverview {
  rows: OverviewRow[];
  estMin: number;
  weights: { slot: string; name: string; kg: number; lastKg?: number }[];
  changes: string[];
}

export function sessionOverview(prep: Preparation): SessionOverview {
  const rows: OverviewRow[] = [];
  const changes: string[] = [];
  for (const p of prep.prescriptions) {
    const steps = prep.steps.filter((s): s is WorkStep => s.kind === 'work' && s.slot === p.key);
    if (!steps.length) continue;
    const s = prep.suggestions[p.key];
    const plan = prep.plans[p.key] ?? s?.plan ?? {};
    const last = prep.lastTime[p.key];
    const v = variationOf(p, plan.variationId);
    const loadable = p.key === 'A.pullup' ? plan.loadKg !== undefined : isLoadable(p, plan.variationId);
    const restPause = !!steps[0].restPause;
    const target = restPause ? [] : (s?.repsTarget ?? []).slice(0, steps.length);
    const sameSetup = !!last && (last.variationId ?? p.defaultVariation) === (plan.variationId ?? p.defaultVariation) && (last.loadKg ?? 0) === (plan.loadKg ?? 0);
    const prChance = sameSetup && !last.flag && target.length && last.reps.length && Math.max(...target) > Math.max(...last.reps) ? Math.max(...target) : undefined;
    rows.push({
      slot: p.key,
      name: p.name,
      variationName: v?.name,
      sets: steps.length,
      target,
      reps: rangeText(p.reps),
      rir: rangeText(steps[0].rir),
      loadKg: loadable ? plan.loadKg ?? 0 : undefined,
      perSide: !!p.perSide,
      restPause,
      change: s?.kind ?? 'first',
      message: s?.message ?? '',
      lastReps: last?.reps,
      lastKg: last?.loadKg,
      prChance,
    });
    if (s?.kind === 'add-load') changes.push(`${p.name}: +${(plan.loadKg ?? 0) - (last?.loadKg ?? 0)} kg → ${plan.loadKg} kg`);
    else if (s?.kind === 'next-variation') changes.push(`${p.name}: move to ${v?.name ?? plan.variationId}`);
    else if (s?.kind === 'stage-up') changes.push(`${p.name}: ${s.message}`);
    else if (s?.kind === 'changed' && last) changes.push(`${p.name}: restart at the bottom of the range`);
  }
  const weights = rows.filter((r) => r.loadKg !== undefined && r.loadKg > 0).map((r) => ({ slot: r.slot, name: r.name, kg: r.loadKg!, lastKg: r.lastKg }));
  return { rows, estMin: Math.round(estimateDurationSec(prep.steps) / 60), weights, changes };
}

/* ---------- during: after each logged set ---------- */

export interface SetFeedback {
  stepId: string;
  slot: string;
  verdict: 'hit' | 'over' | 'under' | 'first';
  /** One short sentence for the rest screen. */
  headline: string;
  /** Short cue for the next set of this exercise. */
  cue?: string;
  tone: 'good' | 'info' | 'warn';
  target?: number;
  reps: number;
  rir?: number;
  restAdvice?: 'shorten' | 'extend';
  restTakenSec?: number;
  restPlannedSec?: number;
  pace: { elapsedMin: number; projectedMin: number; targetMin: number; over: boolean };
  badDaySuggested: boolean;
  suggestion?: CoachSuggestion;
}

function stepIdOf(set: SetRecord): string {
  return set.id.slice(set.id.indexOf(':') + 1);
}

/** Rest actually taken before `set`, from the previous logged set's timestamp (undefined when unknown or after a pause). */
export function restTakenBefore(set: SetRecord, today: SetRecord[]): { sec: number; prev: SetRecord } | undefined {
  const prev = today.filter((s) => s.id !== set.id && s.completedAt <= set.completedAt).sort((a, b) => b.completedAt - a.completedAt)[0];
  if (!prev) return undefined;
  const sec = (set.completedAt - (set.durationSec ?? 0) * 1000 - prev.completedAt) / 1000;
  if (sec < 0 || sec > 600) return undefined;
  return { sec, prev };
}

function clock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function setFeedback(state: RunnerState, step: WorkStep, record: SetRecord, today: SetRecord[], now: number): SetFeedback {
  const template = getTemplate(state.templateId);
  const target = targetFor(state, step);
  const reps = record.reps;
  const rir = record.rir;
  const verdict: SetFeedback['verdict'] = target === undefined ? 'first' : reps >= target + 2 ? 'over' : reps >= target ? 'hit' : 'under';
  const lines: { priority: number; text: string; tone: SetFeedback['tone'] }[] = [];
  let cue: string | undefined;

  // Reps vs target
  if (step.restPause) lines.push({ priority: 1, text: `Mini-set ${step.restPause.mini}: ${reps} reps.`, tone: 'info' });
  else if (verdict === 'hit') lines.push({ priority: 1, text: `${reps} reps — target hit.`, tone: 'good' });
  else if (verdict === 'over') lines.push({ priority: 1, text: `${reps} vs ${target} target — strong.`, tone: 'good' });
  else if (verdict === 'under') lines.push({ priority: 1, text: `${reps} of ${target} — ${target! - reps} short. Same target next set, full range only.`, tone: 'warn' });
  else lines.push({ priority: 1, text: `${reps} reps${rir !== undefined ? ` at ${rir} RIR` : ''} logged — this sets next time's target.`, tone: 'info' });
  if (verdict === 'under' && target !== undefined) cue = `Aim for ${target} again`;

  // RIR vs prescribed
  if (rir !== undefined && !step.restPause) {
    if (rir > step.rir.max + 1) {
      lines.push({ priority: 2, text: `Had more in the tank (${rir} RIR vs ${rangeText(step.rir)}) — go closer next set.`, tone: 'info' });
      cue = verdict === 'over' && rir >= 2 ? '+1 rep next set' : `Stop at ${rangeText(step.rir)} RIR`;
    } else if (rir < step.rir.min) {
      lines.push({ priority: 2, text: `That was a grind (${rir} RIR) — stop at ${rangeText(step.rir)} RIR${state.templateId === 'A' ? ' on strength work' : ''}.`, tone: 'warn' });
      cue = `Stop at ${rangeText(step.rir)} RIR`;
    } else if (verdict === 'over' && rir >= 1) {
      cue = '+1 rep next set';
    }
  }

  // Work-set duration (a long set usually means a slow setup or a chat)
  if (!step.restPause && (record.durationSec ?? 0) > 120) {
    lines.push({ priority: 1.5, text: `Set took ${clock(record.durationSec!)} — keep transitions tight.`, tone: 'info' });
    cue ??= 'Keep transitions tight';
  }

  // Rest actually taken before this set
  let restAdvice: SetFeedback['restAdvice'];
  let restTakenSec: number | undefined;
  let restPlannedSec: number | undefined;
  const taken = restTakenBefore(record, today);
  if (taken) {
    restTakenSec = taken.sec;
    const prevIdx = state.steps.findIndex((s) => s.id === stepIdOf(taken.prev));
    const rest = prevIdx >= 0 ? state.steps.slice(prevIdx + 1).find((s) => s.kind === 'rest') : undefined;
    if (rest && rest.kind === 'rest') {
      restPlannedSec = rest.durationSec;
      if (taken.sec > restPlannedSec * 1.5 + 20) {
        restAdvice = 'shorten';
        lines.push({ priority: 3, text: `Rested ${clock(taken.sec)} vs ${clock(restPlannedSec)} planned — the clock is the cue.`, tone: 'warn' });
      } else if (taken.sec < restPlannedSec * 0.6 && verdict === 'under') {
        restAdvice = 'extend';
        lines.push({ priority: 3, text: `Only ${clock(taken.sec)} rest and a miss — take the full ${clock(restPlannedSec)} before the next one.`, tone: 'warn' });
      }
    }
  }

  // Session pace
  const elapsedMin = sessionElapsedMs(state, now) / 60000;
  const remaining = state.steps.slice(state.index).filter((s) => !(s.kind === 'work' && state.done[s.id]));
  const projectedMin = elapsedMin + estimateDurationSec(remaining) / 60;
  const over = remaining.some((s) => s.kind === 'work') && projectedMin > template.targetMin + 2;
  if (over) {
    lines.push({
      priority: 4,
      text: `On pace for ~${Math.round(projectedMin)} min — tighten rests${state.flags.finisher ? ' or drop the finisher' : ''}, never the primary work.`,
      tone: 'warn',
    });
  }

  // Bad-day protocol: the first sets all well under target at low RIR on a normal day
  let badDaySuggested = false;
  let suggestion: CoachSuggestion | undefined;
  if (!state.flags.badDay && !state.flags.deload && !step.restPause) {
    const logged = today.filter((s) => !stepIdOf(s).startsWith('rp:'));
    if (logged.length >= 2 && logged.length <= 3) {
      const allUnder = logged.every((s) => {
        const st = state.steps.find((x) => x.kind === 'work' && x.id === stepIdOf(s)) as WorkStep | undefined;
        const t = st ? targetFor(state, st) : undefined;
        return t !== undefined && s.reps <= t - 2 && (s.rir ?? 0) <= 1;
      });
      if (allUnder) {
        badDaySuggested = true;
        suggestion = { kind: 'bad-day', reason: 'Every set so far is 2+ reps under target at low RIR — switch to bad-day mode: ~3 RIR, no progression chase, and the session does not count against you.' };
        lines.push({ priority: 5, text: 'Well under target on every set — bad day? Switch to ~3 RIR and keep moving.', tone: 'warn' });
      }
    }
  }
  if (over && !suggestion && state.flags.finisher && state.steps.slice(state.index).some((s) => s.kind === 'work' && (s.restPause || PRESCRIPTIONS[s.slot] && isOptionalSlot(s.slot)))) {
    suggestion = { kind: 'skip-finisher', reason: `Projected ~${Math.round(projectedMin)} min against a ${template.targetMin} min target — drop the finisher, keep the primary work.` };
  }

  const top = lines.sort((a, b) => b.priority - a.priority)[0];
  return {
    stepId: step.id,
    slot: step.slot,
    verdict,
    headline: top.text,
    cue,
    tone: top.tone,
    target,
    reps,
    rir,
    restAdvice,
    restTakenSec,
    restPlannedSec,
    pace: { elapsedMin: Math.round(elapsedMin * 10) / 10, projectedMin: Math.round(projectedMin), targetMin: template.targetMin, over },
    badDaySuggested,
    suggestion,
  };
}

/* ---------- after: the review ---------- */

export interface ReviewSlot {
  slot: string;
  name: string;
  variationName?: string;
  reps: number[];
  rir: (number | undefined)[];
  loadKg?: number;
  target?: number[];
  verdict: 'beat' | 'hit' | 'partial' | 'missed' | 'first';
  note: string;
  volume: number;
  lastVolume?: number;
  restPause: boolean;
}

export interface SessionReview {
  headline: string;
  durationMin: number;
  targetMin: number;
  overtime: boolean;
  timeUse?: { workSec: number; restSec: number; otherSec: number };
  slots: ReviewSlot[];
  totalReps: number;
  volumeDelta?: { reps: number; pct: number; sessionAt: number };
  rirHints: string[];
  prs: string[];
  stalls: StallHint[];
  nextTime: { slot: string; name: string; message: string }[];
  suggestions: CoachSuggestion[];
}

export interface ReviewInput {
  session: SessionRecord;
  sets: SetRecord[];
  /** Targets the session was run with (`session.coach.targets`); absent on sessions logged before the coach existed. */
  targets?: Record<string, number[]>;
  /** Every logged set, this session included. */
  allSets: SetRecord[];
  sessions: SessionRecord[];
  settings: Settings;
  nextTime: { slot: string; name: string; message: string }[];
}

export function groupSlotsPure(sets: SetRecord[]): [string, SetRecord[]][] {
  const map = new Map<string, SetRecord[]>();
  for (const s of [...sets].sort((a, b) => a.completedAt - b.completedAt)) {
    if (!map.has(s.slot)) map.set(s.slot, []);
    map.get(s.slot)!.push(s);
  }
  for (const list of map.values()) list.sort((a, b) => a.setNumber - b.setNumber);
  return [...map.entries()];
}

/** Rep PRs: best single set for a slot at the same variation and load, versus all earlier sets. */
export function findPrsIn(sets: SetRecord[], previousSets: SetRecord[]): string[] {
  const out: string[] = [];
  for (const [slot, list] of groupSlotsPure(sets)) {
    if (slot.includes('.rp-')) continue;
    const best = Math.max(...list.map((s) => s.reps));
    const v = list[0].variationId;
    const kg = list[0].loadKg ?? 0;
    const previous = previousSets.filter((s) => s.slot === slot && s.variationId === v && (s.loadKg ?? 0) === kg);
    if (previous.length === 0) continue;
    const prevBest = Math.max(...previous.map((s) => s.reps));
    if (best > prevBest) out.push(`Rep PR on ${slotName(slot)}: ${best} reps${kg ? ` @ +${kg} kg` : ''} (previous best ${prevBest}).`);
  }
  return out;
}

export function sessionReview(input: ReviewInput): SessionReview {
  const { session, sets, targets, allSets, sessions, settings, nextTime } = input;
  const template = getTemplate(session.templateId);
  const durationMin = ((session.endedAt ?? session.startedAt) - session.startedAt) / 60000;
  const overtime = durationMin > template.targetMin + 2;
  const previousSets = allSets.filter((s) => s.completedAt < session.startedAt && s.sessionId !== session.id);
  const flags = session.flags;

  // Per slot
  const slots: ReviewSlot[] = [];
  for (const [slot, list] of groupSlotsPure(sets)) {
    const p = PRESCRIPTIONS[slot] as Prescription | undefined;
    const target = targets?.[slot];
    const reps = list.map((s) => s.reps);
    const restPause = slot.includes('.rp-');
    let verdict: ReviewSlot['verdict'] = 'first';
    let note = '';
    if (!restPause && target && target.length) {
      const pairs = reps.map((r, i) => [r, target[i] ?? target[target.length - 1]] as const);
      const hits = pairs.filter(([r, t]) => r >= t).length;
      const beats = pairs.filter(([r, t]) => r > t).length;
      const planned = Math.max(target.length, reps.length);
      const missing = target.length - reps.length;
      // Sets that were never logged cap the verdict at "partial"; the ratio is over the sets actually done.
      verdict = missing > 0 ? (hits * 2 >= reps.length ? 'partial' : 'missed') : hits === planned ? (beats > 0 ? 'beat' : 'hit') : hits * 2 >= planned ? 'partial' : 'missed';
      note =
        verdict === 'beat'
          ? `Beat the target on ${beats} set${beats > 1 ? 's' : ''}.`
          : verdict === 'hit'
            ? 'Every set on target.'
            : missing > 0
              ? `${missing} set${missing > 1 ? 's' : ''} not logged; ${hits}/${reps.length} logged sets on target.`
              : `${hits}/${planned} sets on target — ${pairs.filter(([r, t]) => r < t).map(([r, t]) => `${r}/${t}`).join(', ')}.`;
    } else if (restPause) {
      note = `Rest-pause: ${reps.join(' + ')} = ${reps.reduce((a, b) => a + b, 0)} reps.`;
    } else {
      note = 'No target recorded — this session sets the bar.';
    }
    const lastSame = previousSets.filter((s) => s.slot === slot);
    const lastSession = lastSame.length ? lastSame.reduce((a, b) => (b.completedAt > a.completedAt ? b : a)).sessionId : undefined;
    const lastVolume = lastSession !== undefined ? lastSame.filter((s) => s.sessionId === lastSession).reduce((a, s) => a + repsDone(s), 0) : undefined;
    slots.push({
      slot,
      name: p?.name ?? slot,
      variationName: p ? variationOf(p, list[0].variationId)?.name : undefined,
      reps,
      rir: list.map((s) => s.rir),
      loadKg: list[0].loadKg,
      target,
      verdict,
      note,
      volume: list.reduce((a, s) => a + repsDone(s), 0),
      lastVolume,
      restPause,
    });
  }

  // Time use
  let timeUse: SessionReview['timeUse'];
  if (sets.length) {
    const chrono = [...sets].sort((a, b) => a.completedAt - b.completedAt);
    const workSec = chrono.reduce((a, s) => a + (s.durationSec ?? 0), 0);
    let restSec = 0;
    for (let i = 1; i < chrono.length; i++) {
      const gap = (chrono[i].completedAt - (chrono[i].durationSec ?? 0) * 1000 - chrono[i - 1].completedAt) / 1000;
      if (gap > 0 && gap <= 600) restSec += gap;
    }
    const total = durationMin * 60;
    timeUse = { workSec: Math.round(workSec), restSec: Math.round(restSec), otherSec: Math.round(Math.max(0, total - workSec - restSec)) };
  }

  // Volume vs the last normal session of the same template
  const totalReps = sets.reduce((a, s) => a + repsDone(s), 0);
  const lastNormal = sessions
    .filter((s) => s.id !== session.id && s.endedAt && s.templateId === session.templateId && !s.flags.badDay && !s.flags.deload && s.startedAt < session.startedAt)
    .sort((a, b) => b.startedAt - a.startedAt)[0];
  let volumeDelta: SessionReview['volumeDelta'];
  if (lastNormal) {
    const lastReps = allSets.filter((s) => s.sessionId === lastNormal.id).reduce((a, s) => a + repsDone(s), 0);
    if (lastReps > 0) volumeDelta = { reps: totalReps - lastReps, pct: Math.round(((totalReps - lastReps) / lastReps) * 100), sessionAt: lastNormal.startedAt };
  }

  // RIR calibration
  const rirHints: string[] = [];
  for (const s of slots) {
    if (s.restPause || !s.target) continue;
    const allConservative = s.reps.length > 0 && s.reps.every((r, i) => r >= (s.target![i] ?? s.target![s.target!.length - 1]) + 2 && (s.rir[i] ?? 0) >= 2);
    if (allConservative) rirHints.push(`${s.name}: every set 2+ over target at 2+ RIR — the target was too easy; the next one will be higher, and you can go closer to failure.`);
  }
  const failures = sets.filter((s) => !s.slot.includes('.rp-') && s.rir === 0).length;
  if (session.templateId === 'A' && failures >= 2 && !flags.badDay && !flags.deload) {
    rirHints.push(`${failures} strength sets taken to failure (0 RIR) — keep 1–2 RIR on Session A; failure costs recovery without buying strength.`);
  }
  const defaults = sets.filter((s) => !s.slot.includes('.rp-')).map((s) => {
    const p = PRESCRIPTIONS[s.slot];
    return p ? s.rir === effectiveRir(p, flags).min : false;
  });
  if (defaults.length >= 4 && defaults.every(Boolean)) {
    rirHints.push('RIR was left at the default on every set — log it honestly; it drives next time\'s targets and the rest-pause pick.');
  }

  const prs = findPrsIn(sets, previousSets);
  const stalls = stallsOf(allSets, sessions, settings).filter((s) => templateOfKey(s.slot) === session.templateId);

  // Suggestions (none on a bad day: nothing counts)
  const suggestions: CoachSuggestion[] = [];
  if (!flags.badDay && !flags.deload) {
    const deloadStall = stalls.find((s) => s.stall === 'deload');
    if (deloadStall) suggestions.push({ kind: 'deload', reason: `${deloadStall.name} has not progressed in 2 sessions — if recovery is normal, make next week a deload.` });
    if (durationMin > template.targetMin + 5 && flags.finisher) {
      suggestions.push({ kind: 'skip-finisher', reason: `${Math.round(durationMin)} min against a ${template.targetMin} min target — skip the finisher next time, never the primary work.` });
    }
    for (const s of slots) {
      if (s.verdict === 'missed' && s.reps.length >= 2) suggestions.push({ kind: 'hold', slot: s.slot, reason: `${s.name}: ${s.note} Repeat the same targets next time rather than adding reps.` });
    }
  }

  const scored = slots.filter((s) => !s.restPause && s.target);
  const onTarget = scored.filter((s) => s.verdict === 'beat' || s.verdict === 'hit').length;
  const parts = [`${template.shortName} in ${Math.round(durationMin)} min`];
  if (scored.length) parts.push(`${onTarget}/${scored.length} exercises on target`);
  else if (slots.length) parts.push(`${slots.length} exercise${slots.length > 1 ? 's' : ''} logged`);
  if (prs.length) parts.push(`${prs.length} PR${prs.length > 1 ? 's' : ''}`);
  if (flags.badDay) parts.push('bad day — it does not count against you');
  if (flags.deload) parts.push('deload');

  return {
    headline: parts.join(' · '),
    durationMin: Math.round(durationMin * 10) / 10,
    targetMin: template.targetMin,
    overtime,
    timeUse,
    slots,
    totalReps,
    volumeDelta,
    rirHints,
    prs,
    stalls,
    nextTime,
    suggestions,
  };
}
