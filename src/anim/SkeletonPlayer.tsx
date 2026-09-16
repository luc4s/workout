import { useEffect, useRef, useState } from 'react';
import type { ExerciseId } from '../data/types';
import { CSS_PALETTE, durationOf, renderFrame } from './Figure';
import { IconPause, IconPlay } from '../components/icons';

export function SkeletonPlayer(props: {
  exerciseId: ExerciseId;
  faultId?: string;
  controls?: boolean;
  showPhase?: boolean;
  /** Render a still frame (fraction of the loop) instead of animating. */
  still?: number;
  className?: string;
}) {
  const { exerciseId, faultId, controls, showPhase = true, still, className } = props;
  const duration = durationOf(exerciseId, faultId);
  const [playing, setPlaying] = useState(still === undefined);
  const [speed, setSpeed] = useState(1);
  const [t, setT] = useState(still !== undefined ? still * duration : 0);
  const last = useRef<number | undefined>(undefined);

  useEffect(() => {
    setT(still !== undefined ? still * duration : 0);
  }, [exerciseId, faultId, still, duration]);

  useEffect(() => {
    if (!playing || still !== undefined) return;
    let raf = 0;
    const tick = (ts: number) => {
      if (last.current !== undefined) {
        const dt = Math.min(0.1, (ts - last.current) / 1000);
        setT((prev) => (prev + dt * speed) % duration);
      }
      last.current = ts;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      last.current = undefined;
    };
  }, [playing, speed, duration, still]);

  const { svg, label } = renderFrame(exerciseId, t, faultId, CSS_PALETTE);

  return (
    <div className={`figure${faultId ? ' fault' : ''} ${className ?? ''}`}>
      <div className="stage">{svg}</div>
      {showPhase && <div className="phase">{label ?? ' '}</div>}
      {controls && (
        <div className="row">
          <button type="button" className="btn icon-btn small" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? <IconPause /> : <IconPlay />}
          </button>
          <input
            type="range"
            min={0}
            max={duration}
            step={0.01}
            value={t}
            onChange={(e) => {
              setPlaying(false);
              setT(Number(e.target.value));
            }}
            style={{ flex: 1 }}
            aria-label="Scrub animation"
          />
          <button type="button" className={`chip${speed !== 1 ? ' on' : ''}`} onClick={() => setSpeed((s) => (s === 1 ? 0.5 : s === 0.5 ? 0.25 : 1))}>
            {speed}×
          </button>
        </div>
      )}
    </div>
  );
}
