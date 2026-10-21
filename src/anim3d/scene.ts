import {
  AnimationClip,
  Box3,
  BoxGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  QuaternionKeyframeTrack,
  SphereGeometry,
  Vector3,
  VectorKeyframeTrack,
  type BufferGeometry,
} from 'three';
import { BONES, DIM, type Bone } from './body';
import { sampleClip, type ClipSpec, type V3 } from './pose';
import { applyPose, createRig, GRIP_LOCAL, worldOf, type Rig } from './rig';

export const BODY_MATERIAL = 'body';
export const PROP_MATERIAL = 'prop';

/** Static or moving equipment. Moving props are baked into the clip like bones. */
export type PropSpec =
  | { kind: 'floor' }
  | { kind: 'bar'; at: V3; length?: number; posts?: boolean }
  | { kind: 'dipBars'; y: number; halfWidth: number; z: [number, number] }
  | { kind: 'box'; center: V3; size: V3 }
  | { kind: 'held'; shape: 'dumbbell'; bone: Bone; offset?: V3; rot?: V3 }
  /** Held in both hands: follows the midpoint of the two grips, stays level. */
  | { kind: 'twoHands'; shape: 'wheel' | 'handle'; offset?: V3 }
  | { kind: 'backpack' }
  /** Elastic / chain between a fixed point and a point on a bone. */
  | { kind: 'strap'; name: string; from: V3; to: { bone: Bone; offset?: V3 } | 'hands'; radius?: number }
  /** Rower: rail, flywheel housing, footplate, and a seat that slides with the hips. */
  | { kind: 'rower'; railY: number; z: [number, number]; footplate: V3 };

const bodyMat = () => new MeshStandardMaterial({ name: BODY_MATERIAL, color: 0xb9c2d0, roughness: 0.55, metalness: 0 });
const propMat = () => new MeshStandardMaterial({ name: PROP_MATERIAL, color: 0x6b7280, roughness: 0.6, metalness: 0.2 });

// Low-poly is plenty with smooth shading; UVs are dropped (no textures) to keep the glb small.
function lean(g: BufferGeometry): BufferGeometry {
  g.deleteAttribute('uv');
  return g;
}
// Identical pieces (left / right limbs) share one geometry, which the exporter writes once.
const cache = new Map<string, BufferGeometry>();
function cached(key: string, make: () => BufferGeometry): BufferGeometry {
  if (!cache.has(key)) cache.set(key, lean(make()));
  return cache.get(key)!;
}
function capsule(r: number, length: number, from = 0): BufferGeometry {
  return cached(`c${r},${length},${from}`, () => {
    const g = new CapsuleGeometry(r, Math.max(0.001, length - 2 * r), 4, 12);
    return g.translate(0, from - length / 2, 0);
  });
}
function ellipsoid(rx: number, ry: number, rz: number, c: V3 = [0, 0, 0]): BufferGeometry {
  return cached(`e${rx},${ry},${rz},${c}`, () => new SphereGeometry(1, 16, 10).scale(rx, ry, rz).translate(...c));
}

/** Capsule between two points of a bone's frame. */
function seg(r: number, a: V3, b: V3): BufferGeometry {
  return cached(`s${r},${a},${b}`, () => {
    const va = new Vector3(...a);
    const vb = new Vector3(...b);
    const len = va.distanceTo(vb);
    const g = new CapsuleGeometry(r, Math.max(0.001, len - 2 * r), 4, 12);
    g.translate(0, len / 2, 0);
    g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), vb.clone().sub(va).normalize()));
    return g.translate(...a);
  });
}

/** Body pieces per bone, in the bone's frame. */
function bodyPieces(): Partial<Record<Bone, BufferGeometry[]>> {
  const foot = (DIM.footFwd + DIM.footBack) / 2;
  const limbs: Partial<Record<Bone, BufferGeometry[]>> = {
    hips: [ellipsoid(0.16, 0.1, 0.1, [0, 0.02, -0.005])],
    spine: [ellipsoid(0.14, 0.12, 0.095, [0, 0.07, 0])],
    chest: [ellipsoid(0.165, 0.165, 0.105, [0, 0.09, 0.005])],
    neck: [capsule(0.045, 0.1, 0.06)],
    head: [ellipsoid(0.08, 0.105, 0.095, [0, 0.1, 0.01]), ellipsoid(0.018, 0.025, 0.02, [0, 0.09, 0.105])],
  };
  for (const s of ['L', 'R'] as const) {
    const sx = s === 'L' ? 1 : -1;
    limbs[`clavicle_${s}`] = [seg(0.05, [0, 0, 0], [sx * (DIM.shoulderX - 0.04), 0.012, -0.01])];
    limbs[`upperArm_${s}`] = [ellipsoid(0.066, 0.07, 0.066, [0, -0.01, 0]), capsule(0.048, DIM.upperArm + 0.02, 0.01)];
    limbs[`forearm_${s}`] = [capsule(0.04, DIM.forearm + 0.02, 0.01)];
    limbs[`hand_${s}`] = [ellipsoid(0.03, 0.065, 0.046, [0, -0.068, 0])];
    limbs[`thigh_${s}`] = [capsule(0.072, DIM.thigh + 0.04, 0.02)];
    limbs[`shin_${s}`] = [capsule(0.05, DIM.shin + 0.03, 0.015)];
    limbs[`foot_${s}`] = [ellipsoid(0.045, 0.034, foot, [0, -DIM.ankleY + 0.034, DIM.footFwd - foot])];
  }
  return limbs;
}

