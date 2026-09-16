// Renders public/icon.svg to PNG icons with headless Chrome.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const svg = readFileSync('public/icon.svg', 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'icons-'));
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  const html = join(dir, `${size}.html`);
  writeFileSync(html, `<html><body style="margin:0;background:#14161a">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  execFileSync(process.env.CHROME ?? 'google-chrome', ['--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', `--screenshot=${resolve('public', name)}`, `--window-size=${size},${size}`, `file://${html}`], { stdio: 'ignore' });
  console.log('wrote', name);
}
