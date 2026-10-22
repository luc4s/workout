import { useEffect, useRef, useState } from 'react';
import { AnimPlayer } from '../../anim3d/AnimPlayer';
import { EXERCISES } from '../../data/exercises';
import { TimerRing } from '../../components/TimerRing';
import { IconPlay } from '../../components/icons';
import { formatClock } from '../../hooks/useNow';
import { intervalPosition, stepElapsedMs, type RunnerAction, type RunnerState } from '../../logic/runner';
import type { IntervalStep } from '../../logic/steps';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, DEFAULT_SETTINGS, type SessionRecord, type Settings } from '../../db/db';
import { useStrap } from '../../hr/useHeartRate';
import { hrTargetText, hrVerdict, isWorkPhase, phaseTargets, spanText } from '../../logic/rowing';

const COLOR = { hard: 'var(--hard)', easy: 'var(--rest)', steady: 'var(--accent)' } as const;
const TITLE = { hard: 'Hard — just sustainable', easy: 'Easy — recover', steady: 'Steady — conversational' } as const;
const KIND_TITLE: Record<string, string> = {
  warmup: 'Warm-up — build gradually',
  work: 'Work — hold the pace',
  accel: 'Acceleration — quick, not all-out',
  recovery: 'Recovery — light pressure, breathe',
  steady: 'Endurance — steady and relaxed',
  cooldown: 'Cool-down — let it drop',
};

export function IntervalView(props: {
  state: RunnerState;
  step: IntervalStep;
  dispatch: (a: RunnerAction) => void;
  now: number;
  onFinish: (extra: { notes?: string; rowing?: SessionRecord['rowing'] }) => void;
}) {
  const { state, step, dispatch, now, onFinish } = props;
  const startedKey = `${step.id}:started`;
  const started = !!state.checks[startedKey];
  const pos = intervalPosition(step.phases, started ? stepElapsedMs(state, now) / 1000 : 0);
  const phase = step.phases[pos.phaseIndex];
  const workTotal = step.phases.filter(isWorkPhase).length;
  const workDone = step.phases.slice(0, pos.phaseIndex + 1).filter(isWorkPhase).length;
  const [distance, setDistance] = useState('');
  const [split, setSplit] = useState('');
  const [notes, setNotes] = useState('');
  const lastPhase = useRef(pos.phaseIndex);
  const strapState = useStrap();
  const settings = { ...DEFAULT_SETTINGS, ...((useLiveQuery(() => db.kv.get('settings'), [])?.value as Partial<Settings> | undefined) ?? {}) };
  const targets = phaseTargets(phase, settings);
  const bpm = strapState.status === 'on' ? strapState.bpm : undefined;
  const phaseElapsed = phase.durationSec - pos.phaseRemainingSec;
  const verdict = bpm === undefined ? undefined : hrVerdict(bpm, targets.hrBpm, phaseElapsed, targets.lagSec);
  const lagging = targets.lagSec !== undefined && phaseElapsed < targets.lagSec;

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
          <div className="muted">
            Total {formatClock(step.phases.reduce((a, p) => a + p.durationSec, 0))}
            {workTotal > 0 ? ` · ${workTotal} work intervals` : ''}
            {!settings.pace2kSec && step.phases.some((p) => p.paceOffset2k) ? ' · set your 2k pace in Settings for split targets' : ''}
          </div>
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
            <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="How did the work intervals feel?" />
          </label>
          <button
            className="btn good huge block"
            onClick={() =>
              onFinish({
                notes: notes || undefined,
                rowing: { distanceM: distance ? Number(distance) : undefined, avgSplit: split || undefined, phaseStartedAt: state.stepStartedAt },
              })
            }
          >
            Finish session
          </button>
        </section>
        <PhaseList step={step} current={step.phases.length} />
      </div>
    );
  }

  const next = step.phases[pos.phaseIndex + 1];
  const hrColor = verdict === 'on' ? 'var(--good-ink)' : verdict === 'lag' ? 'var(--text-2)' : 'var(--warn)';
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
        {workTotal > 0 && (
          <div className="muted">
            Work interval {Math.max(workDone, 0)} of {workTotal}
          </div>
        )}
        {bpm !== undefined && (
          <div className="rest-hr num">
            <span style={{ color: hrColor, fontWeight: 800 }}>♥ {bpm}</span>
            <span className="muted"> · target {hrTargetText(targets.hrBpm)} bpm</span>
            {verdict === 'lag' && <span className="faint"> · HR still climbing — go by feel</span>}
            {verdict === 'high' && <span className="faint"> · above the band — ease off</span>}
            {verdict === 'low' && <span className="faint"> · below the band</span>}
          </div>
        )}
        {next && (
          <div className="faint">
            Next: {next.label} · {formatClock(next.durationSec)}
            {next.spm ? ` · ${spanText(next.spm)} spm` : ''}
          </div>
        )}
      </section>
      <section className="stack">
        <div className="card stack tight">
          <div className="section-title">{(phase.kind && KIND_TITLE[phase.kind]) ?? TITLE[phase.intensity]}</div>
          {(targets.spm || targets.hrPct || targets.rpe || targets.pace) && (
            <div className="target-grid">
              <Target label="Cadence" value={targets.spm} unit="spm" />
              <Target label="Heart rate" value={targets.hrPct} unit={`${hrTargetText(targets.hrBpm)} bpm`} />
              <Target label="Effort" value={targets.rpe} unit="RPE / 10" />
              <Target label="Pace" value={targets.paceSplit ?? targets.paceOffset} unit={targets.paceSplit ? `${targets.paceOffset} vs 2k` : 'vs 2k split'} />
            </div>
          )}
          {(targets.hint || lagging) && (
            <div className="coach" style={{ fontSize: 14 }}>
              {targets.hint ?? ''}
              {targets.hint && lagging ? ' ' : ''}
              {lagging ? `HR reaches its target only after ~${formatClock(targets.lagSec!)} — row by feel, HR confirms.` : ''}
            </div>
          )}
          <div className="next-anim">
            <AnimPlayer exerciseId="rowing-stroke" />
          </div>
          <div className="cue-row">
            {EXERCISES['rowing-stroke'].cues.slice(0, 2).map((c) => (
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

function Target({ label, value, unit }: { label: string; value?: string; unit: string }) {
  return (
    <div className="target">
      <span className="k">{label}</span>
      <b className="num">{value ?? '—'}</b>
      <span className="u">{value ? unit : 'free'}</span>
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
          {p.spm !== undefined && <span className="faint num">{spanText(p.spm)} spm</span>}
          {p.hrPct && <span className="faint num">{p.hrPct[0] > 0 ? `${p.hrPct[0]}–${p.hrPct[1]}` : `≤ ${p.hrPct[1]}`} %</span>}
          <span className="num">{formatClock(p.durationSec)}</span>
        </div>
      ))}
    </div>
  );
}
