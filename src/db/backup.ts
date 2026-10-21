import { db, isCoachKey, type SessionRecord, type SetRecord } from './db';

export interface BackupFile {
  app: 'workout';
  version: 1;
  exportedAt: number;
  sessions: SessionRecord[];
  sets: SetRecord[];
  kv: { key: string; value: unknown }[];
}

export async function exportBackup(): Promise<BackupFile> {
  const [sessions, sets, kv] = await Promise.all([db.sessions.toArray(), db.sets.toArray(), db.kv.toArray()]);
  return { app: 'workout', version: 1, exportedAt: Date.now(), sessions, sets, kv: kv.filter((r) => r.key !== 'runner' && !isCoachKey(r.key)) };
}

export function validateBackup(data: unknown): BackupFile {
  const d = data as Partial<BackupFile>;
  if (!d || d.app !== 'workout' || d.version !== 1) throw new Error('Not a workout backup file.');
  if (!Array.isArray(d.sessions) || !Array.isArray(d.sets) || !Array.isArray(d.kv)) {
    throw new Error('Backup file is missing data.');
  }
  for (const s of d.sessions) {
    if (typeof s.id !== 'number' || typeof s.startedAt !== 'number' || !s.templateId) throw new Error('Invalid session entry.');
  }
  for (const s of d.sets) {
    if (typeof s.id !== 'string' || typeof s.sessionId !== 'number' || typeof s.reps !== 'number') {
      throw new Error('Invalid set entry.');
    }
  }
  return d as BackupFile;
}

/** Replace all data with the backup contents. The coach rows (API key, usage) are device-local and survive. */
export async function importBackup(data: unknown): Promise<{ sessions: number; sets: number }> {
  const backup = validateBackup(data);
  await db.transaction('rw', db.sessions, db.sets, db.kv, async () => {
    const coachRows = (await db.kv.toArray()).filter((r) => isCoachKey(r.key));
    await Promise.all([db.sessions.clear(), db.sets.clear(), db.kv.clear()]);
    await db.sessions.bulkPut(backup.sessions);
    await db.sets.bulkPut(backup.sets);
    await db.kv.bulkPut(backup.kv.filter((r) => !isCoachKey(r.key)));
    await db.kv.bulkPut(coachRows);
  });
  return { sessions: backup.sessions.length, sets: backup.sets.length };
}

export function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
