// Acceptarea lui text-animat pe motorul real (spec 7.2, „Testul de acceptare”, punctul 1): exemplele trec mg randeaza
// complet, cu verificare.json verde, dintr-o cale cu spațiu și diacritice (rădăcina temporară a lui radacinaCuMotoare),
// pe Windows și pe Mac. Fiecare rulare: --doar-verificare, --schita, refuzul fără aprobare, aprobarea prin hook,
// randarea completă, probele MP4 și predarea prin hook-ul Stop. Rulează doar cu MG_TESTE_INTEGRARE=1.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
const DIR_SABLON = join(REPO, 'motoare', 'hyperframes', 'sabloane', 'text-animat');
const ACUM = new Date('2026-10-16T10:00:00.000Z');
const MINUT = 60 * 1000;
const DIMENSIUNI = Object.freeze({ vertical: [1080, 1920], patrat: [1080, 1080] });
const OBLIGATORII = 25; // C01-C17 și S01-S07, S09
const sari = process.env.MG_TESTE_INTEGRARE !== '1';
const motivSarit = sari && 'setează MG_TESTE_INTEGRARE=1';
const executa = promisify(execFile);

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
    if (typeof err.code !== 'number') throw err;
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

const rezumat = (r) => `${JSON.stringify({ cod: r.cod, erori: r.json.erori, avertismente: r.json.avertismente }, null, 2)}\n${String(r.stderr).slice(-2000)}`;
const verificariPicate = (v) => JSON.stringify(v.verificari.filter((x) => !x.ok), null, 2);

function comparaCuGolden(t, exemplu, dirBuild) {
  const diferite = ['plan.json', 'index.html'].filter((f) => {
    const golden = join(DIR_SABLON, 'teste', 'golden', exemplu, f);
    return !existsSync(golden) || !readFileSync(join(dirBuild, f)).equals(readFileSync(golden));
  });
  if (diferite.length === 0) return;
  const dirSalvat = join(tmpdir(), 'mg-acceptare-text-golden', exemplu);
  mkdirSync(dirSalvat, { recursive: true });
  for (const f of ['plan.json', 'index.html']) copyFileSync(join(dirBuild, f), join(dirSalvat, f));
  t.diagnostic(`Build-ul real al exemplului ${exemplu} e salvat în ${dirSalvat}`);
  assert.fail(`build/${diferite.join(' și build/')} diferă de teste/golden/${exemplu}/. Build-ul real e în ${dirSalvat}.`);
}

/**
 * @param {string} exemplu numele din exemple/
 * @param {{stil?: object|null, format?: string|null, proiect?: string}} [variatie] stilul și formatul puse peste exemplu
 */
