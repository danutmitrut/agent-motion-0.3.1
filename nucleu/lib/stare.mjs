// nucleu/.stare.json: rezultatul ultimei rulări mg doctor (harta 5.16). Doar module native.
import fs from 'node:fs';
import path from 'node:path';
import { scrieJsonAtomic } from './fisiere.mjs';

/**
 * @typedef {{ versiune: 1, scris_la: string, platforma: string, node: string, claude_code: string|null, ok: boolean,
 *   verificari: Array<import('./doctor/baza.mjs').RezultatDoctor>,
 *   canar: null | { scris_la: string, sha256: string, confirmat: boolean, confirmat_la: string|null },
 *   versiuni_sha256: string }} Stare
 */

/** @param {string} radacina */
function caleStare(radacina) {
  return path.join(radacina, 'nucleu', '.stare.json');
}

/**
 * @param {string} radacina
 * @returns {Stare|null} null dacă fișierul lipsește, nu e JSON sau nu are versiune 1
 */
export function citesteStare(radacina) {
  let text;
  try {
    text = fs.readFileSync(caleStare(radacina), 'utf8');
  } catch {
    return null;
  }
  try {
    const stare = JSON.parse(text);
    if (!stare || typeof stare !== 'object' || stare.versiune !== 1 || !Array.isArray(stare.verificari)) return null;
    return stare;
  } catch {
    return null;
  }
}

/**
 * @param {string} radacina
 * @param {Stare} stare
 */
export function scrieStare(radacina, stare) {
  scrieJsonAtomic(caleStare(radacina), stare);
}
