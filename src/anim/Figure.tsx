import type { ReactNode } from 'react';
import { ANIMS, type ExerciseAnim, type FrontPose, type PropSpec, type Segment } from './clips';
import { sampleClip, solve, SEG, type Joints, type Vec } from './rig';
import type { ExerciseId } from '../data/types';

export interface Palette {
  body: string;
  far: string;
  prop: string;
  propFill: string;
  fault: string;
  band: string;
}

export const CSS_PALETTE: Palette = {
  body: 'var(--fig-body)',
  far: 'var(--fig-far)',
  prop: 'var(--fig-prop)',
  propFill: 'var(--fig-prop-fill)',
  fault: 'var(--fig-fault)',
  band: 'var(--fig-band)',
};

const W = 7;
const line = (a: Vec, b: Vec, stroke: string, width = W, key?: string) => (
  <line key={key} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={stroke} strokeWidth={width} strokeLinecap="round" />
);
const poly = (pts: Vec[], stroke: string, width = W, key?: string) => (
  <polyline
    key={key}
    points={pts.map((p) => p.join(',')).join(' ')}
    fill="none"
    stroke={stroke}
    strokeWidth={width}
    strokeLinecap="round"
    strokeLinejoin="round"
  />
);

export interface FrameInfo {
  svg: ReactNode;
  label?: string;
}

/** Render one frame of an exercise animation at time `t` seconds. */
export function renderFrame(id: ExerciseId, t: number, faultId: string | undefined, pal: Palette): FrameInfo {
  const anim = ANIMS[id];
  if (anim.view === 'front') return renderFront(anim, t, pal);

  const fault = anim.faults.find((f) => f.id === faultId);
  const { pose, label } = sampleClip(fault?.clip ?? anim.clip, t);
  const j = solve(pose);
  const hl = new Set<Segment>(fault?.highlight ?? []);
  const color = (seg: Segment, base: string) => (hl.has(seg) ? pal.fault : base);

  const back: ReactNode[] = [];
  const front: ReactNode[] = [];
  anim.props.forEach((p, i) => {
    const [b, f] = renderProp(p, j, pal, `p${i}`);
    if (b) back.push(b);
    if (f) front.push(f);
  });

  const svg = (
    <svg viewBox={anim.viewBox.join(' ')} role="img" aria-label={label ?? id} className="figure-svg">
      {back}
      {/* far side */}
      {poly([j.shoulder, j.elbowF, j.wristF], color('armF', pal.far), W, 'armF')}
      {poly([j.pelvis, j.kneeF, j.ankleF, j.toeF], color('legF', pal.far), W, 'legF')}
      {/* body */}
      {poly([j.pelvis, j.waist, j.shoulder], color('torso', pal.body), W + 2, 'torso')}
      {line(j.shoulder, j.neck, color('head', pal.body), W - 1, 'neck')}
      <circle cx={j.head[0]} cy={j.head[1]} r={SEG.headR} fill={color('head', pal.body)} />
      {/* near side */}
      {poly([j.pelvis, j.kneeN, j.ankleN, j.toeN], color('legN', pal.body), W, 'legN')}
      {poly([j.shoulder, j.elbowN, j.wristN], color('armN', pal.body), W, 'armN')}
      {front}
    </svg>
  );
  return { svg, label };
}

