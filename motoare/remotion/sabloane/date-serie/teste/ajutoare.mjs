// Ajutoarele comune ale testelor lui date-serie: șablonul încărcat din repo, stilul rezolvat al unui exemplu și
// ctx-ul cu care nucleul cheamă interfața (docs/interfete/sablon.md).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { incarcaSablon } from '../../../../../nucleu/lib/sabloane.mjs';
import { rezolvaStil, valoriStil } from '../../../../../nucleu/lib/teme.mjs';

export const REPO = fileURLToPath(new URL('../../../../../', import.meta.url));
export const DIR_SABLON = fileURLToPath(new URL('../', import.meta.url));
export const DIR_EXEMPLE = path.join(DIR_SABLON, 'exemple');

/** Datele unui exemplu, citite din nou la fiecare apel (testele le modifică). */
export const exemplu = (nume) => JSON.parse(fs.readFileSync(path.join(DIR_EXEMPLE, `${nume}.json`), 'utf8'));

let sablon = null;
export async function sablonul() {
  sablon ??= await incarcaSablon(REPO, 'date-serie');
  return sablon;
}

/** Stilul rezolvat (cu surse) al datelor, fără brand; tema din argument înlocuiește stil.tema. */
export function stilRezolvat(sab, date, tema = null) {
  const d = tema ? { ...date, stil: { ...date.stil, tema } } : date;
  const s = rezolvaStil({ radacina: REPO, sablon: sab, date: d, brand: null });
  assert.deepEqual(s.erori, []);
  return s.stil;
}

export const stilPlat = (sab, date, tema = null) => valoriStil(stilRezolvat(sab, date, tema));

/** ctx-ul nucleului (creeazaCtx), cu proiectul în exemple/. */
export function ctxTest(sab, extra = {}) {
  return { radacina: REPO, proiect: 'test', dirProiect: DIR_EXEMPLE, sablon: sab, mod: 'doar-verificare', catalog: null, brand: null, intern: null, stil: null, ff: null, ...extra };
}

/**
 * Build-ul unui exemplu prin interfața șablonului (cronologie, apoi construieste), cu proiectul în exemple/.
 * @returns {Promise<{cronologie: object, intern: object, construit: object}>}
 */
export async function buildExemplu(date, dirBuild, { tema = null, dirProiect = DIR_EXEMPLE } = {}) {
  const sab = await sablonul();
  const stil = stilRezolvat(sab, date, tema);
  const ctx = ctxTest(sab, { stil, dirProiect });
  const c = sab.modul.cronologie(date, stil, ctx);
  assert.deepEqual(c.erori, [], JSON.stringify(c.erori, null, 2));
  const construit = await sab.modul.construieste(date, stil, c.cronologie, dirBuild, { ...ctx, intern: c.intern });
  return { cronologie: c.cronologie, intern: c.intern, construit };
}
