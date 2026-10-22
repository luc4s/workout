import { useLiveQuery } from 'dexie-react-hooks';
import { db, DEFAULT_SETTINGS, type Settings } from '../../db/db';
import { hrMaxOf, sampleIndex } from '../../hr/metrics';
import { recorder } from '../../hr/recorder';
import { useStrap } from '../../hr/useHeartRate';
import type { RunnerState } from '../../logic/runner';
import { ZONE_COLORS } from './HrBadge';
import { zoneOf } from '../../hr/metrics';

export const GUIDED_REST_FRACTION = 0.65;

/** Live HR during a rest with the drop since the set ended; `ready` drives the HR-guided rest button. */
export function restHrState(state: RunnerState, bpm: number | undefined, hrMax: number): { endBpm?: number; drop?: number; ready: boolean } {
  const hr = recorder.snapshot();
  let endBpm: number | undefined;
  if (hr) {
    // The rest step started when the set was completed; HR at that moment is the end-of-set HR.
    const i = sampleIndex(hr, state.stepStartedAt);
    const s = hr.bpm.slice(Math.max(0, i - 4), i + 1).filter((x) => x > 0);
    if (s.length) endBpm = Math.round(s.reduce((a, b) => a + b, 0) / s.length);
  }
  const drop = bpm !== undefined && endBpm !== undefined ? endBpm - bpm : undefined;
  return { endBpm, drop, ready: bpm !== undefined && bpm <= hrMax * GUIDED_REST_FRACTION };
}

export function RestHr({ state }: { state: RunnerState }) {
  const st = useStrap();
  const s = { ...DEFAULT_SETTINGS, ...((useLiveQuery(() => db.kv.get('settings'), [])?.value as Partial<Settings> | undefined) ?? {}) };
  if (st.status !== 'on' || st.bpm === undefined) return null;
  const hrMax = hrMaxOf(s);
  const { endBpm, drop } = restHrState(state, st.bpm, hrMax);
  const z = zoneOf(st.bpm, hrMax);
  return (
    <div className="rest-hr num" aria-label="Heart rate">
      <span style={{ color: ZONE_COLORS[z], fontWeight: 800 }}>♥ {st.bpm}</span>
      {endBpm !== undefined && (
        <span className="muted">
          {' '}
          · set ended at {endBpm}
          {drop !== undefined ? ` · ${drop >= 0 ? '−' : '+'}${Math.abs(drop)} bpm` : ''}
        </span>
      )}
    </div>
  );
}
