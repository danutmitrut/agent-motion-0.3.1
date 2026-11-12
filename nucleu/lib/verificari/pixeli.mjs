// Analiza pe pixeli pentru C12 (cadre goale) și C13 (text vizibil): funcții pure, fără ffmpeg (harta 4.15, spec 6.11).
// Cadrele sunt RGB24: 3 octeți pe pixel, rând după rând. Extragerea lor e în mp4.mjs.
import { rotunjeste } from '../cronologie.mjs';
import { eroare } from '../erori.mjs';
import { numarRo } from '../format.mjs';
import { rezultat } from './index.mjs';

const EPS = 1e-9;

// „Primul conținut” din C12 (decizia lui Dănuț din 2026-10-05): primul cadru cu orice desen vizibil, nu 0,3% din imagine.
// Desen înseamnă cel puțin PIXELI_DESEN pixeli (pe cadrul C12, 135x240) la peste TOLERANTA_DESEN pe un canal.
// Măsurat în B17 pe randări reale, la 135x240: fundalurile lavfi encodate au 0 pixeli peste 24 (diferența maximă 1);
// ceața de pe noapte, înainte de primul desen, are 62-108 pixeli peste 24, dar diferența ei maximă e 26-27, deci
// la 24 ceața ar trece drept desen și niciun număr de pixeli n-ar despărți-o de linie (4-9 pixeli la 0,4-0,5 s).
// La 48, ceața și fundalurile au 0 pixeli, iar linia primei scene are 1-3 pixeli la 0,4 s și 5-7 la 0,5 s
// (noapte 3/7, hartie 1/5, curat 3/7). 3 pixeli, nu 1: un punct izolat (granulație, compresie) nu e desen.
const TOLERANTA_DESEN = 48;
const PIXELI_DESEN = 3;

function verificaCadru(pixeli, latime, inaltime) {
  if (!(pixeli instanceof Uint8Array)) throw new TypeError('pixeli trebuie să fie Uint8Array (RGB24).');
  if (!Number.isInteger(latime) || !Number.isInteger(inaltime) || latime <= 0 || inaltime <= 0) {
    throw new TypeError(`Dimensiuni de cadru invalide: ${latime}x${inaltime}.`);
  }
  if (pixeli.length !== latime * inaltime * 3) {
    throw new TypeError(`Cadrul are ${pixeli.length} octeți, nu ${latime * inaltime * 3} (${latime}x${inaltime} RGB24).`);
  }
}

/** Un număr finit; NaN sau Infinity ar face comparațiile false și măsurătoarea ar trece în tăcere (B17, runda de corecturi 1). */
function cereFinit(valoare, ce) {
  if (!Number.isFinite(valoare)) throw new TypeError(`${ce} trebuie să fie un număr finit, nu ${valoare}.`);
}

function zonaInCadru(zona, latime, inaltime) {
  if (zona === null || zona === undefined) return [0, 0, latime, inaltime];
  if (!Array.isArray(zona) || zona.length !== 4 || !zona.every(Number.isFinite)) {
    throw new TypeError(`Zona trebuie să fie [x, y, w, h] cu numere finite, nu ${JSON.stringify(zona?.map?.(String) ?? zona)}.`);
  }
  const [x, y, w, h] = zona.map((v) => Math.round(v));
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(latime, x + w);
  const y1 = Math.min(inaltime, y + h);
  return [x0, y0, Math.max(0, x1 - x0), Math.max(0, y1 - y0)];
}

/** 2.15 → '2,15' */
function secunde(x) {
  return numarRo(rotunjeste(x, 2));
}

/** 0.005 → '0,5' (procente, o zecimală) */
function procent(x) {
  return numarRo(rotunjeste(x * 100, 1));
}

export const TRIMITERE_SABLON = 'vezi în SABLON.md al șablonului rubrica erorilor';

/** Obiectul de la calea `camp` (de exemplu scene[0] sau stil) în date, sau undefined. */
function laCale(date, camp) {
  if (date === null || typeof date !== 'object' || camp === '$') return undefined;
  let obiect = date;
  for (const [, nume, index] of camp.matchAll(/([^.[\]]+)|\[(\d+)\]/g)) {
    if (obiect === null || typeof obiect !== 'object') return undefined;
    obiect = nume !== undefined ? obiect[nume] : obiect[Number(index)];
  }
  return obiect;
}

