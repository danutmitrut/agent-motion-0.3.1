// Șablonul de probă cu filmare (H05, H06): implementarea minimă a interfeței pentru o compoziție cu fundal „filmare”.
// Doar module native, ca proba: testele îl copiază într-o rădăcină temporară fără node_modules.
import { copyFileSync, linkSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const rotunjeste = (x) => Math.round(x * 1000) / 1000;
const f4 = (x) => Math.round(x * 10000) / 10000;
const FORMATE = { vertical: [1080, 1920], orizontal: [1920, 1080] };
const BANDA = { vertical: [0, 1240, 1080, 300], orizontal: [0, 830, 1920, 142] };
const lock = (ctx) => JSON.parse(readFileSync(join(ctx.dirProiect, 'motor.lock'), 'utf8'));

export function valideaza() {
  return { erori: [], avertismente: [] };
}

export function cronologie(date, stil, ctx) {
  const f = lock(ctx).filmare;
  const [latime, inaltime] = FORMATE[date.format];
  const durata = rotunjeste(f.durata);
  return {
    cronologie: {
      versiune: 1, sablon: 'proba-filmare', format: date.format, latime, inaltime, fps: f.fps, durata, fundal: 'filmare',
      segmente: [{ ref: 'Filmarea', camp: 'filmare', tip: 'filmare', start: 0, complet: 0, sfarsit: durata, zona_text: BANDA[date.format], texte: ['Probă'], banda: 'jos' }],
      ferestre_statice: [],
      momente_foaie: [{ t: 0, ref: 'Filmarea', eticheta: 'început' }, { t: rotunjeste(durata / 2), ref: 'Filmarea', eticheta: 'mijloc' }, { t: rotunjeste(durata - 1 / f.fps), ref: 'Filmarea', eticheta: 'sfârșit' }],
      audio: null,
      sursa_video: { fisier: 'build/filmare.mp4', start: 0, latime: f.latime, inaltime: f.inaltime, focus_x: 50 },
    },
    intern: null, erori: [], avertismente: [],
  };
}

export function asteptari(cron) {
  return { texte: [{ ref: 'Filmarea', camp: 'filmare', text: 'Probă', t: rotunjeste(cron.durata / 2) }], momente: [0], audio: { prezent: false, durata: null }, fundal: 'filmare' };
}

export async function construieste(date, stil, cron, dirBuild, ctx) {
  mkdirSync(dirBuild, { recursive: true });
  const video = join(dirBuild, 'filmare.mp4');
  rmSync(video, { force: true });
  try { linkSync(join(ctx.dirProiect, 'active', 'filmare-lucru.mp4'), video); } catch { copyFileSync(join(ctx.dirProiect, 'active', 'filmare-lucru.mp4'), video); }
  const d = cron.durata;
  writeFileSync(join(dirBuild, 'index.html'), `<!DOCTYPE html><html lang="ro"><head><meta charset="UTF-8"></head><body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${d}" data-width="${cron.latime}" data-height="${cron.inaltime}">
<video id="video" src="filmare.mp4" muted playsinline data-start="0" data-duration="${d}" data-media-start="0" data-track-index="0"></video>
<audio id="voce" src="filmare.mp4" data-start="0" data-duration="${d}" data-media-start="0" data-track-index="1"></audio>
<div id="t1">Probă</div></div></body></html>\n`);
  const [x, y, w, h] = BANDA[date.format];
  return {
    intrare: 'index.html', fisiere: ['filmare.mp4', 'index.html'], active: [],
    motor: {
      // HyperFrames 0.8.96 cere banda în fracțiuni 0-1 din cadru (pixelii dau „Invalid --caption-zone”), iar seek tot în fracțiuni din durată
      check: { argumente: ['--strict', '--caption-zone', `x0=${f4(x / cron.latime)};y0=${f4(y / cron.inaltime)};x1=${f4((x + w) / cron.latime)};y1=${f4((y + h) / cron.inaltime)};severity=error;seek=0.5`] },
      randare: { argumente: ['--no-best-effort', '--frames-cache-dir', join(ctx.dirProiect, '.cache')] },
    },
  };
}
