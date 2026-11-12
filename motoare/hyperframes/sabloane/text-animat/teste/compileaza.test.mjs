import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compileaza, cssRoluriText } from '../compileaza.mjs';
import { aseazaScena, creeazaMasuratori } from '../asezare.mjs';

const REPO = fileURLToPath(new URL('../../../../../', import.meta.url));
const citesteText = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const implicite = JSON.parse(citesteText('../implicite.json'));
const minim = JSON.parse(citesteText('../exemple/minim.json'));
const SABLON_HTML = citesteText('../index.src.html');
const RUNTIME = { miscari: citesteText('../lib/miscari.js'), regizor: citesteText('../lib/regizor.js') };
const noapte = JSON.parse(fs.readFileSync(`${REPO}motoare/comun/teme/noapte.json`, 'utf8'));
const STIL = { tema: 'noapte', culori: { ...noapte.culori, linie: noapte.culori.text }, font_titlu: noapte.font_titlu, font_text: noapte.font_text, eticheta: noapte.eticheta, atmosfera: 'ceata', granulatie: noapte.granulatie, ritm: 'normal' };

function planCu(scene, { mod = 'ceata', sigla = false } = {}) {
  const masuri = creeazaMasuratori(REPO, STIL, implicite);
  return {
    versiune: 1, sablon: 'text-animat', format: 'vertical', latime: 1080, inaltime: 1920, fps: 30, durata: 4.4, aliniere: 'centru', iesire: 0.45,
    atmosfera: { mod, granulatie: mod === 'plin' ? 0 : 0.1, impingere: 1.03 },
    sigla: sigla ? { mime: 'image/svg+xml', w: 360, h: 90 } : null,
    scene: scene.map((s, i) => {
      const a = aseazaScena({ scena: s, i, stilPlat: STIL, implicite, format: implicite.formate.vertical, masuri, aliniere: 'centru', sigla: sigla && s.tip === 'final' ? { latime: 400, inaltime: 100 } : null });
      assert.deepEqual(a.erori, []);
      return { n: i + 1, id: `s${i + 1}`, camp: `scene[${i}]`, tip: s.tip, start: 0, complet: 1, sfarsit: 4.4, ultima: i === scene.length - 1, deriva: 12, blocuri: a.blocuri, pasi: [], texte: [] };
    }),
  };
}

const compileazaCu = (plan, extra = {}) => compileaza({ plan, stil: STIL, date: { sablon: 'text-animat' }, sablonHtml: SABLON_HTML, runtime: RUNTIME, fonturiCss: '/*f*/', implicite, greutateTitlu: 700, ...extra });

