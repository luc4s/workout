/**
 * Remember every device that connects, wherever it was paired (Settings, the setup screen, the
 * runner badge), so the next launch can reconnect to it without a tap.
 */
import { getSettings, saveSettings } from '../db/db';
import { rower } from '../rower/ble';
import { strap } from './ble';

let started = false;

export function rememberDevices(): void {
  if (started) return;
  started = true;
  strap.onState((s) => {
    if (s.status === 'on' && s.deviceName) void remember('strapName', s.deviceName);
  });
  rower.onState((s) => {
    if (s.status === 'on' && s.deviceName) void remember('rowerName', s.deviceName);
  });
}

async function remember(key: 'strapName' | 'rowerName', name: string) {
  const settings = await getSettings();
  if (settings[key] !== name) await saveSettings({ [key]: name });
}
