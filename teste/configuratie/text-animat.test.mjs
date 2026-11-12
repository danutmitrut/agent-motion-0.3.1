// Agentul află de text-animat din FLUX.md (tabelul „Alegerea”), din TOOLS.md și din rubrica 2 a reelului (planul G, G11).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { numaraCuvinte } from '../ajutoare/configuratie.mjs';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const citeste = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

test('FLUX.md: tabelul „Alegerea” are rândul text-animat, iar fluxul rămâne sub 250 de cuvinte', () => {
  const flux = citeste('FLUX.md');
  const alegerea = flux.split('\n## Alegerea\n')[1].split('\n## ')[0];
  assert.match(alegerea, /^\| doar text, vertical sau pătrat, 5-60 s \| `text-animat` \|$/m);
  assert.match(alegerea, /^\| poveste desenată, verticală, maximum 60 s \| `reel-ilustrat` \|$/m);
  assert.match(flux.split('\n').find((l) => l.startsWith('4. ')), /la reel aleg desenele/);
  assert.ok(numaraCuvinte(flux) <= 250, `FLUX.md are ${numaraCuvinte(flux)} de cuvinte`);
});

test('TOOLS.md: mg nou cu --sablon text-animat', () => {
  assert.match(citeste('TOOLS.md'), /^\| `node nucleu\/mg\.mjs nou <proiect> --sablon text-animat` \| .+ \| activă \|$/m);
});

test('reel-ilustrat/SABLON.md, rubrica 2: cererea doar cu text merge la text-animat', () => {
  const rubrica = citeste('motoare/hyperframes/sabloane/reel-ilustrat/SABLON.md').split('\n## 2. ')[1].split('\n## ')[0];
  assert.match(rubrica, /^\| Doar text \(mesaje, liste, citate, cifre\), vertical sau pătrat \| `text-animat`/m);
  assert.doesNotMatch(rubrica, /serie de numere, doar text/);
});
