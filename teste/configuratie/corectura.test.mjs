// Felia 2: corectura după predare e în flux (pasul 9), în CLAUDE.md și în TOOLS.md, iar fiecare șablon are lista de propuneri.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const citeste = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

test('FLUX.md trimite corectura după predare la CLAUDE.md, unde stau cele două încercări și propunerile', () => {
  assert.match(citeste('FLUX.md'), /^9\. Corectura după predare: CLAUDE\.md\.$/m);
  const claude = citeste('CLAUDE.md');
  const sectiune = claude.slice(claude.indexOf('## Corectura'));
  for (const s of ['--deschide', '--verifica', '--din-nou', 'a doua și ultima încercare', '--propuneri', 'nimic altceva']) assert.ok(sectiune.includes(s), s);
  assert.match(citeste('TOOLS.md'), /^\| `node nucleu\/mg\.mjs corectura <proiect>` \| .+ \| activă \|$/m);
});

test('fiecare șablon are propuneri.json valid și tabelul „Corectura după predare” în SABLON.md', () => {
  const sabloane = ['hyperframes', 'remotion'].flatMap((m) => fs.readdirSync(path.join(REPO, 'motoare', m, 'sabloane')).map((n) => path.join('motoare', m, 'sabloane', n)));
  assert.ok(sabloane.length >= 4);
  for (const dir of sabloane) {
    const p = JSON.parse(citeste(path.join(dir, 'propuneri.json')));
    assert.equal(p.versiune, 1, dir);
    assert.ok(p.propuneri.length >= 3, dir);
    for (const x of p.propuneri) {
      assert.ok(typeof x.cerere === 'string' && typeof x.camp === 'string' && Array.isArray(x.variante) && x.variante.length >= 1, `${dir}: ${JSON.stringify(x)}`);
    }
    assert.match(citeste(path.join(dir, 'SABLON.md')), /^### Corectura după predare$/m, dir);
  }
});
