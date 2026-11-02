import { describe, expect, it } from 'vitest';
import { getTemplate, getVariant } from '../data/program';
import type { SessionRecord } from '../db/db';
import { fmtPace, hrTargetBpm, hrTargetText, hrVerdict, paceVerdict, parsePace, phaseHrReport, phaseRowerReport, phaseTargets, rowedMetres, rowerSummary, spanText, splitConsistency, spmVerdict, wallClock } from './rowing';

describe('rowing targets', () => {
  it('formats spans and paces', () => {
    expect(spanText(20)).toBe('20');
    expect(spanText([22, 24])).toBe('22–24');
    expect(spanText([3, 3])).toBe('3');
    expect(spanText(undefined)).toBeUndefined();
    expect(fmtPace(125)).toBe('2:05');
    expect(fmtPace(119.6)).toBe('2:00');
    expect(parsePace('2:05')).toBe(125);
    expect(parsePace('2.05')).toBe(125);
    expect(parsePace('125')).toBe(125);
    expect(parsePace('5:00')).toBeUndefined();
    expect(parsePace('abc')).toBeUndefined();
  });

  it('turns a phase into bpm, % and pace targets', () => {
    const phase = { label: 'Tempo 1/4', durationSec: 300, intensity: 'hard' as const, spm: [22, 24] as [number, number], hrPct: [80, 85] as [number, number], rpe: [6, 7] as [number, number], paceOffset2k: [12, 18] as [number, number] };
    const t = phaseTargets(phase, { hrMax: 180, pace2kSec: 125 });
    expect(t.spm).toBe('22–24');
    expect(t.hrPct).toBe('80–85 %');
    expect(t.hrBpm).toEqual({ min: 144, max: 153 });
    expect(t.rpe).toBe('6–7');
    expect(t.pace).toBe('+12–18 s → 2:17–2:23');
    expect(t.paceOffset).toBe('+12–18 s');
    expect(t.paceSplit).toBe('2:17–2:23');
    expect(phaseTargets(phase, { hrMax: 180 }).pace).toBe('+12–18 s');
    expect(t.hasHr).toBe(true);
    // Accelerations have no HR target in the spec; legacy phases keep the intensity rule.
    expect(phaseTargets({ label: 'Accel 1/2', durationSec: 15, intensity: 'hard', kind: 'accel', spm: [24, 28], rpe: 5 }, { hrMax: 180 }).hasHr).toBe(false);
    expect(phaseTargets({ label: 'Hard 1/4', durationSec: 180, intensity: 'hard' }, { hrMax: 180 }).hasHr).toBe(true);
    // Recovery band [0, 75] has no lower bound; a phase without hrPct falls back to the intensity rule.
    expect(hrTargetBpm({ intensity: 'easy', hrPct: [0, 75] }, 180)).toEqual({ max: 135 });
    expect(hrTargetBpm({ intensity: 'hard' }, 180)).toEqual({ min: 153 });
    expect(hrTargetText({ min: 153 })).toBe('≥ 153');
    expect(hrTargetText({ max: 135 })).toBe('≤ 135');
  });

  it('judges live HR against the band, with a lag window on hard intervals', () => {
    const band = { min: 162, max: 171 };
    expect(hrVerdict(165, band, 120, 90)).toBe('on');
    expect(hrVerdict(150, band, 30, 90)).toBe('lag');
    expect(hrVerdict(150, band, 120, 90)).toBe('low');
    expect(hrVerdict(150, band, 30)).toBe('low');
    expect(hrVerdict(175, band, 30, 90)).toBe('high');
  });

  it('reports mean HR per phase of a finished session, skipping the HR lag', () => {
    const block = getVariant(getTemplate('row'), 'vo2max-30').blocks[0];
    if (block.kind !== 'interval') throw new Error('interval block expected');
    const t0 = 1_000_000;
    const bpm: number[] = [];
    let at = 0;
    for (const p of block.phases) {
      for (let s = 0; s < p.durationSec; s++) bpm.push(p.kind === 'work' ? (s < 90 ? 140 : 168) : 120);
      at += p.durationSec;
    }
    expect(at).toBe(1800);
    const session: Pick<SessionRecord, 'hr' | 'rowing'> = { hr: { startedAt: t0, bpm }, rowing: { phaseStartedAt: t0 } };
    const report = phaseHrReport(session, block.phases, { hrMax: 180 });
    expect(report).toHaveLength(block.phases.length);
    const work = report.filter((_, i) => block.phases[i].kind === 'work');
    expect(work.map((p) => p.mean)).toEqual([168, 168, 168, 168]);
    expect(work[0].target).toEqual({ min: 162, max: 171 });
    expect(work.every((p) => p.verdict === 'on')).toBe(true);
    expect(report[0].mean).toBe(120);
    expect(report[0].verdict).toBe('on'); // warm-up band 55–70 % of 180 = 99–126
    expect(phaseHrReport({ hr: { startedAt: t0, bpm } }, block.phases)).toEqual([]);
  });

  it('summarises a rower recording and reports per phase', () => {
    const block = getVariant(getTemplate('row'), 'fat-loss-30').blocks[0];
    if (block.kind !== 'interval') throw new Error('interval block expected');
    const t0 = 2_000_000;
    const spm: number[] = [];
    const paceSec: number[] = [];
    const watts: number[] = [];
    const distanceM: number[] = [];
    let dist = 0;
    let n = 0;
    for (const p of block.phases) {
      for (let s = 0; s < p.durationSec; s++) {
        const work = p.kind === 'work';
        const tempo = Number(p.label.split(' ')[1]?.split('/')[0] ?? 0);
        spm.push(work ? 23 : 18);
        paceSec.push(work ? 135 + (tempo === 4 ? 6 : 0) : 160);
        watts.push(work ? 170 : 90);
        dist += 500 / paceSec[paceSec.length - 1];
        distanceM.push(Math.round(dist));
        n++;
      }
    }
    expect(n).toBe(1800);
    const rec = { startedAt: t0, spm, paceSec, watts, distanceM, strokes: 640 };
    const sum = rowerSummary(rec)!;
    // Metres rowed from the first reading on (what was already on the counter is not counted).
    expect(sum.distanceM).toBe(distanceM[distanceM.length - 1] - distanceM[0]);
    expect(sum.avgSpm).toBeCloseTo(21.3, 0);
    expect(sum.avgWatts).toBe(143);
    expect(sum.maxWatts).toBe(170);
    expect(sum.strokes).toBe(640);
    expect(sum.coverage).toBe(1);
    expect(rowerSummary({ spm: [20], paceSec: [], watts: [], distanceM: [] })).toBeUndefined();
    const report = phaseRowerReport({ rower: rec, rowing: { phaseStartedAt: t0 } }, block.phases);
    const work = report.filter((_, i) => block.phases[i].kind === 'work');
    expect(work.map((p) => p.spm)).toEqual([23, 23, 23, 23]);
    expect(work.map((p) => p.paceSec)).toEqual([135, 135, 135, 141]);
    expect(work[0].distanceM).toBeGreaterThan(1100);
    expect(splitConsistency(work)).toEqual({ firstSec: 135, lastSec: 141, deltaSec: 6, verdict: 'faded' });
    expect(splitConsistency(work.slice(0, 3))?.verdict).toBe('even');
    expect(phaseRowerReport({ rower: rec }, block.phases)).toEqual([]);
  });

  it('judges cadence and pace against the phase', () => {
    const phase = { spm: [22, 24] as [number, number], paceOffset2k: [12, 18] as [number, number] };
    expect(spmVerdict(23, phase)).toBe('on');
    expect(spmVerdict(20, phase)).toBe('low');
    expect(spmVerdict(26, phase)).toBe('high');
    expect(spmVerdict(26, {})).toBeUndefined();
    expect(paceVerdict(140, phase, { pace2kSec: 125 })).toBe('on');
    expect(paceVerdict(150, phase, { pace2kSec: 125 })).toBe('low');
    expect(paceVerdict(130, phase, { pace2kSec: 125 })).toBe('high');
    expect(paceVerdict(130, phase, {})).toBeUndefined();
  });

  it('counts rowed metres across a counter reset and ignores metres already on the counter', () => {
    expect(rowedMetres([30, 40, -1, 60, 2, 12, 20])).toBe(10 + 20 + 10 + 8);
    expect(rowedMetres([1200, 1210, 1225])).toBe(25);
    expect(rowedMetres([])).toBe(0);
  });

  it('maps rowing time to wall-clock time across pauses', () => {
    const wall = wallClock(1000, [{ at: 1000 + 30_000, ms: 60_000 }]);
    expect(wall(10)).toBe(11_000);
    expect(wall(30)).toBe(1000 + 30_000 + 60_000); // the pause starts at 30 s of rowing
    expect(wall(40)).toBe(1000 + 40_000 + 60_000);
    expect(wallClock(0)(5)).toBe(5000);
  });

  it('keeps per-block HR aligned after a pause', () => {
    const block = getVariant(getTemplate('row'), 'fat-loss-30').blocks[0];
    if (block.kind !== 'interval') throw new Error('interval block expected');
    const t0 = 5_000_000;
    // Warm-up 300 s at 110, then a 120 s pause at 150 s into the warm-up (HR 90), then tempo at 150.
    const bpm: number[] = [];
    for (let s = 0; s < 150; s++) bpm.push(110);
    for (let s = 0; s < 120; s++) bpm.push(90);
    for (let s = 0; s < 150; s++) bpm.push(110);
    for (let s = 0; s < 300; s++) bpm.push(150);
    const session: Pick<SessionRecord, 'hr' | 'rowing'> = { hr: { startedAt: t0, bpm }, rowing: { phaseStartedAt: t0, pauses: [{ at: t0 + 150_000, ms: 120_000 }] } };
    const report = phaseHrReport(session, block.phases, { hrMax: 180 });
    expect(report[1].label).toBe('Tempo 1/4');
    expect(report[1].mean).toBe(150);
    // Without the pause record the tempo block would be read 2 min early (mostly warm-up).
    expect(phaseHrReport({ ...session, rowing: { phaseStartedAt: t0 } }, block.phases, { hrMax: 180 })[1].mean).toBeLessThan(140);
  });
});
