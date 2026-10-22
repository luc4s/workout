import { describe, expect, it } from 'vitest';
import { getTemplate, PRESCRIPTIONS } from '../data/program';
import { DEFAULT_SETTINGS, type SessionRecord, type SetRecord, type Settings } from '../db/db';
import { findPrsIn, recommendSession, restTakenBefore, sessionOverview, sessionReview, setFeedback, stallsOf, trainingStats } from './coach';
import { applyStage, suggest, type Suggestion } from './progression';
import { createRunner, runnerReducer, type LastTime, type RunnerState } from './runner';
import type { Preparation } from './session';
import { buildSteps, plannedSets, type WorkStep } from './steps';

const DAY = 24 * 3600 * 1000;
const FLAGS = { badDay: false, deload: false, finisher: true };
const monday = new Date(2026, 8, 14, 18).getTime(); // Mon 14 Sep 2026
const sat = monday + 5 * DAY;

let nextId = 100;
function session(templateId: SessionRecord['templateId'], startedAt: number, flags: Partial<SessionRecord['flags']> = {}): SessionRecord {
  return { id: nextId++, templateId, variantId: 'standard', startedAt, endedAt: startedAt + 45 * 60_000, flags: { ...FLAGS, ...flags } };
}

/** Logged sets of one slot in one session, spaced like a real session (set every 2 min, 30 s work). */
function setsOf(s: SessionRecord, slot: string, reps: number[], extra: Partial<SetRecord> = {}, startMin = 6, stepMin = 2): SetRecord[] {
  const p = PRESCRIPTIONS[slot];
  return reps.map((r, i) => ({
    id: `${s.id}:${slot}#${i + 1}`,
    sessionId: s.id!,
    templateId: s.templateId,
    slot,
    exerciseId: p.exerciseId,
    setNumber: i + 1,
    reps: r,
    rir: 1,
    durationSec: 30,
    completedAt: s.startedAt + startMin * 60_000 + i * stepMin * 60_000,
    ...extra,
  }));
}

