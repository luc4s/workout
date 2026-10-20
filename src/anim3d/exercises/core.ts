import { SEGMENTS } from '../body';
import { both, trunk, type ArmSpec, type LegSpec, type Pose, type V3 } from '../pose';
import { fedb, type ExerciseAnimSpec } from '../spec';

const deg = Math.PI / 180;

/* ---------------- ab-wheel rollout (from the knees) ----------------
 * Reference: free-exercise-db "Ab_Roller" and "Barbell_Ab_Rollout_-_On_Knees": kneeling, hips
 * over the knees, arms vertical with the wheel under the shoulders; roll out until the torso is
 * near horizontal with the arms overhead, hips following forward, back flat (no sag).
 */
const WHEEL_Y = 0.09;
const KNEE: [number, number] = [0.06, 0]; // knee joint on the floor: [y, z]
const SHIN_ANKLE: [number, number] = [0.12, -0.43];
const kneelLegs: Record<'L' | 'R', LegSpec> = both({
  ik: { target: [0.1, SHIN_ANKLE[0], SHIN_ANKLE[1]], pole: [0.1, -0.6, 0.4] },
  foot: { heading: 180, pitch: -12 },
});
/** Hips on a circle around the knee: `lean` is the thigh angle forward of vertical. */
const hipAt = (lean: number): V3 => [0, KNEE[0] + 0.436 * Math.cos(lean * deg), KNEE[1] + 0.436 * Math.sin(lean * deg)];
const grip = (z: number): Record<'L' | 'R', ArmSpec> => both({ ik: { target: [0.13, WHEEL_Y, z], pole: [0.5, 1.2, z - 0.5] } });
const roll = (lean: number, torsoDeg: number, wheelZ: number, extra: Partial<Pose> = {}): Pose => {
  const hip = hipAt(lean);
  // torsoDeg: trunk angle above horizontal (toward the head, +Z).
  const sh: V3 = [0, hip[1] + Math.sin(torsoDeg * deg), hip[2] + Math.cos(torsoDeg * deg)];
  return { root: trunk(hip, sh), lumbar: { flex: 8 }, head: { flex: 10 }, arm: grip(wheelZ), leg: kneelLegs, ...extra };
};
const rollStart = () => roll(18, 30, 0.6);
// Halfway key: the hips travel on an arc around the knees, so a straight blend would let the knees dip.
const rollMid = () => roll(36, 18, 1.02, { head: { flex: 2 } });
const rollOut = () => roll(52, 8, 1.42, { head: { flex: -5 } });
// The hips stay on their arc around the knees; the sag is the lower back arching (lumbar extension).
const rollSag = () => roll(60, -2, 1.42, { lumbar: { flex: -24 }, head: { flex: -20 } });

export const abWheelRollout: ExerciseAnimSpec = {
  id: 'ab-wheel-rollout',
  view: 'side',
  props: [{ kind: 'floor' }, { kind: 'twoHands', shape: 'wheel' }],
  clip: {
    duration: 4.2,
    keys: [
      { at: 0, pose: rollStart(), label: 'Roll out slowly — pelvis tucked, ribs down', ease: 'in' },
      { at: 1.1, pose: rollMid(), ease: 'out' },
      { at: 2.2, pose: rollOut(), label: 'Stop before the back arches' },
      { at: 2.5, pose: rollOut(), label: 'Pull back with the abs', ease: 'in' },
      { at: 3.1, pose: rollMid(), ease: 'out' },
      { at: 3.7, pose: rollStart(), label: 'Reset' },
    ],
  },
  faults: [
    {
      id: 'low-back-sag',
      title: 'Low-back sag — hips drop, lower back arches',
      highlight: SEGMENTS.torso,
      clip: {
        duration: 4.2,
        keys: [
          { at: 0, pose: rollStart(), ease: 'in' },
          { at: 1.1, pose: rollMid(), ease: 'out' },
          { at: 2.2, pose: rollSag(), label: 'Lower back caves in' },
          { at: 2.5, pose: rollSag(), ease: 'in' },
          { at: 3.1, pose: rollMid(), ease: 'out' },
          { at: 3.7, pose: rollStart() },
        ],
      },
    },
  ],
  references: [
    { title: 'free-exercise-db — Ab Roller (public domain)', url: fedb('Ab_Roller', 0), note: 'Kneeling start (hips over knees, arms vertical) and extended position.' },
    { title: 'free-exercise-db — Barbell Ab Rollout on Knees (public domain)', url: fedb('Barbell_Ab_Rollout_-_On_Knees', 0), note: 'Full extension: arms overhead, torso near horizontal.' },
  ],
};

/* ---------------- inverted row ----------------
 * Reference: free-exercise-db "Inverted_Row": lying under a bar at hip height, heels on the floor,
 * body straight; pull the chest to the bar, elbows ~45° from the body.
 */
const ROW_BAR = 1.0;
const ROW_ANKLE_Y = 0.08;
const ROW_BODY = 0.513 + 0.874 - 0.006;
const rowFeetZ = 1.12;
/** Supine plank pivoting on the heels; the head points to −Z, under the bar at z = 0. */
const supine = (shoulderY: number, hipDrop = 0): Pose => {
  const dy = shoulderY - ROW_ANKLE_Y;
  const shoulderZ = rowFeetZ - Math.sqrt(ROW_BODY * ROW_BODY - dy * dy);
  const k = 0.513 / ROW_BODY;
  const hip: V3 = [0, shoulderY - dy * k - hipDrop, shoulderZ + (rowFeetZ - shoulderZ) * k];
  return {
    root: trunk(hip, [0, shoulderY, shoulderZ]),
    lumbar: hipDrop ? { flex: 18 } : undefined,
    head: { flex: 12 },
    arm: both({ ik: { target: [0.3, ROW_BAR, 0] as V3, pole: [0.9, 0.2, 0.6] as V3 } }),
    leg: both({ ik: { target: [0.1, ROW_ANKLE_Y, rowFeetZ] as V3, pole: [0.1, 1.5, rowFeetZ - 0.4] as V3 }, foot: { heading: 0, pitch: 70 } }),
  };
};
const rowBottom = () => supine(0.39);
const rowTop = (drop = 0) => supine(0.82, drop);

