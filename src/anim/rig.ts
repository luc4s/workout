/**
 * 2D side-view stick-figure rig. The figure faces +x (right); y grows downward.
 *
 * Angles are global, in degrees, measured from straight down:
 *   0 = pointing down, 90 = pointing forward (+x), 180 = up, -90 = backward.
 *
 * Limbs are either forward kinematics (upper/lower segment angles) or
 * two-bone IK (world target for the wrist/ankle + bend direction).
 */

export type Vec = [number, number];

export const SEG = {
  torso: 52,
  neck: 7,
  headR: 9,
  upperArm: 29,
  forearm: 27,
  thigh: 42,
  shin: 40,
  foot: 13,
};

export interface FkLimb {
  a: number;
  b: number;
}

export interface IkLimb {
  ik: Vec;
  /**
   * +1 puts the joint on the +x side when the chain points down (knee forward);
   * when the chain points up (hanging from a bar), +1 puts it on the −x side.
   */
  bend: 1 | -1;
}

export type Limb = FkLimb | IkLimb;

export type LimbName = 'armN' | 'armF' | 'legN' | 'legF';

export type JointName =
  | 'pelvis'
  | 'waist'
  | 'shoulder'
  | 'neck'
  | 'head'
  | 'elbowN'
  | 'wristN'
  | 'elbowF'
  | 'wristF'
  | 'kneeN'
  | 'ankleN'
  | 'toeN'
  | 'kneeF'
  | 'ankleF'
  | 'toeF';

export interface Pose {
  root: Vec;
  torso: number;
  /** Degrees of bend between lower and upper spine (+ = rounded forward, − = arched/sagging). */
  spine?: number;
  /** Head angle, global; defaults to torso direction. */
  head?: number;
  armN: Limb;
  armF: Limb;
  legN: Limb;
  legF: Limb;
  footN?: number;
  footF?: number;
  /** Translate the figure so this (FK-computed) joint lands on the given point. */
  anchor?: { joint: JointName; at: Vec };
}

export type Joints = Record<JointName, Vec>;

const rad = (deg: number) => (deg * Math.PI) / 180;
const dir = (deg: number, len: number): Vec => [Math.sin(rad(deg)) * len, Math.cos(rad(deg)) * len];
const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1]];
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1]];

export const isIk = (l: Limb): l is IkLimb => 'ik' in l;

function fkChain(start: Vec, limb: FkLimb, l1: number, l2: number): [Vec, Vec] {
  const mid = add(start, dir(limb.a, l1));
  return [mid, add(mid, dir(limb.b, l2))];
}

function ikChain(start: Vec, limb: IkLimb, l1: number, l2: number): [Vec, Vec] {
  const d = sub(limb.ik, start);
  const distRaw = Math.hypot(d[0], d[1]);
  const dist = Math.max(Math.abs(l1 - l2) + 0.001, Math.min(l1 + l2 - 0.001, distRaw));
  const ux = d[0] / (distRaw || 1);
  const uy = d[1] / (distRaw || 1);
  // Law of cosines: distance along the start→target line to the joint's projection
  const along = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  // bend +1: joint on the side that is +x when the chain points down (rotates continuously with the chain)
  const px = uy * limb.bend;
  const py = -ux * limb.bend;
  const mid: Vec = [start[0] + ux * along + px * h, start[1] + uy * along + py * h];
  const end: Vec = [start[0] + ux * dist, start[1] + uy * dist];
  return [mid, end];
}

