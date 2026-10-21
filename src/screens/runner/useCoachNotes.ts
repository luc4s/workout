import { useEffect, useRef } from 'react';
import { askRestNote } from '../../coach/ask';
import { useCoachConfig } from '../../coach/store';
import { db, getSettings } from '../../db/db';
import { setFeedback } from '../../logic/coach';
import type { RunnerAction, RunnerState } from '../../logic/runner';
import type { WorkStep } from '../../logic/steps';

function prevWorkStepId(state: RunnerState): string | undefined {
  for (let i = state.index - 1; i >= 0; i--) {
    const s = state.steps[i];
    if (s.kind === 'work') return s.id;
  }
  return undefined;
}

/**
 * After every logged set: instant rule feedback, then (key set, enabled, online) Claude's note.
 * Lives in the runner shell, not the rest view, because views remount on every step; the notes
 * are kept in the runner state so Prev / Next and reloads keep them. A Claude call is cancelled
 * once the user moves past the rest it was meant for.
 */
export function useCoachNotes(state: RunnerState, dispatch: (a: RunnerAction) => void) {
  const cfg = useCoachConfig();
  const seen = useRef<Set<string>>();
  const aborts = useRef(new Map<string, AbortController>());
  const latest = useRef(state);
  latest.current = state;
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;

  useEffect(() => {
    const ids = Object.keys(state.done);
    if (!seen.current) {
      // Resumed or fresh runner: don't re-run feedback for sets logged before this mount.
      seen.current = new Set(ids);
      return;
    }
    for (const stepId of ids) {
      if (seen.current.has(stepId)) continue;
      seen.current.add(stepId);
      const step = state.steps.find((s) => s.id === stepId);
      if (!step || step.kind !== 'work') continue;
      void feedbackFor(step);
    }
  }, [state.done]); // eslint-disable-line react-hooks/exhaustive-deps

  async function feedbackFor(step: WorkStep) {
    const st = latest.current;
    const today = await db.sets.where('sessionId').equals(st.sessionId).toArray();
    const record = today.find((s) => s.id === `${st.sessionId}:${step.id}`);
    if (!record) return;
    const feedback = setFeedback(latest.current, step, record, today, Date.now());
    dispatch({ type: 'coachNote', stepId: step.id, note: { rule: feedback } });
    const c = cfgRef.current;
    if (!c?.apiKey || !c.inSession || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
    const ac = new AbortController();
    aborts.current.get(step.id)?.abort();
    aborts.current.set(step.id, ac);
    const [sessions, sets, settings] = await Promise.all([db.sessions.toArray(), db.sets.toArray(), getSettings()]);
    if (ac.signal.aborted) return;
    const r = await askRestNote({ state: latest.current, feedback, record, today, sessions, sets, settings, now: Date.now(), signal: ac.signal });
    if (aborts.current.get(step.id) === ac) aborts.current.delete(step.id);
    if (r.ok && !ac.signal.aborted) {
      dispatch({ type: 'coachNote', stepId: step.id, note: { claude: { note: r.data.note, cue: r.data.cue, suggestion: r.data.suggestion, model: r.model, at: r.at, fallback: r.fallback } } });
    }
  }

  // Moving past the rest a note was meant for cancels its call.
  useEffect(() => {
    const keep = prevWorkStepId(state);
    for (const [id, ac] of aborts.current) {
      if (id !== keep) {
        ac.abort();
        aborts.current.delete(id);
      }
    }
  }, [state.index]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = aborts.current;
    return () => {
      for (const ac of map.values()) ac.abort();
      map.clear();
    };
  }, []);
}
