import type { TemplateId } from '../data/types';
import type { SessionFlags } from '../db/db';
import { dropRemainingSets, type Step } from './steps';
import type { Suggestion } from './progression';

export interface LastTime {
  at: number;
  reps: number[];
  loadKg?: number;
  variationId?: string;
}

export interface SlotPlan {
  variationId?: string;
  loadKg?: number;
  assistance?: string;
}

export interface RunnerState {
  sessionId: number;
  templateId: TemplateId;
  variantId: string;
  flags: SessionFlags;
  steps: Step[];
  index: number;
  startedAt: number;
  stepStartedAt: number;
  pausedAt?: number;
  pausedTotalMs: number;
  /** Seconds added/removed on the current rest step. */
  restExtraSec: number;
  /** Step ids that have a logged result. */
  done: Record<string, true>;
  /** Variation / load chosen for each slot during this session. */
  plans: Record<string, SlotPlan>;
  /** Ticked warm-up checklist items, keyed `${stepId}:${index}`. */
  checks: Record<string, boolean>;
  suggestions: Record<string, Suggestion>;
  lastTime: Record<string, LastTime>;
}

export type RunnerAction =
  | { type: 'next'; now: number }
  | { type: 'prev'; now: number }
  | { type: 'goto'; index: number; now: number }
  | { type: 'pause'; now: number }
  | { type: 'resume'; now: number }
  | { type: 'adjustRest'; deltaSec: number }
  | { type: 'complete'; stepId: string; now: number }
  | { type: 'dropRemaining'; slot: string }
  | { type: 'plan'; slot: string; plan: SlotPlan }
  | { type: 'check'; key: string; value: boolean }
  | { type: 'restartStep'; now: number };

export function createRunner(init: {
  sessionId: number;
  templateId: TemplateId;
  variantId: string;
  flags: SessionFlags;
  steps: Step[];
  plans: Record<string, SlotPlan>;
  suggestions?: Record<string, Suggestion>;
  lastTime?: Record<string, LastTime>;
  now: number;
}): RunnerState {
  return {
    suggestions: {},
    lastTime: {},
    ...init,
    index: 0,
    startedAt: init.now,
    stepStartedAt: init.now,
    pausedTotalMs: 0,
    restExtraSec: 0,
    done: {},
    checks: {},
  };
}

function moveTo(state: RunnerState, index: number, now: number): RunnerState {
  const clamped = Math.max(0, Math.min(state.steps.length - 1, index));
  if (clamped === state.index) return state;
  return {
    ...state,
    index: clamped,
    stepStartedAt: now,
    restExtraSec: 0,
    ...(state.pausedAt !== undefined ? { pausedAt: now } : {}),
  };
}

export function runnerReducer(state: RunnerState, action: RunnerAction): RunnerState {
  switch (action.type) {
    case 'next':
      return moveTo(state, state.index + 1, action.now);
    case 'prev':
      return moveTo(state, state.index - 1, action.now);
    case 'goto':
      return moveTo(state, action.index, action.now);
    case 'pause':
      return state.pausedAt !== undefined ? state : { ...state, pausedAt: action.now };
    case 'resume': {
      if (state.pausedAt === undefined) return state;
      const pausedMs = action.now - state.pausedAt;
      return {
        ...state,
        pausedAt: undefined,
        stepStartedAt: state.stepStartedAt + pausedMs,
        pausedTotalMs: state.pausedTotalMs + pausedMs,
      };
    }
    case 'adjustRest':
      return { ...state, restExtraSec: state.restExtraSec + action.deltaSec };
    case 'complete': {
      const done = { ...state.done, [action.stepId]: true as const };
      const isCurrent = state.steps[state.index]?.id === action.stepId;
      const next = { ...state, done };
      return isCurrent && state.index < state.steps.length - 1 ? moveTo(next, state.index + 1, action.now) : next;
    }
    case 'dropRemaining':
      return { ...state, steps: dropRemainingSets(state.steps, state.index, action.slot) };
    case 'plan':
      return { ...state, plans: { ...state.plans, [action.slot]: { ...state.plans[action.slot], ...action.plan } } };
    case 'check':
      return { ...state, checks: { ...state.checks, [action.key]: action.value } };
    case 'restartStep':
      return { ...state, stepStartedAt: action.now, pausedAt: undefined, restExtraSec: 0 };
  }
}

/** Milliseconds elapsed on the current step, excluding pauses. */
export function stepElapsedMs(state: RunnerState, now: number): number {
  return Math.max(0, (state.pausedAt ?? now) - state.stepStartedAt);
}

/** Milliseconds elapsed in the whole session, excluding pauses. */
export function sessionElapsedMs(state: RunnerState, now: number): number {
  const currentPause = state.pausedAt !== undefined ? now - state.pausedAt : 0;
  return Math.max(0, now - state.startedAt - state.pausedTotalMs - currentPause);
}

/** Seconds remaining on the current rest (negative when overtime). */
export function restRemainingSec(state: RunnerState, now: number): number {
  const step = state.steps[state.index];
  if (!step || (step.kind !== 'rest' && step.kind !== 'warmup')) return 0;
  const extra = step.kind === 'rest' ? state.restExtraSec : 0;
  return step.durationSec + extra - stepElapsedMs(state, now) / 1000;
}

export interface IntervalPosition {
  phaseIndex: number;
  phaseRemainingSec: number;
  totalRemainingSec: number;
  finished: boolean;
}

export function intervalPosition(phases: { durationSec: number }[], elapsedSec: number): IntervalPosition {
  const total = phases.reduce((a, p) => a + p.durationSec, 0);
  if (elapsedSec >= total) {
    return { phaseIndex: phases.length - 1, phaseRemainingSec: 0, totalRemainingSec: 0, finished: true };
  }
  let acc = 0;
  for (let i = 0; i < phases.length; i++) {
    acc += phases[i].durationSec;
    if (elapsedSec < acc) {
      return { phaseIndex: i, phaseRemainingSec: acc - elapsedSec, totalRemainingSec: total - elapsedSec, finished: false };
    }
  }
  return { phaseIndex: phases.length - 1, phaseRemainingSec: 0, totalRemainingSec: 0, finished: true };
}
