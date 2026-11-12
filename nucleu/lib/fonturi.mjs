// Catalogul de fonturi fixate, acoperirea glifelor (C05) cu fontkit și regulile @font-face.
// Fonturile stau în motoare/comun/fonturi/<id>/ (font.json, woff2 latin și latin-ext, OFL.txt).
import fs from 'node:fs';
import path from 'node:path';
import { openSync } from 'fontkit';
import { citesteJson, existaFisier } from './fisiere.mjs';
import { eroare, EroareFatala, COD_IESIRE } from './erori.mjs';

export const DIACRITICE = 'ăâîșțĂÂÎȘȚ';

const deschise = new Map();

function dirFonturi(radacina) {
  return path.join(radacina, 'motoare', 'comun', 'fonturi');
}

function deschide(cale) {
  if (!deschise.has(cale)) deschise.set(cale, openSync(cale));
  return deschise.get(cale);
}

function codPunct(caracter) {
  return 'U+' + caracter.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
}

/** @returns {Record<string, object>} id → conținutul lui font.json (harta 5.6) */
export function incarcaCatalogFonturi(radacina) {
  const dir = dirFonturi(radacina);
  const catalog = {};
  if (!fs.existsSync(dir)) return catalog;
  const foldere = fs.readdirSync(dir, { withFileTypes: true })
    .filter((intrare) => intrare.isDirectory())
    .map((intrare) => intrare.name)
    .sort();
  for (const nume of foldere) {
    const cale = path.join(dir, nume, 'font.json');
    if (!existaFisier(cale)) continue;
    const info = citesteJson(cale);
    catalog[info.id] = info;
  }
  return catalog;
}

function infoFont(radacina, idFont) {
  const catalog = incarcaCatalogFonturi(radacina);
  if (!Object.hasOwn(catalog, idFont)) {
    throw new EroareFatala(
      eroare('font-necunoscut', 'stil.font_titlu',
        `Fontul „${idFont}” nu e în catalogul de fonturi.`,
        `Alege unul dintre fonturile din catalog: ${Object.keys(catalog).join(', ') || '(catalogul e gol)'}.`),
      COD_IESIRE.DATE);
  }
  return catalog[idFont];
}

function fisiereGreutate(info, greutate) {
  const fisiere = info.fisiere.filter((f) => f.greutate === greutate);
  if (fisiere.length === 0) {
    const greutati = [...new Set(info.fisiere.map((f) => f.greutate))].join(', ');
    throw new EroareFatala(
      eroare('font-necunoscut', 'stil.font_titlu',
        `Fontul „${info.id}” nu are greutatea ${greutate}.`,
        `Folosește una dintre greutățile aduse: ${greutati}.`),
      COD_IESIRE.DATE);
  }
  return fisiere;
}

/** Fontul de brand din spec 6.4: {fisier, familie}, cu fisier relativ la rădăcina kitului. */
export function esteFontBrand(font) {
  return font !== null && typeof font === 'object' && typeof font.fisier === 'string' && typeof font.familie === 'string';
}

function numeFont(font) {
  return esteFontBrand(font) ? font.familie : font;
}

function fontBrandNefolosibil(font, ce) {
  return eroare('font-necunoscut', 'brand',
    `Fontul de brand „${font.familie}” (${font.fisier}) ${ce}.`,
    'Pune în folderul brandului fișierul woff2 numit în font_titlu.fisier sau alege în fișa de brand un font din catalog.');
}

function deschideFontBrand(radacina, font) {
  const cale = path.join(radacina, font.fisier);
  if (!existaFisier(cale)) throw new EroareFatala(fontBrandNefolosibil(font, 'lipsește'), COD_IESIRE.DATE);
  try {
    return deschide(cale);
  } catch {
    throw new EroareFatala(fontBrandNefolosibil(font, 'nu e un font woff2 care se poate citi'), COD_IESIRE.DATE);
  }
}

