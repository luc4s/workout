import { useState } from 'react';
import { applySuggestion, canApply, suggestionId, suggestionLabel } from '../../coach/apply';
import { modelLabel } from '../../coach/client';
import { getSettings } from '../../db/db';
import type { CoachStepNote, RunnerAction, RunnerState } from '../../logic/runner';

/** The rest-screen note: the rule verdict at once, Claude's note when it arrives, one optional Accept. */
export function CoachNote(props: { state: RunnerState; note: CoachStepNote; dispatch: (a: RunnerAction) => void }) {
  const { state, note, dispatch } = props;
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string>();
  const text = note.claude?.note ?? note.rule?.headline;
  if (!text) return null;
  const tone = note.claude ? 'info' : note.rule?.tone ?? 'info';
  const suggestion = note.claude?.suggestion ?? note.rule?.suggestion;
  const id = suggestion ? suggestionId(suggestion) : undefined;
  const accepted = !!id && (state.coach?.accepted ?? []).includes(id);
  const showAccept = suggestion && (accepted || canApply(suggestion, 'runner', state));
  const label = note.claude ? modelLabel(note.claude.model, note.claude.fallback) : 'rules';

  return (
    <div className={`coach-note ${tone}`} role="status">
      <div className="coach-text">{result ?? text}</div>
      <div className="coach-meta">
        <small className="coach-src">{label}</small>
        {showAccept &&
          (accepted ? (
            <span className="badge good">Applied</span>
          ) : (
            <button
              type="button"
              className="btn small primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const msg = await applySuggestion(suggestion, 'runner', { settings: await getSettings(), templateId: state.templateId, dispatch, state });
                  dispatch({ type: 'coachAccept', id: id! });
                  setResult(msg);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {suggestionLabel(suggestion)}
            </button>
          ))}
      </div>
    </div>
  );
}
