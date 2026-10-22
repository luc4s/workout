import { getTemplate, getVariant, PULLUP_ROADMAP } from '../data/program';
import type { Prescription, TemplateId } from '../data/types';
import { db, getSettings, saveRunner, saveSettings, type SessionFlags, type SessionRecord, type SetHr, type SetRecord, type Settings } from '../db/db';
import { finalizeHr, recorder } from '../hr/recorder';
import {
  applyStage,
  clampStage,
  estimatePullupMax,
  groupBySession,
  suggest,
  type SlotSession,
  type Suggestion,
} from './progression';
import { createRunner, type LastTime, type RunnerState, type SlotPlan } from './runner';
import { buildSteps, plannedSets, type Step, type WorkStep } from './steps';

export interface SessionOptions {
  templateId: TemplateId;
  variantId: string;
  flags: SessionFlags;
  restPauseSlot?: string;
  /** Variations picked on the setup screen, by slot (override the remembered ones). */
  variations?: Record<string, string>;
}

/** Prescriptions used by a template (with roadmap applied), keyed by slot. */
export function slotsOf(templateId: TemplateId, variantId: string | undefined, settings: Settings): Prescription[] {
  const variant = getVariant(getTemplate(templateId), variantId);
  return variant.blocks
    .flatMap((b) => (b.kind === 'pair' || b.kind === 'rest-pause' ? b.exercises : []))
    .map((p) => applyStage(p, settings));
}

export async function loadHistory(slots: string[]): Promise<Record<string, SlotSession[]>> {
  const [sets, sessions] = await Promise.all([db.sets.where('slot').anyOf(slots).toArray(), db.sessions.toArray()]);
  const ended = new Set(sessions.filter((s) => s.endedAt).map((s) => s.id));
  const out: Record<string, SlotSession[]> = {};
  for (const slot of slots) {
    out[slot] = groupBySession(
      sets.filter((s) => s.slot === slot && ended.has(s.sessionId)),
      sessions,
    );
  }
  return out;
}

export interface Preparation {
  steps: Step[];
  suggestions: Record<string, Suggestion>;
  plans: Record<string, SlotPlan>;
  lastTime: Record<string, LastTime>;
  prescriptions: Prescription[];
  settings: Settings;
}

export async function prepareSession(opts: SessionOptions): Promise<Preparation> {
  const stored = await getSettings();
  const settings = opts.variations ? { ...stored, variations: { ...stored.variations, ...opts.variations } } : stored;
  const template = getTemplate(opts.templateId);
  const steps = buildSteps(template, opts.variantId, {
    ...opts.flags,
    restPauseSlot: opts.restPauseSlot,
    restScale: settings.restScale,
    override: (p) => applyStage(p, settings),
  });
  const prescriptions = slotsOf(opts.templateId, opts.variantId, settings);
  const history = await loadHistory(prescriptions.map((p) => p.key));
  const suggestions: Record<string, Suggestion> = {};
  const plans: Record<string, SlotPlan> = {};
  const lastTime: Record<string, LastTime> = {};
  for (const p of prescriptions) {
    const planned = steps.filter((s) => s.kind === 'work' && s.slot === p.key).length || plannedSets(p, opts.flags);
    const s = suggest(p, planned, history[p.key] ?? [], settings, opts.flags);
    suggestions[p.key] = s;
    plans[p.key] = s.plan;
    // "Last time" is the session the targets were built from, so the two always agree.
    const slotHistory = history[p.key] ?? [];
    const last = slotHistory.find((h) => h.sessionId === s.basisSessionId) ?? slotHistory[0];
    if (last) lastTime[p.key] = lastTimeOf(last);
  }
  return { steps, suggestions, plans, lastTime, prescriptions, settings };
}

export function lastTimeOf(h: SlotSession): LastTime {
  return {
    at: h.at,
    reps: h.sets.map((x) => x.reps),
    loadKg: h.sets[0]?.loadKg,
    variationId: h.sets[0]?.variationId,
    flag: h.badDay ? 'bad-day' : h.deload ? 'deload' : undefined,
  };
}

export async function startSession(opts: SessionOptions, prep: Preparation): Promise<RunnerState> {
  const now = Date.now();
  const sessionId = await db.sessions.add({
    templateId: opts.templateId,
    variantId: opts.variantId,
    startedAt: now,
    flags: opts.flags,
  });
  if (opts.flags.deload) await saveSettings({ lastDeloadAt: now });
  const runner = createRunner({
    sessionId,
    templateId: opts.templateId,
    variantId: opts.variantId,
    flags: opts.flags,
    steps: prep.steps,
    plans: prep.plans,
    suggestions: prep.suggestions,
    lastTime: prep.lastTime,
    now,
  });
  await saveRunner(runner);
  await db.kv.delete('coach:next');
  return runner;
}