function fonturiDeschise(radacina, font, greutate) {
  if (esteFontBrand(font)) return [deschideFontBrand(radacina, font)];
  const info = infoFont(radacina, font);
  return fisiereGreutate(info, greutate)
    .map((f) => deschide(path.join(dirFonturi(radacina), info.id, f.fisier)));
}

/** Caracterele unice din text fără glifă în niciunul dintre subseturile greutății (la fontul de brand, în fișierul lui). */
export async function glifeLipsa(radacina, font, text, greutate) {
  const fonturi = fonturiDeschise(radacina, font, greutate);
  const lipsa = [];
  for (const caracter of new Set(Array.from(String(text).normalize('NFC')))) {
    if (/\p{Cc}/u.test(caracter)) continue; // \n, \t: nu se desenează
    const cod = caracter.codePointAt(0);
    if (!fonturi.some((font) => font.hasGlyphForCodePoint(cod))) lipsa.push(caracter);
  }
  return lipsa;
}

/**
 * Fontul din catalog vine din fișa de brand: stil.font_titlu e interzis în date.json cu brand (conflicteBrandDate),
 * deci eroarea font-necunoscut primește camp 'brand' și trimite la branduri/<brand>/vizual.md (F11).
 * @param {unknown} e
 * @param {string} brand
 */
function eroareFontLaBrand(e, brand) {
  if (!(e instanceof EroareFatala) || e.eroareMg?.cod !== 'font-necunoscut' || e.eroareMg.camp !== 'stil.font_titlu') return e;
  const fisa = `branduri/${brand}/vizual.md`;
  return new EroareFatala(
    eroare('font-necunoscut', 'brand',
      `${e.eroareMg.mesaj} Fontul vine din brandul „${brand}” (${fisa}).`,
      `Corectează font_titlu în ${fisa}. ${e.eroareMg.sugestie}`),
    e.codIesire ?? COD_IESIRE.DATE);
}

/**
 * Fontul de titlu al unui brand, dat ca id de catalog, trebuie să existe în catalog (F11). Rulează la rezolvarea stilului,
 * înaintea lui construieste și a lui C05; fontul de brand dat ca fișier woff2 ({fisier, familie}) nu se atinge aici.
 * @param {string} radacina
 * @param {unknown} font font_titlu din fișa de brand
 * @param {string} brand numele brandului
 * @returns {object|null} eroarea font-necunoscut (camp 'brand'), sau null când fontul e bun sau e fișier propriu
 */
export function eroareFontCatalogBrand(radacina, font, brand) {
  if (typeof font !== 'string') return null;
  try {
    infoFont(radacina, font);
    return null;
  } catch (e) {
    const corectata = eroareFontLaBrand(e, brand);
    if (corectata === e) throw e;
    return corectata.eroareMg;
  }
}

/**
 * C05 pe o listă de texte. Un element e fie un șir, fie {camp, text}; pentru un șir simplu, camp e 'texte[<i>]'.
 * Cu `brand` (numele brandului, când stil.font_titlu.sursa e 'brand'), font-necunoscut are camp 'brand' (F11).
 * @param {{brand?: string|null}} [optiuni]
 * @returns {Promise<{cod: 'C05', ok: boolean, valoare: unknown, prag: unknown, camp: string|null, erori: object[]}>}
 */
export async function verificaAcoperire(radacina, font, texte, greutate, { brand = null } = {}) {
  const idFont = numeFont(font);
  const erori = [];
  const toateLipsa = new Set();
  for (const [i, element] of texte.entries()) {
    const { camp, text } = typeof element === 'string' ? { camp: `texte[${i}]`, text: element } : element;
    let lipsa;
    try {
      lipsa = await glifeLipsa(radacina, font, text, greutate);
    } catch (e) {
      throw typeof brand === 'string' && brand !== '' ? eroareFontLaBrand(e, brand) : e;
    }
    if (lipsa.length === 0) continue;
    for (const caracter of lipsa) toateLipsa.add(caracter);
    const lista = lipsa.map((c) => `„${c}” (${codPunct(c)})`).join(', ');
    erori.push(eroare('glifa-lipsa', camp,
      `Fontul „${idFont}”, greutatea ${greutate}, nu poate desena: ${lista}.`,
      `Înlocuiește sau scoate ${lipsa.length === 1 ? 'caracterul' : 'caracterele'} ${lista} din text.`));
  }
  return {
    cod: 'C05',
    ok: erori.length === 0,
    valoare: { font: idFont, greutate, lipsa: [...toateLipsa] },
    prag: 'toate caracterele au glifă în font',
    camp: erori.length ? erori[0].camp : null,
    erori,
  };
}

