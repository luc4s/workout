import type { ReactNode } from 'react';

/** Circular progress ring. `progress` is 0..1 (clamped). */
export function TimerRing(props: { progress: number; color: string; size?: number; stroke?: number; children?: ReactNode }) {
  const { progress, color, size = 320, stroke = 18, children } = props;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress));
  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: size, aspectRatio: '1' }}>
      <svg viewBox={`0 0 ${size} ${size}`} style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p)}
          style={{ transition: 'stroke-dashoffset 0.25s linear' }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>{children}</div>
    </div>
  );
}
