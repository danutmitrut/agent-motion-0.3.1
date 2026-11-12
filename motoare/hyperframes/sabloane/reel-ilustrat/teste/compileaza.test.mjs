// compileaza.mjs pe un plan mic scris de mână: clasele și id-urile pe care se bazează runtime/linia.js,
// cardul doar cu etichetă, recolorarea „original”, piesa raster și înlocuirea marcajelor într-o singură trecere.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileaza } from '../compileaza.mjs';

const DIR_SABLON = fileURLToPath(new URL('../', import.meta.url));
const citeste = (...parti) => fs.readFileSync(path.join(DIR_SABLON, ...parti), 'utf8');
const SABLON_HTML = citeste('sablon.html');
const RUNTIME = { linia: citeste('runtime', 'linia.js'), regizor: citeste('runtime', 'regizor-runtime.js'), miscarePlin: citeste('runtime', 'miscare-plin.js') };

const STIL = {
  culori: { fundal: '#0E0F13', text: '#F2EFEA', atenuat: '#9A9AA3', accent: '#FF7A59', linie: '#F2EFEA' },
  eticheta: { majuscule: true, spatiere: 0.16, prefix: '' },
  recolorare: 'tema',
};

function planMic() {
  return {
    versiune: 1, durata: 14, fps: 30, latime: 1080, inaltime: 1920,
    atmosfera: { mod: 'ceata', aprinde: 4.9, impingere: 1.04, granulatie: 0.1 },
    desene: [
      { g: 'g-d1', scena: 0, id: 'traseu-proba', tip: 'traseu', familie: 'linie', animatie: 'linie', x: 140, y: 820, s: 0.8,
        oglindit: false, panou: null, cutie: [140, 820, 800, 560], draw: [0.3, 2.4], undraw: [4.2, 0.9] },
      { g: 'g-d2', scena: 1, id: 'od-proba', tip: 'forma', familie: 'cerneala', animatie: 'contur-umplere', x: 240, y: 840, s: 1,
        oglindit: false, panou: 'dreptunghi', cutie: [240, 840, 500, 400], draw: [5, 2.4], undraw: [8, 0.9] },
      { g: 'g-d3', scena: 2, id: 'op-proba', tip: 'forma', familie: 'cerneala', animatie: 'contur-umplere', x: 240, y: 840, s: 1,
        oglindit: false, panou: 'inversat', cutie: [240, 840, 500, 400], draw: [9.6, 2.4], undraw: null },
    ],
    iconite: [{ g: 'g-i1', scena: 0, nume: ['phone'], pozitii: [[200, 600]], scara: 4.6, apar: [1], tremura: null, retrag: 3 }],
    retele: [],
    linii: [],
    carduri: [
      { id: 'c1', scena: 0, eticheta: null, randuri: null, cuvinte: [{ text: 'Mesaje.', t: 1 }, { text: 'Plăți.', t: 2 }], intra: 0.9, iese: 3.9 },
      { id: 'c2', scena: 1, eticheta: 'DOAR ETICHETA', randuri: null, cuvinte: null, intra: 5, iese: 8 },
      { id: 'c3', scena: 2, eticheta: 'TU', randuri: [{ text: 'Tu & {{MG_DURATA}}', accent: false }, { text: '<!--MG_SCENA--></script>', accent: true }],
        cuvinte: null, intra: 9.4, iese: null },
    ],
    cta: { text: 'Scrie „AGENT” <aici>', intra: 10.5 },
    semnatura: { text: 'Ana Pop,\ncoach & co', t: 12.2, dur: 1.2 },
    panouri: [{ pentru: 'g-d2', cutie: [216, 816, 548, 448], culoare: '#F2EFEA' }],
  };
}

