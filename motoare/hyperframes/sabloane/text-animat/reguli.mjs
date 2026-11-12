// valideaza pentru text-animat (docs/interfete/sablon.md): regulile de dincolo de schema.json care nu cer fonturi sau stil
// (la valideaza, ctx.stil e null). Lățimea, ruperea rândurilor și înălțimea blocurilor se verifică în cronologie(),
// după rezolvarea stilului (asezare.mjs), ca regula de lățime a reelului.
import { eroare, verificaTexteDate, grafeme, textAfisat } from '../../../../nucleu/lib/sdk.mjs';
import { numarCuvinte, minimCitire, sus01 } from './timp.mjs';
import { sursaSigla, citesteSigla } from './sigla.mjs';
import { textCifra, formatRo } from './cifre.mjs';

const EPS = 1e-9;
const GHILIMELE = new Set(['"', '„', '”', '“', '«', '»', "'", '‚', '‘', '’']);
const NUME_CAMP = Object.freeze({
  eticheta: 'eticheta', titlu: 'rândul {j} din titlu', text: 'textul', cuvinte: 'cuvântul {j}', puncte: 'punctul {j}',
  valoare: 'valoarea', prefix: 'prefixul', sufix: 'sufixul', sursa: 'sursa', autor: 'autorul', rol: 'rolul',
  detaliu: 'detaliul', cta: 'îndemnul', durata: 'durata', tip: 'tipul',
});

/** 4.4 → „4,4” (secundele și pixelii din mesaje). */
export function nr(x) {
  return String(x).replace('.', ',');
}

/** „scene[1].puncte[2]” → „Scena 2, punctul 3”. */
export function locCamp(camp) {
  const m = /^scene\[(\d+)\](?:\.([a-z_]+)(?:\[(\d+)\])?)?$/.exec(camp);
  if (!m) return camp;
  const scena = `Scena ${Number(m[1]) + 1}`;
  if (!m[2]) return scena;
  const parte = (NUME_CAMP[m[2]] ?? m[2]).replace('{j}', String(Number(m[3] ?? 0) + 1));
  return `${scena}, ${parte}`;
}

/**
 * Câmpurile de text ale unei scene, în ordinea în care apar pe ecran.
 * accent: marcajul *...* e permis (spec 7.2: titlu, text, cuvinte); plafon: cheia din implicite.plafoane (null = schema
 * îl limitează); cuvinte: intră în numărarea cuvintelor (prefixul și sufixul cifrei intră prin valoare, nu separat).
 */
export function campuriScena(s, i) {
  const b = `scene[${i}]`;
  const c = [];
  const adauga = (camp, text, accent, plafon, cuvinte = true) => {
    if (text !== undefined) c.push({ camp: `${b}.${camp}`, text, accent, plafon, cuvinte });
  };
  adauga('eticheta', s.eticheta, false, 'eticheta');
  const titlu = () => (s.titlu ?? []).forEach((t, j) => adauga(`titlu[${j}]`, t, true, 'titlu'));
  switch (s.tip) {
    case 'titlu':
      titlu();
      break;
    case 'fraza':
      adauga('text', s.text, true, 'fraza');
      break;
    case 'cuvinte':
      titlu();
      s.cuvinte.forEach((t, j) => adauga(`cuvinte[${j}]`, t, true, 'cuvant'));
      break;
    case 'lista':
      titlu();
      s.puncte.forEach((t, j) => adauga(`puncte[${j}]`, t, false, 'punct'));
      break;
    case 'cifra':
      adauga('prefix', s.prefix, false, null, false);
      adauga('sufix', s.sufix, false, null, false);
      adauga('text', s.text, true, 'text_cifra');
      adauga('sursa', s.sursa, false, 'sursa');
      break;
    case 'citat':
      adauga('text', s.text, true, null);
      adauga('autor', s.autor, false, 'autor');
      adauga('rol', s.rol, false, 'rol');
      break;
    case 'final':
      titlu();
      adauga('cta', s.cta, false, 'cta');
      adauga('detaliu', s.detaliu, false, 'detaliu');
      break;
    default:
      break;
  }
  return c;
}

/** Cuvintele scenei, pentru formula duratei și pentru minimul de citire (valoarea cifrei e un cuvânt). */
export function cuvinteScena(s) {
  const texte = campuriScena(s, 0).filter((c) => c.cuvinte).map((c) => c.text);
  if (s.tip === 'cifra') texte.push(textCifra(s));
  return numarCuvinte(texte);
}

function caractere(n) {
  if (n === 1) return 'un caracter';
  return n >= 20 ? `${n} de caractere` : `${n} caractere`;
}

