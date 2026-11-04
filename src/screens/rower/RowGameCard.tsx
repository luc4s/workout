import { useLiveQuery } from 'dexie-react-hooks';
import { getTemplate, getVariant } from '../../data/program';
import { db, DEFAULT_SETTINGS, type SessionRecord, type Settings } from '../../db/db';
import { fmtPace } from '../../logic/rowing';
import { ghostFor, medalPhases, newBadges, newBests, type Best } from '../../logic/rowgame';

const fmt = (n: number) => n.toLocaleString('en-US').replace(/,/g, ' ');
const MEDAL_LABEL = { gold: 'Gold', silver: 'Silver', bronze: 'Bronze' } as const;

function bestText(b: Best): string {
  const v = b.kind === 'score' ? `${fmt(b.value)} points` : b.kind === 'distance' ? `${fmt(b.value)} m` : `${fmtPace(b.value)} /500 m`;
  const was = b.previous === undefined ? '' : ` (was ${b.kind === 'score' ? fmt(b.previous) : b.kind === 'distance' ? `${fmt(b.previous)} m` : fmtPace(b.previous)})`;
  return `${b.kind === 'score' ? 'Best score' : b.kind === 'distance' ? 'Longest distance' : 'Fastest average split'}: ${v}${was}`;
}

/** The rowing game of a finished session: score, medals, the race against last time, new bests and badges. */
export function RowGameCard({ session }: { session: SessionRecord }) {
  const data = useLiveQuery(async () => {
    const [sessions, row] = await Promise.all([db.sessions.toArray(), db.kv.get('settings')]);
    return { sessions, settings: { ...DEFAULT_SETTINGS, ...((row?.value as Partial<Settings>) ?? {}) } };
  }, []);
  const game = session.rowing?.game;
  if (!game || !data || session.templateId !== 'row') return null;
  const block = getVariant(getTemplate('row'), session.variantId).blocks[0];
  const phases = block.kind === 'interval' ? block.phases : [];
  const labels = medalPhases(phases).map((i) => phases[i].label);
  const ghost = ghostFor(data.sessions, session.variantId, session.startedAt, data.settings);
  const metres = game.distCurve && ghost?.distCurve ? game.distCurve[game.distCurve.length - 1] - ghost.distCurve[ghost.distCurve.length - 1] : undefined;
  const points = ghost ? game.score - ghost.score : undefined;
  const bests = newBests(data.sessions, session).filter((b) => b.previous !== undefined);
  const badges = newBadges(data.sessions, session);
  const onPct = Math.round((game.onSec / game.judgedSec) * 100);

  return (
    <div className="card stack">
      <div className="section-title">Rowing game</div>
      <div className="grid grid-4">
        <Stat label="Score" value={fmt(game.score)} unit="points" />
        <Stat label="On target" value={`${onPct}%`} unit={`${Math.round(game.onSec / 60)} of ${Math.round(game.judgedSec / 60)} min judged`} />
        <Stat label="Best combo" value={`×${game.maxMultiplier}`} unit={game.maxMultiplier >= 4 ? '3 min+ without a break' : 'multiplier reached'} />
        <Stat
          label="Vs last time"
          value={points === undefined ? '–' : metres !== undefined ? `${metres >= 0 ? '+' : '−'}${fmt(Math.abs(metres))} m` : `${points >= 0 ? '+' : '−'}${fmt(Math.abs(points))}`}
          unit={ghost ? `${metres !== undefined ? `${points! >= 0 ? '+' : '−'}${fmt(Math.abs(points!))} points · ` : 'points · '}${new Date(ghost.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : 'first time on this workout'}
        />
      </div>
      {game.medals.length > 0 && (
        <div className="row wrap" style={{ gap: 8 }}>
          {game.medals.map((m, i) => (
            <span key={i} className={`medal-chip ${m ?? 'none'}`}>
              <b className={`medal ${m ?? ''}`} /> {labels[i] ?? `Block ${i + 1}`} · {m ? MEDAL_LABEL[m] : 'no medal'}
            </span>
          ))}
        </div>
      )}
      {bests.map((b) => (
        <div key={b.kind} className="note good">
          New personal best — {bestText(b)}
        </div>
      ))}
      {badges.map((b) => (
        <div key={b.id} className="note good">
          Badge unlocked: <b>{b.name}</b> — {b.how}
        </div>
      ))}
      <div className="faint" style={{ fontSize: 13 }}>
        10 points a second on target × the combo (×2 after 30 s, ×3 after 90 s, ×4 after 3 min; 3 s off target breaks it). Medals: 90 / 75 / 50 % of an interval on target.
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
