import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Chips, Note, Stepper, ToggleRow } from '../../components/controls';
import { db, DEFAULT_SETTINGS, saveSettings, type Settings } from '../../db/db';
import { isBluetoothSupported, strap } from '../../hr/ble';
import { estimateHrMax, hrMaxOf } from '../../hr/metrics';
import { useStrap } from '../../hr/useHeartRate';
import { fmtPace, parsePace } from '../../logic/rowing';

export function StrapSettingsCard() {
  const s = { ...DEFAULT_SETTINGS, ...((useLiveQuery(() => db.kv.get('settings'), [])?.value as Partial<Settings> | undefined) ?? {}) };
  const st = useStrap();
  const supported = isBluetoothSupported();
  const year = new Date().getFullYear();
  const estimate = estimateHrMax(s.birthYear);
  const [paceText, setPaceText] = useState<string | undefined>(undefined);
  const paceShown = paceText ?? (s.pace2kSec ? fmtPace(s.pace2kSec) : '');
  const paceBad = !!paceText && paceText.trim() !== '' && parsePace(paceText) === undefined;
  useEffect(() => {
    if (st.status === 'on' && st.deviceName && st.deviceName !== s.strapName) saveSettings({ strapName: st.deviceName });
  }, [st.status, st.deviceName, s.strapName]);

  return (
    <div className="card stack">
      <div className="section-title">Heart-rate strap</div>
      <div className="muted">
        Pair a Bluetooth chest strap (Polar H10 or any strap with the standard heart-rate service). The app then shows live HR, recovery after
        each set, a session summary (zones, load, calories), and a 60 s readiness check before the warm-up.
      </div>
      {!supported ? (
        <Note kind="warn">This browser has no Web Bluetooth. Use Chrome on Android or on a computer; Safari and other iPad browsers cannot pair.</Note>
      ) : (
        <div className="row wrap" style={{ alignItems: 'center' }}>
          {st.status === 'on' ? (
            <>
              <span className="badge good">Connected · {st.deviceName ?? 'strap'}</span>
              {st.bpm !== undefined && <span className="badge num">{st.bpm} bpm</span>}
              {st.battery !== undefined && <span className={`badge${st.battery < 20 ? ' warn' : ''}`}>Battery {st.battery}%</span>}
              <button className="btn" onClick={() => strap.disconnect()}>
                Disconnect
              </button>
            </>
          ) : (
            <>
              <button className="btn primary" onClick={() => strap.connect(s.strapName)} disabled={st.status === 'connecting'}>
                {st.status === 'connecting' ? 'Connecting…' : st.status === 'lost' ? 'Reconnect strap' : 'Connect strap'}
              </button>
              {s.strapName && <span className="faint">Last paired: {s.strapName}</span>}
            </>
          )}
        </div>
      )}
      {st.error && <Note kind="warn">{st.error}</Note>}
      <div className="faint" style={{ fontSize: 14 }}>
        Wet the electrodes, wear it snug under the chest. Chrome asks you to pick the strap the first time; afterwards it reconnects on its own when
        the strap is on. Pairing works only while this app is on screen.
      </div>
      <div className="divider" />
      <div className="section-title">Profile for HR maths</div>
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Stepper label="Birth year" value={s.birthYear ?? 1990} min={year - 100} max={year - 10} onChange={(v) => saveSettings({ birthYear: v })} hint={estimate ? `age-based max ≈ ${estimate} bpm` : undefined} />
        <Stepper
          label="Max HR"
          unit="bpm"
          value={hrMaxOf(s)}
          min={120}
          max={230}
          onChange={(v) => saveSettings({ hrMax: v })}
          hint={s.hrMax ? 'set by hand or measured' : 'estimated — the highest HR seen while wearing the strap replaces it'}
        />
        <Stepper label="Resting HR" unit="bpm" value={s.hrRest ?? 60} min={30} max={120} onChange={(v) => saveSettings({ hrRest: v })} hint={s.hrRest ? 'from the readiness checks' : 'set after the first readiness checks'} />
        <div className="stack tight">
          <div className="stepper">
            <div className="label">Sex (for the calorie formula)</div>
          </div>
          <Chips
            options={[
              { id: 'male', label: 'Male' },
              { id: 'female', label: 'Female' },
            ]}
            value={s.sex}
            onChange={(v) => saveSettings({ sex: v })}
          />
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <label className="stack tight">
          <span className="section-title">2k pace (/500 m)</span>
          <input
            className={`input num${paceBad ? ' bad' : ''}`}
            placeholder="2:05"
            inputMode="numeric"
            value={paceShown}
            onChange={(e) => setPaceText(e.target.value)}
            onBlur={() => {
              if (paceText === undefined) return;
              const sec = parsePace(paceText);
              if (paceText.trim() === '') saveSettings({ pace2kSec: undefined });
              else if (sec !== undefined) saveSettings({ pace2kSec: sec });
              setPaceText(undefined);
            }}
          />
          <span className="faint" style={{ fontSize: 13 }}>
            {paceBad ? 'Use m:ss, between 1:00 and 4:00.' : 'Your average split on a 2000 m test. The rowing workouts add seconds to it for their pace targets; leave empty to row by HR and effort only.'}
          </span>
        </label>
      </div>
      <ToggleRow
        title="Readiness check before the warm-up"
        description="60 s seated with the strap on: resting HR and HRV against your own baseline."
        checked={s.readinessCheck !== false}
        onChange={(v) => saveSettings({ readinessCheck: v })}
      />
      <ToggleRow
        title="HR-guided rest"
        description="The rest timer turns green only once HR is back under 65 % of max (or the planned rest is over)."
        checked={!!s.hrGuidedRest}
        onChange={(v) => saveSettings({ hrGuidedRest: v })}
      />
      <div className="faint" style={{ fontSize: 14 }}>
        Calories are the Keytel HR estimate (fitted on steady cardio; strength sessions read high). Training load is Banister TRIMP once a resting HR
        is known, Edwards zone TRIMP before that. Body weight comes from the "You" card.
      </div>
    </div>
  );
}
