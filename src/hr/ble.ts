/**
 * Web Bluetooth client for a heart-rate strap (Polar H10 or any strap with the standard
 * Heart Rate Service). One connection for the whole app; views subscribe to samples and status.
 * Works in Chrome on Android / desktop; `isBluetoothSupported()` is false elsewhere.
 */

export interface HrSample {
  bpm: number;
  /** RR intervals in ms (may be empty: the strap sends them when it has them). */
  rr: number[];
  /** Sensor-contact flag when the strap reports it. */
  contact?: boolean;
  /** Energy expended (kJ) when the strap reports it. */
  energy?: number;
  at: number;
}

/** Parse a Heart Rate Measurement (0x2A37) value. */
export function parseHeartRate(data: DataView, at = Date.now()): HrSample {
  const flags = data.getUint8(0);
  const wide = (flags & 0x01) !== 0;
  const contactSupported = (flags & 0x04) !== 0;
  const contact = contactSupported ? (flags & 0x02) !== 0 : undefined;
  const hasEnergy = (flags & 0x08) !== 0;
  const hasRr = (flags & 0x10) !== 0;
  let i = 1;
  const bpm = wide ? data.getUint16(i, true) : data.getUint8(i);
  i += wide ? 2 : 1;
  let energy: number | undefined;
  if (hasEnergy) {
    energy = data.getUint16(i, true);
    i += 2;
  }
  const rr: number[] = [];
  if (hasRr) {
    for (; i + 1 < data.byteLength; i += 2) rr.push(Math.round((data.getUint16(i, true) / 1024) * 1000));
  }
  return { bpm, rr, contact, energy, at };
}

export type StrapStatus = 'unsupported' | 'off' | 'connecting' | 'on' | 'lost';

export interface StrapState {
  status: StrapStatus;
  deviceName?: string;
  bpm?: number;
  contact?: boolean;
  battery?: number;
  lastAt?: number;
  error?: string;
}

type SampleListener = (s: HrSample) => void;
type StateListener = (s: StrapState) => void;

export function isBluetoothSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.bluetooth;
}

class Strap {
  state: StrapState = { status: isBluetoothSupported() ? 'off' : 'unsupported' };
  private device?: BluetoothDevice;
  private sampleListeners = new Set<SampleListener>();
  private stateListeners = new Set<StateListener>();
  private wantConnected = false;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private retries = 0;

  onSample(fn: SampleListener): () => void {
    this.sampleListeners.add(fn);
    return () => this.sampleListeners.delete(fn);
  }

  onState(fn: StateListener): () => void {
    this.stateListeners.add(fn);
    fn(this.state);
    return () => this.stateListeners.delete(fn);
  }

  private set(patch: Partial<StrapState>) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.stateListeners) fn(this.state);
  }

  /**
   * Connect: first a strap this origin already knows (no picker), else the system picker
   * (needs a user gesture). `knownName` narrows the known-device lookup.
   */
  async connect(knownName?: string): Promise<void> {
    if (!isBluetoothSupported()) {
      this.set({ status: 'unsupported' });
      return;
    }
    this.wantConnected = true;
    this.set({ status: 'connecting', error: undefined });
    try {
      let device = await this.knownDevice(knownName);
      if (!device) {
        device = await navigator.bluetooth.requestDevice({ filters: [{ services: ['heart_rate'] }], optionalServices: ['battery_service'] });
      }
      await this.attach(device);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.wantConnected = false;
      this.set({ status: 'off', error: /cancel/i.test(message) ? undefined : message });
    }
  }

  /** Reconnect to a strap this origin already knows, without the picker (no user gesture needed). */
  async autoConnect(knownName?: string): Promise<boolean> {
    if (!isBluetoothSupported() || this.state.status === 'on' || this.state.status === 'connecting') return this.state.status === 'on';
    this.set({ status: 'connecting', error: undefined });
    try {
      const device = await this.knownDevice(knownName);
      if (!device) {
        this.set({ status: 'off' });
        return false;
      }
      this.wantConnected = true;
      await this.attach(device);
      return true;
    } catch {
      this.set({ status: 'off' });
      return false;
    }
  }

  private async knownDevice(name?: string): Promise<BluetoothDevice | undefined> {
    const nav = navigator.bluetooth as Bluetooth & { getDevices?: () => Promise<BluetoothDevice[]> };
    if (!nav.getDevices) return undefined;
    try {
      const devices = await nav.getDevices();
      const candidates = name ? devices.filter((d) => d.name === name) : devices;
      for (const d of candidates) {
        try {
          await d.gatt?.connect();
          return d;
        } catch {
          /* out of range or asleep — try the next one / the picker */
        }
      }
    } catch {
      /* getDevices refused */
    }
    return undefined;
  }

  private async attach(device: BluetoothDevice) {
    this.device = device;
    device.addEventListener('gattserverdisconnected', this.onDisconnected);
    const server = device.gatt!.connected ? device.gatt! : await device.gatt!.connect();
    const hr = await server.getPrimaryService('heart_rate');
    const ch = await hr.getCharacteristic('heart_rate_measurement');
    ch.addEventListener('characteristicvaluechanged', this.onValue);
    await ch.startNotifications();
    this.retries = 0;
    this.set({ status: 'on', deviceName: device.name, error: undefined });
    this.readBattery(server).catch(() => undefined);
  }

  private async readBattery(server: BluetoothRemoteGATTServer) {
    const svc = await server.getPrimaryService('battery_service');
    const ch = await svc.getCharacteristic('battery_level');
    const v = await ch.readValue();
    this.set({ battery: v.getUint8(0) });
  }

  private onValue = (ev: Event) => {
    const ch = ev.target as BluetoothRemoteGATTCharacteristic;
    if (!ch.value) return;
    const s = parseHeartRate(ch.value);
    this.set({ bpm: s.bpm, contact: s.contact, lastAt: s.at });
    for (const fn of this.sampleListeners) fn(s);
  };

  private onDisconnected = () => {
    if (!this.wantConnected) {
      this.set({ status: 'off', bpm: undefined });
      return;
    }
    this.set({ status: 'lost', bpm: undefined });
    const delay = Math.min(16_000, 1000 * 2 ** this.retries++);
    this.retryTimer = setTimeout(() => this.reconnect(), delay);
  };

  private async reconnect() {
    if (!this.wantConnected || !this.device) return;
    try {
      await this.attach(this.device);
    } catch {
      if (this.retries < 8) this.onDisconnected();
      else this.set({ status: 'lost', error: 'Strap not found — tap to reconnect.' });
    }
  }

  async disconnect() {
    this.wantConnected = false;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    const d = this.device;
    this.device = undefined;
    if (d) {
      d.removeEventListener('gattserverdisconnected', this.onDisconnected);
      try {
        d.gatt?.disconnect();
      } catch {
        /* already gone */
      }
    }
    this.set({ status: isBluetoothSupported() ? 'off' : 'unsupported', bpm: undefined, battery: undefined });
  }

  /** Reset for tests. */
  _reset() {
    this.sampleListeners.clear();
    this.stateListeners.clear();
    this.device = undefined;
    this.wantConnected = false;
    this.state = { status: isBluetoothSupported() ? 'off' : 'unsupported' };
  }
}

export const strap = new Strap();
