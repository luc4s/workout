import { useEffect, useRef, useState } from 'react';
import { askReview } from '../../coach/ask';
import { modelLabel } from '../../coach/client';
import type { Review } from '../../coach/schema';
import { useCoachConfig } from '../../coach/store';
import { Note } from '../../components/controls';
import { db, type CoachStored, type SessionRecord, type SetRecord, type Settings } from '../../db/db';
import type { SessionReview } from '../../logic/coach';
import { ModelFooter, SuggestionList } from './parts';

const VERDICT: Record<SessionReview['slots'][number]['verdict'], string> = { beat: 'Beat', hit: 'On target', partial: 'Partial', missed: 'Missed', first: 'Logged' };

function clock(sec: number): string {
  const m = Math.floor(sec / 60);
  return `${m}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
}

export function CoachReviewCard(props: { session: SessionRecord; sets: SetRecord[]; review: SessionReview; sessions: SessionRecord[]; allSets: SetRecord[]; settings: Settings }) {
  const { session, sets, review, sessions, allSets, settings } = props;
  const cfg = useCoachConfig();
  const stored = session.coach?.review as CoachStored<Review> | undefined;
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState<string>();
  const asked = useRef(false);
  const abort = useRef<AbortController>();
  const canAsk = !!cfg?.apiKey && cfg.review && !!session.endedAt;

  const fetch = async (force: boolean) => {
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setState('error');
      setError('Offline — the review needs a connection.');
      return;
    }
    setState('loading');
    const r = await askReview({ review, session, sets, sessions, allSets, settings, now: force ? Date.now() : session.endedAt ?? Date.now(), signal: ac.signal });
    if (ac.signal.aborted) return;
    if (r.ok) {
      const next: CoachStored<Review> = { data: r.data, model: r.model, at: r.at, fallback: r.fallback };
      await db.sessions.update(session.id!, { coach: { ...session.coach, review: next } });
      setState('idle');
    } else {
      setState('error');
      setError(r.message);
    }
  };

  useEffect(() => {
    if (!canAsk || stored || asked.current) return;
    asked.current = true;
    fetch(false);
    return () => abort.current?.abort();
  }, [canAsk, !!stored]); // eslint-disable-line react-hooks/exhaustive-deps

  const claude = stored?.data;
  const suggestions = [...review.suggestions, ...(claude?.suggestions ?? [])];
  const scored = review.slots.filter((s) => !s.restPause);

  return (
    <div className="card stack">
      <div className="section-title">Coach review</div>
      <div style={{ fontWeight: 700, fontSize: 17 }}>{claude?.headline ?? review.headline}</div>
      {claude && <div className="muted" style={{ fontSize: 14 }}>{review.headline}</div>}
      {review.timeUse && (
        <div className="row wrap muted" style={{ gap: 14, fontSize: 14 }}>
          <span>
            Work <b className="num">{clock(review.timeUse.workSec)}</b>
          </span>
          <span>
            Rest <b className="num">{clock(review.timeUse.restSec)}</b>
          </span>
          <span>
            Warm-up & transitions <b className="num">{clock(review.timeUse.otherSec)}</b>
          </span>
          {review.volumeDelta && (
            <span>
              Volume <b className="num">{review.volumeDelta.reps >= 0 ? '+' : ''}{review.volumeDelta.reps} reps</b> ({review.volumeDelta.pct >= 0 ? '+' : ''}
              {review.volumeDelta.pct}%) vs last {session.templateId}
            </span>
          )}
        </div>
      )}

      {claude?.highlights.map((h) => (
        <Note key={h} kind="good">
          {h}
        </Note>
      ))}
      {claude?.concerns.map((c) => (
        <Note key={c} kind="warn">
          {c}
        </Note>
      ))}

      {scored.length > 0 && (
        <div className="list">
          {scored.map((s) => {
            const note = claude?.perSlot.find((p) => p.slot === s.slot)?.note;
            return (
              <div key={s.slot} className="stack tight">
                <div className="row between wrap">
                  <div>
                    <span style={{ fontWeight: 650 }}>{s.name}</span>
                    {s.variationName && <span className="faint"> · {s.variationName}</span>}
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    <span className="num muted" style={{ fontSize: 14 }}>
                      {s.reps.join(' · ')}
                      {s.target ? ` / ${s.target.join(' · ')}` : ''}
                      {s.loadKg ? ` @ +${s.loadKg} kg` : ''}
                    </span>
                    <span className={`badge verdict-${s.verdict}`}>{VERDICT[s.verdict]}</span>
                  </div>
                </div>
                <div className="muted" style={{ fontSize: 14 }}>
                  {note ?? s.note}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {review.rirHints.map((h) => (
        <Note key={h} kind="info">
          {h}
        </Note>
      ))}
      {review.hrNotes?.map((h) => (
        <Note key={h} kind="plain">
          ♥ {h}
        </Note>
      ))}
      {review.rowerNotes?.map((h) => (
        <Note key={h} kind="plain">
          ⟋ {h}
        </Note>
      ))}

      <SuggestionList
        suggestions={suggestions}
        scope="summary"
        ctx={{ settings, templateId: session.templateId }}
        source={(s) => (review.suggestions.includes(s) ? 'rules' : stored ? modelLabel(stored.model, stored.fallback) : undefined)}
      />

      {stored ? (
        <ModelFooter model={stored.model} fallback={stored.fallback} at={stored.at} busy={state === 'loading'} onRefresh={() => fetch(true)} />
      ) : canAsk ? (
        <div className="coach-src">
          {state === 'loading' ? 'Asking the coach…' : state === 'error' ? `Coach unavailable: ${error}` : ''}
          {state === 'error' && (
            <>
              {' '}
              <button type="button" className="btn small ghost" onClick={() => fetch(true)}>
                Retry
              </button>
            </>
          )}
        </div>
      ) : (
        cfg && !cfg.apiKey && <div className="coach-src">Rule-based review. Add an API key in Settings for Claude's take.</div>
      )}
      {stored && state === 'error' && <div className="coach-src">Refresh failed: {error}</div>}
    </div>
  );
}
