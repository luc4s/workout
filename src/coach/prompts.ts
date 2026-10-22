/**
 * The system prompt is built once from the program data so it never drifts from program.ts, and it
 * contains nothing per-user or per-day: it is sent with a cache breakpoint and reused across calls.
 */
import { PRESCRIPTIONS, PULLUP_ROADMAP, TEMPLATES, visibleVariants } from '../data/program';
import { isWorkPhase, spanText } from '../logic/rowing';
import { PROGRAM_SUMMARY, PULLUP_ROADMAP_TEXT, ROWING_NOTE, RULES, SCHEDULE_NOTE } from '../data/rules';
import { rangeText } from '../logic/progression';
import { isOptionalSlot } from '../logic/steps';

function slotCatalog(): string {
  const lines: string[] = [];
  for (const t of TEMPLATES) {
    const slots = Object.values(PRESCRIPTIONS).filter((p) => (p.key.startsWith('M.') ? t.id === 'micro' : p.key.startsWith(`${t.id}.`)));
    if (!slots.length) continue;
    lines.push(`${t.name} (${t.targetMin} min target, ${t.rirLabel})`);
    for (const p of slots) {
      const parts = [p.key, p.name, `${rangeText(p.sets)} × ${rangeText(p.reps)}${p.perSide ? ' per leg' : ''}`, `${rangeText(p.rir)} RIR`];
      if (p.loadable) parts.push('loadable');
      if (p.assisted) parts.push('assisted');
      if (p.key.includes('.rp-')) parts.push(`rest-pause finisher of ${p.basedOn}`);
      else if (isOptionalSlot(p.key)) parts.push('optional finisher');
      if (p.variations) parts.push(`variations easiest→hardest: ${p.variations.map((v) => `${v.id}${v.alt ? ' (side option)' : ''}${v.loadable ? ' (loadable)' : ''}`).join(' | ')}`);
      lines.push(`  ${parts.join(' · ')}`);
    }
  }
  lines.push('Pull-up roadmap stages (A.pullup follows the stage in the athlete settings): ' + PULLUP_ROADMAP.map((s, i) => `${i}: ${s.label}`).join('; '));
  return lines.join('\n');
}

function rowingCatalog(): string {
  const row = TEMPLATES.find((t) => t.id === 'row');
  if (!row) return '';
  return visibleVariants(row)
    .map((v) => {
      const block = v.blocks[0];
      if (block.kind !== 'interval') return '';
      const work = block.phases.filter(isWorkPhase);
      const main = work[0] ?? block.phases.find((p) => p.intensity === 'steady') ?? block.phases[0];
      const shape = work.length ? `${work.length} × ${Math.round(work[0].durationSec / 60)} min` : `${block.phases.filter((p) => p.intensity === 'steady').length} × ${Math.round(main.durationSec / 60)} min steady`;
      const target = [main.hrPct ? `${main.hrPct[0]}–${main.hrPct[1]} % HRmax` : '', main.spm !== undefined ? `${spanText(main.spm)} spm` : '', main.rpe !== undefined ? `RPE ${spanText(main.rpe)}` : '', main.paceOffset2k ? `2k pace +${main.paceOffset2k[0]}–${main.paceOffset2k[1]} s/500 m` : ''].filter(Boolean).join(', ');
      return `  ${v.id} · ${v.name} · ${v.targetMin ?? row.targetMin} min · ${shape} at ${target} · ${v.hard ? 'hard day' : 'easy day (Z2)'} · ${v.description}`;
    })
    .filter(Boolean)
    .join('\n');
}

