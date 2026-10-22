/**
 * Rule-based coach: deterministic, offline advice before, during and after a session.
 * The Claude layer (src/coach/) reads these verdicts and adds judgement on top; it never replaces them.
 */
import { getTemplate, getVariant, isHardRowing, PRESCRIPTIONS, targetMinOf, templateOfKey, visibleVariants } from '../data/program';
import type { Prescription, TemplateId } from '../data/types';
import type { HrSummary, Readiness, SessionFlags, SessionRecord, SetRecord, Settings } from '../db/db';
import { applyStage, detectStall, groupBySession, isLoadable, rangeText, scoreOf, variationOf, weeksSince, type SlotSession, type SuggestionKind } from './progression';
import { sessionElapsedMs, type RunnerState } from './runner';
import { isFull, labelOf, ROTATION, sessionsInWeek, suggestNext, warningsFor, weekStart } from './schedule';
import type { Preparation } from './session';
import { effectiveRir, estimateDurationSec, isOptionalSlot, type WorkStep } from './steps';
import { targetFor } from './targets';
import { hrTargetText, isWorkPhase, phaseHrReport } from './rowing';

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

export interface HrContext {
  /** Latest readiness check (used when less than 12 h old). */
  readiness?: Readiness;
  /** Training load from the strap: this week's TRIMP, last week's, and this week's monotony. */
  load?: { week: number; prevWeek: number; monotony?: number };
}

