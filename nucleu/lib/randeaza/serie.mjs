// mg randeaza pe un proiect cu ieșiri multiple (spec 7.3, fluxul de randare al seriei; felia 3): pasul comun,
// schița pe ieșirile marcate (S09), randarea completă secvențială cu manifestul (S08) și verificare.json versiunea 2
// (docs/interfete/verificare.md). Fiecare MP4 se randează în serie/NN-<id>.tmp.mp4 și se redenumește doar la succes;
// o ieșire cu același build (sha256_build) și cu MP4-ul neatins se sare, deci o serie întreruptă se reia de unde a rămas,
// iar la o corectură rândurile neatinse rămân identice byte cu byte.
import fs from 'node:fs';
import { join } from 'node:path';
import { relativaLaRadacina } from '../cai.mjs';
import { citesteJson, citesteText, existaFisier, jsonStabil, mutaFisier, scrieJsonAtomic, scrieTextAtomic, sha256Fisier, sha256Text, stergeRecursiv } from '../fisiere.mjs';
import { EroareFatala, eroare } from '../erori.mjs';
import { extrageBlocMg, genereazaBloc, inlocuiesteBlocMg } from '../scenariu.mjs';
import { rotunjeste, tabelCronologie } from '../cronologie.mjs';
import { rezolvaFfmpeg } from '../ffmpeg.mjs';
import { cadrePredare, genereazaFoaieSurse } from '../foaie.mjs';
import { verificaAprobare } from '../aprobare.mjs';
import { citesteLock } from '../lock.mjs';
import { adaptorMotor } from '../motoare/index.mjs';
import { citesteVersiuni } from '../versiuni.mjs';
import { extrageVerdict, plafonRunde } from '../garda/revizor.mjs';
import { rezultat, scrieVerificare, unice } from '../verificari/index.mjs';
import { declarate, okPentruAprobare, pastreazaDeclarate } from '../verificari/stadii.mjs';
import { verificaC11 } from '../verificari/mp4.mjs';
import { combinaRezultate } from './iesiri.mjs';
import { stareRevizie } from './runde.mjs';
import { stareCorectura } from '../corectura.mjs';

const dupaCod = (a, b) => (a.cod < b.cod ? -1 : a.cod > b.cod ? 1 : 0);
const RE_MP4_SERIE = /^\d{2,3}-[a-z0-9-]+\.mp4$/;
const RE_TMP_SERIE = /\.tmp\.mp4$/;
// S08 (seria întreagă) și S09 (schița seriei) stau la nivelul superior, deși au stadiul mp4 (verificare.md, versiunea 2).
const COD_SERIE = 'S08';
const CODURI_SERIE = Object.freeze(['S08', 'S09']);

/** Căile seriei: folderul serie/, manifestul, MP4-ul și cadrele unei ieșiri. */
export function caiSerie(cai) {
  const dir = join(cai.dir, 'serie');
  return {
    dir,
    manifest: join(dir, 'manifest.json'),
    mp4: (i) => join(dir, `${i.nn}-${i.id}.mp4`),
    tmp: (i) => join(dir, `${i.nn}-${i.id}.tmp.mp4`),
    cadre: (i) => join(cai.cadre, i.id),
  };
}

/** Codurile de nivel superior și cele ale fiecărei ieșiri (verificare.md, versiunea 2). */
export function obligatoriiSerie(sablon, mod) {
  const sus = declarate(sablon, mod === 'complet' ? ['date', 'build', 'aprobare'] : ['date', 'build']);
  const mp4 = declarate(sablon, ['mp4']);
  return {
    sus: mod === 'complet' ? [...sus, ...mp4.filter((c) => CODURI_SERIE.includes(c))] : sus,
    iesire: mp4.filter((c) => !CODURI_SERIE.includes(c)),
  };
}

