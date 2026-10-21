import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { getTemplate } from '../../data/program';
import { getRunner, saveRunner } from '../../db/db';
import { Sheet } from '../../components/controls';
import { IconClose, IconNext, IconPause, IconPlay, IconPrev } from '../../components/icons';
import { formatClock, useNow } from '../../hooks/useNow';
import { useWakeLock } from '../../hooks/useWakeLock';
import { runnerReducer, sessionElapsedMs, type RunnerAction, type RunnerState } from '../../logic/runner';
import { abandonSession, finishSession } from '../../logic/session';
import { WorkView } from './WorkView';
import { RestView } from './RestView';
import { WarmupView } from './WarmupView';
import { IntervalView } from './IntervalView';
import { StepList } from './StepList';
import { useCoachNotes } from './useCoachNotes';
import './runner.css';

export default function Runner() {
  const [loaded, setLoaded] = useState<RunnerState | null | undefined>(undefined);
  useEffect(() => {
    getRunner().then((r) => setLoaded(r ?? null));
  }, []);
  if (loaded === undefined) return null;
  if (loaded === null) return <Navigate to="/" replace />;
  return <RunnerInner initial={loaded} />;
}

function RunnerInner({ initial }: { initial: RunnerState }) {
  const navigate = useNavigate();
  const [state, rawDispatch] = useReducer(runnerReducer, initial);
  const [endOpen, setEndOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const finishing = useRef(false);
  const now = useNow(250);
  const wake = useWakeLock(true);
  const template = getTemplate(state.templateId);

  useEffect(() => {
    if (!finishing.current) saveRunner(state);
  }, [state]);

  const dispatch = useCallback((a: RunnerAction) => rawDispatch(a), []);
  useCoachNotes(state, dispatch);

  const finish = useCallback(
    async (extra?: Parameters<typeof finishSession>[1]) => {
      finishing.current = true;
      await finishSession(state, extra);
      navigate(`/summary/${state.sessionId}`, { replace: true });
    },
    [state, navigate],
  );

  const discard = async () => {
    finishing.current = true;
    await abandonSession(state);
    navigate('/', { replace: true });
  };

  const step = state.steps[state.index];
  const isLast = state.index === state.steps.length - 1;
  const elapsedMin = sessionElapsedMs(state, now) / 60000;
  const over = elapsedMin > template.targetMin;
  const paused = state.pausedAt !== undefined;
  const doneCount = Object.keys(state.done).length;
  const workCount = state.steps.filter((s) => s.kind === 'work').length;

  return (
    <div className={`runner kind-${step.kind}${paused ? ' paused' : ''}`}>
      <header className="runner-bar">
        <button className="btn icon-btn ghost" onClick={() => navigate('/')} aria-label="Leave (session keeps running)">
          <IconClose />
        </button>
        <div className="runner-title">
          <div className="name">{template.name}</div>
          <div className="meta num">
            <span className={over ? 'over' : ''}>
              {formatClock(sessionElapsedMs(state, now) / 1000)} / {template.targetMin}:00
            </span>
            {workCount > 0 && (
              <span>
                {' '}
                · {doneCount}/{workCount} sets
              </span>
            )}
            {wake === 'active' && <span className="faint"> · screen on</span>}
          </div>
        </div>
        <button className="progress-track" onClick={() => setListOpen(true)} aria-label="All steps">
          <span style={{ width: `${((state.index + 1) / state.steps.length) * 100}%` }} />
        </button>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn icon-btn" onClick={() => dispatch({ type: 'prev', now: Date.now() })} disabled={state.index === 0} aria-label="Previous step">
            <IconPrev />
          </button>
          <button
            className="btn icon-btn"
            onClick={() => dispatch({ type: paused ? 'resume' : 'pause', now: Date.now() })}
            aria-label={paused ? 'Resume' : 'Pause'}
          >
            {paused ? <IconPlay /> : <IconPause />}
          </button>
          <button className="btn icon-btn" onClick={() => dispatch({ type: 'next', now: Date.now() })} disabled={isLast} aria-label="Next step">
            <IconNext />
          </button>
          <button className="btn small" onClick={() => setEndOpen(true)}>
            End
          </button>
        </div>
      </header>

      {over && step.kind !== 'interval' && (
        <div className="runner-banner">Past {template.targetMin} min — tighten transitions or drop the finisher, never the primary strength work.</div>
      )}
      {paused && (
        <button className="runner-banner paused-banner" onClick={() => dispatch({ type: 'resume', now: Date.now() })}>
          Paused — tap to resume
        </button>
      )}

      <div className="runner-body" key={step.id}>
        {step.kind === 'work' && <WorkView state={state} step={step} dispatch={dispatch} now={now} isLast={isLast} onFinish={finish} />}
        {step.kind === 'rest' && <RestView state={state} step={step} dispatch={dispatch} now={now} />}
        {step.kind === 'warmup' && <WarmupView state={state} step={step} dispatch={dispatch} now={now} isLast={isLast} />}
        {step.kind === 'interval' && <IntervalView state={state} step={step} dispatch={dispatch} now={now} onFinish={finish} />}
      </div>

      <Sheet open={listOpen} onClose={() => setListOpen(false)}>
        <StepList
          state={state}
          onPick={(i) => {
            dispatch({ type: 'goto', index: i, now: Date.now() });
            setListOpen(false);
          }}
        />
      </Sheet>

      <Sheet open={endOpen} onClose={() => setEndOpen(false)}>
        <div className="stack">
          <h2>End session?</h2>
          <p className="muted" style={{ margin: 0 }}>
            {doneCount} of {workCount} sets logged. Finishing saves what you logged; remaining steps are skipped.
          </p>
          <button className="btn primary huge block" onClick={() => finish()}>
            Finish & save
          </button>
          <div className="row wrap">
            <button className="btn" onClick={() => setEndOpen(false)}>
              Keep going
            </button>
            <div className="spacer" />
            <button
              className="btn danger"
              onClick={() => {
                if (confirm('Delete this session and everything logged in it?')) discard();
              }}
            >
              Discard session
            </button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
