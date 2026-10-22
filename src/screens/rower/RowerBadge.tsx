import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Settings } from '../../db/db';
import { rower } from '../../rower/ble';
import { useRower } from '../../rower/useRower';
import { fmtPace } from '../../logic/rowing';

/** Live rower numbers in the runner bar; tap to (re)connect. Hidden when Bluetooth is unsupported. */
export function RowerBadge() {
  const st = useRower();
  const s = useLiveQuery(() => db.kv.get('settings'), [])?.value as Partial<Settings> | undefined;
  if (st.status === 'unsupported') return null;
  if (st.status === 'on' && st.last) {
    const parts = [st.last.spm !== undefined ? `${Math.round(st.last.spm)} spm` : '', st.last.paceSec !== undefined ? `${fmtPace(st.last.paceSec)}` : ''].filter(Boolean);
    return (
      <span className="hr-badge num rower-badge" title={st.deviceName ?? 'rower'}>
        ⟋ {parts.join(' · ') || '–'}
      </span>
    );
  }
  const label = st.status === 'connecting' ? '⟋ …' : st.status === 'lost' ? '⟋ lost' : st.status === 'on' ? '⟋ –' : '⟋ rower';
  return (
    <button type="button" className="hr-badge btn small ghost" onClick={() => rower.connect(s?.rowerName)} aria-label="Connect the rowing machine">
      {label}
    </button>
  );
}
