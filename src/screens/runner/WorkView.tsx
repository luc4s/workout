import { useEffect, useState } from 'react';
import { AnimPlayer } from '../../anim3d/AnimPlayer';
import { EXERCISES } from '../../data/exercises';
import { PRESCRIPTIONS } from '../../data/program';
import type { ExerciseId } from '../../data/types';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Settings } from '../../db/db';
import { Sheet, Stepper, VariationSelect } from '../../components/controls';
import { IconCheck } from '../../components/icons';
import { formatClock } from '../../hooks/useNow';
import { isLoadable, LOAD_STEP_KG, rangeText, variationOf } from '../../logic/progression';
import { relativeDay } from '../../logic/schedule';
import { stepElapsedMs, type RunnerAction, type RunnerState } from '../../logic/runner';
import { logSet } from '../../logic/session';
import { remainingSetsOf, type WorkStep } from '../../logic/steps';
import { GuideContent } from '../GuideContent';
import { RestPauseSwitch } from './RestPauseSwitch';

export function exerciseForStep(state: RunnerState, step: { slot: string; exerciseId: ExerciseId }): ExerciseId {
  const p = PRESCRIPTIONS[step.slot];
  const v = variationOf(p, state.plans[step.slot]?.variationId);
  return v?.exerciseId ?? step.exerciseId;
}

/** Planned added weight for a work step, or undefined when the exercise/variation isn't loaded. */
export function loadFor(state: RunnerState, step: { slot: string }): number | undefined {
  const plan = state.plans[step.slot] ?? {};
  // Session A pull-up loading follows the roadmap stage, which decided whether a load was planned.
  const loadable = step.slot === 'A.pullup' ? plan.loadKg !== undefined : isLoadable(PRESCRIPTIONS[step.slot], plan.variationId);
  return loadable ? plan.loadKg ?? 0 : undefined;
}

/** True when the variation was changed during the session, so the planned targets no longer apply. */
export function variationChanged(state: RunnerState, slot: string): boolean {
  const p = PRESCRIPTIONS[slot];
  const planned = state.suggestions[slot]?.plan.variationId;
  const current = state.plans[slot]?.variationId ?? p?.defaultVariation;
  return !!p?.variations && planned !== undefined && current !== planned;
}

/** Rep target for a work step (undefined for rest-pause mini-sets, which have no fixed target). */
export function targetFor(state: RunnerState, step: WorkStep): number | undefined {
  if (step.restPause) return undefined;
  if (variationChanged(state, step.slot)) return step.reps.min;
  return state.suggestions[step.slot]?.repsTarget[step.setNumber - 1];
}

interface Form {
  reps: number;
  left: number;
  right: number;
  loadKg: number;
  rir: number;
}

