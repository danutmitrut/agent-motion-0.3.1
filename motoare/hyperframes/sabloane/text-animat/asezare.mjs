// Așezarea scenelor din text-animat (spec 7.2, „Rolurile de mărime”; C04 pe fontkit, marja de 4%). Pentru fiecare bloc:
// cea mai mare mărime a rolului la care fiecare rând încape; ruperea automată a frazei, a citatului și a textului cifrei;
// piesele de text (o piesă pe segment de accent, la frază una pe cuvânt), cu caseta lor statică, pentru C13 și C17.
// Blocurile se stivuiesc cu spațiile din implicite.json și se centrează vertical în zona sigură a formatului.
// Ce trece aici încape și pe ecran: compileaza.mjs scrie exact mărimile, pozițiile și alinierea de aici.
import { eroare, esteFontBrand, masuratorRand, rupeRanduri, textAfisat, rotunjeste } from '../../../../nucleu/lib/sdk.mjs';
import { locCamp } from './reguli.mjs';
import { textCifra, inMilioaneSauMii } from './cifre.mjs';
import { potrivesteSigla } from './sigla.mjs';

const EPS = 1e-9;
const r2 = (x) => rotunjeste(x, 2);

/** Greutatea titlurilor: montserrat 800, celelalte fonturi din catalog 700, fontul de brand 700 (un singur woff2). */
export function greutateTitlu(fontTitlu, implicite) {
  if (esteFontBrand(fontTitlu)) return 700;
  return implicite.greutate_titlu[fontTitlu] ?? implicite.greutate_titlu.implicit;
}

/** Măsurătorii pe rol și mărime, cu cache: fontkit deschide fiecare combinație o singură dată. */
export function creeazaMasuratori(radacina, stilPlat, implicite) {
  const cache = new Map();
  const gt = greutateTitlu(stilPlat.font_titlu, implicite);
  return {
    greutateTitlu: gt,
    masoara(rol, marime, spatiereEm) {
      const R = implicite.roluri[rol];
      const sp = spatiereEm ?? R.spatiere;
      const cheie = `${rol}|${marime}|${sp}`;
      if (!cache.has(cheie)) {
        const font = R.font === 'titlu' ? stilPlat.font_titlu : stilPlat.font_text;
        const greutate = R.font === 'titlu' ? gt : R.greutate;
        cache.set(cheie, masuratorRand(radacina, { font, greutate, marime, spatiereEm: sp }));
      }
      return cache.get(cheie);
    },
  };
}

/** Eticheta cum apare pe ecran: prefixul temei și majusculele temei. */
export function etichetaAfisata(text, eticheta) {
  return `${eticheta?.prefix ?? ''}${eticheta?.majuscule ? text.toUpperCase() : text}`;
}

/** Alinierea: din date (stil.aliniere), altfel a temei (implicite.aliniere), altfel centru. */
export function aliniereScena(stilPlat, implicite) {
  return stilPlat.aliniere ?? implicite.aliniere[stilPlat.tema] ?? 'centru';
}

/**
 * Mărimile rolului, de la cea mai mare la cea mai mică. Cu o treaptă (felia 2, implicite.trepte): L și XL pornesc
 * de la baza rolului înmulțită (cifra la XL, până la maxCifra), iar minimul e și el al treptei.
 */
function marimiRol(R, treapta, trepte, rol) {
  const t = trepte?.[treapta];
  const par = (x) => Math.round(x / 2) * 2;
  const max = t ? par(R.baza * (rol === 'cifra' && t.maxCifra ? t.maxCifra : t.max)) : R.baza;
  const min = t ? par(R.baza * t.min) : R.min;
  const lista = [];
  for (let m = max; m > min + EPS; m -= 2) lista.push(m);
  lista.push(min);
  return lista;
}

