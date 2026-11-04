/**
 * The rowing game: points for every second on target, a combo that grows while you stay there,
 * medals per interval, a ghost of your last session of the same workout, personal bests, streaks
 * and badges. Pure functions of the recordings and the session history, so the live score survives
 * a reload and the summary can recompute it.
 */
import { getTemplate, getVariant } from '../data/program';
import type { IntervalPhase } from '../data/types';
import type { Medal, RowGame, SessionRecord, Settings } from '../db/db';
import { hrVerdict, isWorkPhase, parsePace, phaseRowerReport, phaseTargets, splitConsistency, wallClock } from './rowing';
import { weekStart } from './schedule';

export type SecState = 'on' | 'off' | 'none';

/** Off-target seconds in a row that break the combo (a short wobble does not). */
export const COMBO_GRACE_SEC = 3;
export const POINTS_PER_SEC = 10;
const CURVE_STEP_SEC = 10;

/** Combo multiplier from consecutive seconds on target. */
export function multiplierOf(comboSec: number): number {
  return comboSec >= 180 ? 4 : comboSec >= 90 ? 3 : comboSec >= 30 ? 2 : 1;
}

/** Seconds of combo needed for the next multiplier, or undefined at the top. */
export function nextMultiplierAt(comboSec: number): number | undefined {
  return comboSec < 30 ? 30 : comboSec < 90 ? 90 : comboSec < 180 ? 180 : undefined;
}

export function medalOf(onSec: number, judgedSec: number, durationSec: number): Medal | null {
  if (judgedSec < durationSec * 0.5 || judgedSec === 0) return null;
  const share = onSec / judgedSec;
  return share >= 0.9 ? 'gold' : share >= 0.75 ? 'silver' : share >= 0.5 ? 'bronze' : null;
}

/** Blocks that earn medals: the work intervals, or the steady blocks of a workout without any. */
export function medalPhases(phases: Pick<IntervalPhase, 'intensity' | 'kind'>[]): number[] {
  const work = phases.map((p, i) => (isWorkPhase(p) ? i : -1)).filter((i) => i >= 0);
  if (work.length) return work;
  return phases.map((p, i) => (p.intensity === 'steady' ? i : -1)).filter((i) => i >= 0);
}

export interface GameInput {
  phases: IntervalPhase[];
  /** Wall-clock start of the interval timer, and the pauses taken since. */
  startedAt: number;
  pauses?: { at: number; ms: number }[];
  hr?: { startedAt: number; bpm: number[] };
  rower?: { startedAt: number; spm: number[]; paceSec: number[]; distanceM: number[] };
  settings: Pick<Settings, 'hrMax' | 'birthYear' | 'pace2kSec'>;
  /** Seconds of rowing to score (live: elapsed so far); default the whole workout. */
  untilSec?: number;
}

export interface PhaseGame {
  score: number;
  onSec: number;
  judgedSec: number;
}

export interface GameState {
  elapsedSec: number;
  score: number;
  /** Consecutive seconds on target (grace seconds included). */
  combo: number;
  multiplier: number;
  maxMultiplier: number;
  onSec: number;
  judgedSec: number;
  /** State of the last scored second, and how many off seconds in a row led to it. */
  last: SecState;
  offRun: number;
  phases: PhaseGame[];
  /** Medals of the medal-eligible blocks finished so far, in order. */
  medals: (Medal | null)[];
  curve: number[];
  distCurve?: number[];
  metres?: number;
}

