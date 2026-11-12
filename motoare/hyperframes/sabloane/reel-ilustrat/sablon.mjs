// Șablonul reel-ilustrat: interfața comună din docs/interfete/sablon.md.
// B02 implementează valideaza, B08 cronologia, B11 construieste (prin compileaza.mjs) și asteptari.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  eroare, EroareFatala, COD_IESIRE,
  citesteText, scrieTextAtomic, scrieJsonAtomic, existaFisier,
  valoriStil, semnaturaRezolvata,
  cssFontFace, copiazaFonturi, incarcaCatalogFonturi, esteFontBrand, cssFontFaceBrand, copiazaFontBrand, familieCss,
  svgIconita,
  incarcaCatalog, gasestePiesa, caleFisierPiesa, normalizeazaSvg,
  verificaTexteDate, grafeme, textAfisat, timpCitire,
  rotunjeste,
  audioCronologie, elementAudio,
} from '../../../../nucleu/lib/sdk.mjs';
import { planifica, minimTip, val, nr, T } from './plan.mjs';
import { alegeMarimiTitlu, caseteTexte, latimiRanduriCard, zonaSemnatura } from './casete.mjs';
import { compileaza } from './compileaza.mjs';

// M1: blocul „Ce apare pe ecran” vine din șablon (hook-ul opțional blocScenariu).
export { blocScenariu } from './bloc.mjs';

// Plafoanele brute din spec 7.1 care nu au rol de mărime în implicite.json (C04: plafonul brut, plus lățimea rândurilor
// de pe card din verificaLatimi; micșorarea și ruperea automată din spec 6.11 nu există încă, vezi verificari_partiale).
const PLAFON_CUVANT = 16;
const PLAFON_CTA = 28;
const PLAFON_RAND_SEMNATURA = 42;
const RANDURI_SEMNATURA = 2;
// C04 (spec 6.11): rândul măsurat cu fontkit încape în zonă cu marja comună de 4%, care acoperă diferențele dintre
// fontkit și Chrome (Mac și Windows); regula de lățime din carduri, decizia lui Dănuț din 2026-10-06.
const MARJA_LATIME = 0.04;
const EPS = 1e-9;

function arePasDeZecime(x) {
  return Math.abs(x * 10 - Math.round(x * 10)) < EPS;
}

/**
 * Semnătura care apare pe ecran (semnaturaRezolvata din nucleu: din brand, altfel din date), cu locul în care o
 * repară omul (T1/T18): din brand, câmpul e 'brand' și fișa e branduri/<nume>/vizual.md.
 * @returns {{randuri: string[], camp: string, loc: string|undefined, unde: string}|null}
 */
function semnaturaDeVerificat(date, brand) {
  const s = semnaturaRezolvata(date, brand);
  if (!s || typeof s.valoare !== 'string') return null;
  const randuri = s.valoare.split('\n');
  if (s.sursa === 'brand') {
    return { randuri, camp: 'brand', loc: `Semnătura din brandul „${brand.nume}”`, unde: `semnatura din branduri/${brand.nume}/vizual.md` };
  }
  return { randuri, camp: 'semnatura', loc: undefined, unde: 'semnatura' };
}

function colecteazaTexte(date, sig) {
  const campuri = [];
  date.scene.forEach((s, i) => {
    if (s.eticheta !== undefined) campuri.push({ camp: `scene[${i}].eticheta`, text: s.eticheta, permiteAccent: false });
    (s.titlu ?? []).forEach((t, j) => campuri.push({ camp: `scene[${i}].titlu[${j}]`, text: t, permiteAccent: true }));
    // T5: cuvintele nu au accent pe ecran (compileaza.mjs le scrie simplu), deci * e refuzat, nu șters în tăcere
    (s.cuvinte ?? []).forEach((t, j) => campuri.push({ camp: `scene[${i}].cuvinte[${j}]`, text: t, permiteAccent: false }));
    if (s.cta !== undefined) campuri.push({ camp: `scene[${i}].cta`, text: s.cta, permiteAccent: false });
  });
  if (sig) {
    for (const rand of sig.randuri) campuri.push({ camp: sig.camp, text: rand, permiteAccent: false, loc: sig.loc });
  }
  return campuri;
}