describe('recommendSession', () => {
  const settings: Settings = DEFAULT_SETTINGS;

  it('follows the rotation with low confidence when there is little history', () => {
    const r = recommendSession([], [], settings, monday);
    expect(r.templateId).toBe('A');
    expect(r.confidence).toBe('low');
    expect(r.readiness).toBe('go');
    expect(r.week.missing).toEqual(['A', 'micro', 'B', 'row']);
  });

  it('late in the week, a missing full session beats the rotation', () => {
    const sessions = [session('A', monday), session('micro', monday + 2 * DAY)];
    // Rotation says B here anyway; add a B and the rotation says row — on Saturday with A+B done that holds.
    expect(recommendSession(sessions, [], settings, monday + 3 * DAY).templateId).toBe('B');
    const withB = [...sessions, session('B', monday + 4 * DAY)];
    expect(recommendSession(withB, [], settings, sat).templateId).toBe('row');
    // A done, micro done, B skipped, then rowing: rotation says A, but B is missing this week.
    const skippedB = [...sessions, session('row', monday + 4 * DAY)];
    const r = recommendSession(skippedB, [], settings, sat);
    expect(r.templateId).toBe('B');
    expect(r.reason).toMatch(/Session B is not done this week/);
    expect(r.confidence).toBe('medium');
  });

  it('five days without a full session brings the other full session forward', () => {
    const sessions = [session('B', monday - 7 * DAY), session('A', monday - 5 * DAY), session('micro', monday - 4 * DAY)];
    // Rotation after micro → B; fine. Make the rotation say micro instead: last was A.
    const s2 = [session('B', monday - 9 * DAY), session('A', monday - 6 * DAY)];
    const r = recommendSession(s2, [], settings, monday + DAY); // Tuesday, 7 days after A
    expect(r.templateId).toBe('B');
    expect(r.why.join(' ')).toMatch(/days since a full session/);
    expect(recommendSession(sessions, [], settings, monday).templateId).toBe('B');
  });

  it('a session done today means rest; warnings and stalls mean caution', () => {
    const today = recommendSession([session('A', monday - 3600_000)], [], settings, monday);
    expect(today.readiness).toBe('rest');
    const rowed = recommendSession([session('micro', monday - 3 * DAY), session('B', monday - 2 * DAY), session('row', monday - DAY)], [], settings, monday);
    expect(rowed.templateId).toBe('A');
    expect(rowed.readiness).toBe('caution');
    expect(rowed.warnings[0]).toMatch(/48 h/);
  });

  it('two stalled lifts and no recent deload → deload week preset', () => {
    const st: Settings = { ...settings, loads: { 'A.dip': 10, 'A.bss': 10 }, variations: { 'A.dip': 'bar' } };
    const sessions: SessionRecord[] = [];
    const sets: SetRecord[] = [];
    // 4 identical Session A, one per week, starting 8 weeks ago → dips and split squats stall.
    for (let w = 8; w >= 1; w -= 2) {
      const s = session('A', monday - w * 7 * DAY);
      sessions.push(s);
      sets.push(...setsOf(s, 'A.dip', [7, 7, 6], { loadKg: 10, variationId: 'bar' }), ...setsOf(s, 'A.bss', [7, 7, 7], { loadKg: 10 }));
      const b = session('B', monday - w * 7 * DAY + 3 * DAY);
      sessions.push(b);
    }
    const r = recommendSession(sessions, sets, st, monday);
    expect(r.stalls.map((s) => s.slot).sort()).toEqual(['A.bss', 'A.dip']);
    expect(r.flags.deload).toBe(true);
    expect(r.suggestions[0].kind).toBe('deload');
    expect(r.weeksSinceDeload).toBeGreaterThanOrEqual(6);
    // A recent deload holds the suggestion back.
    const recent = recommendSession(sessions, sets, { ...st, lastDeloadAt: monday - 2 * 7 * DAY }, monday);
    expect(recent.flags.deload).toBeUndefined();
    expect(recent.why.some((w) => /no progress/.test(w))).toBe(true);
  });
});

/** A Preparation built from the real program for Session A with given histories. */
function prepA(history: Record<string, LastTime & { kind?: Suggestion['kind'] }> = {}, settings: Settings = DEFAULT_SETTINGS): Preparation {
  const template = getTemplate('A');
  const steps = buildSteps(template, undefined, { ...FLAGS, restScale: 1, override: (p) => applyStage(p, settings) });
  const prescriptions = template.variants[0].blocks.flatMap((b) => (b.kind === 'pair' ? b.exercises : [])).map((p) => applyStage(p, settings));
  const suggestions: Record<string, Suggestion> = {};
  const plans: Preparation['plans'] = {};
  const lastTime: Preparation['lastTime'] = {};
  for (const p of prescriptions) {
    const h = history[p.key];
    const sl = h
      ? [{ sessionId: 1, at: h.at, badDay: false, deload: false, sets: h.reps.map((r, i) => ({ ...setsOf(session('A', h.at), p.key, [r])[0], setNumber: i + 1, loadKg: h.loadKg, variationId: h.variationId })) }]
      : [];
    const s = suggest(p, plannedSets(p, FLAGS), sl, settings, FLAGS);
    suggestions[p.key] = s;
    plans[p.key] = s.plan;
    if (h) lastTime[p.key] = h;
  }
  return { steps, suggestions, plans, lastTime, prescriptions, settings };
}

