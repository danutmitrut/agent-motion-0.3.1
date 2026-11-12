// Fișa de brand: branduri/<nume>/vizual.md, cu frontmatter YAML normativ (spec 6.4).
import path from 'node:path';
import { parse } from 'yaml';
import { citesteText, existaFisier } from './fisiere.mjs';
import { eroare, EroareFatala, COD_IESIRE } from './erori.mjs';

const CULORI_BRAND = ['fundal', 'text', 'accent', 'linie', 'atenuat'];
const HEX = /^#[0-9A-Fa-f]{6}$/;
// Fontul de brand {fisier, familie} (spec 6.4): un woff2 din folderul brandului, fără foldere; familia ajunge în CSS.
const FISIER_FONT = /^[^/\\.][^/\\]*\.woff2$/;
const FAMILIE_INTERZISE = /["';{}<>\\\p{Cc}]/u;

function invalid(nume, ce) {
  return new EroareFatala(
    eroare('brand-invalid', 'brand',
      `Fișa de brand „${nume}” nu poate fi folosită: ${ce}.`,
      `Repară frontmatter-ul din branduri/${nume}/vizual.md (între primele două linii „---”) după exemplul din spec 6.4.`),
    COD_IESIRE.DATE);
}

/** font_titlu și font_text: id din catalog (șir) sau {fisier, familie}; obiectul întors are fisier relativ la rădăcina kitului. */
function fontBrand(nume, font, cheie) {
  if (typeof font === 'string') return font;
  if (font === null || typeof font !== 'object' || Array.isArray(font)) {
    throw invalid(nume, `${cheie} trebuie să fie un id din catalogul de fonturi sau {fisier, familie}`);
  }
  if (Object.keys(font).sort().join(',') !== 'familie,fisier') {
    throw invalid(nume, `${cheie} ca obiect are exact cheile fisier și familie`);
  }
  if (typeof font.fisier !== 'string' || !FISIER_FONT.test(font.fisier)) {
    throw invalid(nume, `${cheie}.fisier trebuie să fie numele unui fișier .woff2 din folderul brandului, fără foldere în cale`);
  }
  if (typeof font.familie !== 'string' || font.familie.trim() === '' || font.familie.length > 60 || FAMILIE_INTERZISE.test(font.familie)) {
    throw invalid(nume, `${cheie}.familie trebuie să aibă 1-60 de caractere, fără ghilimele, punct și virgulă, acolade, < > sau \\`);
  }
  return { fisier: `branduri/${nume}/${font.fisier}`, familie: font.familie };
}

// Ceața brandului (felia 4): culoarea fiecărui strat și, opțional, opacitatea lui; fără alfa rămâne cea a șablonului.
const STRATURI = ['sus', 'jos'];
const ALFA_CEATA = [0.05, 0.5];

function ceataBrand(nume, ceata) {
  if (ceata === null || typeof ceata !== 'object' || Array.isArray(ceata)) throw invalid(nume, 'ceata trebuie să fie un obiect cu sus și jos');
  const rezultat = {};
  for (const [strat, valoare] of Object.entries(ceata)) {
    if (!STRATURI.includes(strat)) throw invalid(nume, `ceata.${strat} nu e un strat cunoscut (${STRATURI.join(', ')})`);
    const obiect = typeof valoare === 'string' ? { culoare: valoare } : valoare;
    if (obiect === null || typeof obiect !== 'object' || Array.isArray(obiect)
      || Object.keys(obiect).some((k) => k !== 'culoare' && k !== 'alfa')) {
      throw invalid(nume, `ceata.${strat} e o culoare hex sau {culoare, alfa}`);
    }
    if (typeof obiect.culoare !== 'string' || !HEX.test(obiect.culoare)) throw invalid(nume, `ceata.${strat}.culoare trebuie să fie hex #RRGGBB, între ghilimele`);
    if (obiect.alfa !== undefined && (!Number.isFinite(obiect.alfa) || obiect.alfa < ALFA_CEATA[0] || obiect.alfa > ALFA_CEATA[1])) {
      throw invalid(nume, `ceata.${strat}.alfa e un număr între ${ALFA_CEATA[0]} și ${ALFA_CEATA[1]}`);
    }
    rezultat[strat] = obiect.alfa === undefined ? { culoare: obiect.culoare } : { culoare: obiect.culoare, alfa: obiect.alfa };
  }
  return rezultat;
}

// Eticheta brandului (felia 4): doar prefixul, scurt și fără marcaj.
function etichetaBrand(nume, eticheta) {
  if (eticheta === null || typeof eticheta !== 'object' || Array.isArray(eticheta) || Object.keys(eticheta).some((k) => k !== 'prefix')) {
    throw invalid(nume, 'eticheta are doar cheia prefix');
  }
  if (eticheta.prefix !== undefined && (typeof eticheta.prefix !== 'string' || eticheta.prefix.length > 4 || /[*<>&\p{Cc}]/u.test(eticheta.prefix))) {
    throw invalid(nume, 'eticheta.prefix are cel mult 4 caractere, fără *, <, >, & sau caractere de control');
  }
  return eticheta.prefix === undefined ? {} : { prefix: eticheta.prefix };
}

/** @returns {{nume: string, mg: 1, tema?: string, culori?: object, font_titlu?: string|{fisier: string, familie: string}, font_text?: string|{fisier: string, familie: string}, ceata?: {sus?: {culoare: string, alfa?: number}, jos?: {culoare: string, alfa?: number}}, eticheta?: {prefix?: string}, sigla?: string, semnatura?: string, personaj?: string, dir: string}} */
export function citesteBrand(radacina, nume) {
  const dir = path.join(radacina, 'branduri', nume);
  const cale = path.join(dir, 'vizual.md');
  if (!existaFisier(cale)) {
    throw new EroareFatala(
      eroare('brand-lipsa', 'brand',
        `Nu găsesc fișa de brand „${nume}” (branduri/${nume}/vizual.md).`,
        `Creează branduri/${nume}/vizual.md sau scoate câmpul brand din date.json.`),
      COD_IESIRE.DATE);
  }
  const linii = citesteText(cale, `fisier:branduri/${nume}/vizual.md`).split('\n');
  if (linii[0].trim() !== '---') throw invalid(nume, 'prima linie nu e „---”, deci lipsește frontmatter-ul');
  const sfarsit = linii.findIndex((linie, i) => i > 0 && linie.trim() === '---');
  if (sfarsit === -1) throw invalid(nume, 'frontmatter-ul nu se închide cu a doua linie „---”');
  let meta;
  try {
    meta = parse(linii.slice(1, sfarsit).join('\n'));
  } catch (e) {
    throw invalid(nume, `YAML-ul nu se poate citi (${String(e.message).split('\n')[0]})`);
  }
  if (meta === null || typeof meta !== 'object' || Array.isArray(meta)) throw invalid(nume, 'frontmatter-ul nu e o listă de chei');
  if (meta.mg !== 1) throw invalid(nume, `cheia mg trebuie să fie 1 (are ${JSON.stringify(meta.mg ?? null)})`);
  if (meta.culori !== undefined) {
    if (meta.culori === null || typeof meta.culori !== 'object' || Array.isArray(meta.culori)) throw invalid(nume, 'culori trebuie să fie un obiect');
    for (const [cheie, valoare] of Object.entries(meta.culori)) {
      if (!CULORI_BRAND.includes(cheie)) throw invalid(nume, `culori.${cheie} nu e o culoare cunoscută (${CULORI_BRAND.join(', ')})`);
      if (typeof valoare !== 'string' || !HEX.test(valoare)) throw invalid(nume, `culori.${cheie} trebuie să fie hex #RRGGBB, între ghilimele`);
    }
  }
  const brand = { nume, mg: 1 };
  for (const cheie of ['tema', 'culori', 'font_titlu', 'font_text', 'ceata', 'eticheta', 'sigla', 'semnatura', 'personaj']) {
    if (meta[cheie] !== undefined && meta[cheie] !== null) brand[cheie] = meta[cheie];
  }
  if (brand.font_titlu !== undefined) brand.font_titlu = fontBrand(nume, brand.font_titlu, 'font_titlu');
  if (brand.font_text !== undefined) brand.font_text = fontBrand(nume, brand.font_text, 'font_text');
  if (brand.ceata !== undefined) brand.ceata = ceataBrand(nume, brand.ceata);
  if (brand.eticheta !== undefined) brand.eticheta = etichetaBrand(nume, brand.eticheta);
  // T1/T18: semnătura ajunge pe ecran și în blocul aprobat, deci e text; C03 și C04 o verifică apoi în valideaza.
  if (brand.semnatura !== undefined && (typeof brand.semnatura !== 'string' || brand.semnatura.trim() === '')) {
    throw invalid(nume, 'semnatura trebuie să fie un text nevid, între ghilimele (rândurile se despart cu \\n)');
  }
  brand.dir = dir;
  return brand;
}

/** Cu brand setat, câmpurile de stil care vin din brand nu mai au voie în date (spec 6.4). */
export function conflicteBrandDate(date, brand, numeSablon) {
  if (!brand) return [];
  const erori = [];
  const stil = date && typeof date.stil === 'object' && date.stil !== null ? date.stil : {};
  const conflict = (camp, ce) => erori.push(eroare('stil-contrazice-brand', camp,
    `Proiectul folosește brandul „${brand.nume}”, care stabilește ${ce}; câmpul ${camp} din date.json îl contrazice.`,
    `Șterge ${camp} din date.json; dacă vrei altă valoare, schimb-o în branduri/${brand.nume}/vizual.md.`));
  if (stil.tema !== undefined) conflict('stil.tema', 'tema');
  if (stil.culori && typeof stil.culori === 'object') {
    for (const cheie of Object.keys(stil.culori)) conflict(`stil.culori.${cheie}`, 'culorile');
  }
  if (stil.font_titlu !== undefined) conflict('stil.font_titlu', 'fontul titlurilor');
  if (date && date.sigla !== undefined) conflict('sigla', 'sigla');
  if (numeSablon === 'reel-ilustrat' && date && date.semnatura !== undefined) conflict('semnatura', 'semnătura');
  return erori;
}
