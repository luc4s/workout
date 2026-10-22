import { describe, expect, it } from 'vitest';
import { formatScan, parseFeatures, parseRowerData, uuidOf } from './ble';

function frame(bytes: number[]): DataView {
  return new DataView(Uint8Array.from(bytes).buffer);
}

describe('FTMS rower data', () => {
  it('reads the minimal frame: stroke rate (½ spm) and stroke count', () => {
    const s = parseRowerData(frame([0x00, 0x00, 48, 0x2c, 0x01]), 5);
    expect(s).toEqual({ spm: 24, strokes: 300, at: 5 });
  });

  it('skips the stroke fields when "more data" is set and reads distance, pace, power', () => {
    // flags: more data (bit0) + total distance (bit2) + inst pace (bit3) + inst power (bit5)
    const s = parseRowerData(frame([0x2d, 0x00, 0x10, 0x27, 0x00, 0x7d, 0x00, 0xb4, 0x00]), 1);
    expect(s).toEqual({ distanceM: 10000, paceSec: 125, watts: 180, at: 1 });
  });

  it('reads a full frame in spec order, treats 0xFFFF pace as none and keeps signed power', () => {
    const bytes = [
      0xfe, 0x0f, // flags: every field except "more data" (bits 1–11 set)
      44, 0x10, 0x00, // stroke rate 22, count 16
      40, // average stroke rate 20 (skipped)
      0x00, 0x00, 0x01, // distance 65536 m (24-bit)
      0xff, 0xff, // inst pace: none
      0x82, 0x00, // avg pace 130
      0xfb, 0xff, // inst power -5 W
      0x96, 0x00, // avg power 150
      0x05, 0x00, // resistance 5
      0x2a, 0x00, 0xe8, 0x03, 0x0a, // energy total 42 kcal, 1000/h, 10/min
      0x8c, // hr 140
      0x50, // MET 8.0
      0x3c, 0x00, // elapsed 60 s
      0x10, 0x0e, // remaining 3600 s
    ];
    const s = parseRowerData(frame(bytes), 2);
    expect(s).toEqual({ spm: 22, strokes: 16, distanceM: 65536, avgPaceSec: 130, watts: -5, avgWatts: 150, resistance: 5, kcal: 42, hr: 140, elapsedSec: 60, at: 2 });
  });

  it('tolerates a truncated frame', () => {
    expect(parseRowerData(frame([0x2c, 0x00, 0x10, 0x27]), 3)).toEqual({ at: 3 });
  });

  it('names the features a console claims', () => {
    expect(parseFeatures(frame([0x26, 0x40, 0x00, 0x00]))).toEqual(['cadence', 'total distance', 'pace', 'power']);
  });

  it('formats a scan report', () => {
    expect(uuidOf(0x1826)).toBe('00001826-0000-1000-8000-00805f9b34fb');
    const text = formatScan({
      name: 'ROWER 1234',
      services: [{ uuid: uuidOf(0x1826), label: 'FTMS', characteristics: [{ uuid: uuidOf(0x2ad1), properties: ['notify'] }] }],
      missing: ['Heart Rate'],
      at: 0,
    });
    expect(text).toContain('Device: ROWER 1234');
    expect(text).toContain('00002ad1-0000-1000-8000-00805f9b34fb [notify]');
    expect(text).toContain('Not found: Heart Rate');
  });
});