export function WorkView(props: {
  state: RunnerState;
  step: WorkStep;
  dispatch: (a: RunnerAction) => void;
  now: number;
  isLast: boolean;
  onFinish: () => void;
}) {
  const { state, step, dispatch, now, isLast, onFinish } = props;
  const p = PRESCRIPTIONS[step.slot];
  const plan = state.plans[step.slot] ?? {};
  const suggestion = state.suggestions[step.slot];
  const last = state.lastTime[step.slot];
  const idx = (step.restPause?.mini ?? step.setNumber) - 1;
  const target = targetFor(state, step);
  const changedVariation = variationChanged(state, step.slot);
  const loadable = loadFor(state, step) !== undefined;
  const loadStep = (useLiveQuery(() => db.kv.get('settings'), [])?.value as Settings | undefined)?.loadStep || LOAD_STEP_KG;
  const exerciseId = exerciseForStep(state, step);
  const guide = EXERCISES[exerciseId];
  const done = !!state.done[step.id];
  const remaining = remainingSetsOf(state.steps, state.index, step.slot);
  const [guideOpen, setGuideOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const defaultReps = target ?? (step.restPause ? (step.restPause.mini === 1 ? step.reps.min + 7 : 3) : last?.reps[idx] ?? step.reps.min);
  const [form, setForm] = useState<Form>({
    reps: defaultReps,
    left: defaultReps,
    right: defaultReps,
    loadKg: plan.loadKg ?? 0,
    rir: step.rir.min,
  });

  // When revisiting a logged set, show what was saved.
  useEffect(() => {
    if (!done) return;
    db.sets.get(`${state.sessionId}:${step.id}`).then((r) => {
      if (!r) return;
      setForm({
        reps: r.reps,
        left: r.repsLeft ?? r.reps,
        right: r.repsRight ?? r.reps,
        loadKg: r.loadKg ?? 0,
        rir: r.rir ?? step.rir.min,
      });
    });
  }, [done, state.sessionId, step.id, step.rir.min]);

  const elapsed = stepElapsedMs(state, now) / 1000;
  const reps = step.perSide ? Math.min(form.left, form.right) : form.reps;
  const lastReps = last?.reps[idx];

  const submit = async () => {
    setSaving(true);
    await logSet(state, step, {
      reps,
      repsLeft: step.perSide ? form.left : undefined,
      repsRight: step.perSide ? form.right : undefined,
      loadKg: loadable ? form.loadKg : undefined,
      rir: form.rir,
      durationSec: Math.round(elapsed),
    });
    if (loadable && form.loadKg !== plan.loadKg) dispatch({ type: 'plan', slot: step.slot, plan: { loadKg: form.loadKg } });
    if (isLast) onFinish();
    else dispatch({ type: 'complete', stepId: step.id, now: Date.now() });
  };

  const setLabel = step.restPause ? `Mini-set ${step.restPause.mini} of ${step.restPause.of}` : `Set ${step.setNumber} of ${step.totalSets}`;
  const repsHint = lastReps !== undefined ? `last time ${lastReps}` : undefined;

  return (
    <div className="work-grid">
      <section className="work-info">
        <div className="row wrap" style={{ gap: 8 }}>
          <span className="badge">{step.blockTitle}</span>
          <span className="badge accent">{setLabel}</span>
          {done && (
            <span className="badge good">
              <IconCheck width={14} height={14} /> Logged
            </span>
          )}
        </div>
        <h1 className="work-name">{step.name}</h1>
        <div className="target-line">
          <span>
            <b>{rangeText(step.reps)}</b> reps{step.perSide ? ' / leg' : ''}
          </span>
          <span>
            <b>{rangeText(step.rir)}</b> RIR
          </span>
          {loadable && (
            <span>
              <b>+{plan.loadKg ?? 0}</b> kg
            </span>
          )}
        </div>
        {changedVariation && !step.restPause ? (
          <div className="coach">New variation — start at the bottom of the range ({step.reps.min}).</div>
        ) : (
          suggestion && !step.restPause && step.setNumber === 1 && <div className="coach">{suggestion.message}</div>
        )}
        {step.restPause && (
          <div className="coach">
            {step.restPause.mini === 1 ? 'Go to ~0 RIR, then rest 15–20 s.' : 'Rep out again — stop when form breaks.'}
          </div>
        )}
        {step.restPause?.mini === 1 && !done && <RestPauseSwitch state={state} slot={step.slot} dispatch={dispatch} />}
        {p.variations && (
          <VariationSelect
            variations={p.variations}
            value={plan.variationId ?? p.defaultVariation}
            onChange={(id) => dispatch({ type: 'plan', slot: step.slot, plan: { variationId: id } })}
          />
        )}

        <div className="work-anim">
          <AnimPlayer exerciseId={exerciseId} />
        </div>
        <div className="cue-row">
          {[...new Set((step.hint ? [step.hint] : []).concat(guide.cues))].slice(0, 3).map((c) => (
            <span key={c} className="badge accent">
              {c}
            </span>
          ))}
          <button type="button" className="btn small ghost" onClick={() => setGuideOpen(true)}>
            Form guide ›
          </button>
        </div>
      </section>

      <section className="work-log">
        <div className="stopwatch num" aria-label="Set timer">
          {formatClock(elapsed)}
        </div>

        <div className="set-goals">
          <div className="goal target">
            <span className="k">Target</span>
            <b className="num">{target ?? rangeText(step.reps)}</b>
            <span className="u">reps{step.perSide ? ' / leg' : ''}</span>
          </div>
          <div className="goal">
            <span className="k">Last time</span>
            <b className="num">{lastReps ?? '—'}</b>
            <span className="u">
              {last
                ? `${relativeDay(last.at, now)}${last.loadKg ? ` · +${last.loadKg} kg` : ''}${last.flag ? ` · ${last.flag === 'bad-day' ? 'bad day' : 'deload'}` : ''}`
                : 'first time'}
            </span>
          </div>
        </div>

        {last && last.reps.length > 1 && (
          <div className="set-history" aria-label="Reps per set last time">
            {last.reps.map((r, i) => (
              <span key={i} className={i === idx ? 'now' : undefined}>
                {r}
              </span>
            ))}
          </div>
        )}

        {step.perSide ? (
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Stepper label="Weaker leg" value={form.left} onChange={(v) => setForm((f) => ({ ...f, left: v }))} hint="first" hit={target !== undefined && form.left >= target} />
            <Stepper label="Other leg" value={form.right} onChange={(v) => setForm((f) => ({ ...f, right: v }))} hint="match reps" hit={target !== undefined && form.right >= target} />
          </div>
        ) : (
          <Stepper label="Reps" value={form.reps} onChange={(v) => setForm((f) => ({ ...f, reps: v }))} hint={repsHint} hit={target !== undefined && form.reps >= target} />
        )}

        {loadable && (
          <Stepper
            label="Added load"
            value={form.loadKg}
            step={loadStep}
            onChange={(v) => setForm((f) => ({ ...f, loadKg: v }))}
            unit="kg"
            hint={plan.loadKg !== undefined && form.loadKg !== plan.loadKg ? `planned +${plan.loadKg} kg` : undefined}
          />
        )}

        <div className="stack tight">
          <div className="stepper">
            <div className="label">Reps in reserve</div>
          </div>
          <div className="rir-row">
            {[0, 1, 2, 3, 4].map((n) => (
              <button
                key={n}
                type="button"
                className={`chip${form.rir === n ? ' on' : ''}${n >= step.rir.min && n <= step.rir.max ? ' in-target' : ''}`}
                onClick={() => setForm((f) => ({ ...f, rir: n }))}
              >
                {n}
                {n === 4 ? '+' : ''}
              </button>
            ))}
          </div>
        </div>

        <button className="btn good huge block" onClick={submit} disabled={saving}>
          <IconCheck width={30} height={30} /> {done ? 'Update set' : isLast ? 'Done — finish' : 'Done set'}
        </button>

        {remaining > 0 && step.totalSets > 1 && (
          <button
            className="btn small ghost"
            onClick={() => {
              if (confirm(`Skip the remaining ${remaining} set(s) of ${step.name}?`)) dispatch({ type: 'dropRemaining', slot: step.slot });
            }}
          >
            Skip remaining {remaining} set{remaining > 1 ? 's' : ''} of this exercise
          </button>
        )}
        <div className="faint work-note">A rep counts only at full range with controlled tempo — form breaks = set over.</div>
      </section>

      <Sheet open={guideOpen} onClose={() => setGuideOpen(false)}>
        <h2 style={{ marginBottom: 12 }}>{guide.name}</h2>
        <GuideContent exerciseId={exerciseId} compact />
      </Sheet>
    </div>
  );
}
