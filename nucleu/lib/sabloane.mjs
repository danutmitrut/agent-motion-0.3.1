/**
 * Încărcarea unui șablon: motoare/<motor>/sabloane/<nume>/ (harta 4.10, 5.8).
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse as parseazaYaml } from 'yaml';
import { COD_IESIRE, ESTE_COD_VERIFICARE, EroareFatala, eroare } from './erori.mjs';
import { VERIFICARI_MINIME } from './verificari/stadii.mjs';
import { citesteJson, citesteText, jsonStabil, sha256Fisier, sha256Text } from './fisiere.mjs';

const EXPORTURI_OBLIGATORII = ['valideaza', 'cronologie', 'construieste', 'asteptari'];
const FOLDERE_FARA_HASH = Object.freeze(['teste', 'exemple']);
const FISIERE_OBLIGATORII = ['schema.json', 'implicite.json', 'sablon.mjs', 'exemple/minim.json'];
const STADII_S = Object.freeze(['date', 'build', 'mp4']);

function subfoldere(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

/**
 * @param {string} radacina
 * @returns {Array<{nume: string, motor: string, dir: string}>} sortate după nume
 */
export function listaSabloane(radacina) {
  const sabloane = [];
  for (const motor of subfoldere(join(radacina, 'motoare'))) {
    for (const nume of subfoldere(join(radacina, 'motoare', motor, 'sabloane'))) {
      if (nume.startsWith('_')) continue;
      const dir = join(radacina, 'motoare', motor, 'sabloane', nume);
      if (existsSync(join(dir, 'SABLON.md'))) sabloane.push({ nume, motor, dir });
    }
  }
  return sabloane.sort((a, b) => (a.nume < b.nume ? -1 : a.nume > b.nume ? 1 : 0));
}

function frontmatter(text) {
  const randuri = text.split('\n');
  if (randuri[0]?.trim() !== '---') return null;
  const sfarsit = randuri.findIndex((r, i) => i > 0 && r.trim() === '---');
  if (sfarsit === -1) return null;
  return parseazaYaml(randuri.slice(1, sfarsit).join('\n'));
}

function fisiereRecursiv(dir, prefix, rezultat) {
  for (const intrare of readdirSync(dir, { withFileTypes: true })) {
    if (intrare.name.startsWith('.')) continue;
    if (prefix === '' && intrare.isDirectory() && FOLDERE_FARA_HASH.includes(intrare.name)) continue;
    if (intrare.isDirectory()) fisiereRecursiv(join(dir, intrare.name), `${prefix}${intrare.name}/`, rezultat);
    else if (intrare.isFile()) rezultat.push(`${prefix}${intrare.name}`);
  }
  return rezultat;
}

/**
 * sha256 peste jsonStabil({<cale relativă cu />: sha256}) al tuturor fișierelor din folderul șablonului, recursiv,
 * fără folderele teste/ și exemple/ de pe primul nivel și fără fișierele sau folderele care încep cu punct.
 * @param {string} dirSablon
 * @returns {string}
 */
export function sha256Sablon(dirSablon) {
  const hashuri = {};
  for (const cale of fisiereRecursiv(dirSablon, '', [])) hashuri[cale] = sha256Fisier(join(dirSablon, ...cale.split('/')));
  return sha256Text(jsonStabil(hashuri));
}

/**
 * @param {string} radacina
 * @param {string} nume
 * @returns {Promise<{nume: string, motor: string, dir: string, meta: object, schema: object, implicite: object, modul: object, sha256: string}>}
 */
