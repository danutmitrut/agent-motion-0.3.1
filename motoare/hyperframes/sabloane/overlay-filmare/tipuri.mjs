// Așezarea elementelor peste filmare (spec 7.4, „Elementele”; deciziile 9-11 și 21 din planul H): textele fiecărui tip,
// cea mai mare mărime a fiecărui rol la care rândurile încap în bandă, cardul, pozițiile și pașii animației, pe timpi absoluți.
// Ce trece aici încape și pe ecran: compileaza.mjs scrie exact mărimile și pozițiile de aici.
import { eroare, rotunjeste, rupeRanduri, masuratorRand, esteFontBrand, timpCitire, secundeCuZecimala as secunde } from '../../../../nucleu/lib/sdk.mjs';

const EPS = 1e-9;
const r2 = (x) => rotunjeste(x, 2);
const r3 = (x) => rotunjeste(x, 3);

export const IESIRE = 0.25; // ieșirea unui element: opacitate 0 și 12 px în sus
export const INTRARE_RAND = 0.12; // primul rând intră după card
export const PAS_RAND = 0.08; // pasul dintre rânduri
export const NUMARARE = 0.8; // numărătoarea cifrei
export const MARCAJ_EM = 0.9; // locul bulinei din fața unui punct de listă, în em

/** Greutatea titlurilor: montserrat 800, celelalte fonturi din catalog 700, fontul de brand 700 (ca la text-animat). */
export function greutateTitlu(fontTitlu, implicite) {
  if (esteFontBrand(fontTitlu)) return 700;
  return implicite.greutate_titlu[fontTitlu] ?? implicite.greutate_titlu.implicit;
}

/** Măsurătorii pe rol și mărime, cu cache (fontkit deschide fiecare combinație o singură dată). */
export function creeazaMasuratori(radacina, stilPlat, implicite) {
  const cache = new Map();
  const gt = greutateTitlu(stilPlat.font_titlu, implicite);
  return {
    greutateTitlu: gt,
    masoara(rol, marime, spatiereEm = 0) {
      const R = implicite.roluri[rol];
      const cheie = `${rol}|${marime}|${spatiereEm}`;
      if (!cache.has(cheie)) {
        const font = R.font === 'titlu' ? stilPlat.font_titlu : stilPlat.font_text;
        const greutate = R.font === 'titlu' ? gt : R.greutate;
        cache.set(cheie, masuratorRand(radacina, { font, greutate, marime, spatiereEm }));
      }
      return cache.get(cheie);
    },
  };
}

/** Numărul cu formatare românească, scrisă manual (1.250.000; 3,5); aceeași funcție e copiată în lib/miscari.js. */
export function formateazaNumar(valoare, zecimale) {
  const semn = valoare < 0 ? '-' : '';
  const [intreg, zec] = Math.abs(valoare).toFixed(zecimale).split('.');
  return `${semn}${intreg.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${zec ? `,${zec}` : ''}`;
}

export const zecimaleCifra = (d) => d.zecimale ?? Math.min(2, (String(d.valoare).split('.')[1] ?? '').length);
export const textCifra = (d) => `${d.prefix ?? ''}${formateazaNumar(d.valoare, zecimaleCifra(d))}${d.sufix ?? ''}`;

/** Textele unui element, în ordinea de pe ecran: { fel, rol, camp, text, maxRanduri, spatiere?, k? }. */
export function cereriElement(d, camp, eticheta = null) {
  const c = [];
  const pune = (fel, rol, cheie, text, maxRanduri, extra = {}) => { if (typeof text === 'string' && text !== '') c.push({ fel, rol, camp: `${camp}.${cheie}`, text, maxRanduri, ...extra }); };
  switch (d.tip) {
    case 'titlu':
      if (d.eticheta !== undefined) {
        const text = `${eticheta?.prefix ?? ''}${eticheta?.majuscule ? d.eticheta.toLocaleUpperCase('ro') : d.eticheta}`;
        pune('eticheta', 'eticheta', 'eticheta', text, 1, { spatiere: eticheta?.spatiere ?? 0 });
      }
      d.titlu.forEach((t, j) => pune('rand', 'titlu', `titlu[${j}]`, t, 2));
      break;
    case 'nume':
      pune('rand', 'nume', 'nume', d.nume, 1);
      pune('rand', 'rol', 'rol', d.rol, 1);
      break;
    case 'cifra':
      pune('cifra', 'cifra', 'valoare', textCifra(d), 1);
      pune('rand', 'text_cifra', 'text', d.text, 2);
      break;
    case 'citat':
      pune('rand', 'citat', 'text', `„${d.text}”`, 4);
      pune('rand', 'autor', 'autor', d.autor, 1);
      break;
    case 'lista':
      (d.titlu ?? []).forEach((t, j) => pune('rand', 'lista_titlu', `titlu[${j}]`, t, 1));
      d.puncte.forEach((p, k) => pune('punct', 'punct', `puncte[${k}].text`, p.text, 2, { k }));
      break;
    case 'final':
      pune('rand', 'cta', 'cta', d.cta, 2);
      pune('rand', 'detaliu', 'detaliu', d.detaliu, 1);
      break;
    default:
      throw new TypeError(`Tip de element necunoscut: ${d.tip}`);
  }
  return c;
}

