# Workout

Tablet-first PWA for the *Time-Efficient Training Program* (`training-program.pdf`):
guided sessions with timers, set logging, progression suggestions, progress charts and
animated technique guides.

## Features

- **Session runner** — steps through warm-up → sets → rests for Session A, Session B, the
  micro session and rowing. Count-up set timer, rest countdown (±15 s, skip, pulse +
  vibration at zero), interval timer for rowing, pause, jump to any step, resume after a reload.
  Screen stays awake (Wake Lock).
- **Rowing** — four workouts (see *Rowing* below): fat loss 30 (tempo intervals), fat loss 60
  (Z2 endurance), VO2max 30 (4 × 4) and VO2max 60 (4 × 8). Every phase shows its cadence, HR band
  (% of max and bpm), RPE and pace target; with a strap the live HR is judged against the band,
  allowing for the HR lag of hard intervals. The coach picks the workout (hard ones alternate, the
  Z2 session when a hard one is unsafe) and warns when a hard one lands before Session A or would
  be the third of the week.
- **Weight checklist** — before each session, lists the weight to prepare for every weighted
  exercise (from your last session plus any suggested increase); adjust it with +/− using your
  weight increment (Settings).
- **Logging** — reps (per leg for split squats / pistols), added load, RIR (a required tap: no
  default, so the number is yours), variation.
  Past sessions can be edited in History, including the variation (for one set or all sets of
  that exercise in the session).
- **Variations** — every exercise with options (push-up, pistol / archer squat, row, …) has a
  *Variation* picker on the setup screen and on the set screen; the choice is remembered. Changing
  it mid-session resets that exercise's target to the bottom of the range.
- **Target vs. last time** — every set shows the rep target next to what you did on the same
  set last session, how long ago it was and the load you used, with a strip of last session's
  sets (the one you are on highlighted). The rest screen repeats it for the set coming up.
- **Progression** — implements the program rules: double progression (+2.5 kg or next
  variation at the top of the range), +1 rep on the weakest set, the pull-up roadmap stages,
  bad-day and deload modes, stall detection, schedule warnings (no back-to-back full sessions,
  ~48 h between hard rowing and Session A). "Last time" always shows the session the targets were
  built from; after a roadmap stage change (e.g. 4 × 5 → 3 × 6–8) targets start at the new minimum.
- **Rest-pause finisher (Session B)** — rows or pike push-ups, switchable on the setup screen
  and during the session until the first mini-set is logged. The app suggests one (★): the
  movement that stalled, else the one that ended today's sets with the most reps in reserve,
  else the one not done last time.
- **Coach** — a rule-based coach that works offline, and optionally Claude on top (see *Coach*
  below). On *Today*: which session to do and why, the targets, weights and estimated time of that
  session, a daily brief. During a session: a note on every rest (set vs target, RIR, rest taken,
  pace, a cue for the next set) and a bad-day switch when the first sets fall short. After: a
  review (per-exercise verdicts, work / rest / transition time, volume vs last time, RIR
  calibration, PRs) with next-time suggestions. On demand, a Claude analysis of the whole history
  (trend per exercise, adherence, RIR habits, recommendations). Suggestions are accepted with one
  tap; nothing changes otherwise.
- **Heart-rate strap** — pair a Polar H10 (or any Bluetooth strap with the standard heart-rate
  service) from Settings; Chrome on Android or desktop only (Web Bluetooth). Live HR in the runner,
  HR at the end of each set and the drop during the rest, optional HR-guided rest, the HR band of
  every rowing phase, a 60 s readiness check before the warm-up (resting HR + HRV against your own
  baseline, with a one-tap bad-day switch), and per session: HR chart, average / max, time in zones,
  training load (TRIMP), an HR-based calorie estimate, mean recovery, all compared with the previous
  session of the same kind. Progress shows resting HR, HRV, weekly load and recovery trends; the
  coach and Claude get the same numbers. See *Heart rate* below for what the numbers mean.
- **Exercise guides** — setup, execution, cues, common mistakes, regressions/progressions and
  sources for every movement, with a 3D animation (glTF) you can rotate — drag, double-tap to
  reset, Side / Front / ¾ presets — and red-highlighted mistake demos. Every pose is checked
  against public-domain reference photos (see *3D animations* below).
- **Data** — stored on the device (IndexedDB). Export / import JSON from Settings. Updates never
  break existing data or backups (see `CLAUDE.md`).