function verificaPlafoane(campuri, plafoane, scene, erori) {
  for (const c of campuri) {
    if (c.plafon === null) continue;
    const n = grafeme(textAfisat(c.text));
    const max = plafoane[c.plafon];
    if (n <= max) continue;
    const final = scene[Number(/^scene\[(\d+)\]/.exec(c.camp)[1])].tip === 'final'; // există un singur final: nu se împarte
    const sugestie = c.plafon === 'titlu'
      ? `Scurtează rândul sau mută o parte din el într-un rând nou în ${c.camp.replace(/\[\d+\]$/, '')}${final ? ' (finalul are cel mult 2 rânduri); dacă nu încape, scurtează textul.' : '; dacă nu încape, împarte scena în două.'}`
      : `Scurtează ${c.camp} la cel mult ${max} de caractere${final ? '.' : ' sau împarte textul în două scene.'}`;
    erori.push(eroare('rand-nu-incape', c.camp, `${locCamp(c.camp)} are ${caractere(n)}; încap cel mult ${max}.`, sugestie));
  }
}

function verificaAccente(s, i, campuri, erori) {
  let n = 0;
  for (const c of campuri) {
    if (!c.accent) continue;
    if ((c.text.match(/\*/g) ?? []).length % 2 !== 0) return; // nepereche: C03 a dat deja accent-neinchis
    n += (c.text.match(/\*[^*]+\*/g) ?? []).length;
  }
  if (n <= 2) return;
  erori.push(eroare('text-animat-accent', `scene[${i}]`,
    `Scena ${i + 1} are ${n} segmente accentuate; încap cel mult 2, ca accentul să cadă pe ce contează.`,
    `Păstrează *...* pe cel mult două bucăți din scene[${i}] (de obicei cuvintele care poartă sensul).`, { verificare: 'C03' }));
}

function verificaFraza(s, i, erori) {
  if (s.tip !== 'fraza') return;
  const n = numarCuvinte([s.text]);
  if (n >= 2 && n <= 10) return;
  erori.push(eroare('valoare-invalida', `scene[${i}].text`,
    `Scena ${i + 1} (fraza) are ${n === 1 ? 'un cuvânt' : `${n} cuvinte`}; o frază are 2-10 cuvinte.`,
    n < 2 ? `Adaugă cuvinte în scene[${i}].text sau schimbă tipul scenei în „titlu”.` : `Scurtează scene[${i}].text sau împarte fraza în două scene.`));
}

/** Zecimale pierdute: valoarea nu se rotunjește pe tăcute; cu mai multe zecimale decât `zecimale`, scena nu trece. */
function verificaZecimale(s, i, erori) {
  if (s.tip !== 'cifra') return;
  const z = s.zecimale ?? 0;
  // valoarea are cel mult n zecimale dacă rotunjirea la n le păstrează pe toate; toleranța absolută greșea la valori mari
  const exacta = (n) => Number(s.valoare.toFixed(n)) === s.valoare;
  if (exacta(z)) return;
  const necesar = [z + 1, 2].filter((n) => n <= 2).find(exacta);
  const valoare = formatRo(s.valoare, 3).replace(/0+$/, '').replace(/,$/, '');
  if (necesar === undefined) {
    const rotunjita = formatRo(s.valoare, 2);
    erori.push(eroare('valoare-invalida', `scene[${i}].valoare`,
      `Scena ${i + 1}: valoarea ${valoare} are mai multe zecimale decât se pot afișa (cel mult 2).`,
      `Rotunjește scene[${i}].valoare la cel mult 2 zecimale, de exemplu ${rotunjita}, și pune scene[${i}].zecimale 2.`));
    return;
  }
  erori.push(eroare('valoare-invalida', `scene[${i}].zecimale`,
    `Scena ${i + 1}: valoarea ${valoare} ${z === 0 ? 'are zecimale, dar câmpul zecimale lipsește (implicit 0)' : `are mai multe zecimale decât zecimale ${z}`}, deci pe ecran s-ar rotunji.`,
    `Pune scene[${i}].zecimale ${necesar}, ca valoarea să apară exact.`));
}

function verificaCitat(s, i, erori) {
  if (s.tip !== 'citat') return;
  const litere = [...textAfisat(s.text).trim()];
  if (!GHILIMELE.has(litere[0]) && !GHILIMELE.has(litere.at(-1))) return;
  erori.push(eroare('text-animat-ghilimele-in-citat', `scene[${i}].text`,
    `Scena ${i + 1}: citatul începe sau se termină cu ghilimele; șablonul pune singur „ și ”.`,
    `Scoate ghilimelele de la capetele lui scene[${i}].text.`));
}

