import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { incarcaSablon } from '../../../../../nucleu/lib/sabloane.mjs';

const REPO = fileURLToPath(new URL('../../../../../', import.meta.url));

test('incarcaSablon: frontmatter-ul din planul I (decizia 14), cu codurile seriei din felia 3', async () => {
  const sab = await incarcaSablon(REPO, 'date-serie');
  assert.equal(sab.motor, 'remotion');
  assert.deepEqual(sab.meta.formate, ['vertical']);
  assert.deepEqual(sab.meta.teme, ['noapte', 'hartie', 'curat']);
  assert.deepEqual(sab.meta.durata, { min: 6, max: 60, implicita: 22 });
  const comune = Array.from({ length: 17 }, (_, i) => `C${String(i + 1).padStart(2, '0')}`);
  assert.deepEqual(sab.meta.verificari, [...comune, 'S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08', 'S09']);
  assert.deepEqual(sab.meta.stadii, { S06: 'mp4', S07: 'mp4', S08: 'mp4', S09: 'mp4' });
  for (const f of ['iesiri', 'surse']) assert.equal(typeof sab.modul[f], 'function', f);
  for (const f of ['valideaza', 'cronologie', 'construieste', 'asteptari']) assert.equal(typeof sab.modul[f], 'function', f);
});

test('interfața completă: blocScenariu exportat, fără hook-uri de build (S06 și S07 vin cu verificariProprii, în I11)', async () => {
  const sab = await incarcaSablon(REPO, 'date-serie');
  assert.equal(typeof sab.modul.blocScenariu, 'function');
  assert.equal(sab.modul.verificariBuild, undefined);
});
