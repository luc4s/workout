/** High-level coach calls: build the context pack, call Claude, parse the answer. */
import type { TemplateId } from '../data/types';
import type { SessionRecord, SetRecord, Settings } from '../db/db';
import type { SessionOverview, SessionRecommendation, SessionReview, SetFeedback, TrainingStats } from '../logic/coach';
import type { RunnerState } from '../logic/runner';
import { callCoach, type CoachDeps, type CoachResult } from './client';
import { buildAnalysisContext, buildBriefContext, buildRestContext, buildReviewContext, slotsOfTemplate } from './context';
import { USER_PROMPTS } from './prompts';
import { ANALYSIS_SCHEMA, BRIEF_SCHEMA, parseAnalysis, parseBrief, parseRestNote, parseReview, REST_NOTE_SCHEMA, REVIEW_SCHEMA, type Analysis, type Brief, type RestNote, type Review } from './schema';
import { PRESCRIPTIONS } from '../data/program';

const json = (v: unknown) => JSON.stringify(v);

export function askBrief(
  input: { rec: SessionRecommendation; overview?: SessionOverview; sessions: SessionRecord[]; sets: SetRecord[]; settings: Settings; now: number; signal?: AbortSignal },
  deps?: CoachDeps,
): Promise<CoachResult<Brief>> {
  const ctx = buildBriefContext(input);
  const slots = slotsOfTemplate(input.rec.templateId);
  return callCoach(
    { id: `brief:${ctx.today}:${input.rec.templateId}`, kind: 'brief', user: USER_PROMPTS.brief + json(ctx), schema: BRIEF_SCHEMA as unknown as Record<string, unknown>, signal: input.signal },
    (raw) => parseBrief(raw, slots),
    deps,
  );
}

export function askRestNote(
  input: { state: RunnerState; feedback: SetFeedback; record: SetRecord; today: SetRecord[]; sessions: SessionRecord[]; sets: SetRecord[]; settings: Settings; now: number; signal?: AbortSignal },
  deps?: CoachDeps,
): Promise<CoachResult<RestNote>> {
  const ctx = buildRestContext(input);
  const slots = slotsOfTemplate(input.state.templateId);
  return callCoach(
    {
      id: `note:${input.state.sessionId}:${input.feedback.stepId}:${input.record.completedAt}`,
      kind: 'rest-note',
      user: USER_PROMPTS['rest-note'] + json(ctx),
      schema: REST_NOTE_SCHEMA as unknown as Record<string, unknown>,
      signal: input.signal,
    },
    (raw) => parseRestNote(raw, slots),
    deps,
  );
}

export function askReview(
  input: { review: SessionReview; session: SessionRecord; sets: SetRecord[]; sessions: SessionRecord[]; allSets: SetRecord[]; settings: Settings; now: number; signal?: AbortSignal },
  deps?: CoachDeps,
): Promise<CoachResult<Review>> {
  const ctx = buildReviewContext(input);
  const slots = slotsOfTemplate(input.session.templateId as TemplateId);
  return callCoach(
    { id: `review:${input.session.id}:${input.now}`, kind: 'review', user: USER_PROMPTS.review + json(ctx), schema: REVIEW_SCHEMA as unknown as Record<string, unknown>, signal: input.signal },
    (raw) => parseReview(raw, slots),
    deps,
  );
}

export function askAnalysis(
  input: { stats: TrainingStats; sessions: SessionRecord[]; sets: SetRecord[]; settings: Settings; now: number; signal?: AbortSignal },
  deps?: CoachDeps,
): Promise<CoachResult<Analysis>> {
  const ctx = buildAnalysisContext(input);
  const slots = Object.keys(PRESCRIPTIONS);
  return callCoach(
    { id: `analysis:${input.now}`, kind: 'analysis', user: USER_PROMPTS.analysis + json(ctx), schema: ANALYSIS_SCHEMA as unknown as Record<string, unknown>, signal: input.signal },
    (raw) => parseAnalysis(raw, slots),
    deps,
  );
}

/** "Test connection": a tiny call that also warms the prompt cache. */
export function pingCoach(deps?: CoachDeps): Promise<CoachResult<string>> {
  return callCoach({ id: `ping:${Date.now()}`, kind: 'ping', user: '' }, (raw) => String(raw), deps);
}