describe('sessionOverview', () => {
  it('lists every slot with targets, loads and a PR chance', () => {
    const settings: Settings = { ...DEFAULT_SETTINGS, loads: { 'A.dip': 10 }, variations: { 'A.dip': 'bar' } };
    const o = sessionOverview(prepA({ 'A.dip': { at: 0, reps: [7, 7, 6], loadKg: 10, variationId: 'bar' } }, settings));
    expect(o.rows.map((r) => r.slot)).toEqual(['A.pullup', 'A.dip', 'A.bss', 'A.row', 'A.rollout']);
    const dip = o.rows.find((r) => r.slot === 'A.dip')!;
    expect(dip.target).toEqual([7, 7, 7]);
    expect(dip.loadKg).toBe(10);
    expect(dip.prChance).toBeUndefined(); // 7 was already done
    const weights = o.weights.map((w) => w.slot);
    expect(weights).toContain('A.dip');
    expect(o.estMin).toBeGreaterThan(30);
  });

  it('flags a load increase as a change and a higher target as a PR chance', () => {
    const settings: Settings = { ...DEFAULT_SETTINGS, loads: { 'A.dip': 10 }, variations: { 'A.dip': 'bar' } };
    const o = sessionOverview(prepA({ 'A.dip': { at: 0, reps: [8, 8, 8], loadKg: 10, variationId: 'bar' } }, settings));
    expect(o.changes[0]).toMatch(/Weighted dip: \+2.5 kg → 12.5 kg/);
    const o2 = sessionOverview(prepA({ 'A.dip': { at: 0, reps: [5, 5, 5], loadKg: 10, variationId: 'bar' } }, settings));
    expect(o2.rows.find((r) => r.slot === 'A.dip')!.target).toEqual([6, 5, 5]);
    expect(o2.rows.find((r) => r.slot === 'A.dip')!.prChance).toBe(6);
  });
});

function runnerA(prep: Preparation, now: number): RunnerState {
  return createRunner({ sessionId: 9, templateId: 'A', variantId: 'standard', flags: FLAGS, steps: prep.steps, plans: prep.plans, suggestions: prep.suggestions, lastTime: prep.lastTime, now });
}

function logged(state: RunnerState, stepId: string, reps: number, rir: number, completedAt: number, durationSec = 30): SetRecord {
  const step = state.steps.find((s) => s.id === stepId) as WorkStep;
  return { id: `${state.sessionId}:${stepId}`, sessionId: state.sessionId, templateId: 'A', slot: step.slot, exerciseId: step.exerciseId, setNumber: step.setNumber, reps, rir, durationSec, completedAt };
}