export function recommendSession(sessions: SessionRecord[], sets: SetRecord[], settings: Settings, now: number, hr: HrContext = {}): SessionRecommendation {
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

  let warnings = templateId === base.templateId ? base.warnings : warningsFor(templateId, sessions, now);
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

  // Heart-rate strap: a fresh readiness check and the weekly load.
  const fresh = hr.readiness && now - hr.readiness.at < 12 * 3600 * 1000 ? hr.readiness : undefined;
  if (fresh && fresh.score !== 'go') {
    why.push(`Readiness check: ${fresh.reason}`);
    if (!flags.deload && !suggestions.some((x) => x.kind === 'bad-day')) {
      suggestions.push({ kind: 'bad-day', reason: `${fresh.reason} Train at ~3 RIR without chasing progression, or take the day.` });
    }
  }
  if (hr.load) {
    if (hr.load.monotony !== undefined && hr.load.monotony > 2 && hr.load.week > 0) {
      why.push(`Training load is monotonous this week (monotony ${hr.load.monotony}) — vary the days or keep one truly easy.`);
    }
    if (hr.load.prevWeek > 0 && hr.load.week > hr.load.prevWeek * 1.3) {
      why.push(`Training load already ${Math.round(((hr.load.week - hr.load.prevWeek) / hr.load.prevWeek) * 100)}% above last week — don't add more than planned.`);
    }
  }

  // Rowing: which of the four workouts. Hard ones (tempo / VO2max) alternate; the Z2 session covers a deload, a
  // poor readiness check, a second hard one already done this week, or Session A coming up.
  let variantId: string | undefined;
  if (templateId === 'row') {
    const rows = done.filter((s) => s.templateId === 'row');
    const hardWarnings = warningsFor('row', sessions, now, 'vo2max-30');
    const hardThisWeek = week.filter((s) => s.templateId === 'row' && isHardRowing(s.variantId)).length;
    const lastHard = rows.find((s) => isHardRowing(s.variantId));
    const longOk = dayIdx >= 5 && rows.length >= 2 && rows.slice(0, 2).every((s) => getTemplate('row').variants.find((v) => v.id === s.variantId)?.targetMin === 30);
    if (flags.deload || hardWarnings.length || hardThisWeek >= 2 || (fresh && fresh.score !== 'go')) {
      variantId = 'fat-loss-60';
      why.push(
        flags.deload
          ? 'Deload week — the Z2 rowing session keeps the habit without the recovery cost.'
          : hardThisWeek >= 2
            ? `Already ${hardThisWeek} hard rowing sessions this week — the Z2 session is the one left.`
            : fresh && fresh.score !== 'go'
              ? 'Readiness is not there for a hard rowing session — Z2 today.'
              : 'Session A is close — the Z2 session keeps the back and grip fresh for pull-ups.',
      );
    } else {
      const vo2 = !lastHard || !lastHard.variantId.startsWith('vo2max');
      variantId = vo2 ? (longOk ? 'vo2max-60' : 'vo2max-30') : longOk ? 'fat-loss-60' : 'fat-loss-30';
      why.push(`${visibleVariants(getTemplate('row')).find((v) => v.id === variantId)?.name ?? variantId}: ${lastHard ? `last hard rowing was ${lastHard.variantId}` : 'no hard rowing on record'}${longOk ? '; weekend and the last ones were 30 min, so the 60 min version' : ''}.`);
    }
    warnings = warningsFor('row', sessions, now, variantId);
  }
  const readiness: SessionRecommendation['readiness'] = todayDone || fresh?.score === 'rest' ? 'rest' : warnings.length || templateStalls.length || fresh?.score === 'caution' ? 'caution' : 'go';
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
  const targets = Object.fromEntries(Object.entries(prep.suggestions).map(([k, s]) => [k, s.repsTarget]));
  return { rows, estMin: Math.round(estimateDurationSec(prep.steps, { targets }) / 60), weights, changes };
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

export interface SetHrContext {
  /** Recovery (bpm dropped in 60 s) after the previous set of this session, when known. */
  prevRecovery?: number;
  /** The athlete's usual recovery from earlier sessions. */
  usualRecovery?: number;
  /** Mean HR of this set and of the session so far. */
  setMean?: number;
  sessionMean?: number;
  hrMax?: number;
}

export function setFeedback(state: RunnerState, step: WorkStep, record: SetRecord, today: SetRecord[], now: number, hr: SetHrContext = {}): SetFeedback {
  const template = getTemplate(state.templateId);
  const targetMin = targetMinOf(template, state.variantId);
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

  // Heart-rate recovery after the previous set, against the athlete's usual
  if (hr.prevRecovery !== undefined && hr.usualRecovery !== undefined && hr.usualRecovery >= 10) {
    if (hr.prevRecovery < hr.usualRecovery * 0.6) {
      lines.push({ priority: 3.5, text: `HR recovered only ${hr.prevRecovery} bpm after the last set vs your usual ${hr.usualRecovery} — take the full rest, and watch for a bad day.`, tone: 'warn' });
      cue ??= 'Take the full rest';
    } else if (hr.prevRecovery > hr.usualRecovery * 1.3 && verdict === 'hit') {
      lines.push({ priority: 1.2, text: `HR recovered ${hr.prevRecovery} bpm after the last set (usual ${hr.usualRecovery}) — you have room; go closer next set.`, tone: 'good' });
    }
  }
  if (hr.setMean !== undefined && hr.hrMax && hr.setMean > hr.hrMax * 0.92 && !step.restPause) {
    lines.push({ priority: 1.3, text: `Mean HR ${hr.setMean} on that set (${Math.round((hr.setMean / hr.hrMax) * 100)}% of max) — that is near your limit; rest fully.`, tone: 'info' });
  }

  // Session pace: the remaining steps at the athlete's own set durations today (per exercise when
  // logged, else the session mean), planned rests as written.
  const elapsedMin = sessionElapsedMs(state, now) / 60000;
  const remaining = state.steps.slice(state.index).filter((s) => !(s.kind === 'work' && state.done[s.id]));
  const durations = today.filter((s) => (s.durationSec ?? 0) > 0 && !stepIdOf(s).startsWith('rp:'));
  const mean = (list: SetRecord[]) => (list.length ? list.reduce((a, s) => a + s.durationSec!, 0) / list.length : undefined);
  const sessionMean = mean(durations);
  const targets = Object.fromEntries(Object.entries(state.suggestions).map(([k, s]) => [k, s.repsTarget]));
  const workSec = (st: WorkStep) => (st.restPause ? undefined : mean(durations.filter((s) => s.slot === st.slot)) ?? sessionMean);
  const projectedMin = elapsedMin + estimateDurationSec(remaining, { targets, workSec }) / 60;
  const over = remaining.some((s) => s.kind === 'work') && projectedMin > targetMin + 2;
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
    suggestion = { kind: 'skip-finisher', reason: `Projected ~${Math.round(projectedMin)} min against a ${targetMin} min target — drop the finisher, keep the primary work.` };
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
    pace: { elapsedMin: Math.round(elapsedMin * 10) / 10, projectedMin: Math.round(projectedMin), targetMin, over },
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
  /** Heart-rate observations (strap sessions only). */
  hrNotes?: string[];
}

export interface ReviewInput {
  session: SessionRecord;
  sets: SetRecord[];
  /** The session's HR summary and the previous same-template one, when a strap was worn. */
  hr?: { summary: HrSummary; previous?: HrSummary; usualRecovery?: number };
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
  const { session, sets, targets, allSets, sessions, settings, nextTime, hr } = input;
  const template = getTemplate(session.templateId);
  const durationMin = ((session.endedAt ?? session.startedAt) - session.startedAt) / 60000;
  const targetMin = targetMinOf(template, session.variantId);
  const overtime = durationMin > targetMin + 2;
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
    if (durationMin > targetMin + 5 && flags.finisher) {
      suggestions.push({ kind: 'skip-finisher', reason: `${Math.round(durationMin)} min against a ${targetMin} min target — skip the finisher next time, never the primary work.` });
    }
    for (const s of slots) {
      if (s.verdict === 'missed' && s.reps.length >= 2) suggestions.push({ kind: 'hold', slot: s.slot, reason: `${s.name}: ${s.note} Repeat the same targets next time rather than adding reps.` });
    }
  }

  // Heart rate
  let hrNotes: string[] | undefined;
  if (hr) {
    hrNotes = [];
    const z = hr.summary.zonesSec;
    const hardMin = Math.round((z[3] + z[4]) / 60);
    hrNotes.push(`Average HR ${hr.summary.avg}, max ${hr.summary.max} (${Math.round((hr.summary.max / hr.summary.hrMax) * 100)}% of max) · ${hardMin} min in zones 4–5${hr.summary.trimp !== undefined ? ` · load ${hr.summary.trimp} TRIMP` : ''}${hr.summary.kcal !== undefined ? ` · ≈ ${hr.summary.kcal} kcal` : ''}.`);
    if (hr.previous) {
      const d = hr.summary.avg - hr.previous.avg;
      const dt = hr.summary.trimp !== undefined && hr.previous.trimp !== undefined ? hr.summary.trimp - hr.previous.trimp : undefined;
      hrNotes.push(`Vs last ${template.shortName.toLowerCase()} session: average HR ${d >= 0 ? '+' : ''}${d} bpm${dt !== undefined ? `, load ${dt >= 0 ? '+' : ''}${Math.round(dt)}` : ''}${Math.abs(d) >= 8 ? (d > 0 ? ' — the same work cost more today (fatigue, heat, or harder sets)' : ' — the same work cost less: fitter or fresher') : ''}.`);
    }
    if (hr.summary.recoveryMean !== undefined) {
      const usual = hr.usualRecovery;
      hrNotes.push(`Recovery after sets: ${hr.summary.recoveryMean} bpm in 60 s${usual !== undefined ? ` (usual ${usual})` : ''}${usual !== undefined && hr.summary.recoveryMean < usual * 0.7 ? ' — slow today; recovery or sleep may be short' : ''}.`);
    }
    if (session.templateId === 'row') {
      const block = getVariant(template, session.variantId).blocks[0];
      const report = block.kind === 'interval' ? phaseHrReport(session, block.phases, settings).filter((p, i) => isWorkPhase(block.phases[i]) && p.mean !== undefined) : [];
      if (report.length) {
        const low = report.filter((p) => p.verdict === 'low').length;
        const high = report.filter((p) => p.verdict === 'high').length;
        const means = report.map((p) => `${p.label} ${p.mean}`).join(', ');
        const drift = report.length >= 2 ? report[report.length - 1].mean! - report[0].mean! : 0;
        hrNotes.push(
          `Work intervals (mean HR, target ${hrTargetText(report[0].target)} bpm): ${means}${low === report.length ? ' — all below the band: more pressure next time, or the max HR setting is high' : high === report.length ? ' — all above the band: start easier' : low || high ? ` — ${report.length - low - high}/${report.length} in the band` : ' — all in the band'}${drift >= 8 ? '; HR drifted up over the intervals, as expected when the pace holds' : ''}.`,
        );
      }
    }
    if (hr.summary.coverage < 0.8) hrNotes.push(`The strap had readings for ${Math.round(hr.summary.coverage * 100)}% of the session — check contact and battery.`);
    if (session.hr?.readiness) hrNotes.push(`Readiness check: ${session.hr.readiness.reason}`);
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
    targetMin,
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
    hrNotes,
  };
}

