// Casetele reale ale textelor reelului pe ecran, pentru C13 (decizia lui Dănuț din 2026-10-05, B17), și lățimea
// rândurilor din carduri, pentru regula de lățime din C04 (decizia din 2026-10-06).
// Singura sursă a pozițiilor și a mărimilor e CSS-ul din sablon.html (aceleași reguli pe care le aplică browserul):
// aici doar se citesc, nu se copiază. Lățimea textului vine din metricile fontului rezolvat (fontkit), cu letter-spacing.
import { metriciFont } from '../../../../nucleu/lib/sdk.mjs';

/** Regulile pe un rând din <style>: `selector { decl; decl; }` → Map(selector → {proprietate: valoare}). */
function reguliCss(sablonHtml) {
  const stil = /<style>([\s\S]*?)<\/style>/.exec(sablonHtml)?.[1] ?? '';
  const reguli = new Map();
  for (const [, selector, corp] of stil.matchAll(/^[ \t]*([^{}\n/@][^{}\n]*?)\s*\{([^{}\n]*)\}[ \t]*$/gm)) {
    const declaratii = {};
    for (const d of corp.split(';')) {
      const i = d.indexOf(':');
      if (i > 0) declaratii[d.slice(0, i).trim()] = d.slice(i + 1).trim();
    }
    reguli.set(selector.trim(), declaratii);
  }
  return reguli;
}

/**
 * Valoarea unei declarații din sablon.html; aruncă dacă lipsește, ca o schimbare de CSS să nu lase casete vechi.
 * @returns {string}
 */
function declaratie(reguli, selector, proprietate) {
  const v = reguli.get(selector)?.[proprietate];
  if (v === undefined) throw new Error(`sablon.html nu mai are „${selector} { ${proprietate} }”, din care se calculează casetele textelor (C13).`);
  return v;
}

// un număr zecimal întreg format (12, 1.15, .035, -4); „1.2.3” sau „1e999” nu trec
const NUMAR = '-?(?:\\d+(?:\\.\\d+)?|\\.\\d+)';

/** Eroarea comună: ce selector, ce proprietate și ce valoare nu se poate folosi pentru casetele C13. */
function valoareGresita(selector, proprietate, valoare, asteptat) {
  return new Error(`sablon.html: „${selector} { ${proprietate}: ${valoare} }” nu se poate folosi pentru casetele textelor (C13); se așteaptă ${asteptat}.`);
}

/** Un număr cu unitatea dată (sau fără unitate, cu unitate ''), finit; altfel aruncă cu proprietatea și valoarea. */
function numarCss(valoare, unitate, selector, proprietate, asteptat) {
  const m = new RegExp(`^(${NUMAR})${unitate}$`).exec(String(valoare).trim());
  const n = m ? Number(m[1]) : NaN;
  if (!Number.isFinite(n)) throw valoareGresita(selector, proprietate, valoare, asteptat);
  return n;
}

function px(valoare, selector, proprietate) {
  return numarCss(valoare, 'px', selector, proprietate, 'o valoare în px (de exemplu 96px)');
}

/** '-.035em' → -0.035; '0' → 0; var(--eticheta-spatiere) → spatierea etichetei din stil. */
function em(valoare, stil, selector) {
  if (valoare === '0') return 0;
  if (valoare === 'var(--eticheta-spatiere)') {
    const n = stil.eticheta?.spatiere;
    if (!Number.isFinite(n)) throw valoareGresita(selector, 'letter-spacing', `${valoare} = ${n}`, 'un număr finit în stilul etichetei');
    return n;
  }
  return numarCss(valoare, 'em', selector, 'letter-spacing', 'o valoare în em (de exemplu -.035em) sau 0');
}

/** var(--font-titlu) / var(--font-text) → fontul rezolvat din stil (id de catalog sau font de brand). */
function fontRol(valoare, stil) {
  if (valoare === 'var(--font-titlu)') return stil.font_titlu;
  if (valoare === 'var(--font-text)') return stil.font_text;
  throw new Error(`Valoare CSS neașteptată pentru font-family: ${valoare}.`);
}

