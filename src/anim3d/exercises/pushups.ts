import { SEGMENTS, type Side } from '../body';
import { both, trunk, type ArmSpec, type LegSpec, type Pose, type V3 } from '../pose';
import { fedb, type ExerciseAnimSpec } from '../spec';

/*
 * Push-up family. The figure lies prone with the head toward +Z; hands flat (fingers forward),
 * feet on the toes. Positions come from free-exercise-db "Pushups" (top: arms straight, hands under
 * the shoulders a little wider; bottom: chest just off the floor, body in one line) and
 * "Push-Ups_With_Feet_Elevated"; elbows ~45° from the torso (ACE push-up guide).
 */
const PALM_Y = 0.035;
/** On the toes: the rigid foot is pitched toes-down so its tip rests on the floor. */
const ANKLE_Y = 0.19;

const hand = (x: number, z: number, y = PALM_Y, pole: V3 = [Math.sign(x) * 0.8, 0.9, z - 0.5]): ArmSpec => ({
  ik: { target: [x, y, z], pole },
  palm: { heading: Math.sign(x) * 8 },
});
const feet = (z: number, x = 0.09): Record<Side, LegSpec> =>
  both({ ik: { target: [x, ANKLE_Y, z], pole: [x, -1, z + 0.6] }, foot: { heading: 0, pitch: -52 } });

/** Shoulder → ankle length of the straight body (trunk + legs, a hair short of locked knees). */
const BODY = 0.513 + 0.874 - 0.006;

/**
 * Rigid plank pivoting on the toes: given the shoulder height and the (fixed) ankle position, the
 * shoulders land where a straight body puts them, and the hips on that line.
 */
const plank = (shoulderY: number, ankleZ: number, extra: Partial<Pose> = {}): Pose => {
  const dy = shoulderY - ANKLE_Y;
  const shoulderZ = ankleZ + Math.sqrt(BODY * BODY - dy * dy);
  const k = 0.513 / BODY;
  const hip: V3 = [0, shoulderY - dy * k, shoulderZ - (shoulderZ - ankleZ) * k];
  return { root: trunk(hip, [0, shoulderY, shoulderZ]), head: { flex: 8 }, ...extra };
};
/** Ankle z that puts the shoulders straight over the hands (z = 0) at height `topY`. */
const feetFor = (topY: number) => -Math.sqrt(BODY * BODY - (topY - ANKLE_Y) ** 2);

/* ---------------- push-up ---------------- */
const PU_HX = 0.27;
const PU_FEET = feetFor(0.6);
const puTop = (): Pose => ({ ...plank(0.6, PU_FEET), arm: { L: hand(PU_HX, 0), R: hand(-PU_HX, 0) }, leg: feet(PU_FEET) });
const puBottom = (): Pose => ({ ...plank(0.2, PU_FEET), arm: { L: hand(PU_HX, 0), R: hand(-PU_HX, 0) }, leg: feet(PU_FEET) });
const sag = (shoulderY: number, drop: number): Pose => {
  const p = plank(shoulderY, PU_FEET);
  const pos = p.root.pos;
  const sh = [0, shoulderY, pos[2] + 0.513 * Math.sin((p.root.rot![0] * Math.PI) / 180)] as V3;
  return { ...p, root: trunk([0, pos[1] - drop, pos[2]], sh), lumbar: { flex: -14 }, arm: { L: hand(PU_HX, 0), R: hand(-PU_HX, 0) }, leg: feet(PU_FEET) };
};

