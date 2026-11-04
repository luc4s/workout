import { describe, expect, it } from 'vitest';
import { getTemplate, getVariant } from '../data/program';
import type { IntervalPhase } from '../data/types';
import type { SessionRecord } from '../db/db';
import {
  curveAt,
  ghostDelta,
  ghostFor,
  longestStreak,
  medalOf,
  medalPhases,
  multiplierOf,
  newBadges,
  newBests,
  rowingStreak,
  rowingTotals,
  scoreTimeline,
  unlockedBadges,
} from './rowgame';

const DAY = 24 * 3600 * 1000;
const phasesOf = (v: string): IntervalPhase[] => {
  const b = getVariant(getTemplate('row'), v).blocks[0];
  if (b.kind !== 'interval') throw new Error('interval expected');
  return b.phases;
};
const settings = { hrMax: 180, pace2kSec: 125 };
let id = 1000;
function rowSession(variantId: string, startedAt: number, rowing: SessionRecord['rowing'] = {}): SessionRecord {
  return { id: id++, templateId: 'row', variantId, startedAt, endedAt: startedAt + 1800_000, flags: { badDay: false, deload: false, finisher: false }, rowing };
}

describe('rowing game: scoring', () => {
  const steady: IntervalPhase[] = [{ label: 'Block', durationSec: 300, intensity: 'steady', kind: 'steady', spm: 20, hrPct: [65, 75] }];

  it('multiplier steps and medal thresholds', () => {
    expect([0, 29, 30, 89, 90, 179, 180].map(multiplierOf)).toEqual([1, 1, 2, 2, 3, 3, 4]);
    expect(medalOf(90, 100, 100)).toBe('gold');
    expect(medalOf(75, 100, 100)).toBe('silver');
    expect(medalOf(50, 100, 100)).toBe('bronze');
    expect(medalOf(40, 100, 100)).toBeNull();
    expect(medalOf(40, 40, 100)).toBeNull(); // less than half the block judged
    expect(medalPhases(phasesOf('vo2max-30'))).toHaveLength(4);
    expect(medalPhases(phasesOf('fat-loss-60'))).toEqual([1, 2, 3, 4]); // Z2: the steady blocks
  });

  it('scores seconds on target with a growing combo; nothing to judge means no score', () => {
    const bpm = Array.from({ length: 300 }, () => 125); // 69 % of 180: in 65–75 %
    const st = scoreTimeline({ phases: steady, startedAt: 0, hr: { startedAt: 0, bpm }, settings });
    expect(st.onSec).toBe(300);
    expect(st.maxMultiplier).toBe(4);
    // 29 s ×1, 60 s ×2, 90 s ×3, 121 s ×4
    expect(st.score).toBe(10 * (29 + 60 * 2 + 90 * 3 + 121 * 4));
    expect(st.medals).toEqual(['gold']);
    expect(st.curve).toHaveLength(30);
    expect(st.curve[29]).toBe(st.score);
    const none = scoreTimeline({ phases: steady, startedAt: 0, settings });
    expect(none.judgedSec).toBe(0);
    expect(none.score).toBe(0);
  });

  it('a short wobble keeps the combo, three seconds off target break it', () => {
    const bpm = Array.from({ length: 300 }, () => 125);
    bpm[100] = 160;
    bpm[101] = 160; // 2 s off: combo kept
    for (let i = 200; i < 203; i++) bpm[i] = 160; // 3 s off: combo broken
    const st = scoreTimeline({ phases: steady, startedAt: 0, hr: { startedAt: 0, bpm }, settings, untilSec: 210 });
    expect(st.onSec).toBe(210 - 5);
    expect(st.combo).toBe(7); // rebuilt from 203
    expect(st.multiplier).toBe(1);
    // The wobble at 100 s did not reset it: 198 s of combo reached ×4 before the break at 200 s.
    expect(st.maxMultiplier).toBe(4);
  });

  it('HR lag seconds are neutral; the console adds cadence and split', () => {
    const phases: IntervalPhase[] = [{ label: 'VO2max 1/4', durationSec: 240, intensity: 'hard', kind: 'work', spm: [26, 30], hrPct: [90, 95], paceOffset2k: [2, 4], hrLagSec: 90 }];
    const bpm = Array.from({ length: 240 }, (_, s) => (s < 90 ? 140 : 165));
    const hrOnly = scoreTimeline({ phases, startedAt: 0, hr: { startedAt: 0, bpm }, settings });
    expect(hrOnly.judgedSec).toBe(150); // the first 90 s are not judged
    expect(hrOnly.onSec).toBe(150);
    const rower = { startedAt: 0, spm: Array(240).fill(28), paceSec: Array(240).fill(128), distanceM: Array.from({ length: 240 }, (_, i) => i * 4) };
    const both = scoreTimeline({ phases, startedAt: 0, hr: { startedAt: 0, bpm }, rower, settings });
    expect(both.judgedSec).toBe(240); // cadence and split judge the lag seconds
    expect(both.onSec).toBe(240);
    expect(both.metres).toBe(239 * 4);
    expect(both.distCurve?.[0]).toBe(36);
    const slow = scoreTimeline({ phases, startedAt: 0, hr: { startedAt: 0, bpm }, rower: { ...rower, paceSec: Array(240).fill(140) }, settings });
    expect(slow.onSec).toBe(0);
    expect(slow.medals).toEqual([null]);
  });

  it('follows pauses: the recordings are wall-clock', () => {
    const bpm = [...Array(100).fill(125), ...Array(60).fill(60), ...Array(200).fill(125)];
    const st = scoreTimeline({ phases: steady, startedAt: 0, pauses: [{ at: 100_000, ms: 60_000 }], hr: { startedAt: 0, bpm }, settings });
    expect(st.onSec).toBe(300);
  });
});