export const invertedRow: ExerciseAnimSpec = {
  id: 'inverted-row',
  view: 'side',
  props: [{ kind: 'floor' }, { kind: 'bar', at: [0, ROW_BAR, 0], length: 1.2, posts: true }],
  clip: {
    duration: 3.8,
    keys: [
      { at: 0, pose: rowBottom(), label: 'Pull chest to bar, body rigid', ease: 'inOut' },
      { at: 0.9, pose: rowTop(), label: 'Squeeze shoulder blades' },
      { at: 1.3, pose: rowTop(), label: 'Lower ~2 s', ease: 'inOut' },
      { at: 3.3, pose: rowBottom(), label: 'Arms straight' },
    ],
  },
  faults: [
    {
      id: 'hip-sag',
      title: 'Hips sagging — body not rigid',
      highlight: [...SEGMENTS.torso, ...SEGMENTS.legs],
      clip: {
        duration: 3.8,
        keys: [
          { at: 0, pose: supine(0.39, 0.12), ease: 'inOut' },
          { at: 0.9, pose: rowTop(0.16), label: 'Hips drop toward floor' },
          { at: 1.3, pose: rowTop(0.16), ease: 'inOut' },
          { at: 3.3, pose: supine(0.39, 0.12) },
        ],
      },
    },
  ],
  references: [
    { title: 'free-exercise-db — Inverted Row (public domain)', url: fedb('Inverted_Row', 0), note: 'Bar height, heel contact, straight-arm bottom and chest-to-bar top.' },
  ],
};

/* ---------------- rowing stroke (erg) ----------------
 * Reference: free-exercise-db "Rowing_Stationary" (catch: shins near vertical, torso forward,
 * arms straight; finish: legs flat, slight lean back, handle at the lower ribs) and Concept2's
 * stroke sequence: legs → body → arms on the drive, arms → body → legs on the recovery.
 */
const RAIL_Y = 0.36;
const HIP_Y = RAIL_Y + 0.12;
const FOOT: V3 = [0.1, 0.27, 0.86];
const erFeet = both<LegSpec>({ ik: { target: FOOT, pole: [0.15, 1.4, 0.7] }, foot: { heading: 0, pitch: 40 } });
const stroke = (hipZ: number, lean: number, handle: V3, elbowsBack = false): Pose => ({
  root: trunk([0, HIP_Y, hipZ], [0, HIP_Y + Math.cos(lean * deg), hipZ + Math.sin(lean * deg)]),
  head: { flex: -lean * 0.5 },
  arm: both({ ik: { target: [0.14, handle[1], handle[2]], pole: elbowsBack ? [0.7, 0.6, handle[2] - 0.8] : [0.6, 0.2, handle[2] + 0.2] } }),
  leg: erFeet,
});
const catchPose = () => stroke(0.36, 28, [0, 0.62, 1.12]);
const legsDone = () => stroke(0.02, 25, [0, 0.66, 0.78]);
const bodySwung = () => stroke(0.02, -14, [0, 0.74, 0.5]);
const finish = () => stroke(0.02, -14, [0, 0.8, 0.26], true);
const armsFirst = () => stroke(0.36, 28, [0, 0.74, 0.72], true);

export const rowingStroke: ExerciseAnimSpec = {
  id: 'rowing-stroke',
  view: 'side',
  props: [
    { kind: 'floor' },
    { kind: 'rower', railY: RAIL_Y, z: [-0.95, 1.02], footplate: [0, 0.22, 0.9] },
    { kind: 'twoHands', shape: 'handle' },
    { kind: 'strap', name: 'chain', from: [0, 0.6, 1.0], to: 'hands', radius: 0.008 },
  ],
  clip: {
    duration: 3.2,
    keys: [
      { at: 0, pose: catchPose(), label: 'Drive: legs first', ease: 'in' },
      { at: 0.45, pose: legsDone(), ease: 'linear' },
      { at: 0.75, pose: bodySwung(), ease: 'out' },
      { at: 1.05, pose: finish(), label: 'Recovery: arms away', ease: 'inOut' },
      { at: 1.5, pose: bodySwung(), ease: 'inOut' },
      { at: 1.95, pose: legsDone(), ease: 'inOut' },
      { at: 2.9, pose: catchPose(), label: 'Catch: shins vertical' },
    ],
  },
  faults: [
    {
      id: 'arms-first',
      title: 'Arms pull before the legs finish',
      highlight: SEGMENTS.arms,
      clip: {
        duration: 3.2,
        keys: [
          { at: 0, pose: catchPose(), label: 'Arms bend at the catch', ease: 'inOut' },
          { at: 0.45, pose: armsFirst(), label: 'Legs push after the arms', ease: 'inOut' },
          { at: 1.05, pose: finish(), ease: 'inOut' },
          { at: 1.95, pose: legsDone(), ease: 'inOut' },
          { at: 2.9, pose: catchPose() },
        ],
      },
    },
  ],
  references: [
    { title: 'free-exercise-db — Rowing, Stationary (public domain)', url: fedb('Rowing_Stationary', 0), note: 'Catch and finish positions on the erg.' },
    { title: 'Concept2 — The rowing stroke', url: 'https://www.concept2.com/training/rowing-technique', note: 'Legs → body → arms on the drive, reverse on the recovery.' },
  ],
};