/**
 * Geometria textelor din sablon.html: cardul, eticheta, rândurile, cuvintele, îndemnul și semnătura.
 * @param {string} sablonHtml
 */
export function geometrieTexte(sablonHtml) {
  const r = reguliCss(sablonHtml);
  const pxDin = (selector, proprietate) => px(declaratie(r, selector, proprietate), selector, proprietate);
  const tipar = (selector, implicit = {}) => {
    const inaltimeRand = r.get(selector)?.['line-height'] ?? implicit['line-height'] ?? 'normal';
    return {
      selector,
      font: declaratie(r, selector, 'font-family'),
      // font-weight numeric (400, 700): metricile fontului se aleg după greutate; „bold” nu se ghicește
      greutate: numarCss(declaratie(r, selector, 'font-weight'), '', selector, 'font-weight', 'o greutate numerică (de exemplu 700)'),
      marime: pxDin(selector, 'font-size'),
      // line-height: un factor fără unitate (1.04) sau normal; „104px” ar da o casetă greșită, deci se refuză
      inaltimeRand: inaltimeRand === 'normal' ? 'normal'
        : numarCss(inaltimeRand, '', selector, 'line-height', 'un factor fără unitate (de exemplu 1.04) sau normal'),
      spatiere: r.get(selector)?.['letter-spacing'] ?? implicit['letter-spacing'] ?? '0',
    };
  };
  const h = tipar('.h');
  return {
    card: { x: pxDin('.card', 'left'), y: pxDin('.card', 'top'), dreapta: pxDin('.card', 'right') },
    eticheta: tipar('.label'),
    rand: h,
    gol: pxDin('.gap', 'margin-top'),
    cta: { y: pxDin('#cta', 'top'), ...tipar('#cta .h', { 'line-height': h.inaltimeRand, 'letter-spacing': h.spatiere }) },
    semnatura: {
      x: pxDin('#sig', 'left'), y: pxDin('#sig', 'top'), dreapta: pxDin('#sig', 'right'),
      ...tipar('#sig'),
    },
  };
}

/** Rândurile pe care le face browserul dintr-un text: împărțire la spații, cât încape în lățimea blocului. */
function randuriRupte(text, latimeMax, masoara) {
  const randuri = [];
  let curent = '';
  for (const cuvant of text.split(' ')) {
    const incercare = curent === '' ? cuvant : `${curent} ${cuvant}`;
    if (curent !== '' && masoara(incercare) > latimeMax) {
      randuri.push(curent);
      curent = cuvant;
    } else {
      curent = incercare;
    }
  }
  randuri.push(curent);
  return randuri;
}

/**
 * Geometria din sablon.html și măsurătorile fiecărui rol de text (lățimea unui șir și înălțimea rândului),
 * cu fontul rezolvat din stil; comune casetelor C13 și lățimilor C04.
 */
function masuratoriTexte({ stil, radacina, sablonHtml, latimeFormat }) {
  const g = geometrieTexte(sablonHtml);
  const metrici = new Map();
  const tipar = (t) => {
    const font = fontRol(t.font, stil);
    const cheie = `${JSON.stringify(font)}|${t.greutate}`;
    if (!metrici.has(cheie)) metrici.set(cheie, metriciFont(radacina, font, t.greutate));
    const m = metrici.get(cheie);
    const spatiere = em(t.spatiere, stil, t.selector);
    const inaltimeRand = t.inaltimeRand === 'normal' ? m.inaltimeNormala(t.marime) : t.inaltimeRand * t.marime;
    return { latime: (s) => m.latime(s, t.marime, spatiere), inaltimeRand };
  };
  const latimeCard = latimeFormat - g.card.x - g.card.dreapta;
  const rand = tipar(g.rand);
  // titlul unui card cu marime (felia 4) are px-ul ales de alegeMarimiTitlu; restul rămâne la mărimea din CSS
  const randuriCard = new Map();
  const randCard = (c) => {
    if (!(c.px > 0)) return rand;
    if (!randuriCard.has(c.px)) randuriCard.set(c.px, tipar({ ...g.rand, marime: c.px }));
    return randuriCard.get(c.px);
  };
  return { g, tipar, latimeCard, eticheta: tipar(g.eticheta), rand, randCard, cta: tipar(g.cta) };
}

