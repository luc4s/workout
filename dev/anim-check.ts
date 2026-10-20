// Dev-only page for checking poses against the reference photos (not part of the app build).
// /dev/anim-check.html?id=pullup&clip=main&t=0.5&view=side[&az=deg&el=deg]
import { Vector3 } from 'three';
import type { ExerciseId } from '../src/data/types';
import { captionAt, loadAnim } from '../src/anim3d/load';
import type { ViewName } from '../src/anim3d/spec';
import { ExerciseStage, makeRenderer } from '../src/anim3d/stage';

const q = new URLSearchParams(location.search);
const id = (q.get('id') ?? 'pullup') as ExerciseId;
const clip = q.get('clip') ?? 'main';
const t = Number(q.get('t') ?? 0);
const view = (q.get('view') ?? undefined) as ViewName | undefined;
const canvas = document.getElementById('c') as HTMLCanvasElement;

const anim = await loadAnim(id);
const renderer = makeRenderer(canvas, true);
renderer.setSize(innerWidth, innerHeight, false);
const stage = new ExerciseStage(anim, { body: '#66789c', prop: '#8a8f98', floor: '#d6d4cd', fault: '#d03b3b' });
stage.setAspect(innerWidth / innerHeight);
stage.setClip(clip);
stage.setView(view ?? stage.view);
if (q.has('az')) {
  // Free camera: azimuth from +Z toward +X, elevation above the horizon.
  const az = (Number(q.get('az')) * Math.PI) / 180;
  const el = (Number(q.get('el') ?? 10) * Math.PI) / 180;
  const c = new Vector3(...anim.meta.frame.center);
  const d = stage.fitDistance();
  stage.camera.position.set(c.x + d * Math.cos(el) * Math.sin(az), c.y + d * Math.sin(el), c.z + d * Math.cos(el) * Math.cos(az));
  stage.camera.lookAt(c);
}
stage.setTime(t);
renderer.render(stage.scene, stage.camera);
document.getElementById('label')!.textContent = `${id} · ${clip} · t=${t.toFixed(2)} · ${captionAt(anim.meta, clip, t) ?? ''}`;
(window as unknown as { ready: boolean }).ready = true;
