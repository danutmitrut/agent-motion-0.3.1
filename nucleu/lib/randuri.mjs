// Măsurarea și ruperea rândurilor (spec 7.2, punctul 3; planul F, F8). Lacom, ca browserul la white-space: normal,
// cu o singură regulă în plus: niciun rând nu se termină într-un cuvânt scurt românesc când mutarea lui pe rândul următor încape.
import { metriciFont } from './fonturi.mjs';
import { parseazaAccent, textAfisat } from './text.mjs';
import { rotunjeste } from './cronologie.mjs';

export const CUVINTE_SCURTE = Object.freeze([
  'și', 'în', 'de', 'la', 'cu', 'pe', 'a', 'o', 'un', 'să', 'nu', 'că', 'ca', 'iar', 'sau', 'dar', 'din', 'prin', 'spre', 'pentru',
]);
const SCURTE = new Set(CUVINTE_SCURTE);

/**
 * Funcția de măsurare a unui rând, pe textul afișat (fără *), cu fontkit (metriciFont) și letter-spacing în em.
 * @param {string} radacina
 * @param {{font: string|{fisier: string, familie: string}, greutate: number, marime: number, spatiereEm?: number}} p
 * @returns {(text: string) => number} lățimea în px
 */
export function masuratorRand(radacina, { font, greutate, marime, spatiereEm = 0 }) {
  const m = metriciFont(radacina, font, greutate);
  return (text) => m.latime(textAfisat(text), marime, spatiereEm);
}

// Spațiile la care se poate rupe rândul: orice spațiu alb, în afară de spațiul nedespărțitor (U+00A0) și de cel îngust (U+202F),
// care țin cuvintele împreună, ca în browser.
const SEPARATOR = /([^\S\u00A0\u202F]+)/;
const ESTE_SEPARATOR = /^[^\S\u00A0\u202F]+$/;

/**
 * Cuvintele cu starea accentului la fiecare caracter: [{ afisat, bucati: [{text, accent, nr}] }].
 * nr e indicele accentului în textul sursă (0, 1, ..., în ordinea din parseazaAccent); null pe bucățile fără accent.
 */
function cuvinteCuAccent(text) {
  const { segmente } = parseazaAccent(text);
  const cuvinte = [];
  let curent = null;
  let accente = 0;
  for (const s of segmente) {
    const nr = s.accent ? accente++ : null;
    for (const parte of s.text.split(SEPARATOR)) {
      if (parte === '') continue;
      if (ESTE_SEPARATOR.test(parte)) {
        curent = null;
        continue;
      }
      if (!curent) {
        curent = { afisat: '', bucati: [] };
        cuvinte.push(curent);
      }
      curent.afisat += parte;
      const ultima = curent.bucati[curent.bucati.length - 1];
      if (ultima && ultima.accent === s.accent && ultima.nr === nr) ultima.text += parte;
      else curent.bucati.push({ text: parte, accent: s.accent, nr });
    }
  }
  return cuvinte;
}

/**
 * Segmentele unui rând: cuvintele unite cu spațiu, cu bucățile lipite doar când au același accent și același nr.
 * Un segment accentuat are nr (indicele accentului din sursă); unul fără accent nu are cheia nr.
 */
function segmenteRand(cuvinte) {
  const segmente = [];
  const adauga = (text, accent, nr) => {
    const ultim = segmente[segmente.length - 1];
    if (ultim && ultim.accent === accent && (ultim.nr ?? null) === nr) ultim.text += text;
    else segmente.push(accent ? { text, accent, nr } : { text, accent });
  };
  cuvinte.forEach((c, i) => {
    if (i > 0) {
      // spațiul ia accentul doar dacă e în interiorul aceluiași accent
      const inainte = cuvinte[i - 1].bucati.at(-1);
      const dupa = c.bucati[0];
      if (inainte.accent && dupa.accent && inainte.nr === dupa.nr) adauga(' ', true, inainte.nr);
      else adauga(' ', false, null);
    }
    for (const b of c.bucati) adauga(b.text, b.accent, b.nr);
  });
  return segmente;
}

const esteScurt = (cuvant) => SCURTE.has(cuvant.afisat.toLocaleLowerCase('ro'));

/**
 * @param {string} text cu accentul opțional *...* (deja validat de verificaTextDate)
 * @param {{latimeMax: number, masoara: (s: string) => number, maxRanduri?: number}} optiuni
 */
export function rupeRanduri(text, { latimeMax, masoara, maxRanduri = Infinity }) {
  const cuvinte = cuvinteCuAccent(String(text));
  const lat = (lista) => masoara(lista.map((c) => c.afisat).join(' '));
  for (const c of cuvinte) {
    const l = masoara(c.afisat);
    if (l > latimeMax) return { ok: false, motiv: 'cuvant-prea-lung', cuvant: c.afisat, latime: rotunjeste(l, 3) };
  }
  // 1. lacom
  const randuri = [];
  let curent = [];
  for (const c of cuvinte) {
    if (curent.length > 0 && lat([...curent, c]) > latimeMax) {
      randuri.push(curent);
      curent = [c];
    } else {
      curent.push(c);
    }
  }
  if (curent.length > 0) randuri.push(curent);
  // 2. cuvintele scurte de la capăt trec pe rândul următor, cât timp acolo încape și pe rândul lor rămâne ceva
  for (let i = 0; i < randuri.length - 1; i += 1) {
    while (randuri[i].length > 1 && esteScurt(randuri[i][randuri[i].length - 1])) {
      const mutat = randuri[i][randuri[i].length - 1];
      if (lat([mutat, ...randuri[i + 1]]) > latimeMax) break;
      randuri[i] = randuri[i].slice(0, -1);
      randuri[i + 1] = [mutat, ...randuri[i + 1]];
    }
  }
  const rezultat = randuri.map((r) => ({ text: r.map((c) => c.afisat).join(' '), segmente: segmenteRand(r), latime: rotunjeste(lat(r), 3) }));
  if (rezultat.length > maxRanduri) return { ok: false, motiv: 'prea-multe-randuri', randuri: rezultat, necesare: rezultat.length };
  return { ok: true, randuri: rezultat };
}