/**
 * Felia 4: px-ul titlului fiecărui card cu treaptă (L, XL), cea mai mare valoare din intervalul treptei, în pași de
 * `pas`, la care fiecare rând încape în lățimea cardului minus marja (aceeași regulă ca C04) și cardul se termină
 * deasupra limitei de jos: îndemnul (minus `marjaCta`) la cardul care stă odată cu el, altfel zona desenului.
 * Dacă nicio valoare din treaptă nu încape cu rândurile întregi, încearcă din nou cu rândurile prea late rupte în două
 * (`c.rupturi`, liniile fiecărui rând; compileaza.mjs le scrie într-un nod, cu \n și white-space: pre-line), ca „textul mai mare” să nu ceară alt text.
 * Nu micșorează sub treaptă: un card care nu încape nici la minimul ei, nici rupt, intră în `nuIncap`.
 * @param {{plan: object, stil: object, radacina: string, sablonHtml: string, latimeFormat: number,
 *   trepte: Record<string, number[]>, pas: number, maxim: number, marjaCta: number, limitaDesen: number, scenaFinala: number}} p
 *   scenaFinala = indexul ultimei scene din date (scena `final`, cea cu îndemnul)
 * @returns {{nuIncap: Array<{card: object, motiv: 'lat'|'inalt', text: string, latime?: number, px: number}>}}
 */
export function alegeMarimiTitlu({ plan, stil, radacina, sablonHtml, latimeFormat, trepte, pas, maxim, marjaCta, limitaDesen, scenaFinala }) {
  const { g, tipar, eticheta } = masuratoriTexte({ stil, radacina, sablonHtml, latimeFormat });
  const nuIncap = [];
  for (const c of plan.carduri) {
    if (!c.treapta || !c.randuri) continue;
    const [min, max] = trepte[c.treapta];
    // îndemnul stă pe ecran doar cu cardul scenei finale; cardul altei scene nu-l întâlnește
    const limita = plan.cta && c.scena === scenaFinala ? g.cta.y - marjaCta : limitaDesen;
    let esec = null;
    // întâi fiecare rând întreg; abia dacă nicio valoare din treaptă nu încape, rândurile prea late se rup în două
    for (const rupe of [false, true]) {
      for (let px = max; px >= min; px -= pas) {
        const t = tipar({ ...g.rand, marime: px });
        const linii = c.randuri.map((r) => (rupe ? rupeInDoua(r.text, t.latime, maxim) : t.latime(r.text) <= maxim ? [r.text] : null));
        const j = linii.findIndex((l) => l === null);
        const jos = g.card.y + (c.eticheta ? eticheta.inaltimeRand : 0) + g.gol
          + linii.reduce((s, l) => s + (l?.length ?? 1), 0) * t.inaltimeRand;
        if (j < 0 && jos <= limita) {
          c.px = px;
          if (linii.some((l) => l.length > 1)) c.rupturi = linii;
          esec = null;
          break;
        }
        esec = j >= 0 ? { card: c, motiv: 'lat', text: c.randuri[j].text, latime: t.latime(c.randuri[j].text), px } : { card: c, motiv: 'inalt', text: c.randuri.map((r) => r.text).join(' / '), px };
      }
      if (c.px > 0) break;
    }
    if (esec) nuIncap.push(esec);
  }
  return { nuIncap };
}

