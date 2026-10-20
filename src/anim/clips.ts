import type { ExerciseId } from '../data/types';
import type { Clip, FkLimb, IkLimb, JointName, Keyframe, LimbName, Pose, Vec } from './rig';

export type Segment = 'torso' | 'head' | LimbName;

export type PropSpec =
  | { kind: 'floor'; y: number }
  | { kind: 'bar'; at: Vec }
  | { kind: 'dipBar'; at: Vec; floorY: number }
  | { kind: 'box'; x: number; y: number; w: number; h: number }
  | { kind: 'wall'; x: number; floorY: number }
  | { kind: 'wheel'; joint: JointName; r: number }
  | { kind: 'dumbbell'; joint: JointName }
  | { kind: 'backpack' }
  | { kind: 'band'; from: Vec; joint: JointName }
  | { kind: 'rower'; railY: number; x1: number; x2: number; footplate: Vec; handleBase: Vec };

export interface FaultDemo {
  id: string;
  title: string;
  clip: Clip;
  highlight: Segment[];
}

export interface SideAnim {
  view: 'side';
  viewBox: [number, number, number, number];
  props: PropSpec[];
  clip: Clip;
  faults: FaultDemo[];
  caption?: string;
}

/** Front view: used for movements whose key motion is lateral (archer push-up, archer squat). */
export interface FrontPose {
  shoulderL: Vec;
  shoulderR: Vec;
  handL: Vec;
  handR: Vec;
  head: Vec;
  /** Standing figures: hips and feet; knees are solved, bending out toward the viewer. */
  legs?: { hipL: Vec; hipR: Vec; footL: Vec; footR: Vec };
}

export interface FrontAnim {
  view: 'front';
  viewBox: [number, number, number, number];
  floorY: number;
  keyframes: { at: number; pose: FrontPose; label?: string }[];
  duration: number;
  caption?: string;
}

export type ExerciseAnim = SideAnim | FrontAnim;

const fk = (a: number, b = a): FkLimb => ({ a, b });
const ik = (x: number, y: number, bend: 1 | -1 = 1): IkLimb => ({ ik: [x, y], bend });
const kf = (at: number, pose: Pose, label?: string, ease: Keyframe['ease'] = 'inOut'): Keyframe => ({ at, pose, label, ease });

/* ---------------- pull-up ---------------- */

const BAR: Vec = [120, 22];
const hangPose = (legs: Partial<Pose> = {}): Pose => ({
  root: [124, 129],
  torso: 176,
  armN: ik(BAR[0] + 2, BAR[1], -1),
  armF: ik(BAR[0] - 2, BAR[1], -1),
  legN: fk(6, -45),
  legF: fk(2, -55),
  footN: 30,
  footF: 20,
  ...legs,
});
const pullTopPose = (legs: Partial<Pose> = {}): Pose => ({
  root: [109, 89],
  torso: 190,
  head: 176,
  armN: ik(BAR[0] + 2, BAR[1], -1),
  armF: ik(BAR[0] - 2, BAR[1], -1),
  legN: fk(12, -35),
  legF: fk(8, -45),
  footN: 40,
  footF: 30,
  ...legs,
});

const pullupClip: Clip = {
  duration: 4.2,
  keyframes: [
    kf(0, hangPose(), 'Explosive pull — chest to bar'),
    kf(1.0, pullTopPose(), 'Chin over bar'),
    kf(1.3, pullTopPose(), 'Lower under control ~2 s'),
    kf(3.4, hangPose(), 'Full dead hang'),
  ],
};

const halfRepPose: Pose = { ...hangPose(), root: [118, 108], torso: 182 };

/* ---------------- assisted pull-up ---------------- */

const bandHang = hangPose({ legN: fk(-10, -80), legF: fk(-5, -85), footN: -20, footF: -30 });
const bandTop = pullTopPose({ legN: fk(-2, -75), legF: fk(2, -80), footN: -10, footF: -20 });

/* ---------------- dip ---------------- */