async function ruleazaExemplu(t, exemplu, { stil = null, format = null, proiect = exemplu } = {}) {
  const dirProiect = join(R, 'video', proiect);
  const caleScenariu = join(dirProiect, 'scenariu.md');
  const caleMp4 = join(dirProiect, `${proiect}.mp4`);
  const date = citesteJson(join(DIR_SABLON, 'exemple', `${exemplu}.json`));
  if (stil) date.stil = { ...(date.stil ?? {}), ...stil };
  if (format) date.format = format;
  const variat = stil !== null || format !== null;
  const muzica = date.muzica != null;

  // 1. mg nou, apoi „agentul” scrie date.json și pune resursele în resurse/
  let r = await mg(['nou', proiect, '--sablon', 'text-animat', '--json'], MINUT);
  assert.equal(r.cod, 0, rezumat(r));
  if (variat) writeFileSync(join(dirProiect, 'date.json'), `${JSON.stringify(date, null, 2)}\n`);
  else copyFileSync(join(DIR_SABLON, 'exemple', `${exemplu}.json`), join(dirProiect, 'date.json'));
  for (const camp of [date.muzica?.fisier, date.sigla]) {
    if (typeof camp !== 'string') continue;
    mkdirSync(join(dirProiect, 'resurse'), { recursive: true });
    copyFileSync(join(DIR_SABLON, 'exemple', ...camp.split('/')), join(dirProiect, ...camp.split('/')));
  }

  // 2. --doar-verificare: validare, stil, plan, cronologie, build, check, S05-S09, blocul „Ce apare pe ecran”
  r = await mg(['randeaza', proiect, '--doar-verificare', '--json'], 10 * MINUT);
  assert.equal(r.cod, 0, rezumat(r));
  assert.equal(r.json.ok, true, rezumat(r));
  let v = citesteJson(join(dirProiect, 'verificare.json'));
  assert.equal(v.mod, 'doar-verificare');
  assert.equal(v.ok, true, verificariPicate(v));
  for (const cod of ['S05', 'S06', 'S07', 'S09']) assert.equal(v.verificari.find((x) => x.cod === cod)?.ok, true, `${cod} după --doar-verificare`);
  const bloc = extrageBlocMg(readFileSync(caleScenariu, 'utf8'));
  assert.ok(bloc, 'scenariu.md nu are blocul mg după --doar-verificare');
  const zona = extrageZonaTexte(bloc.bloc);
  for (const [i, scena] of date.scene.entries()) {
    for (const rand of scena.titlu ?? []) {
      assert.ok(zona.includes(`„${textAfisat(rand)}”`), `Scena ${i + 1}: „${textAfisat(rand)}” lipsește din „Texte și cifre”`);
    }
  }
  const motion = citesteJson(join(dirProiect, 'build', 'index.motion.json'));
  assert.ok(motion.assertions.length > 0, 'index.motion.json fără aserțiuni');
  if (muzica) {
    assert.ok(existsSync(join(dirProiect, 'build', 'assets', 'muzica.m4a')));
    assert.equal(readFileSync(join(dirProiect, 'build', 'index.html'), 'utf8').split('<audio id="muzica"').length - 1, 1);
  }
  if (!variat) comparaCuGolden(t, exemplu, join(dirProiect, 'build'));

  // 3. --schita, înainte de aprobare: cadre, fără MP4
  r = await mg(['randeaza', proiect, '--schita', '--json'], 20 * MINUT);
  assert.equal(r.cod, 0, rezumat(r));
  v = citesteJson(join(dirProiect, 'verificare.json'));
  assert.equal(v.mod, 'schita');
  assert.equal(v.ok, true, verificariPicate(v));
  assert.equal(existsSync(caleMp4), false, '--schita nu scrie MP4');

  // 4. randarea completă fără aprobare e refuzată (C08)
  r = await mg(['randeaza', proiect, '--json'], 10 * MINUT);
  assert.notEqual(r.cod, 0, 'randarea completă a pornit fără aprobare');
  assert.ok(r.json.erori.some((e) => e.cod === 'aprobare-lipsa'), rezumat(r));

  // 5. aprobarea, exact ca hook-ul UserPromptSubmit la „aprob <proiect>”
  const raspuns = decideAprobare({
    session_id: 'acceptare-text', transcript_path: '', cwd: R, permission_mode: 'default',
    hook_event_name: 'UserPromptSubmit', prompt: `aprob ${proiect}`,
  }, R, ACUM);
  assert.equal(raspuns.cod, 0);
  const lock = citesteJson(join(dirProiect, 'motor.lock'));
  assert.equal(lock.aprobare.sha256_scenariu, sha256Fisier(caleScenariu));

  // 6. randarea completă, verificările pe MP4, foaia, verificare.json
  r = await mg(['randeaza', proiect, '--json'], 45 * MINUT);
  assert.equal(r.cod, 0, rezumat(r));
  v = citesteJson(join(dirProiect, 'verificare.json'));
  assert.equal(v.mod, 'complet');
  assert.equal(v.ok, true, verificariPicate(v));
  assert.equal(v.mp4, `video/${proiect}/${proiect}.mp4`);
  assert.equal(v.sha256_mp4, sha256Fisier(caleMp4));
  assert.equal(v.obligatorii.length, OBLIGATORII, 'C01-C17 și S01-S07, S09');
  for (const cod of v.obligatorii) assert.ok(v.verificari.some((x) => x.cod === cod && x.ok === true), `${cod} nu are un rezultat verde`);
  const cadre = readdirSync(join(dirProiect, 'cadre'));
  assert.ok(cadre.includes('predare-1.png') && cadre.includes('predare-2.png'), `lipsesc cadrele de predare: ${cadre.join(', ')}`);
  assert.ok(cadre.some((n) => /^foaie-\d+\.jpg$/.test(n)), 'lipsește foaia de contact cadre/foaie-N.jpg');
  const cronologie = citesteJson(join(dirProiect, 'build', 'cronologie.json'));
  const [latime, inaltime] = DIMENSIUNI[date.format ?? 'vertical'];
  const info = await probeazaMp4(caleMp4, { ffprobe: ff.ffprobe });
  assert.equal(info.video.codec, 'h264');
  assert.equal(info.video.pix_fmt, 'yuv420p');
  assert.equal(info.video.latime, latime);
  assert.equal(info.video.inaltime, inaltime);
  assert.equal(info.video.fps, 30);
  if (muzica) {
    assert.equal(info.audio?.codec, 'aac');
    assert.ok(Math.abs(info.audio.durata - cronologie.durata) <= 0.05, `durata pistei ${info.audio.durata}`);
    t.diagnostic(`C15 ${proiect}: ${JSON.stringify(v.verificari.find((x) => x.cod === 'C15')?.valoare)}`);
  } else {
    assert.equal(info.audio, null, 'fără muzică, MP4-ul e mut');
  }
  assert.ok(Math.abs(info.durata - cronologie.durata) <= 1 / 30, `durata MP4 ${info.durata} față de ${cronologie.durata}`);

  // 7. predarea trece de hook-ul Stop
  const stop = decideStop({
    session_id: 'acceptare-text', transcript_path: '', cwd: R, permission_mode: 'default',
    hook_event_name: 'Stop', stop_hook_active: false,
    last_assistant_message: `Videoul e gata.\nPredare: video/${proiect}/${proiect}.mp4`,
  }, R);
  assert.equal(stop.cod, 0);
  assert.equal(stop.stdout, '', `hook-ul Stop a blocat predarea: ${stop.stdout}`);
}

