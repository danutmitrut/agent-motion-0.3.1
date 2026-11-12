// Ajutoarele testelor overlay-filmare: proiectul fals cu filmare (motor.lock, transcrierea, raportul), fără ffmpeg.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { raportTranscriere } from '../../../../../nucleu/lib/filmare/transcriere.mjs';
import { legaFisier } from '../../../../../nucleu/lib/sdk.mjs';
import { incarcaSablon } from '../../../../../nucleu/lib/sabloane.mjs';
import { rezolvaStil } from '../../../../../nucleu/lib/teme.mjs';

export const REPO = fileURLToPath(new URL('../../../../../', import.meta.url));
export const IMPLICITE = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../implicite.json', import.meta.url)), 'utf8'));
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');

/** Cuvintele dintr-un text, câte unul la `pas` secunde, fiecare de `lung` secunde, de la `de_la`. */
export function cuvinteDin(text, { de_la = 0.5, pas = 0.35, lung = 0.28 } = {}) {
  return text.split(/\s+/).map((t, i) => ({ id: `w${i}`, text: t, start: Math.round((de_la + i * pas) * 1000) / 1000, end: Math.round((de_la + i * pas + lung) * 1000) / 1000 }));
}

export function proiectFals({ cuvinte, durata = 20, fps = 30, latime = 1080, inaltime = 1920, raport = null, original = 'original', lucru = 'lucru', sursa = 'parakeet', limba = 'ro' }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg overlay Ăîș '));
  fs.mkdirSync(path.join(dir, 'resurse'));
  fs.mkdirSync(path.join(dir, 'active'));
  fs.writeFileSync(path.join(dir, 'resurse', 'filmare-original.mp4'), original);
  fs.writeFileSync(path.join(dir, 'active', 'filmare-lucru.mp4'), lucru);
  const transcriere = { versiune: 1, sursa, limba, durata, cuvinte };
  fs.writeFileSync(path.join(dir, 'active', 'transcriere.json'), `${JSON.stringify(transcriere, null, 2)}\n`);
  fs.writeFileSync(path.join(dir, 'active', 'raport.json'), `${JSON.stringify(raport ?? raportTranscriere(transcriere), null, 2)}\n`);
  const filmare = {
    original: { cale: 'resurse/filmare-original.mp4', sha256: sha(original) },
    lucru: { cale: 'active/filmare-lucru.mp4', sha256: sha(lucru) },
    transcriere: { cale: 'active/transcriere.json', sha256: sha(fs.readFileSync(path.join(dir, 'active', 'transcriere.json'))), sursa, limba },
    fps, latime, inaltime, durata,
    sursa_info: { latime, inaltime, rotatie: 0, fps, vfr: false, codec: 'h264' },
    motor_transcriere: null,
  };
  fs.writeFileSync(path.join(dir, 'motor.lock'), `${JSON.stringify({ filmare }, null, 2)}\n`);
  const ctx = { radacina: REPO, proiect: 'proba', dirProiect: dir, sablon: { nume: 'overlay-filmare', implicite: IMPLICITE, meta: { durata: { min: 5, max: 90 } } }, brand: null, mod: 'doar-verificare', intern: null, stil: null, ff: null };
  return { dir, ctx, curata: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

/** date.json minim pentru proiectul fals, cu câmpurile date peste. */
export const dateMinime = (extra = {}) => ({ sablon: 'overlay-filmare', versiune_schema: 1, format: 'vertical', filmare: { fisier: 'active/filmare-lucru.mp4' }, ...extra });

/** StilRezolvat dintr-o temă a catalogului, ca după rezolvaStil (fiecare câmp { valoare, sursa }), cu câmpurile date peste. */
export function stilTest(tema = 'noapte', extra = {}) {
  const T = JSON.parse(fs.readFileSync(path.join(REPO, 'motoare', 'comun', 'teme', `${tema}.json`), 'utf8'));
  const v = (valoare, sursa = 'tema') => ({ valoare, sursa });
  const stil = {
    tema: v(tema, 'date'),
    culori: Object.fromEntries(Object.entries(T.culori).map(([k, c]) => [k, v(c)])),
    font_titlu: v(T.font_titlu), font_text: v(T.font_text), ritm: v('normal', 'implicit'),
    atmosfera: v(T.atmosfera), granulatie: v(T.granulatie), eticheta: v(T.eticheta),
  };
  for (const [k, val] of Object.entries(extra)) stil[k] = v(val, 'date');
  return stil;
}

export const DIR_EXEMPLE = fileURLToPath(new URL('../exemple/', import.meta.url));
export const EXEMPLE = Object.freeze(['vertical', 'orizontal']);
const DIMENSIUNI = Object.freeze({ vertical: [1080, 1920], orizontal: [1920, 1080] });

/**
 * Proiectul unui exemplu, ca după mg nou: filmare.mp4 legat ca original și copie de lucru (clipurile sintetice sunt deja
 * la formatul lor), transcrierea din exemple/<nume>/transcriere.json, raportul și motor.lock (30 fps, durata transcrierii).
 */
export function proiectExemplu(nume) {
  const sursa = path.join(DIR_EXEMPLE, nume);
  const date = JSON.parse(fs.readFileSync(path.join(sursa, 'date.json'), 'utf8'));
  const transcriere = JSON.parse(fs.readFileSync(path.join(sursa, 'transcriere.json'), 'utf8'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `mg-overlay-${nume}-`));
  fs.mkdirSync(path.join(dir, 'resurse'));
  fs.mkdirSync(path.join(dir, 'active'));
  legaFisier(path.join(sursa, 'filmare.mp4'), path.join(dir, 'resurse', 'filmare-original.mp4'));
  legaFisier(path.join(sursa, 'filmare.mp4'), path.join(dir, 'active', 'filmare-lucru.mp4'));
  fs.copyFileSync(path.join(sursa, 'transcriere.json'), path.join(dir, 'active', 'transcriere.json'));
  fs.writeFileSync(path.join(dir, 'active', 'raport.json'), `${JSON.stringify(raportTranscriere(transcriere), null, 2)}\n`);
  const [latime, inaltime] = DIMENSIUNI[date.format];
  const shaMp4 = sha(fs.readFileSync(path.join(sursa, 'filmare.mp4')));
  const filmare = {
    original: { cale: 'resurse/filmare-original.mp4', sha256: shaMp4 },
    lucru: { cale: 'active/filmare-lucru.mp4', sha256: shaMp4 },
    transcriere: { cale: 'active/transcriere.json', sha256: sha(fs.readFileSync(path.join(dir, 'active', 'transcriere.json'))), sursa: transcriere.sursa, limba: transcriere.limba },
    fps: 30, latime, inaltime, durata: transcriere.durata,
    sursa_info: { latime, inaltime, rotatie: 0, fps: 30, vfr: false, codec: 'h264' },
    motor_transcriere: null,
  };
  fs.writeFileSync(path.join(dir, 'motor.lock'), `${JSON.stringify({ filmare }, null, 2)}\n`);
  return { dir, date, curata: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

let sablon = null;

/** Build-ul unui exemplu prin interfața șablonului (stilul prin rezolvaStil, ca la mg randeaza); întoarce și planul și proiectul. */
export async function buildExemplu(nume, dirBuild) {
  sablon ??= await incarcaSablon(REPO, 'overlay-filmare');
  const p = proiectExemplu(nume);
  const ctx = { radacina: REPO, proiect: nume, dirProiect: p.dir, sablon, brand: null, mod: 'doar-verificare', intern: null, stil: null, ff: null };
  const s = rezolvaStil({ radacina: REPO, sablon, date: p.date, brand: null });
  assert.deepEqual(s.erori, []);
  const c = sablon.modul.cronologie(p.date, s.stil, ctx);
  assert.deepEqual(c.erori, [], JSON.stringify(c.erori, null, 2));
  await sablon.modul.construieste(p.date, s.stil, c.cronologie, dirBuild, { ...ctx, intern: c.intern, stil: s.stil });
  return { cronologie: c.cronologie, plan: c.intern, avertismente: c.avertismente, proiect: p };
}
