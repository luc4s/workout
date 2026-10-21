/**
 * Mannequin proportions. Segment lengths are fractions of body height from the anthropometric
 * table in D. A. Winter, *Biomechanics and Motor Control of Human Movement* (4th ed., fig. 4.1),
 * for a 1.78 m figure. Units are metres; Y is up and the figure faces +Z in its rest pose
 * (standing, arms hanging, palms facing the thighs). The figure's left is +X.
 */
export const H = 1.78;

export const DIM = {
  hipY: 0.53 * H, // greater trochanter / hip joint
  thigh: (0.53 - 0.285) * H,
  shin: (0.285 - 0.039) * H,
  ankleY: 0.039 * H,
  footFwd: 0.152 * H * 0.78, // ankle → toe
  footBack: 0.152 * H * 0.22, // ankle → heel
  hipX: 0.05 * H, // hip joint centres, either side of the midline
  lumbar: 0.06 * H, // hip joint → lumbar pivot
  thorax: 0.11 * H, // lumbar → thoracic pivot
  neck: 0.144 * H, // thoracic → neck base (C7)
  head: 0.03 * H, // neck base → head pivot (atlas)
  shoulderY: 0.818 * H,
  shoulderX: 0.129 * H, // half the biacromial width
  upperArm: (0.818 - 0.63) * H,
  forearm: (0.63 - 0.485) * H,
  hand: 0.108 * H,
  grip: 0.042 * H, // wrist → middle of a closed grip
} as const;

export type Side = 'L' | 'R';

/** Bone (glTF node) names. Mesh nodes are named `m_<bone>_<n>`, props `p_<name>` (no `.` or `:` — reserved by three.js bindings). */
export const BONES = [
  'hips',
  'spine',
  'chest',
  'neck',
  'head',
  'clavicle_L',
  'upperArm_L',
  'forearm_L',
  'hand_L',
  'clavicle_R',
  'upperArm_R',
  'forearm_R',
  'hand_R',
  'thigh_L',
  'shin_L',
  'foot_L',
  'thigh_R',
  'shin_R',
  'foot_R',
] as const;
export type Bone = (typeof BONES)[number];

/** Rest-pose offset of each bone from its parent, and the parent. */
export const SKELETON: Record<Bone, { parent?: Bone; offset: [number, number, number] }> = {
  hips: { offset: [0, DIM.hipY, 0] },
  spine: { parent: 'hips', offset: [0, DIM.lumbar, 0] },
  chest: { parent: 'spine', offset: [0, DIM.thorax, 0] },
  neck: { parent: 'chest', offset: [0, DIM.neck, -0.02] },
  head: { parent: 'neck', offset: [0, DIM.head, 0.01] },
  clavicle_L: { parent: 'chest', offset: [0.025, DIM.shoulderY - DIM.hipY - DIM.lumbar - DIM.thorax - 0.015, 0] },
  upperArm_L: { parent: 'clavicle_L', offset: [DIM.shoulderX - 0.025, 0.015, -0.01] },
  forearm_L: { parent: 'upperArm_L', offset: [0, -DIM.upperArm, 0] },
  hand_L: { parent: 'forearm_L', offset: [0, -DIM.forearm, 0] },
  clavicle_R: { parent: 'chest', offset: [-0.025, DIM.shoulderY - DIM.hipY - DIM.lumbar - DIM.thorax - 0.015, 0] },
  upperArm_R: { parent: 'clavicle_R', offset: [-(DIM.shoulderX - 0.025), 0.015, -0.01] },
  forearm_R: { parent: 'upperArm_R', offset: [0, -DIM.upperArm, 0] },
  hand_R: { parent: 'forearm_R', offset: [0, -DIM.forearm, 0] },
  thigh_L: { parent: 'hips', offset: [DIM.hipX, 0, 0] },
  shin_L: { parent: 'thigh_L', offset: [0, -DIM.thigh, 0] },
  foot_L: { parent: 'shin_L', offset: [0, -DIM.shin, 0] },
  thigh_R: { parent: 'hips', offset: [-DIM.hipX, 0, 0] },
  shin_R: { parent: 'thigh_R', offset: [0, -DIM.thigh, 0] },
  foot_R: { parent: 'shin_R', offset: [0, -DIM.shin, 0] },
};

/** Human-readable segment groups used to highlight a fault. */
export const SEGMENTS = {
  torso: ['hips', 'spine', 'chest'],
  lowBack: ['hips', 'spine'],
  head: ['neck', 'head'],
  armL: ['upperArm_L', 'forearm_L', 'hand_L'],
  armR: ['upperArm_R', 'forearm_R', 'hand_R'],
  arms: ['upperArm_L', 'forearm_L', 'hand_L', 'upperArm_R', 'forearm_R', 'hand_R'],
  shoulders: ['clavicle_L', 'clavicle_R', 'upperArm_L', 'upperArm_R'],
  legL: ['thigh_L', 'shin_L', 'foot_L'],
  legR: ['thigh_R', 'shin_R', 'foot_R'],
  legs: ['thigh_L', 'shin_L', 'foot_L', 'thigh_R', 'shin_R', 'foot_R'],
  kneeL: ['thigh_L', 'shin_L'],
  feet: ['foot_L', 'foot_R'],
} satisfies Record<string, Bone[]>;