/** Mărimile unui rol, de la cea de bază în jos, în pași de 2 px, scalate pe format (orizontal: 0,75). */
function marimiRol(R, scala) {
  const max = Math.round(R.marime * scala);
  const min = Math.round(R.min * scala);
  const lista = [];
  for (let m = max; m > min; m -= 2) lista.push(m);
  lista.push(min);
  return lista;
}

/**
 * Cea mai mare mărime, de la `a.kMin` în jos, la care textul încape pe lățime: întâi pe un rând, apoi pe două și tot așa
 * până la `maxRanduri` (un titlu scurt nu se rupe ca să stea mai mare). Pune în `a` mărimea (`k`) și rândurile.
 */
function potriveste(a, latimeMax, masuri) {
  const { c } = a;
  for (let n = 1; n <= c.maxRanduri; n++) {
    for (let k = a.kMin; k < a.marimi.length; k++) {
      const m = a.marimi[k];
      const baza = masuri.masoara(c.rol, m, c.spatiere ?? 0);
      // cifra se măsoară cu zerouri: numărătoarea trece prin toate valorile, iar caseta trebuie să le cuprindă
      const masoara = c.fel === 'cifra' ? (t) => baza(t.replace(/\d/g, '0')) : baza;
      const loc = c.fel === 'punct' ? latimeMax - MARCAJ_EM * m : latimeMax;
      const r = rupeRanduri(c.text, { latimeMax: loc, masoara, maxRanduri: n });
      if (r.ok) {
        a.k = k;
        a.randuri = r.randuri;
        return true;
      }
    }
  }
  return false;
}

const inaltimeAlegere = (a, implicite) => a.randuri.length * a.marimi[a.k] * implicite.roluri[a.c.rol].inaltime_rand;

/**
 * @param {object} el ElementTimp (timp.mjs)
 * @param {object} d elementul din date.json
 * @param {{benzi: object, implicite: object, format: string, masuri: object, stilPlat: object, ritm: object}} o
 * @returns {{element: object|null, erori: object[]}} element = PlanElement fără permite_banda_subtitrari
 */