describe('rowing game: ghost, bests, streaks, badges', () => {
  const monday = new Date(2026, 8, 14, 18).getTime();

  it('reads a curve and gives the gap to the ghost', () => {
    expect(curveAt([100, 300], 5)).toBe(50);
    expect(curveAt([100, 300], 15)).toBe(200);
    expect(curveAt([100, 300], 60)).toBe(300);
    const ghost = { at: 0, curve: [100, 300], distCurve: [30, 60], score: 300 };
    expect(ghostDelta(ghost, { elapsedSec: 20, score: 350, metres: 70 })).toEqual({ metres: 10, points: 50 });
    expect(ghostDelta(ghost, { elapsedSec: 20, score: 250 })).toEqual({ points: -50 });
  });

  it('finds the last session of the same workout as the ghost', () => {
    const game = { v: 1 as const, score: 900, onSec: 60, judgedSec: 60, maxMultiplier: 2, medals: [], curve: [100, 900] };
    const sessions = [rowSession('vo2max-30', monday - 7 * DAY, { game }), rowSession('fat-loss-30', monday - 2 * DAY, { game: { ...game, score: 5 } }), rowSession('vo2max-30', monday + DAY)];
    expect(ghostFor(sessions, 'vo2max-30', monday, settings)?.score).toBe(900);
    expect(ghostFor(sessions, 'vo2max-60', monday, settings)).toBeUndefined();
  });

  it('flags new personal bests against earlier sessions of the same workout', () => {
    const g = (score: number) => ({ v: 1 as const, score, onSec: 1, judgedSec: 1, maxMultiplier: 1, medals: [], curve: [] });
    const a = rowSession('fat-loss-30', monday, { game: g(1000), distanceM: 6000, avgSplit: '2:20' });
    const b = rowSession('fat-loss-30', monday + 7 * DAY, { game: g(1500), distanceM: 5900, avgSplit: '2:18' });
    expect(newBests([a, b], b)).toEqual([
      { kind: 'score', value: 1500, previous: 1000 },
      { kind: 'split', value: 138, previous: 140 },
    ]);
    expect(newBests([a], a).map((x) => x.previous)).toEqual([undefined, undefined, undefined]);
  });

  it('counts weekly streaks; this week does not break the streak before it ends', () => {
    const weeks = [0, 1, 2, 4].map((w) => rowSession('fat-loss-60', monday - w * 7 * DAY));
    expect(rowingStreak(weeks, monday + DAY)).toBe(3);
    expect(rowingStreak(weeks.slice(1), monday + DAY)).toBe(2); // nothing yet this week
    expect(longestStreak(weeks)).toBe(3);
    expect(rowingTotals(weeks).sessions).toBe(4);
  });

  it('unlocks badges and names the ones a session added', () => {
    const g = { v: 1 as const, score: 52_000, onSec: 1200, judgedSec: 1300, maxMultiplier: 4, medals: ['gold' as const, 'gold' as const, 'gold' as const, 'gold' as const], curve: [] };
    const first = rowSession('fat-loss-30', monday, { distanceM: 6000 });
    const second = rowSession('vo2max-30', monday + 2 * DAY, { distanceM: 7000, game: g });
    expect([...unlockedBadges([first])]).toEqual(['first-row']);
    expect(newBadges([first, second], second).map((b) => b.id)).toEqual(['first-4x4', 'gold-sweep', 'combo-x4', 'score-50k']);
    expect(newBadges([first, second], first).map((b) => b.id)).toEqual(['first-row']);
  });
});
