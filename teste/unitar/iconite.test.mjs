import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { incarcaIconite, existaIconita, svgIconita } from '../../nucleu/lib/iconite.mjs';
import { sha256Fisier } from '../../nucleu/lib/fisiere.mjs';

const RADACINA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHA_LUCIDE = 'f490eb6a567077aa334dcf1617c0845dde294ab916c44dda9c535fc8355cad6d';
const SHA_LICENTA = 'b495047bd93a9b06913511076f504daba17d5bbeb3e0650f3bb53a4220329c57';

test('fișierul Lucide are sha256-ul fixat, și în VERSIUNI.json', () => {
  const versiuni = JSON.parse(fs.readFileSync(path.join(RADACINA, 'nucleu', 'VERSIUNI.json'), 'utf8'));
  assert.deepEqual(versiuni.lucide, {
    versiune: '1.49.0',
    fisier: 'motoare/comun/iconite/lucide-1.49.0.json',
    sha256: SHA_LUCIDE,
  });
  assert.equal(sha256Fisier(path.join(RADACINA, 'motoare', 'comun', 'iconite', 'lucide-1.49.0.json')), SHA_LUCIDE);
  assert.equal(sha256Fisier(path.join(RADACINA, 'motoare', 'comun', 'iconite', 'LICENSE-lucide.txt')), SHA_LICENTA);
});

test('catalogul are 1857 iconițe, printre ele cele folosite de exemple', () => {
  const iconite = incarcaIconite(RADACINA);
  assert.equal(iconite.size, 1857);
  for (const nume of ['phone', 'mail', 'calendar', 'message-circle', 'calendar-x', 'bell']) {
    assert.equal(existaIconita(RADACINA, nume), true, nume);
  }
  assert.equal(existaIconita(RADACINA, 'telefon'), false);
});

test('svgIconita scrie SVG-ul complet, cu stroke currentColor', () => {
  assert.equal(svgIconita(RADACINA, 'mail'),
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
    + ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
    + '<path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"/><rect x="2" y="4" width="20" height="16" rx="2"/></svg>');
  assert.throws(() => svgIconita(RADACINA, 'telefon'), /nu există în Lucide 1\.49\.0/);
});