export function aseazaElement(el, d, o) {
  const { implicite, ritm } = o;
  const scala = implicite.formate[o.format].scala_roluri;
  const banda = o.benzi[el.banda];
  const [padV, padO] = implicite.card.padding.map((p) => Math.round(p * scala));
  const gol = Math.round(implicite.card.gol * scala);
  const latimeMax = (banda[2] - 2 * padO) * (1 - implicite.marja_latime);
  const nuIncape = (camp, cat) => ({
    element: null,
    erori: [eroare('rand-nu-incape', camp, `${el.camp} (${el.tip}): ${cat} în banda ${el.banda} (${banda[2]}x${banda[3]} px), nici la mărimea minimă a textului.`,
      'Scurtează textul sau împarte-l în două elemente.')],
  });

  const alegeri = cereriElement(d, el.camp, o.stilPlat.eticheta).map((c) => ({ c, marimi: marimiRol(implicite.roluri[c.rol], scala), kMin: 0, k: 0, randuri: null }));
  for (const a of alegeri) {
    if (!potriveste(a, latimeMax, o.masuri)) return nuIncape(a.c.camp, `textul „${a.c.text}” nu încape pe lățime în ${a.c.maxRanduri === 1 ? 'un rând' : `${a.c.maxRanduri} rânduri`}`);
  }
  // înălțimea: toate textele scad câte un pas, cât timp cardul nu încape în bandă
  const inaltime = () => alegeri.reduce((s, a) => s + inaltimeAlegere(a, implicite), 0) + gol * (alegeri.length - 1) + 2 * padV;
  while (inaltime() > banda[3] + EPS) {
    const pot = alegeri.filter((a) => a.k < a.marimi.length - 1);
    if (pot.length === 0) return nuIncape(el.camp, 'textele nu încap pe înălțime');
    for (const a of pot) {
      a.kMin = a.k + 1;
      if (!potriveste(a, latimeMax, o.masuri)) return nuIncape(a.c.camp, `textul „${a.c.text}” nu încape`);
    }
  }

  const aliniere = el.tip === 'citat' || el.tip === 'final' ? 'centru' : 'stanga';
  const latimeRand = (a, r) => r.latime + (a.c.fel === 'punct' ? MARCAJ_EM * a.marimi[a.k] : 0);
  const w = r2(Math.max(...alegeri.flatMap((a) => a.randuri.map((r) => latimeRand(a, r)))) + 2 * padO);
  const h = r2(inaltime());
  const x = r2(el.banda === 'centru' ? banda[0] + (banda[2] - w) / 2 : banda[0]);
  const y = r2(el.banda === 'centru' ? banda[1] + (banda[3] - h) / 2 : el.banda === 'nume' ? banda[1] + banda[3] - h : banda[1]);

  const n = el.n;
  const blocuri = [{ id: `b${n}-1`, fel: 'card', x, y, w, h }];
  const pasi = [{ efect: 'apare', tinta: `#b${n}-1`, t: el.start, dur: ritm.intrare, x: 0, y: 16, ease: ritm.ease }];
  const texte = [];
  let yc = y + padV;
  let q = 0;
  alegeri.forEach((a, i) => {
    const m = a.marimi[a.k];
    const hr = m * implicite.roluri[a.c.rol].inaltime_rand;
    a.randuri.forEach((r) => {
      const lat = latimeRand(a, r);
      const bx = aliniere === 'centru' ? x + (w - lat) / 2 : x + padO;
      const marcaj = a.c.fel === 'punct' ? r2(MARCAJ_EM * m) : 0;
      const bloc = { id: `b${n}-${blocuri.length + 1}`, fel: a.c.fel, rol: a.c.rol, x: r2(bx), y: r2(yc), w: r2(lat), h: r2(hr), marime: m, text: r.text, camp: a.c.camp, text_id: `t${n}-${texte.length + 1}`, ...(marcaj ? { marcaj } : {}) };
      blocuri.push(bloc);
      let t = el.start + INTRARE_RAND + q * PAS_RAND;
      if (a.c.fel === 'punct') t = Math.max(t, el.puncte[a.c.k].t);
      pasi.push({ efect: 'apare', tinta: `#${bloc.id}`, t: r3(t), dur: ritm.intrare, x: 0, y: 12, ease: ritm.ease });
      let vizibil = t + ritm.intrare;
      if (a.c.fel === 'cifra') {
        pasi.push({ efect: 'numara', tinta: `#${bloc.text_id}`, t: r3(t), dur: NUMARARE, valoare: d.valoare, zecimale: zecimaleCifra(d), prefix: d.prefix ?? '', sufix: d.sufix ?? '' });
        vizibil = Math.max(vizibil, t + NUMARARE);
      }
      texte.push({ id: bloc.text_id, text: r.text, camp: a.c.camp, t: r3(vizibil), caseta: [r2(bx + marcaj), r2(yc), r2(r.latime), r2(hr)] });
      yc += hr;
      q += 1;
    });
    if (i < alegeri.length - 1) yc += gol;
  });
  const sfarsitVizibil = el.tip === 'final' ? el.sfarsit : r3(el.sfarsit - IESIRE);
  if (el.tip !== 'final') pasi.push({ efect: 'iese', tinta: `#e${n}`, t: sfarsitVizibil, dur: IESIRE, x: 0, y: -12, ease: 'power2.in' });
  const complet = r3(Math.max(el.start + ritm.intrare, ...texte.map((t) => t.t)));

  const camp = d.durata !== undefined ? `${el.camp}.durata` : d.la !== undefined ? `${el.camp}.la` : d.ancora ? `${el.camp}.ancora.fraza` : `${el.camp}.durata`;
  if (complet > sfarsitVizibil + EPS) {
    return {
      element: null,
      erori: [eroare('overlay-filmare-ocupare', camp, `${el.camp} (${el.tip}) iese la ${secunde(sfarsitVizibil)} s, înainte să apară tot textul (la ${secunde(complet)} s).`,
        `Mărește ${el.camp}.durata sau scoate-o, ca mg s-o calculeze.`)],
    };
  }
  const necesar = timpCitire(texte.map((t) => t.text).join(' '));
  if (el.sfarsit - el.start + EPS < necesar) {
    return {
      element: null,
      erori: [eroare('prea-repede-de-citit', `${el.camp}.durata`, `${el.camp} (${el.tip}) stă pe ecran ${secunde(r3(el.sfarsit - el.start))} s; textul lui cere ${secunde(necesar)} s de citire (0,8 s + 0,3 s pe cuvânt).`,
        `Mărește ${el.camp}.durata la cel puțin ${secunde(necesar)} (maximul tipului: ${secunde(implicite.durate[el.tip].max)} s) sau scurtează textul.`)],
    };
  }
  return {
    element: { n, id: el.id, camp: el.camp, tip: el.tip, banda: el.banda, start: el.start, complet, sfarsit: el.sfarsit, ancora: el.ancora, aliniere, blocuri, pasi, texte },
    erori: [],
  };
}
