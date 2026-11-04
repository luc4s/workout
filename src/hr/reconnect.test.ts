import { afterEach, describe, expect, it } from 'vitest';
import { reconnectSupport, strap, type StrapState } from './ble';
import { rower } from '../rower/ble';

/** A fake remembered device: asleep until `appear()`, then advertising; GATT with the given services. */
function fakeDevice(name: string, services: Record<string, unknown>, opts: { watch: boolean }) {
  const dev = new EventTarget() as EventTarget & Record<string, unknown>;
  let awake = false;
  const notifier = Object.assign(new EventTarget(), { startNotifications: async () => notifier, readValue: async () => new DataView(new ArrayBuffer(4)) });
  const service = { getCharacteristic: async () => notifier };
  const gatt = {
    connected: false,
    connect: async () => {
      if (!awake) throw new Error('device out of range');
      gatt.connected = true;
      return gatt;
    },
    getPrimaryService: async (s: unknown) => {
      if (!(String(s) in services)) throw new Error('no such service');
      return service;
    },
    disconnect: () => undefined,
  };
  Object.assign(dev, { name, gatt });
  let signal: AbortSignal | undefined;
  if (opts.watch) dev.watchAdvertisements = async (o?: { signal?: AbortSignal }) => void (signal = o?.signal);
  return {
    dev,
    appear: () => {
      awake = true;
      if (signal && !signal.aborted) dev.dispatchEvent(new Event('advertisementreceived'));
    },
  };
}

function install(devices: unknown[]) {
  Object.defineProperty(globalThis, 'navigator', { value: { bluetooth: { getDevices: async () => devices, requestDevice: async () => devices[0] } }, configurable: true });
}
const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(async () => {
  await strap.disconnect();
  await rower.disconnect();
  strap._reset();
  rower._reset();
});

describe('reconnecting remembered devices', () => {
  it('waits for a strap that is not worn yet and connects when it advertises', async () => {
    const h10 = fakeDevice('Polar H10 1234', { heart_rate: 1, battery_service: 1 }, { watch: true });
    install([h10.dev]);
    strap._reset();
    expect(reconnectSupport()).toBe('auto');
    const seen: StrapState['status'][] = [];
    strap.onState((s) => seen.push(s.status));
    expect(await strap.autoConnect('Polar H10 1234')).toBe(false);
    expect(strap.state.status).toBe('waiting');
    // A second call while waiting does nothing.
    expect(await strap.autoConnect('Polar H10 1234')).toBe(false);
    h10.appear();
    await flush();
    await flush();
    expect(strap.state.status).toBe('on');
    expect(strap.state.deviceName).toBe('Polar H10 1234');
    expect(seen).toContain('waiting');
  });

  it('without advertisement watching, tries one direct connection', async () => {
    const h10 = fakeDevice('Polar H10 1234', { heart_rate: 1 }, { watch: false });
    install([h10.dev]);
    strap._reset();
    expect(await strap.autoConnect('Polar H10 1234')).toBe(false); // asleep: off, the Connect button is the way
    expect(strap.state.status).toBe('off');
    h10.appear();
    expect(await strap.autoConnect('Polar H10 1234')).toBe(true);
    expect(strap.state.status).toBe('on');
  });

  it('the console waits for its own name; the strap is not mistaken for it', async () => {
    const h10 = fakeDevice('Polar H10 1234', { heart_rate: 1 }, { watch: true });
    const con = fakeDevice('ROWER 42', { '6182': 1 }, { watch: true }); // 0x1826 as a number key
    install([h10.dev, con.dev]);
    rower._reset();
    expect(await rower.autoConnect('ROWER 42')).toBe(false);
    expect(rower.state.status).toBe('waiting');
    h10.appear();
    await flush();
    expect(rower.state.status).toBe('waiting');
    con.appear();
    await flush();
    await flush();
    expect(rower.state.status).toBe('on');
  });

  it('nothing remembered, or no Web Bluetooth', async () => {
    install([]);
    strap._reset();
    expect(await strap.autoConnect('Polar H10 1234')).toBe(false);
    expect(strap.state.status).toBe('off');
    expect(await strap.autoConnect(undefined)).toBe(false);
    Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
    expect(reconnectSupport()).toBe('none');
  });
});
