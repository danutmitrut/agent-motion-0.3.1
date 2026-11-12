// Testul canar al gărzii (spec 5.4, cu decizia D1). Doar module native.
// Write și Edit pe nucleu/.canar le refuză permissions.deny înainte să pornească hook-ul, deci nu dovedesc că garda
// rulează. Dovada e o scriere prin terminal pe care deny nu o vede: garda o refuză și lasă o chitanță în
// nucleu/.canar-refuzuri (lib/garda/canar.mjs), iar confirmarea cere chitanța pentru canarul curent.
import crypto from 'node:crypto';
import path from 'node:path';
import { eroare } from '../erori.mjs';
import { scrieTextAtomic, sha256Text, sha256Fisier, existaFisier } from '../fisiere.mjs';
import { CALE_CANAR, citesteChitanteCanar } from '../garda/canar.mjs';

const SUGESTIE_ESUAT = 'Nu lucra la videouri: garda nu funcționează. Trimite-i lui Dănuț fișierul nucleu/.stare.json, apoi rulează din nou node nucleu/mg.mjs doctor după ce primești răspuns.';
const UNELTE_TERMINAL = new Set(['Bash', 'PowerShell']);

/** Scrierea prin terminal din testul canar: aceeași pe Bash și pe PowerShell (fără $, fără ghilimele duble în cod). */
export const COMANDA_TERMINAL_CANAR = `node -e "require('fs').appendFileSync('nucleu/.canar','x')"`;

export const INSTRUCTIUNE_CANAR = [
  'Testul canar al gărzii, pentru agent:',
  '1. Citește nucleu/.canar (Read), apoi încearcă prin Claude Code un Write pe el (de exemplu, conținutul „test”) și un Edit pe același fișier. Amândouă trebuie refuzate; pe ele le refuză regula permissions.deny, nu garda.',
  `2. Rulează în terminal, din folderul agentului (Bash pe Mac, PowerShell pe Windows), exact așa: ${COMANDA_TERMINAL_CANAR}`,
  '   Comanda trebuie refuzată de gardă, cu motivul în română al gărzii; doar refuzul acesta dovedește că garda rulează. Dacă Claude Code îi cere cursantului permisiunea pentru comandă, spune-i să o aprobe o singură dată, fără varianta care ține minte aprobarea: o gardă funcțională refuză comanda înainte de dialog.',
  '3. Rulează: node nucleu/mg.mjs doctor --confirma-canar',
  'Dacă vreuna dintre scrieri trece sau refuzul comenzii nu vine cu motivul în română al gărzii, garda nu funcționează: spune-i cursantului și nu lucra la videouri. Nu căuta altă cale ca să ocolești refuzul.',
].join('\n');

/**
 * Scrie fișierul-țintă nucleu/.canar, cu un conținut nou la fiecare rulare.
 * @param {string} radacina
 * @param {Date} acum
 * @returns {{ cale: 'nucleu/.canar', sha256: string }}
 */
export function scrieCanar(radacina, acum) {
  const continut = `canar ${acum.toISOString()} ${crypto.randomBytes(16).toString('hex')}\n`;
  scrieTextAtomic(path.join(radacina, 'nucleu', '.canar'), continut);
  return { cale: CALE_CANAR, sha256: sha256Text(continut) };
}

/**
 * Verifică că nucleu/.canar a rămas exact cum l-a scris doctorul și că garda a refuzat cel puțin o scriere
 * prin terminal (Bash sau PowerShell) pe acest canar (chitanța cu același sha256).
 * @param {string} radacina
 * @param {import('../stare.mjs').Stare|null} stare
 * @returns {import('./baza.mjs').RezultatDoctor}
 */
export function confirmaCanar(radacina, stare) {
  const asteptat = stare?.canar?.sha256;
  if (!asteptat) {
    return {
      id: 'canar', ok: false, nivel: 'eroare', valoare: null,
      eroare: eroare('canar-nefacut', 'mediu.canar',
        'Testul canar nu a fost pornit: nucleu/.stare.json nu are un canar scris.',
        'Rulează întâi node nucleu/mg.mjs doctor (fără --ci), încearcă scrierea de test cerută în nucleu/.canar, apoi node nucleu/mg.mjs doctor --confirma-canar.'),
    };
  }
  const fisier = path.join(radacina, 'nucleu', '.canar');
  if (!existaFisier(fisier)) {
    return {
      id: 'canar', ok: false, nivel: 'eroare', valoare: 'lipsă',
      eroare: eroare('canar-esuat', 'mediu.canar', 'nucleu/.canar a dispărut: o ștergere a trecut de gardă.', SUGESTIE_ESUAT),
    };
  }
  if (sha256Fisier(fisier) !== asteptat) {
    return {
      id: 'canar', ok: false, nivel: 'eroare', valoare: 'modificat',
      eroare: eroare('canar-esuat', 'mediu.canar', 'nucleu/.canar a fost modificat: scrierea interzisă a trecut de gardă.', SUGESTIE_ESUAT),
    };
  }
  const chitanta = citesteChitanteCanar(radacina).some((c) => UNELTE_TERMINAL.has(c.unealta) && c.sha256 === asteptat);
  if (!chitanta) {
    return {
      id: 'canar', ok: false, nivel: 'eroare', valoare: 'fără chitanță',
      eroare: eroare('canar-nefacut', 'mediu.canar',
        'Canarul e neatins, dar garda nu a raportat niciun refuz pentru scrierea prin terminal în nucleu/.canar (nucleu/.canar-refuzuri nu are o chitanță Bash sau PowerShell pentru canarul curent).',
        `Încearcă în terminal scrierea din testul canar, ${COMANDA_TERMINAL_CANAR}, apoi rulează din nou node nucleu/mg.mjs doctor --confirma-canar. Dacă Claude Code cere permisiunea pentru comandă, aprob-o o singură dată. Dacă eroarea rămâne după o încercare refuzată, nu lucra la videouri și trimite-i lui Dănuț fișierul nucleu/.stare.json.`),
    };
  }
  return { id: 'canar', ok: true, nivel: 'ok', valoare: 'neatins', eroare: null };
}
