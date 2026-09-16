import type { TemplateId } from '../data/types';
import type { SessionRecord } from '../db/db';

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

export const ROTATION: TemplateId[] = ['A', 'micro', 'B', 'row'];

/** Monday 00:00 of the week containing `ts` (local time). */
export function weekStart(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return d.getTime();
}

export function isFull(t: TemplateId) {
  return t === 'A' || t === 'B';
}

/** Completed sessions, newest first. */
function completed(sessions: SessionRecord[]) {
  return sessions.filter((s) => s.endedAt).sort((a, b) => b.startedAt - a.startedAt);
}

export function warningsFor(templateId: TemplateId, sessions: SessionRecord[], now: number): string[] {
  const done = completed(sessions);
  const warnings: string[] = [];
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const yesterday = today.getTime() - DAY;

  if (isFull(templateId)) {
    const lastFull = done.find((s) => isFull(s.templateId));
    if (lastFull && lastFull.startedAt >= yesterday) {
      warnings.push(`Session ${lastFull.templateId} was ${lastFull.startedAt >= today.getTime() ? 'today' : 'yesterday'} — never put the two full sessions back-to-back.`);
    }
  }
  if (templateId === 'A') {
    const lastRow = done.find((s) => s.templateId === 'row');
    if (lastRow && now - (lastRow.endedAt ?? lastRow.startedAt) < 48 * HOUR) {
      warnings.push('Rowing was less than 48 h ago — pull-ups may dip. Consider starting with dips.');
    }
  }
  if (templateId === 'row') {
    const lastA = done.find((s) => s.templateId === 'A');
    const nextMonday = weekStart(now) + 7 * DAY;
    if (nextMonday - now < 36 * HOUR && (!lastA || lastA.startedAt < weekStart(now))) {
      warnings.push('Session A is coming up soon — keep ~48 h between rowing and Session A.');
    }
  }
  return warnings;
}

export interface NextSuggestion {
  templateId: TemplateId;
  reason: string;
  warnings: string[];
}

export function suggestNext(sessions: SessionRecord[], now: number): NextSuggestion {
  const done = completed(sessions);
  const last = done[0];
  let templateId: TemplateId;
  let reason: string;
  if (!last) {
    templateId = 'A';
    reason = 'Start the week with the strength session.';
  } else {
    const idx = ROTATION.indexOf(last.templateId);
    templateId = ROTATION[(idx + 1) % ROTATION.length];
    reason = `Last session: ${labelOf(last.templateId)} (${relativeDay(last.startedAt, now)}).`;
    if (relativeDay(last.startedAt, now) === 'today') reason += ' Rest day next — pattern is workout / rest / workout.';
  }
  return { templateId, reason, warnings: warningsFor(templateId, sessions, now) };
}

export function labelOf(t: TemplateId): string {
  return t === 'A' ? 'Session A' : t === 'B' ? 'Session B' : t === 'micro' ? 'Micro' : 'Rowing';
}

export function relativeDay(ts: number, now: number): string {
  const a = new Date(ts);
  a.setHours(0, 0, 0, 0);
  const b = new Date(now);
  b.setHours(0, 0, 0, 0);
  const days = Math.round((b.getTime() - a.getTime()) / DAY);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function sessionsInWeek(sessions: SessionRecord[], weekStartTs: number): SessionRecord[] {
  return sessions.filter((s) => s.endedAt && s.startedAt >= weekStartTs && s.startedAt < weekStartTs + 7 * DAY);
}