test('marcajele se înlocuiesc toate, iar rezultatul e determinist', () => {
  const plan = planCu(minim.scene);
  const html = compileazaCu(plan);
  assert.equal(html, compileazaCu(plan));
  assert.equal(/\{\{MG_|\/\*MG_|<!--MG_/.test(html), false);
  assert.match(html, /<html lang="ro">/);
  assert.match(html, /<div id="root" class="ceata centru" data-composition-id="main" data-start="0" data-duration="4.4" data-width="1080" data-height="1920">/);
});

test('piesele sunt span-uri cu id, textul neutralizat, spațiile între piese păstrate', () => {
  const html = compileazaCu(planCu([{ tip: 'titlu', titlu: ['Tom & <Jerry>', 'și tot *nu ajungi*?'] }]));
  assert.match(html, /<span class="p" id="t1-1">Tom &amp; &lt;Jerry&gt;<\/span>/);
  assert.match(html, /<span class="p" id="t1-2">și tot<\/span> <span class="p accent" id="t1-3">nu ajungi<\/span><span class="p" id="t1-4">\?<\/span>/);
  assert.match(html, /<div class="masca" data-layout-allow-overflow><div class="rand" id="r1-1">/);
  assert.match(html, /<div class="bloc mare" id="b1-1" style="left:96px;top:[\d.]+px;width:888px;font-size:\d+px">/);
});

test('doar piesele blocului cuvinte poartă data-layout-allow-overlap (se schimbă pe loc); titlul nu', () => {
  const html = compileazaCu(planCu([
    { tip: 'titlu', titlu: ['Un titlu'] },
    { tip: 'cuvinte', titlu: ['Un agent le face'], cuvinte: ['zilnic.', 'corect.'] },
  ]));
  const piese = [...html.matchAll(/<span class="p(?: accent)?" id="(t\d+-\d+)"( data-layout-allow-overlap)?>([^<]*)<\/span>/g)];
  const cuAtribut = piese.filter((m) => m[2]).map((m) => m[3]);
  assert.deepEqual(cuAtribut, ['zilnic.', 'corect.']);
  assert.ok(piese.some((m) => !m[2] && /titlu|Un|agent/.test(m[3])), 'piesele titlului nu au atributul');
  assert.equal(html.split('data-layout-allow-overlap').length - 1, 2);
});

test('lista: bife SVG cu pathLength 1 sau numere în accent', () => {
  const bife = compileazaCu(planCu([minim.scene[1]]));
  assert.match(bife, /<div class="punct" id="r1-2"><span class="marcaj" style="width:[\d.]+px;margin-right:[\d.]+px"><svg viewBox="0 0 24 24" aria-hidden="true"><path id="m1-1" pathLength="1" d="M4 12.5L9.5 18L20 6.5"\/><\/svg><\/span><span class="rand">/);
  const numere = compileazaCu(planCu([{ ...minim.scene[1], marcaj: 'numere' }]));
  assert.match(numere, /<span class="marcaj" style="[^"]+">2\.<\/span>/);
});

test('sigla intră ca data: URI cu dimensiunile întregi din plan; fără conținut, compilarea se oprește', () => {
  const plan = planCu([minim.scene[2]], { sigla: true });
  const html = compileazaCu(plan, { sigla: { mime: 'image/svg+xml', base64: 'PHN2Zy8+' } });
  assert.match(html, /<img id="sigla" class="bloc" src="data:image\/svg\+xml;base64,PHN2Zy8\+" width="360" height="90" style="left:[\d.]+px;top:[\d.]+px" alt="">/);
  assert.throws(() => compileazaCu(plan), /sigla/);
});

test('variabilele: culorile temei, degradeul și ceața la intensitatea lui C06, eticheta din temă', () => {
  const html = compileazaCu(planCu(minim.scene, { mod: 'degrade' }));
  assert.match(html, /--fundal: #0E0F13;/);
  assert.match(html, /--degrade-a: rgba\(33, 24, 25, [\d.]+\);/);
  assert.match(html, /--degrade-b: rgba\(28, 28, 32, [\d.]+\);/);
  assert.match(html, /--eticheta-spatiere: 0\.16em;/);
  assert.match(html, /class="degrade centru"/);
});

test('audio: elementul se pune după #stage; fără muzică, marcajul dispare fără urmă', () => {
  const plan = planCu(minim.scene);
  const fara = compileazaCu(plan);
  assert.match(fara, /<\/div>\n    <\/div>\n\n    <script>/);
  const cu = compileazaCu(plan, { audio: '<audio id="muzica" src="assets/muzica.m4a" data-start="0" data-duration="4.4" data-track-index="1"></audio>' });
  assert.match(cu, /<\/div>\n      <audio id="muzica"/);
});

test('rolurile: font-size nu e în CSS, cifra are cifre tabulare și accent, micul e atenuat', () => {
  const css = cssRoluriText(implicite, 800);
  assert.match(css, /\.mare \{ font-family: var\(--font-titlu\); font-weight: 800; line-height: 1\.08; letter-spacing: -0\.02em; color: var\(--text\); \}/);
  assert.match(css, /\.cifra \{[^}]*color: var\(--accent\); font-variant-numeric: tabular-nums; \}/);
  assert.match(css, /\.mic \{[^}]*font-weight: 500;[^}]*color: var\(--atenuat\);/);
  assert.equal(/font-size/.test(css), false);
});

test('un marcaj lipsă sau dublat din index.src.html oprește compilarea', () => {
  assert.throws(() => compileaza({ plan: planCu(minim.scene), stil: STIL, date: { sablon: 'text-animat' }, sablonHtml: SABLON_HTML.replace('<!--MG_SCENE-->', ''), runtime: RUNTIME, fonturiCss: '', implicite, greutateTitlu: 700 }), /MG_SCENE/);
});
