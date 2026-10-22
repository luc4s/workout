/**
 * Web Bluetooth client for a rowing machine that speaks the standard Fitness Machine Service
 * (FTMS, 0x1826: Concept2 PM5, most app-enabled rowers). One connection for the whole app; views
 * subscribe to samples and status, like the heart-rate strap in `src/hr/ble.ts`.
 * `scanConsole()` is the diagnostic for consoles that may not be FTMS: it lists what the console
 * exposes among a candidate list of services, so a vendor protocol can be worked out from it.
 */

export const FTMS_SERVICE = 0x1826;
export const ROWER_DATA = 0x2ad1;
export const FITNESS_MACHINE_FEATURE = 0x2acc;

export interface RowerSample {
  /** Stroke rate, strokes per minute. */
  spm?: number;
  /** Stroke count since the console was reset. */
  strokes?: number;
  /** Total distance, metres. */
  distanceM?: number;
  /** Instantaneous pace, seconds per 500 m. */
  paceSec?: number;
  avgPaceSec?: number;
  /** Instantaneous power, watts. */
  watts?: number;
  avgWatts?: number;
  resistance?: number;
  /** Total energy, kcal. */
  kcal?: number;
  hr?: number;
  elapsedSec?: number;
  at: number;
}

/** Parse an FTMS Rower Data (0x2AD1) value: 16-bit flags, then the fields whose bit is set, in spec order. */
export function parseRowerData(data: DataView, at = Date.now()): RowerSample {
  const flags = data.getUint16(0, true);
  const out: RowerSample = { at };
  let i = 2;
  // A frame cut short stops the walk: later fields would be read from the wrong offset.
  let cut = false;
  const take = (bit: number, n: number): number | undefined => {
    if (cut || !(flags & bit)) return undefined;
    if (i + n > data.byteLength) {
      cut = true;
      return undefined;
    }
    const at = i;
    i += n;
    return at;
  };
  // Bit 0 "More Data" = 0 means the stroke rate and count are present.
  if ((flags & 0x0001) === 0 && i + 3 <= data.byteLength) {
    out.spm = data.getUint8(i) / 2;
    out.strokes = data.getUint16(i + 1, true);
    i += 3;
  }
  take(0x0002, 1); // average stroke rate (½ spm): not kept
  let p: number | undefined;
  if ((p = take(0x0004, 3)) !== undefined) out.distanceM = data.getUint8(p) | (data.getUint8(p + 1) << 8) | (data.getUint8(p + 2) << 16);
  if ((p = take(0x0008, 2)) !== undefined) {
    const v = data.getUint16(p, true);
    if (v !== 0xffff && v > 0) out.paceSec = v;
  }
  if ((p = take(0x0010, 2)) !== undefined) {
    const v = data.getUint16(p, true);
    if (v !== 0xffff && v > 0) out.avgPaceSec = v;
  }
  if ((p = take(0x0020, 2)) !== undefined) out.watts = data.getInt16(p, true);
  if ((p = take(0x0040, 2)) !== undefined) out.avgWatts = data.getInt16(p, true);
  if ((p = take(0x0080, 2)) !== undefined) out.resistance = data.getInt16(p, true);
  if ((p = take(0x0100, 5)) !== undefined) {
    const total = data.getUint16(p, true); // then per hour (2) and per minute (1)
    if (total !== 0xffff) out.kcal = total;
  }
  if ((p = take(0x0200, 1)) !== undefined) out.hr = data.getUint8(p);
  take(0x0400, 1); // metabolic equivalent
  if ((p = take(0x0800, 2)) !== undefined) out.elapsedSec = data.getUint16(p, true);
  // bit 12: remaining time — not kept
  return out;
}

/** Fitness Machine Feature (0x2ACC): which fields the console claims to support (first 32 bits). */
export function parseFeatures(data: DataView): string[] {
  const f = data.getUint32(0, true);
  const names = ['average speed', 'cadence', 'total distance', 'inclination', 'elevation gain', 'pace', 'step count', 'resistance level', 'stride count', 'expended energy', 'heart rate', 'metabolic equivalent', 'elapsed time', 'remaining time', 'power', 'force on belt / power output', 'user data retention'];
  return names.filter((_, i) => f & (1 << i));
}

export type RowerStatus = 'unsupported' | 'off' | 'connecting' | 'on' | 'lost';

export interface RowerState {
  status: RowerStatus;
  deviceName?: string;
  last?: RowerSample;
  features?: string[];
  error?: string;
}

