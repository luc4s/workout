import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { applySuggestion, canApply, suggestionId, suggestionLabel, type ApplyContext, type ApplyScope } from '../../coach/apply';
import { modelLabel } from '../../coach/client';
import type { CoachSuggestion } from '../../logic/coach';

/** "Fable 5.1 · 09:12" footer for a Claude answer, with an optional refresh. */
export function ModelFooter(props: { model: string; fallback?: boolean; at: number; onRefresh?: () => void; busy?: boolean }) {
  const time = new Date(props.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return (
    <div className="row between coach-src">
      <span>
        {modelLabel(props.model, props.fallback)} · {time}
      </span>
      {props.onRefresh && (
        <button type="button" className="btn small ghost" onClick={props.onRefresh} disabled={props.busy}>
          {props.busy ? 'Thinking…' : 'Refresh'}
        </button>
      )}
    </div>
  );
}

/** Coach suggestions with one-tap Accept. Nothing changes until a button is tapped. */
export function SuggestionList(props: {
  suggestions: CoachSuggestion[];
  scope: ApplyScope;
  ctx: Omit<ApplyContext, 'navigate'>;
  accepted?: string[];
  onAccepted?: (id: string) => void;
  source?: (s: CoachSuggestion) => string | undefined;
}) {
  const navigate = useNavigate();
  const [done, setDone] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string>();
  const list = dedupe(props.suggestions).filter((s) => canApply(s, props.scope, props.ctx.state));
  if (!list.length) return null;
  return (
    <div className="stack tight">
      {list.map((s) => {
        const id = suggestionId(s);
        const applied = done[id] ?? (props.accepted?.includes(id) ? 'Applied.' : undefined);
        const src = props.source?.(s);
        return (
          <div key={id} className="suggestion">
            <div className="reason">
              {s.reason}
              {src && <span className="coach-src"> · {src}</span>}
              {applied && <div className="good-text">{applied}</div>}
            </div>
            {applied ? (
              <span className="badge good">Applied</span>
            ) : (
              <button
                type="button"
                className="btn small primary"
                disabled={busy === id}
                onClick={async () => {
                  setBusy(id);
                  try {
                    const msg = await applySuggestion(s, props.scope, { ...props.ctx, navigate: (to, opts) => navigate(to, opts) });
                    setDone((d) => ({ ...d, [id]: msg }));
                    props.onAccepted?.(id);
                  } finally {
                    setBusy(undefined);
                  }
                }}
              >
                {suggestionLabel(s)}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function dedupe(list: CoachSuggestion[]): CoachSuggestion[] {
  const seen = new Set<string>();
  return list.filter((s) => {
    const k = `${s.kind}:${s.slot ?? ''}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
