import Dexie, { type Table } from 'dexie';
import type { ExerciseId, TemplateId } from '../data/types';
import type { CoachStepNote, RunnerState } from '../logic/runner';

/** A Claude answer kept with the session it was written for. */
export interface CoachStored<T> {
  data: T;
  model: string;
  at: number;
  fallback?: boolean;
}

/** Coach data attached to a session (all optional: sessions logged before the coach existed have none). */
export interface SessionCoachData {
  /** Rep targets per slot the session was run with. */
  targets?: Record<string, number[]>;
  brief?: CoachStored<unknown>;
  review?: CoachStored<unknown>;
  /** Rest-screen notes by work-step id. */
  notes?: Record<string, CoachStepNote>;
}

/* ---------- heart rate (Polar H10 or any BLE heart-rate strap) ---------- */

/** Per-session HR summary, computed when the session ends (src/hr/metrics.ts). */
export interface HrSummary {
  avg: number;
  max: number;
  min: number;
  /** Seconds in zones 1–5 (%HRmax 50–60, 60–70, 70–80, 80–90, 90–100). */
  zonesSec: number[];
  /** Banister TRIMP (HR reserve) when resting HR is known, else Edwards zone TRIMP. */
  trimp?: number;
  trimpMethod?: 'banister' | 'edwards';
  /** Keytel HR-based estimate; only an estimate for strength work. */
  kcal?: number;
  /** Mean 60 s heart-rate recovery after sets (bpm). */
  recoveryMean?: number;
  samples: number;
  /** Share of the session with a valid sample (0–1). */
  coverage: number;
  hrMax: number;
  hrRest?: number;
}

/** Pre-session readiness check: 60 s seated, resting HR and HRV (RMSSD from RR intervals). */
export interface Readiness {
  at: number;
  restingHr: number;
  rmssd: number;
  lnRmssd: number;
  score: 'go' | 'caution' | 'rest';
  reason: string;
  baseline?: { n: number; lnRmssd: number; lnRmssdSd: number; restingHr: number; restingHrSd: number };
}

export interface SessionHr {
  /** Timestamp of bpm[0]; one sample per second, -1 where the strap had no reading. */
  startedAt: number;
  bpm: number[];
  /** RR intervals in ms, artifact-filtered, in order (not aligned to bpm). */
  rr?: number[];
  summary?: HrSummary;
  readiness?: Readiness;
  deviceName?: string;
}

export interface SetHr {
  start?: number;
  end?: number;
  max?: number;
  mean?: number;
  /** HR drop 60 s after the set ended (bpm). */
  recovery60?: number;
}

export interface SessionFlags {
  badDay: boolean;
  deload: boolean;
  finisher: boolean;
}

export interface SessionRecord {
  id?: number;
  templateId: TemplateId;
  variantId: string;
  startedAt: number;
  endedAt?: number;
  flags: SessionFlags;
  notes?: string;
  /** Distance / split for rowing sessions. */
  rowing?: { distanceM?: number; avgSplit?: string };
  coach?: SessionCoachData;
  /** Heart-rate recording, when a strap was connected. */
  hr?: SessionHr;
}

export interface SetRecord {
  /** `${sessionId}:${stepId}` */
  id: string;
  sessionId: number;
  templateId: TemplateId;
  /** Prescription slot key, e.g. "A.pullup". */
  slot: string;
  exerciseId: ExerciseId;
  variationId?: string;
  setNumber: number;
  /** For per-side exercises, reps is the lower of left/right. */
  reps: number;
  repsLeft?: number;
  repsRight?: number;
  loadKg?: number;
  assistance?: string;
  rir?: number;
  durationSec?: number;
  completedAt: number;
  badDay?: boolean;
  deload?: boolean;
  hr?: SetHr;
}

export interface Settings {
  bodyweightKg?: number;
  pullupMax: number;
  pullupStage: number;
  /** Selected variation per slot key. */
  variations: Record<string, string>;
  /** Working load per slot key (kg). */
  loads: Record<string, number>;
  lastDeloadAt?: number;
  /** Overrides rest seconds scale: 1 = as written. */
  restScale: number;
  /** Smallest weight jump available (kg); used for steppers and load progression. */
  loadStep: number;
  /* Heart-rate strap profile (all optional). */
  birthYear?: number;
  sex?: 'male' | 'female';
  /** Max HR: measured (highest seen while wearing the strap) or set by hand; else estimated from age. */
  hrMax?: number;
  /** Resting HR: from the readiness checks, or set by hand. */
  hrRest?: number;
  /** 60 s seated readiness check before the warm-up when the strap is on (default on). */
  readinessCheck?: boolean;
  /** Rest timer turns green only once HR has come down (default off). */
  hrGuidedRest?: boolean;
  /** Name of the strap last paired, to reconnect without the picker. */
  strapName?: string;
}

export const DEFAULT_SETTINGS: Settings = {
  pullupMax: 5,
  pullupStage: 0,
  variations: {},
  loads: {},
  restScale: 1,
  loadStep: 2.5,
};

interface KV {
  key: string;
  value: unknown;
}

class WorkoutDB extends Dexie {
  sessions!: Table<SessionRecord, number>;
  sets!: Table<SetRecord, string>;
  kv!: Table<KV, string>;

  constructor(name = 'workout') {
    super(name);
    this.version(1).stores({
      sessions: '++id, templateId, startedAt, endedAt',
      sets: 'id, sessionId, slot, exerciseId, completedAt',
      kv: 'key',
    });
  }
}

export const db = new WorkoutDB();

export async function getSettings(): Promise<Settings> {
  const row = await db.kv.get('settings');
  return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<Settings>) ?? {}) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await db.kv.put({ key: 'settings', value: next });
  return next;
}

export async function getRunner(): Promise<RunnerState | undefined> {
  const row = await db.kv.get('runner');
  return row?.value as RunnerState | undefined;
}

export async function saveRunner(state: RunnerState | undefined) {
  if (state) await db.kv.put({ key: 'runner', value: state });
  else await db.kv.delete('runner');
}

/** kv rows that belong to the coach (API key, caches, usage): never exported in backups, kept on import. */
export function isCoachKey(key: string): boolean {
  return key === 'coach' || key.startsWith('coach:');
}

export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch {
    /* not supported */
  }
}

export async function deleteSession(id: number) {
  await db.transaction('rw', db.sessions, db.sets, async () => {
    await db.sets.where('sessionId').equals(id).delete();
    await db.sessions.delete(id);
  });
}