type SampleListener = (s: RowerSample) => void;
type StateListener = (s: RowerState) => void;

export function isBluetoothSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.bluetooth;
}

class Rower {
  state: RowerState = { status: isBluetoothSupported() ? 'off' : 'unsupported' };
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

  private set(patch: Partial<RowerState>) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.stateListeners) fn(this.state);
  }

  /** Connect: a console this origin already knows (no picker), else the system picker (needs a tap). */
  async connect(knownName?: string): Promise<void> {
    if (!isBluetoothSupported()) {
      this.set({ status: 'unsupported' });
      return;
    }
    this.wantConnected = true;
    this.set({ status: 'connecting', error: undefined });
    try {
      let device = await this.knownDevice(knownName);
      if (!device) device = await navigator.bluetooth.requestDevice({ filters: [{ services: [FTMS_SERVICE] }], optionalServices: ['device_information'] });
      await this.attach(device);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.wantConnected = false;
      this.set({ status: 'off', error: /cancel/i.test(message) ? undefined : message });
    }
  }

  /** Reconnect to a known console without the picker (no user gesture needed). */
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
      const candidates = name ? devices.filter((d) => d.name === name) : [];
      for (const d of candidates) {
        try {
          const server = await d.gatt?.connect();
          // Only a device that actually has the fitness-machine service (the strap is also "known").
          await server?.getPrimaryService(FTMS_SERVICE);
          return d;
        } catch {
          /* out of range, asleep or not a rower — try the next one / the picker */
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
    const svc = await server.getPrimaryService(FTMS_SERVICE);
    const ch = await svc.getCharacteristic(ROWER_DATA);
    ch.addEventListener('characteristicvaluechanged', this.onValue);
    await ch.startNotifications();
    this.retries = 0;
    this.set({ status: 'on', deviceName: device.name, error: undefined });
    svc
      .getCharacteristic(FITNESS_MACHINE_FEATURE)
      .then((f) => f.readValue())
      .then((v) => this.set({ features: parseFeatures(v) }))
      .catch(() => undefined);
  }

  private onValue = (ev: Event) => {
    const ch = ev.target as BluetoothRemoteGATTCharacteristic;
    if (!ch.value) return;
    const s = parseRowerData(ch.value);
    this.set({ last: s });
    for (const fn of this.sampleListeners) fn(s);
  };

  private onDisconnected = () => {
    if (!this.wantConnected) {
      this.set({ status: 'off', last: undefined });
      return;
    }
    this.set({ status: 'lost', last: undefined });
    const delay = Math.min(16_000, 1000 * 2 ** this.retries++);
    this.retryTimer = setTimeout(() => this.reconnect(), delay);
  };

  private async reconnect() {
    if (!this.wantConnected || !this.device) return;
    try {
      await this.attach(this.device);
    } catch {
      if (this.retries < 8) this.onDisconnected();
      else this.set({ status: 'lost', error: 'Rower not found — tap to reconnect.' });
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
    this.set({ status: isBluetoothSupported() ? 'off' : 'unsupported', last: undefined, features: undefined });
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

export const rower = new Rower();

/* ---------- scan: what does this console expose? ---------- */

/** Services the scan asks for. Web Bluetooth only reveals services named here, so the list is wide. */
export const SCAN_CANDIDATES: { uuid: string | number; label: string }[] = [
  { uuid: 0x1826, label: 'Fitness Machine (FTMS) — the standard rower protocol' },
  { uuid: 0x1818, label: 'Cycling Power' },
  { uuid: 0x1816, label: 'Cycling Speed and Cadence' },
  { uuid: 0x1814, label: 'Running Speed and Cadence' },
  { uuid: 0x180d, label: 'Heart Rate' },
  { uuid: 0x180a, label: 'Device Information' },
  { uuid: 0x180f, label: 'Battery' },
  { uuid: 0x1800, label: 'Generic Access' },
  { uuid: 0x1801, label: 'Generic Attribute' },
  { uuid: 0x180f, label: 'Battery' },
  { uuid: 0xfff0, label: 'Vendor FFF0 (common on fitness consoles)' },
  { uuid: 0xffe0, label: 'Vendor FFE0 (HM-10 style serial)' },
  { uuid: 0xffe5, label: 'Vendor FFE5' },
  { uuid: 0xfee7, label: 'Vendor FEE7' },
  { uuid: 0xfff1, label: 'Vendor FFF1' },
  { uuid: 0xffb0, label: 'Vendor FFB0' },
  { uuid: 0xffa0, label: 'Vendor FFA0' },
  { uuid: '6e400001-b5a3-f393-e0a9-e50e24dcca9e', label: 'Nordic UART' },
  { uuid: '0000fff0-0000-1000-8000-00805f9b34fb', label: 'Vendor FFF0 (full UUID)' },
  { uuid: '49535343-fe7d-4ae5-8fa9-9fafd205e455', label: 'Microchip transparent UART' },
  { uuid: 'ce060000-43e5-11e4-916c-0800200c9a66', label: 'Concept2 PM5 rowing' },
];

export interface ScanReport {
  name?: string;
  id?: string;
  services: { uuid: string; label?: string; characteristics: { uuid: string; properties: string[]; value?: string }[] }[];
  /** Candidate services that were not found on this device. */
  missing: string[];
  error?: string;
  at: number;
}

const PROPS = ['read', 'write', 'writeWithoutResponse', 'notify', 'indicate', 'broadcast', 'authenticatedSignedWrites'] as const;

/** Pick any device (needs a tap) and list its services and characteristics among the candidates. */
export async function scanConsole(): Promise<ScanReport> {
  const report: ScanReport = { services: [], missing: [], at: Date.now() };
  if (!isBluetoothSupported()) return { ...report, error: 'No Web Bluetooth in this browser.' };
  const seen = new Set<string | number>();
  const candidates = SCAN_CANDIDATES.filter((c) => !seen.has(c.uuid) && seen.add(c.uuid));
  let device: BluetoothDevice;
  try {
    device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: candidates.map((c) => c.uuid) });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ...report, error: /cancel/i.test(message) ? 'Cancelled.' : message };
  }
  report.name = device.name;
  report.id = device.id;
  try {
    const server = await device.gatt!.connect();
    let services: BluetoothRemoteGATTService[] = [];
    try {
      services = await server.getPrimaryServices();
    } catch {
      /* some stacks refuse the list: fall back to probing each candidate */
      for (const c of candidates) {
        try {
          services.push(await server.getPrimaryService(c.uuid));
        } catch {
          /* not there */
        }
      }
    }
    const found = new Set<string>();
    for (const s of services) {
      found.add(s.uuid);
      const label = candidates.find((c) => uuidOf(c.uuid) === s.uuid)?.label;
      const entry: ScanReport['services'][number] = { uuid: s.uuid, label, characteristics: [] };
      try {
        for (const ch of await s.getCharacteristics()) {
          const properties = PROPS.filter((p) => (ch.properties as unknown as Record<string, boolean>)[p]);
          const c: (typeof entry.characteristics)[number] = { uuid: ch.uuid, properties };
          if (ch.properties.read && (s.uuid === uuidOf(0x180a) || s.uuid === uuidOf(0x1800))) {
            try {
              const v = await ch.readValue();
              c.value = new TextDecoder().decode(v).replace(/\0+$/, '');
            } catch {
              /* unreadable */
            }
          }
          entry.characteristics.push(c);
        }
      } catch {
        /* no characteristic listing */
      }
      report.services.push(entry);
    }
    report.missing = candidates.filter((c) => !found.has(uuidOf(c.uuid))).map((c) => c.label);
    try {
      device.gatt?.disconnect();
    } catch {
      /* ignore */
    }
  } catch (e) {
    report.error = e instanceof Error ? e.message : String(e);
  }
  return report;
}

/** Canonical 128-bit UUID string for a 16-bit or string UUID. */
export function uuidOf(u: string | number): string {
  return typeof u === 'number' ? `0000${u.toString(16).padStart(4, '0')}-0000-1000-8000-00805f9b34fb` : u.toLowerCase();
}

/** The scan report as text (for copying into a message). */
export function formatScan(r: ScanReport): string {
  const lines = [`Rower scan ${new Date(r.at).toISOString()}`, `Device: ${r.name ?? '(no name)'}${r.id ? ` id ${r.id}` : ''}`];
  if (r.error) lines.push(`Error: ${r.error}`);
  for (const s of r.services) {
    lines.push(`Service ${s.uuid}${s.label ? ` — ${s.label}` : ''}`);
    for (const c of s.characteristics) lines.push(`  ${c.uuid} [${c.properties.join(', ')}]${c.value ? ` = "${c.value}"` : ''}`);
  }
  if (!r.services.length && !r.error) lines.push('No service from the candidate list was found.');
  lines.push(`Not found: ${r.missing.join('; ')}`);
  return lines.join('\n');
}
