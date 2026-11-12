// Agregarea rezultatelor verificărilor și scrierea lui verificare.json (spec 6.11, harta 4.15 și 5.14).
import { scrieJsonAtomic } from '../fisiere.mjs';
import { ESTE_COD_VERIFICARE, verificareaErorii } from '../erori.mjs';
import { rotunjeste } from '../cronologie.mjs';

/**
 * Forma comună a unui rezultat de verificare (harta 5.14), plus avertismentele lui.
 * @param {string} cod 'C01'..'C17' sau 'S01'..'S99'
 * @param {boolean} ok
 * @param {{valoare?: unknown, prag?: unknown, camp?: string|null, erori?: object[], avertismente?: object[]}} [detalii]
 * @returns {{cod: string, ok: boolean, valoare: unknown, prag: unknown, camp: string|null, erori: object[], avertismente: object[]}}
 */
export function rezultat(cod, ok, { valoare = null, prag = null, camp = null, erori = [], avertismente = [] } = {}) {
  if (typeof cod !== 'string' || !ESTE_COD_VERIFICARE.test(cod)) {
    throw new TypeError(`Cod de verificare invalid: ${cod}.`);
  }
  return { cod, ok: Boolean(ok), valoare, prag, camp, erori, avertismente };
}

/**
 * Scrie video/<proiect>/verificare.json, atomic.
 * @param {{verificare: string}} caiProiect CaiProiect (harta 5.1)
 * @param {object} continut Verificare (harta 5.14)
 */
export function scrieVerificare(caiProiect, continut) {
  scrieJsonAtomic(caiProiect.verificare, continut);
}

/**
 * Codurile pe care șablonul le declară obligatorii (frontmatter-ul SABLON.md, câmpul verificari).
 * @param {{meta: {verificari?: string[]}}} sablon SablonIncarcat
 * @returns {string[]}
 */
export function obligatoriiPentru(sablon) {
  return [...(sablon.meta?.verificari ?? [])];
}

/**
 * Lista fără dubluri (aceeași eroare sau același avertisment adunat din două straturi), în ordinea primei apariții.
 * @template T
 * @param {T[]} lista
 * @returns {T[]}
 */
export function unice(lista) {
  const vazute = new Set();
  return lista.filter((e) => {
    const cheie = JSON.stringify(e);
    if (vazute.has(cheie)) return false;
    vazute.add(cheie);
    return true;
  });
}

/**
 * Secundele cu virgulă zecimală și cel puțin o zecimală, ca în harta 5.11: 0 → '0,0', 2.15 → '2,15'.
 * Diferă de formatarea din tabelCronologie (cronologie.mjs), unde 0 rămâne '0'; de aceea are alt nume.
 * @param {number} x
 * @returns {string}
 */
export function secundeCuZecimala(x) {
  const s = String(rotunjeste(x, 3));
  return (s.includes('.') ? s : `${s}.0`).replace('.', ',');
}

/**
 * Locul unic al mapării cod de eroare → verificare: erorile și avertismentele grupate după verificareaErorii (câmpul erorii, apoi CODURI).
 * Codurile fără verificare (de exemplu cronologie-invalida) rămân pe dinafară.
 * @param {object[]} erori
 * @param {object[]} avertismente
 * @returns {Map<string, {erori: object[], avertismente: object[]}>} cheia e codul verificării ('C03', 'S01', ...)
 */
export function grupeazaPeVerificari(erori, avertismente) {
  const grupuri = new Map();
  const grup = (cod) => {
    if (!grupuri.has(cod)) grupuri.set(cod, { erori: [], avertismente: [] });
    return grupuri.get(cod);
  };
  for (const e of erori) {
    const v = verificareaErorii(e);
    if (v) grup(v).erori.push(e);
  }
  for (const a of avertismente) {
    const v = verificareaErorii(a);
    if (v) grup(v).avertismente.push(a);
  }
  return grupuri;
}
