import { Box3, Mesh, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { EXERCISES } from '../data/exercises';
import type { ExerciseId } from '../data/types';
import { buildExercise } from './build';
import { ANIM_SPECS } from './exercises';
import { sampleClip, type ClipSpec } from './pose';
import { applyPose, GRIP_LOCAL, worldOf } from './rig';
import { buildScene } from './scene';

const ids = Object.keys(EXERCISES) as ExerciseId[];
const clipsOf = (id: ExerciseId): [string, ClipSpec][] => [
  ['main', ANIM_SPECS[id].clip],
  ...ANIM_SPECS[id].faults.map((f): [string, ClipSpec] => [`fault:${f.id}`, f.clip]),
];
const samples = (clip: ClipSpec) => Array.from({ length: 40 }, (_, i) => (clip.duration * i) / 40);
/** Signed rotation about the bone's X axis, in degrees. */
const xAngle = (q: { x: number; w: number }) => (2 * Math.atan2(q.x, q.w) * 180) / Math.PI;

describe('3D animations', () => {
  it('every exercise in the guide has an animation', () => {
    expect(Object.keys(ANIM_SPECS).sort()).toEqual([...ids].sort());
  });

  for (const id of ids) {
    describe(id, () => {
      const spec = ANIM_SPECS[id];
      const built = buildScene(spec.props);

      it('cites at least one reference', () => {
        expect(spec.references.length).toBeGreaterThan(0);
      });

      it('builds clips and metadata', () => {
        const { clips, meta } = buildExercise(spec);
        expect(clips.map((c) => c.name)).toEqual(clipsOf(id).map(([n]) => n));
        expect(meta.captions.main.length).toBeGreaterThan(0);
        expect(meta.frame.radius).toBeGreaterThan(0.3);
      });

      for (const [name, clip] of clipsOf(id)) {
        it(`${name}: each limb stays IK or FK across keys (no jumps)`, () => {
          for (const limb of ['arm', 'leg'] as const) {
            for (const side of ['L', 'R'] as const) {
              const modes = new Set(clip.keys.map((k) => !!k.pose[limb]?.[side]?.ik));
              expect(modes.size, `${limb} ${side}`).toBe(1);
            }
          }
        });

        it(`${name}: hands and feet reach their contacts, nothing sinks into the floor, joints stay in range`, () => {
          for (const t of samples(clip)) {
            const { pose } = sampleClip(clip, t);
            applyPose(built.rig, pose);
            for (const side of ['L', 'R'] as const) {
              const arm = pose.arm?.[side];
              if (arm?.ik) {
                const grip = worldOf(built.rig, `hand_${side}`, GRIP_LOCAL);
                expect(grip.distanceTo(new Vector3(...arm.ik.target)), `hand ${side} @${t.toFixed(2)}`).toBeLessThan(0.012);
              }
              const leg = pose.leg?.[side];
              if (leg?.ik) {
                const ankle = worldOf(built.rig, `foot_${side}`);
                expect(ankle.distanceTo(new Vector3(...leg.ik.target)), `ankle ${side} @${t.toFixed(2)}`).toBeLessThan(0.012);
              }
              const elbow = -xAngle(built.rig[`forearm_${side}`].quaternion);
              const knee = xAngle(built.rig[`shin_${side}`].quaternion);
              expect(elbow, `elbow ${side} @${t.toFixed(2)}`).toBeGreaterThan(-3);
              expect(elbow, `elbow ${side} @${t.toFixed(2)}`).toBeLessThan(160);
              expect(knee, `knee ${side} @${t.toFixed(2)}`).toBeGreaterThan(-3);
              expect(knee, `knee ${side} @${t.toFixed(2)}`).toBeLessThan(160);
            }
            let lowest = Infinity;
            built.rig.hips.traverse((o) => {
              if (o instanceof Mesh && o.name.startsWith('m_')) lowest = Math.min(lowest, new Box3().setFromObject(o, true).min.y);
            });
            expect(lowest, `lowest body point @${t.toFixed(2)}`).toBeGreaterThan(-0.012);
          }
        });
      }
    });
  }
});
