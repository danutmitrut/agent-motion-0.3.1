// Așezarea scenelor din date-serie (spec 7.3; deciziile 9 și 10 din planul I). Pentru fiecare scenă: blocurile de text
// gata așezate (mărimea, rândurile, poziția, caseta fiecărui rând), barele cu coordonate și rândurile comparației.
// Totul se măsoară cu fontkit (masuratorRand), în fontul real al temei, cu marja de 4%; React doar desenează exact
// numerele de aici, deci S04, caseta lui C13 și randarea folosesc aceleași mărimi. Pozițiile sunt pixeli întregi.
import { eroare, masuratorRand, rupeRanduri, grafeme } from '../../../../nucleu/lib/sdk.mjs';
import * as Z from './src/comun/zone.mjs';
import { textValoare } from './src/comun/numere.mjs';
import { esteCifre } from './src/comun/cifre.mjs';
import { locCamp, zecimaleScena } from './reguli.mjs';

const inaltimeRanduri = (marime, n = 1) => Math.round(n * marime * Z.INTERLINIE);

/** Eticheta cum apare pe ecran: prefixul și majusculele temei. */
export function etichetaAfisata(text, eticheta) {
  return `${eticheta?.prefix ?? ''}${eticheta?.majuscule ? text.toUpperCase() : text}`;
}

/** Măsurătorul pe (font, greutate, mărime, spațiere), cu cache: fontkit deschide fiecare combinație o singură dată. */
export function creeazaMasurator(radacina, stilPlat) {
  const cache = new Map();
  return (font, greutate, marime, spatiere = 0) => {
    const cheie = `${font}|${greutate}|${marime}|${spatiere}`;
    if (!cache.has(cheie)) {
      const fisier = font === 'titlu' ? stilPlat.font_titlu : stilPlat.font_text;
      cache.set(cheie, masuratorRand(radacina, { font: fisier, greutate, marime, spatiereEm: spatiere }));
    }
    return cache.get(cheie);
  };
}

/** Mărimile unei plaje, de la cea mai mare la cea mai mică (minimul intră mereu). */
export function marimi({ max, min, pas }) {
  const lista = [];
  for (let m = max; m > min; m -= pas) lista.push(m);
  lista.push(min);
  return lista;
}

/**
 * Plaja unei trepte de mărime (Z.TREPTE): M e plaja de bază; L și XL pornesc de la maximul ei înmulțit, pe același pas.
 * @param {{max: number, min: number, pas: number}} baza @param {'M'|'L'|'XL'|undefined} treapta @param {boolean} [cifra]
 */
export function plajaTreapta(baza, treapta, cifra = false) {
  const t = Z.TREPTE[treapta];
  if (!t) return baza;
  const rotunjeste = (x) => Math.round(x / baza.pas) * baza.pas;
  return { ...baza, max: rotunjeste(baza.max * (cifra && t.maxCifra ? t.maxCifra : t.max)), min: rotunjeste(baza.max * t.min) };
}

/** Lățimea măsurată a unui text; cifrele mari se măsoară cu 0 în loc de fiecare cifră, ca în timpul numărătorii. */
function latimeText(cerere, masoara, text) {
  return masoara(cerere.cifre ? text.replace(/\d/g, '0') : text);
}

/** Mărimea afixelor la mărimea m a cifrelor (Z.SCARA_AFIXE). */
const marimeAfixe = (m) => Math.round(m * Z.SCARA_AFIXE);

/** Lățimea unei valori cu afixe mai mici: cifrele (cu 0) la m, prefixul și sufixul la marimeAfixe(m). */
function latimeAfixe(cerere, mas, m, text) {
  const { prefix, sufix } = cerere.afixe;
  const mijloc = text.slice(prefix.length, text.length - sufix.length);
  const mic = mas(cerere.font, cerere.greutate, marimeAfixe(m), cerere.spatiere);
  return latimeText(cerere, mas(cerere.font, cerere.greutate, m, cerere.spatiere), mijloc) + (prefix ? mic(prefix) : 0) + (sufix ? mic(sufix) : 0);
}

