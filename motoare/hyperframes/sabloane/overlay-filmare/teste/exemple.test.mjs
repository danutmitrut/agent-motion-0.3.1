// Exemplele (H13): fiecare trece valideaza și cronologie pe transcrierea lui, iar build-ul trece C17 (toate textele, inclusiv
// subtitrările, sunt noduri statice). Drumul complet mg nou → mg randeaza pe motorul real e acceptarea (H15).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { asteptariDinPlan } from '../plan.mjs';
import { verificaBuild } from '../../../../../nucleu/lib/verificari/build.mjs';
import { buildExemplu, DIR_EXEMPLE, EXEMPLE, REPO } from './ajutoare.mjs';

const VERSIUNI = JSON.parse(fs.readFileSync(path.join(REPO, 'nucleu', 'VERSIUNI.json'), 'utf8'));
const exemplu = (nume) => JSON.parse(fs.readFileSync(path.join(DIR_EXEMPLE, nume, 'date.json'), 'utf8'));
const transcrierea = (nume) => JSON.parse(fs.readFileSync(path.join(DIR_EXEMPLE, nume, 'transcriere.json'), 'utf8'));

async function construit(t, nume) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `mg-overlay-ex-${nume}-`));
  const b = await buildExemplu(nume, dir);
  t.after(() => { b.proiect.curata(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { ...b, dirBuild: dir };
}

test('corecturile exemplelor numesc exact cuvântul din transcriere', () => {
  const norm = (s) => s.toLowerCase().replace(/[.,!?;:„”"]/g, '');
  for (const nume of EXEMPLE) {
    const cuvinte = transcrierea(nume).cuvinte;
    for (const c of exemplu(nume).corecturi ?? []) {
      const [a, b = a] = c.cuvinte.split('-').map((w) => Number(w.slice(1)));
      assert.equal(norm(cuvinte.slice(a, b + 1).map((x) => x.text).join(' ')), norm(c.din), `${nume}: ${c.cuvinte}`);
    }
  }
});

for (const nume of EXEMPLE) {
  test(`exemplul ${nume}: plan fără erori și fără avertismente, C17 verde pe build`, async (t) => {
    const b = await construit(t, nume);
    assert.deepEqual(b.avertismente, []);
    assert.equal(b.plan.elemente.length, exemplu(nume).elemente.length);
    assert.ok(b.plan.subtitrari.grupuri.length > 0);
    const [c10, c17] = verificaBuild({ dirBuild: b.dirBuild, asteptari: asteptariDinPlan(b.cronologie, b.plan), check: { ok: true, _meta: { version: VERSIUNI.motoare.hyperframes.versiune } }, versiuni: VERSIUNI });
    assert.deepEqual(c17.erori, []);
    assert.deepEqual(c10.erori, []);
  });
}

test('exemplul vertical: corectura și evidențierea ajung în subtitrări', async (t) => {
  const b = await construit(t, 'vertical');
  const cuvinte = b.plan.subtitrari.grupuri.flatMap((g) => g.cuvinte);
  assert.equal(cuvinte.some((c) => c.text === 'șase'), false);
  assert.deepEqual(cuvinte.filter((c) => c.evidentiat).map((c) => c.text), ['6', 'ore']);
  assert.deepEqual(b.plan.elemente.map((e) => [e.tip, e.banda]), [['nume', 'nume'], ['cifra', 'sus'], ['lista', 'centru'], ['final', 'centru']]);
});

test('exemplul orizontal: tema hârtie, ritm calm, subtitrările la mijloc', async (t) => {
  const b = await construit(t, 'orizontal');
  assert.deepEqual([b.plan.format, b.plan.latime, b.plan.inaltime], ['orizontal', 1920, 1080]);
  assert.equal(b.plan.subtitrari.pozitie, 'mijloc');
  assert.deepEqual(b.plan.elemente.map((e) => [e.tip, e.banda]), [['titlu', 'sus'], ['lista', 'centru'], ['citat', 'centru']]);
  const html = fs.readFileSync(path.join(b.dirBuild, 'index.html'), 'utf8');
  assert.match(html, /<div id="root" class="orizontal cuvant-activ"/);
});
