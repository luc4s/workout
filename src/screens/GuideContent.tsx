import { useState } from 'react';
import { ANIMS } from '../anim/clips';
import { SkeletonPlayer } from '../anim/SkeletonPlayer';
import { EXERCISES } from '../data/exercises';
import type { ExerciseId } from '../data/types';

/** Technique guide: animation with mistake demos, cues, steps and sources. */
export function GuideContent({ exerciseId, compact }: { exerciseId: ExerciseId; compact?: boolean }) {
  const guide = EXERCISES[exerciseId];
  const anim = ANIMS[exerciseId];
  const faults = anim.view === 'side' ? anim.faults : [];
  const [faultId, setFaultId] = useState<string>();
  const fault = faults.find((f) => f.id === faultId);

  return (
    <div className="guide grid grid-2" style={{ alignItems: 'start', gap: 24 }}>
      <div className="stack" style={{ position: compact ? undefined : 'sticky', top: 16 }}>
        <SkeletonPlayer exerciseId={exerciseId} faultId={faultId} controls />
        {faults.length > 0 && (
          <div className="stack tight">
            <div className="section-title">Show a common mistake</div>
            <div className="chips">
              <button type="button" className={`chip${!faultId ? ' on' : ''}`} onClick={() => setFaultId(undefined)}>
                Correct form
              </button>
              {faults.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`chip${f.id === faultId ? ' on' : ''}`}
                  style={f.id === faultId ? { borderColor: 'var(--fig-fault)', color: 'var(--fig-fault)', background: 'var(--critical-soft)' } : undefined}
                  onClick={() => setFaultId(f.id)}
                >
                  ✕ {f.title.split(' — ')[0]}
                </button>
              ))}
            </div>
            {fault && <div className="muted">{fault.title}. Highlighted in red.</div>}
          </div>
        )}
        {anim.caption && <div className="faint">{anim.caption}</div>}
      </div>

      <div className="stack">
        <p style={{ margin: 0 }}>{guide.summary}</p>

        <div className="stack tight">
          <div className="section-title">Key cues</div>
          <div className="chips">
            {guide.cues.map((c) => (
              <span key={c} className="badge accent" style={{ fontSize: 15, padding: '6px 12px' }}>
                {c}
              </span>
            ))}
          </div>
        </div>

        <div className="stack tight">
          <div className="section-title">Mistakes to avoid</div>
          <div className="stack tight">
            {guide.mistakes.map((m) => (
              <div key={m.title} className="note warn" style={{ display: 'block' }}>
                <b>{m.title}.</b> {m.fix}
              </div>
            ))}
          </div>
        </div>

        <div className="stack tight">
          <div className="section-title">Setup</div>
          <ol className="steps">
            {guide.setup.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </div>

        <div className="stack tight">
          <div className="section-title">Execution</div>
          <ol className="steps">
            {guide.execution.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          {guide.breathing && (
            <div className="muted">
              <b>Breathing:</b> {guide.breathing}
            </div>
          )}
        </div>

        {!compact && (
          <>
            <div className="grid grid-2">
              <div className="stack tight">
                <div className="section-title">Easier</div>
                <ul className="bullets">
                  {guide.regressions.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
              <div className="stack tight">
                <div className="section-title">Harder</div>
                <ul className="bullets">
                  {guide.progressions.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="stack tight">
              <div className="section-title">Muscles</div>
              <div className="muted">
                <b>Primary:</b> {guide.muscles.primary.join(', ')}
                <br />
                <b>Secondary:</b> {guide.muscles.secondary.join(', ')}
              </div>
            </div>

            <div className="stack tight">
              <div className="section-title">Sources</div>
              <ul className="bullets" style={{ fontSize: 15 }}>
                {guide.sources.map((s) => (
                  <li key={s.url}>
                    <a href={s.url} target="_blank" rel="noreferrer">
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
