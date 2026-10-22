import { useState } from 'react';
import { applySuggestion, canApply, suggestionId, suggestionLabel } from '../../coach/apply';
import { modelLabel } from '../../coach/client';
import { getSettings } from '../../db/db';
import type { CoachStepNote, RunnerAction, RunnerState } from '../../logic/runner';
import type { WorkStep } from '../../logic/steps';

/** The coach column on the rest screen: the rule verdict at once, Claude's note when it arrives, one optional Accept. */
export function CoachNote(props: { state: RunnerState; step: WorkStep; note: CoachStepNote; dispatch: (a: RunnerAction) => void; pending?: boolean }) {
  const { state, step, note, dispatch, pending } = props;
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string>();
  const main = note.claude?.note ?? note.rule?.headline;
  if (!main) return null;
  const suggestion = note.claude?.suggestion ?? note.rule?.suggestion;
  const cue = note.claude?.cue ?? note.rule?.cue;
  const id = suggestion ? suggestionId(suggestion) : undefined;
  const accepted = !!id && (state.coach?.accepted ?? []).includes(id);
  const showAccept = suggestion && (accepted || canApply(suggestion, 'runner', state));
  const label = note.claude ? modelLabel(note.claude.model, note.claude.fallback) : pending ? 'Asking the coach…' : 'rules';

  return (
    <>
      <div className="row between">
        <div className="section-title">Coach</div>
        {note.rule && (
          <span className={`badge ${note.rule.verdict === 'under' ? 'warn' : note.rule.verdict === 'first' ? '' : 'good'}`}>
            {step.name.split(' /')[0]} · {note.rule.reps}
            {note.rule.target !== undefined ? `/${note.rule.target}` : ''}
            {note.rule.rir !== undefined ? ` · ${note.rule.rir} RIR` : ''}
          </span>
        )}
      </div>
      <p className="coach-main">{main}</p>
      {note.claude && note.rule && note.rule.headline !== main && <p className="coach-rule">{note.rule.headline}</p>}
      {cue && (
        <div className="coach-cue">
          Next {step.name} set: {cue}
        </div>
      )}
      {result && <div className="good-text">{result}</div>}
      {showAccept &&
        (accepted ? (
          <span className="badge good" style={{ alignSelf: 'flex-start' }}>
            Applied
          </span>
        ) : (
          <button
            type="button"
            className="btn primary block"
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
      {suggestion && !accepted && showAccept && <div className="coach-rule">{suggestion.reason}</div>}
      <div className="spacer" />
      <div className="coach-src">{label}</div>
    </>
  );
}
