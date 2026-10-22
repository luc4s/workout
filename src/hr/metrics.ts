/** Pure heart-rate maths: zones, training load, calories, HRV, recovery, readiness. */
import type { HrSummary, Readiness, SessionHr, Settings } from '../db/db';

export const ZONE_BOUNDS = [0.5, 0.6, 0.7, 0.8, 0.9];
export const ZONE_NAMES = ['Z1 easy', 'Z2 light', 'Z3 moderate', 'Z4 hard', 'Z5 max'];

/** Tanaka et al. 2001: 208 − 0.7 × age. */
export function estimateHrMax(birthYear: number | undefined, now = Date.now()): number | undefined {
  if (!birthYear) return undefined;
  const age = new Date(now).getFullYear() - birthYear;
  if (age < 10 || age > 100) return undefined;
  return Math.round(208 - 0.7 * age);
}

/** Max HR to use: the profile value, else the age estimate, else a generic 185. */
export function hrMaxOf(settings: Pick<Settings, 'hrMax' | 'birthYear'>, now = Date.now()): number {
  return settings.hrMax ?? estimateHrMax(settings.birthYear, now) ?? 185;
}

/** Zone 1–5 (0 = below zone 1). */
export function zoneOf(bpm: number, hrMax: number): number {
  const f = bpm / hrMax;
  let z = 0;
  for (const b of ZONE_BOUNDS) if (f >= b) z++;
  return z;
}

/** Seconds in zones 1–5 over 1 Hz samples (gaps = -1 ignored). */
export function timeInZones(bpm: number[], hrMax: number): number[] {
  const out = [0, 0, 0, 0, 0];
  for (const b of bpm) {
    if (b <= 0) continue;
    const z = zoneOf(b, hrMax);
    if (z > 0) out[z - 1]++;
  }
  return out;
}

/** Banister TRIMP over 1 Hz samples, HR reserve weighting (male 0.64·e^1.92x, female 0.86·e^1.67x). */
export function banisterTrimp(bpm: number[], hrMax: number, hrRest: number, sex: 'male' | 'female' = 'male'): number {
  const [a, b] = sex === 'female' ? [0.86, 1.67] : [0.64, 1.92];
  let sum = 0;
  for (const h of bpm) {
    if (h <= 0) continue;
    const x = Math.max(0, Math.min(1, (h - hrRest) / Math.max(1, hrMax - hrRest)));
    sum += (1 / 60) * x * a * Math.exp(b * x);
  }
  return Math.round(sum * 10) / 10;
}

/** Edwards zone TRIMP: minutes in zone × zone number. */
export function edwardsTrimp(bpm: number[], hrMax: number): number {
  const z = timeInZones(bpm, hrMax);
  return Math.round(z.reduce((a, sec, i) => a + (sec / 60) * (i + 1), 0) * 10) / 10;
}

/**
 * Keytel et al. 2005 energy expenditure from HR (kcal). Fitted on steady aerobic exercise, so a
 * strength session is an estimate at best; undefined without sex, age and weight.
 */
export function kcalKeytel(bpm: number[], p: { sex?: 'male' | 'female'; age?: number; weightKg?: number }): number | undefined {
  if (!p.sex || !p.age || !p.weightKg) return undefined;
  let kj = 0;
  for (const h of bpm) {
    if (h <= 0) continue;
    const perMin = p.sex === 'male' ? -55.0969 + 0.6309 * h + 0.1988 * p.weightKg + 0.2017 * p.age : -20.4022 + 0.4472 * h - 0.1263 * p.weightKg + 0.074 * p.age;
    kj += Math.max(0, perMin) / 60;
  }
  return Math.round(kj / 4.184);
}

/** Drop RR intervals that differ from the previous kept one by more than 20 % (ectopics, dropouts). */
export function filterRr(rr: number[]): number[] {
  const out: number[] = [];
  for (const v of rr) {
    if (v < 300 || v > 2000) continue;
    const prev = out[out.length - 1];
    if (prev !== undefined && Math.abs(v - prev) > 0.2 * prev) continue;
    out.push(v);
  }
  return out;
}

/** Root mean square of successive RR differences, ms. */
export function rmssd(rr: number[]): number | undefined {
  if (rr.length < 10) return undefined;
  let sum = 0;
  for (let i = 1; i < rr.length; i++) sum += (rr[i] - rr[i - 1]) ** 2;
  return Math.round(Math.sqrt(sum / (rr.length - 1)) * 10) / 10;
}

