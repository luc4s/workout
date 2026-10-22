import { LineChart } from '../../components/charts';
import type { HrSummary, SessionRecord } from '../../db/db';
import { compareHr, fmtZones, ZONE_NAMES } from '../../hr/metrics';
import { ZONE_COLORS } from './HrBadge';

/** Heart-rate summary of a finished session: chart, tiles, zones, comparison with the previous same-template session. */
export function SessionHrCard(props: { session: SessionRecord; previous?: HrSummary; usualRecovery?: number }) {
  const { session, previous, usualRecovery } = props;
  const hr = session.hr;
  const sum = hr?.summary;
  if (!hr || !sum) return null;
  // One point per 10 s for the chart (valid samples only).
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < hr.bpm.length; i += 10) {
    const win = hr.bpm.slice(i, i + 10).filter((b) => b > 0);
    if (win.length) points.push({ x: hr.startedAt + i * 1000, y: Math.round(win.reduce((a, b) => a + b, 0) / win.length) });
  }
  const cmp = previous ? compareHr(sum, previous) : undefined;
  const sign = (n?: number) => (n === undefined ? '' : `${n >= 0 ? '+' : ''}${n}`);
  const total = sum.zonesSec.reduce((a, b) => a + b, 0) || 1;

  return (
    <div className="card stack">
      <div className="row between wrap">
        <div className="section-title">Heart rate{hr.deviceName ? ` · ${hr.deviceName}` : ''}</div>
        {sum.coverage < 0.8 && <span className="badge warn">{Math.round(sum.coverage * 100)}% coverage</span>}
      </div>
      <div className="grid grid-4">
        <Stat label="Average" value={`${sum.avg}`} unit="bpm" delta={cmp ? sign(cmp.avg) : undefined} />
        <Stat label="Max" value={`${sum.max}`} unit={`bpm · ${Math.round((sum.max / sum.hrMax) * 100)}%`} delta={cmp ? sign(cmp.max) : undefined} />
        <Stat label="Load" value={sum.trimp !== undefined ? `${Math.round(sum.trimp)}` : '–'} unit={sum.trimpMethod === 'banister' ? 'TRIMP' : 'zone TRIMP'} delta={cmp?.trimp !== undefined ? sign(Math.round(cmp.trimp)) : undefined} />
        <Stat label="≈ Calories" value={sum.kcal !== undefined ? `${sum.kcal}` : '–'} unit={sum.kcal !== undefined ? 'kcal, HR estimate' : 'needs sex, birth year and weight in Settings'} delta={cmp?.kcal !== undefined ? sign(Math.round(cmp.kcal)) : undefined} />
      </div>
      <LineChart points={points} unit=" bpm" height={160} zeroBased={false} />
      <div className="zone-bar" aria-label={fmtZones(sum.zonesSec)}>
        {sum.zonesSec.map((sec, i) => (
          <span key={i} style={{ width: `${(sec / total) * 100}%`, background: ZONE_COLORS[i + 1] }} title={`${ZONE_NAMES[i]}: ${Math.round(sec / 60)} min`} />
        ))}
      </div>
      <div className="row wrap muted" style={{ gap: 12, fontSize: 14 }}>
        {sum.zonesSec.map((sec, i) => (
          <span key={i}>
            <span style={{ color: ZONE_COLORS[i + 1], fontWeight: 700 }}>Z{i + 1}</span> {Math.round(sec / 60)}′
          </span>
        ))}
        {sum.recoveryMean !== undefined && (
          <span>
            Recovery <b className="num">{sum.recoveryMean} bpm</b>/60 s{usualRecovery !== undefined ? ` (usual ${usualRecovery})` : ''}
          </span>
        )}
      </div>
      {hr.readiness && (
        <div className="muted" style={{ fontSize: 14 }}>
          Readiness check: resting HR {hr.readiness.restingHr}, HRV {hr.readiness.rmssd} ms — {hr.readiness.score === 'go' ? 'on baseline' : hr.readiness.score === 'caution' ? 'a little low' : 'run down'}.
        </div>
      )}
      {cmp && <div className="faint" style={{ fontSize: 13 }}>Deltas are against the previous {session.templateId === 'micro' ? 'micro' : session.templateId === 'row' ? 'rowing' : `Session ${session.templateId}`} with a strap.</div>}
    </div>
  );
}

function Stat({ label, value, unit, delta }: { label: string; value: string; unit?: string; delta?: string }) {
  return (
    <div className="stack tight">
      <div className="section-title">{label}</div>
      <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
        <span className="num" style={{ fontSize: 26, fontWeight: 800 }}>
          {value}
        </span>
        {delta && (
          <span className={`badge ${delta.startsWith('+') ? 'warn' : 'good'}`}>{delta}</span>
        )}
      </div>
      {unit && <div className="faint" style={{ fontSize: 13 }}>{unit}</div>}
    </div>
  );
}
