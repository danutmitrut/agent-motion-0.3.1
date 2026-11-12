// Adaptorul Remotion (planul I, I03): lansarea, parserele pe ieșirea reală a lui Remotion 4.0.529, bundle-ul în cache
// după hash și C10 și C17, cu `ruleaza` injectat (fără Remotion instalat). Randarea reală e în teste/integrare/remotion.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { caiProiect, radacinaAgent } from '../../nucleu/lib/cai.mjs';
import { COD_IESIRE, EroareFatala } from '../../nucleu/lib/erori.mjs';
import { probeazaMp4, rezolvaFfmpeg, ruleazaFfmpeg } from '../../nucleu/lib/ffmpeg.mjs';
import { stergeRecursiv } from '../../nucleu/lib/fisiere.mjs';
import { adaptorMotor } from '../../nucleu/lib/motoare/index.mjs';
import {
  argumenteRandareRemotion, asiguraBundle, cheieBundle, creeazaAdaptorRemotion, eroareaRemotion, parseazaCompozitii,
  rezolvaBinRemotion, ruleazaRemotion, taieLaDurata,
} from '../../nucleu/lib/motoare/remotion.mjs';
import { textRandeaza } from '../../nucleu/mg.mjs';
import { eroareRandare } from '../../nucleu/lib/randeaza/index.mjs';
import { valideazaConstruit } from '../../nucleu/lib/randeaza/construit.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';

const VERSIUNI = Object.freeze({
  motoare: { remotion: { versiune: '4.0.529', lockfile_sha256: 'b'.repeat(64) } },
  gsap: { sha256: 'c'.repeat(64) },
});
const LISTA = '\nThe following compositions are available:\n\nProba    30      1080x1920      180 (6.00 sec)\n';
const PROPS = { latime: 1080, inaltime: 1920, fps: 30, cadre: 180, scene: [{ start: 0, cadre: 90, randuri: ['Primul rând', 'cu  accent'] }, { start: 90, cadre: 90, randuri: ['Ăîâșț ĂÎÂȘȚ'] }] };
const CRON = { latime: 1080, inaltime: 1920, fps: 30, durata: 6 };
const ASTEPTARI = { texte: [{ ref: 'Scena 1', text: 'Primul rând' }, { ref: 'Scena 1', text: 'cu accent' }, { ref: 'Scena 2', text: 'Ăîâșț ĂÎÂȘȚ' }] };
const CONSTRUIT = { intrare: 'props.json', fisiere: ['props.json'], motor: { props: 'props.json', compozitie: 'Proba' } };

/** O rădăcină cu Remotion „instalat” (doar package.json-ul pachetului), VERSIUNI.json și build/ al proiectului p. */
function pregateste({ versiune = '4.0.529', props = PROPS } = {}) {
  const r = creeazaRadacinaTemp({
    fisiere: {
      'motoare/remotion/node_modules/remotion/package.json': JSON.stringify({ name: 'remotion', version: versiune }),
      // schita și randeaza citesc VERSIUNI.json pentru cheia bundle-ului (I04)
      'nucleu/VERSIUNI.json': JSON.stringify(VERSIUNI),
      'video/p/build/props.json': JSON.stringify(props),
      'video/p/build/cronologie.json': '{}',
      'video/p/build/fonturi/inter-700-latin.woff2': 'font',
    },
  });
  const cai = caiProiect(r.radacina, 'p');
  const sablon = { nume: 'proba-remotion', motor: 'remotion', dir: path.join(r.radacina, 'motoare', 'remotion', 'sabloane', 'proba-remotion'), sha256: 'a'.repeat(64) };
  return { ...r, cai, sablon };
}

/** ruleaza fals: bundle scrie index.html în --out-dir, compositions întoarce lista dată. */
function ruleazaFals({ lista = LISTA, codBundle = 0, codCompozitii = 0 } = {}) {
  const apeluri = [];
  const ruleaza = async (argumente, optiuni) => {
    apeluri.push({ argumente, optiuni });
    if (argumente[0] === 'bundle') {
      if (codBundle !== 0) return { cod: codBundle, stdout: '', stderr: "Error: Module not found: Can't resolve './Lipsa'" };
      const out = argumente.find((a) => a.startsWith('--out-dir=')).slice('--out-dir='.length);
      fs.mkdirSync(path.join(out, 'public'), { recursive: true });
      fs.writeFileSync(path.join(out, 'index.html'), '<!DOCTYPE html>');
      return { cod: 0, stdout: '', stderr: '' };
    }
    if (argumente[0] === 'compositions') {
      if (codCompozitii !== 0) return { cod: codCompozitii, stdout: '\n\n', stderr: 'Error: props.cadre trebuie să fie un întreg pozitiv (primit: 0)\n    at metadate (http://localhost:3000/bundle.js:1:1)' };
      return { cod: 0, stdout: lista, stderr: '' };
    }
    return { cod: 1, stdout: '', stderr: `neașteptat: ${argumente[0]}` };
  };
  return { apeluri, ruleaza };
}

