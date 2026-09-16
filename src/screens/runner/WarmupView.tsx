import { SkeletonPlayer } from '../../anim/SkeletonPlayer';
import { Check } from '../../components/controls';
import { TimerRing } from '../../components/TimerRing';
import { formatClock } from '../../hooks/useNow';
import { restRemainingSec, type RunnerAction, type RunnerState } from '../../logic/runner';
import type { WarmupStep } from '../../logic/steps';

export function WarmupView(props: { state: RunnerState; step: WarmupStep; dispatch: (a: RunnerAction) => void; now: number; isLast: boolean }) {
  const { state, step, dispatch, now } = props;
  const remaining = restRemainingSec(state, now);
  const allChecked = step.checklist.every((_, i) => state.checks[`${step.id}:${i}`]);

  return (
    <div className="rest-grid">
      <section className="rest-timer">
        <div className="section-title">{step.title}</div>
        <TimerRing progress={1 - Math.max(0, remaining) / step.durationSec} color="var(--hard)" size={300}>
          <div>
            <div className="ring-time num">{remaining > 0 ? formatClock(Math.ceil(remaining)) : 'Ready'}</div>
            <div className="muted">~{Math.round(step.durationSec / 60)} min warm-up</div>
          </div>
        </TimerRing>
        <div className="warm-anim">
          <SkeletonPlayer exerciseId="joint-circles" />
        </div>
      </section>
      <section className="card stack">
        <div className="section-title">Checklist</div>
        <div className="stack tight">
          {step.checklist.map((item, i) => {
            const key = `${step.id}:${i}`;
            return (
              <Check key={key} on={!!state.checks[key]} onToggle={() => dispatch({ type: 'check', key, value: !state.checks[key] })}>
                {item}
              </Check>
            );
          })}
        </div>
        <div className="faint">Easy ramp sets only — they should not tire you.</div>
        <div className="spacer" />
        <button className={`btn huge block ${allChecked || remaining <= 0 ? 'primary' : ''}`} onClick={() => dispatch({ type: 'next', now: Date.now() })}>
          Start the workout
        </button>
      </section>
    </div>
  );
}
