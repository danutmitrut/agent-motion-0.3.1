// T9 (revizuirea transversală B01-B13): hyperframes nu pornește cu folderul curent în folderul pe care mg îl șterge
// imediat după (build/ la mg randeaza, folderul de lucru la mg desen arata). Pe Windows, Chrome pornit de hyperframes
// moștenește folderul curent, iar un folder curent al unui proces viu nu se poate șterge (EBUSY sau EPERM).
// Pachetul hyperframes din rădăcina temporară e un înveliș care scrie folderul curent în jurnal și pornește binarul real.
// Rulare: MG_TESTE_INTEGRARE=1 node --test teste/integrare/hyperframes-cwd.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';
import { rezolvaBinHyperframes } from '../../nucleu/lib/motor-hf.mjs';
import { arataPiese } from '../../nucleu/lib/desen/arata.mjs';

const sari = process.env.MG_TESTE_INTEGRARE !== '1';
const REPO = fileURLToPath(new URL('../../', import.meta.url));
const executa = promisify(execFile);

let temp = null;
let R = null;
let JURNAL = null;
const legaturi = [];

function copiazaFaraNodeModules(rel) {
  fs.cpSync(path.join(REPO, rel), path.join(R, rel), {
    recursive: true,
    filter: (sursa) => !sursa.split(/[\\/]/).includes('node_modules') && !/[\\/]nucleu[\\/]\.(stare\.json|canar|canar-refuzuri)$/.test(sursa),
  });
}

function leaga(rel) {
  const legatura = path.join(R, rel);
  if (!fs.existsSync(path.join(REPO, rel))) return;
  fs.mkdirSync(path.dirname(legatura), { recursive: true });
  fs.symlinkSync(path.join(REPO, rel), legatura, 'junction');
  legaturi.push(legatura);
}

/** Înlocuiește pachetul hyperframes al rădăcinii temporare cu un înveliș care notează folderul curent. */
function invelisHyperframes() {
  const real = rezolvaBinHyperframes(REPO);
  const dir = path.join(R, 'motoare', 'hyperframes', 'node_modules', 'hyperframes');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), `${JSON.stringify({ name: 'hyperframes', version: '0.8.96', bin: { hyperframes: 'invelis.mjs' } })}\n`);
  fs.writeFileSync(path.join(dir, 'invelis.mjs'), [
    "import { appendFileSync } from 'node:fs';",
    "import { pathToFileURL } from 'node:url';",
    `appendFileSync(${JSON.stringify(JURNAL)}, \`\${JSON.stringify({ comanda: process.argv[2], cwd: process.cwd() })}\\n\`);`,
    `await import(pathToFileURL(${JSON.stringify(real)}).href);`,
    '',
  ].join('\n'));
}

function jurnal() {
  if (!fs.existsSync(JURNAL)) return [];
  return fs.readFileSync(JURNAL, 'utf8').split('\n').filter(Boolean).map((rand) => JSON.parse(rand));
}

async function mg(argumente) {
  try {
    const { stdout } = await executa(process.execPath, [path.join(R, 'nucleu', 'mg.mjs'), ...argumente],
      { cwd: R, windowsHide: true, maxBuffer: 64 * 1024 * 1024, timeout: 600000, env: { ...process.env, MG_DEPANARE: '1' } });
    return { cod: 0, json: JSON.parse(stdout) };
  } catch (err) {
    if (typeof err.code !== 'number') throw err;
    return { cod: err.code, json: JSON.parse(err.stdout) };
  }
}

before(() => {
  if (sari) return;
  temp = creeazaRadacinaTemp({ biblioteciMini: true });
  // Calea reală are alt rost aici: process.cwd() al copilului e mereu fizic, deci aserțiunile pe cwd cer R fără legături.
  R = fs.realpathSync.native(temp.radacina);
  JURNAL = path.join(R, 'jurnal-cwd.jsonl');
  copiazaFaraNodeModules('nucleu');
  copiazaFaraNodeModules('motoare');
  leaga(path.join('nucleu', 'node_modules'));
  leaga(path.join('unelte', 'ffmpeg'));
  invelisHyperframes();
});

after(() => {
  for (const legatura of legaturi) fs.unlinkSync(legatura);
  temp?.curata();
});

test('T9: mg randeaza --doar-verificare pornește hyperframes check cu folderul curent în rădăcină, nu în build/', { skip: sari && 'setează MG_TESTE_INTEGRARE=1', timeout: 900000 }, async () => {
  let r = await mg(['nou', 'p', '--sablon', 'reel-ilustrat', '--json']);
  assert.equal(r.cod, 0, JSON.stringify(r.json.erori));
  fs.rmSync(JURNAL, { force: true });
  r = await mg(['randeaza', 'p', '--doar-verificare', '--json']);
  assert.equal(r.cod, 0, JSON.stringify(r.json.erori));
  const check = jurnal().filter((x) => x.comanda === 'check');
  assert.equal(check.length, 1, JSON.stringify(jurnal()));
  assert.equal(check[0].cwd, R);
});

test('T9: mg desen arata pornește hyperframes snapshot cu folderul curent în rădăcină, nu în folderul de lucru șters după', { skip: sari && 'setează MG_TESTE_INTEGRARE=1', timeout: 240000 }, async () => {
  fs.rmSync(JURNAL, { force: true });
  const iesire = path.join(R, 'video', 'p', 'cadre', 'desene.png');
  const rezultat = await arataPiese(R, ['od-chilling'], { tema: 'noapte', iesire });
  assert.equal(fs.existsSync(iesire), true, JSON.stringify(rezultat));
  const snapshot = jurnal().filter((x) => x.comanda === 'snapshot');
  assert.equal(snapshot.length, 1, JSON.stringify(jurnal()));
  assert.equal(snapshot[0].cwd, R);
});
