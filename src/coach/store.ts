/**
 * Device-local coach settings: the API key, feature toggles and usage. Stored in kv rows
 * `coach` / `coach:*`, which backups never export and imports never overwrite (see db.ts isCoachKey).
 */
import { useLiveQuery } from 'dexie-react-hooks';
import type { TemplateId } from '../data/types';
import { db, type CoachStored } from '../db/db';

export interface CoachUsageMonth {
  calls: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  costUsd: number;
}

export interface CoachConfig {
  apiKey?: string;
  /** Daily pre-session brief on the Today screen. */
  brief: boolean;
  /** A note on every rest. */
  inSession: boolean;
  /** Post-session review. */
  review: boolean;
  /** Usage by month (YYYY-MM). */
  usage: Record<string, CoachUsageMonth>;
  lastTest?: { at: number; ok: boolean; model?: string; message?: string };
}

export const DEFAULT_COACH: CoachConfig = { brief: true, inSession: true, review: true, usage: {} };

export async function getCoachConfig(): Promise<CoachConfig> {
  const row = await db.kv.get('coach');
  return { ...DEFAULT_COACH, ...((row?.value as Partial<CoachConfig>) ?? {}) };
}

/** Read-modify-write inside one transaction, so a usage record and a settings change cannot overwrite each other. */
export function saveCoachConfig(patch: Partial<CoachConfig>): Promise<CoachConfig> {
  return db.transaction('rw', db.kv, async () => {
    const next = { ...(await getCoachConfig()), ...patch };
    await db.kv.put({ key: 'coach', value: next });
    return next;
  });
}

/** The coach config, or undefined while it is still loading (null from the query means "no row yet"). */
export function useCoachConfig(): CoachConfig | undefined {
  const row = useLiveQuery(async () => (await db.kv.get('coach')) ?? null, []);
  if (row === undefined) return undefined;
  return { ...DEFAULT_COACH, ...((row?.value as Partial<CoachConfig>) ?? {}) };
}

export function monthKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function recordUsage(usage: Omit<CoachUsageMonth, 'calls'>, now = Date.now()): Promise<void> {
  return db.transaction('rw', db.kv, async () => {
    const cfg = await getCoachConfig();
    const key = monthKey(now);
    const m = cfg.usage[key] ?? { calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0 };
    cfg.usage[key] = {
      calls: m.calls + 1,
      input: m.input + usage.input,
      output: m.output + usage.output,
      cacheRead: m.cacheRead + usage.cacheRead,
      cacheWrite: m.cacheWrite + usage.cacheWrite,
      costUsd: m.costUsd + usage.costUsd,
    };
    await db.kv.put({ key: 'coach', value: cfg });
  });
}

/* ---------- caches ---------- */

export interface CachedBrief<T = unknown> {
  /** Local date, YYYY-MM-DD. */
  date: string;
  templateId: TemplateId;
  brief: CoachStored<T>;
}

export function localDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function getCachedBrief<T>(): Promise<CachedBrief<T> | undefined> {
  return (await db.kv.get('coach:brief'))?.value as CachedBrief<T> | undefined;
}

export async function setCachedBrief<T>(b: CachedBrief<T> | undefined): Promise<void> {
  if (b) await db.kv.put({ key: 'coach:brief', value: b });
  else await db.kv.delete('coach:brief');
}

/** Presets accepted from the coach for the next session setup; consumed when a session starts. */
export interface CoachNext {
  templateId?: TemplateId;
  variantId?: string;
  flags?: { badDay?: boolean; deload?: boolean; finisher?: boolean };
  /** Slots to keep at today's targets instead of progressing. */
  holds?: string[];
  at: number;
}

export async function getCoachNext(): Promise<CoachNext | undefined> {
  return (await db.kv.get('coach:next'))?.value as CoachNext | undefined;
}

export async function mergeCoachNext(patch: Partial<CoachNext>): Promise<CoachNext> {
  const cur = (await getCoachNext()) ?? { at: Date.now() };
  const next: CoachNext = {
    ...cur,
    ...patch,
    flags: { ...cur.flags, ...patch.flags },
    holds: [...new Set([...(cur.holds ?? []), ...(patch.holds ?? [])])],
    at: Date.now(),
  };
  await db.kv.put({ key: 'coach:next', value: next });
  return next;
}