/**
 * Un rând de titlu în cel mult două linii, la un spațiu, cu liniile cât mai egale; null dacă nu încape nici așa.
 * Un rând care încape întreg rămâne întreg.
 */
function rupeInDoua(text, masoara, maxim) {
  if (masoara(text) <= maxim) return [text];
  const cuvinte = text.split(' ');
  let best = null;
  for (let k = 1; k < cuvinte.length; k += 1) {
    const linii = [cuvinte.slice(0, k).join(' '), cuvinte.slice(k).join(' ')];
    const lat = Math.max(...linii.map(masoara));
    if (lat <= maxim && (best === null || lat < best.lat)) best = { linii, lat };
  }
  return best?.linii ?? null;
}

/**
 * Lățimea fiecărui rând dintr-un card (eticheta, rândurile titlului, fiecare cuvânt din `cuvinte`, îndemnul), cu aceleași
 * metrici și aceeași geometrie ca la casetele C13, pentru regula de lățime din C04 (decizia lui Dănuț din 2026-10-06).
 * Îndemnul (#cta) are lățimea cardului; `scena` e null la el, fiindcă planul nu o ține.
 * @param {{plan: object, stil: object, radacina: string, sablonHtml: string, latimeFormat: number}} p stil e stilul plat (valoriStil)
 * @returns {{latimeCard: number, randuri: Array<{scena: number|null, rol: 'eticheta'|'titlu'|'cuvinte'|'cta', index: number, text: string, latime: number}>}}
 */
export function latimiRanduriCard({ plan, stil, radacina, sablonHtml, latimeFormat }) {
  const { latimeCard, eticheta, randCard, cta } = masuratoriTexte({ stil, radacina, sablonHtml, latimeFormat });
  const randuri = [];
  const adauga = (scena, rol, index, text, t) => randuri.push({ scena, rol, index, text, latime: t.latime(text) });
  for (const c of plan.carduri) {
    if (c.eticheta) adauga(c.scena, 'eticheta', 0, c.eticheta, eticheta);
    // un rând rupt de alegeMarimiTitlu se măsoară pe fiecare linie a lui
    (c.randuri ?? []).forEach((r, j) => (c.rupturi?.[j] ?? [r.text]).forEach((l) => adauga(c.scena, 'titlu', j, l, randCard(c))));
    (c.cuvinte ?? []).forEach((w, j) => adauga(c.scena, 'cuvinte', j, w.text, randCard(c)));
  }
  if (plan.cta) adauga(null, 'cta', 0, plan.cta.text, cta);
  return { latimeCard, randuri };
}

/**
 * Casetele [x, y, w, h] ale textelor reelului, în pixelii formatului, în ordinea în care apar în cronologie
 * (pe scenă: eticheta, apoi rândurile titlului sau cuvintele), plus îndemnul și semnătura.
 * @param {{plan: object, stil: object, radacina: string, sablonHtml: string, latimeFormat: number}} p
 *   stil e stilul plat (valoriStil), cu font_titlu, font_text și eticheta
 * @returns {{scene: Map<number, Array<{text: string, caseta: number[], cuvant?: number}>>, cta: {text: string, caseta: number[]}|null, semnatura: {text: string, caseta: number[]}|null}}
 */
