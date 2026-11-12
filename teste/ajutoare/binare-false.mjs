/** Căile simulatoarelor pentru testele unitare (harta 8.2, 8.3). */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Calea absolută spre teste/fixtures/binare/hyperframes-fals.mjs. */
export const HYPERFRAMES_FALS = fileURLToPath(new URL('../fixtures/binare/hyperframes-fals.mjs', import.meta.url));

/**
 * Citește jurnalul simulatorului din `<dir>/jurnal-fals.jsonl`
 * (testele pun MG_FALS_JURNAL = join(dir, 'jurnal-fals.jsonl')).
 * @param {string} dir
 * @returns {Array<{argv: string[], env: Record<string, string>}>}
 */
export function citesteJurnalFals(dir) {
  const cale = join(dir, 'jurnal-fals.jsonl');
  if (!existsSync(cale)) return [];
  return readFileSync(cale, 'utf8').split('\n').filter(Boolean).map((rand) => JSON.parse(rand));
}

/**
 * Pune simulatorul ca binar HyperFrames al rădăcinii: motoare/hyperframes/node_modules/hyperframes/{package.json, bin/hf.mjs},
 * unde bin/hf.mjs doar importă hyperframes-fals.mjs (care citește process.argv.slice(2)). VERSIUNI.json al rădăcinii
 * rămâne cel copiat, iar simulatorul răspunde la check cu teste/fixtures/hyperframes/check-ok.json (versiunea 0.8.96).
 * @param {string} radacina
 */
export function instaleazaHyperframesFals(radacina) {
  const dir = join(radacina, 'motoare', 'hyperframes', 'node_modules', 'hyperframes');
  mkdirSync(join(dir, 'bin'), { recursive: true });
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: 'hyperframes', version: '0.8.96', type: 'module', bin: { hyperframes: 'bin/hf.mjs' } }, null, 2)}\n`);
  writeFileSync(join(dir, 'bin', 'hf.mjs'), `await import(${JSON.stringify(pathToFileURL(HYPERFRAMES_FALS).href)});\n`);
}
