// Acceptarea șablonului reel-ilustrat la pasul 2 (spec 7.1 „Testul de acceptare”, 10.1, 10.3; harta 8.4, 8.5).
//
// Partea rapidă rulează mereu: exemplele și golden-urile lor, lipsa stilului linia-continua, forma lui ci.yml.
// Partea lentă rulează doar cu MG_TESTE_INTEGRARE=1. Trece fiecare exemplu pe drumul agentului, cu HyperFrames
// 0.8.96 real, într-o rădăcină temporară cu spațiu și diacritice și cu biblioteca sintetică din
// teste/fixtures/biblioteci-mini/: mg nou, mg randeaza --doar-verificare, --schita, refuzul fără aprobare,
// aprobarea prin decideAprobare, randarea completă, verificare.json verde și predarea acceptată de hook-ul Stop.
// Reluată după pasul 4 (planul F, F12): index.motion.json și C10 verde pe toate rulările, plus o a patra rulare,
// minim cu muzică, pe atmosfera plin și cu scene lungi, care cere C15 complet (o pistă AAC cu durata videoului).
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { promisify } from 'node:util';
import { radacinaAgent } from '../../nucleu/lib/cai.mjs';
import { citesteJson, sha256Fisier } from '../../nucleu/lib/fisiere.mjs';
import { descarcaRezerva, platforma, probeazaMp4, rezolvaFfmpeg } from '../../nucleu/lib/ffmpeg.mjs';
import { ruleazaHyperframes } from '../../nucleu/lib/motor-hf.mjs';
import { extrageBlocMg, extrageZonaTexte } from '../../nucleu/lib/scenariu.mjs';
import { textAfisat } from '../../nucleu/lib/text.mjs';
import { decideAprobare } from '../../nucleu/lib/garda/aprobare.mjs';
import { decideStop } from '../../nucleu/lib/garda/stop.mjs';
import { radacinaCuMotoare } from '../ajutoare/radacina-motoare.mjs';

const REPO = radacinaAgent(import.meta.url, 2);
// yaml e dependență a nucleului (yaml 2.9.1, „exports.node” = ./dist/index.js), deci se încarcă din nucleu/.
const YAML = createRequire(join(REPO, 'nucleu', 'package.json'))('yaml');
const DIR_SABLON = join(REPO, 'motoare', 'hyperframes', 'sabloane', 'reel-ilustrat');
const EXEMPLE = ['minim', '01-rutina-preluata', '02-programari-25s'];
const CALE_CI = 'Proiecte Ăîș test/agent-motion';
const TESTE_SABLON = 'node --test "motoare/hyperframes/sabloane/reel-ilustrat/teste/*.test.mjs"';
const ACUM = new Date('2026-10-02T10:00:00.000Z');
const MINUT = 60 * 1000;
const sari = process.env.MG_TESTE_INTEGRARE !== '1';
const motivSarit = sari && 'setează MG_TESTE_INTEGRARE=1';
const executa = promisify(execFile);

// Exemplul complet din spec 7.1 („Forma lui date.json”), copiat literal.
const EXEMPLU_SPEC_7_1 = {
  sablon: 'reel-ilustrat',
  versiune_schema: 1,
  format: 'vertical',
  durata: 25,
  stil: {
    descriere: 'cald, prietenos, luminos',
    tema: 'hartie',
    ritm: 'normal',
    culori: { accent: '#D9486A' },
    recolorare: 'tema',
  },
  semnatura: 'Ana Pop,\ncoach de carieră',
  scene: [
    {
      tip: 'desen', durata: 4,
      desen: { id: 'op-bust-telefon', marime: 'mare', ramane_pana_la: 2 },
      eticheta: 'Luni, 8:30',
      titlu: ['Telefonul sună', '*din nou.*'],
    },
    {
      tip: 'adunare', durata: 4.5,
      iconite: ['phone', 'message-circle', 'calendar-x', 'mail', 'bell'],
      eticheta: 'Toată ziua',
      cuvinte: ['Reprogramări.', 'Anulări.', 'Mesaje.'],
    },
    {
      tip: 'retea', durata: 6, scanteie: true,
      eticheta: 'Altfel',
      titlu: ['Un agent preia', '*programările.*'],
    },
    {
      tip: 'desen', durata: 5,
      desen: { id: 'op-picioare-explica-ochelari', marime: 'mare' },
      eticheta: 'Tu',
      titlu: ['Ai timp pentru', '*clienți.*'],
    },
    {
      tip: 'final', durata: 5.5,
      desen: { id: 'op-bust-cafea', marime: 'mediu' },
      linie_accent: true,
      eticheta: 'Om + agent',
      titlu: ['Tu decizi,', '*agentul ține minte.*'],
      cta: 'Scrie „AGENT” în comentarii',
    },
  ],
};

