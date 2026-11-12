// Verificările pe build (spec 6.11, harta 4.15): C10 (motorul) și C17 (textele prezente static în build).
import fs from 'node:fs';
import path from 'node:path';
import { eroare } from '../erori.mjs';
import { sha256Fisier } from '../fisiere.mjs';
import { decodeazaHtml } from '../html.mjs';
import { rezultat } from './index.mjs';

const EXTENSII_TEXT = new Set(['.html', '.htm', '.js', '.mjs', '.css', '.json', '.svg', '.txt', '.xml']);
const ADRESA = /https?:\/\//g;
// Excepțiile din harta 4.15: declarațiile de spațiu de nume SVG nu sunt cereri de rețea.
const PERMISE = ['xmlns="http://www.w3.org/2000/svg"', 'http://www.w3.org/1999/xlink'];

function fisiereText(dir, prefix = '') {
  const rezultat_ = [];
  for (const intrare of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const relativ = prefix ? `${prefix}/${intrare.name}` : intrare.name;
    if (intrare.isDirectory()) rezultat_.push(...fisiereText(path.join(dir, intrare.name), relativ));
    else if (EXTENSII_TEXT.has(path.extname(intrare.name).toLowerCase())) rezultat_.push(relativ);
  }
  return rezultat_;
}

export const spatii = (s) => s.normalize('NFC').replace(/\s+/g, ' ').trim();

/**
 * Nodurile de text statice din HTML: fără script, style și comentarii, entitățile decodate, spațiile comprimate.
 * @param {string} html
 * @returns {string[]}
 */
function noduriText(html) {
  const fara = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const noduri = [];
  for (const m of fara.matchAll(/>([^<]+)</g)) {
    const text = spatii(decodeazaHtml(m[1]));
    if (text !== '') noduri.push(text);
  }
  return noduri;
}

/**
 * Adresele http(s) din fișierele text ale build-ului (C10, harta 4.15): o eroare build-cu-retea pe fișier.
 * Spațiile de nume SVG nu sunt cereri de rețea; copia GSAP e acceptată doar cu sha256-ul din VERSIUNI.json.
 * Planul I: o folosesc ambele adaptoare de motor.
 * @param {string} dirBuild
 * @param {{gsap: {sha256: string}}} versiuni
 * @returns {{erori: object[], fisiere: number}}
 */
export function scaneazaRetea(dirBuild, versiuni) {
  const erori = [];
  const fisiere = fisiereText(dirBuild);
  for (const relativ of fisiere) {
    const absolut = path.join(dirBuild, ...relativ.split('/'));
    // Copia fixată a GSAP conține adrese în comentariile de licență și în șiruri interne, fără cereri de rețea;
    // e acceptată numai dacă e exact fișierul din VERSIUNI.json (sha256).
    if (relativ === 'gsap.min.js' && sha256Fisier(absolut) === versiuni.gsap.sha256) continue;
    let text = fs.readFileSync(absolut, 'utf8');
    for (const permis of PERMISE) text = text.split(permis).join('');
    const gasite = text.match(ADRESA);
    if (gasite) {
      erori.push(eroare('build-cu-retea', `fisier:build/${relativ}`,
        `build/${relativ} conține ${gasite.length} ${gasite.length === 1 ? 'adresă' : 'adrese'} http(s); compoziția trebuie să meargă fără rețea.`,
        'Nu pune adrese web în date.json; dacă textul tău nu are niciuna, trimite lui Dănuț ieșirea comenzii.'));
    }
  }
  return { erori, fisiere: fisiere.length };
}