/**
 * Cea mai mare mărime la care încape cererea. `randuri`: rânduri fixe (fiecare pe un rând); `rupt`: un text rupt
 * automat în cel mult `maxRanduri`. Eșecul (la mărimea minimă) spune câmpul și motivul.
 */
function potriveste(cerere, mas) {
  const lista = cerere.marimi;
  let esec = null;
  for (const m of lista) {
    const masoara = mas(cerere.font, cerere.greutate, m, cerere.spatiere);
    if (cerere.rupt !== undefined) {
      const r = rupeRanduri(cerere.rupt, { latimeMax: Z.LATIME_RAND, masoara, maxRanduri: cerere.maxRanduri });
      if (r.ok) return { ok: true, marime: m, randuri: r.randuri.map((x) => ({ text: x.text, latime: x.latime, camp: cerere.camp })) };
      esec = { motiv: r.motiv, camp: cerere.camp, text: cerere.rupt, marime: m, cuvant: r.cuvant };
      continue;
    }
    const randuri = cerere.randuri.map((rd) => ({ ...rd, latime: cerere.afixe ? latimeAfixe(cerere, mas, m, rd.text) : latimeText(cerere, masoara, rd.text) }));
    const lat = randuri.find((rd) => rd.latime > (rd.limita ?? Z.LATIME_RAND));
    if (!lat) return { ok: true, marime: m, randuri };
    esec = { motiv: 'lat', camp: lat.camp, text: lat.text, marime: m, latime: lat.latime, limita: lat.limita ?? Z.LATIME_RAND };
  }
  return { ok: false, ...esec };
}

function sugestieLatime(camp) {
  const i = /^scene\[(\d+)\]/.exec(camp)[1];
  if (/\.titlu\[\d+\]$/.test(camp)) return `Scurtează rândul sau mută o parte din el în celălalt rând al titlului (scene[${i}].titlu are cel mult 2 rânduri).`;
  if (/\.valoare$/.test(camp)) return `Scrie valoarea în mii sau milioane (de exemplu 21,3 cu sufixul „ mii”) sau scurtează prefixul și sufixul din ${camp.replace(/\.valoare$/, '')}.`;
  if (/\.valori\[\d+\]\.eticheta$/.test(camp)) return `Scurtează ${camp} (o abreviere, de exemplu „ian” în loc de „ianuarie”).`;
  return `Scurtează ${camp}.`;
}

/** Eroarea S04 a unei cereri care nu încape nici la mărimea minimă. */
function eroareLatime(e, cerere) {
  if (cerere.treapta && cerere.treapta !== 'M') {
    const i = /^scene\[(\d+)\]/.exec(e.camp)[1];
    const mai = cerere.treapta === 'XL' ? '"L" sau "M"' : '"M"';
    return eroare('rand-nu-incape', e.camp,
      `${locCamp(e.camp)} nu încape la mărimea ${cerere.treapta} nici la ${e.marime} px${e.latime ? ` (are ${Math.round(e.latime)} px, încap ${Math.floor(e.limita)} px)` : ''}.`,
      `Pune scene[${i}].marime pe ${mai} sau scurtează ${e.camp}; mai mare de atât nu se poate pe acest ecran.`, { verificare: 'S04' });
  }
  if (e.motiv === 'prea-multe-randuri') {
    return eroare('rand-nu-incape', e.camp,
      `${locCamp(e.camp)} are nevoie de mai mult de ${cerere.maxRanduri} ${cerere.maxRanduri === 1 ? 'rând' : 'rânduri'} la ${e.marime} px.`,
      `Scurtează ${e.camp}.`, { verificare: 'S04' });
  }
  if (e.motiv === 'cuvant-prea-lung') {
    return eroare('rand-nu-incape', e.camp,
      `${locCamp(e.camp)}: cuvântul „${e.cuvant}” nu încape pe un rând la ${e.marime} px.`,
      `Înlocuiește cuvântul din ${e.camp} cu unul mai scurt.`, { verificare: 'S04' });
  }
  return eroare('rand-nu-incape', e.camp,
    `${locCamp(e.camp)}, „${e.text}”, are ${Math.round(e.latime)} px la ${e.marime} px și nu încape (încap ${Math.floor(e.limita)} px).`,
    sugestieLatime(e.camp), { verificare: 'S04' });
}