/** Mean 60 s recovery over the athlete's stored sets (strap sessions), or undefined. */
export function usualRecoveryOf(sets: SetRecord[], before?: number): number | undefined {
  const r = sets.filter((s) => s.hr?.recovery60 !== undefined && (before === undefined || s.completedAt < before)).map((s) => s.hr!.recovery60!);
  if (r.length < 5) return undefined;
  return Math.round(r.reduce((a, b) => a + b, 0) / r.length);
}

/* ---------- whole-history stats (for the training analysis) ---------- */

export interface SlotStats {
  slot: string;
  name: string;
  sessions: number;
  firstAt: number;
  lastAt: number;
  /** Best single-set reps ever, with its variation / load. */
  best: { reps: number; variationId?: string; loadKg?: number; at: number };
  /** Performance score (variation rank / load / mean reps) of the first and the latest normal session, and the trend. */
  first: { score: number; variationId?: string; loadKg?: number; meanReps: number };
  latest: { score: number; variationId?: string; loadKg?: number; meanReps: number };
  trend: 'up' | 'flat' | 'down';
  /** Score per normal session, oldest first (for the model to read the curve). */
  timeline: { d: number; score: number; meanReps: number; kg?: number; v?: string }[];
  stall?: 'deload' | 'add-set';
  /** Reps × sets per week over the last 12 weeks, oldest first. */
  weeklyVolume: number[];
  meanSetSec?: number;
  meanRestSec?: number;
  /** Count of sets by RIR value (index = RIR, 0–4). */
  rirHistogram: number[];
  /** Rep PRs in order: the first time each new best was set. */
  prs: { d: number; reps: number; kg?: number; v?: string }[];
}