/** Schema la `ref` (#/$defs/...) din schema rădăcină, sau schema însăși. */
function rezolva(schema, radacina) {
  let n = schema;
  for (let i = 0; i < 20 && n && typeof n === 'object' && typeof n.$ref === 'string'; i += 1) {
    n = n.$ref.split('/').slice(1).reduce((o, k) => o?.[k], radacina);
  }
  return n && typeof n === 'object' ? n : {};
}

/** Valoarea unică a unui discriminator de schemă (const sau enum cu o singură valoare), altfel undefined. */
function valoareUnica(v) {
  if (v && typeof v === 'object') {
    if ('const' in v) return v.const;
    if (Array.isArray(v.enum) && v.enum.length === 1) return v.enum[0];
  }
  return undefined;
}

/** Ramura oneOf/anyOf se potrivește doar dacă are discriminatori (const sau enum de o valoare) și toți se potrivesc cu `dateNod`. */
function ramuraPotrivita(ramura, dateNod) {
  if (dateNod === null || typeof dateNod !== 'object') return false;
  const discriminatori = Object.entries(ramura.properties ?? {})
    .map(([k, v]) => [k, valoareUnica(v)]).filter(([, v]) => v !== undefined);
  return discriminatori.length > 0 && discriminatori.every(([k, v]) => dateNod[k] === v);
}

/**
 * Proprietățile permise de schema unui obiect, cu ramurile allOf/if/then ale căror const se potrivesc cu `dateNod` și
 * ramurile oneOf/anyOf alese după discriminator. Fără potrivire sigură nu se adaugă nimic (restrictiv).
 */
function proprietatiPermise(schema, radacina, dateNod, adancime = 0) {
  const n = rezolva(schema, radacina);
  const rez = { ...(n.properties ?? {}) };
  if (adancime > 8) return rez;
  if (Array.isArray(n.allOf)) {
    for (const ramura of n.allOf) {
      if (ramura?.if === undefined) {
        Object.assign(rez, proprietatiPermise(ramura, radacina, dateNod, adancime + 1));
        continue;
      }
      const conditie = ramura.if.properties;
      const potrivit = conditie !== undefined && dateNod !== null && typeof dateNod === 'object'
        && Object.entries(conditie).every(([k, v]) => valoareUnica(v) !== undefined && dateNod[k] === valoareUnica(v));
      if (potrivit) Object.assign(rez, proprietatiPermise(ramura.then ?? {}, radacina, dateNod, adancime + 1));
    }
  }
  for (const ramura of n.oneOf ?? n.anyOf ?? []) {
    const r = rezolva(ramura, radacina);
    if (ramuraPotrivita(r, dateNod)) Object.assign(rez, proprietatiPermise(r, radacina, dateNod, adancime + 1));
  }
  return rez;
}

/** @returns {boolean} schema (additionalProperties: false) permite câmpul de la `cale`; scenele se aleg după datele reale. */
function permisDeSchema(schema, date, cale) {
  if (schema === null || typeof schema !== 'object') return false;
  let nodSchema = schema;
  let nodDate = date;
  for (const [, nume, index] of cale.matchAll(/([^.[\]]+)|\[(\d+)\]/g)) {
    nodSchema = rezolva(nodSchema, schema);
    if (nume !== undefined) {
      const proprietati = proprietatiPermise(nodSchema, schema, nodDate);
      if (!Object.hasOwn(proprietati, nume)) return false;
      nodSchema = proprietati[nume];
      nodDate = nodDate !== null && typeof nodDate === 'object' ? nodDate[nume] : undefined;
    } else {
      if (rezolva(nodSchema, schema).items === undefined) return false;
      nodSchema = rezolva(nodSchema, schema).items;
      nodDate = Array.isArray(nodDate) ? nodDate[Number(index)] : undefined;
    }
  }
  return true;
}