// Câmpurile care țin de poziția rândului în tabel (Testimonial N), nu de ce se vede: nu intră în hash-ul build-ului,
// ca un rând scos sau mutat să nu refacă filmele celorlalți.
const fara = (o, chei) => Object.fromEntries(Object.entries(o).filter(([k]) => !chei.includes(k)));
function continutStabil(rel, cale) {
  const nume = rel.split('/').pop();
  if (nume !== 'props.json' && nume !== 'cronologie.json') return sha256Fisier(cale);
  const j = JSON.parse(fs.readFileSync(cale, 'utf8'));
  if (nume === 'props.json') return sha256Text(jsonStabil(j?.card ? { ...j, card: fara(j.card, ['ref']) } : j));
  return sha256Text(jsonStabil({
    ...j,
    segmente: (j.segmente ?? []).map((x) => fara(x, ['ref'])),
    momente_foaie: (j.momente_foaie ?? []).map((x) => fara(x, ['ref', 'eticheta'])),
  }));
}

/**
 * Hash-ul build-ului unei ieșiri: tot ce intră în MP4-ul ei și în verificările lui (fișierele din build/<id>/, fără
 * poziția rândului; șablonul; motorul, nucleul și ffmpeg fixate; codul din nucleu/lib, din integritatea VERSIUNI.json).
 * Același hash și același MP4 pe disc înseamnă că ieșirea nu trebuie randată și verificată din nou.
 */
export function sha256Build({ dirBuild, sablon, versiuni }) {
  const fisiere = {};
  const umbla = (dir, prefix) => {
    for (const d of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const rel = prefix ? `${prefix}/${d.name}` : d.name;
      if (d.isDirectory()) umbla(join(dir, d.name), rel);
      else if (d.isFile() && d.name !== 'randare.mp4') fisiere[rel] = continutStabil(rel, join(dir, d.name));
    }
  };
  umbla(dirBuild, '');
  const cod = Object.fromEntries(Object.entries(versiuni.integritate ?? {}).filter(([k]) => k.startsWith('nucleu/lib/')));
  return sha256Text(jsonStabil({
    sablon: sablon.sha256, motor: versiuni.motoare?.[sablon.motor] ?? null, kit: versiuni.versiune_kit ?? null,
    nucleu: versiuni.nucleu ?? null, ffmpeg: versiuni.ffmpeg ?? null, cod: sha256Text(jsonStabil(cod)), fisiere,
  }));
}

/** Fișierele din care s-au făcut ieșirile (tabelul, pozele), cu hash-ul lor: hook-ul opțional surse() al șablonului. */
function surseProiect(p) {
  const lista = typeof p.sablon.modul.surse === 'function' ? p.sablon.modul.surse(p.date, p.ctx) : [];
  return Object.fromEntries([...new Set(lista)].sort().map((rel) => {
    const cale = join(p.cai.dir, ...rel.split('/'));
    return [rel, existaFisier(cale) ? sha256Fisier(cale) : null];
  }));
}

/** Amprenta datelor seriei (S09): date.json, sursele și build-ul fiecărei ieșiri. */
function amprenta(p, versiuni) {
  return sha256Text(jsonStabil({ date: p.sha256Date, surse: surseProiect(p), iesiri: p.iesiri.map((i) => [i.id, sha256Build({ dirBuild: i.dirBuild, sablon: p.sablon, versiuni })]) }));
}

function scrieV2(cai, c) {
  scrieVerificare(cai, { versiune: 2, ...c });
}

/** Tabelele cronologiei, câte unul pe ieșire, cu numele fișierului deasupra. */
const tabele = (p) => p.iesiri.map((i) => `${i.nn}-${i.id}:\n${tabelCronologie(i.cronologie)}`).join('\n');

/**
 * Pasul comun pe ieșiri: blocul în scenariu.md, C10 și C17 pe fiecare ieșire (un singur bundle), verificare.json v2.
 * @param {{radacina: string, proiect: string, acum: Date, p: object, dateSchimbate: Function}} a
 */
