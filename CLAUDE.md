# Notes for working on this repo

## Backward compatibility is mandatory

The app is in use: training logs live in IndexedDB on the owner's tablet, plus exported JSON
backups. Every change must keep that data working with **no migration step**:

- Data shapes (`SessionRecord`, `SetRecord`, `Settings`, `RunnerState`, `Suggestion`, `LastTime`):
  only add **optional** fields. Never rename, remove or change the meaning of an existing one.
- Identifiers stored in data never change or disappear: slot keys (`A.pullup`, `B.pushup`, …),
  variation ids, `ExerciseId`s, template / variant ids, step ids (`<slot>#<n>`, `rp:<slot>#<n>`).
  New ones may be added.
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

## Checks

```sh
npm test          # logic tests, incl. the old-backup fixture
npm run build     # type-check + build
```

UI changes to the in-session screens must still fit 960 × 600 without scrolling (see README,
*Layout constraint*).