/** Blocul de text gata de desenat (forma din props.json), plus câmpul și caseta fiecărui rând (pentru așteptări). */
export function bloc(cerere, p, x, y) {
  const latime = Math.ceil(Math.max(...p.randuri.map((r) => r.latime)));
  const h = inaltimeRanduri(p.marime);
  const centru = cerere.aliniere === 'centru';
  return {
    id: cerere.id,
    text: p.randuri.map((r) => r.text).join('\n'),
    randuri: p.randuri.map((r) => r.text),
    x,
    y,
    latime,
    inaltime: inaltimeRanduri(p.marime, p.randuri.length),
    marime: p.marime,
    ...(cerere.afixe ? { afixe: { prefix: cerere.afixe.prefix, sufix: cerere.afixe.sufix, marime: marimeAfixe(p.marime) } } : {}),
    font: cerere.font,
    greutate: cerere.greutate,
    culoare: cerere.culoare,
    spatiere: cerere.spatiere,
    aliniere: cerere.aliniere,
    campuri: p.randuri.map((r) => r.camp),
    casete: p.randuri.map((r, j) => {
      const w = Math.ceil(r.latime);
      return [centru ? x + Math.round((latime - w) / 2) : x, y + inaltimeRanduri(p.marime, j), w, h];
    }),
  };
}

const TEXT = (extra) => ({ font: 'text', greutate: Z.GREUTATE.text, culoare: 'text', spatiere: 0, aliniere: 'stanga', marimi: [Z.TEXT], ...extra });

function cerereEticheta(s, b, stilPlat) {
  if (s.eticheta === undefined) return null;
  return TEXT({ id: 'eticheta', greutate: Z.GREUTATE.tare, culoare: 'atenuat', spatiere: stilPlat.eticheta?.spatiere ?? 0,
    randuri: [{ text: etichetaAfisata(s.eticheta, stilPlat.eticheta), camp: `${b}.eticheta` }] });
}

function cerereTitlu(s, b, treapta) {
  return { id: 'titlu', font: 'titlu', greutate: Z.GREUTATE.titlu, culoare: 'text', spatiere: 0, aliniere: 'stanga', marimi: marimi(plajaTreapta(Z.TITLU, treapta)), treapta,
    randuri: s.titlu.map((text, j) => ({ text, camp: `${b}.titlu[${j}]` })) };
}

