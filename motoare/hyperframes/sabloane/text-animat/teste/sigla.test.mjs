import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { dimensiuniSigla, citesteSigla, potrivesteSigla, sursaSigla } from '../sigla.mjs';

function png(latime, inaltime) {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(latime, 16);
  b.writeUInt32BE(inaltime, 20);
  return b;
}

test('dimensiuniSigla: PNG din IHDR, SVG din viewBox sau din width și height', () => {
  assert.deepEqual(dimensiuniSigla(png(400, 100), 'png'), { latime: 400, inaltime: 100 });
  assert.deepEqual(dimensiuniSigla(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 80"><rect/></svg>'), 'svg'), { latime: 240, inaltime: 80 });
  assert.deepEqual(dimensiuniSigla(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="120px" height="60"></svg>'), 'svg'), { latime: 120, inaltime: 60 });
  assert.equal(dimensiuniSigla(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'svg'), null);
  assert.equal(dimensiuniSigla(Buffer.from('nu e png'), 'png'), null);
});

test('citesteSigla: lipsă, extensie, prea mare, fără dimensiuni, bună', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sigla-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'a.png'), png(400, 100));
  fs.writeFileSync(path.join(dir, 'b.svg'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  fs.writeFileSync(path.join(dir, 'c.jpg'), 'x');
  assert.equal(citesteSigla(path.join(dir, 'lipsa.svg'), 2097152).motiv, 'lipsa');
  assert.equal(citesteSigla(path.join(dir, 'c.jpg'), 2097152).motiv, 'extensie');
  assert.equal(citesteSigla(path.join(dir, 'a.png'), 10).motiv, 'mare');
  assert.equal(citesteSigla(path.join(dir, 'b.svg'), 2097152).motiv, 'dimensiuni');
  const r = citesteSigla(path.join(dir, 'a.png'), 2097152);
  assert.equal(r.ok, true);
  assert.equal(r.mime, 'image/png');
  assert.deepEqual([r.latime, r.inaltime, r.octeti], [400, 100, 33]);
});

test('potrivesteSigla păstrează raportul în cutie, în pixeli întregi', () => {
  assert.deepEqual(potrivesteSigla(400, 100, [360, 140]), { w: 360, h: 90 });
  assert.deepEqual(potrivesteSigla(100, 100, [360, 140]), { w: 140, h: 140 });
});

test('sursaSigla: brandul are prioritate; fără brand, date.sigla din proiect', () => {
  const b = sursaSigla({ sigla: 'resurse/x.svg' }, { nume: 'studio', dir: '/b/studio', sigla: 'sigla.svg' }, '/p');
  assert.deepEqual([b.camp, b.cale], ['brand', path.resolve('/b/studio', 'sigla.svg')]);
  const d = sursaSigla({ sigla: 'resurse/x.svg' }, null, '/p');
  assert.deepEqual([d.camp, d.cale], ['sigla', path.join('/p', 'resurse', 'x.svg')]);
  assert.equal(sursaSigla({}, null, '/p'), null);
});
