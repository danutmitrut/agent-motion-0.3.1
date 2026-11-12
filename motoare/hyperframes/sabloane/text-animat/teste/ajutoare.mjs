// Ajutoarele comune ale testelor din G09: proiectul pe drumul lui mg randeaza și build-ul unui exemplu prin interfață.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { incarcaSablon } from '../../../../../nucleu/lib/sabloane.mjs';
import { rezolvaStil } from '../../../../../nucleu/lib/teme.mjs';
import { lockNou, scrieLock } from '../../../../../nucleu/lib/lock.mjs';
import { citesteVersiuni } from '../../../../../nucleu/lib/versiuni.mjs';
import { pregatesteBuild } from '../../../../../nucleu/lib/randeaza/pregatire.mjs';

const REPO = fileURLToPath(new URL('../../../../../', import.meta.url));
export const DIR_EXEMPLE = fileURLToPath(new URL('../exemple/', import.meta.url));
export const EXEMPLE = Object.freeze(['minim', 'complet', 'patrat']);

/** Proiectul `nume` în rădăcina dată, cu motor.lock și date.json, apoi pregătirea lui mg randeaza --doar-verificare. */
export async function pregateste(radacina, sab, nume, date) {
  const dir = path.join(radacina, 'video', nume);
  fs.mkdirSync(dir, { recursive: true });
  scrieLock(path.join(dir, 'motor.lock'), lockNou({ proiect: nume, sablon: sab, versiuni: citesteVersiuni(radacina), acum: new Date('2026-10-16T00:00:00.000Z') }));
  fs.writeFileSync(path.join(dir, 'date.json'), typeof date === 'string' ? date : `${JSON.stringify(date, null, 2)}\n`);
  return pregatesteBuild({ radacina, proiect: nume, mod: 'doar-verificare' });
}

let sablon = null;

/** Build-ul unui exemplu prin interfața șablonului, cu proiectul în exemple/ (acolo stau resurse/ și sigla). */
export async function buildExemplu(nume, dirBuild) {
  sablon ??= await incarcaSablon(REPO, 'text-animat');
  const date = JSON.parse(fs.readFileSync(path.join(DIR_EXEMPLE, `${nume}.json`), 'utf8'));
  const ctx = { radacina: REPO, proiect: nume, dirProiect: DIR_EXEMPLE, sablon, mod: 'doar-verificare', catalog: null, brand: null, intern: null, stil: null, ff: null,
    ingheataActiv: () => { throw new Error('text-animat nu îngheață active'); } };
  const s = rezolvaStil({ radacina: REPO, sablon, date, brand: null });
  assert.deepEqual(s.erori, []);
  const c = sablon.modul.cronologie(date, s.stil, ctx);
  assert.deepEqual(c.erori, [], JSON.stringify(c.erori, null, 2));
  await sablon.modul.construieste(date, s.stil, c.cronologie, dirBuild, { ...ctx, intern: c.intern, stil: s.stil });
  return c.cronologie;
}
