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