// Semnele stilului linia-continua al lui Dănuț (kit/linia-continua/STIL.md), care nu intră în agent.
const INTERZISE = [
  '#0a0b0e', '#e08a5e', '#ede6da',
  'rgba(192,132,252', 'rgba(78,205,196',
  'personality and cognitive ai architect', 'unde se întâlnesc',
  'om-coplesit-laptop', 'om-relaxat-scaun', 'om-asezat-margine',
];
// Id-urile de trasee lc-... (desenele one-line) nu intră în fișierele livrate; nu e un simplu „lc-” în INTERZISE,
// fiindcă acela ar prinde și cuvinte ca „calc-”.
const TRASEU_LC = /\blc-[a-z0-9]/;
// sha256 ale celor 3 trasee din kit/linia-continua/biblioteca/trasee/ (om-asezat-margine, om-coplesit-laptop, om-relaxat-scaun).
const SHA_TRASEE_KIT = new Set([
  '5e4457024cb9b3f97ee88f6fa9f5822c0e657451582d5cf362d088442cb35a8e',
  'a74ba83b4cc12d4b520284cd9c53d82aad661ca36e86b36d026e0f0ffda1890b',
  'b625f997d7fc0edb586ffab86337bb8bf2fa9e21ac03c307e6c6fbdebccdde54',
]);

function fisiereDin(dir) {
  if (!existsSync(dir)) return [];
  const iesire = [];
  for (const intrare of readdirSync(dir, { withFileTypes: true })) {
    if (intrare.name === 'node_modules') continue;
    const cale = join(dir, intrare.name);
    if (intrare.isDirectory()) iesire.push(...fisiereDin(cale));
    else if (intrare.isFile()) iesire.push(cale);
  }
  return iesire;
}

function citesteCi() {
  return YAML.parse(readFileSync(join(REPO, '.github', 'workflows', 'ci.yml'), 'utf8'));
}

// Jobul windows-pixeli-teme (doar la pornire manuală, cu `if`) nu intră la socoteală.
function jobPe(ci, sistem) {
  const joburi = Object.values(ci.jobs ?? {}).filter((j) => j['runs-on'] === sistem && j.if === undefined);
  assert.equal(joburi.length, 1, `ci.yml trebuie să aibă exact un job pe ${sistem}`);
  return joburi[0];
}

function verificaCaleSiNode(ci, job) {
  const checkout = job.steps.find((p) => String(p.uses ?? '').startsWith('actions/checkout@'));
  assert.ok(checkout, 'lipsește pasul actions/checkout');
  assert.equal(checkout.with?.path, CALE_CI, 'checkout-ul trebuie să fie în calea cu spațiu și diacritice');
  const dirLucru = job.defaults?.run?.['working-directory'] ?? ci.defaults?.run?.['working-directory'];
  assert.equal(dirLucru, CALE_CI, 'pașii trebuie să ruleze în calea cu spațiu și diacritice');
  const node = job.steps.find((p) => String(p.uses ?? '').startsWith('actions/setup-node@'));
  assert.equal(String(node?.with?.['node-version']), '22');
}

test('exemplele de acceptare există și au golden plan.json și index.html, cu LF și fără BOM', () => {
  for (const exemplu of EXEMPLE) {
    assert.ok(existsSync(join(DIR_SABLON, 'exemple', `${exemplu}.json`)), `lipsește exemple/${exemplu}.json`);
    for (const fisier of ['plan.json', 'index.html']) {
      const cale = join(DIR_SABLON, 'teste', 'golden', exemplu, fisier);
      assert.ok(existsSync(cale), `lipsește teste/golden/${exemplu}/${fisier}`);
      const octeti = readFileSync(cale);
      assert.equal(octeti.includes(0x0d), false, `teste/golden/${exemplu}/${fisier} conține CR`);
      const bom = octeti[0] === 0xef && octeti[1] === 0xbb && octeti[2] === 0xbf;
      assert.equal(bom, false, `teste/golden/${exemplu}/${fisier} începe cu BOM`);
    }
  }
});

