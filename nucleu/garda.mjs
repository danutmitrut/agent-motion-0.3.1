// Punctul de intrare al celor 5 hook-uri din .claude/settings.json. Doar module native.
// Citește JSON-ul de pe stdin (cel mult 5 s), îl dă lui proceseazaHook și scrie răspunsul.
import { proceseazaHook } from './lib/garda/index.mjs';
import { refuza } from './lib/garda/raspuns.mjs';
import { radacinaAgent } from './lib/cai.mjs';

const TIMEOUT_STDIN_MS = 5000;

/** @param {number} timeoutMs @returns {Promise<string>} */
function citesteStdin(timeoutMs) {
  return new Promise((rezolva) => {
    const bucati = [];
    let gata = false;
    const termina = () => {
      if (gata) return;
      gata = true;
      clearTimeout(ceas);
      process.stdin.removeAllListeners('data');
      process.stdin.destroy();
      rezolva(Buffer.concat(bucati).toString('utf8'));
    };
    const ceas = setTimeout(termina, timeoutMs);
    process.stdin.on('data', (b) => bucati.push(Buffer.isBuffer(b) ? b : Buffer.from(b)));
    process.stdin.on('end', termina);
    process.stdin.on('error', termina);
  });
}

async function porneste() {
  const radacina = process.env.CLAUDE_PROJECT_DIR || radacinaAgent(import.meta.url, 1);
  const text = await citesteStdin(TIMEOUT_STDIN_MS);
  const r = await proceseazaHook(text, { radacina, env: process.env, acum: new Date() });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(`${r.stderr}\n`);
  process.exitCode = r.cod;
}

porneste().catch((e) => {
  const motiv = 'Garda a întâlnit o eroare internă; din siguranță, refuz.';
  process.stdout.write(refuza(motiv));
  process.stderr.write(`${motiv}\n${e && e.stack ? e.stack : String(e)}\n`);
  process.exitCode = 2;
});