export function caseteTexte({ plan, stil, radacina, sablonHtml, latimeFormat }) {
  const { g, tipar, latimeCard, eticheta, rand, randCard, cta } = masuratoriTexte({ stil, radacina, sablonHtml, latimeFormat });
  // plasa de siguranță: o casetă cu NaN sau Infinity ar face C13 să măsoare zero pixeli și să treacă în tăcere
  const caseta = (x, y, w, h, text) => {
    const c = [x, y, w, h].map((v) => Math.round(v * 100) / 100);
    if (!c.every(Number.isFinite)) throw new Error(`Caseta textului „${text}” a ieșit nefinită: [${c.join(', ')}]. Verifică CSS-ul din sablon.html și metricile fontului (C13).`);
    return c;
  };
  /** Un bloc de text care se rupe în lățimea cardului: caseta tuturor rândurilor lui. */
  const bloc = (text, t, y) => {
    const randuri = randuriRupte(text, latimeCard, t.latime);
    const w = Math.min(latimeCard, Math.max(...randuri.map((x) => t.latime(x))));
    return { caseta: caseta(g.card.x, y, w, randuri.length * t.inaltimeRand, text), inaltime: randuri.length * t.inaltimeRand };
  };

  const scene = new Map();
  const adauga = (scena, intrare) => {
    if (!scene.has(scena)) scene.set(scena, []);
    scene.get(scena).push(intrare);
  };
  for (const c of plan.carduri) {
    let y = g.card.y;
    if (c.eticheta) {
      adauga(c.scena, { text: c.eticheta, caseta: caseta(g.card.x, y, Math.min(latimeCard, eticheta.latime(c.eticheta)), eticheta.inaltimeRand, c.eticheta) });
      y += eticheta.inaltimeRand;
    }
    // .gap (margin-top) stă pe primul rând sau pe blocul cuvintelor, cu sau fără etichetă
    y += g.gol;
    if (c.cuvinte) {
      // cuvintele se înlocuiesc în același loc (.word: left 0, top 0), câte unul pe ecran
      c.cuvinte.forEach((w, i) => adauga(c.scena, { text: w.text, cuvant: i, caseta: bloc(w.text, rand, y).caseta }));
    } else {
      (c.randuri ?? []).forEach((r, j) => {
        const t = randCard(c);
        // rândul rupt de alegeMarimiTitlu are liniile fixe (\n cu pre-line în compileaza.mjs), nu ce ar rupe browserul
        const linii = c.rupturi?.[j];
        const b = linii
          ? { caseta: caseta(g.card.x, y, Math.max(...linii.map((l) => t.latime(l))), linii.length * t.inaltimeRand, r.text), inaltime: linii.length * t.inaltimeRand }
          : bloc(r.text, t, y);
        adauga(c.scena, { text: r.text, caseta: b.caseta });
        y += b.inaltime;
      });
    }
  }
  // îndemnul (#cta) e un card separat, fără etichetă și fără .gap
  const indemn = plan.cta ? { text: plan.cta.text, caseta: bloc(plan.cta.text, cta, g.cta.y).caseta } : null;
  let semnatura = null;
  if (plan.semnatura) {
    const s = tipar(g.semnatura);
    // white-space: pre: un rând pe fiecare \n, fără rupere
    const randuri = plan.semnatura.text.split('\n');
    const w = Math.min(latimeFormat - g.semnatura.x, Math.max(...randuri.map((x) => s.latime(x))));
    semnatura = { text: plan.semnatura.text, caseta: caseta(g.semnatura.x, g.semnatura.y, w, randuri.length * s.inaltimeRand, plan.semnatura.text) };
  }
  return { scene, cta: indemn, semnatura };
}

/**
 * Zona blocului #sig pentru o semnătură (toată lățimea dintre left și right, câte un rând pe fiecare \n),
 * din CSS-ul din sablon.html; nu cere fontul, deci merge și fără stilul rezolvat.
 * @param {string} sablonHtml
 * @param {string} text
 * @param {number} latimeFormat
 * @returns {number[]} [x, y, w, h]
 */
export function zonaSemnatura(sablonHtml, text, latimeFormat) {
  const { semnatura: s } = geometrieTexte(sablonHtml);
  if (s.inaltimeRand === 'normal') throw new Error('#sig din sablon.html are nevoie de line-height numeric pentru zona semnăturii.');
  const randuri = String(text).split('\n').length;
  return [s.x, s.y, latimeFormat - s.x - s.dreapta, Math.round(randuri * s.inaltimeRand * s.marime * 100) / 100];
}
