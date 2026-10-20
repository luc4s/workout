import type { Side } from './body';

export type V3 = [number, number, number];

/** Joint angles in degrees, anatomical convention (see rig.ts for the exact axes). */
export interface ArmSpec {
  /** Shoulder-girdle: elevation (+ shrug, − depress) and protraction (+ forward, − retract). */
  clav?: { elev?: number; prot?: number };
  shoulder?: { flex?: number; abd?: number; rot?: number };
  elbow?: number;
  wrist?: { flex?: number; dev?: number; rot?: number };
  /** Place the grip point (middle of the closed hand) at a world point; the elbow points toward `pole`. */
  ik?: { target: V3; pole: V3 };
  /** Hand flat on a surface, fingers along `heading` (degrees, 0 = +Z, 90 = +X). */
  palm?: { heading: number; up?: boolean };
}

export interface LegSpec {
  hip?: { flex?: number; abd?: number; rot?: number };
  knee?: number;
  /** Ankle: + dorsiflexion (toes up), − plantarflexion. */
  ankle?: number;
  /** Place the ankle joint at a world point; the knee points toward `pole`. */
  ik?: { target: V3; pole: V3 };
  /** Foot orientation in the world: heading (deg, 0 = +Z) and pitch (+ toes up). */
  foot?: { heading: number; pitch?: number; roll?: number };
}

export interface Pose {
  root: { pos: V3; rot?: V3 };
  /** Lumbar and thoracic flexion (+ forward), lateral bend (+ to the left), twist (+ to the left). */
  lumbar?: { flex?: number; bend?: number; twist?: number };
  thorax?: { flex?: number; bend?: number; twist?: number };
  neck?: { flex?: number; turn?: number; tilt?: number };
  head?: { flex?: number; turn?: number; tilt?: number };
  arm?: Partial<Record<Side, ArmSpec>>;
  leg?: Partial<Record<Side, LegSpec>>;
}

export type Ease = 'inOut' | 'in' | 'out' | 'linear';

export interface Key {
  at: number;
  pose: Pose;
  /** Caption shown from this key until the next one. */
  label?: string;
  /** Easing of the move *from* this key to the next. */
  ease?: Ease;
}

export interface ClipSpec {
  duration: number;
  keys: Key[];
}

export function ease(t: number, kind: Ease = 'inOut'): number {
  switch (kind) {
    case 'linear':
      return t;
    case 'in':
      return t * t;
    case 'out':
      return 1 - (1 - t) * (1 - t);
    case 'inOut':
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }
}

/** Deep numeric interpolation between two poses with the same shape (missing values count as 0 / the other's value). */
export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  return lerpObj(a, b, t) as Pose;
}

function lerpObj(a: unknown, b: unknown, t: number): unknown {
  if (a === undefined) return b;
  if (b === undefined) return a;
  if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * t;
  if (Array.isArray(a) && Array.isArray(b)) return a.map((v, i) => lerpObj(v, b[i], t));
  if (typeof a === 'object' && typeof b === 'object' && a && b) {
    const out: Record<string, unknown> = {};
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      const av = (a as Record<string, unknown>)[k];
      const bv = (b as Record<string, unknown>)[k];
      // A number present on one side only interpolates from/to 0 (neutral joint angle).
      if (typeof av === 'number' && bv === undefined) out[k] = av * (1 - t);
      else if (av === undefined && typeof bv === 'number') out[k] = bv * t;
      else out[k] = lerpObj(av, bv, t);
    }
    return out;
  }
  return t < 0.5 ? a : b;
}

/** Pose and caption at time `t` (looping). */
export function sampleClip(clip: ClipSpec, t: number): { pose: Pose; label?: string } {
  const time = ((t % clip.duration) + clip.duration) % clip.duration;
  const ks = clip.keys;
  for (let i = 0; i < ks.length; i++) {
    const next = ks[i + 1] ?? { ...ks[0], at: clip.duration };
    if (time >= ks[i].at && time < next.at) {
      const u = (time - ks[i].at) / (next.at - ks[i].at || 1);
      return { pose: lerpPose(ks[i].pose, next.pose, ease(u, ks[i].ease)), label: ks[i].label ?? lastLabel(ks, i) };
    }
  }
  return { pose: ks[0].pose, label: ks[0].label };
}

