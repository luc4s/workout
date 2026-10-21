/**
 * One function, `callCoach`, wraps every Claude call: dynamic SDK import (the SDK is never loaded
 * without a key), structured output, Fable 5.1 with a one-shot fallback to Opus 5.5 on quota /
 * capacity / refusal, usage accounting, in-flight dedupe and abort. It never throws.
 */
import type { MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/messages';
import { PING_PROMPT, SYSTEM_PROMPT } from './prompts';
import { getCoachConfig, recordUsage } from './store';

export type CoachKind = 'brief' | 'rest-note' | 'review' | 'analysis' | 'ping';

export const PRIMARY_MODEL = 'claude-fable-5-1';
export const FALLBACK_MODEL = 'claude-opus-5-5';

const MODEL_LABELS: Record<string, string> = { 'claude-fable-5-1': 'Fable 5.1', 'claude-opus-5-5': 'Opus 5.5' };

/** Short label for the UI, e.g. "Fable 5.1" or "Opus 5.5 · fallback". */
export function modelLabel(model: string, fallback?: boolean): string {
  const base = MODEL_LABELS[model] ?? model.replace(/^claude-/, '').replace(/-/g, ' ');
  return fallback ? `${base} · fallback` : base;
}

/** USD per million tokens: input, output, cache read, cache write. */
const PRICES: Record<string, [number, number, number, number]> = {
  'claude-fable-5-1': [10, 50, 0.25, 12.5],
  'claude-opus-5-5': [4, 20, 0.2, 5],
};

export interface CoachUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  costUsd: number;
}

export interface CoachRequest {
  /** Dedupe key: identical in-flight requests share one call. */
  id: string;
  kind: CoachKind;
  /** The user message (context pack). Ignored for `ping`. */
  user: string;
  /** JSON schema for structured output (none for `ping`). */
  schema?: Record<string, unknown>;
  signal?: AbortSignal;
}

export type CoachFailure = 'no-key' | 'offline' | 'aborted' | 'refusal' | 'quota' | 'auth' | 'bad-json' | 'error';

export type CoachResult<T> =
  | { ok: true; data: T; model: string; fallback: boolean; usage: CoachUsage; at: number }
  | { ok: false; reason: CoachFailure; message: string; model?: string };

export interface CoachDeps {
  apiKey?: string;
  fetch?: typeof fetch;
  online?: boolean;
  now?: () => number;
  /** Record usage in the device-local store (default true). */
  record?: boolean;
}

const LIMITS: Record<CoachKind, { maxTokens: number; effort: 'low' | 'high'; timeoutMs: number; retries: number }> = {
  'rest-note': { maxTokens: 600, effort: 'low', timeoutMs: 25_000, retries: 0 },
  brief: { maxTokens: 2000, effort: 'high', timeoutMs: 60_000, retries: 1 },
  review: { maxTokens: 3000, effort: 'high', timeoutMs: 60_000, retries: 1 },
  analysis: { maxTokens: 5000, effort: 'high', timeoutMs: 90_000, retries: 1 },
  ping: { maxTokens: 256, effort: 'low', timeoutMs: 30_000, retries: 0 },
};

type Sdk = typeof import('@anthropic-ai/sdk');
let sdkPromise: Promise<Sdk> | undefined;
function loadSdk(): Promise<Sdk> {
  return (sdkPromise ??= import('@anthropic-ai/sdk'));
}

const inFlight = new Map<string, Promise<CoachResult<unknown>>>();

export function costOf(model: string, u: Omit<CoachUsage, 'costUsd'>): number {
  const [inP, outP, readP, writeP] = PRICES[model] ?? PRICES[FALLBACK_MODEL];
  return (u.input * inP + u.output * outP + u.cacheRead * readP + u.cacheWrite * writeP) / 1e6;
}

export async function callCoach<T>(req: CoachRequest, parse: (raw: unknown) => T | undefined, deps: CoachDeps = {}): Promise<CoachResult<T>> {
  const existing = inFlight.get(req.id);
  if (existing) return existing as Promise<CoachResult<T>>;
  const p = run(req, parse, deps).finally(() => inFlight.delete(req.id));
  inFlight.set(req.id, p);
  return p;
}

