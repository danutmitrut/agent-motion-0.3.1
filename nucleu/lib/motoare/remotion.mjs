// Adaptorul Remotion (planul I, deciziile 3-8): lansarea CLI-ului, bundle-ul în cache după hash, C10 și C17.
// Toate comenzile Remotion rulează cu folderul curent motoare/remotion: acolo își caută Remotion rădăcina (primul
// package.json de deasupra folderului curent), cache-ul webpack (node_modules/.cache) și browserul descărcat
// (node_modules/.remotion). Datele intră în compoziție numai prin --props=<cale absolută>. Fără --config: o
// configurație .ts s-ar compila cu tsconfig-ul rădăcinii Remotion, pe care motoare/remotion nu-l are (verificat
// pe 4.0.529, 2026-10-20); argumentele de randare le fixează nucleul în linia de comandă.
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { COD_IESIRE, EroareFatala, eroare } from '../erori.mjs';
import { existaFisier, jsonStabil, mutaFisier, scrieTextAtomic, sha256Fisier, sha256Text, stergeRecursiv } from '../fisiere.mjs';
import { ruleazaFfmpeg, ultimeleRanduri } from '../ffmpeg.mjs';
import { genereazaFoaie } from '../foaie.mjs';
import { citesteVersiuni } from '../versiuni.mjs';
import { rezultat } from '../verificari/index.mjs';
import { scaneazaRetea, spatii } from '../verificari/build.mjs';
import { executaNode } from './lansare.mjs';
import { CLI_REMOTION, DIR_REMOTION, mediuRemotion } from './remotion-instalare.mjs';

export { mediuRemotion };

