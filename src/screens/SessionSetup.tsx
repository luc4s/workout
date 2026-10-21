import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { getTemplate, getVariant, PRESCRIPTIONS, restPauseOptions } from '../data/program';
import type { Prescription, TemplateId } from '../data/types';
import { db } from '../db/db';
import { Chips, Note, ToggleRow, VariationSelect } from '../components/controls';
import { IconCheck } from '../components/icons';
import { formatClock } from '../hooks/useNow';
import { isLoadable, LOAD_STEP_KG, rangeText, suggestRestPause, type RestPauseChoice, type Suggestion } from '../logic/progression';
import type { SlotPlan } from '../logic/runner';
import { warningsFor } from '../logic/schedule';
import { lastRestPauseSlot, prepareSession, startSession, type Preparation, type SessionOptions } from '../logic/session';
import { estimateDurationSec } from '../logic/steps';
import { getCoachNext, type CoachNext } from '../coach/store';

export default function SessionSetup() {
  const { templateId = 'A' } = useParams();
  const navigate = useNavigate();
  const template = getTemplate(templateId as TemplateId);
  // Presets from the coach: router state (Today → "Set up session" / an accepted suggestion) and the stored `coach:next`.
  const preset = (useLocation().state ?? {}) as { flags?: Partial<CoachNext['flags']>; variantId?: string };
  const [variantId, setVariantId] = useState(template.variants.find((v) => v.id === preset.variantId)?.id ?? template.variants[0].id);
  const [finisher, setFinisher] = useState(preset.flags?.finisher ?? true);
  const [badDay, setBadDay] = useState(preset.flags?.badDay ?? false);
  const [deload, setDeload] = useState(preset.flags?.deload ?? false);
  const [holds, setHolds] = useState<string[]>([]);
  const [presetNote, setPresetNote] = useState<string[]>(() => presetLabels(preset.flags, preset.variantId));
  useEffect(() => {
    let cancelled = false;
    getCoachNext().then((n) => {
      if (cancelled || !n || (n.templateId && n.templateId !== template.id)) return;
      if (n.flags?.badDay) setBadDay(true);
      if (n.flags?.deload) setDeload(true);
      if (n.flags?.finisher === false) setFinisher(false);
      if (n.variantId && template.variants.some((v) => v.id === n.variantId)) setVariantId(n.variantId);
      if (n.holds?.length) setHolds(n.holds);
      setPresetNote((cur) => [...new Set([...cur, ...presetLabels(n.flags, n.variantId), ...(n.holds ?? []).map((h) => `hold ${PRESCRIPTIONS[h]?.name ?? h}`)])]);
    });
    return () => {
      cancelled = true;
    };
  }, [template]);
  const rpOptions = restPauseOptions(template.id, variantId);
  const [restPauseSlot, setRestPauseSlot] = useState(rpOptions[0]?.key);
  const [rpPicked, setRpPicked] = useState(false);
  const [rpChoice, setRpChoice] = useState<RestPauseChoice>();
  const [prep, setPrep] = useState<Preparation>();
  const [prepOpts, setPrepOpts] = useState<SessionOptions>();
  /** Variations picked here; they feed back into the suggestions so targets match the variation. */
  const [variations, setVariations] = useState<Record<string, string>>({});
  /** Weights picked here, on top of the suggested plans. */
  const [loads, setLoads] = useState<Record<string, number>>({});
  const [ready, setReady] = useState<Record<string, boolean>>({});
  const [starting, setStarting] = useState(false);
  const sessions = useLiveQuery(() => db.sessions.toArray(), []);
  const runner = useLiveQuery(() => db.kv.get('runner'), []);

  const opts: SessionOptions = useMemo(
    () => ({ templateId: template.id, variantId, flags: { badDay, deload, finisher }, restPauseSlot, variations }),
    [template.id, variantId, badDay, deload, finisher, restPauseSlot, variations],
  );

  useEffect(() => {
    let cancelled = false;
    prepareSession(opts).then((p) => {
      if (cancelled) return;
      setPrep(p);
      setPrepOpts(opts);
    });
    return () => {
      cancelled = true;
    };
  }, [opts]);

  const plans: Record<string, SlotPlan> = Object.fromEntries(
    Object.entries(prep?.plans ?? {}).map(([k, plan]) => [
      k,
      { ...plan, ...(variations[k] ? { variationId: variations[k] } : {}), ...(loads[k] !== undefined ? { loadKg: loads[k] } : {}) },
    ]),
  );
  // Default the rest-pause finisher to the suggested one until the user picks.
  useEffect(() => {
    if (!prep || rpOptions.length < 2) return;
    let cancelled = false;
    lastRestPauseSlot(rpOptions.map((o) => o.key)).then((lastSlot) => {
      if (cancelled) return;
      const stalls = Object.fromEntries(rpOptions.map((o) => [o.basedOn ?? '', !!prep.suggestions[o.basedOn ?? '']?.stall]));
      const c = suggestRestPause(rpOptions, { stalls, today: [], lastSlot });
      setRpChoice(c);
      if (c && !rpPicked) setRestPauseSlot(c.slot);
    });
    return () => {
      cancelled = true;
    };
  }, [prep]);

  const variant = getVariant(template, variantId);
  const warnings = sessions ? warningsFor(template.id, sessions, Date.now()) : [];
  const hasFinisher = variant.blocks.some((b) => (b.kind === 'pair' || b.kind === 'rest-pause') && b.optional);
  const isRowing = template.id === 'row';

  const visible = prep
    ? prep.prescriptions
        .filter((p) => !p.key.includes('.rp-') || (finisher && p.key === restPauseSlot))
        .filter((p) => finisher || !variant.blocks.some((b) => b.kind === 'pair' && b.optional && b.exercises.some((e) => e.key === p.key)))
    : [];
  const weighted = visible.filter((p) => isLoadable(p, plans[p.key]?.variationId));
  const loadStep = prep?.settings.loadStep || LOAD_STEP_KG;

  // Don't start from a plan that is still being recomputed for the latest choices.
  const upToDate = !!prep && prepOpts === opts && (rpOptions.length < 2 || !!rpChoice);

  const start = async () => {
    if (!prep || !upToDate) return;
    setStarting(true);
    // A weight picked here that differs from the suggestion restarts that exercise at the bottom of its range.
    const suggestions: Record<string, Suggestion> = { ...prep.suggestions };
    for (const p of weighted) {
      const s = suggestions[p.key];
      const kg = plans[p.key]?.loadKg ?? 0;
      if (s && s.kind !== 'deload' && s.kind !== 'bad-day' && (s.plan.loadKg ?? 0) !== kg) {
        suggestions[p.key] = {
          ...s,
          kind: 'changed',
          repsTarget: s.repsTarget.map(() => p.reps.min),
          message: `Weight set to ${kg} kg — start at the bottom of the range (${p.reps.min}).`,
        };
      }
    }
    // Declining a suggested move to the next variation: repeat the top of the range on the current one.
    for (const p of visible) {
      const s = suggestions[p.key];
      if (s?.kind === 'next-variation' && plans[p.key]?.variationId !== s.plan.variationId) {
        suggestions[p.key] = {
          ...s,
          kind: 'hold',
          plan: { ...s.plan, variationId: plans[p.key]?.variationId },
          repsTarget: s.repsTarget.map(() => p.reps.max),
          message: `Staying on this variation — aim for ${p.reps.max} on every set again.`,
        };
      }
    }
    // Coach "hold": repeat last time's reps instead of progressing.
    for (const slot of holds) {
      const s = suggestions[slot];
      const last = prep.lastTime[slot];
      const p = prep.prescriptions.find((x) => x.key === slot);
      if (!s || !last || !p || (s.kind !== 'add-reps' && s.kind !== 'add-load' && s.kind !== 'next-variation')) continue;
      const clamp = (r: number) => Math.max(p.reps.min, Math.min(p.reps.max, r));
      suggestions[slot] = {
        ...s,
        kind: 'hold',
        plan: { ...s.plan, variationId: plans[slot]?.variationId ?? s.plan.variationId, loadKg: plans[slot]?.loadKg ?? last.loadKg ?? s.plan.loadKg },
        repsTarget: s.repsTarget.map((_, i) => clamp(last.reps[i] ?? last.reps[last.reps.length - 1] ?? p.reps.min)),
        message: `Coach: repeat last time (${last.reps.join('-')}) rather than adding reps.`,
      };
    }
    await startSession(opts, { ...prep, plans, suggestions });
    navigate('/run');
  };

  return (
    <div className="page">
      <div className="page-head">
        <div className="stack tight">
          <Link to="/" className="faint" style={{ textDecoration: 'none' }}>
            ‹ Today
          </Link>
          <h1>{template.name}</h1>
          <div className="muted">
            {template.subtitle}
            {prep && !isRowing && <> · est. {Math.round(estimateDurationSec(prep.steps, { targets: Object.fromEntries(Object.entries(prep.suggestions).map(([k, s]) => [k, s.repsTarget])) }) / 60)} min</>}
          </div>
        </div>
      </div>

      {runner?.value ? (
        <Note kind="warn">
          A session is already in progress.{' '}
          <Link to="/run">
            <b>Resume it</b>
          </Link>{' '}
          or end it before starting another.
        </Note>
      ) : null}

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <div className="stack">
          {prep && !isRowing && (
            <div className="card stack">
              <div className="row between">
                <div className="section-title">Prepare your weights</div>
                {weighted.length > 0 && weighted.every((p) => ready[p.key]) && (
                  <span className="badge good">
                    <IconCheck width={14} height={14} /> All set
                  </span>
                )}
              </div>
              {weighted.length === 0 ? (
                <div className="muted">No weights needed today — bodyweight only.</div>
              ) : (
                <div className="stack tight">
                  {weighted.map((p) => (
                    <WeightRow
                      key={p.key}
                      name={p.name}
                      kg={plans[p.key]?.loadKg ?? 0}
                      step={loadStep}
                      suggested={prep.suggestions[p.key]?.plan.loadKg}
                      last={prep.lastTime[p.key]?.loadKg}
                      ready={!!ready[p.key]}
                      onReady={() => setReady((s) => ({ ...s, [p.key]: !s[p.key] }))}
                      onChange={(kg) => setLoads((s) => ({ ...s, [p.key]: kg }))}
                    />
                  ))}
                  <div className="faint" style={{ fontSize: 14 }}>
                    Added weight in kg. Suggestions go up as you hit the top of the rep range.
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="card stack">
            <div className="muted">{template.intro}</div>
            {warnings.map((w) => (
              <Note key={w} kind="warn">
                {w}
              </Note>
            ))}
            {presetNote.length > 0 && <Note kind="info">Coach presets applied: {presetNote.join(', ')}. You can still change anything here.</Note>}
            {template.variants.length > 1 && (
              <>
                <div className="section-title">Workout</div>
                <Chips options={template.variants.map((v) => ({ id: v.id, label: v.name }))} value={variantId} onChange={setVariantId} />
                <div className="muted">{variant.description}</div>
              </>
            )}
            {!isRowing && (
              <>
                <ToggleRow
                  title="Bad day"
                  description="Poor sleep / high stress: do it anyway at ~3 RIR, don't chase progression."
                  checked={badDay}
                  onChange={setBadDay}
                />
                <ToggleRow title="Deload week" description="1–2 sets per exercise, ~3–4 RIR, same load." checked={deload} onChange={setDeload} />
                {hasFinisher && (
                  <ToggleRow
                    title={template.id === 'B' ? 'Rest-pause finisher (+3 min)' : 'Finisher'}
                    description="Drop it when short on time or energy — never the primary strength work."
                    checked={finisher}
                    onChange={setFinisher}
                  />
                )}
                {rpOptions.length > 1 && finisher && (
                  <>
                    <Chips
                      options={rpOptions.map((o) => ({ id: o.key, label: `${o.name}${rpChoice?.slot === o.key ? ' ★' : ''}` }))}
                      value={restPauseSlot}
                      onChange={(v) => {
                        setRpPicked(true);
                        setRestPauseSlot(v);
                      }}
                    />
                    <div className="faint" style={{ fontSize: 14 }}>
                      {rpChoice && <>★ {rpChoice.reason} </>}You can still switch during the session.
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        <div className="card stack">
          <div className="section-title">Plan & targets</div>
          {!prep ? (
            <div className="empty">Loading…</div>
          ) : isRowing ? (
            <RowingPlan variantId={variantId} />
          ) : (
            <div className="list">
              {visible.map((p) => (
                  <PlanRow
                    key={p.key}
                    p={p}
                    sets={prep.steps.filter((s) => s.kind === 'work' && s.slot === p.key).length}
                    message={prep.suggestions[p.key]?.message}
                    target={prep.suggestions[p.key]?.repsTarget}
                    plan={plans[p.key] ?? {}}
                    onVariation={(id) => setVariations((s) => ({ ...s, [p.key]: id }))}
                  />
                ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ position: 'sticky', bottom: 16 }}>
        <button className="btn primary huge block" onClick={start} disabled={!upToDate || starting || !!runner?.value} style={{ boxShadow: '0 8px 24px rgb(0 0 0 / 0.2)' }}>
          Start {template.shortName.toLowerCase()} session
        </button>
      </div>
    </div>
  );
}

function presetLabels(flags?: Partial<CoachNext['flags']>, variantId?: string): string[] {
  const out: string[] = [];
  if (flags?.deload) out.push('deload week');
  if (flags?.badDay) out.push('bad day');
  if (flags?.finisher === false) out.push('no finisher');
  if (variantId) out.push(variantId);
  return out;
}

function PlanRow(props: {
  p: Prescription;
  sets: number;
  message?: string;
  target?: number[];
  plan: SlotPlan;
  onVariation: (id: string) => void;
}) {
  const { p, sets, message, target, plan, onVariation } = props;
  const loadable = isLoadable(p, plan.variationId);
  return (
    <div className="stack tight">
      <div className="row between wrap">
        <div style={{ fontWeight: 700 }}>{p.name}</div>
        <div className="row" style={{ gap: 6 }}>
          <span className="badge">
            {sets} × {rangeText(p.reps)}
            {p.perSide ? ' /leg' : ''}
          </span>
          <span className="badge">{rangeText(p.rir)} RIR</span>
          {loadable && <span className="badge accent">+{plan.loadKg ?? 0} kg</span>}
        </div>
      </div>
      {message && (
        <div className="muted" style={{ fontSize: 15 }}>
          {message}
          {target && target.length > 0 && <span className="faint"> Target: {target.join(' · ')}</span>}
        </div>
      )}
      {p.variations && (
        <VariationSelect variations={p.variations} value={plan.variationId ?? p.defaultVariation} onChange={onVariation} />
      )}
    </div>
  );
}

function WeightRow(props: {
  name: string;
  kg: number;
  step: number;
  suggested?: number;
  last?: number;
  ready: boolean;
  onReady: () => void;
  onChange: (kg: number) => void;
}) {
  const { name, kg, step, suggested, last, ready, onReady, onChange } = props;
  let hint: string;
  if (last === undefined) hint = 'First time — pick a weight you can move for the whole range';
  else if (kg > last) hint = `Up from ${last} kg last time`;
  else if (kg < last) hint = `Down from ${last} kg last time`;
  else hint = 'Same as last time';
  if (suggested !== undefined && suggested !== kg) hint += ` · suggested ${suggested} kg`;
  const set = (v: number) => onChange(Math.max(0, Math.round(v * 100) / 100));

  return (
    <div className={`weight-row${ready ? ' ready' : ''}`}>
      <button type="button" className="weight-check" onClick={onReady} aria-pressed={ready} aria-label={`${name} weight ready`}>
        {ready && <IconCheck width={20} height={20} />}
      </button>
      <div className="weight-name">
        <div style={{ fontWeight: 650 }}>{name}</div>
        <div className={`weight-hint${last !== undefined && kg > last ? ' up' : ''}`}>{hint}</div>
      </div>
      <div className="weight-picker">
        <button type="button" onClick={() => set(kg - step)} aria-label={`Less weight for ${name}`}>
          −
        </button>
        <div className="weight-value num">
          {kg}
          <small>kg</small>
        </div>
        <button type="button" onClick={() => set(kg + step)} aria-label={`More weight for ${name}`}>
          +
        </button>
      </div>
    </div>
  );
}

function RowingPlan({ variantId }: { variantId: string }) {
  const variant = getVariant(getTemplate('row'), variantId);
  const block = variant.blocks[0];
  if (block.kind !== 'interval') return null;
  return (
    <div className="stack tight">
      {block.phases.map((ph, i) => (
        <div key={i} className="row between" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
          <span className="row" style={{ gap: 10 }}>
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: 4,
                background: ph.intensity === 'hard' ? 'var(--hard)' : ph.intensity === 'easy' ? 'var(--rest)' : 'var(--accent)',
              }}
            />
            {ph.label}
          </span>
          <span className="num muted">{formatClock(ph.durationSec)}</span>
        </div>
      ))}
      <div className="faint" style={{ marginTop: 8 }}>
        Total {formatClock(block.phases.reduce((a, p) => a + p.durationSec, 0))}. Hard = just sustainable for the interval.
      </div>
    </div>
  );
}
