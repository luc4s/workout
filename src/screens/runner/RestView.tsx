import { useEffect, useRef } from 'react';
import { AnimPlayer } from '../../anim3d/AnimPlayer';
import { EXERCISES } from '../../data/exercises';
import { TimerRing } from '../../components/TimerRing';
import { IconSkip } from '../../components/icons';
import { formatClock } from '../../hooks/useNow';
import { rangeText } from '../../logic/progression';
import { restRemainingSec, type RunnerAction, type RunnerState } from '../../logic/runner';
import { nextWorkStep, type RestStep, type WorkStep } from '../../logic/steps';
import { exerciseForStep, loadFor, targetFor } from './WorkView';
import { RestPauseSwitch } from './RestPauseSwitch';
import { CoachNote } from './CoachNote';
import { RestHr, restHrState } from '../hr/RestHr';
import { useStrap } from '../../hr/useHeartRate';
import { hrMaxOf } from '../../hr/metrics';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, DEFAULT_SETTINGS, type Settings } from '../../db/db';

function prevWorkStep(state: RunnerState): WorkStep | undefined {
  for (let i = state.index - 1; i >= 0; i--) {
    const s = state.steps[i];
    if (s.kind === 'work') return s;
  }
  return undefined;
}

export function RestView(props: { state: RunnerState; step: RestStep; dispatch: (a: RunnerAction) => void; now: number; coachPending?: Record<string, true> }) {
  const { state, step, dispatch, now, coachPending } = props;
  const remaining = restRemainingSec(state, now);
  const total = step.durationSec + state.restExtraSec;
  const overtime = remaining <= 0;
  const buzzed = useRef(false);

  useEffect(() => {
    if (overtime && !buzzed.current) {
      buzzed.current = true;
      navigator.vibrate?.([250, 120, 250]);
    }
  }, [overtime]);

  const strapState = useStrap();
  const settings = { ...DEFAULT_SETTINGS, ...((useLiveQuery(() => db.kv.get('settings'), [])?.value as Partial<Settings> | undefined) ?? {}) };
  // HR-guided rest: the button turns green once HR is back down, or when the planned rest is over.
  const guided = !!settings.hrGuidedRest && strapState.status === 'on' && strapState.bpm !== undefined;
  const hrReady = guided && restHrState(state, strapState.bpm, hrMaxOf(settings)).ready;
  const go = overtime || hrReady;
  const next = nextWorkStep(state.steps, state.index);
  const prev = prevWorkStep(state);
  const note = prev ? state.coach?.notes?.[prev.id] : undefined;
  const cue = note?.claude?.cue ?? note?.rule?.cue;

  return (
    <div className={`rest-grid three${overtime ? ' overtime' : ''}`}>
      <section className="rest-timer">
        <div className="section-title">{step.label}</div>
        <TimerRing progress={overtime ? 1 : 1 - remaining / Math.max(1, total)} color={overtime ? 'var(--accent)' : 'var(--rest)'} size={360}>
          <div>
            <div className="ring-time num">{overtime ? 'Go' : formatClock(Math.ceil(remaining))}</div>
            <div className="muted num">{overtime ? `${formatClock(-remaining)} over` : `of ${formatClock(total)}`}</div>
          </div>
        </TimerRing>
        <div className="row" style={{ gap: 12 }}>
          <button className="btn" onClick={() => dispatch({ type: 'adjustRest', deltaSec: -15 })}>
            −15 s
          </button>
          <button className="btn" onClick={() => dispatch({ type: 'adjustRest', deltaSec: 15 })}>
            +15 s
          </button>
        </div>
        <button className={`btn huge block ${go ? 'primary' : ''}`} onClick={() => dispatch({ type: 'next', now: Date.now() })}>
          <IconSkip width={26} height={26} /> {go ? 'Start next set' : 'Skip rest'}
        </button>
        <RestHr state={state} />
        {guided && !go && <div className="faint" style={{ fontSize: 13 }}>HR-guided: green once HR ≤ {Math.round(hrMaxOf(settings) * 0.65)} bpm</div>}
      </section>

      {next && next.kind === 'work' && (
        <section className="card next-card">
          <div className="section-title">Up next</div>
          <h2 className="work-name" style={{ fontSize: 23 }}>
            {next.name}
          </h2>
          <div className="target-line">
            <span>
              {next.restPause ? `Mini-set ${next.restPause.mini}/${next.restPause.of}` : `Set ${next.setNumber}/${next.totalSets}`}
            </span>
            <span>
              <b>{targetFor(state, next) ?? rangeText(next.reps)}</b> reps{next.perSide ? ' / leg' : ''}
            </span>
            <span>
              <b>{rangeText(next.rir)}</b> RIR
            </span>
          </div>
          {cue && prev && prev.slot === next.slot && <div className="coach-cue">Next set: {cue}</div>}
          {next.restPause?.mini === 1 && !state.done[next.id] && <RestPauseSwitch state={state} slot={next.slot} dispatch={dispatch} />}
          {(() => {
            const last = state.lastTime[next.slot];
            if (!last?.reps.length) return null;
            const idx = (next.restPause?.mini ?? next.setNumber) - 1;
            return (
              <div className="set-history" style={{ justifyContent: 'flex-start' }} aria-label="Reps per set last time">
                <span className="faint" style={{ background: 'none' }}>
                  Last time
                </span>
                {last.reps.map((r, i) => (
                  <span key={i} className={i === idx ? 'now' : undefined}>
                    {r}
                  </span>
                ))}
              </div>
            );
          })()}
          {(() => {
            const kg = loadFor(state, next);
            if (kg === undefined || kg === 0) return null;
            const prev = prevWorkStep(state);
            const same = prev && prev.slot !== next.slot ? false : true;
            return (
              <div className="weight-callout">
                <span>{same ? 'Weight' : 'Set weights to'}</span>
                <b className="num">{kg} kg</b>
              </div>
            );
          })()}
          <div className="next-anim">
            <AnimPlayer exerciseId={exerciseForStep(state, next)} />
          </div>
          <div className="cue-row">
            {[...new Set((next.hint ? [next.hint] : []).concat(EXERCISES[exerciseForStep(state, next)].cues))].slice(0, 3).map((c) => (
              <span key={c} className="badge accent">
                {c}
              </span>
            ))}
          </div>
        </section>
      )}
      {next && next.kind === 'interval' && (
        <section className="card next-card">
          <div className="section-title">Up next</div>
          <h2>{next.title}</h2>
        </section>
      )}
      {!next && <section className="card next-card" />}
      <section className={`card coach-col${note ? ` ${note.claude ? 'info' : note.rule?.tone ?? 'info'}` : ''}`}>
        {note && prev ? (
          <CoachNote state={state} step={prev} note={note} dispatch={dispatch} pending={!!coachPending?.[prev.id]} />
        ) : (
          <>
            <div className="section-title">Coach</div>
            <div className="muted">Log a set to get feedback here.</div>
          </>
        )}
      </section>
    </div>
  );
}
