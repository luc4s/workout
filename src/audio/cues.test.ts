import { describe, expect, it } from 'vitest';
import { cuesBetween, DRIFT_COOLDOWN_MS, type CueSnapshot } from './cues';

const base: CueSnapshot = { phaseIndex: 1, remainingSec: 10, hasNext: true, multiplier: 1, offRun: 0, medals: [], at: 100_000 };
const next = (patch: Partial<CueSnapshot>): CueSnapshot => ({ ...base, at: base.at + 1000, ...patch });

describe('rowing sound cues', () => {
  it('counts down the last 3 s of a block and marks the new one', () => {
    expect(cuesBetween(base, next({ remainingSec: 9 }), 0).cues).toEqual([]);
    expect(cuesBetween({ ...base, remainingSec: 4 }, next({ remainingSec: 3 }), 0).cues).toEqual(['tick']);
    expect(cuesBetween({ ...base, remainingSec: 3 }, next({ remainingSec: 3 }), 0).cues).toEqual([]); // same second
    expect(cuesBetween({ ...base, remainingSec: 1 }, next({ phaseIndex: 2, remainingSec: 240 }), 0).cues).toEqual(['go']);
    expect(cuesBetween({ ...base, remainingSec: 4, hasNext: false }, next({ remainingSec: 3, hasNext: false }), 0).cues).toEqual([]);
  });

  it('plays the medal of a finished interval and the combo level-up', () => {
    expect(cuesBetween({ ...base, remainingSec: 1 }, next({ phaseIndex: 2, remainingSec: 120, medals: ['silver'] }), 0).cues).toEqual(['go', 'silver']);
    expect(cuesBetween(base, next({ medals: [null] }), 0).cues).toEqual([]);
    expect(cuesBetween({ ...base, multiplier: 1 }, next({ multiplier: 2 }), 0).cues).toEqual(['levelup']);
  });

  it('warns once when the combo breaks, then not again for a while', () => {
    const r = cuesBetween({ ...base, offRun: 2 }, next({ offRun: 3 }), 0);
    expect(r.cues).toEqual(['drift']);
    expect(r.driftAt).toBe(base.at + 1000);
    expect(cuesBetween({ ...base, offRun: 2 }, next({ offRun: 3 }), r.driftAt - DRIFT_COOLDOWN_MS + 5000).cues).toEqual([]);
    expect(cuesBetween({ ...base, offRun: 3 }, next({ offRun: 4 }), 0).cues).toEqual([]); // already broken
  });

  it('says nothing on the first snapshot', () => {
    expect(cuesBetween(undefined, base, 0).cues).toEqual([]);
  });
});
