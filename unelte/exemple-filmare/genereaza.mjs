#!/usr/bin/env node
// Clipurile sintetice ale lui overlay-filmare (planul H, H04; spec 7.4, „Testul de acceptare”).
// Rulează doar pe Mac: vocea macOS „Ioana” peste un fundal în mișcare, fără fețe; transcrierea e Parakeet, făcută pe
// copia normalizată, exact ca la mg nou. Se rulează o dată; fișierele generate se comit.
//   node unelte/exemple-filmare/genereaza.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { rezolvaFfmpeg, ruleazaFfmpeg, probeazaAudio } from '../../nucleu/lib/ffmpeg.mjs';
import { probeazaSursa } from '../../nucleu/lib/filmare/sonda.mjs';
import { normalizeaza } from '../../nucleu/lib/filmare/normalizeaza.mjs';
import { transcrie, normalizeazaTranscriere } from '../../nucleu/lib/filmare/transcriere.mjs';
import { rotunjeste } from '../../nucleu/lib/cronologie.mjs';

const RADACINA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const EX = path.join(RADACINA, 'motoare', 'hyperframes', 'sabloane', 'overlay-filmare', 'exemple');
const FIX = path.join(RADACINA, 'teste', 'fixtures', 'filmare');

const VERTICAL = 'Bună, sunt Andreea Popescu, consultant de marketing. Anul trecut lucram până seara târziu. '
  + 'Acum câștig șase ore în fiecare săptămână, pentru că agentul meu face trei lucruri. '
  + 'Răspunde la e-mailuri, programează postările și pregătește ofertele. '
  + 'Nu mai lucrez mai mult. Lucrez pe ce contează. Scrie agent și îți trimit ghidul.';
// Textele au cel puțin 18% cuvinte uzuale românești (și, că, de, la, în, pe, nu, cu, să, mai): validarea din overlay-filmare
// refuză transcrierile sub 15% ca fiind în altă limbă (raport.procent_functionale).
// În orizontal, cei trei pași sunt rostiți compact (lista din H13 ține cel mult 8 s, de la ancoră la ultimul punct + 1,5 s).
const ORIZONTAL = 'Vrei să începi cu un agent? Ai nevoie de trei lucruri. O singură sarcină, pașii scriși și o săptămână de probă. '
  + 'Alege sarcina care te obosește în fiecare zi, scrie pașii exact cum îi faci tu și lasă agentul să lucreze.';
const SCURT = 'Bună, sunt Andreea. Lucrez pe ce contează.';

const EXEMPLE = [
  { dir: path.join(EX, 'vertical'), nume: 'filmare', latime: 1080, inaltime: 1920, text: VERTICAL, srt: false, durata: [20, 25], culori: '0x1d2b53:0x7e2553:0x008751' },
  { dir: path.join(EX, 'orizontal'), nume: 'filmare', latime: 1920, inaltime: 1080, text: ORIZONTAL, srt: true, durata: [10, 20], culori: '0x22333b:0x5e6472:0xaed9e0' },
  { dir: FIX, nume: 'scurt', latime: 360, inaltime: 640, text: SCURT, srt: true, durata: [6, 8], culori: '0x2b2d42:0x8d99ae:0xef233c', minim: 6.5, faraAudio: true },
];

const timpSrt = (t) => {
  const ms = Math.round(t * 1000);
  const p = (n, l = 2) => String(n).padStart(l, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};

/** Replici SRT din cuvinte: se rupe după un cuvânt terminat în . ? ! sau la 7 cuvinte. */
export function cuvinteSrt(cuvinte) {
  const replici = [];
  let curenta = [];
  for (const c of cuvinte) {
    curenta.push(c);
    if (/[.?!]$/.test(c.text) || curenta.length === 7) { replici.push(curenta); curenta = []; }
  }
  if (curenta.length) replici.push(curenta);
  return replici.map((r, i) => `${i + 1}\n${timpSrt(r[0].start)} --> ${timpSrt(r.at(-1).end)}\n${r.map((c) => c.text).join(' ')}\n`).join('\n');
}

async function unClip(ex, ff) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-exemple-'));
  try {
    const voce = path.join(tmp, 'voce.aiff');
    execFileSync('say', ['-v', 'Ioana', '-o', voce, ex.text]);
    const vorbit = (await probeazaAudio(voce, { ffprobe: ff.ffprobe })).durata;
    const durata = rotunjeste(Math.max(ex.minim ?? 0, (vorbit ?? 0) + 1.4), 1);
    fs.mkdirSync(ex.dir, { recursive: true });
    const clip = path.join(ex.dir, `${ex.nume}.mp4`);
    const [c0, c1, c2] = ex.culori.split(':');
    const video = `gradients=s=${ex.latime}x${ex.inaltime}:r=30:c0=${c0}:c1=${c1}:c2=${c2}:nb_colors=3:speed=0.015:seed=7:duration=${durata}`;
    let r = await ruleazaFfmpeg(['-hide_banner', '-y', '-f', 'lavfi', '-i', video, '-i', voce,
      '-filter_complex', `[1:a]adelay=600:all=1,apad[a]`, '-map', '0:v', '-map', '[a]', '-t', String(durata),
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-g', '60', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-ar', '48000',
      '-movflags', '+faststart', clip], { ffmpeg: ff.ffmpeg });
    if (r.cod !== 0) throw new Error(`ffmpeg: ${r.stderr}`);
    if (ex.faraAudio) {
      r = await ruleazaFfmpeg(['-hide_banner', '-y', '-i', clip, '-an', '-c:v', 'copy', path.join(ex.dir, 'fara-audio.mp4')], { ffmpeg: ff.ffmpeg });
      if (r.cod !== 0) throw new Error(`ffmpeg: ${r.stderr}`);
    }
    const info = await probeazaSursa(clip, { ffprobe: ff.ffprobe });
    if (info.durata < ex.durata[0] || info.durata > ex.durata[1]) {
      throw new Error(`${clip}: ${info.durata} s, în afara intervalului ${ex.durata.join('-')} s; schimbă textul sau viteza vocii (say -r).`);
    }
    const lucru = path.join(tmp, 'filmare-lucru.mp4');
    await normalizeaza(clip, lucru, info, ff);
    const lucruInfo = await probeazaSursa(lucru, { ffprobe: ff.ffprobe });
    const { brut } = await transcrie(RADACINA, lucru, 'ro', { ff });
    const t = normalizeazaTranscriere(brut, { sursa: 'parakeet', limba: 'ro', durata: lucruInfo.durata });
    const prefix = ex.nume === 'filmare' ? '' : `${ex.nume}.`;
    fs.writeFileSync(path.join(ex.dir, `${prefix}transcriere.json`), `${JSON.stringify(t, null, 2)}\n`);
    if (ex.srt) fs.writeFileSync(path.join(ex.dir, ex.nume === 'filmare' ? 'transcriere.srt' : `${ex.nume}.srt`), cuvinteSrt(t.cuvinte));
    console.log(`${path.relative(RADACINA, clip)}: ${info.durata} s, ${t.cuvinte.length} cuvinte: ${t.cuvinte.map((c) => `${c.id}=${c.text}`).join(' ')}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  if (process.platform !== 'darwin') {
    console.error('Clipurile se generează doar pe Mac (vocea „Ioana” a macOS). Pe celelalte sisteme se folosesc fișierele comise.');
    process.exit(2);
  }
  const ff = await rezolvaFfmpeg(RADACINA);
  for (const ex of EXEMPLE) await unClip(ex, ff);
}
