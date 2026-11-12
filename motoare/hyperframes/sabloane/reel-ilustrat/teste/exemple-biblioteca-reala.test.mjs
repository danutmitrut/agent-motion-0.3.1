import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { incarcaCatalog, gasestePiesa } from '../../../../../nucleu/lib/desen/catalog.mjs';
import { verificaDesene } from '../../../../../nucleu/lib/desen/verifica.mjs';

const AICI = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(AICI, '..', '..', '..', '..', '..');
const DIR_EXEMPLE = path.join(AICI, '..', 'exemple');
const exemple = readdirSync(DIR_EXEMPLE).filter((n) => n.endsWith('.json')).sort();
const citeste = (nume) => JSON.parse(readFileSync(path.join(DIR_EXEMPLE, nume), 'utf8'));
const idDesene = (date) => date.scene.filter((s) => s.desen).map((s) => s.desen.id);

test('exemplele sunt cele trei așteptate', () => {
  assert.equal(exemple.length, 3);
});

for (const nume of exemple) {
  test(`${nume}: desenele există în biblioteca reală și trec de verificaDesene`, () => {
    const catalog = incarcaCatalog(REPO);
    const date = citeste(nume);
    const id = idDesene(date);
    assert.ok(id.length >= 1, 'exemplul nu are niciun desen');
    for (const i of id) assert.ok(gasestePiesa(catalog, i), `desenul ${i} nu există în biblioteci/catalog.json`);
    const { erori } = verificaDesene(date, catalog, REPO);
    assert.deepEqual(erori, []);
  });
}

test('niciun id de desen din exemple nu începe cu lc-', () => {
  for (const nume of exemple) {
    for (const i of idDesene(citeste(nume))) assert.ok(!i.startsWith('lc-'), `${nume}: desenul ${i} e un traseu lc-`);
  }
});
