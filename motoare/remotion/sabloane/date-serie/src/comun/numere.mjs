// Formatarea românească a numerelor (spec 7.3, „Fix în cod”): scrisă de mână, fără API-urile Intl, care depind
// de limba sistemului (1,248 pe un Windows în engleză). Modul ESM pur, fără importuri: îl folosesc mg
// (reguli.mjs, asezare.mjs, bloc.mjs) și compoziția React (numărătoarea), deci același text în ambele.

/**
 * @param {number} x
 * @param {number} [zecimale] 0, 1 sau 2
 * @returns {string} 1.248; 3,5; 21.300; -1.200
 */
export function formatRo(x, zecimale = 0) {
  const [intreg, fractie] = Math.abs(x).toFixed(zecimale).split('.');
  const grupat = intreg.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const negativ = x < 0 && Number(Math.abs(x).toFixed(zecimale)) !== 0;
  return (negativ ? '-' : '') + grupat + (fractie ? `,${fractie}` : '');
}

/**
 * Textul unei valori exact cum apare pe ecran: prefixul, numărul formatat, sufixul.
 * @param {{valoare: number, zecimale?: number, prefix?: string, sufix?: string}} v
 */
export function textValoare({ valoare, zecimale = 0, prefix = '', sufix = '' }) {
  return `${prefix}${formatRo(valoare, zecimale)}${sufix}`;
}

/**
 * Cele mai puține zecimale (0, 1 sau 2) cu care valoarea se scrie exact; null când îi trebuie mai mult de 2.
 * @param {number} x
 * @returns {0|1|2|null}
 */
export function zecimaleNecesare(x) {
  for (const n of [0, 1, 2]) if (Number(x.toFixed(n)) === x) return n;
  return null;
}