/** Resting HR as the lowest 30 s mean of the samples (bpm). */
export function restingHr(bpm: number[]): number | undefined {
  const valid = bpm.filter((b) => b > 0);
  if (valid.length < 20) return undefined;
  const win = Math.min(30, valid.length);
  let best = Infinity;
  for (let i = 0; i + win <= valid.length; i++) {
    const m = valid.slice(i, i + win).reduce((a, b) => a + b, 0) / win;
    if (m < best) best = m;
  }
  return Math.round(best);
}

function meanSd(xs: number[]): { mean: number; sd: number } {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, xs.length - 1));
  return { mean, sd };
}

/**
 * Readiness from today's check against the previous ones (needs 3 for a baseline): low HRV and a
 * raised resting HR both point to fatigue.
 */
export function readinessOf(today: { at: number; restingHr: number; rmssd: number }, previous: Pick<Readiness, 'lnRmssd' | 'restingHr'>[]): Readiness {
  const lnRmssd = Math.round(Math.log(Math.max(1, today.rmssd)) * 100) / 100;
  const base: Readiness = { at: today.at, restingHr: today.restingHr, rmssd: today.rmssd, lnRmssd, score: 'go', reason: '' };
  if (previous.length < 3) {
    return { ...base, reason: `Building your baseline (${previous.length + 1}/3 checks) — resting HR ${today.restingHr}, HRV ${today.rmssd} ms.` };
  }
  const ln = meanSd(previous.map((p) => p.lnRmssd));
  const hr = meanSd(previous.map((p) => p.restingHr));
  const zLn = ln.sd > 0.05 ? (lnRmssd - ln.mean) / ln.sd : 0;
  const zHr = hr.sd > 1 ? (today.restingHr - hr.mean) / hr.sd : (today.restingHr - hr.mean) / 3;
  const baseline = { n: previous.length, lnRmssd: Math.round(ln.mean * 100) / 100, lnRmssdSd: Math.round(ln.sd * 100) / 100, restingHr: Math.round(hr.mean), restingHrSd: Math.round(hr.sd * 10) / 10 };
  const hrText = `resting HR ${today.restingHr} vs ${baseline.restingHr} usual`;
  const hrvText = `HRV ${today.rmssd} ms vs ${Math.round(Math.exp(ln.mean))} usual`;
  if (zLn < -1.5 || (zHr > 1.5 && today.restingHr - hr.mean >= 6)) {
    return { ...base, score: 'rest', reason: `Clearly below your baseline: ${hrvText}, ${hrText}. A bad-day session or a rest day.`, baseline };
  }
  if (zLn < -0.75 || zHr > 0.75) {
    return { ...base, score: 'caution', reason: `A little below your baseline: ${hrvText}, ${hrText}. Train, but don't chase PRs.`, baseline };
  }
  return { ...base, score: 'go', reason: `On your baseline: ${hrvText}, ${hrText}.`, baseline };
}

/** Index into a 1 Hz recording for a timestamp (clamped), or -1 before the recording started. */
export function sampleIndex(hr: Pick<SessionHr, 'startedAt' | 'bpm'>, at: number): number {
  const i = Math.floor((at - hr.startedAt) / 1000);
  return i < 0 ? -1 : Math.min(hr.bpm.length - 1, i);
}

/** Mean / max of the valid samples between two timestamps. */
export function statsBetween(hr: Pick<SessionHr, 'startedAt' | 'bpm'>, from: number, to: number): { mean?: number; max?: number; start?: number; end?: number } {
  const a = Math.max(0, sampleIndex(hr, from));
  const b = sampleIndex(hr, to);
  if (b < a) return {};
  const slice = hr.bpm.slice(a, b + 1).filter((x) => x > 0);
  if (!slice.length) return {};
  return {
    mean: Math.round(slice.reduce((x, y) => x + y, 0) / slice.length),
    max: Math.max(...slice),
    start: slice[0],
    end: slice[slice.length - 1],
  };
}

