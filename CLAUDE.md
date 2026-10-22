# Notes for working on this repo

## Backward compatibility is mandatory

The app is in use: training logs live in IndexedDB on the owner's tablet, plus exported JSON
backups. Every change must keep that data working with **no migration step**:

- Data shapes (`SessionRecord`, `SetRecord`, `Settings`, `RunnerState`, `Suggestion`, `LastTime`):
  only add **optional** fields. Never rename, remove or change the meaning of an existing one.
- Identifiers stored in data never change or disappear: slot keys (`A.pullup`, `B.pushup`, …),
  variation ids, `ExerciseId`s, template / variant ids, step ids (`<slot>#<n>`, `rp:<slot>#<n>`).
  New ones may be added. A variant that is retired gets `hidden: true` (the old rowing `4x4`,
  `8x1`, `steady`) and keeps its blocks, so stored sessions and a saved runner still resolve.
- Dexie schema stays at `version(1)` unless an index is truly needed; if so, add a new version with
  an `upgrade()` and never drop stores.
- Backup files: keep `version: 1` accepted by `validateBackup` forever. A new format needs a new
  version number **and** an importer for the old one.
- A session in progress is saved in `kv['runner']` and resumed after an app update — new reducer
  actions and UI must cope with a runner state written by the previous release.
- `src/logic/logic.test.ts` has a `V1_BACKUP` fixture. It must keep importing and producing plans;
  never edit it to make a change pass — fix the change instead.

## 3D animations

- Poses live in `src/anim3d/exercises/*.ts`; `public/anims/*.glb` is generated (`npm run anims`)
  and gitignored. Base new poses on a reference (photo / written technique) and cite it in the
  spec's `references`; `src/anim3d/REFERENCES.md` is regenerated from them — commit it.
- Clip names (`main`, `fault:<id>`) and node names (`m_<bone>_<n>`, `p_<prop>`) are read by the
  viewer; no `.` or `:` in node names (three.js bindings).

## Coach

- The rule layer (`src/logic/coach.ts`, `progression.ts`, `schedule.ts`) is the source of truth.
  Claude output is **advisory**: it only ever becomes a `CoachSuggestion` that the user accepts with
  a tap (`src/coach/apply.ts`), never a silent change to targets, loads, flags or settings.
- Every Claude call must degrade to rules-only (no key, offline, error, refusal, bad JSON) and must
  never block logging a set or finishing a session. `callCoach` never throws.
- kv rows `coach` / `coach:*` hold the API key, caches and usage: never exported in backups and
  preserved on import (`isCoachKey` in `db.ts`). Never log or send the key anywhere but the API.
- Fable 5.1 requests: no `thinking` parameter, no assistant prefill, no forced `tool_choice`; check
  `stop_reason === 'refusal'` before reading content. Structured output via
  `output_config.format` with closed schemas (`additionalProperties: false`, every property
  required); keep the `sanitize*` guards in `src/coach/schema.ts` in sync with any schema change.
- The rest-screen note (`.coach-note`) stays within two lines plus one button at 960 × 600.
- New `RunnerState.coach` / `SessionRecord.coach` fields are optional; a runner saved without them
  must still resume.

## Heart rate

- Strap data lives in optional fields only (`SessionRecord.hr`, `SetRecord.hr`, HR profile fields on
  `Settings`); sessions without a strap must render exactly as before.
- `src/hr/ble.ts` is the only place that touches `navigator.bluetooth`; everything else goes through
  the `strap` singleton / `recorder`, so tests and headless checks can fake it.
- HR maths stays in `src/hr/metrics.ts` as pure functions with tests; formulas and their limits are
  documented in the README (*Heart rate*) — keep the UI wording honest about estimates.

## Rowing

- The four workouts in `src/data/program.ts` follow the owner's *seances-rameur* spec to the second;
  `IntervalPhase` targets (`spm`, `hrPct`, `rpe`, `paceOffset2k`, `hrLagSec`) are optional so the
  hidden legacy variants and old runners still render. `src/logic/rowing.ts` is the only place that
  turns them into text / bpm; keep it pure and tested.
- `ZONE_BOUNDS` in `src/hr/metrics.ts` is the workouts' zone table and is used app-wide; changing it
  changes new summaries only (stored `zonesSec` are not recomputed).

## Checks

```sh
npm test          # logic tests, incl. the old-backup fixture
npm run build     # type-check + build
```

UI changes to the in-session screens must still fit 960 × 600 without scrolling (see README,
*Layout constraint*).
