// Formatarea românească a cifrelor (spec 7.2): scrisă de mână, niciodată toLocaleString, care depinde de limba sistemului
// (1,250 pe un Windows în engleză). Copia identică din lib/miscari.js (formatRo) e verificată de teste/cifre.test.mjs.

/**
 * @param {number} x ≥ 0
 * @param {number} [zecimale] 0, 1 sau 2
 * @returns {string} 1.250.000; 3,5; 62
 */
export function formatRo(x, zecimale = 0) {
  const [intreg, fractie] = Math.abs(x).toFixed(zecimale).split('.');
  const grupat = intreg.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (x < 0 ? '-' : '') + grupat + (fractie ? `,${fractie}` : '');
}

/**
 * Textul final al unei scene cifra, exact cum stă static în build (S05): prefixul, valoarea, sufixul.
 * @param {{valoare: number, zecimale?: number, prefix?: string, sufix?: string}} scena
 * @returns {string}
 */
export function textCifra(scena) {
  return `${scena.prefix ?? ''}${formatRo(scena.valoare, scena.zecimale ?? 0)}${scena.sufix ?? ''}`;
}

/**
 * Valoarea unei cifre prea late, rescrisă în milioane sau în mii (de exemplu 1.250.000 → 1,25 mil.), pentru sugestia
 * erorii de lățime. Sub 1.000 nu are ce comprima.
 * @param {{valoare: number}} scena
 * @returns {{valoare: number, zecimale: number, sufix: string}|null}
 */
export function inMilioaneSauMii(scena) {
  const [imparte, sufix] = scena.valoare >= 1e6 ? [1e6, ' mil.'] : scena.valoare >= 1e3 ? [1e3, ' mii'] : [null, null];
  if (imparte === null) return null;
  const x = Math.round((scena.valoare / imparte) * 100) / 100;
  const zecimale = [0, 1, 2].find((z) => Math.abs(x * 10 ** z - Math.round(x * 10 ** z)) < 1e-9) ?? 2;
  return { valoare: x, zecimale, sufix };
}
