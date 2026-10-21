import type { AnimationClip, Group, Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { ExerciseId } from '../data/types';
import type { AnimMeta } from './spec';

export interface LoadedAnim {
  /** Template scene; clone it per viewer. */
  scene: Group;
  clips: AnimationClip[];
  meta: AnimMeta;
}

const cache = new Map<ExerciseId, Promise<LoadedAnim>>();
const loader = new GLTFLoader();

export function animUrl(id: ExerciseId) {
  return `${import.meta.env.BASE_URL}anims/${id}.glb`;
}

export function loadAnim(id: ExerciseId): Promise<LoadedAnim> {
  let p = cache.get(id);
  if (!p) {
    p = loader.loadAsync(animUrl(id)).then((gltf) => {
      let meta: AnimMeta | undefined;
      gltf.scene.traverse((o: Object3D) => {
        if (o.userData?.anim) meta = o.userData.anim as AnimMeta;
      });
      if (!meta) throw new Error(`No animation metadata in ${id}.glb`);
      return { scene: gltf.scene, clips: gltf.animations, meta };
    });
    p.catch(() => cache.delete(id));
    cache.set(id, p);
  }
  return p;
}

/** Caption for clip time `t`. */
export function captionAt(meta: AnimMeta, clip: string, t: number): string | undefined {
  const list = meta.captions[clip] ?? [];
  let label: string | undefined;
  for (const c of list) if (t + 1e-6 >= c.at) label = c.label;
  return label ?? list[list.length - 1]?.label;
}