function verificaPlafoane(date, implicite, erori, sig) {
  const depaseste = (text, plafon) => grafeme(textAfisat(text)) > plafon;
  date.scene.forEach((s, i) => {
    const n = i + 1;
    (s.titlu ?? []).forEach((t, j) => {
      if (depaseste(t, implicite.titlu.plafon)) {
        erori.push(eroare('rand-nu-incape', `scene[${i}].titlu[${j}]`,
          `Scena ${n}, rândul ${j + 1} din titlu are ${grafeme(textAfisat(t))} caractere; încap cel mult ${implicite.titlu.plafon}.`,
          `Scurtează rândul sau mută o parte din el într-un rând nou în scene[${i}].titlu.`));
      }
    });
    if (s.eticheta !== undefined && depaseste(s.eticheta, implicite.eticheta.plafon)) {
      erori.push(eroare('rand-nu-incape', `scene[${i}].eticheta`,
        `Scena ${n}: eticheta are ${grafeme(s.eticheta)} caractere; încap cel mult ${implicite.eticheta.plafon}.`,
        `Scurtează scene[${i}].eticheta.`));
    }
    (s.cuvinte ?? []).forEach((t, j) => {
      if (depaseste(t, PLAFON_CUVANT)) {
        erori.push(eroare('rand-nu-incape', `scene[${i}].cuvinte[${j}]`,
          `Scena ${n}, cuvântul ${j + 1} are ${grafeme(textAfisat(t))} caractere; încap cel mult ${PLAFON_CUVANT}.`,
          `Scurtează scene[${i}].cuvinte[${j}].`));
      }
    });
    if (s.cta !== undefined && depaseste(s.cta, PLAFON_CTA)) {
      erori.push(eroare('rand-nu-incape', `scene[${i}].cta`,
        `Scena ${n}: îndemnul are ${grafeme(s.cta)} caractere; încap cel mult ${PLAFON_CTA}.`,
        `Scurtează scene[${i}].cta.`));
    }
  });
  if (sig) {
    const { randuri } = sig;
    const loc = sig.loc ?? 'Semnătura';
    if (randuri.length > RANDURI_SEMNATURA) {
      erori.push(eroare('rand-nu-incape', sig.camp,
        `${loc} are ${randuri.length} rânduri; încap cel mult ${RANDURI_SEMNATURA}.`,
        `Păstrează în ${sig.unde} cel mult două rânduri, despărțite de \\n.`));
    }
    randuri.forEach((r, j) => {
      if (grafeme(r) > PLAFON_RAND_SEMNATURA) {
        erori.push(eroare('rand-nu-incape', sig.camp,
          `${loc}, rândul ${j + 1} are ${grafeme(r)} caractere; încap cel mult ${PLAFON_RAND_SEMNATURA}.`,
          `Scurtează rândul din ${sig.unde} sau mută o parte pe al doilea rând.`));
      }
    });
  }
}

function verificaPasul(date, erori) {
  if (date.durata !== undefined && !arePasDeZecime(date.durata)) {
    erori.push(eroare('valoare-invalida', 'durata',
      `Durata videoului, ${nr(date.durata)} s, nu are pasul de 0,1 s.`,
      `Scrie durata cu cel mult o zecimală, de exemplu ${nr(Math.round(date.durata * 10) / 10)}.`));
  }
  date.scene.forEach((s, i) => {
    if (s.durata !== undefined && !arePasDeZecime(s.durata)) {
      erori.push(eroare('valoare-invalida', `scene[${i}].durata`,
        `Scena ${i + 1}: durata, ${nr(s.durata)} s, nu are pasul de 0,1 s.`,
        `Scrie scene[${i}].durata cu cel mult o zecimală, de exemplu ${nr(Math.round(s.durata * 10) / 10)}.`));
    }
  });
}

/**
 * Un card are titlu sau cuvinte (decizia lui Dănuț din 2026-10-06, B17). Doar cu etichetă (sau gol), cardul ocupă
 * sub 0,3% din cadru: ar pica sigur C12 (și C14 pe curat) abia după randare, cu un mesaj care nu spune cauza.
 * Regula stă doar aici, nu și în schema.json: schema ar exprima-o doar printr-un not dublu, cu sugestia generică a lui C02.
 */
function verificaCarduri(date, erori) {
  date.scene.forEach((s, i) => {
    if (s.tip !== 'card' || s.titlu !== undefined || s.cuvinte !== undefined) return;
    const camp = `scene[${i}]`;
    const mesaj = s.eticheta !== undefined
      ? `Scena ${i + 1} (card) are doar eticheta „${s.eticheta}”, fără titlu: pe ecran ar rămâne doar eticheta mică, iar cadrul ar arăta aproape gol.`
      : `Scena ${i + 1} (card) nu are niciun text: pe ecran ar rămâne doar fundalul.`;
    erori.push(eroare('valoare-invalida', camp, mesaj,
      `Adaugă ${camp}.titlu (unul sau două rânduri) sau ${camp}.cuvinte; dacă vrei un desen lângă etichetă, schimbă ${camp}.tip în „desen” și adaugă ${camp}.desen.id.`));
  });
}

/**
 * T3: un reel fără niciun text pe ecran (titlu, cuvinte, etichetă, îndemn, semnătură) are zona „Texte și cifre” goală,
 * iar hook-ul de aprobare o tratează ca pe un schelet: scenariul n-ar putea fi aprobat niciodată.
 */