export interface TrainingStats {
  sessions: number;
  firstAt?: number;
  lastAt?: number;
  weeks: number;
  /** Completed sessions per week over the last 8 weeks, oldest first. */
  perWeek: number[];
  /** Share of planned weekly sessions actually done over the last 8 weeks (0–1). */
  adherence: number;
  byTemplate: Record<string, { count: number; avgMin?: number; targetMin: number; badDays: number; deloads: number }>;
  weeksSinceDeload?: number;
  rir: { sets: number; atFailure: number; leftAtDefault: number };
  slots: SlotStats[];
  stalls: StallHint[];
  /** Sessions started per local hour of day (24 buckets). */
  hourHistogram: number[];
  /** Sessions by weekday, Monday first. */
  weekdayHistogram: number[];
  /** Longest gap between two completed sessions, in days. */
  longestGapDays?: number;
  /** Mean work / rest / other seconds per completed full session (A / B). */
  timeUse?: { workSec: number; restSec: number; otherSec: number };
  /** Heart-rate strap: readiness checks (oldest first) and per-template HR means. */
  hr?: {
    readiness: { d: number; restingHr: number; rmssd: number; score: Readiness['score'] }[];
    byTemplate: Record<string, { sessions: number; avg: number; max: number; trimp?: number; kcal?: number; recovery?: number }>;
    weeklyTrimp: number[];
    usualRecovery?: number;
  };
}