function propMeshes(p: PropSpec, mat: MeshStandardMaterial): { node: Object3D; parent?: Bone } {
  const g = new Group();
  const add = (geo: BufferGeometry, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0]) => {
    const m = new Mesh(lean(geo), mat);
    m.position.fromArray(pos);
    m.rotation.set(rot[0], rot[1], rot[2]);
    g.add(m);
    return m;
  };
  switch (p.kind) {
    case 'floor': {
      g.name = 'p_floor';
      add(new CylinderGeometry(6, 6, 0.01, 64), [0, -0.005, 0]).name = 'p_floor-disc';
      return { node: g };
    }
    case 'bar': {
      g.name = 'p_bar';
      const len = p.length ?? 1.1;
      add(new CylinderGeometry(0.016, 0.016, len, 16), p.at, [0, 0, Math.PI / 2]);
      if (p.posts) {
        for (const sx of [-1, 1]) add(new CylinderGeometry(0.025, 0.025, p.at[1], 12), [p.at[0] + (sx * len) / 2, p.at[1] / 2, p.at[2]]);
      }
      return { node: g };
    }
    case 'dipBars': {
      g.name = 'p_dipBars';
      const len = p.z[1] - p.z[0];
      const zc = (p.z[0] + p.z[1]) / 2;
      for (const sx of [-1, 1]) {
        add(new CylinderGeometry(0.022, 0.022, len, 16), [sx * p.halfWidth, p.y, zc], [Math.PI / 2, 0, 0]);
        for (const z of p.z) add(new CylinderGeometry(0.025, 0.025, p.y, 12), [sx * p.halfWidth, p.y / 2, z]);
      }
      return { node: g };
    }
    case 'box': {
      g.name = 'p_box';
      add(new BoxGeometry(...p.size), p.center);
      return { node: g };
    }
    case 'held': {
      g.name = `p_${p.shape}`;
      const o = p.offset ?? [0, 0, 0];
      add(new CylinderGeometry(0.014, 0.014, 0.14, 10), o, [Math.PI / 2, 0, 0]);
      for (const dz of [-0.07, 0.07]) add(new CylinderGeometry(0.045, 0.045, 0.04, 16), [o[0], o[1], o[2] + dz], [Math.PI / 2, 0, 0]);
      if (p.rot) g.rotation.set(p.rot[0], p.rot[1], p.rot[2]);
      return { node: g, parent: p.bone };
    }
    case 'twoHands': {
      g.name = `p_${p.shape}`;
      const o = p.offset ?? [0, 0, 0];
      if (p.shape === 'wheel') {
        add(new CylinderGeometry(0.09, 0.09, 0.07, 28), o, [0, 0, Math.PI / 2]);
        add(new CylinderGeometry(0.014, 0.014, 0.34, 10), o, [0, 0, Math.PI / 2]);
      } else {
        add(new CylinderGeometry(0.016, 0.016, 0.42, 10), o, [0, 0, Math.PI / 2]);
      }
      return { node: g };
    }
    case 'backpack': {
      g.name = 'p_backpack';
      add(new BoxGeometry(0.3, 0.38, 0.16), [0, 0.12, -0.2]);
      return { node: g, parent: 'chest' };
    }
    case 'strap': {
      g.name = `p_${p.name}`;
      // Unit-length cylinder along +Y from the origin; the bake positions, aims and scales it.
      const geo = new CylinderGeometry(p.radius ?? 0.012, p.radius ?? 0.012, 1, 8);
      geo.translate(0, 0.5, 0);
      add(geo);
      return { node: g };
    }
    case 'rower': {
      g.name = 'p_rower';
      const len = p.z[1] - p.z[0];
      add(new BoxGeometry(0.08, 0.05, len), [0, p.railY - 0.04, (p.z[0] + p.z[1]) / 2]);
      add(new BoxGeometry(0.34, 0.36, 0.3), [0, 0.5, p.z[1] + 0.12]);
      add(new BoxGeometry(0.34, 0.03, 0.22), p.footplate, [-Math.PI / 4, 0, 0]);
      for (const z of p.z) add(new BoxGeometry(0.06, p.railY, 0.06), [0, p.railY / 2 - 0.03, z]);
      return { node: g };
    }
  }
}

