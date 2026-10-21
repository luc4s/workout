import { DIM, SEGMENTS } from '../body';
import { both, mirror, trunk, type ArmSpec, type LegSpec, type Pose, type V3 } from '../pose';
import { fedb, type ExerciseAnimSpec } from '../spec';

const ANKLE = DIM.ankleY;
const footAt = (x: number, y: number, z: number, opts: { heading?: number; pitch?: number; pole?: V3 } = {}): LegSpec => ({
  ik: { target: [x, y + ANKLE, z], pole: opts.pole ?? [x, y + 0.6, z + 1] },
  foot: { heading: opts.heading ?? 0, pitch: opts.pitch ?? 0 },
});
/** Arms hanging with a slight bend (holding dumbbells or nothing). */
const hanging: Record<'L' | 'R', ArmSpec> = both({ shoulder: { flex: 5, abd: 6 }, elbow: 8 });

/* ---------------- Bulgarian split squat ----------------
 * Reference: free-exercise-db "Suspended_Split_Squat" (rear foot elevated, side view) and
 * "Split_Squats": front shin near vertical at the top, front thigh ~parallel at the bottom with the
 * back knee close to the floor, torso upright to slightly forward.
 */
const BENCH_TOP = 0.45;
const bssRear = footAt(-0.1, BENCH_TOP - ANKLE + 0.06, -0.62, { heading: 180, pitch: -20, pole: [-0.1, 0, 0.6] });
const bss = (hipY: number, hipZ: number, lean: number, front: LegSpec = footAt(0.11, 0, 0.36)): Pose => ({
  root: trunk([0, hipY, hipZ], [0, hipY + 1, hipZ + Math.tan((lean * Math.PI) / 180)]),
  head: { flex: 4 },
  arm: hanging,
  leg: { L: front, R: bssRear },
});
const bssTop = () => bss(0.84, 0.0, 6);
const bssBottom = () => bss(0.53, -0.07, 14);
const shortFront = (heel: boolean) => footAt(0.11, heel ? 0.065 : 0, 0.16, { pitch: heel ? -28 : 0 });

export const bulgarianSplitSquat: ExerciseAnimSpec = {
  id: 'bulgarian-split-squat',
  view: 'side',
  props: [
    { kind: 'floor' },
    { kind: 'box', center: [0, BENCH_TOP / 2, -0.85], size: [0.45, BENCH_TOP, 0.5] },
    { kind: 'held', shape: 'dumbbell', bone: 'hand_L', offset: [0, -0.068, 0] },
    { kind: 'held', shape: 'dumbbell', bone: 'hand_R', offset: [0, -0.068, 0] },
  ],
  clip: {
    duration: 3.6,
    keys: [
      { at: 0, pose: bssTop(), label: 'Lower ~2 s, back knee toward floor', ease: 'inOut' },
      { at: 2.0, pose: bssBottom(), label: 'Front thigh ~parallel' },
      { at: 2.2, pose: bssBottom(), label: 'Drive up through front heel', ease: 'out' },
      { at: 3.0, pose: bssTop(), label: 'Stand tall' },
    ],
  },
  faults: [
    {
      id: 'short-stance',
      title: 'Stance too short — heel lifts, knee shoots forward',
      highlight: SEGMENTS.legL,
      clip: {
        duration: 3.6,
        keys: [
          { at: 0, pose: bss(0.82, -0.12, 6, shortFront(false)), ease: 'inOut' },
          { at: 2.0, pose: bss(0.56, -0.12, 14, shortFront(true)), label: 'Heel peels off the floor' },
          { at: 2.3, pose: bss(0.56, -0.12, 14, shortFront(true)), ease: 'inOut' },
          { at: 3.1, pose: bss(0.82, -0.12, 6, shortFront(false)) },
        ],
      },
    },
  ],
  references: [
    { title: 'free-exercise-db — Suspended Split Squat (rear foot elevated, public domain)', url: fedb('Suspended_Split_Squat', 0), note: 'Rear-foot-elevated top and bottom positions, front shin angle, torso lean.' },
    { title: 'free-exercise-db — Split Squats (public domain)', url: fedb('Split_Squats', 0), note: 'Bottom depth: back knee near the floor, front thigh ~parallel.' },
  ],
};

/* ---------------- pistol squat (box pistol) ----------------
 * Reference: free-exercise-db "Kettlebell_Pistol_Squat" (front view): standing on one leg, the free
 * leg held out in front; at the bottom the hips sit low behind the heel, the torso leans forward and
 * the arms reach forward to balance, heel flat.
 */
