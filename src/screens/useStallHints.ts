import { useLiveQuery } from 'dexie-react-hooks';
import { PRESCRIPTIONS } from '../data/program';
import { db, DEFAULT_SETTINGS, type Settings } from '../db/db';
import { applyStage, detectStall, groupBySession } from '../logic/progression';

/** Slots whose recent (non bad-day, non deload) sessions show a stall. */
export function useStallHints() {
  return (
    useLiveQuery(async () => {
      const [sets, sessions, row] = await Promise.all([db.sets.toArray(), db.sessions.toArray(), db.kv.get('settings')]);
      const settings = { ...DEFAULT_SETTINGS, ...((row?.value as Settings) ?? {}) };
      const out: { slot: string; name: string; stall: 'deload' | 'add-set' }[] = [];
      for (const [slot, base] of Object.entries(PRESCRIPTIONS)) {
        if (slot.includes('.rp-') || slot === 'M.pullup') continue;
        const p = applyStage(base, settings);
        const history = groupBySession(
          sets.filter((s) => s.slot === slot),
          sessions,
        ).filter((h) => !h.badDay && !h.deload);
        const stall = detectStall(p, history.slice(0, 6));
        if (stall) out.push({ slot, name: p.name, stall });
      }
      return out;
    }, []) ?? []
  );
}
