import { Box3, Vector3, type AnimationClip } from 'three';
import { sampleClip } from './pose';
import { applyPose } from './rig';
import { bakeClip, buildScene } from './scene';
import type { AnimMeta, ExerciseAnimSpec } from './spec';

/** Build the scene, clips and metadata for one exercise (shared by the glb build script and tests). */
export function buildExercise(spec: ExerciseAnimSpec) {
  const built = buildScene(spec.props);
  const clips: AnimationClip[] = [];
  const bounds = new Box3();
  const meta: AnimMeta = {
    id: spec.id,
    view: spec.view,
    duration: {},
    captions: {},
    faults: spec.faults.map((f) => ({ id: f.id, title: f.title, highlight: f.highlight })),
    frame: { center: [0, 1, 0], radius: 1 },
  };
  const all = [{ name: 'main', clip: spec.clip }, ...spec.faults.map((f) => ({ name: `fault:${f.id}`, clip: f.clip }))];
  for (const { name, clip } of all) {
    const baked = bakeClip(name, clip, built);
    clips.push(baked.clip);
    if (name === 'main') bounds.union(baked.bounds);
    meta.duration[name] = clip.duration;
    meta.captions[name] = clip.keys.filter((k) => k.label).map((k) => ({ at: k.at, label: k.label! }));
  }
  const center = bounds.getCenter(new Vector3());
  const size = bounds.getSize(new Vector3());
  meta.frame = { center: center.toArray().map(round) as [number, number, number], radius: round(size.length() / 2 + 0.12) };
  // Leave the exported scene in the first pose of the main clip (what shows before playback).
  applyPose(built.rig, sampleClip(spec.clip, 0).pose);
  for (const m of built.moving) m.update(built.rig);
  built.scene.userData = { anim: meta };
  return { ...built, clips, meta };
}

const round = (v: number) => Math.round(v * 1000) / 1000;