function verificaAreText(date, sig, erori) {
  const areText = sig !== null
    || date.scene.some((s) => s.titlu !== undefined || s.cuvinte !== undefined || s.eticheta !== undefined || s.cta !== undefined);
  if (areText) return;
  erori.push(eroare('valoare-invalida', 'scene',
    'Reelul nu are niciun text pe ecran (titlu, cuvinte, etichetă, îndemn sau semnătură), deci scenariul nu are ce să aprobe cursantul.',
    'Adaugă cel puțin un text, de exemplu scene[0].titlu (unul sau două rânduri), o etichetă sau semnatura.'));
}

/** T2: scena `final` (desenul final, îndemnul, semnătura) stă doar la sfârșit și apare cel mult o dată. */
function verificaFinalul(date, erori) {
  const ultima = date.scene.length - 1;
  date.scene.forEach((s, i) => {
    if (s.tip !== 'final' || i === ultima) return;
    erori.push(eroare('valoare-invalida', `scene[${i}].tip`,
      `Scena ${i + 1} e de tip final, dar nu e ultima: finalul (îndemnul și semnătura) stă doar la sfârșitul reelului.`,
      `Schimbă scene[${i}].tip în „desen” sau „card”, ori mut-o la sfârșit; reelul are cel mult o scenă final, ultima.`));
  });
}

function verificaDuratele(date, implicite, erori) {
  const scene = date.scene;
  scene.forEach((s, i) => {
    const min = minimTip(s, implicite);
    if (s.durata !== undefined && s.durata + EPS < min) {
      const sugestie = s.tip === 'retea' && s.scanteie === true
        ? `Mărește scene[${i}].durata la ${nr(min)} s sau scoate scanteie.`
        : `Mărește scene[${i}].durata la cel puțin ${nr(min)} s.`;
      erori.push(eroare('reel-ilustrat-scene-durate', `scene[${i}].durata`,
        `Scena ${i + 1} (${s.tip}) durează ${nr(s.durata)} s, sub minimul tipului, ${nr(min)} s.`,
        sugestie));
    }
  });

  const toateAuDurata = scene.every((s) => s.durata !== undefined);
  const sumaDate = rotunjeste(scene.reduce((a, s) => a + (s.durata ?? 0), 0), 3);
  const durataEfectiva = date.durata ?? (toateAuDurata ? sumaDate : implicite.durata.implicita);

  const maxScene = Math.min(implicite.scene.max, Math.floor(durataEfectiva / implicite.scene.secunde_pe_scena + EPS));
  if (scene.length > maxScene) {
    erori.push(eroare('reel-ilustrat-scene-durate', 'scene',
      `Reelul are ${scene.length} scene, dar la ${nr(durataEfectiva)} s încap cel mult ${maxScene}.`,
      `Scoate ${scene.length - maxScene === 1 ? 'o scenă' : `${scene.length - maxScene} scene`} sau mărește durata la cel puțin ${nr(scene.length * implicite.scene.secunde_pe_scena)} s.`));
  }

  if (toateAuDurata) {
    if (date.durata !== undefined && Math.abs(sumaDate - date.durata) > 0.1 + EPS) {
      erori.push(eroare('durata-in-afara-limitelor', 'durata',
        `Suma duratelor de scenă e ${nr(sumaDate)} s, iar durata videoului e ${nr(date.durata)} s.`,
        `Pune durata ${nr(sumaDate)} sau schimbă scene[i].durata ca suma să fie ${nr(date.durata)} s.`));
    } else if (date.durata === undefined
      && (sumaDate < implicite.durata.min - EPS || sumaDate > implicite.durata.max + EPS)) {
      erori.push(eroare('durata-in-afara-limitelor', 'scene',
        `Suma duratelor de scenă e ${nr(sumaDate)} s, în afara limitelor de ${implicite.durata.min}-${implicite.durata.max} s.`,
        `Schimbă scene[i].durata ca suma să fie între ${implicite.durata.min} și ${implicite.durata.max} s.`));
    }
  } else {
    const minimLipsa = rotunjeste(scene.filter((s) => s.durata === undefined)
      .reduce((a, s) => a + minimTip(s, implicite), 0), 3);
    if (sumaDate + minimLipsa > durataEfectiva + EPS) {
      const ramas = durataEfectiva - sumaDate;
      erori.push(eroare('reel-ilustrat-scene-durate', date.durata !== undefined ? 'durata' : 'scene',
        ramas > EPS
          ? `Scenele fără durată au nevoie de cel puțin ${nr(minimLipsa)} s, dar au rămas ${nr(ramas)} s.`
          : `Scenele cu durată au deja ${nr(sumaDate)} s, peste durata videoului, ${nr(durataEfectiva)} s, iar scenele fără durată au nevoie de cel puțin ${nr(minimLipsa)} s.`,
        `Pune durata ${nr(sumaDate + minimLipsa)} sau mai mult, ori scurtează scenele care au durată.`));
    }
  }
}

