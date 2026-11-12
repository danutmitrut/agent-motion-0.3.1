// Verificările declarate și stadiile lor (planul E, M2 și D). `verificari` din frontmatter-ul SABLON.md e exact ce
// contează; fiecare cod are un stadiu: `date` (pe date, după pregătire), `build` (pe build/), `aprobare` (C08) sau `mp4`.
// Codurile C au stadiul fix (STADII_COMUNE); codurile S îl declară în `stadii:` (implicit `date`).
import { CODURI, ESTE_COD_VERIFICARE } from '../erori.mjs';

export const STADII = Object.freeze(['date', 'build', 'aprobare', 'mp4']);

export const STADII_COMUNE = Object.freeze({
  C01: 'date', C02: 'date', C03: 'date', C04: 'date', C05: 'date', C06: 'date', C07: 'date', C09: 'date',
  C10: 'build', C17: 'build',
  C08: 'aprobare',
  C11: 'mp4', C12: 'mp4', C13: 'mp4', C14: 'mp4', C15: 'mp4', C16: 'mp4',
});

/** Minimul obligatoriu al oricărui șablon (validat de incarcaSablon). */
export const VERIFICARI_MINIME = Object.freeze(['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08', 'C09', 'C10', 'C11', 'C16', 'C17']);

const STADII_APROBARE = Object.freeze(['date', 'build']);
const CHEI_REZULTAT = Object.freeze(['cod', 'ok', 'valoare', 'prag', 'camp', 'erori', 'avertismente']);

/**
 * @param {string} cod
 * @param {{meta: {stadii?: Record<string, string>}}} sablon
 * @returns {'date'|'build'|'aprobare'|'mp4'}
 */
export function stadiuVerificare(cod, sablon) {
  if (Object.hasOwn(STADII_COMUNE, cod)) return STADII_COMUNE[cod];
  return sablon.meta?.stadii?.[cod] ?? 'date';
}

/**
 * Codurile declarate de șablon cu stadiul în lista dată, în ordinea din frontmatter.
 * @param {{meta: {verificari?: string[]}}} sablon
 * @param {string[]} stadii
 * @returns {string[]}
 */
export function declarate(sablon, stadii) {
  return (sablon.meta?.verificari ?? []).filter((cod) => stadii.includes(stadiuVerificare(cod, sablon)));
}

/**
 * Doar rezultatele cu cod declarat (un C nedeclarat, de exemplu C15 la un șablon fără sunet, nu intră în verificare.json).
 * @param {object[]} rezultate
 * @param {{meta: {verificari?: string[]}}} sablon
 * @returns {object[]}
 */
export function pastreazaDeclarate(rezultate, sablon) {
  const coduri = new Set(sablon.meta?.verificari ?? []);
  return rezultate.filter((r) => coduri.has(r.cod));
}

/**
 * D: verde pentru aprobare = fiecare rezultat de stadiu `date` sau `build` trece și fiecare cod declarat al acestor
 * stadii are rezultat. MP4-ul și C08 nu contează aici.
 * @param {object[]} rezultate
 * @param {object} sablon
 * @returns {boolean}
 */
export function okPentruAprobare(rezultate, sablon) {
  const deAprobare = rezultate.filter((r) => STADII_APROBARE.includes(stadiuVerificare(r.cod, sablon)));
  return deAprobare.every((r) => r.ok === true)
    && declarate(sablon, STADII_APROBARE).every((cod) => deAprobare.some((r) => r.cod === cod));
}

const CHEI_EROARE = Object.freeze(['cod', 'camp', 'mesaj', 'sugestie']);
const esteSirNevid = (x) => typeof x === 'string' && x.trim() !== '';

/** Forma EroareMg (eroare() și avertisment() din nucleu/lib/erori.mjs): exact cod, camp, mesaj, sugestie, plus opțional verificare. */
function esteEroareMg(e) {
  if (e === null || typeof e !== 'object' || Array.isArray(e)) return false;
  const chei = Object.keys(e);
  const asteptate = Object.hasOwn(e, 'verificare') ? [...CHEI_EROARE, 'verificare'] : CHEI_EROARE;
  return chei.length === asteptate.length
    && asteptate.every((c) => Object.hasOwn(e, c))
    && typeof e.cod === 'string' && Object.hasOwn(CODURI, e.cod)
    && esteSirNevid(e.camp) && esteSirNevid(e.mesaj) && esteSirNevid(e.sugestie)
    && (!Object.hasOwn(e, 'verificare') || (typeof e.verificare === 'string' && ESTE_COD_VERIFICARE.test(e.verificare)));
}

/**
 * Validează strict ce întoarce un hook de verificări al șablonului (verificariBuild, verificariProprii).
 * Fiecare rezultat: exact cheile lui rezultat(), un cod S declarat cu stadiul hook-ului (codurile C le dă nucleul),
 * `ok === (erori.length === 0)`, iar fiecare element din `erori` și `avertismente` are forma EroareMg, cu `cod` din CODURI.
 * @param {unknown} rezultate
 * @param {object} sablon
 * @param {'build'|'mp4'} stadiu
 * @param {string} functie numele hook-ului, pentru mesaj
 * @returns {object[]} lista, neschimbată
 */
export function verificaRezultateProprii(rezultate, sablon, stadiu, functie) {
  const nume = `${functie} din șablonul ${sablon?.nume}`;
  if (!Array.isArray(rezultate)) throw new TypeError(`${nume} trebuie să întoarcă o listă de rezultate.`);
  const permise = new Set(declarate(sablon, [stadiu]));
  for (const [i, r] of rezultate.entries()) {
    const chei = r !== null && typeof r === 'object' && !Array.isArray(r) ? Object.keys(r) : null;
    const forma = chei !== null
      && chei.length === CHEI_REZULTAT.length
      && CHEI_REZULTAT.every((c) => Object.hasOwn(r, c))
      && typeof r.cod === 'string' && ESTE_COD_VERIFICARE.test(r.cod)
      && typeof r.ok === 'boolean'
      && Array.isArray(r.erori) && Array.isArray(r.avertismente);
    if (!forma) {
      throw new TypeError(`${nume}: rezultatul ${i} nu are forma {${CHEI_REZULTAT.join(', ')}}.`);
    }
    if (!r.cod.startsWith('S')) {
      throw new TypeError(`${nume}: rezultatul ${i} are codul comun ${r.cod}; un hook întoarce doar coduri S, pe cele C le dă nucleul.`);
    }
    if (!permise.has(r.cod)) {
      throw new TypeError(`${nume}: codul ${r.cod} nu e declarat în SABLON.md cu stadiul ${stadiu}.`);
    }
    if (r.ok !== (r.erori.length === 0)) {
      throw new TypeError(`${nume}: rezultatul ${r.cod} are ok: ${r.ok} cu ${r.erori.length} erori; ok e true exact când erori e goală.`);
    }
    for (const lista of ['erori', 'avertismente']) {
      const j = r[lista].findIndex((e) => !esteEroareMg(e));
      if (j !== -1) {
        throw new TypeError(`${nume}: ${lista}[${j}] din rezultatul ${r.cod} nu are forma EroareMg {cod, camp, mesaj, sugestie, verificare?}, cu un cod din nucleu/lib/erori.mjs.`);
      }
    }
  }
  return rezultate;
}
