import { useLiveQuery } from 'dexie-react-hooks';
import { restPauseOptions } from '../../data/program';
import { db } from '../../db/db';
import { restPauseLabel, suggestRestPause } from '../../logic/progression';
import type { RunnerAction, RunnerState } from '../../logic/runner';
import { lastRestPauseSlot } from '../../logic/session';

/** Pick the rest-pause finisher exercise mid-session, with a suggestion from today's sets. */
export function RestPauseSwitch(props: { state: RunnerState; slot: string; dispatch: (a: RunnerAction) => void }) {
  const { state, slot, dispatch } = props;
  const options = restPauseOptions(state.templateId, state.variantId);
  const choice = useLiveQuery(async () => {
    const [today, lastSlot] = await Promise.all([
      db.sets.where('sessionId').equals(state.sessionId).toArray(),
      lastRestPauseSlot(
        options.map((o) => o.key),
        state.sessionId,
      ),
    ]);
    const stalls = Object.fromEntries(options.map((o) => [o.basedOn ?? '', !!state.suggestions[o.basedOn ?? '']?.stall]));
    return suggestRestPause(options, { stalls, today, lastSlot });
  }, [state.sessionId, state.templateId, state.variantId]);
  if (options.length < 2) return null;

  return (
    <div className="rp-switch">
      <div className="chips">
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            className={`chip${o.key === slot ? ' on' : ''}`}
            onClick={() => o.key !== slot && dispatch({ type: 'swapRestPause', slot: o.key })}
          >
            {restPauseLabel(o)}
            {choice?.slot === o.key ? ' ★' : ''}
          </button>
        ))}
      </div>
      {choice && <div className="rp-reason">★ {choice.reason}</div>}
    </div>
  );
}