describe('setFeedback', () => {
  const t0 = monday;
  const settings: Settings = { ...DEFAULT_SETTINGS, loads: { 'A.dip': 10 }, variations: { 'A.dip': 'bar' } };
  const prep = prepA({ 'A.dip': { at: t0 - 7 * DAY, reps: [7, 7, 6], loadKg: 10, variationId: 'bar' }, 'A.pullup': { at: t0 - 7 * DAY, reps: [4, 4, 3, 3] } }, settings);
  const base = () => {
    let s = runnerA(prep, t0);
    s = runnerReducer(s, { type: 'goto', index: 3, now: t0 + 8 * 60_000 }); // A.dip#1
    return s;
  };
  const dip1 = () => base().steps[3] as WorkStep;

  it('hit / over / under verdicts with cues', () => {
    const s = base();
    const at = t0 + 9 * 60_000;
    expect(dip1().id).toBe('A.dip#1');
    const hit = setFeedback(s, dip1(), logged(s, 'A.dip#1', 7, 1, at), [logged(s, 'A.dip#1', 7, 1, at)], at);
    expect(hit.verdict).toBe('hit');
    expect(hit.tone).toBe('good');
    expect(hit.headline).toMatch(/target hit/);
    const over = setFeedback(s, dip1(), logged(s, 'A.dip#1', 9, 2, at), [], at);
    expect(over.verdict).toBe('over');
    expect(over.cue).toBe('+1 rep next set');
    const under = setFeedback(s, dip1(), logged(s, 'A.dip#1', 5, 0, at), [], at);
    expect(under.verdict).toBe('under');
    expect(under.headline).toMatch(/grind/); // RIR below the strength range outranks the rep count
    expect(under.cue).toBe('Stop at 1–2 RIR');
  });

  it('too much in the tank is called out', () => {
    const s = base();
    const at = t0 + 9 * 60_000;
    const fb = setFeedback(s, dip1(), logged(s, 'A.dip#1', 7, 4, at), [], at);
    expect(fb.headline).toMatch(/more in the tank/);
  });

  it('measures the rest actually taken from timestamps and warns past 1.5× the planned rest', () => {
    const s = base();
    const pull = logged(s, 'A.pullup#1', 4, 1, t0 + 7 * 60_000);
    const slow = logged(s, 'A.dip#1', 7, 1, t0 + 7 * 60_000 + 200_000 + 30_000); // 200 s rest, 30 s work
    expect(restTakenBefore(slow, [pull, slow])?.sec).toBeCloseTo(200);
    const fb = setFeedback(s, dip1(), slow, [pull, slow], slow.completedAt);
    expect(fb.restPlannedSec).toBe(90);
    expect(fb.restAdvice).toBe('shorten');
    expect(fb.headline).toMatch(/Rested 3:20 vs 1:30/);
    const quickMiss = logged(s, 'A.dip#1', 5, 1, t0 + 7 * 60_000 + 30_000 + 30_000); // 30 s rest and a miss
    const fb2 = setFeedback(s, dip1(), quickMiss, [pull, quickMiss], quickMiss.completedAt);
    expect(fb2.restAdvice).toBe('extend');
    // A long gap (pause, left the app) is not a rest.
    const late = logged(s, 'A.dip#1', 7, 1, t0 + 60 * 60_000);
    expect(restTakenBefore(late, [pull, late])).toBeUndefined();
  });

  it('projects the session pace from the remaining steps', () => {
    const s = base();
    const at = t0 + 9 * 60_000;
    const onTime = setFeedback(s, dip1(), logged(s, 'A.dip#1', 7, 1, at), [], at);
    expect(onTime.pace.targetMin).toBe(50);
    expect(onTime.pace.over).toBe(false);
    const late = setFeedback(s, dip1(), logged(s, 'A.dip#1', 7, 1, at), [], t0 + 30 * 60_000);
    expect(late.pace.over).toBe(true);
    // Slow sets today push the projection out: 3-minute sets on every remaining step.
    const slow = [logged(s, 'A.pullup#1', 4, 1, t0 + 7 * 60_000, 180), logged(s, 'A.dip#1', 7, 1, at, 180)];
    const slowFb = setFeedback(s, dip1(), slow[1], slow, at);
    expect(slowFb.pace.projectedMin).toBeGreaterThan(onTime.pace.projectedMin + 20);
    expect(late.headline).toMatch(/On pace for ~\d+ min/);
    expect(late.suggestion?.kind).toBe('skip-finisher');
  });

  it('suggests bad-day mode after two sets well under target at low RIR, not on a bad day', () => {
    const s = base();
    const pull = logged(s, 'A.pullup#1', 2, 0, t0 + 7 * 60_000); // target 4
    const dip = logged(s, 'A.dip#1', 4, 1, t0 + 9 * 60_000); // target 7
    const fb = setFeedback(s, dip1(), dip, [pull, dip], dip.completedAt);
    expect(fb.badDaySuggested).toBe(true);
    expect(fb.suggestion?.kind).toBe('bad-day');
    const bad = runnerReducer(s, { type: 'setFlags', flags: { badDay: true }, now: dip.completedAt });
    expect(setFeedback(bad, bad.steps[3] as WorkStep, dip, [pull, dip], dip.completedAt).badDaySuggested).toBe(false);
    const oneGood = logged(s, 'A.pullup#1', 4, 1, t0 + 7 * 60_000);
    expect(setFeedback(s, dip1(), dip, [oneGood, dip], dip.completedAt).badDaySuggested).toBe(false);
  });
});

