import { Link } from 'react-router-dom';
import { TEMPLATES, WEEK_PLAN, getTemplate } from '../data/program';
import { PROGRAM_SUMMARY, PROGRAM_TITLE, PULLUP_ROADMAP_TEXT, RULES, ROWING_NOTE, ROWING_ZONES, SCHEDULE_NOTE } from '../data/rules';
import { isWorkPhase, spanText } from '../logic/rowing';
import { rangeText } from '../logic/progression';

export default function Reference() {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{PROGRAM_TITLE}</h1>
          <div className="muted">{PROGRAM_SUMMARY}</div>
        </div>
      </div>

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <div className="card stack">
          <div className="section-title">Week</div>
          <div className="list">
            {WEEK_PLAN.map((d) => (
              <div key={d.label} className="row">
                <b style={{ width: 48 }}>{d.label}</b>
                {d.templateId ? (
                  <span>
                    {getTemplate(d.templateId).name} <span className="faint">· {getTemplate(d.templateId).subtitle}</span>
                  </span>
                ) : (
                  <span className="faint">{d.day === 6 ? 'Rest / walk' : 'Rest'}</span>
                )}
              </div>
            ))}
          </div>
          <div className="faint">{SCHEDULE_NOTE}</div>
        </div>

        <div className="card stack">
          <div className="section-title">Rules</div>
          <div className="list">
            {RULES.map((r) => (
              <div key={r.title} className="stack tight">
                <b>{r.title}</b>
                <span className="muted">{r.body}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card stack">
        <div className="section-title">Pull-up roadmap</div>
        {PULLUP_ROADMAP_TEXT.map((t) => (
          <p key={t} style={{ margin: 0 }}>
            {t}
          </p>
        ))}
      </div>

      {TEMPLATES.map((t) => (
        <div key={t.id} className="card stack">
          <div className="row between wrap">
            <h2>{t.name}</h2>
            <Link to={`/setup/${t.id}`} className="btn small primary">
              Start
            </Link>
          </div>
          <div className="muted">{t.id === 'row' ? ROWING_NOTE : t.intro}</div>
          {t.id === 'row' && (
            <div className="row wrap muted" style={{ gap: 14, fontSize: 14 }}>
              {ROWING_ZONES.map((z) => (
                <span key={z.id}>
                  <b>{z.id}</b> {z.name} {z.pct[0]}–{z.pct[1]} % · RPE {z.rpe}
                </span>
              ))}
            </div>
          )}
          <div className="scroll-x">
            <table className="data">
              <thead>
                <tr>
                  <th>Exercise</th>
                  <th>Sets × reps</th>
                  <th>RIR</th>
                  <th>Notes / progression</th>
                </tr>
              </thead>
              <tbody>
                {t.variants.filter((v) => !v.hidden).flatMap((v) =>
                  v.blocks.flatMap((b, bi) => {
                    if (b.kind === 'warmup') {
                      return [
                        <tr key={`${v.id}-${bi}`}>
                          <td colSpan={4} className="muted">
                            <b>{b.title}</b> ~{Math.round(b.durationSec / 60)} min: {b.checklist.join(', ')}
                          </td>
                        </tr>,
                      ];
                    }
                    if (b.kind === 'interval') {
                      const work = b.phases.filter(isWorkPhase);
                      const main = work[0] ?? b.phases.find((p) => p.intensity === 'steady') ?? b.phases[0];
                      const total = b.phases.reduce((a, p) => a + p.durationSec, 0);
                      return [
                        <tr key={`${v.id}-${bi}`}>
                          <td>
                            <b>{v.name}</b>
                            <div className="faint">{Math.round(total / 60)} min</div>
                          </td>
                          <td className="num">
                            {work.length ? `${work.length} × ${Math.round(work[0].durationSec / 60)} min` : `${b.phases.filter((p) => p.intensity === 'steady').length} × ${Math.round(main.durationSec / 60)} min`}
                            {main.hrPct ? ` @ ${main.hrPct[0]}–${main.hrPct[1]} %` : ''}
                          </td>
                          <td className="num">{main.spm !== undefined ? `${spanText(main.spm)} spm · RPE ${spanText(main.rpe) ?? '—'}` : '—'}</td>
                          <td className="muted">{v.description}</td>
                        </tr>,
                      ];
                    }
                    return [
                      <tr key={`${v.id}-${bi}-h`}>
                        <td colSpan={4} className="section-title" style={{ paddingTop: 16 }}>
                          {b.title}
                        </td>
                      </tr>,
                      ...b.exercises.map((p) => (
                        <tr key={`${v.id}-${bi}-${p.key}`}>
                          <td>
                            <b>
                              <Link to={`/exercises/${p.exerciseId}`} style={{ color: 'inherit' }}>
                                {p.name}
                              </Link>
                            </b>
                          </td>
                          <td className="num">
                            {b.kind === 'rest-pause' ? '1 set' : `${rangeText(p.sets)} × ${rangeText(p.reps)}${p.perSide ? ' /leg' : ''}`}
                          </td>
                          <td className="num">{rangeText(p.rir)}</td>
                          <td className="muted">{p.notes}</td>
                        </tr>
                      )),
                    ];
                  }),
                )}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
