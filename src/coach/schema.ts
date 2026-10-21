/**
 * Structured-output schemas for the three Claude calls, plus the guards that turn a parsed answer into
 * app data. Every object sets `additionalProperties: false` and lists all properties as required (the
 * API requires that); length limits cannot be expressed in the schema, so the prompt states them and
 * the guards clamp.
 */
import { PRESCRIPTIONS } from '../data/program';
import { SUGGESTION_KINDS, type CoachSuggestion, type CoachSuggestionKind } from '../logic/coach';

const SUGGESTION = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: SUGGESTION_KINDS },
    slot: { type: 'string', description: 'Slot key from the context (e.g. A.pullup); empty string when not slot-specific' },
    value: { type: 'string', description: 'variation id, kg, sets to keep, rest scale (0.75|1|1.25) or template id (A|B|micro|row); empty string if none' },
    reason: { type: 'string', description: 'One short sentence' },
  },
  required: ['kind', 'slot', 'value', 'reason'],
  additionalProperties: false,
} as const;

export const BRIEF_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string', description: 'At most 12 words' },
    readiness: { type: 'string', enum: ['go', 'caution', 'rest'] },
    summary: { type: 'string', description: '2–3 sentences: why this session today and what matters most' },
    focus: { type: 'array', items: { type: 'string' }, description: 'Up to 3 bullets, at most 12 words each' },
    suggestions: { type: 'array', items: SUGGESTION, description: 'Up to 2' },
  },
  required: ['headline', 'readiness', 'summary', 'focus', 'suggestions'],
  additionalProperties: false,
} as const;

export const REST_NOTE_SCHEMA = {
  type: 'object',
  properties: {
    note: { type: 'string', description: 'At most two short sentences, 160 characters' },
    cue: { type: 'string', description: 'At most 8 words for the next set, or empty string' },
    suggestion: { anyOf: [SUGGESTION, { type: 'null' }] },
  },
  required: ['note', 'cue', 'suggestion'],
  additionalProperties: false,
} as const;

export const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string', description: 'At most 12 words' },
    highlights: { type: 'array', items: { type: 'string' }, description: 'Up to 3' },
    concerns: { type: 'array', items: { type: 'string' }, description: 'Up to 3' },
    perSlot: {
      type: 'array',
      items: { type: 'object', properties: { slot: { type: 'string' }, note: { type: 'string' } }, required: ['slot', 'note'], additionalProperties: false },
      description: 'One note per slot, only where there is something to say',
    },
    suggestions: { type: 'array', items: SUGGESTION, description: 'Up to 3' },
  },
  required: ['headline', 'highlights', 'concerns', 'perSlot', 'suggestions'],
  additionalProperties: false,
} as const;

export const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string', description: 'At most 12 words' },
    summary: { type: 'string', description: '3–5 sentences on where the training stands' },
    trends: {
      type: 'array',
      items: {
        type: 'object',
        properties: { slot: { type: 'string' }, trend: { type: 'string', enum: ['up', 'flat', 'down'] }, note: { type: 'string', description: 'One sentence with numbers' } },
        required: ['slot', 'trend', 'note'],
        additionalProperties: false,
      },
      description: 'One entry per exercise slot with history',
    },
    strengths: { type: 'array', items: { type: 'string' }, description: 'Up to 3' },
    concerns: { type: 'array', items: { type: 'string' }, description: 'Up to 3' },
    recommendations: { type: 'array', items: { type: 'string' }, description: 'Up to 4 concrete, prioritised actions' },
    suggestions: { type: 'array', items: SUGGESTION, description: 'Up to 3' },
  },
  required: ['headline', 'summary', 'trends', 'strengths', 'concerns', 'recommendations', 'suggestions'],
  additionalProperties: false,
} as const;

export interface Analysis {
  headline: string;
  summary: string;
  trends: { slot: string; trend: 'up' | 'flat' | 'down'; note: string }[];
  strengths: string[];
  concerns: string[];
  recommendations: string[];
  suggestions: CoachSuggestion[];
}

export interface Brief {
  headline: string;
  readiness: 'go' | 'caution' | 'rest';
  summary: string;
  focus: string[];
  suggestions: CoachSuggestion[];
}

export interface RestNote {
  note: string;
  cue?: string;
  suggestion?: CoachSuggestion;
}

export interface Review {
  headline: string;
  highlights: string[];
  concerns: string[];
  perSlot: { slot: string; note: string }[];
  suggestions: CoachSuggestion[];
}

/* ---------- guards ---------- */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number): string | undefined => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);
const strs = (v: unknown, n: number, max: number): string[] => (Array.isArray(v) ? v.map((x) => str(x, max)).filter((x): x is string => !!x) : []).slice(0, n);

const REST_SCALES = [0.75, 1, 1.25];
const TEMPLATE_IDS = ['A', 'B', 'micro', 'row'];

