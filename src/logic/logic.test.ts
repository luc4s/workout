import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { getTemplate, PRESCRIPTIONS } from '../data/program';
import { DEFAULT_SETTINGS, db, type SessionRecord, type SetRecord, type Settings } from '../db/db';
import { exportBackup, importBackup } from '../db/backup';
import { applyStage, detectStall, suggest, type SlotSession } from './progression';
import { createRunner, intervalPosition, restRemainingSec, runnerReducer, sessionElapsedMs } from './runner';
import { suggestNext, warningsFor } from './schedule';
import { buildSteps, dropRemainingSets, type Step, type WorkStep } from './steps';

const OPTS = { finisher: false, deload: false, badDay: false };
const works = (steps: Step[]) => steps.filter((s): s is WorkStep => s.kind === 'work');
const DAY = 24 * 3600 * 1000;

describe('buildSteps', () => {
  it('Session A alternates pairs and puts the 4th pull-up set at the end of pair 1', () => {
    const steps = buildSteps(getTemplate('A'), undefined, { ...OPTS, finisher: true });
    expect(steps[0].kind).toBe('warmup');
    const ids = works(steps).map((w) => w.id);
    expect(ids.slice(0, 7)).toEqual(['A.pullup#1', 'A.dip#1', 'A.pullup#2', 'A.dip#2', 'A.pullup#3', 'A.dip#3', 'A.pullup#4']);
    expect(ids.slice(7, 13)).toEqual(['A.bss#1', 'A.row#1', 'A.bss#2', 'A.row#2', 'A.bss#3', 'A.row#3']);
    expect(ids.slice(13)).toEqual(['A.rollout#1', 'A.rollout#2', 'A.rollout#3']);
    expect(works(buildSteps(getTemplate('A'), undefined, OPTS)).some((w) => w.slot === 'A.rollout')).toBe(false);
    // Rest after every work step except the last, never doubled, 90 s in pairs
    expect(steps[steps.length - 1].kind).toBe('work');
    steps.forEach((s, i) => {
      if (s.kind === 'rest') expect(steps[i - 1].kind).toBe('work');
    });
    const firstRest = steps.find((s) => s.kind === 'rest');
    expect(firstRest && firstRest.kind === 'rest' && firstRest.durationSec).toBe(90);
  });

  it('deload trims to 2 sets and raises RIR', () => {
    const steps = buildSteps(getTemplate('A'), undefined, { ...OPTS, deload: true });
    expect(works(steps).filter((w) => w.slot === 'A.pullup')).toHaveLength(2);
    expect(works(steps).every((w) => w.rir.min === 3 && w.rir.max === 4)).toBe(true);
  });

  it('bad day targets ~3 RIR', () => {
    const steps = buildSteps(getTemplate('B'), undefined, { ...OPTS, badDay: true });
    expect(works(steps).every((w) => w.rir.min === 3)).toBe(true);
  });

  it('Session B finisher adds a 3-part rest-pause set with short rests', () => {
    const without = buildSteps(getTemplate('B'), undefined, OPTS);
    const withF = buildSteps(getTemplate('B'), undefined, { ...OPTS, finisher: true, restPauseSlot: 'B.rp-pike' });
    expect(works(without).some((w) => w.restPause)).toBe(false);
    const rp = works(withF).filter((w) => w.restPause);
    expect(rp.map((w) => w.id)).toEqual(['rp:B.rp-pike#1', 'rp:B.rp-pike#2', 'rp:B.rp-pike#3']);
    const tail = withF.slice(-5);
    expect(tail.map((s) => s.kind)).toEqual(['work', 'rest', 'work', 'rest', 'work']);
    expect((tail[1] as { durationSec: number }).durationSec).toBe(20);
  });

  it('rowing variants are a single interval step with the right total duration', () => {
    const row = getTemplate('row');
    const total = (v: string) => {
      const [s] = buildSteps(row, v, OPTS);
      return s.kind === 'interval' ? s.phases.reduce((a, p) => a + p.durationSec, 0) / 60 : 0;
    };
    expect(total('4x4')).toBe(25);
    expect(total('8x1')).toBe(22);
    expect(total('steady')).toBe(20);
  });

  it('pull-up roadmap stage changes Session A pull-up sets', () => {
    const steps = buildSteps(getTemplate('A'), undefined, {
      ...OPTS,
      override: (p) => applyStage(p, { pullupStage: 1 }),
    });
    const pulls = works(steps).filter((w) => w.slot === 'A.pullup');
    expect(pulls).toHaveLength(3);
    expect(pulls[0].reps).toEqual({ min: 6, max: 8 });
  });

  it('dropRemainingSets removes later sets of one slot and fixes rests', () => {
    const steps = buildSteps(getTemplate('B'), undefined, OPTS);
    const i = steps.findIndex((s) => s.id === 'B.pike#2');
    const out = dropRemainingSets(steps, i, 'B.pike');
    expect(works(out).filter((w) => w.slot === 'B.pike')).toHaveLength(2);
    expect(out[out.length - 1].kind).toBe('work');
    out.forEach((s, j) => {
      if (s.kind === 'rest') expect(out[j - 1].kind).toBe('work');
    });
  });
});