/** Score the rowing second by second. */
export function scoreTimeline(input: GameInput): GameState {
  const { phases, hr, rower, settings } = input;
  const total = phases.reduce((a, p) => a + p.durationSec, 0);
  const until = Math.max(0, Math.min(total, Math.floor(input.untilSec ?? total)));
  const wall = wallClock(input.startedAt, input.pauses);
  const targets = phases.map((p) => phaseTargets(p, settings));
  const eligible = new Set(medalPhases(phases));
  const st: GameState = {
    elapsedSec: until,
    score: 0,
    combo: 0,
    multiplier: 1,
    maxMultiplier: 1,
    onSec: 0,
    judgedSec: 0,
    last: 'none',
    offRun: 0,
    phases: phases.map(() => ({ score: 0, onSec: 0, judgedSec: 0 })),
    medals: [],
    curve: [],
    ...(rower ? { distCurve: [], metres: 0 } : {}),
  };
  let phase = 0;
  let phaseStart = 0;
  let prevDist: number | undefined;
  for (let s = 0; s < until; s++) {
    while (phase < phases.length - 1 && s >= phaseStart + phases[phase].durationSec) {
      if (eligible.has(phase)) st.medals.push(medalOf(st.phases[phase].onSec, st.phases[phase].judgedSec, phases[phase].durationSec));
      phaseStart += phases[phase].durationSec;
      phase++;
    }
    const p = phases[phase];
    const t = targets[phase];
    const inPhase = s - phaseStart;
    const at = wall(s);
    const verdicts: ('on' | 'off')[] = [];
    if (hr && t.hasHr) {
      const bpm = hr.bpm[Math.floor((at - hr.startedAt) / 1000)];
      if (bpm !== undefined && bpm > 0) {
        const v = hrVerdict(bpm, t.hrBpm, inPhase, t.lagSec);
        if (v !== 'lag') verdicts.push(v === 'on' ? 'on' : 'off');
      }
    }
    if (rower) {
      const i = Math.floor((at - rower.startedAt) / 1000);
      const spm = rower.spm[i];
      if (p.spm !== undefined && spm !== undefined && spm >= 0) {
        const [lo, hi] = typeof p.spm === 'number' ? [p.spm, p.spm] : p.spm;
        verdicts.push(spm >= lo - 0.5 && spm <= hi + 0.5 ? 'on' : 'off');
      }
      const pace = rower.paceSec[i];
      if (p.paceOffset2k && settings.pace2kSec && pace !== undefined && pace > 0) {
        const [lo, hi] = p.paceOffset2k;
        verdicts.push(pace <= settings.pace2kSec + hi + 1 && pace >= settings.pace2kSec + lo - 1 ? 'on' : 'off');
      }
      const d = rower.distanceM[i];
      if (d !== undefined && d >= 0) {
        if (prevDist !== undefined && d > prevDist) st.metres! += d - prevDist;
        prevDist = d;
      }
    }
    const state: SecState = verdicts.length === 0 ? 'none' : verdicts.every((v) => v === 'on') ? 'on' : 'off';
    const ph = st.phases[phase];
    if (state === 'on') {
      st.combo++;
      st.offRun = 0;
      st.multiplier = multiplierOf(st.combo);
      st.maxMultiplier = Math.max(st.maxMultiplier, st.multiplier);
      const pts = POINTS_PER_SEC * st.multiplier;
      st.score += pts;
      ph.score += pts;
      ph.onSec++;
      ph.judgedSec++;
      st.onSec++;
      st.judgedSec++;
    } else if (state === 'off') {
      st.offRun++;
      ph.judgedSec++;
      st.judgedSec++;
      if (st.offRun >= COMBO_GRACE_SEC) {
        st.combo = 0;
        st.multiplier = 1;
      }
    }
    st.last = state;
    if ((s + 1) % CURVE_STEP_SEC === 0) {
      st.curve.push(st.score);
      st.distCurve?.push(Math.round(st.metres ?? 0));
    }
  }
  // The block that ends exactly at `until` (or the last one) is finished too.
  if (until >= phaseStart + phases[phase].durationSec && eligible.has(phase)) {
    st.medals.push(medalOf(st.phases[phase].onSec, st.phases[phase].judgedSec, phases[phase].durationSec));
  }
  if (st.metres !== undefined) st.metres = Math.round(st.metres);
  return st;
}

/** The game input of a stored session (undefined when it was not rowed with a strap or console). */
export function gameInputOf(session: SessionRecord, settings: GameInput['settings'], rowedPhases?: IntervalPhase[]): GameInput | undefined {
  if (session.templateId !== 'row' || !session.rowing?.phaseStartedAt || (!session.hr && !session.rower)) return undefined;
  const block = getVariant(getTemplate('row'), session.variantId).blocks[0];
  const phases = rowedPhases ?? (block.kind === 'interval' ? block.phases : undefined);
  if (!phases) return undefined;
  return { phases, startedAt: session.rowing.phaseStartedAt, pauses: session.rowing.pauses, hr: session.hr, rower: session.rower, settings };
}

/** What is stored with the session at finish. */
export function gameSummary(st: GameState): RowGame | undefined {
  if (st.judgedSec === 0) return undefined;
  return { v: 1, score: st.score, onSec: st.onSec, judgedSec: st.judgedSec, maxMultiplier: st.maxMultiplier, medals: st.medals, curve: st.curve, ...(st.distCurve && st.distCurve.some((d) => d > 0) ? { distCurve: st.distCurve } : {}) };
}

/* ---------- ghost ---------- */

export interface Ghost {
  at: number;
  curve: number[];
  distCurve?: number[];
  score: number;
}

