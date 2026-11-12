/**
 * Blocul mg din scenariu.md (harta 4.14, spec 6.9 și 6.14). Doar module native.
 * În planul A: marcajele, extragerea blocului și scheletul scris de mg nou; în B12, generarea blocului,
 * înlocuirea lui și hash-ul zonei „Texte și cifre”.
 */
import { sha256Text } from './fisiere.mjs';

export const MARCAJ_START = '<!-- mg:start -->';
export const MARCAJ_SFARSIT = '<!-- mg:end -->';
export const TITLU_BLOC = '## Ce apare pe ecran';
export const TITLU_TEXTE = '### Texte și cifre';
export const TITLU_STIL = '### Stil și timpi';

/**
 * @param {string} text conținutul lui scenariu.md
 * @returns {{bloc: string, inceput: number, sfarsit: number} | null} bloc include marcajele; sfarsit e indexul de după MARCAJ_SFARSIT
 */
export function extrageBlocMg(text) {
  const inceput = text.indexOf(MARCAJ_START);
  if (inceput === -1) return null;
  const pozitieSfarsit = text.indexOf(MARCAJ_SFARSIT, inceput + MARCAJ_START.length);
  if (pozitieSfarsit === -1) return null;
  const sfarsit = pozitieSfarsit + MARCAJ_SFARSIT.length;
  return { bloc: text.slice(inceput, sfarsit), inceput, sfarsit };
}

/**
 * @param {string} proiect
 * @param {number} numarScene
 * @returns {string} scheletul lui scenariu.md, cu blocul mg gol la final
 */
export function scheletScenariu(proiect, numarScene) {
  const randuri = [
    `# Scenariu: ${proiect}`,
    '',
    'Scenele de mai jos le completează agentul împreună cu tine. Blocul „Ce apare pe ecran” îl scrie mg, nu se editează de mână.',
    '',
  ];
  for (let n = 1; n <= numarScene; n += 1) {
    randuri.push(`## Scena ${n}`, '', 'Ce se vede:', 'Text:', 'Durată estimată:', '');
  }
  randuri.push(MARCAJ_START, TITLU_BLOC, '', TITLU_TEXTE, '', TITLU_STIL, MARCAJ_SFARSIT, '');
  return randuri.join('\n');
}

// ---- B12: generarea blocului, înlocuirea și hash-ul zonei „Texte și cifre” (harta 4.14 și 5.11, spec 6.9) ----

/**
 * Înlocuiește blocul mg existent cu blocNou; dacă lipsește, îl adaugă la final, după o linie goală.
 * @param {string} text conținutul lui scenariu.md
 * @param {string} blocNou blocul complet, cu marcaje (din genereazaBloc)
 * @returns {string}
 */
export function inlocuiesteBlocMg(text, blocNou) {
  const existent = extrageBlocMg(text);
  if (existent) {
    return text.slice(0, existent.inceput) + blocNou + text.slice(existent.inceput + existent.bloc.length);
  }
  const baza = text.replace(/\s+$/, '');
  return baza === '' ? `${blocNou}\n` : `${baza}\n\n${blocNou}\n`;
}

/**
 * Textul dintre titlul „### Texte și cifre” și titlul „### Stil și timpi”, fără titluri; '' dacă lipsește.
 * @param {string} bloc
 * @returns {string}
 */
export function extrageZonaTexte(bloc) {
  const linii = bloc.replace(/\r\n?/g, '\n').split('\n');
  const start = linii.findIndex((l) => l.trim() === TITLU_TEXTE);
  if (start === -1) return '';
  let sfarsit = linii.findIndex((l, i) => i > start && (l.trim() === TITLU_STIL || l.trim() === MARCAJ_SFARSIT));
  if (sfarsit === -1) sfarsit = linii.length;
  return linii.slice(start + 1, sfarsit).join('\n');
}

/**
 * NFC, LF, fără spații la finalul liniilor, fără linii goale la început și la sfârșit.
 * @param {string} zona
 * @returns {string}
 */
export function normalizeazaZona(zona) {
  const linii = zona.normalize('NFC').replace(/\r\n?/g, '\n').split('\n').map((l) => l.trimEnd());
  while (linii.length > 0 && linii[0] === '') linii.shift();
  while (linii.length > 0 && linii[linii.length - 1] === '') linii.pop();
  return linii.join('\n');
}

