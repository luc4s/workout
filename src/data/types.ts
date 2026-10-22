export type ExerciseId =
  | 'joint-circles'
  | 'pullup'
  | 'assisted-pullup'
  | 'dip'
  | 'bulgarian-split-squat'
  | 'inverted-row'
  | 'ab-wheel-rollout'
  | 'pushup'
  | 'archer-pushup'
  | 'deficit-pushup'
  | 'pistol-squat'
  | 'archer-squat'
  | 'step-up'
  | 'pike-pushup'
  | 'hanging-leg-raise'
  | 'rowing-stroke';

export interface ExerciseGuide {
  id: ExerciseId;
  name: string;
  summary: string;
  muscles: { primary: string[]; secondary: string[] };
  equipment: string[];
  setup: string[];
  execution: string[];
  /** Very short cues (≤ 8 words) shown on the rest screen. */
  cues: string[];
  mistakes: { title: string; fix: string }[];
  breathing?: string;
  regressions: string[];
  progressions: string[];
  sources: { title: string; url: string }[];
}

export interface Range {
  min: number;
  max: number;
}

export interface Variation {
  id: string;
  name: string;
  /** Guide to show for this variation (defaults to the prescription's exercise). */
  exerciseId?: ExerciseId;
  /** External load can be added on this variation. */
  loadable?: boolean;
  /** Side option, not part of the easiest → hardest progression chain. */
  alt?: boolean;
}

export interface Prescription {
  /** Stable slot id used to link logged sets across sessions, e.g. "A.pullup". */
  key: string;
  exerciseId: ExerciseId;
  name: string;
  sets: Range;
  reps: Range;
  perSide?: boolean;
  rir: Range;
  notes: string;
  /** External load can be added (kg). */
  loadable?: boolean;
  /** Assistance (band / foot) is tracked instead of load. */
  assisted?: boolean;
  /** Ordered easiest → hardest. */
  variations?: Variation[];
  /** Default variation id when the user hasn't picked one. */
  defaultVariation?: string;
  /** Short hint shown while working (e.g. "Weaker leg first"). */
  hint?: string;
  /** Rest-pause options: the main slot of the same movement earlier in the session. */
  basedOn?: string;
}

export interface WarmupBlock {
  kind: 'warmup';
  title: string;
  durationSec: number;
  checklist: string[];
}

export interface PairBlock {
  kind: 'pair';
  title: string;
  rounds: Range;
  restSec: number;
  optional?: boolean;
  exercises: Prescription[];
}

export interface RestPauseBlock {
  kind: 'rest-pause';
  title: string;
  optional: boolean;
  miniRestSec: number;
  miniSets: number;
  /** Choice of exercise, first is default. */
  exercises: Prescription[];
}

/** A number or an inclusive [min, max] range. */
export type Span = number | [number, number];

export interface IntervalPhase {
  label: string;
  durationSec: number;
  /** Colour / timer family: hard = work or acceleration, steady = Z2 / tempo, easy = recovery, warm-up, cool-down. */
  intensity: 'easy' | 'hard' | 'steady';
  /* Targets from the rowing workouts (all optional: the first variants had none). */
  kind?: 'warmup' | 'work' | 'recovery' | 'steady' | 'cooldown' | 'accel';
  /** Stroke rate, strokes per minute. */
  spm?: Span;
  /** Heart-rate target, % of HRmax. */
  hrPct?: [number, number];
  /** Perceived effort 1–10. */
  rpe?: Span;
  /** Seconds per 500 m added to the 2k pace. */
  paceOffset2k?: [number, number];
  /** HR reaches its target only after this many seconds: go by feel until then. */
  hrLagSec?: number;
  hint?: string;
}

export interface IntervalBlock {
  kind: 'interval';
  title: string;
  exerciseId: ExerciseId;
  phases: IntervalPhase[];
}

export type Block = WarmupBlock | PairBlock | RestPauseBlock | IntervalBlock;

export type TemplateId = 'A' | 'B' | 'micro' | 'row';

export interface SessionVariant {
  id: string;
  name: string;
  description: string;
  blocks: Block[];
  /** Overrides the template's target length (minutes). */
  targetMin?: number;
  /** Counts as a hard rowing day (VO2max / tempo): at most two a week, never the day before Session A. */
  hard?: boolean;
  /** Kept only so stored sessions and a saved runner still resolve; not offered any more. */
  hidden?: boolean;
  references?: string[];
}

export interface SessionTemplate {
  id: TemplateId;
  name: string;
  shortName: string;
  subtitle: string;
  targetMin: number;
  rirLabel: string;
  intro: string;
  /** Weekday default (0 = Sunday). */
  defaultDay: number;
  variants: SessionVariant[];
}