/**
 * @param {object|null} date @param {string} cale @param {object|null} [schema] schema șablonului, opțional
 * @returns {boolean} câmpul `cale` (de exemplu stil.atmosfera) are o valoare în date SAU îl permite schema șablonului
 *   (F10: un câmp opțional omis rămâne o sugestie validă; un șablon a cărui schemă nu-l are nu primește numele lui)
 */
export function existaInDate(date, cale, schema = null) {
  return laCale(date, cale) !== undefined || permisDeSchema(schema, date, cale);
}

/**
 * Câmpurile `nume` pe care le are în date obiectul de la calea `camp` (sau pe care schema le permite acolo), ca o
 * sugestie să numească doar câmpuri care există pe șablonul randat (planul E, E10; planul F, F10).
 * @param {object|null} date @param {string} camp @param {string[]} nume @param {object|null} [schema]
 * @returns {string[]} de exemplu ['scene[0].titlu', 'scene[0].desen']
 */
export function campuriExistente(date, camp, nume, schema = null) {
  const obiect = laCale(date, camp);
  if (obiect === null || typeof obiect !== 'object' || Array.isArray(obiect)) return [];
  return nume.filter((c) => Object.hasOwn(obiect, c) || permisDeSchema(schema, date, `${camp}.${c}`)).map((c) => `${camp}.${c}`);
}

/** Pașii de sugestie legați cu „sau”, prima literă mare, cu punct la sfârșit. */
export function propozitie(pasi) {
  const text = pasi.join(' sau ');
  return `${text[0].toUpperCase()}${text.slice(1)}.`;
}

function campuriVizibile(date, camp, schema) {
  return campuriExistente(date, camp, ['titlu', 'desen'], schema);
}

function segmentLa(segmente, t) {
  if (!Array.isArray(segmente) || segmente.length === 0) return null;
  return segmente.find((s) => t >= s.start - EPS && t < s.sfarsit - EPS) ?? segmente[segmente.length - 1];
}

/**
 * Proporția pixelilor care diferă de fundal: măcar un canal la peste `toleranta` de valoarea fundalului.
 * @param {Uint8Array} pixeli RGB24
 * @param {number} latime
 * @param {number} inaltime
 * @param {[number, number, number]} fundalRgb
 * @param {[number, number, number, number]|null} [zona] [x, y, w, h] în pixelii cadrului; null = tot cadrul
 * @param {number} [toleranta]
 * @returns {number} 0..1
 */
export function proportieDiferita(pixeli, latime, inaltime, fundalRgb, zona = null, toleranta = 24) {
  verificaCadru(pixeli, latime, inaltime);
  cereFinit(toleranta, 'Toleranța');
  if (!Array.isArray(fundalRgb) || fundalRgb.length !== 3) throw new TypeError(`Fundalul trebuie să fie [r, g, b], nu ${fundalRgb}.`);
  fundalRgb.forEach((v, i) => cereFinit(v, `Canalul ${'rgb'[i]} al fundalului`));
  const [, , w, h] = zonaInCadru(zona, latime, inaltime);
  if (w === 0 || h === 0) return 0;
  return numarDiferiti(pixeli, latime, inaltime, fundalRgb, zona, toleranta) / (w * h);
}

/** Câți pixeli din zonă diferă de fundal cu peste `toleranta` pe măcar un canal (cadrul e deja verificat). */
function numarDiferiti(pixeli, latime, inaltime, fundalRgb, zona, toleranta) {
  const [r0, g0, b0] = fundalRgb;
  const [x0, y0, w, h] = zonaInCadru(zona, latime, inaltime);
  let diferite = 0;
  for (let y = y0; y < y0 + h; y += 1) {
    let i = (y * latime + x0) * 3;
    for (let x = 0; x < w; x += 1, i += 3) {
      if (Math.abs(pixeli[i] - r0) > toleranta
        || Math.abs(pixeli[i + 1] - g0) > toleranta
        || Math.abs(pixeli[i + 2] - b0) > toleranta) {
        diferite += 1;
      }
    }
  }
  return diferite;
}

