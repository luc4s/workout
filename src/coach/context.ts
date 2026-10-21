/**
 * The "context pack": the compact JSON sent to Claude with each call. Everything the model sees is
 * built here, so this file documents exactly what leaves the device: dates, settings (no key), the
 * last few sessions compressed per slot, the rule layer's verdict and today's session so far.
 */
import { getTemplate, PRESCRIPTIONS, PULLUP_ROADMAP, templateOfKey } from '../data/program';
import type { TemplateId } from '../data/types';
import type { SessionRecord, SetRecord, Settings } from '../db/db';
import { restTakenBefore, type SessionOverview, type SessionRecommendation, type SessionReview, type SetFeedback, type TrainingStats } from '../logic/coach';
import { clampStage, weeksSince } from '../logic/progression';
import { sessionElapsedMs, type RunnerState } from '../logic/runner';
import { ROTATION, sessionsInWeek, weekStart } from '../logic/schedule';
import { nextWorkStep, type WorkStep } from '../logic/steps';
import { loadFor, targetFor } from '../logic/targets';
import { localDate } from './store';

export interface RecentSession {
  d: string;
  t: TemplateId;
  flags?: string;
  min?: number;
  notes?: string;
  slots: Record<string, { v?: string; kg?: number; reps: number[]; rir?: (number | null)[] }>;
}

export interface TodaySet {
  slot: string;
  n: number;
  reps: number;
  target?: number;
  rir?: number;
  kg?: number;
  restSec?: number;
}

export interface CoachContext {
  today: string;
  athlete: {
    bodyweightKg?: number;
    pullupMax: number;
    pullupStage: string;
    restScale: number;
    loadStep: number;
    weeksSinceDeload?: number;
    variations: Record<string, string>;
    loads: Record<string, number>;
  };
  week: { done: TemplateId[]; missing: TemplateId[] };
  recent: RecentSession[];
  rules: unknown;
  today_session?: {
    t: TemplateId;
    flags: string[];
    elapsedMin: number;
    targetMin: number;
    sets: TodaySet[];
    upNext?: { slot: string; n: number; target?: number; rir: string; kg?: number };
  };
}

function dayLabel(ts: number): string {
  const d = new Date(ts);
  return `${localDate(ts)} ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]}`;
}

function flagsOf(s: SessionRecord): string | undefined {
  const f = [s.flags.badDay ? 'bad-day' : '', s.flags.deload ? 'deload' : '', !s.flags.finisher ? 'no-finisher' : ''].filter(Boolean);
  return f.length ? f.join(',') : undefined;
}

/** Last `n` completed sessions, newest first, each compressed to reps / RIR per slot. */
export function recentSessions(sessions: SessionRecord[], sets: SetRecord[], n: number, before?: number, withNotes = false): RecentSession[] {
  const done = sessions
    .filter((s) => s.endedAt && (before === undefined || s.startedAt < before))
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, n);
  return done.map((s) => {
    const own = sets.filter((x) => x.sessionId === s.id).sort((a, b) => a.setNumber - b.setNumber);
    const slots: RecentSession['slots'] = {};
    for (const x of own) {
      const e = (slots[x.slot] ??= { reps: [] });
      if (x.variationId) e.v = x.variationId;
      if (x.loadKg) e.kg = x.loadKg;
      e.reps.push(x.reps);
      if (x.rir !== undefined) (e.rir ??= []).push(x.rir);
    }
    const out: RecentSession = { d: dayLabel(s.startedAt), t: s.templateId, slots };
    const f = flagsOf(s);
    if (f) out.flags = f;
    if (s.endedAt) out.min = Math.round((s.endedAt - s.startedAt) / 60000);
    if (withNotes && s.notes) out.notes = s.notes.slice(0, 300);
    return out;
  });
}

