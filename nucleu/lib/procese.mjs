/**
 * Procesele copil pornite de mg (ffmpeg, ffprobe, hyperframes): nu rămân în urmă când mg se oprește.
 *
 * Fiecare copil se înregistrează aici cât rulează. La ieșirea lui node (terminare normală, process.exit,
 * excepție neprinsă) și la SIGINT, SIGTERM sau SIGHUP, toți copiii încă vii se opresc: pe Windows cu tot
 * arborele lor (taskkill /T /F, ca în motor-hf.mjs); pe macOS și Linux întâi cu SIGTERM și, dacă după
 * TERMEN_OPRIRE_MS mai trăiesc, cu SIGKILL. SIGTERM întâi contează pentru hyperframes: puppeteer pornește
 * Chrome detașat (alt grup de procese) și îl închide doar din handler-ele lui de semnal și de ieșire, pe care
 * un SIGKILL le-ar sări, lăsând Chrome orfan. ffmpeg iese curat pe SIGTERM.
 * Limită: un SIGKILL trimis lui node nu poate fi prins; atunci copilul care scrie într-un pipe se oprește
 * la prima scriere (EPIPE), iar cel care scrie într-un fișier merge până la capăt.
 */
import { execFile, execFileSync } from 'node:child_process';

/** Cât așteaptă mg după SIGTERM înainte de SIGKILL (macOS, Linux). Puppeteer închide Chrome în sub o secundă. */
export const TERMEN_OPRIRE_MS = 3000;

const vii = new Set();
let iesirePusa = false;
let semnalePuse = false;
let seOpreste = false;
// SIGHUP nu se poate retrimite pe Windows (process.kill aruncă ENOSYS), deci acolo ascultăm doar SIGINT și SIGTERM
const SEMNALE = process.platform === 'win32' ? ['SIGINT', 'SIGTERM'] : ['SIGINT', 'SIGTERM', 'SIGHUP'];
const CODURI_SEMNAL = { SIGHUP: 1, SIGINT: 2, SIGTERM: 15 };

/** Argumentele lui taskkill care opresc procesul și tot arborele lui (de exemplu Chrome pornit de hyperframes). */
export function argumenteTaskkill(pid) {
  return ['/T', '/F', '/PID', String(pid)];
}

function inViata(copil) {
  return copil.exitCode === null && copil.signalCode === null && typeof copil.pid === 'number';
}

function trimite(copil, semnal) {
  try {
    copil.kill(semnal);
  } catch {
    /* procesul s-a oprit între timp */
  }
}

/**
 * Un pid mai rulează? Fără bucla de evenimente (la ieșirea lui node), un copil oprit dar necules apare încă
 * în tabela de procese, ca zombi; ps îl arată cu starea Z, deci îl socotim oprit.
 */