test('git scoate exemplele și golden-urile cu LF pe orice sistem (.gitattributes)', () => {
  const cai = EXEMPLE.flatMap((e) => [
    `motoare/hyperframes/sabloane/reel-ilustrat/exemple/${e}.json`,
    `motoare/hyperframes/sabloane/reel-ilustrat/teste/golden/${e}/plan.json`,
    `motoare/hyperframes/sabloane/reel-ilustrat/teste/golden/${e}/index.html`,
  ]);
  const iesire = execFileSync('git', ['check-attr', 'eol', '--', ...cai], { cwd: REPO, encoding: 'utf8' });
  const randuri = iesire.trim().split(/\r?\n/);
  assert.equal(randuri.length, cai.length);
  for (const rand of randuri) assert.match(rand, /: eol: lf$/, rand);
});

test('exemplul 02 e exact exemplul complet din spec 7.1', () => {
  const cale = join(DIR_SABLON, 'exemple', '02-programari-25s.json');
  assert.ok(existsSync(cale), 'lipsește exemple/02-programari-25s.json');
  assert.deepEqual(citesteJson(cale), EXEMPLU_SPEC_7_1);
  const text = readFileSync(cale, 'utf8');
  assert.equal(text, JSON.stringify(EXEMPLU_SPEC_7_1, null, 2) + '\n', 'fișierul nu e în forma canonică JSON.stringify(x, null, 2) + LF');
});

test('exemplul 01 folosește tema noapte și cel puțin 3 forme din bibliotecă (op- sau od-)', () => {
  const date = citesteJson(join(DIR_SABLON, 'exemple', '01-rutina-preluata.json'));
  assert.equal(date.stil?.tema ?? 'noapte', 'noapte');
  const desene = date.scene.filter((s) => s.desen).map((s) => s.desen.id);
  assert.ok(desene.length >= 3, `exemplul 01 trebuie să aibă 3 desene, are ${desene.length}`);
  for (const id of desene) assert.match(id, /^(op|od)-[a-z0-9-]+$/, `desenul ${id} nu e o formă din biblioteca Open Peeps sau Open Doodles`);
});

test('fără stilul linia-continua în livrare (spec 7.1, punctul 3)', () => {
  const schema = readFileSync(join(DIR_SABLON, 'schema.json'), 'utf8');
  assert.equal(schema.includes('linia-continua'), false, 'schema.json acceptă tema linia-continua');
  const gasite = [];
  for (const cale of [...fisiereDin(join(REPO, 'motoare')), ...fisiereDin(join(REPO, 'biblioteci'))]) {
    const rel = relative(REPO, cale).split(sep).join('/');
    if (SHA_TRASEE_KIT.has(sha256Fisier(cale))) gasite.push(`${rel}: copie a unui traseu din kit`);
    if (!/\.(json|js|mjs|html|css|md|svg|txt)$/i.test(cale)) continue;
    const text = readFileSync(cale, 'utf8').toLowerCase();
    for (const semn of INTERZISE) if (text.includes(semn)) gasite.push(`${rel}: conține „${semn}”`);
    if (TRASEU_LC.test(text)) gasite.push(`${rel}: conține un id de traseu lc-`);
  }
  for (const exemplu of EXEMPLE) {
    const cale = join(DIR_SABLON, 'exemple', `${exemplu}.json`);
    if (!existsSync(cale)) continue;
    if (/Mitru(\u{21B}|\u{163})/u.test(readFileSync(cale, 'utf8'))) gasite.push(`exemple/${exemplu}.json: semnătura lui Dănuț`);
  }
  assert.deepEqual(gasite, []);
});

