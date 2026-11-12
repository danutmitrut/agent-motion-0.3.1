// Ajutor comun de test (harta 8.2): o rădăcină de agent temporară, într-o cale cu spațiu și diacritice.
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RADACINA_REPO = fileURLToPath(new URL('../../', import.meta.url));

/**
 * Creează o rădăcină temporară de agent.
 * - copiaza: căi relative din repo, copiate recursiv (fără symlinkuri, fără foldere node_modules și .git;
 *   testele importă modulele din repo, nu din rădăcina temporară);
 * - fisiere: {cale relativă: conținut string sau Buffer}, scrise după copiere;
 * - sablonProba: copiază teste/fixtures/sabloane/proba în motoare/hyperframes/sabloane/proba;
 * - sablonProbaElemente: copiază teste/fixtures/sabloane/proba-elemente în motoare/hyperframes/sabloane/proba-elemente;
 * - sablonProbaFilmare: copiază teste/fixtures/sabloane/proba-filmare în motoare/hyperframes/sabloane/proba-filmare (intrare: filmare, H05);
 *   cu oricare dintre ele se copiază și motoare/comun/teme și motoare/comun/fonturi (pregătirea completă le citește);
 * - biblioteciMini: copiază teste/fixtures/biblioteci-mini/biblioteci în biblioteci/.
 * @param {{copiaza?: string[], fisiere?: Record<string, string|Buffer>, sablonProba?: boolean, sablonProbaElemente?: boolean, sablonProbaFilmare?: boolean, biblioteciMini?: boolean}} [optiuni]
 * @returns {{radacina: string, curata: () => void}}
 */
export function creeazaRadacinaTemp({ copiaza = [], fisiere = {}, sablonProba = false, sablonProbaElemente = false, sablonProbaFilmare = false, biblioteciMini = false } = {}) {
  const radacina = mkdtempSync(join(tmpdir(), 'mg test Ăîș '));
  const curata = () => rmSync(radacina, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  try {
    const copiazaDinRepo = (sursaRelativa, destinatieRelativa) => {
      if (isAbsolute(sursaRelativa) || sursaRelativa.split(/[\\/]/).includes('..')) {
        throw new Error(`creeazaRadacinaTemp: calea trebuie să fie relativă la repo, fără „..”: ${sursaRelativa}`);
      }
      const sursa = join(RADACINA_REPO, sursaRelativa);
      if (!existsSync(sursa)) {
        throw new Error(`creeazaRadacinaTemp: nu există în repo: ${sursaRelativa}`);
      }
      cpSync(sursa, join(radacina, destinatieRelativa), {
        recursive: true,
        dereference: true,
        filter: (cale) => !['node_modules', '.git'].includes(basename(cale)),
      });
    };
    for (const cale of copiaza) copiazaDinRepo(cale, cale);
    if (sablonProba) copiazaDinRepo('teste/fixtures/sabloane/proba', 'motoare/hyperframes/sabloane/proba');
    if (sablonProbaElemente) copiazaDinRepo('teste/fixtures/sabloane/proba-elemente', 'motoare/hyperframes/sabloane/proba-elemente');
    if (sablonProbaFilmare) copiazaDinRepo('teste/fixtures/sabloane/proba-filmare', 'motoare/hyperframes/sabloane/proba-filmare');
    if (sablonProba || sablonProbaElemente || sablonProbaFilmare) {
      for (const d of ['motoare/comun/teme', 'motoare/comun/fonturi']) copiazaDinRepo(d, d);
    }
    if (biblioteciMini) copiazaDinRepo('teste/fixtures/biblioteci-mini/biblioteci', 'biblioteci');
    for (const [cale, continut] of Object.entries(fisiere)) {
      if (isAbsolute(cale) || cale.split(/[\\/]/).includes('..')) {
        throw new Error(`creeazaRadacinaTemp: calea trebuie să fie relativă, fără „..”: ${cale}`);
      }
      const tinta = join(radacina, cale);
      mkdirSync(dirname(tinta), { recursive: true });
      writeFileSync(tinta, continut);
    }
  } catch (e) {
    curata();
    throw e;
  }
  return { radacina, curata };
}
