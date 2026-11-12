#!/usr/bin/env node
/**
 * Simulatorul lui hyperframes pentru testele unitare (harta 8.3).
 * Pornit exact ca binarul real: execFile(process.execPath, [acest-fișier, ...argumente]).
 * MG_FALS_JURNAL: fișier JSON lines; fiecare rulare adaugă {argv, env}.
 * MG_FALS_MOD: ok | ebusy-o-data | esec | versiune | lung (stă 30 s, pentru termenul depășit).
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const jurnal = process.env.MG_FALS_JURNAL;
const mod = process.env.MG_FALS_MOD || 'ok';
const PASTRATE = ['DO_NOT_TRACK', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'HYPERFRAMES_API_KEY'];

const env = {};
for (const [cheie, valoare] of Object.entries(process.env)) {
  const mare = cheie.toUpperCase();
  if (mare.startsWith('HYPERFRAMES_') || PASTRATE.includes(mare)) env[mare] = valoare;
}
if (jurnal) appendFileSync(jurnal, `${JSON.stringify({ argv: process.argv.slice(1), env })}\n`);

const argumente = process.argv.slice(2);

if (mod === 'lung') {
  await new Promise((gata) => { setTimeout(gata, 30000); });
  process.exit(0);
}
if (mod === 'esec') {
  process.stderr.write('Error: eșec simulat\n');
  process.exit(1);
}
if (mod === 'ebusy-o-data') {
  const stare = `${jurnal}.stare`;
  if (!existsSync(stare)) {
    writeFileSync(stare, '1');
    process.stderr.write("Error: EBUSY: resource busy or locked, open 'C:\\agent-motion\\build\\frame-00001.png'\n");
    process.exit(1);
  }
}
if (mod === 'versiune' || argumente[0] === '--version') {
  process.stdout.write('0.8.96\n');
  process.exit(0);
}
if (argumente[0] === 'check' && argumente.includes('--json')) {
  process.stdout.write(readFileSync(new URL('../hyperframes/check-ok.json', import.meta.url), 'utf8'));
  process.exit(0);
}
process.exit(0);
