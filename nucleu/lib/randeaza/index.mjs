// mg randeaza (spec 6.9, 6.10, 7.1; harta 4.15). B12 aduce modul --doar-verificare: pregătirea comună,
// blocul „Ce apare pe ecran” în scenariu.md, hyperframes check (C10), textele din build (C17) și verificare.json.
// B13 pune înaintea oricărui mod refuzul proiectelor făcute pe altă versiune (T5).
// B15 adaugă --schita: pasul comun, apoi check la tranziții, instantanee la mijlocul scenelor și foaia schiței, fără MP4.
// B16 adaugă randarea completă: C08, render looks cu o singură reluare cu --low-memory-mode, C11 și cadrele de predare.
// B17 adaugă C12-C14 pe pixelii MP4-ului, în verificariMp4.
// Planul H: argumentele de motor ale șablonului la check și render, `.cache` șters după randarea completă.
// B18 adaugă C15 (în verificariMp4), C16 (foaia de contact a rundei) și rundele de revizie din rezultat (P1).
// Planul I (I01): tot ce ține de motor (check, instantanee, render, .cache) trece prin adaptorul din nucleu/lib/motoare/.
import { readdirSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { caiProiect, esteNumeProiect, relativaLaRadacina } from '../cai.mjs';
import { citesteJson, citesteText, existaFisier, mutaFisier, scrieTextAtomic, sha256Fisier, stergeRecursiv } from '../fisiere.mjs';
import { COD_IESIRE, EroareFatala, eroare } from '../erori.mjs';
import { extrageBlocMg, genereazaBloc, inlocuiesteBlocMg } from '../scenariu.mjs';
import { rotunjeste, tabelCronologie } from '../cronologie.mjs';
import { rezolvaFfmpeg, ultimeleRanduri } from '../ffmpeg.mjs';
import { cadrePredare, genereazaFoaie, sugestie } from '../foaie.mjs';
import { verificaAprobare } from '../aprobare.mjs';
import { citesteLock } from '../lock.mjs';
import { adaptorMotor } from '../motoare/index.mjs';
import { incarcaSablon } from '../sabloane.mjs';
import { citesteVersiuni } from '../versiuni.mjs';
import { obligatoriiPentru, rezultat, scrieVerificare, unice } from '../verificari/index.mjs';
import { declarate, okPentruAprobare, pastreazaDeclarate, verificaRezultateProprii } from '../verificari/stadii.mjs';
import { verificaC11, verificariMp4 } from '../verificari/mp4.mjs';
import { pregatesteBuild } from './pregatire.mjs';
import { completIesiri, pasComunIesiri, schitaIesiri } from './serie.mjs';
import { stareRevizie } from './runde.mjs';

// Mutate în adaptorul HyperFrames (I01); exportate și de aici, ca până acum.
export { argumenteRandare, argumenteWorkeri, optiuniRender } from '../motoare/hyperframes.mjs';

/**
 * SEC-1: date.json de pe disc, la finalul rulării, față de octeții citiți la pregătire. Dacă s-a schimbat (sau a
 * dispărut), verificarea C01 pică: build-ul, verificările și MP4-ul sunt pe datele vechi, nu pe fișierul de acum.
 * @param {{cai: {date: string}, proiect: string, sha256Date: string | null}} p
 * @returns {object | null} rezultatul C01 picat, sau null când fișierul e cel citit
 */
function dateSchimbate({ cai, proiect, sha256Date }) {
  const acum = existaFisier(cai.date) ? sha256Fisier(cai.date) : null;
  if (acum === sha256Date) return null;
  const camp = `fisier:video/${proiect}/date.json`;
  return rezultat('C01', false, {
    camp,
    erori: [eroare(
      'date-schimbate-in-randare',
      camp,
      `video/${proiect}/date.json s-a schimbat în timpul rulării lui mg randeaza: verificările (și filmul, la randarea completă) sunt pe datele citite la pornire.`,
      `Termină modificările din date.json, apoi rulează din nou node nucleu/mg.mjs randeaza ${proiect}.`,
    )],
  });
}

// Verificarea comună a fiecărui stadiu, mereu declarată (minimul), care poartă eroarea unui hook fără coduri S de stadiul lui.
const VERIFICARE_COMUNA_STADIU = Object.freeze({ build: 'C10', mp4: 'C11' });

/**
 * Cheamă un hook de verificări al șablonului (verificariBuild sau verificariProprii), îi validează strict rezultatul
 * și întoarce `rezultate` cu rezultatele lui adăugate. Un hook care aruncă sau întoarce o formă greșită nu lasă
 * codurile lui fără rezultat (și verificare.json vechi): fiecare cod S declarat cu stadiul hook-ului pică, cu o
 * eroare-interna pe câmpul stadiului. Dacă șablonul nu declară niciun cod S cu acel stadiu (de exemplu un S05 întors
 * de verificariBuild, rămas fără `stadii: { S05: build }`), eroarea nu se pierde: pică verificarea comună a stadiului
 * (C10 la build, C11 la mp4), cu eroarea adăugată la rezultatul existent sau într-unul nou.
 * @param {{sablon: object, stadiu: 'build'|'mp4', functie: string, descriere: string, apel: () => unknown, sugestie: string, rezultate: object[]}} p
 * @returns {Promise<object[]>} lista nouă (rezultate nu se modifică)
 */
export async function verificariSablon({ sablon, stadiu, functie, descriere, apel, sugestie, rezultate }) {
  try {
    return [...rezultate, ...verificaRezultateProprii(await apel(), sablon, stadiu, functie)];
  } catch (e) {
    const mg = eroare('eroare-interna', stadiu, `Verificările ${descriere} ale șablonului ${sablon.nume} au căzut: ${e?.message ?? String(e)}`, sugestie);
    const coduriS = declarate(sablon, [stadiu]).filter((c) => c.startsWith('S'));
    if (coduriS.length > 0) return [...rezultate, ...coduriS.map((c) => rezultat(c, false, { camp: stadiu, erori: [mg] }))];
    const comun = VERIFICARE_COMUNA_STADIU[stadiu];
    const existent = rezultate.find((r) => r.cod === comun);
    if (!existent) return [...rezultate, rezultat(comun, false, { camp: stadiu, erori: [mg] })];
    return rezultate.map((r) => (r === existent ? { ...r, ok: false, camp: r.camp ?? stadiu, erori: [...r.erori, mg] } : r));
  }
}

/**
 * Pasul comun al celor trei moduri (corpul din B12): pregătirea, blocul „Ce apare pe ecran”, check, C17, verificare.json.
 * Toate cele trei moduri îl cheamă cu modul real (ctx.mod, M6); în verificare.json și în rezultat se scrie mereu
 * 'doar-verificare' (fișierul descrie ce s-a verificat la acest pas; schița și randarea completă îl rescriu).
 * Întoarce și pregătirea (stilul, așteptările șablonului, cronologia), ca randarea completă să nu le refacă.
 * @param {{radacina: string, proiect: string, mod: 'doar-verificare'|'schita'|'complet', acum?: Date}} p
 * @returns {Promise<{comun: {ok: boolean, erori: object[], avertismente: object[], rezultat: object}, pregatire: object}>}
 */
async function pasComun({ radacina, proiect, mod, acum = new Date() }) {
  const p = await pregatesteBuild({ radacina, proiect, mod });
  // felia 3: un șablon cu ieșiri multiple (seria) are pasul lui, cu verificare.json versiunea 2
  if (p.iesiri !== null) return pasComunIesiri({ radacina, proiect, acum, p, dateSchimbate, verificariSablon });
  const modScris = 'doar-verificare';
  let rezultate = [...p.rezultate];
  let scenariu = null;
  if (p.erori.length === 0) {
    const bloc = genereazaBloc(p.bloc);
    const vechi = existaFisier(p.cai.scenariu) ? citesteText(p.cai.scenariu) : '';
    scrieTextAtomic(p.cai.scenariu, inlocuiesteBlocMg(vechi, bloc));
    scenariu = `video/${proiect}/scenariu.md`;
  }
  if (p.cronologie !== null) {
    // C10 și C17 prin adaptorul motorului șablonului (planul I, decizia 3)
    const adaptor = adaptorMotor(p.sablon.motor);
    rezultate.push(...(await adaptor.verificaBuild({
      radacina, proiect, cai: p.cai, sablon: p.sablon, construit: p.construit, cronologie: p.cronologie, asteptari: p.asteptari,
      versiuni: citesteVersiuni(radacina),
    })));
    // M2: verificările proprii ale șablonului pe build/, după C10 și C17, doar pe o pregătire fără erori
    if (p.erori.length === 0 && typeof p.sablon.modul.verificariBuild === 'function') {
      rezultate = await verificariSablon({
        sablon: p.sablon, stadiu: 'build', functie: 'verificariBuild', descriere: 'de build', rezultate,
        apel: () => p.sablon.modul.verificariBuild(p.cai.build, p.ctx),
        sugestie: `Rulează din nou node nucleu/mg.mjs randeaza ${proiect} --doar-verificare; dacă se repetă, trimite mesajul lui Dănuț.`,
      });
    }
  }
  const schimbate = p.sha256Date === null ? null : dateSchimbate({ cai: p.cai, proiect, sha256Date: p.sha256Date });
  if (schimbate) rezultate.push(schimbate);
  // M2: doar verificările declarate în SABLON.md intră în verificare.json și în ok
  rezultate = pastreazaDeclarate(rezultate, p.sablon);
  rezultate.sort((a, b) => (a.cod < b.cod ? -1 : a.cod > b.cod ? 1 : 0));
  const erori = unice([...p.erori, ...rezultate.flatMap((r) => r.erori)]);
  const avertismente = unice([...p.avertismente, ...rezultate.flatMap((r) => r.avertismente ?? [])]);
  const obligatorii = declarate(p.sablon, ['date', 'build']);
  const ok = erori.length === 0
    && rezultate.every((r) => r.ok)
    && obligatorii.every((cod) => rezultate.some((r) => r.cod === cod));
  scrieVerificare(p.cai, {
    versiune: 1,
    proiect,
    sablon: p.sablon.nume,
    mod: modScris,
    scris_la: acum.toISOString(),
    sha256_date: p.sha256Date,
    mp4: null,
    sha256_mp4: null,
    ok,
    ok_pentru_aprobare: ok,
    obligatorii,
    verificari: rezultate,
    avertismente,
  });
  return {
    comun: {
      ok,
      erori,
      avertismente,
      rezultat: {
        proiect,
        mod: modScris,
        scenariu,
        verificare: `video/${proiect}/verificare.json`,
        tabel: p.cronologie === null ? null : tabelCronologie(p.cronologie),
        verificari: rezultate.map((r) => ({ cod: r.cod, ok: r.ok })),
      },
    },
    pregatire: p,
  };
}

/**
 * T5: un proiect făcut pe altă versiune a motorului sau a schemei nu se randează în niciun mod.
 * Cu un nume de proiect invalid sau fără motor.lock nu verifică nimic: numele și lipsa proiectului le raportează pasul comun.
 * @param {string} radacina
 * @param {string} proiect
 * @returns {Promise<void>} aruncă EroareFatala 'proiect-alta-versiune' (COD_IESIRE.DATE)
 */
async function verificaVersiuneProiect(radacina, proiect) {
  if (!esteNumeProiect(proiect)) return;
  const cai = caiProiect(radacina, proiect);
  if (!existaFisier(cai.lock)) return;
  const lock = citesteLock(cai.lock);
  const versiuni = citesteVersiuni(radacina);
  const numeMotor = lock.motor?.nume ?? 'hyperframes';
  const motorInstalat = versiuni.motoare?.[numeMotor]?.versiune ?? null;
  const motorProiect = lock.motor?.versiune ?? null;
  let mesaj = null;
  if (motorProiect !== motorInstalat) {
    mesaj =
      `Proiectul ${proiect} a fost făcut cu ${numeMotor} ${motorProiect ?? 'necunoscut'}, ` +
      `iar agentul are acum ${numeMotor} ${motorInstalat ?? 'necunoscut'}.`;
  } else {
    const sablon = await incarcaSablon(radacina, lock.sablon.nume);
    const schemaInstalata = sablon.meta.versiune_schema;
    if (lock.sablon.versiune_schema !== schemaInstalata) {
      mesaj =
        `Proiectul ${proiect} folosește schema ${lock.sablon.versiune_schema} a șablonului ${lock.sablon.nume}, ` +
        `iar șablonul instalat are schema ${schemaInstalata}.`;
    }
  }
  if (mesaj === null) return;
  throw new EroareFatala(
    eroare(
      'proiect-alta-versiune',
      'motor.lock',
      mesaj,
      `Creează un proiect nou din datele lui: node nucleu/mg.mjs nou <proiect-nou> --din ${proiect}, apoi verifică-l cu node nucleu/mg.mjs randeaza <proiect-nou> --doar-verificare. Proiectul vechi rămâne neatins.`,
    ),
    COD_IESIRE.DATE,
  );
}

/**
 * Următorul număr de rundă: peste cel mai mare N din fișierele și folderele cadre/ care se potrivesc cu tiparele (1 dacă nu e niciunul).
 * Se numără și folderele schita-N/ fără foaie (o rundă întrerupută), ca instantaneele ei să nu se amestece cu ale rundei noi.
 * Doar numele din tipare contează: desene.png, predare-N.png și restul din cadre/ nu intră.
 */
function urmatorulNumar(dirCadre, tipare) {
  let nume;
  try {
    nume = readdirSync(dirCadre);
  } catch {
    return 1;
  }
  let maxim = 0;
  for (const n of nume) {
    for (const tipar of tipare) {
      const p = tipar.exec(n);
      if (p) maxim = Math.max(maxim, Number(p[1]));
    }
  }
  return maxim + 1;
}

/**
 * N-ul foii de contact complete următoare: peste cel mai mare N din cadre/foaie-N.jpg. E același N pe care hook-ul
 * SubagentStop îl dă lui cadre/revizie-N.md (alegeTintaVerdict pornește din foaie-N.jpg). Foile schiței
 * (foaie-schita-N, schita-N/) și desene.png nu intră: schița are rundele ei.
 * @param {string} dirCadre
 * @returns {number}
 */
export function numarFoaieNoua(dirCadre) {
  return urmatorulNumar(dirCadre, [/^foaie-(\d+)\.jpg$/]);
}

/**
 * --schita (spec 7.1, decizia 3: merge și fără aprobare): schița motorului în cadre/schita-N/ (HyperFrames: check la
 * tranziții și instantanee la mijlocul fiecărei scene) și foaia schiței din ea. Fără MP4 final.
 * Pasul comun (comun) a rulat deja și n-a avut erori de date.
 */
async function randeazaSchita({ radacina, proiect, acum, comun, pregatire }) {
  const cai = caiProiect(radacina, proiect);
  const relativ = (cale) => relativaLaRadacina(cale, radacina);
  const cron = citesteJson(join(cai.build, 'cronologie.json'));
  const ff = await rezolvaFfmpeg(radacina);
  const adaptor = adaptorMotor(pregatire.sablon.motor);
  const n = urmatorulNumar(cai.cadre, [/^foaie-schita-(\d+)\.jpg$/, /^schita-(\d+)$/]);

  const dirInstantanee = join(cai.cadre, `schita-${n}`);
  const vazute = new Set();
  const momente = [];
  for (const s of cron.segmente) {
    const t = rotunjeste((s.start + s.sfarsit) / 2);
    if (vazute.has(t)) continue;
    vazute.add(t);
    momente.push({ t, ref: s.ref, eticheta: `${s.ref}, mijloc` });
  }
  const iesireJpg = join(cai.cadre, `foaie-schita-${n}.jpg`);
  const iesireJson = join(cai.cadre, `foaie-schita-${n}.json`);
  const { check: rezumat, celule } = await adaptor.schita({
    radacina, proiect, cai, sablon: pregatire.sablon, construit: pregatire.construit, cronologie: cron,
    dirInstantanee, momente, iesireJpg, iesireJson, ff,
  });

  const erori = [];
  if (rezumat !== null && !rezumat.ok) {
    const primele = rezumat.gasiri.filter((g) => g.severitate === 'error').slice(0, 3).map((g) => `${g.cod}: ${g.mesaj}`).join('; ');
    erori.push(eroare(
      'check-esuat',
      'fisier:build/index.html',
      `hyperframes check la tranziții a găsit ${rezumat.erori} erori${primele ? ` (${primele})` : ''}.`,
      `Vezi video/${proiect}/cadre/schita-${n}/check.json și foaia schiței, repară datele, apoi rulează din nou node nucleu/mg.mjs randeaza ${proiect} --schita.`,
    ));
  }
  const ok = comun.ok && erori.length === 0;

  scrieVerificare(cai, {
    ...citesteJson(cai.verificare),
    mod: 'schita',
    ok,
    scris_la: acum.toISOString(),
    mp4: null,
    sha256_mp4: null,
    schita: { check_la_tranzitii: rezumat === null ? null : { ok: rezumat.ok, erori: rezumat.erori }, foaie: relativ(iesireJpg) },
  });

  return {
    ok,
    erori: [...comun.erori, ...erori],
    avertismente: comun.avertismente,
    rezultat: {
      ...comun.rezultat,
      mod: 'schita',
      revizie: stareRevizie(radacina, proiect, { schita: true }),
      schita: {
        foaie: relativ(iesireJpg),
        etichete: relativ(iesireJson),
        celule,
        instantanee: relativ(dirInstantanee),
        check: rezumat,
      },
    },
  };
}

/**
 * Scrie verificare.json (harta 5.14) pentru modul complet și construiește RezultatComanda.
 * ok e true doar dacă toate rezultatele trec și fiecare cod obligatoriu al șablonului (SABLON.md, nu lista pasului
 * comun) are un rezultat; un cod fără rezultat rămâne în verificari_lipsa (de exemplu C12-C16 când C11 pică și
 * MP4-ul nu se mai măsoară). `revizie` (P1) spune câte runde de revizie s-au folosit, la orice rezultat al randării complete.
 */
function incheieComplet({ radacina, proiect, cai, acum, comun, sablon, sha256Date, verificari: deVerificat, mp4, extra }) {
  const schimbate = dateSchimbate({ cai, proiect, sha256Date });
  const verificari = pastreazaDeclarate(schimbate ? [...deVerificat, schimbate] : deVerificat, sablon);
  const obligatorii = obligatoriiPentru(sablon);
  const lipsa = obligatorii.filter((cod) => !verificari.some((v) => v.cod === cod));
  const ok = verificari.every((v) => v.ok) && lipsa.length === 0;
  const avertismente = unice([...comun.avertismente, ...verificari.flatMap((v) => v.avertismente ?? [])]);
  scrieVerificare(cai, {
    versiune: 1,
    proiect,
    sablon: sablon.nume,
    mod: 'complet',
    scris_la: acum.toISOString(),
    sha256_date: sha256Date,
    mp4: mp4 ? relativaLaRadacina(mp4, radacina) : null,
    sha256_mp4: mp4 ? sha256Fisier(mp4) : null,
    ok,
    ok_pentru_aprobare: okPentruAprobare(verificari, sablon),
    obligatorii,
    verificari,
    avertismente,
  });
  return {
    ok,
    erori: unice(verificari.flatMap((v) => v.erori)),
    avertismente,
    rezultat: {
      ...comun.rezultat,
      mod: 'complet',
      verificari: verificari.map((v) => ({ cod: v.cod, ok: v.ok })),
      mp4: null,
      predare: [],
      foaie: null,
      etichete: null,
      reluat_low_memory: false,
      // planul I: ce a schimbat reluarea, după motor (--low-memory-mode sau --concurrency=1)
      reluare: adaptorMotor(sablon.motor).descriereReluare,
      revizie: stareRevizie(radacina, proiect),
      ...extra,
      verificari_lipsa: lipsa,
    },
  };
}

/**
 * Eroarea `randare-esuata`: mesajul diferă după etapa care a picat. Cu `etapa: 'taiere'` (Remotion) randarea a reușit,
 * iar ffmpeg n-a putut tăia pista audio la durata filmului, deci sfatul despre memorie nu se potrivește.
 * @param {{camp: string, eticheta: string, descriereReluare: string}} adaptor
 * @param {{stderr: string, etapa?: string}} randare
 * @param {string} proiect
 */
export function eroareRandare(adaptor, randare, proiect) {
  if (randare.etapa === 'taiere') {
    return eroare(
      'randare-esuata',
      adaptor.camp,
      `Randarea a reușit, dar tăierea pistei audio la durata filmului, cu ffmpeg, a eșuat: ${ultimeleRanduri(randare.stderr)}`,
      `Trimite lui Dănuț ieșirea lui node nucleu/mg.mjs randeaza ${proiect} --json; muzica sau ffmpeg-ul kitului au o problemă.`,
    );
  }
  return eroare(
    'randare-esuata',
    adaptor.camp,
    `Randarea a eșuat de două ori, a doua oară cu ${adaptor.descriereReluare}. Ultimele rânduri de la ${adaptor.eticheta}: ${ultimeleRanduri(randare.stderr)}`,
    `Închide programele care folosesc multă memorie și rulează din nou node nucleu/mg.mjs randeaza ${proiect}; dacă se repetă, rulează node nucleu/mg.mjs doctor.`,
  );
}

/** Mută MP4-ul randat peste cel vechi; un fișier ținut deschis de un player dă o eroare clară. */
function inlocuiesteMp4(sursa, destinatie, proiect) {
  try {
    mutaFisier(sursa, destinatie);
  } catch (e) {
    throw new EroareFatala(
      eroare(
        'randare-esuata',
        `fisier:video/${proiect}/${proiect}.mp4`,
        `Nu pot înlocui video/${proiect}/${proiect}.mp4 (${e?.code ?? e?.message}); fișierul e probabil deschis în alt program.`,
        `Închide programul care ține deschis videoul și rulează din nou node nucleu/mg.mjs randeaza ${proiect}.`,
      ),
      COD_IESIRE.MEDIU,
    );
  }
}

/**
 * Cadrele de predare și C16: foaia de contact a rundei, din MP4-ul final, cadre/foaie-N.jpg și cadre/foaie-N.json.
 * Se cheamă după ce MP4-ul a fost mutat și a trecut C11. Orice eșec (foaie-lipsa, o scriere care pică) devine C16 picat,
 * ca verificare.json să nu rămână cel scris de pasul comun; fișierele pe jumătate scrise ale rundei se șterg, ca N să rămână liber.
 * Orice altă eroare (EroareFatala ca ffmpeg-lipsa, sau un Error simplu) se întoarce în `fatala`, ca apelantul s-o arunce după ce scrie verificare.json.
 * @returns {Promise<{predare: string[], c16: object, fatala: EroareFatala|null}>}
 */
async function predareSiFoaie({ radacina, proiect, cai, cron, ff, transcriere = null }) {
  const n = numarFoaieNoua(cai.cadre);
  const iesireJpg = join(cai.cadre, `foaie-${n}.jpg`);
  const iesireJson = join(cai.cadre, `foaie-${n}.json`);
  const relativ = (cale) => relativaLaRadacina(cale, radacina);
  const asteptate = Array.isArray(cron.momente_foaie) ? cron.momente_foaie.length : 0;
  const prag = { celule: asteptate };
  const picat = (eroareMg, celule = 0) => rezultat('C16', false, {
    valoare: { runda: n, foaie: null, etichete: null, celule }, prag, camp: eroareMg.camp, erori: [eroareMg],
  });
  const curata = () => {
    for (const f of [iesireJpg, iesireJson]) {
      try {
        stergeRecursiv(f);
      } catch {
        // o foaie rămasă pe jumătate nu trebuie să acopere eroarea reală
      }
    }
  };
  let predare = [];
  try {
    predare = await cadrePredare({ mp4: cai.mp4, momente: cron.momente_foaie, dirCadre: cai.cadre, ff, proiect });
    const { celule } = await genereazaFoaie({ mp4: cai.mp4, momente: cron.momente_foaie, iesireJpg, iesireJson, ff, proiect, transcriere });
    if (!existaFisier(iesireJpg) || !existaFisier(iesireJson) || celule !== asteptate) {
      curata();
      return {
        predare,
        c16: picat(eroare('foaie-lipsa', `fisier:${relativ(iesireJpg)}`,
          `Foaia de contact ${relativ(iesireJpg)} are ${celule} celule din ${asteptate} sau lipsește.`,
          sugestie(proiect)), celule),
        fatala: null,
      };
    }
    return {
      predare,
      c16: rezultat('C16', true, {
        valoare: { runda: n, foaie: relativ(iesireJpg), etichete: relativ(iesireJson), celule }, prag,
      }),
      fatala: null,
    };
  } catch (e) {
    curata();
    // foaie-lipsa rămâne foaie-lipsa; orice altceva (ffmpeg-lipsa, un bug) se aruncă după ce verificare.json e scris,
    // un Error simplu ajungând astfel eroare-interna, cu stiva păstrată
    const esteFoaieLipsa = e instanceof EroareFatala && e.eroareMg?.cod === 'foaie-lipsa';
    const mg = esteFoaieLipsa
      ? e.eroareMg
      : e instanceof EroareFatala
        ? eroare('foaie-lipsa', 'cadre', `Foaia de contact nu a putut fi produsă: ${e.eroareMg?.mesaj}`, sugestie(proiect))
        : eroare('eroare-interna', 'cadre', `Foaia de contact nu a putut fi produsă: ${e?.message ?? String(e)}`, sugestie(proiect));
    return { predare, c16: picat(mg), fatala: esteFoaieLipsa ? null : e };
  }
}

/**
 * Randarea completă: C08 pe blocul regenerat de pasul comun, randarea motorului cu o singură reluare,
 * C11-C15 pe MP4, cadrele de predare, C16 (foaia rundei) și verificare.json cu mod 'complet'.
 * Pasul comun (comun, pregatire) a rulat deja și n-a avut erori.
 */
async function randeazaComplet(p) {
  const cai = caiProiect(p.radacina, p.proiect);
  const adaptor = adaptorMotor(p.pregatire.sablon.motor);
  // curățenia motorului (HyperFrames: .cache, adică --frames-cache-dir al șablonului) pe orice drum:
  // succes, eșec, MP4 respins de C11 sau excepție
  try {
    return await randeazaSiVerifica(p);
  } finally {
    adaptor.curata(cai);
  }
}

async function randeazaSiVerifica({ radacina, proiect, acum, comun, pregatire, memorieTotala, verificaMp4 }) {
  const cai = caiProiect(radacina, proiect);
  const relativ = (cale) => relativaLaRadacina(cale, radacina);
  const { sablon } = pregatire;
  const comuna = citesteJson(cai.verificare);
  const lock = citesteLock(cai.lock);
  const extras = extrageBlocMg(citesteText(cai.scenariu));
  const c08 = verificaAprobare(lock, extras ? extras.bloc : null);
  const deBaza = [...comuna.verificari.filter((v) => v.cod !== 'C08'), c08].sort((a, b) => (a.cod < b.cod ? -1 : a.cod > b.cod ? 1 : 0));
  const context = { radacina, proiect, cai, acum, comun, sablon, sha256Date: pregatire.sha256Date };
  if (!c08.ok) {
    return incheieComplet({ ...context, verificari: deBaza, mp4: null, extra: {} });
  }

  const cron = pregatire.cronologie;
  const ff = await rezolvaFfmpeg(radacina);

  // fișierul temporar stă în build/ (același volum cu video/<p>/); folderul curent al motorului îl alege adaptorul (T9)
  const adaptor = adaptorMotor(sablon.motor);
  const temporar = join(cai.build, 'randare.mp4');
  stergeRecursiv(temporar);
  const randare = await adaptor.randeaza({
    radacina, proiect, cai, sablon, construit: pregatire.construit, cronologie: cron, iesire: temporar, ff, memorieTotala,
  });
  const reluat = randare.reluat;
  if (!randare.ok) {
    stergeRecursiv(temporar);
    const esec = rezultat('C11', false, {
      camp: adaptor.camp,
      erori: [
        eroareRandare(adaptor, randare, proiect),
      ],
    });
    return incheieComplet({ ...context, verificari: [...deBaza, esec], mp4: null, extra: { reluat_low_memory: reluat === true } });
  }

  // Decizia lui Dănuț din 2026-10-06: C11 rulează pe MP4-ul temporar, înaintea mutării. Un MP4 stricat se șterge din
  // build/, filmul vechi rămâne neatins, iar verificare.json iese roșu cu eroarea C11 (fără mp4: nu e filmul verificat).
  let c11Temporar;
  try {
    ({ c11: c11Temporar } = await verificaC11({ mp4: temporar, cronologie: cron, ff }));
  } catch (e) {
    stergeRecursiv(temporar);
    const mg = e instanceof EroareFatala
      ? e.eroareMg
      : eroare('eroare-interna', 'mp4', `Verificarea C11 a căzut: ${e?.message ?? String(e)}`, `Rulează din nou node nucleu/mg.mjs randeaza ${proiect}.`);
    incheieComplet({ ...context, verificari: [...deBaza, rezultat('C11', false, { camp: mg.camp, erori: [mg] })], mp4: null, extra: { reluat_low_memory: reluat } });
    throw e;
  }
  if (!c11Temporar.ok) {
    stergeRecursiv(temporar);
    return incheieComplet({ ...context, verificari: [...deBaza, c11Temporar], mp4: null, extra: { reluat_low_memory: reluat } });
  }

  inlocuiesteMp4(temporar, cai.mp4, proiect);
  // C07 și restul verificărilor pe date au rulat în pasul comun; aici doar cele pe MP4 (asteptari și stil vin din aceeași pregătire)
  let rezultateMp4;
  try {
    rezultateMp4 = await verificaMp4({
      mp4: cai.mp4, cronologie: cron, asteptari: pregatire.asteptari, stil: pregatire.stil, ff, format: cron.format, date: pregatire.date, schema: sablon.schema,
    });
  } catch (e) {
    // MP4-ul nou e deja pe disc: verificare.json nu rămâne cel al pasului comun. Verificarea care n-a putut rula pică (C11),
    // cu eroarea ei, apoi eroarea originală se aruncă.
    const mg = e instanceof EroareFatala
      ? e.eroareMg
      : eroare('eroare-interna', 'mp4', `Verificările pe MP4 au căzut: ${e?.message ?? String(e)}`, `Rulează din nou node nucleu/mg.mjs randeaza ${proiect}.`);
    incheieComplet({
      ...context,
      verificari: [...deBaza, rezultat('C11', false, { camp: mg.camp, erori: [mg] })],
      mp4: cai.mp4,
      extra: { mp4: relativ(cai.mp4), reluat_low_memory: reluat },
    });
    throw e;
  }
  // Cadrele de predare și foaia (C16) doar dacă MP4-ul a trecut C11: un fișier pe care ffprobe nu-l poate citi ar fi probat
  // a doua oară, iar eroarea simplă ar ieși eroare-interna și ar pierde rezultatul C11 (P3-9). verificare.json se scrie oricum;
  // C12-C16 rămân atunci în verificari_lipsa. C12-C14 picate nu opresc predarea: cadrele arată revizorului și cursantului
  // exact ce au găsit verificările.
  // M2: verificările proprii ale șablonului pe MP4, doar dacă MP4-ul a trecut C11
  let verificari = [...deBaza, ...rezultateMp4];
  if (rezultateMp4.some((v) => v.cod === 'C11' && v.ok) && typeof sablon.modul.verificariProprii === 'function') {
    verificari = await verificariSablon({
      sablon, stadiu: 'mp4', functie: 'verificariProprii', descriere: 'proprii', rezultate: verificari,
      apel: () => sablon.modul.verificariProprii(cai.mp4, { ...pregatire.ctx, ff }),
      sugestie: `Rulează din nou node nucleu/mg.mjs randeaza ${proiect}; dacă se repetă, trimite mesajul lui Dănuț.`,
    });
  }
  let predare = [];
  let c16 = null;
  let fatala = null;
  if (rezultateMp4.some((v) => v.cod === 'C11' && v.ok)) {
    ({ predare, c16, fatala } = await predareSiFoaie({ radacina, proiect, cai, cron, ff, transcriere: pregatire.asteptari?.transcriere ?? null }));
    verificari.push(c16);
  }
  const incheiat = incheieComplet({
    ...context,
    verificari,
    mp4: cai.mp4,
    extra: {
      mp4: relativ(cai.mp4),
      predare: predare.map(relativ),
      foaie: c16?.valoare?.foaie ?? null,
      etichete: c16?.valoare?.etichete ?? null,
      reluat_low_memory: reluat,
    },
  });
  if (fatala) throw fatala;
  return incheiat;
}

/**
 * mg randeaza <proiect> [--doar-verificare | --schita]: T5 înaintea oricărui mod, apoi modul cerut.
 * Schița și randarea completă trec întâi prin pasul comun (--doar-verificare), care regenerează build/ și
 * blocul „Ce apare pe ecran” din scenariu.md (spec 6.9, pasul 3); dacă pasul comun are erori, se întoarce
 * rezultatul lui, fără check, instantanee sau randare.
 * @param {{radacina: string, proiect: string, mod: 'doar-verificare'|'schita'|'complet', acum?: Date, memorieTotala?: number, verificaMp4?: typeof verificariMp4, progres?: ((linie: string) => void) | null}} p
 *   memorieTotala (octeți) și verificaMp4 se pot injecta în teste; implicit os.totalmem() și verificariMp4.
 *   progres primește liniile de progres ale unei serii (randez, sărit, estimarea); null la --json
 * @returns {Promise<{ok: boolean, erori: object[], avertismente: object[], rezultat: object}>}
 */
export async function comandaRandeaza({ radacina, proiect, mod, acum = new Date(), memorieTotala = os.totalmem(), verificaMp4 = verificariMp4, progres = null }) {
  await verificaVersiuneProiect(radacina, proiect);
  const { comun, pregatire, versiuni } = await pasComun({ radacina, proiect, mod, acum });
  if (mod !== 'schita' && mod !== 'complet') return comun;
  if (comun.erori.length > 0) return comun;
  if (pregatire.iesiri !== null) {
    if (mod === 'schita') return schitaIesiri({ radacina, proiect, acum, comun, pregatire, versiuni, urmatorulNumar });
    return completIesiri({ radacina, proiect, acum, comun, pregatire, versiuni, verificaMp4, memorieTotala, progres, dateSchimbate, verificariSablon, numarFoaieNoua, eroareRandare });
  }
  if (mod === 'schita') return randeazaSchita({ radacina, proiect, acum, comun, pregatire });
  return randeazaComplet({ radacina, proiect, acum, comun, pregatire, memorieTotala, verificaMp4 });
}