export async function pasComunIesiri({ radacina, proiect, acum, p, dateSchimbate, verificariSablon }) {
  let rezultate = [...p.rezultate];
  let scenariu = null;
  if (p.erori.length === 0) {
    const vechi = existaFisier(p.cai.scenariu) ? citesteText(p.cai.scenariu) : '';
    scrieTextAtomic(p.cai.scenariu, inlocuiesteBlocMg(vechi, genereazaBloc(p.bloc)));
    scenariu = `video/${proiect}/scenariu.md`;
  }
  const versiuni = citesteVersiuni(radacina);
  if (p.iesiri !== null) {
    const adaptor = adaptorMotor(p.sablon.motor);
    const pe = [];
    for (const i of p.iesiri) {
      let r = await adaptor.verificaBuild({ radacina, proiect, cai: p.cai, sablon: p.sablon, construit: i.construit, cronologie: i.cronologie, asteptari: i.asteptari, versiuni, dirIesire: i.dirBuild });
      // verificările de build ale șablonului, pe build/<id>/ al fiecărei ieșiri, ca la un film unic pe build/
      if (p.erori.length === 0 && typeof p.sablon.modul.verificariBuild === 'function') {
        r = await verificariSablon({
          sablon: p.sablon, stadiu: 'build', functie: 'verificariBuild', descriere: 'de build', rezultate: r,
          apel: () => p.sablon.modul.verificariBuild(i.dirBuild, i.ctx),
          sugestie: `Rulează din nou node nucleu/mg.mjs randeaza ${proiect} --doar-verificare; dacă se repetă, trimite mesajul lui Dănuț.`,
        });
      }
      pe.push({ id: i.id, rezultate: r });
    }
    rezultate.push(...combinaRezultate(pe));
  }
  const schimbate = p.sha256Date === null ? null : dateSchimbate({ cai: p.cai, proiect, sha256Date: p.sha256Date });
  if (schimbate) rezultate.push(schimbate);
  rezultate = pastreazaDeclarate(rezultate, p.sablon).sort(dupaCod);
  const erori = unice([...p.erori, ...rezultate.flatMap((r) => r.erori)]);
  const avertismente = unice([...p.avertismente, ...rezultate.flatMap((r) => r.avertismente ?? [])]);
  const { sus, iesire } = obligatoriiSerie(p.sablon, 'doar-verificare');
  const ok = erori.length === 0 && rezultate.every((r) => r.ok) && sus.every((cod) => rezultate.some((r) => r.cod === cod));
  const surse = p.iesiri === null ? {} : surseProiect(p);
  scrieV2(p.cai, {
    proiect, sablon: p.sablon.nume, mod: 'doar-verificare', scris_la: acum.toISOString(), sha256_date: p.sha256Date, surse,
    manifest: null, ok, ok_pentru_aprobare: ok, obligatorii: sus, verificari: rezultate,
    iesiri: (p.iesiri ?? []).map((i) => ({ id: i.id, mp4: null, sha256_mp4: null, ok: false, obligatorii: iesire, verificari: [] })),
    avertismente,
  });
  return {
    comun: {
      ok,
      erori,
      avertismente,
      rezultat: {
        proiect,
        mod: 'doar-verificare',
        scenariu,
        verificare: `video/${proiect}/verificare.json`,
        tabel: p.iesiri === null ? null : tabele(p),
        verificari: rezultate.map((r) => ({ cod: r.cod, ok: r.ok })),
        iesiri: (p.iesiri ?? []).map((i) => ({ id: i.id, fisier: `serie/${i.nn}-${i.id}.mp4`, durata: i.cronologie.durata, schita: i.schita })),
      },
    },
    pregatire: p,
    versiuni,
  };
}

/** Starea schiței rundei N: cadre/schita-N/stare.json (scrisă doar de mg), cu amprenta datelor pe care s-a făcut. */
const caleStareSchita = (cai, n) => join(cai.cadre, `schita-${n}`, 'stare.json');

/**
 * --schita pe o serie: câte un MP4 la jumătate de rezoluție pentru fiecare ieșire marcată (primul, ultimul și cel mai
 * lung rând, la date-serie), foaia schiței din toate și starea rundei, pentru S09.
 */
