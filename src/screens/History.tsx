import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { getTemplate } from '../data/program';
import { db } from '../db/db';
import { formatClock } from '../hooks/useNow';
import { weekStart } from '../logic/schedule';

export default function History() {
  const data = useLiveQuery(async () => {
    const sessions = (await db.sessions.toArray()).filter((s) => s.endedAt).sort((a, b) => b.startedAt - a.startedAt);
    const counts = new Map<number, number>();
    await db.sets.each((s) => counts.set(s.sessionId, (counts.get(s.sessionId) ?? 0) + 1));
    return { sessions, counts };
  }, []);

  if (!data) return null;
  const weeks = new Map<number, typeof data.sessions>();
  for (const s of data.sessions) {
    const w = weekStart(s.startedAt);
    if (!weeks.has(w)) weeks.set(w, []);
    weeks.get(w)!.push(s);
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>History</h1>
        <div className="muted">{data.sessions.length} sessions logged</div>
      </div>
      {data.sessions.length === 0 && <div className="card empty">No sessions yet. Your logged workouts will show up here.</div>}
      {[...weeks.entries()].map(([w, list]) => {
        const minutes = list.reduce((a, s) => a + ((s.endedAt ?? s.startedAt) - s.startedAt) / 60000, 0);
        return (
          <div key={w} className="stack">
            <div className="row between">
              <div className="section-title">
                Week of {new Date(w).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
              </div>
              <div className="faint num">
                {list.length} sessions · {Math.round(minutes)} min
              </div>
            </div>
            <div className="card flat list" style={{ padding: '4px 20px' }}>
              {list.map((s) => {
                const t = getTemplate(s.templateId);
                return (
                  <Link key={s.id} to={`/history/${s.id}`} className="row" style={{ textDecoration: 'none', color: 'inherit', minHeight: 56 }}>
                    <div style={{ width: 110 }} className="muted">
                      {new Date(s.startedAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}
                    </div>
                    <div style={{ flex: 1, fontWeight: 650 }}>
                      {t.name}
                      {s.flags.badDay && <span className="badge warn" style={{ marginLeft: 8 }}>bad day</span>}
                      {s.flags.deload && <span className="badge" style={{ marginLeft: 8 }}>deload</span>}
                    </div>
                    <div className="muted num">
                      {s.rowing?.distanceM ? `${s.rowing.distanceM} m · ` : ''}
                      {data.counts.get(s.id!) ? `${data.counts.get(s.id!)} sets · ` : ''}
                      {formatClock(((s.endedAt ?? s.startedAt) - s.startedAt) / 1000)}
                    </div>
                    <span className="faint">›</span>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