/** Drops suggestions the app cannot apply: unknown kinds, unknown slots, non-numeric loads, invalid rest scales… */
export function sanitizeSuggestion(raw: unknown, allowedSlots: string[]): CoachSuggestion | undefined {
  if (!isObj(raw)) return undefined;
  const kindRaw = str(raw.kind, 40)?.toLowerCase();
  const kind = SUGGESTION_KINDS.find((k) => k === kindRaw) as CoachSuggestionKind | undefined;
  if (!kind) return undefined;
  const reason = str(raw.reason, 240);
  if (!reason) return undefined;
  const slot = str(raw.slot, 40) || undefined;
  const valueStr = typeof raw.value === 'number' ? String(raw.value) : str(raw.value, 40) || undefined;
  const out: CoachSuggestion = { kind, reason };
  const needsSlot = kind === 'drop-sets' || kind === 'hold' || kind === 'variation' || kind === 'load';
  if (needsSlot) {
    if (!slot || !allowedSlots.includes(slot)) return undefined;
    out.slot = slot;
  }
  switch (kind) {
    case 'variation': {
      const p = PRESCRIPTIONS[slot!];
      if (!valueStr || !p?.variations?.some((v) => v.id === valueStr)) return undefined;
      out.value = valueStr;
      break;
    }
    case 'load':
    case 'drop-sets': {
      const n = Number(valueStr);
      if (!valueStr || !Number.isFinite(n) || n < 0 || (kind === 'drop-sets' && (n < 1 || n > 5))) return undefined;
      out.value = n;
      break;
    }
    case 'rest': {
      const n = Number(valueStr);
      if (!REST_SCALES.includes(n)) return undefined;
      out.value = n;
      break;
    }
    case 'switch-session': {
      if (!valueStr || !TEMPLATE_IDS.includes(valueStr)) return undefined;
      out.value = valueStr;
      break;
    }
  }
  return out;
}

export function sanitizeSuggestions(raw: unknown, allowedSlots: string[], max: number): CoachSuggestion[] {
  if (!Array.isArray(raw)) return [];
  const out: CoachSuggestion[] = [];
  for (const r of raw) {
    const s = sanitizeSuggestion(r, allowedSlots);
    if (s && !out.some((o) => o.kind === s.kind && o.slot === s.slot)) out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

export function parseBrief(raw: unknown, slots: string[]): Brief | undefined {
  if (!isObj(raw)) return undefined;
  const headline = str(raw.headline, 120);
  const summary = str(raw.summary, 600);
  if (!headline || !summary) return undefined;
  const r = str(raw.readiness, 10)?.toLowerCase();
  return {
    headline,
    readiness: r === 'rest' || r === 'caution' ? r : 'go',
    summary,
    focus: strs(raw.focus, 3, 120),
    suggestions: sanitizeSuggestions(raw.suggestions, slots, 2),
  };
}

export function parseRestNote(raw: unknown, slots: string[]): RestNote | undefined {
  if (!isObj(raw)) return undefined;
  const note = str(raw.note, 400);
  if (!note) return undefined;
  const cue = str(raw.cue, 60) || undefined;
  const suggestion = sanitizeSuggestion(raw.suggestion, slots);
  return { note, cue, suggestion };
}

export function parseReview(raw: unknown, slots: string[]): Review | undefined {
  if (!isObj(raw)) return undefined;
  const headline = str(raw.headline, 120);
  if (!headline) return undefined;
  const perSlot = (Array.isArray(raw.perSlot) ? raw.perSlot : [])
    .map((x: unknown) => (isObj(x) ? { slot: str(x.slot, 40) ?? '', note: str(x.note, 300) ?? '' } : undefined))
    .filter((x): x is { slot: string; note: string } => !!x && slots.includes(x.slot) && !!x.note)
    .slice(0, 12);
  return {
    headline,
    highlights: strs(raw.highlights, 3, 200),
    concerns: strs(raw.concerns, 3, 200),
    perSlot,
    suggestions: sanitizeSuggestions(raw.suggestions, slots, 3),
  };
}

export function parseAnalysis(raw: unknown, slots: string[]): Analysis | undefined {
  if (!isObj(raw)) return undefined;
  const headline = str(raw.headline, 120);
  const summary = str(raw.summary, 1200);
  if (!headline || !summary) return undefined;
  const trends = (Array.isArray(raw.trends) ? raw.trends : [])
    .map((x: unknown) => {
      if (!isObj(x)) return undefined;
      const t = str(x.trend, 10)?.toLowerCase();
      return { slot: str(x.slot, 40) ?? '', trend: (t === 'up' || t === 'down' ? t : 'flat') as 'up' | 'flat' | 'down', note: str(x.note, 300) ?? '' };
    })
    .filter((x): x is Analysis['trends'][number] => !!x && slots.includes(x.slot) && !!x.note)
    .slice(0, 20);
  return {
    headline,
    summary,
    trends,
    strengths: strs(raw.strengths, 3, 240),
    concerns: strs(raw.concerns, 3, 240),
    recommendations: strs(raw.recommendations, 4, 300),
    suggestions: sanitizeSuggestions(raw.suggestions, slots, 3),
  };
}
