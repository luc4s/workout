import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { askBrief } from '../../coach/ask';
import { modelLabel } from '../../coach/client';
import type { Brief } from '../../coach/schema';
import { getCachedBrief, localDate, setCachedBrief, useCoachConfig } from '../../coach/store';
import { Note } from '../../components/controls';
import { getTemplate, getVariant } from '../../data/program';
import type { CoachStored, SessionRecord, SetRecord, Settings } from '../../db/db';
import { recommendSession, sessionOverview, type HrContext, type SessionOverview } from '../../logic/coach';
import { weeklyLoad } from '../../hr/metrics';
import { weekStart } from '../../logic/schedule';
import { localDate as localDateOf } from '../../coach/store';
import { prepareSession } from '../../logic/session';
import { ModelFooter, SuggestionList } from './parts';

const READINESS = {
  go: { label: 'Ready to go', cls: 'good' },
  caution: { label: 'Take care', cls: 'warn' },
  rest: { label: 'Rest day', cls: '' },
} as const;

export function CoachCard(props: { sessions: SessionRecord[]; sets: SetRecord[]; settings: Settings; busy: boolean }) {
  const { sessions, sets, settings, busy } = props;
  const navigate = useNavigate();
  const cfg = useCoachConfig();
  const now = Date.now();
  const hrCtx = useMemo((): HrContext => {
    const latest = sessions.filter((s) => s.hr?.readiness).sort((a, b) => b.hr!.readiness!.at - a.hr!.readiness!.at)[0]?.hr?.readiness;
    const ws = weekStart(now);
    const withLoad = sessions.filter((s) => s.endedAt && s.hr?.summary?.trimp !== undefined).map((s) => ({ startedAt: s.startedAt, trimp: s.hr!.summary!.trimp }));
    const load = withLoad.length ? weeklyLoad(withLoad, [ws - 7 * 24 * 3600 * 1000, ws]) : undefined;
    return { readiness: latest, load: load ? { week: load.trimp[1], prevWeek: load.trimp[0], monotony: load.monotony } : undefined };
  }, [sessions]); // eslint-disable-line react-hooks/exhaustive-deps
  const rec = useMemo(() => recommendSession(sessions, sets, settings, now, hrCtx), [sessions, sets, settings, hrCtx]); // eslint-disable-line react-hooks/exhaustive-deps
  const template = getTemplate(rec.templateId);
  const variantId = rec.variantId ?? template.variants[0].id;
  const flags = { badDay: false, deload: !!rec.flags.deload, finisher: rec.flags.finisher ?? true };
  const prepKey = `${rec.templateId}:${variantId}:${flags.deload}:${flags.finisher}`;
  const [overview, setOverview] = useState<{ key: string; data: SessionOverview }>();
  const [brief, setBrief] = useState<CoachStored<Brief>>();
  const [briefState, setBriefState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [briefError, setBriefError] = useState<string>();
  const latest = useRef({ rec, sessions, sets, settings });
  latest.current = { rec, sessions, sets, settings };

  // Prebake the plan for the recommended session (targets, weights, duration).
  useEffect(() => {
    let cancelled = false;
    prepareSession({ templateId: rec.templateId, variantId, flags }).then((p) => {
      if (!cancelled) setOverview({ key: prepKey, data: sessionOverview(p) });
    });
    return () => {
      cancelled = true;
    };
  }, [prepKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const ready = overview?.key === prepKey ? overview.data : undefined;
  const canAsk = !!cfg?.apiKey && cfg.brief;

  // Daily brief: cached per local day and recommended session; refetched on demand.
  const fetchBrief = async (force: boolean, signal: AbortSignal) => {
    const date = localDate(Date.now());
    if (!force) {
      const cached = await getCachedBrief<Brief>();
      if (cached && cached.date === date && cached.templateId === rec.templateId) {
        if (!signal.aborted) setBrief(cached.brief);
        return;
      }
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setBriefState('error');
      setBriefError('Offline — the brief needs a connection.');
      return;
    }
    setBriefState('loading');
    const l = latest.current;
    const r = await askBrief({
      rec: l.rec,
      overview: ready,
      sessions: l.sessions,
      sets: l.sets,
      settings: l.settings,
      now: Date.now(),
      signal,
      hr: hrCtx.readiness || hrCtx.load ? { readiness: hrCtx.readiness ? { at: localDateOf(hrCtx.readiness.at), score: hrCtx.readiness.score, reason: hrCtx.readiness.reason } : undefined, load: hrCtx.load } : undefined,
    });
    if (signal.aborted) return;
    if (r.ok) {
      const stored = { data: r.data, model: r.model, at: r.at, fallback: r.fallback };
      setBrief(stored);
      setBriefState('idle');
      await setCachedBrief({ date, templateId: rec.templateId, brief: stored });
    } else {
      setBriefState('error');
      setBriefError(r.message);
    }
  };
  const briefAbort = useRef<AbortController>();
  useEffect(() => {
    if (!canAsk || !ready) return;
    const ac = new AbortController();
    briefAbort.current?.abort();
    briefAbort.current = ac;
    fetchBrief(false, ac.signal);
    return () => ac.abort();
  }, [canAsk, prepKey, !!ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const readiness = brief?.data.readiness ?? rec.readiness;
  const suggestions = [...rec.suggestions, ...(brief?.data.suggestions ?? [])];
  const variant = getVariant(template, variantId);
  const interval = variant.blocks.find((b) => b.kind === 'interval');

  return (
    <div className="card stack coach-card">
      <div className="row between wrap">
        <div className="section-title">Coach · up next</div>
        <span className={`badge ${READINESS[readiness].cls}`}>{READINESS[readiness].label}</span>
      </div>
      <div className="stack tight">
        <h2 style={{ fontSize: 23 }}>
          {template.name}
          {template.variants.length > 1 ? ` · ${variant.name}` : ''}
        </h2>
        <div className="muted">
          {template.subtitle}
          {ready && template.id !== 'row' ? ` · est. ${ready.estMin} min` : ''}
          {flags.deload ? ' · deload' : ''}
        </div>
      </div>
      <div className="faint">{rec.reason}</div>
      {rec.why.filter((w) => w !== rec.reason).length > 0 && (
        <ul className="bullets muted" style={{ fontSize: 14 }}>
          {rec.why
            .filter((w) => w !== rec.reason)
            .map((w) => (
              <li key={w}>{w}</li>
            ))}
        </ul>
      )}
      {rec.warnings.map((w) => (
        <Note key={w} kind="warn">
          {w}
        </Note>
      ))}

      {brief ? (
        <div className="coach-brief stack tight">
          <div className="headline">{brief.data.headline}</div>
          <div style={{ fontSize: 15 }}>{brief.data.summary}</div>
          {brief.data.focus.length > 0 && (
            <ul className="bullets" style={{ fontSize: 14 }}>
              {brief.data.focus.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}
          <ModelFooter
            model={brief.model}
            fallback={brief.fallback}
            at={brief.at}
            busy={briefState === 'loading'}
            onRefresh={() => {
              const ac = new AbortController();
              briefAbort.current?.abort();
              briefAbort.current = ac;
              fetchBrief(true, ac.signal);
            }}
          />
          {briefState === 'error' && <div className="coach-src">Refresh failed: {briefError}</div>}
        </div>
      ) : canAsk ? (
        <div className="coach-src">
          {briefState === 'loading' ? 'Asking the coach…' : briefState === 'error' ? `Coach unavailable: ${briefError}` : ''}
          {briefState === 'error' && (
            <>
              {' '}
              <button
                type="button"
                className="btn small ghost"
                onClick={() => {
                  const ac = new AbortController();
                  briefAbort.current?.abort();
                  briefAbort.current = ac;
                  fetchBrief(true, ac.signal);
                }}
              >
                Retry
              </button>
            </>
          )}
        </div>
      ) : (
        cfg &&
        !cfg.apiKey && (
          <div className="coach-src">
            Rule-based coach. Add an API key in Settings for a daily brief from Claude.
          </div>
        )
      )}

      {ready && ready.rows.length > 0 && (
        <div className="stack tight">
          <div className="section-title">Targets today</div>
          <div className="list targets">
            {ready.rows.map((r) => (
              <div key={r.slot} className="row between wrap">
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontWeight: 650 }}>{r.name}</div>
                  {(r.variationName || r.prChance) && (
                    <div className="faint" style={{ fontSize: 13 }}>
                      {r.variationName}
                      {r.prChance ? `${r.variationName ? ' · ' : ''}PR at ${r.prChance}` : ''}
                    </div>
                  )}
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <span className="badge num">
                    {r.sets} × {r.restPause ? 'max' : r.target.join(' · ')}
                    {r.perSide ? ' /leg' : ''}
                  </span>
                  <span className="badge">{r.rir} RIR</span>
                  {r.loadKg !== undefined && <span className="badge accent">+{r.loadKg} kg</span>}
                </div>
              </div>
            ))}
          </div>
          {(ready.changes.length > 0 || ready.weights.length > 0) && (
            <div className="muted" style={{ fontSize: 14 }}>
              {ready.changes.length > 0 && <div>Changes: {ready.changes.join(' · ')}</div>}
              {ready.weights.length > 0 && <div>Weights to prepare: {ready.weights.map((w) => `${w.name} +${w.kg} kg`).join(' · ')}</div>}
            </div>
          )}
        </div>
      )}
      {interval && interval.kind === 'interval' && (
        <div className="muted" style={{ fontSize: 14 }}>
          {interval.phases.length} phases · {Math.round(interval.phases.reduce((a, p) => a + p.durationSec, 0) / 60)} min · {variant.description}
        </div>
      )}

      <SuggestionList
        suggestions={suggestions}
        scope="home"
        ctx={{ settings, templateId: rec.templateId }}
        source={(s) => (rec.suggestions.includes(s) ? 'rules' : brief ? modelLabel(brief.model, brief.fallback) : undefined)}
      />

      <button
        className="btn primary huge block"
        onClick={() => navigate(`/setup/${rec.templateId}`, { state: { flags: rec.flags, variantId: rec.variantId } })}
        disabled={busy}
      >
        Set up session
      </button>
    </div>
  );
}