test('resursele exemplelor există: muzica lui complet și sigla lui patrat', () => {
  assert.ok(existsSync(join(DIR_SABLON, 'exemple', 'resurse', 'exemplu-muzica.mp3')));
  assert.ok(existsSync(join(DIR_SABLON, 'exemple', 'resurse', 'sigla-exemplu.svg')));
});

const OPT = { skip: motivSarit, timeout: 90 * MINUT };

test('acceptare text minim (noapte, vertical)', OPT, (t) => ruleazaExemplu(t, 'minim'));
test('acceptare text complet (7 tipuri, degradeu, muzică)', OPT, (t) => ruleazaExemplu(t, 'complet'));
test('acceptare text patrat (hârtie, ceață, siglă)', OPT, (t) => ruleazaExemplu(t, 'patrat'));
test('acceptare text minim pe contrast, pătrat, ritm alert', OPT, (t) => ruleazaExemplu(t, 'minim', { stil: { tema: 'contrast', ritm: 'alert' }, format: 'patrat', proiect: 'minim-contrast' }));
test('acceptare text minim pe curat', OPT, (t) => ruleazaExemplu(t, 'minim', { stil: { tema: 'curat' }, proiect: 'minim-curat' }));

// Felia 2: corectura după predare pe motorul real; căile din corecturi/ și comparația cadrelor (SSIM) pe Windows și pe Mac.
test('corectura după predare pe text minim: lista mai lentă, titlul și finalul neatinse', OPT, async (t) => {
  const proiect = 'minim-corectura';
  await ruleazaExemplu(t, 'minim', { proiect });
  const dirProiect = join(R, 'video', proiect);
  // cererea cursantului trece prin hook-ul UserPromptSubmit, care notează momentul ei; fără ea, --deschide refuză
  let r = await mg(['corectura', proiect, '--deschide', 'x', '--json'], MINUT);
  assert.ok(r.json.erori.some((e) => e.cod === 'corectura-fara-mesaj'), rezumat(r));
  decideAprobare({
    session_id: 'acceptare-text', transcript_path: '', cwd: R, permission_mode: 'default',
    hook_event_name: 'UserPromptSubmit', prompt: 'Lista merge prea repede, nu apuc să citesc.',
  }, R, new Date());
  r = await mg(['corectura', proiect, '--deschide', 'Lista merge prea repede, nu apuc să citesc.', '--json'], MINUT);
  assert.equal(r.cod, 0, rezumat(r));
  assert.ok(existsSync(join(dirProiect, 'corecturi', '1', 'inainte', 'film.mp4')));

  const date = citesteJson(join(dirProiect, 'date.json'));
  date.scene[1].durata = 7.5;
  writeFileSync(join(dirProiect, 'date.json'), `${JSON.stringify(date, null, 2)}\n`);
  r = await mg(['randeaza', proiect, '--doar-verificare', '--json'], 10 * MINUT);
  assert.equal(r.cod, 0, rezumat(r));
  decideAprobare({
    session_id: 'acceptare-text', transcript_path: '', cwd: R, permission_mode: 'default',
    hook_event_name: 'UserPromptSubmit', prompt: `aprob ${proiect}`,
  }, R, ACUM);
  r = await mg(['randeaza', proiect, '--json'], 45 * MINUT);
  assert.equal(r.cod, 0, rezumat(r));

  r = await mg(['corectura', proiect, '--verifica', '--json'], 10 * MINUT);
  assert.equal(r.cod, 0, rezumat(r));
  assert.deepEqual(r.json.rezultat.schimbari.map((s) => s.camp), ['scene[1].durata']);
  assert.deepEqual(r.json.rezultat.scene.map((s) => [s.camp, s.ok]), [['scene[0]', true], ['scene[2]', true]],
    JSON.stringify(r.json.rezultat.scene));
  const stop = decideStop({
    session_id: 'acceptare-text', transcript_path: '', cwd: R, permission_mode: 'default',
    hook_event_name: 'Stop', stop_hook_active: false,
    last_assistant_message: `Am încetinit lista.\nPredare: video/${proiect}/${proiect}.mp4`,
  }, R);
  assert.equal(stop.stdout, '', `hook-ul Stop a blocat predarea corecturii: ${stop.stdout}`);
  t.diagnostic(`SSIM scene neatinse: ${JSON.stringify(r.json.rezultat.scene.map((s) => s.ssim))}`);
  r = await mg(['corectura', proiect, '--propuneri', '--json'], MINUT);
  assert.equal(r.cod, 0, rezumat(r));
  assert.ok(r.json.rezultat.propuneri.length >= 3);
});