// C10 cere cod de ieșire 0 când check rulează cu argumentele șablonului (spec 7.4); un check fără --strict iese cu 0
// la avertismente, deci șabloanele vechi nu se schimbă.
function verificaC10({ dirBuild, check, versiuni }) {
  const erori = [];
  const asteptata = versiuni.motoare.hyperframes.versiune;
  const versiune = check?._meta?.version ?? null;
  if (versiune !== asteptata) {
    erori.push(eroare('motor-versiune', 'mediu.hyperframes',
      `hyperframes check a rulat cu versiunea ${versiune ?? 'necunoscută'}, dar kitul fixează ${asteptata}.`,
      'Rulează node nucleu/mg.mjs doctor; reinstalează motorul fixat din VERSIUNI.json.'));
  }
  const cod = typeof check?.cod === 'number' ? check.cod : 0;
  const toate = ['lint', 'runtime', 'layout', 'motion', 'contrast']
    .flatMap((cheie) => (check?.[cheie]?.findings ?? []).map((f) => `${cheie}/${f.code}`));
  const gasiri = ['lint', 'runtime', 'layout', 'motion', 'contrast']
    .flatMap((cheie) => (check?.[cheie]?.findings ?? []).filter((f) => f.severity === 'error').map((f) => (cheie === 'motion'
      // găsirile index.motion.json numesc selectorul din cronologie și mesajul lui HyperFrames (planul F, F7)
      ? `${cheie}/${f.code} (${f.selector ?? 'compoziția'}: ${f.message ?? ''})`
      : `${cheie}/${f.code}`)));
  if (check?.ok !== true || gasiri.length > 0) {
    erori.push(eroare('check-esuat', 'fisier:build/index.html',
      `hyperframes check a găsit probleme în compoziție${gasiri.length ? `: ${gasiri.join(', ')}` : ''}.`,
      'E o problemă a șablonului, nu a datelor: trimite lui Dănuț ieșirea lui node nucleu/mg.mjs randeaza <proiect> --doar-verificare --json.'));
  } else if (cod !== 0) {
    erori.push(eroare('check-esuat', 'fisier:build/index.html',
      `hyperframes check a ieșit cu cod de ieșire ${cod}${toate.length ? ` (${toate.join(', ')})` : ''}; cu --strict, și avertismentele opresc randarea.`,
      'E o problemă a șablonului, nu a datelor: trimite lui Dănuț ieșirea lui node nucleu/mg.mjs randeaza <proiect> --doar-verificare --json.'));
  }
  const retea = scaneazaRetea(dirBuild, versiuni);
  erori.push(...retea.erori);
  return rezultat('C10', erori.length === 0, {
    valoare: { versiune, ok_check: check?.ok === true, cod, fisiere: retea.fisiere },
    prag: { versiune: asteptata, erori_check: 0, cod: 0, adrese: 0 },
    camp: erori[0]?.camp ?? null,
    erori,
  });
}

function verificaC17({ dirBuild, asteptari }) {
  const noduri = new Set(noduriText(fs.readFileSync(path.join(dirBuild, 'index.html'), 'utf8')));
  const erori = [];
  for (const { ref, text } of asteptari.texte) {
    if (noduri.has(spatii(text))) continue;
    erori.push(eroare('text-lipsa-din-build', 'fisier:build/index.html',
      `${ref}: textul „${text}” nu apare ca text static în build/index.html.`,
      'E o problemă a șablonului, nu a datelor: trimite lui Dănuț ieșirea lui node nucleu/mg.mjs randeaza <proiect> --doar-verificare --json.'));
  }
  return rezultat('C17', erori.length === 0, {
    valoare: { texte: asteptari.texte.length, lipsa: erori.length },
    prag: { lipsa: 0 },
    camp: erori[0]?.camp ?? null,
    erori,
  });
}

/**
 * C10 și C17 pe un build construit.
 * @param {{dirBuild: string, asteptari: object, check: object, versiuni: object}} p
 *   asteptari = Asteptari (harta 5.9); check = RezultatCheck (harta 5.12); versiuni = VERSIUNI.json (harta 5.15)
 * @returns {object[]} [C10, C17]
 */
export function verificaBuild({ dirBuild, asteptari, check, versiuni }) {
  return [verificaC10({ dirBuild, check, versiuni }), verificaC17({ dirBuild, asteptari })];
}
