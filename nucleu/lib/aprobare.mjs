// C08: aprobarea scenariului, judecată pe zona „Texte și cifre” regenerată din date.json (spec 6.9, 6.11).
// Aprobarea o scrie hook-ul UserPromptSubmit (garda/aprobare.mjs); aici doar se verifică, la randarea completă (B16).
import { eroare } from './erori.mjs';
import { hashZonaTexte, TITLU_TEXTE } from './scenariu.mjs';
import { rezultat } from './verificari/index.mjs';

/**
 * @param {object} lock motor.lock al proiectului (harta 5.3)
 * @param {string|null} blocCurent blocul „Ce apare pe ecran” regenerat acum, cu marcaje
 * @returns {{cod: 'C08', ok: boolean, valoare: unknown, prag: unknown, camp: string|null, erori: object[], avertismente: object[]}}
 */
export function verificaAprobare(lock, blocCurent) {
  const proiect = lock?.proiect ?? '<proiect>';
  const aprobare = lock?.aprobare ?? null;
  if (!aprobare || typeof aprobare.sha256_texte !== 'string') {
    return rezultat('C08', false, {
      camp: 'scenariu.md',
      erori: [
        eroare(
          'aprobare-lipsa',
          'scenariu.md',
          `Scenariul proiectului ${proiect} nu a fost aprobat încă; randarea completă cere aprobarea.`,
          `Rulează node nucleu/mg.mjs randeaza ${proiect} --doar-verificare, arată-i cursantului scenariul și așteaptă mesajul „aprob ${proiect}”.`,
        ),
      ],
    });
  }
  const curent = typeof blocCurent === 'string' && blocCurent.includes(TITLU_TEXTE) ? hashZonaTexte(blocCurent) : null;
  const valoare = { sha256_texte: curent, aprobat_la: aprobare.aprobat_la ?? null };
  const prag = { sha256_texte: aprobare.sha256_texte };
  if (curent === aprobare.sha256_texte) return rezultat('C08', true, { valoare, prag });
  return rezultat('C08', false, {
    valoare,
    prag,
    camp: 'scenariu.md',
    erori: [
      eroare(
        'aprobare-invalida',
        'scenariu.md',
        `Textele sau cifrele din „Ce apare pe ecran” s-au schimbat după aprobarea din ${aprobare.aprobat_la ?? 'motor.lock'}.`,
        `Arată-i cursantului zona „Texte și cifre” din scenariu.md și așteaptă o aprobare nouă („aprob ${proiect}”).`,
      ),
    ],
  });
}