export async function incarcaSablon(radacina, nume) {
  const toate = listaSabloane(radacina);
  const gasit = toate.find((s) => s.nume === nume);
  if (!gasit) {
    const disponibile = toate.map((s) => s.nume).join(', ') || 'niciunul';
    throw new EroareFatala(eroare('sablon-necunoscut', 'argumente.sablon',
      `Șablonul „${nume}” nu există.`,
      `Alege unul dintre șabloanele instalate: ${disponibile}.`), COD_IESIRE.UTILIZARE);
  }
  const { dir, motor } = gasit;
  const invalid = (detaliu) => new EroareFatala(eroare('sablon-invalid', 'argumente.sablon',
    `Șablonul „${nume}” e stricat: ${detaliu}.`,
    'Rulează node nucleu/mg.mjs doctor; dacă eroarea rămâne, trimite mesajul lui Dănuț.'), COD_IESIRE.MEDIU);

  let meta;
  try {
    meta = frontmatter(citesteText(join(dir, 'SABLON.md')));
  } catch (err) {
    if (err instanceof EroareFatala) throw err;
    throw invalid(`frontmatter-ul din SABLON.md nu e YAML valid (${err.message})`);
  }
  if (!meta || typeof meta !== 'object') throw invalid('SABLON.md nu începe cu un frontmatter între două linii ---');
  if (meta.nume !== nume) throw invalid(`frontmatter-ul are nume: ${meta.nume}`);
  if (meta.motor !== motor) throw invalid(`frontmatter-ul are motor: ${meta.motor}, dar șablonul stă în motoare/${motor}`);
  if (!Number.isInteger(meta.versiune_schema)) throw invalid('frontmatter-ul nu are versiune_schema');
  if (!Array.isArray(meta.formate) || meta.formate.length === 0) throw invalid('frontmatter-ul nu are formate');
  if (meta.intrare !== undefined && meta.intrare !== 'filmare') {
    throw invalid(`frontmatter-ul are intrare: ${meta.intrare}; singura valoare acceptată e filmare`);
  }
  // M2: verificari e exact ce contează; minimul e obligatoriu, iar stadiile se dau doar codurilor S declarate
  const verificari = meta.verificari;
  if (!Array.isArray(verificari) || verificari.length === 0) throw invalid('frontmatter-ul nu are lista verificari');
  const invalide = verificari.filter((c) => typeof c !== 'string' || !ESTE_COD_VERIFICARE.test(c));
  if (invalide.length > 0) throw invalid(`verificari are coduri invalide: ${invalide.map(String).join(', ')}`);
  const dublate = verificari.filter((c, i) => verificari.indexOf(c) !== i);
  if (dublate.length > 0) throw invalid(`verificari are coduri dublate: ${[...new Set(dublate)].join(', ')}`);
  const lipsaMinim = VERIFICARI_MINIME.filter((c) => !verificari.includes(c));
  if (lipsaMinim.length > 0) throw invalid(`verificari nu conține minimul obligatoriu; lipsesc ${lipsaMinim.join(', ')}`);
  if (meta.stadii !== undefined) {
    if (meta.stadii === null || typeof meta.stadii !== 'object' || Array.isArray(meta.stadii)) {
      throw invalid('stadii trebuie să fie un obiect { cod: stadiu }');
    }
    for (const [cod, stadiu] of Object.entries(meta.stadii)) {
      if (!/^S\d\d$/.test(cod) || !verificari.includes(cod)) throw invalid(`stadii dă un stadiu codului ${cod}, care nu e un cod S din verificari`);
      if (!STADII_S.includes(stadiu)) throw invalid(`stadii dă codului ${cod} stadiul ${stadiu}; se acceptă ${STADII_S.join(', ')}`);
    }
  }
  for (const fisier of FISIERE_OBLIGATORII) {
    if (!existsSync(join(dir, fisier))) throw invalid(`lipsește ${fisier}`);
  }
  const schema = citesteJson(join(dir, 'schema.json'));
  const implicite = citesteJson(join(dir, 'implicite.json'));
  let modul;
  try {
    modul = await import(pathToFileURL(join(dir, 'sablon.mjs')).href);
  } catch (err) {
    throw invalid(`sablon.mjs nu se încarcă (${err.message})`);
  }
  const lipsa = EXPORTURI_OBLIGATORII.filter((n) => typeof modul[n] !== 'function');
  if (lipsa.length > 0) throw invalid(`sablon.mjs nu exportă ${lipsa.join(', ')}`);
  return { nume, motor, dir, meta, schema, implicite, modul, sha256: sha256Sablon(dir) };
}