## Development

Requires Node 22 (`nvm use`).

```sh
npm install
npm run dev        # https://localhost:5173 and https://<lan-ip>:5173
npm test           # logic unit tests
npm run build      # type-check + production build into dist/
npm run preview    # serve dist/ on https://<lan-ip>:4173
```

The dev/preview servers use a self-signed certificate because service workers and the Wake
Lock API need a secure context; accept the certificate warning once on the tablet.
Set `NO_SSL=1` to serve plain HTTP.

## Deploying to GitHub Pages

`.github/workflows/deploy.yml` builds and publishes `dist/` on every push to `main`/`master`
(it runs the tests first). Project pages are served from `/<repo>/`, which the workflow passes
as `BASE_PATH`; locally the base stays `/`.

One-time setup:

```sh
gh auth login
gh repo create workout --public --source=. --remote=origin --push
gh api -X POST repos/:owner/workout/pages -f build_type=workflow   # or: Settings → Pages → Source: GitHub Actions
```

The app then lives at `https://<user>.github.io/workout/`. Pages on private repos needs a paid
plan, hence `--public` (the repo holds no personal data — logs stay on your device).

## Using it on a tablet

Open the deployed URL once and "Add to Home Screen". After that the tablet needs no server at
all: the service worker precaches every asset (~500 KB) and nothing is fetched at runtime, so
the app launches and runs fully offline from its icon. When the tablet is online again it picks
up new versions by itself.

Data lives in that browser, for that origin, on that device — clearing site data or moving to a
different URL starts you with an empty log, so export a backup from Settings now and then.

## Layout constraint

The in-session screens must fit the viewport with no scrolling — mid-set you should never have to
scroll to reach "Done set". A tablet in landscape is about 960 × 600 CSS pixels, which is the size
to design against (a Galaxy Tab is 1920 × 1200 at dpr 2).

How the runner holds to that, in `src/screens/runner/runner.css`:

- `.runner-body` fills the viewport, and the work / rest grids are `height: 100%` instead of
  being sized by their content.
- The figure (`.work-anim`, `.next-anim`, `.warm-anim`) is `flex: 1` with `min-height`, so it
  takes the leftover height and shrinks first on a small screen rather than pushing the logging
  panel off the bottom. There the 3D `.stage3d` just fills that box (the camera adapts to any
  aspect ratio); elsewhere, and in portrait, the stage is 4:3 and width-driven.
- Timer rings are capped at `42vh` so the buttons under them stay on screen; the `size` prop of
  `TimerRing` is only the SVG geometry and an upper bound.
- The rest screen is three full-width columns: timer | up next (targets, then the 3D view, which
  absorbs the leftover height) | coach feedback (scrolls inside its card if it ever overflows).
- `@media (max-height: 760px) and (orientation: landscape)` tightens the logging panel. The
  case that needs it is the weighted split squat — two rep steppers *plus* a load stepper.
- Portrait stacks the two columns and goes back to scrolling.

Sizes elsewhere come from the scale in `src/styles/global.css` (15px base, `--tap: 48px`,
`--radius`, `--gap`, `--pad`); prefer changing those over hard-coding px in a screen.

To check a change actually fits, drive a headless Chrome through a session rather than eyeballing
the browser at desktop size — `document.querySelector('.runner-body')` should report
`scrollHeight === clientHeight` on every step at 960 × 600.

## Coach

Two layers. The **rule layer** (`src/logic/coach.ts`) is deterministic, needs no network and is the
source of truth: `recommendSession` (rotation, week coverage, days since a full session, stalls,
deload age), `sessionOverview` (targets / weights / time from `prepareSession`), `setFeedback`
(after every logged set) and `sessionReview` (after the session). The **Claude layer**
(`src/coach/`) sends the rule layer's verdict plus a compact context pack and asks for judgement in
a fixed JSON shape (structured outputs). It is advisory: it may propose a `deload`, `bad-day`,
`drop-sets`, `hold`, `variation`, `load`, `rest`, `skip-finisher` or `switch-session` suggestion;
each maps to something you could tap yourself (setup toggles, runner actions, settings) and is only
applied when you accept it (`src/coach/apply.ts`).

