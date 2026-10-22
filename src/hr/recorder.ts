/**
 * Records strap samples for the running session at 1 Hz into `SessionRecord.hr`, flushing every
 * 15 s and on demand. One recorder for the app; it keeps going when the user leaves the runner
 * screen and stops when the session is finished or discarded.
 */
import { db, getSettings, saveSettings, type Readiness, type SessionHr, type SetHr, type Settings } from '../db/db';
import { strap, type HrSample } from './ble';
import { filterRr, hrSummary, profileOf, recovery60, statsBetween } from './metrics';

const FLUSH_MS = 15_000;

class HrRecorder {
  sessionId?: number;
  private hr?: SessionHr;
  private unsub?: () => void;
  private timer?: ReturnType<typeof setInterval>;
  private dirty = false;

  /** Start (or resume) recording for a session; loads what was already saved for it. */
  async start(sessionId: number): Promise<void> {
    if (this.sessionId === sessionId && this.unsub) return;
    await this.stop();
    const session = await db.sessions.get(sessionId);
    if (!session) return;
    this.sessionId = sessionId;
    this.hr = session.hr ?? { startedAt: Date.now(), bpm: [] };
    if (strap.state.deviceName) this.hr.deviceName = strap.state.deviceName;
    this.unsub = strap.onSample(this.onSample);
    this.timer = setInterval(() => this.flush(), FLUSH_MS);
    if (typeof window !== 'undefined') window.addEventListener('pagehide', this.onHide);
  }

  private onHide = () => {
    void this.flush();
  };

  private onSample = (s: HrSample) => {
    const hr = this.hr;
    if (!hr || s.bpm <= 0) return;
    const i = Math.floor((s.at - hr.startedAt) / 1000);
    if (i < 0) return;
    while (hr.bpm.length < i) hr.bpm.push(-1);
    hr.bpm[i] = s.bpm;
    if (s.rr.length) (hr.rr ??= []).push(...filterRr([...(hr.rr.slice(-1) ?? []), ...s.rr]).slice(hr.rr.length ? 1 : 0));
    this.dirty = true;
  };

  /** The recording so far (live views read set / rest stats from it). */
  snapshot(): SessionHr | undefined {
    return this.hr;
  }

  /** HR stats for a set that ran between two timestamps. */
  setStats(from: number, to: number): SetHr | undefined {
    if (!this.hr) return undefined;
    const s = statsBetween(this.hr, from, to);
    if (s.mean === undefined) return undefined;
    return { start: s.start, end: s.end, max: s.max, mean: s.mean };
  }

  async setReadiness(r: Readiness): Promise<void> {
    if (!this.hr) return;
    this.hr.readiness = r;
    this.dirty = true;
    await this.flush();
  }

  async flush(): Promise<void> {
    if (!this.sessionId || !this.hr || !this.dirty) return;
    this.dirty = false;
    const hr = this.hr;
    await db.sessions.update(this.sessionId, { hr: { ...hr, bpm: [...hr.bpm], rr: hr.rr ? [...hr.rr] : undefined } });
  }

  async stop(): Promise<void> {
    this.unsub?.();
    this.unsub = undefined;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', this.onHide);
    await this.flush();
    this.sessionId = undefined;
    this.hr = undefined;
  }
}

export const recorder = new HrRecorder();

/**
 * At session end: recovery after every set, the session summary, and a higher max HR if one was
 * seen (5 s mean, to ignore spikes). Safe to call without any recording.
 */
export async function finalizeHr(sessionId: number): Promise<void> {
  if (recorder.sessionId === sessionId) await recorder.stop();
  const session = await db.sessions.get(sessionId);
  const hr = session?.hr;
  if (!session || !hr || hr.bpm.length < 30) return;
  const settings = await getSettings();
  const sets = await db.sets.where('sessionId').equals(sessionId).toArray();
  const recoveries: number[] = [];
  for (const set of sets) {
    const r = recovery60(hr, set.completedAt);
    if (r === undefined) continue;
    recoveries.push(r);
    if (set.hr?.recovery60 !== r) await db.sets.update(set.id, { hr: { ...set.hr, recovery60: r } });
  }
  const profile = profileOf(settings);
  const summary = hrSummary(hr, profile, recoveries);
  await db.sessions.update(sessionId, { hr: { ...hr, summary } });
  // Measured max HR: the highest 5 s mean, when above the current value.
  let best = 0;
  for (let i = 4; i < hr.bpm.length; i++) {
    const w = hr.bpm.slice(i - 4, i + 1);
    if (w.some((b) => b <= 0)) continue;
    best = Math.max(best, w.reduce((a, b) => a + b, 0) / 5);
  }
  const patch: Partial<Settings> = {};
  if (best > profile.hrMax) patch.hrMax = Math.round(best);
  if (Object.keys(patch).length) await saveSettings(patch);
}

/** Resting HR for the profile: the mean of the last 7 readiness checks. */
export async function updateRestingHr(): Promise<number | undefined> {
  const sessions = await db.sessions.toArray();
  const checks = sessions
    .map((s) => s.hr?.readiness)
    .filter((r): r is Readiness => !!r)
    .sort((a, b) => b.at - a.at)
    .slice(0, 7);
  if (!checks.length) return undefined;
  const hrRest = Math.round(checks.reduce((a, r) => a + r.restingHr, 0) / checks.length);
  await saveSettings({ hrRest });
  return hrRest;
}

/** Previous readiness checks (newest first), for the baseline. */
export async function previousReadiness(exceptSessionId?: number, n = 14): Promise<Readiness[]> {
  const sessions = await db.sessions.toArray();
  return sessions
    .filter((s) => s.id !== exceptSessionId && s.hr?.readiness)
    .map((s) => s.hr!.readiness!)
    .sort((a, b) => b.at - a.at)
    .slice(0, n);
}