test('ci.yml: pe windows-latest rulează doctor, integrarea (randarea exemplelor) și testele șablonului, din calea cu spațiu și diacritice', () => {
  const ci = citesteCi();
  const win = jobPe(ci, 'windows-latest');
  verificaCaleSiNode(ci, win);
  const comenzi = win.steps.map((p) => String(p.run ?? ''));
  const iDoctor = comenzi.findIndex((c) => c.includes('node nucleu/mg.mjs doctor --ci'));
  const iIntegrare = comenzi.findIndex((c) => c.includes('"teste/integrare/*.test.mjs"'));
  const iSablon = comenzi.findIndex((c) => c.includes(TESTE_SABLON));
  assert.ok(iDoctor >= 0, 'lipsește node nucleu/mg.mjs doctor --ci');
  assert.ok(iIntegrare > iDoctor, 'integrarea trebuie să vină după doctor');
  assert.equal(win.steps[iIntegrare].env?.MG_TESTE_INTEGRARE, '1');
  assert.ok(comenzi[iIntegrare].includes('--test-concurrency=1'), 'randările rulează pe rând, nu în paralel');
  assert.ok(iSablon > iDoctor, 'lipsește pasul cu testele șablonului reel-ilustrat');
});

test('ci.yml: job-ul macos-latest rulează golden-urile reelului, fără integrare', () => {
  const ci = citesteCi();
  const mac = jobPe(ci, 'macos-latest');
  verificaCaleSiNode(ci, mac);
  const comenzi = mac.steps.map((p) => String(p.run ?? '')).join('\n');
  assert.ok(comenzi.includes('npm ci'), 'job-ul de pe Mac are nevoie de dependențele nucleului');
  assert.ok(comenzi.includes(TESTE_SABLON), 'job-ul de pe Mac trebuie să ruleze golden-urile reelului');
  assert.equal(JSON.stringify(mac).includes('MG_TESTE_INTEGRARE'), false, 'pe Mac, CI nu randează');
});

// ---------------------------------------------------------------------------------------------------------------
// Partea lentă: HyperFrames, Chrome și ffmpeg reale.

let temp = null;
let R = null;
let ff = null;
let intrariNucleuNodeModules = 0;

async function ffReale() {
  try {
    return await rezolvaFfmpeg(REPO);
  } catch (err) {
    if (err?.eroareMg?.cod !== 'ffmpeg-lipsa') throw err;
    const versiuni = citesteJson(join(REPO, 'nucleu', 'VERSIUNI.json'));
    if (!versiuni.ffmpeg?.rezerva?.[platforma()]?.ffprobe) throw err;
    await descarcaRezerva(REPO, 'ffprobe', versiuni);
    return rezolvaFfmpeg(REPO);
  }
}

// Rădăcina temporară vine din ajutorul comun: kitul fără node_modules (nucleu/lib, mg.mjs, motoare/..., deci fără
// stare.json, .canar și .canar-refuzuri), cu node_modules și unelte/ffmpeg legate ca junction spre repo.
before(async () => {
  if (sari) return;
  ff = await ffReale();
  const browser = await ruleazaHyperframes(['browser', 'ensure'], { radacina: REPO, cwd: REPO, ff });
  assert.equal(browser.cod, 0, browser.stderr);
  intrariNucleuNodeModules = readdirSync(join(REPO, 'nucleu', 'node_modules')).length;
  temp = radacinaCuMotoare();
  R = temp.radacina;
});

after(() => {
  if (sari) return;
  // curata() desface întâi legăturile, ca ștergerea rădăcinii să nu atingă node_modules din repo; garda se verifică după.
  try {
    temp?.curata();
  } finally {
    assert.equal(readdirSync(join(REPO, 'nucleu', 'node_modules')).length, intrariNucleuNodeModules,
      'nucleu/node_modules din repo trebuia să rămână neatins');
  }
});

async function mg(argumente, timeoutMs) {
  const optiuni = { cwd: R, env: { ...process.env, MG_DEPANARE: '1' }, windowsHide: true, maxBuffer: 64 * 1024 * 1024, timeout: timeoutMs };
  let cod = 0;
  let stdout = '';
  let stderr = '';
  try {
    ({ stdout, stderr } = await executa(process.execPath, [join(R, 'nucleu', 'mg.mjs'), ...argumente], optiuni));
  } catch (err) {
    if (typeof err.code !== 'number') throw err; // oprit de timeout sau nepornit
    ({ code: cod, stdout, stderr } = err);
  }
  let json;
  try {
    json = JSON.parse(stdout);
  } catch {
    assert.fail(`mg ${argumente.join(' ')} nu a scris JSON pe stdout (cod ${cod}).\nstdout:\n${stdout}\nstderr:\n${stderr}`);
  }
  return { cod, json, stderr };
}