const BOX_H = 0.42;
const pistolStand = (): Pose => ({
  root: trunk([0, 0.9, -0.02], [0, 2, 0.06]),
  head: { flex: 5 },
  arm: both({ shoulder: { flex: 80, abd: 8 }, elbow: 10 }),
  leg: { L: footAt(0.1, 0, 0.04), R: { hip: { flex: 40 }, knee: 25, ankle: 10 } },
});
const pistolBottom = (heel = false): Pose => {
  const lean = 32;
  return {
    root: trunk([0, BOX_H + 0.1, -0.26], [0, 2, -0.26 + Math.tan((lean * Math.PI) / 180) * 1.5]),
    thorax: { flex: 8 },
    head: { flex: -10 },
    arm: both({ shoulder: { flex: 95, abd: 6 }, elbow: 5 }),
    leg: { L: heel ? footAt(0.1, 0.05, 0.1, { pitch: -26 }) : footAt(0.1, 0, 0.04), R: { hip: { flex: 80 + lean }, knee: 6, ankle: 10 } },
  };
};

export const pistolSquat: ExerciseAnimSpec = {
  id: 'pistol-squat',
  view: 'side',
  props: [{ kind: 'floor' }, { kind: 'box', center: [0, BOX_H / 2, -0.4], size: [0.45, BOX_H, 0.4] }],
  clip: {
    duration: 3.8,
    keys: [
      { at: 0, pose: pistolStand(), label: 'Sit back ~2 s, arms forward', ease: 'inOut' },
      { at: 2.0, pose: pistolBottom(), label: 'Touch the box softly' },
      { at: 2.3, pose: pistolBottom(), label: 'Drive up, heel down', ease: 'inOut' },
      { at: 3.2, pose: pistolStand(), label: 'Stand tall on one leg' },
    ],
  },
  faults: [
    {
      id: 'heel-lift',
      title: 'Heel lifts — weight rolls onto the toes',
      highlight: SEGMENTS.legL,
      clip: {
        duration: 3.8,
        keys: [
          { at: 0, pose: pistolStand(), ease: 'inOut' },
          { at: 2.0, pose: pistolBottom(true), label: 'Heel comes up' },
          { at: 2.3, pose: pistolBottom(true), ease: 'inOut' },
          { at: 3.2, pose: pistolStand() },
        ],
      },
    },
  ],
  references: [
    { title: 'free-exercise-db — Kettlebell Pistol Squat (public domain)', url: fedb('Kettlebell_Pistol_Squat', 0), note: 'Single-leg stance, free leg forward, bottom depth and forward reach.' },
  ],
};

/* ---------------- step-up (backpack) ----------------
 * Reference: free-exercise-db "Dumbbell_Step_Ups": one foot on a knee-high box, drive through it to
 * stand tall on the box, lower under control with the trailing foot.
 */
const STEP = 0.45;
const onBox = (x: number) => footAt(x, STEP, 0.3);
const stepStart = (): Pose => ({
  root: trunk([0, 0.86, 0.02], [0, 2, 0.32]),
  head: { flex: 5 },
  arm: hanging,
  leg: { L: onBox(0.1), R: footAt(-0.1, 0, -0.16) },
});
const stepDrive = (): Pose => ({
  root: trunk([0, 1.12, 0.2], [0, 2, 0.36]),
  head: { flex: 3 },
  arm: hanging,
  leg: { L: onBox(0.1), R: footAt(-0.1, 0.22, 0.02, { pitch: -35 }) },
});
const stepTop = (): Pose => ({
  root: trunk([0, STEP + 0.87, 0.28], [0, 2, 0.3]),
  arm: hanging,
  leg: { L: onBox(0.1), R: onBox(-0.1) },
});

export const stepUp: ExerciseAnimSpec = {
  id: 'step-up',
  view: 'side',
  props: [{ kind: 'floor' }, { kind: 'box', center: [0, STEP / 2, 0.33], size: [0.5, STEP, 0.4] }, { kind: 'backpack' }],
  clip: {
    duration: 3.6,
    keys: [
      { at: 0, pose: stepStart(), label: 'Drive through the top leg', ease: 'in' },
      { at: 0.55, pose: stepDrive(), ease: 'out' },
      { at: 1.0, pose: stepTop(), label: 'Stand tall on the box' },
      { at: 1.3, pose: stepTop(), label: 'Lower ~2 s under control', ease: 'inOut' },
      { at: 2.4, pose: stepDrive(), ease: 'inOut' },
      { at: 3.2, pose: stepStart(), label: 'Back foot taps down' },
    ],
  },
  faults: [],
  references: [
    { title: 'free-exercise-db — Dumbbell Step Ups (public domain)', url: fedb('Dumbbell_Step_Ups', 0), note: 'Box height, start with one foot up, standing tall on the box.' },
  ],
};

