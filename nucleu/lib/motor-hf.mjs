/**
 * Lansarea HyperFrames 0.8.96 (spec 6.10, 9.4): fără npx, fără shell,
 * cu punctul de intrare din câmpul bin al pachetului instalat și cu mediul fixat.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as asteapta } from 'node:timers/promises';
import { COD_IESIRE, EroareFatala, eroare } from './erori.mjs';
import { rezolvaFfmpeg, ultimeleRanduri } from './ffmpeg.mjs';
import { executaNode, mediuFaraChei } from './motoare/lansare.mjs';
import { argumenteTaskkill } from './procese.mjs';

const CHEI_SCOASE = ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'HYPERFRAMES_API_KEY'];

function motorLipsa(detaliu) {
  return new EroareFatala(eroare('motor-lipsa', 'mediu.hyperframes',
    `HyperFrames nu e instalat în motoare/hyperframes (${detaliu}).`,
    'Rulează node nucleu/mg.mjs doctor, care instalează motorul.'), COD_IESIRE.MEDIU);
}

function motorEsuat(mesaj) {
  return new EroareFatala(eroare('motor-esuat', 'mediu.hyperframes', mesaj,
    'Rulează node nucleu/mg.mjs doctor; dacă eroarea rămâne, trimite mesajul lui Dănuț.'), COD_IESIRE.MEDIU);
}

/**
 * @param {string} radacina
 * @returns {string} calea absolută a lui bin/hyperframes.mjs
 */
export function rezolvaBinHyperframes(radacina) {
  const pachet = join(radacina, 'motoare', 'hyperframes', 'node_modules', 'hyperframes', 'package.json');
  if (!existsSync(pachet)) throw motorLipsa('lipsește node_modules/hyperframes');
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pachet, 'utf8'));
  } catch {
    throw motorLipsa('package.json al pachetului nu se poate citi');
  }
  const relativ = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.hyperframes;
  if (typeof relativ !== 'string' || relativ === '') throw motorLipsa('package.json nu are câmpul bin');
  const cale = resolve(dirname(pachet), relativ);
  if (!existsSync(cale)) throw motorLipsa(`lipsește ${relativ}`);
  return cale;
}

/**
 * Copiază mediul de bază, scoate cheile API (indiferent de majuscule, pentru Windows)
 * și fixează cele 6 variabile cerute de spec.
 * @param {NodeJS.ProcessEnv} baza
 * @param {{ffmpeg: string, ffprobe: string}} ff
 * @returns {NodeJS.ProcessEnv}
 */
export function mediuHyperframes(baza, ff) {
  const fixate = {
    HYPERFRAMES_NO_TELEMETRY: '1',
    DO_NOT_TRACK: '1',
    HYPERFRAMES_NO_UPDATE_CHECK: '1',
    HYPERFRAMES_NO_AUTO_INSTALL: '1',
    HYPERFRAMES_FFMPEG_PATH: ff.ffmpeg,
    HYPERFRAMES_FFPROBE_PATH: ff.ffprobe,
  };
  return mediuFaraChei(baza, CHEI_SCOASE, fixate);
}

// argumenteTaskkill trăiește în procese.mjs (o folosește și oprirea copiilor la ieșirea lui mg); aici rămâne exportată.
export { argumenteTaskkill };

/**
 * @param {string[]} argumente de exemplu ['render', dir, '-o', mp4]
 * @param {{radacina?: string, cwd?: string, bin?: string, ff?: {ffmpeg: string, ffprobe: string}, mediu?: NodeJS.ProcessEnv, timeoutMs?: number, reincercariEbusy?: number, pauzaMs?: number, platforma?: string, opresteArbore?: (copil: import('node:child_process').ChildProcess) => void}} optiuni
 *   platforma și opresteArbore: doar pentru teste (ramura Windows a termenului depășit, simulată pe macOS)
 * @returns {Promise<{cod: number, stdout: string, stderr: string, incercari: number}>}
 */
export async function ruleazaHyperframes(argumente, optiuni = {}) {
  const { radacina, timeoutMs = 900000, reincercariEbusy = 3, pauzaMs = 1000 } = optiuni;
  const bin = optiuni.bin ?? rezolvaBinHyperframes(radacina);
  const ff = optiuni.ff ?? (await rezolvaFfmpeg(radacina));
  const env = mediuHyperframes(optiuni.mediu ?? process.env, ff);
  const cwd = optiuni.cwd ?? radacina;
  const args = [...argumente];
  if (args[0] === 'snapshot' && !args.some((a) => a === '--describe' || a.startsWith('--describe='))) {
    args.push('--describe', 'false');
  }
  let incercari = 0;
  for (;;) {
    incercari += 1;
    const r = await executaNode(bin, args, { cwd, env, timeoutMs, platforma: optiuni.platforma, opresteArbore: optiuni.opresteArbore });
    if (r.cod !== 0 && /EBUSY/.test(r.stderr) && incercari <= reincercariEbusy) {
      await asteapta(pauzaMs * 2 ** (incercari - 1));
      continue;
    }
    return { ...r, incercari };
  }
}

/**
 * Rulează `hyperframes check <dir> --json` și întoarce obiectul brut plus {cod}.
 * check iese cu 1 când găsește erori; asta nu e eșec al motorului, ci rezultat de citit.
 * @param {string} dirCompozitie
 * @param {object} optiuni aceleași ca la ruleazaHyperframes, plus {at?: number[], laTranzitii?: boolean, argumente?: string[]};
 *   argumente sunt cele ale șablonului (motor.check.argumente), validate de valideazaConstruit, adăugate după ale nucleului
 */
export async function checkJson(dirCompozitie, optiuni = {}) {
  const args = ['check', dirCompozitie, '--json'];
  if (optiuni.at?.length) args.push('--at', optiuni.at.join(','));
  const ale = optiuni.argumente ?? [];
  if (optiuni.laTranzitii && !ale.includes('--at-transitions')) args.push('--at-transitions');
  args.push(...ale);
  const r = await ruleazaHyperframes(args, optiuni);
  let rezultat = null;
  try {
    rezultat = JSON.parse(r.stdout);
  } catch {
    rezultat = null;
  }
  if (!rezultat || typeof rezultat !== 'object' || Array.isArray(rezultat)) {
    throw motorEsuat(`hyperframes check nu a întors JSON (cod ${r.cod}): ${ultimeleRanduri(r.stderr)}`);
  }
  return { ...rezultat, cod: r.cod };
}

/**
 * @param {string} radacina
 * @param {object} [optiuni] ca la ruleazaHyperframes (în teste: bin, ff, mediu)
 * @returns {Promise<string>} de exemplu '0.8.96'
 */
export async function versiuneHyperframes(radacina, optiuni = {}) {
  const r = await ruleazaHyperframes(['--version'], { radacina, ...optiuni });
  const prim = r.stdout.trim().split(/\r?\n/)[0] ?? '';
  if (r.cod !== 0 || !/^\d+\.\d+\.\d+/.test(prim)) {
    throw motorEsuat(`hyperframes --version a eșuat (cod ${r.cod}): ${ultimeleRanduri(r.stderr || r.stdout)}`);
  }
  return prim;
}