export interface SetInput {
  reps: number;
  repsLeft?: number;
  repsRight?: number;
  loadKg?: number;
  rir?: number;
  durationSec?: number;
  hr?: SetHr;
}

export async function logSet(runner: RunnerState, step: WorkStep, input: SetInput): Promise<SetRecord> {
  const plan = runner.plans[step.slot] ?? {};
  const record: SetRecord = {
    id: `${runner.sessionId}:${step.id}`,
    sessionId: runner.sessionId,
    templateId: runner.templateId,
    slot: step.slot,
    exerciseId: step.exerciseId,
    variationId: plan.variationId,
    setNumber: step.restPause ? step.restPause.mini : step.setNumber,
    ...input,
    completedAt: Date.now(),
    badDay: runner.flags.badDay || undefined,
    deload: runner.flags.deload || undefined,
  };
  await db.sets.put(record);

  // Remember variation / load choices for next time.
  const settings = await getSettings();
  const patch: Partial<Settings> = {};
  if (plan.variationId && settings.variations[step.slot] !== plan.variationId) {
    patch.variations = { ...settings.variations, [step.slot]: plan.variationId };
  }
  if (input.loadKg !== undefined && settings.loads[step.slot] !== input.loadKg) {
    patch.loads = { ...settings.loads, [step.slot]: input.loadKg };
  }
  const est = estimatePullupMax(record);
  if (est !== undefined && est > settings.pullupMax && !runner.flags.badDay) patch.pullupMax = est;
  if (Object.keys(patch).length) await saveSettings(patch);
  return record;
}

export async function finishSession(runner: RunnerState, extra: { notes?: string; rowing?: SessionRecord['rowing'] } = {}) {
  const current = await db.sessions.get(runner.sessionId);
  const targets = Object.fromEntries(Object.entries(runner.suggestions).map(([slot, s]) => [slot, s.repsTarget]));
  const coach = { ...current?.coach, targets, ...(runner.coach?.notes && Object.keys(runner.coach.notes).length ? { notes: runner.coach.notes } : {}) };
  await db.sessions.update(runner.sessionId, { endedAt: Date.now(), flags: runner.flags, coach, ...extra });
  await saveRunner(undefined);
  await finalizeHr(runner.sessionId);
}

/** Mid-session protocol switch (bad day / finisher off): the session record follows the runner. */
export async function setSessionFlags(sessionId: number, flags: Partial<SessionFlags>) {
  const s = await db.sessions.get(sessionId);
  if (s) await db.sessions.update(sessionId, { flags: { ...s.flags, ...flags } });
}

export async function abandonSession(runner: RunnerState) {
  if (recorder.sessionId === runner.sessionId) await recorder.stop();
  await db.transaction('rw', db.sessions, db.sets, async () => {
    await db.sets.where('sessionId').equals(runner.sessionId).delete();
    await db.sessions.delete(runner.sessionId);
  });
  await saveRunner(undefined);
}

export async function advanceStage(to: number) {
  const settings = await getSettings();
  const stage = PULLUP_ROADMAP[clampStage(to)];
  const patch: Partial<Settings> = { pullupStage: clampStage(to) };
  if (stage.addKg) {
    patch.loads = { ...settings.loads, 'A.pullup': (settings.loads['A.pullup'] ?? 0) + stage.addKg };
  }
  await saveSettings(patch);
}

/** Slot of the most recently logged rest-pause finisher among `slots`, ignoring one session. */
export async function lastRestPauseSlot(slots: string[], excludeSessionId?: number): Promise<string | undefined> {
  const sets = await db.sets.where('slot').anyOf(slots).toArray();
  let latest: SetRecord | undefined;
  for (const s of sets) {
    if (s.sessionId !== excludeSessionId && (!latest || s.completedAt > latest.completedAt)) latest = s;
  }
  return latest?.slot;
}

/** Suggestions for the next time each slot of a template is trained. */
export async function nextTimeSuggestions(templateId: TemplateId, variantId?: string) {
  const settings = await getSettings();
  const prescriptions = slotsOf(templateId, variantId, settings);
  const history = await loadHistory(prescriptions.map((p) => p.key));
  return prescriptions
    .filter((p) => !p.key.includes('.rp-'))
    .map((p) => ({ prescription: p, suggestion: suggest(p, plannedSets(p, { deload: false }), history[p.key] ?? [], settings, { badDay: false, deload: false }) }));
}