function lastLabel(ks: Key[], i: number): string | undefined {
  for (let j = i; j >= 0; j--) if (ks[j].label) return ks[j].label;
  return undefined;
}

/** Mirror a pose left ↔ right (for alternating-side exercises). Root x and yaw/roll flip. */
export function mirror(p: Pose): Pose {
  const flipV = (v: V3): V3 => [-v[0], v[1], v[2]];
  const flipArm = (a?: ArmSpec): ArmSpec | undefined =>
    a && {
      ...a,
      ik: a.ik && { target: flipV(a.ik.target), pole: flipV(a.ik.pole) },
      palm: a.palm && { ...a.palm, heading: -a.palm.heading },
    };
  const flipLeg = (l?: LegSpec): LegSpec | undefined =>
    l && {
      ...l,
      ik: l.ik && { target: flipV(l.ik.target), pole: flipV(l.ik.pole) },
      foot: l.foot && { ...l.foot, heading: -l.foot.heading, roll: l.foot.roll !== undefined ? -l.foot.roll : undefined },
    };
  const flipSpine = <T extends { bend?: number; twist?: number; turn?: number; tilt?: number }>(s?: T): T | undefined =>
    s && { ...s, bend: s.bend !== undefined ? -s.bend : undefined, twist: s.twist !== undefined ? -s.twist : undefined, turn: s.turn !== undefined ? -s.turn : undefined, tilt: s.tilt !== undefined ? -s.tilt : undefined };
  const rot = p.root.rot ?? [0, 0, 0];
  return {
    root: { pos: flipV(p.root.pos), rot: [rot[0], -rot[1], -rot[2]] },
    lumbar: flipSpine(p.lumbar),
    thorax: flipSpine(p.thorax),
    neck: flipSpine(p.neck),
    head: flipSpine(p.head),
    arm: { L: flipArm(p.arm?.R), R: flipArm(p.arm?.L) },
    leg: { L: flipLeg(p.leg?.R), R: flipLeg(p.leg?.L) },
  };
}

/** Same spec for both sides, mirrored across the midline (IK targets get their x flipped). */
export function both<T extends ArmSpec | LegSpec>(left: T): Record<Side, T> {
  const flip = (v: V3): V3 => [-v[0], v[1], v[2]];
  const right = { ...left } as T;
  if (left.ik) (right as ArmSpec).ik = { target: flip(left.ik.target), pole: flip(left.ik.pole) };
  if ('palm' in left && left.palm) (right as ArmSpec).palm = { ...left.palm, heading: -left.palm.heading };
  if ('foot' in left && left.foot) (right as LegSpec).foot = { ...left.foot, heading: -left.foot.heading, roll: left.foot.roll !== undefined ? -left.foot.roll : undefined };
  return { L: left, R: right };
}

/** Hip-joint midpoint → shoulder-joint midpoint distance in the rest pose (no spine bend). */
export const TRUNK = 0.513;

/**
 * Root placement from world points: the hip-joint midpoint and the shoulder-joint midpoint
 * (sagittal plane), plus optional yaw / roll in degrees. The trunk length is fixed, so the
 * shoulder point only sets the direction.
 */
export function trunk(hip: V3, shoulder: V3, opts: { yaw?: number; roll?: number } = {}): Pose['root'] {
  const dy = shoulder[1] - hip[1];
  const dz = shoulder[2] - hip[2];
  const pitch = (Math.atan2(dz, dy) * 180) / Math.PI;
  return { pos: hip, rot: [pitch, opts.yaw ?? 0, opts.roll ?? 0] };
}
