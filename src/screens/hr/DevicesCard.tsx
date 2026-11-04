import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Settings } from '../../db/db';
import { reconnectSupport, strap } from '../../hr/ble';
import { useStrap } from '../../hr/useHeartRate';
import { rower } from '../../rower/ble';
import { useRower } from '../../rower/useRower';
import { fmtPace } from '../../logic/rowing';

/**
 * Setup screen: the strap (and, for rowing, the console) before the session starts. Remembered
 * devices reconnect by themselves where the browser allows; otherwise one tap here connects them.
 */
export function DevicesCard({ rowing }: { rowing: boolean }) {
  const s = useLiveQuery(() => db.kv.get('settings'), [])?.value as Partial<Settings> | undefined;
  const hr = useStrap();
  const rw = useRower();
  const support = reconnectSupport();

  // Coming to the setup screen is the moment to look for them (the strap may have been put on since launch).
  useEffect(() => {
    if (!s) return;
    if (s.strapName) void strap.autoConnect(s.strapName);
    if (rowing && s.rowerName) void rower.autoConnect(s.rowerName);
  }, [s?.strapName, s?.rowerName, rowing]); // eslint-disable-line react-hooks/exhaustive-deps

  if (support === 'none') return null;
  const hrLive = hr.status === 'on' ? `${hr.bpm ?? '–'} bpm${hr.battery !== undefined ? ` · battery ${hr.battery}%` : ''}` : undefined;
  const rwLast = rw.last;
  const rwLive = rw.status === 'on' ? [rwLast?.spm !== undefined ? `${Math.round(rwLast.spm)} spm` : '', rwLast?.paceSec !== undefined ? `${fmtPace(rwLast.paceSec)} /500 m` : ''].filter(Boolean).join(' · ') || 'connected' : undefined;

  return (
    <div className="card stack tight devices-card">
      <div className="section-title">Devices</div>
      <DeviceRow
        label="Heart-rate strap"
        name={hr.deviceName ?? s?.strapName}
        status={hr.status}
        live={hrLive}
        waitingHint="put it on (wet the electrodes) — it connects by itself"
        error={hr.error}
        onConnect={() => strap.connect(s?.strapName)}
      />
      {rowing && (
        <DeviceRow
          label="Rowing machine"
          name={rw.deviceName ?? s?.rowerName}
          status={rw.status}
          live={rwLive}
          waitingHint="wake the console (press a button or take a stroke) — it connects by itself"
          error={rw.error}
          onConnect={() => rower.connect(s?.rowerName)}
        />
      )}
      <div className="faint" style={{ fontSize: 13 }}>
        {support === 'auto'
          ? 'Paired devices reconnect on their own when they are on. Pair a new one in Settings, or with Connect here.'
          : 'This browser cannot reconnect on its own: tap Connect before each session (it remembers the device, no picker the second time if Chrome allows).'}
      </div>
    </div>
  );
}

function DeviceRow(props: {
  label: string;
  name?: string;
  status: 'unsupported' | 'off' | 'connecting' | 'waiting' | 'on' | 'lost';
  live?: string;
  waitingHint: string;
  error?: string;
  onConnect: () => void;
}) {
  const { label, name, status, live, waitingHint, error, onConnect } = props;
  const text =
    status === 'on'
      ? live
      : status === 'connecting'
        ? 'connecting…'
        : status === 'waiting'
          ? `looking for ${name ?? 'it'} — ${waitingHint}`
          : status === 'lost'
            ? 'connection lost'
            : name
              ? `${name} is not connected`
              : 'not paired yet';
  return (
    <div className="device-row">
      <span className={`device-dot ${status}`} aria-hidden />
      <div className="device-text">
        <b>{label}</b>
        {status === 'on' && name ? ` · ${name}` : ''}
        <div className={status === 'on' ? 'num' : 'muted'}>{text}</div>
        {error && status !== 'on' && <div className="faint">{error}</div>}
      </div>
      {status !== 'on' && status !== 'connecting' && (
        <button type="button" className={`btn small${status === 'waiting' ? '' : ' primary'}`} onClick={onConnect}>
          {name ? 'Connect' : 'Pair'}
        </button>
      )}
    </div>
  );
}