const bundleuri = (cai) => (fs.existsSync(cai.cache) ? fs.readdirSync(cai.cache).filter((n) => n.startsWith('bundle-')).sort() : []);

test('adaptorMotor(remotion): forma comună, camp mediu.remotion, reluarea cu --concurrency=1', () => {
  const a = adaptorMotor('remotion');
  assert.deepEqual(
    { nume: a.nume, eticheta: a.eticheta, camp: a.camp, descriereReluare: a.descriereReluare },
    { nume: 'remotion', eticheta: 'Remotion', camp: 'mediu.remotion', descriereReluare: '--concurrency=1' },
  );
  assert.equal(typeof a.verificaBuild, 'function');
  assert.ok(Object.isFrozen(a));
});

test('rezolvaBinRemotion: fără @remotion/cli dă motor-lipsa (cod 2); cu el, calea lui remotion-cli.js', (t) => {
  const r = creeazaRadacinaTemp();
  t.after(r.curata);
  assert.throws(() => rezolvaBinRemotion(r.radacina), (e) => e instanceof EroareFatala && e.eroareMg.cod === 'motor-lipsa'
    && e.eroareMg.camp === 'mediu.remotion' && e.codIesire === COD_IESIRE.MEDIU);
  const cli = path.join(r.radacina, 'motoare', 'remotion', 'node_modules', '@remotion', 'cli', 'remotion-cli.js');
  fs.mkdirSync(path.dirname(cli), { recursive: true });
  fs.writeFileSync(cli, '');
  assert.equal(rezolvaBinRemotion(r.radacina), cli);
});

test('ruleazaRemotion: folderul curent motoare/remotion, fără cheile API, cu DO_NOT_TRACK=1', async (t) => {
  const r = creeazaRadacinaTemp({
    fisiere: { 'motoare/remotion/cli fals.mjs': "process.stdout.write(JSON.stringify({ cwd: process.cwd(), arg: process.argv.slice(2), cheie: process.env.GEMINI_API_KEY ?? null, dnt: process.env.DO_NOT_TRACK }));\n" },
  });
  t.after(r.curata);
  const rez = await ruleazaRemotion(['compositions', 'x'], { radacina: r.radacina, bin: path.join(r.radacina, 'motoare', 'remotion', 'cli fals.mjs'), mediu: { ...process.env, gemini_api_key: 'valoare-de-test' } });
  assert.equal(rez.cod, 0, rez.stderr);
  const vazut = JSON.parse(rez.stdout);
  assert.equal(fs.realpathSync(vazut.cwd), fs.realpathSync(path.join(r.radacina, 'motoare', 'remotion')));
  assert.deepEqual([vazut.arg, vazut.cheie, vazut.dnt], [['compositions', 'x'], null, '1']);
});

test('parseazaCompozitii: lista reală a lui Remotion 4.0.529, cu și fără coduri ANSI', () => {
  const asteptat = [{ id: 'Proba', fps: 30, latime: 1080, inaltime: 1920, cadre: 180 }];
  assert.deepEqual(parseazaCompozitii(LISTA), asteptat);
  assert.deepEqual(parseazaCompozitii('\x1b[1mProba\x1b[22m    30      1080x1920      180 (6.00 sec)\r\n'), asteptat);
  assert.deepEqual(parseazaCompozitii('Grafic    30      1080x1920      672 (22.40 sec)\nSerie-1  25  1080x1080  50 (2.00 sec)\n'), [
    { id: 'Grafic', fps: 30, latime: 1080, inaltime: 1920, cadre: 672 },
    { id: 'Serie-1', fps: 25, latime: 1080, inaltime: 1080, cadre: 50 },
  ]);
  assert.deepEqual(parseazaCompozitii('\n\n'), []);
});

