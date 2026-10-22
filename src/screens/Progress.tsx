import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { PRESCRIPTIONS, PULLUP_ROADMAP, templateOfKey } from '../data/program';
import { db, DEFAULT_SETTINGS, saveSettings, type Settings } from '../db/db';
import { BarChart, LineChart } from '../components/charts';
import { labelOf, weekStart } from '../logic/schedule';
import { groupBySession, variationOf } from '../logic/progression';
import { advanceStage } from '../logic/session';
import { PULLUP_ROADMAP_TEXT } from '../data/rules';

const WEEK = 7 * 24 * 3600 * 1000;

export default function Progress() {
  const data = useLiveQuery(async () => {
    const [sessions, sets, row] = await Promise.all([db.sessions.toArray(), db.sets.toArray(), db.kv.get('settings')]);
    return { sessions: sessions.filter((s) => s.endedAt), sets, settings: { ...DEFAULT_SETTINGS, ...((row?.value as Settings) ?? {}) } };
  }, []);
  const [slot, setSlot] = useState<string>();
  const [showTable, setShowTable] = useState(false);

  if (!data) return null;
  const { sessions, sets, settings } = data;
  const ended = new Set(sessions.map((s) => s.id));
  const slotsWithData = Object.keys(PRESCRIPTIONS).filter((k) => sets.some((s) => s.slot === k && ended.has(s.sessionId)));
  const current = slot && slotsWithData.includes(slot) ? slot : slotsWithData[0];

  // weekly minutes, last 12 weeks
  const thisWeek = weekStart(Date.now());
  const weeks = Array.from({ length: 12 }, (_, i) => thisWeek - (11 - i) * WEEK);
  const weekBars = weeks.map((w) => {
    const list = sessions.filter((s) => s.startedAt >= w && s.startedAt < w + WEEK);
    const minutes = Math.round(list.reduce((a, s) => a + (s.endedAt! - s.startedAt) / 60000, 0));
    return {
      key: String(w),
      label: new Date(w).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
      value: minutes,
      detail: list.length ? list.map((s) => labelOf(s.templateId)).join(', ') : 'No sessions',
    };
  });
  const last4 = sessions.filter((s) => s.startedAt >= thisWeek - 3 * WEEK);

  // Heart-rate strap trends
  const readiness = sessions
    .filter((s) => s.hr?.readiness)
    .map((s) => s.hr!.readiness!)
    .sort((a, b) => a.at - b.at);
  const loadBars = weeks.map((w) => {
    const list = sessions.filter((s) => s.startedAt >= w && s.startedAt < w + WEEK && s.hr?.summary?.trimp !== undefined);
    return { key: `hr${w}`, label: new Date(w).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), value: Math.round(list.reduce((a, s) => a + (s.hr!.summary!.trimp ?? 0), 0)), detail: list.length ? `${list.length} session${list.length > 1 ? 's' : ''}` : 'No strap data' };
  });
  const recoveryPoints = sessions
    .filter((s) => s.hr?.summary?.recoveryMean !== undefined)
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((s) => ({ x: s.startedAt, y: s.hr!.summary!.recoveryMean!, label: labelOf(s.templateId) }));

  const history = current
    ? groupBySession(
        sets.filter((s) => s.slot === current && ended.has(s.sessionId)),
        sessions,
      ).reverse()
    : [];
  const p = current ? PRESCRIPTIONS[current] : undefined;
  const best = history.map((h) => ({ x: h.at, y: Math.max(...h.sets.map((s) => s.reps)), label: variationOf(p!, h.sets[0].variationId)?.name }));
  const total = history.map((h) => ({ x: h.at, y: h.sets.reduce((a, s) => a + (s.repsLeft !== undefined ? (s.repsLeft ?? 0) + (s.repsRight ?? 0) : s.reps), 0) }));
  const load = history.filter((h) => h.sets.some((s) => s.loadKg !== undefined)).map((h) => ({ x: h.at, y: Math.max(...h.sets.map((s) => s.loadKg ?? 0)) }));
  const hasLoad = load.some((l) => l.y > 0);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Progress</h1>
      </div>

      <div className="grid grid-4">
        <Tile label="Sessions, last 4 weeks" value={String(last4.length)} sub={`${(last4.length / 4).toFixed(1)} / week`} />
        <Tile label="Est. pull-up max" value={`${settings.pullupMax}`} sub="bodyweight reps (reps + RIR)" />
        <Tile label="Roadmap stage" value={`${settings.pullupStage + 1} / ${PULLUP_ROADMAP.length}`} sub={PULLUP_ROADMAP[settings.pullupStage].label} />
        <Tile label="All-time sessions" value={String(sessions.length)} sub={`${sets.length} sets logged`} />
      </div>

      <div className="card stack">
        <div className="row between wrap">
          <div className="section-title">Pull-up roadmap</div>
          <div className="faint" style={{ fontSize: 14 }}>
            Tap a stage to set it manually
          </div>
        </div>
        <div className="roadmap">
          {PULLUP_ROADMAP.map((st, i) => (
            <button
              key={st.id}
              className={`roadmap-stage${i === settings.pullupStage ? ' current' : ''}${i < settings.pullupStage ? ' past' : ''}`}
              onClick={() => {
                if (i === settings.pullupStage) return;
                if (i === settings.pullupStage + 1) advanceStage(i);
                else saveSettings({ pullupStage: i });
              }}
            >
              <span className="num">{i + 1}</span>
              {st.label}
            </button>
          ))}
        </div>
        <div className="muted" style={{ fontSize: 15 }}>
          {PULLUP_ROADMAP_TEXT[1]}
        </div>
        {settings.pullupMax >= 12 && <div className="note good">You're around 12 clean bodyweight reps — Session B can switch from assisted to bodyweight pull-ups.</div>}
      </div>

      <div className="card stack">
        <div className="section-title">Training time per week</div>
        <BarChart bars={weekBars} unit=" min" />
      </div>

      {(readiness.length > 0 || loadBars.some((b) => b.value > 0)) && (
        <div className="card stack">
          <div className="section-title">Heart rate</div>
          <div className="grid grid-2">
            {readiness.length > 0 && (
              <div className="stack tight">
                <div className="muted" style={{ fontSize: 14 }}>
                  Resting HR from the readiness checks (lower is better)
                </div>
                <LineChart points={readiness.map((r) => ({ x: r.at, y: r.restingHr, label: r.score }))} unit=" bpm" height={160} zeroBased={false} />
                <div className="muted" style={{ fontSize: 14 }}>
                  HRV (RMSSD, higher is better)
                </div>
                <LineChart points={readiness.map((r) => ({ x: r.at, y: r.rmssd, label: r.score }))} unit=" ms" height={160} zeroBased={false} />
              </div>
            )}
            {loadBars.some((b) => b.value > 0) && (
              <div className="stack tight">
                <div className="muted" style={{ fontSize: 14 }}>
                  Training load per week (TRIMP, strap sessions)
                </div>
                <BarChart bars={loadBars} unit="" />
                {recoveryPoints.length > 1 && (
                  <>
                    <div className="muted" style={{ fontSize: 14 }}>
                      Mean recovery after sets (bpm in 60 s, higher is better)
                    </div>
                    <LineChart points={recoveryPoints} unit=" bpm" height={140} zeroBased={false} />
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="card stack">
        <div className="row between wrap">
          <div className="section-title">Exercise progress</div>
          {current && (
            <button className="btn small" onClick={() => setShowTable((s) => !s)}>
              {showTable ? 'Show charts' : 'Show table'}
            </button>
          )}
        </div>
        {slotsWithData.length === 0 ? (
          <div className="empty">Log a session to see charts here.</div>
        ) : (
          <>
            <div className="chips">
              {slotsWithData.map((k) => (
                <button key={k} className={`chip${k === current ? ' on' : ''}`} onClick={() => setSlot(k)}>
                  {labelOf(templateOfKey(k))} · {PRESCRIPTIONS[k].name}
                </button>
              ))}
            </div>
            {showTable ? (
              <div className="scroll-x">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Variation</th>
                      <th>Reps per set</th>
                      <th>Load</th>
                      <th>Flags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...history].reverse().map((h) => (
                      <tr key={h.sessionId}>
                        <td>{new Date(h.at).toLocaleDateString()}</td>
                        <td>{variationOf(p!, h.sets[0].variationId)?.name ?? '—'}</td>
                        <td>{h.sets.map((s) => (s.repsLeft !== undefined ? `${s.repsLeft}/${s.repsRight}` : s.reps)).join(' · ')}</td>
                        <td>{h.sets[0].loadKg !== undefined ? `+${h.sets[0].loadKg} kg` : '—'}</td>
                        <td>{[h.badDay && 'bad day', h.deload && 'deload'].filter(Boolean).join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="grid grid-2">
                <div className="stack tight">
                  <h3>Best set (reps)</h3>
                  <LineChart points={best} />
                </div>
                <div className="stack tight">
                  <h3>Total reps per session</h3>
                  <LineChart points={total} />
                </div>
                {hasLoad && (
                  <div className="stack tight">
                    <h3>Added load (kg)</h3>
                    <LineChart points={load} unit=" kg" />
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card stack tight">
      <div className="section-title">{label}</div>
      <div className="num" style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.1 }}>
        {value}
      </div>
      {sub && <div className="faint" style={{ fontSize: 14 }}>{sub}</div>}
    </div>
  );
}
