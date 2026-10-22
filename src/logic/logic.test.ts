import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { getTemplate, PRESCRIPTIONS, restPauseOptions } from '../data/program';
import { DEFAULT_SETTINGS, db, type SessionRecord, type SetRecord, type Settings } from '../db/db';
import { exportBackup, importBackup } from '../db/backup';
import { applyStage, detectStall, suggest, suggestRestPause, type SlotSession } from './progression';
import { createRunner, intervalPosition, restRemainingSec, runnerReducer, sessionElapsedMs } from './runner';
import { suggestNext, warningsFor } from './schedule';
import { lastRestPauseSlot, prepareSession } from './session';
import { buildSteps, dropRemainingSets, estimateDurationSec, estimateWorkSec, type Step, type WorkStep } from './steps';

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

  it('estimates the session length from the planned sets, reps and tempo', () => {
    const steps = buildSteps(getTemplate('A'), undefined, { ...OPTS, finisher: true, override: (p) => applyStage(p, { pullupStage: 1 }) });
    const dip = works(steps).find((w) => w.slot === 'A.dip')!;
    const bss = works(steps).find((w) => w.slot === 'A.bss')!;
    expect(estimateWorkSec(dip, 6)).toBe(15 + 6 * 3);
    expect(estimateWorkSec(dip)).toBe(15 + 8 * 3);
    expect(estimateWorkSec(bss, 8)).toBe(15 + 2 * 8 * 3 + 10);
    const base = estimateDurationSec(steps);
    const warm = 360;
    const rests = steps.filter((s) => s.kind === 'rest').reduce((a, s) => a + (s as { durationSec: number }).durationSec, 0);
    const work = works(steps).reduce((a, w) => a + estimateWorkSec(w), 0);
    expect(base).toBe(warm + rests + work + 2 * 45); // pair 1 → pair 2 → finisher
    // Lower targets shorten it; observed set times replace the estimate.
    const targets = { 'A.dip': [5, 5, 5] };
    expect(estimateDurationSec(steps, { targets })).toBe(base - 3 * 3 * 3);
    expect(estimateDurationSec(steps, { workSec: () => 60 })).toBe(warm + rests + works(steps).length * 60 + 90);
    expect(Math.round(base / 60)).toBeGreaterThanOrEqual(35);
    expect(Math.round(base / 60)).toBeLessThanOrEqual(50);
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

  it('the rest-pause finisher can be switched until its first mini-set is logged', () => {
    let s = createRunner({
      sessionId: 2,
      templateId: 'B',
      variantId: 'standard',
      flags: { badDay: false, deload: false, finisher: true },
      steps: buildSteps(getTemplate('B'), undefined, { ...OPTS, finisher: true, restPauseSlot: 'B.rp-row' }),
      plans: {},
      now: t0,
    });
    s = runnerReducer(s, { type: 'swapRestPause', slot: 'B.rp-pike' });
    const rp = works(s.steps).filter((w) => w.restPause);
    expect(rp.map((w) => w.id)).toEqual(['rp:B.rp-pike#1', 'rp:B.rp-pike#2', 'rp:B.rp-pike#3']);
    expect(rp.every((w) => w.slot === 'B.rp-pike' && w.exerciseId === 'pike-pushup')).toBe(true);
    s = runnerReducer(s, { type: 'complete', stepId: rp[0].id, now: t0 });
    expect(runnerReducer(s, { type: 'swapRestPause', slot: 'B.rp-row' })).toBe(s);
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

  it('pull-up stage change: targets start at the new minimum and the message quotes what was done', () => {
    const p1 = applyStage(PRESCRIPTIONS['A.pullup'], { pullupStage: 1 });
    const h = [slotSession(1, 0, [5, 5, 5, 5], { slot: 'A.pullup', exerciseId: 'pullup' })];
    const s = suggest(p1, 3, h, { ...DEFAULT_SETTINGS, pullupStage: 1 }, ctx);
    expect(s.repsTarget).toEqual([6, 6, 6]);
    expect(s.message).toContain('5-5-5-5 (4 sets)');
    expect(s.message).toContain('6-6-6');
    expect(s.basisSessionId).toBe(1);
  });

  it('the message shows the reps actually done when sets were skipped', () => {
    const p0 = applyStage(PRESCRIPTIONS['A.pullup'], { pullupStage: 0 });
    const s = suggest(p0, 4, [slotSession(1, 0, [5, 5, 4], { slot: 'A.pullup' })], DEFAULT_SETTINGS, ctx);
    expect(s.repsTarget).toEqual([5, 5, 4, 4]);
    expect(s.message).toBe('Beat last time: 5-5-4 (3 sets) → 5-5-4-4.');
  });

  it('targets and "last time" come from the same session', () => {
    const h = [
      slotSession(2, 10, [5, 5, 5], { loadKg: 10, variationId: 'bar' }, { badDay: true }),
      slotSession(1, 0, [7, 7, 6], { loadKg: 10, variationId: 'bar' }),
    ];
    expect(suggest(dip, 3, h, settings, ctx).basisSessionId).toBe(1);
    expect(suggest(dip, 3, h, settings, { badDay: true, deload: false }).basisSessionId).toBe(2);
  });

  it('no stall after the roadmap drops from 4 to 3 sets', () => {
    const p1 = applyStage(PRESCRIPTIONS['A.pullup'], { pullupStage: 1 });
    const h = [
      slotSession(3, 14 * DAY, [7, 6, 6], { slot: 'A.pullup' }),
      slotSession(2, 7 * DAY, [6, 6, 6], { slot: 'A.pullup' }),
      slotSession(1, 0, [5, 5, 5, 5], { slot: 'A.pullup' }),
    ];
    expect(detectStall(p1, h)).toBeUndefined();
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

describe('rest-pause suggestion', () => {
  const options = restPauseOptions('B');
  const none = { stalls: {}, today: [] };

  it('prefers a stalled movement', () => {
    expect(suggestRestPause(options, { ...none, stalls: { 'B.pike': true }, lastSlot: 'B.rp-pike' })?.slot).toBe('B.rp-pike');
  });

  it('then the movement with the most reps in reserve today', () => {
    const today = [
      { slot: 'B.row', rir: 0 },
      { slot: 'B.row', rir: 1 },
      { slot: 'B.pike', rir: 2 },
      { slot: 'B.pike', rir: 1 },
    ];
    const c = suggestRestPause(options, { ...none, today });
    expect(c?.slot).toBe('B.rp-pike');
    expect(c?.reason).toMatch(/1\.5 RIR/);
  });

  it('then alternates with last time, defaulting to rows', () => {
    expect(suggestRestPause(options, { ...none, lastSlot: 'B.rp-row' })?.slot).toBe('B.rp-pike');
    expect(suggestRestPause(options, none)?.slot).toBe('B.rp-row');
    expect(suggestRestPause(restPauseOptions('A'), none)).toBeUndefined();
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

  it('heart-rate data rides inside sessions and sets and round-trips through a backup', async () => {
    const hr = { startedAt: 10, bpm: [120, 121, -1, 125], rr: [500, 510], summary: { avg: 122, max: 125, min: 120, zonesSec: [0, 0, 4, 0, 0], samples: 3, coverage: 0.75, hrMax: 185 } };
    await db.sessions.put({ id: 8, templateId: 'B', variantId: 'standard', startedAt: 1, endedAt: 2, flags: { badDay: false, deload: false, finisher: false }, hr });
    await db.sets.put({ id: '8:B.pushup#1', sessionId: 8, templateId: 'B', slot: 'B.pushup', exerciseId: 'pushup', setNumber: 1, reps: 10, completedAt: 2, hr: { mean: 140, max: 150, end: 148, recovery60: 25 } });
    const file = JSON.parse(JSON.stringify(await exportBackup()));
    await db.sessions.clear();
    await db.sets.clear();
    await importBackup(file);
    expect((await db.sessions.get(8))?.hr?.summary?.avg).toBe(122);
    expect((await db.sets.get('8:B.pushup#1'))?.hr?.recovery60).toBe(25);
    await db.sessions.delete(8);
    await db.sets.delete('8:B.pushup#1');
  });

  it('never exports the coach rows and keeps them across an import', async () => {
    await db.kv.put({ key: 'coach', value: { apiKey: 'sk-ant-secret' } });
    await db.kv.put({ key: 'coach:brief', value: { date: '2026-01-01' } });
    await db.kv.put({ key: 'settings', value: DEFAULT_SETTINGS });
    const file = JSON.parse(JSON.stringify(await exportBackup()));
    expect(file.kv.map((r: { key: string }) => r.key)).toEqual(['settings']);
    expect(JSON.stringify(file)).not.toContain('sk-ant');
    await importBackup({ ...file, kv: [{ key: 'coach', value: { apiKey: 'from-backup' } }, ...file.kv] });
    expect(((await db.kv.get('coach'))?.value as { apiKey: string }).apiKey).toBe('sk-ant-secret');
    expect(await db.kv.get('coach:brief')).toBeTruthy();
    await db.kv.delete('coach');
    await db.kv.delete('coach:brief');
  });

  it('imports a backup written by the first release and plans sessions from it', async () => {
    const res = await importBackup(JSON.parse(JSON.stringify(V1_BACKUP)));
    expect(res).toEqual({ sessions: 2, sets: 9 });
    const a = await prepareSession({ templateId: 'A', variantId: 'standard', flags: { badDay: false, deload: false, finisher: true } });
    expect(a.suggestions['A.pullup'].repsTarget).toEqual([5, 5, 4, 4]);
    expect(a.lastTime['A.pullup'].reps).toEqual([5, 4, 4, 4]);
    const b = await prepareSession({
      templateId: 'B',
      variantId: 'standard',
      flags: { badDay: false, deload: false, finisher: true },
      restPauseSlot: 'B.rp-row',
    });
    expect(b.suggestions['B.pistol'].plan.variationId).toBe('box');
    expect(b.suggestions['B.pistol'].repsTarget).toEqual([9, 8, 8]);
    expect(await lastRestPauseSlot(['B.rp-row', 'B.rp-pike'])).toBe('B.rp-row');
  });
});

/** Backup in the format the app has written since its first release — must always import. */
const V1_BACKUP = {
  app: 'workout',
  version: 1,
  exportedAt: 1_760_000_000_000,
  sessions: [
    { id: 1, templateId: 'A', variantId: 'standard', startedAt: 1_759_000_000_000, endedAt: 1_759_003_000_000, flags: { badDay: false, deload: false, finisher: true } },
    { id: 2, templateId: 'B', variantId: 'standard', startedAt: 1_759_200_000_000, endedAt: 1_759_203_000_000, flags: { badDay: false, deload: false, finisher: true } },
  ],
  sets: [
    ...[5, 4, 4, 4].map((reps, i) => ({
      id: `1:A.pullup#${i + 1}`,
      sessionId: 1,
      templateId: 'A',
      slot: 'A.pullup',
      exerciseId: 'pullup',
      setNumber: i + 1,
      reps,
      rir: 2,
      durationSec: 20,
      completedAt: 1_759_000_100_000 + i,
    })),
    ...[8, 8, 8].map((reps, i) => ({
      id: `2:B.pistol#${i + 1}`,
      sessionId: 2,
      templateId: 'B',
      slot: 'B.pistol',
      exerciseId: 'pistol-squat',
      variationId: 'box',
      setNumber: i + 1,
      reps,
      repsLeft: reps,
      repsRight: reps + 1,
      rir: 1,
      completedAt: 1_759_200_100_000 + i,
    })),
    ...[12, 5].map((reps, i) => ({
      id: `2:rp:B.rp-row#${i + 1}`,
      sessionId: 2,
      templateId: 'B',
      slot: 'B.rp-row',
      exerciseId: 'inverted-row',
      setNumber: i + 1,
      reps,
      rir: 0,
      completedAt: 1_759_200_900_000 + i,
    })),
  ],
  kv: [
    {
      key: 'settings',
      value: { pullupMax: 6, pullupStage: 0, variations: { 'B.pistol': 'box' }, loads: {}, restScale: 1, loadStep: 2.5 },
    },
  ],
};
