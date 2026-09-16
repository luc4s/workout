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

## Code map

- `src/data/program.ts` — the program encoded from the PDF; `exercises.ts` — technique guides; `rules.ts`
- `src/logic/` — `steps.ts` (session → steps), `runner.ts` (timer state machine), `progression.ts`,
  `schedule.ts`, `session.ts` (DB orchestration)
- `src/anim/` — 2D rig (FK + two-bone IK), clips per exercise, SVG renderer
- `src/screens/` — UI; `src/screens/runner/` — the in-session views
- `scripts/render-anims.tsx` — dumps animation frames to SVG for checking poses
  (`npx vite-node scripts/render-anims.tsx /tmp/frames pullup`)