function renderProp(p: PropSpec, j: Joints, pal: Palette, key: string): [ReactNode?, ReactNode?] {
  switch (p.kind) {
    case 'floor':
      return [line([-100, p.y + 3], [400, p.y + 3], pal.prop, 3, key)];
    case 'bar':
      return [
        undefined,
        <g key={key}>
          {line([p.at[0], p.at[1]], [p.at[0], p.at[1] - 40], pal.prop, 3)}
          <circle cx={p.at[0]} cy={p.at[1]} r={6} fill={pal.propFill} stroke={pal.prop} strokeWidth={3} />
        </g>,
      ];
    case 'dipBar':
      return [
        <g key={key}>
          {line([p.at[0] - 4, p.at[1] + 4], [p.at[0] - 4, p.floorY], pal.prop, 4)}
          {line([p.at[0] - 30, p.at[1] + 2], [p.at[0] + 22, p.at[1] + 2], pal.prop, 6)}
        </g>,
      ];
    case 'box':
      return [<rect key={key} x={p.x} y={p.y} width={p.w} height={p.h} rx={3} fill={pal.propFill} stroke={pal.prop} strokeWidth={2} />];
    case 'wall':
      return [line([p.x, p.floorY + 3], [p.x, -100], pal.prop, 4, key)];
    case 'wheel': {
      const c = j[p.joint];
      return [
        undefined,
        <g key={key}>
          <circle cx={c[0]} cy={c[1] + 3} r={p.r} fill={pal.propFill} stroke={pal.prop} strokeWidth={3} />
          <circle cx={c[0]} cy={c[1] + 3} r={2.5} fill={pal.prop} />
        </g>,
      ];
    }
    case 'dumbbell': {
      const c = j[p.joint];
      return [undefined, <rect key={key} x={c[0] - 9} y={c[1] - 3} width={18} height={10} rx={3} fill={pal.prop} />];
    }
    case 'backpack': {
      // Rectangle behind the upper back, aligned with the torso
      const dx = j.shoulder[0] - j.waist[0];
      const dy = j.shoulder[1] - j.waist[1];
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      const cx = (j.shoulder[0] + j.waist[0]) / 2;
      const cy = (j.shoulder[1] + j.waist[1]) / 2;
      return [
        <rect
          key={key}
          x={-16}
          y={-19}
          width={30}
          height={14}
          rx={4}
          fill={pal.propFill}
          stroke={pal.prop}
          strokeWidth={2}
          transform={`translate(${cx} ${cy}) rotate(${angle})`}
        />,
      ];
    }
    case 'band':
      return [undefined, line(p.from, j[p.joint], pal.band, 2.5, key)];
    case 'rower': {
      const seatX = j.pelvis[0];
      const hb = p.handleBase;
      return [
        <g key={key}>
          {line([p.x1, p.railY], [p.x2 - 20, p.railY], pal.prop, 5)}
          {line([p.x1 + 6, p.railY], [p.x1 + 6, p.railY + 26], pal.prop, 4)}
          <rect x={p.x2 - 28} y={hb[1] - 14} width={26} height={52} rx={10} fill={pal.propFill} stroke={pal.prop} strokeWidth={2} />
          {line([p.x2 - 16, p.railY + 20], [p.x2 - 16, p.railY + 26], pal.prop, 4)}
          <rect x={seatX - 13} y={p.railY - 12} width={26} height={8} rx={3} fill={pal.prop} />
          {line([p.footplate[0] - 4, p.footplate[1] + 10], [p.footplate[0] + 10, p.footplate[1] - 16], pal.prop, 4)}
        </g>,
        <g key={`${key}-h`}>
          {line(hb, j.wristN, pal.prop, 1.5)}
          {line([j.wristN[0], j.wristN[1] - 7], [j.wristN[0], j.wristN[1] + 7], pal.prop, 4)}
        </g>,
      ];
    }
  }
}

