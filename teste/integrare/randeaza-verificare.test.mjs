// mg randeaza <proiect> --doar-verificare pe exemplul minim, cu HyperFrames 0.8.96 real (spec 6.9, 6.10, 7.1).
// Rulare: MG_TESTE_INTEGRARE=1 node --test teste/integrare/randeaza-verificare.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';
import { extrageBlocMg, extrageZonaTexte } from '../../nucleu/lib/scenariu.mjs';
import { textAfisat } from '../../nucleu/lib/text.mjs';
import { comandaRandeaza } from '../../nucleu/lib/randeaza/index.mjs';

const sari = process.env.MG_TESTE_INTEGRARE !== '1';
const REPO = fileURLToPath(new URL('../../', import.meta.url));
const executa = promisify(execFile);
const MINIM = JSON.parse(fs.readFileSync(
  path.join(REPO, 'motoare', 'hyperframes', 'sabloane', 'reel-ilustrat', 'exemple', 'minim.json'), 'utf8'));
const OBLIGATORII = ['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C09', 'C10', 'C17'];
// rezultatele verzi ale regulilor șablonului, date de pregatesteBuild pe drumul fericit
const CODURI_S = ['S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08', 'S09', 'S10', 'S11', 'S12'];

let temp = null;
let R = null;
const legaturi = [];

function copiazaFaraNodeModules(rel) {
  fs.cpSync(path.join(REPO, rel), path.join(R, rel), {
    recursive: true,
    filter: (sursa) => !sursa.split(/[\\/]/).includes('node_modules') && !/[\\/]nucleu[\\/]\.(stare\.json|canar|canar-refuzuri)$/.test(sursa),
  });
}