/** Cadrul e uniform (negru, gol, o singură culoare): sub `prag` din pixeli diferă cu peste 24 de culoarea lui medie. */
export function esteCadruUniform(pixeli, latime, inaltime, prag = 0.003) {
  verificaCadru(pixeli, latime, inaltime);
  const n = latime * inaltime;
  const suma = [0, 0, 0];
  for (let i = 0; i < n * 3; i += 3) { suma[0] += pixeli[i]; suma[1] += pixeli[i + 1]; suma[2] += pixeli[i + 2]; }
  return proportieDiferita(pixeli, latime, inaltime, suma.map((v) => v / n), null, 24) < prag;
}

/** Proporția pixelilor din zonă unde cadrele a și b (aceeași mărime) diferă cu peste `toleranta` pe măcar un canal. */
export function proportieDiferitaCadre(a, b, latime, inaltime, zona = null, toleranta = 40) {
  verificaCadru(a, latime, inaltime);
  verificaCadru(b, latime, inaltime);
  cereFinit(toleranta, 'Toleranța');
  const [x0, y0, w, h] = zonaInCadru(zona, latime, inaltime);
  if (w === 0 || h === 0) return 0;
  let diferite = 0;
  for (let y = y0; y < y0 + h; y += 1) {
    let i = (y * latime + x0) * 3;
    for (let x = 0; x < w; x += 1, i += 3) {
      if (Math.abs(a[i] - b[i]) > toleranta || Math.abs(a[i + 1] - b[i + 1]) > toleranta || Math.abs(a[i + 2] - b[i + 2]) > toleranta) diferite += 1;
    }
  }
  return diferite / (w * h);
}

/**
 * Un cadru e gol când sub `prag` din pixeli diferă de fundalul rezolvat (spec 6.11, C12), la toleranța 24.
 * @param {Uint8Array} pixeli
 * @param {number} latime
 * @param {number} inaltime
 * @param {[number, number, number]} fundalRgb
 * @param {number} [prag]
 * @returns {boolean}
 */
export function esteCadruGol(pixeli, latime, inaltime, fundalRgb, prag = 0.003) {
  return proportieDiferita(pixeli, latime, inaltime, fundalRgb) < prag;
}

/**
 * Cadrul are desen vizibil (pentru „primul conținut” din C12): cel puțin `minim` pixeli la peste `toleranta` de fundal.
 * Valorile implicite sunt pentru cadrul C12 (135x240); motivul lor e la TOLERANTA_DESEN.
 * @param {Uint8Array} pixeli
 * @param {number} latime
 * @param {number} inaltime
 * @param {[number, number, number]} fundalRgb
 * @param {{toleranta?: number, minim?: number}} [praguri]
 * @returns {boolean}
 */
export function areDesen(pixeli, latime, inaltime, fundalRgb, { toleranta = TOLERANTA_DESEN, minim = PIXELI_DESEN } = {}) {
  verificaCadru(pixeli, latime, inaltime);
  return numarDiferiti(pixeli, latime, inaltime, fundalRgb, null, toleranta) >= minim;
}

/**
 * Segmentele de cadre goale consecutive. `sfarsit` e t-ul primului cadru cu conținut de după gol
 * sau, pentru golul de la final, ultimul t plus pasul seriei.
 * @param {Array<{t: number, gol: boolean}>} serie
 * @returns {Array<{start: number, sfarsit: number, durata: number}>}
 */
export function segmenteGoale(serie) {
  const sortata = [...serie].sort((a, b) => a.t - b.t);
  if (sortata.length === 0) return [];
  const pas = sortata.length > 1 ? sortata[1].t - sortata[0].t : 0.1;
  const segment = (start, sfarsit) => ({ start: rotunjeste(start), sfarsit: rotunjeste(sfarsit), durata: rotunjeste(sfarsit - start) });
  const rez = [];
  let start = null;
  for (const { t, gol } of sortata) {
    if (gol && start === null) start = t;
    if (!gol && start !== null) {
      rez.push(segment(start, t));
      start = null;
    }
  }
  if (start !== null) rez.push(segment(start, sortata[sortata.length - 1].t + pas));
  return rez;
}