function athlete(settings: Settings, sessions: SessionRecord[], now: number): CoachContext['athlete'] {
  const done = sessions.filter((s) => s.endedAt);
  const firstAt = done.length ? Math.min(...done.map((s) => s.startedAt)) : undefined;
  return {
    bodyweightKg: settings.bodyweightKg,
    pullupMax: settings.pullupMax,
    pullupStage: `${clampStage(settings.pullupStage)}: ${PULLUP_ROADMAP[clampStage(settings.pullupStage)].label}`,
    restScale: settings.restScale,
    loadStep: settings.loadStep,
    weeksSinceDeload: weeksSince(settings.lastDeloadAt ?? firstAt, now),
    variations: settings.variations,
    loads: settings.loads,
  };
}

function weekOf(sessions: SessionRecord[], now: number): CoachContext['week'] {
  const done = [...new Set(sessionsInWeek(sessions, weekStart(now)).map((s) => s.templateId))];
  return { done, missing: ROTATION.filter((t) => !done.includes(t)) };
}

/** Slot keys Claude may refer to for a template (used to validate its suggestions). */
export function slotsOfTemplate(templateId: TemplateId): string[] {
  return Object.keys(PRESCRIPTIONS).filter((k) => templateOfKey(k) === templateId);
}

export function buildBriefContext(input: {
  rec: SessionRecommendation;
  overview?: SessionOverview;
  sessions: SessionRecord[];
  sets: SetRecord[];
  settings: Settings;
  now: number;
}): CoachContext {
  const { rec, overview, sessions, sets, settings, now } = input;
  return {
    today: dayLabel(now),
    athlete: athlete(settings, sessions, now),
    week: weekOf(sessions, now),
    recent: recentSessions(sessions, sets, 8),
    rules: {
      recommended: {
        session: rec.templateId,
        variant: rec.variantId,
        reason: rec.reason,
        why: rec.why,
        warnings: rec.warnings,
        readiness: rec.readiness,
        confidence: rec.confidence,
        daysSinceFull: rec.daysSinceFull,
        presets: rec.flags,
        stalls: rec.stalls.map((s) => ({ slot: s.slot, kind: s.stall })),
        suggestions: rec.suggestions,
      },
      plan: overview
        ? {
            estMin: overview.estMin,
            changes: overview.changes,
            slots: overview.rows.map((r) => ({
              slot: r.slot,
              v: r.variationName,
              sets: r.sets,
              target: r.target,
              rir: r.rir,
              kg: r.loadKg,
              last: r.lastReps,
              lastKg: r.lastKg,
              change: r.change,
              note: r.message,
              prChance: r.prChance,
            })),
          }
        : undefined,
    },
  };
}

export function buildRestContext(input: {
  state: RunnerState;
  feedback: SetFeedback;
  today: SetRecord[];
  sessions: SessionRecord[];
  sets: SetRecord[];
  settings: Settings;
  now: number;
}): CoachContext {
  const { state, feedback, today, sessions, sets, settings, now } = input;
  const template = getTemplate(state.templateId);
  const chrono = [...today].sort((a, b) => a.completedAt - b.completedAt);
  const todaySets: TodaySet[] = chrono.map((s) => {
    const stepId = s.id.slice(s.id.indexOf(':') + 1);
    const step = state.steps.find((x) => x.kind === 'work' && x.id === stepId) as WorkStep | undefined;
    const out: TodaySet = { slot: s.slot, n: s.setNumber, reps: s.reps };
    const t = step ? targetFor(state, step) : undefined;
    if (t !== undefined) out.target = t;
    if (s.rir !== undefined) out.rir = s.rir;
    if (s.loadKg) out.kg = s.loadKg;
    const rest = restTakenBefore(s, chrono);
    if (rest) out.restSec = Math.round(rest.sec);
    return out;
  });
  const next = nextWorkStep(state.steps, state.index);
  const upNext =
    next && next.kind === 'work'
      ? { slot: next.slot, n: next.restPause?.mini ?? next.setNumber, target: targetFor(state, next), rir: `${next.rir.min}–${next.rir.max}`, kg: loadFor(state, next) || undefined }
      : undefined;
  const flags = [state.flags.badDay ? 'bad-day' : '', state.flags.deload ? 'deload' : '', state.flags.finisher ? 'finisher' : 'no-finisher'].filter(Boolean);
  return {
    today: dayLabel(now),
    athlete: athlete(settings, sessions, now),
    week: weekOf(sessions, now),
    recent: recentSessions(sessions, sets, 4, state.startedAt),
    rules: {
      lastSet: feedback,
      lastTime: state.lastTime[feedback.slot],
      plannedTargets: state.suggestions[feedback.slot]?.repsTarget,
      planMessage: state.suggestions[feedback.slot]?.message,
    },
    today_session: { t: state.templateId, flags, elapsedMin: Math.round(sessionElapsedMs(state, now) / 6000) / 10, targetMin: template.targetMin, sets: todaySets, upNext },
  };
}

