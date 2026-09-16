import { IconCheck } from '../../components/icons';
import { formatClock } from '../../hooks/useNow';
import type { RunnerState } from '../../logic/runner';
import type { Step } from '../../logic/steps';

function describe(s: Step): { title: string; detail: string } {
  switch (s.kind) {
    case 'warmup':
      return { title: s.title, detail: formatClock(s.durationSec) };
    case 'rest':
      return { title: s.label, detail: formatClock(s.durationSec) };
    case 'interval':
      return { title: s.title, detail: formatClock(s.phases.reduce((a, p) => a + p.durationSec, 0)) };
    case 'work':
      return {
        title: s.name,
        detail: s.restPause ? `mini-set ${s.restPause.mini}/${s.restPause.of}` : `set ${s.setNumber}/${s.totalSets}`,
      };
  }
}

export function StepList({ state, onPick }: { state: RunnerState; onPick: (index: number) => void }) {
  return (
    <div className="stack">
      <h2>Session steps</h2>
      <div className="step-list">
        {state.steps.map((s, i) => {
          if (s.kind === 'rest') return null;
          const d = describe(s);
          return (
            <button key={s.id} className={`step-item${i === state.index ? ' current' : ''}`} onClick={() => onPick(i)}>
              <span className="idx num">{state.done[s.id] ? <IconCheck width={18} height={18} /> : i + 1}</span>
              <span style={{ flex: 1, fontWeight: 600 }}>{d.title}</span>
              <span className="muted">{d.detail}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