/** Cererile unei scene centrate pe verticală, cu spațiul dinaintea fiecăreia. */
function cereriCentrate(s, b, stilPlat) {
  const c = [];
  const adauga = (cerere, spatiu = Z.SPATII.bloc) => {
    if (cerere) c.push({ cerere, spatiu: c.length === 0 ? 0 : (c[c.length - 1].cerere.id === 'eticheta' ? Z.SPATII.eticheta : spatiu) });
  };
  adauga(cerereEticheta(s, b, stilPlat));
  switch (s.tip) {
    case 'titlu':
      adauga(cerereTitlu(s, b, s.marime));
      if (s.subtitlu !== undefined) adauga(TEXT({ id: 'subtitlu', culoare: 'atenuat', rupt: s.subtitlu, maxRanduri: 2, camp: `${b}.subtitlu` }));
      break;
    case 'cifra':
      adauga({ id: 'valoare', font: 'titlu', greutate: Z.GREUTATE.titlu, culoare: 'accent', spatiere: 0, aliniere: 'stanga', marimi: marimi(plajaTreapta(Z.CIFRA, s.marime, true)), treapta: s.marime, cifre: esteCifre('cifra', 'valoare'),
        afixe: s.marime === 'XL' && (s.prefix || s.sufix) ? { prefix: s.prefix ?? '', sufix: s.sufix ?? '' } : undefined,
        randuri: [{ text: textValoare(s), camp: `${b}.valoare` }] });
      adauga(TEXT({ id: 'text', rupt: s.text, maxRanduri: 2, camp: `${b}.text` }));
      break;
    case 'comparatie': {
      adauga(cerereTitlu(s, b));
      const z = zecimaleScena(s);
      s.valori.forEach((v, k) => {
        adauga(TEXT({ id: `eticheta-${k}`, culoare: 'atenuat', randuri: [{ text: v.eticheta, camp: `${b}.valori[${k}].eticheta` }] }), k === 0 ? Z.SPATII.bloc : Z.SPATII.rand);
        adauga({ id: `valoare-${k}`, font: 'titlu', greutate: Z.GREUTATE.titlu, culoare: v.eticheta === s.evidentiaza ? 'accent' : 'text', spatiere: 0, aliniere: 'stanga',
          marimi: marimi(plajaTreapta(Z.VALOARE_COMPARATIE, s.marime)), treapta: s.marime, cifre: esteCifre('comparatie', `valoare-${k}`), grup: 'valori',
          randuri: [{ text: textValoare({ ...v, zecimale: z }), camp: `${b}.valori[${k}].valoare` }] }, Z.SPATII.valoare);
      });
      break;
    }
    case 'final':
      adauga(cerereTitlu(s, b, s.marime));
      if (s.cta !== undefined) adauga(TEXT({ id: 'cta', greutate: Z.GREUTATE.tare, culoare: 'accent', randuri: [{ text: s.cta, camp: `${b}.cta` }] }));
      break;
    default:
      throw new TypeError(`Scena ${s.tip} nu se așază centrat.`);
  }
  return c;
}

/** Potrivirea unui grup (valorile comparației au aceeași mărime): cea mai mare mărime la care încap toate. */
function potrivesteToate(cereri, mas) {
  const grup = cereri.filter((x) => x.grup);
  const rezultate = new Map();
  if (grup.length > 0) {
    const unit = { ...grup[0], randuri: grup.flatMap((x) => x.randuri) };
    const p = potriveste(unit, mas);
    if (!p.ok) return { esec: { e: p, cerere: unit } };
    grup.forEach((x, k) => rezultate.set(x.id, { ok: true, marime: p.marime, randuri: [p.randuri[k]] }));
  }
  for (const x of cereri) {
    if (x.grup) continue;
    const p = potriveste(x, mas);
    if (!p.ok) return { esec: { e: p, cerere: x } };
    rezultate.set(x.id, p);
  }
  return { rezultate };
}

function eroareInaltime(i, inaltime, disponibil, treapta) {
  return eroare('rand-nu-incape', `scene[${i}]`,
    `Scena ${i + 1}: textul și graficul ocupă ${Math.round(inaltime)} px pe înălțime, iar zona sigură are ${disponibil} px.`,
    `${treapta && treapta !== 'M' ? `Pune scene[${i}].marime pe o treaptă mai mică, sau scurtează` : 'Scurtează'} textele din scene[${i}] (un titlu de un rând, fără subtitlu sau sursă) sau împarte scena în două.`, { verificare: 'S04' });
}

function sigla(s, dim) {
  if (s.tip !== 'final' || !dim) return null;
  const k = Math.min(Z.SIGLA.latime / dim.latime, Z.SIGLA.inaltime / dim.inaltime);
  return { latime: Math.max(1, Math.round(dim.latime * k)), inaltime: Math.max(1, Math.round(dim.inaltime * k)) };
}

