import { describe, expect, it } from 'vitest';
import type { SessionHr } from '../db/db';
import { parseHeartRate } from './ble';
import { banisterTrimp, compareHr, edwardsTrimp, estimateHrMax, filterRr, hrSummary, kcalKeytel, readinessOf, recovery60, restingHr, rmssd, statsBetween, timeInZones, weeklyLoad, zoneOf } from './metrics';

const dv = (bytes: number[]) => new DataView(new Uint8Array(bytes).buffer);

describe('heart rate measurement parser (0x2A37)', () => {
  it('reads 8-bit and 16-bit heart rate', () => {
    expect(parseHeartRate(dv([0x00, 72]), 1)).toEqual({ bpm: 72, rr: [], contact: undefined, energy: undefined, at: 1 });
    expect(parseHeartRate(dv([0x01, 0x2c, 0x01]), 1).bpm).toBe(300);
  });
  it('reads contact, energy and RR intervals (1/1024 s → ms)', () => {
    const s = parseHeartRate(dv([0x16, 60, 0x00, 0x04, 0x00, 0x04]), 1); // contact supported+detected, RR present
    expect(s.contact).toBe(true);
    expect(s.rr).toEqual([1000, 1000]);
    const e = parseHeartRate(dv([0x0c, 100, 0x10, 0x00]), 1); // contact supported, not detected, energy
    expect(e.contact).toBe(false);
    expect(e.energy).toBe(16);
    expect(e.rr).toEqual([]);
  });
});

describe('zones, load and calories', () => {
  it('zones from %HRmax', () => {
    // Rowing zones: Z1 ≤ 64 %, Z2 65–75, Z3 76–82, Z4 83–89, Z5 ≥ 90 (of HRmax 185).
    expect(zoneOf(0, 185)).toBe(0);
    expect(zoneOf(90, 185)).toBe(1);
    expect(zoneOf(118, 185)).toBe(1); // 64 %
    expect(zoneOf(120, 185)).toBe(2); // 65 %
    expect(zoneOf(150, 185)).toBe(3); // 81 %
    expect(zoneOf(160, 185)).toBe(4); // 86 %
    expect(zoneOf(167, 185)).toBe(5); // 90 %
    expect(zoneOf(185, 185)).toBe(5);
    expect(timeInZones([100, 100, 150, -1, 185], 185)).toEqual([2, 0, 1, 0, 1]);
  });
  it('TRIMP grows with intensity and is 0 at rest', () => {
    const easy = Array.from({ length: 600 }, () => 110);
    const hard = Array.from({ length: 600 }, () => 165);
    expect(banisterTrimp(hard, 185, 55)).toBeGreaterThan(banisterTrimp(easy, 185, 55) * 2);
    expect(banisterTrimp(Array.from({ length: 60 }, () => 55), 185, 55)).toBe(0);
    expect(edwardsTrimp([...easy, ...hard], 185)).toBeCloseTo(10 * 1 + 10 * 4, 0); // 110 bpm is zone 1, 165 zone 4 at HRmax 185
  });
  it('Keytel calories need the profile and scale with HR', () => {
    const hr = Array.from({ length: 3600 }, () => 140);
    expect(kcalKeytel(hr, {})).toBeUndefined();
    const male = kcalKeytel(hr, { sex: 'male', age: 35, weightKg: 75 })!;
    expect(male).toBeGreaterThan(500);
    expect(male).toBeLessThan(900);
    expect(kcalKeytel(hr, { sex: 'female', age: 35, weightKg: 60 })!).toBeLessThan(male);
    expect(estimateHrMax(1991, new Date(2026, 0, 1).getTime())).toBe(184);
  });
});

