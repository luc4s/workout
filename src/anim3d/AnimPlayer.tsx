import { useEffect, useRef, useState } from 'react';
import type { ExerciseId } from '../data/types';
import { IconPause, IconPlay } from '../components/icons';
import { captionAt, loadAnim, type LoadedAnim } from './load';
import type { AnimMeta, ViewName } from './spec';
import { cssPalette, ExerciseStage, makeControls, makeRenderer, renderStill } from './stage';

const VIEWS: { id: ViewName; label: string }[] = [
  { id: 'side', label: 'Side' },
  { id: 'front', label: 'Front' },
  { id: 'threeQuarter', label: '¾' },
];

/** Animation metadata (captions, mistake demos) once the glb has loaded. */
export function useAnimMeta(id: ExerciseId): AnimMeta | undefined {
  const [meta, setMeta] = useState<AnimMeta>();
  useEffect(() => {
    let live = true;
    setMeta(undefined);
    loadAnim(id).then((a) => live && setMeta(a.meta), () => undefined);
    return () => {
      live = false;
    };
  }, [id]);
  return meta;
}

/**
 * 3D exercise animation: drag to rotate, preset camera angles, optional mistake demo.
 * `still` renders one frame (fraction of the loop) as an image instead of a live view.
 */
export function AnimPlayer(props: {
  exerciseId: ExerciseId;
  faultId?: string;
  controls?: boolean;
  showPhase?: boolean;
  still?: number;
  className?: string;
}) {
  const { exerciseId, faultId, controls, showPhase = true, still, className } = props;
  return (
    <div className={`figure${faultId ? ' fault' : ''} ${className ?? ''}`}>
      {still !== undefined ? (
        <Still exerciseId={exerciseId} fraction={still} />
      ) : (
        <Live exerciseId={exerciseId} faultId={faultId} controls={controls} showPhase={showPhase} />
      )}
    </div>
  );
}

function Still({ exerciseId, fraction }: { exerciseId: ExerciseId; fraction: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let live = true;
    const w = 400;
    const h = 300;
    renderStill(exerciseId, fraction, w, h, cssPalette(el)).then((url) => live && setSrc(url), () => undefined);
    return () => {
      live = false;
    };
  }, [exerciseId, fraction]);
  return (
    <div className="stage stage3d" ref={ref}>
      {src && <img src={src} alt="" />}
    </div>
  );
}

function Live(props: { exerciseId: ExerciseId; faultId?: string; controls?: boolean; showPhase: boolean }) {
  const { exerciseId, faultId, controls, showPhase } = props;
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engine = useRef<{ stage: ExerciseStage; setPlaying: (p: boolean) => void; setSpeed: (s: number) => void; seek: (t: number) => void }>();
  const [anim, setAnim] = useState<LoadedAnim>();
  const [error, setError] = useState(false);
  const [view, setView] = useState<ViewName>();
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [time, setTime] = useState(0);

  useEffect(() => {
    let live = true;
    setAnim(undefined);
    setError(false);
    loadAnim(exerciseId).then(
      (a) => live && setAnim(a),
      () => live && setError(true),
    );
    return () => {
      live = false;
    };
  }, [exerciseId]);

  // One renderer per live view for its whole life (browsers cap WebGL contexts, and a canvas whose
  // context was force-lost cannot host a new renderer — switching animations re-uses this one).
  const rendererRef = useRef<ReturnType<typeof makeRenderer>>();
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = makeRenderer(canvas);
    rendererRef.current = renderer;
    return () => {
      rendererRef.current = undefined;
      renderer.dispose();
      renderer.forceContextLoss();
    };
  }, []);

  // A stage per loaded animation, drawn by the shared renderer.
  useEffect(() => {
    const el = stageRef.current;
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!anim || !el || !canvas || !renderer) return;
    const stage = new ExerciseStage(anim, cssPalette(el));
    const orbit = makeControls(stage, canvas);
    let isPlaying = true;
    let rate = 1;
    let visible = true;
    let last: number | undefined;
    let raf = 0;
    let shownSec = -1;

    const resize = () => {
      const w = Math.max(1, el.clientWidth);
      const h = Math.max(1, el.clientHeight);
      renderer.setSize(w, h, false);
      stage.setAspect(w / h);
    };
    resize();
    stage.setView(stage.view);
    orbit.update();
    setView(stage.view);
    const ro = new ResizeObserver(() => {
      resize();
      stage.refit(orbit.target);
      const d = stage.fitDistance();
      orbit.minDistance = d * 0.5;
      orbit.maxDistance = d * 1.6;
      orbit.update();
    });
    ro.observe(el);
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(el);

    const tick = (ts: number) => {
      raf = requestAnimationFrame(tick);
      const dt = last === undefined ? 0 : Math.min(0.1, (ts - last) / 1000);
      last = ts;
      if (!visible || document.hidden) return;
      if (isPlaying) stage.advance(dt * rate);
      orbit.update();
      renderer.render(stage.scene, stage.camera);
      // Re-render React only when the caption / scrubber needs it (~10×/s).
      const tenth = Math.floor(stage.time * 10);
      if (tenth !== shownSec) {
        shownSec = tenth;
        setTime(stage.time);
      }
    };
    raf = requestAnimationFrame(tick);

    engine.current = {
      stage,
      setPlaying: (p) => (isPlaying = p),
      setSpeed: (s) => (rate = s),
      seek: (t) => stage.setTime(t),
    };
    const reset = () => {
      stage.setView(stage.view);
      orbit.target.set(...anim.meta.frame.center);
      orbit.update();
    };
    canvas.addEventListener('dblclick', reset);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      canvas.removeEventListener('dblclick', reset);
      orbit.dispose();
      stage.dispose();
      engine.current = undefined;
    };
  }, [anim]);

  useEffect(() => {
    engine.current?.stage.setClip(faultId ? `fault:${faultId}` : 'main');
  }, [faultId, anim]);
  useEffect(() => {
    engine.current?.setPlaying(playing);
  }, [playing, anim]);
  useEffect(() => {
    engine.current?.setSpeed(speed);
  }, [speed, anim]);

  const pickView = (v: ViewName) => {
    const e = engine.current;
    if (!e) return;
    e.stage.setView(v);
    setView(v);
  };

  const clip = faultId ? `fault:${faultId}` : 'main';
  const duration = anim?.meta.duration[clip] ?? 1;
  const caption = anim ? captionAt(anim.meta, clip, time) : undefined;

  return (
    <>
      <div className="stage stage3d" ref={stageRef}>
        <canvas ref={canvasRef} aria-label={caption ?? 'Exercise animation'} />
        {error && <div className="stage-msg">Animation unavailable offline — open the app once online.</div>}
        {anim && (
          <div className="view-chips" role="group" aria-label="Camera angle">
            {VIEWS.map((v) => (
              <button key={v.id} type="button" className={v.id === view ? 'on' : undefined} onClick={() => pickView(v.id)}>
                {v.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {showPhase && <div className="phase">{caption ?? ' '}</div>}
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
            value={Math.min(time, duration)}
            onChange={(e) => {
              setPlaying(false);
              engine.current?.seek(Number(e.target.value));
              setTime(Number(e.target.value));
            }}
            style={{ flex: 1 }}
            aria-label="Scrub animation"
          />
          <button type="button" className={`chip${speed !== 1 ? ' on' : ''}`} onClick={() => setSpeed((s) => (s === 1 ? 0.5 : s === 0.5 ? 0.25 : 1))}>
            {speed}×
          </button>
        </div>
      )}
    </>
  );
}
