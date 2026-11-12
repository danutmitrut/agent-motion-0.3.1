import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FPS, CADRE_TRANZITIE, cadreScena, cadreTotale, inceputuri, cadreIntrare } from '../src/durata.mjs';

test('constantele: 30 fps și tranziția de 12 cadre', () => {
  assert.equal(FPS, 30);
  assert.equal(CADRE_TRANZITIE, 12);
});

test('exemplul din spec: 3 + 4,5 + 8 + 5 + 3,5 s dau 672 de cadre', () => {
  const durate = [3, 4.5, 8, 5, 3.5];
  assert.deepEqual(durate.map(cadreScena), [90, 135, 240, 150, 105]);
  assert.equal(cadreTotale(durate.map(cadreScena)), 672);
  assert.deepEqual(inceputuri(durate.map(cadreScena)), [0, 78, 201, 429, 567]);
});

test('exemple/grafic.date.json: 3,8 + 4 + 7,8 + 4,6 + 3,8 s dau tot 672 de cadre', () => {
  const durate = [3.8, 4, 7.8, 4.6, 3.8];
  assert.deepEqual(durate.map(cadreScena), [114, 120, 234, 138, 114]);
  assert.equal(cadreTotale(durate.map(cadreScena)), 672);
  assert.deepEqual(inceputuri(durate.map(cadreScena)), [0, 102, 210, 432, 558]);
});

test('cadreTotale și inceputuri primesc cadre, nu secunde (React le cheamă cu props.scene[i].cadre)', () => {
  assert.equal(cadreTotale([120]), 120);
  assert.equal(cadreTotale([90, 135]), 213);
  assert.deepEqual(inceputuri([90, 135]), [0, 78]);
});

test('o singură scenă nu are tranziție; durata cu zecimală nu pierde cadre la rotunjire', () => {
  assert.equal(cadreScena(4.1), 123);
  assert.equal(cadreScena(0.3 * 3), 27);
});

test('cadreIntrare: titlu 18, cifra 45, bare 30 + 2 pe bară, comparatie 30 + 6 pe rând, final 18', () => {
  assert.equal(cadreIntrare('titlu'), 18);
  assert.equal(cadreIntrare('cifra'), 45);
  assert.equal(cadreIntrare('bare', 6), 40);
  assert.equal(cadreIntrare('bare', 8), 44);
  assert.equal(cadreIntrare('comparatie', 2), 36);
  assert.equal(cadreIntrare('comparatie', 3), 42);
  assert.equal(cadreIntrare('final'), 18);
  assert.throws(() => cadreIntrare('linie'), TypeError);
});

test('invariant: orice intrare încape înaintea fade-ului scenei următoare, chiar și într-o scenă de 2 s', () => {
  // limitele schemei: bare 2-8 valori, comparatie 2-3 valori, durata minimă 2 s
  const limita = cadreScena(2) - CADRE_TRANZITIE;
  assert.equal(limita, 48);
  for (const tip of ['titlu', 'cifra', 'final']) assert.ok(cadreIntrare(tip) <= limita, tip);
  for (let n = 2; n <= 8; n++) assert.ok(cadreIntrare('bare', n) <= limita, `bare ${n}`);
  for (let n = 2; n <= 3; n++) assert.ok(cadreIntrare('comparatie', n) <= limita, `comparatie ${n}`);
});
