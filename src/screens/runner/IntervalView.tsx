import { useEffect, useRef, useState } from 'react';
import { AnimPlayer } from '../../anim3d/AnimPlayer';
import { EXERCISES } from '../../data/exercises';
import { TimerRing } from '../../components/TimerRing';
import { IconPlay } from '../../components/icons';
import { formatClock } from '../../hooks/useNow';
import { intervalPosition, stepElapsedMs, type RunnerAction, type RunnerState } from '../../logic/runner';
import type { IntervalStep } from '../../logic/steps';

const COLOR = { hard: 'var(--hard)', easy: 'var(--rest)', steady: 'var(--accent)' } as const;

export function IntervalView(props: {
  state: RunnerState;
  step: IntervalStep;
  dispatch: (a: RunnerAction) => void;
  now: number;
  onFinish: (extra: { notes?: string; rowing?: { distanceM?: number; avgSplit?: string } }) => void;
}) {
  const { state, step, dispatch, now, onFinish } = props;
  const startedKey = `${step.id}:started`;
  const started = !!state.checks[startedKey];
  const pos = intervalPosition(step.phases, started ? stepElapsedMs(state, now) / 1000 : 0);
  const phase = step.phases[pos.phaseIndex];
  const hardTotal = step.phases.filter((p) => p.intensity === 'hard').length;
  const hardDone = step.phases.slice(0, pos.phaseIndex + 1).filter((p) => p.intensity === 'hard').length;
  const [distance, setDistance] = useState('');
  const [split, setSplit] = useState('');
  const [notes, setNotes] = useState('');
  const lastPhase = useRef(pos.phaseIndex);

  useEffect(() => {
    if (started && pos.phaseIndex !== lastPhase.current) {
      navigator.vibrate?.(phase.intensity === 'hard' ? [300, 100, 300] : [200]);
      lastPhase.current = pos.phaseIndex;
    }
  }, [pos.phaseIndex, started, phase.intensity]);

  if (!started) {
    return (
      <div className="rest-grid">
        <section className="rest-timer">
          <h1 className="work-name">{step.title}</h1>
          <div className="muted">Total {formatClock(step.phases.reduce((a, p) => a + p.durationSec, 0))}</div>
          <div className="next-anim" style={{ width: '100%' }}>
            <AnimPlayer exerciseId={step.exerciseId} />
          </div>
          <button
            className="btn primary huge block"
            onClick={() => {
              dispatch({ type: 'check', key: startedKey, value: true });
              dispatch({ type: 'restartStep', now: Date.now() });
            }}
          >
            <IconPlay width={28} height={28} /> Start rowing
          </button>
        </section>
        <PhaseList step={step} current={-1} />
      </div>
    );
  }

  if (pos.finished) {
    return (
      <div className="rest-grid">
        <section className="card stack">
          <h1>Done — nice work</h1>
          <div className="muted">Log the monitor numbers (optional).</div>
          <label className="stack tight">
            <span className="section-title">Total distance (m)</span>
            <input className="input num" inputMode="numeric" value={distance} onChange={(e) => setDistance(e.target.value.replace(/[^\d]/g, ''))} />
          </label>
          <label className="stack tight">
            <span className="section-title">Average split (/500 m)</span>
            <input className="input num" placeholder="2:05" value={split} onChange={(e) => setSplit(e.target.value)} />
          </label>
          <label className="stack tight">
            <span className="section-title">Notes</span>
            <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="How did the hard intervals feel?" />
          </label>
          <button
            className="btn good huge block"
            onClick={() => onFinish({ notes: notes || undefined, rowing: { distanceM: distance ? Number(distance) : undefined, avgSplit: split || undefined } })}
          >
            Finish session
          </button>
        </section>
        <PhaseList step={step} current={step.phases.length} />
      </div>
    );
  }

  const next = step.phases[pos.phaseIndex + 1];
  return (
    <div className={`rest-grid interval-${phase.intensity}`}>
      <section className="rest-timer">
        <div className="phase-label" style={{ color: COLOR[phase.intensity] }}>
          {phase.label}
        </div>
        <TimerRing progress={1 - pos.phaseRemainingSec / phase.durationSec} color={COLOR[phase.intensity]} size={380} stroke={24}>
          <div>
            <div className="ring-time num">{formatClock(Math.ceil(pos.phaseRemainingSec))}</div>
            <div className="muted num">{formatClock(Math.ceil(pos.totalRemainingSec))} left in session</div>
          </div>
        </TimerRing>
        {hardTotal > 0 && (
          <div className="muted">
            Hard interval {Math.max(hardDone, 0)} of {hardTotal}
          </div>
        )}
        {next && (
          <div className="faint">
            Next: {next.label} · {formatClock(next.durationSec)}
          </div>
        )}
      </section>
      <section className="stack">
        <div className="card stack tight">
          <div className="section-title">{phase.intensity === 'hard' ? 'Hard — just sustainable' : phase.intensity === 'steady' ? 'Conversational pace' : 'Easy — recover'}</div>
          <div className="next-anim">
            <AnimPlayer exerciseId="rowing-stroke" />
          </div>
          <div className="cue-row">
            {EXERCISES['rowing-stroke'].cues.slice(0, 3).map((c) => (
              <span key={c} className="badge accent">
                {c}
              </span>
            ))}
          </div>
        </div>
        <PhaseList step={step} current={pos.phaseIndex} />
      </section>
    </div>
  );
}

function PhaseList({ step, current }: { step: IntervalStep; current: number }) {
  return (
    <div className="card phase-list">
      {step.phases.map((p, i) => (
        <div key={i} className={`phase-item${i === current ? ' current' : ''}${i < current ? ' past' : ''}`}>
          <span className="dot" style={{ background: COLOR[p.intensity] }} />
          <span style={{ flex: 1 }}>{p.label}</span>
          <span className="num">{formatClock(p.durationSec)}</span>
        </div>
      ))}
    </div>
  );
}
