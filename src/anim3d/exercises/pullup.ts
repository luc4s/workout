import { SEGMENTS } from '../body';
import { both, type Pose } from '../pose';
import { fedb, type ExerciseAnimSpec } from '../spec';

/*
 * Reference: free-exercise-db "Pullups" (rear view).
 * - Start: dead hang, arms straight, grip ≈ 1.5 × shoulder width, knees bent ~80°, thighs vertical.
 * - Top: chin over the bar, upper arms ~45° below horizontal, forearms vertical, elbows out and
 *   slightly forward, knees still bent, slight lean back.
 */
export const BAR_Y = 2.25;
export const BAR_Z = 0.06;
const GRIP_X = 0.36;

const hands = (rootY: number) =>
  both({
    ik: { target: [GRIP_X, BAR_Y, BAR_Z], pole: [0.8, rootY - 0.05, 0.15] },
    clav: { elev: 0 },
  });

// Depressing the shoulder blades lifts the body: the hips rise as the clavicles come down.
const CLAVICLE = 0.2;
const hangY = (elev: number) => 1.01 + CLAVICLE * (Math.sin((25 * Math.PI) / 180) - Math.sin((elev * Math.PI) / 180));

export const hang = (opts: { elev?: number; knee?: number } = {}): Pose => ({
  root: { pos: [0, hangY(opts.elev ?? 25), 0.03], rot: [0, 0, 0] },
  thorax: { flex: 0 },
  head: { flex: -8 },
  arm: { L: { ...hands(1.06).L, clav: { elev: opts.elev ?? 25 } }, R: { ...hands(1.06).R, clav: { elev: opts.elev ?? 25 } } },
  leg: both({ hip: { flex: 12, abd: 2 }, knee: opts.knee ?? 80, ankle: -25 }),
});

export const top = (): Pose => ({
  root: { pos: [0, 1.69, 0.0], rot: [-3, 0, 0] },
  lumbar: { flex: -2 },
  thorax: { flex: -4 },
  head: { flex: -20 },
  arm: { L: { ...hands(1.69).L, clav: { elev: -4, prot: -10 } }, R: { ...hands(1.69).R, clav: { elev: -4, prot: -10 } } },
  leg: both({ hip: { flex: 25, abd: 2 }, knee: 85, ankle: -25 }),
});

const mid = (): Pose => ({
  root: { pos: [0, 1.4, -0.03], rot: [-3, 0, 0] },
  thorax: { flex: -5 },
  head: { flex: -12 },
  arm: { L: { ...hands(1.4).L, clav: { elev: 0 } }, R: { ...hands(1.4).R, clav: { elev: 0 } } },
  leg: both({ hip: { flex: 18, abd: 2 }, knee: 82, ankle: -25 }),
});

export const pullup: ExerciseAnimSpec = {
  id: 'pullup',
  view: 'threeQuarter',
  props: [{ kind: 'floor' }, { kind: 'bar', at: [0, BAR_Y, BAR_Z], length: 1.2 }],
  clip: {
    duration: 4.2,
    keys: [
      { at: 0, pose: hang(), label: 'Dead hang — set the shoulders down', ease: 'inOut' },
      { at: 0.5, pose: hang({ elev: 8 }), label: 'Pull the elbows down to the ribs', ease: 'in' },
      { at: 1.0, pose: mid(), ease: 'out' },
      { at: 1.45, pose: top(), label: 'Chin over the bar' },
      { at: 1.75, pose: top(), label: 'Lower ~2 s to a full hang', ease: 'inOut' },
      { at: 3.75, pose: hang() },
    ],
  },
  faults: [
    {
      id: 'half-reps',
      title: 'Half reps — not returning to a full hang',
      highlight: SEGMENTS.arms,
      clip: {
        duration: 2.6,
        keys: [
          { at: 0, pose: mid(), label: 'Stops with the elbows still bent', ease: 'inOut' },
          { at: 0.9, pose: top(), label: 'Chin over the bar' },
          { at: 1.1, pose: top(), ease: 'inOut' },
          { at: 2.2, pose: mid(), label: 'Never reaches a straight-arm hang' },
        ],
      },
    },
  ],
  references: [
    {
      title: 'free-exercise-db — Pullups (start / end photos, public domain)',
      url: fedb('Pullups', 0),
      note: 'Dead-hang and chin-over-bar positions, grip width, bent-knee leg position.',
    },
  ],
};
