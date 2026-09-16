// Dev helper: renders animation frames to SVG files for visual checking.
// Usage: npx vite-node scripts/render-anims.tsx <outDir> [exerciseId...]
import { writeFileSync, mkdirSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { ANIMS } from '../src/anim/clips';
import { durationOf, renderFrame, type Palette } from '../src/anim/Figure';
import type { ExerciseId } from '../src/data/types';

const pal: Palette = { body: '#1d2230', far: '#9aa3b5', prop: '#6b7280', propFill: '#e5e7eb', fault: '#dc2626', band: '#d97706' };
const [out, ...ids] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const list = (ids.length ? ids : Object.keys(ANIMS)) as ExerciseId[];
for (const id of list) {
  const anim = ANIMS[id];
  const variants = [undefined, ...(anim.view === 'side' ? anim.faults.map((f) => f.id) : [])];
  for (const fault of variants) {
    const d = durationOf(id, fault);
    const frames = 6;
    for (let i = 0; i < frames; i++) {
      const t = (d * i) / frames;
      const { svg, label } = renderFrame(id, t, fault, pal);
      let markup = renderToStaticMarkup(svg as any).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="420" style="background:#fff" ');
      markup = markup.replace('</svg>', `<text x="${anim.viewBox[0] + 4}" y="${anim.viewBox[1] + 10}" font-size="8" fill="#000">${id}${fault ? ' [' + fault + ']' : ''} t=${t.toFixed(2)} ${label ?? ''}</text></svg>`);
      writeFileSync(`${out}/${id}${fault ? '__' + fault : ''}_${i}.svg`, markup);
    }
  }
}
