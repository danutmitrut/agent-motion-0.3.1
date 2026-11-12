// Formatări mici de text pentru mesaje, fără dependențe (importabil din orice modul).

/**
 * Număr cu virgulă zecimală, fără toLocaleString (harta 5.11): 3.1 → '3,1'.
 * Singura copie: o importă contrast.mjs, cronologie.mjs și verificari/mp4.mjs (iar B17 la fel).
 * @param {number|string|null} x
 * @returns {string}
 */
export function numarRo(x) {
  return String(x).replace('.', ',');
}
