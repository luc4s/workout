import { useState } from 'react';
import { pingCoach } from '../../coach/ask';
import { modelLabel } from '../../coach/client';
import { getCoachConfig, monthKey, saveCoachConfig, useCoachConfig } from '../../coach/store';
import { Note, ToggleRow } from '../../components/controls';

export function CoachSettingsCard() {
  const cfg = useCoachConfig();
  const [key, setKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'good' | 'warn'; text: string }>();
  if (!cfg) return null;
  const masked = cfg.apiKey ? `••••••••${cfg.apiKey.slice(-4)}` : undefined;
  const usage = cfg.usage[monthKey(Date.now())];

  const test = async () => {
    setTesting(true);
    setMsg(undefined);
    try {
      const r = await pingCoach();
      const result = r.ok ? { at: Date.now(), ok: true, model: r.model } : { at: Date.now(), ok: false, message: r.message };
      await saveCoachConfig({ lastTest: result });
      setMsg(r.ok ? { kind: 'good', text: `Connected · served by ${modelLabel(r.model, r.fallback)}.` } : { kind: 'warn', text: `Not connected: ${r.message}` });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="card stack">
      <div className="section-title">Coach (Claude)</div>
      <div className="muted">
        With an Anthropic API key the coach adds a daily brief, a note on every rest and a session review on top of the built-in rules. Without a key — or
        offline — the rule-based coach still works.
      </div>
      <div className="row wrap" style={{ alignItems: 'flex-end' }}>
        <label className="stack tight" style={{ flex: 1, minWidth: 240 }}>
          <span style={{ fontWeight: 650 }}>API key</span>
          <input
            className="input"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={masked ?? 'sk-ant-…'}
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
        </label>
        <button
          className="btn primary"
          disabled={!key.trim()}
          onClick={async () => {
            await saveCoachConfig({ apiKey: key.trim() });
            setKey('');
            await test();
          }}
        >
          Save & test
        </button>
        {cfg.apiKey && (
          <>
            <button className="btn" onClick={test} disabled={testing}>
              {testing ? 'Testing…' : 'Test connection'}
            </button>
            <button
              className="btn danger"
              onClick={async () => {
                if (!confirm('Remove the API key from this device?')) return;
                const c = await getCoachConfig();
                delete c.apiKey;
                delete c.lastTest;
                await saveCoachConfig(c);
                setMsg({ kind: 'warn', text: 'Key removed.' });
              }}
            >
              Remove key
            </button>
          </>
        )}
      </div>
      {msg ? (
        <Note kind={msg.kind}>{msg.text}</Note>
      ) : cfg.lastTest ? (
        <div className="faint" style={{ fontSize: 14 }}>
          Last test {new Date(cfg.lastTest.at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}:{' '}
          {cfg.lastTest.ok ? `connected (${modelLabel(cfg.lastTest.model ?? '')})` : `failed — ${cfg.lastTest.message}`}
        </div>
      ) : null}
      <div className="faint" style={{ fontSize: 14 }}>
        Create a key at platform.claude.com → API keys (a dedicated key with a spending limit is best), paste it here. It is stored only on this device and is
        never included in backups. Uses Claude Fable 5.1, falling back to Claude Opus 5.5 when Fable is unavailable; the model that answered is shown with
        every note.
      </div>
      <div className="divider" />
      <ToggleRow title="Daily brief on Today" description="Why this session, what to focus on, before you set it up." checked={cfg.brief} onChange={(v) => saveCoachConfig({ brief: v })} />
      <ToggleRow title="Notes during rests" description="A short note after every logged set (one API call per set)." checked={cfg.inSession} onChange={(v) => saveCoachConfig({ inSession: v })} />
      <ToggleRow title="Session review" description="A review when you finish, kept with the session." checked={cfg.review} onChange={(v) => saveCoachConfig({ review: v })} />
      <div className="divider" />
      <div className="muted" style={{ fontSize: 14 }}>
        This month: {usage ? `${usage.calls} calls · ${fmtK(usage.input + usage.cacheRead + usage.cacheWrite)} tokens in / ${fmtK(usage.output)} out · ≈ $${usage.costUsd.toFixed(2)}` : 'no calls yet'}
        {' · '}estimated from list prices.
      </div>
      <div className="faint" style={{ fontSize: 14 }}>
        What is sent: the date, your settings (body weight, pull-up max, roadmap stage, chosen variations and weights), your last sessions (reps, RIR, loads,
        duration), today's logged sets, and your session notes for the review. The training analysis on Today (on demand) sends your whole history in full detail: every set, set and rest times, notes, rowing data. Nothing else.
      </div>
    </div>
  );
}

function fmtK(n: number): string {
  return n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(n);
}
