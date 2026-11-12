// Contrastul WCAG 2.x pe culorile rezolvate (C06) și limita intensității atmosferei pe fundaluri deschise (A-Î2).
// Modul doar nativ: importă numai erori.mjs.
import { eroare } from './erori.mjs';
import { numarRo } from './format.mjs';

/** Pragurile C06: text ≥ 4,5; accent, linie și text atenuat ≥ 3. */
export const PRAGURI_C06 = Object.freeze({ text: 4.5, accent: 3, linie: 3, atenuat: 3 });

/**
 * @param {string} hex '#RRGGBB'
 * @returns {[number, number, number]} 0-255
 */
export function hexInRgb(hex) {
  if (typeof hex !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(hex)) {
    throw new TypeError(`Culoare invalidă: ${hex} (se așteaptă #RRGGBB).`);
  }
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

/**
 * @param {[number, number, number]} rgb 0-255 (se rotunjesc și se limitează)
 * @returns {string} '#RRGGBB' cu majuscule
 */
export function rgbInHex(rgb) {
  return (
    '#' +
    rgb
      .map((c) => Math.min(255, Math.max(0, Math.round(c))).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

/**
 * Luminanța relativă WCAG 2.x.
 * @param {string} hex
 * @returns {number} 0..1
 */
export function luminantaRelativa(hex) {
  const [r, g, b] = hexInRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Raportul de contrast WCAG, rotunjit la 2 zecimale.
 * @param {string} a
 * @param {string} b
 * @returns {number} 1..21
 */
export function raportContrast(a, b) {
  const la = luminantaRelativa(a);
  const lb = luminantaRelativa(b);
  const r = (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  return Math.round(r * 100) / 100;
}

/**
 * Culoarea `peste`, cu opacitatea `alfa`, compusă peste `sub` (sRGB, ca în browser).
 * @param {string} sub
 * @param {string} peste
 * @param {number} alfa 0..1
 * @returns {string} '#RRGGBB'
 */
export function amestecaAlfa(sub, peste, alfa) {
  const s = hexInRgb(sub);
  const p = hexInRgb(peste);
  return rgbInHex(s.map((c, i) => c * (1 - alfa) + p[i] * alfa));
}

/**
 * Amestec liniar în sRGB, cu ponderea textului în procente întregi (singura definiție, folosită de
 * calculeazaAtenuat din teme.mjs și de teste). Rezultatul e rotunjit de rgbInHex.
 * @param {string} text hex
 * @param {string} fundal hex
 * @param {number} pondere 0..100 (procentul de text)
 * @returns {string} '#RRGGBB'
 */
export function amestec(text, fundal, pondere) {
  const t = hexInRgb(text);
  const f = hexInRgb(fundal);
  return rgbInHex(t.map((c, i) => (c * pondere + f[i] * (100 - pondere)) / 100));
}

/** Ponderile stopurilor degradeului (planul G): procentul de accent, respectiv de text, amestecat spre fundal. */
export const PONDERI_DEGRADE = Object.freeze({ accent: 8, text: 6 });

/**
 * Stopurile degradeului lent derivat din fundal (atmosfera 'degrade', spec 7.2): accentul și textul, foarte aproape de fundal.
 * Singura definiție: o folosesc C06 (atmosferaC06), atenuatul calculat (teme.mjs) și șabloanele care desenează degradeul.
 * @param {{fundal: string, text: string, accent: string}} culori hex
 * @returns {[string, string]}
 */
export function stopuriDegrade(culori) {
  return [
    amestec(culori.accent, culori.fundal, PONDERI_DEGRADE.accent),
    amestec(culori.text, culori.fundal, PONDERI_DEGRADE.text),
  ];
}

/** Straturile de ceață ale nucleului, cu opacitatea la intensitatea 1; un șablon cu ceață le desenează exact așa, înmulțite cu limitaIntensitate. */
export const STRATURI_CEATA = Object.freeze([
  Object.freeze({ strat: 'sus', jeton: 'accent', alfa: 0.3 }),
  Object.freeze({ strat: 'jos', jeton: 'linie', alfa: 0.14 }),
]);

/**
 * Straturile de ceață rezolvate (felia 4): culoarea și opacitatea fiecărui strat. Fără ceața brandului, culoarea vine din
 * jetonul stratului (accent sus, linie jos) și opacitatea din STRATURI_CEATA, ca până acum; cu ea, stratul dat de brand
 * își are culoarea lui și, dacă o dă, opacitatea lui. `jeton` numește sursa, pentru sugestiile lui C06.
 * @param {{text: string, accent?: string, linie?: string}} culori
 * @param {{sus?: {culoare: string, alfa?: number}, jos?: {culoare: string, alfa?: number}}|null} [ceata] stil.ceata, din brand
 * @returns {{culoare: string, alfa: number, jeton: string}[]}
 */
export function straturiCeata(culori, ceata = null) {
  return STRATURI_CEATA.map(({ strat, jeton, alfa }) => {
    const dinBrand = ceata?.[strat];
    if (dinBrand) return { culoare: dinBrand.culoare, alfa: dinBrand.alfa ?? alfa, jeton: `ceata.${strat}` };
    return { culoare: culori[jeton] ?? culori.text, alfa, jeton };
  });
}

/**
 * Culorile pe care poate sta textul, după atmosferă și intensitatea ei.
 * La 'ceata', fiecare strat are opacitatea alfa * intensitate; la 'degrade', fiecare stop e amestecat
 * spre fundal: amestecaAlfa(fundal, stop, intensitate) (la 1, stopul însuși; la 0, fundalul).
 * @param {{fundal: string, text: string, accent: string, linie?: string}} culori
 * @param {'plin'|'ceata'|'degrade'} [atmosfera]
 * @param {{stopuri?: string[], intensitate?: number, ceata?: object|null}} [optiuni] la 'degrade', stopurile degradeului, în hex (le dă șablonul); la 'ceata', ceața brandului (straturiCeata)
 * @returns {string[]}
 */
export function puncteFundal(culori, atmosfera = 'plin', { stopuri = [], intensitate = 1, ceata = null } = {}) {
  if (typeof intensitate !== 'number' || !(intensitate >= 0 && intensitate <= 1)) {
    throw new TypeError(`Intensitate invalidă: ${intensitate} (se așteaptă un număr între 0 și 1).`);
  }
  if (atmosfera === 'plin') return [culori.fundal];
  if (atmosfera === 'ceata') {
    return [
      culori.fundal,
      ...straturiCeata(culori, ceata).map(({ culoare, alfa }) => amestecaAlfa(culori.fundal, culoare, alfa * intensitate)),
    ];
  }
  if (atmosfera === 'degrade') {
    if (!Array.isArray(stopuri) || stopuri.length === 0) {
      throw new TypeError('La atmosfera degrade, verificaContrast cere stopurile degradeului (optiuni.stopuri).');
    }
    return [culori.fundal, ...stopuri.map((s) => amestecaAlfa(culori.fundal, s, intensitate))];
  }
  throw new TypeError(`Atmosferă necunoscută: ${atmosfera} (se așteaptă plin, ceata sau degrade).`);
}

/**
 * Culoarea cu luminanța relativă cea mai mare (la egalitate, prima).
 * @param {string[]} puncte
 * @returns {string}
 */
export function punctCelMaiDeschis(puncte) {
  let ales = puncte[0];
  for (const p of puncte.slice(1)) if (luminantaRelativa(p) > luminantaRelativa(ales)) ales = p;
  return ales;
}

/**
 * Punctul de fundal cel mai nefavorabil pentru o culoare: cel cu raportul de contrast cel mai mic față de ea
 * (la egalitate, primul). Pentru o culoare mai deschisă decât toate punctele e punctul cel mai deschis,
 * pentru una mai închisă decât toate e punctul cel mai închis (A-Î2).
 * @param {string} culoare
 * @param {string[]} puncte
 * @returns {string}
 */
export function punctCelMaiNefavorabil(culoare, puncte) {
  let ales = puncte[0];
  let minim = raportContrast(culoare, ales);
  for (const p of puncte.slice(1)) {
    const r = raportContrast(culoare, p);
    if (r < minim) {
      ales = p;
      minim = r;
    }
  }
  return ales;
}

/** Jetoanele verificate, în ordinea raportării, cu câmpul din date și numele pentru oameni. */
const JETOANE = [
  { jeton: 'text', camp: 'stil.culori.text', nume: 'Culoarea textului' },
  { jeton: 'accent', camp: 'stil.culori.accent', nume: 'Culoarea de accent' },
  { jeton: 'linie', camp: 'stil.culori.linie', nume: 'Culoarea liniei' },
  { jeton: 'atenuat', camp: 'stil.culori.text', nume: 'Textul atenuat' },
];

/**
 * Raportul fiecărui jeton prezent față de punctul lui cel mai nefavorabil.
 * @param {Record<string, string>} culori
 * @param {string[]} puncte
 * @returns {Array<{jeton: string, camp: string, nume: string, punct: string, raport: number}>}
 */
function rapoarteJetoane(culori, puncte) {
  return JETOANE.filter(({ jeton }) => culori[jeton] !== undefined && culori[jeton] !== null).map((j) => {
    const punct = punctCelMaiNefavorabil(culori[j.jeton], puncte);
    return { ...j, punct, raport: raportContrast(culori[j.jeton], punct) };
  });
}

/**
 * Fundal deschis = fundalul are luminanța mai mare decât textul (temele hartie și curat).
 * @param {{fundal: string, text: string}} culori
 */
function esteFundalDeschis(culori) {
  return luminantaRelativa(culori.fundal) > luminantaRelativa(culori.text);
}

/**
 * Intensitatea maximă a atmosferei (A-Î2): pe fundal deschis, cea mai mare valoare din 0, 0,01, ..., 1
 * la care toate jetoanele trec pragurile față de punctul lor cel mai nefavorabil (0 dacă nici fundalul plin nu ajunge);
 * pe fundal închis și la 'plin', 1 (pe fundal închis, C06 verifică ceața întreagă).
 * Șablonul desenează atmosfera exact la această intensitate (straturile STRATURI_CEATA cu alfa * intensitate,
 * stopurile degradeului amestecate spre fundal cu puncteFundal).
 * @param {{fundal: string, text: string, accent: string, atenuat?: string, linie?: string}} culori
 * @param {'plin'|'ceata'|'degrade'} [atmosfera]
 * @param {{stopuri?: string[], praguri?: {text: number, accent: number, linie: number, atenuat: number}, ceata?: object|null}} [optiuni]
 * @returns {number} 0..1, cu cel mult 2 zecimale
 */
export function limitaIntensitate(culori, atmosfera = 'plin', { stopuri = [], praguri = PRAGURI_C06, ceata = null } = {}) {
  // validează atmosfera și stopurile, cu aceleași TypeError ca puncteFundal
  puncteFundal(culori, atmosfera, { stopuri, ceata });
  if (atmosfera === 'plin' || !esteFundalDeschis(culori)) return 1;
  for (let sutimi = 100; sutimi >= 0; sutimi -= 1) {
    const intensitate = sutimi / 100;
    const puncte = puncteFundal(culori, atmosfera, { stopuri, intensitate, ceata });
    if (rapoarteJetoane(culori, puncte).every(({ jeton, raport }) => raport >= praguri[jeton])) return intensitate;
  }
  return 0;
}

/**
 * Ce strat al atmosferei a dat punctul cel mai nefavorabil (F10): la 'ceata', jetonul stratului de ceață
 * (accent sau linie, în ordinea STRATURI_CEATA din puncteFundal); la 'degrade', un stop al degradeului.
 * @param {string} punct
 * @param {string[]} puncte
 * @param {string} atmosfera
 * @returns {{jeton?: string, punct: string, atmosfera: string}}
 */
function stratNefavorabil(punct, puncte, atmosfera, culori, ceata) {
  const jeton = atmosfera === 'ceata' ? straturiCeata(culori, ceata)[puncte.indexOf(punct) - 1]?.jeton : undefined;
  return { jeton, punct, atmosfera };
}

/**
 * Sugestia pentru atenuat. Atenuatul nu e câmp în date: pe fundalul plin se repară din text; când îl încurcă
 * un strat al atmosferei, cauza reală e stratul (accentul sau linia ceții, ori degradeul), deci sugestia o numește.
 * Cu brand, culorile se schimbă doar în fișa brandului (F11); atmosfera rămâne în date.json.
 * @param {string} camp
 * @param {{jeton?: string, punct: string, atmosfera: string}|null} strat
 * @param {string|null} brand
 * @param {string|undefined} sursa sursa atenuatului din StilRezolvat ('brand', 'calculat', 'tema')
 */
function sugestieAtenuat(camp, strat, brand, sursa) {
  const fisa = brand ? `branduri/${brand}/vizual.md` : null;
  if (!strat) {
    if (!fisa) return `Alege în ${camp} o culoare mai depărtată de fundal; textul atenuat se calculează din ea și din fundal.`;
    if (sursa === 'brand') return `Schimbă culori.atenuat în ${fisa} cu o culoare mai depărtată de fundal.`;
    return `Schimbă culori.text în ${fisa} cu o culoare mai depărtată de fundal (textul atenuat se calculează din ea și din fundal) sau dă acolo direct culori.atenuat.`;
  }
  if (strat.jeton?.startsWith('ceata.')) {
    // ceața din brand (felia 4): există doar cu brand, deci reparația e în fișă
    return `Textul atenuat stă peste stratul ${strat.jeton} al ceții (${strat.punct}): schimbă ${strat.jeton} în ${fisa} (altă culoare sau un alfa mai mic) sau pune stil.atmosfera pe „plin” în date.json.`;
  }
  if (strat.jeton) {
    const ce = strat.jeton === 'accent' ? 'culorii de accent' : 'liniei';
    if (fisa) {
      return `Textul atenuat stă peste ceața ${ce} (${strat.punct}): schimbă culori.${strat.jeton} în ${fisa} cu o culoare mai depărtată de text sau pune stil.atmosfera pe „plin” în date.json.`;
    }
    return `Textul atenuat stă peste ceața ${ce} (${strat.punct}): alege în stil.culori.${strat.jeton} o culoare mai depărtată de text sau pune stil.atmosfera pe „plin”.`;
  }
  if (fisa) {
    return `Textul atenuat stă peste degradeul fundalului (${strat.punct}): pune stil.atmosfera pe „plin” în date.json sau schimbă culori.text în ${fisa} cu o culoare mai depărtată de fundal.`;
  }
  return `Textul atenuat stă peste degradeul fundalului (${strat.punct}): pune stil.atmosfera pe „plin” sau alege în ${camp} o culoare mai depărtată de fundal.`;
}

/**
 * C06: contrastul fiecărei culori față de fundal; la ceata și degrade, față de punctul cel mai nefavorabil
 * al fundalului (A-Î2), la intensitatea cu care șablonul desenează atmosfera.
 * Cu `brand` (numele brandului din date.json), câmpurile stil.culori.* sunt interzise în date (conflicteBrandDate),
 * deci erorile au camp 'brand' și trimit la branduri/<brand>/vizual.md (F11, ca tema-necunoscuta din brand).
 * `surse` (jeton → sursa din StilRezolvat) alege sugestia pentru atenuat: culori.atenuat dacă îl dă brandul,
 * altfel culori.text. Fără brand, totul rămâne ca în harta 4.6 (camp 'stil.culori.<jeton>').
 * @param {{fundal: string, text: string, accent: string, atenuat: string, linie?: string}} culori
 * @param {{text: number, accent: number, linie: number, atenuat: number}} [praguri]
 * @param {{atmosfera?: 'plin'|'ceata'|'degrade', stopuri?: string[], intensitate?: number,
 *   brand?: string|null, surse?: Record<string, string>, ceata?: object|null}} [optiuni] ceata = stil.ceata (straturiCeata)
 *   intensitate lipsă = limitaIntensitate(culori, atmosfera, { stopuri, praguri })
 * @returns {{cod: 'C06', ok: boolean, valoare: Record<string, number>, prag: Record<string, number>, camp: string|null, erori: object[]}}
 */
export function verificaContrast(
  culori,
  praguri = PRAGURI_C06,
  { atmosfera = 'plin', stopuri = [], intensitate, brand = null, surse = {}, ceata = null } = {},
) {
  const valoare = {};
  const erori = [];
  const intensitateEfectiva = intensitate ?? limitaIntensitate(culori, atmosfera, { stopuri, praguri, ceata });
  const puncte = puncteFundal(culori, atmosfera, { stopuri, intensitate: intensitateEfectiva, ceata });
  const baza = rgbInHex(hexInRgb(culori.fundal));
  const numeBrand = typeof brand === 'string' && brand !== '' ? brand : null;
  const fisa = numeBrand ? `branduri/${numeBrand}/vizual.md` : null;
  for (const { jeton, camp: campDate, nume, punct, raport: r } of rapoarteJetoane(culori, puncte)) {
    valoare[jeton] = r;
    if (r >= praguri[jeton]) continue;
    const camp = numeBrand ? 'brand' : campDate;
    const descriereFundal = punct === baza
      ? `fundalul ${culori.fundal}`
      : `punctul cel mai nefavorabil al fundalului (${punct}, atmosfera ${atmosfera}, intensitatea ${numarRo(intensitateEfectiva)})`;
    const minim = numarRo(praguri[jeton]);
    let sugestie;
    if (jeton === 'atenuat') {
      // Stratul atmosferei e cauza doar dacă atenuatul trece față de fundalul plin; altfel se repară din text.
      const deVinaStratul = punct !== baza && raportContrast(culori.atenuat, baza) >= praguri.atenuat;
      sugestie = sugestieAtenuat(campDate, deVinaStratul ? stratNefavorabil(punct, puncte, atmosfera, culori, ceata) : null, numeBrand, surse?.atenuat);
    } else if (fisa && punct !== baza && raportContrast(culori[jeton], baza) >= praguri[jeton]
      && stratNefavorabil(punct, puncte, atmosfera, culori, ceata).jeton?.startsWith('ceata.')) {
      // culoarea trece pe fundalul plin; o încurcă doar un strat al ceții din brand (felia 4), deci acolo e reparația
      const strat = stratNefavorabil(punct, puncte, atmosfera, culori, ceata).jeton;
      sugestie = `Culoarea stă peste stratul ${strat} al ceții (${punct}): schimbă ${strat} în ${fisa} (altă culoare sau un alfa mai mic) sau pune stil.atmosfera pe „plin” în date.json.`;
    } else if (fisa) {
      sugestie = `Schimbă culori.${jeton} în ${fisa} cu o culoare mai închisă sau mai deschisă, ca raportul față de fundal să ajungă la cel puțin ${minim}:1, sau schimbă acolo culori.fundal.`;
    } else {
      sugestie = `Alege în ${campDate} o culoare mai închisă sau mai deschisă, ca raportul față de fundal să ajungă la cel puțin ${minim}:1, sau schimbă stil.culori.fundal.`;
    }
    const dinBrand = fisa ? ` Proiectul folosește brandul „${numeBrand}”, deci culorile se schimbă în ${fisa}, nu în date.json.` : '';
    erori.push(
      eroare(
        'contrast-slab',
        camp,
        `Stil: ${nume} (${culori[jeton]}) are contrast ${numarRo(r)}:1 față de ${descriereFundal}; minimul este ${minim}:1.${dinBrand}`,
        sugestie,
      ),
    );
  }
  return {
    cod: 'C06',
    ok: erori.length === 0,
    valoare,
    prag: { ...praguri },
    camp: erori.length ? erori[0].camp : null,
    erori,
  };
}