/* ---------------- archer squat ----------------
 * Reference: free-exercise-db "Barbell_Side_Split_Squat" (front view): very wide stance, toes
 * slightly out; sit over one leg until the thigh is ~parallel while the other leg straightens.
 * Arms reach forward (written technique: BarBend / Fitness Volt Cossack squat guides).
 */
const AS_X = 0.55;
const asFeet = { L: footAt(AS_X, 0, 0.02, { heading: 15, pole: [AS_X + 0.3, 0.6, 1] }), R: footAt(-AS_X, 0, 0.02, { heading: -15, pole: [-AS_X - 0.3, 0.6, 1] }) };
const asStand = (): Pose => ({
  root: trunk([0, 0.8, -0.02], [0, 2, 0.08]),
  head: { flex: 4 },
  arm: both({ shoulder: { flex: 85, abd: 6 }, elbow: 6 }),
  leg: asFeet,
});
const asLeft = (): Pose => ({
  root: { ...trunk([0.27, 0.53, -0.08], [0.27, 2, 0.32]), rot: [22, 0, -4] },
  head: { flex: -6 },
  arm: both({ shoulder: { flex: 95, abd: 8 }, elbow: 10 }),
  leg: asFeet,
});

export const archerSquat: ExerciseAnimSpec = {
  id: 'archer-squat',
  view: 'front',
  props: [{ kind: 'floor' }],
  clip: {
    duration: 6,
    keys: [
      { at: 0, pose: asStand(), label: 'Wide stance, sit over one leg ~2 s', ease: 'inOut' },
      { at: 2, pose: asLeft(), label: 'Other leg straight, foot flat' },
      { at: 2.2, pose: asLeft(), label: 'Drive up through the heel', ease: 'inOut' },
      { at: 3, pose: asStand(), label: 'Switch sides', ease: 'inOut' },
      { at: 5, pose: mirror(asLeft()), label: 'Other leg straight, foot flat' },
      { at: 5.2, pose: mirror(asLeft()), label: 'Drive up through the heel', ease: 'inOut' },
    ],
  },
  faults: [],
  references: [
    { title: 'free-exercise-db — Barbell Side Split Squat (public domain)', url: fedb('Barbell_Side_Split_Squat', 0), note: 'Stance width, toes out, bottom position over one leg.' },
    { title: 'How to Do the Cossack Squat – BarBend', url: 'https://barbend.com/cossack-squat/', note: 'Straight trailing leg, heel down, arms forward to counterbalance.' },
  ],
};

/* ---------------- joint circles (warm-up) ----------------
 * Standing, big slow arm circles: forward, up, then down the sides.
 */
const circle = (shoulder: ArmSpec['shoulder'], knee = 4): Pose => ({
  root: { pos: [0, 0.94 - knee * 0.0015, 0] },
  arm: both({ shoulder, elbow: 4 }),
  leg: { L: footAt(0.12, 0, 0.02, { heading: 5 }), R: footAt(-0.12, 0, 0.02, { heading: -5 }) },
});

export const jointCircles: ExerciseAnimSpec = {
  id: 'joint-circles',
  view: 'threeQuarter',
  props: [{ kind: 'floor' }],
  clip: {
    duration: 3,
    keys: [
      { at: 0, pose: circle({ flex: 5, abd: 5 }), label: 'Big slow arm circles — then hips, knees, ankles, wrists', ease: 'linear' },
      { at: 0.75, pose: circle({ flex: 90, abd: 5 }, 8), ease: 'linear' },
      { at: 1.5, pose: circle({ flex: 172, abd: 5 }), ease: 'linear' },
      { at: 2.0, pose: circle({ flex: 40, abd: 150 }, 8), ease: 'linear' },
      { at: 2.5, pose: circle({ flex: 0, abd: 80 }), ease: 'linear' },
    ],
  },
  faults: [],
  references: [{ title: 'Program warm-up (training-program.pdf)', url: 'training-program.pdf', note: 'Joint circles before the ramp sets.' }],
};