Setup: create an API key at platform.claude.com (a dedicated key with a spending limit), paste it
in Settings → Coach, *Save & test*. The key is stored on the device only — never in backups, and
kept when a backup is imported. Calls go straight from the browser to the Anthropic API (official
SDK, loaded on first use). Model: Claude Fable 5.1 (`effort: low` for rest notes, `high` for brief
and review), falling back once to Claude Opus 5.5 on a rate limit, an overload, a model not enabled
on the key, or a refusal; the model that answered is shown with every note. Without a key, offline
or on any error the rule layer alone is shown and logging is never blocked.

What is sent (`src/coach/context.ts`): the date, your settings (body weight, pull-up max, roadmap
stage, chosen variations and loads, rest scale), the week's coverage, the last 8 completed sessions
compressed per exercise (variation, load, reps, RIR, duration; 4 sessions for a rest note), the rule
layer's verdict, today's logged sets, and your session notes for the review. The training analysis
(Today → *Ask Claude to analyse my training*, never automatic) sends every completed session (up to
150) in full — every set with reps (left / right), RIR, load, variation, the target it was run
against, set and rest seconds, clock time, plus session notes, rowing data and the stored review —
and `trainingStats` (score timeline, weekly volume, PRs, set / rest timing and RIR histogram per
exercise; sessions per week, adherence, start-hour and weekday distribution, time use).
Nothing else. Rough cost on Fable 5.1 (thinking tokens are billed as output): ≈ $0.02–0.04 per rest
note, ≈ $0.1–0.2 for a brief or review — about $0.7–1 for a full session — and ≈ $0.2–0.4 for an
analysis; Settings shows the month's usage.

## Heart rate

`src/hr/ble.ts` talks to the strap with Web Bluetooth (Heart Rate Measurement 0x2A37: bpm, sensor
contact, RR intervals; Battery Service for the level). Chrome on Android asks you to pick the strap
once; afterwards it reconnects on its own. Safari / WebKit (iPad) has no Web Bluetooth, so the strap
cannot be used there. Recording only runs while the app is on screen (the runner keeps the screen
awake). `src/hr/recorder.ts` stores one sample per second in `SessionRecord.hr` (so it is backed up)
and per-set HR on `SetRecord.hr`.

What the numbers are (`src/hr/metrics.ts`):
- **Zones**: % of max HR, the rowing workouts' table — Z1 recovery ≤ 64, Z2 endurance 65–75, Z3 tempo
  76–82, Z4 threshold 83–89, Z5 VO2max ≥ 90 (rounded percentage). Max HR is the value in Settings,
  else the age estimate (Tanaka, 208 − 0.7 × age); the highest 5 s mean ever seen while wearing the
  strap replaces the estimate. Sessions summarised before this table was adopted keep the minutes
  computed with the earlier bounds (Z1 50–60 … Z5 90–100).
- **Load**: Banister TRIMP (HR reserve weighting) once a resting HR is known, Edwards zone TRIMP
  before that. Weekly load and monotony (mean / SD of daily load) feed the Today card.
- **Calories**: Keytel 2005 HR formula (needs sex, age, weight). It was fitted on steady cardio, so
  strength sessions read high — treat it as a comparison between sessions, not a number to eat by.
- **Recovery**: bpm dropped in the 60 s after a set (5 s means). Slow recovery against your usual
  shows up in the rest notes and the review.
- **Readiness**: resting HR (lowest 30 s mean) and RMSSD from RR intervals (artifacts > 20 % removed)
  in a 60 s seated check, compared with the baseline of your previous checks (needs three). Low HRV
  or a raised resting HR → caution / run down and a bad-day suggestion. Not a medical tool.

## Rowing

`src/data/program.ts` encodes the four workouts of *Séances rameur — Perte de gras & VO2max*
(ids `fat-loss-30`, `fat-loss-60`, `vo2max-30`, `vo2max-60`), to the second:

| Workout | Length | Main work | HR | Cadence | RPE | Pace (2k split +) |
|---|---|---|---|---|---|---|
| Fat loss 30 · tempo | 30 min | 4 × 5 min, 1 min easy between | 80–85 % | 22–24 | 6–7 | +12–18 s |
| Fat loss 60 · Z2 | 60 min | 3 × 15 min (last 8 min optionally at 76–80 %) | 65–75 % | 20 / 22 / 20 | 4 | +20–30 s |
| VO2max 30 · 4 × 4 | 30 min | 4 × 4 min, 2 min easy between, after 2 accelerations | 90–95 % | 26–30 | 8–9 | +2–4 s |
| VO2max 60 · 4 × 8 | 60 min | 4 × 8 min, 2 min easy between, after a tempo climb and 3 accelerations | 87–92 % | 26–28 | 8 | +6–10 s |

