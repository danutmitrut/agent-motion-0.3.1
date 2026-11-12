import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALE_CURSANTULUI, extrageImporturi, numaraCuvinte } from '../ajutoare/configuratie.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PRAG_FLUX = 250; // T4
const PRAG_TOTAL = 1500; // T4

function citeste(rel) {
  // Bugetul T4 se măsoară pe kit: pentru fișierele cursantului se numără mereu exemplele (A14).
  const cale = ALE_CURSANTULUI[rel] ?? rel;
  return fs.readFileSync(path.join(REPO, cale), 'utf8');
}

test(`FLUX.md are cel mult ${PRAG_FLUX} de cuvinte`, () => {
  const n = numaraCuvinte(citeste('FLUX.md'));
  assert.ok(n <= PRAG_FLUX, `FLUX.md are ${n} cuvinte (prag ${PRAG_FLUX})`);
});

test(`CLAUDE.md și tot ce importă au cel mult ${PRAG_TOTAL} de cuvinte`, () => {
  const claude = citeste('CLAUDE.md');
  let total = numaraCuvinte(claude);
  const detalii = [`CLAUDE.md: ${total}`];
  for (const imp of extrageImporturi(claude)) {
    const n = numaraCuvinte(citeste(imp));
    detalii.push(`${imp}: ${n}`);
    total += n;
  }
  assert.ok(total <= PRAG_TOTAL, `total ${total} (prag ${PRAG_TOTAL}); ${detalii.join(', ')}`);
});

test('numaraCuvinte ignoră semnele Markdown', () => {
  assert.equal(numaraCuvinte('# Titlu\n\n| a | b |\n| --- | --- |\n- unu, doi'), 5);
});
