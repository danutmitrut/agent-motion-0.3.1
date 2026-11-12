// Chitanța canarului (D1, partea gărzii): când garda refuză o comandă de terminal care țintește nucleu/.canar,
// lasă un rând în nucleu/.canar-refuzuri, cu unealta, sha256-ul canarului curent și momentul.
// Doctorul compară chitanțele cu canarul; garda doar le scrie. Doar module native.
import fs from 'node:fs';
import path from 'node:path';
import { scrieTextAtomic, sha256Fisier } from '../fisiere.mjs';

export const CALE_CANAR = 'nucleu/.canar';
export const CALE_CHITANTE_CANAR = 'nucleu/.canar-refuzuri';

const TINTA_CANAR = /(^|[^a-z0-9_.-])nucleu\/+\.canar(?![a-z0-9_.-])/;
const CANAR_SINGUR = /(^|[\s'"=(;&|]|\.\/)\.canar(?![a-z0-9_.-])/;
const POMENESTE_NUCLEU = /(^|[^a-z0-9_.-])nucleu([\s/'";&|)]|$)/;

/**
 * Comanda pomenește canarul: nucleu/.canar (cu / sau \, orice majuscule), sau .canar singur într-o comandă
 * care pomenește și folderul nucleu (de exemplu cd nucleu && rm .canar).
 * @param {string} comanda
 * @returns {boolean}
 */
export function comandaTintesteCanar(comanda) {
  if (typeof comanda !== 'string') return false;
  const text = comanda.replace(/\\/g, '/').toLowerCase();
  if (TINTA_CANAR.test(text)) return true;
  return CANAR_SINGUR.test(text) && POMENESTE_NUCLEU.test(text);
}

/**
 * Adaugă o chitanță. Scrie doar dacă nucleu/.canar există (fără canar nu e nimic de dovedit).
 * Nu aruncă niciodată: o eroare la scriere nu are voie să schimbe decizia gărzii.
 * @param {string} radacina
 * @param {string} unealta
 * @param {Date} [acum]
 * @returns {boolean} true dacă a scris chitanța
 */
export function scrieChitantaCanar(radacina, unealta, acum = new Date()) {
  try {
    const canar = path.join(radacina, ...CALE_CANAR.split('/'));
    if (!fs.statSync(canar).isFile()) return false;
    const rand = JSON.stringify({ unealta: String(unealta), sha256: sha256Fisier(canar), la: acum.toISOString() });
    const cale = path.join(radacina, ...CALE_CHITANTE_CANAR.split('/'));
    let vechi = '';
    try {
      vechi = fs.readFileSync(cale, 'utf8');
    } catch (e) {
      if (e?.code !== 'ENOENT') return false;
    }
    if (vechi !== '' && !vechi.endsWith('\n')) vechi += '\n';
    scrieTextAtomic(cale, `${vechi}${rand}\n`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Chitanțele valide, în ordinea scrierii; rândurile stricate se sar.
 * @param {string} radacina
 * @returns {{unealta: string, sha256: string, la: string}[]}
 */
export function citesteChitanteCanar(radacina) {
  let text;
  try {
    text = fs.readFileSync(path.join(radacina, ...CALE_CHITANTE_CANAR.split('/')), 'utf8');
  } catch {
    return [];
  }
  const rezultat = [];
  for (const linie of text.split('\n')) {
    if (linie.trim() === '') continue;
    try {
      const o = JSON.parse(linie);
      if (o && typeof o.unealta === 'string' && typeof o.sha256 === 'string' && typeof o.la === 'string') {
        rezultat.push({ unealta: o.unealta, sha256: o.sha256, la: o.la });
      }
    } catch {
      // rând stricat
    }
  }
  return rezultat;
}