function aseazaCentrat(s, i, stilPlat, mas, dimSigla) {
  const lista = cereriCentrate(s, `scene[${i}]`, stilPlat);
  const p = potrivesteToate(lista.map((x) => x.cerere), mas);
  if (p.esec) return { erori: [eroareLatime(p.esec.e, p.esec.cerere)] };
  const cutieSigla = sigla(s, dimSigla);
  let total = 0;
  for (const { cerere, spatiu } of lista) {
    const r = p.rezultate.get(cerere.id);
    total += spatiu + inaltimeRanduri(r.marime, r.randuri.length);
  }
  if (cutieSigla) total += Z.SPATII.sigla + cutieSigla.inaltime;
  const zona = Z.JOS - Z.SUS;
  if (total > zona) return { erori: [eroareInaltime(i, total, zona, s.marime)] };
  let y = Z.SUS + Math.round((zona - total) / 2);
  const centru = s.aliniere === 'centru';
  // la centru, fiecare bloc stă la mijlocul lățimii utile, cu rândurile centrate în el
  const xBloc = (latime) => (centru ? Z.LATERAL + Math.round((Z.LATIME_UTILA - latime) / 2) : Z.LATERAL);
  const texte = [];
  for (const { cerere, spatiu } of lista) {
    y += spatiu;
    const c = centru ? { ...cerere, aliniere: 'centru' } : cerere;
    const r = p.rezultate.get(cerere.id);
    const b = bloc(c, r, xBloc(Math.ceil(Math.max(...r.randuri.map((x) => x.latime)))), y);
    texte.push(b);
    y += b.inaltime;
  }
  const pozSigla = cutieSigla ? { x: xBloc(cutieSigla.latime), y: y + Z.SPATII.sigla, ...cutieSigla } : null;
  return { erori: [], texte, sigla: pozSigla };
}

function detaliiCentrat(s, i) {
  if (s.tip === 'cifra') return { valoare: s.valoare, zecimale: s.zecimale ?? 0, prefix: s.prefix ?? '', sufix: s.sufix ?? '', idText: 'valoare' };
  if (s.tip === 'comparatie') {
    const z = zecimaleScena(s);
    return { randuri: s.valori.map((v, k) => ({ idEticheta: `eticheta-${k}`, idValoare: `valoare-${k}`, valoare: v.valoare, zecimale: z, prefix: v.prefix ?? '', sufix: v.sufix ?? '', accent: v.eticheta === s.evidentiaza })) };
  }
  return {};
}

/** Orientarea barelor (spec 7.3): coloane dacă toate etichetele au cel mult 5 grafeme, altfel bare orizontale. */
export function orientareBare(s) {
  return s.valori.every((v) => grafeme(v.eticheta) <= Z.MAX_GRAFEME_COLOANE) ? 'coloane' : 'orizontal';
}