function ruleazaPid(pid) {
  try {
    process.kill(pid, 0);
  } catch (e) {
    return e.code === 'EPERM';
  }
  try {
    const stare = execFileSync('ps', ['-o', 'stat=', '-p', String(pid)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return stare !== '' && !stare.startsWith('Z');
  } catch {
    return false;
  }
}

/** Pauză sincronă (doar la ieșirea lui node, când nu mai rulează nimic altceva). */
function dormi(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function taskkill(copil, sincron) {
  try {
    if (sincron) {
      execFileSync('taskkill', argumenteTaskkill(copil.pid), { windowsHide: true, stdio: 'ignore' });
    } else {
      execFile('taskkill', argumenteTaskkill(copil.pid), { windowsHide: true }, (err) => {
        if (err) trimite(copil);
      });
    }
  } catch {
    trimite(copil);
  }
}

/**
 * Oprește un copil și, pe Windows, tot arborele lui. Nu aruncă. Pe macOS și Linux: SIGTERM, apoi SIGKILL
 * după termenMs dacă procesul încă rulează (cu sincron, așteptarea blochează; altfel e un ceas care nu ține
 * node în viață).
 * @param {import('node:child_process').ChildProcess} copil
 * @param {{sincron?: boolean, platforma?: string, termenMs?: number}} [o]
 */
export function opresteArbore(copil, { sincron = false, platforma = process.platform, termenMs = TERMEN_OPRIRE_MS } = {}) {
  if (!inViata(copil)) return;
  if (platforma === 'win32') {
    taskkill(copil, sincron);
    return;
  }
  trimite(copil, 'SIGTERM');
  if (sincron) {
    const capat = Date.now() + termenMs;
    while (Date.now() < capat && ruleazaPid(copil.pid)) dormi(25);
    if (ruleazaPid(copil.pid)) trimite(copil, 'SIGKILL');
    return;
  }
  const ceas = setTimeout(() => {
    if (inViata(copil)) trimite(copil, 'SIGKILL');
  }, termenMs);
  ceas.unref();
  copil.once('exit', () => clearTimeout(ceas));
}

/**
 * Oprește toți copiii încă vii, sincron (la ieșirea lui node): SIGTERM tuturor deodată, o singură așteptare
 * de cel mult TERMEN_OPRIRE_MS, apoi SIGKILL celor rămași. Pe Windows, taskkill pe fiecare arbore.
 */
export function opresteToti({ platforma = process.platform, termenMs = TERMEN_OPRIRE_MS } = {}) {
  const copii = [...vii].filter(inViata);
  vii.clear();
  if (platforma === 'win32') {
    for (const c of copii) taskkill(c, true);
    return;
  }
  for (const c of copii) trimite(c, 'SIGTERM');
  const capat = Date.now() + termenMs;
  while (Date.now() < capat && copii.some((c) => ruleazaPid(c.pid))) dormi(25);
  for (const c of copii) if (ruleazaPid(c.pid)) trimite(c, 'SIGKILL');
}

/** La semnal: copiii primesc SIGTERM, apoi SIGKILL după termen; bucla de evenimente rulează între timp. */
async function opresteTotiAsincron(termenMs = TERMEN_OPRIRE_MS) {
  const copii = [...vii].filter(inViata);
  vii.clear();
  if (process.platform === 'win32') {
    for (const c of copii) taskkill(c, true);
    return;
  }
  const iesiri = copii.map((c) => new Promise((r) => {
    if (!inViata(c)) r();
    else c.once('exit', r);
  }));
  for (const c of copii) trimite(c, 'SIGTERM');
  let ceas;
  await Promise.race([Promise.all(iesiri), new Promise((r) => { ceas = setTimeout(r, termenMs); })]);
  clearTimeout(ceas);
  for (const c of copii) if (inViata(c)) trimite(c, 'SIGKILL');
}

function scoateSemnalele() {
  for (const s of SEMNALE) process.removeListener(s, ascultatori[s]);
  semnalePuse = false;
}

async function laSemnal(semnal) {
  // un al doilea Ctrl+C în timpul opririi nu mai pornește încă o oprire
  if (seOpreste) return;
  seOpreste = true;
  try {
    await opresteTotiAsincron();
  } finally {
    seOpreste = false;
    scoateSemnalele();
    // fără alți ascultători, semnalul își face efectul implicit: node se oprește cu codul lui
    if (process.listenerCount(semnal) === 0) {
      if (process.platform === 'win32') process.exit(128 + CODURI_SEMNAL[semnal]);
      process.kill(process.pid, semnal);
    }
  }
}

const ascultatori = Object.fromEntries(SEMNALE.map((s) => [s, () => { laSemnal(s); }]));

function puneAscultatori() {
  if (!iesirePusa) {
    iesirePusa = true;
    process.on('exit', () => opresteToti());
  }
  if (!semnalePuse) {
    semnalePuse = true;
    for (const s of SEMNALE) process.on(s, ascultatori[s]);
  }
}

/**
 * Ține evidența unui copil până se oprește; la oprirea lui mg, copilul se oprește și el.
 * @template {import('node:child_process').ChildProcess} T
 * @param {T} copil
 * @returns {T}
 */
export function inregistreaza(copil) {
  if (!copil || typeof copil.pid !== 'number') return copil;
  puneAscultatori();
  vii.add(copil);
  copil.once('exit', () => vii.delete(copil));
  copil.once('error', () => vii.delete(copil));
  return copil;
}

/** Câți copii sunt încă în evidență (pentru teste). */
export function copiiVii() {
  return [...vii].filter(inViata).length;
}