describe('runner coach actions', () => {
  const t0 = monday;
  const prep = prepA({ 'A.dip': { at: t0 - 7 * DAY, reps: [7, 7, 6], loadKg: 10, variationId: 'bar' } }, { ...DEFAULT_SETTINGS, loads: { 'A.dip': 10 }, variations: { 'A.dip': 'bar' } });

  it('coachNote merges into a runner state saved without a coach field', () => {
    const old = runnerA(prep, t0);
    delete (old as Partial<RunnerState>).coach;
    const s = runnerReducer(old, { type: 'coachNote', stepId: 'A.dip#1', note: { claude: { note: 'Nice.', model: 'm', at: 1 } } });
    expect(s.coach?.notes['A.dip#1'].claude?.note).toBe('Nice.');
    const s2 = runnerReducer(s, { type: 'coachNote', stepId: 'A.dip#1', note: { rule: { stepId: 'A.dip#1' } as never } });
    expect(s2.coach?.notes['A.dip#1'].claude?.note).toBe('Nice.');
    expect(s2.coach?.notes['A.dip#1'].rule).toBeTruthy();
    expect(runnerReducer(runnerReducer(s2, { type: 'coachAccept', id: 'x' }), { type: 'coachAccept', id: 'x' }).coach?.accepted).toEqual(['x']);
  });

  it('switching to a bad day mid-session raises RIR and rewrites targets for the remaining sets only', () => {
    let s = runnerA(prep, t0);
    s = runnerReducer(s, { type: 'goto', index: 1, now: t0 });
    s = runnerReducer(s, { type: 'complete', stepId: 'A.pullup#1', now: t0 });
    s = runnerReducer(s, { type: 'setFlags', flags: { badDay: true }, now: t0 });
    expect(s.flags.badDay).toBe(true);
    const works = s.steps.filter((x): x is WorkStep => x.kind === 'work');
    expect(works.find((w) => w.id === 'A.pullup#1')!.rir).toEqual({ min: 1, max: 2 });
    expect(works.find((w) => w.id === 'A.dip#1')!.rir).toEqual({ min: 3, max: 3 });
    expect(s.suggestions['A.dip'].kind).toBe('bad-day');
    expect(s.suggestions['A.dip'].repsTarget).toEqual([7, 7, 6]);
    expect(s.coach?.badDaySince).toBe(s.steps[s.index].id);
    expect(s.index).toBe(2);
    // Already done sets are untouched and the finisher can be dropped.
    const noFinisher = runnerReducer(s, { type: 'setFlags', flags: { finisher: false }, now: t0 });
    expect(noFinisher.steps.some((x) => x.kind === 'work' && x.slot === 'A.rollout')).toBe(false);
    expect(noFinisher.steps[noFinisher.steps.length - 1].kind).toBe('work');
  });
});