/** Pentru mg doctor: fișierele fiecărei greutăți există și au ă â î ș ț Ă Â Î Ș Ț. */
export async function verificaDiacriticeFont(radacina, idFont) {
  const info = infoFont(radacina, idFont);
  const erori = [];
  const lipsa = {};
  const greutati = [...new Set(info.fisiere.map((f) => f.greutate))].sort((a, b) => a - b);
  for (const greutate of greutati) {
    const absente = fisiereGreutate(info, greutate)
      .filter((f) => !existaFisier(path.join(dirFonturi(radacina), info.id, f.fisier)));
    if (absente.length) {
      erori.push(eroare('font-fara-diacritice', 'mediu.fonturi',
        `Lipsesc fișierele fontului „${idFont}”: ${absente.map((f) => f.fisier).join(', ')}.`,
        'Readu kitul la versiunea fixată (git checkout pe motoare/comun/fonturi) și rulează din nou node nucleu/mg.mjs doctor.'));
      continue;
    }
    const caractere = await glifeLipsa(radacina, idFont, DIACRITICE, greutate);
    if (caractere.length) {
      lipsa[greutate] = caractere;
      erori.push(eroare('font-fara-diacritice', 'mediu.fonturi',
        `Fontul „${idFont}”, greutatea ${greutate}, nu are diacriticele ${caractere.join(' ')}.`,
        'Readu kitul la versiunea fixată (git checkout pe motoare/comun/fonturi) și rulează din nou node nucleu/mg.mjs doctor.'));
    }
  }
  return { ok: erori.length === 0, font: idFont, lipsa, erori };
}

/** Câte un @font-face pe fișier, familia „MG <Nume>”, în ordinea crescătoare a greutăților. */
export function cssFontFace(radacina, idFont, greutati, prefixUrl) {
  const info = infoFont(radacina, idFont);
  const blocuri = [];
  for (const greutate of [...new Set(greutati)].sort((a, b) => a - b)) {
    for (const f of fisiereGreutate(info, greutate)) {
      blocuri.push([
        '@font-face {',
        `  font-family: "${info.familie}";`,
        '  font-style: normal;',
        `  font-weight: ${f.greutate};`,
        '  font-display: block;',
        `  src: url("${prefixUrl}${f.fisier}") format("woff2");`,
        `  unicode-range: ${f.unicode_range};`,
        '}',
      ].join('\n'));
    }
  }
  return blocuri.join('\n') + '\n';
}

/** Copiază toate fișierele woff2 ale fonturilor cerute în dirDestinatie; întoarce numele lor, sortate. */
export function copiazaFonturi(radacina, idFonturi, dirDestinatie) {
  fs.mkdirSync(dirDestinatie, { recursive: true });
  const copiate = [];
  for (const idFont of [...new Set(idFonturi)]) {
    const info = infoFont(radacina, idFont);
    for (const f of info.fisiere) {
      fs.copyFileSync(path.join(dirFonturi(radacina), info.id, f.fisier), path.join(dirDestinatie, f.fisier));
      copiate.push(f.fisier);
    }
  }
  return copiate.sort();
}

