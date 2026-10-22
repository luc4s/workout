import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { applySuggestion } from '../../coach/apply';
import { db, DEFAULT_SETTINGS, getSettings, type Readiness, type Settings } from '../../db/db';
import { strap } from '../../hr/ble';
import { filterRr, readinessOf, restingHr, rmssd } from '../../hr/metrics';
import { previousReadiness, recorder, updateRestingHr } from '../../hr/recorder';
import { useStrap } from '../../hr/useHeartRate';
import type { RunnerAction, RunnerState } from '../../logic/runner';

const CHECK_SEC = 60;
const BADGE = { go: { label: 'Ready', cls: 'good' }, caution: { label: 'Take it easy', cls: 'warn' }, rest: { label: 'Run down', cls: 'warn' } } as const;

/**
 * 60 s seated readiness check during the warm-up: resting HR and HRV (RMSSD) against the athlete's
 * own baseline. Stored on the session; offers the bad-day switch when the body says so.
 */
export function ReadinessCheck(props: { state: RunnerState; dispatch: (a: RunnerAction) => void }) {
  const { state, dispatch } = props;
  const st = useStrap();
  const settings = { ...DEFAULT_SETTINGS, ...((useLiveQuery(() => db.kv.get('settings'), [])?.value as Partial<Settings> | undefined) ?? {}) };
  const stored = useLiveQuery(() => db.sessions.get(state.sessionId).then((s) => s?.hr?.readiness ?? null), [state.sessionId]);
  const [phase, setPhase] = useState<'idle' | 'running' | 'done'>('idle');
  const [left, setLeft] = useState(CHECK_SEC);
  const [live, setLive] = useState<{ bpm?: number; rmssd?: number }>({});
  const [result, setResult] = useState<Readiness>();
  const [applied, setApplied] = useState(false);
  const buf = useRef<{ bpm: number[]; rr: number[] }>({ bpm: [], rr: [] });

  useEffect(() => {
    if (phase !== 'running') return;
    buf.current = { bpm: [], rr: [] };
    const unsub = strap.onSample((s) => {
      buf.current.bpm.push(s.bpm);
      buf.current.rr.push(...s.rr);
      setLive({ bpm: s.bpm, rmssd: rmssd(filterRr(buf.current.rr)) });
    });
    const start = Date.now();
    const tick = setInterval(async () => {
      const remaining = CHECK_SEC - Math.floor((Date.now() - start) / 1000);
      setLeft(Math.max(0, remaining));
      if (remaining > 0) return;
      clearInterval(tick);
      unsub();
      const rr = filterRr(buf.current.rr);
      const hr = restingHr(buf.current.bpm);
      const v = rmssd(rr);
      if (hr === undefined || v === undefined) {
        setPhase('idle');
        setLive({});
        return;
      }
      const prev = await previousReadiness(state.sessionId);
      const r = readinessOf({ at: Date.now(), restingHr: hr, rmssd: v }, prev);
      await recorder.setReadiness(r);
      await updateRestingHr();
      setResult(r);
      setPhase('done');
    }, 500);
    return () => {
      clearInterval(tick);
      unsub();
    };
  }, [phase, state.sessionId]);

  if (st.status === 'unsupported' || settings.readinessCheck === false || stored === undefined) return null;
  const r = result ?? stored ?? undefined;

  if (r) {
    const b = BADGE[r.score];
    const suggestBadDay = r.score !== 'go' && !state.flags.badDay && !state.flags.deload;
    return (
      <div className="card stack tight readiness">
        <div className="row between">
          <div className="section-title">Readiness</div>
          <span className={`badge ${b.cls}`}>{b.label}</span>
        </div>
        <div className="muted" style={{ fontSize: 14 }}>
          {r.reason}
        </div>
        {suggestBadDay &&
          (applied ? (
            <span className="badge good">Bad-day mode on</span>
          ) : (
            <button
              type="button"
              className="btn small primary"
              onClick={async () => {
                await applySuggestion({ kind: 'bad-day', reason: r.reason }, 'runner', { settings: await getSettings(), templateId: state.templateId, dispatch, state });
                setApplied(true);
              }}
            >
              Switch to bad-day mode
            </button>
          ))}
      </div>
    );
  }

  if (st.status !== 'on') return null;
  return (
    <div className="card stack tight readiness">
      <div className="row between">
        <div className="section-title">Readiness check</div>
        {phase === 'running' && <span className="badge num">{left} s</span>}
      </div>
      {phase === 'running' ? (
        <div className="muted" style={{ fontSize: 14 }}>
          Sit still and breathe normally. HR {live.bpm ?? '–'}
          {live.rmssd !== undefined ? ` · HRV ${live.rmssd} ms` : ''}
        </div>
      ) : (
        <div className="row wrap" style={{ alignItems: 'center' }}>
          <button type="button" className="btn small primary" onClick={() => setPhase('running')}>
            Start 60 s check
          </button>
          <span className="faint" style={{ fontSize: 13 }}>
            Sit down first.
          </span>
        </div>
      )}
    </div>
  );
}
