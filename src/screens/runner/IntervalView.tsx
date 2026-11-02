import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { AnimPlayer } from '../../anim3d/AnimPlayer';
import { TimerRing } from '../../components/TimerRing';
import { IconPlay } from '../../components/icons';
import { formatClock } from '../../hooks/useNow';
import { intervalPosition, stepElapsedMs, type RunnerAction, type RunnerState } from '../../logic/runner';
import type { IntervalStep } from '../../logic/steps';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, DEFAULT_SETTINGS, type SessionRecord, type Settings } from '../../db/db';
import { useStrap } from '../../hr/useHeartRate';
import { fmtPace, hrTargetText, hrVerdict, isWorkPhase, paceVerdict, phaseTargets, spanText, spmVerdict } from '../../logic/rowing';
import { useRower } from '../../rower/useRower';
import { rowerRecorder } from '../../rower/recorder';
import { rowerSummary } from '../../logic/rowing';

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
  const rowerState = useRower();
  const live = rowerState.status === 'on' ? rowerState.last : undefined;
  const liveSpm = live?.spm !== undefined ? spmVerdict(live.spm, phase) : undefined;
  const livePace = live?.paceSec !== undefined ? paceVerdict(live.paceSec, phase, settings) : undefined;

  // Auto-start on the first stroke when the console is connected.
  const autoStart = settings.rowerAutoStart !== false;
  const mountedAt = useRef(Date.now());
  const strokesAtMount = useRef<number | undefined>(undefined);
  useEffect(() => {
    // Only samples received on this screen count: the console's last frame may predate it.
    if (started || !autoStart || !live || live.at < mountedAt.current + 500) return;
    if (strokesAtMount.current === undefined) strokesAtMount.current = live.strokes ?? 0;
    const moving = (live.spm ?? 0) > 0 || (live.strokes !== undefined && live.strokes > (strokesAtMount.current ?? 0));
    if (moving) {
      dispatch({ type: 'check', key: startedKey, value: true });
      dispatch({ type: 'restartStep', now: Date.now() });
    }
  }, [started, autoStart, live, dispatch, startedKey]);

  // Done screen: prefill distance / split from the recording once (the live one, else what was saved).
  const prefilled = useRef(false);
  useEffect(() => {
    if (!pos.finished || prefilled.current) return;
    prefilled.current = true;
    let cancelled = false;
    (async () => {
      const rec = rowerRecorder.snapshot() ?? (await db.sessions.get(state.sessionId))?.rower;
      const sum = rec ? rowerSummary(rec) : undefined;
      if (!sum || cancelled) return;
      if (sum.distanceM > 0) setDistance((d) => d || String(sum.distanceM));
      if (sum.avgPaceSec) setSplit((s) => s || fmtPace(sum.avgPaceSec!));
    })();
    return () => {
      cancelled = true;
    };
  }, [pos.finished, state.sessionId]);

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
          {rowerState.status === 'on' && autoStart && <div className="faint">Rower connected — the timer starts on your first stroke.</div>}
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
                rowing: {
                  distanceM: distance ? Number(distance) : undefined,
                  avgSplit: split || undefined,
                  // stepStartedAt moves forward with every pause; the recordings are wall-clock.
                  ...rowingClock(state),
                },
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
  const remaining = Math.ceil(pos.phaseRemainingSec);
  const soon = !!next && remaining <= 10;
  const tiles = metricTiles({ targets, bpm, verdict, lagging, live, liveSpm, livePace });
  const extras = live ? [live.watts !== undefined ? `${live.watts} W` : '', live.distanceM !== undefined ? `${live.distanceM.toLocaleString()} m` : ''].filter(Boolean) : [];
  return (
    <div className={`row-live interval-${phase.intensity}`}>
      <header className="row-head">
        <div className="row-phase" style={{ color: COLOR[phase.intensity] }}>
          <div className="row-phase-name">{phase.label}</div>
          <div className="row-phase-what">{(phase.kind && KIND_TITLE[phase.kind]) ?? TITLE[phase.intensity]}</div>
        </div>
        <div className="row-progress num">
          {workTotal > 0 && (
            <div>
              Work <b>{Math.max(workDone, 0)}</b> of {workTotal}
            </div>
          )}
          <div>
            <b>{formatClock(Math.ceil(pos.totalRemainingSec))}</b> left{extras.length ? ` · ${extras.join(' · ')}` : ''}
          </div>
        </div>
      </header>

      <div className="row-main">
        <div className="row-ring">
          <TimerRing progress={1 - pos.phaseRemainingSec / phase.durationSec} color={COLOR[phase.intensity]} size={420} stroke={28}>
            <div>
              <div className="row-time num">{formatClock(remaining)}</div>
              <div className="row-of num">of {formatClock(phase.durationSec)}</div>
            </div>
          </TimerRing>
        </div>
        <div className={`row-metrics n${tiles.length}`}>
          {tiles.map((t) => (
            <Metric key={t.label} {...t} />
          ))}
        </div>
      </div>

      <footer className="row-foot">
        {targets.hint && <div className="row-hint">{targets.hint}</div>}
        <Timeline step={step} current={pos.phaseIndex} progress={1 - pos.phaseRemainingSec / phase.durationSec} />
        <div className={`row-next${soon ? ' soon' : ''}`}>
          {next ? (
            <>
              Next: <b>{next.label}</b> · {formatClock(next.durationSec)}
              {next.spm !== undefined ? ` · ${spanText(next.spm)} spm` : ''}
              {next.hrPct ? ` · ${next.hrPct[0] > 0 ? `${next.hrPct[0]}–${next.hrPct[1]}` : `≤ ${next.hrPct[1]}`} %` : ''}
            </>
          ) : (
            <>Last block — then log the monitor numbers</>
          )}
        </div>
      </footer>
    </div>
  );
}