function verificaCitirea(date, implicite, erori) {
  const ritm = implicite.ritm[date.stil?.ritm ?? 'normal'];
  const pauza = implicite.reguli.pauza_carduri;
  date.scene.forEach((s, i) => {
    if (s.durata === undefined) return;
    let necesar;
    if (s.cuvinte !== undefined) {
      necesar = s.cuvinte.length * Math.max(implicite.citire.cuvant_min, ritm.pas_cuvinte) + pauza;
    } else {
      const text = [s.eticheta ?? '', ...(s.titlu ?? [])].join(' ').trim();
      if (text === '') return;
      necesar = timpCitire(text) + pauza;
    }
    necesar = rotunjeste(necesar, 3);
    if (s.durata + EPS < necesar) {
      erori.push(eroare('prea-repede-de-citit', `scene[${i}].durata`,
        `Scena ${i + 1}: textul are nevoie de cel puțin ${nr(necesar)} s pe ecran, iar scena durează ${nr(s.durata)} s.`,
        `Mărește scene[${i}].durata la cel puțin ${nr(Math.ceil(necesar * 10 - EPS) / 10)} s sau scurtează textul.`));
    }
  });
}

/**
 * Regulile de dincolo de schema.json; se apelează doar după ce C02 a trecut.
 * Erorile C03 vin din verificaTexteDate; codul verificării se află din CODURI[cod].verificare.
 * @returns {{ erori: object[], avertismente: object[] }}
 */
export function valideaza(date, ctx) {
  const implicite = ctx.sablon.implicite;
  const erori = [];
  const avertismente = [];

  // ctx.brand = fișa din citesteBrand, pusă de nucleu (fără brand: null sau lipsă)
  const sig = semnaturaDeVerificat(date, ctx.brand ?? null);
  const c03 = verificaTexteDate(date, colecteazaTexte(date, sig));
  erori.push(...c03.erori);
  avertismente.push(...c03.avertismente);

  verificaPlafoane(date, implicite, erori, sig);
  verificaPasul(date, erori);
  verificaCarduri(date, erori);
  verificaAreText(date, sig, erori);
  verificaFinalul(date, erori);
  verificaDuratele(date, implicite, erori);
  verificaCitirea(date, implicite, erori);

  return { erori, avertismente };
}

/** Cronologia comună (5.4) din segmentele planului. */
function construiesteCronologie(plan, segmente, stil, implicite, date) {
  const R = implicite.reguli;
  const momente = [];
  for (const s of segmente) momente.push({ t: s.complet, ref: s.ref, eticheta: `${s.ref}, complet` });
  for (let i = 1; i < segmente.length; i++) {
    momente.push({ t: segmente[i].start, ref: segmente[i].ref, eticheta: `Tranziția spre scena ${i + 1}` });
  }
  momente.push({ t: rotunjeste(plan.durata - 1 / plan.fps), ref: segmente[segmente.length - 1].ref, eticheta: 'Ultimul cadru' });
  momente.sort((a, b) => a.t - b.t);
  const momente_foaie = [];
  for (const m of momente) {
    const ultim = momente_foaie[momente_foaie.length - 1];
    if (!ultim || m.t - ultim.t >= 0.1 - 1e-9) momente_foaie.push(m);
  }
  return {
    versiune: 1,
    sablon: 'reel-ilustrat',
    format: 'vertical',
    latime: plan.latime,
    inaltime: plan.inaltime,
    fps: plan.fps,
    durata: plan.durata,
    fundal: val(val(stil.culori).fundal),
    segmente,
    ferestre_statice: [{ start: rotunjeste(plan.durata - R.pauza_finala), sfarsit: plan.durata, motiv: 'pauza-finala' }],
    momente_foaie,
    audio: audioCronologie(date, plan.durata),
  };
}

function caractere(n) {
  if (n === 1) return 'un caracter';
  return n >= 20 ? `${n} de caractere` : `${n} caractere`;
}

/**
 * Regula de lățime din C04 (decizia lui Dănuț din 2026-10-06): fiecare rând de pe card (eticheta, rândurile titlului,
 * fiecare cuvânt, îndemnul), măsurat cu fontkit la mărimea lui fixă din sablon.html, încape în lățimea cardului minus
 * marja de 4%. Altfel browserul îl rupe pe două rânduri (sau îl lasă la limită pe alt sistem), iar plafonul de caractere
 * nu prinde asta: „Dacă rutina ar merge” are 20 de caractere și 908 px într-un card de 888 px.
 * Fontul vine din stilul rezolvat (tema sau brandul), deci regula stă aici, nu în valideaza.
 * Exportată doar pentru teste (plasa îndemnului fără scenă); nu face parte din interfața comună (4.16).
 * @returns {object[]} erorile rand-prea-lat, în ordinea cardurilor
 */
