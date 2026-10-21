import { PRESCRIPTIONS } from '../data/program';
import type { ExerciseId } from '../data/types';
import { isLoadable, variationOf } from './progression';
import type { RunnerState } from './runner';
import type { WorkStep } from './steps';

/** Exercise guide / animation for a step, following the variation chosen this session. */
export function exerciseForStep(state: Pick<RunnerState, 'plans'>, step: { slot: string; exerciseId: ExerciseId }): ExerciseId {
  const p = PRESCRIPTIONS[step.slot];
  const v = variationOf(p, state.plans[step.slot]?.variationId);
  return v?.exerciseId ?? step.exerciseId;
}

/** Planned added weight for a work step, or undefined when the exercise/variation isn't loaded. */
export function loadFor(state: Pick<RunnerState, 'plans'>, step: { slot: string }): number | undefined {
  const plan = state.plans[step.slot] ?? {};
  // Session A pull-up loading follows the roadmap stage, which decided whether a load was planned.
  const loadable = step.slot === 'A.pullup' ? plan.loadKg !== undefined : isLoadable(PRESCRIPTIONS[step.slot], plan.variationId);
  return loadable ? plan.loadKg ?? 0 : undefined;
}

/** True when the variation was changed during the session, so the planned targets no longer apply. */
export function variationChanged(state: Pick<RunnerState, 'plans' | 'suggestions'>, slot: string): boolean {
  const p = PRESCRIPTIONS[slot];
  const planned = state.suggestions[slot]?.plan.variationId;
  const current = state.plans[slot]?.variationId ?? p?.defaultVariation;
  return !!p?.variations && planned !== undefined && current !== planned;
}

/** Rep target for a work step (undefined for rest-pause mini-sets, which have no fixed target). */
export function targetFor(state: Pick<RunnerState, 'plans' | 'suggestions'>, step: WorkStep): number | undefined {
  if (step.restPause) return undefined;
  if (variationChanged(state, step.slot)) return step.reps.min;
  return state.suggestions[step.slot]?.repsTarget[step.setNumber - 1];
}