/**
 * C12: niciun segment gol (sub 0,3% din pixeli) peste maxGol; primul conținut (primul cadru cu desen) până la primulContinut.
 * Un cadru fără câmpul `desen` are desen când nu e gol.
 * @param {Array<{t: number, gol: boolean, desen?: boolean}>} serie
 * @param {{maxGol?: number, primulContinut?: number, segmente?: Array<{ref: string, camp: string, start: number, sfarsit: number}>, date?: object|null, schema?: object|null}} [optiuni]
 *   segmente = cronologie.segmente, pentru câmpul și ref-ul din mesaje; date = datele randate, pentru sugestia primului conținut
 */
export function verificaGoluri(serie, { maxGol = 1.0, primulContinut = 0.6, segmente = [], date = null, schema = null } = {}) {
  const prag = { gol_max: maxGol, primul_continut: primulContinut, cadru_gol: 0.003, desen: { toleranta: TOLERANTA_DESEN, pixeli: PIXELI_DESEN } };
  const goluri = segmenteGoale(serie);
  const cuContinut = serie.filter((c) => c.desen ?? !c.gol).map((c) => c.t).sort((a, b) => a - b);
  const primul = cuContinut.length > 0 ? rotunjeste(cuContinut[0]) : null;
  const inceput = serie.length > 0 ? Math.min(...serie.map((c) => c.t)) : 0;
  const erori = [];
  if (serie.length === 0) {
    erori.push(eroare('cadre-goale', '$',
      'Nu am putut citi niciun cadru din MP4.',
      'Rulează node nucleu/mg.mjs doctor, apoi randarea din nou.'));
  } else if (primul === null) {
    erori.push(eroare('cadre-goale', '$',
      'Niciun cadru al MP4-ului nu are desen sau text: videoul arată doar fundalul.',
      'Rulează node nucleu/mg.mjs doctor, apoi randarea din nou; dacă rămâne gol, descrie problema în cerere-sablon.md.'));
  } else {
    if (primul > primulContinut + EPS) {
      const s = segmentLa(segmente, 0);
      const camp = s?.camp ?? '$';
      const vizibile = campuriVizibile(date, camp, schema);
      erori.push(eroare('cadre-goale', camp,
        `${s?.ref ?? 'Începutul videoului'}: primul conținut apare abia la ${secunde(primul)} s (cel mult ${secunde(primulContinut)} s).`,
        vizibile.length > 0
          ? `Începe videoul cu o scenă care are titlu sau desen de la început (${vizibile.join(' sau ')}).`
          : 'Începe videoul cu un element vizibil de la prima secundă.'));
    }
    for (const g of goluri) {
      // Golul de la început: partea lui de până la primul desen e acoperită de regula primului conținut (mai sus);
      // ce rămâne gol după primul desen (desen sub 0,3% din pixeli, de exemplu o linie subțire care tot nu crește)
      // se socotește ca orice alt gol. Măsurat în B17: hartie [0; 1,1] cu primul desen la 0,5 s, deci 0,6 s;
      // curat [0; 1,1] cu primul desen la 0,4 s, deci 0,7 s; ambele sub 1 s.
      const dupaPrimul = g.start <= inceput + EPS ? rotunjeste(g.sfarsit - Math.max(g.start, primul)) : g.durata;
      if (dupaPrimul > maxGol + EPS) {
        const s = segmentLa(segmente, g.start);
        const camp = s?.camp ?? '$';
        const durata = existaInDate(date, `${camp}.durata`, schema) ? `${camp}.durata` : null;
        const desen = campuriExistente(date, camp, ['desen'], schema)[0] ?? null;
        const pasi = [
          durata && `scurtează ${durata}`,
          desen && `lasă desenul scenei anterioare pe ecran mai mult (${desen}.ramane_pana_la)`,
        ].filter(Boolean);
        erori.push(eroare('cadre-goale', camp,
          g.start <= inceput + EPS
            ? `${s?.ref ?? 'Videoul'}: după primul desen (${secunde(primul)} s), ecranul rămâne aproape gol până la ${secunde(g.sfarsit)} s (${secunde(dupaPrimul)} s; cel mult ${secunde(maxGol)} s).`
            : `${s?.ref ?? 'Videoul'}: între ${secunde(g.start)} s și ${secunde(g.sfarsit)} s ecranul arată doar fundalul (${secunde(g.durata)} s; cel mult ${secunde(maxGol)} s).`,
          pasi.length > 0
            ? propozitie(pasi)
            : `Pune un element vizibil în acest interval sau scurtează pauza; ${TRIMITERE_SABLON}.`));
      }
    }
  }
  return rezultat('C12', erori.length === 0, {
    valoare: { primul_continut: primul, goluri, cadre: serie.length }, prag, camp: erori[0]?.camp ?? null, erori,
  });
}