export const pushup: ExerciseAnimSpec = {
  id: 'pushup',
  view: 'side',
  props: [{ kind: 'floor' }],
  clip: {
    duration: 3.6,
    keys: [
      { at: 0, pose: puTop(), label: 'Lower ~2 s, elbows ~45°', ease: 'inOut' },
      { at: 2.0, pose: puBottom(), label: 'Chest near floor' },
      { at: 2.2, pose: puBottom(), label: 'Press explosively', ease: 'out' },
      { at: 2.9, pose: puTop(), label: 'Body in one line' },
    ],
  },
  faults: [
    {
      id: 'hip-sag',
      title: 'Hips sagging — lower back arches',
      highlight: [...SEGMENTS.torso, ...SEGMENTS.legs],
      clip: {
        duration: 3.6,
        keys: [
          { at: 0, pose: sag(0.56, 0.12), label: 'Hips drop first', ease: 'inOut' },
          { at: 2.0, pose: sag(0.24, 0.1) },
          { at: 2.2, pose: sag(0.24, 0.1), ease: 'out' },
          { at: 2.9, pose: sag(0.56, 0.12) },
        ],
      },
    },
  ],
  references: [
    { title: 'free-exercise-db — Pushups (public domain)', url: fedb('Pushups', 0), note: 'Top and bottom positions, hand placement, straight body line.' },
    { title: 'ACE — Perfecting the push-up', url: 'https://www.acefitness.org/resources/pros/expert-articles/7265/perfecting-the-push-up-for-all-levels/', note: 'Elbows ~45° from the torso, rigid plank.' },
  ],
};

/* ---------------- deficit push-up ---------------- */
const BLOCK = 0.1;
const DF_FEET = feetFor(0.7);
const dfHands = { L: hand(PU_HX, 0, BLOCK + PALM_Y), R: hand(-PU_HX, 0, BLOCK + PALM_Y) };
const dfTop = (): Pose => ({ ...plank(0.7, DF_FEET), arm: dfHands, leg: feet(DF_FEET) });
const dfBottom = (): Pose => ({ ...plank(0.17, DF_FEET), arm: dfHands, leg: feet(DF_FEET) });

export const deficitPushup: ExerciseAnimSpec = {
  id: 'deficit-pushup',
  view: 'side',
  props: [
    { kind: 'floor' },
    { kind: 'box', center: [PU_HX, BLOCK / 2, 0], size: [0.12, BLOCK, 0.2] },
    { kind: 'box', center: [-PU_HX, BLOCK / 2, 0], size: [0.12, BLOCK, 0.2] },
  ],
  clip: {
    duration: 3.6,
    keys: [
      { at: 0, pose: dfTop(), label: 'Lower ~2 s past hand level', ease: 'inOut' },
      { at: 2.0, pose: dfBottom(), label: 'Deep stretch, shoulders stay down' },
      { at: 2.2, pose: dfBottom(), label: 'Press explosively', ease: 'out' },
      { at: 2.9, pose: dfTop(), label: 'Body in one line' },
    ],
  },
  faults: [],
  references: [
    { title: 'free-exercise-db — Pushups (public domain)', url: fedb('Pushups', 0), note: 'Plank and bottom positions; the deficit lowers the chest below the hands.' },
    { title: 'Deficit Push-Ups – Fitness Volt', url: 'https://fitnessvolt.com/deficit-push-ups/', note: 'Hands on raised supports, chest lowers past hand level, body rigid.' },
  ],
};

/* ---------------- archer push-up ----------------
 * No photo in free-exercise-db; positions follow the written technique in the app's guide (hands
 * far wider than the shoulders, chest shifts over one hand, the other arm stays straight, hips
 * square) and the body line of free-exercise-db "Single-Arm_Push-Up".
 */
const AR_HX = 0.54;
// Feet 2 cm closer than a locked plank: the sideways shift needs a little leg length.
const AR_FEET = feetFor(0.535) + 0.02;
const arHands = { L: hand(AR_HX, 0, PALM_Y, [1.0, 0.25, -0.9]), R: hand(-AR_HX, 0, PALM_Y, [-1.0, 0.25, -0.9]) };
const arTop = (): Pose => ({ ...plank(0.535, AR_FEET), arm: arHands, leg: feet(AR_FEET) });
const arSide = (dir: 1 | -1): Pose => {
  const p = plank(0.27, AR_FEET);
  const pos = p.root.pos;
  return {
    ...p,
    root: { pos: [dir * 0.05, pos[1], pos[2]], rot: [p.root.rot![0], dir * 6, 0] },
    head: { flex: 8, turn: dir * 10 },
    arm: arHands,
    leg: feet(AR_FEET),
  };
};

