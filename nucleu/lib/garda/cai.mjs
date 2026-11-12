// Clasificarea unei căi față de rădăcina agentului: kit, generat, scenariu, configurație, liber, în afară. Doar module native.
import fs from 'node:fs';
import path from 'node:path';
import { normalizeazaCale, relativaLaRadacina } from '../cai.mjs';

/** @typedef {'kit'|'generat'|'scenariu'|'configuratie'|'liber'|'in-afara'} Zona */

const TIPAR_KIT = /^(motoare|nucleu|biblioteci|\.git)(\/|$)/;
const TIPARE_GENERAT = [
  [/^video\/[^/]+\/(build|active|cadre|serie|corecturi|\.cache)(\/|$)/, 'folderele build/, active/, cadre/, serie/, corecturi/ și .cache/ ale unui proiect le scrie doar mg'],
  [/^video\/[^/]+\/verificare\.json$/, 'verificare.json îl scrie doar mg randeaza'],
  [/^video\/[^/]+\/motor\.lock$/, 'motor.lock îl scriu doar mg și hook-ul de aprobare'],
  [/^video\/.+\.mp4$/, 'videourile MP4 le produce doar mg randeaza'],
  [/(^|\/)revizie(-schita)?-\d+\.md$/, 'verdictul revizorului îl scrie doar garda, din hook-ul SubagentStop'],
];
const TIPAR_SCENARIU = /^video\/[^/]+\/scenariu\.md$/;
// A-Î3: configurația lui Claude Code o editează doar cursantul; agentul nu o scrie (citirea rămâne permisă).
const TIPAR_CONFIGURATIE = /^\.claude\/(settings(\.local)?\.json|agents(\/.*)?)$/;
const MOTIV_CONFIGURATIE = '.claude/settings.json, .claude/settings.local.json și .claude/agents/ sunt configurația lui Claude Code; le modifică doar cursantul, cu mâna lui';
// Tiparele de mai jos caută oriunde într-un text (cod în linie, here-doc) aceleași zone ca tiparele de mai sus.
// Se schimbă împreună cu ele; garda-paritate.test.mjs le compară.
export const TIPARE_TEXT_PROTEJAT = Object.freeze([
  /(^|[^a-z0-9_.-])(motoare|nucleu|biblioteci)(\/|$|['"\s)])/,
  /video\/[^/'"\s]+\/(build|active|cadre|serie|corecturi|\.cache)(\/|$|['"\s)])/,
  /video\/[^/'"\s]+\/(verificare\.json|motor\.lock)/,
  /video\/[^'"\s]*\.mp4/,
  /revizie(-schita)?-\d+\.md/,
  /video\/[^/'"\s]+\/scenariu\.md/,
  /\.claude\/(settings(\.local)?\.json|agents(\/|$|['"\s)]))/,
]);

/**
 * Pe Windows, „nucleu.” și „nucleu ” duc în „nucleu”, iar „mg.mjs::$DATA” e tot „mg.mjs”.
 * Segmentele se curăță la fel peste tot (pe Mac, efectul e doar o protecție în plus).
 * @param {string} relativ
 */
function curataSegmente(relativ) {
  return relativ
    .split('/')
    .map((s) => s.replace(/:.*$/, '').replace(/[. ]+$/, ''))
    .filter((s) => s !== '')
    .join('/');
}

/**
 * @param {string} cale absolută (Write și Edit o dau mereu absolută) sau relativă la radacina
 * @param {string} radacina
 * @returns {{ zona: Zona, relativ: string|null, motiv: string }}
 */
export function clasificaCale(cale, radacina) {
  if (typeof cale !== 'string' || typeof radacina !== 'string') throw new TypeError('clasificaCale cere două șiruri');
  const faraPrefix = cale.replace(/^[\\/]{2}[?.][\\/]/, '');
  const absoluta = /^[\\/]/.test(faraPrefix) || /^[a-zA-Z]:/.test(faraPrefix)
    ? faraPrefix
    : `${radacina.replace(/[\\/]+$/, '')}/${faraPrefix}`;
  let relativ = relativaLaRadacina(absoluta, radacina);
  if (relativ === null) {
    // APFS și NTFS nu țin cont de majuscule: „/Users/x/Agent Motion/nucleu” e același folder.
    // APFS nu face diferența nici între NFC și NFD: „Învățare” scris de Finder (NFD) e același folder cu cel scris de model (NFC) (F8).
    relativ = relativaLaRadacina(
      normalizeazaCale(absoluta).normalize('NFC').toLowerCase(),
      normalizeazaCale(radacina).normalize('NFC').toLowerCase());
  }
  if (relativ === null) {
    // F6: pe Windows, o cale de la rădăcina discului, fără literă (\agent-motion\nucleu), e pe discul curent;
    // garda îl ia drept discul rădăcinii agentului (pe alt disc, rezultatul e doar un refuz în plus).
    const disc = /^[a-zA-Z]:/.exec(radacina)?.[0];
    if (disc && /^[\\/](?![\\/])/.test(faraPrefix)) return clasificaCale(`${disc}${faraPrefix}`, radacina);
    return { zona: 'in-afara', relativ: null, motiv: 'în afara folderului agentului' };
  }
  const curat = curataSegmente(relativ).toLowerCase();
  if (TIPAR_KIT.test(curat)) {
    return { zona: 'kit', relativ: curat, motiv: 'motoare/, nucleu/ și biblioteci/ sunt kitul agentului și nu se modifică' };
  }
  for (const [tipar, motiv] of TIPARE_GENERAT) {
    if (tipar.test(curat)) return { zona: 'generat', relativ: curat, motiv };
  }
  if (TIPAR_SCENARIU.test(curat)) {
    return { zona: 'scenariu', relativ: curat, motiv: 'scenariu.md se scrie doar în afara blocului mg' };
  }
  if (TIPAR_CONFIGURATIE.test(curat)) return { zona: 'configuratie', relativ: curat, motiv: MOTIV_CONFIGURATIE };
  return { zona: 'liber', relativ: curat, motiv: '' };
}

/**
 * SEC-3 (decizia din 2026-10-06): drumul de la `cale` până la rădăcina agentului, când `cale` e un strămoș strict al
 * rădăcinii (rădăcina e în ea, deci ștergerea ei ia tot agentul). Comparația e cea din clasificaCale (majuscule, NFC,
 * discul rădăcinii pentru o cale Windows fără literă), apoi pe căile reale, cu legăturile rezolvate, dacă există pe disc.
 * @param {string} cale absolută
 * @param {string} radacina
 * @returns {string|null} de exemplu 'agent motion' pentru părintele rădăcinii; null dacă nu e strămoș (sau e rădăcina însăși)
 */
export function drumSpreRadacina(cale, radacina) {
  const absoluta = String(cale).replace(/^[\\/]{2}[?.][\\/]/, '');
  const fara = (c) => normalizeazaCale(c).normalize('NFC').toLowerCase();
  const drum = (c, r) => relativaLaRadacina(r, c) ?? relativaLaRadacina(fara(r), fara(c));
  let rezultat = drum(absoluta, radacina);
  // F6, ca în clasificaCale: pe Windows, \x sau / fără literă e pe discul curent, luat drept discul rădăcinii
  const disc = /^[a-zA-Z]:/.exec(radacina)?.[0];
  if (rezultat === null && disc && /^[\\/](?![\\/])/.test(absoluta)) rezultat = drum(`${disc}${absoluta}`, radacina);
  if (rezultat === null && path.isAbsolute(absoluta)) {
    try {
      rezultat = drum(fs.realpathSync.native(absoluta), fs.realpathSync.native(radacina));
    } catch {
      // calea sau rădăcina nu există pe disc (rădăcinile fictive din teste): rămâne comparația literală
    }
  }
  return rezultat === null || rezultat === '' ? null : rezultat;
}

/**
 * SEC-3, corectura 1: `cale` (absolută) există pe disc și e fișier (legăturile urmate). O cale care lipsește sau nu se
 * poate citi dă false, deci regula proiectului întreg rămâne valabilă pentru ea (și pe rădăcinile fictive din teste).
 * @param {string} cale
 * @returns {boolean}
 */
export function esteFisierExistent(cale) {
  // garda citește \ ca separator peste tot (comenzile PowerShell rulate și pe Mac, în teste), deci și aici
  for (const c of new Set([String(cale), String(cale).replace(/\\/g, '/')])) {
    try {
      if (fs.statSync(c).isFile()) return true;
    } catch {
      // nu există în forma asta; încearcă următoarea
    }
  }
  return false;
}

/**
 * B1 (felia 2): `cale` (absolută) există pe disc, fișier sau folder; aceleași forme ca la esteFisierExistent.
 * @param {string} cale
 * @returns {boolean}
 */
export function esteCaleExistenta(cale) {
  for (const c of new Set([String(cale), String(cale).replace(/\\/g, '/')])) {
    try {
      fs.statSync(c);
      return true;
    } catch {
      // nu există în forma asta; încearcă următoarea
    }
  }
  return false;
}

const ZONE_PROTEJATE = new Set(['kit', 'generat', 'scenariu', 'configuratie']);

/**
 * Calea reală (symlinkuri și joncțiuni rezolvate) a celui mai adânc strămoș existent, plus restul care nu există încă.
 * null dacă nu se poate rezolva (cale relativă în forma altui sistem, altă eroare decât „nu există”).
 * @param {string} cale absolută
 * @returns {string|null}
 */
function caleReala(cale) {
  if (!path.isAbsolute(cale)) return null;
  let curent = path.resolve(cale);
  const rest = [];
  for (;;) {
    try {
      return path.join(fs.realpathSync.native(curent), ...rest.reverse());
    } catch (e) {
      if (!e || (e.code !== 'ENOENT' && e.code !== 'ENOTDIR')) return null;
      const parinte = path.dirname(curent);
      if (parinte === curent) return null;
      rest.push(path.basename(curent));
      curent = parinte;
    }
  }
}

/**
 * Ca clasificaCale, dar urmează symlinkurile și joncțiunile existente pe disc (F4): o cale literal liberă care duce,
 * printr-o legătură, în kit, în fișierele produse de mg, în scenariu.md sau în .claude/ primește zona reală.
 * Dacă rădăcina nu există pe disc (testele cu rădăcini fictive), rezultatul e cel literal.
 * @param {string} cale
 * @param {string} radacina
 * @returns {{ zona: Zona, relativ: string|null, motiv: string }}
 */
export function clasificaCaleReala(cale, radacina) {
  const literal = clasificaCale(cale, radacina);
  if (ZONE_PROTEJATE.has(literal.zona)) return literal;
  let radacinaReala;
  try {
    radacinaReala = fs.realpathSync.native(radacina);
  } catch {
    return literal;
  }
  const absoluta = /^[\\/]/.test(cale) || /^[a-zA-Z]:/.test(cale) ? cale : `${radacina.replace(/[\\/]+$/, '')}/${cale}`;
  const reala = caleReala(absoluta);
  if (reala === null) return literal;
  const rezolvat = clasificaCale(reala, radacinaReala);
  return ZONE_PROTEJATE.has(rezolvat.zona) ? rezolvat : literal;
}