function aseazaBare(s, i, stilPlat, mas) {
  const b = `scene[${i}]`;
  const orientare = orientareBare(s);
  const z = zecimaleScena(s);
  const n = s.valori.length;
  const loc = Z.LATIME_UTILA / n;
  const valori = s.valori.map((v, k) => ({ v, k, accent: v.eticheta === s.evidentiaza, valoare: textValoare({ ...v, zecimale: z }) }));

  // antetul: eticheta, titlul, unitatea, de sus în jos
  const antet = [cerereEticheta(s, b, stilPlat), cerereTitlu(s, b),
    s.unitate === undefined ? null : TEXT({ id: 'unitate', culoare: 'atenuat', randuri: [{ text: s.unitate, camp: `${b}.unitate` }] })].filter(Boolean);
  const sursa = s.sursa === undefined ? null : TEXT({ id: 'sursa', culoare: 'atenuat', rupt: s.sursa, maxRanduri: 2, camp: `${b}.sursa` });
  const p = potrivesteToate([...antet, ...(sursa ? [sursa] : [])], mas);
  if (p.esec) return { erori: [eroareLatime(p.esec.e, p.esec.cerere)] };

  // antetul lipit sus, sursa lipită jos; graficul ocupă ce rămâne între ele
  const texte = [];
  let y = Z.SUS;
  antet.forEach((cerere, j) => {
    if (j > 0) y += Z.SPATII.eticheta;
    const blocNou = bloc(cerere, p.rezultate.get(cerere.id), Z.LATERAL, y);
    texte.push(blocNou);
    y += blocNou.inaltime;
  });
  const y0 = y + Z.SPATII.grafic;
  let y1 = Z.JOS;
  let blocSursa = null;
  if (sursa) {
    const r = p.rezultate.get('sursa');
    blocSursa = bloc(sursa, r, Z.LATERAL, Z.JOS - inaltimeRanduri(r.marime, r.randuri.length));
    y1 = blocSursa.y - Z.SPATII.sursa;
  }
  // înălțimea graficului la mărimea m: coloanele au nevoie de cel puțin COLOANE.minim px de bară, rândurile orizontale de tot pasul
  const inaltimeGrafic = (m) => {
    const h = inaltimeRanduri(m);
    return orientare === 'coloane'
      ? h + Z.COLOANE.peste + Z.COLOANE.minim + Z.COLOANE.sub + h
      : n * (h + Z.ORIZONTAL.dupaText + Z.ORIZONTAL.grosime + Z.ORIZONTAL.intre) - Z.ORIZONTAL.intre;
  };

  // etichetele și valorile barelor: aceeași mărime, cea mai mare la care încap toate, pe lățime și pe înălțime
  const cerereEt = (k) => TEXT({ id: `eticheta-${k}`, aliniere: orientare === 'coloane' ? 'centru' : 'stanga', culoare: valori[k].accent ? 'text' : 'atenuat' });
  const cerereVal = (k) => TEXT({ id: `valoare-${k}`, greutate: Z.GREUTATE.tare, aliniere: orientare === 'coloane' ? 'centru' : 'stanga', culoare: valori[k].accent ? 'accent' : 'text' });
  let marime = null;
  let esec = null;
  for (const m of marimi(Z.TEXT_GRAFIC)) {
    const masL = mas('text', Z.GREUTATE.text, m);
    const masV = mas('text', Z.GREUTATE.tare, m);
    esec = null;
    for (const { v, k, valoare } of valori) {
      const wl = masL(v.eticheta);
      const wv = masV(esteCifre('bare', `valoare-${k}`) ? valoare.replace(/\d/g, '0') : valoare);
      if (orientare === 'coloane') {
        const limita = loc * (1 - Z.MARJA);
        if (wl > limita) esec = { motiv: 'lat', camp: `${b}.valori[${k}].eticheta`, text: v.eticheta, marime: m, latime: wl, limita };
        else if (wv > limita) esec = { motiv: 'lat', camp: `${b}.valori[${k}].valoare`, text: valoare, marime: m, latime: wv, limita };
      } else if (wl + Z.ORIZONTAL.gol + wv > Z.LATIME_RAND) {
        esec = { motiv: 'lat', camp: `${b}.valori[${k}].eticheta`, text: `${v.eticheta} … ${valoare}`, marime: m, latime: wl + Z.ORIZONTAL.gol + wv, limita: Z.LATIME_RAND };
      }
      if (esec) break;
    }
    if (!esec && inaltimeGrafic(m) > y1 - y0) esec = { motiv: 'inalt', marime: m };
    if (!esec) {
      marime = m;
      break;
    }
  }
  if (marime === null) {
    if (esec.motiv === 'inalt') return { erori: [eroareInaltime(i, Z.JOS - Z.SUS - (y1 - y0) + inaltimeGrafic(esec.marime), Z.JOS - Z.SUS)] };
    return { erori: [eroareLatime(esec, {})] };
  }
  const masL = mas('text', Z.GREUTATE.text, marime);
  const masV = mas('text', Z.GREUTATE.tare, marime);
  const pEt = (k) => ({ ok: true, marime, randuri: [{ text: valori[k].v.eticheta, latime: masL(valori[k].v.eticheta), camp: `${b}.valori[${k}].eticheta` }] });
  const pVal = (k) => ({ ok: true, marime, randuri: [{ text: valori[k].valoare, latime: masV(valori[k].valoare.replace(/\d/g, '0')), camp: `${b}.valori[${k}].valoare` }] });
  const hT = inaltimeRanduri(marime);
  const maxim = Math.max(...s.valori.map((v) => v.valoare));
  const bare = [];
  let axa;
  if (orientare === 'coloane') {
    const yEt = y1 - hT;
    const yAxa = yEt - Z.COLOANE.sub;
    const hMax = yAxa - y0 - hT - Z.COLOANE.peste;
    const lb = Math.round(loc * Z.COLOANE.latime);
    for (const { v, k, accent } of valori) {
      const centru = Z.LATERAL + loc * k + loc / 2;
      const h = Math.round((v.valoare / maxim) * hMax);
      const yb = yAxa - h;
      const et = pEt(k);
      const val = pVal(k);
      texte.push(bloc(cerereEt(k), et, Math.round(centru - Math.ceil(et.randuri[0].latime) / 2), yEt));
      texte.push(bloc(cerereVal(k), val, Math.round(centru - Math.ceil(val.randuri[0].latime) / 2), yb - Z.COLOANE.peste - hT));
      bare.push({ x: Math.round(centru - lb / 2), y: yb, latime: lb, inaltime: h, accent, idEticheta: `eticheta-${k}`, idValoare: `valoare-${k}`, valoare: v.valoare, zecimale: z, prefix: v.prefix ?? '', sufix: v.sufix ?? '' });
    }
    axa = { x: Z.LATERAL, y: yAxa, latime: Z.LATIME_UTILA, inaltime: Z.AXA };
  } else {
    const pas = hT + Z.ORIZONTAL.dupaText + Z.ORIZONTAL.grosime + Z.ORIZONTAL.intre;
    const total = n * pas - Z.ORIZONTAL.intre;
    for (const { v, k, accent } of valori) {
      const yr = y0 + k * pas;
      const val = pVal(k);
      texte.push(bloc(cerereEt(k), pEt(k), Z.LATERAL, yr));
      texte.push(bloc(cerereVal(k), val, Z.LATERAL + Z.LATIME_UTILA - Math.ceil(val.randuri[0].latime), yr));
      bare.push({ x: Z.LATERAL, y: yr + hT + Z.ORIZONTAL.dupaText, latime: Math.round((v.valoare / maxim) * Z.LATIME_UTILA), inaltime: Z.ORIZONTAL.grosime, accent,
        idEticheta: `eticheta-${k}`, idValoare: `valoare-${k}`, valoare: v.valoare, zecimale: z, prefix: v.prefix ?? '', sufix: v.sufix ?? '' });
    }
    axa = { x: Z.LATERAL, y: y0 + hT + Z.ORIZONTAL.dupaText, latime: Z.AXA, inaltime: total - hT - Z.ORIZONTAL.dupaText };
  }
  if (blocSursa) texte.push(blocSursa);
  return { erori: [], texte, detalii: { orientare, axa, bare } };
}

