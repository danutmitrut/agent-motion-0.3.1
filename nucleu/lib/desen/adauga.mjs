// `mg desen adauga`: piesele proprii ale cursantului (spec 8.6), cu normalizarea SVG minimă, fără svgo (harta 9.6).
import { readFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { eroare, EroareFatala, COD_IESIRE } from '../erori.mjs';
import { sha256Text, sha256Fisier, scrieJsonAtomic, scrieTextAtomic, citesteJson, citesteText, existaFisier } from '../fisiere.mjs';
import { luminantaRelativa } from '../contrast.mjs';
import { escapeazaHtml, decodeazaHtml, deschidereSvg } from '../html.mjs';
import { ROLURI, clasaContur } from './roluri.mjs';
import { incarcaCatalog, gasestePiesa } from './catalog.mjs';

const CAMP = 'argumente.fisier';
const RASTER = Object.freeze({ '.png': 'png', '.jpg': 'jpg', '.jpeg': 'jpg', '.webp': 'webp' });
const NUME_CULORI = Object.freeze({ black: '#000000', white: '#ffffff' });
const FARA_CULOARE = new Set(['none', 'transparent', 'currentcolor', 'inherit']);

function periculos(motiv) {
  return eroare('desen-svg-periculos', CAMP, `SVG-ul conține ${motiv}, care nu are voie într-un desen.`,
    'Exportă desenul din nou ca SVG simplu, doar cu forme (path, circle, rect), fără scripturi, imagini sau linkuri.');
}

/** '#ABC', '#aabbcc', 'black', 'rgb(1, 2, 3)' → '#aabbcc'; altceva → null. */
function normalizeazaCuloare(valoare) {
  const v = valoare.trim().toLowerCase();
  if (NUME_CULORI[v]) return NUME_CULORI[v];
  if (/^#[0-9a-f]{3}$/.test(v)) return '#' + [...v.slice(1)].map((c) => c + c).join('');
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  const m = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/.exec(v);
  if (m) return '#' + m.slice(1, 4).map((x) => Math.min(255, Number(x)).toString(16).padStart(2, '0')).join('');
  return null;
}

const ELEMENTE_PERMISE = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'defs', 'title', 'desc', 'metadata']);
// T15: textul dintr-un desen ar ocoli verificările de text și aprobarea; textele din film stau doar în date.json.
const ELEMENTE_TEXT = new Set(['text', 'tspan', 'textPath']);
// Elemente inofensive, dar care cer referințe interne: normalizarea nu le poate păstra (id-urile se șterg).
const ELEMENTE_FARA_SUPORT = new Set(['style', 'use', 'linearGradient', 'radialGradient', 'clipPath', 'mask', 'pattern', 'symbol', 'filter', 'marker', 'stop']);
// Un tag, cu ghilimelele respectate: `>` dintr-o valoare între ghilimele nu închide tagul.
const TAG = /<(\/?)([a-zA-Z][^\s/>]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g;
const ATRIBUT = /([^\s=/"'<>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

/** Atributele unui tag, în ordine, parsate ca un browser: separatorul poate fi orice (spațiu, `/`, ghilimea). */
function citesteAtribute(text) {
  const atribute = [];
  let autoInchis = /\/\s*$/.test(text);
  const sfarsit = text.trimEnd().length;
  for (const m of text.matchAll(ATRIBUT)) {
    let valoare = m[2] ?? m[3] ?? m[4] ?? '';
    // `d=x/>`: la un browser `/` face parte din valoare, în XML închide tagul; ieșirea e scrisă fără echivoc
    if (m[4] !== undefined && m.index + m[0].length === sfarsit && valoare.endsWith('/')) {
      valoare = valoare.slice(0, -1);
      autoInchis = true;
    }
    atribute.push({ nume: m[1], valoare });
  }
  return { atribute, autoInchis };
}

const referintaExterna = (valoare) => [...valoare.matchAll(/url\(\s*["']?\s*(.?)/gi)].some((m) => m[1] !== '#');
const referintaInterna = (valoare) => /url\(\s*["']?\s*#/i.test(valoare);

/** Motivul pentru care un atribut nu are voie într-un desen, sau null. */
function motivAtributPericulos({ nume, valoare }) {
  if (/^(?:[\w-]+:)?on[a-z]+$/i.test(nume)) return `un atribut de eveniment (${nume})`;
  if (/(?:^|:)href$/i.test(nume) && !valoare.trim().startsWith('#')) return `un link extern (${nume}="${valoare}")`;
  if (/&(?!(?:amp|lt|gt|quot|apos);)/.test(valoare)) return `o referință de caracter în atributul ${nume}`;
  if (valoare.includes('\\')) return `un caracter de scăpare (\\) în atributul ${nume}`;
  if (referintaExterna(valoare)) return `o referință url() externă în atributul ${nume}`;
  return null;
}

/** Scoate elementele de editor `sodipodi:*` și `inkscape:*`, cu tot cu conținut. */
function scoateElementeEditor(text) {
  const deschidere = /<((?:sodipodi|inkscape):[\w.-]+)((?:"[^"]*"|'[^']*'|[^'">])*)>/;
  let rez = text;
  for (let m = deschidere.exec(rez); m; m = deschidere.exec(rez)) {
    let sfarsit = m.index + m[0].length;
    if (!/\/\s*$/.test(m[2])) {
      const nume = m[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const inchidere = new RegExp(`</${nume}\\s*>`).exec(rez.slice(sfarsit));
      if (inchidere) sfarsit += inchidere.index + inchidere[0].length;
    }
    rez = rez.slice(0, m.index) + rez.slice(sfarsit);
  }
  return rez.replace(/<\/(?:sodipodi|inkscape):[\w.-]+\s*>/g, '');
}

/** Culorile de umplere și contur ale unui element: atributele `fill`/`stroke` și proprietățile din `style`. */
function culoriElement(atribute) {
  const rez = [];
  for (const { nume, valoare } of atribute) {
    if (nume === 'fill' || nume === 'stroke') rez.push(valoare);
    else if (nume === 'style') {
      for (const m of valoare.matchAll(/(?:^|;)\s*(?:fill|stroke)\s*:\s*([^;]+)/g)) rez.push(m[1]);
    }
  }
  return rez;
}

/** Rolurile după luminanță: cea mai închisă `ink`, albul `fond`, restul `acc` (spec 8.6). */
function roluriDupaLuminanta(culori) {
  const ordonate = [...culori].sort((a, b) => luminantaRelativa(a.toUpperCase()) - luminantaRelativa(b.toUpperCase()) || a.localeCompare(b));
  const roluri = new Map();
  ordonate.forEach((c, i) => {
    if (i === 0) roluri.set(c, 'ink');
    else if (c === '#ffffff') roluri.set(c, 'fond');
    else roluri.set(c, 'acc');
  });
  return roluri;
}

/** Înlocuiește culorile unui element cu clase de rol: umplerea → `<rol>`, conturul → `<rol>-contur`. */
function recoloreaza(atribute, roluri) {
  const clase = [];
  const rez = [];
  for (const a of atribute) {
    if (a.nume === 'fill' || a.nume === 'stroke') {
      const c = normalizeazaCuloare(a.valoare);
      if (c && roluri.has(c)) {
        clase.push(a.nume === 'fill' ? roluri.get(c) : clasaContur(roluri.get(c)));
        continue;
      }
    } else if (a.nume === 'style') {
      const ramase = a.valoare.split(';').filter((decl) => {
        const m = /^\s*(fill|stroke)\s*:\s*(.+)$/.exec(decl);
        if (!m) return decl.trim() !== '';
        const c = normalizeazaCuloare(m[2]);
        if (!c || !roluri.has(c)) return true;
        clase.push(m[1] === 'fill' ? roluri.get(c) : clasaContur(roluri.get(c)));
        return false;
      });
      if (ramase.length === 0) continue;
      rez.push({ nume: 'style', valoare: ramase.join(';').trim() });
      continue;
    }
    rez.push(a);
  }
  if (clase.length === 0) return rez;
  const unice = [...new Set(clase)].join(' ');
  const existenta = rez.find((a) => a.nume === 'class');
  if (existenta) {
    existenta.valoare = `${existenta.valoare} ${unice}`.trim();
    return rez;
  }
  return [{ nume: 'class', valoare: unice }, ...rez];
}

// Valorile se scriu prin escapeazaHtml (neutralizează și < >), după decodarea celor cinci entități permise de
// motivAtributPericulos, ca o entitate din sursă să nu fie escapată a doua oară (revizuirea transversală B01-B13, T11).
const scrieTag = (nume, atribute, autoInchis) =>
  `<${nume}${atribute.map((a) => ` ${a.nume}="${escapeazaHtml(decodeazaHtml(a.valoare))}"`).join('')}${autoInchis ? '/' : ''}>`;

function formatNeacceptat(mesaj, sugestie) {
  return { svg: '', culori: [], erori: [eroare('desen-format-neacceptat', CAMP, mesaj, sugestie)] };
}

/**
 * Normalizarea minimă a unui SVG propriu, fără svgo. Ieșirea e scrisă din elementele și atributele verificate,
 * nu e textul original: doar elemente dintr-o listă permisă, fără atribute de eveniment, fără linkuri sau url() externe.
 * @param {string} text
 * @param {{mapare?: boolean}} [optiuni] `mapare: false` păstrează culorile originale (cursantul a refuzat maparea)
 * @returns {{svg: string, culori: string[], erori: import('../erori.mjs').EroareMg[]}}
 */
export function normalizeazaSvg(text, { mapare = true } = {}) {
  const sursa = String(text).replace(/^\u{FEFF}/u, '').replace(/<!--[\s\S]*?-->/g, '');
  const respinge = (motiv) => ({ svg: '', culori: [], erori: [periculos(motiv)] });
  if (/<!ENTITY/i.test(sursa)) return respinge('definiții de entități (<!ENTITY>)');
  if (/javascript:/i.test(sursa)) return respinge('un link javascript:');

  const deschidere = deschidereSvg(sursa);
  let inchidere = null;
  for (const m of sursa.matchAll(/<\/svg\s*>/g)) inchidere = m;
  if (!deschidere || !inchidere || inchidere.index < deschidere.index + deschidere.tag.length) {
    return formatNeacceptat('Fișierul nu conține un element <svg> complet.', 'Dă un fișier .svg valid, exportat dintr-un program de desen.');
  }

  const corp = scoateElementeEditor(sursa.slice(deschidere.index, inchidere.index + inchidere[0].length)
    .replace(/<(title|desc|metadata)(?=[\s/>])[^>]*\/>/g, '')
    .replace(/<(title|desc|metadata)(?=[\s/>])[\s\S]*?<\/\1\s*>/g, ''));

  // Parcurgerea tagurilor: verificare și rescriere într-un singur pas.
  const elemente = [];
  let ultimul = 0;
  let malformat = false;
  let faraSuport = null;
  let referinteInterne = false;
  for (const m of corp.matchAll(TAG)) {
    const inainte = corp.slice(ultimul, m.index);
    if (inainte.includes('<')) malformat = true;
    ultimul = m.index + m[0].length;
    const [, inchis, nume, restul] = m;
    if (ELEMENTE_TEXT.has(nume)) {
      return formatNeacceptat(
        `SVG-ul conține text (<${nume}>). Textele din film se scriu în date.json, ca să treacă prin verificări și prin aprobarea ta; un text din desen le-ar ocoli.`,
        'Transformă textul în contururi (în Inkscape: Traseu, „Obiect în traseu”; în Illustrator: Text, „Creează contururi”) sau scoate-l din desen, apoi adaugă piesa din nou.',
      );
    }
    if (!ELEMENTE_PERMISE.has(nume)) {
      if (ELEMENTE_FARA_SUPORT.has(nume)) faraSuport ??= nume;
      else return respinge(`elementul <${nume}>`);
    }
    if (inchis) {
      elemente.push({ inainte, text: `</${nume}>` });
      continue;
    }
    const { atribute, autoInchis } = citesteAtribute(restul);
    for (const a of atribute) {
      const motiv = motivAtributPericulos(a);
      if (motiv) return respinge(motiv);
      if (/(?:^|:)href$/i.test(a.nume) || referintaInterna(a.valoare)) referinteInterne = true;
    }
    elemente.push({ inainte, nume, atribute, autoInchis });
  }
  const coada = corp.slice(ultimul);
  if (coada.includes('<')) malformat = true;

  if (malformat) {
    return formatNeacceptat('SVG-ul are marcaje pe care nu le pot citi sigur (un tag neînchis, CDATA sau instrucțiuni de procesare).', 'Exportă desenul din nou ca SVG simplu, fără CDATA.');
  }
  const radacina = elemente[0];
  const vb = radacina.atribute.find((a) => a.nume === 'viewBox')?.valoare.trim().split(/[\s,]+/).map(Number);
  if (!vb || vb.length !== 4 || vb.some((n) => !Number.isFinite(n)) || vb[2] <= 0 || vb[3] <= 0) {
    return { svg: '', culori: [], erori: [eroare('desen-fara-viewbox', CAMP, 'SVG-ul nu are viewBox valid, deci nu se poate scala corect.', 'Exportă desenul din nou cu viewBox (în Inkscape: Proprietăți document, „Scalare”; în Illustrator: Export ca SVG, cu „Responsive”).')] };
  }
  if (faraSuport || referinteInterne) {
    return formatNeacceptat(`SVG-ul folosește ${faraSuport ? `elementul <${faraSuport}>` : 'referințe interne'} (stiluri CSS, gradiente, măști, <use>), pe care normalizarea simplă nu le poate păstra.`,
      'Exportă desenul cu culori plate puse ca atribute (în Illustrator: Stiluri, „Atribute de prezentare”).');
  }

  radacina.atribute = radacina.atribute.filter((a) => a.nume !== 'width' && a.nume !== 'height');
  for (const e of elemente) if (e.atribute) e.atribute = e.atribute.filter((a) => a.nume !== 'id');

  const culori = new Set();
  let necunoscute = false;
  for (const e of elemente) {
    for (const valoare of culoriElement(e.atribute ?? [])) {
      const v = valoare.trim().toLowerCase();
      if (FARA_CULOARE.has(v)) continue;
      const c = normalizeazaCuloare(v);
      if (c) culori.add(c); else necunoscute = true;
    }
  }
  const lista = [...culori].sort();
  if (mapare && lista.length >= 1 && lista.length <= 3 && !necunoscute) {
    const roluri = roluriDupaLuminanta(lista);
    for (const e of elemente) if (e.atribute) e.atribute = recoloreaza(e.atribute, roluri);
  }
  // textul dintre taguri se păstrează ca atare
  const svg = elemente.map((e) => e.inainte + (e.text ?? scrieTag(e.nume, e.atribute, e.autoInchis))).join('') + coada;
  return { svg: svg.trim() + '\n', culori: lista, erori: [] };
}

function slug(text) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 38);
}

/** Lățimea și înălțimea unei imagini PNG, JPG sau WebP, din antet. */
function dimensiuniRaster(buf, format) {
  if (format === 'png' && buf.length > 24 && buf.toString('latin1', 1, 4) === 'PNG') return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (format === 'jpg' && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i += 1; continue; }
      const marcaj = buf[i + 1];
      if (marcaj >= 0xc0 && marcaj <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marcaj)) return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  if (format === 'webp' && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') {
    const bucata = buf.toString('latin1', 12, 16);
    if (bucata === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
    if (bucata === 'VP8L') {
      const [b0, b1, b2, b3] = [buf[21], buf[22], buf[23], buf[24]];
      return { w: 1 + (((b1 & 0x3f) << 8) | b0), h: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)) };
    }
    if (bucata === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
  }
  return null;
}

function fatala(cod, camp, mesaj, sugestie, codIesire) {
  return new EroareFatala(eroare(cod, camp, mesaj, sugestie), codIesire);
}

/** Octeții unei imagini; un fișier care lipsește dă fisier-necitibil, ca la citesteText (C01). */
function citesteOcteti(fisier) {
  try {
    return readFileSync(fisier);
  } catch (e) {
    throw fatala('fisier-necitibil', `fisier:${basename(fisier)}`, `Fișierul ${basename(fisier)} nu poate fi citit (${e.code || e.message}).`,
      'Verifică dacă fișierul există la calea aceasta și nu e deschis în alt program.', COD_IESIRE.DATE);
  }
}

/**
 * Adaugă o piesă în proprii/ și în proprii/catalog-propriu.json.
 * @param {string} radacina
 * @param {string} fisier cale absolută spre SVG, PNG, JPG sau WebP
 * @param {{licenta: string, etichete: string[], id?: string, faraMapare?: boolean, extra?: object}} optiuni
 *   extra = câmpuri puse peste cele implicite, în aceeași scriere a catalogului (mg genereaza: proveniența)
 * @returns {Promise<object>} piesa scrisă în catalog
 */
export async function adaugaPiesa(radacina, fisier, { licenta, etichete, id, faraMapare = false, extra = {} } = {}) {
  if (typeof licenta !== 'string' || licenta.trim() === '') {
    throw fatala('desen-licenta-lipsa', 'argumente.licenta', 'Piesa nu are licență; fără ea nu intră în proprii/.',
      'Adaugă --licenta "<de unde e desenul>", de exemplu „desenul meu” sau „cumpărat de pe X”.', COD_IESIRE.UTILIZARE);
  }
  const lista = [...new Set((Array.isArray(etichete) ? etichete : []).map((e) => String(e).trim()).filter(Boolean))];
  if (lista.length < 4) {
    throw fatala('desen-etichete-putine', 'argumente.etichete', `Piesa are ${lista.length} etichete; trebuie cel puțin 4, ca să fie găsită la căutare.`,
      'Adaugă --etichete "<e1,e2,e3,e4>", cuvinte în română, cu diacritice.', COD_IESIRE.UTILIZARE);
  }
  const extensie = extname(fisier).toLowerCase();
  const raster = RASTER[extensie];
  if (extensie !== '.svg' && !raster) {
    throw fatala('desen-format-neacceptat', CAMP, `Formatul „${extensie || 'fără extensie'}” nu e acceptat.`,
      'Dă un fișier .svg, .png, .jpg sau .webp.', COD_IESIRE.UTILIZARE);
  }
  const idPiesa = id ?? `p-${slug(basename(fisier, extname(fisier)))}`;
  if (!/^p-[a-z0-9][a-z0-9-]{0,38}$/.test(idPiesa)) {
    throw fatala('valoare-invalida', 'argumente.id', `Id-ul „${idPiesa}” nu e valid.`,
      'Dă --id p-<nume>, doar litere mici fără diacritice, cifre și cratime.', COD_IESIRE.UTILIZARE);
  }
  if (gasestePiesa(incarcaCatalog(radacina), idPiesa)) {
    throw fatala('valoare-invalida', 'argumente.id', `Există deja o piesă cu id-ul „${idPiesa}”.`,
      'Dă alt id cu --id p-<nume>.', COD_IESIRE.UTILIZARE);
  }

  const dirProprii = join(radacina, 'proprii');
  let piesa;
  if (raster) {
    const continut = citesteOcteti(fisier);
    const dim = dimensiuniRaster(continut, raster);
    if (!dim) {
      throw fatala('desen-format-neacceptat', CAMP, `Fișierul nu e o imagine ${raster.toUpperCase()} validă.`,
        'Exportă imaginea din nou sau dă un fișier .svg.', COD_IESIRE.DATE);
    }
    const relativ = `imagini/${idPiesa}.${raster}`;
    mkdirSync(join(dirProprii, 'imagini'), { recursive: true });
    copyFileSync(fisier, join(dirProprii, relativ));
    piesa = { id: idPiesa, tip: 'forma', familie: 'proprie', sursa: 'proprie', original: basename(fisier), fisier: relativ,
      sha256: sha256Fisier(fisier),
      kb: Math.round((continut.length / 1024) * 10) / 10, cutie: dim, roluri: [], recolorabil: false };
  } else {
    const { svg, erori } = normalizeazaSvg(citesteText(fisier), { mapare: !faraMapare });
    if (erori.length) throw new EroareFatala(erori[0], COD_IESIRE.DATE);
    const cuId = svg.replace(/^<svg\b/i, `<svg data-piesa="${idPiesa}"`);
    const vb = /\sviewBox\s*=\s*["']([^"']+)["']/.exec(cuId)[1].trim().split(/[\s,]+/).map(Number);
    const relativ = `forme/${idPiesa}.svg`;
    scrieTextAtomic(join(dirProprii, relativ), cuId);
    // un rol e prezent cu umplere (`ink`) sau doar cu contur (`ink-contur`): \b potrivește pe amândouă
    const roluri = ROLURI.filter((r) => new RegExp(`class="[^"]*\\b${r}\\b`).test(cuId));
    piesa = { id: idPiesa, tip: 'forma', familie: 'proprie', sursa: 'proprie', original: basename(fisier), fisier: relativ,
      sha256: sha256Text(cuId), kb: Math.round((Buffer.byteLength(cuId) / 1024) * 10) / 10,
      cutie: { w: Math.round(vb[2]), h: Math.round(vb[3]) }, roluri, recolorabil: roluri.length > 0 };
  }
  mkdirSync(join(dirProprii, 'originale'), { recursive: true });
  copyFileSync(fisier, join(dirProprii, 'originale', `${idPiesa}${extensie}`));
  Object.assign(piesa, {
    acoperire_cerneala: null, licenta: licenta.trim(), personaj: null, etichete: lista, descriere: '',
    noapte: 'autocolant', teme_potrivite: ['noapte', 'hartie', 'curat'],
    animatie: piesa.recolorabil
      ? { implicit: 'contur-umplere', alternative: ['aparitie'], esalonare: 0.06, accent: 'aparitie' }
      : { implicit: 'aparitie', alternative: [], esalonare: 0, accent: 'aparitie' },
  }, extra);
  const caleCatalog = join(dirProprii, 'catalog-propriu.json');
  const catalog = existaFisier(caleCatalog) ? citesteJson(caleCatalog) : { versiune: 1, piese: [] };
  catalog.piese = [...catalog.piese.filter((p) => p.id !== idPiesa), piesa].sort((a, b) => a.id.localeCompare(b.id));
  scrieJsonAtomic(caleCatalog, catalog);
  return piesa;
}