Every phase carries `spm`, `hrPct`, `rpe`, `paceOffset2k` and, on hard intervals, `hrLagSec` (HR
reaches the band only after ~1:30, so the runner greys the HR verdict until then and the summary
averages each interval after the lag). Pace targets need your 2k split (Settings → *Heart-rate
strap* → *2k pace*); without it the phase shows the offset only. HR and RPE always override pace.

Scheduling (`src/logic/schedule.ts`, `coach.ts`): tempo and VO2max are *hard* days — one, at most
two a week, never the day before Session A; the Z2 session is fine on any day. The coach alternates
VO2max and tempo, offers the 60 min versions on weekends once the 30 min ones are routine, and
falls back to the Z2 session on a deload, a poor readiness check, after two hard ones in the week
or when Session A is next. The previous rowing variants (`4x4`, `8x1`, `steady`) are kept hidden so
old sessions and backups still resolve; they are not offered any more.

References: Helgerud et al. 2007 (4 × 4 at 90–95 % HRmax for VO2max), Seiler et al. 2013
(4 × 8 ≥ 4 × 4 in recreational athletes).

## Code map

- `src/data/program.ts` — the program encoded from the PDF; `exercises.ts` — technique guides; `rules.ts`
- `src/logic/` — `steps.ts` (session → steps), `runner.ts` (timer state machine), `progression.ts`,
  `schedule.ts`, `session.ts` (DB orchestration), `targets.ts` (rep target / load for a step),
  `coach.ts` (rule-based coach), `rowing.ts` (phase targets, pace, per-phase HR report)
- `src/hr/` — heart-rate strap: `ble.ts` (Web Bluetooth, 0x2A37 parser), `recorder.ts` (1 Hz recording
  into the session, set recovery, session summary), `metrics.ts` (zones, TRIMP, calories, HRV,
  readiness), `useHeartRate.ts`; `src/screens/hr/` — strap settings, runner badge, rest HR, readiness
  check, session HR card
- `src/coach/` — the Claude layer: `client.ts` (SDK call, fallback, usage), `schema.ts` (JSON
  schemas + guards), `prompts.ts` (system prompt generated from the program), `context.ts` (what is
  sent), `ask.ts`, `apply.ts` (accepted suggestions → app actions), `store.ts` (key, toggles, usage)
- `src/anim3d/` — 3D animations: `body.ts` (proportions, bones), `pose.ts` / `rig.ts` (poses,
  FK + two-bone IK), `scene.ts` (mannequin, props, baking), `exercises/*.ts` (one pose spec per
  exercise, with its references), `AnimPlayer.tsx` / `stage.ts` (three.js viewer)
- `src/screens/` — UI; `src/screens/runner/` — the in-session views; `src/screens/coach/` — the
  coach cards (Today, Summary, Settings)
- `src/styles/global.css` — design scale and shared components; `src/screens/runner/runner.css`
  — the in-session layout (see *Layout constraint* above)
- `scripts/build-anims.ts` — writes `public/anims/<id>.glb` and `src/anim3d/REFERENCES.md`

## 3D animations

Each exercise is a pose spec in `src/anim3d/exercises/` — keyframes in world coordinates (hands,
feet and trunk placed where the reference photos put them, joints solved with IK), captions and
mistake demos. `npm run anims` bakes them into one `.glb` per exercise (also run automatically
by `npm run dev` / `npm run build`; the output is not committed). The references used for each
movement are listed in `src/anim3d/REFERENCES.md`.

Checking a pose:

- `npx vite-node dev/probe.ts <id> [clip] [t…]` prints joint positions, IK contact errors and the
  lowest body point (floor penetration).
- `npm run dev`, then open `/dev/anim-check.html?id=<id>&t=<seconds>&view=side` (or `&az=<deg>&el=<deg>`
  to match a photo's camera angle) — a single rendered frame for side-by-side comparison.
- `src/anim3d/anim.test.ts` fails if a hand / foot misses its contact by more than 1.2 cm, a body
  part goes through the floor, an elbow or knee leaves its range, or a limb switches between IK
  and FK within a clip.
