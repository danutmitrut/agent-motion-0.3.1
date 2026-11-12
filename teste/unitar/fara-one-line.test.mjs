// C12: kitul nu mai vorbește de desene one-line (traseele lc- și familia linie) și nici de filmul 05.
// Citește fișierele urmărite de git, deci un fișier nou apare în pază după `git add`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TIPARE_ONE_LINE } from '../ajutoare/one-line.mjs';

const RADACINA = fileURLToPath(new URL('../../', import.meta.url));
const URMARITE = execFileSync('git', ['ls-files', '-z'], { cwd: RADACINA, encoding: 'utf8', maxBuffer: 1 << 28 })
  .split('\0')
  .filter(Boolean);

const TEXT = /\.(json|js|mjs|cjs|html|css|md|svg|txt|yml|yaml|py|toml)$/i;
const ESTE_TEXT = (f) => TEXT.test(f) || ['CLAUDE.md', 'FLUX.md', 'TOOLS.md', 'INSTALARE.md'].includes(f);

const IN_LIVRARE = (f) => (
  /^(nucleu|biblioteci|\.claude|docs\/interfete)\//.test(f)
  || (f.startsWith('motoare/') && !f.startsWith('motoare/hyperframes/referinta/') && !f.includes('node_modules/'))
  || ['CLAUDE.md', 'FLUX.md', 'TOOLS.md', 'INSTALARE.md'].includes(f)
);
// Pentru tiparul filmului 05 intră și teste/ și .github/ (fără testul de pază însuși, vezi mai jos).
const PENTRU_FILM05 = (f) => IN_LIVRARE(f) || f.startsWith('teste/') || f.startsWith('.github/');

const TIPARE_LIVRARE = TIPARE_ONE_LINE;
const FILM05 = /film ?05|filmul(ui)? 05/i;

// Excepții (cale: motiv). Lista e goală și rămâne goală; un text necesar se rezolvă în sursă.
const EXCEPTII = {};
// Testul de pază nu se caută pe el însuși (are tiparele scrise în el).
const EXCLUSE_DIN_PAZA = new Set(['teste/unitar/fara-one-line.test.mjs']);

const CITITE = new Map();

function gaseste() {
  const gasite = [];
  for (const f of URMARITE) {
    if (!ESTE_TEXT(f) || EXCLUSE_DIN_PAZA.has(f) || EXCEPTII[f]) continue;
    const livrare = IN_LIVRARE(f);
    if (!livrare && !PENTRU_FILM05(f)) continue;
    const text = readFileSync(join(RADACINA, f), 'utf8'); // o eroare de citire pică testul, nu se înghite
    CITITE.set(f, text.length);
    if (livrare) for (const [rx, nume] of TIPARE_LIVRARE) if (rx.test(text)) gasite.push(`${f}: ${nume}`);
    if (FILM05.test(text)) gasite.push(`${f}: trimitere la filmul 05`);
  }
  return gasite;
}

test('fără desene one-line (lc-, „linie continuă” în orice formă, „one-line”) în livrare și fără trimiteri la filmul 05', () => {
  assert.deepEqual(gaseste(), []);
});

test('paza chiar citește fișierele (nu trece pe gol)', () => {
  gaseste();
  const sablon = 'motoare/hyperframes/sabloane/reel-ilustrat/SABLON.md';
  assert.ok(CITITE.get(sablon) > 5000, 'SABLON.md nu a fost citit sau e prea scurt');
  assert.ok(CITITE.size > 50, `s-au citit doar ${CITITE.size} fișiere`);
});