export function verificaLatimi(date, plan, stil, ctx) {
  const { latimeCard, randuri } = latimiRanduriCard({
    plan, stil: valoriStil(stil), radacina: ctx.radacina, sablonHtml: citesteRuntime().sablonHtml, latimeFormat: plan.latime,
  });
  const maxim = latimeCard * (1 - MARJA_LATIME);
  const erori = [];
  for (const r of randuri) {
    if (r.latime <= maxim + EPS) continue;
    const i = r.rol === 'cta' ? date.scene.findIndex((s) => typeof s.cta === 'string') : r.scena;
    const peste = r.latime - maxim;
    const scurtare = `cu cel puțin ${Math.ceil(peste)} px (cam ${caractere(Math.ceil(peste / (r.latime / grafeme(r.text))))})`;
    // plasă de siguranță: un îndemn care nu vine din date.scene[i].cta (azi nu se poate) n-are scenă, deci nici „Scena 0”
    const faraScena = !(i >= 0);
    const loc = faraScena ? 'Îndemnul' : {
      titlu: `Scena ${i + 1}, rândul ${r.index + 1} din titlu`,
      cuvinte: `Scena ${i + 1}, cuvântul ${r.index + 1}`,
      eticheta: `Scena ${i + 1}: eticheta`,
      cta: `Scena ${i + 1}: îndemnul`,
    }[r.rol];
    const camp = faraScena ? 'scene'
      : r.rol === 'titlu' || r.rol === 'cuvinte' ? `scene[${i}].${r.rol}[${r.index}]` : `scene[${i}].${r.rol}`;
    let sugestie = `Scurtează ${faraScena ? 'îndemnul' : camp} ${scurtare}`;
    if (r.rol === 'titlu') {
      sugestie += date.scene[i].titlu.length < 2
        ? ` sau mută o parte din el într-un rând nou în scene[${i}].titlu.`
        : ` sau mută un cuvânt pe celălalt rând din scene[${i}].titlu, dacă acolo e loc.`;
    } else {
      sugestie += r.rol === 'cuvinte' ? ' sau alege un cuvânt mai scurt.' : '.';
    }
    erori.push(eroare('rand-prea-lat', camp,
      `${loc}, „${r.text}”, are ${Math.round(r.latime)} px, iar pe card încap ${Math.floor(maxim)} px (${Math.round(latimeCard)} px, minus marja de 4%), deci pe ecran s-ar putea rupe pe două rânduri.`,
      sugestie));
  }
  return erori;
}

/**
 * Felia 4: px-ul titlului pe cardurile cu marime L sau XL (alegeMarimiTitlu), pus în plan înainte de regula de lățime.
 * Un titlu care nu încape nici la minimul treptei dă rand-nu-incape, cu treapta mai mică în sugestie; nu se micșorează
 * pe ascuns (decizia lui Dănuț din 2026-10-21).
 * @returns {object[]} erorile rand-nu-incape
 */
function aplicaMarimi(date, plan, stil, ctx) {
  if (!plan.carduri.some((c) => c.treapta)) return [];
  const T = ctx.sablon.implicite.titlu;
  const z = ctx.sablon.implicite.zone;
  const { latimeCard } = latimiRanduriCard({ plan: { carduri: [], cta: null }, stil: valoriStil(stil), radacina: ctx.radacina,
    sablonHtml: citesteRuntime().sablonHtml, latimeFormat: plan.latime });
  const { nuIncap } = alegeMarimiTitlu({
    plan, stil: valoriStil(stil), radacina: ctx.radacina, sablonHtml: citesteRuntime().sablonHtml, latimeFormat: plan.latime,
    trepte: T.trepte, pas: T.pas_treapta, maxim: latimeCard * (1 - MARJA_LATIME), marjaCta: T.marja_cta,
    limitaDesen: z.desen[1] - z.marja, scenaFinala: date.scene.length - 1,
  });
  return nuIncap.map(({ card: c, motiv, text, latime, px }) => {
    const i = c.scena;
    const mai = c.treapta === 'XL' ? '„L” sau „M”' : '„M”';
    const ce = motiv === 'lat'
      ? `rândul „${text}” are ${Math.round(latime)} px la ${px} px, iar pe card încap ${Math.floor(latimeCard * (1 - MARJA_LATIME))} px`
      : `titlul „${text}” nu mai lasă loc ${plan.cta && i === date.scene.length - 1 ? 'îndemnului' : 'desenului'} nici la ${px} px`;
    return eroare('rand-nu-incape', `scene[${i}].marime`,
      `Scena ${i + 1}: titlul nu încape la mărimea ${c.treapta}: ${ce}.`,
      `Pune scene[${i}].marime pe ${mai} sau scurtează rândurile din scene[${i}].titlu (un rând mai scurt încape mai mare); mai mare de atât nu se poate pe acest ecran.`);
  });
}

