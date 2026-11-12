import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decupare, filtruDecupare } from '../../nucleu/lib/filmare/decupare.mjs';

test('decupare: orizontal 1920x1080 în vertical 1080x1920, cu focus_x', () => {
  assert.deepEqual(decupare({ latime: 1920, inaltime: 1080 }, { latime: 1080, inaltime: 1920 }, 50), { scala: [3413, 1920], crop: [1080, 1920, 1167, 0] });
  assert.deepEqual(decupare({ latime: 1920, inaltime: 1080 }, { latime: 1080, inaltime: 1920 }, 0).crop, [1080, 1920, 0, 0]);
  assert.deepEqual(decupare({ latime: 1920, inaltime: 1080 }, { latime: 1080, inaltime: 1920 }, 100).crop, [1080, 1920, 2333, 0]);
});

test('decupare: aceeași orientare, mărire fără tăiere; focus_x nu contează', () => {
  assert.deepEqual(decupare({ latime: 360, inaltime: 640 }, { latime: 1080, inaltime: 1920 }, 10), { scala: [1080, 1920], crop: [1080, 1920, 0, 0] });
  assert.equal(filtruDecupare({ latime: 720, inaltime: 1280 }, { latime: 1080, inaltime: 1920 }, 50), 'scale=1080:1920:flags=bicubic,crop=1080:1920:0:0');
});