/** When the interval timer really started, and the pauses taken since (state.pauses is reset at the start). */
function rowingClock(state: RunnerState): { phaseStartedAt: number; pauses?: { at: number; ms: number }[] } {
  const pauses = state.pauses ?? [];
  const pausedMs = pauses.reduce((a, p) => a + p.ms, 0);
  return { phaseStartedAt: state.stepStartedAt - pausedMs, ...(pauses.length ? { pauses } : {}) };
}

type Tone = 'on' | 'off' | 'neutral';

interface Tile {
  label: string;
  value: string;
  /** The line under the value: the target when the value is live, else what the target means. */
  sub?: string;
  tone: Tone;
}

/**
 * The tiles of the rowing screen. Each shows the live reading in large type with the target under
 * it; without a strap / console the target itself is the large value. A tile with neither is left out.
 */
function metricTiles(a: {
  targets: ReturnType<typeof phaseTargets>;
  bpm?: number;
  verdict?: ReturnType<typeof hrVerdict>;
  lagging: boolean;
  live?: { spm?: number; paceSec?: number };
  liveSpm?: 'on' | 'low' | 'high';
  livePace?: 'on' | 'low' | 'high';
}): Tile[] {
  const { targets: t, bpm, verdict, lagging, live, liveSpm, livePace } = a;
  const tone = (v?: 'on' | 'low' | 'high'): Tone => (v === 'on' ? 'on' : v ? 'off' : 'neutral');
  const tiles: Tile[] = [];
  const band = t.hasHr ? hrTargetText(t.hrBpm) : undefined;

  if (bpm !== undefined) {
    const showBand = band && band !== '—';
    tiles.push({
      label: 'Heart rate · bpm',
      value: String(bpm),
      sub: !showBand ? 'no target here' : verdict === 'lag' ? 'rising · by feel' : `target ${band}`,
      tone: !showBand || verdict === 'lag' ? 'neutral' : verdict === 'on' ? 'on' : 'off',
    });
  } else if (band && band !== '—') {
    tiles.push({ label: 'Heart rate · bpm', value: band, sub: lagging ? 'lags 1:30 · by feel' : t.hrPct ? `${t.hrPct} of max` : undefined, tone: 'neutral' });
  }

  if (live?.spm !== undefined) {
    tiles.push({ label: 'Stroke rate · spm', value: String(Math.round(live.spm)), sub: t.spm ? `target ${t.spm}` : 'no target here', tone: t.spm ? tone(liveSpm) : 'neutral' });
  } else if (t.spm) {
    tiles.push({ label: 'Stroke rate · spm', value: t.spm, sub: 'strokes / min', tone: 'neutral' });
  }

  const paceTarget = t.paceSplit ?? t.paceOffset;
  if (live?.paceSec !== undefined) {
    tiles.push({ label: 'Split · /500 m', value: fmtPace(live.paceSec), sub: paceTarget ? `target ${paceTarget}${t.paceSplit ? '' : ' vs 2k'}` : 'no target here', tone: t.paceSplit ? tone(livePace) : 'neutral' });
  } else if (paceTarget) {
    tiles.push({ label: t.paceSplit ? 'Split · /500 m' : 'Split · vs 2k', value: paceTarget, sub: t.paceSplit ? `${t.paceOffset} vs 2k` : '2k pace: Settings', tone: 'neutral' });
  }

  if (t.rpe) tiles.push({ label: 'Effort · RPE /10', value: t.rpe, sub: 'by feel', tone: 'neutral' });
  return tiles;
}

function Metric({ label, value, sub, tone }: Tile) {
  return (
    <div className={`metric ${tone}`}>
      <div className="metric-k">{label}</div>
      <div className="metric-v num" style={{ '--len': emWidth(value) } as CSSProperties}>
        {value}
      </div>
      {sub && <div className="metric-t num">{sub}</div>}
    </div>
  );
}

/** Approximate width of a value in em (tabular digits ~0.58, punctuation narrower), so CSS can fit it to its tile. */
function emWidth(text: string): number {
  let w = 0;
  for (const ch of text) w += /\d/.test(ch) ? 0.58 : ch === ':' || ch === '.' ? 0.32 : ch === ' ' ? 0.28 : ch === '–' || ch === '-' ? 0.55 : 0.62;
  return Math.max(1.5, Math.round(w * 100) / 100);
}

/** The whole workout as one proportional strip: past blocks faded, the current one filling up. */
function Timeline({ step, current, progress }: { step: IntervalStep; current: number; progress: number }) {
  return (
    <div className="row-timeline" aria-hidden>
      {step.phases.map((p, i) => (
        <span key={i} className={i < current ? 'past' : i === current ? 'current' : undefined} style={{ flexGrow: p.durationSec, background: COLOR[p.intensity] }}>
          {i === current && <i style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }} />}
        </span>
      ))}
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
