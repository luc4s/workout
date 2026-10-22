import { useEffect, useMemo, useRef, useState } from 'react';
import { askAnalysis } from '../../coach/ask';
import type { Analysis } from '../../coach/schema';
import { getAnalysis, setAnalysis, useCoachConfig, type StoredAnalysis } from '../../coach/store';
import { Note } from '../../components/controls';
import type { SessionRecord, SetRecord, Settings } from '../../db/db';
import { slotName, trainingStats } from '../../logic/coach';
import { ModelFooter, SuggestionList } from './parts';

const TREND = { up: { glyph: '↑', cls: 'good' }, flat: { glyph: '→', cls: '' }, down: { glyph: '↓', cls: 'warn' } } as const;

/** On-demand analysis of the whole training history by Claude; the rule layer's stats are shown regardless. */
export function AnalysisCard(props: { sessions: SessionRecord[]; sets: SetRecord[]; settings: Settings }) {
  const { sessions, sets, settings } = props;
  const cfg = useCoachConfig();
  const now = Date.now();
  const stats = useMemo(() => trainingStats(sessions, sets, settings, now), [sessions, sets, settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const [stored, setStored] = useState<StoredAnalysis<Analysis> | null>();
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState<string>();
  const abort = useRef<AbortController>();

  useEffect(() => {
    let live = true;
    getAnalysis<Analysis>().then((a) => live && setStored(a ?? null));
    return () => {
      live = false;
      abort.current?.abort();
    };
  }, []);

  const ask = async () => {
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setState('error');
      setError('Offline — the analysis needs a connection.');
      return;
    }
    setState('loading');
    const r = await askAnalysis({ stats, sessions, sets, settings, now: Date.now(), signal: ac.signal });
    if (ac.signal.aborted) return;
    if (r.ok) {
      const next: StoredAnalysis<Analysis> = { data: r.data, model: r.model, at: r.at, fallback: r.fallback, sessions: stats.sessions };
      await setAnalysis(next);
      setStored(next);
      setState('idle');
    } else {
      setState('error');
      setError(r.message);
    }
  };

  if (stored === undefined || !cfg) return null;
  const a = stored?.data;
  const newer = stored ? stats.sessions - stored.sessions : 0;
  const weeks = stats.perWeek.slice(-4);
  const summary = stats.sessions
    ? `${stats.sessions} sessions over ${stats.weeks} week${stats.weeks === 1 ? '' : 's'} · last 4 weeks: ${weeks.join(' · ')} per week · ${Math.round(stats.adherence * 100)}% of the plan${stats.stalls.length ? ` · stalled: ${stats.stalls.map((s) => s.name).join(', ')}` : ''}`
    : 'No completed session yet.';

  return (
    <div className="card stack">
      <div className="row between wrap">
        <div className="section-title">Training analysis</div>
        {stored && a && (
          <button type="button" className="btn small" onClick={ask} disabled={state === 'loading' || !cfg.apiKey}>
            {state === 'loading' ? 'Analysing…' : 'Analyse again'}
          </button>
        )}
      </div>
      <div className="muted" style={{ fontSize: 14 }}>
        {summary}
      </div>

      {a ? (
        <>
          <div style={{ fontWeight: 700, fontSize: 17 }}>{a.headline}</div>
          <div style={{ fontSize: 15 }}>{a.summary}</div>
          {a.trends.length > 0 && (
            <div className="list">
              {a.trends.map((t) => (
                <div key={t.slot} className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
                  <span className={`badge ${TREND[t.trend].cls}`} style={{ minWidth: 28, justifyContent: 'center' }}>
                    {TREND[t.trend].glyph}
                  </span>
                  <div>
                    <div style={{ fontWeight: 650 }}>{slotName(t.slot)}</div>
                    <div className="muted" style={{ fontSize: 14 }}>
                      {t.note}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {a.strengths.map((s) => (
            <Note key={s} kind="good">
              {s}
            </Note>
          ))}
          {a.concerns.map((c) => (
            <Note key={c} kind="warn">
              {c}
            </Note>
          ))}
          {a.recommendations.length > 0 && (
            <div className="stack tight">
              <div className="section-title">Recommendations</div>
              <ol className="steps">
                {a.recommendations.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ol>
            </div>
          )}
          <SuggestionList suggestions={a.suggestions} scope="home" ctx={{ settings, templateId: 'A' }} />
          <ModelFooter model={stored!.model} fallback={stored!.fallback} at={stored!.at} />
          {newer > 0 && (
            <div className="coach-src">
              {newer} session{newer > 1 ? 's' : ''} logged since this analysis.
            </div>
          )}
          {state === 'error' && <div className="coach-src">Analysis failed: {error}</div>}
        </>
      ) : (
        <div className="row wrap" style={{ alignItems: 'center' }}>
          <button type="button" className="btn primary" onClick={ask} disabled={state === 'loading' || !cfg.apiKey || stats.sessions === 0}>
            {state === 'loading' ? 'Analysing…' : 'Ask Claude to analyse my training'}
          </button>
          <span className="coach-src">
            {!cfg.apiKey
              ? 'Needs an API key (Settings → Coach).'
              : state === 'error'
                ? `Failed: ${error}`
                : state === 'loading'
                  ? 'Sends your whole history; this takes up to a minute.'
                  : 'Sends your whole history (reps, RIR, loads, notes). On demand only.'}
          </span>
        </div>
      )}
    </div>
  );
}