/** Blocurile cerute de o scenă, în ordinea de pe ecran (fără poziții). */
function cereri(s, i, stilPlat) {
  const b = `scene[${i}]`;
  const c = [];
  const fix = (fel, rol, campuri, extra = {}) => c.push({ fel, rol, randuri: campuri, ...extra });
  if (s.eticheta !== undefined) {
    c.push({ fel: 'eticheta', rol: 'mic', spatiere: stilPlat.eticheta?.spatiere ?? 0, randuri: [{ camp: `${b}.eticheta`, text: etichetaAfisata(s.eticheta, stilPlat.eticheta) }] });
  }
  const titlu = () => {
    if (s.titlu) fix('randuri', 'mare', s.titlu.map((t, j) => ({ camp: `${b}.titlu[${j}]`, text: t })), { masca: true });
  };
  switch (s.tip) {
    case 'titlu':
      titlu();
      break;
    case 'fraza':
      c.push({ fel: 'rupt', rol: 'mare', camp: `${b}.text`, text: s.text, maxRanduri: 3, peCuvant: true });
      break;
    case 'cuvinte':
      titlu();
      fix('cuvinte', 'mare', s.cuvinte.map((t, j) => ({ camp: `${b}.cuvinte[${j}]`, text: t })), { masca: true });
      break;
    case 'lista':
      titlu();
      c.push({ fel: 'lista', rol: 'mediu', marcaj: s.marcaj ?? 'bife', randuri: s.puncte.map((t, j) => ({ camp: `${b}.puncte[${j}]`, text: t })) });
      break;
    case 'cifra':
      fix('cifra', 'cifra', [{ camp: `${b}.valoare`, text: textCifra(s) }]);
      c.push({ fel: 'rupt', rol: 'mediu', camp: `${b}.text`, text: s.text, maxRanduri: 2 });
      if (s.sursa !== undefined) fix('mic', 'mic', [{ camp: `${b}.sursa`, text: s.sursa }]);
      break;
    case 'citat':
      c.push({ fel: 'rupt', rol: 'mediu', camp: `${b}.text`, text: `„${s.text}”`, maxRanduri: 6, masca: true });
      fix('mic', 'mic', [{ camp: `${b}.autor`, text: s.autor }]);
      if (s.rol !== undefined) fix('mic', 'mic', [{ camp: `${b}.rol`, text: s.rol }]);
      break;
    case 'final':
      titlu();
      if (s.cta !== undefined) fix('cta', 'mediu', [{ camp: `${b}.cta`, text: s.cta }]);
      if (s.detaliu !== undefined) fix('mic', 'mic', [{ camp: `${b}.detaliu`, text: s.detaliu }]);
      break;
    default:
      break;
  }
  // marime (felia 2) mărește elementul principal: textul mare, cifra, punctele listei și citatul
  if (s.marime !== undefined) {
    for (const x of c) if (x.rol === 'mare' || x.rol === 'cifra' || x.fel === 'lista' || (s.tip === 'citat' && x.fel === 'rupt')) x.treapta = s.marime;
  }
  return c;
}

/** Cea mai mare mărime la care încape blocul; altfel ultimul eșec, la mărimea minimă. */
function potriveste(cerere, masuri, implicite, latimeZona) {
  const R = implicite.roluri[cerere.rol];
  const maxim = latimeZona * (1 - implicite.marja_latime);
  let esec = null;
  for (const m of marimiRol(R, cerere.treapta, implicite.trepte, cerere.rol)) {
    const baza = masuri.masoara(cerere.rol, m, cerere.spatiere);
    const masoara = cerere.fel === 'cifra' ? (t) => baza(t.replace(/\d/g, '0')) : baza;
    const loc = cerere.fel === 'lista' ? maxim - (implicite.lista.marcaj_em + implicite.lista.gol_em) * m : maxim;
    if (cerere.fel === 'rupt') {
      const r = rupeRanduri(cerere.text, { latimeMax: loc, masoara, maxRanduri: cerere.maxRanduri });
      if (r.ok) return { ok: true, marime: m, masoara, randuri: r.randuri.map((x) => ({ ...x, camp: cerere.camp })) };
      esec = { motiv: r.motiv, camp: cerere.camp, text: cerere.text, marime: m, loc };
      continue;
    }
    const randuri = [];
    esec = null;
    for (const rd of cerere.randuri) {
      const r = rupeRanduri(rd.text, { latimeMax: loc, masoara, maxRanduri: 1 });
      if (!r.ok) {
        esec = { motiv: 'lat', camp: rd.camp, text: rd.text, marime: m, loc, latime: masoara(textAfisat(rd.text)) };
        break;
      }
      randuri.push({ ...r.randuri[0], camp: rd.camp });
    }
    if (!esec) return { ok: true, marime: m, masoara, randuri };
  }
  return { ok: false, ...esec };
}