describe('heart-rate aware rules', () => {
  const t0 = monday;
  const settings: Settings = { ...DEFAULT_SETTINGS, loads: { 'A.dip': 10 }, variations: { 'A.dip': 'bar' } };
  const prep = prepA({ 'A.dip': { at: t0 - 7 * DAY, reps: [7, 7, 6], loadKg: 10, variationId: 'bar' } }, settings);

  it('a fresh readiness check steers the recommendation', () => {
    const r = recommendSession([session('B', monday - 3 * DAY)], [], DEFAULT_SETTINGS, monday, {
      readiness: { at: monday - 3600_000, restingHr: 62, rmssd: 35, lnRmssd: 3.56, score: 'rest', reason: 'Clearly below your baseline.' },
    });
    expect(r.readiness).toBe('rest');
    expect(r.suggestions.some((s) => s.kind === 'bad-day')).toBe(true);
    const stale = recommendSession([session('B', monday - 3 * DAY)], [], DEFAULT_SETTINGS, monday, { readiness: { at: monday - 2 * DAY, restingHr: 62, rmssd: 35, lnRmssd: 3.56, score: 'rest', reason: 'x' } });
    expect(stale.readiness).toBe('go');
    const loaded = recommendSession([session('B', monday - 3 * DAY)], [], DEFAULT_SETTINGS, monday, { load: { week: 200, prevWeek: 100, monotony: 2.5 } });
    expect(loaded.why.filter((w) => /load/.test(w))).toHaveLength(2);
  });

  it('slow HR recovery after the previous set becomes the headline', () => {
    let s = runnerA(prep, t0);
    s = runnerReducer(s, { type: 'goto', index: 3, now: t0 + 8 * 60_000 });
    const dip = s.steps[3] as WorkStep;
    const rec = logged(s, 'A.dip#1', 7, 1, t0 + 9 * 60_000);
    const slow = setFeedback(s, dip, rec, [rec], rec.completedAt, { prevRecovery: 12, usualRecovery: 30, hrMax: 185 });
    expect(slow.headline).toMatch(/recovered only 12 bpm/);
    expect(slow.cue).toBe('Take the full rest');
    const fine = setFeedback(s, dip, rec, [rec], rec.completedAt, { prevRecovery: 30, usualRecovery: 30, hrMax: 185 });
    expect(fine.headline).toMatch(/target hit/);
    const nearMax = setFeedback(s, dip, rec, [rec], rec.completedAt, { setMean: 176, hrMax: 185 });
    expect(nearMax.headline).toMatch(/near your limit/);
  });

  it('the review reports HR load and the comparison', () => {
    const prev = session('A', monday - 7 * DAY);
    const cur = session('A', monday);
    const sets = setsOf(cur, 'A.dip', [8, 7, 7], { loadKg: 10, variationId: 'bar' });
    const summary = { avg: 128, max: 170, min: 80, zonesSec: [600, 900, 600, 300, 60], trimp: 60, trimpMethod: 'banister' as const, kcal: 410, recoveryMean: 26, samples: 2460, coverage: 0.95, hrMax: 185, hrRest: 55 };
    const previous = { ...summary, avg: 118, trimp: 50 };
    const r = sessionReview({ session: cur, sets, allSets: sets, sessions: [prev, cur], settings, nextTime: [], hr: { summary, previous, usualRecovery: 30 } });
    expect(r.hrNotes).toHaveLength(3);
    expect(r.hrNotes![0]).toMatch(/Average HR 128, max 170 \(92% of max\) · 6 min in zones 4–5 · load 60 TRIMP · ≈ 410 kcal/);
    expect(r.hrNotes![1]).toMatch(/average HR \+10 bpm, load \+10 — the same work cost more today/);
    expect(r.hrNotes![2]).toMatch(/Recovery after sets: 26 bpm in 60 s \(usual 30\)/);
    expect(sessionReview({ session: cur, sets, allSets: sets, sessions: [prev, cur], settings, nextTime: [] }).hrNotes).toBeUndefined();
  });
});

describe('dropping steps from a rest keeps the runner on a valid step', () => {
  const t0 = monday;
  const prep = prepA({}, DEFAULT_SETTINGS);

  it('skip-finisher from the rest before the finisher lands on the last work step', () => {
    let s = runnerA(prep, t0);
    const lastRow = s.steps.findIndex((x) => x.id === 'A.row#3');
    s = runnerReducer(s, { type: 'goto', index: lastRow, now: t0 });
    s = runnerReducer(s, { type: 'complete', stepId: 'A.row#3', now: t0 }); // now on the rest before the finisher
    expect(s.steps[s.index].kind).toBe('rest');
    s = runnerReducer(s, { type: 'setFlags', flags: { finisher: false }, now: t0 });
    expect(s.index).toBeLessThan(s.steps.length);
    expect(s.steps[s.index]).toBeDefined();
    expect(s.steps[s.index].id).toBe('A.row#3');
    expect(s.steps.some((x) => x.kind === 'work' && x.slot === 'A.rollout')).toBe(false);
  });

  it('dropRemaining from a rest never leaves the index past the end', () => {
    let s = runnerA(prep, t0);
    const i = s.steps.findIndex((x) => x.id === 'A.rollout#1');
    s = runnerReducer(s, { type: 'goto', index: i + 1, now: t0 }); // rest after rollout #1
    expect(s.steps[s.index].kind).toBe('rest');
    s = runnerReducer(s, { type: 'dropRemaining', slot: 'A.rollout' });
    expect(s.steps[s.index]).toBeDefined();
    expect(s.steps[s.steps.length - 1].id).toBe('A.rollout#1');
    expect(s.index).toBe(s.steps.length - 1);
  });
});

