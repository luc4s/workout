import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate } from 'react-router-dom';
import { getTemplate, TEMPLATES, WEEK_PLAN } from '../data/program';
import { db, DEFAULT_SETTINGS, type Settings } from '../db/db';
import { IconCheck, IconPlay } from '../components/icons';
import { labelOf, relativeDay, sessionsInWeek, weekStart } from '../logic/schedule';
import type { RunnerState } from '../logic/runner';
import { CoachCard } from './coach/CoachCard';
import { AnalysisCard } from './coach/AnalysisCard';

const DAY = 24 * 3600 * 1000;

export default function Home() {
  const navigate = useNavigate();
  const sessions = useLiveQuery(() => db.sessions.toArray(), []);
  const sets = useLiveQuery(() => db.sets.toArray(), []);
  const runner = useLiveQuery(() => db.kv.get('runner'), [])?.value as RunnerState | undefined;
  const settingsRow = useLiveQuery(() => db.kv.get('settings'), []);
  const settings = useMemo(() => ({ ...DEFAULT_SETTINGS, ...((settingsRow?.value as Partial<Settings> | undefined) ?? {}) }), [settingsRow]);

  if (!sessions || !sets) return null;
  const now = Date.now();
  const ws = weekStart(now);
  const thisWeek = sessionsInWeek(sessions, ws);
  const todayIdx = (new Date(now).getDay() + 6) % 7;
  const done = sessions.filter((s) => s.endedAt);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="faint">{new Date(now).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          <h1>Today</h1>
        </div>
      </div>

      {runner && (
        <div className="card row wrap" style={{ borderColor: 'var(--accent)' }}>
          <div className="stack tight" style={{ flex: 1, minWidth: 240 }}>
            <span className="badge accent">In progress</span>
            <h2>{getTemplate(runner.templateId).name}</h2>
            <div className="muted">
              Started {new Date(runner.startedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} · step {runner.index + 1} of{' '}
              {runner.steps.length}
            </div>
          </div>
          <button className="btn primary huge" onClick={() => navigate('/run')}>
            <IconPlay width={28} height={28} /> Resume
          </button>
        </div>
      )}

      <div className="grid grid-2">
        <CoachCard sessions={sessions} sets={sets} settings={settings} busy={!!runner} />

        <div className="card stack">
          <div className="section-title">This week</div>
          <div className="stack tight">
            {WEEK_PLAN.map((d, i) => {
              const dayStart = ws + i * DAY;
              const daySessions = thisWeek.filter((s) => s.startedAt >= dayStart && s.startedAt < dayStart + DAY);
              const planned = d.templateId ? getTemplate(d.templateId) : undefined;
              const plannedDone = daySessions.some((s) => s.templateId === d.templateId) || (d.templateId && thisWeek.some((s) => s.templateId === d.templateId));
              return (
                <div
                  key={d.label}
                  className="row"
                  style={{
                    padding: '8px 12px',
                    borderRadius: 12,
                    background: i === todayIdx ? 'var(--accent-soft)' : undefined,
                    fontWeight: i === todayIdx ? 700 : 500,
                  }}
                >
                  <span style={{ width: 44 }}>{d.label}</span>
                  <span className={planned ? '' : 'faint'} style={{ flex: 1 }}>
                    {planned ? planned.shortName : 'Rest'}
                    {daySessions
                      .filter((s) => s.templateId !== d.templateId)
                      .map((s) => (
                        <span key={s.id} className="badge" style={{ marginLeft: 8 }}>
                          {labelOf(s.templateId)}
                        </span>
                      ))}
                  </span>
                  {daySessions.length > 0 ? (
                    <span className="badge good">
                      <IconCheck width={14} height={14} /> Done
                    </span>
                  ) : planned && plannedDone ? (
                    <span className="badge good">Done (moved)</span>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="faint" style={{ fontSize: 14 }}>
            Days can shift freely — workout / rest / workout; never the two full sessions back-to-back.
          </div>
        </div>
      </div>

      <AnalysisCard sessions={sessions} sets={sets} settings={settings} />

      <div className="section-title">Start any session</div>
      <div className="grid grid-4">
        {TEMPLATES.map((t) => {
          const last = done.filter((s) => s.templateId === t.id).sort((a, b) => b.startedAt - a.startedAt)[0];
          return (
            <Link key={t.id} to={`/setup/${t.id}`} className="card card-link stack tight" aria-disabled={!!runner}>
              <h3>{t.name}</h3>
              <div className="muted" style={{ fontSize: 15 }}>
                {t.subtitle}
              </div>
              <div className="faint" style={{ fontSize: 14 }}>
                {last ? `Last: ${relativeDay(last.startedAt, now)}` : 'Not done yet'}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