function eroareLatime(e, cerere, scena) {
  const final = scena.tip === 'final';
  if (cerere.treapta && cerere.treapta !== 'M') {
    const i = /^scene\[(\d+)\]/.exec(e.camp)[1];
    return eroare('rand-nu-incape', e.camp,
      `${locCamp(e.camp)} nu încape la mărimea ${cerere.treapta} nici la ${e.marime} px (în zona sigură încap ${Math.floor(e.loc)} px).`,
      `Pune scene[${i}].marime pe ${cerere.treapta === 'XL' ? '"L" sau "M"' : '"M"'} sau scurtează ${e.camp}; mai mare de atât nu se poate pe acest ecran.`,
      { verificare: cerere.fel === 'rupt' ? 'S03' : undefined });
  }
  if (cerere.fel === 'rupt' && e.motiv === 'prea-multe-randuri') {
    return eroare('rand-nu-incape', e.camp,
      `${locCamp(e.camp)} are nevoie de mai mult de ${cerere.maxRanduri} ${cerere.maxRanduri === 1 ? 'rând' : 'rânduri'} chiar la ${e.marime} px.`,
      `Scurtează ${e.camp}${final ? '' : ' sau împarte textul în două scene'}.`, { verificare: 'S03' });
  }
  const text = textAfisat(e.text);
  const latime = e.latime === undefined ? '' : `, are ${Math.round(e.latime)} px`;
  const mesaj = `${locCamp(e.camp)}, „${text}”${latime} și nu încape pe un rând nici la ${e.marime} px (în zona sigură încap ${Math.floor(e.loc)} px).`;
  let sugestie = `Scurtează ${e.camp}.`;
  if (/\.titlu\[\d+\]$/.test(e.camp)) {
    const titlu = e.camp.replace(/\[\d+\]$/, '');
    sugestie = final
      ? `Scurtează rândul sau mută o parte din el într-un rând nou în ${titlu} (finalul are cel mult 2 rânduri); dacă nu încape, scurtează textul.`
      : `Scurtează rândul sau mută o parte din el într-un rând nou în ${titlu}; dacă titlul are deja toate rândurile, împarte scena în două.`;
  } else if (cerere.fel === 'cifra') {
    const i = /^scene\[(\d+)\]/.exec(e.camp)[1];
    const f = inMilioaneSauMii(scena);
    sugestie = f
      ? `Scrie cifra în ${f.sufix === ' mil.' ? 'milioane' : 'mii'}: în scene[${i}] pune valoare ${String(f.valoare)}, zecimale ${f.zecimale} și sufix „${f.sufix}” (apare ca ${textCifra({ valoare: f.valoare, zecimale: f.zecimale, sufix: f.sufix })})${scena.sufix === undefined ? '' : `; unitatea „${scena.sufix}” mut-o în scene[${i}].text`}.`
      : `Scurtează prefixul sau sufixul din scene[${i}].`;
  } else if (cerere.fel === 'rupt') {
    sugestie = `Un cuvânt din ${e.camp} e prea lung pentru zonă: înlocuiește-l cu unul mai scurt.`;
  }
  return eroare('rand-nu-incape', e.camp, mesaj, sugestie);
}

/** Părțile unui rând: piesele (pe segmentul de accent sau, la frază, pe cuvânt) și spațiile dintre ele. */
function partiRand(rand, peCuvant, masoara, idNou) {
  const parti = [];
  let prefix = '';
  for (const seg of rand.segmente) {
    let bucati;
    if (peCuvant) {
      bucati = seg.text.split(/(\s+)/);
    } else {
      const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(seg.text);
      bucati = [m[1], m[2], m[3]];
    }
    for (const bucata of bucati) {
      if (bucata === '') continue;
      if (/^\s+$/.test(bucata)) {
        parti.push({ tip: 'spatiu', text: bucata });
      } else {
        parti.push({ tip: 'piesa', id: idNou(), text: bucata, accent: seg.accent === true, dx: r2(prefix === '' ? 0 : masoara(prefix)), w: r2(masoara(bucata)), camp: rand.camp });
      }
      prefix += bucata;
    }
  }
  return parti;
}

function spatiuInainte(anterior, bloc, spatii) {
  if (anterior.fel === 'eticheta') return spatii.eticheta;
  if (bloc.fel === 'sigla') return spatii.sigla;
  if (bloc.fel === 'mic' && anterior.fel === 'mic') return spatii.mic;
  return spatii.bloc;
}

/**
 * @param {{scena: object, i: number, stilPlat: object, implicite: object, format: {latime: number, inaltime: number, zona: number[], sigla: number[]},
 *   masuri: ReturnType<typeof creeazaMasuratori>, aliniere: 'centru'|'stanga', sigla?: {latime: number, inaltime: number}|null}} p
 * @returns {{erori: object[], blocuri: object[], inaltime: number}}
 */