function rezumat(r) {
  return `${JSON.stringify({ cod: r.cod, erori: r.json.erori, avertismente: r.json.avertismente }, null, 2)}\n${String(r.stderr).slice(-2000)}`;
}

function verificariPicate(v) {
  return JSON.stringify(v.verificari.filter((x) => !x.ok), null, 2);
}

function comparaCuGolden(t, exemplu, dirBuild) {
  const dirGolden = join(DIR_SABLON, 'teste', 'golden', exemplu);
  const diferite = [];
  for (const fisier of ['plan.json', 'index.html']) {
    const golden = join(dirGolden, fisier);
    if (!existsSync(golden) || !readFileSync(join(dirBuild, fisier)).equals(readFileSync(golden))) diferite.push(fisier);
  }
  if (diferite.length === 0) return;
  const dirSalvat = join(tmpdir(), 'mg-acceptare-golden', exemplu);
  mkdirSync(dirSalvat, { recursive: true });
  for (const fisier of ['plan.json', 'index.html']) copyFileSync(join(dirBuild, fisier), join(dirSalvat, fisier));
  t.diagnostic(`Build-ul real al exemplului ${exemplu} e salvat în ${dirSalvat}`);
  assert.fail(`build/${diferite.join(' și build/')} diferă de teste/golden/${exemplu}/ (sau golden-ul lipsește). Build-ul real e în ${dirSalvat}.`);
}