export async function schitaIesiri({ radacina, proiect, acum, comun, pregatire: p, versiuni, urmatorulNumar }) {
  const cai = p.cai;
  const relativ = (cale) => relativaLaRadacina(cale, radacina);
  const ff = await rezolvaFfmpeg(radacina);
  const adaptor = adaptorMotor(p.sablon.motor);
  if (typeof adaptor.schitaMp4 !== 'function') throw new TypeError(`Motorul ${p.sablon.motor} nu are schița pe ieșiri (schitaMp4).`);
  const n = urmatorulNumar(cai.cadre, [/^foaie-schita-(\d+)\.jpg$/, /^schita-(\d+)$/]);
  const dir = join(cai.cadre, `schita-${n}`);
  const alese = p.iesiri.some((i) => i.schita) ? p.iesiri.filter((i) => i.schita) : p.iesiri;
  const surse = [];
  for (const i of alese) {
    const mp4 = await adaptor.schitaMp4({ radacina, proiect, cai, sablon: p.sablon, construit: i.construit, iesire: join(dir, `${i.nn}-${i.id}.mp4`), dirIesire: i.dirBuild });
    surse.push({ mp4, momente: i.cronologie.segmente.map((s) => ({ t: rotunjeste((s.start + s.sfarsit) / 2), ref: s.ref, eticheta: `${s.ref}, mijloc` })) });
  }
  const iesireJpg = join(cai.cadre, `foaie-schita-${n}.jpg`);
  const iesireJson = join(cai.cadre, `foaie-schita-${n}.json`);
  const { celule } = await genereazaFoaieSurse({ surse, iesireJpg, iesireJson, ff, proiect, schita: true });
  scrieJsonAtomic(caleStareSchita(cai, n), { versiune: 1, runda: n, ok: comun.ok, amprenta: amprenta(p, versiuni), iesiri: alese.map((i) => i.id), scris_la: acum.toISOString() });
  const ok = comun.ok;
  scrieV2(cai, { ...citesteJson(cai.verificare), mod: 'schita', ok, scris_la: acum.toISOString(), schita: { foaie: relativ(iesireJpg), iesiri: alese.map((i) => i.id) } });
  return {
    ok,
    erori: comun.erori,
    avertismente: comun.avertismente,
    rezultat: {
      ...comun.rezultat,
      mod: 'schita',
      revizie: stareRevizie(radacina, proiect, { schita: true }),
      schita: { foaie: relativ(iesireJpg), etichete: relativ(iesireJson), celule, instantanee: relativ(dir), check: null, iesiri: alese.map((i) => `${i.nn}-${i.id}`) },
    },
  };
}

/**
 * S09: ultima schiță a seriei e pe datele de acum, verde, și revizorul i-a dat TRECE. La plafonul rundelor de schiță,
 * cursantul decide (ca la predare): S09 trece cu un avertisment, cu observațiile revizorului la vedere. O corectură în
 * lucru (mg corectura --deschide) trece fără schiță nouă: seria a fost deja schițată, revizuită și predată.
 */
export function verificaS09({ radacina, proiect, cai, amprentaAcum }) {
  const prag = { schita: 'verde, pe datele de acum', verdict: 'TRECE (sau plafonul rundelor de schiță atins, sau o corectură în lucru)' };
  const corectura = stareCorectura(cai.dir);
  if (corectura.ultima && !corectura.ultima.verificata_la && !corectura.ultima.inchisa_la) {
    return rezultat('S09', true, { valoare: { corectura: corectura.n, incercare: corectura.ultima.incercare }, prag });
  }
  let n = 0;
  try {
    for (const nume of fs.readdirSync(cai.cadre)) {
      const m = /^schita-(\d+)$/.exec(nume);
      if (m && existaFisier(caleStareSchita(cai, Number(m[1])))) n = Math.max(n, Number(m[1]));
    }
  } catch {
    // fără cadre/, nicio schiță
  }
  const sfat = `Rulează node nucleu/mg.mjs randeaza ${proiect} --schita, pornește revizorul pe foaia schiței, repară ce cere, apoi randează complet.`;
  const pica = (mesaj) => rezultat('S09', false, { valoare: { runda: n || null }, prag, camp: 'schita', erori: [eroare('serie-fara-schita', 'schita', mesaj, sfat)] });
  if (n === 0) return pica('Seria nu are încă o schiță: randarea completă a tuturor rândurilor pornește doar după o schiță trecută de revizor.');
  const stare = citesteJson(caleStareSchita(cai, n));
  if (stare.ok !== true) return pica(`Schița ${n} a seriei are verificări picate.`);
  if (stare.amprenta !== amprentaAcum) return pica(`Schița ${n} e făcută pe alte date (date.json, tabelul, pozele sau stilul s-au schimbat de atunci).`);
  const caleVerdict = join(cai.cadre, `revizie-schita-${n}.md`);
  const verdict = existaFisier(caleVerdict) ? extrageVerdict(citesteText(caleVerdict)) : null;
  if (verdict?.startsWith('Verdict: TRECE')) return rezultat('S09', true, { valoare: { runda: n, verdict: 'TRECE' }, prag });
  const plafon = plafonRunde(radacina, proiect, { schita: true });
  if (verdict && n >= plafon) {
    return rezultat('S09', true, {
      valoare: { runda: n, verdict: 'REPARĂ, la plafon' }, prag,
      avertismente: [eroare('serie-fara-schita', 'schita', `Schița ${n} are verdictul REPARĂ, iar rundele de schiță sunt la plafon (${plafon}): seria se randează cu observațiile revizorului nereparate.`, 'Arată-i cursantului observațiile revizorului la predare; el decide.')],
    });
  }
  return pica(verdict ? `Revizorul a cerut reparații pe schița ${n} (REPARĂ).` : `Schița ${n} nu are încă verdictul revizorului (cadre/revizie-schita-${n}.md).`);
}