export const archerPushup: ExerciseAnimSpec = {
  id: 'archer-pushup',
  view: 'front',
  props: [{ kind: 'floor' }],
  clip: {
    duration: 6,
    keys: [
      { at: 0, pose: arTop(), label: 'Shift over one hand, lower ~2 s', ease: 'inOut' },
      { at: 2, pose: arSide(1), label: 'Other arm stays straight' },
      { at: 2.2, pose: arSide(1), label: 'Press back to centre', ease: 'inOut' },
      { at: 3, pose: arTop(), label: 'Switch sides', ease: 'inOut' },
      { at: 5, pose: arSide(-1), label: 'Other arm stays straight' },
      { at: 5.2, pose: arSide(-1), label: 'Press back to centre', ease: 'inOut' },
    ],
  },
  faults: [],
  references: [
    { title: 'free-exercise-db — Single-Arm Push-Up (public domain)', url: fedb('Single-Arm_Push-Up', 0), note: 'Body stays square while loading one arm.' },
  ],
};

/* ---------------- pike push-up ----------------
 * Inverted V: hips high over the hands, feet walked in. The head travels down and forward to the
 * floor in front of the hands (free-exercise-db "Handstand_Push-Ups" shows the same head-to-floor
 * path), elbows track back. Positions follow the Liftosaur description and the program notes.
 */
const PK_HX = 0.25;
const PK_FEET = -0.86;
const pkHands = { L: hand(PK_HX, 0, PALM_Y, [0.6, 0.6, -0.9]), R: hand(-PK_HX, 0, PALM_Y, [-0.6, 0.6, -0.9]) };
const pkLegs = both<LegSpec>({ ik: { target: [0.1, ANKLE_Y - 0.02, PK_FEET], pole: [0.1, 1.2, PK_FEET + 0.3] }, foot: { heading: 0, pitch: -45 } });
const pike = (hip: V3, shoulder: V3, extra: Partial<Pose> = {}): Pose => ({ root: trunk(hip, shoulder), head: { flex: -25 }, arm: pkHands, leg: pkLegs, ...extra });
const pkTop = () => pike([0, 0.92, -0.73], [0, 0.524, -0.404]);
const pkBottom = () => pike([0, 0.81, -0.44], [0, 0.42, -0.12], { thorax: { flex: 10 }, head: { flex: -35 } });
const pkDrop = (low: boolean) => pike(low ? [0, 0.34, -0.42] : [0, 0.53, -0.5], low ? [0, 0.26, 0.09] : [0, 0.59, -0.04], { head: { flex: 5 } });

export const pikePushup: ExerciseAnimSpec = {
  id: 'pike-pushup',
  view: 'side',
  props: [{ kind: 'floor' }],
  clip: {
    duration: 3.6,
    keys: [
      { at: 0, pose: pkTop(), label: 'Hips high, lower head ~2 s', ease: 'inOut' },
      { at: 2.0, pose: pkBottom(), label: 'Head to floor in front of hands' },
      { at: 2.2, pose: pkBottom(), label: 'Press up and back', ease: 'out' },
      { at: 2.9, pose: pkTop(), label: 'Hips stay high' },
    ],
  },
  faults: [
    {
      id: 'hips-drop',
      title: 'Hips drop — becomes a regular push-up',
      highlight: SEGMENTS.torso,
      clip: {
        duration: 3.6,
        keys: [
          { at: 0, pose: pkDrop(false), label: 'Shoulders shift over the hands', ease: 'inOut' },
          { at: 2.0, pose: pkDrop(true) },
          { at: 2.2, pose: pkDrop(true), ease: 'out' },
          { at: 2.9, pose: pkDrop(false) },
        ],
      },
    },
  ],
  references: [
    { title: 'free-exercise-db — Handstand Push-Ups (public domain)', url: fedb('Handstand_Push-Ups', 0), note: 'Head lowers to the floor in front of the hands, elbows track back.' },
    { title: 'Liftosaur — Bodyweight Pike Push-Up', url: 'https://www.liftosaur.com/exercises/bodyweight-pike-pushup', note: 'Inverted V, head lowers toward the floor, press back up.' },
  ],
};