test('eroareaRemotion: rândul util, fără ProtocolError și fără stivă; altfel ultimele rânduri', () => {
  const randare = [
    'Was not able to close puppeteer page ProtocolError: Protocol error (Target.closeTarget): No target found for targetId',
    '    at createProtocolError (/x/Connection.js:239:25)',
    "  code: undefined,",
    '}',
    ' Error  Error: Could not find composition with ID Nimic. Available compositions: Proba',
    '    at /x/render.js:1:1',
  ].join('\n');
  assert.equal(eroareaRemotion(randare), 'Error: Could not find composition with ID Nimic. Available compositions: Proba');
  assert.equal(eroareaRemotion('Error: props.cadre trebuie să fie un întreg pozitiv (primit: 0)\n    at metadate (http://localhost:3000/bundle.js:1:1)'),
    'Error: props.cadre trebuie să fie un întreg pozitiv (primit: 0)');
  assert.equal(eroareaRemotion('ceva\naltceva'), 'ceva | altceva');
  assert.equal(eroareaRemotion(''), 'fără mesaj');
});

test('argumenteRandareRemotion: codecul, pixelii, bt709, concurența, scala doar la schiță', () => {
  assert.deepEqual(argumenteRandareRemotion({ bundle: 'B', compozitie: 'Proba', iesire: 'O.mp4', props: '/p/props.json' }), [
    'render', 'B', 'Proba', 'O.mp4', '--props=/p/props.json', '--codec=h264', '--pixel-format=yuv420p', '--color-space=bt709',
    '--concurrency=50%', '--log=error',
  ]);
  assert.deepEqual(argumenteRandareRemotion({ bundle: 'B', compozitie: 'Proba', iesire: 'O.mp4', props: 'P', scala: 0.5, concurenta: 1 }).slice(-3),
    ['--concurrency=1', '--scale=0.5', '--log=error']);
});

test('cheieBundle: 16 hex; se schimbă cu fișierele din build/ și cu șablonul, nu cu props.json sau cronologie.json', (t) => {
  const p = pregateste();
  t.after(p.curata);
  const cheie = () => cheieBundle({ sablon: p.sablon, dirBuild: p.cai.build, versiuni: VERSIUNI });
  const prima = cheie();
  assert.match(prima, /^[0-9a-f]{16}$/);
  fs.writeFileSync(path.join(p.cai.build, 'props.json'), '{"alt":1}');
  fs.writeFileSync(path.join(p.cai.build, 'cronologie.json'), '{"alt":1}');
  fs.writeFileSync(path.join(p.cai.build, 'randare.mp4'), 'mp4');
  assert.equal(cheie(), prima);
  fs.writeFileSync(path.join(p.cai.build, 'fonturi', 'inter-700-latin.woff2'), 'alt font');
  assert.notEqual(cheie(), prima);
  assert.notEqual(cheieBundle({ sablon: { ...p.sablon, sha256: 'd'.repeat(64) }, dirBuild: p.cai.build, versiuni: VERSIUNI }), cheie());
});

test('asiguraBundle: face bundle-ul o dată, îl refolosește, îl reface când se schimbă build/ și șterge bundle-ul vechi', async (t) => {
  const p = pregateste();
  t.after(p.curata);
  const { apeluri, ruleaza } = ruleazaFals();
  const prim = await asiguraBundle({ radacina: p.radacina, sablon: p.sablon, cai: p.cai, versiuni: VERSIUNI, ruleaza });
  assert.equal(prim.ok, true);
  assert.equal(prim.refolosit, false);
  assert.ok(fs.existsSync(path.join(prim.dir, '.gata')));
  assert.deepEqual(apeluri[0].argumente, [
    'bundle', path.join(p.sablon.dir, 'src', 'index.ts'), `--out-dir=${prim.dir}`, `--public-dir=${p.cai.build}`, '--log=error',
  ]);
  const doi = await asiguraBundle({ radacina: p.radacina, sablon: p.sablon, cai: p.cai, versiuni: VERSIUNI, ruleaza });
  assert.deepEqual([doi.ok, doi.refolosit, doi.dir, apeluri.length], [true, true, prim.dir, 1]);
  fs.writeFileSync(path.join(p.cai.build, 'fonturi', 'inter-700-latin.woff2'), 'alt font');
  const trei = await asiguraBundle({ radacina: p.radacina, sablon: p.sablon, cai: p.cai, versiuni: VERSIUNI, ruleaza });
  assert.equal(trei.refolosit, false);
  assert.notEqual(trei.dir, prim.dir);
  assert.deepEqual(bundleuri(p.cai), [path.basename(trei.dir)]);
});

