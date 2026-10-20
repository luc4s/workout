import type { Prescription, SessionTemplate, TemplateId, Variation } from './types';

const PUSHUP_VARIATIONS: Variation[] = [
  { id: 'incline', name: 'Incline push-up', exerciseId: 'pushup' },
  { id: 'pushup', name: 'Push-up', exerciseId: 'pushup' },
  { id: 'deficit', name: 'Deficit push-up', exerciseId: 'deficit-pushup' },
  { id: 'deficit-feet-up', name: 'Deficit push-up, feet up', exerciseId: 'deficit-pushup' },
  { id: 'archer', name: 'Archer push-up', exerciseId: 'archer-pushup' },
  { id: 'archer-wide', name: 'Wide archer push-up', exerciseId: 'archer-pushup' },
  { id: 'archer-feet-up', name: 'Archer push-up, feet up', exerciseId: 'archer-pushup' },
];

const ROW_VARIATIONS: Variation[] = [
  { id: 'incline', name: 'Row, high bar (easier angle)' },
  { id: 'flat', name: 'Row, body horizontal' },
  { id: 'feet-elevated', name: 'Feet-elevated row', loadable: true },
];

const RIR_STRENGTH = { min: 1, max: 2 };
const RIR_HYPER = { min: 0, max: 1 };

const pullupEasy: Prescription = {
  key: 'M.pullup',
  exerciseId: 'pullup',
  name: 'Pull-up (bodyweight, easy)',
  sets: { min: 4, max: 5 },
  reps: { min: 2, max: 2 },
  rir: { min: 2, max: 3 },
  notes: 'Genuinely easy, never grinding — frequent crisp practice is the point.',
  hint: 'Crisp and easy — never grind',
};