function verificaDurata(s, i, erori) {
  if (s.durata === undefined) return;
  if (Math.abs(s.durata * 10 - Math.round(s.durata * 10)) > EPS) {
    erori.push(eroare('valoare-invalida', `scene[${i}].durata`,
      `Scena ${i + 1}: durata, ${nr(s.durata)} s, nu are pasul de 0,1 s.`,
      `Scrie scene[${i}].durata cu cel mult o zecimală, de exemplu ${nr(Math.round(s.durata * 10) / 10)}.`));
    return;
  }
  const necesar = sus01(minimCitire(cuvinteScena(s)));
  if (s.durata + EPS >= necesar) return;
  erori.push(eroare('prea-repede-de-citit', `scene[${i}].durata`,
    `Scena ${i + 1}: textul are nevoie de cel puțin ${nr(necesar)} s pe ecran, iar scena durează ${nr(s.durata)} s.`,
    `Mărește scene[${i}].durata la cel puțin ${nr(necesar)} s, scoate durata (mg o calculează) sau scurtează textul.`,
    { verificare: 'S02' }));
}

function verificaFinal(date, erori) {
  const ultima = date.scene.length - 1;
  date.scene.forEach((s, i) => {
    if (s.tip !== 'final' || i === ultima) return;
    erori.push(eroare('text-animat-final-nu-e-ultimul', `scene[${i}].tip`,
      `Scena ${i + 1} e de tip final, dar nu e ultima: finalul stă doar la sfârșitul videoului și apare o singură dată.`,
      `Mută scena la sfârșit sau schimbă scene[${i}].tip (de exemplu în „titlu”).`));
  });
}

function verificaSigla(date, ctx, implicite, erori) {
  const sursa = sursaSigla(date, ctx.brand ?? null, ctx.dirProiect);
  if (!sursa) return;
  if (sursa.invalida) {
    erori.push(eroare('valoare-invalida', 'brand.sigla',
      `${sursa.loc} nu e un nume de fișier din folderul brandului (${JSON.stringify(ctx.brand.sigla)}).`,
      `Pune fișierul siglei în folderul branduri/${ctx.brand.nume}/ și scrie în sigla: doar numele lui, de exemplu sigla.svg.`, { verificare: 'C07' }));
    return;
  }
  const r = citesteSigla(sursa.cale, implicite.sigla_max_octeti);
  if (r.ok) return;
  const unde = sursa.camp === 'brand' ? `fișierul siglei din branduri/${ctx.brand.nume}/` : 'fișierul din resurse/';
  const mesaje = {
    lipsa: [`${sursa.loc} nu există: ${sursa.camp === 'brand' ? ctx.brand.sigla : date.sigla}.`, `Pune ${unde} sau scoate sigla.`],
    extensie: [`${sursa.loc} nu e .svg sau .png.`, 'Folosește o siglă .svg sau .png.'],
    mare: [`${sursa.loc} are ${Math.ceil((r.octeti ?? 0) / 1048576)} MB; încap cel mult 2 MB.`, 'Micșorează fișierul (sau exportă-l ca SVG) și pune-l din nou.'],
    dimensiuni: [`${sursa.loc} nu are dimensiuni citibile (SVG fără viewBox sau width și height, ori un PNG stricat).`, 'Exportă sigla din nou, ca SVG cu viewBox sau ca PNG.'],
  }[r.motiv];
  const cod = r.motiv === 'lipsa' ? 'resursa-lipsa' : 'valoare-invalida';
  erori.push(eroare(cod, sursa.camp, mesaje[0], mesaje[1], { verificare: 'C07' }));
}

/**
 * Regulile de dincolo de schemă; se apelează doar după ce C02 și brandul au trecut.
 * @returns {{erori: object[], avertismente: object[]}}
 */
export function valideaza(date, ctx) {
  const implicite = ctx.sablon.implicite;
  const erori = [];
  const avertismente = [];
  const peScene = date.scene.map((s, i) => campuriScena(s, i));
  const c03 = verificaTexteDate(date, peScene.flat().map(({ camp, text, accent }) => ({ camp, text, permiteAccent: accent })));
  erori.push(...c03.erori);
  avertismente.push(...c03.avertismente);
  verificaPlafoane(peScene.flat(), implicite.plafoane, date.scene, erori);
  date.scene.forEach((s, i) => {
    verificaAccente(s, i, peScene[i], erori);
    verificaFraza(s, i, erori);
    verificaZecimale(s, i, erori);
    verificaCitat(s, i, erori);
    verificaDurata(s, i, erori);
  });
  verificaFinal(date, erori);
  verificaSigla(date, ctx, implicite, erori);
  return { erori, avertismente };
}
