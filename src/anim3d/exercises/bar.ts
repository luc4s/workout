import { SEGMENTS } from '../body';
import { both, trunk, type Pose, type V3 } from '../pose';
import { fedb, type ExerciseAnimSpec } from '../spec';
import { BAR_Y, BAR_Z } from './pullup';

/* ---------------- assisted pull-up ----------------
 * Reference: free-exercise-db "Band_Assisted_Pull-Up" (front view): shoulder-width-plus grip,
 * knees bent ~90° with the band under one foot / knee, same path as the pull-up.
 */
const aGrip = 0.33;
const aHands = (elev: number, prot = 0) =>
  both({ ik: { target: [aGrip, BAR_Y, BAR_Z] as V3, pole: [0.8, 1.4, 0.15] as V3 }, clav: { elev, prot } });
const bandLegs = both({ hip: { flex: 5, abd: 3 }, knee: 95, ankle: -20 });
const aHang = (elev = 25): Pose => ({ root: { pos: [0, 1.02, 0.03] }, head: { flex: -8 }, arm: aHands(elev), leg: bandLegs });
const aMid = (): Pose => ({ root: { pos: [0, 1.4, -0.01], rot: [-3, 0, 0] }, thorax: { flex: -4 }, head: { flex: -12 }, arm: aHands(0), leg: bandLegs });
const aTop = (): Pose => ({ root: { pos: [0, 1.69, 0.0], rot: [-3, 0, 0] }, thorax: { flex: -4 }, head: { flex: -20 }, arm: aHands(-4, -10), leg: bandLegs });

export const assistedPullup: ExerciseAnimSpec = {
  id: 'assisted-pullup',
  view: 'threeQuarter',
  props: [
    { kind: 'floor' },
    { kind: 'bar', at: [0, BAR_Y, BAR_Z], length: 1.2 },
    { kind: 'strap', name: 'band', from: [0.03, BAR_Y, BAR_Z], to: { bone: 'foot_R', offset: [0, -0.02, 0.06] }, radius: 0.014 },
    { kind: 'strap', name: 'band2', from: [-0.03, BAR_Y, BAR_Z], to: { bone: 'foot_R', offset: [-0.02, -0.02, 0.06] }, radius: 0.014 },
  ],
  clip: {
    duration: 4.2,
    keys: [
      { at: 0, pose: aHang(), label: 'Pull — band helps at the bottom', ease: 'in' },
      { at: 0.6, pose: aMid(), ease: 'out' },
      { at: 1.1, pose: aTop(), label: 'Chin over bar' },
      { at: 1.4, pose: aTop(), label: 'Lower ~2 s (negatives: 4–5 s)', ease: 'inOut' },
      { at: 3.6, pose: aHang(), label: 'Full hang' },
    ],
  },
  faults: [],
  references: [
    { title: 'free-exercise-db — Band Assisted Pull-Up (public domain)', url: fedb('Band_Assisted_Pull-Up', 0), note: 'Grip width, band under the foot, bent knees, top and bottom positions.' },
  ],
};

/* ---------------- dip ----------------
 * Reference: free-exercise-db "Dips_-_Chest_Version" and "Parallel_Bar_Dip": lockout with
 * straight arms over the hands, knees bent with the feet behind; bottom with the upper arm about
 * parallel to the floor, forearms near vertical, torso leaning forward ~20–30°.
 */
const DIP_Y = 1.25;
const DIP_X = 0.26;
const dipHands = (elev: number, prot = 0) =>
  both({ ik: { target: [DIP_X, DIP_Y + 0.03, 0] as V3, pole: [0.45, 1.5, -1] as V3 }, clav: { elev, prot } });
const dipLegs = (lean: number) => both({ hip: { flex: 10 - lean, abd: 2 }, knee: 85, ankle: -30 });
const dipTop = (): Pose => ({
  root: trunk([0, 1.41, -0.06], [0, 2, 0.04]),
  head: { flex: 5 },
  arm: dipHands(-8),
  leg: dipLegs(10),
});
const dipBottom = (deep = 0): Pose => ({
  root: trunk([0, 1.09 - deep, -0.15 - deep / 2], [0, 2, 0.18 + deep * 1.5]),
  thorax: { flex: 6 },
  head: { flex: 0 },
  arm: dipHands(deep ? 18 : 2, deep ? 18 : 4),
  leg: dipLegs(25),
});

