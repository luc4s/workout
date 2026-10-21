import { Euler, Matrix4, Object3D, Quaternion, Vector3 } from 'three';
import { BONES, DIM, SKELETON, type Bone, type Side } from './body';
import type { ArmSpec, LegSpec, Pose, V3 } from './pose';

/*
 * Joint axes (figure faces +Z, left is +X, every limb bone points down −Y at rest):
 *   spine / chest: flex = +X rotation (forward), bend = −Z (to the left), twist = +Y (to the left)
 *   clavicle:      elev raises the shoulder, prot brings it forward
 *   shoulder/hip:  q = Rx(−flex) · Rz(±abd) · Ry(±rot)  (abd away from the midline, rot + = external)
 *   elbow:         Rx(−flex) (forearm forward)   knee: Rx(+flex) (shin backward)
 *   ankle:         Rx(−dorsiflexion)
 */

const D2R = Math.PI / 180;
const X = new Vector3(1, 0, 0);
const Y = new Vector3(0, 1, 0);
const Z = new Vector3(0, 0, 1);
const qAxis = (axis: Vector3, deg: number) => new Quaternion().setFromAxisAngle(axis, deg * D2R);
const sign = (s: Side) => (s === 'L' ? 1 : -1);

export type Rig = Record<Bone, Object3D>;

/** Build the bone hierarchy (no meshes) in its rest pose. */
export function createRig(): { root: Object3D; bones: Rig } {
  const bones = {} as Rig;
  for (const name of BONES) {
    const o = new Object3D();
    o.name = name;
    o.position.fromArray(SKELETON[name].offset);
    bones[name] = o;
  }
  for (const name of BONES) {
    const parent = SKELETON[name].parent;
    if (parent) bones[parent].add(bones[name]);
  }
  return { root: bones.hips, bones };
}

function spineQ(s?: { flex?: number; bend?: number; twist?: number }) {
  if (!s) return new Quaternion();
  return qAxis(Y, s.twist ?? 0)
    .multiply(qAxis(X, s.flex ?? 0))
    .multiply(qAxis(Z, -(s.bend ?? 0)));
}

function headQ(s?: { flex?: number; turn?: number; tilt?: number }) {
  if (!s) return new Quaternion();
  return qAxis(Y, s.turn ?? 0)
    .multiply(qAxis(X, s.flex ?? 0))
    .multiply(qAxis(Z, -(s.tilt ?? 0)));
}

function limbQ(side: Side, j?: { flex?: number; abd?: number; rot?: number }) {
  if (!j) return new Quaternion();
  const s = sign(side);
  return qAxis(X, -(j.flex ?? 0))
    .multiply(qAxis(Z, s * (j.abd ?? 0)))
    .multiply(qAxis(Y, s * (j.rot ?? 0)));
}

/** Pose the rig. Order: root, spine, head, clavicles, FK limbs, then IK limbs and hand / foot orientation. */
export function applyPose(rig: Rig, pose: Pose) {
  for (const b of BONES) rig[b].quaternion.identity();
  const hips = rig.hips;
  hips.position.fromArray(pose.root.pos);
  const r = pose.root.rot ?? [0, 0, 0];
  hips.quaternion.setFromEuler(new Euler(r[0] * D2R, r[1] * D2R, r[2] * D2R, 'YXZ'));
  rig.spine.quaternion.copy(spineQ(pose.lumbar));
  rig.chest.quaternion.copy(spineQ(pose.thorax));
  rig.neck.quaternion.copy(headQ(pose.neck));
  rig.head.quaternion.copy(headQ(pose.head));

  for (const side of ['L', 'R'] as const) {
    const a = pose.arm?.[side] ?? {};
    const s = sign(side);
    rig[`clavicle_${side}`].quaternion.copy(qAxis(Z, s * (a.clav?.elev ?? 0)).multiply(qAxis(Y, -s * (a.clav?.prot ?? 0))));
    rig[`upperArm_${side}`].quaternion.copy(limbQ(side, a.shoulder));
    rig[`forearm_${side}`].quaternion.copy(qAxis(X, -(a.elbow ?? 0)));
    const w = a.wrist;
    if (w) rig[`hand_${side}`].quaternion.copy(qAxis(Y, s * (w.rot ?? 0)).multiply(qAxis(Z, -s * (w.flex ?? 0))).multiply(qAxis(X, -(w.dev ?? 0))));

    const l = pose.leg?.[side] ?? {};
    rig[`thigh_${side}`].quaternion.copy(limbQ(side, l.hip));
    rig[`shin_${side}`].quaternion.copy(qAxis(X, l.knee ?? 0));
    rig[`foot_${side}`].quaternion.copy(qAxis(X, -(l.ankle ?? 0)));
  }
  hips.updateMatrixWorld(true);

  for (const side of ['L', 'R'] as const) {
    const a = pose.arm?.[side];
    if (a?.ik) solveArm(rig, side, a.ik, a.palm);
    if (a?.palm) setPalm(rig, side, a.palm);
    const l = pose.leg?.[side];
    if (l?.ik) solveLeg(rig, side, l.ik);
    if (l?.foot) setFoot(rig, side, l.foot);
  }
  hips.updateMatrixWorld(true);
}

