// Acceptarea lui overlay-filmare pe motorul real (spec 7.4, „Testul de acceptare”): ambele exemple trec drumul întreg,
// din rădăcina temporară a lui radacinaCuMotoare (cale cu spațiu și diacritice): mg nou cu filmarea (verticalul cu
// transcrierea Parakeet, măsurată pe stabilitate și apoi înlocuită cu cea comisă, decizia 29; orizontalul cu importul
// .srt, decizia 15), --doar-verificare, --schita, refuzul fără aprobare,
// aprobarea prin hook, randarea completă cu S09 și S10, probele MP4 și predarea prin hook-ul Stop. Al treilea caz e
// verticalul cu începutul tăiat (filmare.start nenul, calea obișnuită când cursantul lasă o secundă de liniște): HyperFrames
// trebuie să respecte data-media-start pe <video> și <audio>, iar C12-C14 și S10 să compare cu sursa decalată la fel.
// Rulează doar cu MG_TESTE_INTEGRARE=1. Timpul randării complete se tipărește (t.diagnostic) pentru SABLON.md (H16).
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { copyFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { radacinaAgent } from '../../nucleu/lib/cai.mjs';
import { citesteJson, scrieJsonAtomic, sha256Fisier } from '../../nucleu/lib/fisiere.mjs';
import { citesteLock, scrieLock } from '../../nucleu/lib/lock.mjs';
import { raportTranscriere } from '../../nucleu/lib/filmare/transcriere.mjs';
import { wer } from '../../unelte/wer/masoara.mjs';
import { descarcaRezerva, platforma, probeazaMp4, rezolvaFfmpeg } from '../../nucleu/lib/ffmpeg.mjs';
import { ruleazaHyperframes } from '../../nucleu/lib/motor-hf.mjs';
import { extrageBlocMg, extrageZonaTexte } from '../../nucleu/lib/scenariu.mjs';
import { textAfisat } from '../../nucleu/lib/text.mjs';
import { decideAprobare } from '../../nucleu/lib/garda/aprobare.mjs';
import { decideStop } from '../../nucleu/lib/garda/stop.mjs';
import { radacinaCuMotoare } from '../ajutoare/radacina-motoare.mjs';

const REPO = radacinaAgent(import.meta.url, 2);
const DIR_SABLON = join(REPO, 'motoare', 'hyperframes', 'sabloane', 'overlay-filmare');
const ACUM = new Date('2026-10-18T10:00:00.000Z');
const MINUT = 60 * 1000;
const DIMENSIUNI = Object.freeze({ vertical: [1080, 1920], orizontal: [1920, 1080] });
// Abaterea maximă (WER) a transcrierii Parakeet de pe platforma curentă față de cea comisă (făcută pe Mac). Pe Mac e 0;
// pe Windows (H17, 2026-10-19) 4 erori din 51 de cuvinte = 0,078. Limita 0,15 (cam 7 cuvinte din 51) lasă marjă dublă.
const WER_MAX_PARAKEET = 0.15;
const OBLIGATORII = 24; // C01-C14, C16, C17, S01-S06, S09, S10 (decizia 4)
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
const valoare = (v, cod) => JSON.stringify(v.verificari.find((x) => x.cod === cod)?.valoare);

function comparaCuGolden(t, exemplu, dirBuild) {
  const diferite = ['plan.json', 'index.html'].filter((f) => !readFileSync(join(dirBuild, f)).equals(readFileSync(join(DIR_SABLON, 'teste', 'golden', exemplu, f))));
  assert.deepEqual(diferite, [], `build/${diferite.join(' și build/')} diferă de teste/golden/${exemplu}/, deși transcrierea e cea comisă. Build-ul real e în ${dirBuild}.`);
  t.diagnostic(`${exemplu}: build identic cu golden-ul`);
}

/** Textele elementelor, cum apar în zona „Texte și cifre” (doar câmpurile scurte, fără citate și puncte). */
const texteScurte = (date) => date.elemente.flatMap((e) => [e.nume, ...(e.titlu ?? []), e.cta].filter((x) => typeof x === 'string'));

async function ruleazaExemplu(t, exemplu, { importSrt, start = null }) {
  const proiect = start === null ? exemplu : `${exemplu}-start`;
  const dirProiect = join(R, 'video', proiect);
  const caleScenariu = join(dirProiect, 'scenariu.md');
  const caleMp4 = join(dirProiect, `${proiect}.mp4`);
  const dirExemplu = join(DIR_SABLON, 'exemple', exemplu);
  const date = citesteJson(join(dirExemplu, 'date.json'));
  // începutul tăiat: aceleași date, cu filmare.start; ancorele cad după start, deci rămân în porțiunea aleasă (S02)
  if (start !== null) date.filmare = { ...date.filmare, start };

  // 1. mg nou cu filmarea (copia de lucru, transcrierea, raportul), apoi „agentul” scrie date.json
  const transcriere = importSrt ? ['--transcriere', join(dirExemplu, 'transcriere.srt')] : ['--instaleaza-transcrierea'];
  let r = await mg(['nou', proiect, '--sablon', 'overlay-filmare', '--filmare', join(dirExemplu, 'filmare.mp4'), ...transcriere, '--json'], 60 * MINUT);
  assert.equal(r.cod, 0, rezumat(r));
  for (const f of ['resurse/filmare-original.mp4', 'active/filmare-lucru.mp4', 'active/transcriere.json', 'active/raport.json']) {
    assert.ok(existsSync(join(dirProiect, ...f.split('/'))), `${f} lipsește după mg nou`);
  }
  const transcrisa = citesteJson(join(dirProiect, 'active', 'transcriere.json'));
  assert.equal(transcrisa.sursa, importSrt ? 'import' : 'parakeet');
  if (!importSrt) {
    // Stabilitatea Parakeet pe platforma curentă, măsurată pe transcrierea tocmai produsă. WER-ul față de transcrierea
    // comisă pe Mac măsoară stabilitatea inferenței între platforme, nu corectitudinea transcrierii.
    const comisa = citesteJson(join(dirExemplu, 'transcriere.json'));
    const text = (tr) => tr.cuvinte.map((c) => c.text).join(' ');
    const abatere = wer(text(comisa), text(transcrisa));
    t.diagnostic(`parakeet ${platforma()}: WER față de transcrierea comisă ${abatere.wer.toFixed(4)} (${abatere.erori} erori din ${abatere.cuvinte} cuvinte; limita ${WER_MAX_PARAKEET})`);
    assert.ok(abatere.wer <= WER_MAX_PARAKEET, `transcrierea Parakeet se abate cu WER ${abatere.wer.toFixed(4)} (${abatere.erori}/${abatere.cuvinte}) de cea comisă; limita ${WER_MAX_PARAKEET}`);
    // Validarea reală a raportului Parakeet al platformei (verificaRaport: cuvinte pe secundă, simboluri, durate, limba),
    // pe date.json-ul minim scris de mg nou (fără corecturi și ancore), înainte ca raportul să fie înlocuit.
    const minim = await mg(['randeaza', proiect, '--doar-verificare', '--json'], 15 * MINUT);
    assert.equal(minim.cod, 0, rezumat(minim));
    assert.equal(minim.json.ok, true, rezumat(minim));
    assert.equal([...minim.json.erori, ...minim.json.avertismente].some((x) => x.cod === 'overlay-filmare-transcriere-slaba'), false, rezumat(minim));
    // Decizia 29 (H17): Parakeet nu dă același text pe Mac și pe Windows, iar date.json (corecturi, ancore) și golden-ul
    // sunt făcute pe textul de pe Mac. Doar în acceptare, testul înlocuiește artefactele lui mg nou cu cele comise, ca planul,
    // compoziția și golden-ul să fie aceleași pe orice platformă. Funcțiile sunt cele ale nucleului: lista brută se
    // reface din cuvintele comise (brutul Parakeet nu se comite), raportul se recalculează cu raportTranscriere, iar
    // sha256-ul din motor.lock cu sha256Fisier.
    const dirActive = join(dirProiect, 'active');
    copyFileSync(join(dirExemplu, 'transcriere.json'), join(dirActive, 'transcriere.json'));
    const brut = comisa.cuvinte.map(({ text: cuvant, start, end }) => ({ text: cuvant, start, end }));
    scrieJsonAtomic(join(dirActive, 'transcriere.brut.json'), brut);
    scrieJsonAtomic(join(dirActive, 'raport.json'), raportTranscriere(comisa, brut));
    const lock = citesteLock(join(dirProiect, 'motor.lock'));
    lock.filmare.transcriere.sha256 = sha256Fisier(join(dirActive, 'transcriere.json'));
    scrieLock(join(dirProiect, 'motor.lock'), lock);
  }
  if (start === null) copyFileSync(join(dirExemplu, 'date.json'), join(dirProiect, 'date.json'));
  else scrieJsonAtomic(join(dirProiect, 'date.json'), date);

  // 2. --doar-verificare: valideaza (S01-S06), planul, build-ul, check --strict cu banda subtitrărilor, blocul scenariului
  r = await mg(['randeaza', proiect, '--doar-verificare', '--json'], 15 * MINUT);
  assert.equal(r.cod, 0, rezumat(r));
  assert.equal(r.json.ok, true, rezumat(r));
  let v = citesteJson(join(dirProiect, 'verificare.json'));
  assert.equal(v.mod, 'doar-verificare');
  assert.equal(v.ok, true, verificariPicate(v));
  for (const cod of ['S01', 'S02', 'S03', 'S04', 'S05', 'S06']) assert.equal(v.verificari.find((x) => x.cod === cod)?.ok, true, `${cod} după --doar-verificare`);
  const bloc = extrageBlocMg(readFileSync(caleScenariu, 'utf8'));
  assert.ok(bloc, 'scenariu.md nu are blocul mg după --doar-verificare');
  const zona = extrageZonaTexte(bloc.bloc);
  for (const text of texteScurte(date)) assert.ok(zona.includes(`„${textAfisat(text)}”`), `„${textAfisat(text)}” lipsește din „Texte și cifre”`);
  const html = readFileSync(join(dirProiect, 'build', 'index.html'), 'utf8');
  assert.equal(html.includes('const TRANSCRIPT = [') || html.includes('const script = ['), false, 'transcribe a rescris index.html');
  // data-media-start de pe video și audio trebuie să fie plan.start (filmare.start), nu 0 la întâmplare
  const plan = citesteJson(join(dirProiect, 'build', 'plan.json'));
  const durataLucru = citesteLock(join(dirProiect, 'motor.lock')).filmare.durata;
  assert.equal(plan.start, start ?? 0, 'plan.start trebuie să fie filmare.start');
  assert.ok(Math.abs(plan.durata - (durataLucru - (start ?? 0))) < 1e-3, `plan.durata ${plan.durata} față de copia de lucru ${durataLucru} minus start ${start ?? 0}`);
  for (const eticheta of ['video', 'audio']) {
    const tag = html.match(new RegExp(`<${eticheta}\\b[^>]*>`))?.[0] ?? '';
    const media = Number(tag.match(/data-media-start="([^"]*)"/)?.[1]);
    assert.ok(Math.abs(media - plan.start) < 1e-6, `data-media-start pe <${eticheta}> (${media}) diferă de plan.start (${plan.start})`);
  }
  // golden-ul vertical se compară mereu: după înlocuire, transcrierea e cea comisă pe orice platformă; importul (orizontal) nu se compară
  if (importSrt) t.diagnostic(`${exemplu}: transcriere importată, fără comparație cu golden-ul`);
  else if (start !== null) t.diagnostic(`${proiect}: filmare.start ${start} s, fără comparație cu golden-ul (alt plan)`);
  else comparaCuGolden(t, exemplu, join(dirProiect, 'build'));

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
    session_id: 'acceptare-overlay', transcript_path: '', cwd: R, permission_mode: 'default',
    hook_event_name: 'UserPromptSubmit', prompt: `aprob ${proiect}`,
  }, R, ACUM);
  assert.equal(raspuns.cod, 0);
  assert.equal(citesteJson(join(dirProiect, 'motor.lock')).aprobare.sha256_scenariu, sha256Fisier(caleScenariu));

  // 6. randarea completă (cronometrată), verificările pe MP4 cu S09 și S10, foaia, verificare.json
  const t0 = performance.now();
  r = await mg(['randeaza', proiect, '--json'], 60 * MINUT);
  const secundeRandare = Math.round((performance.now() - t0) / 1000);
  assert.equal(r.cod, 0, rezumat(r));
  v = citesteJson(join(dirProiect, 'verificare.json'));
  assert.equal(v.mod, 'complet');
  assert.equal(v.ok, true, verificariPicate(v));
  assert.equal(v.mp4, `video/${proiect}/${proiect}.mp4`);
  assert.equal(v.sha256_mp4, sha256Fisier(caleMp4));
  assert.equal(v.obligatorii.length, OBLIGATORII, 'C01-C14, C16, C17, S01-S06, S09, S10');
  for (const cod of v.obligatorii) assert.ok(v.verificari.some((x) => x.cod === cod && x.ok === true), `${cod} nu are un rezultat verde`);
  // comparate cu sursa decalată cu filmare.start (decizia 12) și banda liberă față de copia de lucru (S10)
  for (const cod of ['C12', 'C13', 'C14', 'S10']) assert.equal(v.verificari.find((x) => x.cod === cod)?.ok, true, `${cod} pe randarea completă`);
  t.diagnostic(`randare ${proiect}: ${secundeRandare} s; S09 ${valoare(v, 'S09')}; S10 ${valoare(v, 'S10')}; C12 ${valoare(v, 'C12')}; C13 ${valoare(v, 'C13')}; C14 ${valoare(v, 'C14')}`);
  assert.equal(existsSync(join(dirProiect, '.cache')), false, '.cache trebuia golit după randarea completă');
  const cadre = readdirSync(join(dirProiect, 'cadre'));
  assert.ok(cadre.includes('predare-1.png') && cadre.includes('predare-2.png'), `lipsesc cadrele de predare: ${cadre.join(', ')}`);
  const foi = cadre.filter((n) => /^foaie-\d+\.json$/.test(n));
  assert.ok(foi.length > 0 && cadre.some((n) => /^foaie-\d+\.jpg$/.test(n)), `lipsește foaia de contact: ${cadre.join(', ')}`);
  assert.ok(foi.some((n) => /"rostit":\s*"[^"]+"/.test(readFileSync(join(dirProiect, 'cadre', n), 'utf8'))), 'foaia nu are cuvintele rostite');
  const cronologie = citesteJson(join(dirProiect, 'build', 'cronologie.json'));
  const [latime, inaltime] = DIMENSIUNI[date.format];
  const info = await probeazaMp4(caleMp4, { ffprobe: ff.ffprobe });
  assert.equal(info.video.codec, 'h264');
  assert.equal(info.video.pix_fmt, 'yuv420p');
  assert.equal(info.video.latime, latime);
  assert.equal(info.video.inaltime, inaltime);
  assert.equal(info.video.fps, 30);
  assert.equal(info.audio?.codec, 'aac', 'vocea filmării lipsește din MP4');
  assert.ok(Math.abs(info.audio.durata - cronologie.durata) <= 0.05, `durata pistei ${info.audio.durata}`);
  assert.ok(Math.abs(info.durata - cronologie.durata) <= 1 / 30, `durata MP4 ${info.durata} față de ${cronologie.durata}`);

  // 7. predarea trece de hook-ul Stop
  const stop = decideStop({
    session_id: 'acceptare-overlay', transcript_path: '', cwd: R, permission_mode: 'default',
    hook_event_name: 'Stop', stop_hook_active: false,
    last_assistant_message: `Videoul e gata.\nPredare: video/${proiect}/${proiect}.mp4`,
  }, R);
  assert.equal(stop.cod, 0);
  assert.equal(stop.stdout, '', `hook-ul Stop a blocat predarea: ${stop.stdout}`);
}

