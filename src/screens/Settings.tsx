import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { PRESCRIPTIONS, PULLUP_ROADMAP, templateOfKey } from '../data/program';
import { db, DEFAULT_SETTINGS, saveSettings, type Settings } from '../db/db';
import { downloadJson, exportBackup, importBackup } from '../db/backup';
import { Chips, Note, Stepper } from '../components/controls';
import { labelOf } from '../logic/schedule';
import { CoachSettingsCard } from './coach/CoachSettingsCard';
import { StrapSettingsCard } from './hr/StrapSettingsCard';

export default function SettingsScreen() {
  const settings = (useLiveQuery(() => db.kv.get('settings'), [])?.value as Settings | undefined) ?? DEFAULT_SETTINGS;
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const [message, setMessage] = useState<{ kind: 'good' | 'warn'; text: string }>();
  const fileRef = useRef<HTMLInputElement>(null);

  const variationSlots = Object.values(PRESCRIPTIONS).filter((p) => p.variations);
  const loadSlots = Object.values(PRESCRIPTIONS).filter((p) => p.loadable || p.variations?.some((v) => v.loadable));

  return (
    <div className="page">
      <div className="page-head">
        <h1>Settings</h1>
      </div>

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <div className="card stack">
          <div className="section-title">You</div>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Stepper label="Body weight" unit="kg" step={0.5} value={s.bodyweightKg ?? 75} onChange={(v) => saveSettings({ bodyweightKg: v })} />
            <Stepper label="Pull-up max" value={s.pullupMax} onChange={(v) => saveSettings({ pullupMax: v })} hint="bodyweight reps" />
          </div>
          <div className="section-title">Pull-up roadmap stage</div>
          <Chips
            options={PULLUP_ROADMAP.map((st, i) => ({ id: String(i), label: `${i + 1}. ${st.label}` }))}
            value={String(s.pullupStage)}
            onChange={(v) => saveSettings({ pullupStage: Number(v) })}
          />
          <div className="section-title">Weight increment</div>
          <Chips
            options={[1, 1.25, 2, 2.5, 5].map((v) => ({ id: String(v), label: `${v} kg` }))}
            value={String(s.loadStep)}
            onChange={(v) => saveSettings({ loadStep: Number(v) })}
          />
          <div className="faint" style={{ fontSize: 14 }}>
            The smallest jump your weights allow. Used by the +/− buttons and when a weight increase is suggested.
          </div>
          <div className="section-title">Rest timers</div>
          <Chips
            options={[
              { id: '0.75', label: 'Shorter (×0.75)' },
              { id: '1', label: 'As written' },
              { id: '1.25', label: 'Longer (×1.25)' },
            ]}
            value={String(s.restScale)}
            onChange={(v) => saveSettings({ restScale: Number(v) })}
          />
          <div className="faint" style={{ fontSize: 14 }}>
            Applies to sessions started after the change.
          </div>
        </div>

        <div className="card stack">
          <div className="section-title">Backup</div>
          <div className="muted">
            Everything is stored on this device only. Export a backup regularly — clearing the browser's site data deletes your logs.
          </div>
          <div className="row wrap">
            <button
              className="btn primary"
              onClick={async () => {
                const data = await exportBackup();
                downloadJson(data, `workout-backup-${new Date().toISOString().slice(0, 10)}.json`);
                setMessage({ kind: 'good', text: `Exported ${data.sessions.length} sessions and ${data.sets.length} sets.` });
              }}
            >
              Export JSON
            </button>
            <button className="btn" onClick={() => fileRef.current?.click()}>
              Import JSON…
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                try {
                  const json = JSON.parse(await file.text());
                  if (!confirm('Importing replaces all data on this device with the backup. Continue?')) return;
                  const res = await importBackup(json);
                  setMessage({ kind: 'good', text: `Imported ${res.sessions} sessions and ${res.sets} sets.` });
                } catch (err) {
                  setMessage({ kind: 'warn', text: `Import failed: ${(err as Error).message}` });
                }
              }}
            />
          </div>
          {message && <Note kind={message.kind}>{message.text}</Note>}
          <div className="divider" />
          <button
            className="btn danger"
            onClick={async () => {
              if (!confirm('Delete ALL sessions, sets, settings and the coach API key on this device?')) return;
              await Promise.all([db.sessions.clear(), db.sets.clear(), db.kv.clear()]);
              setMessage({ kind: 'warn', text: 'All data deleted.' });
            }}
          >
            Delete all data
          </button>
        </div>
      </div>

      <StrapSettingsCard />

      <CoachSettingsCard />

      <div className="card stack">
        <div className="section-title">Current variations</div>
        <div className="faint" style={{ fontSize: 14 }}>
          Updated automatically when you log a set; progression suggestions move you along the chain.
        </div>
        <div className="grid grid-2">
          {variationSlots.map((p) => (
            <label key={p.key} className="stack tight">
              <span style={{ fontWeight: 650 }}>
                {labelOf(templateOfKey(p.key))} · {p.name}
              </span>
              <select
                className="input"
                value={s.variations[p.key] ?? p.defaultVariation}
                onChange={(e) => saveSettings({ variations: { ...s.variations, [p.key]: e.target.value } })}
              >
                {p.variations!.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </div>

      <div className="card stack">
        <div className="section-title">Current weights (added kg)</div>
        <div className="faint" style={{ fontSize: 14 }}>
          Updated automatically from what you log, and shown in the weight checklist before each session.
        </div>
        <div className="grid grid-3">
          {loadSlots.map((p) => (
            <Stepper
              key={p.key}
              label={`${labelOf(templateOfKey(p.key))} · ${p.name}`}
              unit="kg"
              step={s.loadStep}
              value={s.loads[p.key] ?? 0}
              onChange={(v) => saveSettings({ loads: { ...s.loads, [p.key]: v } })}
            />
          ))}
        </div>
      </div>

      <div className="faint" style={{ fontSize: 14 }}>
        Tip: add this app to your home screen for full-screen use. It works offline once loaded.
      </div>
    </div>
  );
}
