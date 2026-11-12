import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { incarcaSablon } from '../../../../../nucleu/lib/sabloane.mjs';
import { rezolvaStil } from '../../../../../nucleu/lib/teme.mjs';
import { verificaRezultateProprii } from '../../../../../nucleu/lib/verificari/stadii.mjs';
import { verificariBuild, pieseHtml, campuriText } from '../build.mjs';

const REPO = fileURLToPath(new URL('../../../../../', import.meta.url));
const sablon = await incarcaSablon(REPO, 'text-animat');
const minim = () => JSON.parse(fs.readFileSync(fileURLToPath(new URL('../exemple/minim.json', import.meta.url)), 'utf8'));
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 50"><rect width="200" height="50" fill="#C2410C"/></svg>\n';

/** Un proiect temporar: date.json scris, stilul rezolvat, cronologia și build/, ca la mg randeaza. */
async function construiesteIn(dir, date) {
  fs.writeFileSync(path.join(dir, 'date.json'), `${JSON.stringify(date, null, 2)}\n`);
  const ctx = { radacina: REPO, proiect: 'test', dirProiect: dir, sablon, mod: 'doar-verificare', catalog: null, brand: null, intern: null, stil: null, ff: null,
    ingheataActiv: () => { throw new Error('text-animat nu îngheață active'); } };
  const s = rezolvaStil({ radacina: REPO, sablon, date, brand: null });
  assert.deepEqual(s.erori, []);
  const c = sablon.modul.cronologie(date, s.stil, ctx);
  assert.deepEqual(c.erori, []);
  const cx = { ...ctx, intern: c.intern, stil: s.stil };
  const dirBuild = path.join(dir, 'build');
  await sablon.modul.construieste(date, s.stil, c.cronologie, dirBuild, cx);
  return { dirBuild, ctx: cx };
}

