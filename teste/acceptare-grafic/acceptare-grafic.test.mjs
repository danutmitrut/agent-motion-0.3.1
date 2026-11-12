// Acceptarea lui date-serie (compoziția Grafic) pe Remotion real (spec 7.3, „Testul de acceptare”; decizia 16): exemplul
// din spec trece drumul întreg din rădăcina temporară a lui radacinaCuMotoare (cale cu spațiu și diacritice): mg nou,
// --doar-verificare, --schita, refuzul fără aprobare, aprobarea prin hook, randarea completă cu S06 și S07, probele MP4
// și predarea prin hook-ul Stop. Variantele: hârtie cu siglă (sigla în scena final) și curat cu muzică (pista AAC, C15).
// Rulează doar cu MG_TESTE_INTEGRARE=1. Timpul randării complete se tipărește (t.diagnostic) pentru SABLON.md.
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
import { stareRemotion } from '../../nucleu/lib/motoare/remotion-instalare.mjs';
import { ruleazaRemotion } from '../../nucleu/lib/motoare/remotion.mjs';
import { extrageBlocMg, extrageZonaTexte } from '../../nucleu/lib/scenariu.mjs';
import { textAfisat } from '../../nucleu/lib/text.mjs';
import { decideAprobare } from '../../nucleu/lib/garda/aprobare.mjs';
import { decideStop } from '../../nucleu/lib/garda/stop.mjs';
import { radacinaCuMotoare } from '../ajutoare/radacina-motoare.mjs';

const REPO = radacinaAgent(import.meta.url, 2);
const DIR_SABLON = join(REPO, 'motoare', 'remotion', 'sabloane', 'date-serie');
const ACUM = new Date('2026-10-20T10:00:00.000Z');
const MINUT = 60 * 1000;
const CADRE = 672; // exemplul din spec: 3,8 + 4 + 7,8 + 4,6 + 3,8 s, minus 4 tranziții de 12 cadre
const OBLIGATORII = 26; // C01-C17, S01-S09 (decizia 14; S01, S02, S08, S09 adăugate la felia 3, cu seria)
const SIGLA = join(REPO, 'motoare', 'hyperframes', 'sabloane', 'text-animat', 'exemple', 'resurse', 'sigla-exemplu.svg');
const MUZICA = join(REPO, 'teste', 'fixtures', 'muzica', 'exemplu-muzica.mp3');
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
  const stare = stareRemotion(REPO);
  assert.equal(stare.instalat, true,
    `Remotion nu e instalat în repo (lipsesc: ${stare.lipsa.join(', ')}). Instalează-l o dată: node nucleu/mg.mjs nou proba-instalare --sablon date-serie --instaleaza-motorul`);
  ff = await ffReale();
  const browser = await ruleazaRemotion(['browser', 'ensure'], { radacina: REPO, cwd: join(REPO, 'motoare', 'remotion') });
  assert.equal(browser.cod, 0, browser.stderr);
  intrariNucleuNodeModules = readdirSync(join(REPO, 'nucleu', 'node_modules')).length;
  temp = radacinaCuMotoare({ remotion: true });
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
const valoare = (v, cod) => JSON.stringify(v.verificari.find((x) => x.cod === cod)?.valoare);

function comparaCuGolden(t, dirBuild) {
  const diferite = ['props.json', 'cronologie.json'].filter((f) => {
    const golden = join(DIR_SABLON, 'teste', 'golden', 'grafic', f);
    return !existsSync(golden) || !readFileSync(join(dirBuild, f)).equals(readFileSync(golden));
  });
  if (diferite.length === 0) {
    t.diagnostic('grafic: build identic cu golden-ul');
    return;
  }
  const dirSalvat = join(tmpdir(), 'mg-acceptare-grafic-golden');
  mkdirSync(dirSalvat, { recursive: true });
  for (const f of diferite) copyFileSync(join(dirBuild, f), join(dirSalvat, f));
  assert.fail(`build/${diferite.join(' și build/')} diferă de teste/golden/grafic/. Build-ul real e salvat în ${dirSalvat}.`);
}

/**
 * @param {string} proiect numele proiectului din video/
 * @param {{tema?: string|null, sigla?: boolean, muzica?: boolean}} [variatie] puse peste exemplul din spec
 */