/** World position of a bone's joint (its origin), or of a point in its local frame. */
export function worldOf(rig: Rig, bone: Bone, local: V3 = [0, 0, 0]): Vector3 {
  return rig[bone].localToWorld(new Vector3(...local));
}

/** The grip point (middle of the closed hand) in the hand's frame. */
export const GRIP_LOCAL: V3 = [0, -DIM.grip, 0];

function solveArm(rig: Rig, side: Side, ik: NonNullable<ArmSpec['ik']>, palm?: ArmSpec['palm']) {
  rig[`hand_${side}`].quaternion.identity();
  const target = new Vector3(...ik.target);
  if (palm) {
    // Flat hand: the target is the middle of the palm, so the wrist sits one grip length behind it.
    const h = palm.heading * D2R;
    target.sub(new Vector3(Math.sin(h), 0, Math.cos(h)).multiplyScalar(DIM.grip));
    twoBone(rig[`upperArm_${side}`], rig[`forearm_${side}`], DIM.upperArm, DIM.forearm, target, new Vector3(...ik.pole), 1);
  } else {
    twoBone(rig[`upperArm_${side}`], rig[`forearm_${side}`], DIM.upperArm, DIM.forearm + DIM.grip, target, new Vector3(...ik.pole), 1);
  }
}

function solveLeg(rig: Rig, side: Side, ik: NonNullable<LegSpec['ik']>) {
  twoBone(rig[`thigh_${side}`], rig[`shin_${side}`], DIM.thigh, DIM.shin, new Vector3(...ik.target), new Vector3(...ik.pole), -1);
}

/**
 * Analytic two-bone IK. `bend` = +1 when the lower bone flexes toward the upper bone's local +Z
 * (elbow), −1 when toward −Z (knee).
 */
function twoBone(upper: Object3D, lower: Object3D, a: number, b: number, target: Vector3, pole: Vector3, bend: 1 | -1) {
  upper.parent!.updateMatrixWorld(true);
  const S = upper.getWorldPosition(new Vector3());
  const toT = target.clone().sub(S);
  const d = Math.min(a + b - 1e-4, Math.max(Math.abs(a - b) + 1e-4, toT.length()));
  const dir = toT.normalize();
  const along = (a * a - b * b + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, a * a - along * along));
  const toPole = pole.clone().sub(S);
  const perp = toPole.sub(dir.clone().multiplyScalar(toPole.dot(dir)));
  if (perp.lengthSq() < 1e-10) perp.copy(new Vector3(0, 0, 1).cross(dir).cross(dir).negate());
  perp.normalize();
  const E = S.clone().add(dir.clone().multiplyScalar(along)).add(perp.clone().multiplyScalar(h));
  const T = S.clone().add(dir.clone().multiplyScalar(d));

  // Upper bone basis: local −Y along the bone, local Z toward the side the lower bone bends to (× bend).
  const down = E.clone().sub(S).normalize();
  const lowerDir = T.clone().sub(E).normalize();
  let zAxis = lowerDir.clone().sub(down.clone().multiplyScalar(lowerDir.dot(down)));
  if (zAxis.lengthSq() < 1e-10) zAxis = perp.clone().negate();
  zAxis.normalize().multiplyScalar(bend);
  if (h < 1e-6) zAxis.copy(perp).multiplyScalar(-bend); // straight limb: keep the bend plane facing the pole
  const yAxis = down.clone().negate();
  const xAxis = yAxis.clone().cross(zAxis).normalize();
  zAxis.copy(xAxis.clone().cross(yAxis)).normalize();
  setWorldQuat(upper, new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(xAxis, yAxis, zAxis)));

  const angle = Math.acos(Math.max(-1, Math.min(1, down.dot(lowerDir))));
  lower.quaternion.copy(qAxis(X, (-bend * angle) / D2R));
  lower.updateMatrixWorld(true);
}

function setWorldQuat(o: Object3D, world: Quaternion) {
  o.parent!.updateMatrixWorld(true);
  const parentWorld = o.parent!.getWorldQuaternion(new Quaternion());
  o.quaternion.copy(parentWorld.invert().multiply(world));
  o.updateMatrixWorld(true);
}

function setPalm(rig: Rig, side: Side, palm: NonNullable<ArmSpec['palm']>) {
  const h = palm.heading * D2R;
  const fingers = new Vector3(Math.sin(h), 0, Math.cos(h));
  // Hand frame: fingers along −Y; the palm faces −X on the left hand, +X on the right.
  const yAxis = fingers.clone().negate();
  const xAxis = new Vector3(0, sign(side) * (palm.up ? -1 : 1), 0);
  const zAxis = xAxis.clone().cross(yAxis).normalize();
  setWorldQuat(rig[`hand_${side}`], new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(xAxis, yAxis, zAxis)));
}

function setFoot(rig: Rig, side: Side, foot: NonNullable<LegSpec['foot']>) {
  const q = qAxis(Y, foot.heading)
    .multiply(qAxis(X, -(foot.pitch ?? 0)))
    .multiply(qAxis(Z, foot.roll ?? 0));
  setWorldQuat(rig[`foot_${side}`], q);
}