test('asiguraBundle: un bundle picat nu lasă nici folder, nici .gata', async (t) => {
  const p = pregateste();
  t.after(p.curata);
  const { ruleaza } = ruleazaFals({ codBundle: 1 });
  const r = await asiguraBundle({ radacina: p.radacina, sablon: p.sablon, cai: p.cai, versiuni: VERSIUNI, ruleaza });
  assert.equal(r.ok, false);
  assert.match(r.stderr, /Module not found/);
  assert.deepEqual(bundleuri(p.cai), []);
});

test('verificaBuild Remotion: C10 și C17 verzi pe un build bun', async (t) => {
  const p = pregateste();
  t.after(p.curata);
  const { apeluri, ruleaza } = ruleazaFals();
  const [c10, c17] = await creeazaAdaptorRemotion({ ruleaza }).verificaBuild({
    radacina: p.radacina, cai: p.cai, sablon: p.sablon, construit: CONSTRUIT, cronologie: CRON, asteptari: ASTEPTARI, versiuni: VERSIUNI,
  });
  assert.equal(c10.cod, 'C10');
  assert.equal(c10.ok, true, JSON.stringify(c10.erori));
  assert.deepEqual(c10.valoare.compozitie, { id: 'Proba', fps: 30, latime: 1080, inaltime: 1920, cadre: 180 });
  assert.equal(c10.prag.cadre, 180);
  assert.equal(c17.cod, 'C17');
  assert.equal(c17.ok, true, JSON.stringify(c17.erori));
  assert.deepEqual(apeluri.map((a) => a.argumente[0]), ['bundle', 'compositions']);
  assert.deepEqual(apeluri[1].argumente.slice(2), [`--props=${path.join(p.cai.build, 'props.json')}`]);
});

test('verificaBuild Remotion: altă versiune instalată dă motor-versiune, fără bundle', async (t) => {
  const p = pregateste({ versiune: '4.0.530' });
  t.after(p.curata);
  const { apeluri, ruleaza } = ruleazaFals();
  const [c10] = await creeazaAdaptorRemotion({ ruleaza }).verificaBuild({
    radacina: p.radacina, cai: p.cai, sablon: p.sablon, construit: CONSTRUIT, cronologie: CRON, asteptari: ASTEPTARI, versiuni: VERSIUNI,
  });
  assert.equal(c10.ok, false);
  assert.deepEqual(c10.erori.map((e) => [e.cod, e.camp]), [['motor-versiune', 'mediu.remotion']]);
  assert.equal(apeluri.length, 0);
});

test('verificaBuild Remotion: bundle picat, compoziție lipsă, alt număr de cadre, metadate care aruncă', async (t) => {
  const p = pregateste();
  t.after(p.curata);
  const cu = async (optiuni, cronologie = CRON) => (await creeazaAdaptorRemotion({ ruleaza: ruleazaFals(optiuni).ruleaza }).verificaBuild({
    radacina: p.radacina, cai: p.cai, sablon: p.sablon, construit: CONSTRUIT, cronologie, asteptari: ASTEPTARI, versiuni: VERSIUNI,
  }))[0];
  let c10 = await cu({ codBundle: 1 });
  assert.deepEqual(c10.erori.map((e) => e.cod), ['bundle-esuat']);
  assert.match(c10.erori[0].mesaj, /Module not found/);
  c10 = await cu({ lista: 'Alta    30      1080x1920      180 (6.00 sec)\n' });
  assert.deepEqual(c10.erori.map((e) => e.cod), ['compozitie-invalida']);
  assert.match(c10.erori[0].mesaj, /nu are compoziția Proba \(găsite: Alta\)/);
  c10 = await cu({}, { ...CRON, durata: 7 });
  assert.deepEqual(c10.erori.map((e) => e.cod), ['compozitie-invalida']);
  assert.match(c10.erori[0].mesaj, /cadre 180 în loc de 210/);
  c10 = await cu({ codCompozitii: 1 });
  assert.match(c10.erori[0].mesaj, /props\.cadre trebuie să fie un întreg pozitiv/);
});