describe('sessionReview', () => {
  const settings: Settings = { ...DEFAULT_SETTINGS, loads: { 'A.dip': 10 }, variations: { 'A.dip': 'bar' } };
  const prev = session('A', monday - 7 * DAY);
  const cur = session('A', monday);
  const prevSets = [...setsOf(prev, 'A.pullup', [4, 4, 3, 3]), ...setsOf(prev, 'A.dip', [7, 7, 6], { loadKg: 10, variationId: 'bar' })];
  // Pairs alternate: pull-ups at 6, 9, 12, 15 min and dips at 7.5, 10.5, 13.5 — 60 s of rest between 30 s sets.
  const curSets = [...setsOf(cur, 'A.pullup', [5, 4, 4, 3], {}, 6, 3), ...setsOf(cur, 'A.dip', [8, 7, 5], { loadKg: 10, variationId: 'bar', rir: 0 }, 7.5, 3)];
  const targets = { 'A.pullup': [4, 4, 4, 3], 'A.dip': [7, 7, 7] };
  const input = { session: cur, sets: curSets, targets, allSets: [...prevSets, ...curSets], sessions: [prev, cur], settings, nextTime: [] };

  it('scores each slot against its targets and finds PRs and volume', () => {
    const r = sessionReview(input);
    const pull = r.slots.find((s) => s.slot === 'A.pullup')!;
    expect(pull.verdict).toBe('beat');
    const dip = r.slots.find((s) => s.slot === 'A.dip')!;
    expect(dip.verdict).toBe('partial');
    expect(dip.note).toMatch(/2\/3 sets on target — 5\/7/);
    expect(r.prs).toEqual(['Rep PR on Pull-up: 5 reps (previous best 4).', 'Rep PR on Weighted dip: 8 reps @ +10 kg (previous best 7).']);
    expect(r.totalReps).toBe(36);
    expect(r.volumeDelta).toMatchObject({ reps: 2 });
    expect(r.headline).toBe('Strength in 45 min · 1/2 exercises on target · 2 PRs');
    expect(r.durationMin).toBe(45);
    expect(r.overtime).toBe(false);
  });

  it('splits time into work, rest and the rest', () => {
    const r = sessionReview(input);
    expect(r.timeUse?.workSec).toBe(7 * 30);
    // 6 gaps of 60 s between the 7 sets (90 s apart minus 30 s of work)
    expect(r.timeUse?.restSec).toBe(6 * 60);
    expect(r.timeUse?.otherSec).toBe(45 * 60 - 210 - 360);
  });

  it('calls out failure on strength work and untouched RIR', () => {
    const r = sessionReview(input);
    expect(r.rirHints.some((h) => /taken to failure/.test(h))).toBe(true);
    const lazy = sessionReview({ ...input, sets: curSets.map((s) => ({ ...s, rir: 1 })) });
    expect(lazy.rirHints.some((h) => /left at the default/.test(h))).toBe(true);
  });

  it('suggests holding a missed exercise and skipping the finisher when over time', () => {
    const long = { ...cur, endedAt: cur.startedAt + 58 * 60_000 };
    const r = sessionReview({ ...input, session: long, sets: curSets.map((s) => (s.slot === 'A.dip' ? { ...s, reps: 4 } : s)) });
    expect(r.overtime).toBe(true);
    expect(r.suggestions.map((s) => s.kind)).toEqual(['skip-finisher', 'hold']);
    expect(r.suggestions[1].slot).toBe('A.dip');
    const bad = sessionReview({ ...input, session: { ...cur, flags: { ...FLAGS, badDay: true } } });
    expect(bad.suggestions).toEqual([]);
    expect(bad.headline).toMatch(/bad day/);
  });

  it('sessions without stored targets are reviewed without verdicts', () => {
    const r = sessionReview({ ...input, targets: undefined });
    expect(r.slots.every((s) => s.verdict === 'first')).toBe(true);
    expect(r.headline).toBe('Strength in 45 min · 2 exercises logged · 2 PRs');
  });

  it('stallsOf and findPrsIn are pure versions of the old helpers', () => {
    expect(stallsOf([...prevSets, ...curSets], [prev, cur], settings)).toEqual([]);
    expect(findPrsIn(curSets, [])).toEqual([]);
  });
});

