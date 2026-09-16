import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useParams } from 'react-router-dom';
import { getTemplate, PRESCRIPTIONS, PULLUP_ROADMAP } from '../data/program';
import { db, type SetRecord } from '../db/db';
import { Note } from '../components/controls';
import { IconTrend } from '../components/icons';
import { formatClock } from '../hooks/useNow';
import { variationOf } from '../logic/progression';
import { advanceStage, nextTimeSuggestions } from '../logic/session';

type NextTime = Awaited<ReturnType<typeof nextTimeSuggestions>>;

export default function Summary() {
  const id = Number(useParams().id);
  const session = useLiveQuery(() => db.sessions.get(id), [id]);
  const sets = useLiveQuery(() => db.sets.where('sessionId').equals(id).toArray(), [id]);
  const [notes, setNotes] = useState<string>();
  const [next, setNext] = useState<NextTime>();
  const [prs, setPrs] = useState<string[]>([]);
  const [stageDone, setStageDone] = useState(false);

  useEffect(() => {
    if (!session) return;
    nextTimeSuggestions(session.templateId, session.variantId).then(setNext);
  }, [session, stageDone]);

  useEffect(() => {
    if (!sets || !session) return;
    findPrs(sets, session.startedAt).then(setPrs);
  }, [sets, session]);

  if (!session || !sets) return null;
  const template = getTemplate(session.templateId);
  const duration = ((session.endedAt ?? Date.now()) - session.startedAt) / 1000;
  const bySlot = groupSlots(sets);
  const totalReps = sets.reduce((a, s) => a + (s.repsLeft !== undefined ? (s.repsLeft ?? 0) + (s.repsRight ?? 0) : s.reps), 0);
  const stageUp = next?.find((n) => n.suggestion.kind === 'stage-up');

  return (
    <div className="page">
      <div className="page-head">
        <div className="stack tight">
          <span className="badge good">Session complete</span>
          <h1>{template.name}</h1>
          <div className="muted">
            {new Date(session.startedAt).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>
        <Link to="/" className="btn primary">
          Back to today
        </Link>
      </div>

      <div className="grid grid-4">
        <Stat label="Duration" value={formatClock(duration)} warn={duration / 60 > template.targetMin + 2} />
        {sets.length > 0 && <Stat label="Sets logged" value={String(sets.length)} />}
        {sets.length > 0 && <Stat label="Total reps" value={String(totalReps)} />}
        {session.rowing?.distanceM && <Stat label="Distance" value={`${session.rowing.distanceM} m`} />}
        {session.rowing?.avgSplit && <Stat label="Avg split" value={session.rowing.avgSplit} />}
      </div>

      {duration / 60 > template.targetMin + 2 && (
        <Note kind="warn">Session crept past {template.targetMin} min — tighten superset transitions or drop the finisher next time.</Note>
      )}
      {prs.map((p) => (
        <Note key={p} kind="good">
          {p}
        </Note>
      ))}

      {stageUp && stageUp.suggestion.nextStage !== undefined && !stageDone && (
        <div className="card row wrap" style={{ borderColor: 'var(--good)' }}>
          <IconTrend width={32} height={32} style={{ color: 'var(--good-ink)' }} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <h3>Pull-up roadmap: level up</h3>
            <div className="muted">{stageUp.suggestion.message}</div>
          </div>
          <button
            className="btn good"
            onClick={async () => {
              await advanceStage(stageUp.suggestion.nextStage!);
              setStageDone(true);
            }}
          >
            Advance to {PULLUP_ROADMAP[stageUp.suggestion.nextStage].label}
          </button>
        </div>
      )}

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        {sets.length > 0 && (
          <div className="card stack">
            <div className="section-title">What you did</div>
            <div className="list">
              {bySlot.map(([slot, list]) => (
                <div key={slot} className="row between wrap">
                  <div>
                    <div style={{ fontWeight: 650 }}>{PRESCRIPTIONS[slot]?.name ?? slot}</div>
                    <div className="faint" style={{ fontSize: 14 }}>
                      {variationOf(PRESCRIPTIONS[slot], list[0].variationId)?.name}
                    </div>
                  </div>
                  <div className="num muted">
                    {list.map((s) => (s.repsLeft !== undefined ? `${s.repsLeft}/${s.repsRight}` : s.reps)).join(' · ')}
                    {list[0].loadKg ? ` @ +${list[0].loadKg} kg` : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="stack">
          {next && next.length > 0 && !session.flags.badDay && (
            <div className="card stack">
              <div className="section-title">Next time</div>
              <div className="list">
                {next.map(({ prescription, suggestion }) => (
                  <div key={prescription.key} className="stack tight">
                    <div style={{ fontWeight: 650 }}>{prescription.name}</div>
                    <div className="muted" style={{ fontSize: 15 }}>
                      {suggestion.message}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {session.flags.badDay && <Note kind="info">Bad-day session — it won't count against your progression. A submaximal session beats a skipped one.</Note>}
          <div className="card stack">
            <div className="section-title">Notes</div>
            <textarea
              className="input"
              placeholder="Sleep, energy, anything that hurt…"
              value={notes ?? session.notes ?? ''}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => notes !== undefined && db.sessions.update(id, { notes })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="card stack tight">
      <div className="section-title">{label}</div>
      <div className="num" style={{ fontSize: 34, fontWeight: 800, color: warn ? 'var(--critical)' : undefined }}>
        {value}
      </div>
    </div>
  );
}

export function groupSlots(sets: SetRecord[]): [string, SetRecord[]][] {
  const map = new Map<string, SetRecord[]>();
  for (const s of [...sets].sort((a, b) => a.completedAt - b.completedAt)) {
    const key = s.slot;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(s);
  }
  for (const list of map.values()) list.sort((a, b) => a.setNumber - b.setNumber);
  return [...map.entries()];
}

/** Rep PRs: best single set for a slot at the same variation and load, versus all earlier sessions. */
async function findPrs(sets: SetRecord[], before: number): Promise<string[]> {
  const out: string[] = [];
  for (const [slot, list] of groupSlots(sets)) {
    if (slot.includes('.rp-')) continue;
    const best = Math.max(...list.map((s) => s.reps));
    const v = list[0].variationId;
    const kg = list[0].loadKg ?? 0;
    const previous = await db.sets.where('slot').equals(slot).filter((s) => s.completedAt < before && s.variationId === v && (s.loadKg ?? 0) === kg).toArray();
    if (previous.length === 0) continue;
    const prevBest = Math.max(...previous.map((s) => s.reps));
    if (best > prevBest) {
      out.push(`Rep PR on ${PRESCRIPTIONS[slot]?.name ?? slot}: ${best} reps${kg ? ` @ +${kg} kg` : ''} (previous best ${prevBest}).`);
    }
  }
  return out;
}