/**
 * C12 comparat cu sursa (spec 7.4): un interval de peste 0,1 s (un cadru de analiză) în care MP4-ul e uniform, iar
 * filmarea din spate are imagine, e un defect de randare (cadre negre, video neîncărcat). Golurile care există și în
 * sursă (un ecran negru filmat) nu se socotesc.
 * @param {Array<{t: number, uniform: boolean, uniformSursa: boolean}>} serie
 */
export function verificaGoluriSursa(serie) {
  const goluri = segmenteGoale(serie.map((c) => ({ t: c.t, gol: c.uniform && !c.uniformSursa }))).filter((g) => g.durata > 0.1 + EPS);
  const erori = serie.length === 0
    ? [eroare('cadre-goale', '$', 'Nu am putut citi niciun cadru din MP4.', 'Rulează node nucleu/mg.mjs doctor, apoi randarea din nou.')]
    : goluri.map((g) => eroare('cadre-goale', '$',
      `Între ${secunde(g.start)} s și ${secunde(g.sfarsit)} s, MP4-ul arată un cadru uniform (negru sau gol), deși filmarea are imagine acolo.`,
      'E un defect de randare, nu de date: rulează din nou node nucleu/mg.mjs randeaza <proiect>; dacă se repetă, trimite lui Dănuț ieșirea comenzii cu --json.'));
  return rezultat('C12', erori.length === 0, { valoare: { goluri, cadre: serie.length }, prag: { gol_max: 0.1, cadru_uniform: 0.003, mod: 'sursa' }, camp: erori[0]?.camp ?? null, erori });
}

/**
 * Pragurile C13, după tipul zonei măsurate (decizia din 2026-10-06). 35% e calibrat pe zona_text, banda fixă din
 * spec 6.11, unde textul ocupă 10-15%. Într-o casetă strânsă, un titlu bold ocupă singur 28-34%, iar unul scurt și
 * lat până la 44% („MM”, pe Mac; pe Windows, pe noapte, cu până la 2 pp mai mult), deci 35% pica texte care se văd
 * perfect. O casetă inundată de ceață dă 80-100%, iar desenul nu intră în casete, deci 50% prinde tot ce trebuie.
 */
export const PRAGURI_C13 = Object.freeze({
  casete: Object.freeze({ min: 0.01, max: 0.5 }),
  zona_text: Object.freeze({ min: 0.01, max: 0.35 }),
  // comparat cu sursa (decizia 12): un card e opac, deci fără plafon efectiv
  sursa: Object.freeze({ min: 0.01, max: 1 }),
});

/**
 * C13: la momentul fiecărei măsurători (textul în caseta lui sau, fără casete, zona textului scenei), între min și max
 * din pixeli diferă de fundal; o proporție nefinită (NaN, Infinity) e eroare, nu trecere.
 * @param {Array<{ref: string, t: number, proportie: number, camp?: string}>} masuratori
 * @param {{zone?: 'casete'|'zona_text'|'sursa', min?: number, max?: number, date?: object|null, schema?: object|null}} [praguri] zone alege pragurile din PRAGURI_C13
 *   (implicit zona_text) și mesajul de peste prag; min și max le pot înlocui
 */
