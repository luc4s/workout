import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getTemplate, PRESCRIPTIONS } from '../data/program';
import { db, deleteSession, type SetRecord } from '../db/db';
import { Sheet, Stepper } from '../components/controls';
import { formatClock } from '../hooks/useNow';
import { variationOf } from '../logic/progression';
import { groupSlots } from './Summary';

export default function SessionDetail() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const session = useLiveQuery(() => db.sessions.get(id), [id]);
  const sets = useLiveQuery(() => db.sets.where('sessionId').equals(id).toArray(), [id]);
  const [editing, setEditing] = useState<SetRecord>();

  if (session === undefined || !sets) return null;
  if (!session) return <div className="page empty">Session not found.</div>;
  const t = getTemplate(session.templateId);

  return (
    <div className="page">
      <div className="page-head">
        <div className="stack tight">
          <Link to="/history" className="faint" style={{ textDecoration: 'none' }}>
            ‹ History
          </Link>
          <h1>{t.name}</h1>
          <div className="muted">
            {new Date(session.startedAt).toLocaleString(undefined, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} ·{' '}
            {formatClock(((session.endedAt ?? session.startedAt) - session.startedAt) / 1000)}
          </div>
        </div>
        <button
          className="btn danger"
          onClick={async () => {
            if (confirm('Delete this session and all its sets?')) {
              await deleteSession(id);
              navigate('/history');
            }
          }}
        >
          Delete session
        </button>
      </div>

      {session.rowing && (
        <div className="card">
          {session.rowing.distanceM ?? '—'} m · split {session.rowing.avgSplit ?? '—'}
        </div>
      )}
      {session.notes && <div className="card muted">{session.notes}</div>}

      {sets.length > 0 && (
        <div className="card scroll-x">
          <table className="data">
            <thead>
              <tr>
                <th>Exercise</th>
                <th>Set</th>
                <th>Reps</th>
                <th>Load</th>
                <th>RIR</th>
                <th>Time</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {groupSlots(sets).flatMap(([slot, list]) =>
                list.map((s, i) => (
                  <tr key={s.id}>
                    <td>
                      {i === 0 && (
                        <>
                          <div style={{ fontWeight: 650 }}>{PRESCRIPTIONS[slot]?.name ?? slot}</div>
                          <div className="faint" style={{ fontSize: 14 }}>
                            {variationOf(PRESCRIPTIONS[slot], s.variationId)?.name}
                          </div>
                        </>
                      )}
                    </td>
                    <td>{s.setNumber}</td>
                    <td>{s.repsLeft !== undefined ? `${s.repsLeft} / ${s.repsRight}` : s.reps}</td>
                    <td>{s.loadKg !== undefined ? `+${s.loadKg} kg` : '—'}</td>
                    <td>{s.rir ?? '—'}</td>
                    <td>{s.durationSec ? formatClock(s.durationSec) : '—'}</td>
                    <td>
                      <button className="btn small" onClick={() => setEditing(s)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      )}

      <Sheet open={!!editing} onClose={() => setEditing(undefined)}>
        {editing && <EditSet set={editing} onDone={() => setEditing(undefined)} />}
      </Sheet>
    </div>
  );
}

function EditSet({ set, onDone }: { set: SetRecord; onDone: () => void }) {
  const [s, setS] = useState(set);
  const perSide = set.repsLeft !== undefined;
  return (
    <div className="stack">
      <h2>
        {PRESCRIPTIONS[set.slot]?.name} — set {set.setNumber}
      </h2>
      <div className="grid grid-3">
        {perSide ? (
          <>
            <Stepper label="Weaker leg" value={s.repsLeft ?? 0} onChange={(v) => setS({ ...s, repsLeft: v })} />
            <Stepper label="Other leg" value={s.repsRight ?? 0} onChange={(v) => setS({ ...s, repsRight: v })} />
          </>
        ) : (
          <Stepper label="Reps" value={s.reps} onChange={(v) => setS({ ...s, reps: v })} />
        )}
        {set.loadKg !== undefined && <Stepper label="Load" unit="kg" step={0.25} value={s.loadKg ?? 0} onChange={(v) => setS({ ...s, loadKg: v })} />}
        <Stepper label="RIR" value={s.rir ?? 0} max={10} onChange={(v) => setS({ ...s, rir: v })} />
      </div>
      <div className="row">
        <button
          className="btn danger"
          onClick={async () => {
            await db.sets.delete(set.id);
            onDone();
          }}
        >
          Delete set
        </button>
        <div className="spacer" />
        <button className="btn" onClick={onDone}>
          Cancel
        </button>
        <button
          className="btn primary"
          onClick={async () => {
            const reps = perSide ? Math.min(s.repsLeft ?? 0, s.repsRight ?? 0) : s.reps;
            await db.sets.put({ ...s, reps });
            onDone();
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}
