// Rescrie nucleu/VERSIUNI.json: integritatea kitului, sha256-ul lui nucleu/package-lock.json și pe al lockfile-ului fiecărui motor din VERSIUNI.motoare.
// Se rulează după `git add` și înainte de commit, la orice schimbare în nucleu/, motoare/, biblioteci/ sau .claude/.
// Rulare: node unelte/versiuni/actualizeaza-hashuri.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scrieJsonAtomic, sha256Fisier, existaFisier } from '../../nucleu/lib/fisiere.mjs';
import { citesteVersiuni, calculeazaIntegritate } from '../../nucleu/lib/versiuni.mjs';

const RADACINA = fileURLToPath(new URL('../../', import.meta.url));
const CALE_VERSIUNI = 'nucleu/VERSIUNI.json';

function shaSauNull(relativ) {
  const cale = path.join(RADACINA, ...relativ.split('/'));
  return existaFisier(cale) ? sha256Fisier(cale) : null;
}

const versiuni = citesteVersiuni(RADACINA);
versiuni.nucleu.lockfile_sha256 = shaSauNull('nucleu/package-lock.json');
for (const motor of Object.keys(versiuni.motoare)) {
  versiuni.motoare[motor].lockfile_sha256 = shaSauNull(`motoare/${motor}/package-lock.json`);
}
versiuni.integritate = calculeazaIntegritate(RADACINA);
scrieJsonAtomic(path.join(RADACINA, CALE_VERSIUNI), versiuni);
console.log(`${CALE_VERSIUNI}: ${Object.keys(versiuni.integritate).length} fișiere în integritate.`);
