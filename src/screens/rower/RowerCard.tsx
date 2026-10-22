import { LineChart } from '../../components/charts';
import { getTemplate, getVariant } from '../../data/program';
import type { SessionRecord, Settings } from '../../db/db';
import { fmtPace, hrTargetText, isWorkPhase, paceVerdict, phaseHrReport, phaseRowerReport, phaseTargets, splitConsistency, spmVerdict } from '../../logic/rowing';

/** Rowing-machine summary of a finished session: tiles, pace chart, per-block table against the targets. */
export function RowerCard({ session, settings = {} }: { session: SessionRecord; settings?: Partial<Settings> }) {
  const rec = session.rower;
  const sum = rec?.summary;
  if (!rec || !sum) return null;
  const block = session.templateId === 'row' ? getVariant(getTemplate('row'), session.variantId).blocks[0] : undefined;
  const phases = block?.kind === 'interval' ? block.phases : [];
  const report = phases.length ? phaseRowerReport(session, phases) : [];
  const hr = phases.length ? phaseHrReport(session, phases, settings) : [];
  const hasWork = phases.some(isWorkPhase);
  const rows = report.map((p, i) => ({ ...p, phase: phases[i], hr: hr[i], work: isWorkPhase(phases[i]) })).filter((r) => (r.spm !== undefined || r.paceSec !== undefined) && (hasWork ? r.work : r.phase.intensity === 'steady'));
  const consistency = splitConsistency(rows.filter((r) => r.work));
  // Pace chart: one point per 10 s (valid samples only), lower is faster so the axis is not zero-based.
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < rec.paceSec.length; i += 10) {
    const win = rec.paceSec.slice(i, i + 10).filter((p) => p > 0);
    if (win.length) points.push({ x: rec.startedAt + i * 1000, y: Math.round(win.reduce((a, b) => a + b, 0) / win.length) });
  }
  const tone = (v?: 'on' | 'low' | 'high') => (v === 'on' ? 'var(--good-ink)' : v ? 'var(--warn)' : undefined);

  return (
    <div className="card stack">
      <div className="row between wrap">
        <div className="section-title">Rowing machine{rec.deviceName ? ` · ${rec.deviceName}` : ''}</div>
        {sum.coverage < 0.8 && <span className="badge warn">{Math.round(sum.coverage * 100)}% coverage</span>}
      </div>
      <div className="grid grid-4">
        <Stat label="Distance" value={`${sum.distanceM}`} unit="m" />
        <Stat label="Avg split" value={sum.avgPaceSec ? fmtPace(sum.avgPaceSec) : '–'} unit="/500 m" />
        <Stat label="Cadence" value={sum.avgSpm !== undefined ? `${sum.avgSpm}` : '–'} unit="spm average" />
        <Stat label="Power" value={sum.avgWatts !== undefined ? `${sum.avgWatts}` : '–'} unit={sum.maxWatts !== undefined ? `W average · max ${sum.maxWatts}` : 'W'} />
      </div>
      {points.length > 2 && <LineChart points={points} unit=" s/500 m" height={140} zeroBased={false} />}
      {rows.length > 0 && (
        <div className="scroll-x">
          <table className="data" style={{ fontSize: 14 }}>
            <thead>
              <tr>
                <th>Block</th>
                <th>spm</th>
                <th>Split</th>
                <th>W</th>
                <th>m</th>
                <th>♥</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const t = phaseTargets(r.phase, { ...settings });
                return (
                  <tr key={r.label}>
                    <td>{r.label}</td>
                    <td className="num" style={{ color: tone(r.spm !== undefined ? spmVerdict(r.spm, r.phase) : undefined) }}>
                      {r.spm !== undefined ? Math.round(r.spm) : '–'}
                      {t.spm ? <span className="faint"> / {t.spm}</span> : null}
                    </td>
                    <td className="num" style={{ color: tone(r.paceSec !== undefined ? paceVerdict(r.paceSec, r.phase, settings) : undefined) }}>
                      {r.paceSec !== undefined ? fmtPace(r.paceSec) : '–'}
                      {t.paceSplit ? <span className="faint"> / {t.paceSplit}</span> : null}
                    </td>
                    <td className="num">{r.watts ?? '–'}</td>
                    <td className="num">{r.distanceM !== undefined ? Math.round(r.distanceM) : '–'}</td>
                    <td className="num" style={{ color: tone(r.hr?.verdict === 'lag' ? undefined : r.hr?.verdict) }}>
                      {r.hr?.mean ?? '–'}
                      {r.hr?.mean !== undefined ? <span className="faint"> / {hrTargetText(r.hr.target)}</span> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {consistency && (
        <div className="muted" style={{ fontSize: 14 }}>
          {consistency.verdict === 'faded'
            ? `Last work interval ${consistency.deltaSec} s/500 m slower than the first (${fmtPace(consistency.firstSec)} → ${fmtPace(consistency.lastSec)}) — the start was too fast; hold the first one back next time.`
            : consistency.verdict === 'negative'
              ? `Last work interval ${-consistency.deltaSec} s/500 m faster than the first — even pacing with something left; the first one can start a touch harder.`
              : `Even splits across the work intervals (${fmtPace(consistency.firstSec)} → ${fmtPace(consistency.lastSec)}).`}
        </div>
      )}
      {rows.length > 0 && <div className="faint" style={{ fontSize: 13 }}>Means per block{phases.some((p) => p.hrLagSec) ? ' (hard intervals after the HR lag)' : ''}; targets after the slash. Green = on target, orange = outside.</div>}
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="stack tight">
      <div className="section-title">{label}</div>
      <span className="num" style={{ fontSize: 26, fontWeight: 800 }}>
        {value}
      </span>
      {unit && <div className="faint" style={{ fontSize: 13 }}>{unit}</div>}
    </div>
  );
}