export const TEMPLATES: SessionTemplate[] = [
  {
    id: 'A',
    name: 'Session A — Strength',
    shortName: 'Strength',
    subtitle: '45–50 min · 1–2 RIR',
    targetMin: 50,
    rirLabel: '1–2 RIR',
    intro: 'Pairs: alternate the two exercises, rest 90 s after each set. Prepare your weights before starting.',
    defaultDay: 1,
    variants: [
      {
        id: 'standard',
        name: 'Standard',
        description: 'Full strength session.',
        blocks: [
          {
            kind: 'warmup',
            title: 'Warm-up',
            durationSec: 6 * 60,
            checklist: ['Joint circles', '5 easy pull-ups', '6–8 easy dips', '3 harder pull-ups', '3 harder dips'],
          },
          {
            kind: 'pair',
            title: 'Pair 1',
            rounds: { min: 3, max: 3 },
            restSec: 90,
            exercises: [
              {
                key: 'A.pullup',
                exerciseId: 'pullup',
                name: 'Pull-up',
                sets: { min: 4, max: 4 },
                reps: { min: 3, max: 3 },
                rir: RIR_STRENGTH,
                notes: 'Add 1 rep to one set weekly → 4×5 → shift 3×6–8 → own 3×8 → add 2.5 kg, drop to 5s.',
                loadable: true,
              },
              {
                key: 'A.dip',
                exerciseId: 'dip',
                name: 'Weighted dip',
                sets: { min: 3, max: 3 },
                reps: { min: 5, max: 8 },
                rir: RIR_STRENGTH,
                notes: 'Upper arm ~parallel, slight lean. 8-8-8 → +2.5 kg. No bars: ring / elevated archer push-ups.',
                loadable: true,
                hint: 'Upper arm ~parallel, slight lean',
                variations: [
                  { id: 'archer-elevated', name: 'Elevated archer push-up', exerciseId: 'archer-pushup', alt: true },
                  { id: 'ring', name: 'Ring dip', loadable: true, alt: true },
                  { id: 'bar', name: 'Parallel-bar dip', loadable: true },
                ],
                defaultVariation: 'bar',
              },
            ],
          },
          {
            kind: 'pair',
            title: 'Pair 2',
            rounds: { min: 3, max: 3 },
            restSec: 90,
            exercises: [
              {
                key: 'A.bss',
                exerciseId: 'bulgarian-split-squat',
                name: 'Weighted Bulgarian split squat',
                sets: { min: 3, max: 3 },
                reps: { min: 6, max: 8 },
                perSide: true,
                rir: RIR_STRENGTH,
                notes: 'Weaker leg first, match reps. Both legs 8s on all sets → +2.5 kg.',
                loadable: true,
                hint: 'Weaker leg first, match reps',
              },
              {
                key: 'A.row',
                exerciseId: 'inverted-row',
                name: 'Feet-elevated / weighted row',
                sets: { min: 3, max: 3 },
                reps: { min: 8, max: 10 },
                rir: { min: 1, max: 1 },
                notes: 'Body rigid, full scapular squeeze. Progress: feet higher, add load, flatter angle.',
                hint: 'Body rigid, full squeeze',
                variations: ROW_VARIATIONS,
                defaultVariation: 'feet-elevated',
              },
            ],
          },
          {
            kind: 'pair',
            title: 'Finisher',
            rounds: { min: 2, max: 3 },
            restSec: 60,
            optional: true,
            exercises: [
              {
                key: 'A.rollout',
                exerciseId: 'ab-wheel-rollout',
                name: 'Ab-wheel rollout (from knees)',
                sets: { min: 2, max: 3 },
                reps: { min: 8, max: 12 },
                rir: { min: 0, max: 1 },
                notes: 'Pelvis tucked, ribs down — no low-back sag. Progress range out slowly; wall as depth stop.',
                hint: 'Pelvis tucked, ribs down',
                variations: [
                  { id: 'wall-short', name: 'Rollout to wall (short range)' },
                  { id: 'wall-long', name: 'Rollout to wall (longer range)' },
                  { id: 'full-knees', name: 'Full rollout from knees' },
                ],
                defaultVariation: 'wall-short',
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'micro',
    name: 'Micro session',
    shortName: 'Micro',
    subtitle: '~15 min · grease the groove',
    targetMin: 15,
    rirLabel: '2–3 RIR pull-ups',
    intro: 'One easy warm-up set of each, then alternate with 60–90 s rest. Protect it for 8–12 weeks while building pull-ups.',
    defaultDay: 3,
    variants: [
      {
        id: 'standard',
        name: 'Standard',
        description: 'Pull-up practice + push-ups.',
        blocks: [
          {
            kind: 'warmup',
            title: 'Warm-up',
            durationSec: 2 * 60,
            checklist: ['1 easy set of pull-ups', '1 easy set of push-ups'],
          },
          {
            kind: 'pair',
            title: 'Groove',
            rounds: { min: 4, max: 5 },
            restSec: 75,
            exercises: [
              pullupEasy,
              {
                key: 'M.pushup',
                exerciseId: 'pushup',
                name: 'Push-up variation',
                sets: { min: 2, max: 2 },
                reps: { min: 8, max: 15 },
                rir: RIR_HYPER,
                notes: 'One notch easier than the Session B variation.',
                hint: 'One notch easier than Session B',
                variations: PUSHUP_VARIATIONS,
                defaultVariation: 'pushup',
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'B',
    name: 'Session B — Hypertrophy',
    shortName: 'Hypertrophy',
    subtitle: '45–50 min · 0–1 RIR',
    targetMin: 50,
    rirLabel: '0–1 RIR',
    intro: 'Pairs: alternate, rest 60–90 s. Chase reps, not load.',
    defaultDay: 5,
    variants: [
      {
        id: 'standard',
        name: 'Standard',
        description: 'Full hypertrophy session.',
        blocks: [
          {
            kind: 'warmup',
            title: 'Warm-up',
            durationSec: 5 * 60,
            checklist: ['Joint prep', '1 easy set of pull-ups', '1 easy set of push-ups'],
          },
          {
            kind: 'pair',
            title: 'Pair 1',
            rounds: { min: 3, max: 3 },
            restSec: 75,
            exercises: [
              {
                key: 'B.apullup',
                exerciseId: 'assisted-pullup',
                name: 'Assisted pull-up',
                sets: { min: 3, max: 3 },
                reps: { min: 8, max: 12 },
                rir: RIR_HYPER,
                notes: 'Pick assistance so 8–12 is truly hard. Alt.: harder row + 3 slow negatives (4–5 s down).',
                assisted: true,
                hint: '8–12 must be truly hard',
                variations: [
                  { id: 'negatives', name: 'Harder row + 3 slow negatives', alt: true },
                  { id: 'band-heavy', name: 'Heavy band' },
                  { id: 'foot-chair', name: 'Foot on chair' },
                  { id: 'band-light', name: 'Light band' },
                  { id: 'bodyweight', name: 'Bodyweight pull-up', exerciseId: 'pullup' },
                ],
                defaultVariation: 'band-heavy',
              },
              {
                key: 'B.pushup',
                exerciseId: 'archer-pushup',
                name: 'Archer / deficit push-up',
                sets: { min: 3, max: 3 },
                reps: { min: 8, max: 15 },
                rir: RIR_HYPER,
                notes: 'Variation must approach failure by rep 8–15. Progress: deeper deficit, wider archer, feet up.',
                variations: PUSHUP_VARIATIONS,
                defaultVariation: 'deficit',
              },
            ],
          },
          {
            kind: 'pair',
            title: 'Pair 2',
            rounds: { min: 3, max: 3 },
            restSec: 75,
            exercises: [
              {
                key: 'B.pistol',
                exerciseId: 'pistol-squat',
                name: 'Pistol progression / weighted step-up',
                sets: { min: 3, max: 3 },
                reps: { min: 8, max: 12 },
                perSide: true,
                rir: RIR_HYPER,
                notes: 'Box pistol → assisted → archer squat → full → weighted. Knees complain: high step-ups with backpack.',
                variations: [
                  { id: 'step-up', name: 'High step-up (backpack)', exerciseId: 'step-up', loadable: true, alt: true },
                  { id: 'box', name: 'Box pistol' },
                  { id: 'assisted', name: 'Assisted pistol' },
                  { id: 'archer', name: 'Archer squat', exerciseId: 'archer-squat' },
                  { id: 'full', name: 'Full pistol' },
                  { id: 'weighted', name: 'Weighted pistol', loadable: true },
                ],
                defaultVariation: 'box',
              },
              {
                key: 'B.row',
                exerciseId: 'inverted-row',
                name: 'Row, easier angle',
                sets: { min: 3, max: 3 },
                reps: { min: 10, max: 15 },
                rir: RIR_HYPER,
                notes: '1-s squeeze at top each rep.',
                hint: '1-s squeeze at the top',
                variations: ROW_VARIATIONS,
                defaultVariation: 'incline',
              },
            ],
          },
          {
            kind: 'pair',
            title: 'Pair 3',
            rounds: { min: 2, max: 3 },
            restSec: 60,
            exercises: [
              {
                key: 'B.pike',
                exerciseId: 'pike-pushup',
                name: 'Pike push-up',
                sets: { min: 2, max: 3 },
                reps: { min: 8, max: 12 },
                rir: RIR_HYPER,
                notes: 'Hips high, head to floor between hands. Progress: elevate feet.',
                hint: 'Hips high, head between hands',
                variations: [
                  { id: 'floor', name: 'Pike push-up' },
                  { id: 'feet-low', name: 'Feet elevated (low box)' },
                  { id: 'feet-high', name: 'Feet elevated (high box)' },
                ],
                defaultVariation: 'floor',
              },
              {
                key: 'B.hlr',
                exerciseId: 'hanging-leg-raise',
                name: 'Hanging leg raise',
                sets: { min: 2, max: 3 },
                reps: { min: 8, max: 15 },
                rir: RIR_HYPER,
                notes: 'No swing, slow lowering. Bent knee → straight to horizontal → toes-to-bar.',
                hint: 'No swing, slow lowering',
                variations: [
                  { id: 'bent-knee', name: 'Bent-knee raise' },
                  { id: 'straight', name: 'Straight legs to horizontal' },
                  { id: 'toes-to-bar', name: 'Toes-to-bar' },
                ],
                defaultVariation: 'bent-knee',
              },
            ],
          },
          {
            kind: 'rest-pause',
            title: 'Optional finisher — rest-pause',
            optional: true,
            miniRestSec: 20,
            miniSets: 3,
            exercises: [
              {
                key: 'B.rp-row',
                exerciseId: 'inverted-row',
                name: 'Rest-pause rows',
                basedOn: 'B.row',
                sets: { min: 1, max: 1 },
                reps: { min: 1, max: 30 },
                rir: { min: 0, max: 0 },
                notes: 'To ~0 RIR → rest 15–20 s → rep out → rest 15–20 s → rep out. Skip when short on time/energy.',
              },
              {
                key: 'B.rp-pike',
                exerciseId: 'pike-pushup',
                name: 'Rest-pause pike push-ups',
                basedOn: 'B.pike',
                sets: { min: 1, max: 1 },
                reps: { min: 1, max: 30 },
                rir: { min: 0, max: 0 },
                notes: 'To ~0 RIR → rest 15–20 s → rep out → rest 15–20 s → rep out. Skip when short on time/energy.',
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'row',
    name: 'Rowing HIIT',
    shortName: 'Rowing',
    subtitle: '20–25 min · keep ~48 h before Session A',
    targetMin: 25,
    rirLabel: 'Hard = just sustainable',
    intro: 'Legs → hips → arms on every stroke; low back neutral. If Monday pull-ups dip: move to Saturday or start Session A with dips.',
    defaultDay: 0,
    variants: [
      {
        id: '4x4',
        name: 'Main: 4 × 4',
        description: '4 × 3 min hard, 2 min easy between. Hard = just sustainable for 3 min.',
        blocks: [
          {
            kind: 'interval',
            title: '4 × 3 min hard',
            exerciseId: 'rowing-stroke',
            phases: [
              { label: 'Warm-up', durationSec: 5 * 60, intensity: 'easy' },
              ...intervals(4, 3 * 60, 2 * 60),
              { label: 'Cool-down', durationSec: 2 * 60, intensity: 'easy' },
            ],
          },
        ],
      },
      {
        id: '8x1',
        name: 'Tired week: 8 × 1',
        description: '8 × 1 min hard, 1 min easy between. Same envelope, easier to start.',
        blocks: [
          {
            kind: 'interval',
            title: '8 × 1 min hard',
            exerciseId: 'rowing-stroke',
            phases: [
              { label: 'Warm-up', durationSec: 5 * 60, intensity: 'easy' },
              ...intervals(8, 60, 60),
              { label: 'Cool-down', durationSec: 2 * 60, intensity: 'easy' },
            ],
          },
        ],
      },
      {
        id: 'steady',
        name: 'Deload: 20 min steady',
        description: 'Every 3rd–4th week. Conversational pace — intensity deload.',
        blocks: [
          {
            kind: 'interval',
            title: '20 min steady',
            exerciseId: 'rowing-stroke',
            phases: [{ label: 'Steady, conversational', durationSec: 20 * 60, intensity: 'steady' }],
          },
        ],
      },
    ],
  },
];

function intervals(count: number, hardSec: number, easySec: number) {
  const phases = [];
  for (let i = 1; i <= count; i++) {
    phases.push({ label: `Hard ${i}/${count}`, durationSec: hardSec, intensity: 'hard' as const });
    if (i < count) phases.push({ label: 'Easy', durationSec: easySec, intensity: 'easy' as const });
  }
  return phases;
}

export function getTemplate(id: TemplateId): SessionTemplate {
  const t = TEMPLATES.find((t) => t.id === id);
  if (!t) throw new Error(`Unknown template ${id}`);
  return t;
}

export function getVariant(template: SessionTemplate, variantId?: string) {
  return template.variants.find((v) => v.id === variantId) ?? template.variants[0];
}

/** The rest-pause finisher options of a session (first is the default), or none. */
export function restPauseOptions(templateId: TemplateId, variantId?: string): Prescription[] {
  const block = getVariant(getTemplate(templateId), variantId).blocks.find((b) => b.kind === 'rest-pause');
  return block?.kind === 'rest-pause' ? block.exercises : [];
}

/** All prescriptions across the program, by slot key. */
export const PRESCRIPTIONS: Record<string, Prescription> = Object.fromEntries(
  TEMPLATES.flatMap((t) =>
    t.variants.flatMap((v) =>
      v.blocks.flatMap((b) => (b.kind === 'pair' || b.kind === 'rest-pause' ? b.exercises : [])),
    ),
  ).map((p) => [p.key, p]),
);

export function templateOfKey(key: string): TemplateId {
  const prefix = key.split('.')[0];
  return prefix === 'M' ? 'micro' : (prefix as TemplateId);
}

export interface PullupStage {
  id: string;
  label: string;
  sets: number;
  reps: { min: number; max: number };
  /** Kg added when entering the stage. */
  addKg?: number;
  loadable?: boolean;
  /** Sessions at the top of range needed before advancing. */
  confirmSessions?: number;
}

export const PULLUP_ROADMAP: PullupStage[] = [
  // "+1 rep to one set weekly" is the generic rule: add a rep to the weakest set.
  { id: '4x3-5', label: '4 × 3 → 4 × 5', sets: 4, reps: { min: 3, max: 5 } },
  { id: '3x6-8', label: '3 × 6–8', sets: 3, reps: { min: 6, max: 8 } },
  { id: '3x8', label: 'Own 3 × 8', sets: 3, reps: { min: 8, max: 8 }, confirmSessions: 2 },
  { id: 'w3x5', label: '+2.5 kg · 3 × 5', sets: 3, reps: { min: 5, max: 5 }, addKg: 2.5, loadable: true },
  { id: 'w3x5-8', label: 'Weighted 3 × 5–8', sets: 3, reps: { min: 5, max: 8 }, loadable: true },
];

export const WEEK_PLAN: { day: number; label: string; templateId?: TemplateId }[] = [
  { day: 1, label: 'Mon', templateId: 'A' },
  { day: 2, label: 'Tue' },
  { day: 3, label: 'Wed', templateId: 'micro' },
  { day: 4, label: 'Thu' },
  { day: 5, label: 'Fri', templateId: 'B' },
  { day: 6, label: 'Sat' },
  { day: 0, label: 'Sun', templateId: 'row' },
];