/** HR drop 60 s after `at` (bpm), from the 5 s means ending at `at` and at `at` + 60 s; undefined when data is missing. */
export function recovery60(hr: Pick<SessionHr, 'startedAt' | 'bpm'>, at: number): number | undefined {
  const i = sampleIndex(hr, at);
  if (i < 0) return undefined;
  const mean5 = (idx: number) => {
    const s = hr.bpm.slice(Math.max(0, idx - 4), idx + 1).filter((x) => x > 0);
    return s.length ? s.reduce((a, b) => a + b, 0) / s.length : undefined;
  };
  const a = mean5(i);
  const j = i + 60;
  if (j >= hr.bpm.length) return undefined;
  const b = mean5(j);
  if (a === undefined || b === undefined) return undefined;
  return Math.round(a - b);
}

export interface HrProfile {
  hrMax: number;
  hrRest?: number;
  sex?: 'male' | 'female';
  age?: number;
  weightKg?: number;
}

export function profileOf(settings: Settings, now = Date.now()): HrProfile {
  return {
    hrMax: hrMaxOf(settings, now),
    hrRest: settings.hrRest,
    sex: settings.sex,
    age: settings.birthYear ? new Date(now).getFullYear() - settings.birthYear : undefined,
    weightKg: settings.bodyweightKg,
  };
}

export function hrSummary(hr: SessionHr, profile: HrProfile, recoveries: number[] = []): HrSummary | undefined {
  const valid = hr.bpm.filter((b) => b > 0);
  if (valid.length < 30) return undefined;
  const avg = Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
  const trimp = profile.hrRest ? banisterTrimp(hr.bpm, profile.hrMax, profile.hrRest, profile.sex) : edwardsTrimp(hr.bpm, profile.hrMax);
  const rec = recoveries.filter((r) => Number.isFinite(r));
  return {
    avg,
    max: Math.max(...valid),
    min: Math.min(...valid),
    zonesSec: timeInZones(hr.bpm, profile.hrMax),
    trimp,
    trimpMethod: profile.hrRest ? 'banister' : 'edwards',
    kcal: kcalKeytel(hr.bpm, profile),
    recoveryMean: rec.length ? Math.round(rec.reduce((a, b) => a + b, 0) / rec.length) : undefined,
    samples: valid.length,
    coverage: Math.round((valid.length / hr.bpm.length) * 100) / 100,
    hrMax: profile.hrMax,
    hrRest: profile.hrRest,
  };
}

export interface HrComparison {
  avg: number;
  max: number;
  trimp?: number;
  kcal?: number;
  recoveryMean?: number;
}

/** Differences `a − b` for the fields both have. */
export function compareHr(a: HrSummary, b: HrSummary): HrComparison {
  const d = (x?: number, y?: number) => (x !== undefined && y !== undefined ? Math.round((x - y) * 10) / 10 : undefined);
  return { avg: a.avg - b.avg, max: a.max - b.max, trimp: d(a.trimp, b.trimp), kcal: d(a.kcal, b.kcal), recoveryMean: d(a.recoveryMean, b.recoveryMean) };
}

/** Weekly TRIMP totals (oldest first) and the latest week's monotony (mean / SD of daily load). */
export function weeklyLoad(sessions: { startedAt: number; trimp?: number }[], weekStarts: number[]): { trimp: number[]; monotony?: number; strain?: number } {
  const DAY = 24 * 3600 * 1000;
  const trimp = weekStarts.map((w) => sessions.filter((s) => s.startedAt >= w && s.startedAt < w + 7 * DAY).reduce((a, s) => a + (s.trimp ?? 0), 0));
  const last = weekStarts[weekStarts.length - 1];
  if (last === undefined) return { trimp };
  const daily = Array.from({ length: 7 }, (_, i) => sessions.filter((s) => s.startedAt >= last + i * DAY && s.startedAt < last + (i + 1) * DAY).reduce((a, s) => a + (s.trimp ?? 0), 0));
  const { mean, sd } = meanSd(daily);
  const monotony = sd > 0 ? Math.round((mean / sd) * 100) / 100 : undefined;
  const total = daily.reduce((a, b) => a + b, 0);
  return { trimp: trimp.map((t) => Math.round(t)), monotony, strain: monotony !== undefined ? Math.round(total * monotony) : undefined };
}

export function fmtZones(zonesSec: number[]): string {
  return zonesSec.map((s, i) => `Z${i + 1} ${Math.round(s / 60)}′`).join(' · ');
}