test('verificaBuild Remotion: adresă http în build dă build-cu-retea; un text care lipsește din props dă C17 picat', async (t) => {
  const p = pregateste({ props: { ...PROPS, scene: [{ randuri: ['Primul rând', 'https://exemplu.ro'] }] } });
  t.after(p.curata);
  const [c10, c17] = await creeazaAdaptorRemotion({ ruleaza: ruleazaFals().ruleaza }).verificaBuild({
    radacina: p.radacina, cai: p.cai, sablon: p.sablon, construit: CONSTRUIT, cronologie: CRON, asteptari: ASTEPTARI, versiuni: VERSIUNI,
  });
  assert.deepEqual(c10.erori.map((e) => [e.cod, e.camp]), [['build-cu-retea', 'fisier:build/props.json']]);
  assert.equal(c17.ok, false);
  assert.deepEqual(c17.erori.map((e) => [e.cod, e.camp]), [['text-lipsa-din-build', 'fisier:build/props.json'], ['text-lipsa-din-build', 'fisier:build/props.json']]);
  assert.match(c17.erori[0].mesaj, /Scena 1: textul „cu accent” nu apare ca valoare în build\/props\.json/);
});

test('valideazaConstruit pe Remotion: motor cu exact props și compozitie; HyperFrames neschimbat', () => {
  assert.doesNotThrow(() => valideazaConstruit(CONSTRUIT, 'x', 'remotion'));
  const cu = (motor, fisiere = ['props.json']) => () => valideazaConstruit({ intrare: 'props.json', fisiere, motor }, 'x', 'remotion');
  assert.throws(cu(undefined), /motor trebuie să fie un obiect \{ props, compozitie \}/);
  assert.throws(cu({ props: 'props.json' }), /motor\.compozitie/);
  assert.throws(cu({ props: 'props.json', compozitie: 'Grafic nou' }), /motor\.compozitie/);
  assert.throws(cu({ props: 'props.json', compozitie: 'Grafic', randare: { argumente: [] } }), /chei necunoscute: randare/);
  assert.throws(cu({ props: '../props.json', compozitie: 'Grafic' }), /motor\.props trebuie să fie o cale relativă/);
  assert.throws(cu({ props: 'date.json', compozitie: 'Grafic' }), /motor\.props \(date\.json\) nu e în fisiere/);
  // HyperFrames: props și compozitie rămân doar rezervate, ca până acum
  assert.doesNotThrow(() => valideazaConstruit({ intrare: 'index.html', fisiere: ['index.html'], motor: { props: 'p.json', compozitie: 'X' } }, 'x'));
  assert.doesNotThrow(() => valideazaConstruit({ intrare: 'index.html', fisiere: ['index.html'] }, 'x', 'hyperframes'));
});

/** ruleaza fals pentru randare: bundle-ul ca mai sus; render scrie fișierul sau pică, după `pica(argumente, n)`. */
function ruleazaRandare(pica) {
  const { ruleaza: deBaza } = ruleazaFals();
  const randari = [];
  const ruleaza = async (argumente, optiuni) => {
    if (argumente[0] !== 'render') return deBaza(argumente, optiuni);
    randari.push(argumente);
    if (pica(argumente, randari.length)) {
      return { cod: 1, stdout: '', stderr: 'Was not able to close puppeteer page ProtocolError: x\n    at y (/z.js:1:1)\n Error  Error: Chrome a căzut' };
    }
    fs.mkdirSync(path.dirname(argumente[3]), { recursive: true });
    fs.writeFileSync(argumente[3], 'mp4');
    return { cod: 0, stdout: '', stderr: '' };
  };
  return { randari, ruleaza };
}

test('adaptorul Remotion are toate cele patru operații; curata lasă .cache (bundle-ul se refolosește)', (t) => {
  const p = pregateste();
  t.after(p.curata);
  const a = adaptorMotor('remotion');
  for (const f of ['verificaBuild', 'schita', 'randeaza', 'curata']) assert.equal(typeof a[f], 'function', f);
  fs.mkdirSync(path.join(p.cai.cache, 'bundle-0123456789abcdef'), { recursive: true });
  a.curata(p.cai);
  assert.ok(fs.existsSync(path.join(p.cai.cache, 'bundle-0123456789abcdef')));
});

