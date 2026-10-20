import {
  AnimationMixer,
  Color,
  DirectionalLight,
  HemisphereLight,
  LoopRepeat,
  Mesh,
  MeshStandardMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type AnimationAction,
  type Object3D,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { ExerciseId } from '../data/types';
import { loadAnim, type LoadedAnim } from './load';
import type { ViewName } from './spec';

export interface Palette {
  body: string;
  prop: string;
  floor: string;
  fault: string;
}

/** Colours from the CSS theme tokens, so the figure follows light / dark mode. */
export function cssPalette(el: Element): Palette {
  const cs = getComputedStyle(el);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    body: v('--fig3d-body', '#6b7a99'),
    prop: v('--fig3d-prop', '#8a8f98'),
    floor: v('--fig3d-floor', '#d9d8d2'),
    fault: v('--fig-fault', '#d03b3b'),
  };
}

const VIEW_DIR: Record<ViewName, Vector3> = {
  side: new Vector3(1, 0.12, 0.02).normalize(),
  front: new Vector3(0.02, 0.15, 1).normalize(),
  threeQuarter: new Vector3(0.78, 0.28, 0.62).normalize(),
};
const FOV = 32;

/** One exercise scene with its own camera; rendered by whichever renderer you pass in. */
export class ExerciseStage {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(FOV, 4 / 3, 0.05, 30);
  readonly mixer: AnimationMixer;
  private root: Object3D;
  private actions = new Map<string, AnimationAction>();
  private current?: AnimationAction;
  private bodyMat: MeshStandardMaterial;
  private faultMat: MeshStandardMaterial;
  private bodyMeshes = new Map<string, Mesh[]>();
  view: ViewName;

