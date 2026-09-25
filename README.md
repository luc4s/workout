# Workout

Tablet-first PWA for the *Time-Efficient Training Program* (`training-program.pdf`):
guided sessions with timers, set logging, progression suggestions, progress charts and
animated technique guides.

## Features

- **Session runner** — steps through warm-up → sets → rests for Session A, Session B, the
  micro session and rowing HIIT. Count-up set timer, rest countdown (±15 s, skip, pulse +
  vibration at zero), interval timer for rowing, pause, jump to any step, resume after a reload.
  Screen stays awake (Wake Lock).
- **Weight checklist** — before each session, lists the weight to prepare for every weighted
  exercise (from your last session plus any suggested increase); adjust it with +/− using your
  weight increment (Settings).
- **Logging** — reps (per leg for split squats / pistols), added load, RIR, variation.
  Past sessions can be edited in History.
- **Target vs. last time** — every set shows the rep target next to what you did on the same
  set last session, how long ago it was and the load you used, with a strip of last session's
  sets (the one you are on highlighted). The rest screen repeats it for the set coming up.
- **Progression** — implements the program rules: double progression (+2.5 kg or next
  variation at the top of the range), +1 rep on the weakest set, the pull-up roadmap stages,
  bad-day and deload modes, stall detection, schedule warnings (no back-to-back full sessions,
  ~48 h between rowing and Session A).
- **Exercise guides** — setup, execution, cues, common mistakes, regressions/progressions and
  sources for every movement, with a stick-figure animation and red-highlighted mistake demos.
- **Data** — stored on the device (IndexedDB). Export / import JSON from Settings.

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
  panel off the bottom. The `.stage` is height-driven there, width-driven everywhere else.
- Timer rings are capped at `42vh` so the buttons under them stay on screen; the `size` prop of
  `TimerRing` is only the SVG geometry and an upper bound.
- `@media (max-height: 760px) and (orientation: landscape)` tightens the logging panel. The
  case that needs it is the weighted split squat — two rep steppers *plus* a load stepper.
- Portrait stacks the two columns and goes back to scrolling.

Sizes elsewhere come from the scale in `src/styles/global.css` (15px base, `--tap: 48px`,
`--radius`, `--gap`, `--pad`); prefer changing those over hard-coding px in a screen.

To check a change actually fits, drive a headless Chrome through a session rather than eyeballing
the browser at desktop size — `document.querySelector('.runner-body')` should report
`scrollHeight === clientHeight` on every step at 960 × 600.

## Code map

- `src/data/program.ts` — the program encoded from the PDF; `exercises.ts` — technique guides; `rules.ts`
- `src/logic/` — `steps.ts` (session → steps), `runner.ts` (timer state machine), `progression.ts`,
  `schedule.ts`, `session.ts` (DB orchestration)
- `src/anim/` — 2D rig (FK + two-bone IK), clips per exercise, SVG renderer
- `src/screens/` — UI; `src/screens/runner/` — the in-session views
- `src/styles/global.css` — design scale and shared components; `src/screens/runner/runner.css`
  — the in-session layout (see *Layout constraint* above)
- `scripts/render-anims.tsx` — dumps animation frames to SVG for checking poses
  (`npx vite-node scripts/render-anims.tsx /tmp/frames pullup`)
