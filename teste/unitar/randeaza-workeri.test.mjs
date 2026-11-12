import { test } from 'node:test';
import assert from 'node:assert/strict';
import { argumenteWorkeri, optiuniRender } from '../../nucleu/lib/randeaza/index.mjs';

const GIB = 1024 ** 3;

test('sub 12 GB de memorie, prima randare cere 2 procese; de la 12 GB în sus, nimic (auto)', () => {
  assert.deepEqual(argumenteWorkeri(8 * GIB), ['--workers', '2']);
  assert.deepEqual(argumenteWorkeri(12 * GIB - 1), ['--workers', '2']);
  assert.deepEqual(argumenteWorkeri(12 * GIB), []);
  assert.deepEqual(argumenteWorkeri(32 * GIB), []);
});

test('render nu se reîncearcă singur la EBUSY: opțiunile au reincercariEbusy 0 și nu au cwd', () => {
  const ff = { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' };
  const o = optiuniRender('/rad', ff);
  assert.equal(o.reincercariEbusy, 0);
  assert.equal(o.radacina, '/rad');
  assert.equal(o.ff, ff);
  assert.equal('cwd' in o, false);
});
