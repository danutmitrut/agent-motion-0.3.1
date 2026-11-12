import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { formatRo, textValoare, zecimaleNecesare } from '../src/comun/numere.mjs';

test('formatRo: punct la mii, virgulă la zecimale, fără locale', () => {
  assert.equal(formatRo(1248), '1.248');
  assert.equal(formatRo(1250000), '1.250.000');
  assert.equal(formatRo(999), '999');
  assert.equal(formatRo(3.5, 1), '3,5');
  assert.equal(formatRo(12.5, 2), '12,50');
  assert.equal(formatRo(-1200), '-1.200');
  assert.equal(formatRo(-0.001), '0');
  assert.equal(formatRo(0), '0');
});

test('textValoare: prefixul și sufixul exact cum le-a scris cursantul', () => {
  assert.equal(textValoare({ valoare: 78450, sufix: ' lei' }), '78.450 lei');
  assert.equal(textValoare({ valoare: 3.5, zecimale: 1, prefix: '+', sufix: '%' }), '+3,5%');
  assert.equal(textValoare({ valoare: 1248 }), '1.248');
});

test('zecimaleNecesare: 0, 1, 2 sau null peste 2', () => {
  assert.equal(zecimaleNecesare(8400), 0);
  assert.equal(zecimaleNecesare(12.5), 1);
  assert.equal(zecimaleNecesare(1.25), 2);
  assert.equal(zecimaleNecesare(1.005), null);
});

test('modulul e ESM pur, fără importuri și fără API dependente de sistem (îl încarcă și React)', () => {
  const sursa = fs.readFileSync(fileURLToPath(new URL('../src/comun/numere.mjs', import.meta.url)), 'utf8');
  assert.doesNotMatch(sursa, /^import /m);
  assert.doesNotMatch(sursa, /\.toLocaleString\(|Intl\.[A-Z]|Date\.now\(|Math\.random\(/);
});