// `durate`: duratele scenelor, în ordine (planul F, F12: scene lungi pe „plin”, unde singura mișcare după ce un desen
// e gata e deriva lentă a lui #cam, deci keepsMoving are marja cea mai mică).
async function ruleazaExemplu(t, exemplu, { muzica = false, atmosfera = null, durate = null, proiect = exemplu } = {}) {
  const dirProiect = join(R, 'video', proiect);
  const caleScenariu = join(dirProiect, 'scenariu.md');
  const caleMp4 = join(dirProiect, `${proiect}.mp4`);
  const date = citesteJson(join(DIR_SABLON, 'exemple', `${exemplu}.json`));
  if (muzica) date.muzica = { fisier: 'resurse/exemplu-muzica.mp3', volum: 0.4, incepe_de_la: 0 };
  if (atmosfera) date.stil = { ...(date.stil ?? {}), atmosfera };
  if (durate) {
    assert.equal(durate.length, date.scene.length, 'câte o durată pentru fiecare scenă');
    for (const [i, d] of durate.entries()) date.scene[i].durata = d;
  }
  const variat = muzica || atmosfera !== null || durate !== null;

  // 1. mg nou, apoi „agentul” scrie date.json (aici, copia exemplului, cu muzica, atmosfera și duratele cerute).
  let r = await mg(['nou', proiect, '--sablon', 'reel-ilustrat', '--json'], MINUT);
  assert.equal(r.cod, 0, rezumat(r));
  if (variat) {
    writeFileSync(join(dirProiect, 'date.json'), `${JSON.stringify(date, null, 2)}\n`);
  } else {
    copyFileSync(join(DIR_SABLON, 'exemple', `${exemplu}.json`), join(dirProiect, 'date.json'));
  }
  if (muzica) {
    mkdirSync(join(dirProiect, 'resurse'), { recursive: true });
    copyFileSync(join(REPO, 'teste', 'fixtures', 'muzica', 'exemplu-muzica.mp3'), join(dirProiect, 'resurse', 'exemplu-muzica.mp3'));
  }

  // 2. --doar-verificare: validare, stil, plan, cronologie, build, check --json, blocul „Ce apare pe ecran”.
  r = await mg(['randeaza', proiect, '--doar-verificare', '--json'], 10 * MINUT);
  assert.equal(r.cod, 0, rezumat(r));
  assert.equal(r.json.ok, true, rezumat(r));
  let v = citesteJson(join(dirProiect, 'verificare.json'));
  assert.equal(v.mod, 'doar-verificare');
  assert.equal(v.ok, true, verificariPicate(v));
  assert.equal(v.mp4, null);
  const bloc = extrageBlocMg(readFileSync(caleScenariu, 'utf8'));
  assert.ok(bloc, 'scenariu.md nu are blocul mg după --doar-verificare');
  const zona = extrageZonaTexte(bloc.bloc);
  for (const [i, scena] of date.scene.entries()) {
    for (const rand of [...(scena.titlu ?? []), ...(scena.cuvinte ?? [])]) {
      assert.ok(zona.includes(`„${textAfisat(rand)}”`), `Scena ${i + 1}: „${textAfisat(rand)}” lipsește din „Texte și cifre”`);
    }
  }
  const motion = citesteJson(join(dirProiect, 'build', 'index.motion.json'));
  assert.ok(motion.assertions.some((a) => a.kind === 'appearsBy') && motion.assertions.some((a) => a.kind === 'keepsMoving'));
  const c10 = v.verificari.find((x) => x.cod === 'C10');
  assert.equal(c10.ok, true, JSON.stringify(c10.erori));
  if (muzica) {
    assert.ok(existsSync(join(dirProiect, 'build', 'assets', 'muzica.m4a')));
    assert.equal(readFileSync(join(dirProiect, 'build', 'index.html'), 'utf8').split('<audio id="muzica"').length - 1, 1);
  }
  if (!variat) comparaCuGolden(t, exemplu, join(dirProiect, 'build'));

  // 3. --schita: merge și înainte de aprobare (decizia 3); cadre la mijlocul fiecărei scene, fără MP4.
  r = await mg(['randeaza', proiect, '--schita', '--json'], 20 * MINUT);
  assert.equal(r.cod, 0, rezumat(r));
  v = citesteJson(join(dirProiect, 'verificare.json'));
  assert.equal(v.mod, 'schita');
  assert.equal(v.ok, true, verificariPicate(v));
  assert.equal(v.mp4, null);
  const schite = readdirSync(join(dirProiect, 'cadre')).filter((n) => /^schita-\d+$/.test(n)).sort();
  assert.ok(schite.length >= 1, 'lipsește cadre/schita-N/');
  const cadreSchita = readdirSync(join(dirProiect, 'cadre', schite.at(-1))).filter((n) => n.endsWith('.png'));
  assert.ok(cadreSchita.length >= date.scene.length, `cadre/${schite.at(-1)} are ${cadreSchita.length} PNG-uri pentru ${date.scene.length} scene`);
  assert.equal(existsSync(caleMp4), false, '--schita nu scrie MP4');

  // 4. Randarea completă fără aprobare e refuzată (C08), înainte să pornească Chrome.
  r = await mg(['randeaza', proiect, '--json'], 10 * MINUT);
  assert.notEqual(r.cod, 0, 'randarea completă a pornit fără aprobare');
  assert.ok(r.json.erori.some((e) => e.cod === 'aprobare-lipsa'), rezumat(r));
  assert.equal(existsSync(caleMp4), false);

  // 5. Aprobarea simulată: exact ce face hook-ul UserPromptSubmit când cursantul scrie „aprob <proiect>”.
  const raspuns = decideAprobare({
    session_id: 'acceptare-reel', transcript_path: '', cwd: R, permission_mode: 'default',
    hook_event_name: 'UserPromptSubmit', prompt: `aprob ${proiect}`,
  }, R, ACUM);
  assert.equal(raspuns.cod, 0);
  const context = JSON.parse(raspuns.stdout).hookSpecificOutput;
  assert.equal(context.hookEventName, 'UserPromptSubmit');
  assert.match(context.additionalContext, /a fost înregistrată în motor\.lock/);
  const lock = citesteJson(join(dirProiect, 'motor.lock'));
  assert.equal(lock.aprobare.sha256_scenariu, sha256Fisier(caleScenariu));
  assert.equal(lock.aprobare.mesaj, `aprob ${proiect}`);
  assert.equal(lock.aprobare.aprobat_la, ACUM.toISOString());

  // 6. Randarea completă: render --quality looks --fps 30 --strict, verificările pe MP4, foaia, verificare.json.
  r = await mg(['randeaza', proiect, '--json'], 45 * MINUT);
  assert.equal(r.cod, 0, rezumat(r));
  v = citesteJson(join(dirProiect, 'verificare.json'));
  assert.equal(v.mod, 'complet');
  assert.equal(v.ok, true, verificariPicate(v));
  assert.equal(v.mp4, `video/${proiect}/${proiect}.mp4`);
  assert.equal(v.sha256_mp4, sha256Fisier(caleMp4));
  assert.equal(v.sha256_date, sha256Fisier(join(dirProiect, 'date.json')));
  assert.equal(v.obligatorii.length, 29, 'C01-C17 și S01-S12');
  for (const cod of v.obligatorii) {
    assert.ok(v.verificari.some((x) => x.cod === cod && x.ok === true), `${cod} nu are un rezultat verde`);
  }
  const cadre = readdirSync(join(dirProiect, 'cadre'));
  assert.ok(cadre.includes('predare-1.png') && cadre.includes('predare-2.png'), `lipsesc cadrele de predare: ${cadre.join(', ')}`);
  assert.ok(cadre.some((n) => /^foaie-\d+\.jpg$/.test(n)), 'lipsește foaia de contact cadre/foaie-N.jpg');
  const cronologie = citesteJson(join(dirProiect, 'build', 'cronologie.json'));
  const info = await probeazaMp4(caleMp4, { ffprobe: ff.ffprobe });
  assert.equal(info.video.codec, 'h264');
  assert.equal(info.video.pix_fmt, 'yuv420p');
  assert.equal(info.video.latime, 1080);
  assert.equal(info.video.inaltime, 1920);
  assert.equal(info.video.fps, 30);
  if (muzica) {
    assert.equal(info.audio?.codec, 'aac');
    assert.equal(info.audio?.piste, 1);
    assert.ok(Math.abs(info.audio.durata - cronologie.durata) <= 0.05, `durata pistei ${info.audio.durata}`);
    const c15 = v.verificari.find((x) => x.cod === 'C15');
    assert.equal(c15.valoare.muzica, true);
    t.diagnostic(`C15 ${proiect}: ${JSON.stringify(c15.valoare.nivel)}`);
  } else {
    assert.equal(info.audio, null, 'fără muzică, MP4-ul e mut');
  }
  assert.ok(Math.abs(info.durata - cronologie.durata) <= 1 / 30, `durata MP4 ${info.durata} față de ${cronologie.durata}`);

  // 7. Predarea trece de hook-ul Stop (verificare.json verde, hash-urile curente, cadrele de predare).
  const stop = decideStop({
    session_id: 'acceptare-reel', transcript_path: '', cwd: R, permission_mode: 'default',
    hook_event_name: 'Stop', stop_hook_active: false,
    last_assistant_message: `Videoul e gata.\nPredare: video/${proiect}/${proiect}.mp4`,
  }, R);
  assert.equal(stop.cod, 0);
  assert.equal(stop.stdout, '', `hook-ul Stop a blocat predarea: ${stop.stdout}`);
  return { proiect, dirProiect, caleMp4 };
}