export function verificaTextVizibil(masuratori, { zone = 'zona_text', min, max, date = null, schema = null } = {}) {
  const implicite = PRAGURI_C13[zone];
  if (!implicite) throw new Error(`Tipul de zonă C13 „${zone}” nu există (casete, zona_text sau sursa).`);
  min ??= implicite.min;
  max ??= implicite.max;
  cereFinit(min, 'Pragul minim al lui C13');
  cereFinit(max, 'Pragul maxim al lui C13');
  const erori = [];
  for (const m of masuratori) {
    const camp = m.camp ?? '$';
    // NaN sau Infinity: comparațiile de mai jos ar fi false și textul ar trece nemăsurat
    if (!Number.isFinite(m.proportie)) {
      erori.push(eroare('text-invizibil', camp,
        `${m.ref}: la ${secunde(m.t)} s, textul nu s-a putut măsura (proporția a ieșit ${m.proportie}), deci nu știu dacă se vede.`,
        'Rulează node nucleu/mg.mjs doctor, apoi randarea din nou; dacă rămâne așa, descrie problema în cerere-sablon.md.'));
    } else if (m.proportie < min && zone === 'sursa') {
      erori.push(eroare('text-invizibil', camp,
        `${m.ref}: la ${secunde(m.t)} s, în caseta textului diferă de cadrul filmării doar ${procent(m.proportie)}% din pixeli (minimum ${procent(min)}%), deci textul nu se vede.`,
        'Mărește stil.opacitate_fundal sau contrastul dintre stil.culori.text și stil.culori.fundal; dacă textul lipsește cu totul, trimite lui Dănuț ieșirea comenzii cu --json.'));
    } else if (m.proportie < min) {
      erori.push(eroare('text-invizibil', camp,
        `${m.ref}: la ${secunde(m.t)} s, în zona textului diferă de fundal doar ${procent(m.proportie)}% din pixeli (minimum ${procent(min)}%), deci textul nu se vede.`,
        `Verifică în date.json contrastul dintre stil.culori.text și stil.culori.fundal${existaInDate(date, `${camp}.durata`, schema) ? ` sau mărește ${camp}.durata, ca textul să apară complet` : `; ${TRIMITERE_SABLON}`}.`));
    } else if (m.proportie > max && zone === 'casete') {
      const atmosfera = existaInDate(date, 'stil.atmosfera', schema);
      // desenul nu intră în caseta textului (la reel, S08), deci ce o umple e ceața sau un fundal care se pierde cu textul
      erori.push(eroare('text-invizibil', camp,
        `${m.ref}: la ${secunde(m.t)} s, în caseta textului diferă de fundal ${procent(m.proportie)}% din pixeli (maximum ${procent(max)}%). Literele singure nu umplu atât, deci în jurul lor fundalul nu mai e cel din stil (de obicei e ceața atmosferei).`,
        `${atmosfera ? 'Pune stil.atmosfera pe „plin” (fără ceață în spatele textului) sau mărește' : 'Mărește'} contrastul dintre stil.culori.text (la rândurile accentuate, stil.culori.accent) și stil.culori.fundal; cu brand, culorile se schimbă în brand${atmosfera ? '' : `; ${TRIMITERE_SABLON}`}.`));
    } else if (m.proportie > max) {
      const pasi = [
        ...campuriExistente(date, camp, ['desen'], schema).map((c) => `micșorează desenul scenei (${c}.marime „mediu” sau „mic”)`),
        ...(existaInDate(date, 'stil.atmosfera', schema) ? ['pune stil.atmosfera pe „plin”'] : []),
      ];
      erori.push(eroare('text-invizibil', camp,
        `${m.ref}: la ${secunde(m.t)} s, în zona textului diferă de fundal ${procent(m.proportie)}% din pixeli (maximum ${procent(max)}%), deci zona textului e acoperită.`,
        pasi.length > 0 ? propozitie(pasi) : `Mută ce acoperă zona textului; ${TRIMITERE_SABLON}.`));
    }
  }
  const valoare = { masuratori: masuratori.map((m) => ({ ref: m.ref, t: m.t, proportie: Number.isFinite(m.proportie) ? rotunjeste(m.proportie, 4) : null })) };
  return rezultat('C13', erori.length === 0, { valoare, prag: { min, max }, camp: erori[0]?.camp ?? null, erori });
}