function citesteManifest(cs) {
  try {
    const m = citesteJson(cs.manifest);
    return Array.isArray(m?.iesiri) ? m : null;
  } catch {
    return null;
  }
}

/**
 * Randarea completă a seriei: C08, S09, apoi fiecare ieșire pe rând (sărită dacă nu s-a schimbat), C11-C15 și
 * verificările proprii pe fiecare MP4, cadrele de predare în cadre/<id>/, foaia rundei cu toată seria (C16), S08,
 * manifestul și verificare.json v2. `progres` primește câte o linie pentru om (null la --json).
 */
export async function completIesiri({ radacina, proiect, acum, comun, pregatire: p, versiuni, verificaMp4, memorieTotala, progres = null, dateSchimbate, verificariSablon, numarFoaieNoua, eroareRandare }) {
  const cai = p.cai;
  const cs = caiSerie(cai);
  const relativ = (cale) => relativaLaRadacina(cale, radacina);
  const { sablon } = p;
  const adaptor = adaptorMotor(sablon.motor);
  const comuna = citesteJson(cai.verificare);
  const lock = citesteLock(cai.lock);
  const extras = extrageBlocMg(citesteText(cai.scenariu));
  const c08 = verificaAprobare(lock, extras ? extras.bloc : null);
  const amprentaAcum = amprenta(p, versiuni);
  const s09 = verificaS09({ radacina, proiect, cai, amprentaAcum });
  const deBaza = [...comuna.verificari.filter((v) => v.cod !== 'C08' && v.cod !== 'S09'), c08, s09].sort(dupaCod);
  const { sus, iesire: obligIesire } = obligatoriiSerie(sablon, 'complet');
  const surse = surseProiect(p);

  const incheie = ({ iesiri, manifest, extra = {} }) => {
    const schimbate = dateSchimbate({ cai, proiect, sha256Date: p.sha256Date });
    const verificari = pastreazaDeclarate(schimbate ? [...deBaza, schimbate] : deBaza, sablon);
    const lipsa = sus.filter((cod) => !verificari.some((v) => v.cod === cod));
    const iesiriOk = iesiri !== null && iesiri.length === p.iesiri.length && iesiri.every((i) => i.ok);
    const ok = verificari.every((v) => v.ok) && lipsa.length === 0 && iesiriOk;
    const avertismente = unice([...comun.avertismente, ...verificari.flatMap((v) => v.avertismente ?? []), ...(iesiri ?? []).flatMap((i) => i.verificari.flatMap((v) => v.avertismente ?? []))]);
    scrieV2(cai, {
      proiect, sablon: sablon.nume, mod: 'complet', scris_la: acum.toISOString(), sha256_date: p.sha256Date, surse,
      manifest: manifest ? { cale: relativ(cs.manifest), sha256: sha256Fisier(cs.manifest) } : null,
      ok, ok_pentru_aprobare: okPentruAprobare(verificari, sablon), obligatorii: sus, verificari, avertismente,
      // câte un element pe ieșire, și când randarea nici n-a pornit (C08 sau S09 picate)
      iesiri: iesiri ?? p.iesiri.map((i) => ({ id: i.id, mp4: null, sha256_mp4: null, ok: false, obligatorii: obligIesire, verificari: [] })),
    });
    const erori = unice([...verificari.flatMap((v) => v.erori), ...(iesiri ?? []).flatMap((i) => i.verificari.flatMap((v) => v.erori))]);
    return {
      ok,
      erori,
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
        reluare: adaptor.descriereReluare,
        revizie: stareRevizie(radacina, proiect),
        manifest: manifest ? relativ(cs.manifest) : null,
        iesiri: (iesiri ?? []).map((i) => ({ id: i.id, mp4: i.mp4, ok: i.ok, sarit: i.sarit === true })),
        ...extra,
        verificari_lipsa: lipsa,
      },
    };
  };

  if (!c08.ok || !s09.ok) return incheie({ iesiri: null, manifest: false });

  const ff = await rezolvaFfmpeg(radacina);
  fs.mkdirSync(cs.dir, { recursive: true });
  // resturile unei rulări întrerupte: un .tmp.mp4 nu e niciodată un film predat
  for (const nume of fs.readdirSync(cs.dir)) if (RE_TMP_SERIE.test(nume)) stergeRecursiv(join(cs.dir, nume));
  const vechi = citesteManifest(cs);
  const rezultateIesiri = [];
  const builduri = new Map();
  let randate = 0;
  let sarite = 0;
  let esuate = 0;
  let primaDurataMs = null;
  const dorite = new Set(p.iesiri.map((i) => `${i.nn}-${i.id}.mp4`));
  // Manifestul se scrie după fiecare rând, ca o serie întreruptă să se reia de unde a rămas: rândurile încă
  // neajunse își păstrează intrarea veche. Verificările (fără C16, care ține de foaia rundei) rămân aici pentru
  // rularea următoare; `final` = după foaie și S08, cu ok-ul complet al fiecărei ieșiri.
  const scrieManifest = (final) => {
    const intrari = [];
    for (const i of p.iesiri) {
      const r = rezultateIesiri.find((x) => x.id === i.id);
      if (!r) {
        const v = vechi?.iesiri.find((e) => e.id === i.id);
        if (v) intrari.push(v);
        continue;
      }
      const verificari = r.verificari.filter((v) => v.cod !== 'C16');
      intrari.push({
        id: i.id, nn: i.nn, mp4: `serie/${i.nn}-${i.id}.mp4`, sha256_build: builduri.get(i.id), sha256_mp4: r.sha256_mp4,
        durata: i.cronologie.durata, ok: final ? r.ok : r.sha256_mp4 !== null && verificari.every((v) => v.ok), verificari,
      });
    }
    scrieJsonAtomic(cs.manifest, { versiune: 1, proiect, sablon: sablon.nume, scris_la: acum.toISOString(), rezumat: { randate, sarite, esuate }, iesiri: intrari });
  };

  for (const [k, i] of p.iesiri.entries()) {
    const dest = cs.mp4(i);
    const build = sha256Build({ dirBuild: i.dirBuild, sablon, versiuni });
    builduri.set(i.id, build);
    const anterior = vechi?.iesiri.find((e) => e.id === i.id) ?? null;
    const caleAnterior = anterior ? join(cai.dir, ...String(anterior.mp4).split('/')) : null;
    // sărită: același build, MP4-ul anterior neatins și verificat verde. Verificările lui stau în manifest, nu în
    // verificare.json, pe care pasul comun l-a rescris deja la rularea asta.
    if (anterior?.ok === true && Array.isArray(anterior.verificari) && anterior.sha256_build === build && caleAnterior && existaFisier(caleAnterior) && sha256Fisier(caleAnterior) === anterior.sha256_mp4) {
      if (caleAnterior !== dest) mutaFisier(caleAnterior, dest);
      const cadre = cs.cadre(i);
      if (!existaFisier(join(cadre, 'predare-1.png')) || !existaFisier(join(cadre, 'predare-2.png'))) {
        await cadrePredare({ mp4: dest, momente: i.cronologie.momente_foaie, dirCadre: cadre, ff, proiect });
      }
      sarite += 1;
      rezultateIesiri.push({ id: i.id, mp4: relativ(dest), sha256_mp4: anterior.sha256_mp4, ok: false, obligatorii: obligIesire, verificari: anterior.verificari, sarit: true });
      progres?.(`${i.nn}/${p.iesiri.length} ${i.id}: neschimbat, sărit.`);
      scrieManifest(false);
      continue;
    }
    const temporar = cs.tmp(i);
    stergeRecursiv(temporar);
    const start = Date.now();
    progres?.(`${i.nn}/${p.iesiri.length} ${i.id}: randez (${String(i.cronologie.durata).replace('.', ',')} s)…`);
    const randare = await adaptor.randeaza({ radacina, proiect, cai, sablon, construit: i.construit, cronologie: i.cronologie, iesire: temporar, ff, memorieTotala, dirIesire: i.dirBuild });
    const pica = (r) => {
      esuate += 1;
      stergeRecursiv(temporar);
      rezultateIesiri.push({ id: i.id, mp4: relativ(dest), sha256_mp4: null, ok: false, obligatorii: obligIesire, verificari: [r] });
      scrieManifest(false);
    };
    if (!randare.ok) {
      pica(rezultat('C11', false, { camp: adaptor.camp, erori: [eroareRandare(adaptor, randare, proiect)] }));
      continue;
    }
    const { c11 } = await verificaC11({ mp4: temporar, cronologie: i.cronologie, ff });
    if (!c11.ok) {
      pica(c11);
      continue;
    }
    stergeRecursiv(dest);
    mutaFisier(temporar, dest);
    let verificari = await verificaMp4({ mp4: dest, cronologie: i.cronologie, asteptari: i.asteptari, stil: p.stil, ff, format: i.cronologie.format, date: i.date, schema: sablon.schema });
    if (verificari.some((v) => v.cod === 'C11' && v.ok) && typeof sablon.modul.verificariProprii === 'function') {
      verificari = await verificariSablon({
        sablon, stadiu: 'mp4', functie: 'verificariProprii', descriere: 'proprii', rezultate: verificari,
        apel: () => sablon.modul.verificariProprii(dest, { ...i.ctx, ff }),
        sugestie: `Rulează din nou node nucleu/mg.mjs randeaza ${proiect}; dacă se repetă, trimite mesajul lui Dănuț.`,
      });
    }
    await cadrePredare({ mp4: dest, momente: i.cronologie.momente_foaie, dirCadre: cs.cadre(i), ff, proiect });
    verificari = pastreazaDeclarate(verificari, sablon).sort(dupaCod);
    const sha = sha256Fisier(dest);
    // C16 se adaugă după foaia rundei; ok-ul final al ieșirii se calculează acolo
    rezultateIesiri.push({ id: i.id, mp4: relativ(dest), sha256_mp4: sha, ok: false, obligatorii: obligIesire, verificari });
    randate += 1;
    scrieManifest(false);
    if (primaDurataMs === null) {
      primaDurataMs = Date.now() - start;
      const ramase = p.iesiri.length - k - 1;
      if (ramase > 0) progres?.(`Primul film a durat ${Math.round(primaDurataMs / 1000)} s; pentru celelalte ${ramase}, cam ${Math.ceil((primaDurataMs * ramase) / 60000)} min (rândurile neschimbate se sar).`);
    }
  }

  // filmele rândurilor scoase din tabel și cadrele lor nu mai aparțin seriei
  for (const nume of fs.readdirSync(cs.dir)) if (RE_MP4_SERIE.test(nume) && !dorite.has(nume)) stergeRecursiv(join(cs.dir, nume));
  const iduri = new Set(p.iesiri.map((i) => i.id));
  for (const e of vechi?.iesiri ?? []) if (!iduri.has(e.id)) stergeRecursiv(join(cai.cadre, e.id));

  // foaia rundei, cu toate filmele verzi la C11 (C16 pe fiecare ieșire)
  const deFoaie = p.iesiri.filter((i) => rezultateIesiri.find((r) => r.id === i.id)?.verificari.some((v) => v.cod === 'C11' && v.ok));
  let foaie = null;
  let etichete = null;
  let eroareFoaie = null;
  if (deFoaie.length > 0) {
    const n = numarFoaieNoua(cai.cadre);
    const iesireJpg = join(cai.cadre, `foaie-${n}.jpg`);
    const iesireJson = join(cai.cadre, `foaie-${n}.json`);
    try {
      await genereazaFoaieSurse({ surse: deFoaie.map((i) => ({ mp4: cs.mp4(i), momente: i.cronologie.momente_foaie })), iesireJpg, iesireJson, ff, proiect });
      foaie = relativ(iesireJpg);
      etichete = relativ(iesireJson);
    } catch (e) {
      eroareFoaie = e instanceof EroareFatala ? e.eroareMg : eroare('foaie-lipsa', 'cadre', `Foaia de contact a seriei nu a putut fi produsă: ${e?.message ?? String(e)}`, `Rulează din nou node nucleu/mg.mjs randeaza ${proiect}.`);
      for (const f of [iesireJpg, iesireJson]) stergeRecursiv(f);
    }
  }
  for (const r of rezultateIesiri) {
    if (r.sarit) {
      // o ieșire sărită are C16 din runda ei; foaia nouă o include oricum, deci C16 se reface pe runda de acum
      r.verificari = r.verificari.filter((v) => v.cod !== 'C16');
    }
    const i = p.iesiri.find((x) => x.id === r.id);
    const inFoaie = deFoaie.includes(i);
    if (inFoaie && obligIesire.includes('C16')) {
      r.verificari = [...r.verificari, foaie
        ? rezultat('C16', true, { valoare: { foaie, celule: i.cronologie.momente_foaie.length }, prag: { celule: i.cronologie.momente_foaie.length } })
        : rezultat('C16', false, { camp: 'cadre', erori: [eroareFoaie] })].sort(dupaCod);
    }
    const lipsa = r.obligatorii.filter((c) => !r.verificari.some((v) => v.cod === c));
    r.ok = r.sha256_mp4 !== null && lipsa.length === 0 && r.verificari.every((v) => v.ok)
      && existaFisier(join(cs.cadre(i), 'predare-1.png')) && existaFisier(join(cs.cadre(i), 'predare-2.png'));
  }

  // S08: câte un MP4 verde pe rând, fără rânduri eșuate și fără .tmp.mp4 rămas
  const tmpRamase = fs.readdirSync(cs.dir).filter((n) => RE_TMP_SERIE.test(n));
  const mp4uri = fs.readdirSync(cs.dir).filter((n) => RE_MP4_SERIE.test(n));
  const picate = rezultateIesiri.filter((r) => !r.ok).map((r) => r.id);
  const eroriS08 = [];
  if (mp4uri.length !== p.iesiri.length || picate.length > 0 || tmpRamase.length > 0) {
    eroriS08.push(eroare('serie-incompleta', 'serie',
      `Seria are ${mp4uri.length} MP4 din ${p.iesiri.length}${picate.length ? `; rânduri cu probleme: ${picate.join(', ')}` : ''}${tmpRamase.length ? `; ${tmpRamase.length} .tmp.mp4 rămase` : ''}.`,
      `Repară ce spun erorile rândurilor, apoi rulează din nou node nucleu/mg.mjs randeaza ${proiect}: rândurile bune se sar.`));
  }
  if (sablon.meta.verificari.includes(COD_SERIE)) {
    deBaza.push(rezultat(COD_SERIE, eroriS08.length === 0, {
      valoare: { mp4: mp4uri.length, randuri: p.iesiri.length, randate, sarite, esuate, tmp: tmpRamase.length },
      prag: { mp4: p.iesiri.length, esuate: 0, tmp: 0 }, camp: eroriS08.length ? 'serie' : null, erori: eroriS08,
    }));
    deBaza.sort(dupaCod);
  }
  scrieManifest(true);
  progres?.(`Seria: randate ${randate}, sărite ${sarite}, eșuate ${esuate}.`);
  const predare = p.iesiri.flatMap((i) => [1, 2].map((k) => join(cs.cadre(i), `predare-${k}.png`))).filter(existaFisier).map(relativ);
  return incheie({ iesiri: rezultateIesiri, manifest: true, extra: { foaie, etichete, predare, randate, sarite, esuate } });
}