export function aseazaScena({ scena, i, stilPlat, implicite, format, masuri, aliniere, sigla = null }) {
  const [zx, zy, zw, zh] = format.zona;
  const centru = aliniere === 'centru';
  const N = i + 1;
  const erori = [];
  const contor = { b: 0, r: 0, t: 0, m: 0 };
  const blocuri = [];

  for (const cerere of cereri(scena, i, stilPlat)) {
    const p = potriveste(cerere, masuri, implicite, zw);
    if (!p.ok) {
      erori.push(eroareLatime(p, cerere, scena));
      continue;
    }
    const R = implicite.roluri[cerere.rol];
    const h = r2(p.marime * R.inaltime_rand);
    const bloc = { id: `b${N}-${++contor.b}`, rol: cerere.rol, fel: cerere.fel, camp: cerere.camp ?? p.randuri[0].camp.replace(/\[\d+\]$/, ''), masca: cerere.masca === true, x: zx, y: 0, w: zw, h: 0, marime: p.marime, randuri: [] };
    if (cerere.spatiere !== undefined) bloc.spatiere = cerere.spatiere;
    for (const [j, rd] of p.randuri.entries()) {
      const rand = { id: `r${N}-${++contor.r}`, x: 0, y: 0, w: r2(rd.latime), h, camp: rd.camp, parti: partiRand(rd, cerere.peCuvant === true, p.masoara, () => `t${N}-${++contor.t}`) };
      if (cerere.fel === 'lista') {
        rand.punct = j + 1;
        rand.marcajId = cerere.marcaj === 'bife' ? `m${N}-${++contor.m}` : null;
      }
      bloc.randuri.push(rand);
    }
    const n = bloc.randuri.length;
    if (cerere.fel === 'cuvinte') bloc.h = h;
    else if (cerere.fel === 'lista') bloc.h = r2(n * h + (n - 1) * implicite.spatii.puncte);
    else bloc.h = r2(n * h);
    if (cerere.fel === 'lista') {
      bloc.marcaj = cerere.marcaj;
      bloc.marcajW = r2(implicite.lista.marcaj_em * p.marime);
      bloc.gol = r2(implicite.lista.gol_em * p.marime);
      bloc.w = r2(bloc.marcajW + bloc.gol + Math.max(...bloc.randuri.map((r) => r.w)));
      bloc.x = centru ? r2(zx + (zw - bloc.w) / 2) : zx;
    }
    blocuri.push(bloc);
  }

  if (scena.tip === 'final' && sigla) {
    const { w, h } = potrivesteSigla(sigla.latime, sigla.inaltime, format.sigla);
    blocuri.push({ id: `b${N}-${++contor.b}`, rol: null, fel: 'sigla', camp: 'sigla', masca: false, x: centru ? r2(zx + (zw - w) / 2) : zx, y: 0, w, h, marime: null, randuri: [] });
  }
  if (erori.length > 0) return { erori, blocuri: [], inaltime: 0 };

  let inaltime = 0;
  blocuri.forEach((b, k) => {
    if (k > 0) inaltime += spatiuInainte(blocuri[k - 1], b, implicite.spatii);
    inaltime += b.h;
  });
  inaltime = r2(inaltime);
  if (inaltime > zh + EPS) {
    return {
      erori: [eroare('rand-nu-incape', `scene[${i}]`,
        `Scena ${N}: textul ocupă ${Math.round(inaltime)} px pe înălțime, iar zona sigură are ${zh} px.`,
        `${scena.marime && scena.marime !== 'M' ? `Pune scene[${i}].marime pe o treaptă mai mică, sau ` : ''}${scena.tip === 'final' ? 'scurtează textul finalului (titlu, îndemn sau detaliu).' : 'scurtează textul scenei sau împarte-o în două scene.'}`.replace(/^s/, (c) => c.toUpperCase()), { verificare: 'S03' })],
      blocuri: [], inaltime,
    };
  }

  let y = zy + (zh - inaltime) / 2;
  blocuri.forEach((b, k) => {
    if (k > 0) y += spatiuInainte(blocuri[k - 1], b, implicite.spatii);
    b.y = r2(y);
    b.randuri.forEach((rand, j) => {
      if (b.fel === 'cuvinte') rand.y = b.y;
      else if (b.fel === 'lista') rand.y = r2(b.y + j * (rand.h + implicite.spatii.puncte));
      else rand.y = r2(b.y + j * rand.h);
      if (b.fel === 'lista') rand.x = r2(b.x + b.marcajW + b.gol);
      else rand.x = centru ? r2(b.x + (b.w - rand.w) / 2) : b.x;
      for (const parte of rand.parti) {
        if (parte.tip === 'piesa') parte.caseta = [r2(rand.x + parte.dx), rand.y, parte.w, rand.h];
      }
    });
    y += b.h;
  });
  return { erori: [], blocuri, inaltime };
}
