import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { formatRo, textCifra } from '../cifre.mjs';

const MISCARI = fileURLToPath(new URL('../lib/miscari.js', import.meta.url));

test('formatRo: punct la mii, virgulă la zecimale, fără toLocaleString', () => {
  assert.equal(formatRo(0), '0');
  assert.equal(formatRo(62), '62');
  assert.equal(formatRo(1250), '1.250');
  assert.equal(formatRo(1250000), '1.250.000');
  assert.equal(formatRo(999999999), '999.999.999');
  assert.equal(formatRo(3.5, 1), '3,5');
  assert.equal(formatRo(3.5, 2), '3,50');
  assert.equal(formatRo(1234.567, 2), '1.234,57');
  assert.equal(fs.readFileSync(fileURLToPath(new URL('../cifre.mjs', import.meta.url)), 'utf8').includes('toLocaleString('), false);
});

test('textCifra: prefixul, valoarea formatată și sufixul, lipite', () => {
  assert.equal(textCifra({ valoare: 62, sufix: '%' }), '62%');
  assert.equal(textCifra({ valoare: 1250000, prefix: '€', zecimale: 0 }), '€1.250.000');
  assert.equal(textCifra({ valoare: 3.5, zecimale: 1, sufix: ' ore' }), '3,5 ore');
});

test('copia din lib/miscari.js dă aceleași texte (numărarea din runtime)', { skip: !fs.existsSync(MISCARI) && 'lib/miscari.js vine în G06' }, () => {
  const fereastra = {};
  vm.runInNewContext(fs.readFileSync(MISCARI, 'utf8'), { window: fereastra, gsap: {}, document: {} });
  for (const [x, z] of [[0, 0], [62, 0], [1250, 0], [1250000, 0], [999999999, 0], [3.5, 1], [3.5, 2], [1234.567, 2], [0.05, 1]]) {
    assert.equal(fereastra.Miscari.formatRo(x, z), formatRo(x, z), `${x}, ${z}`);
  }
});