export function solve(pose: Pose): Joints {
  const spine = pose.spine ?? 0;
  const half = SEG.torso / 2;
  const build = (root: Vec) => {
    const waist = add(root, dir(pose.torso + spine / 2, half));
    const shoulder = add(waist, dir(pose.torso - spine / 2, half));
    const headDeg = pose.head ?? pose.torso - spine / 2;
    const neck = add(shoulder, dir(headDeg, SEG.neck));
    const head = add(neck, dir(headDeg, SEG.headR));
    return { pelvis: root, waist, shoulder, neck, head };
  };

  let core = build(pose.root);
  const fk = (name: LimbName, from: Vec) => {
    const limb = pose[name];
    if (isIk(limb)) return undefined;
    return name.startsWith('arm')
      ? fkChain(from, limb, SEG.upperArm, SEG.forearm)
      : fkChain(from, limb, SEG.thigh, SEG.shin);
  };

  if (pose.anchor) {
    const map: Partial<Record<JointName, Vec | undefined>> = { ...core };
    const legN = fk('legN', core.pelvis);
    const legF = fk('legF', core.pelvis);
    const armN = fk('armN', core.shoulder);
    const armF = fk('armF', core.shoulder);
    if (legN) [map.kneeN, map.ankleN] = legN;
    if (legF) [map.kneeF, map.ankleF] = legF;
    if (armN) [map.elbowN, map.wristN] = armN;
    if (armF) [map.elbowF, map.wristF] = armF;
    const p = map[pose.anchor.joint];
    if (p) core = build(add(pose.root, sub(pose.anchor.at, p)));
  }

  const limb = (name: LimbName, from: Vec, l1: number, l2: number): [Vec, Vec] => {
    const l = pose[name];
    return isIk(l) ? ikChain(from, l, l1, l2) : fkChain(from, l, l1, l2);
  };
  const [elbowN, wristN] = limb('armN', core.shoulder, SEG.upperArm, SEG.forearm);
  const [elbowF, wristF] = limb('armF', core.shoulder, SEG.upperArm, SEG.forearm);
  const [kneeN, ankleN] = limb('legN', core.pelvis, SEG.thigh, SEG.shin);
  const [kneeF, ankleF] = limb('legF', core.pelvis, SEG.thigh, SEG.shin);
  const toeN = add(ankleN, dir(pose.footN ?? 90, SEG.foot));
  const toeF = add(ankleF, dir(pose.footF ?? 90, SEG.foot));

  return { ...core, elbowN, wristN, elbowF, wristF, kneeN, ankleN, toeN, kneeF, ankleF, toeF };
}

/* ---------- interpolation ---------- */

export type Ease = 'inOut' | 'in' | 'out' | 'linear';

export const easeFns: Record<Ease, (t: number) => number> = {
  linear: (t) => t,
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpV = (a: Vec, b: Vec, t: number): Vec => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];

function lerpLimb(a: Limb, b: Limb, t: number): Limb {
  if (isIk(a) && isIk(b)) return { ik: lerpV(a.ik, b.ik, t), bend: t < 0.5 ? a.bend : b.bend };
  if (!isIk(a) && !isIk(b)) return { a: lerp(a.a, b.a, t), b: lerp(a.b, b.b, t) };
  return t < 0.5 ? a : b;
}

const opt = (a: number | undefined, b: number | undefined, t: number, fallback: number) =>
  a === undefined && b === undefined ? undefined : lerp(a ?? fallback, b ?? fallback, t);

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  return {
    root: lerpV(a.root, b.root, t),
    torso: lerp(a.torso, b.torso, t),
    spine: opt(a.spine, b.spine, t, 0),
    head: opt(a.head, b.head, t, lerp(a.torso, b.torso, t)),
    armN: lerpLimb(a.armN, b.armN, t),
    armF: lerpLimb(a.armF, b.armF, t),
    legN: lerpLimb(a.legN, b.legN, t),
    legF: lerpLimb(a.legF, b.legF, t),
    footN: opt(a.footN, b.footN, t, 90),
    footF: opt(a.footF, b.footF, t, 90),
    anchor:
      a.anchor && b.anchor && a.anchor.joint === b.anchor.joint
        ? { joint: a.anchor.joint, at: lerpV(a.anchor.at, b.anchor.at, t) }
        : t < 0.5
          ? a.anchor
          : b.anchor,
  };
}

export interface Keyframe {
  /** Seconds from the start of the loop. */
  at: number;
  pose: Pose;
  /** Easing used when travelling from this keyframe to the next. */
  ease?: Ease;
  /** Phase label shown while travelling from this keyframe. */
  label?: string;
}

export interface Clip {
  duration: number;
  keyframes: Keyframe[];
}

/** Pose at time `t` (seconds). The clip loops back to its first keyframe at `duration`. */
export function sampleClip(clip: Clip, t: number): { pose: Pose; label?: string } {
  const { keyframes, duration } = clip;
  const time = ((t % duration) + duration) % duration;
  for (let i = 0; i < keyframes.length; i++) {
    const k = keyframes[i];
    const next = keyframes[i + 1] ?? { ...keyframes[0], at: duration };
    if (time >= k.at && time < next.at) {
      const span = next.at - k.at;
      const local = span > 0 ? (time - k.at) / span : 0;
      return { pose: lerpPose(k.pose, next.pose, easeFns[k.ease ?? 'inOut'](local)), label: k.label };
    }
  }
  return { pose: keyframes[0].pose, label: keyframes[0].label };
}