/** The last completed session of the same workout, as a ghost (stored game, else recomputed from its recordings). */
export function ghostFor(sessions: SessionRecord[], variantId: string, before: number, settings: GameInput['settings']): Ghost | undefined {
  const prev = sessions
    .filter((s) => s.templateId === 'row' && s.variantId === variantId && s.endedAt && s.startedAt < before)
    .sort((a, b) => b.startedAt - a.startedAt);
  for (const s of prev) {
    const g = s.rowing?.game;
    if (g?.curve.length) return { at: s.startedAt, curve: g.curve, distCurve: g.distCurve, score: g.score };
    const input = gameInputOf(s, settings);
    if (!input) continue;
    const st = scoreTimeline(input);
    if (st.judgedSec > 0) return { at: s.startedAt, curve: st.curve, distCurve: st.distCurve?.some((d) => d > 0) ? st.distCurve : undefined, score: st.score };
  }
  return undefined;
}

/** A curve sampled every 10 s, read at `sec` (linear between points, 0 at the start). */
export function curveAt(curve: number[], sec: number): number {
  if (!curve.length || sec <= 0) return 0;
  const x = sec / CURVE_STEP_SEC;
  const k = Math.floor(x);
  if (k >= curve.length) return curve[curve.length - 1];
  const a = k === 0 ? 0 : curve[k - 1];
  const b = curve[k];
  return Math.round(a + (b - a) * (x - k));
}

/** Ahead (+) or behind (−) the ghost at the same rowing time: in metres when both have distance, else in points. */
export function ghostDelta(ghost: Ghost, now: { elapsedSec: number; score: number; metres?: number }): { metres?: number; points: number } {
  const points = now.score - curveAt(ghost.curve, now.elapsedSec);
  if (ghost.distCurve && now.metres !== undefined && now.metres > 0) return { metres: Math.round(now.metres - curveAt(ghost.distCurve, now.elapsedSec)), points };
  return { points };
}

/* ---------- personal bests ---------- */

export interface Best {
  kind: 'score' | 'distance' | 'split';
  value: number;
  /** The previous best, or undefined when this is the first value on record. */
  previous?: number;
}

function bestsOf(list: SessionRecord[]): { score?: number; distance?: number; split?: number } {
  const scores = list.map((s) => s.rowing?.game?.score).filter((x): x is number => x !== undefined);
  const dists = list.map((s) => s.rowing?.distanceM).filter((x): x is number => !!x);
  const splits = list.map((s) => (s.rowing?.avgSplit ? parsePace(s.rowing.avgSplit) : undefined)).filter((x): x is number => x !== undefined);
  return {
    score: scores.length ? Math.max(...scores) : undefined,
    distance: dists.length ? Math.max(...dists) : undefined,
    split: splits.length ? Math.min(...splits) : undefined,
  };
}

/** New personal bests set by `session` against earlier sessions of the same workout. */
export function newBests(sessions: SessionRecord[], session: SessionRecord): Best[] {
  if (session.templateId !== 'row') return [];
  const earlier = sessions.filter((s) => s.id !== session.id && s.templateId === 'row' && s.variantId === session.variantId && s.endedAt && s.startedAt < session.startedAt);
  const before = bestsOf(earlier);
  const now = bestsOf([session]);
  const out: Best[] = [];
  if (now.score !== undefined && (before.score === undefined || now.score > before.score)) out.push({ kind: 'score', value: now.score, previous: before.score });
  if (now.distance !== undefined && (before.distance === undefined || now.distance > before.distance)) out.push({ kind: 'distance', value: now.distance, previous: before.distance });
  if (now.split !== undefined && (before.split === undefined || now.split < before.split)) out.push({ kind: 'split', value: now.split, previous: before.split });
  return out;
}

/* ---------- streaks, milestones, badges ---------- */

const WEEK = 7 * 24 * 3600 * 1000;

function rowingWeeks(sessions: SessionRecord[]): Set<number> {
  return new Set(sessions.filter((s) => s.templateId === 'row' && s.endedAt).map((s) => weekStart(s.startedAt)));
}

/** Consecutive weeks (Mon–Sun) with a rowing session, up to now; this week only counts once rowed, and does not break the streak before it ends. */
export function rowingStreak(sessions: SessionRecord[], now: number): number {
  const weeks = rowingWeeks(sessions);
  let w = weekStart(now);
  if (!weeks.has(w)) w = weekStart(w - 1);
  let n = 0;
  while (weeks.has(w)) {
    n++;
    w = weekStart(w - 1);
  }
  return n;
}

/** Longest run of consecutive rowing weeks ever. */
export function longestStreak(sessions: SessionRecord[]): number {
  const weeks = [...rowingWeeks(sessions)].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  let prev: number | undefined;
  for (const w of weeks) {
    run = prev !== undefined && Math.abs(w - prev - WEEK) < 2 * 3600 * 1000 ? run + 1 : 1; // DST-safe
    best = Math.max(best, run);
    prev = w;
  }
  return best;
}

export interface RowingTotals {
  sessions: number;
  km: number;
  minutesOnTarget: number;
  byVariant: Record<string, { sessions: number; bestScore?: number; bestDistance?: number; bestSplitSec?: number }>;
}

