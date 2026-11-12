// Ajutor comun pentru testele de integrare care rulează motorul real (P3-7): o rădăcină temporară cu kitul,
// fără node_modules, în care node_modules și unelte/ffmpeg sunt legate ca junction spre repo.
import fs from 'node:fs';
import path from 'node:path';
import { radacinaAgent } from '../../nucleu/lib/cai.mjs';
import { creeazaRadacinaTemp } from './radacina-temp.mjs';

const REPO = radacinaAgent(import.meta.url, 2);

/**
 * Scrie în rădăcină un înveliș al binarului HyperFrames real, care pică la `render`:
 * mereu ('toate-esueaza') sau doar când lipsește --low-memory-mode ('prima-esueaza');
 * cu 'mp4-stricat', `render` iese cu 0 și scrie la -o un fișier care nu e MP4.
 * Mesajul de eroare conține și „EBUSY”, ca testele să dovedească că randarea nu se reîncearcă singură.
 * Fiecare `render` se scrie în jurnal-randari.jsonl (argumentele, o linie JSON).
 * @returns {string} calea jurnalului
 */
function scrieInvelis(radacina, mod) {
  const dirReal = path.join(REPO, 'motoare', 'hyperframes', 'node_modules', 'hyperframes');
  const pachet = JSON.parse(fs.readFileSync(path.join(dirReal, 'package.json'), 'utf8'));
  const binReal = path.join(dirReal, typeof pachet.bin === 'string' ? pachet.bin : pachet.bin.hyperframes);
  const jurnal = path.join(radacina, 'jurnal-randari.jsonl');
  const dirPachet = path.join(radacina, 'motoare', 'hyperframes', 'node_modules', 'hyperframes');
  fs.mkdirSync(path.join(dirPachet, 'bin'), { recursive: true });
  fs.writeFileSync(
    path.join(dirPachet, 'package.json'),
    JSON.stringify({ name: 'hyperframes', version: pachet.version, type: 'module', bin: { hyperframes: 'bin/hf-test.mjs' } }, null, 2) + '\n',
  );
  fs.writeFileSync(
    path.join(dirPachet, 'bin', 'hf-test.mjs'),
    [
      "import fs from 'node:fs';",
      "import { pathToFileURL } from 'node:url';",
      `const REAL = ${JSON.stringify(binReal)};`,
      `const JURNAL = ${JSON.stringify(jurnal)};`,
      `const MOD = ${JSON.stringify(mod)};`,
      'const argumente = process.argv.slice(2);',
      "if (argumente[0] === 'render') {",
      "  fs.appendFileSync(JURNAL, JSON.stringify(argumente) + '\\n');",
      "  if (MOD === 'mp4-stricat') {",
      "    fs.writeFileSync(argumente[argumente.indexOf('-o') + 1], 'asta nu e un MP4');",
      '    process.exit(0);',
      '  }',
      "  if (MOD === 'toate-esueaza' || !argumente.includes('--low-memory-mode')) {",
      "    process.stderr.write('Error: crash Chrome simulat de test (EBUSY simulat)\\n');",
      '    process.exit(1);',
      '  }',
      '}',
      'await import(pathToFileURL(REAL).href);',
      '',
    ].join('\n'),
  );
  return jurnal;
}

/**
 * Leagă ca junction (fără drepturi de administrator pe Windows) căile relative date din repo în rădăcină;
 * cele care lipsesc în repo se sar. `scoateLegaturile` le scoate: se cheamă ÎNAINTE de ștergerea recursivă
 * a rădăcinii, ca să nu ajungă în node_modules din repo (nodejs/node #56049).
 * @param {string} radacina
 * @param {string[]} cai căi relative la repo
 * @returns {{legaturi: string[], scoateLegaturile: () => void}}
 */
export function legaDinRepo(radacina, cai) {
  const legaturi = [];
  for (const rel of cai) {
    const sursa = path.join(REPO, rel);
    if (!fs.existsSync(sursa)) continue;
    const tinta = path.join(radacina, rel);
    fs.mkdirSync(path.dirname(tinta), { recursive: true });
    fs.symlinkSync(sursa, tinta, 'junction');
    legaturi.push(tinta);
  }
  const scoateLegaturile = () => {
    for (const l of legaturi.splice(0)) {
      try {
        fs.unlinkSync(l);
      } catch {
        fs.rmdirSync(l);
      }
    }
  };
  return { legaturi, scoateLegaturile };
}

/**
 * Rădăcină temporară (cu spațiu și diacritice) cu kitul fără node_modules; node_modules și unelte/ffmpeg
 * sunt legate ca junction spre repo (fără drepturi de administrator pe Windows), ca să nu copiem ~500 MB la fiecare test.
 * Cu `invelis`, motoare/hyperframes/node_modules e un folder real cu învelișul în locul legăturii.
 * Cu `remotion: true` (planul I), rădăcina primește și motoare/remotion (package.json, package-lock.json, sabloane/ dacă
 * există deja în repo), iar motoare/remotion/node_modules e legat ca junction spre repo, ca browserul lui Remotion să fie
 * descărcat o singură dată, în repo.
 * @param {{invelis?: null|'prima-esueaza'|'toate-esueaza'|'mp4-stricat', remotion?: boolean}} [optiuni]
 * @returns {{radacina: string, jurnal: string|null, curata: () => void}}
 */
export function radacinaCuMotoare({ invelis = null, remotion = false } = {}) {
  const deRemotion = remotion
    ? ['motoare/remotion/package.json', 'motoare/remotion/package-lock.json', 'motoare/remotion/sabloane'].filter((rel) => fs.existsSync(path.join(REPO, rel)))
    : [];
  const { radacina, curata } = creeazaRadacinaTemp({
    copiaza: [
      'nucleu/lib',
      'nucleu/mg.mjs',
      'nucleu/garda.mjs',
      'nucleu/VERSIUNI.json',
      'nucleu/package.json',
      'motoare/comun',
      'motoare/hyperframes/comun',
      'motoare/hyperframes/sabloane',
      'motoare/hyperframes/package.json',
      ...deRemotion,
    ],
    biblioteciMini: true,
  });
  const deLegat = ['nucleu/node_modules', 'unelte/ffmpeg'];
  if (!invelis) deLegat.push('motoare/hyperframes/node_modules');
  if (remotion) deLegat.push('motoare/remotion/node_modules');
  const { scoateLegaturile } = legaDinRepo(radacina, deLegat);
  const jurnal = invelis ? scrieInvelis(radacina, invelis) : null;
  return {
    radacina,
    jurnal,
    curata() {
      scoateLegaturile();
      curata();
    },
  };
}
