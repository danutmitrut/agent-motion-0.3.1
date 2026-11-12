// Căile agentului: rădăcina, normalizarea și căile unui proiect.
// Modul doar nativ: importă numai module node:*.
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Rădăcina agentului, urcând din folderul fișierului care apelează.
 * @param {string} importMetaUrl import.meta.url al apelantului
 * @param {number} niveluriSus câte foldere se urcă (1 din nucleu/, 2 din nucleu/lib/)
 * @returns {string} cale absolută, în forma sistemului
 */
export function radacinaAgent(importMetaUrl, niveluriSus) {
  const dir = path.dirname(fileURLToPath(importMetaUrl));
  return path.resolve(dir, ...Array(niveluriSus).fill('..'));
}

/**
 * Paza „rulat direct”: modulul e scriptul pornit de Node, nu un import.
 * process.argv[1] păstrează legăturile (symlink, junction), iar import.meta.url e calea reală; de aceea se compară
 * întâi calea brută (și cu --preserve-symlinks-main), apoi cea rezolvată prin realpathSync.
 * @param {string} importMetaUrl import.meta.url al scriptului care întreabă
 * @returns {boolean}
 */
export function rulatDirect(importMetaUrl) {
  const a = process.argv[1];
  if (!a) return false;
  if (pathToFileURL(a).href === importMetaUrl) return true;
  try {
    return pathToFileURL(realpathSync(a)).href === importMetaUrl;
  } catch {
    return false;
  }
}

/**
 * Forma unică a unei căi pentru comparații și fișiere scrise:
 * '/' în loc de '\', litera de disc mică ('C:\x' și '/c/x' devin 'c:/x'),
 * '.' și '..' rezolvate, fără '/' final (cu excepția 'c:/' și '/').
 * @param {string} cale
 * @returns {string}
 */
export function normalizeazaCale(cale) {
  let c = String(cale).replace(/\\/g, '/');
  if (c === '') return '';
  let disc = '';
  const cuDisc = /^([A-Za-z]):(\/|$)/.exec(c);
  const msys = /^\/([A-Za-z])(\/|$)/.exec(c);
  if (cuDisc) {
    disc = cuDisc[1].toLowerCase() + ':';
    c = '/' + c.slice(cuDisc[0].length);
  } else if (msys) {
    disc = msys[1].toLowerCase() + ':';
    c = '/' + c.slice(msys[0].length);
  }
  let n = path.posix.normalize(c);
  if (n.length > 1 && n.endsWith('/')) n = n.slice(0, -1);
  if (disc) return disc + n;
  return n;
}

/**
 * Calea relativă la rădăcină, cu '/'; '' pentru rădăcina însăși; null dacă e în afara ei.
 * Pe căi cu literă de disc, comparația e insensibilă la majuscule.
 * @param {string} cale cale absolută
 * @param {string} radacina
 * @returns {string|null}
 */
export function relativaLaRadacina(cale, radacina) {
  const c = normalizeazaCale(cale);
  const r = normalizeazaCale(radacina);
  const insensibil = /^[a-z]:\//.test(r);
  const cc = insensibil ? c.toLowerCase() : c;
  const rr = insensibil ? r.toLowerCase() : r;
  if (cc === rr) return '';
  const prefix = rr.endsWith('/') ? rr : rr + '/';
  if (!cc.startsWith(prefix)) return null;
  return c.slice(prefix.length);
}

/**
 * Numele unui proiect: litere mici, cifre și '-', primul caracter literă sau cifră, cel mult 40.
 * @param {string} nume
 * @returns {boolean}
 */
export function esteNumeProiect(nume) {
  return typeof nume === 'string' && /^[a-z0-9][a-z0-9-]{0,39}$/.test(nume);
}

/**
 * @typedef {{ dir: string, date: string, scenariu: string, jurnal: string, cerereSablon: string,
 *   lock: string, verificare: string, mp4: string, resurse: string, active: string,
 *   build: string, cadre: string }} CaiProiect
 */

/**
 * Căile absolute ale unui proiect din video/<proiect>/.
 * @param {string} radacina
 * @param {string} proiect
 * @returns {CaiProiect}
 */
export function caiProiect(radacina, proiect) {
  const dir = path.join(radacina, 'video', proiect);
  return {
    dir,
    date: path.join(dir, 'date.json'),
    scenariu: path.join(dir, 'scenariu.md'),
    jurnal: path.join(dir, 'jurnal.md'),
    cerereSablon: path.join(dir, 'cerere-sablon.md'),
    lock: path.join(dir, 'motor.lock'),
    verificare: path.join(dir, 'verificare.json'),
    mp4: path.join(dir, `${proiect}.mp4`),
    resurse: path.join(dir, 'resurse'),
    active: path.join(dir, 'active'),
    build: path.join(dir, 'build'),
    cadre: path.join(dir, 'cadre'),
    cache: path.join(dir, '.cache'),
    // felia 2: momentul ultimului mesaj al cursantului, scris de hook-ul UserPromptSubmit (garda/aprobare.mjs)
    mesajCursant: path.join(dir, '.cache', 'mesaj-cursant.json'),
  };
}
