import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rezolvaFfmpeg, ruleazaFfmpeg, masoaraSsim, probeazaMp4 } from '../../nucleu/lib/ffmpeg.mjs';
import { esteCadruUniform, verificaGoluriSursa } from '../../nucleu/lib/verificari/pixeli.mjs';
import { verificariMp4 } from '../../nucleu/lib/verificari/mp4.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCURT = path.join(REPO, 'teste', 'fixtures', 'filmare', 'scurt.mp4');

test('esteCadruUniform: negru da, un cadru cu imagine nu', () => {
  const negru = new Uint8Array(10 * 10 * 3);
  const cuPata = negru.slice();
  for (let i = 0; i < 30 * 3; i++) cuPata[i] = 200;
  assert.equal(esteCadruUniform(negru, 10, 10), true);
  assert.equal(esteCadruUniform(cuPata, 10, 10), false);
});

test('verificaGoluriSursa: doar intervalele uniforme în MP4 și cu imagine în sursă, peste 0,1 s', () => {
  const serie = Array.from({ length: 20 }, (_, i) => ({ t: i / 10, uniform: i >= 5 && i < 9, uniformSursa: i >= 7 }));
  const r = verificaGoluriSursa(serie);
  assert.equal(r.ok, false);
  assert.deepEqual(r.valoare.goluri, [{ start: 0.5, sfarsit: 0.7, durata: 0.2 }]);
  assert.equal(verificaGoluriSursa(serie.map((c) => ({ ...c, uniform: c.uniformSursa }))).ok, true);
});

async function compozitie(dir, ff, { negru = 0 } = {}) {
  // „randarea” falsă: copia de lucru 360x640 mărită la 1080x1920, cu primele `negru` secunde înnegrite și un card alb în banda de jos
  const mp4 = path.join(dir, 'clip.mp4');
  const vf = `scale=1080:1920:flags=bicubic,drawbox=x=72:y=1240:w=858:h=200:color=white@1:t=fill${negru ? `,drawbox=x=0:y=0:w=1080:h=1920:color=black@1:t=fill:enable='lt(t,${negru})'` : ''}`;
  const r = await ruleazaFfmpeg(['-hide_banner', '-y', '-i', SCURT, '-vf', vf, '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'copy', mp4], { ffmpeg: ff.ffmpeg });
  assert.equal(r.cod, 0, r.stderr);
  fs.mkdirSync(path.join(dir, 'build'), { recursive: true });
  fs.copyFileSync(SCURT, path.join(dir, 'build', 'filmare.mp4'));
  return mp4;
}

const CRON = (durata) => ({
  versiune: 1, sablon: 'x', format: 'vertical', latime: 1080, inaltime: 1920, fps: 30, durata, fundal: 'filmare',
  segmente: [{ ref: 'Card', camp: 'elemente[0]', tip: 'titlu', start: 0, complet: 0.5, sfarsit: durata, zona_text: [72, 1240, 858, 200], texte: ['x'] }],
  ferestre_statice: [], momente_foaie: [{ t: 1, ref: 'Card', eticheta: 'x' }], audio: null,
  sursa_video: { fisier: 'build/filmare.mp4', start: 0, latime: 360, inaltime: 640, focus_x: 50 },
});

test('modul comparat cu sursa: compoziția fără defecte trece C12, C13, C14; înnegrirea dă C12', async (t) => {
  const ff = await rezolvaFfmpeg(REPO);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg sursa Ăîș '));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // durata cronologiei = a clipului, ca C11 să treacă și verificările pe cadre să ruleze
  const durata = Math.round((await probeazaMp4(SCURT, { ffprobe: ff.ffprobe })).durata * 1000) / 1000;
  const asteptari = { texte: [{ ref: 'Card', camp: 'elemente[0]', text: 'x', t: 2, caseta: [72, 1240, 858, 200] }], momente: [1], audio: { prezent: false, durata: null }, fundal: 'filmare' };
  const bun = await verificariMp4({ mp4: await compozitie(dir, ff), cronologie: CRON(durata), asteptari, stil: null, ff, format: 'vertical' });
  for (const cod of ['C12', 'C13', 'C14']) assert.equal(bun.find((r) => r.cod === cod).ok, true, `${cod}: ${JSON.stringify(bun.find((r) => r.cod === cod).erori)}`);
  const rau = await verificariMp4({ mp4: await compozitie(dir, ff, { negru: 1.5 }), cronologie: CRON(durata), asteptari, stil: null, ff, format: 'vertical' });
  assert.equal(rau.find((r) => r.cod === 'C12').ok, false);
});

test('masoaraSsim: copia identică dă cel puțin 0,99', async () => {
  const ff = await rezolvaFfmpeg(REPO);
  const s = await masoaraSsim(SCURT, SCURT, { ffmpeg: ff.ffmpeg, momente: [1, 3], latime: 360, inaltime: 140, filtruA: 'crop=360:140:0:250', filtruB: 'crop=360:140:0:250' });
  assert.equal(s.length, 2);
  assert.ok(s.every((x) => x >= 0.99), String(s));
});
