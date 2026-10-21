/**
 * Maps an accepted coach suggestion to an existing app mechanism. Nothing here is new behaviour:
 * setup presets, runner actions, settings — the same things the user could tap by hand.
 */
import { PRESCRIPTIONS } from '../data/program';
import type { TemplateId } from '../data/types';
import { saveSettings, type Settings } from '../db/db';
import type { CoachSuggestion } from '../logic/coach';
import { restPauseLabel, variationOf } from '../logic/progression';
import type { RunnerAction, RunnerState } from '../logic/runner';
import { setSessionFlags } from '../logic/session';
import { isOptionalSlot, remainingSetsOf, type WorkStep } from '../logic/steps';
import { mergeCoachNext } from './store';

export type ApplyScope = 'home' | 'runner' | 'summary';

/** True when every work step after the current one matches `dropped`, i.e. nothing is left to do. */
function nothingAfter(state: RunnerState | undefined, dropped: (s: WorkStep) => boolean): boolean {
  if (!state) return false;
  return state.steps.slice(state.index + 1).every((s) => s.kind !== 'work' || dropped(s));
}

export interface ApplyContext {
  settings: Settings;
  /** Template the suggestion is about (home: the recommended one; runner / summary: the session's). */
  templateId: TemplateId;
  navigate?: (to: string, opts?: { state?: unknown }) => void;
  dispatch?: (a: RunnerAction) => void;
  state?: RunnerState;
}

export function suggestionId(s: CoachSuggestion): string {
  return `${s.kind}:${s.slot ?? ''}:${s.value ?? ''}`;
}

const name = (slot?: string) => (slot ? (slot.includes('.rp-') ? restPauseLabel(PRESCRIPTIONS[slot]) : PRESCRIPTIONS[slot]?.name ?? slot) : '');

/** Button label, e.g. "Deload week" or "Dips: +12.5 kg". */
export function suggestionLabel(s: CoachSuggestion): string {
  switch (s.kind) {
    case 'deload':
      return 'Deload week';
    case 'bad-day':
      return 'Bad-day mode';
    case 'drop-sets':
      return `${name(s.slot)}: skip remaining sets`;
    case 'hold':
      return `${name(s.slot)}: hold targets`;
    case 'variation': {
      const v = s.slot ? variationOf(PRESCRIPTIONS[s.slot], String(s.value)) : undefined;
      return `${name(s.slot)}: ${v?.name ?? s.value}`;
    }
    case 'load':
      return `${name(s.slot)}: ${s.value} kg`;
    case 'rest':
      return `Rest timer ×${s.value}`;
    case 'skip-finisher':
      return 'Skip the finisher';
    case 'switch-session':
      return `Do ${s.value === 'micro' ? 'the micro session' : s.value === 'row' ? 'rowing' : `Session ${s.value}`}`;
  }
}

/** Whether the suggestion can be applied in this scope / state (e.g. no mid-session deload). */
export function canApply(s: CoachSuggestion, scope: ApplyScope, state?: RunnerState): boolean {
  switch (s.kind) {
    case 'deload':
      return scope !== 'runner';
    case 'bad-day':
      return scope !== 'summary' && !(scope === 'runner' && state?.flags.badDay);
    case 'drop-sets':
      return scope === 'runner' && !!state && !!s.slot && remainingSetsOf(state.steps, state.index, s.slot) > 0;
    case 'hold':
      return scope !== 'runner';
    case 'variation':
    case 'load':
      return scope !== 'runner' || (!!state && !!s.slot && remainingSetsOf(state.steps, state.index, s.slot) > 0);
    case 'rest':
      return true;
    case 'skip-finisher':
      return scope !== 'runner' || (!!state && state.flags.finisher);
    case 'switch-session':
      return scope !== 'runner';
  }
}

/** Applies the suggestion; returns a one-line confirmation. */
export async function applySuggestion(s: CoachSuggestion, scope: ApplyScope, ctx: ApplyContext): Promise<string> {
  const kg = typeof s.value === 'number' ? s.value : Number(s.value);
  switch (s.kind) {
    case 'deload':
      if (scope === 'home') ctx.navigate?.(`/setup/${ctx.templateId}`, { state: { flags: { deload: true } } });
      else await mergeCoachNext({ flags: { deload: true } });
      return scope === 'home' ? 'Setting up a deload session.' : 'Next session will be set up as a deload.';
    case 'bad-day':
      if (scope === 'runner' && ctx.state) {
        ctx.dispatch?.({ type: 'setFlags', flags: { badDay: true }, now: Date.now() });
        await setSessionFlags(ctx.state.sessionId, { badDay: true });
        return 'Bad-day mode: ~3 RIR from here, this session will not count against progression.';
      }
      ctx.navigate?.(`/setup/${ctx.templateId}`, { state: { flags: { badDay: true } } });
      return 'Setting up a bad-day session.';
    case 'drop-sets':
      ctx.dispatch?.({ type: 'dropRemaining', slot: s.slot! });
      return `Remaining ${name(s.slot)} sets skipped.${nothingAfter(ctx.state, (st) => st.slot === s.slot) ? ' That was the last set — finish when ready.' : ''}`;
    case 'hold':
      await mergeCoachNext({ holds: [s.slot!] });
      return `${name(s.slot)} will repeat today's targets next time.`;
    case 'variation': {
      const id = String(s.value);
      if (scope === 'runner') ctx.dispatch?.({ type: 'plan', slot: s.slot!, plan: { variationId: id } });
      else await saveSettings({ variations: { ...ctx.settings.variations, [s.slot!]: id } });
      return `${name(s.slot)}: ${variationOf(PRESCRIPTIONS[s.slot!], id)?.name ?? id} selected.`;
    }
    case 'load': {
      const step = ctx.settings.loadStep || 2.5;
      const rounded = Math.round(kg / step) * step;
      if (scope === 'runner') ctx.dispatch?.({ type: 'plan', slot: s.slot!, plan: { loadKg: rounded } });
      else await saveSettings({ loads: { ...ctx.settings.loads, [s.slot!]: rounded } });
      return `${name(s.slot)}: ${rounded} kg${scope === 'runner' ? ' for the remaining sets' : ''}.`;
    }
    case 'rest': {
      await saveSettings({ restScale: kg });
      if (scope === 'runner' && ctx.state?.steps[ctx.state.index]?.kind === 'rest') ctx.dispatch?.({ type: 'adjustRest', deltaSec: kg < 1 ? -15 : kg > 1 ? 15 : 0 });
      return `Rest timer set to ×${kg}${scope === 'runner' ? ' from the next session' : ''}.`;
    }
    case 'skip-finisher':
      if (scope === 'runner' && ctx.state) {
        ctx.dispatch?.({ type: 'setFlags', flags: { finisher: false }, now: Date.now() });
        await setSessionFlags(ctx.state.sessionId, { finisher: false });
        return `Finisher dropped for today.${nothingAfter(ctx.state, (st) => !!st.restPause || isOptionalSlot(st.slot)) ? ' That was the last set — finish when ready.' : ''}`;
      }
      if (scope === 'home') ctx.navigate?.(`/setup/${ctx.templateId}`, { state: { flags: { finisher: false } } });
      else await mergeCoachNext({ flags: { finisher: false } });
      return scope === 'home' ? 'Setting up without the finisher.' : 'Next session will skip the finisher.';
    case 'switch-session': {
      const t = String(s.value) as TemplateId;
      if (scope === 'home') ctx.navigate?.(`/setup/${t}`);
      else await mergeCoachNext({ templateId: t });
      return scope === 'home' ? `Setting up ${t}.` : `Next up: ${t}.`;
    }
  }
}
