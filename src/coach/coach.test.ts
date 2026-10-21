import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { getTemplate, PRESCRIPTIONS } from '../data/program';
import { db, DEFAULT_SETTINGS, type SessionRecord, type SetRecord } from '../db/db';
import { recommendSession, sessionReview, trainingStats } from '../logic/coach';
import { askAnalysis, askBrief, askReview, pingCoach } from './ask';
import { callCoach, costOf, FALLBACK_MODEL, modelLabel, PRIMARY_MODEL } from './client';
import { buildAnalysisContext, buildBriefContext, recentSessions } from './context';
import { SYSTEM_PROMPT } from './prompts';
import { ANALYSIS_SCHEMA, BRIEF_SCHEMA, parseAnalysis, parseRestNote, REST_NOTE_SCHEMA, sanitizeSuggestions } from './schema';
import { getCoachConfig } from './store';

type Body = Record<string, unknown>;

function message(text: string, overrides: Body = {}): Body {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: PRIMARY_MODEL,
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    stop_details: null,
    usage: { input_tokens: 1200, output_tokens: 300, cache_read_input_tokens: 1000, cache_creation_input_tokens: 0 },
    ...overrides,
  };
}

function reply(status: number, body: Body): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'request-id': 'req_1' } });
}

/** A fake fetch that answers from a script and records every request body. */
function fakeFetch(script: ((body: Body, headers: Headers) => Response)[]) {
  const calls: { body: Body; headers: Headers; url: string }[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as Body;
    const headers = new Headers(init?.headers as HeadersInit);
    calls.push({ body, headers, url: String(input) });
    const step = script[Math.min(calls.length - 1, script.length - 1)];
    return step(body, headers);
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

const NOTE = { note: 'Seven of eight at 1 RIR — solid. Same again.', cue: 'Full range, +1 if crisp', suggestion: null };
const deps = (f: typeof fetch) => ({ apiKey: 'sk-ant-test', fetch: f, online: true, record: false });
const noteReq = (id = 'n1') => ({ id, kind: 'rest-note' as const, user: 'ctx', schema: REST_NOTE_SCHEMA as unknown as Record<string, unknown> });
const parseNote = (raw: unknown) => parseRestNote(raw, ['A.dip']);

describe('callCoach', () => {
  it('sends a structured-output request on Fable with a cached system prompt and parses the answer', async () => {
    const f = fakeFetch([() => reply(200, message(JSON.stringify(NOTE)))]);
    const r = await callCoach(noteReq(), parseNote, deps(f.fn));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.note).toBe(NOTE.note);
    expect(r.model).toBe(PRIMARY_MODEL);
    expect(r.fallback).toBe(false);
    expect(r.usage).toMatchObject({ input: 1200, output: 300, cacheRead: 1000 });
    expect(r.usage.costUsd).toBeCloseTo((1200 * 10 + 300 * 50 + 1000 * 0.25) / 1e6);
    const { body, headers, url } = f.calls[0];
    expect(url).toMatch(/\/v1\/messages$/);
    expect(headers.get('x-api-key')).toBe('sk-ant-test');
    expect(headers.get('anthropic-dangerous-direct-browser-access')).toBe('true');
    expect(body.model).toBe(PRIMARY_MODEL);
    expect(body.thinking).toBeUndefined();
    expect(body.tool_choice).toBeUndefined();
    expect((body.output_config as Body).effort).toBe('low');
    expect(((body.output_config as Body).format as Body).type).toBe('json_schema');
    expect((body.system as Body[])[0].cache_control).toEqual({ type: 'ephemeral' });
    expect((body.system as Body[])[0].text).toBe(SYSTEM_PROMPT);
  });

  it('falls back to Opus once on a rate limit, an overload and a refusal', async () => {
    for (const first of [
      () => reply(429, { type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } }),
      () => reply(529, { type: 'error', error: { type: 'overloaded_error', message: 'overloaded' } }),
      () => reply(404, { type: 'error', error: { type: 'not_found_error', message: 'model not found' } }),
      () => reply(200, message('', { content: [], stop_reason: 'refusal', stop_details: { type: 'refusal', category: null, explanation: 'no' } })),
    ]) {
      const f = fakeFetch([first, (body) => reply(200, message(JSON.stringify(NOTE), { model: body.model as string }))]);
      const r = await callCoach(noteReq(), parseNote, deps(f.fn));
      expect(f.calls.map((c) => c.body.model)).toEqual([PRIMARY_MODEL, FALLBACK_MODEL]);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.model).toBe(FALLBACK_MODEL);
        expect(r.fallback).toBe(true);
        expect((f.calls[1].body.output_config as Body).effort).toBe('low');
      }
    }
  });

  it('a refusal on both models is reported as a refusal', async () => {
    const refusal = () => reply(200, message('', { content: [], stop_reason: 'refusal' }));
    const f = fakeFetch([refusal, refusal]);
    const r = await callCoach(noteReq(), parseNote, deps(f.fn));
    expect(r).toMatchObject({ ok: false, reason: 'refusal' });
    expect(f.calls).toHaveLength(2);
  });

  it('an invalid key is reported without a fallback', async () => {
    const f = fakeFetch([() => reply(401, { type: 'error', error: { type: 'authentication_error', message: 'bad key' } })]);
    const r = await callCoach(noteReq(), parseNote, deps(f.fn));
    expect(r).toMatchObject({ ok: false, reason: 'auth' });
    expect(f.calls).toHaveLength(1);
  });

  it('a 400 surfaces the API message (e.g. data retention) without a fallback', async () => {
    const f = fakeFetch([() => reply(400, { type: 'error', error: { type: 'invalid_request_error', message: 'retention policy' } })]);
    const r = await callCoach(noteReq(), parseNote, deps(f.fn));
    expect(r).toMatchObject({ ok: false, reason: 'error' });
    if (!r.ok) expect(r.message).toMatch(/retention/);
    expect(f.calls).toHaveLength(1);
  });

  it('bad JSON and a truncated answer are reported, not thrown', async () => {
    const f = fakeFetch([() => reply(200, message('not json'))]);
    expect(await callCoach(noteReq(), parseNote, deps(f.fn))).toMatchObject({ ok: false, reason: 'bad-json' });
    const g = fakeFetch([() => reply(200, message('{"note":', { stop_reason: 'max_tokens' }))]);
    expect(await callCoach(noteReq(), parseNote, deps(g.fn))).toMatchObject({ ok: false, reason: 'bad-json' });
    const h = fakeFetch([() => reply(200, message(JSON.stringify({ nope: 1 })))]);
    expect(await callCoach(noteReq(), parseNote, deps(h.fn))).toMatchObject({ ok: false, reason: 'bad-json' });
  });

  it('never calls out without a key, offline, or once aborted', async () => {
    const f = fakeFetch([() => reply(200, message(JSON.stringify(NOTE)))]);
    expect(await callCoach(noteReq(), parseNote, { ...deps(f.fn), apiKey: undefined })).toMatchObject({ ok: false, reason: 'no-key' });
    expect(await callCoach(noteReq(), parseNote, { ...deps(f.fn), online: false })).toMatchObject({ ok: false, reason: 'offline' });
    const ac = new AbortController();
    ac.abort();
    expect(await callCoach({ ...noteReq(), signal: ac.signal }, parseNote, deps(f.fn))).toMatchObject({ ok: false, reason: 'aborted' });
    expect(f.calls).toHaveLength(0);
  });

  it('a connection failure is reported as offline and does not fall back', async () => {
    const fn = vi.fn(async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    const r = await callCoach(noteReq(), parseNote, deps(fn));
    expect(r).toMatchObject({ ok: false, reason: 'offline' });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('identical in-flight requests share one call', async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((res) => (release = res));
    const f = fakeFetch([
      () => {
        return reply(200, message(JSON.stringify(NOTE)));
      },
    ]);
    const slow = (async (...a: Parameters<typeof fetch>) => {
      await gate;
      return f.fn(...a);
    }) as typeof fetch;
    const p1 = callCoach(noteReq('same'), parseNote, deps(slow));
    const p2 = callCoach(noteReq('same'), parseNote, deps(slow));
    release!();
    const [a, b] = await Promise.all([p1, p2]);
    expect(a).toBe(b);
    expect(f.calls).toHaveLength(1);
  });

  it('records usage in the device-local store', async () => {
    const f = fakeFetch([() => reply(200, message(JSON.stringify(NOTE)))]);
    await callCoach(noteReq('rec'), parseNote, { apiKey: 'k', fetch: f.fn, online: true, now: () => new Date(2026, 9, 21).getTime() });
    await new Promise((r) => setTimeout(r, 10));
    const cfg = await getCoachConfig();
    expect(cfg.usage['2026-10']).toMatchObject({ calls: 1, input: 1200, output: 300 });
    expect(cfg.apiKey).toBeUndefined();
    await db.kv.delete('coach');
  });

  it('ping works without a schema and reports the served model', async () => {
    const f = fakeFetch([() => reply(200, message('OK'))]);
    const r = await pingCoach(deps(f.fn));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toBe('OK');
    expect((f.calls[0].body.output_config as Body).format).toBeUndefined();
    expect(modelLabel(FALLBACK_MODEL, true)).toBe('Opus 5.5 · fallback');
    expect(costOf('unknown-model', { input: 1e6, output: 0, cacheRead: 0, cacheWrite: 0 })).toBe(4);
  });
});

