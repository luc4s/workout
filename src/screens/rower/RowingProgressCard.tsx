import { visibleVariants, getTemplate } from '../../data/program';
import type { SessionRecord } from '../../db/db';
import { fmtPace } from '../../logic/rowing';
import { BADGES, longestStreak, rowingStreak, rowingTotals, unlockedBadges } from '../../logic/rowgame';

const fmt = (n: number) => n.toLocaleString('en-US').replace(/,/g, ' ');

/** Progress page: rowing streak, totals, bests per workout and the badges. */
export function RowingProgressCard({ sessions }: { sessions: SessionRecord[] }) {
  const totals = rowingTotals(sessions);
  if (!totals.sessions) return null;
  const unlocked = unlockedBadges(sessions);
  const streak = rowingStreak(sessions, Date.now());
  return (
    <div className="card stack">
      <div className="section-title">Rowing</div>
      <div className="grid grid-4">
        <Stat label="Weekly streak" value={`${streak}`} unit={`week${streak === 1 ? '' : 's'} · best ${longestStreak(sessions)}`} />
        <Stat label="Distance" value={`${totals.km}`} unit="km in total" />
        <Stat label="On target" value={`${fmt(totals.minutesOnTarget)}`} unit="minutes, all sessions" />
        <Stat label="Sessions" value={`${totals.sessions}`} unit={`badges ${unlocked.size} / ${BADGES.length}`} />
      </div>
      <div className="scroll-x">
        <table className="data">
          <thead>
            <tr>
              <th>Workout</th>
              <th>Sessions</th>
              <th>Best score</th>
              <th>Longest</th>
              <th>Fastest split</th>
            </tr>
          </thead>
          <tbody>
            {visibleVariants(getTemplate('row')).map((v) => {
              const b = totals.byVariant[v.id];
              return (
                <tr key={v.id}>
                  <td>{v.name}</td>
                  <td className="num">{b?.sessions ?? 0}</td>
                  <td className="num">{b?.bestScore !== undefined ? fmt(b.bestScore) : '–'}</td>
                  <td className="num">{b?.bestDistance ? `${fmt(b.bestDistance)} m` : '–'}</td>
                  <td className="num">{b?.bestSplitSec ? fmtPace(b.bestSplitSec) : '–'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="badge-grid">
        {BADGES.map((b) => (
          <div key={b.id} className={`badge-tile${unlocked.has(b.id) ? ' got' : ''}`} title={b.how}>
            <div className="badge-name">{b.name}</div>
            <div className="badge-how">{b.how}</div>
          </div>
        ))}
      </div>
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