export function buildReviewContext(input: {
  review: SessionReview;
  session: SessionRecord;
  sets: SetRecord[];
  sessions: SessionRecord[];
  allSets: SetRecord[];
  settings: Settings;
  now: number;
}): CoachContext {
  const { review, session, sets, sessions, allSets, settings, now } = input;
  const chrono = [...sets].sort((a, b) => a.completedAt - b.completedAt);
  const todaySets: TodaySet[] = chrono.map((s) => {
    const out: TodaySet = { slot: s.slot, n: s.setNumber, reps: s.reps };
    const t = session.coach?.targets?.[s.slot]?.[s.setNumber - 1];
    if (t !== undefined) out.target = t;
    if (s.rir !== undefined) out.rir = s.rir;
    if (s.loadKg) out.kg = s.loadKg;
    const rest = restTakenBefore(s, chrono);
    if (rest) out.restSec = Math.round(rest.sec);
    return out;
  });
  const flags = [session.flags.badDay ? 'bad-day' : '', session.flags.deload ? 'deload' : '', session.flags.finisher ? 'finisher' : 'no-finisher'].filter(Boolean);
  return {
    today: dayLabel(now),
    athlete: athlete(settings, sessions, now),
    week: weekOf(sessions, now),
    recent: recentSessions(sessions, allSets, 8, session.startedAt, true),
    rules: {
      ...review,
      slots: review.slots.map((s) => ({ slot: s.slot, v: s.variationName, reps: s.reps, rir: s.rir, kg: s.loadKg, target: s.target, verdict: s.verdict, note: s.note, volume: s.volume, lastVolume: s.lastVolume })),
    },
    today_session: {
      t: session.templateId,
      flags,
      elapsedMin: review.durationMin,
      targetMin: review.targetMin,
      sets: todaySets,
      ...(session.notes ? { notes: session.notes.slice(0, 500) } : {}),
    },
  };
}

/** Whole-history analysis: the rule layer's stats plus every completed session (newest first, capped). */
export function buildAnalysisContext(input: { stats: TrainingStats; sessions: SessionRecord[]; sets: SetRecord[]; settings: Settings; now: number }): CoachContext {
  const { stats, sessions, sets, settings, now } = input;
  const d = (ts?: number) => (ts === undefined ? undefined : localDate(ts));
  return {
    today: dayLabel(now),
    athlete: athlete(settings, sessions, now),
    week: weekOf(sessions, now),
    recent: recentSessions(sessions, sets, 60, undefined, true).map((r) => (r.notes ? { ...r, notes: r.notes.slice(0, 120) } : r)),
    rules: {
      sessions: stats.sessions,
      firstSession: d(stats.firstAt),
      lastSession: d(stats.lastAt),
      weeks: stats.weeks,
      sessionsPerWeekLast8: stats.perWeek,
      adherence: stats.adherence,
      byTemplate: stats.byTemplate,
      weeksSinceDeload: stats.weeksSinceDeload,
      rir: stats.rir,
      stalls: stats.stalls.map((x) => ({ slot: x.slot, kind: x.stall })),
      slots: stats.slots.map((x) => ({
        slot: x.slot,
        sessions: x.sessions,
        first: { d: d(x.firstAt), ...x.first },
        latest: { d: d(x.lastAt), ...x.latest },
        trend: x.trend,
        best: { reps: x.best.reps, v: x.best.variationId, kg: x.best.loadKg, d: d(x.best.at) },
        timeline: x.timeline.map((t) => ({ d: d(t.d), score: t.score, meanReps: t.meanReps, kg: t.kg, v: t.v })),
        stall: x.stall,
      })),
    },
  };
}
