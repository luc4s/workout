export const PROGRAM_TITLE = 'Time-Efficient Training Program';

export const PROGRAM_SUMMARY =
  '2 full-body sessions + optional micro + rowing HIIT · ~2 h 10 total / week · Tempo everywhere: explosive intent up, controlled ~2 s down · Log every set';

export const SCHEDULE_NOTE =
  'Days can shift freely — pattern is workout / rest / workout / rest / workout; never put the two full sessions back-to-back.';

export const RULES: { title: string; body: string }[] = [
  {
    title: 'Effort',
    body: 'RIR = reps left in the tank when you stop. Strength sets 1–2 RIR, hypertrophy sets 0–1 RIR. Occasionally take a final set to true failure to recalibrate — most people overestimate RIR.',
  },
  {
    title: 'Double progression',
    body: 'Hit the top of the rep range on all sets with good form → add 2.5 kg or move to a harder variation, drop back to the bottom of the range.',
  },
  {
    title: 'Rep standard',
    body: 'A rep counts only at full range with controlled tempo. Form breaks = set over, regardless of RIR target.',
  },
  {
    title: 'Bad-day protocol',
    body: "Poor sleep / high stress: do the session anyway at ~3 RIR, don't chase progression. A submaximal session beats a skipped one.",
  },
  {
    title: 'Deload',
    body: 'Only on a stall (2 sessions no progress on a lift, recovery normal) or feeling run-down: 1 week at 1–2 sets per exercise, ~3–4 RIR, same load. Expect roughly every 8–12 weeks.',
  },
  { title: 'Stall on one lift 3–4 wks', body: 'Add a set to that pattern, or grow the micro session for it.' },
  {
    title: 'Sessions creep past 50 min',
    body: 'Tighten superset transitions or drop the finisher — never the primary strength work.',
  },
];

export const PULLUP_ROADMAP_TEXT = [
  'Session A 4×3 (+1 rep/week) → 4×5 → 3×6–8 → solid 3×8 → add 2.5 kg, restart at 3×5 → weighted 3×5–8 as written.',
  'Session B stays assisted (or rows + negatives) until ~12 clean bodyweight reps. Rows carry most pulling hypertrophy volume meanwhile — make them genuinely hard.',
  'Typical timeline for an intermediate: 2–4 months to 3×8; slower if body weight is higher.',
];

export const ROWING_NOTE =
  'Legs → hips → arms on every stroke; low back neutral. Keep ~48 h before Session A. If Monday pull-ups dip: move to Saturday or start Session A with dips.';