/** Zona textului scenei, pentru cronologie: [x, sus, lățime, înălțime] peste toate blocurile, pe lățimea utilă. */
function zonaText(texte) {
  const sus = Math.min(...texte.map((t) => t.y));
  const jos = Math.max(...texte.map((t) => t.y + t.inaltime));
  return [Z.LATERAL, sus, Z.LATIME_UTILA, jos - sus];
}

/**
 * Așezarea tuturor scenelor. Se cheamă doar cu date trecute prin valideaza.
 * @param {{date: object, stilPlat: object, radacina: string, sigla?: {latime: number, inaltime: number}|null}} p
 * @returns {{erori: object[], scene: Array<{texte: object[], detalii: object, zona: number[]}>, sigla: {x: number, y: number, latime: number, inaltime: number}|null}}
 */
export function aseaza({ date, stilPlat, radacina, sigla: dimSigla = null }) {
  const mas = creeazaMasurator(radacina, stilPlat);
  const erori = [];
  const scene = [];
  let pozSigla = null;
  date.scene.forEach((s, i) => {
    const r = s.tip === 'bare' ? aseazaBare(s, i, stilPlat, mas) : aseazaCentrat(s, i, stilPlat, mas, dimSigla);
    if (r.erori.length > 0) {
      erori.push(...r.erori);
      return;
    }
    if (r.sigla) pozSigla = r.sigla;
    scene.push({ texte: r.texte, detalii: r.detalii ?? detaliiCentrat(s, i), zona: zonaText(r.texte) });
  });
  if (erori.length > 0) return { erori, scene: [], sigla: null };
  return { erori, scene, sigla: pozSigla };
}
