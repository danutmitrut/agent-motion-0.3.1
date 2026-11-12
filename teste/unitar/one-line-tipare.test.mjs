// F5 (revizia finală a planului C): tiparele pazei one-line prind toate formele articulate și nu prind cuvinte nevinovate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TIPARE_ONE_LINE } from '../ajutoare/one-line.mjs';

const prinde = (text) => TIPARE_ONE_LINE.some(([rx]) => rx.test(text));

test('tiparele prind toate formele desenelor one-line', () => {
  for (const text of [
    'desene în linie continuă', 'stilul liniei continue', 'linia continuă a lui Dănuț', 'două linii continue',
    'liniile continue', 'Linie   continua', 'one-line', 'One line', 'oneline',
    'lc-coplesit-laptop', 'id_lc-relaxat', '"LC-ceva"',
  ]) {
    assert.ok(prinde(text), `nu prinde: ${text}`);
  }
});

test('tiparele nu prind cuvinte nevinovate', () => {
  for (const text of ['calc-1', 'phone line', 'online', 'linia de accent', 'linie de bază', 'continuă cu scena 2']) {
    assert.ok(!prinde(text), `prinde greșit: ${text}`);
  }
});
