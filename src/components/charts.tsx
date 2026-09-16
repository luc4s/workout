import { useEffect, useRef, useState } from 'react';

export interface Point {
  x: number; // timestamp
  y: number;
  label?: string;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(240, entry.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) {
    min = Math.max(0, min - 1);
    max = max + 1;
  }
  const span = max - min;
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) ?? mag * 10;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.001; v += step) ticks.push(Math.round(v * 100) / 100);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

const fmtDate = (ts: number) => new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

const M = { top: 16, right: 16, bottom: 28, left: 40 };

/** Single-series line chart with crosshair tooltip. */
export function LineChart({ points, unit = '', height = 200, zeroBased = true }: { points: Point[]; unit?: string; height?: number; zeroBased?: boolean }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number>();
  if (points.length === 0) return <div className="empty">No data yet</div>;

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const ticks = niceTicks(zeroBased ? 0 : Math.min(...ys), Math.max(...ys));
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];
  const iw = width - M.left - M.right;
  const ih = height - M.top - M.bottom;
  const sx = (x: number) => M.left + (xMax === xMin ? iw / 2 : ((x - xMin) / (xMax - xMin)) * iw);
  const sy = (y: number) => M.top + ih - ((y - yMin) / (yMax - yMin || 1)) * ih;
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x)},${sy(p.y)}`).join(' ');
  const hp = hover !== undefined ? points[hover] : undefined;

  const onMove = (clientX: number, rect: DOMRect) => {
    const x = clientX - rect.left;
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(sx(p.x) - x) < Math.abs(sx(points[best].x) - x)) best = i;
    });
    setHover(best);
  };

  const xLabels = points.length <= 2 ? points.map((p) => p.x) : [xMin, xs[Math.floor(xs.length / 2)], xMax];

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <svg
        width={width}
        height={height}
        style={{ display: 'block', touchAction: 'pan-y' }}
        onPointerMove={(e) => onMove(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerDown={(e) => onMove(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerLeave={() => setHover(undefined)}
        role="img"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={width - M.right} y1={sy(t)} y2={sy(t)} stroke="var(--grid)" strokeWidth={1} />
            <text x={M.left - 8} y={sy(t) + 4} textAnchor="end" fontSize={12} fill="var(--text-3)" className="num">
              {t}
            </text>
          </g>
        ))}
        {xLabels.map((x, i) => (
          <text
            key={`${x}-${i}`}
            x={sx(x)}
            y={height - 8}
            textAnchor={i === 0 && xLabels.length > 1 ? 'start' : i === xLabels.length - 1 && xLabels.length > 1 ? 'end' : 'middle'}
            fontSize={12}
            fill="var(--text-3)"
          >
            {fmtDate(x)}
          </text>
        ))}
        <path d={path} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {hp && <line x1={sx(hp.x)} x2={sx(hp.x)} y1={M.top} y2={M.top + ih} stroke="var(--text-3)" strokeWidth={1} strokeDasharray="3 3" />}
        {points.map((p, i) => (
          <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={hover === i ? 6 : 4} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} />
        ))}
        {/* direct label on the latest value */}
        <text x={sx(points[points.length - 1].x)} y={sy(points[points.length - 1].y) - 10} textAnchor="end" fontSize={13} fontWeight={700} fill="var(--text)">
          {points[points.length - 1].y}
          {unit}
        </text>
      </svg>
      {hp && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: Math.min(Math.max(sx(hp.x) - 70, 0), width - 150),
            width: 150,
            padding: '6px 10px',
            borderRadius: 10,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow)',
            fontSize: 13,
            pointerEvents: 'none',
          }}
        >
          <div className="faint">{fmtDate(hp.x)}</div>
          <div style={{ fontWeight: 700 }} className="num">
            {hp.y}
            {unit}
          </div>
          {hp.label && <div className="muted">{hp.label}</div>}
        </div>
      )}
    </div>
  );
}

/** Single-series column chart with per-bar hover. */
export function BarChart({ bars, unit = '', height = 180 }: { bars: { key: string; label: string; value: number; detail?: string }[]; unit?: string; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number>();
  const ticks = niceTicks(0, Math.max(1, ...bars.map((b) => b.value)));
  const yMax = ticks[ticks.length - 1];
  const iw = width - M.left - M.right;
  const ih = height - M.top - M.bottom;
  const slot = iw / Math.max(1, bars.length);
  const bw = Math.max(4, Math.min(36, slot - 4));
  const sy = (y: number) => M.top + ih - (y / yMax) * ih;
  const hb = hover !== undefined ? bars[hover] : undefined;

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <svg width={width} height={height} style={{ display: 'block' }} onPointerLeave={() => setHover(undefined)} role="img">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={width - M.right} y1={sy(t)} y2={sy(t)} stroke="var(--grid)" />
            <text x={M.left - 8} y={sy(t) + 4} textAnchor="end" fontSize={12} fill="var(--text-3)">
              {t}
            </text>
          </g>
        ))}
        {bars.map((b, i) => {
          const x = M.left + slot * i + (slot - bw) / 2;
          const h = Math.max(0, (b.value / yMax) * ih);
          const y = M.top + ih - h;
          const r = Math.min(4, bw / 2, h);
          return (
            <g key={b.key} onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)}>
              <rect x={M.left + slot * i} y={M.top} width={slot} height={ih} fill="transparent" />
              {h > 0 && (
                <path
                  d={`M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${y + h} Z`}
                  fill="var(--series-1)"
                  opacity={hover === undefined || hover === i ? 1 : 0.55}
                />
              )}
              {(i === 0 || i === bars.length - 1 || i === Math.floor(bars.length / 2)) && (
                <text x={x + bw / 2} y={height - 8} textAnchor="middle" fontSize={12} fill="var(--text-3)">
                  {b.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hb && hover !== undefined && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: Math.min(Math.max(M.left + slot * hover + slot / 2 - 75, 0), width - 150),
            width: 150,
            padding: '6px 10px',
            borderRadius: 10,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            fontSize: 13,
            pointerEvents: 'none',
          }}
        >
          <div className="faint">{hb.label}</div>
          <div style={{ fontWeight: 700 }}>
            {hb.value}
            {unit}
          </div>
          {hb.detail && <div className="muted">{hb.detail}</div>}
        </div>
      )}
    </div>
  );
}