test('randeaza Remotion: prima încercare la 50%, reluarea cu --concurrency=1, rândul util al erorii', async (t) => {
  const p = pregateste();
  t.after(p.curata);
  const iesire = path.join(p.cai.build, 'randare.mp4');
  // cronologia reală are mereu cheia audio (null fără muzică)
  const arg = { radacina: p.radacina, proiect: 'p', cai: p.cai, sablon: p.sablon, construit: CONSTRUIT, cronologie: { ...CRON, audio: null }, iesire };

  let f = ruleazaRandare(() => false);
  let r = await creeazaAdaptorRemotion({ ruleaza: f.ruleaza }).randeaza(arg);
  assert.deepEqual([r.ok, r.reluat], [true, false]);
  assert.equal(f.randari.length, 1);
  assert.deepEqual(f.randari[0].slice(0, 5), ['render', f.randari[0][1], 'Proba', iesire, `--props=${path.join(p.cai.build, 'props.json')}`]);
  assert.ok(f.randari[0].includes('--concurrency=50%'));

  fs.rmSync(iesire);
  f = ruleazaRandare((argumente, n) => n === 1);
  r = await creeazaAdaptorRemotion({ ruleaza: f.ruleaza }).randeaza(arg);
  assert.deepEqual([r.ok, r.reluat], [true, true]);
  assert.ok(f.randari[1].includes('--concurrency=1'));

  fs.rmSync(iesire);
  f = ruleazaRandare(() => true);
  r = await creeazaAdaptorRemotion({ ruleaza: f.ruleaza }).randeaza(arg);
  assert.deepEqual([r.ok, r.reluat, r.stderr], [false, true, 'Error: Chrome a căzut']);
  assert.equal(f.randari.length, 2);
});

test('schita Remotion: randare la jumătate în cadre/schita-N/schita.mp4; eșecul dă motor-esuat pe mediu.remotion', async (t) => {
  const p = pregateste();
  t.after(p.curata);
  const f = ruleazaRandare(() => true);
  const dirInstantanee = path.join(p.cai.cadre, 'schita-1');
  await assert.rejects(creeazaAdaptorRemotion({ ruleaza: f.ruleaza }).schita({
    radacina: p.radacina, proiect: 'p', cai: p.cai, sablon: p.sablon, construit: CONSTRUIT, cronologie: CRON,
    dirInstantanee, momente: [{ t: 1.5, ref: 'Scena 1', eticheta: 'Scena 1, mijloc' }], iesireJpg: 'x.jpg', iesireJson: 'x.json', ff: null,
  }), (e) => {
    assert.equal(e.eroareMg.cod, 'motor-esuat');
    assert.equal(e.eroareMg.camp, 'mediu.remotion');
    assert.match(e.eroareMg.mesaj, /Randarea schiței a eșuat: Error: Chrome a căzut/);
    assert.match(e.eroareMg.sugestie, /randeaza p --schita/);
    return true;
  });
  assert.equal(f.randari.length, 1, 'schița nu se reia');
  assert.equal(f.randari[0][3], path.join(dirInstantanee, 'schita.mp4'));
  assert.ok(f.randari[0].includes('--scale=0.5'));
});