describe('trainingStats', () => {
  const settings: Settings = { ...DEFAULT_SETTINGS, loads: { 'A.dip': 10 }, variations: { 'A.dip': 'bar' } };
  const sessions: SessionRecord[] = [];
  const sets: SetRecord[] = [];
  // Four Session A over four weeks: dips climb from 6-6-6 to 8-8-8, pull-ups stay at 4-4-3-3.
  for (let w = 4; w >= 1; w--) {
    const s = session('A', monday - w * 7 * DAY);
    sessions.push(s);
    const r = 6 + (4 - w) * 0.7;
    // Pull-ups at 6, 8, 10, 12 min and dips at 7, 9, 11 min: 60 s apart, 30 s of work → 30 s of rest before each set.
    sets.push(...setsOf(s, 'A.dip', [Math.round(r), Math.round(r), Math.round(r)], { loadKg: 10, variationId: 'bar' }, 7), ...setsOf(s, 'A.pullup', [4, 4, 3, 3], { rir: 0 }));
  }
  const st = trainingStats(sessions, sets, settings, monday);

  it('summarises adherence, per-template counts and RIR habits', () => {
    expect(st.sessions).toBe(4);
    expect(st.weeks).toBe(5);
    expect(st.perWeek.slice(-5)).toEqual([1, 1, 1, 1, 0]);
    expect(st.adherence).toBeCloseTo(4 / 20, 2);
    expect(st.byTemplate.A).toMatchObject({ count: 4, avgMin: 45, targetMin: 50, badDays: 0, deloads: 0 });
    expect(st.byTemplate.B.count).toBe(0);
    expect(st.rir).toEqual({ sets: 28, atFailure: 16, leftAtDefault: 12 });
  });

  it('gives each exercise a score timeline, a best set and a trend', () => {
    const dip = st.slots.find((s) => s.slot === 'A.dip')!;
    expect(dip.timeline).toHaveLength(4);
    expect(dip.timeline[0].meanReps).toBe(6);
    expect(dip.timeline[3].meanReps).toBe(8);
    expect(dip.trend).toBe('up');
    expect(dip.best).toMatchObject({ reps: 8, loadKg: 10, variationId: 'bar' });
    const pull = st.slots.find((s) => s.slot === 'A.pullup')!;
    expect(pull.trend).toBe('flat');
    expect(pull.stall).toBeDefined();
    expect(st.slots.some((s) => s.slot === 'B.pushup')).toBe(false);
    // Volume, PRs, set / rest timing and distributions
    expect(dip.weeklyVolume).toHaveLength(12);
    expect(dip.weeklyVolume.reduce((a, b) => a + b, 0)).toBe(dip.timeline.reduce((a, t) => a + t.meanReps * 3, 0));
    expect(dip.prs.map((p) => p.reps)).toEqual([6, 7, 8]);
    expect(dip.meanSetSec).toBe(30);
    expect(dip.meanRestSec).toBe(30);
    expect(dip.rirHistogram).toEqual([0, 12, 0, 0, 0]);
    expect(pull.rirHistogram[0]).toBe(16);
    expect(st.weekdayHistogram[0]).toBe(4); // all on a Monday
    expect(st.hourHistogram[18]).toBe(4);
    expect(st.longestGapDays).toBe(7);
    expect(st.timeUse?.workSec).toBe(7 * 30);
  });
});
