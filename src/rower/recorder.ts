/**
 * Records rower samples for the running session at 1 Hz into `SessionRecord.rower`, flushing every
 * 15 s and on demand — the rowing-machine twin of `src/hr/recorder.ts`.
 */
import { db, type SessionRower } from '../db/db';
import { fmtPace, rowerSummary } from '../logic/rowing';
import { rower, type RowerSample } from './ble';

const FLUSH_MS = 15_000;

class RowerRecorder {
  sessionId?: number;
  private rec?: SessionRower;
  private unsub?: () => void;
  private timer?: ReturnType<typeof setInterval>;
  private dirty = false;

  async start(sessionId: number): Promise<void> {
    if (this.sessionId === sessionId && this.unsub) return;
    await this.stop();
    const session = await db.sessions.get(sessionId);
    if (!session) return;
    this.sessionId = sessionId;
    this.rec = session.rower ?? { startedAt: Date.now(), spm: [], paceSec: [], watts: [], distanceM: [] };
    if (rower.state.deviceName) this.rec.deviceName = rower.state.deviceName;
    this.unsub = rower.onSample(this.onSample);
    this.timer = setInterval(() => this.flush(), FLUSH_MS);
    if (typeof window !== 'undefined') window.addEventListener('pagehide', this.onHide);
  }

  private onHide = () => {
    void this.flush();
  };

  private onSample = (s: RowerSample) => {
    const r = this.rec;
    if (!r) return;
    const i = Math.floor((s.at - r.startedAt) / 1000);
    if (i < 0) return;
    for (const arr of [r.spm, r.paceSec, r.watts, r.distanceM]) while (arr.length <= i) arr.push(-1);
    if (s.spm !== undefined) r.spm[i] = s.spm;
    if (s.paceSec !== undefined) r.paceSec[i] = s.paceSec;
    if (s.watts !== undefined) r.watts[i] = s.watts;
    if (s.distanceM !== undefined) r.distanceM[i] = s.distanceM;
    if (s.strokes !== undefined) r.strokes = s.strokes;
    if (!r.deviceName && rower.state.deviceName) r.deviceName = rower.state.deviceName;
    this.dirty = true;
  };

  snapshot(): SessionRower | undefined {
    return this.rec;
  }

  async flush(): Promise<void> {
    if (!this.sessionId || !this.rec || !this.dirty) return;
    this.dirty = false;
    const r = this.rec;
    await db.sessions.update(this.sessionId, { rower: { ...r, spm: [...r.spm], paceSec: [...r.paceSec], watts: [...r.watts], distanceM: [...r.distanceM] } });
  }

  async stop(): Promise<void> {
    this.unsub?.();
    this.unsub = undefined;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', this.onHide);
    await this.flush();
    this.sessionId = undefined;
    this.rec = undefined;
  }
}

export const rowerRecorder = new RowerRecorder();

/**
 * At session end: the summary, and the distance / split fields filled from the recording when the
 * user left them empty. Safe to call without any recording.
 */
export async function finalizeRower(sessionId: number): Promise<void> {
  if (rowerRecorder.sessionId === sessionId) await rowerRecorder.stop();
  const session = await db.sessions.get(sessionId);
  const rec = session?.rower;
  if (!session || !rec) return;
  const summary = rowerSummary(rec);
  if (!summary) return;
  const rowing = { ...session.rowing };
  if (!rowing.distanceM && summary.distanceM > 0) rowing.distanceM = summary.distanceM;
  if (!rowing.avgSplit && summary.avgPaceSec) rowing.avgSplit = fmtPace(summary.avgPaceSec);
  await db.sessions.update(sessionId, { rower: { ...rec, summary }, rowing });
}
