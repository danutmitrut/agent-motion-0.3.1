// C05: schema reelului, mg desen și textele nu mai cunosc traseele lc- și familia linie.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TIPARE_ONE_LINE } from '../ajutoare/one-line.mjs';

const RADACINA = fileURLToPath(new URL('../../', import.meta.url));
const FISIERE = [
  'motoare/hyperframes/sabloane/reel-ilustrat/schema.json',
  'nucleu/mg.mjs',
  'docs/interfete/erori.md',
  ...readdirSync(join(RADACINA, 'nucleu/lib/desen')).filter((f) => f.endsWith('.mjs')).map((f) => `nucleu/lib/desen/${f}`),
];

test('schema, mg desen și erori.md nu conțin lc- sau „linie continu”', () => {
  for (const f of FISIERE) {
    // arata.mjs păstrează motorul de traseu inactiv (D2); celelalte fișiere sunt curate
    if (f.endsWith('/arata.mjs')) continue;
    const text = readFileSync(join(RADACINA, f), 'utf8');
    for (const [rx, nume] of TIPARE_ONE_LINE) assert.doesNotMatch(text, rx, `${f}: ${nume}`);
  }
});