// node_modules nu se copiază: rădăcina temporară primește o legătură junction (pe Windows fără drepturi de administrator).
function leaga(rel) {
  const legatura = path.join(R, rel);
  fs.mkdirSync(path.dirname(legatura), { recursive: true });
  fs.symlinkSync(path.join(REPO, rel), legatura, 'junction');
  legaturi.push(legatura);
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

const dirProiect = () => path.join(R, 'video', 'p');
const rezumat = (r) => JSON.stringify({ cod: r.cod, erori: r.json.erori }, null, 2);

before(() => {
  if (sari) return;
  temp = creeazaRadacinaTemp({ biblioteciMini: true });
  R = temp.radacina;
  copiazaFaraNodeModules('nucleu');
  copiazaFaraNodeModules('motoare');
  leaga(path.join('nucleu', 'node_modules'));
  leaga(path.join('motoare', 'hyperframes', 'node_modules'));
  if (fs.existsSync(path.join(REPO, 'unelte', 'ffmpeg'))) leaga(path.join('unelte', 'ffmpeg'));
});

after(() => {
  // Legăturile se desfac întâi, ca ștergerea rădăcinii temporare să nu atingă node_modules din repo.
  for (const legatura of legaturi) fs.unlinkSync(legatura);
  temp?.curata();
});

test('mg randeaza p --doar-verificare pe minim iese cu 0 și scrie blocul și verificare.json', { skip: sari && 'setează MG_TESTE_INTEGRARE=1', timeout: 900000 }, async () => {
  let r = await mg(['nou', 'p', '--sablon', 'reel-ilustrat', '--json']);
  assert.equal(r.cod, 0, rezumat(r));

  r = await mg(['randeaza', 'p', '--doar-verificare', '--json']);
  assert.equal(r.cod, 0, rezumat(r));
  assert.equal(r.json.ok, true, rezumat(r));
  assert.equal(r.json.comanda, 'randeaza');
  assert.match(r.json.rezultat.tabel, /\| Ref \| Tip \| Start \| Complet \| Sfârșit \| Texte \|/);

  const v = JSON.parse(fs.readFileSync(path.join(dirProiect(), 'verificare.json'), 'utf8'));
  assert.equal(v.mod, 'doar-verificare');
  assert.equal(v.ok, true, JSON.stringify(v.verificari.filter((x) => !x.ok), null, 2));
  assert.equal(v.ok_pentru_aprobare, true);
  assert.equal(v.mp4, null);
  assert.equal(v.sha256_mp4, null);
  // M2: obligatoriile pasului comun sunt codurile declarate de stadiu date și build, cu S-urile reelului (toate de date)
  assert.deepEqual(v.obligatorii, [...OBLIGATORII, ...CODURI_S]);
  assert.deepEqual(v.verificari.map((x) => x.cod), [...OBLIGATORII, ...CODURI_S]);
  assert.ok(v.verificari.every((x) => x.ok), JSON.stringify(v.verificari.filter((x) => !x.ok)));

  const scenariu = fs.readFileSync(path.join(dirProiect(), 'scenariu.md'), 'utf8');
  const { bloc } = extrageBlocMg(scenariu);
  const zona = extrageZonaTexte(bloc);
  for (const [i, scena] of MINIM.scene.entries()) {
    (scena.titlu ?? []).forEach((rand, j) => {
      const accent = rand.includes('*') ? ' (accent)' : '';
      assert.ok(zona.includes(`- Scena ${i + 1}, titlu, rândul ${j + 1}${accent}: „${textAfisat(rand)}”`), `Scena ${i + 1}, rândul ${j + 1} lipsește:\n${zona}`);
    });
  }
  for (const f of ['index.html', 'plan.json', 'cronologie.json', 'gsap.min.js']) {
    assert.ok(fs.existsSync(path.join(dirProiect(), 'build', f)), `lipsește build/${f}`);
  }

  // A doua rulare pe aceleași date nu schimbă nimic în scenariu.md.
  r = await mg(['randeaza', 'p', '--doar-verificare', '--json']);
  assert.equal(r.cod, 0, rezumat(r));
  assert.equal(fs.readFileSync(path.join(dirProiect(), 'scenariu.md'), 'utf8'), scenariu);
});

test('un activ modificat după înghețare oprește --doar-verificare cu resursa-hash (cod 1)', { skip: sari && 'setează MG_TESTE_INTEGRARE=1', timeout: 900000 }, async () => {
  const dirDesene = path.join(dirProiect(), 'active', 'desen');
  const primul = fs.readdirSync(dirDesene).sort()[0];
  fs.appendFileSync(path.join(dirDesene, primul), ' ');
  const r = await mg(['randeaza', 'p', '--doar-verificare', '--json']);
  assert.equal(r.cod, 1, rezumat(r));
  assert.equal(r.json.ok, false);
  assert.deepEqual(r.json.erori.map((e) => [e.cod, e.camp]), [['resursa-hash', `fisier:video/p/active/desen/${primul}`]]);
});

test('fără biblioteci/catalog.json, --doar-verificare se oprește cu fisier-necitibil (cod 2), cu mesaj, nu cu stivă', { skip: sari && 'setează MG_TESTE_INTEGRARE=1', timeout: 900000 }, async () => {
  const catalog = path.join(R, 'biblioteci', 'catalog.json');
  const mutat = `${catalog}.mutat`;
  fs.renameSync(catalog, mutat);
  try {
    const r = await mg(['randeaza', 'p', '--doar-verificare', '--json']);
    assert.equal(r.cod, 2, rezumat(r));
    assert.equal(r.json.ok, false);
    assert.deepEqual(r.json.erori.map((e) => [e.cod, e.camp]), [['fisier-necitibil', 'fisier:biblioteci/catalog.json']]);
    assert.match(r.json.erori[0].mesaj, /biblioteci\/catalog\.json/);
  } finally {
    fs.renameSync(mutat, catalog);
  }
});

test('T1/T18: semnătura din fișa de brand trece prin C03 și C04 (camp brand); una care nu e șir dă brand-invalid, nu eroare-interna', { skip: sari && 'setează MG_TESTE_INTEGRARE=1', timeout: 900000 }, async () => {
  const LUNGA = String.fromCharCode(0x2014);
  fs.mkdirSync(path.join(R, 'branduri', 'bb'), { recursive: true });
  fs.writeFileSync(path.join(R, 'branduri', 'bb', 'vizual.md'),
    `---\nmg: 1\nsemnatura: "Ana Popescu ${LUNGA} coach de productivitate pentru antreprenori ocupati si stresati\\nlinia doi\\nlinia trei"\n---\n`);
  fs.mkdirSync(path.join(R, 'branduri', 'bn'), { recursive: true });
  fs.writeFileSync(path.join(R, 'branduri', 'bn', 'vizual.md'), '---\nmg: 1\nsemnatura: 2026\n---\n');
  let r = await mg(['nou', 'pb', '--sablon', 'reel-ilustrat', '--json']);
  assert.equal(r.cod, 0, rezumat(r));
  const caleDate = path.join(R, 'video', 'pb', 'date.json');
  const date = JSON.parse(fs.readFileSync(caleDate, 'utf8'));
  delete date.semnatura;

  fs.writeFileSync(caleDate, JSON.stringify({ ...date, brand: 'bb' }, null, 2));
  r = await mg(['randeaza', 'pb', '--doar-verificare', '--json']);
  assert.equal(r.cod, 1, rezumat(r));
  assert.deepEqual(r.json.erori.map((e) => [e.cod, e.camp]),
    [['liniuta-lunga', 'brand'], ['rand-nu-incape', 'brand'], ['rand-nu-incape', 'brand']]);
  assert.ok(r.json.avertismente.some((a) => a.cod === 'fara-diacritice' && a.camp === 'brand'), JSON.stringify(r.json.avertismente));

  fs.writeFileSync(caleDate, JSON.stringify({ ...date, brand: 'bn' }, null, 2));
  r = await mg(['randeaza', 'pb', '--doar-verificare', '--json']);
  assert.equal(r.cod, 1, rezumat(r));
  assert.deepEqual(r.json.erori.map((e) => [e.cod, e.camp]), [['brand-invalid', 'brand']]);
});

test('T4: o piesă proprie folosită, apoi înlocuită și scoasă din catalog nu mai blochează --doar-verificare (C07 verifică doar activele planului)', { skip: sari && 'setează MG_TESTE_INTEGRARE=1', timeout: 900000 }, async () => {
  let r = await mg(['nou', 'pa', '--sablon', 'reel-ilustrat', '--json']);
  assert.equal(r.cod, 0, rezumat(r));
  const svg = path.join(R, 'p-test.svg');
  fs.writeFileSync(svg, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0 L10 10" fill="#000"/></svg>');
  r = await mg(['desen', 'adauga', svg, '--licenta', 'desenul meu', '--etichete', 'cafea,cană,dimineață,pauză', '--id', 'p-test', '--json']);
  assert.equal(r.cod, 0, rezumat(r));
  const caleDate = path.join(R, 'video', 'pa', 'date.json');
  const date = JSON.parse(fs.readFileSync(caleDate, 'utf8'));
  const scena = date.scene.findIndex((s) => s.desen);
  const initial = date.scene[scena].desen.id;

  // (1) p-test folosit în scenă: verde, iar activul intră în motor.lock
  date.scene[scena].desen.id = 'p-test';
  fs.writeFileSync(caleDate, JSON.stringify(date, null, 2));
  r = await mg(['randeaza', 'pa', '--doar-verificare', '--json']);
  assert.equal(r.cod, 0, rezumat(r));
  const lock = JSON.parse(fs.readFileSync(path.join(R, 'video', 'pa', 'motor.lock'), 'utf8'));
  assert.ok(Object.hasOwn(lock.active, 'active/desen/p-test.svg'));

  // (2) scena trece înapoi pe piesa din bibliotecă; (3) p-test iese din catalogul propriu
  date.scene[scena].desen.id = initial;
  fs.writeFileSync(caleDate, JSON.stringify(date, null, 2));
  r = await mg(['randeaza', 'pa', '--doar-verificare', '--json']);
  assert.equal(r.cod, 0, rezumat(r));
  const caleCatalog = path.join(R, 'proprii', 'catalog-propriu.json');
  const catalog = JSON.parse(fs.readFileSync(caleCatalog, 'utf8'));
  catalog.piese = catalog.piese.filter((p) => p.id !== 'p-test');
  fs.writeFileSync(caleCatalog, JSON.stringify(catalog, null, 2));
  r = await mg(['randeaza', 'pa', '--doar-verificare', '--json']);
  assert.equal(r.cod, 0, rezumat(r));
  // fișierul înghețat și intrarea din motor.lock rămân, ca istoric
  assert.ok(fs.existsSync(path.join(R, 'video', 'pa', 'active', 'desen', 'p-test.svg')));
  const dupa = JSON.parse(fs.readFileSync(path.join(R, 'video', 'pa', 'motor.lock'), 'utf8'));
  assert.equal(dupa.active['active/desen/p-test.svg'], lock.active['active/desen/p-test.svg']);
});

/**
 * Reelul din rădăcina temporară, învelit cu verificariBuild (corpul dat) și cu S13 declarat de stadiu build, pe proiectul
 * nou `proiect` (modelul proiectProbaSpion din pregatire.test.mjs). Nu e proba: hook-ul rulează pe un șablon real, care
 * are și blocScenariu propriu (M1), deci învelișul păstrează și hook-urile existente ale reelului (export *).
 * Corpul hook-ului vine din globalThis.__hookBuild (cache-ul de module ține primul sablon.mjs importat în proces).
 * Rulează --doar-verificare prin comandaRandeaza, apoi pune fișierele șablonului la loc.
 */
async function doarVerificareCuHookBuild(proiect, hook, { nou = true, declaraS13 = true } = {}) {
  if (nou) {
    const rn = await mg(['nou', proiect, '--sablon', 'reel-ilustrat', '--json']);
    assert.equal(rn.cod, 0, rezumat(rn));
  }
  globalThis.__hookBuild = hook;
  const dir = path.join(R, 'motoare', 'hyperframes', 'sabloane', 'reel-ilustrat');
  const caleSablonMd = path.join(dir, 'SABLON.md');
  const sablonMd = fs.readFileSync(caleSablonMd, 'utf8');
  if (declaraS13) fs.writeFileSync(caleSablonMd, sablonMd.replace(/^verificari: \[(.*)\]$/m, 'verificari: [$1, S13]\nstadii: { S13: build }'));
  fs.renameSync(path.join(dir, 'sablon.mjs'), path.join(dir, 'sablon-original.mjs'));
  fs.writeFileSync(path.join(dir, 'sablon.mjs'), [
    "export * from './sablon-original.mjs';",
    'export function verificariBuild(dirBuild, ctx) {',
    '  (globalThis.__verificariBuild ??= []).push({ dirBuild, mod: ctx.mod });',
    '  return globalThis.__hookBuild(dirBuild, ctx);',
    '}',
    '',
  ].join('\n'));
  try {
    globalThis.__verificariBuild = [];
    const r = await comandaRandeaza({ radacina: R, proiect, mod: 'doar-verificare' });
    const dirP = path.join(R, 'video', proiect);
    assert.deepEqual(globalThis.__verificariBuild, [{ dirBuild: path.join(dirP, 'build'), mod: 'doar-verificare' }]);
    return { r, v: JSON.parse(fs.readFileSync(path.join(dirP, 'verificare.json'), 'utf8')) };
  } finally {
    fs.renameSync(path.join(dir, 'sablon-original.mjs'), path.join(dir, 'sablon.mjs'));
    fs.writeFileSync(caleSablonMd, sablonMd);
  }
}

test('M2: verificariBuild al șablonului e chemat după C10 și C17; S13 de build picat dă ok și ok_pentru_aprobare false', { skip: sari && 'setează MG_TESTE_INTEGRARE=1', timeout: 900000 }, async () => {
  const { r, v } = await doarVerificareCuHookBuild('ph', () => [{
    cod: 'S13', ok: false, valoare: null, prag: null, camp: 'build',
    erori: [{ cod: 'valoare-invalida', camp: 'build', mesaj: 'Test.', sugestie: 'Nimic.' }], avertismente: [],
  }]);
  assert.equal(r.ok, false);
  assert.equal(v.ok, false);
  assert.equal(v.ok_pentru_aprobare, false);
  const chei = Object.keys(v);
  assert.equal(chei[chei.indexOf('ok') + 1], 'ok_pentru_aprobare');
  assert.deepEqual(v.obligatorii, [...OBLIGATORII, ...CODURI_S, 'S13']);
  assert.deepEqual(v.verificari.filter((x) => !x.ok).map((x) => x.cod), ['S13'], JSON.stringify(v.verificari.filter((x) => !x.ok), null, 2));
  assert.deepEqual(v.verificari.map((x) => x.cod), [...OBLIGATORII, ...CODURI_S, 'S13']);
  assert.ok(r.erori.some((e) => e.cod === 'valoare-invalida' && e.camp === 'build'));
});

test('M2: un verificariBuild care aruncă scrie verificare.json nou, cu S13 picat (eroare-interna) și ok_pentru_aprobare false', { skip: sari && 'setează MG_TESTE_INTEGRARE=1', timeout: 900000 }, async () => {
  // verificare.json vechi, verde, de la o rulare fără hook: trebuie înlocuit
  let rv = await mg(['nou', 'pt', '--sablon', 'reel-ilustrat', '--json']);
  assert.equal(rv.cod, 0, rezumat(rv));
  rv = await mg(['randeaza', 'pt', '--doar-verificare', '--json']);
  assert.equal(rv.cod, 0, rezumat(rv));
  const vechi = JSON.parse(fs.readFileSync(path.join(R, 'video', 'pt', 'verificare.json'), 'utf8'));
  assert.equal(vechi.ok_pentru_aprobare, true);

  const { r, v } = await doarVerificareCuHookBuild('pt2', () => {
    throw new Error('hook stricat');
  });
  assert.equal(r.ok, false);
  assert.equal(v.ok, false);
  assert.equal(v.ok_pentru_aprobare, false);
  assert.deepEqual(v.verificari.filter((x) => !x.ok).map((x) => x.cod), ['S13'], JSON.stringify(v.verificari.filter((x) => !x.ok), null, 2));
  const s13 = v.verificari.find((x) => x.cod === 'S13');
  assert.equal(s13.camp, 'build');
  assert.equal(s13.erori[0].cod, 'eroare-interna');
  assert.match(s13.erori[0].mesaj, /Verificările de build ale șablonului reel-ilustrat au căzut: hook stricat/);
  assert.match(s13.erori[0].sugestie, /randeaza pt2 --doar-verificare/);

  // o formă greșită, pe proiectul care avea deja verificare.json verde: fișierul se rescrie, roșu
  const { r: r2, v: nou } = await doarVerificareCuHookBuild('pt', () => [{ cod: 'S13' }], { nou: false });
  assert.equal(r2.ok, false);
  assert.notEqual(nou.scris_la, vechi.scris_la);
  assert.equal(nou.ok, false);
  assert.equal(nou.ok_pentru_aprobare, false);
  const s13b = nou.verificari.find((x) => x.cod === 'S13');
  assert.equal(s13b.ok, false);
  assert.match(s13b.erori[0].mesaj, /nu are forma/);
});

test('M2 (review): verificariBuild întoarce S05 roșu, dar S05 n-are stadii build: C10 pică, ok și ok_pentru_aprobare false, eroarea e în verificare.json', { skip: sari && 'setează MG_TESTE_INTEGRARE=1', timeout: 900000 }, async () => {
  // S05 e declarat de reel fără stadiu, deci de date: primește verde automat; rezultatul hook-ului e respins, dar nu pierdut
  const { r, v } = await doarVerificareCuHookBuild('pr', () => [{
    cod: 'S05', ok: false, valoare: null, prag: null, camp: 'build',
    erori: [{ cod: 'valoare-invalida', camp: 'build', mesaj: 'Test.', sugestie: 'Nimic.' }], avertismente: [],
  }], { declaraS13: false });
  assert.equal(r.ok, false);
  assert.equal(v.ok, false);
  assert.equal(v.ok_pentru_aprobare, false);
  assert.deepEqual(v.verificari.filter((x) => !x.ok).map((x) => x.cod), ['C10'], JSON.stringify(v.verificari.filter((x) => !x.ok), null, 2));
  const c10 = v.verificari.find((x) => x.cod === 'C10');
  const interna = c10.erori.find((e) => e.cod === 'eroare-interna');
  assert.ok(interna, JSON.stringify(c10.erori));
  assert.equal(interna.camp, 'build');
  assert.match(interna.mesaj, /Verificările de build ale șablonului reel-ilustrat au căzut: .*S05 nu e declarat în SABLON\.md cu stadiul build/);
  assert.ok(r.erori.some((e) => e.cod === 'eroare-interna' && /S05/.test(e.mesaj)));
});
