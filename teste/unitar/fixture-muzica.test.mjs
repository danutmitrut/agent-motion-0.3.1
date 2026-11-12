// Muzica de test (planul F, F2): un singur fișier comis, cu proveniența și suma lui.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { radacinaAgent } from '../../nucleu/lib/cai.mjs';
import { sha256Fisier } from '../../nucleu/lib/fisiere.mjs';

const DIR = path.join(radacinaAgent(import.meta.url, 2), 'teste', 'fixtures', 'muzica');

test('exemplu-muzica.mp3 are sha256-ul din PROVENIENTA.txt și e sub 256 KB', () => {
  const provenienta = fs.readFileSync(path.join(DIR, 'PROVENIENTA.txt'), 'utf8');
  const m = /^sha256: ([0-9a-f]{64})$/m.exec(provenienta);
  assert.ok(m, 'PROVENIENTA.txt nu are rândul „sha256: <64 hex>”');
  const cale = path.join(DIR, 'exemplu-muzica.mp3');
  assert.equal(sha256Fisier(cale), m[1]);
  assert.ok(fs.statSync(cale).size < 256 * 1024);
  assert.match(provenienta, /^comanda: .*aevalsrc=/m);
  assert.match(provenienta, /^licenta: CC0/m);
});
