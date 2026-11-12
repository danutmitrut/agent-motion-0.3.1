// Motorul Remotion la cerere (planul I, decizia 2): starea instalării, instalarea (npm ci în motoare/remotion, apoi
// Chrome Headless Shell cu `remotion browser ensure`) și semnalul pentru mg doctor. Doar module native: mg nou și
// mg doctor îl încarcă înainte ca pachetele Remotion să existe.
import fs from 'node:fs';
import path from 'node:path';
import { COD_IESIRE, EroareFatala, eroare } from '../erori.mjs';
import { instalareLaZi, ruleazaNpmCi } from '../doctor/npm.mjs';
import { executaNode, mediuFaraChei } from './lansare.mjs';

export const DIR_REMOTION = Object.freeze(['motoare', 'remotion']);
/** Punctul de intrare al CLI-ului, relativ la motoare/remotion (bin-ul `remotion` din @remotion/cli 4.0.529). */
export const CLI_REMOTION = Object.freeze(['node_modules', '@remotion', 'cli', 'remotion-cli.js']);
// Remotion descarcă browserul în <rădăcina Remotion>/node_modules/.remotion/; rădăcina e primul folder cu package.json
// de deasupra folderului curent, deci motoare/remotion (verificat pe 4.0.529, 2026-10-20).
const DIR_BROWSER = Object.freeze(['node_modules', '.remotion', 'chrome-headless-shell']);
// Fără REMOTION_LICENSE_KEY, Remotion nu trimite telemetrie (decizia din Global Constraints).
const CHEI_SCOASE = Object.freeze(['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'HYPERFRAMES_API_KEY', 'REMOTION_LICENSE_KEY']);
// Chrome Headless Shell are ~95 MB; pe o conexiune lentă descărcarea ține minute întregi.
const TERMEN_BROWSER_MS = 900000;

/** @param {string} radacina @returns {string} motoare/remotion, absolut */
export function dirRemotion(radacina) {
  return path.join(radacina, ...DIR_REMOTION);
}

/**
 * Mediul proceselor Remotion: fără cheile API (indiferent de majuscule), cu DO_NOT_TRACK=1.
 * @param {NodeJS.ProcessEnv | undefined} baza
 * @returns {NodeJS.ProcessEnv}
 */
export function mediuRemotion(baza) {
  return mediuFaraChei(baza, CHEI_SCOASE, { DO_NOT_TRACK: '1' });
}

function folderNevid(cale) {
  try {
    return fs.readdirSync(cale).length > 0;
  } catch {
    return false;
  }
}

/**
 * `pachete` lipsește când node_modules nu e la zi față de package-lock.json (instalareLaZi, ca la mg doctor);
 * `browser` lipsește când node_modules/.remotion/chrome-headless-shell/ nu există sau e gol.
 * @param {string} radacina
 * @returns {{instalat: boolean, lipsa: Array<'pachete'|'browser'>}}
 */
export function stareRemotion(radacina) {
  const lipsa = [];
  if (!instalareLaZi(dirRemotion(radacina))) lipsa.push('pachete');
  if (!folderNevid(path.join(dirRemotion(radacina), ...DIR_BROWSER))) lipsa.push('browser');
  return { instalat: lipsa.length === 0, lipsa };
}

/** ruleaza implicit, cu forma lui ctx.ruleaza din mg doctor; comanda e mereu process.execPath. */
function ruleazaImplicit(comanda, argumente, optiuni) {
  return executaNode(argumente[0], argumente.slice(1), optiuni);
}

function ultimeleLinii(text, n = 3) {
  return String(text ?? '').trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(-n).join(' | ') || 'fără mesaj';
}

function esec(detaliu) {
  return new EroareFatala(eroare('remotion-instalare-esuata', 'mediu.remotion',
    `Instalarea motorului Remotion a eșuat: ${detaliu}`,
    'Verifică conexiunea la internet (se descarcă ~340 MB) și închide programele care țin fișiere deschise în folderul agentului, apoi rulează din nou aceeași comandă cu --instaleaza-motorul; dacă se repetă, rulează node nucleu/mg.mjs doctor și trimite-i lui Dănuț raportul.'),
  COD_IESIRE.MEDIU);
}

/**
 * `remotion browser ensure` cu folderul curent motoare/remotion: aduce Chrome Headless Shell dacă lipsește
 * (pe stdout: „Has browser at <cale>”).
 * @param {string} radacina
 * @param {Function} [ruleaza] (comanda, argumente, {cwd, env, timeoutMs}) → {cod, stdout, stderr}
 */
export function browserRemotion(radacina, ruleaza = ruleazaImplicit) {
  const dir = dirRemotion(radacina);
  return ruleaza(process.execPath, [path.join(dir, ...CLI_REMOTION), 'browser', 'ensure'], {
    cwd: dir, env: mediuRemotion(process.env), timeoutMs: TERMEN_BROWSER_MS,
  });
}

/**
 * npm ci în motoare/remotion (sărit dacă e deja la zi), apoi browserul; la final starea trebuie să fie „instalat”.
 * Se cheamă doar după acordul cursantului (mg nou --instaleaza-motorul, I05).
 * @param {string} radacina
 * @param {{ruleaza?: Function, platforma?: string}} [optiuni] ruleaza: doar pentru teste
 * @returns {Promise<{instalat: true, lipsa: []}>}
 */
export async function instaleazaRemotion(radacina, { ruleaza = ruleazaImplicit, platforma = process.platform } = {}) {
  const npm = await ruleazaNpmCi(dirRemotion(radacina), { radacina, platforma, ruleaza });
  if (!npm.ok) throw esec(npm.eroare?.mesaj ?? 'npm ci nu a mers.');
  const browser = await browserRemotion(radacina, ruleaza);
  if (browser.cod !== 0) throw esec(`remotion browser ensure a ieșit cu codul ${browser.cod}: ${ultimeleLinii(browser.stderr || browser.stdout)}`);
  const stare = stareRemotion(radacina);
  if (!stare.instalat) throw esec(`după instalare lipsesc încă: ${stare.lipsa.join(', ')}.`);
  return stare;
}

/**
 * mg doctor ține Remotion la zi doar când e deja instalat (motoare/remotion/node_modules există) sau când un proiect
 * din video/ e făcut pe Remotion (motor.lock cu motor.nume "remotion"); un motor.lock necitibil nu contează.
 * @param {string} radacina
 * @returns {boolean}
 */
export function remotionCerut(radacina) {
  if (fs.existsSync(path.join(dirRemotion(radacina), 'node_modules'))) return true;
  const video = path.join(radacina, 'video');
  let proiecte;
  try {
    proiecte = fs.readdirSync(video, { withFileTypes: true });
  } catch {
    return false;
  }
  return proiecte.some((d) => {
    if (!d.isDirectory()) return false;
    try {
      return JSON.parse(fs.readFileSync(path.join(video, d.name, 'motor.lock'), 'utf8'))?.motor?.nume === 'remotion';
    } catch {
      return false;
    }
  });
}
