// C10 și C17 pe build-uri mici scrise în folderul temporar (spec 6.11, harta 4.15).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verificaBuild } from '../../nucleu/lib/verificari/build.mjs';
import { citesteVersiuni } from '../../nucleu/lib/versiuni.mjs';
import { stergeRecursiv } from '../../nucleu/lib/fisiere.mjs';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const VERSIUNI = citesteVersiuni(REPO);
const CHECK_OK = JSON.parse(fs.readFileSync(path.join(REPO, 'teste', 'fixtures', 'hyperframes', 'check-ok.json'), 'utf8'));
const GSAP = path.join(REPO, 'motoare', 'hyperframes', 'comun', 'vendor', 'gsap.min.js');

const ASTEPTARI = {
  texte: [
    { ref: 'Scena 1', text: 'LUNI, 8:30', t: 2.15, zona_text: [96, 200, 888, 280] },
    { ref: 'Scena 1', text: 'Telefonul sună', t: 2.15, zona_text: [96, 200, 888, 280] },
    { ref: 'Scena 5', text: 'Scrie „AGENT” în comentarii', t: 22.4, zona_text: [96, 200, 888, 280] },
  ],
  momente: [2.15, 22.4],
  audio: { prezent: false, durata: null },
  fundal: '#F3EBDD',
};

const HTML_BUN = [
  '<!DOCTYPE html><html lang="ro"><head><script src="gsap.min.js"></script>',
  '<style>.h { color: red; }</style></head><body>',
  '<svg id="art" viewBox="0 0 1080 1920"><g id="cam"></g></svg>',
  '<div class="card" id="c1"><div class="label">LUNI, 8:30</div>',
  '<div class="mask gap"><div class="h">Telefonul\n      sună</div></div></div>',
  '<div class="card" id="cta"><div class="mask"><div class="h">Scrie „AGENT” &#238;n comentarii</div></div></div>',
  '<script>window.__MG_PLAN = {"text":"Telefonul nu sună"};</script>',
  '</body></html>',
].join('\n');

function build(fisiere, { cuGsap = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg test Ăîș '));
  for (const [cale, continut] of Object.entries(fisiere)) {
    fs.mkdirSync(path.dirname(path.join(dir, cale)), { recursive: true });
    fs.writeFileSync(path.join(dir, cale), continut);
  }
  if (cuGsap) fs.copyFileSync(GSAP, path.join(dir, 'gsap.min.js'));
  return dir;
}

function ruleaza(dir, check = CHECK_OK) {
  try {
    const [c10, c17] = verificaBuild({ dirBuild: dir, asteptari: ASTEPTARI, check, versiuni: VERSIUNI });
    return { c10, c17 };
  } finally {
    stergeRecursiv(dir);
  }
}

test('un build curat, cu GSAP-ul fixat, trece C10 și C17', () => {
  const { c10, c17 } = ruleaza(build({ 'index.html': HTML_BUN, 'plan.json': '{"versiune": 1}\n' }));
  assert.equal(c10.cod, 'C10');
  assert.equal(c10.ok, true, JSON.stringify(c10.erori));
  assert.equal(c17.cod, 'C17');
  assert.equal(c17.ok, true, JSON.stringify(c17.erori));
  assert.deepEqual(c17.valoare, { texte: 3, lipsa: 0 });
});

test('o adresă https:// în build dă build-cu-retea, cu fișierul în camp', () => {
  const html = HTML_BUN.replace('</style>', '@import url("https://fonts.example.com/a.css");</style>');
  const { c10 } = ruleaza(build({ 'index.html': html }));
  assert.equal(c10.ok, false);
  assert.deepEqual(c10.erori.map((e) => [e.cod, e.camp]), [['build-cu-retea', 'fisier:build/index.html']]);
});

test('xmlns-ul SVG e permis, dar o adresă http într-un fișier din subfolder nu', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1 1"/>';
  const { c10 } = ruleaza(build({ 'index.html': HTML_BUN, 'fonturi/a.svg': svg, 'fonturi/b.css': 'src: url(http://x.ro/f.woff2);' }));
  assert.deepEqual(c10.erori.map((e) => [e.cod, e.camp]), [['build-cu-retea', 'fisier:build/fonturi/b.css']]);
});