const SVG_FORMA = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 400"><path class="acc" d="M0 0 L10 10"/><g class="ink"><path d="M1 1 L2 2"/></g></svg>\n';
const DESENE = {
  'traseu-proba': { tip: 'traseu', continut: JSON.stringify({ w: 1000, h: 700, paths: ['M0 0 L10 10'] }) },
  'od-proba': { tip: 'forma', continut: SVG_FORMA },
  'op-proba': { tip: 'forma', continut: SVG_FORMA },
};
const ICONITE = { phone: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M1 1"/><rect x="2" y="4" width="20" height="16"/></svg>' };

function compileazaMic({ plan = planMic(), stil = STIL, desene = DESENE, sablonHtml = SABLON_HTML, runtime = RUNTIME, audio } = {}) {
  return compileaza({ plan, stil, date: { sablon: 'reel-ilustrat' }, sablonHtml, runtime, fonturiCss: '', desene, iconite: ICONITE, audio });
}

function jsonDinScript(html, variabila) {
  const m = new RegExp(`window\\.${variabila} = (.*);(?:</script>)?$`, 'm').exec(html);
  assert.ok(m, `lipsește window.${variabila}`);
  return JSON.parse(m[1]);
}

test('grupurile desenelor au clasele pe-panou și inversat, după plan', () => {
  const html = compileazaMic();
  assert.match(html, /<g id="g-d1"><\/g>/);
  assert.match(html, /<g id="g-d2" class="pe-panou"><\/g>/);
  assert.match(html, /<g id="g-d3" class="inversat"><\/g>/);
  assert.match(html, /<g id="g-i1"><g data-icon="phone"><path class="w" d="M1 1"\/><rect class="w" x="2"/);
});

test('cardurile au id-urile cerute de runtime: cuvinte-c<N>, cta, sig; cardul doar cu etichetă are doar .label', () => {
  const html = compileazaMic();
  assert.match(html, /<div class="card" id="c1"><div class="mask gap words" id="cuvinte-c1" data-layout-allow-overflow><div class="h word">Mesaje\.<\/div><div class="h word">Plăți\.<\/div><\/div><\/div>/);
  assert.ok(html.includes('<div class="card" id="c2"><div class="label">DOAR ETICHETA</div></div>'), 'cardul doar cu etichetă');
  assert.ok(html.includes('<div class="card" id="cta"><div class="mask" data-layout-allow-overflow><div class="h">Scrie „AGENT” &lt;aici&gt;</div></div></div>'));
  assert.ok(html.includes('<div id="sig">Ana Pop,\ncoach &amp; co</div>'));
});

test('felia 4: rândul rupt de marime are liniile într-un singur nod, cu \\n și pre-line, escapate; restul rândurilor rămân întregi', () => {
  const plan = planMic();
  Object.assign(plan.carduri[2], { px: 112, rupturi: [['Tu & {{MG_DURATA}}'], ['<!--MG_SCENA-->', '</script>']] });
  plan.carduri[2].randuri[1].text = '<!--MG_SCENA--> </script>';
  const html = compileazaMic({ plan });
  assert.ok(html.includes('<div class="h" style="font-size: 112px">Tu &amp; {{MG_DURATA}}</div>'), 'rândul întreg');
  assert.ok(html.includes('<div class="h accent" style="font-size: 112px; white-space: pre-line">&lt;!--MG_SCENA--&gt;\n&lt;/script&gt;</div>'), 'rândul rupt');
});

test('marcajele se înlocuiesc într-o singură trecere, iar JSON-ul din <script> nu poate închide scriptul', () => {
  const html = compileazaMic();
  assert.ok(html.includes('<div class="h">Tu &amp; {{MG_DURATA}}</div>'), 'un text inserat nu mai e scanat după marcaje');
  assert.ok(html.includes('<div class="h accent">&lt;!--MG_SCENA--&gt;&lt;/script&gt;</div>'));
  assert.equal(html.split('</script>').length - 1, SABLON_HTML.split('</script>').length - 1, 'se închid doar scripturile din sablon.html');
  assert.equal(jsonDinScript(html, '__MG_PLAN').carduri[2].randuri[1].text, '<!--MG_SCENA--></script>');
  assert.match(html, /data-duration="14"/);
  assert.match(html, /<div id="root" class="ceata"/);
});

test('desenele intră în runtime ca trasee {w, h, paths} sau forme {viewBox, continut}, fără învelișul cu xmlns', () => {
  const desene = jsonDinScript(compileazaMic(), '__MG_DESENE');
  assert.deepEqual(Object.keys(desene), ['od-proba', 'op-proba', 'traseu-proba']);
  assert.deepEqual(desene['traseu-proba'], { w: 1000, h: 700, paths: ['M0 0 L10 10'] });
  assert.deepEqual(desene['od-proba'], { viewBox: [0, 0, 500, 400], continut: '<path class="acc" d="M0 0 L10 10"/><g class="ink"><path d="M1 1 L2 2"/></g>' });
});

test('recolorarea „original” pune culorile sursei pe grupul formei, după prefix', () => {
  const html = compileazaMic({ stil: { ...STIL, recolorare: 'original' } });
  assert.match(html, /<g id="g-d1"><\/g>/, 'traseele nu se recolorează');
  assert.match(html, /<g id="g-d2" class="pe-panou" style="--linie: #000000; --accent: #FF5678; --accent2: #CF536D"><\/g>/);
  assert.match(html, /<g id="g-d3" class="inversat" style="--linie: #000000; --fundal: #FFFFFF; --accent: #4F66AF"><\/g>/);
});

test('o piesă raster proprie devine o formă cu un singur <image> data:', () => {
  const plan = planMic();
  plan.desene[1] = { ...plan.desene[1], id: 'p-sigla', animatie: 'aparitie', panou: null };
  plan.panouri = [];
  const desene = { ...DESENE, 'p-sigla': { tip: 'imagine', mime: 'image/png', base64: 'iVBORw0KGgo=', w: 300, h: 200 } };
  const runtime = jsonDinScript(compileazaMic({ plan, desene }), '__MG_DESENE');
  assert.deepEqual(runtime['p-sigla'], {
    viewBox: [0, 0, 300, 200],
    continut: '<image href="data:image/png;base64,iVBORw0KGgo=" x="0" y="0" width="300" height="200" preserveAspectRatio="xMidYMid meet"/>',
  });
});

test('F11: fără muzică marcajul audio dispare fără urmă; cu muzică, <audio> e ultimul copil al rădăcinii, frate cu #stage', () => {
  const fara = compileazaMic();
  assert.equal(fara, compileazaMic({ audio: '' }));
  assert.doesNotMatch(fara, /MG_AUDIO|<audio/);
  assert.ok(fara.includes('</div>\n\n      </div>\n    </div>\n\n    <script>'), 'rândul care închide #stage redevine „      </div>”');
  const audio = '<audio id="muzica" src="assets/muzica.m4a" data-start="0" data-duration="14" data-track-index="10" data-volume="1"></audio>';
  const cu = compileazaMic({ audio });
  assert.equal(cu.replace(`\n      ${audio}`, ''), fara);
  assert.equal(cu.split('<audio ').length - 1, 1);
  assert.ok(cu.includes(`\n      </div>\n      ${audio}\n    </div>\n`), 'după închiderea lui #stage, înaintea închiderii rădăcinii');
});

test('un marcaj lipsă sau dublat din sablon.html oprește compilarea', () => {
  assert.throws(() => compileazaMic({ sablonHtml: SABLON_HTML.replace('<!--MG_CARDURI-->', '') }), /<!--MG_CARDURI--> de 0 ori/);
  assert.throws(() => compileazaMic({ sablonHtml: `${SABLON_HTML}/*MG_DATE*/` }), /\/\*MG_DATE\*\/ de 2 ori/);
  assert.throws(() => compileazaMic({ desene: { 'traseu-proba': DESENE['traseu-proba'] } }), /od-proba/);
});

test('index.html nu primește capcanele runtime-ului: nimic aleator, ceas, vector-effect sau adrese de rețea', () => {
  const html = compileazaMic();
  for (const capcana of ['Math.random', 'Date.now', 'performance.now', 'vector-effect']) assert.ok(!html.includes(capcana), capcana);
  assert.deepEqual(html.split('xmlns="http://www.w3.org/2000/svg"').join('').match(/https?:\/\//g) ?? [], []);
});

// I1 (runda 1): compileaza e o funcție pură exportată, deci nu se bazează pe schema sau pe plan ca să filtreze valorile.
test('id-urile, clasele, numele iconițelor, atmosfera și durata ostile ies escapate în atribute', () => {
  const OSTIL = '"><img src=x onerror=alert(1)>';
  const ESCAPAT = '&quot;&gt;&lt;img src=x onerror=alert(1)&gt;';
  const plan = planMic();
  plan.desene[0].g = `g-d1${OSTIL}`;
  plan.iconite[0].g = `g-i1${OSTIL}`;
  plan.iconite[0].nume = [`phone${OSTIL}`];
  plan.retele = [{ g: `g-r1${OSTIL}`, scena: 0, din: null, noduri: 3, nastere: 1, scanteie: null, retrag: 3, centru: [540, 1080], raza: 290 }];
  plan.linii = [{ id: `linie-accent${OSTIL}`, scena: 2, d: 'M0 0 L10 10', t: 11, dur: 1.5, clasa: `c${OSTIL}` }];
  plan.carduri[0].id = `c1${OSTIL}`;
  plan.carduri[1].id = `c2${OSTIL}`;
  plan.atmosfera.mod = `ceata${OSTIL}`;
  plan.durata = `14${OSTIL}`;
  const iconite = { [`phone${OSTIL}`]: ICONITE.phone };
  const html = compileaza({ plan, stil: STIL, date: { sablon: 'reel-ilustrat' }, sablonHtml: SABLON_HTML, runtime: RUNTIME, fonturiCss: '', desene: DESENE, iconite });
  assert.ok(!html.includes('<img'), 'niciun <img> brut în index.html');
  for (const asteptat of [
    `<g id="g-d1${ESCAPAT}"></g>`,
    `<g id="g-i1${ESCAPAT}"><g data-icon="phone${ESCAPAT}">`,
    `<g id="g-r1${ESCAPAT}"></g>`,
    `<path id="linie-accent${ESCAPAT}" class="c${ESCAPAT}" d="M0 0 L10 10"/>`,
    `<div class="card" id="c1${ESCAPAT}"><div class="mask gap words" id="cuvinte-c1${ESCAPAT}"`,
    `<div class="card" id="c2${ESCAPAT}"><div class="label">`,
    `<div id="root" class="ceata${ESCAPAT}"`,
    `data-duration="14${ESCAPAT}"`,
  ]) assert.ok(html.includes(asteptat), asteptat);
});

// Revizuirea transversală B01-B13, T11: rădăcina <svg> se găsește cu aceeași regulă care respectă ghilimelele ca în
// normalizeazaSvg; un „>” dintr-o valoare a rădăcinii nu mută începutul interiorului.
test('T11: un „>” între ghilimele în rădăcina <svg> nu scapă niciun tag înaintea primului <path>', () => {
  const ostil = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" aria-label="><image href=x onerror=alert(1)>">'
    + '<path class="ink" d="M0 0 L10 10"/></svg>\n';
  const runtime = jsonDinScript(compileazaMic({ desene: { ...DESENE, 'od-proba': { tip: 'forma', continut: ostil } } }), '__MG_DESENE');
  assert.deepEqual(runtime['od-proba'], { viewBox: [0, 0, 10, 10], continut: '<path class="ink" d="M0 0 L10 10"/>' });
});

// T14: dimensiunile piesei raster vin din proprii/catalog-propriu.json (zona liberă), deci trec prin escapeazaHtml.
test('T14: cutie.w și cutie.h ostile ale unei piese raster ies escapate în <image>', () => {
  const plan = planMic();
  plan.desene[1] = { ...plan.desene[1], id: 'p-sigla', animatie: 'aparitie', panou: null };
  plan.panouri = [];
  const OSTIL = '1" onload="alert(1)';
  const desene = { ...DESENE, 'p-sigla': { tip: 'imagine', mime: 'image/png', base64: 'iVBORw0KGgo=', w: OSTIL, h: OSTIL } };
  const { continut } = jsonDinScript(compileazaMic({ plan, desene }), '__MG_DESENE')['p-sigla'];
  assert.ok(!continut.includes(' onload="'), continut);
  assert.ok(continut.includes(' width="1&quot; onload=&quot;alert(1)" height="1&quot; onload=&quot;alert(1)"'), continut);
});

test('C14 pe plin: mișcarea lentă intră după regizor doar când planul o cere; altfel build-ul e cel de dinainte', () => {
  const faraMiscare = compileazaMic();
  assert.ok(!faraMiscare.includes('atmosfera.miscare'), 'pe ceață nu intră runtime/miscare-plin.js');
  const { linia, regizor } = RUNTIME;
  assert.equal(compileazaMic({ runtime: { linia, regizor } }), faraMiscare, 'fără plan.atmosfera.miscare, runtime-ul nou nu contează');

  const plan = planMic();
  plan.atmosfera = { mod: 'plin', aprinde: null, impingere: 1, granulatie: 0, miscare: { deriva: [0, -24.2], pana: 12.5 } };
  const html = compileazaMic({ plan });
  const iRegizor = html.indexOf('Regizorul de la randare');
  const iMiscare = html.indexOf('Mișcarea lentă a scenei');
  assert.ok(iRegizor > 0 && iMiscare > iRegizor, 'miscare-plin.js vine după regizor, în același <script>');
  assert.match(html, /<div id="root" class="plin"/);
  assert.deepEqual(jsonDinScript(html, '__MG_PLAN').atmosfera.miscare, { deriva: [0, -24.2], pana: 12.5 });
  assert.throws(() => compileazaMic({ plan, runtime: { linia, regizor } }), /miscare-plin\.js/);
});

// Planul D, D1: CSS-ul conturului acoperă exact elementele pe care L.forma le trasează (FORME_CONTUR din linia.js).
test('D1: regulile de contur ale formelor din sablon.html acoperă toate elementele din FORME_CONTUR', () => {
  const forme = JSON.parse(/var FORME_CONTUR = (\[[^\]]*\]);/.exec(RUNTIME.linia)[1]);
  const lista = `:is(${forme.join(', ')})`;
  const reguli = SABLON_HTML.split('\n').filter((r) => r.includes('#art') && r.includes('.forma') && r.includes('.ink'));
  assert.equal(reguli.length, 3, reguli.join('\n'));
  for (const r of reguli) {
    assert.ok(r.includes(`.ink ${lista}`), `regula nu acoperă grupul .ink: ${r.trim()}`);
    assert.ok(r.includes(`${lista}.ink`), `regula nu acoperă elementul .ink: ${r.trim()}`);
    assert.ok(!/\.ink path\b|path\.ink\b/.test(r), `regula mai are forma veche, doar pe path: ${r.trim()}`);
  }
});
