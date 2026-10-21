import type { ExerciseId } from '../../data/types';
import type { ExerciseAnimSpec } from '../spec';
import { assistedPullup, dip, hangingLegRaise } from './bar';
import { abWheelRollout, invertedRow, rowingStroke } from './core';
import { archerSquat, bulgarianSplitSquat, jointCircles, pistolSquat, stepUp } from './legs';
import { pullup } from './pullup';
import { archerPushup, deficitPushup, pikePushup, pushup } from './pushups';

export const ANIM_SPECS: Record<ExerciseId, ExerciseAnimSpec> = {
  pullup,
  'assisted-pullup': assistedPullup,
  dip,
  'hanging-leg-raise': hangingLegRaise,
  pushup,
  'deficit-pushup': deficitPushup,
  'archer-pushup': archerPushup,
  'pike-pushup': pikePushup,
  'bulgarian-split-squat': bulgarianSplitSquat,
  'pistol-squat': pistolSquat,
  'step-up': stepUp,
  'archer-squat': archerSquat,
  'joint-circles': jointCircles,
  'ab-wheel-rollout': abWheelRollout,
  'inverted-row': invertedRow,
  'rowing-stroke': rowingStroke,
};