test('exemplele au filmarea, transcrierea, .srt-ul orizontalului, date.json și golden-urile', () => {
  for (const f of ['vertical/filmare.mp4', 'vertical/transcriere.json', 'vertical/date.json', 'orizontal/filmare.mp4', 'orizontal/transcriere.json', 'orizontal/transcriere.srt', 'orizontal/date.json']) {
    assert.ok(existsSync(join(DIR_SABLON, 'exemple', ...f.split('/'))), f);
  }
  for (const n of ['vertical', 'orizontal']) for (const f of ['plan.json', 'index.html']) assert.ok(existsSync(join(DIR_SABLON, 'teste', 'golden', n, f)), `golden/${n}/${f}`);
});

const OPT = { skip: motivSarit, timeout: 120 * MINUT };

test('acceptare overlay vertical (transcrierea Parakeet, corectură, evidențiere, nume, cifră, listă, final)', OPT, (t) => ruleazaExemplu(t, 'vertical', { importSrt: false }));
test('acceptare overlay orizontal (import .srt, hârtie, ritm calm, titlu, listă, citat)', OPT, (t) => ruleazaExemplu(t, 'orizontal', { importSrt: true }));
test('acceptare overlay vertical cu începutul tăiat (filmare.start 0,6 s: data-media-start, C12-C14 și S10 pe sursa decalată)', OPT,
  (t) => ruleazaExemplu(t, 'vertical', { importSrt: false, start: 0.6 }));