describe('runner', () => {
  const t0 = 1_000_000;
  const make = () =>
    createRunner({
      sessionId: 1,
      templateId: 'A',
      variantId: 'standard',
      flags: { badDay: false, deload: false, finisher: false },
      steps: buildSteps(getTemplate('A'), undefined, OPTS),
      plans: {},
      now: t0,
    });

  it('timers are derived from timestamps and exclude pauses', () => {
    let s = make();
    s = runnerReducer(s, { type: 'goto', index: 2, now: t0 }); // rest after pull-up #1
    expect(s.steps[2].kind).toBe('rest');
    expect(restRemainingSec(s, t0 + 30_000)).toBeCloseTo(60);
    s = runnerReducer(s, { type: 'pause', now: t0 + 30_000 });
    expect(restRemainingSec(s, t0 + 90_000)).toBeCloseTo(60);
    s = runnerReducer(s, { type: 'resume', now: t0 + 90_000 });
    expect(restRemainingSec(s, t0 + 100_000)).toBeCloseTo(50);
    s = runnerReducer(s, { type: 'adjustRest', deltaSec: 15 });
    expect(restRemainingSec(s, t0 + 100_000)).toBeCloseTo(65);
    expect(sessionElapsedMs(s, t0 + 100_000)).toBe(40_000);
  });

  it('complete marks done and advances', () => {
    let s = runnerReducer(make(), { type: 'next', now: t0 });
    s = runnerReducer(s, { type: 'complete', stepId: s.steps[1].id, now: t0 + 5000 });
    expect(s.done['A.pullup#1']).toBe(true);
    expect(s.index).toBe(2);
    expect(s.restExtraSec).toBe(0);
  });

  it('intervalPosition finds the current phase', () => {
    const phases = [{ durationSec: 300 }, { durationSec: 180 }, { durationSec: 120 }];
    expect(intervalPosition(phases, 310)).toMatchObject({ phaseIndex: 1, phaseRemainingSec: 170, totalRemainingSec: 290 });
    expect(intervalPosition(phases, 600).finished).toBe(true);
  });
});

function slotSession(id: number, at: number, reps: number[], extra: Partial<SetRecord> = {}, flags: Partial<SlotSession> = {}): SlotSession {
  return {
    sessionId: id,
    at,
    badDay: false,
    deload: false,
    ...flags,
    sets: reps.map((r, i) => ({
      id: `${id}:${i}`,
      sessionId: id,
      templateId: 'A',
      slot: 'A.dip',
      exerciseId: 'dip',
      setNumber: i + 1,
      reps: r,
      completedAt: at,
      ...extra,
    })),
  };
}

