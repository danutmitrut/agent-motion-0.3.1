import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numarRo } from '../../nucleu/lib/format.mjs';

test('numarRo pune virgulă zecimală și lasă întregii neschimbați', () => {
  assert.equal(numarRo(3.1), '3,1');
  assert.equal(numarRo(0.033), '0,033');
  assert.equal(numarRo(3), '3');
  assert.equal(numarRo(null), 'null');
});