export function rowingTotals(sessions: SessionRecord[]): RowingTotals {
  const rows = sessions.filter((s) => s.templateId === 'row' && s.endedAt);
  const byVariant: RowingTotals['byVariant'] = {};
  for (const v of new Set(rows.map((s) => s.variantId))) {
    const own = rows.filter((s) => s.variantId === v);
    const b = bestsOf(own);
    byVariant[v] = { sessions: own.length, bestScore: b.score, bestDistance: b.distance, bestSplitSec: b.split };
  }
  return {
    sessions: rows.length,
    km: Math.round(rows.reduce((a, s) => a + (s.rowing?.distanceM ?? 0), 0) / 100) / 10,
    minutesOnTarget: Math.round(rows.reduce((a, s) => a + (s.rowing?.game?.onSec ?? 0), 0) / 60),
    byVariant,
  };
}

export interface Badge {
  id: string;
  name: string;
  /** How to earn it (shown on locked badges). */
  how: string;
}

/** Badge ids are stable: never rename or remove one. */
export const BADGES: Badge[] = [
  { id: 'first-row', name: 'First strokes', how: 'Finish a rowing session.' },
  { id: 'first-4x4', name: 'Norwegian 4 × 4', how: 'Finish VO2max 30 (4 × 4).' },
  { id: 'first-4x8', name: 'Long intervals', how: 'Finish VO2max 60 (4 × 8).' },
  { id: 'z2-hour', name: 'Zone 2 hour', how: 'Finish Fat loss 60 (Z2).' },
  { id: 'gold-sweep', name: 'Gold sweep', how: 'Gold on every interval of a session.' },
  { id: 'negative-split', name: 'Negative split', how: 'Last work interval faster than the first (rowing console).' },
  { id: 'combo-x4', name: 'In the zone', how: 'Reach the ×4 combo (3 min on target without a break).' },
  { id: 'score-50k', name: 'Big score', how: '50 000 points in one session.' },
  { id: 'streak-4', name: 'Four-week streak', how: 'Row at least once a week for 4 weeks in a row.' },
  { id: 'streak-12', name: 'Twelve-week streak', how: 'Row at least once a week for 12 weeks in a row.' },
  { id: 'km-50', name: '50 km', how: 'Row 50 km in total.' },
  { id: 'km-100', name: '100 km', how: 'Row 100 km in total.' },
  { id: 'km-500', name: '500 km', how: 'Row 500 km in total.' },
];

function negativeSplit(s: SessionRecord): boolean {
  if (!s.rower || !s.rowing?.phaseStartedAt) return false;
  const block = getVariant(getTemplate('row'), s.variantId).blocks[0];
  if (block.kind !== 'interval') return false;
  const work = phaseRowerReport(s, block.phases).filter((_, i) => isWorkPhase(block.phases[i]));
  return splitConsistency(work)?.verdict === 'negative';
}

/** Badge ids unlocked by a history. */
export function unlockedBadges(sessions: SessionRecord[]): Set<string> {
  const rows = sessions.filter((s) => s.templateId === 'row' && s.endedAt);
  const out = new Set<string>();
  if (!rows.length) return out;
  out.add('first-row');
  if (rows.some((s) => s.variantId === 'vo2max-30')) out.add('first-4x4');
  if (rows.some((s) => s.variantId === 'vo2max-60')) out.add('first-4x8');
  if (rows.some((s) => s.variantId === 'fat-loss-60')) out.add('z2-hour');
  if (rows.some((s) => (s.rowing?.game?.medals.length ?? 0) >= 2 && s.rowing!.game!.medals.every((m) => m === 'gold'))) out.add('gold-sweep');
  if (rows.some(negativeSplit)) out.add('negative-split');
  if (rows.some((s) => (s.rowing?.game?.maxMultiplier ?? 0) >= 4)) out.add('combo-x4');
  if (rows.some((s) => (s.rowing?.game?.score ?? 0) >= 50_000)) out.add('score-50k');
  const longest = longestStreak(rows);
  if (longest >= 4) out.add('streak-4');
  if (longest >= 12) out.add('streak-12');
  const km = rowingTotals(rows).km;
  if (km >= 50) out.add('km-50');
  if (km >= 100) out.add('km-100');
  if (km >= 500) out.add('km-500');
  return out;
}

/** Badges a session unlocked: unlocked with it, not before it. */
export function newBadges(sessions: SessionRecord[], session: SessionRecord): Badge[] {
  const before = unlockedBadges(sessions.filter((s) => s.id !== session.id && s.startedAt < session.startedAt));
  const after = unlockedBadges(sessions.filter((s) => s.id === session.id || s.startedAt < session.startedAt));
  return BADGES.filter((b) => after.has(b.id) && !before.has(b.id));
}