async function run<T>(req: CoachRequest, parse: (raw: unknown) => T | undefined, deps: CoachDeps): Promise<CoachResult<T>> {
  const apiKey = deps.apiKey ?? (await getCoachConfig()).apiKey;
  if (!apiKey) return { ok: false, reason: 'no-key', message: 'No API key set.' };
  const online = deps.online ?? (typeof navigator === 'undefined' || navigator.onLine !== false);
  if (!online) return { ok: false, reason: 'offline', message: 'Offline.' };
  if (req.signal?.aborted) return { ok: false, reason: 'aborted', message: 'Cancelled.' };

  let sdk: Sdk;
  try {
    sdk = await loadSdk();
  } catch (e) {
    return { ok: false, reason: 'offline', message: `Coach code not available offline (${(e as Error).message}).` };
  }
  const limits = LIMITS[req.kind];
  const client = new sdk.default({
    apiKey,
    dangerouslyAllowBrowser: true,
    maxRetries: limits.retries,
    timeout: limits.timeoutMs,
    ...(deps.fetch ? { fetch: deps.fetch } : {}),
  });

  const attempt = async (model: string, fallback: boolean): Promise<CoachResult<T> & { retry?: boolean }> => {
    const params: MessageCreateParamsNonStreaming = {
      model,
      max_tokens: limits.maxTokens,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: req.kind === 'ping' ? PING_PROMPT : req.user }],
      output_config: { effort: limits.effort, ...(req.schema ? { format: { type: 'json_schema', schema: req.schema } } : {}) },
    };
    let msg;
    try {
      msg = await client.messages.create(params, { signal: req.signal });
    } catch (err) {
      return classify(sdk, err, model);
    }
    const u = msg.usage;
    const usage: CoachUsage = {
      input: u.input_tokens,
      output: u.output_tokens,
      cacheRead: u.cache_read_input_tokens ?? 0,
      cacheWrite: u.cache_creation_input_tokens ?? 0,
      costUsd: 0,
    };
    usage.costUsd = costOf(msg.model, usage);
    if (deps.record !== false) recordUsage(usage, deps.now?.()).catch(() => undefined);
    if (msg.stop_reason === 'refusal') {
      return { ok: false, reason: 'refusal', message: msg.stop_details?.explanation ?? 'The model declined this request.', model: msg.model, retry: true };
    }
    const text = msg.content.find((b) => b.type === 'text')?.text ?? '';
    if (req.kind === 'ping') return { ok: true, data: text as unknown as T, model: msg.model, fallback, usage, at: deps.now?.() ?? Date.now() };
    if (msg.stop_reason === 'max_tokens') return { ok: false, reason: 'bad-json', message: 'Answer was cut off.', model: msg.model };
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return { ok: false, reason: 'bad-json', message: 'Answer was not valid JSON.', model: msg.model };
    }
    const data = parse(raw);
    if (data === undefined) return { ok: false, reason: 'bad-json', message: 'Answer did not match the expected shape.', model: msg.model };
    return { ok: true, data, model: msg.model, fallback, usage, at: deps.now?.() ?? Date.now() };
  };

  const first = await attempt(PRIMARY_MODEL, false);
  if (first.ok || !first.retry || req.signal?.aborted) return strip(first);
  const second = await attempt(FALLBACK_MODEL, true);
  return strip(second);
}

function strip<T>(r: CoachResult<T> & { retry?: boolean }): CoachResult<T> {
  const { retry: _retry, ...rest } = r;
  return rest as CoachResult<T>;
}

/** Maps an SDK error to a result; `retry` marks the quota / capacity / availability cases worth one try on the fallback model. */
function classify<T>(sdk: Sdk, err: unknown, model: string): CoachResult<T> & { retry?: boolean } {
  const message = err instanceof Error ? err.message : String(err);
  if (err instanceof sdk.APIUserAbortError) return { ok: false, reason: 'aborted', message: 'Cancelled.', model };
  if (err instanceof sdk.RateLimitError) return { ok: false, reason: 'quota', message: `Rate limited (${message}).`, model, retry: true };
  if (err instanceof sdk.InternalServerError) return { ok: false, reason: 'quota', message: `Service unavailable (${message}).`, model, retry: true };
  if (err instanceof sdk.NotFoundError) return { ok: false, reason: 'error', message: `Model not available on this key (${message}).`, model, retry: true };
  if (err instanceof sdk.AuthenticationError || err instanceof sdk.PermissionDeniedError) return { ok: false, reason: 'auth', message: 'Invalid API key.', model };
  if (err instanceof sdk.BadRequestError) return { ok: false, reason: 'error', message, model };
  if (err instanceof sdk.APIConnectionError) return { ok: false, reason: 'offline', message: `No connection (${message}).`, model };
  return { ok: false, reason: 'error', message, model };
}