/** @param {string} bloc @returns {string} sha256 hex al zonei „Texte și cifre” normalizate */
export function hashZonaTexte(bloc) {
  return sha256Text(normalizeazaZona(extrageZonaTexte(bloc)));
}

/**
 * @typedef {{ref: string, camp: string, eticheta: string | null, text: string, accent: boolean, separat: boolean,
 *   font?: 'titlu'|'text', greutate?: number}} LinieText
 * O linie din zona „Texte și cifre” (planul E, M1), pusă de șablon (blocScenariu) sau de varianta implicită a nucleului.
 * ref: de exemplu 'Scena 1' sau 'Semnătura'; camp: calea din date.json; eticheta: ce text al lui ref e (de exemplu
 * 'titlu, rândul 1'), sau null pentru linia simplă `- <ref>: <valoare>`, fără „(accent)”.
 * text: rândurile despărțite prin '\n'. separat true: fiecare rând apare pe ecran singur și are ghilimelele lui;
 * false: rândurile stau între aceleași ghilimele, despărțite prin ' / '.
 * font și greutate (opționale): fontul (titlu sau text) și greutatea cu care șablonul pune textul pe ecran (C05, M7).
 */

const CHEI_LINIE = new Set(['ref', 'camp', 'eticheta', 'text', 'accent', 'separat', 'font', 'greutate']);
const sirNevid = (x) => typeof x === 'string' && x !== '';

/**
 * Verifică strict forma fiecărei LinieText (chei necunoscute incluse). Greșeala e a autorului șablonului, nu a cursantului.
 * @param {unknown} texte
 * @returns {LinieText[]} chiar texte
 * @throws {TypeError} la prima intrare cu formă greșită
 */
export function valideazaLiniiText(texte) {
  if (!Array.isArray(texte)) throw new TypeError('Textele blocului „Ce apare pe ecran” trebuie să fie o listă.');
  texte.forEach((t, i) => {
    const greseala = (motiv) => new TypeError(`Linia ${i} din „Texte și cifre”: ${motiv}.`);
    if (t === null || typeof t !== 'object' || Array.isArray(t)) throw greseala('nu e un obiect');
    for (const cheie of Object.keys(t)) if (!CHEI_LINIE.has(cheie)) throw greseala(`cheie necunoscută „${cheie}”`);
    for (const cheie of ['ref', 'camp', 'text']) if (!sirNevid(t[cheie])) throw greseala(`${cheie} trebuie să fie un șir nevid`);
    if (t.eticheta !== null && !sirNevid(t.eticheta)) throw greseala('eticheta trebuie să fie un șir nevid sau null');
    for (const cheie of ['accent', 'separat']) if (typeof t[cheie] !== 'boolean') throw greseala(`${cheie} trebuie să fie boolean`);
    if (Object.hasOwn(t, 'font') && t.font !== 'titlu' && t.font !== 'text') throw greseala('font trebuie să fie „titlu” sau „text”');
    if (Object.hasOwn(t, 'greutate') && !(Number.isInteger(t.greutate) && t.greutate >= 100 && t.greutate <= 900)) {
      throw greseala('greutate trebuie să fie un întreg între 100 și 900');
    }
  });
  return texte;
}

/**
 * Blocul „Ce apare pe ecran”, exact în forma din harta 5.11, formatat doar din câmpurile fiecărei linii (M1).
 * @param {{texte: LinieText[], stil: string[]}} p stil = rândurile zonei „Stil și timpi”, fără '- ' în față
 * @returns {string} blocul, de la MARCAJ_START la MARCAJ_SFARSIT, fără rând nou la final
 */
export function genereazaBloc({ texte, stil }) {
  const linii = [MARCAJ_START, TITLU_BLOC, '', TITLU_TEXTE];
  for (const t of texte) {
    const randuri = t.text.split('\n');
    const valoare = t.separat ? randuri.map((r) => `„${r}”`).join(' / ') : `„${randuri.join(' / ')}”`;
    const eticheta = t.eticheta === null ? '' : `, ${t.eticheta}${t.accent ? ' (accent)' : ''}`;
    linii.push(`- ${t.ref}${eticheta}: ${valoare}`);
  }
  linii.push('', TITLU_STIL);
  for (const s of stil) linii.push(`- ${s}`);
  linii.push(MARCAJ_SFARSIT);
  return linii.join('\n');
}