async function ruleazaGrafic(t, proiect, { tema = null, sigla = false, muzica = false } = {}) {
  const dirProiect = join(R, 'video', proiect);
  const caleScenariu = join(dirProiect, 'scenariu.md');
  const caleMp4 = join(dirProiect, `${proiect}.mp4`);
  const date = citesteJson(join(DIR_SABLON, 'exemple', 'grafic.date.json'));
  if (tema) date.stil = { ...date.stil, tema };
  if (sigla) date.sigla = 'resurse/sigla.svg';
  if (muzica) date.muzica = { fisier: 'resurse/muzica.mp3', volum: 0.4, incepe_de_la: 0 };
  const variat = tema !== null || sigla || muzica;

  // 1. mg nou, apoi „agentul” scrie date.json și pune resursele în resurse/
  let r = await mg(['nou', proiect, '--sablon', 'date-serie', '--json'], 5 * MINUT);
  assert.equal(r.cod, 0, rezumat(r));
  if (variat) writeFileSync(join(dirProiect, 'date.json'), `${JSON.stringify(date, null, 2)}\n`);
  else copyFileSync(join(DIR_SABLON, 'exemple', 'grafic.date.json'), join(dirProiect, 'date.json'));
  if (sigla || muzica) mkdirSync(join(dirProiect, 'resurse'), { recursive: true });
  if (sigla) copyFileSync(SIGLA, join(dirProiect, 'resurse', 'sigla.svg'));
  if (muzica) copyFileSync(MUZICA, join(dirProiect, 'resurse', 'muzica.mp3'));

  // 2. --doar-verificare: validare (S03-S05), așezarea, cronologia, props.json, C10 (bundle, compositions), C17, blocul scenariului
  r = await mg(['randeaza', proiect, '--doar-verificare', '--json'], 15 * MINUT);
  assert.equal(r.cod, 0, rezumat(r));
  assert.equal(r.json.ok, true, rezumat(r));
  let v = citesteJson(join(dirProiect, 'verificare.json'));
  assert.equal(v.mod, 'doar-verificare');
  assert.equal(v.ok, true, verificariPicate(v));
  for (const cod of ['C10', 'C17', 'S03', 'S04', 'S05']) assert.equal(v.verificari.find((x) => x.cod === cod)?.ok, true, `${cod} după --doar-verificare`);
  const bloc = extrageBlocMg(readFileSync(caleScenariu, 'utf8'));
  assert.ok(bloc, 'scenariu.md nu are blocul mg după --doar-verificare');
  const zona = extrageZonaTexte(bloc.bloc);
  for (const [i, scena] of date.scene.entries()) {
    for (const rand of scena.titlu ?? []) assert.ok(zona.includes(`„${textAfisat(rand)}”`), `Scena ${i + 1}: „${textAfisat(rand)}” lipsește din „Texte și cifre”`);
  }
  const props = citesteJson(join(dirProiect, 'build', 'props.json'));
  assert.equal(props.cadre, CADRE);
  assert.equal(props.muzica, muzica ? 'assets/muzica.m4a' : null);
  if (muzica) assert.ok(existsSync(join(dirProiect, 'build', 'assets', 'muzica.m4a')), 'lipsește build/assets/muzica.m4a');
  if (sigla) {
    assert.equal(props.sigla?.url, 'sigla.svg');
    assert.ok(existsSync(join(dirProiect, 'build', 'sigla.svg')), 'lipsește build/sigla.svg');
  } else {
    assert.equal(props.sigla, null);
  }
  if (!variat) comparaCuGolden(t, join(dirProiect, 'build'));

  // 3. --schita, înainte de aprobare: MP4-ul schiței la jumătate și foaia, fără MP4-ul proiectului (decizia 8)
  r = await mg(['randeaza', proiect, '--schita', '--json'], 20 * MINUT);
  assert.equal(r.cod, 0, rezumat(r));
  v = citesteJson(join(dirProiect, 'verificare.json'));
  assert.equal(v.mod, 'schita');
  assert.equal(v.ok, true, verificariPicate(v));
  assert.equal(v.schita.check_la_tranzitii, null, 'Remotion nu are check la tranziții');
  assert.ok(v.schita.foaie, 'verificare.json nu are foaia schiței');
  assert.ok(readdirSync(join(dirProiect, 'cadre')).some((n) => /^foaie-schita-\d+\.jpg$/.test(n)), 'lipsește cadre/foaie-schita-N.jpg');
  assert.equal(existsSync(caleMp4), false, '--schita nu scrie MP4');

  // 4. randarea completă fără aprobare e refuzată (C08)
  r = await mg(['randeaza', proiect, '--json'], 10 * MINUT);
  assert.notEqual(r.cod, 0, 'randarea completă a pornit fără aprobare');
  assert.ok(r.json.erori.some((e) => e.cod === 'aprobare-lipsa'), rezumat(r));

  // 5. aprobarea, exact ca hook-ul UserPromptSubmit la „aprob <proiect>”
  const raspuns = decideAprobare({
    session_id: 'acceptare-grafic', transcript_path: '', cwd: R, permission_mode: 'default',
    hook_event_name: 'UserPromptSubmit', prompt: `aprob ${proiect}`,
  }, R, ACUM);
  assert.equal(raspuns.cod, 0);
  assert.equal(citesteJson(join(dirProiect, 'motor.lock')).aprobare.sha256_scenariu, sha256Fisier(caleScenariu));

  // 6. randarea completă (cronometrată), verificările pe MP4 cu S06 și S07, foaia, verificare.json
  const t0 = performance.now();
  r = await mg(['randeaza', proiect, '--json'], 45 * MINUT);
  const secundeRandare = Math.round((performance.now() - t0) / 1000);
  assert.equal(r.cod, 0, rezumat(r));
  v = citesteJson(join(dirProiect, 'verificare.json'));
  assert.equal(v.mod, 'complet');
  assert.equal(v.ok, true, verificariPicate(v));
  assert.equal(v.mp4, `video/${proiect}/${proiect}.mp4`);
  assert.equal(v.sha256_mp4, sha256Fisier(caleMp4));
  assert.equal(v.obligatorii.length, OBLIGATORII, 'C01-C17, S01-S09');
  for (const cod of v.obligatorii) assert.ok(v.verificari.some((x) => x.cod === cod && x.ok === true), `${cod} nu are un rezultat verde`);
  t.diagnostic(`randare ${proiect}: ${secundeRandare} s; S06 ${valoare(v, 'S06')}; S07 ${valoare(v, 'S07')}; C12 ${valoare(v, 'C12')}; C13 ${valoare(v, 'C13')}; C14 ${valoare(v, 'C14')}`);
  // decizia 4: adaptorul Remotion păstrează bundle-ul pentru următoarea randare
  const bundleuri = existsSync(join(dirProiect, '.cache')) ? readdirSync(join(dirProiect, '.cache')).filter((n) => /^bundle-[0-9a-f]{16}$/.test(n)) : [];
  assert.equal(bundleuri.length, 1, `.cache trebuia să aibă un singur bundle: ${bundleuri.join(', ')}`);
  assert.ok(existsSync(join(dirProiect, '.cache', bundleuri[0], '.gata')), 'bundle-ul din .cache nu are marcajul .gata');
  const cadre = readdirSync(join(dirProiect, 'cadre'));
  assert.ok(cadre.includes('predare-1.png') && cadre.includes('predare-2.png'), `lipsesc cadrele de predare: ${cadre.join(', ')}`);
  assert.ok(cadre.some((n) => /^foaie-\d+\.jpg$/.test(n)), 'lipsește foaia de contact cadre/foaie-N.jpg');
  const cronologie = citesteJson(join(dirProiect, 'build', 'cronologie.json'));
  const info = await probeazaMp4(caleMp4, { ffprobe: ff.ffprobe });
  assert.equal(info.video.codec, 'h264');
  assert.equal(info.video.pix_fmt, 'yuv420p', 'fără --color-space=bt709, Remotion scrie yuvj420p (decizia 7)');
  assert.equal(info.video.latime, 1080);
  assert.equal(info.video.inaltime, 1920);
  assert.equal(info.video.fps, 30);
  assert.equal(info.video.cadre, CADRE);
  if (muzica) {
    assert.equal(info.audio?.codec, 'aac');
    assert.ok(Math.abs(info.audio.durata - cronologie.durata) <= 0.05, `durata pistei ${info.audio.durata}`);
    t.diagnostic(`C15 ${proiect}: ${valoare(v, 'C15')}`);
  } else {
    assert.equal(info.audio, null, 'fără muzică, MP4-ul e mut');
  }
  assert.ok(Math.abs(info.durata - cronologie.durata) <= 1 / 30, `durata MP4 ${info.durata} față de ${cronologie.durata}`);

  // 7. predarea trece de hook-ul Stop
  const stop = decideStop({
    session_id: 'acceptare-grafic', transcript_path: '', cwd: R, permission_mode: 'default',
    hook_event_name: 'Stop', stop_hook_active: false,
    last_assistant_message: `Videoul e gata.\nPredare: video/${proiect}/${proiect}.mp4`,
  }, R);
  assert.equal(stop.cod, 0);
  assert.equal(stop.stdout, '', `hook-ul Stop a blocat predarea: ${stop.stdout}`);
}

test('exemplul din spec, golden-ul și resursele variantelor există', () => {
  assert.ok(existsSync(join(DIR_SABLON, 'exemple', 'grafic.date.json')));
  for (const f of ['props.json', 'cronologie.json']) assert.ok(existsSync(join(DIR_SABLON, 'teste', 'golden', 'grafic', f)), `golden/grafic/${f}`);
  assert.ok(existsSync(SIGLA), SIGLA);
  assert.ok(existsSync(MUZICA), MUZICA);
});

const OPT = { skip: motivSarit, timeout: 60 * MINUT };

test('acceptare grafic: exemplul din spec, noapte (titlu, cifră, bare, comparație, final; 672 de cadre)', OPT, (t) => ruleazaGrafic(t, 'grafic'));
test('acceptare grafic: hârtie, cu sigla în scena final', OPT, (t) => ruleazaGrafic(t, 'grafic-hartie', { tema: 'hartie', sigla: true }));
test('acceptare grafic: curat, cu muzica cursantului (pista AAC, C15)', OPT, (t) => ruleazaGrafic(t, 'grafic-muzica', { tema: 'curat', muzica: true }));