describe('schema guards', () => {
  const slots = ['A.pullup', 'A.dip', 'A.bss'];
  it('keeps only applicable suggestions', () => {
    const out = sanitizeSuggestions(
      [
        { kind: 'DELOAD', slot: '', value: '', reason: 'tired' },
        { kind: 'massage', slot: '', value: '', reason: 'x' },
        { kind: 'load', slot: 'B.pushup', value: '5', reason: 'x' },
        { kind: 'load', slot: 'A.dip', value: 'lots', reason: 'x' },
        { kind: 'load', slot: 'A.dip', value: '12.5', reason: 'heavier' },
        { kind: 'variation', slot: 'A.dip', value: 'ring', reason: 'x' },
        { kind: 'variation', slot: 'A.dip', value: 'unicorn', reason: 'x' },
        { kind: 'rest', slot: '', value: '0.5', reason: 'x' },
        { kind: 'rest', slot: '', value: '0.75', reason: 'shorter' },
        { kind: 'drop-sets', slot: 'A.bss', value: '2', reason: 'x' },
        { kind: 'switch-session', slot: '', value: 'yoga', reason: 'x' },
        { kind: 'hold', slot: 'A.pullup', value: '', reason: '' },
      ],
      slots,
      10,
    );
    expect(out).toEqual([
      { kind: 'deload', reason: 'tired' },
      { kind: 'load', slot: 'A.dip', value: 12.5, reason: 'heavier' },
      { kind: 'variation', slot: 'A.dip', value: 'ring', reason: 'x' },
      { kind: 'rest', value: 0.75, reason: 'shorter' },
      { kind: 'drop-sets', slot: 'A.bss', value: 2, reason: 'x' },
    ]);
    expect(sanitizeSuggestions([{ kind: 'deload', reason: 'a' }, { kind: 'bad-day', reason: 'b' }], slots, 1)).toHaveLength(1);
  });

  it('rest notes are clamped', () => {
    const long = 'x'.repeat(500);
    const n = parseRestNote({ note: long, cue: long, suggestion: { kind: 'bad-day', slot: '', value: '', reason: 'r' } }, slots)!;
    expect(n.note).toHaveLength(400);
    expect(n.cue).toHaveLength(60);
    expect(n.suggestion?.kind).toBe('bad-day');
    expect(parseRestNote({ cue: 'x' }, slots)).toBeUndefined();
  });

  it('schemas are closed objects with every property required', () => {
    const walk = (node: unknown) => {
      if (!node || typeof node !== 'object') return;
      const o = node as Record<string, unknown>;
      if (o.type === 'object') {
        expect(o.additionalProperties).toBe(false);
        expect(o.required).toEqual(Object.keys(o.properties as object));
      }
      for (const v of Object.values(o)) walk(v);
    };
    walk(BRIEF_SCHEMA);
    walk(REST_NOTE_SCHEMA);
    walk(ANALYSIS_SCHEMA);
  });

  it('analysis answers are validated and clamped', () => {
    const a = parseAnalysis(
      { headline: 'H', summary: 'S', trends: [{ slot: 'A.dip', trend: 'UP', note: 'n' }, { slot: 'nope', trend: 'up', note: 'x' }], strengths: ['a', 'b', 'c', 'd'], concerns: [], recommendations: 'nope', suggestions: [{ kind: 'switch-session', slot: '', value: 'micro', reason: 'r' }] },
      ['A.dip'],
    )!;
    expect(a.trends).toEqual([{ slot: 'A.dip', trend: 'up', note: 'n' }]);
    expect(a.strengths).toHaveLength(3);
    expect(a.recommendations).toEqual([]);
    expect(a.suggestions[0]).toEqual({ kind: 'switch-session', value: 'micro', reason: 'r' });
    expect(parseAnalysis({ headline: 'H' }, [])).toBeUndefined();
  });
});

