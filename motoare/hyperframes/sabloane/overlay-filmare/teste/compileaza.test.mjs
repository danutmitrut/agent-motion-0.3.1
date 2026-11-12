import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { valoriStil } from '../../../../../nucleu/lib/sdk.mjs';
import { compileaza, cssRoluriText } from '../compileaza.mjs';
import { cronologie } from '../sablon.mjs';
import { proiectFals, cuvinteDin, dateMinime, stilTest, IMPLICITE } from './ajutoare.mjs';

const citesteText = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const SABLON_HTML = citesteText('../index.src.html');
const RUNTIME = { miscari: citesteText('../lib/miscari.js'), regizor: citesteText('../lib/regizor.js') };
const TEXT = 'Bună sunt Andreea și lucrez cu agenți în fiecare zi. Acum câștig șase ore pe săptămână, pentru că agentul meu face trei lucruri: răspunde la e-mailuri, programează postările și pregătește ofertele. Vreau să-ți arăt cum.';

function planDin(t, date, stil = stilTest('noapte')) {
  const p = proiectFals({ cuvinte: cuvinteDin(TEXT, { de_la: 0.4, pas: 0.36, lung: 0.3 }), durata: 20 });
  t.after(p.curata);
  const r = cronologie(date, stil, p.ctx);
  assert.deepEqual(r.erori, []);
  return { plan: r.intern, stil: valoriStil(stil), date };
}
const compileazaCu = ({ plan, stil, date }, extra = {}) => compileaza({ plan, stil, date, sablonHtml: SABLON_HTML, runtime: RUNTIME, fonturiCss: '/*f*/', implicite: IMPLICITE, ...extra });

const DATE = dateMinime({
  elemente: [
    { tip: 'cifra', ancora: { fraza: 'șase ore' }, valoare: 6, sufix: ' ore', text: 'câștigate în fiecare săptămână' },
    { tip: 'citat', ancora: { fraza: 'agentul meu' }, text: 'Agentul meu face trei lucruri & atât' },
    { tip: 'final', cta: 'Urmărește-mă' },
  ],
  subtitrari: { evidentiaza: ['șase ore'] },
});

test('marcajele se înlocuiesc toate, iar rezultatul e determinist', (t) => {
  const p = planDin(t, DATE);
  const html = compileazaCu(p);
  assert.equal(html, compileazaCu(p));
  assert.equal(/\{\{MG_|\/\*MG_|<!--MG_/.test(html), false);
  assert.match(html, /<div id="root" class="vertical cuvant-activ" data-composition-id="main" data-start="0" data-duration="20" data-width="1080" data-height="1920">/);
});

test('doar rădăcina, filmarea și vocea sunt în cronologia HyperFrames (check --strict: nested_structure_needs_subcomposition)', (t) => {
  const html = compileazaCu(planDin(t, DATE));
  const cronometrate = [...html.matchAll(/<(\w+) id="([^"]+)"[^>]*\bdata-start=/g)].map((m) => `${m[1]}#${m[2]}`);
  assert.deepEqual(cronometrate, ['div#root', 'video#video', 'audio#voce']);
  assert.equal(/class="[^"]*\bclip\b/.test(html), false);
  assert.match(html, /<div id="strat">/);
});

test('filmarea și vocea: aceeași sursă, același început și aceeași durată; filmarea neatinsă', (t) => {
  const p = planDin(t, dateMinime({ filmare: { fisier: 'active/filmare-lucru.mp4', start: 1.5, sfarsit: 15.5, focus_x: 30 } }));
  const html = compileazaCu(p);
  assert.match(html, /<video id="video" src="filmare.mp4" muted playsinline data-start="0" data-duration="14" data-media-start="1.5" data-track-index="0"><\/video>/);
  assert.match(html, /<audio id="voce" src="filmare.mp4" data-start="0" data-duration="14" data-media-start="1.5" data-track-index="1"><\/audio>/);
  assert.match(html, /--focus-x: 30%;/);
  assert.equal(/filter:|mix-blend|transform:\s*scale/.test(html), false);
  // nimic din banda de transcriere a lui HyperFrames: subtitrările sunt elemente proprii
  assert.equal(html.includes('const TRANSCRIPT = ['), false);
  assert.equal(html.includes('const script = ['), false);
});

test('fiecare text e un nod static, escapat; fiecare cuvânt de subtitrare are id-ul lui', (t) => {
  const p = planDin(t, DATE);
  const html = compileazaCu(p);
  // citatul primește ghilimelele românești în tipuri.mjs; & se escapează
  assert.ok(html.includes('>„Agentul meu face trei lucruri &amp; atât”</span>'));
  for (const g of p.plan.subtitrari.grupuri) {
    assert.ok(html.includes(`id="${g.id}"`), g.id);
    g.cuvinte.forEach((c, i) => assert.ok(html.includes(`id="c${g.n}-${i + 1}">`), `c${g.n}-${i + 1}`));
  }
  assert.match(html, /<span class="c ev" id="c\d+-\d+">șase<\/span>/);
});

test('banda subtitrărilor: containerul și elementele care o ating sunt marcate pentru caption-zone', (t) => {
  const p = planDin(t, DATE);
  const html = compileazaCu(p);
  assert.match(html, /<div id="subtitrari" data-layout-allow-caption-zone>/);
  for (const e of p.plan.elemente) {
    const marcat = html.includes(`id="e${e.n}" data-layout-allow-caption-zone`);
    assert.equal(marcat, e.permite_banda_subtitrari, `e${e.n}`);
  }
});

test('planul intră în pagină ca JSON sigur, fără </script>', (t) => {
  // validarea refuză < în date (text-cu-cod); aici se verifică a doua plasă, chiar dacă un text ar ajunge în plan
  const p = planDin(t, dateMinime({ elemente: [{ tip: 'citat', la: 1, text: 'Scrie aici' }] }));
  p.plan.elemente[0].texte[0].text = 'Scrie </script><!-- aici';
  const html = compileazaCu(p);
  const date = html.split('<script>window.__MG_PLAN = ')[1].split('</script>')[0];
  assert.equal(date.includes('</script'), false);
  assert.equal(date.includes('<!--'), false);
  assert.match(date, /\\u003c\/script>/);
});

test('rolurile: fontul titlului cu greutatea măsurată, culorile pe rol, cifrele tabulare', () => {
  const css = cssRoluriText(IMPLICITE, 800);
  assert.match(css, /\.r-titlu \{ font-family: var\(--font-titlu\), sans-serif; font-weight: 800;/);
  assert.match(css, /\.r-eticheta \{[^}]*color: var\(--accent\);/);
  assert.match(css, /\.r-detaliu \{[^}]*color: var\(--atenuat\);/);
  assert.match(css, /\.r-cifra \{[^}]*font-variant-numeric: tabular-nums;/);
  assert.equal(css.includes('.r-subtitrare'), false);
});

test('marcajele lipsă sau dublate opresc compilarea; doar datele lui overlay-filmare', (t) => {
  const p = planDin(t, dateMinime());
  assert.throws(() => compileazaCu(p, { sablonHtml: SABLON_HTML.replace('<!--MG_SUBTITRARI-->', '') }), /marcajul <!--MG_SUBTITRARI--> de 0 ori; trebuie 1/);
  assert.throws(() => compileazaCu(p, { sablonHtml: `${SABLON_HTML}/*MG_DATE*/` }), /marcajul \/\*MG_DATE\*\/ de 2 ori/);
  assert.throws(() => compileazaCu({ ...p, date: { sablon: 'text-animat' } }), /doar date ale șablonului overlay-filmare/);
});