test('fixture-ul de muzică al acceptării există', () => {
  assert.ok(existsSync(join(REPO, 'teste', 'fixtures', 'muzica', 'exemplu-muzica.mp3')));
});

test('acceptare minim: verificare, schiță, aprobare, randare completă, predare', { skip: motivSarit, timeout: 90 * MINUT }, async (t) => {
  await ruleazaExemplu(t, 'minim');
});

test('acceptare 01-rutina-preluata: verificare, schiță, aprobare, randare completă, predare', { skip: motivSarit, timeout: 90 * MINUT }, async (t) => {
  await ruleazaExemplu(t, '01-rutina-preluata');
});

test('acceptare 02-programari-25s: verificare, schiță, aprobare, randare completă, predare', { skip: motivSarit, timeout: 90 * MINUT }, async (t) => {
  await ruleazaExemplu(t, '02-programari-25s');
});

// Scenele lungi (12 + 8 + 10 s, deci 30 s) pe „plin”: marja lui keepsMoving măsurată pe tot drumul mg (planul F, F12).
test('acceptare minim cu muzică și atmosfera plin, cu scene lungi: C15 complet, index.motion.json, predare', { skip: motivSarit, timeout: 90 * MINUT }, async (t) => {
  await ruleazaExemplu(t, 'minim', { muzica: true, atmosfera: 'plin', durate: [12, 8, 10], proiect: 'minim-cu-muzica' });
});
