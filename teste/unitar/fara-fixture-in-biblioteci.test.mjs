// Biblioteca sintetică de test nu ajunge niciodată în biblioteci/ (harta 5.13),
// iar fișierele ei comise sunt exact cele produse de genereaza.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256Fisier } from '../../nucleu/lib/fisiere.mjs';
import { genereaza } from '../fixtures/biblioteci-mini/genereaza.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';

const RADACINA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR_MINI = path.join(RADACINA, 'teste', 'fixtures', 'biblioteci-mini', 'biblioteci');
const DIR_BIBLIOTECI = path.join(RADACINA, 'biblioteci');

function fisiereRecursiv(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => path.join(d.parentPath, d.name));
}

test('niciun fișier din biblioteci-mini nu are pereche cu același sha256 în biblioteci/', () => {
  const dinFixture = new Map(fisiereRecursiv(DIR_MINI).map((f) => [sha256Fisier(f), path.relative(RADACINA, f)]));
  assert.ok(dinFixture.size >= 8, 'fixture-ul trebuie generat întâi');
  for (const f of fisiereRecursiv(DIR_BIBLIOTECI)) {
    const pereche = dinFixture.get(sha256Fisier(f));
    assert.equal(pereche, undefined, `${path.relative(RADACINA, f)} e o copie a fixture-ului ${pereche}`);
  }
});

test('catalogul din biblioteci/ nu trimite la sha256-urile pieselor sintetice', () => {
  const caleCatalog = path.join(DIR_BIBLIOTECI, 'catalog.json');
  if (!fs.existsSync(caleCatalog)) return;
  const mini = JSON.parse(fs.readFileSync(path.join(DIR_MINI, 'catalog.json'), 'utf8'));
  const sintetice = new Set(mini.piese.map((p) => p.sha256));
  const real = JSON.parse(fs.readFileSync(caleCatalog, 'utf8'));
  for (const p of real.piese ?? []) assert.ok(!sintetice.has(p.sha256), `${p.id} are sha256-ul unei piese sintetice`);
});

test('fișierele comise din biblioteci-mini sunt la zi cu genereaza.mjs', () => {
  const temp = creeazaRadacinaTemp();
  try {
    const dir = path.join(temp.radacina, 'mini');
    genereaza(dir);
    const nou = fisiereRecursiv(dir).map((f) => path.relative(dir, f).split(path.sep).join('/')).sort();
    const comis = fisiereRecursiv(DIR_MINI).map((f) => path.relative(DIR_MINI, f).split(path.sep).join('/')).sort();
    assert.deepEqual(nou, comis);
    for (const rel of nou) {
      assert.equal(sha256Fisier(path.join(dir, rel)), sha256Fisier(path.join(DIR_MINI, rel)), rel);
    }
  } finally {
    temp.curata();
  }
});