describe('HRV, resting HR and readiness', () => {
  it('filters artifacts and computes RMSSD', () => {
    expect(filterRr([1000, 1010, 1600, 990, 250, 1005])).toEqual([1000, 1010, 990, 1005]);
    expect(rmssd([1000, 1010, 1000, 1010])).toBeUndefined();
    const rr = Array.from({ length: 40 }, (_, i) => 1000 + (i % 2 ? 20 : -20));
    expect(rmssd(rr)).toBe(40);
  });
  it('resting HR is the lowest 30 s mean', () => {
    const bpm = [...Array.from({ length: 30 }, () => 70), ...Array.from({ length: 30 }, () => 56), ...Array.from({ length: 10 }, () => 64)];
    expect(restingHr(bpm)).toBe(56);
    expect(restingHr([60, 60])).toBeUndefined();
  });
  it('readiness compares with the baseline of earlier checks', () => {
    const prev = [
      { lnRmssd: Math.log(60), restingHr: 52 },
      { lnRmssd: Math.log(58), restingHr: 53 },
      { lnRmssd: Math.log(62), restingHr: 51 },
      { lnRmssd: Math.log(61), restingHr: 52 },
    ];
    expect(readinessOf({ at: 1, restingHr: 52, rmssd: 60 }, prev.slice(0, 2)).reason).toMatch(/baseline \(3\/3/);
    expect(readinessOf({ at: 1, restingHr: 52, rmssd: 60 }, prev).score).toBe('go');
    expect(readinessOf({ at: 1, restingHr: 56, rmssd: 52 }, prev).score).toBe('caution');
    const bad = readinessOf({ at: 1, restingHr: 62, rmssd: 35 }, prev);
    expect(bad.score).toBe('rest');
    expect(bad.reason).toMatch(/HRV 35 ms vs 60 usual/);
    expect(bad.baseline?.n).toBe(4);
  });
});

describe('session summary and recovery', () => {
  const t0 = 1_000_000_000;
  const bpm: number[] = [];
  for (let s = 0; s < 1800; s++) bpm.push(s % 120 < 40 ? 150 : 110); // 40 s work at 150, 80 s rest at 110
  const hr: SessionHr = { startedAt: t0, bpm };

  it('summarises a recording', () => {
    const sum = hrSummary(hr, { hrMax: 185, hrRest: 55, sex: 'male', age: 35, weightKg: 75 }, [30, 34])!;
    expect(sum.avg).toBe(123);
    expect(sum.max).toBe(150);
    expect(sum.zonesSec.reduce((a, b) => a + b, 0)).toBe(1800);
    expect(sum.trimpMethod).toBe('banister');
    expect(sum.trimp).toBeGreaterThan(10);
    expect(sum.kcal).toBeGreaterThan(100);
    expect(sum.recoveryMean).toBe(32);
    expect(sum.coverage).toBe(1);
    expect(hrSummary({ startedAt: t0, bpm: [120, 121] }, { hrMax: 185 })).toBeUndefined();
    expect(hrSummary(hr, { hrMax: 185 })!.trimpMethod).toBe('edwards');
  });
  it('recovery and stats between timestamps', () => {
    expect(recovery60(hr, t0 + 39_000)).toBe(40);
    expect(recovery60(hr, t0 + 1_799_000)).toBeUndefined();
    expect(statsBetween(hr, t0, t0 + 39_000)).toMatchObject({ mean: 150, max: 150 });
    expect(statsBetween(hr, t0 - 5000, t0 - 1000)).toEqual({});
  });
  it('compares two summaries and sums weekly load', () => {
    const a = hrSummary(hr, { hrMax: 185, hrRest: 55 })!;
    const b = { ...a, avg: a.avg - 5, trimp: (a.trimp ?? 0) - 3 };
    expect(compareHr(a, b)).toMatchObject({ avg: 5, trimp: 3 });
    const DAY = 24 * 3600 * 1000;
    const w0 = 1_000_000;
    const load = weeklyLoad([{ startedAt: w0 + DAY, trimp: 50 }, { startedAt: w0 + 3 * DAY, trimp: 70 }, { startedAt: w0 + 8 * DAY, trimp: 40 }], [w0, w0 + 7 * DAY]);
    expect(load.trimp).toEqual([120, 40]);
    expect(load.monotony).toBeGreaterThan(0);
  });
});