export const dip: ExerciseAnimSpec = {
  id: 'dip',
  view: 'side',
  props: [{ kind: 'floor' }, { kind: 'dipBars', y: DIP_Y, halfWidth: DIP_X, z: [-0.4, 0.45] }],
  clip: {
    duration: 3.8,
    keys: [
      { at: 0, pose: dipTop(), label: 'Lower ~2 s, slight forward lean', ease: 'inOut' },
      { at: 2.0, pose: dipBottom(), label: 'Upper arm ~parallel' },
      { at: 2.2, pose: dipBottom(), label: 'Press up explosively', ease: 'out' },
      { at: 3.0, pose: dipTop(), label: 'Lock out, shoulders down' },
    ],
  },
  faults: [
    {
      id: 'too-deep',
      title: 'Sinking too deep — shoulders roll forward',
      highlight: [...SEGMENTS.shoulders, 'chest'],
      clip: {
        duration: 3.8,
        keys: [
          { at: 0, pose: dipTop(), ease: 'inOut' },
          { at: 2.0, pose: dipBottom(0.13), label: 'Shoulder dives below elbow' },
          { at: 2.3, pose: dipBottom(0.13), ease: 'inOut' },
          { at: 3.2, pose: dipTop() },
        ],
      },
    },
  ],
  references: [
    { title: 'free-exercise-db — Dips (chest version) (public domain)', url: fedb('Dips_-_Chest_Version', 0), note: 'Lockout and bottom positions, forward lean, bent legs.' },
    { title: 'free-exercise-db — Parallel Bar Dip (public domain)', url: fedb('Parallel_Bar_Dip', 0), note: 'Bar height and hand placement.' },
  ],
};

/* ---------------- hanging leg raise ----------------
 * Reference: free-exercise-db "Hanging_Leg_Raise" (side view): dead hang, then the knees come up
 * until the thighs pass horizontal; the pelvis tucks (posterior tilt) at the top.
 */
// A higher bar than for pull-ups: the straight legs must clear the floor in the hang.
const HLR_BAR = 2.42;
const hGrip = 0.26;
const hHands = (elev: number) => both({ ik: { target: [hGrip, HLR_BAR, BAR_Z] as V3, pole: [0.6, 1.6, -0.3] as V3 }, clav: { elev } });
const hlrHang = (): Pose => ({ root: { pos: [0, 1.17, 0.05] }, head: { flex: 5 }, arm: hHands(25), leg: both({ hip: { flex: 2 }, knee: 5, ankle: -30 }) });
const hlrTop = (): Pose => ({
  root: { pos: [0, 1.24, 0.03], rot: [-14, 0, 0] },
  lumbar: { flex: 10 },
  thorax: { flex: 6 },
  head: { flex: 8 },
  arm: hHands(18),
  leg: both({ hip: { flex: 112 }, knee: 85, ankle: -25 }),
});
const swingBack = (): Pose => ({
  root: { pos: [0, 1.16, -0.05], rot: [10, 0, 0] },
  lumbar: { flex: -12 },
  head: { flex: -5 },
  arm: hHands(25),
  leg: both({ hip: { flex: -25 }, knee: 40, ankle: -30 }),
});
const swingUp = (): Pose => ({
  root: { pos: [0, 1.25, 0.14], rot: [-22, 0, 0] },
  lumbar: { flex: 14 },
  thorax: { flex: 6 },
  head: { flex: 10 },
  arm: hHands(15),
  leg: both({ hip: { flex: 120 }, knee: 70, ankle: -25 }),
});

export const hangingLegRaise: ExerciseAnimSpec = {
  id: 'hanging-leg-raise',
  view: 'side',
  props: [{ kind: 'floor' }, { kind: 'bar', at: [0, HLR_BAR, BAR_Z], length: 1.2 }],
  clip: {
    duration: 4,
    keys: [
      { at: 0, pose: hlrHang(), label: 'Lift — no swing', ease: 'inOut' },
      { at: 1.0, pose: hlrTop(), label: 'Knees above the hips, pelvis tucks' },
      { at: 1.3, pose: hlrTop(), label: 'Lower slowly ~2 s', ease: 'inOut' },
      { at: 3.3, pose: hlrHang(), label: 'Dead stop' },
    ],
  },
  faults: [
    {
      id: 'swing',
      title: 'Swinging — momentum does the work',
      highlight: [...SEGMENTS.torso, ...SEGMENTS.legs],
      clip: {
        duration: 2.4,
        keys: [
          { at: 0, pose: swingBack(), label: 'Kicks back to build swing', ease: 'inOut' },
          { at: 0.8, pose: swingUp(), label: 'Legs fly up' },
          { at: 1.2, pose: swingUp(), ease: 'in' },
          { at: 1.8, pose: hlrHang(), label: 'Drops fast', ease: 'out' },
        ],
      },
    },
  ],
  references: [
    { title: 'free-exercise-db — Hanging Leg Raise (public domain)', url: fedb('Hanging_Leg_Raise', 0), note: 'Hang and top positions: thighs past horizontal, knees bent, pelvis tucked.' },
  ],
};