test('taieLaDurata: pista audio mai lungă decât videoul se taie la durata cronologiei, fără recodare', async (t) => {
  const ff = await rezolvaFfmpeg(radacinaAgent(import.meta.url, 2));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg taie ă-'));
  t.after(() => stergeRecursiv(dir));
  const mp4 = path.join(dir, 'randare.mp4');
  // ca ieșirea lui Remotion cu muzică: video 22,4 s, pista AAC 22,4427 s
  const gen = await ruleazaFfmpeg(['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=64x64:r=30:d=22.4',
    '-f', 'lavfi', '-i', 'sine=f=440:sample_rate=48000:d=22.4427', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', mp4], { ffmpeg: ff.ffmpeg });
  assert.equal(gen.cod, 0, gen.stderr);
  assert.ok((await probeazaMp4(mp4, ff)).audio.durata > 22.43);

  assert.deepEqual(await taieLaDurata(mp4, 22.4, ff), { ok: true, stderr: '' });
  const info = await probeazaMp4(mp4, ff);
  assert.deepEqual([info.durata, info.video.cadre, info.audio.codec, info.audio.durata], [22.4, 672, 'aac', 22.4]);
  assert.deepEqual(fs.readdirSync(dir), ['randare.mp4'], 'temporarul s-a mutat peste randare');

  const lipsa = await taieLaDurata(path.join(dir, 'lipsa.mp4'), 6, ff);
  assert.equal(lipsa.ok, false);
  assert.match(lipsa.stderr, /lipsa\.mp4/);
  assert.deepEqual(fs.readdirSync(dir), ['randare.mp4'], 'la eșec nu rămâne niciun temporar');
});

test('randeaza Remotion: cu muzică taie MP4-ul la durata cronologiei; fără muzică nu-l atinge; tăierea picată e eșec', async (t) => {
  const p = pregateste();
  t.after(p.curata);
  const iesire = path.join(p.cai.build, 'randare.mp4');
  const ff = { ffmpeg: 'ffmpeg-fals', ffprobe: 'ffprobe-fals' };
  const taieri = [];
  const taie = (rezultatTaiere) => async (...argumente) => {
    taieri.push(argumente);
    return rezultatTaiere;
  };
  const arg = (audio) => ({
    radacina: p.radacina, proiect: 'p', cai: p.cai, sablon: p.sablon, construit: CONSTRUIT, cronologie: { ...CRON, audio }, iesire, ff,
  });

  let r = await creeazaAdaptorRemotion({ ruleaza: ruleazaRandare(() => false).ruleaza, taie: taie({ ok: true, stderr: '' }) }).randeaza(arg(null));
  assert.equal(r.ok, true);
  assert.equal(taieri.length, 0, 'fără muzică nu se taie nimic');

  fs.rmSync(iesire);
  r = await creeazaAdaptorRemotion({ ruleaza: ruleazaRandare(() => false).ruleaza, taie: taie({ ok: true, stderr: '' }) })
    .randeaza(arg({ fisier: 'muzica.mp3', durata: 6 }));
  assert.equal(r.ok, true);
  assert.deepEqual(taieri, [[iesire, CRON.durata, ff]]);

  fs.rmSync(iesire);
  r = await creeazaAdaptorRemotion({ ruleaza: ruleazaRandare(() => false).ruleaza, taie: taie({ ok: false, stderr: 'Invalid data found' }) })
    .randeaza(arg({ fisier: 'muzica.mp3', durata: 6 }));
  assert.deepEqual([r.ok, r.reluat, r.etapa, r.stderr], [false, false, 'taiere', 'Tăierea pistei audio la durata videoului a eșuat: Invalid data found']);
});

test('textRandeaza: schița fără check (Remotion) și reluarea numită după motor', () => {
  const baza = { tabel: null, scenariu: null, verificari: [{ cod: 'C10', ok: true }], verificare: 'video/p/verificare.json', revizie: null };
  const schita = textRandeaza({
    ...baza, mod: 'schita',
    schita: { celule: 2, instantanee: 'video/p/cadre/schita-1', foaie: 'video/p/cadre/foaie-schita-1.jpg', check: null },
  });
  assert.match(schita, /Schița: 2 instantanee în video\/p\/cadre\/schita-1, foaia în video\/p\/cadre\/foaie-schita-1\.jpg\./);
  assert.match(schita, /Check la tranziții: Remotion nu are/);
  assert.doesNotMatch(schita, /hyperframes check/);
  const complet = (extra) => textRandeaza({ ...baza, mod: 'complet', mp4: 'video/p/p.mp4', reluat_low_memory: true, predare: [], foaie: null, verificari_lipsa: [], ...extra });
  assert.match(complet({ reluare: '--concurrency=1' }), /randat din a doua încercare, cu --concurrency=1/);
  assert.match(complet({}), /randat din a doua încercare, cu --low-memory-mode/);
});

test('eroareRandare: tăierea picată nu se raportează ca randare picată de două ori, fără sfatul despre memorie', () => {
  const remotion = adaptorMotor('remotion');
  const taiere = eroareRandare(remotion, { ok: false, reluat: false, etapa: 'taiere', stderr: 'Tăierea pistei audio la durata videoului a eșuat: Invalid data found' }, 'p');
  assert.equal(taiere.cod, 'randare-esuata');
  assert.match(taiere.mesaj, /Randarea a reușit, dar tăierea pistei audio .* a eșuat: .*Invalid data found/);
  assert.doesNotMatch(taiere.mesaj, /de două ori/);
  assert.doesNotMatch(taiere.sugestie, /memorie/);
  const doua = eroareRandare(remotion, { ok: false, reluat: true, stderr: 'Error: Chrome a căzut' }, 'p');
  assert.match(doua.mesaj, /de două ori, a doua oară cu --concurrency=1/);
  assert.match(doua.sugestie, /memorie/);
});