export function trainingStats(sessions: SessionRecord[], sets: SetRecord[], settings: Settings, now: number): TrainingStats {
  const done = sessions.filter((s) => s.endedAt).sort((a, b) => a.startedAt - b.startedAt);
  const firstAt = done[0]?.startedAt;
  const lastAt = done[done.length - 1]?.startedAt;
  const ws = weekStart(now);
  const perWeek: number[] = [];
  for (let w = 7; w >= 0; w--) perWeek.push(sessionsInWeek(sessions, ws - w * 7 * DAY).length);
  const plannedPerWeek = 4;
  const weeksTracked = firstAt === undefined ? 0 : Math.min(8, Math.floor((now - weekStart(firstAt)) / (7 * DAY)) + 1);
  const adherence = weeksTracked ? Math.min(1, perWeek.slice(-weeksTracked).reduce((a, b) => a + b, 0) / (plannedPerWeek * weeksTracked)) : 0;

  const byTemplate: TrainingStats['byTemplate'] = {};
  for (const t of ['A', 'B', 'micro', 'row'] as TemplateId[]) {
    const own = done.filter((s) => s.templateId === t);
    const mins = own.map((s) => (s.endedAt! - s.startedAt) / 60000).filter((m) => m > 3);
    byTemplate[t] = {
      count: own.length,
      avgMin: mins.length ? Math.round(mins.reduce((a, b) => a + b, 0) / mins.length) : undefined,
      targetMin: getTemplate(t).targetMin,
      badDays: own.filter((s) => s.flags.badDay).length,
      deloads: own.filter((s) => s.flags.deload).length,
    };
  }

  const workSets = sets.filter((s) => !s.slot.includes('.rp-') && s.rir !== undefined);
  const rir = {
    sets: workSets.length,
    atFailure: workSets.filter((s) => s.rir === 0).length,
    leftAtDefault: workSets.filter((s) => {
      const p = PRESCRIPTIONS[s.slot];
      return p ? s.rir === effectiveRir(p, { badDay: !!s.badDay, deload: !!s.deload }).min : false;
    }).length,
  };

  const slots: SlotStats[] = [];
  for (const [slot, base] of Object.entries(PRESCRIPTIONS)) {
    if (slot.includes('.rp-')) continue;
    const p = applyStage(base, settings);
    const history = groupBySession(
      sets.filter((s) => s.slot === slot),
      sessions,
    );
    if (!history.length) continue;
    const normal = history.filter((h) => !h.badDay && !h.deload).reverse(); // oldest first
    const all = [...history].reverse();
    const bestSet = sets.filter((s) => s.slot === slot).reduce((a, s) => (s.reps > a.reps ? s : a));
    const summary = (h: SlotSession) => ({
      score: Math.round(scoreOf(p, h) * 10) / 10,
      variationId: h.sets[0]?.variationId,
      loadKg: h.sets[0]?.loadKg,
      meanReps: Math.round((h.sets.reduce((a, s) => a + s.reps, 0) / h.sets.length) * 10) / 10,
    });
    const basis = normal.length ? normal : all;
    const first = summary(basis[0]);
    const latest = summary(basis[basis.length - 1]);
    const trend: SlotStats['trend'] = latest.score > first.score + 0.3 ? 'up' : latest.score < first.score - 0.3 ? 'down' : 'flat';
    const own = sets.filter((x) => x.slot === slot);
    const weeklyVolume: number[] = [];
    for (let w = 11; w >= 0; w--) {
      const start = ws - w * 7 * DAY;
      weeklyVolume.push(own.filter((x) => x.completedAt >= start && x.completedAt < start + 7 * DAY).reduce((a, x) => a + repsDone(x), 0));
    }
    const durations = own.map((x) => x.durationSec).filter((v): v is number => !!v && v > 0);
    const rests = own.map((x) => restTakenBefore(x, sets.filter((y) => y.sessionId === x.sessionId))?.sec).filter((v): v is number => v !== undefined);
    const rirHistogram = [0, 0, 0, 0, 0];
    for (const x of own) if (x.rir !== undefined) rirHistogram[Math.max(0, Math.min(4, x.rir))]++;
    const prs: SlotStats['prs'] = [];
    let best = 0;
    for (const x of [...own].sort((a, b) => a.completedAt - b.completedAt)) {
      if (x.reps > best) {
        best = x.reps;
        prs.push({ d: x.completedAt, reps: x.reps, kg: x.loadKg || undefined, v: x.variationId });
      }
    }
    slots.push({
      slot,
      name: p.name,
      sessions: history.length,
      firstAt: all[0].at,
      lastAt: all[all.length - 1].at,
      best: { reps: bestSet.reps, variationId: bestSet.variationId, loadKg: bestSet.loadKg, at: bestSet.completedAt },
      first,
      latest,
      trend,
      timeline: basis.map((h) => ({ d: h.at, score: summary(h).score, meanReps: summary(h).meanReps, kg: h.sets[0]?.loadKg || undefined, v: h.sets[0]?.variationId })),
      stall: detectStall(p, [...normal].reverse().slice(0, 6)),
      weeklyVolume,
      meanSetSec: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : undefined,
      meanRestSec: rests.length ? Math.round(rests.reduce((a, b) => a + b, 0) / rests.length) : undefined,
      rirHistogram,
      prs,
    });
  }

  const hourHistogram = Array.from({ length: 24 }, () => 0);
  const weekdayHistogram = Array.from({ length: 7 }, () => 0);
  let longestGapDays: number | undefined;
  for (let i = 0; i < done.length; i++) {
    const d = new Date(done[i].startedAt);
    hourHistogram[d.getHours()]++;
    weekdayHistogram[(d.getDay() + 6) % 7]++;
    if (i > 0) {
      const gap = Math.round((done[i].startedAt - done[i - 1].startedAt) / DAY);
      if (longestGapDays === undefined || gap > longestGapDays) longestGapDays = gap;
    }
  }
  const full = done.filter((s) => isFull(s.templateId));
  let timeUse: TrainingStats['timeUse'];
  if (full.length) {
    const acc = { workSec: 0, restSec: 0, otherSec: 0 };
    for (const s of full) {
      const own = sets.filter((x) => x.sessionId === s.id).sort((a, b) => a.completedAt - b.completedAt);
      const work = own.reduce((a, x) => a + (x.durationSec ?? 0), 0);
      let rest = 0;
      for (let i = 1; i < own.length; i++) {
        const gap = (own[i].completedAt - (own[i].durationSec ?? 0) * 1000 - own[i - 1].completedAt) / 1000;
        if (gap > 0 && gap <= 600) rest += gap;
      }
      acc.workSec += work;
      acc.restSec += rest;
      acc.otherSec += Math.max(0, (s.endedAt! - s.startedAt) / 1000 - work - rest);
    }
    timeUse = { workSec: Math.round(acc.workSec / full.length), restSec: Math.round(acc.restSec / full.length), otherSec: Math.round(acc.otherSec / full.length) };
  }

  // Heart-rate strap data, when any session has it
  const withHr = done.filter((s) => s.hr?.summary);
  let hrStats: TrainingStats['hr'];
  if (withHr.length || done.some((s) => s.hr?.readiness)) {
    const byTemplate: NonNullable<TrainingStats['hr']>['byTemplate'] = {};
    for (const t of ['A', 'B', 'micro', 'row']) {
      const own = withHr.filter((s) => s.templateId === t).map((s) => s.hr!.summary!);
      if (!own.length) continue;
      const mean = (f: (x: HrSummary) => number | undefined) => {
        const v = own.map(f).filter((x): x is number => x !== undefined);
        return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : undefined;
      };
      byTemplate[t] = { sessions: own.length, avg: mean((x) => x.avg)!, max: Math.max(...own.map((x) => x.max)), trimp: mean((x) => x.trimp), kcal: mean((x) => x.kcal), recovery: mean((x) => x.recoveryMean) };
    }
    const weeklyTrimp: number[] = [];
    for (let w = 11; w >= 0; w--) {
      const start = ws - w * 7 * DAY;
      weeklyTrimp.push(Math.round(withHr.filter((s) => s.startedAt >= start && s.startedAt < start + 7 * DAY).reduce((a, s) => a + (s.hr!.summary!.trimp ?? 0), 0)));
    }
    hrStats = {
      readiness: done.filter((s) => s.hr?.readiness).map((s) => ({ d: s.hr!.readiness!.at, restingHr: s.hr!.readiness!.restingHr, rmssd: s.hr!.readiness!.rmssd, score: s.hr!.readiness!.score })),
      byTemplate,
      weeklyTrimp,
      usualRecovery: usualRecoveryOf(sets),
    };
  }

  return {
    sessions: done.length,
    firstAt,
    lastAt,
    weeks: firstAt === undefined ? 0 : Math.floor((now - firstAt) / (7 * DAY)) + 1,
    perWeek,
    adherence: Math.round(adherence * 100) / 100,
    byTemplate,
    weeksSinceDeload: weeksSince(settings.lastDeloadAt ?? firstAt, now),
    rir,
    slots,
    stalls: stallsOf(sets, sessions, settings),
    hourHistogram,
    weekdayHistogram,
    longestGapDays,
    timeUse,
    hr: hrStats,
  };
}
