import { useEffect, useRef } from 'react';
import { SkeletonPlayer } from '../../anim/SkeletonPlayer';
import { EXERCISES } from '../../data/exercises';
import { TimerRing } from '../../components/TimerRing';
import { IconSkip } from '../../components/icons';
import { formatClock } from '../../hooks/useNow';
import { rangeText } from '../../logic/progression';
import { restRemainingSec, type RunnerAction, type RunnerState } from '../../logic/runner';
import { nextWorkStep, type RestStep, type WorkStep } from '../../logic/steps';
import { exerciseForStep, loadFor } from './WorkView';

function prevWorkStep(state: RunnerState): WorkStep | undefined {
  for (let i = state.index - 1; i >= 0; i--) {
    const s = state.steps[i];
    if (s.kind === 'work') return s;
  }
  return undefined;
}

export function RestView(props: { state: RunnerState; step: RestStep; dispatch: (a: RunnerAction) => void; now: number }) {
  const { state, step, dispatch, now } = props;
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

  const next = nextWorkStep(state.steps, state.index);

  return (
    <div className={`rest-grid${overtime ? ' overtime' : ''}`}>
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
        <button className={`btn huge block ${overtime ? 'primary' : ''}`} onClick={() => dispatch({ type: 'next', now: Date.now() })}>
          <IconSkip width={26} height={26} /> {overtime ? 'Start next set' : 'Skip rest'}
        </button>
      </section>

      {next && next.kind === 'work' && (
        <section className="card next-card">
          <div className="section-title">Up next</div>
          <h2 className="work-name" style={{ fontSize: 32 }}>
            {next.name}
          </h2>
          <div className="target-line">
            <span>
              {next.restPause ? `Mini-set ${next.restPause.mini}/${next.restPause.of}` : `Set ${next.setNumber}/${next.totalSets}`}
            </span>
            <span>
              <b>{state.suggestions[next.slot]?.repsTarget[next.setNumber - 1] ?? rangeText(next.reps)}</b> reps{next.perSide ? ' / leg' : ''}
            </span>
            <span>
              <b>{rangeText(next.rir)}</b> RIR
            </span>
          </div>
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
            <SkeletonPlayer exerciseId={exerciseForStep(state, next)} />
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
    </div>
  );
}