const DIP_HAND: Vec = [122, 108];
const dipTop: Pose = {
  root: [113, 104],
  torso: 170,
  armN: ik(DIP_HAND[0], DIP_HAND[1], -1),
  armF: ik(DIP_HAND[0] - 2, DIP_HAND[1], -1),
  legN: fk(-8, -70),
  legF: fk(-14, -78),
  footN: -30,
  footF: -40,
};
const dipBottom: Pose = {
  ...dipTop,
  root: [106, 130],
  torso: 155,
  head: 160,
  legN: fk(-2, -62),
  legF: fk(-8, -70),
};
const dipTooDeep: Pose = { ...dipBottom, root: [110, 150], torso: 138, head: 140 };

/* ---------------- Bulgarian split squat ---------------- */

const BSS_FRONT: Vec = [142, 200];
const BSS_REAR: Vec = [70, 150];
const bssTop: Pose = {
  root: [124, 121],
  torso: 172,
  armN: fk(-2, 0),
  armF: fk(2, 2),
  legN: ik(BSS_FRONT[0], BSS_FRONT[1], 1),
  legF: ik(BSS_REAR[0], BSS_REAR[1], 1),
  footN: 90,
  footF: -95,
};
const bssBottom: Pose = {
  ...bssTop,
  root: [113, 157],
  torso: 166,
  armN: fk(-4, -2),
  armF: fk(0, 0),
};

/* ---------------- inverted row (face up, feet on box to the right) ---------------- */

const ROW_BAR: Vec = [70, 112];
const ROW_ANKLE: Vec = [204, 146];
const rowBottom: Pose = {
  root: [0, 0],
  anchor: { joint: 'ankleN', at: ROW_ANKLE },
  torso: -80,
  head: -80,
  armN: ik(ROW_BAR[0], ROW_BAR[1], -1),
  armF: ik(ROW_BAR[0] - 3, ROW_BAR[1], -1),
  legN: fk(100),
  legF: fk(100),
  footN: 172,
  footF: 168,
};
const rowTop: Pose = { ...rowBottom, torso: -96, head: -100, legN: fk(84), legF: fk(84) };
const rowSag: Pose = { ...rowBottom, torso: -92, legN: fk(112), legF: fk(112) };
const rowSagTop: Pose = { ...rowTop, torso: -106, legN: fk(96), legF: fk(96) };

/* ---------------- ab-wheel rollout ---------------- */

const KNEE: Vec = [88, 195];
const rolloutStart: Pose = {
  root: [0, 0],
  anchor: { joint: 'kneeN', at: KNEE },
  torso: 118,
  spine: 22,
  head: 110,
  armN: ik(150, 187, -1),
  armF: ik(148, 187, -1),
  legN: fk(-20, -92),
  legF: fk(-20, -92),
  footN: -150,
  footF: -150,
};
const rolloutOut: Pose = {
  ...rolloutStart,
  torso: 96,
  spine: 10,
  head: 98,
  armN: ik(222, 187, -1),
  armF: ik(220, 187, -1),
  legN: fk(-62, -92),
  legF: fk(-62, -92),
};
const rolloutSag: Pose = { ...rolloutOut, torso: 90, spine: -34, head: 104, legN: fk(-70, -92), legF: fk(-70, -92) };

/* ---------------- push-ups (face down, head to the right) ---------------- */

const PU_ANKLE: Vec = [40, 190];
const plank = (torso: number, hands: Vec, extra: Partial<Pose> = {}): Pose => ({
  root: [0, 0],
  anchor: { joint: 'ankleN', at: PU_ANKLE },
  torso,
  armN: ik(hands[0], hands[1], -1),
  armF: ik(hands[0] - 3, hands[1], -1),
  legN: fk(torso - 180),
  legF: fk(torso - 180),
  footN: 40,
  footF: 40,
  ...extra,
});
const PU_HANDS: Vec = [164, 197];
const pushupTop = plank(112, PU_HANDS);
const pushupBottom = plank(99, PU_HANDS);
const pushupSagTop = plank(114, PU_HANDS, { legN: fk(-58), legF: fk(-58), spine: -14 });
const pushupSagBottom = plank(102, PU_HANDS, { legN: fk(-72), legF: fk(-72), spine: -22 });

