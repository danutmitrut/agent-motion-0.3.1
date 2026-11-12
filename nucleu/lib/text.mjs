// Igiena textului (C03), grafemele, accentul și timpul de citire (spec 6.3).
// Caracterele interzise apar aici numai ca secvențe \u{...}, ca testul texte-romana să nu le găsească în sursă.
import { eroare, avertisment } from './erori.mjs';
import { locPentruOm } from './schema.mjs';
import { rotunjeste } from './cronologie.mjs';

const SEGMENTATOR = new Intl.Segmenter('ro', { granularity: 'grapheme' });

const SEDILE = Object.freeze({
  '\u{15F}': '\u{219}', '\u{163}': '\u{21B}', '\u{15E}': '\u{218}', '\u{162}': '\u{21A}',
});
const RE_SEDILA = /[\u{15F}\u{163}\u{15E}\u{162}]/u;
const RE_SEDILA_TOATE = /[\u{15F}\u{163}\u{15E}\u{162}]/gu;
/**
 * Textul cu ș și ț scrise cu virgulă, sau null când nu are nicio sedilă.
 * @param {string} text
 * @returns {string|null}
 */
export function reparaSedila(text) {
  return RE_SEDILA.test(text) ? text.replace(RE_SEDILA_TOATE, (c) => SEDILE[c]) : null;
}

const RE_LINIUTA = /[\u{2014}\u{2013}]/u;
const RE_EMOJI = /\p{Extended_Pictographic}/u;
const RE_CONTROL = /[\x00-\x1F\x7F-\x9F]/u;
const RE_COD = /[<>{}]/u;

const CORECTII = Object.freeze({
  si: 'și', sa: 'să', fara: 'fără', dupa: 'după', pana: 'până',
  cand: 'când', asa: 'așa', intr: 'într', niste: 'niște',
});

/** @param {string} s @returns {number} */
export function grafeme(s) {
  let n = 0;
  for (const _ of SEGMENTATOR.segment(s)) n += 1;
  return n;
}

/** @param {string} s @returns {string} */
export function textAfisat(s) {
  return s.replaceAll('*', '');
}

/** @param {string} s @returns {number} */
export function numarCuvinte(s) {
  return textAfisat(s).split(/\s+/).filter(Boolean).length;
}

/** @param {string} text @returns {number} secunde, rotunjite la 3 zecimale */
export function timpCitire(text) {
  return rotunjeste(0.8 + 0.3 * numarCuvinte(text), 3);
}

/**
 * @param {string} s
 * @returns {{ segmente: Array<{text: string, accent: boolean}>, eroare: null|'accent-neinchis'|'accent-gol' }}
 */
export function parseazaAccent(s) {
  const bucati = s.split('*');
  const intreg = [{ text: textAfisat(s), accent: false }];
  if (bucati.length % 2 === 0) return { segmente: intreg, eroare: 'accent-neinchis' };
  const segmente = [];
  for (let i = 0; i < bucati.length; i += 1) {
    const accent = i % 2 === 1;
    if (accent && bucati[i].trim() === '') return { segmente: intreg, eroare: 'accent-gol' };
    if (bucati[i] !== '') segmente.push({ text: bucati[i], accent });
  }
  return { segmente, eroare: null };
}

/**
 * @param {string} text
 * @param {string} camp
 * @param {{permiteAccent?: boolean, loc?: string}} [optiuni] loc = cum numesc mesajele locul textului
 *   (implicit din camp; de exemplu „Semnătura din brandul „x””, când camp e 'brand')
 * @returns {{ erori: import('./erori.mjs').EroareMg[], avertismente: import('./erori.mjs').EroareMg[] }}
 */
export function verificaTextDate(text, camp, { permiteAccent = false, loc = locPentruOm(camp) } = {}) {
  const t = text.normalize('NFC');
  const erori = [];
  const avertismente = [];

  const reparat = reparaSedila(t);
  if (reparat !== null) {
    erori.push(eroare('sedila', camp,
      `${loc}: ș sau ț sunt scrise cu sedilă, nu cu virgulă dedesubt.`,
      `Scrie textul așa: „${reparat}”.`));
  }

  if (RE_LINIUTA.test(t)) {
    erori.push(eroare('liniuta-lunga', camp,
      `${loc}: textul are o linie de pauză lungă sau medie (U+2014 sau U+2013).`,
      'Înlocuiește linia cu o virgulă, cu două puncte sau cu paranteze.'));
  }

  if (RE_EMOJI.test(t)) {
    erori.push(eroare('emoji', camp,
      `${loc}: textul are un emoji sau o pictogramă.`,
      'Scoate emoji-ul; accentul vizual vine din temă și din desene.'));
  }

  if (RE_CONTROL.test(t) || RE_COD.test(t)) {
    erori.push(eroare('text-cu-cod', camp,
      `${loc}: textul are caractere de cod (< > { }), tab sau rând nou.`,
      'Scrie textul simplu, pe un singur rând, fără < > { }.'));
  } else if (!permiteAccent && t.includes('*')) {
    erori.push(eroare('text-cu-cod', camp,
      `${loc}: steluța marchează accentul și nu e permisă în acest câmp.`,
      'Scoate * din text; accentul se pune doar în câmpurile care îl acceptă (SABLON.md, rubrica 3; la reel, doar în titlu).'));
  }

  if (permiteAccent && t.includes('*')) {
    const { eroare: problema } = parseazaAccent(t);
    if (problema === 'accent-neinchis') {
      erori.push(eroare('accent-neinchis', camp,
        `${loc}: accentul deschis cu * nu e închis.`,
        'Adaugă * la finalul segmentului accentuat sau scoate * de la început.'));
    } else if (problema === 'accent-gol') {
      erori.push(eroare('accent-gol', camp,
        `${loc}: între steluțe nu e niciun cuvânt.`,
        'Pune textul accentuat între steluțe sau scoate steluțele.'));
    }
  }

  const cuvinte = t.toLowerCase().match(/\p{L}+/gu) ?? [];
  const gasite = [...new Set(cuvinte.filter((c) => Object.hasOwn(CORECTII, c)))];
  if (gasite.length > 0) {
    avertismente.push(avertisment('fara-diacritice', camp,
      `${loc}: cuvinte fără diacritice: ${gasite.join(', ')}.`,
      `Scrie cu diacritice: ${gasite.map((c) => CORECTII[c]).join(', ')}.`));
  }

  return { erori, avertismente };
}

/**
 * @param {object} date
 * @param {Array<{camp: string, text: string, permiteAccent?: boolean, loc?: string}>} campuriText
 * @returns {{cod: 'C03', ok: boolean, valoare: {texte: number}, prag: null, camp: string|null, erori: object[], avertismente: object[]}}
 */
export function verificaTexteDate(date, campuriText) {
  const erori = [];
  const avertismente = [];
  for (const { camp, text, permiteAccent = false, loc } of campuriText) {
    const r = verificaTextDate(text, camp, { permiteAccent, ...(loc !== undefined ? { loc } : {}) });
    erori.push(...r.erori);
    avertismente.push(...r.avertismente);
  }
  return {
    cod: 'C03',
    ok: erori.length === 0,
    valoare: { texte: campuriText.length },
    prag: null,
    camp: erori.length > 0 ? erori[0].camp : null,
    erori,
    avertismente,
  };
}