/** Midpoint of the two grip points. */
export function handsMid(rig: Rig): Vector3 {
  return worldOf(rig, 'hand_L', GRIP_LOCAL).add(worldOf(rig, 'hand_R', GRIP_LOCAL)).multiplyScalar(0.5);
}

export interface BuiltScene {
  scene: Group;
  rig: Rig;
  /** Props whose transform is baked per frame. */
  moving: { node: Object3D; update: (rig: Rig) => void }[];
}

export function buildScene(props: PropSpec[]): BuiltScene {
  const scene = new Group();
  scene.name = 'exercise';
  const { root, bones } = createRig();
  scene.add(root);
  const bm = bodyMat();
  const pieces = bodyPieces();
  for (const b of BONES) {
    (pieces[b] ?? []).forEach((geo, i) => {
      const m = new Mesh(geo, bm);
      m.name = `m_${b}_${i}`;
      bones[b].add(m);
    });
  }
  const pm = propMat();
  const moving: BuiltScene['moving'] = [];
  for (const p of props) {
    const { node, parent } = propMeshes(p, pm);
    if (parent) bones[parent].add(node);
    else scene.add(node);
    if (p.kind === 'twoHands') {
      moving.push({ node, update: (rig) => node.position.copy(handsMid(rig)) });
    }
    if (p.kind === 'strap') {
      const from = new Vector3(...p.from);
      const target = p.to;
      moving.push({
        node,
        update: (rig) => {
          const to = target === 'hands' ? handsMid(rig) : worldOf(rig, target.bone, target.offset);
          const d = to.clone().sub(from);
          node.position.copy(from);
          node.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), d.clone().normalize());
          node.scale.set(1, Math.max(0.001, d.length()), 1);
        },
      });
    }
    if (p.kind === 'rower') {
      const seat = new Mesh(lean(new BoxGeometry(0.28, 0.05, 0.3)), pm);
      const seatNode = new Group();
      seatNode.name = 'p_seat';
      seatNode.add(seat);
      scene.add(seatNode);
      moving.push({
        node: seatNode,
        update: (rig) => {
          const hip = worldOf(rig, 'hips');
          seatNode.position.set(0, p.railY + 0.02, hip.z);
        },
      });
    }
  }
  return { scene, rig: bones, moving };
}

const FPS = 15;

/** Sample a clip into keyframe tracks for every bone and moving prop. */
export function bakeClip(name: string, spec: ClipSpec, built: BuiltScene): { clip: AnimationClip; bounds: Box3 } {
  const n = Math.max(2, Math.round(spec.duration * FPS) + 1);
  const times: number[] = [];
  const quats: Record<string, number[]> = {};
  const hipPos: number[] = [];
  const movPos: number[][] = built.moving.map(() => []);
  const movQuat: number[][] = built.moving.map(() => []);
  const movScale: number[][] = built.moving.map(() => []);
  const bounds = new Box3();
  for (const b of BONES) quats[b] = [];
  for (let i = 0; i < n; i++) {
    const t = (spec.duration * i) / (n - 1);
    times.push(t);
    applyPose(built.rig, sampleClip(spec, i === n - 1 ? 0 : t).pose);
    for (const b of BONES) {
      const q = built.rig[b].quaternion;
      // Keep consecutive quaternions in the same hemisphere so slerp takes the short way.
      const arr = quats[b];
      const prev = arr.length ? new Quaternion(arr[arr.length - 4], arr[arr.length - 3], arr[arr.length - 2], arr[arr.length - 1]) : undefined;
      if (prev && prev.dot(q) < 0) arr.push(-q.x, -q.y, -q.z, -q.w);
      else arr.push(q.x, q.y, q.z, q.w);
      bounds.expandByPoint(worldOf(built.rig, b));
    }
    bounds.expandByPoint(worldOf(built.rig, 'head', [0, 0.21, 0]));
    hipPos.push(...built.rig.hips.position.toArray());
    built.moving.forEach((m, k) => {
      m.update(built.rig);
      movPos[k].push(...m.node.position.toArray());
      movQuat[k].push(...m.node.quaternion.toArray());
      movScale[k].push(...m.node.scale.toArray());
    });
  }
  const tracks = [
    new VectorKeyframeTrack('hips.position', times, hipPos),
    ...BONES.map((b) => new QuaternionKeyframeTrack(`${b}.quaternion`, times, quats[b])),
    ...built.moving.flatMap((m, k) => [
      new VectorKeyframeTrack(`${m.node.name}.position`, times, movPos[k]),
      new QuaternionKeyframeTrack(`${m.node.name}.quaternion`, times, movQuat[k]),
      new VectorKeyframeTrack(`${m.node.name}.scale`, times, movScale[k]),
    ]),
  ];
  return { clip: new AnimationClip(name, spec.duration, tracks), bounds };
}