/** C05 pe fontul de brand, la fiecare randare (spec 7.1 punctul 3): fișierul există, e font și are diacriticele. */
export async function verificaFontBrand(radacina, font, caractere = DIACRITICE) {
  const rezultat = (erori, lipsa) => ({
    cod: 'C05',
    ok: erori.length === 0,
    valoare: { font: font.familie, fisier: font.fisier, lipsa },
    prag: 'fontul de brand e woff2 local și are ă â î ș ț Ă Â Î Ș Ț',
    camp: erori.length ? 'brand' : null,
    erori,
  });
  let lipsa;
  try {
    lipsa = await glifeLipsa(radacina, font, caractere, null);
  } catch (e) {
    if (!(e instanceof EroareFatala)) throw e;
    return rezultat([e.eroareMg], []);
  }
  if (lipsa.length === 0) return rezultat([], []);
  return rezultat([eroare('glifa-lipsa', 'brand',
    `Fontul de brand „${font.familie}” nu are literele ${lipsa.join(' ')}.`,
    'Pune în folderul brandului un woff2 cu toate diacriticele românești (de obicei varianta latin-ext completă a fontului) sau alege în fișa de brand un font din catalog.')], lipsa);
}

/** Numele de familie din CSS: „MG <familie>” la fontul de brand, familia din font.json la catalog. */
export function familieCss(font, radacina) {
  return esteFontBrand(font) ? `MG ${font.familie}` : infoFont(radacina, font).familie;
}

function numeCopieBrand(font) {
  return `brand-${path.basename(font.fisier)}`;
}

/** Un singur @font-face pentru fontul de brand, cu toată plaja de greutăți pe fișierul lui. */
export function cssFontFaceBrand(font, prefixUrl) {
  return [
    '@font-face {',
    `  font-family: "MG ${font.familie}";`,
    '  font-style: normal;',
    '  font-weight: 100 900;',
    '  font-display: block;',
    `  src: url("${prefixUrl}${numeCopieBrand(font)}") format("woff2");`,
    '}',
  ].join('\n') + '\n';
}

/** Copiază fișierul brandului în dirDestinatie, ca brand-<nume>, și întoarce numele copiei. */
export function copiazaFontBrand(radacina, font, dirDestinatie) {
  fs.mkdirSync(dirDestinatie, { recursive: true });
  const nume = numeCopieBrand(font);
  fs.copyFileSync(path.join(radacina, font.fisier), path.join(dirDestinatie, nume));
  return nume;
}

/**
 * Metricile unui font pentru casetele textelor (C13): lățimea unui rând și înălțimea lui `line-height: normal`.
 * Fiecare caracter se ia din primul subset al greutății care îl are (ca unicode-range în browser); rândurile
 * consecutive din același subset trec împreună prin layout-ul fontkit, cu kerning. `letter-spacing` din CSS
 * se adaugă după fiecare caracter, ca în Chrome.
 * @param {string} radacina
 * @param {string|{fisier: string, familie: string}} font id din catalog sau fontul de brand
 * @param {number} greutate
 * @returns {{latime: (text: string, marime: number, spatiereEm?: number) => number, inaltimeNormala: (marime: number) => number}}
 */
export function metriciFont(radacina, font, greutate) {
  const fonturi = fonturiDeschise(radacina, font, greutate);
  const fontPentru = (cod) => fonturi.find((f) => f.hasGlyphForCodePoint(cod)) ?? fonturi[0];
  return {
    latime(text, marime, spatiereEm = 0) {
      const caractere = Array.from(String(text).normalize('NFC'));
      let unitati = 0;
      let bucata = '';
      let curent = null;
      const inchide = () => {
        if (bucata !== '') unitati += (curent.layout(bucata).advanceWidth / curent.unitsPerEm);
        bucata = '';
      };
      for (const c of caractere) {
        const f = fontPentru(c.codePointAt(0));
        if (f !== curent) {
          inchide();
          curent = f;
        }
        bucata += c;
      }
      inchide();
      return (unitati + spatiereEm * caractere.length) * marime;
    },
    inaltimeNormala(marime) {
      const f = fonturi[0];
      return ((f.ascent - f.descent + f.lineGap) / f.unitsPerEm) * marime;
    },
  };
}