const DEF_HANDS: Vec = [160, 181];
const deficitTop = plank(118, DEF_HANDS);
const deficitBottom = plank(97, DEF_HANDS);

/* ---------------- pistol (box) ---------------- */

const PISTOL_FOOT: Vec = [122, 200];
const pistolTop: Pose = {
  root: [120, 119],
  torso: 178,
  armN: fk(80, 90),
  armF: fk(84, 92),
  legN: ik(PISTOL_FOOT[0], PISTOL_FOOT[1], 1),
  legF: fk(22, 22),
  footN: 90,
  footF: 110,
};
const pistolBottom: Pose = {
  ...pistolTop,
  root: [94, 157],
  torso: 146,
  head: 155,
  armN: fk(92, 96),
  armF: fk(96, 98),
  legF: fk(80, 82),
  footF: 150,
};
const pistolHeel: Pose = { ...pistolBottom, root: [100, 150], legN: ik(124, 192, 1), footN: 55 };

/* ---------------- step-up ---------------- */

const STEP_BOX = { x: 138, y: 150, w: 70, h: 50 };
const stepBottom: Pose = {
  root: [114, 118],
  torso: 166,
  armN: fk(-4, -2),
  armF: fk(4, 4),
  legN: ik(162, 146, 1),
  legF: ik(106, 199, 1),
  footN: 90,
  footF: 90,
};
const stepMid: Pose = { ...stepBottom, root: [140, 88], torso: 170, legF: ik(126, 150, 1), footF: 60 };
const stepTop: Pose = { ...stepBottom, root: [160, 68], torso: 178, legF: ik(154, 146, 1), footF: 90 };

/* ---------------- pike push-up ---------------- */

const PIKE_ANKLE: Vec = [40, 190];
const PIKE_HANDS: Vec = [138, 197];
const pikeTop: Pose = {
  root: [70, 112],
  torso: 39,
  armN: ik(PIKE_HANDS[0], PIKE_HANDS[1], -1),
  armF: ik(PIKE_HANDS[0] - 3, PIKE_HANDS[1], -1),
  legN: ik(PIKE_ANKLE[0], PIKE_ANKLE[1], -1),
  legF: ik(PIKE_ANKLE[0] - 2, PIKE_ANKLE[1], -1),
  footN: 40,
  footF: 40,
};
const pikeBottom: Pose = { ...pikeTop, root: [104, 140], torso: 53, head: 40 };
const pikeHipsDrop: Pose = { ...pikeTop, root: [96, 160], torso: 72, head: 66 };
const pikeHipsDropBottom: Pose = { ...pikeTop, root: [104, 172], torso: 82, head: 74 };

/* ---------------- hanging leg raise ---------------- */

const hlrHang: Pose = {
  root: [124, 129],
  torso: 179,
  armN: ik(122, 22, -1),
  armF: ik(118, 22, -1),
  legN: fk(2, 2),
  legF: fk(-2, -2),
  footN: 20,
  footF: 15,
};
const hlrTop: Pose = {
  ...hlrHang,
  root: [128, 126],
  torso: 172,
  spine: 12,
  legN: fk(90, 90),
  legF: fk(86, 86),
  footN: 170,
  footF: 165,
};
const swingBack: Pose = { ...hlrHang, root: [100, 128], torso: 196, legN: fk(-24, -30), legF: fk(-28, -34) };
const swingFront: Pose = { ...hlrTop, root: [138, 124], torso: 160, legN: fk(100, 100), legF: fk(96, 96) };

/* ---------------- rowing ---------------- */

const FOOT: Vec = [176, 162];
const HANDLE_BASE: Vec = [226, 150];
const rowPose = (pelvisX: number, torso: number, arms: FkLimb): Pose => ({
  root: [pelvisX, 160],
  torso,
  head: torso + (torso > 180 ? -10 : 10),
  armN: arms,
  armF: arms,
  legN: ik(FOOT[0], FOOT[1], 1),
  legF: ik(FOOT[0] - 2, FOOT[1], 1),
  footN: 150,
  footF: 150,
});
const armsStraight = fk(96, 96);
const armsIn = fk(-28, 78);
const catchPose = rowPose(128, 148, armsStraight);
const legsDown = rowPose(98, 148, armsStraight);
const bodyBack = rowPose(94, 198, fk(100, 100));
const finishPose = rowPose(94, 198, armsIn);
const recArms = rowPose(94, 198, fk(98, 98));
const recBody = rowPose(96, 148, armsStraight);
const earlyArms = rowPose(120, 152, fk(10, 88));

