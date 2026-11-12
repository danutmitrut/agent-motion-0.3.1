// Gruparea subtitrărilor (spec 7.4, „Calculul timpilor”; decizia 3 din planul H): unități nedespărțite, ruperi, mărimea
// aleasă în Node (fără fitTextFontSize), timpii fără suprapuneri. Funcție pură; măsurătorul vine din afară.
import { eroare, rotunjeste } from '../../../../nucleu/lib/sdk.mjs';
import { cheieCuvant, esteNumar, esteUmplutura } from './text.mjs';

const r3 = (x) => rotunjeste(x, 3);
const SFARSIT_FRAZA = /[.?!]["”»)\]]*$/;
const VIRGULA = /,["”»)\]]*$/;
const intersecteaza = (a0, a1, [b0, b1]) => a0 < b1 && b0 < a1;

export function cuvinteVizibile(cuvinte, { start, durata, umpluturi, suspendari }) {
  return cuvinte
    .filter((c) => !c.ascuns && c.text.trim() !== '' && !esteUmplutura(c.text, umpluturi))
    .map((c) => ({ id: c.id, text: c.text, start: r3(c.start - start), end: r3(c.end - start), evidentiat: false, ...(c.fraza !== undefined ? { fraza: c.fraza } : {}) }))
    .filter((c) => c.start >= 0 && c.end <= durata + 1e-9)
    .filter((c) => !suspendari.some((s) => intersecteaza(c.start, c.end, s)));
}

export function randuriCuvinte(texte, latimeMax, masoara, maxRanduri, unitati = null) {
  if (unitati) {
    // ruperea lacomă pe unități: o unitate întreagă trece pe rândul următor; una care nu încape singură dă null
    const randuri = [];
    let curent = [];
    for (const u of unitati) {
      if (masoara(u.map((i) => texte[i]).join(' ')) > latimeMax) return null;
      const comun = [...curent, ...u];
      if (curent.length > 0 && masoara(comun.map((i) => texte[i]).join(' ')) > latimeMax) { randuri.push(curent); curent = [...u]; } else curent = comun;
    }
    if (curent.length) randuri.push(curent);
    return randuri.length <= maxRanduri ? randuri : null;
  }
  const randuri = [];
  let curent = [];
  const lat = (idx) => masoara(idx.map((i) => texte[i]).join(' '));
  for (let i = 0; i < texte.length; i++) {
    if (masoara(texte[i]) > latimeMax) return null;
    if (curent.length > 0 && lat([...curent, i]) > latimeMax) { randuri.push(curent); curent = [i]; } else curent.push(i);
  }
  if (curent.length) randuri.push(curent);
  return randuri.length <= maxRanduri ? randuri : null;
}

/** Unitățile: [ [indici] ], în ordine; marchează evidențierile. */
function unitati(viz, evidentiaza, reguli, erori, suspendari) {
  // o suspendare între două cuvinte (începe între ele sau le intersectează intervalul) interzice legarea
  const taiat = (a, b) => suspendari.some((s) => intersecteaza(a.end, b.start, s) || (s[0] >= a.end && s[0] <= b.start));
  const legat = new Array(viz.length).fill(false); // legat[i]: i nu se desparte de i + 1
  const k = viz.map((c) => c.text.split(/\s+/).map(cheieCuvant).filter(Boolean).join(' '));
  evidentiaza.forEach((expr, e) => {
    const f = expr.split(/\s+/).map(cheieCuvant).filter(Boolean);
    let gasit = false;
    for (let p = 0; p < viz.length; p++) {
      // o expresie se potrivește pe cuvinte întregi consecutive (un cuvânt corectat poate avea mai multe chei)
      let j = p;
      let rest = [...f];
      while (rest.length && j < viz.length) {
        const kj = k[j].split(' ');
        if (kj.length > rest.length || kj.some((x, q) => x !== rest[q])) break;
        rest = rest.slice(kj.length);
        j += 1;
      }
      if (rest.length === 0 && j > p) {
        gasit = true;
        for (let q = p; q < j; q++) { viz[q].evidentiat = true; if (q < j - 1 && !taiat(viz[q], viz[q + 1])) legat[q] = true; }
      }
    }
    if (!gasit) {
      erori.push(eroare('overlay-filmare-evidentiaza', `subtitrari.evidentiaza[${e}]`, `Expresia „${expr}” din subtitrari.evidentiaza nu apare în transcrierea corectată.`,
        'Scrie expresia exact cum apare în subtitrări (diacriticele, majusculele și punctuația nu contează) sau scoate-o din listă.'));
    }
  });
  viz.forEach((c, i) => {
    if (!esteNumar(c.text)) return;
    c.evidentiat = true;
    const urm = viz[i + 1];
    if (urm && !/[.,;:!?]$/.test(c.text) && !esteNumar(urm.text) && urm.start - c.end < reguli.pauza_rupere && !taiat(c, urm)) legat[i] = true;
  });
  const lista = [];
  let curent = [];
  viz.forEach((_, i) => { curent.push(i); if (!legat[i]) { lista.push(curent); curent = []; } });
  if (curent.length) lista.push(curent);
  return lista;
}

function rupturaTare(a, b, o, suspendari) {
  const pauza = b.start - a.end;
  if (pauza >= o.reguli.pauza_rupere - 1e-9) return true;
  if (SFARSIT_FRAZA.test(a.text)) return true;
  if (VIRGULA.test(a.text) && pauza >= o.reguli.pauza_virgula - 1e-9) return true;
  if (o.import && a.fraza !== b.fraza) return true;
  return suspendari.some(([t0]) => t0 >= a.end && t0 <= b.start);
}

function potriveste(grup, viz, o, uni) {
  const [, , w, h] = o.banda;
  const [padV, padO] = o.reguli.padding;
  const texte = grup.map((i) => viz[i].text);
  const pozitie = new Map(grup.map((i, k) => [i, k]));
  const unitatiLocale = uni.filter((u) => pozitie.has(u[0])).map((u) => u.map((i) => pozitie.get(i)));
  for (let m = o.marime; m >= o.marimeMin; m -= o.reguli.pas_marime) {
    const randuri = randuriCuvinte(texte, w - 2 * padO, o.masoaraLa(m), o.reguli.randuri_max, unitatiLocale);
    if (randuri && randuri.length * m * o.reguli.inaltime_rand + 2 * padV <= h) return { marime: m, randuri };
  }
  return null;
}

export function grupeaza(cuvinte, o) {
  const erori = [];
  const viz = cuvinteVizibile(cuvinte, o);
  if (o.majuscule) viz.forEach((c) => { c.text = c.text.toLocaleUpperCase('ro'); });
  const uni = unitati(viz, o.evidentiaza, o.reguli, erori, o.suspendari);
  // 1-2. grupurile de indici
  const brute = [];
  let curent = [];
  for (const u of uni) {
    const prev = curent.length ? viz[curent.at(-1)] : null;
    if (prev && (rupturaTare(prev, viz[u[0]], o, o.suspendari) || curent.length + u.length > o.cuvinteMax)) { brute.push(curent); curent = []; }
    curent.push(...u);
  }
  if (curent.length) brute.push(curent);
  // 3. mărimea, cu ruperea în două a grupurilor care nu încap
  const potrivite = [];
  const deLucru = [...brute];
  while (deLucru.length) {
    const g = deLucru.shift();
    const p = potriveste(g, viz, o, uni);
    if (p) { potrivite.push({ idx: g, ...p }); continue; }
    const unitatiG = uni.filter((u) => g.includes(u[0]));
    if (unitatiG.length < 2) {
      erori.push(eroare('overlay-filmare-subtitrari', 'corecturi', `Cuvântul „${g.map((i) => viz[i].text).join(' ')}” e prea lung pentru subtitrare, chiar la ${o.marimeMin} px.`,
        'Scurtează-l cu o corectură (corecturi[], cu in mai scurt) sau ascunde-l cu in: "".'));
      continue;
    }
    const jum = Math.floor(unitatiG.length / 2);
    deLucru.unshift(unitatiG.slice(0, jum).flat(), unitatiG.slice(jum).flat());
  }
  // 4. timpii
  const grupuri = [];
  for (const g of potrivite) {
    const prim = viz[g.idx[0]];
    const ultim = viz[g.idx.at(-1)];
    const anterior = grupuri.at(-1) ?? null;
    // decizia 27: avansul nu intră într-o suspendare; startul e cel puțin sfârșitul ultimei suspendări încheiate la sau înainte de primul cuvânt
    const dupaSusp = Math.max(0, ...o.suspendari.map(([, t1]) => t1).filter((t1) => t1 <= prim.start + 1e-9));
    const start = r3(Math.max(prim.start - o.reguli.avans_max, anterior?.end ?? 0, dupaSusp, 0));
    const urmSusp = o.suspendari.map(([t0]) => t0).filter((t0) => t0 >= ultim.end - 1e-9).sort((a, b) => a - b)[0] ?? Infinity;
    const end = r3(Math.min(Math.max(ultim.end, start + o.reguli.durata_min), urmSusp, o.durata));
    if (end - start < o.reguli.durata_min - 1e-9) {
      const intre = anterior && !o.suspendari.some(([t0]) => t0 >= anterior.end - 1e-9 && t0 <= prim.start);
      const lipit = intre ? potriveste([...anterior.idx, ...g.idx], viz, o, uni) : null;
      if (lipit) {
        Object.assign(anterior, { idx: [...anterior.idx, ...g.idx], ...lipit, end: r3(Math.min(Math.max(ultim.end, anterior.start + o.reguli.durata_min), urmSusp, o.durata)) });
      }
      continue;
    }
    grupuri.push({ idx: g.idx, marime: g.marime, randuri: g.randuri, start, end });
  }
  const rezultat = grupuri.map((g, i) => ({
    n: i + 1, id: `g${i + 1}`, start: g.start, end: g.end, marime: g.marime, randuri: g.randuri,
    cuvinte: g.idx.map((k) => ({ id: viz[k].id, text: viz[k].text, start: viz[k].start, end: viz[k].end, evidentiat: viz[k].evidentiat })),
  }));
  // 5. acoperirea
  const inGrupuri = rezultat.reduce((s, g) => s + g.cuvinte.length, 0);
  const proportie = viz.length === 0 ? 1 : rotunjeste(inGrupuri / viz.length, 4);
  if (proportie < o.reguli.acoperire_min) {
    erori.push(eroare('overlay-filmare-subtitrari', 'subtitrari', `Subtitrările acoperă ${Math.round(proportie * 100)}% din cuvintele rostite (${viz.length - inGrupuri} scoase); minimul e ${Math.round(o.reguli.acoperire_min * 100)}%.`,
      'Lasă mai mult loc între elementele din centru (citat, listă, final) și vorbire, mărește subtitrari.cuvinte_max sau alege subtitrari.marime S.'));
  }
  return { grupuri: rezultat, erori, acoperire: { vizibile: viz.length, in_grupuri: inGrupuri, proportie } };
}