const CAMP = 'mediu.remotion';
const SUGESTIE_SABLON = 'E o problemă a șablonului, nu a datelor: trimite lui Dănuț ieșirea lui node nucleu/mg.mjs randeaza <proiect> --doar-verificare --json.';
// Fișierele din build/ care nu intră în cheia bundle-ului: datele (compoziția le primește prin --props), cronologia
// și MP4-ul temporar al randării, oriunde în build/ (la o serie, în build/<id>/, felia 3: toate cardurile împart un
// bundle). Restul (fonturile, sigla, pozele, muzica) ajunge în bundle, în public/ (decizia 4).
const FARA_CHEIE = new Set(['props.json', 'cronologie.json', 'randare.mp4']);
// Un rând din `remotion compositions`: „Proba    30      1080x1920      180 (6.00 sec)” (4.0.529)
const RAND_COMPOZITIE = /^(\S+)\s+(\d+(?:\.\d+)?)\s+(\d+)x(\d+)\s+(\d+)\s+\(/;
const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;

function motorLipsa(detaliu) {
  return new EroareFatala(eroare('motor-lipsa', CAMP,
    `Remotion nu e instalat în motoare/remotion (${detaliu}).`,
    'Rulează node nucleu/mg.mjs doctor: un proiect din video/ folosește Remotion, deci doctorul îl reinstalează.'), COD_IESIRE.MEDIU);
}

/**
 * @param {string} radacina
 * @returns {string} calea absolută a lui motoare/remotion/node_modules/@remotion/cli/remotion-cli.js
 */
export function rezolvaBinRemotion(radacina) {
  const cale = join(radacina, ...DIR_REMOTION, ...CLI_REMOTION);
  if (!existaFisier(cale)) throw motorLipsa('lipsește node_modules/@remotion/cli/remotion-cli.js');
  return cale;
}

/** @param {string} radacina @returns {string | null} versiunea pachetului remotion instalat */
export function versiuneRemotion(radacina) {
  try {
    const v = JSON.parse(readFileSync(join(radacina, ...DIR_REMOTION, 'node_modules', 'remotion', 'package.json'), 'utf8')).version;
    return typeof v === 'string' ? v : null;
  } catch {
    return null;
  }
}

/**
 * `node remotion-cli.js ...argumente`, fără shell, cu folderul curent motoare/remotion și mediul fără chei.
 * @param {string[]} argumente
 * @param {{radacina: string, cwd?: string, timeoutMs?: number, bin?: string, mediu?: NodeJS.ProcessEnv}} optiuni
 *   bin și mediu: doar pentru teste
 * @returns {Promise<{cod: number, stdout: string, stderr: string}>}
 */
export async function ruleazaRemotion(argumente, { radacina, cwd, timeoutMs = 900000, bin, mediu } = {}) {
  return executaNode(bin ?? rezolvaBinRemotion(radacina), argumente, {
    cwd: cwd ?? join(radacina, ...DIR_REMOTION),
    env: mediuRemotion(mediu ?? process.env),
    timeoutMs,
  });
}

/**
 * Rândul util din ieșirea de eroare a lui Remotion: ultimul rând cu „Error:” care nu e din stivă și nu e zgomotul
 * ProtocolError de la închiderea paginilor, fără eticheta „Error” a CLI-ului; altfel ultimele rânduri.
 * @param {string} text
 * @returns {string}
 */
export function eroareaRemotion(text) {
  const randuri = String(text ?? '').replace(ANSI, '').split(/\r?\n/).map((r) => r.trim()).filter(Boolean);
  const utile = randuri.filter((r) => r.includes('Error:') && !/^at\s/.test(r) && !r.includes('ProtocolError'));
  if (utile.length === 0) return ultimeleRanduri(text);
  return utile.at(-1).replace(/^Error\s+(?=\S*Error:)/, '');
}

function fisiereBuild(dir, prefix = '') {
  const lista = [];
  for (const intrare of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const relativ = prefix ? `${prefix}/${intrare.name}` : intrare.name;
    if (intrare.isDirectory()) lista.push(...fisiereBuild(join(dir, intrare.name), relativ));
    else if (intrare.isFile()) lista.push(relativ);
  }
  return lista;
}

/**
 * Cheia bundle-ului (decizia 4): sha256 peste sha256-ul șablonului, lockfile-ul Remotion și fișierele din build/
 * fără props.json, cronologie.json și randare.mp4; primele 16 caractere hex.
 * @param {{sablon: {sha256: string}, dirBuild: string, versiuni: object}} p
 * @returns {string}
 */
export function cheieBundle({ sablon, dirBuild, versiuni }) {
  const fisiere = {};
  for (const relativ of fisiereBuild(dirBuild)) {
    if (!FARA_CHEIE.has(relativ.split('/').pop())) fisiere[relativ] = sha256Fisier(join(dirBuild, ...relativ.split('/')));
  }
  const lockfile = versiuni.motoare?.remotion?.lockfile_sha256 ?? null;
  return sha256Text(jsonStabil({ sablon: sablon.sha256, lockfile, fisiere })).slice(0, 16);
}

/**
 * Bundle-ul compoziției în video/<p>/.cache/bundle-<cheie>/, refolosit cât timp există `.gata` (scris doar după succes).
 * Un bundle nou șterge întâi toate celelalte bundle-*; unul picat se șterge.
 * @param {{radacina: string, sablon: {dir: string, sha256: string}, cai: {build: string, cache: string}, versiuni: object, ruleaza?: Function}} p
 * @returns {Promise<{ok: boolean, dir: string, refolosit: boolean, stderr: string}>}
 */
export async function asiguraBundle({ radacina, sablon, cai, versiuni, ruleaza = ruleazaRemotion }) {
  const cheie = cheieBundle({ sablon, dirBuild: cai.build, versiuni });
  const dir = join(cai.cache, `bundle-${cheie}`);
  if (existaFisier(join(dir, '.gata'))) return { ok: true, dir, refolosit: true, stderr: '' };
  mkdirSync(cai.cache, { recursive: true });
  for (const nume of readdirSync(cai.cache)) {
    if (nume.startsWith('bundle-')) stergeRecursiv(join(cai.cache, nume));
  }
  const r = await ruleaza(
    ['bundle', join(sablon.dir, 'src', 'index.ts'), `--out-dir=${dir}`, `--public-dir=${cai.build}`, '--log=error'],
    { radacina },
  );
  if (r.cod !== 0 || !existaFisier(join(dir, 'index.html'))) {
    stergeRecursiv(dir);
    return { ok: false, dir, refolosit: false, stderr: r.stderr || r.stdout || `cod ${r.cod}, fără index.html` };
  }
  scrieTextAtomic(join(dir, '.gata'), `${cheie}\n`);
  return { ok: true, dir, refolosit: false, stderr: '' };
}

/**
 * @param {string} stdout ieșirea lui `remotion compositions` (fără --log)
 * @returns {Array<{id: string, fps: number, latime: number, inaltime: number, cadre: number}>}
 */
export function parseazaCompozitii(stdout) {
  return String(stdout ?? '').replace(ANSI, '').split(/\r?\n/)
    .map((rand) => RAND_COMPOZITIE.exec(rand.trim()))
    .filter(Boolean)
    .map((m) => ({ id: m[1], fps: Number(m[2]), latime: Number(m[3]), inaltime: Number(m[4]), cadre: Number(m[5]) }));
}

/**
 * Argumentele lui `remotion render` (decizia 7): bt709 ca yuv420p să nu iasă yuvj420p; scala doar la schiță.
 * @param {{bundle: string, compozitie: string, iesire: string, props: string, scala?: number|null, concurenta?: string|number}} p
 * @returns {string[]}
 */
export function argumenteRandareRemotion({ bundle, compozitie, iesire, props, scala = null, concurenta = '50%' }) {
  return [
    'render', bundle, compozitie, iesire, `--props=${props}`,
    '--codec=h264', '--pixel-format=yuv420p', '--color-space=bt709', `--concurrency=${concurenta}`,
    ...(scala === null ? [] : [`--scale=${scala}`]),
    '--log=error',
  ];
}

// props.json e relativ la folderul ieșirii: build/ la un singur MP4, build/<id>/ la o serie (felia 3)
const caleProps = (cai, construit, dirIesire = null) => join(dirIesire ?? cai.build, ...construit.motor.props.split('/'));

async function verificaC10({ radacina, cai, sablon, construit, cronologie, versiuni, ruleaza, dirIesire }) {
  const asteptata = versiuni.motoare.remotion.versiune;
  const versiune = versiuneRemotion(radacina);
  if (versiune === null) throw motorLipsa('lipsește node_modules/remotion/package.json');
  const prag = {
    versiune: asteptata,
    compozitie: construit.motor.compozitie,
    latime: cronologie.latime,
    inaltime: cronologie.inaltime,
    fps: cronologie.fps,
    cadre: Math.round(cronologie.durata * cronologie.fps),
    adrese: 0,
  };
  const erori = [];
  let bundle = null;
  let gasita = null;
  if (versiune !== asteptata) {
    erori.push(eroare('motor-versiune', CAMP,
      `Remotion instalat în motoare/remotion are versiunea ${versiune}, dar kitul fixează ${asteptata}.`,
      'Rulează node nucleu/mg.mjs doctor; reinstalează motorul fixat din VERSIUNI.json.'));
  } else {
    const b = await asiguraBundle({ radacina, sablon, cai, versiuni, ruleaza });
    if (!b.ok) {
      erori.push(eroare('bundle-esuat', CAMP, `remotion bundle a eșuat pe compoziția șablonului ${sablon.nume}: ${eroareaRemotion(b.stderr)}`, SUGESTIE_SABLON));
    } else {
      bundle = b.dir;
      // fără --log: cu --log=error, compositions nu mai scrie lista pe stdout (4.0.529)
      const r = await ruleaza(['compositions', b.dir, `--props=${caleProps(cai, construit, dirIesire)}`], { radacina });
      if (r.cod !== 0) {
        erori.push(eroare('compozitie-invalida', CAMP, `remotion compositions a ieșit cu codul ${r.cod}: ${eroareaRemotion(r.stderr || r.stdout)}`, SUGESTIE_SABLON));
      } else {
        const lista = parseazaCompozitii(r.stdout);
        gasita = lista.find((c) => c.id === prag.compozitie) ?? null;
        if (gasita === null) {
          erori.push(eroare('compozitie-invalida', CAMP,
            `Bundle-ul nu are compoziția ${prag.compozitie} (găsite: ${lista.map((c) => c.id).join(', ') || 'niciuna'}).`, SUGESTIE_SABLON));
        } else {
          const diferente = ['latime', 'inaltime', 'fps', 'cadre'].filter((k) => gasita[k] !== prag[k]).map((k) => `${k} ${gasita[k]} în loc de ${prag[k]}`);
          if (diferente.length > 0) {
            erori.push(eroare('compozitie-invalida', CAMP,
              `Compoziția ${prag.compozitie} nu se potrivește cu cronologia: ${diferente.join(', ')}.`, SUGESTIE_SABLON));
          }
        }
      }
    }
  }
  const retea = scaneazaRetea(cai.build, versiuni);
  erori.push(...retea.erori);
  return rezultat('C10', erori.length === 0, {
    valoare: { versiune, bundle: bundle === null ? null : basename(bundle), compozitie: gasita, fisiere: retea.fisiere },
    prag,
    camp: erori[0]?.camp ?? null,
    erori,
  });
}

/** Toate valorile șir dintr-un JSON, cu spațiile comprimate. */
function valoriSir(valoare, gasite = new Set()) {
  if (typeof valoare === 'string') gasite.add(spatii(valoare));
  else if (Array.isArray(valoare)) for (const v of valoare) valoriSir(v, gasite);
  else if (valoare !== null && typeof valoare === 'object') for (const v of Object.values(valoare)) valoriSir(v, gasite);
  return gasite;
}

function verificaC17({ cai, construit, asteptari, dirIesire }) {
  const relativ = dirIesire ? `${basename(dirIesire)}/${construit.motor.props}` : construit.motor.props;
  const camp = `fisier:build/${relativ}`;
  let valori;
  try {
    valori = valoriSir(JSON.parse(readFileSync(caleProps(cai, construit, dirIesire), 'utf8')));
  } catch (e) {
    return rezultat('C17', false, {
      valoare: { texte: asteptari.texte.length, lipsa: asteptari.texte.length },
      prag: { lipsa: 0 },
      camp,
      erori: [eroare('text-lipsa-din-build', camp, `build/${relativ} nu se poate citi ca JSON (${e.message}).`, SUGESTIE_SABLON)],
    });
  }
  const erori = [];
  for (const { ref, text } of asteptari.texte) {
    if (valori.has(spatii(text))) continue;
    erori.push(eroare('text-lipsa-din-build', camp, `${ref}: textul „${text}” nu apare ca valoare în build/${relativ}.`, SUGESTIE_SABLON));
  }
  return rezultat('C17', erori.length === 0, {
    valoare: { texte: asteptari.texte.length, lipsa: erori.length },
    prag: { lipsa: 0 },
    camp: erori[0]?.camp ?? null,
    erori,
  });
}

/**
 * Taie MP4-ul la durata cronologiei, fără recodare. Remotion scoate pista audio puțin mai lungă decât videoul
 * (22,4427 s la 22,4 s), iar containerul ia durata celei mai lungi piste, deci C11 ar pica. Fișierul tăiat se
 * scrie lângă, apoi se mută peste `iesire`; la eșec temporarul se șterge și `iesire` rămâne neatins.
 * @param {string} iesire
 * @param {number} durata secunde (cronologie.durata)
 * @param {{ffmpeg: string}} ff
 * @returns {Promise<{ok: boolean, stderr: string}>}
 */
export async function taieLaDurata(iesire, durata, ff, executa = ruleazaFfmpeg) {
  const temporar = `${iesire}.taiat.mp4`;
  const r = await executa(['-y', '-v', 'error', '-i', iesire, '-map', '0', '-c', 'copy', '-t', String(durata), temporar], { ffmpeg: ff.ffmpeg });
  if (r.cod !== 0 || !existaFisier(temporar)) {
    stergeRecursiv(temporar);
    return { ok: false, stderr: ultimeleRanduri(r.stderr) };
  }
  mutaFisier(temporar, iesire);
  return { ok: true, stderr: '' };
}

/**
 * @param {{ruleaza?: (argumente: string[], optiuni: {radacina: string}) => Promise<{cod: number, stdout: string, stderr: string}>, taie?: Function}} [p]
 *   ruleaza și taie: doar pentru teste (implicit ruleazaRemotion și taieLaDurata)
 */
export function creeazaAdaptorRemotion({ ruleaza = ruleazaRemotion, taie = taieLaDurata } = {}) {
  const adaptor = Object.freeze({
    nume: 'remotion',
    eticheta: 'Remotion',
    camp: CAMP,
    descriereReluare: '--concurrency=1',

    /** C10 (versiunea, bundle-ul, compoziția, rețeaua) și C17 (textele ca valori în props.json). */
    async verificaBuild({ radacina, cai, sablon, construit, cronologie, asteptari, versiuni, dirIesire = null }) {
      return [
        await verificaC10({ radacina, cai, sablon, construit, cronologie, versiuni, ruleaza, dirIesire }),
        verificaC17({ cai, construit, asteptari, dirIesire }),
      ];
    },

    /**
     * Schița (decizia 8): o randare la jumătate de rezoluție în cadre/schita-N/schita.mp4, fără reluare, apoi foaia
     * schiței din ea, la mijlocul fiecărui segment. Remotion n-are check la tranziții, deci check e null.
     */
    async schita({ radacina, proiect, cai, sablon, construit, dirInstantanee, momente, iesireJpg, iesireJson, ff }) {
      const mp4 = await adaptor.schitaMp4({ radacina, proiect, cai, sablon, construit, iesire: join(dirInstantanee, 'schita.mp4') });
      const { celule } = await genereazaFoaie({ mp4, momente, iesireJpg, iesireJson, ff, proiect });
      return { check: null, celule };
    },

    /**
     * MP4-ul schiței, la jumătate de rezoluție, fără reluare (decizia 8). La o serie (felia 3), câte unul pe ieșire,
     * cu props-urile din dirIesire; foaia o face apelantul.
     */
    async schitaMp4({ radacina, proiect, cai, sablon, construit, iesire, dirIesire = null }) {
      const reluare = `Rulează din nou node nucleu/mg.mjs randeaza ${proiect} --schita; dacă eroarea se repetă, rulează node nucleu/mg.mjs doctor.`;
      const bundle = await asiguraBundle({ radacina, sablon, cai, versiuni: citesteVersiuni(radacina), ruleaza });
      if (!bundle.ok) throw new EroareFatala(eroare('motor-esuat', CAMP, `Bundle-ul schiței a eșuat: ${eroareaRemotion(bundle.stderr)}`, reluare), COD_IESIRE.MEDIU);
      mkdirSync(dirname(iesire), { recursive: true });
      const r = await ruleaza(argumenteRandareRemotion({
        bundle: bundle.dir, compozitie: construit.motor.compozitie, iesire, props: caleProps(cai, construit, dirIesire), scala: 0.5,
      }), { radacina });
      if (r.cod !== 0 || !existaFisier(iesire)) {
        throw new EroareFatala(eroare('motor-esuat', CAMP, `Randarea schiței a eșuat: ${eroareaRemotion(r.stderr)}`, reluare), COD_IESIRE.MEDIU);
      }
      return iesire;
    },

    /**
     * Randarea completă în `iesire` (decizia 7): concurența 50%, apoi o singură reluare cu --concurrency=1.
     * Cu muzică, MP4-ul reușit se taie la durata cronologiei (taieLaDurata).
     */
    async randeaza({ radacina, proiect, cai, sablon, construit, cronologie, iesire, ff, dirIesire = null }) {
      const bundle = await asiguraBundle({ radacina, sablon, cai, versiuni: citesteVersiuni(radacina), ruleaza });
      if (!bundle.ok) {
        throw new EroareFatala(eroare('motor-esuat', CAMP, `Bundle-ul randării a eșuat: ${eroareaRemotion(bundle.stderr)}`,
          `Rulează din nou node nucleu/mg.mjs randeaza ${proiect}; dacă eroarea se repetă, rulează node nucleu/mg.mjs doctor.`), COD_IESIRE.MEDIU);
      }
      const baza = { bundle: bundle.dir, compozitie: construit.motor.compozitie, iesire, props: caleProps(cai, construit, dirIesire) };
      let r = await ruleaza(argumenteRandareRemotion(baza), { radacina });
      let reluat = false;
      if (r.cod !== 0 || !existaFisier(iesire)) {
        reluat = true;
        stergeRecursiv(iesire);
        // echivalentul lui --low-memory-mode: un singur tab de Chrome
        r = await ruleaza(argumenteRandareRemotion({ ...baza, concurenta: 1 }), { radacina });
      }
      if (r.cod !== 0 || !existaFisier(iesire)) return { ok: false, reluat, stderr: eroareaRemotion(r.stderr) };
      if (cronologie.audio !== null) {
        const taiere = await taie(iesire, cronologie.durata, ff);
        if (!taiere.ok) return { ok: false, reluat, etapa: 'taiere', stderr: `Tăierea pistei audio la durata videoului a eșuat: ${taiere.stderr}` };
      }
      return { ok: true, reluat, stderr: '' };
    },

    /** Bundle-ul rămâne în video/<p>/.cache după randare: următoarea rulare cu aceleași fișiere îl refolosește (decizia 4). */
    curata() {},
  });
  return adaptor;
}

export const adaptorRemotion = creeazaAdaptorRemotion();