/* ---------------- joint circles ---------------- */

const stand = (armN: FkLimb, armF: FkLimb): Pose => ({
  root: [120, 119],
  torso: 180,
  armN,
  armF,
  legN: ik(124, 200, 1),
  legF: ik(116, 200, 1),
});

/* ---------------- archer push-up (front view) ---------------- */

const archer = (shift: number, depth: number): FrontPose => {
  const cx = 120 + shift * 24;
  const sy = 150 + depth * 30;
  return {
    shoulderL: [cx - 17, sy],
    shoulderR: [cx + 17, sy],
    handL: [74, 197],
    handR: [166, 197],
    head: [cx, sy - 6],
  };
};

/* ---------------- archer squat (front view) ---------------- */

const archerSquat = (shift: number, depth: number): FrontPose => {
  const cx = 120 + shift * 38;
  const hy = 129 + depth * 46;
  // The torso leans forward at the bottom, so it looks shorter from the front.
  const sy = hy - 52 + depth * 14;
  return {
    shoulderL: [cx - 17, sy],
    shoulderR: [cx + 17, sy],
    handL: [cx - 8, sy + 14],
    handR: [cx + 8, sy + 14],
    head: [cx, sy - 16],
    legs: { hipL: [cx - 10, hy], hipR: [cx + 10, hy], footL: [70, 200], footR: [170, 200] },
  };
};