  constructor(
    readonly anim: LoadedAnim,
    palette: Palette,
  ) {
    this.view = anim.meta.view;
    this.root = anim.scene.clone(true);
    this.scene.add(this.root);
    this.bodyMat = new MeshStandardMaterial({ color: new Color(palette.body), roughness: 0.55 });
    this.faultMat = new MeshStandardMaterial({ color: new Color(palette.fault), roughness: 0.5 });
    const propMat = new MeshStandardMaterial({ color: new Color(palette.prop), roughness: 0.6, metalness: 0.2 });
    const floorMat = new MeshStandardMaterial({ color: new Color(palette.floor), roughness: 1 });
    this.root.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      const bodyBone = /^m_(.+)_\d+$/.exec(o.name)?.[1] ?? (o.parent && /^m_(.+)_\d+$/.exec(o.parent.name)?.[1]);
      if (bodyBone) {
        o.material = this.bodyMat;
        o.castShadow = true;
        if (!this.bodyMeshes.has(bodyBone)) this.bodyMeshes.set(bodyBone, []);
        this.bodyMeshes.get(bodyBone)!.push(o);
      } else if (o.name === 'p_floor-disc' || o.parent?.name === 'p_floor') {
        o.material = floorMat;
        o.receiveShadow = true;
      } else {
        o.material = propMat;
        o.castShadow = true;
      }
    });
    this.scene.add(new HemisphereLight(0xffffff, 0x8a8a8a, 1.6));
    const sun = new DirectionalLight(0xffffff, 1.8);
    const c = new Vector3(...anim.meta.frame.center);
    sun.position.copy(c).add(new Vector3(1.2, 3.5, 2.2));
    sun.target.position.copy(c);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const r = anim.meta.frame.radius + 0.5;
    Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 0.5, far: 10 });
    sun.shadow.bias = -0.0005;
    this.scene.add(sun, sun.target);

    this.mixer = new AnimationMixer(this.root);
    for (const clip of anim.clips) {
      const a = this.mixer.clipAction(clip);
      a.setLoop(LoopRepeat, Infinity);
      this.actions.set(clip.name, a);
    }
    this.setClip('main');
    this.setView(this.view);
  }

  get clipName(): string {
    return this.current?.getClip().name ?? 'main';
  }

  get duration(): number {
    return this.current?.getClip().duration ?? 1;
  }

  get time(): number {
    return this.current?.time ?? 0;
  }

  setClip(name: string) {
    const next = this.actions.get(name) ?? this.actions.get('main');
    if (!next || next === this.current) return;
    this.current?.stop();
    next.reset().play();
    this.current = next;
    this.mixer.update(0);
    const fault = this.anim.meta.faults.find((f) => `fault:${f.id}` === name);
    const hl = new Set<string>(fault?.highlight ?? []);
    for (const [bone, meshes] of this.bodyMeshes) for (const m of meshes) m.material = hl.has(bone) ? this.faultMat : this.bodyMat;
  }

  setTime(t: number) {
    if (!this.current) return;
    this.current.time = ((t % this.duration) + this.duration) % this.duration;
    this.mixer.update(0);
  }

  advance(dt: number) {
    this.mixer.update(dt);
  }

  setAspect(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Distance at which the clip's bounding sphere fits the view. */
  fitDistance(): number {
    const vfov = (FOV * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    return this.anim.meta.frame.radius / Math.sin(Math.min(vfov, hfov) / 2);
  }

  /** Keep the viewing direction but re-fit the distance (after a resize). */
  refit(target: Vector3) {
    const dir = this.camera.position.clone().sub(target).normalize();
    this.camera.position.copy(target).add(dir.multiplyScalar(this.fitDistance()));
  }

  setView(view: ViewName) {
    this.view = view;
    const c = new Vector3(...this.anim.meta.frame.center);
    this.camera.position.copy(c).add(VIEW_DIR[view].clone().multiplyScalar(this.fitDistance()));
    this.camera.lookAt(c);
  }

  dispose() {
    this.mixer.stopAllAction();
    this.bodyMat.dispose();
    this.faultMat.dispose();
  }
}

export function makeRenderer(canvas?: HTMLCanvasElement, preserve = false): WebGLRenderer {
  const r = new WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: preserve, powerPreference: 'low-power' });
  r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  r.outputColorSpace = SRGBColorSpace;
  r.shadowMap.enabled = true;
  r.shadowMap.type = PCFShadowMap;
  return r;
}

export function makeControls(stage: ExerciseStage, el: HTMLElement): OrbitControls {
  const controls = new OrbitControls(stage.camera, el);
  controls.target.set(...stage.anim.meta.frame.center);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.rotateSpeed = 0.8;
  const d = stage.fitDistance();
  controls.minDistance = d * 0.5;
  controls.maxDistance = d * 1.6;
  controls.maxPolarAngle = Math.PI * 0.53; // a little below the floor line, never underneath
  controls.update();
  return controls;
}

/* ---------- stills (Library grid): one shared renderer, results cached as images ---------- */

let stillRenderer: WebGLRenderer | undefined;
const stills = new Map<string, Promise<string>>();
let queue: Promise<unknown> = Promise.resolve();

export function renderStill(id: ExerciseId, fraction: number, width: number, height: number, palette: Palette): Promise<string> {
  const key = `${id}:${fraction}:${width}x${height}:${palette.body}`;
  let p = stills.get(key);
  if (!p) {
    p = (queue = queue.then(async () => {
      const anim = await loadAnim(id);
      stillRenderer ??= makeRenderer(document.createElement('canvas'), true);
      stillRenderer.setSize(width, height, false);
      const stage = new ExerciseStage(anim, palette);
      stage.setAspect(width / height);
      stage.setView(stage.view);
      stage.setTime(fraction * stage.duration);
      stillRenderer.render(stage.scene, stage.camera);
      const url = stillRenderer.domElement.toDataURL('image/png');
      stage.dispose();
      return url;
    })) as Promise<string>;
    p.catch(() => stills.delete(key));
    stills.set(key, p);
  }
  return p;
}
