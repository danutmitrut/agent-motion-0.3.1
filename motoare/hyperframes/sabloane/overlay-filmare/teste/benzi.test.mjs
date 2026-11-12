import { test } from 'node:test';
import assert from 'node:assert/strict';
import { benziFormat, bandaSubtitrari, seIntersecteaza, suspendari, verificaOcupare } from '../benzi.mjs';
import { IMPLICITE } from './ajutoare.mjs';

const E = (n, tip, start, sfarsit, extra = {}) => ({ n, camp: `elemente[${n - 1}]`, id: `e${n}`, tip, banda: IMPLICITE.banda_tip[tip], start, sfarsit, ancora: null, ...extra });
const date = (elemente, subtitrari = {}) => ({ format: 'vertical', subtitrari, elemente });
const ocupare = (el, sub = {}, durata = 30) => verificaOcupare(el, { date: date(el.map((e) => ({ tip: e.tip, la: e.start })), sub), durata, implicite: IMPLICITE, format: 'vertical' }).map((e) => e.camp);

test('benzile se ating cum spune decizia 10', () => {
  const b = benziFormat(IMPLICITE, 'vertical');
  assert.equal(seIntersecteaza(b.nume, b.centru), true);
  assert.equal(seIntersecteaza(b.nume, b.mijloc), true);
  assert.equal(seIntersecteaza(b.nume, b.jos), false);
  assert.equal(seIntersecteaza(b.sus, b.centru), false);
  assert.deepEqual(bandaSubtitrari(IMPLICITE, 'orizontal', 'mijloc'), [192, 600, 1536, 200]);
});

test('suspendările: centrul mereu, numele doar cu subtitrările la mijloc', () => {
  const b = benziFormat(IMPLICITE, 'vertical');
  const el = [E(1, 'nume', 1, 4), E(2, 'citat', 6, 10), E(3, 'titlu', 11, 13)];
  assert.deepEqual(suspendari(el, { benzi: b, bandaSub: b.jos }), [[6, 10]]);
  assert.deepEqual(suspendari(el, { benzi: b, bandaSub: b.mijloc }), [[1, 4], [6, 10]]);
});

test('S04: limitele, numărul, pauza în bandă, cele două blocuri', () => {
  assert.deepEqual(ocupare([E(1, 'titlu', 0.2, 2.7)]), []);
  assert.deepEqual(ocupare([E(1, 'titlu', 0.2, 6)]), ['elemente[0].la']);
  assert.deepEqual(ocupare([E(1, 'titlu', 0.2, 2.7), E(2, 'cifra', 2.8, 5)]), ['elemente[1].la']);
  assert.deepEqual(ocupare([E(1, 'titlu', 0.2, 2.7), E(2, 'cifra', 3, 5.5)]), []);
  assert.deepEqual(ocupare([E(1, 'titlu', 0.2, 2.7), E(2, 'nume', 1, 4)]), ['elemente[1].la']);
  assert.deepEqual(ocupare([E(1, 'titlu', 0.2, 2.7), E(2, 'nume', 1, 4)], { activ: false }), []);
  assert.deepEqual(ocupare([E(1, 'titlu', 1, 3), E(2, 'citat', 1.5, 5.5)]), []);
  assert.deepEqual(ocupare([E(1, 'nume', 1, 4), E(2, 'citat', 3, 7)]), ['elemente[1].la']);
  assert.deepEqual(ocupare([E(1, 'final', 10, 14)], {}, 14), []);
  assert.deepEqual(ocupare([E(1, 'final', 10, 13)], {}, 14), ['elemente[0].la']);
  const multe = Array.from({ length: 4 }, (_, i) => E(i + 1, 'titlu', i * 3, i * 3 + 2));
  assert.ok(ocupare(multe, {}, 9).includes('elemente'));
  assert.ok(ocupare([E(1, 'citat', 0, 3), E(2, 'citat', 4, 7), E(3, 'citat', 8, 11)]).includes('elemente'));
});
