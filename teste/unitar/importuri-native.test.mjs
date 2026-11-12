/**
 * Modulele „doar native” (harta 2) importă exclusiv node:* și alte module din aceeași listă,
 * ca mg doctor și garda să meargă înainte de npm ci.
 * Excepție: în nucleu/mg.mjs, comenzile se încarcă cu await import() după alegere, deci acolo
 * se verifică doar importurile statice.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../../', import.meta.url));

const MODULE_NATIVE = [
  'nucleu/garda.mjs',
  'nucleu/lib/garda/',
  'nucleu/lib/erori.mjs',
  'nucleu/lib/cai.mjs',
  'nucleu/lib/fisiere.mjs',
  'nucleu/lib/lock.mjs',
  'nucleu/lib/scenariu.mjs',
  'nucleu/lib/stare.mjs',
  'nucleu/lib/contrast.mjs',
  'nucleu/lib/format.mjs',
  'nucleu/lib/doctor/baza.mjs',
  'nucleu/lib/doctor/canar.mjs',
  'nucleu/lib/doctor/npm.mjs',
  'nucleu/mg.mjs',
];
const DOAR_STATICE = new Set(['nucleu/mg.mjs']);

/** Lista de fișiere: intrările care se termină în '/' se extind la fișierele .mjs din folder. */
function fisiereNative() {
  const fisiere = [];
  for (const intrare of MODULE_NATIVE) {
    if (!intrare.endsWith('/')) {
      fisiere.push(intrare);
      continue;
    }
    const dir = join(REPO, intrare);
    if (!existsSync(dir)) continue;
    for (const nume of readdirSync(dir).filter((n) => n.endsWith('.mjs')).sort()) fisiere.push(`${intrare}${nume}`);
  }
  return fisiere;
}

/** @returns {{statice: string[], dinamice: string[]}} specificatorii din textul unui modul */
function specificatori(text) {
  const statice = [];
  const tipare = [
    /^\s*import\s+(?:[\w*{}\s,$]+?\s+from\s+)?['"]([^'"\n]+)['"]/gm,
    /^\s*export\s+(?:\*(?:\s+as\s+[\w$]+)?|\{[^}]*\})\s+from\s+['"]([^'"\n]+)['"]/gm,
  ];
  for (const tipar of tipare) for (const m of text.matchAll(tipar)) statice.push(m[1]);
  const dinamice = [...text.matchAll(/\bimport\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g)].map((m) => m[1]);
  return { statice, dinamice };
}

/**
 * @param {string} fisier calea relativă cu '/', de exemplu 'nucleu/lib/lock.mjs'
 * @param {string} text
 * @param {Set<string>} permise căile relative ale modulelor native
 * @param {boolean} doarStatice
 * @returns {string[]} importurile nepermise
 */
function importuriNepermise(fisier, text, permise, doarStatice) {
  const { statice, dinamice } = specificatori(text);
  const deVerificat = doarStatice ? statice : [...statice, ...dinamice];
  return deVerificat.filter((spec) => {
    if (spec.startsWith('node:')) return false;
    if (spec.startsWith('./') || spec.startsWith('../')) return !permise.has(posix.join(posix.dirname(fisier), spec));
    return true;
  });
}

const PERMISE = new Set(['nucleu/lib/erori.mjs', 'nucleu/lib/fisiere.mjs', 'nucleu/lib/cai.mjs', 'nucleu/mg.mjs']);

test('detectorul prinde pachetele npm, modulele node fără prefix și relativele nepermise', () => {
  const text = [
    "import Ajv from 'ajv';",
    "import fs from 'fs';",
    "import { a,",
    "  b } from './fisiere.mjs';",
    "import { citesteBrand } from './brand.mjs';",
    "export { x } from './schema.mjs';",
    "import { join } from 'node:path';",
    "import './erori.mjs';",
    "const m = await import('./nou.mjs');",
  ].join('\n');
  assert.deepEqual(importuriNepermise('nucleu/lib/lock.mjs', text, PERMISE, false), ['ajv', 'fs', './brand.mjs', './schema.mjs', './nou.mjs']);
  assert.deepEqual(importuriNepermise('nucleu/lib/lock.mjs', text, PERMISE, true), ['ajv', 'fs', './brand.mjs', './schema.mjs']);
  assert.deepEqual(importuriNepermise('nucleu/mg.mjs', "import { x } from './lib/cai.mjs';\nconst y = import.meta.url;\n", PERMISE, true), []);
});

const fisiere = fisiereNative();
const permise = new Set(fisiere);

for (const fisier of fisiere) {
  const cale = join(REPO, fisier);
  test(`${fisier} importă doar module native`, { skip: !existsSync(cale) && 'fișierul nu există încă' }, () => {
    const nepermise = importuriNepermise(fisier, readFileSync(cale, 'utf8'), permise, DOAR_STATICE.has(fisier));
    assert.deepEqual(nepermise, [], `${fisier} importă ${nepermise.join(', ')}`);
  });
}