describe('progression', () => {
  const settings: Settings = { ...DEFAULT_SETTINGS, loads: { 'A.dip': 10 }, variations: { 'A.dip': 'bar' } };
  const dip = PRESCRIPTIONS['A.dip'];
  const ctx = { badDay: false, deload: false };

  it('top of range on all sets → +2.5 kg and back to the bottom', () => {
    const h = [slotSession(1, 0, [8, 8, 8], { loadKg: 10, variationId: 'bar' })];
    const s = suggest(dip, 3, h, settings, ctx);
    expect(s.kind).toBe('add-load');
    expect(s.plan.loadKg).toBe(12.5);
    expect(s.repsTarget).toEqual([5, 5, 5]);
  });

  it('uses the configured weight increment', () => {
    const h = [slotSession(1, 0, [8, 8, 8], { loadKg: 10, variationId: 'bar' })];
    const s = suggest(dip, 3, h, { ...settings, loadStep: 2 }, ctx);
    expect(s.plan.loadKg).toBe(12);
    expect(s.message).toMatch(/add 2 kg/);
  });

  it('otherwise add one rep to the weakest set', () => {
    const h = [slotSession(1, 0, [8, 7, 6], { loadKg: 10, variationId: 'bar' })];
    const s = suggest(dip, 3, h, settings, ctx);
    expect(s.kind).toBe('add-reps');
    expect(s.repsTarget).toEqual([8, 7, 7]);
  });

  it('bad-day sessions are ignored for progression and suppress it', () => {
    const h = [
      slotSession(2, 10, [5, 5, 5], { loadKg: 10, variationId: 'bar' }, { badDay: true }),
      slotSession(1, 0, [8, 8, 8], { loadKg: 10, variationId: 'bar' }),
    ];
    expect(suggest(dip, 3, h, settings, ctx).kind).toBe('add-load');
    expect(suggest(dip, 3, h, settings, { badDay: true, deload: false }).kind).toBe('bad-day');
  });

  it('non-loadable variation at top of range → next variation in chain', () => {
    const pistol = PRESCRIPTIONS['B.pistol'];
    const st = { ...DEFAULT_SETTINGS, variations: { 'B.pistol': 'box' } };
    const h = [slotSession(1, 0, [12, 12, 12], { variationId: 'box', slot: 'B.pistol' })];
    const s = suggest(pistol, 3, h, st, ctx);
    expect(s.kind).toBe('next-variation');
    expect(s.plan.variationId).toBe('assisted');
  });

  it('pull-up roadmap: 4×5 → advance to 3×6–8; 3×8 needs two sessions', () => {
    const p0 = applyStage(PRESCRIPTIONS['A.pullup'], { pullupStage: 0 });
    const h0 = [slotSession(1, 0, [5, 5, 5, 5], { slot: 'A.pullup', exerciseId: 'pullup' })];
    const s0 = suggest(p0, 4, h0, { ...DEFAULT_SETTINGS, pullupStage: 0 }, ctx);
    expect(s0.kind).toBe('stage-up');
    expect(s0.nextStage).toBe(1);

    const grow = suggest(p0, 4, [slotSession(1, 0, [4, 3, 3, 3], { slot: 'A.pullup' })], DEFAULT_SETTINGS, ctx);
    expect(grow.repsTarget).toEqual([4, 4, 3, 3]);

    const p2 = applyStage(PRESCRIPTIONS['A.pullup'], { pullupStage: 2 });
    const st2 = { ...DEFAULT_SETTINGS, pullupStage: 2 };
    const once = [slotSession(1, 0, [8, 8, 8], { slot: 'A.pullup' })];
    expect(suggest(p2, 3, once, st2, ctx).kind).toBe('hold');
    const twice = [slotSession(2, 1, [8, 8, 8], { slot: 'A.pullup' }), ...once];
    expect(suggest(p2, 3, twice, st2, ctx).kind).toBe('stage-up');
  });

  it('micro push-ups default to one notch easier than Session B', () => {
    const st = { ...DEFAULT_SETTINGS, variations: { 'B.pushup': 'archer' } };
    const s = suggest(PRESCRIPTIONS['M.pushup'], 2, [], st, ctx);
    expect(s.plan.variationId).toBe('deficit-feet-up');
  });

  it('detects stalls', () => {
    const h = [
      slotSession(4, 30 * DAY, [7, 7, 6], { loadKg: 10, variationId: 'bar' }),
      slotSession(3, 20 * DAY, [7, 7, 6], { loadKg: 10, variationId: 'bar' }),
      slotSession(2, 7 * DAY, [7, 7, 7], { loadKg: 10, variationId: 'bar' }),
      slotSession(1, 0, [7, 6, 6], { loadKg: 10, variationId: 'bar' }),
    ];
    expect(detectStall(dip, h)).toBe('add-set');
    expect(detectStall(dip, h.slice(0, 3).map((s, i) => ({ ...s, at: 30 - i })))).toBe('deload');
    expect(detectStall(dip, h.slice(2))).toBeUndefined();
  });
});

describe('schedule', () => {
  const session = (templateId: SessionRecord['templateId'], startedAt: number): SessionRecord => ({
    id: startedAt,
    templateId,
    variantId: 'standard',
    startedAt,
    endedAt: startedAt + 3600_000,
    flags: { badDay: false, deload: false, finisher: false },
  });
  const monday = new Date(2026, 8, 14, 18).getTime(); // Mon 14 Sep 2026

  it('rotates A → micro → B → row', () => {
    expect(suggestNext([], monday).templateId).toBe('A');
    expect(suggestNext([session('A', monday)], monday + DAY).templateId).toBe('micro');
    expect(suggestNext([session('A', monday), session('micro', monday + 2 * DAY)], monday + 3 * DAY).templateId).toBe('B');
  });

  it('warns about back-to-back full sessions and rowing before A', () => {
    expect(warningsFor('B', [session('A', monday)], monday + DAY)[0]).toMatch(/back-to-back/);
    expect(warningsFor('B', [session('A', monday)], monday + 3 * DAY)).toEqual([]);
    expect(warningsFor('A', [session('row', monday - DAY)], monday)[0]).toMatch(/48 h/);
  });
});

describe('backup', () => {
  it('round-trips data', async () => {
    await db.sessions.put({ id: 7, templateId: 'A', variantId: 'standard', startedAt: 1, endedAt: 2, flags: { badDay: false, deload: false, finisher: false } });
    await db.sets.put({ id: '7:A.dip#1', sessionId: 7, templateId: 'A', slot: 'A.dip', exerciseId: 'dip', setNumber: 1, reps: 6, completedAt: 2 });
    await db.kv.put({ key: 'settings', value: { ...DEFAULT_SETTINGS, pullupStage: 2 } });
    const file = JSON.parse(JSON.stringify(await exportBackup()));
    await db.sets.clear();
    await db.sessions.clear();
    const res = await importBackup(file);
    expect(res).toEqual({ sessions: 1, sets: 1 });
    expect((await db.sets.get('7:A.dip#1'))?.reps).toBe(6);
    await expect(importBackup({ app: 'nope' })).rejects.toThrow();
  });
});
