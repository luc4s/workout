import { useEffect, useMemo, useRef, useState } from 'react';
import { cuesBetween, sound, type CueSnapshot } from '../../audio/cues';
import { db, type Settings } from '../../db/db';
import { recorder } from '../../hr/recorder';
import { rowerRecorder } from '../../rower/recorder';
import { intervalPosition, stepElapsedMs, type RunnerState } from '../../logic/runner';
import { ghostDelta, ghostFor, scoreTimeline, type GameState, type Ghost } from '../../logic/rowgame';
import type { IntervalStep } from '../../logic/steps';

/** When the interval timer really started, and the pauses taken since (state.pauses is reset at the start). */
export function rowingClock(state: RunnerState): { phaseStartedAt: number; pauses?: { at: number; ms: number }[] } {
  const pauses = state.pauses ?? [];
  const pausedMs = pauses.reduce((a, p) => a + p.ms, 0);
  return { phaseStartedAt: state.stepStartedAt - pausedMs, ...(pauses.length ? { pauses } : {}) };
}

export interface RowGameView {
  game: GameState;
  ghost?: Ghost;
  delta?: { metres?: number; points: number };
}

/**
 * The live game: rescored once per second of rowing from the recordings (so it survives a reload),
 * the ghost of the last session of the same workout, and the sound cues between two seconds.
 */
export function useRowGame(state: RunnerState, step: IntervalStep, now: number, settings: Settings, started: boolean): RowGameView | undefined {
  const elapsedSec = started ? Math.floor(stepElapsedMs(state, now) / 1000) : 0;
  const [ghost, setGhost] = useState<Ghost | undefined>();
  const settingsKey = `${settings.hrMax}|${settings.birthYear}|${settings.pace2kSec}`;

  useEffect(() => {
    let alive = true;
    db.sessions.toArray().then((all) => {
      if (alive) setGhost(ghostFor(all, state.variantId, state.startedAt, settings));
    });
    return () => {
      alive = false;
    };
    // Settings only change the recomputed ghost of an old session without a stored game.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.variantId, state.startedAt, settingsKey]);

  const { phaseStartedAt, pauses } = rowingClock(state);
  const game = useMemo(() => {
    if (!started) return undefined;
    const hr = recorder.snapshot();
    const rower = rowerRecorder.snapshot();
    return scoreTimeline({ phases: step.phases, startedAt: phaseStartedAt, pauses, hr, rower, settings, untilSec: elapsedSec });
    // Recompute once per second of rowing; the recordings grow in place between seconds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, elapsedSec, phaseStartedAt, step.phases, settingsKey]);

  // Sound: compare this second with the previous one.
  const prev = useRef<CueSnapshot | undefined>(undefined);
  const driftAt = useRef(0);
  useEffect(() => {
    if (!game) return;
    const pos = intervalPosition(step.phases, elapsedSec);
    const cur: CueSnapshot = {
      phaseIndex: pos.phaseIndex,
      remainingSec: Math.ceil(pos.phaseRemainingSec),
      hasNext: pos.phaseIndex < step.phases.length - 1,
      multiplier: game.multiplier,
      offRun: game.offRun,
      medals: game.medals,
      at: Date.now(),
    };
    // A finished workout plays nothing more; a muted screen still tracks state so unmuting is quiet.
    const { cues, driftAt: d } = cuesBetween(prev.current, cur, driftAt.current);
    driftAt.current = d;
    prev.current = cur;
    if (settings.rowingSound !== false && !pos.finished && state.pausedAt === undefined) for (const c of cues) sound.play(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game]);

  if (!game) return undefined;
  return { game, ghost, delta: ghost ? ghostDelta(ghost, game) : undefined };
}
