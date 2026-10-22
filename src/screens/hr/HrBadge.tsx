import { useLiveQuery } from 'dexie-react-hooks';
import { db, DEFAULT_SETTINGS, type Settings } from '../../db/db';
import { strap } from '../../hr/ble';
import { hrMaxOf, zoneOf } from '../../hr/metrics';
import { useStrap } from '../../hr/useHeartRate';

export const ZONE_COLORS = ['var(--text-3)', 'var(--rest)', 'var(--good)', 'var(--accent)', 'var(--hard)', 'var(--critical)'];

/** Live heart rate in the runner bar; tap to (re)connect. Hidden when Bluetooth is unsupported. */
export function HrBadge() {
  const st = useStrap();
  const s = { ...DEFAULT_SETTINGS, ...((useLiveQuery(() => db.kv.get('settings'), [])?.value as Partial<Settings> | undefined) ?? {}) };
  if (st.status === 'unsupported') return null;
  if (st.status === 'on' && st.bpm !== undefined) {
    const z = zoneOf(st.bpm, hrMaxOf(s));
    return (
      <span className="hr-badge num" style={{ color: ZONE_COLORS[z] }} title={`Zone ${z} of 5`}>
        ♥ {st.bpm}
        {st.contact === false ? ' ?' : ''}
      </span>
    );
  }
  const label = st.status === 'connecting' ? '♥ …' : st.status === 'lost' ? '♥ lost' : st.status === 'on' ? '♥ –' : '♥ connect';
  return (
    <button type="button" className="hr-badge btn small ghost" onClick={() => strap.connect(s.strapName)} aria-label="Connect the heart-rate strap">
      {label}
    </button>
  );
}
