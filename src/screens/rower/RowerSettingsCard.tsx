import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Note, ToggleRow } from '../../components/controls';
import { db, DEFAULT_SETTINGS, saveSettings, type Settings } from '../../db/db';
import { formatScan, isBluetoothSupported, rower, scanConsole, type ScanReport } from '../../rower/ble';
import { useRower } from '../../rower/useRower';
import { fmtPace } from '../../logic/rowing';

export function RowerSettingsCard() {
  const s = { ...DEFAULT_SETTINGS, ...((useLiveQuery(() => db.kv.get('settings'), [])?.value as Partial<Settings> | undefined) ?? {}) };
  const st = useRower();
  const supported = isBluetoothSupported();
  const [scan, setScan] = useState<ScanReport | undefined>();
  const [scanning, setScanning] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (st.status === 'on' && st.deviceName && st.deviceName !== s.rowerName) saveSettings({ rowerName: st.deviceName });
  }, [st.status, st.deviceName, s.rowerName]);

  const last = st.last;
  const live = last
    ? [last.spm !== undefined ? `${Math.round(last.spm)} spm` : '', last.paceSec !== undefined ? `${fmtPace(last.paceSec)} /500 m` : '', last.watts !== undefined ? `${last.watts} W` : '', last.distanceM !== undefined ? `${last.distanceM} m` : '']
        .filter(Boolean)
        .join(' · ')
    : '';

  const copy = async () => {
    if (!scan) return;
    try {
      await navigator.clipboard.writeText(formatScan(scan));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* no clipboard: the text is on screen */
    }
  };

  return (
    <div className="card stack">
      <div className="section-title">Rowing machine</div>
      <div className="muted">
        Connect the rower's console over Bluetooth to see stroke rate, split, power and distance against the workout targets, start the interval
        timer on the first stroke, and keep the recording with the session. Works with any console that speaks the standard fitness-machine
        protocol (FTMS: Concept2 PM5 and most app-enabled rowers).
      </div>
      {!supported ? (
        <Note kind="warn">This browser has no Web Bluetooth. Use Chrome on Android or on a computer.</Note>
      ) : (
        <div className="row wrap" style={{ alignItems: 'center' }}>
          {st.status === 'on' ? (
            <>
              <span className="badge good">Connected · {st.deviceName ?? 'rower'}</span>
              {live && <span className="badge num">{live}</span>}
              <button className="btn" onClick={() => rower.disconnect()}>
                Disconnect
              </button>
            </>
          ) : (
            <>
              <button className="btn primary" onClick={() => rower.connect(s.rowerName)} disabled={st.status === 'connecting'}>
                {st.status === 'connecting' ? 'Connecting…' : st.status === 'lost' ? 'Reconnect rower' : 'Connect rower'}
              </button>
              {s.rowerName && <span className="faint">Last paired: {s.rowerName}</span>}
            </>
          )}
        </div>
      )}
      {st.error && <Note kind="warn">{st.error}</Note>}
      {st.status === 'on' && st.features && st.features.length > 0 && <div className="faint" style={{ fontSize: 14 }}>Console reports: {st.features.join(', ')}.</div>}
      <ToggleRow
        title="Start the workout on the first stroke"
        description="With the console connected, the interval timer starts itself when you start rowing (the Start button still works)."
        checked={s.rowerAutoStart !== false}
        onChange={(v) => saveSettings({ rowerAutoStart: v })}
      />
      <div className="faint" style={{ fontSize: 14 }}>
        Wake the console (press a button or take a stroke) before connecting. If "Connect rower" finds nothing, the console may not use the
        standard protocol: run the scan below and send the report to whoever maintains the app.
      </div>
      {supported && (
        <div className="stack tight">
          <div className="row wrap" style={{ alignItems: 'center' }}>
            <button
              className="btn"
              disabled={scanning}
              onClick={async () => {
                setScanning(true);
                setScan(await scanConsole());
                setScanning(false);
              }}
            >
              {scanning ? 'Scanning…' : 'Scan console'}
            </button>
            {scan && !scan.error && (
              <button className="btn small ghost" onClick={copy}>
                {copied ? 'Copied' : 'Copy report'}
              </button>
            )}
            <span className="faint" style={{ fontSize: 13 }}>Lists what the console exposes (pick it in the browser's device list, whatever its name).</span>
          </div>
          {scan && (
            <>
              {scan.error && scan.error !== 'Cancelled.' && <Note kind="warn">{scan.error}</Note>}
              {!scan.error && (
                <Note kind={scan.services.some((x) => x.uuid.startsWith('00001826')) ? 'good' : 'info'}>
                  {scan.services.some((x) => x.uuid.startsWith('00001826'))
                    ? 'This console speaks the standard fitness-machine protocol — "Connect rower" should work.'
                    : scan.services.length
                      ? 'No fitness-machine service: the console uses a vendor protocol. The report below is what is needed to add support for it.'
                      : 'None of the known services were found. The console may expose a vendor service outside the list the browser was allowed to look for.'}
                </Note>
              )}
              {scan.error !== 'Cancelled.' && (
                <pre className="scan-report" style={{ fontSize: 12, whiteSpace: 'pre-wrap', margin: 0, maxHeight: 260, overflow: 'auto' }}>
                  {formatScan(scan)}
                </pre>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