async function inProiect(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-text-s0x-'));
  try {
    await fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const pe = (rezultate) => Object.fromEntries(rezultate.map((r) => [r.cod, r]));
const perechi = (r) => r.erori.map((e) => [e.cod, e.camp]);

/** Înlocuiește o singură apariție în build/index.html (testul pică dacă textul nu există). */
function schimbaHtml(dirBuild, din, cu) {
  const cale = path.join(dirBuild, 'index.html');
  const html = fs.readFileSync(cale, 'utf8');
  assert.ok(html.includes(din), `build/index.html nu conține ${din}`);
  fs.writeFileSync(cale, html.replace(din, cu));
}

test('SABLON.md declară S05, S06, S07, S09 de stadiu build; sablon.mjs exportă verificariBuild', () => {
  for (const cod of ['S05', 'S06', 'S07', 'S09']) {
    assert.ok(sablon.meta.verificari.includes(cod), cod);
    assert.equal(sablon.meta.stadii?.[cod], 'build', cod);
  }
  assert.equal(sablon.modul.verificariBuild, verificariBuild);
});

test('pieseHtml decodează entitățile și ține minte accentul', () => {
  const p = pieseHtml('<span class="p" id="t1-1">Tom &amp; &lt;Jerry&gt; &quot;x&quot; &#39;y&#39;</span> <span class="p accent" id="t2-3">nu ajungi</span> <span class="p" id="t5-2" data-layout-allow-overlap>zilnic.</span>');
  assert.deepEqual([...p.entries()], [
    ['t1-1', { text: 'Tom & <Jerry> "x" \'y\'', accent: false }],
    ['t2-3', { text: 'nu ajungi', accent: true }],
    ['t5-2', { text: 'zilnic.', accent: false }],
  ]);
});

test('campuriText: textul de pe ecran pe fiecare câmp, în ordinea de pe ecran', () => {
  const date = {
    scene: [
      { tip: 'cifra', eticheta: 'Pe lună', valoare: 1250, prefix: '€', text: 'recuperați  *lunar*', sursa: 'de la cursant' },
      { tip: 'citat', text: 'Am recuperat o zi.', autor: 'Ioana Pop' },
    ],
  };
  assert.deepEqual(campuriText(date, { eticheta: { majuscule: true } }), [
    { camp: 'scene[0].eticheta', brut: 'Pe lună', afisat: 'PE LUNĂ' },
    { camp: 'scene[0].valoare', brut: '', afisat: '€1.250' },
    { camp: 'scene[0].text', brut: 'recuperați  *lunar*', afisat: 'recuperați lunar' },
    { camp: 'scene[0].sursa', brut: 'de la cursant', afisat: 'de la cursant' },
    { camp: 'scene[1].text', brut: 'Am recuperat o zi.', afisat: '„Am recuperat o zi.”' },
    { camp: 'scene[1].autor', brut: 'Ioana Pop', afisat: 'Ioana Pop' },
  ]);
});

test('minim: S05, S06, S07, S09 verzi, iar rezultatele trec validarea strictă a nucleului', () => inProiect(async (dir) => {
  const { dirBuild, ctx } = await construiesteIn(dir, minim());
  const r = verificariBuild(dirBuild, ctx);
  assert.deepEqual(r.map((x) => x.cod), ['S05', 'S06', 'S07', 'S09']);
  for (const x of r) assert.equal(x.ok, true, JSON.stringify(x.erori));
  assert.doesNotThrow(() => verificaRezultateProprii(r, sablon, 'build', 'verificariBuild'));
  assert.equal(pe(r).S09.valoare, 10);
}));

test('S09 pică pe un text schimbat în build, cu câmpul lui; S06 rămâne verde', () => inProiect(async (dir) => {
  const { dirBuild, ctx } = await construiesteIn(dir, minim());
  schimbaHtml(dirBuild, '>Lucrezi 12 ore<', '>Lucrezi 13 ore<');
  const r = pe(verificariBuild(dirBuild, ctx));
  assert.deepEqual(perechi(r.S09), [['text-animat-text-in-build', 'scene[0].titlu[0]']]);
  assert.match(r.S09.erori[0].mesaj, /„Lucrezi 13 ore”.*„Lucrezi 12 ore”/);
  assert.match(r.S09.erori[0].sugestie, /video\/test\/cerere-sablon\.md/);
  assert.equal(r.S06.ok, true);
}));

test('S09 pică și pe o piesă din plan care lipsește din HTML', () => inProiect(async (dir) => {
  const { dirBuild, ctx } = await construiesteIn(dir, minim());
  schimbaHtml(dirBuild, 'id="t1-2"', 'id="t1-99"');
  const r = pe(verificariBuild(dirBuild, ctx));
  assert.deepEqual(perechi(r.S09), [['text-animat-text-in-build', 'scene[0].titlu[0]']]);
  assert.match(r.S09.erori[0].mesaj, /t1-2/);
}));

test('S06 pică pe un accent scos și pe unul adăugat', () => inProiect(async (dir) => {
  const { dirBuild, ctx } = await construiesteIn(dir, minim());
  const original = fs.readFileSync(path.join(dirBuild, 'index.html'), 'utf8');
  schimbaHtml(dirBuild, 'class="p accent" id="t1-4"', 'class="p" id="t1-4"');
  let r = pe(verificariBuild(dirBuild, ctx));
  assert.deepEqual(perechi(r.S06), [['text-animat-accent', 'scene[0].titlu[1]']]);
  assert.equal(r.S09.ok, true, 'textul e același, doar accentul lipsește');
  fs.writeFileSync(path.join(dirBuild, 'index.html'), original);
  schimbaHtml(dirBuild, 'class="p" id="t1-2"', 'class="p accent" id="t1-2"');
  r = pe(verificariBuild(dirBuild, ctx));
  assert.deepEqual(perechi(r.S06), [['text-animat-accent', 'scene[0].titlu[0]']]);
}));

test('S05: cifra e scrisă static, în format românesc; un separator greșit pică', () => inProiect(async (dir) => {
  const date = minim();
  date.scene.splice(1, 0, { tip: 'cifra', valoare: 1250, prefix: '€', text: 'recuperați în fiecare lună' });
  const { dirBuild, ctx } = await construiesteIn(dir, date);
  let r = pe(verificariBuild(dirBuild, ctx));
  assert.equal(r.S05.ok, true, JSON.stringify(r.S05.erori));
  assert.equal(r.S05.valoare, 1);
  schimbaHtml(dirBuild, '>€1.250<', '>€1,250<');
  r = pe(verificariBuild(dirBuild, ctx));
  assert.deepEqual(perechi(r.S05), [['text-animat-cifra', 'scene[1].valoare']]);
  assert.match(r.S05.erori[0].mesaj, /„€1,250”.*„€1\.250”/);
}));

test('S07: sigla din build e fișierul sursă, cu raportul lui; fișier schimbat, lipsă, cutie deformată sau imagine scoasă pică', () => inProiect(async (dir) => {
  fs.mkdirSync(path.join(dir, 'resurse'));
  const caleSigla = path.join(dir, 'resurse', 'sigla.svg');
  fs.writeFileSync(caleSigla, SVG);
  const date = minim();
  date.sigla = 'resurse/sigla.svg';
  const { dirBuild, ctx } = await construiesteIn(dir, date);
  const original = fs.readFileSync(path.join(dirBuild, 'index.html'), 'utf8');
  const s07 = () => pe(verificariBuild(dirBuild, ctx)).S07;

  let r = s07();
  assert.equal(r.ok, true, JSON.stringify(r.erori));
  assert.deepEqual(r.valoare, { w: 360, h: 90 });

  fs.writeFileSync(caleSigla, `${SVG}<!-- alta -->\n`);
  assert.deepEqual(perechi(s07()), [['text-animat-sigla', 'sigla']]);
  fs.writeFileSync(caleSigla, SVG);

  schimbaHtml(dirBuild, 'width="360"', 'width="300"');
  assert.deepEqual(perechi(s07()), [['text-animat-sigla', 'sigla']]);
  fs.writeFileSync(path.join(dirBuild, 'index.html'), original);

  schimbaHtml(dirBuild, '<img id="sigla"', '<img id="alta"');
  assert.deepEqual(perechi(s07()), [['text-animat-sigla', 'sigla']]);
  fs.writeFileSync(path.join(dirBuild, 'index.html'), original);

  fs.rmSync(caleSigla);
  r = s07();
  assert.deepEqual(perechi(r), [['text-animat-sigla', 'sigla']]);
  assert.match(r.erori[0].sugestie, /resurse/);
}));

test('S07: brand.sigla invalidă (cale null) iese ca problemă structurată, fără excepție', () => inProiect(async (dir) => {
  fs.mkdirSync(path.join(dir, 'resurse'));
  fs.writeFileSync(path.join(dir, 'resurse', 'sigla.svg'), SVG);
  const date = minim();
  date.sigla = 'resurse/sigla.svg';
  const { dirBuild, ctx } = await construiesteIn(dir, date);
  for (const sigla of ['../afara.svg', '  ', 7]) {
    const brand = { nume: 'Test', dir: path.join(dir, 'brand'), sigla };
    const r = pe(verificariBuild(dirBuild, { ...ctx, brand })).S07;
    assert.deepEqual(perechi(r), [['text-animat-sigla', 'brand']], String(sigla));
    assert.equal(r.erori[0].verificare, 'S07');
    assert.match(r.erori[0].mesaj, /Test/);
    assert.doesNotThrow(() => verificaRezultateProprii([r], sablon, 'build', 'verificariBuild'));
  }
}));

