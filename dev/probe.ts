// Prints joint positions and contact errors for an exercise at a few times.
// npx vite-node dev/probe.ts <id> [clip] [t...]
import { Box3, Mesh, Vector3 } from 'three';
import type { ExerciseId } from '../src/data/types';
import { ANIM_SPECS } from '../src/anim3d/exercises';
import { sampleClip } from '../src/anim3d/pose';
import { applyPose, GRIP_LOCAL, worldOf } from '../src/anim3d/rig';
import { buildScene } from '../src/anim3d/scene';

const [id, clipName = 'main', ...ts] = process.argv.slice(2);
const spec = ANIM_SPECS[id as ExerciseId]!;
const clip = clipName === 'main' ? spec.clip : spec.faults.find((f) => f.id === clipName)!.clip;
const built = buildScene(spec.props);
const times = ts.length ? ts.map(Number) : clip.keys.map((k) => k.at);
const f = (v: Vector3) => `(${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`;
for (const t of times) {
  const { pose, label } = sampleClip(clip, t);
  applyPose(built.rig, pose);
  const r = built.rig;
  let minY = Infinity;
  let minName = '';
  r.hips.traverse((o) => {
    if (o instanceof Mesh && o.name.startsWith('m_')) {
      const y = new Box3().setFromObject(o, true).min.y;
      if (y < minY) [minY, minName] = [y, o.name];
    }
  });
  const out: string[] = [`t=${t.toFixed(2)} ${label ?? ''}`];
  for (const s of ['L', 'R'] as const) {
    const grip = worldOf(r, `hand_${s}`, GRIP_LOCAL);
    const ik = pose.arm?.[s]?.ik;
    const palm = pose.arm?.[s]?.palm;
    const err = ik ? grip.distanceTo(new Vector3(...ik.target)) : NaN;
    void palm;
    out.push(`  hand${s} ${f(grip)}${ik ? ` err ${(err * 100).toFixed(1)}cm` : ''}  elbow ${f(worldOf(r, `forearm_${s}`))}  shoulder ${f(worldOf(r, `upperArm_${s}`))}`);
    const ank = worldOf(r, `foot_${s}`);
    const lik = pose.leg?.[s]?.ik;
    out.push(`  ankle${s} ${f(ank)}${lik ? ` err ${(ank.distanceTo(new Vector3(...lik.target)) * 100).toFixed(1)}cm` : ''}  knee ${f(worldOf(r, `shin_${s}`))}  hip ${f(worldOf(r, `thigh_${s}`))}`);
  }
  out.push(`  head ${f(worldOf(r, 'head', [0, 0.1, 0.01]))}  lowest body point y=${minY.toFixed(3)} (${minName})`);
  console.log(out.join('\n'));
}