test('un gsap.min.js diferit de cel fixat nu mai e exceptat', () => {
  const { c10 } = ruleaza(build({ 'index.html': HTML_BUN, 'gsap.min.js': '/* https://cdn.example.com/gsap */' }, { cuGsap: false }));
  assert.deepEqual(c10.erori.map((e) => [e.cod, e.camp]), [['build-cu-retea', 'fisier:build/gsap.min.js']]);
});

test('alt motor sau un check cu erori dau motor-versiune și check-esuat', () => {
  const check = structuredClone(CHECK_OK);
  check._meta.version = '0.8.97';
  check.ok = false;
  check.lint.findings = [{ code: 'non_deterministic_code', severity: 'error', message: 'x', selector: null, time: null, fixHint: null }];
  const { c10 } = ruleaza(build({ 'index.html': HTML_BUN }), check);
  assert.deepEqual(c10.erori.map((e) => e.cod), ['motor-versiune', 'check-esuat']);
  assert.match(c10.erori[1].mesaj, /lint\/non_deterministic_code/);
});

test('C10: găsirile motion/* au selectorul și mesajul lui HyperFrames în mesajul erorii', () => {
  const check = structuredClone(CHECK_OK);
  check.ok = false;
  check.motion = { findings: [
    { code: 'motion_selector_missing', severity: 'error', time: 0, selector: '#c9 > .label', message: '#c9 > .label matched no element in any sampled frame', fixHint: null },
  ] };
  const { c10 } = ruleaza(build({ 'index.html': HTML_BUN }), check);
  const e = c10.erori.find((x) => x.cod === 'check-esuat');
  assert.match(e.mesaj, /motion\/motion_selector_missing/);
  assert.match(e.mesaj, /#c9 > \.label: #c9 > \.label matched no element/);
});

test('C10: un index.motion.json în build nu e o adresă de rețea', () => {
  const motion = JSON.stringify({ version: 1, assertions: [{ kind: 'staysInFrame', selector: '#c1 > .label' }] });
  const { c10 } = ruleaza(build({ 'index.html': HTML_BUN, 'index.motion.json': motion }));
  assert.equal(c10.ok, true, JSON.stringify(c10.erori));
});

test('un text care apare doar în script, nu ca nod static, dă text-lipsa-din-build', () => {
  const html = HTML_BUN.replace('<div class="h">Telefonul\n      sună</div>', '<div class="h"></div>');
  const { c17 } = ruleaza(build({ 'index.html': html }));
  assert.equal(c17.ok, false);
  assert.deepEqual(c17.erori.map((e) => e.cod), ['text-lipsa-din-build']);
  assert.match(c17.erori[0].mesaj, /^Scena 1: textul „Telefonul sună”/);
});

test('C10: cod de ieșire diferit de 0 fără găsiri de nivel error pică, cu codul și găsirile în mesaj', () => {
  const check = structuredClone(CHECK_OK);
  check.cod = 1;
  check.layout = { findings: [{ severity: 'warning', code: 'text_overflow', message: 'm' }] };
  const { c10 } = ruleaza(build({ 'index.html': HTML_BUN }), check);
  assert.equal(c10.ok, false);
  const e = c10.erori.find((x) => x.cod === 'check-esuat');
  assert.ok(e, JSON.stringify(c10.erori));
  assert.match(e.mesaj, /cod de ieșire 1/);
  assert.match(e.mesaj, /layout\/text_overflow/);
  const fara = structuredClone(CHECK_OK);
  fara.layout = { findings: [{ severity: 'warning', code: 'text_overflow', message: 'm' }] };
  delete fara.cod;
  assert.equal(ruleaza(build({ 'index.html': HTML_BUN }), fara).c10.ok, true);
});