/** Interfața comună (4.16): cronologia și planul (intern). cronologie e null dacă erori nu e gol. */
export function cronologie(date, stil, ctx) {
  const implicite = ctx.sablon.implicite;
  // protecție proprie: date invalide ca timp nu produc cronologie, indiferent de ordinea apelurilor
  const v = valideaza(date, ctx);
  if (v.erori.length > 0) return { cronologie: null, intern: null, erori: v.erori, avertismente: [] };
  const r = planifica(date, stil, ctx);
  if (r.erori.length > 0) return { cronologie: null, intern: r.plan, erori: r.erori, avertismente: r.avertismente };
  const mari = aplicaMarimi(date, r.plan, stil, ctx);
  if (mari.length > 0) return { cronologie: null, intern: r.plan, erori: mari, avertismente: r.avertismente };
  const late = verificaLatimi(date, r.plan, stil, ctx);
  if (late.length > 0) return { cronologie: null, intern: r.plan, erori: late, avertismente: r.avertismente };
  return { cronologie: construiesteCronologie(r.plan, r.segmente, stil, implicite, date), intern: r.plan, erori: [], avertismente: r.avertismente };
}

const DIR_SABLON = path.dirname(fileURLToPath(import.meta.url));

// Greutățile folosite de sablon.html: titlul 700; eticheta 500; semnătura 400.
const GREUTATI_TITLU = [700];
const GREUTATI_TEXT = [400, 500];

function citesteRuntime() {
  return {
    sablonHtml: citesteText(path.join(DIR_SABLON, 'sablon.html')),
    linia: citesteText(path.join(DIR_SABLON, 'runtime', 'linia.js')),
    regizor: citesteText(path.join(DIR_SABLON, 'runtime', 'regizor-runtime.js')),
    miscarePlin: citesteText(path.join(DIR_SABLON, 'runtime', 'miscare-plin.js')),
  };
}