function renderFront(anim: Extract<ExerciseAnim, { view: 'front' }>, t: number, pal: Palette): FrameInfo {
  const time = ((t % anim.duration) + anim.duration) % anim.duration;
  const ks = anim.keyframes;
  let pose: FrontPose = ks[0].pose;
  let label = ks[0].label;
  for (let i = 0; i < ks.length; i++) {
    const next = ks[i + 1] ?? { ...ks[0], at: anim.duration };
    if (time >= ks[i].at && time < next.at) {
      const u = (time - ks[i].at) / (next.at - ks[i].at || 1);
      const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      pose = lerpFront(ks[i].pose, next.pose, e);
      label = ks[i].label;
      break;
    }
  }
  // bend the elbow outward (away from the body centre) and upward
  const arm = (s: Vec, h: Vec, out: number): Vec[] => twoBone(s, h, SEG.upperArm, SEG.forearm, out);
  // Knees point forward, toward the viewer: solve the leg in the image plane, then flatten the
  // sideways bend so the knee stays roughly over the foot.
  const leg = (hip: Vec, foot: Vec, out: number): Vec[] => {
    const [s, knee, f] = twoBone(hip, foot, SEG.thigh, SEG.shin, out);
    const mid: Vec = [(hip[0] + foot[0]) / 2, (hip[1] + foot[1]) / 2];
    return [s, [mid[0] + (knee[0] - mid[0]) * 0.35, mid[1] + (knee[1] - mid[1]) * 0.35], f];
  };
  const legs = pose.legs;
  const mid = (a: Vec, b: Vec): Vec => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const svg = (
    <svg viewBox={anim.viewBox.join(' ')} role="img" aria-label={label ?? anim.caption ?? 'exercise'} className="figure-svg">
      {line([-100, anim.floorY + 3], [400, anim.floorY + 3], pal.prop, 3)}
      {legs && (
        <>
          {poly(leg(legs.hipL, legs.footL, -1), pal.body)}
          {poly(leg(legs.hipR, legs.footR, 1), pal.body)}
          {line(legs.hipL, legs.hipR, pal.body, W + 2)}
          {line(mid(pose.shoulderL, pose.shoulderR), mid(legs.hipL, legs.hipR), pal.body, W + 4)}
        </>
      )}
      {line(pose.shoulderL, pose.shoulderR, pal.body, W + 2)}
      {legs ? (
        <>
          {/* Arms reach forward for balance — foreshortened from the front. */}
          {line(pose.shoulderL, pose.handL, pal.body)}
          {line(pose.shoulderR, pose.handR, pal.body)}
        </>
      ) : (
        <>
          {poly(arm(pose.shoulderL, pose.handL, -1), pal.body)}
          {poly(arm(pose.shoulderR, pose.handR, 1), pal.body)}
        </>
      )}
      <circle cx={pose.head[0]} cy={pose.head[1]} r={SEG.headR} fill={pal.body} />
    </svg>
  );
  return { svg, label };
}

/** Two-bone chain from `s` to `e`; the middle joint bends to the `out` side of the line. */
function twoBone(s: Vec, e: Vec, l1: number, l2: number, out: number): Vec[] {
  const dx = e[0] - s[0];
  const dy = e[1] - s[1];
  const d = Math.min(l1 + l2 - 0.01, Math.hypot(dx, dy));
  const ux = dx / Math.hypot(dx, dy);
  const uy = dy / Math.hypot(dx, dy);
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const hgt = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  const px = uy * out;
  const py = -ux * out;
  return [s, [s[0] + ux * along + px * hgt, s[1] + uy * along + py * hgt], e];
}

function lerpFront(a: FrontPose, b: FrontPose, t: number): FrontPose {
  const l = (p: Vec, q: Vec): Vec => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  return {
    shoulderL: l(a.shoulderL, b.shoulderL),
    shoulderR: l(a.shoulderR, b.shoulderR),
    handL: l(a.handL, b.handL),
    handR: l(a.handR, b.handR),
    head: l(a.head, b.head),
    legs:
      a.legs && b.legs
        ? {
            hipL: l(a.legs.hipL, b.legs.hipL),
            hipR: l(a.legs.hipR, b.legs.hipR),
            footL: l(a.legs.footL, b.legs.footL),
            footR: l(a.legs.footR, b.legs.footR),
          }
        : a.legs,
  };
}

export function durationOf(id: ExerciseId, faultId?: string): number {
  const anim = ANIMS[id];
  if (anim.view === 'front') return anim.duration;
  return (anim.faults.find((f) => f.id === faultId)?.clip ?? anim.clip).duration;
}
