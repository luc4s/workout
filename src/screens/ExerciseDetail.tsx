import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useParams } from 'react-router-dom';
import { EXERCISES } from '../data/exercises';
import { PRESCRIPTIONS } from '../data/program';
import type { ExerciseId } from '../data/types';
import { db } from '../db/db';
import { groupBySession, variationOf } from '../logic/progression';
import { GuideContent } from './GuideContent';
import { usedIn } from './Library';

export default function ExerciseDetail() {
  const id = useParams().id as ExerciseId;
  const guide = EXERCISES[id];
  const recent = useLiveQuery(async () => {
    const [sets, sessions] = await Promise.all([db.sets.toArray(), db.sessions.toArray()]);
    const mine = sets.filter((s) => {
      const p = PRESCRIPTIONS[s.slot];
      return (variationOf(p, s.variationId)?.exerciseId ?? s.exerciseId) === id;
    });
    return groupBySession(mine, sessions).slice(0, 6);
  }, [id]);

  if (!guide) return <div className="page empty">Unknown exercise.</div>;

  return (
    <div className="page">
      <div className="page-head">
        <div className="stack tight">
          <Link to="/exercises" className="faint" style={{ textDecoration: 'none' }}>
            ‹ Exercises
          </Link>
          <h1>{guide.name}</h1>
          <div className="chips">
            {usedIn(id).map((u) => (
              <span key={u} className="badge">
                {u}
              </span>
            ))}
            {guide.equipment.map((e) => (
              <span key={e} className="badge accent">
                {e}
              </span>
            ))}
          </div>
        </div>
      </div>

      <GuideContent exerciseId={id} />

      {recent && recent.length > 0 && (
        <div className="card stack">
          <div className="section-title">Your recent sessions</div>
          <div className="list">
            {recent.map((h) => (
              <div key={h.sessionId} className="row between wrap">
                <span className="muted">{new Date(h.at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                <span>{variationOf(PRESCRIPTIONS[h.sets[0].slot], h.sets[0].variationId)?.name ?? PRESCRIPTIONS[h.sets[0].slot]?.name}</span>
                <span className="num">
                  {h.sets.map((s) => s.reps).join(' · ')}
                  {h.sets[0].loadKg ? ` @ +${h.sets[0].loadKg} kg` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