describe('context and prompt', () => {
  const DAY = 24 * 3600 * 1000;
  const monday = new Date(2026, 8, 14, 18).getTime();
  const sessions: SessionRecord[] = [];
  const sets: SetRecord[] = [];
  for (let i = 0; i < 10; i++) {
    const s: SessionRecord = { id: i + 1, templateId: i % 2 ? 'B' : 'A', variantId: 'standard', startedAt: monday - (10 - i) * 3 * DAY, endedAt: monday - (10 - i) * 3 * DAY + 50 * 60_000, flags: { badDay: false, deload: false, finisher: true } };
    sessions.push(s);
    const slots = Object.values(PRESCRIPTIONS).filter((p) => p.key.startsWith(`${s.templateId}.`) && !p.key.includes('.rp-'));
    for (const p of slots) {
      for (let n = 1; n <= 3; n++) {
        sets.push({ id: `${s.id}:${p.key}#${n}`, sessionId: s.id!, templateId: s.templateId, slot: p.key, exerciseId: p.exerciseId, setNumber: n, reps: 7, rir: 1, durationSec: 30, completedAt: s.startedAt + n * 120_000, variationId: p.defaultVariation, loadKg: p.loadable ? 10 : undefined });
      }
    }
  }

  it('the brief context stays small and carries the rule verdict', () => {
    const rec = recommendSession(sessions, sets, DEFAULT_SETTINGS, monday);
    const ctx = buildBriefContext({ rec, sessions, sets, settings: DEFAULT_SETTINGS, now: monday });
    expect(ctx.recent).toHaveLength(8);
    expect(ctx.recent[0].slots['B.pushup'].reps).toEqual([7, 7, 7]);
    expect(JSON.stringify(ctx).length).toBeLessThan(12_000);
    expect(JSON.stringify(ctx)).not.toContain('sk-ant');
    expect((ctx.rules as { recommended: { session: string } }).recommended.session).toBe(rec.templateId);
    expect(recentSessions(sessions, sets, 2, sessions[5].startedAt).map((r) => r.t)).toEqual(['A', 'B']);
  });

  it('the system prompt names every slot and variation and contains no date', () => {
    for (const p of Object.values(PRESCRIPTIONS)) {
      expect(SYSTEM_PROMPT).toContain(p.key);
      for (const v of p.variations ?? []) expect(SYSTEM_PROMPT).toContain(v.id);
    }
    expect(SYSTEM_PROMPT).not.toMatch(/20\d\d-\d\d/);
    expect(SYSTEM_PROMPT).toContain(getTemplate('B').name);
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(2000);
  });

  it('the analysis context carries the whole history and the stats, within bounds', async () => {
    const stats = trainingStats(sessions, sets, DEFAULT_SETTINGS, monday);
    const ctx = buildAnalysisContext({ stats, sessions, sets, settings: DEFAULT_SETTINGS, now: monday });
    expect(ctx.recent).toHaveLength(10);
    expect((ctx.rules as { slots: unknown[] }).slots.length).toBeGreaterThan(5);
    expect(JSON.stringify(ctx).length).toBeLessThan(40_000);
    const answer = { headline: 'H', summary: 'S', trends: [], strengths: [], concerns: [], recommendations: ['Do more'], suggestions: [] };
    const f = fakeFetch([() => reply(200, message(JSON.stringify(answer)))]);
    const r = await askAnalysis({ stats, sessions, sets, settings: DEFAULT_SETTINGS, now: monday }, deps(f.fn));
    expect(r.ok && r.data.recommendations).toEqual(['Do more']);
    expect(String((f.calls[0].body.messages as Body[])[0].content)).toMatch(/^Analyse/);
    expect(f.calls[0].body.max_tokens).toBe(5000);
  });

  it('askBrief / askReview send the matching prompt and parse the answer', async () => {
    const rec = recommendSession(sessions, sets, DEFAULT_SETTINGS, monday);
    const brief = { headline: 'Strength day', readiness: 'go', summary: 'Go.', focus: ['Dips'], suggestions: [] };
    const f = fakeFetch([() => reply(200, message(JSON.stringify(brief)))]);
    const r = await askBrief({ rec, sessions, sets, settings: DEFAULT_SETTINGS, now: monday }, deps(f.fn));
    expect(r.ok && r.data.headline).toBe('Strength day');
    expect(String((f.calls[0].body.messages as Body[])[0].content)).toMatch(/^Pre-session brief/);
    expect((f.calls[0].body.output_config as Body).effort).toBe('high');
    expect(((f.calls[0].body.output_config as Body).format as Body).schema).toEqual(BRIEF_SCHEMA);

    const session = sessions[9];
    const own = sets.filter((s) => s.sessionId === session.id);
    const review = sessionReview({ session, sets: own, allSets: sets, sessions, settings: DEFAULT_SETTINGS, nextTime: [] });
    const answer = { headline: 'Good one', highlights: ['x'], concerns: [], perSlot: [{ slot: 'B.pushup', note: 'nice' }, { slot: 'Z.z', note: 'drop me' }], suggestions: [] };
    const g = fakeFetch([() => reply(200, message(JSON.stringify(answer)))]);
    const rv = await askReview({ review, session, sets: own, sessions, allSets: sets, settings: DEFAULT_SETTINGS, now: monday }, deps(g.fn));
    expect(rv.ok && rv.data.perSlot).toEqual([{ slot: 'B.pushup', note: 'nice' }]);
    expect(String((g.calls[0].body.messages as Body[])[0].content)).toMatch(/^The session just ended/);
  });
});
