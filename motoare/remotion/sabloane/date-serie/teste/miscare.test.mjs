// Coregrafia comună (src/comun/miscare.mjs): fiecare animație ajunge exact la valoarea finală la `pana`, deci la cadrul
// `intrare` totul stă în caseta din props (C13). miscare.mjs importă `remotion`; fără Remotion instalat testele se sar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const instalat = fs.existsSync(path.join(DIR, '..', '..', 'node_modules', 'remotion', 'package.json'));
const OPT = { skip: !instalat && 'Remotion nu e instalat în motoare/remotion/node_modules' };
const m = () => import('../src/comun/miscare.mjs');

test('progres: 0 până la de, exact 1 de la pana, crescător între ele', OPT, async () => {
  const { progres } = await m();
  assert.equal(progres(0, 0, 18), 0);
  assert.equal(progres(18, 0, 18), 1);
  assert.equal(progres(40, 0, 18), 1);
  assert.equal(progres(3, 6, 18), 0);
  let inainte = 0;
  for (let c = 0; c <= 18; c++) {
    const p = progres(c, 0, 18);
    assert.ok(p >= inainte && p <= 1, `cadrul ${c}: ${p}`);
    inainte = p;
  }
});

test('crestere: spring fără depășire, exact 1 de la pana', OPT, async () => {
  const { crestere } = await m();
  assert.equal(crestere(0, 0, 30, 30), 0);
  assert.equal(crestere(30, 0, 30, 30), 1);
  assert.equal(crestere(45, 15, 45, 30), 1);
  for (let c = 0; c <= 30; c++) assert.ok(crestere(c, 0, 30, 30) <= 1, `cadrul ${c}`);
});

test('deriva: scala exact 1 până la intrare, 1,02 la capătul scenei', OPT, async () => {
  const { deriva } = await m();
  assert.equal(deriva(0, 18, 90), 1);
  assert.equal(deriva(18, 18, 90), 1);
  assert.ok(Math.abs(deriva(90, 18, 90) - 1.02) < 1e-12);
  assert.ok(deriva(54, 18, 90) > 1 && deriva(54, 18, 90) < 1.02);
});

test('esalonat: 4 cadre între texte, cel târziu cu 12 cadre înainte de pana', OPT, async () => {
  const { esalonat } = await m();
  assert.deepEqual(esalonat(0, 18), { de: 0, pana: 18 });
  assert.deepEqual(esalonat(1, 18), { de: 4, pana: 18 });
  assert.deepEqual(esalonat(5, 18), { de: 6, pana: 18 });
  assert.deepEqual(esalonat(2, 10), { de: 0, pana: 10 });
});
