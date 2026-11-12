// Spec 7.2, „Testul de acceptare”, punctul 2: fiecare caz din teste/invalide/ pică exact cu codul și câmpul lui,
// pe drumul lui mg randeaza (pregatesteBuild: schema, brandul, valideaza, stilul, cronologia, build-ul, C05 și C06),
// fără motor. Erorile se adună din erori și din rezultatele verificărilor, fără dubluri.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { copiazaDosar } from '../../../../../teste/ajutoare/copiaza.mjs';
import { radacinaCuMotoare } from '../../../../../teste/ajutoare/radacina-motoare.mjs';
import { incarcaSablon } from '../../../../../nucleu/lib/sabloane.mjs';
import { pregateste } from './ajutoare.mjs';

const REPO = fileURLToPath(new URL('../../../../../', import.meta.url));
const DIR_INVALIDE = fileURLToPath(new URL('./invalide/', import.meta.url));
const ASTEPTAT = JSON.parse(fs.readFileSync(path.join(DIR_INVALIDE, 'asteptat.json'), 'utf8'));
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 50"><rect width="200" height="50" fill="#C2410C"/></svg>\n';

let temp;
let sablon;

before(async () => {
  temp = radacinaCuMotoare();
  sablon = await incarcaSablon(temp.radacina, 'text-animat');
  // brandul fixture-ului, cu sigla pe care fișa o numește (fixture-ul nu o are)
  const dirBrand = path.join(temp.radacina, 'branduri', 'studio-lemn');
  copiazaDosar(path.join(REPO, 'teste', 'fixtures', 'branduri', 'studio-lemn'), dirBrand);
  fs.writeFileSync(path.join(dirBrand, 'sigla.svg'), SVG);
});

after(() => temp?.curata());

function perechiErori(p) {
  const vazute = new Set();
  const perechi = [];
  for (const e of [...p.erori, ...p.rezultate.flatMap((r) => r.erori)]) {
    const cheie = `${e.cod}\n${e.camp}`;
    if (vazute.has(cheie)) continue;
    vazute.add(cheie);
    perechi.push([e.cod, e.camp]);
  }
  return perechi;
}

test('fiecare fișier din teste/invalide/ are o intrare în asteptat.json și invers', () => {
  const fisiere = fs.readdirSync(DIR_INVALIDE).filter((f) => f.endsWith('.json') && f !== 'asteptat.json').map((f) => f.slice(0, -5)).sort();
  assert.deepEqual(fisiere, Object.keys(ASTEPTAT).sort());
  assert.equal(fisiere.length, 16);
});

test('sedila.json are ș cu sedilă (U+015F) scris ca escape', () => {
  const text = fs.readFileSync(path.join(DIR_INVALIDE, 'sedila.json'), 'utf8');
  assert.match(text, /\\u015f/);
  assert.equal(text.includes(String.fromCharCode(0x15f)), false);
});

for (const [caz, asteptat] of Object.entries(ASTEPTAT)) {
  test(`invalid ${caz}: pică exact cu ${asteptat.map(([c, f]) => `${c} pe ${f}`).join(', ')}`, async () => {
    const date = fs.readFileSync(path.join(DIR_INVALIDE, `${caz}.json`), 'utf8');
    const p = await pregateste(temp.radacina, sablon, caz, date);
    assert.deepEqual(perechiErori(p), asteptat, JSON.stringify(p.erori, null, 2));
  });
}
