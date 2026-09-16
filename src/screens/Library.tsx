import { Link } from 'react-router-dom';
import { SkeletonPlayer } from '../anim/SkeletonPlayer';
import { EXERCISES } from '../data/exercises';
import { PRESCRIPTIONS, templateOfKey } from '../data/program';
import type { ExerciseId } from '../data/types';
import { labelOf } from '../logic/schedule';

/** Which sessions use an exercise (directly or as a variation). */
export function usedIn(id: ExerciseId): string[] {
  const out = new Set<string>();
  for (const p of Object.values(PRESCRIPTIONS)) {
    if (p.exerciseId === id || p.variations?.some((v) => v.exerciseId === id)) out.add(labelOf(templateOfKey(p.key)));
  }
  if (id === 'joint-circles') out.add('Warm-ups');
  if (id === 'rowing-stroke') out.add('Rowing');
  return [...out];
}

export default function Library() {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Exercises</h1>
          <div className="muted">Technique, cues and mistakes to avoid — tap for the animated guide.</div>
        </div>
      </div>
      <div className="grid grid-3">
        {Object.values(EXERCISES).map((e) => (
          <Link key={e.id} to={`/exercises/${e.id}`} className="card card-link exercise-card stack tight">
            <SkeletonPlayer exerciseId={e.id} still={0.45} showPhase={false} />
            <h3>{e.name}</h3>
            <div className="muted" style={{ fontSize: 14 }}>
              {e.muscles.primary.slice(0, 3).join(' · ')}
            </div>
            <div className="chips">
              {usedIn(e.id).map((u) => (
                <span key={u} className="badge">
                  {u}
                </span>
              ))}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