// piesele raster proprii (spec 8.6): intră doar prin apariție, fără recolorare
const MIME_RASTER = Object.freeze({ png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' });

// O formă SVG intră în active/ și în build doar ca ieșire a lui normalizeazaSvg, aceeași normalizare ca la
// mg desen adauga și la verifica-biblioteci, fără maparea culorilor (revizuirea transversală B01-B13, T12).
// Se aplică și copiei înghețate, ca build-ul să fie normalizat și pentru un activ înghețat înainte de regula asta.
function svgNormalizat(text, d) {
  const { svg, erori } = normalizeazaSvg(text, { mapare: false });
  if (erori.length > 0) {
    const [e] = erori;
    throw new EroareFatala(eroare(e.cod, `scene[${d.scena}].desen.id`, `Scena ${d.scena + 1}, piesa „${d.id}”: ${e.mesaj}`, e.sugestie), COD_IESIRE.DATE);
  }
  return svg;
}

function ingheataDesene(plan, ctx, catalog, folosite) {
  const desene = {};
  for (const d of plan.desene) {
    if (desene[d.id]) continue;
    const piesa = gasestePiesa(catalog, d.id);
    if (!piesa) {
      throw new EroareFatala(eroare('desen-necunoscut', `scene[${d.scena}].desen.id`,
        `Scena ${d.scena + 1}: desenul „${d.id}” nu există în catalog.`,
        'Alege un desen existent cu node nucleu/mg.mjs desen cauta "<subiect>".'), COD_IESIRE.DATE);
    }
    const extensie = path.extname(piesa.fisier).slice(1).toLowerCase();
    const raster = piesa.proprie && Object.hasOwn(MIME_RASTER, extensie);
    if (!['json', 'svg'].includes(extensie) && !raster) {
      throw new EroareFatala(eroare('desen-format-neacceptat', `scene[${d.scena}].desen.id`,
        `Scena ${d.scena + 1}: piesa „${d.id}” are formatul ${extensie}, pe care reelul nu-l poate afișa.`,
        'Alege o formă SVG sau o imagine PNG, JPG ori WebP adăugată cu node nucleu/mg.mjs desen adauga.'), COD_IESIRE.DATE);
    }
    const sursa = caleFisierPiesa(ctx.radacina, piesa);
    const continut = extensie === 'svg' ? svgNormalizat(citesteText(sursa), d) : fs.readFileSync(sursa);
    const { cale } = ctx.ingheataActiv({ tip: 'desen', id: d.id, continut, extensie });
    folosite.push(cale);
    const inghetat = path.join(ctx.dirProiect, ...cale.split('/'));
    if (raster) {
      desene[d.id] = { tip: 'imagine', mime: MIME_RASTER[extensie], base64: fs.readFileSync(inghetat).toString('base64'), w: piesa.cutie.w, h: piesa.cutie.h };
    } else {
      const text = citesteText(inghetat);
      desene[d.id] = { tip: piesa.tip === 'traseu' ? 'traseu' : 'forma', continut: extensie === 'svg' ? svgNormalizat(text, d) : text };
    }
  }
  return desene;
}

function ingheataIconite(plan, ctx, folosite) {
  const iconite = {};
  for (const nume of [...new Set(plan.iconite.flatMap((i) => i.nume))].sort()) {
    const { cale } = ctx.ingheataActiv({ tip: 'iconita', id: nume, continut: svgIconita(ctx.radacina, nume), extensie: 'svg' });
    folosite.push(cale);
    iconite[nume] = citesteText(path.join(ctx.dirProiect, ...cale.split('/')));
  }
  return iconite;
}

// Un font e fie un id din catalog, fie (doar font_titlu, din brand) un FontBrand {fisier, familie} (A07, A08).
// Fontul de brand are un singur woff2 pentru toate greutățile; C05 pe el (diacriticele) e în B12, aici doar se copiază.
function fonturi(stilPlat, radacina, dirBuild) {
  const catalog = incarcaCatalogFonturi(radacina);
  const { font_titlu: titlu, font_text: text } = stilPlat;
  for (const [camp, font] of [['stil.font_titlu', titlu], ['stil.font_text', text]]) {
    if (esteFontBrand(font)) {
      if (!existaFisier(path.join(radacina, font.fisier))) {
        throw new EroareFatala(eroare('font-necunoscut', 'brand',
          `Fontul de brand „${font.familie}” (${font.fisier}) lipsește.`,
          'Pune în folderul brandului fișierul woff2 numit în font_titlu.fisier sau alege în fișa de brand un font din catalog.'), COD_IESIRE.DATE);
      }
      continue;
    }
    if (typeof font !== 'string' || !catalog[font]) {
      throw new EroareFatala(eroare('font-necunoscut', camp,
        `Fontul „${typeof font === 'string' ? font : JSON.stringify(font)}” nu e nici în catalogul de fonturi al reelului, nici un font de brand {fisier, familie}.`,
        'Folosește un font din catalog (instrument-sans sau fraunces) sau, în fișa de brand, un font_titlu cu fisier și familie.'), COD_IESIRE.DATE);
    }
  }
  const greutati = new Map();
  const branduri = new Map();
  for (const [font, lista] of [[titlu, GREUTATI_TITLU], [text, GREUTATI_TEXT]]) {
    if (esteFontBrand(font)) {
      branduri.set(`${font.fisier}\n${font.familie}`, font);
      continue;
    }
    greutati.set(font, [...new Set([...(greutati.get(font) ?? []), ...lista])].sort((a, b) => a - b));
  }
  const ids = [...greutati.keys()].sort();
  const deBrand = [...branduri.keys()].sort().map((cheie) => branduri.get(cheie));
  let css = ids.map((id) => cssFontFace(radacina, id, greutati.get(id), 'fonturi/')).join('');
  css += deBrand.map((font) => cssFontFaceBrand(font, 'fonturi/')).join('');
  css += `:root { --font-titlu: "${familieCss(titlu, radacina)}", serif; --font-text: "${familieCss(text, radacina)}", sans-serif; }\n`;
  const dirFonturi = path.join(dirBuild, 'fonturi');
  const copiate = copiazaFonturi(radacina, ids, dirFonturi);
  for (const font of deBrand) copiate.push(copiazaFontBrand(radacina, font, dirFonturi));
  return { css, fisiere: [...new Set(copiate)].sort().map((f) => `fonturi/${f}`) };
}

/**
 * Scrie în dirBuild tot ce cere compoziția: index.html, plan.json, stil-rezolvat.json, gsap.min.js și fonturi/.
 * Planul vine din ctx.intern (îl pune nucleul, din cronologie()); activele se îngheață în active/ înainte de compilare.
 * `active` = activele folosite de planul curent (căi din motor.lock), ca C07 să nu verifice ce nu se mai folosește (T4).
 * @returns {Promise<{intrare: 'index.html', fisiere: string[], active: string[]}>}
 */
export async function construieste(date, stil, cronologie, dirBuild, ctx) {
  const plan = ctx.intern;
  if (!plan || plan.versiune !== 1) throw new TypeError('construieste cere planul reelului în ctx.intern (din cronologie()).');
  if (plan.durata !== cronologie.durata) throw new TypeError('Planul și cronologia au durate diferite.');
  const stilPlat = valoriStil(stil);
  const catalog = ctx.catalog ?? incarcaCatalog(ctx.radacina);
  const folosite = [];
  const desene = ingheataDesene(plan, ctx, catalog, folosite);
  const iconite = ingheataIconite(plan, ctx, folosite);
  fs.mkdirSync(dirBuild, { recursive: true });
  const f = fonturi(stilPlat, ctx.radacina, dirBuild);
  const { sablonHtml, linia, regizor, miscarePlin } = citesteRuntime();
  const html = compileaza({ plan, stil: stilPlat, date, sablonHtml, runtime: { linia, regizor, miscarePlin }, fonturiCss: f.css, desene, iconite, audio: elementAudio(cronologie) });
  scrieTextAtomic(path.join(dirBuild, 'index.html'), html);
  scrieJsonAtomic(path.join(dirBuild, 'plan.json'), plan);
  scrieJsonAtomic(path.join(dirBuild, 'stil-rezolvat.json'), stil);
  fs.copyFileSync(path.join(ctx.radacina, 'motoare', 'hyperframes', 'comun', 'vendor', 'gsap.min.js'), path.join(dirBuild, 'gsap.min.js'));
  const fisiere = ['gsap.min.js', 'index.html', 'plan.json', 'stil-rezolvat.json', ...f.fisiere].sort();
  return { intrare: 'index.html', fisiere, active: [...new Set(folosite)].sort() };
}

/**
 * Ce așteaptă verificările comune (harta 5.9): fiecare text al fiecărui segment, la momentul complet, în zona lui,
 * apoi semnătura din plan (T7), complet scrisă la t + dur, ca C17 s-o găsească în build la fel ca în blocul aprobat.
 * Cu stilul rezolvat (ctx.stil) și rădăcina (ctx.radacina), fiecare text primește și `caseta` [x, y, w, h], caseta
 * lui reală de pe ecran, calculată din CSS-ul din sablon.html (casete.mjs), pentru C13 (decizia din 2026-10-05).
 * Cuvintele se înlocuiesc în același loc, deci fiecare are momentul lui: intrarea lui plus T.CUVANT_INTRARE.
 * @param {object} cronologie formatul din harta 5.4
 * @param {{intern?: object, stil?: object, radacina?: string}} [ctx] intern = planul reelului (din cronologie());
 *   fără el, doar textele segmentelor; fără stil sau radacina, fără casete
 */
export function asteptari(cronologie, ctx = {}) {
  const plan = ctx.intern ?? null;
  const casete = plan && ctx.stil && ctx.radacina
    ? caseteTexte({ plan, stil: valoriStil(ctx.stil), radacina: ctx.radacina, sablonHtml: citesteRuntime().sablonHtml, latimeFormat: cronologie.latime })
    : null;
  const texte = [];
  for (const s of cronologie.segmente) {
    const scena = Number(/^scene\[(\d+)\]$/.exec(s.camp)?.[1]);
    const card = plan?.carduri.find((c) => c.scena === scena) ?? null;
    const dinCasete = [...(casete?.scene.get(scena) ?? [])];
    if (casete?.cta && s.texte.includes(casete.cta.text) && s.texte[s.texte.length - 1] === casete.cta.text) dinCasete.push(casete.cta);
    s.texte.forEach((text, i) => {
      const intrare = { ref: s.ref, camp: s.camp, text, t: s.complet, zona_text: s.zona_text };
      if (casete) {
        const c = dinCasete[i];
        if (!c || c.text !== text) throw new Error(`Casetele textelor nu corespund cronologiei la ${s.ref}: „${text}”.`);
        intrare.caseta = c.caseta;
        if (c.cuvant !== undefined) intrare.t = rotunjeste(card.cuvinte[c.cuvant].t + T.CUVANT_INTRARE);
      }
      texte.push(intrare);
    });
  }
  const sig = plan?.semnatura;
  if (sig) {
    // zona semnăturii e blocul #sig, citit din sablon.html (fără copie de mână); caseta e rândul ei real
    const intrare = { ref: 'Semnătura', camp: 'semnatura', text: sig.text, t: rotunjeste(sig.t + sig.dur), zona_text: zonaSemnatura(citesteRuntime().sablonHtml, sig.text, cronologie.latime) };
    if (casete?.semnatura) intrare.caseta = casete.semnatura.caseta;
    texte.push(intrare);
  }
  return {
    texte,
    momente: cronologie.segmente.map((s) => s.complet),
    audio: { prezent: cronologie.audio != null, durata: cronologie.audio?.durata ?? null },
    fundal: cronologie.fundal,
  };
}