export const ANIMS: Record<ExerciseId, ExerciseAnim> = {
  'joint-circles': {
    view: 'side',
    viewBox: [0, 20, 240, 190],
    props: [{ kind: 'floor', y: 200 }],
    clip: {
      duration: 3,
      keyframes: [
        kf(0, stand(fk(0), fk(180)), 'Big slow arm circles — then hips, knees, ankles, wrists', 'linear'),
        kf(1.5, stand(fk(180), fk(360)), 'Big slow arm circles — then hips, knees, ankles, wrists', 'linear'),
        kf(3, stand(fk(360), fk(540)), undefined, 'linear'),
      ],
    },
    faults: [],
  },
  pullup: {
    view: 'side',
    viewBox: [20, 0, 200, 230],
    props: [{ kind: 'bar', at: BAR }],
    clip: pullupClip,
    faults: [
      {
        id: 'half-reps',
        title: 'Half reps — not returning to a full hang',
        highlight: ['armN'],
        clip: {
          duration: 3.2,
          keyframes: [kf(0, halfRepPose, 'Stops short at the bottom'), kf(1.0, pullTopPose()), kf(1.3, pullTopPose()), kf(2.8, halfRepPose)],
        },
      },
    ],
  },
  'assisted-pullup': {
    view: 'side',
    viewBox: [20, 0, 200, 230],
    props: [
      { kind: 'bar', at: BAR },
      { kind: 'band', from: [BAR[0] - 3, BAR[1] + 3], joint: 'kneeN' },
      { kind: 'band', from: [BAR[0] + 3, BAR[1] + 3], joint: 'kneeN' },
    ],
    clip: {
      duration: 4.2,
      keyframes: [
        kf(0, bandHang, 'Pull — band helps at the bottom'),
        kf(1.0, bandTop, 'Chin over bar'),
        kf(1.3, bandTop, 'Lower ~2 s (negatives: 4–5 s)'),
        kf(3.4, bandHang, 'Full hang'),
      ],
    },
    faults: [],
  },
  dip: {
    view: 'side',
    viewBox: [20, 20, 200, 190],
    props: [
      { kind: 'floor', y: 200 },
      { kind: 'dipBar', at: [DIP_HAND[0], DIP_HAND[1] + 3], floorY: 200 },
    ],
    clip: {
      duration: 3.8,
      keyframes: [
        kf(0, dipTop, 'Lower ~2 s, slight forward lean'),
        kf(2.0, dipBottom, 'Upper arm ~parallel'),
        kf(2.2, dipBottom, 'Press up explosively'),
        kf(3.1, dipTop, 'Lock out, shoulders down'),
      ],
    },
    faults: [
      {
        id: 'too-deep',
        title: 'Sinking too deep — shoulders roll forward',
        highlight: ['torso', 'armN'],
        clip: {
          duration: 3.8,
          keyframes: [kf(0, dipTop), kf(2.0, dipTooDeep, 'Shoulder dives below elbow'), kf(2.3, dipTooDeep), kf(3.2, dipTop)],
        },
      },
    ],
  },
  'bulgarian-split-squat': {
    view: 'side',
    viewBox: [20, 20, 200, 190],
    props: [
      { kind: 'floor', y: 200 },
      { kind: 'box', x: 34, y: 156, w: 52, h: 44 },
      { kind: 'dumbbell', joint: 'wristN' },
    ],
    clip: {
      duration: 3.6,
      keyframes: [
        kf(0, bssTop, 'Lower ~2 s, back knee toward floor'),
        kf(2.0, bssBottom, 'Front thigh ~parallel'),
        kf(2.2, bssBottom, 'Drive up through front heel'),
        kf(3.1, bssTop, 'Stand tall'),
      ],
    },
    faults: [
      {
        id: 'short-stance',
        title: 'Stance too short — heel lifts, knee shoots forward',
        highlight: ['legN'],
        clip: {
          duration: 3.6,
          keyframes: [
            kf(0, { ...bssTop, root: [114, 122], legN: ik(122, 200, 1) }),
            kf(2.0, { ...bssBottom, root: [100, 158], legN: ik(128, 194, 1), footN: 58 }, 'Heel peels off the floor'),
            kf(2.3, { ...bssBottom, root: [100, 158], legN: ik(128, 194, 1), footN: 58 }),
            kf(3.1, { ...bssTop, root: [114, 122], legN: ik(122, 200, 1) }),
          ],
        },
      },
    ],
  },
  'inverted-row': {
    view: 'side',
    viewBox: [20, 60, 220, 150],
    props: [
      { kind: 'floor', y: 200 },
      { kind: 'bar', at: ROW_BAR },
      { kind: 'box', x: 186, y: 152, w: 44, h: 48 },
    ],
    clip: {
      duration: 3.8,
      keyframes: [
        kf(0, rowBottom, 'Pull chest to bar, body rigid'),
        kf(1.0, rowTop, 'Squeeze shoulder blades'),
        kf(1.5, rowTop, 'Lower ~2 s'),
        kf(3.4, rowBottom, 'Arms straight'),
      ],
    },
    faults: [
      {
        id: 'hip-sag',
        title: 'Hips sagging — body not rigid',
        highlight: ['torso', 'legN'],
        clip: {
          duration: 3.8,
          keyframes: [kf(0, rowSag, 'Hips drop toward floor'), kf(1.0, rowSagTop), kf(1.5, rowSagTop), kf(3.4, rowSag)],
        },
      },
    ],
  },
  'ab-wheel-rollout': {
    view: 'side',
    viewBox: [20, 90, 230, 120],
    props: [
      { kind: 'floor', y: 200 },
      { kind: 'wall', x: 240, floorY: 200 },
      { kind: 'wheel', joint: 'wristN', r: 10 },
    ],
    clip: {
      duration: 4.2,
      keyframes: [
        kf(0, rolloutStart, 'Roll out slowly — pelvis tucked, ribs down'),
        kf(2.2, rolloutOut, 'Stop before the back arches'),
        kf(2.5, rolloutOut, 'Pull back with the abs'),
        kf(3.6, rolloutStart, 'Reset'),
      ],
    },
    faults: [
      {
        id: 'low-back-sag',
        title: 'Low-back sag — hips drop, lower back arches',
        highlight: ['torso'],
        clip: {
          duration: 4.2,
          keyframes: [kf(0, rolloutStart), kf(2.2, rolloutSag, 'Lower back caves in'), kf(2.5, rolloutSag), kf(3.6, rolloutStart)],
        },
      },
    ],
  },
  pushup: {
    view: 'side',
    viewBox: [20, 90, 200, 120],
    props: [{ kind: 'floor', y: 200 }],
    clip: {
      duration: 3.6,
      keyframes: [
        kf(0, pushupTop, 'Lower ~2 s, elbows ~45°'),
        kf(2.0, pushupBottom, 'Chest near floor'),
        kf(2.2, pushupBottom, 'Press explosively'),
        kf(3.1, pushupTop, 'Body in one line'),
      ],
    },
    faults: [
      {
        id: 'hip-sag',
        title: 'Hips sagging — lower back arches',
        highlight: ['torso', 'legN'],
        clip: {
          duration: 3.6,
          keyframes: [kf(0, pushupSagTop, 'Hips drop first'), kf(2.0, pushupSagBottom), kf(2.2, pushupSagBottom), kf(3.1, pushupSagTop)],
        },
      },
    ],
  },
  'deficit-pushup': {
    view: 'side',
    viewBox: [20, 80, 200, 130],
    props: [
      { kind: 'floor', y: 200 },
      { kind: 'box', x: 150, y: 183, w: 22, h: 17 },
    ],
    clip: {
      duration: 3.6,
      keyframes: [
        kf(0, deficitTop, 'Lower ~2 s past hand level'),
        kf(2.0, deficitBottom, 'Deep stretch, shoulders stay down'),
        kf(2.2, deficitBottom, 'Press explosively'),
        kf(3.1, deficitTop, 'Body in one line'),
      ],
    },
    faults: [],
  },
  'archer-pushup': {
    view: 'front',
    viewBox: [20, 100, 200, 110],
    floorY: 200,
    duration: 6,
    caption: 'Front view',
    keyframes: [
      { at: 0, pose: archer(0, 0), label: 'Shift over one hand, lower ~2 s' },
      { at: 2, pose: archer(-1, 1), label: 'Other arm stays straight' },
      { at: 2.2, pose: archer(-1, 1), label: 'Press back to centre' },
      { at: 3, pose: archer(0, 0), label: 'Switch sides' },
      { at: 5, pose: archer(1, 1), label: 'Other arm stays straight' },
      { at: 5.2, pose: archer(1, 1), label: 'Press back to centre' },
    ],
  },
  'archer-squat': {
    view: 'front',
    viewBox: [20, 44, 200, 164],
    floorY: 200,
    duration: 6,
    caption: 'Front view',
    keyframes: [
      { at: 0, pose: archerSquat(0, 0), label: 'Wide stance, sit over one leg ~2 s' },
      { at: 2, pose: archerSquat(-1, 1), label: 'Other leg straight, foot flat' },
      { at: 2.2, pose: archerSquat(-1, 1), label: 'Drive up through the heel' },
      { at: 3, pose: archerSquat(0, 0), label: 'Switch sides' },
      { at: 5, pose: archerSquat(1, 1), label: 'Other leg straight, foot flat' },
      { at: 5.2, pose: archerSquat(1, 1), label: 'Drive up through the heel' },
    ],
  },
  'pistol-squat': {
    view: 'side',
    viewBox: [20, 20, 200, 190],
    props: [
      { kind: 'floor', y: 200 },
      { kind: 'box', x: 50, y: 168, w: 50, h: 32 },
    ],
    clip: {
      duration: 3.8,
      keyframes: [
        kf(0, pistolTop, 'Sit back ~2 s, arms forward'),
        kf(2.0, pistolBottom, 'Touch the box softly'),
        kf(2.3, pistolBottom, 'Drive up, heel down'),
        kf(3.2, pistolTop, 'Stand tall on one leg'),
      ],
    },
    faults: [
      {
        id: 'heel-lift',
        title: 'Heel lifts — weight rolls onto the toes',
        highlight: ['legN'],
        clip: {
          duration: 3.8,
          keyframes: [kf(0, pistolTop), kf(2.0, pistolHeel, 'Heel comes up'), kf(2.3, pistolHeel), kf(3.2, pistolTop)],
        },
      },
    ],
  },
  'step-up': {
    view: 'side',
    viewBox: [20, -14, 220, 224],
    props: [
      { kind: 'floor', y: 200 },
      { kind: 'box', ...STEP_BOX },
      { kind: 'backpack' },
    ],
    clip: {
      duration: 3.6,
      keyframes: [
        kf(0, stepBottom, 'Drive through the top leg'),
        kf(0.5, stepMid, undefined, 'out'),
        kf(1.0, stepTop, 'Stand tall on the box'),
        kf(1.3, stepTop, 'Lower ~2 s under control'),
        kf(2.6, stepMid),
        kf(3.2, stepBottom, 'Back foot taps down'),
      ],
    },
    faults: [],
  },
  'pike-pushup': {
    view: 'side',
    viewBox: [20, 80, 200, 130],
    props: [{ kind: 'floor', y: 200 }],
    clip: {
      duration: 3.6,
      keyframes: [
        kf(0, pikeTop, 'Hips high, lower head ~2 s'),
        kf(2.0, pikeBottom, 'Head to floor in front of hands'),
        kf(2.2, pikeBottom, 'Press up and back'),
        kf(3.1, pikeTop, 'Hips stay high'),
      ],
    },
    faults: [
      {
        id: 'hips-drop',
        title: 'Hips drop — becomes a regular push-up',
        highlight: ['torso'],
        clip: {
          duration: 3.6,
          keyframes: [kf(0, pikeHipsDrop, 'Shoulders shift over the hands'), kf(2.0, pikeHipsDropBottom), kf(2.2, pikeHipsDropBottom), kf(3.1, pikeHipsDrop)],
        },
      },
    ],
  },
  'hanging-leg-raise': {
    view: 'side',
    viewBox: [20, 0, 220, 230],
    props: [{ kind: 'bar', at: BAR }],
    clip: {
      duration: 4,
      keyframes: [
        kf(0, hlrHang, 'Lift — no swing'),
        kf(1.1, hlrTop, 'Legs to horizontal, pelvis tucks'),
        kf(1.4, hlrTop, 'Lower slowly ~2 s'),
        kf(3.4, hlrHang, 'Dead stop'),
      ],
    },
    faults: [
      {
        id: 'swing',
        title: 'Swinging — momentum does the work',
        highlight: ['torso', 'legN'],
        clip: {
          duration: 2.4,
          keyframes: [kf(0, swingBack, 'Kicks back to build swing'), kf(1.0, swingFront, 'Legs fly up'), kf(1.3, swingFront, 'Drops fast')],
        },
      },
    ],
  },
  'rowing-stroke': {
    view: 'side',
    viewBox: [10, 50, 230, 150],
    props: [{ kind: 'rower', railY: 172, x1: 30, x2: 236, footplate: FOOT, handleBase: HANDLE_BASE }],
    caption: 'Drive 1 : recovery 2',
    clip: {
      duration: 3.2,
      keyframes: [
        kf(0, catchPose, 'Drive: legs first', 'in'),
        kf(0.45, legsDown, '…then swing the body back', 'linear'),
        kf(0.75, bodyBack, '…then pull the arms', 'out'),
        kf(1.05, finishPose, 'Recovery: arms away', 'inOut'),
        kf(1.45, recArms, '…body pivots forward', 'inOut'),
        kf(1.9, recBody, '…then slide forward', 'inOut'),
        kf(2.9, catchPose, 'Catch: shins vertical'),
      ],
    },
    faults: [
      {
        id: 'arms-first',
        title: 'Arms pull before the legs finish',
        highlight: ['armN'],
        clip: {
          duration: 3.2,
          keyframes: [
            kf(0, catchPose, 'Arms bend at the catch'),
            kf(0.4, earlyArms, 'Legs push after the arms'),
            kf(0.9, finishPose),
            kf(1.4, recArms),
            kf(1.9, recBody),
            kf(2.9, catchPose),
          ],
        },
      },
    ],
  },
};
