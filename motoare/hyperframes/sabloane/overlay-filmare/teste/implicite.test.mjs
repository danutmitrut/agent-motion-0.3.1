import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const I = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../implicite.json', import.meta.url)), 'utf8'));
const inCadru = ([x, y, w, h], W, H) => x >= 0 && y >= 0 && x + w <= W && y + h <= H;

test('benzile pe vertical sunt cele din spec 7.4', () => {
  const b = I.formate.vertical.benzi;
  assert.deepEqual(b.sus, [72, 220, 936, 340]);
  assert.deepEqual(b.centru, [72, 700, 936, 450]);
  assert.deepEqual(b.nume, [72, 1060, 720, 160]);
  assert.deepEqual(b.jos, [72, 1240, 858, 300]);
  assert.deepEqual(b.mijloc, [72, 900, 858, 250]);
  assert.deepEqual(b.libera, [0, 560, 1080, 140]);
  assert.deepEqual(b['jos-de-tot'], [72, 1384, 858, 206], 'felia 2: banda lipită de limita interfeței Reels');
  for (const [nume, z] of Object.entries(b)) {
    assert.ok(inCadru(z, 1080, 1920), nume);
    assert.ok(z[1] + z[3] <= 1594, `${nume} coboară sub y 1594`);
  }
  assert.deepEqual(I.formate.vertical.subtitrari, { S: 52, M: 64, L: 76, min: 42 });
});

test('benzile pe orizontal sunt cele din decizia 9, în zona sigură de 10%', () => {
  const b = I.formate.orizontal.benzi;
  assert.deepEqual(b, { sus: [192, 108, 1536, 200], libera: [0, 308, 1920, 60], centru: [192, 368, 1536, 400], nume: [192, 700, 900, 120], jos: [192, 830, 1536, 142], mijloc: [192, 600, 1536, 200] });
  for (const [nume, z] of Object.entries(b)) if (nume !== 'libera') assert.ok(z[0] >= 192 && z[1] >= 108 && z[0] + z[2] <= 1728 && z[1] + z[3] <= 972, nume);
  assert.deepEqual(I.formate.orizontal.subtitrari, { S: 42, M: 48, L: 56, min: 42 });
});

test('ritmurile, duratele și limitele din spec 7.4', () => {
  assert.deepEqual(I.ritm.calm, { intrare: 0.5, cuvinte: 5, avans: 0.25, ease: 'power2.out' });
  assert.deepEqual(I.ritm.normal, { intrare: 0.35, cuvinte: 4, avans: 0.15, ease: 'power3.out' });
  assert.deepEqual(I.ritm.alert, { intrare: 0.2, cuvinte: 3, avans: 0.1, ease: 'back.out(1.6)' });
  assert.deepEqual(I.durate.titlu, { min: 1.5, max: 5, implicita: 2.5 });
  assert.deepEqual(I.durate.nume, { min: 2, max: 5, implicita: 3.5 });
  assert.deepEqual(I.durate.cifra, { min: 1.5, max: 5, implicita: 2.5 });
  assert.deepEqual(I.durate.citat, { min: 2.5, max: 8, implicita: 4 });
  assert.deepEqual(I.durate.lista, { min: 3, max: 8, dupa_ultimul: 1.5 });
  assert.deepEqual(I.durate.final, { min: 2, max: 6, inainte_de_sfarsit: 3 });
  assert.deepEqual(I.limite, { elemente: 12, secunde_pe_element: 3, citat: 2, lista: 2, nume: 2, final: 1, pauza_banda: 0.3, blocuri_vizibile: 2 });
  assert.deepEqual(I.subtitrari.umpluturi, ['ă', 'ăă', 'îî', 'mm', 'hm', 'ee']);
});