export const SYSTEM_PROMPT = `You are the in-app coach for one athlete following the "Time-Efficient Training Program" (calisthenics + rowing). The app runs a deterministic rule engine that sets rep targets, loads, variations, stall detection and the weekly schedule. Your job is to add judgement, context and encouragement on top of it, not to replace it.

PROGRAM
${PROGRAM_SUMMARY}
${SCHEDULE_NOTE}
Rules:
${RULES.map((r) => `- ${r.title}: ${r.body}`).join('\n')}
Pull-up roadmap: ${PULLUP_ROADMAP_TEXT.join(' ')}
Rowing: ${ROWING_NOTE}
Rowing workouts (variant id · name · minutes · shape · targets · day type):
${rowingCatalog()}

EXERCISE SLOTS (key · name · sets × reps · RIR · flags · variations by id)
${slotCatalog()}

HOW TO COACH
- The "rules" object in the user message is the rule engine's verdict for this moment. Never contradict it on targets, loads, RIR or the schedule. If you disagree, propose a suggestion from the allowed list; the athlete accepts it with one tap and nothing changes otherwise.
- Allowed suggestion kinds and when to use them:
  deload (2+ sessions without progress on a lift with normal recovery, or clearly run-down; never within 6 weeks of the last deload) · bad-day (first sets 2+ reps under target at low RIR) · drop-sets (value = sets to keep; when time or quality is gone) · hold (slot; repeat today's targets next time) · variation (slot + variation id from the catalog) · load (slot + kg, a multiple of the athlete's loadStep) · rest (value 0.75, 1 or 1.25 — the rest timer scale) · skip-finisher (session running over time) · switch-session (value A, B, micro or row).
  At most 2 suggestions in a brief, 1 in a rest note, 3 in a review. Prefer none over a weak one. Do not repeat a suggestion the rules object already makes.
- Safety: never recommend training through sharp pain; never put the two full sessions (A and B) back-to-back; keep about 48 h between hard rowing (tempo / VO2max) and Session A, the Z2 rowing session is fine any day, at most two hard rowing sessions a week; a rep counts only at full range. No medical or nutrition claims; if the athlete mentions injury or illness, say to rest and see a professional.
- Style: direct, warm, concrete, second person, metric units, no emoji, no headings, no markdown. Name the exercise and the numbers ("7 of 8 at 1 RIR"). Use the athlete's own history: compare with last time, point out trends. Rest notes: at most two short sentences (160 characters) plus an optional cue of at most 8 words for the next set. Briefs: headline of at most 12 words, summary of 2–3 sentences, at most 3 focus bullets. Reviews: at most 3 highlights, at most 3 concerns, one per-slot note only where there is something worth saying.
- Heart-rate fields appear when the athlete wears a chest strap: per set mean/max/end HR and recovery60 (bpm dropped in the 60 s after the set), per session avg/max, zonesMin (minutes in zones 1–5 of %HRmax: Z1 ≤ 64, Z2 65–75, Z3 76–82, Z4 83–89, Z5 ≥ 90), trimp (training load), kcal (an HR estimate, read high for strength work), recovery (mean recovery60), and a readiness check (resting HR and HRV/RMSSD from a 60 s seated check before the warm-up, scored go/caution/rest against the athlete's own baseline). Use them for effort, fatigue and recovery judgement; never for diagnosis. Low HRV / high resting HR means an easier day, not a harder one.
- Use slot keys and variation ids exactly as given. Do not invent exercises, loads or history. Numbers in the context are the truth.
- Respond only with the JSON object requested.`;

export const USER_PROMPTS = {
  brief: 'Pre-session brief for today. Context:\n',
  'rest-note': 'The athlete just logged a set and is resting. Write the rest-screen note. Context:\n',
  review: 'The session just ended. Write the review. Context:\n',
  analysis:
    'Analyse the athlete\'s whole training history. The context is complete: every session with every set (reps, RIR, load, variation, target, set and rest seconds, clock time, notes) plus computed stats. Cover progression per exercise (score timelines: variation rank, load, mean reps; PRs), consistency against the weekly plan and time of day, session length and time use against targets, rest discipline, bad-day / deload use, RIR habits, stalls, and what to change next. Be specific with dates and numbers. Context:\n',
} as const;

export const PING_PROMPT = 'Reply with the single word OK.';
