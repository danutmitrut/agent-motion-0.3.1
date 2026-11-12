// Runtime-ul reelului pe HyperFrames 0.8.96 real: un build mic, asamblat din sablon.html și runtime/,
// trece prin `hyperframes check --json` fără erori de lint și de runtime (spec 7.1, harta 8.3).
// Rulare: MG_TESTE_INTEGRARE=1 node --test teste/integrare/runtime.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stergeRecursiv } from '../../nucleu/lib/fisiere.mjs';
import { rezolvaFfmpeg, ruleazaFfmpeg } from '../../nucleu/lib/ffmpeg.mjs';
import { checkJson, ruleazaHyperframes } from '../../nucleu/lib/motor-hf.mjs';
import { cssRoluriReel } from '../../motoare/hyperframes/sabloane/reel-ilustrat/compileaza.mjs';

const sari = process.env.MG_TESTE_INTEGRARE !== '1';
const REPO = fileURLToPath(new URL('../../', import.meta.url));
const SABLON = path.join(REPO, 'motoare', 'hyperframes', 'sabloane', 'reel-ilustrat');
const GSAP = path.join(REPO, 'motoare', 'hyperframes', 'comun', 'vendor', 'gsap.min.js');

// Un plan mic în forma din harta 5.17: un traseu, o formă pe panou, două iconițe, o rețea cu scânteie,
// linia de accent, un card cu titlu, un card cu cuvinte, un card doar cu etichetă, îndemnul și semnătura.
const PLAN = {
  versiune: 1, durata: 14, fps: 30, latime: 1080, inaltime: 1920,
  atmosfera: { mod: 'ceata', aprinde: 4.9, impingere: 1.04, granulatie: 0.1 },
  desene: [
    { g: 'g-d1', scena: 0, id: 'traseu-proba', tip: 'traseu', familie: 'linie', animatie: 'linie', x: 140, y: 820, s: 0.8,
      oglindit: false, panou: null, cutie: [140, 820, 800, 560], draw: [0.3, 2.4], undraw: [4.2, 0.9] },
    { g: 'g-d2', scena: 2, id: 'od-proba', tip: 'forma', familie: 'cerneala', animatie: 'contur-umplere', x: 240, y: 840, s: 1.2,
      oglindit: true, panou: null, cutie: [240, 840, 600, 480], draw: [9.6, 2.4], undraw: null },
  ],
  iconite: [{ g: 'g-i2', scena: 1, nume: ['phone', 'mail'], pozitii: [[200, 600], [700, 600]], scara: 4.6,
    apar: [4.4, 4.8], tremura: 5.6, retrag: 6.2 }],
  retele: [{ g: 'g-r3', scena: 1, din: 'g-i2', noduri: 2, nastere: 7.0, scanteie: [8.0, 1.0], retrag: 8.6,
    centru: [540, 1080], raza: 290 }],
  linii: [{ id: 'linie-accent', scena: 2, d: 'M-40 1380 C 250 1370, 450 1130, 650 1000 C 820 890, 950 760, 1120 740',
    t: 11.0, dur: 1.5, clasa: 'c' }],
  carduri: [
    { id: 'c1', scena: 0, eticheta: 'LUNI, 8:30', randuri: [{ text: 'Telefonul sună', accent: false }, { text: 'din nou.', accent: true }],
      cuvinte: null, intra: 0.9, iese: 3.9 },
    { id: 'c2', scena: 1, eticheta: 'TOATĂ ZIUA', randuri: [], cuvinte: [{ text: 'Reprogramări.', t: 4.5 }, { text: 'Anulări.', t: 5.5 }],
      intra: 4.4, iese: 6.8 },
    { id: 'c3', scena: 2, eticheta: 'TU', randuri: [{ text: 'Tu decizi.', accent: false }], cuvinte: null, intra: 9.4, iese: null },
    { id: 'c4', scena: 1, eticheta: 'DOAR ETICHETA', randuri: null, cuvinte: null, intra: 7.0, iese: 8.5 },
  ],
  cta: { text: 'Scrie „AGENT” în comentarii', intra: 10.5 },
  semnatura: { text: 'Ana Pop,\ncoach de carieră', t: 12.2, dur: 1.2 },
  panouri: [{ pentru: 'g-d2', cutie: [228, 828, 624, 504], culoare: '#F2EFEA' }],
};

function spirala() {
  let d = 'M500 350';
  for (let i = 1; i <= 60; i += 1) {
    const a = i * 0.35;
    const r = 20 + i * 4;
    d += ` L${(500 + r * Math.cos(a)).toFixed(1)} ${(350 + r * Math.sin(a)).toFixed(1)}`;
  }
  return d;
}

const DESENE = {
  'traseu-proba': { w: 1000, h: 700, paths: [spirala(), 'M100 650 C 300 600, 700 600, 900 650'] },
  'od-proba': {
    viewBox: [0, 0, 500, 400],
    continut: '<path class="acc" d="M60 300 L440 300 L440 380 L60 380 Z"/><g class="ink">'
      + '<path d="M100 100 L200 100 L200 200 L100 200 Z"/><path d="M250 120 a60 60 0 1 0 120 0 a60 60 0 1 0 -120 0 Z"/>'
      + '<path d="M80 250 L420 250 L420 262 L80 262 Z"/></g>',
  },
};

// O piesă proprie desenată doar cu contur, cum o scrie mg desen adauga (stroke="#000" → clasa ink-contur, T16).
DESENE['p-contur'] = { viewBox: [0, 0, 500, 400], continut: '<path class="ink-contur" d="M50 200 L450 200" fill="none" stroke-width="12"/>' };

// Piesa Open Peeps sintetică din biblioteca mini (C01): două path-uri fond înaintea lui g.ink, ca în importul real.
const SVG_OP = fs.readFileSync(path.join(REPO, 'teste', 'fixtures', 'biblioteci-mini', 'biblioteci', 'forme', 'op-bust-laptop.svg'), 'utf8');
DESENE['op-bust-laptop'] = {
  viewBox: SVG_OP.match(/viewBox="([^"]+)"/)[1].trim().split(/\s+/).map(Number),
  continut: SVG_OP.replace(/^\s*<svg\b[^>]*>/, '').replace(/<\/svg>\s*$/, ''),
};

// Iconițele Lucide 1.49.0, copiate din icon-nodes.json, cu clasa w pusă ca în compileaza.mjs.
const ICONITE = {
  phone: '<path class="w" d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"/>',
  mail: '<path class="w" d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"/><rect class="w" x="2" y="4" width="20" height="16" rx="2"/>',
};

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const json = (o) => JSON.stringify(o).replace(/</g, '\\u003c');

// Înlocuirea marcajelor, redusă la ce cere planul mic; varianta completă e compileaza.mjs (B11).
function asambleaza(dir, plan = PLAN) {
  /* clasele grupului unui desen, ca atributeDesen din compileaza.mjs: inversat (panoul de pe noapte la Open Peeps), pe-panou */
  const clase = (g) => {
    const c = [];
    if (plan.desene.some((d) => d.g === g && d.panou === 'inversat')) c.push('inversat');
    if (plan.panouri.some((p) => p.pentru === g)) c.push('pe-panou');
    return c.length > 0 ? ` class="${c.join(' ')}"` : '';
  };
  const scena = [
    `<g id="g-d1"${clase('g-d1')}></g>`,
    `<g id="g-i2">${plan.iconite[0].nume.map((n) => `<g data-icon="${n}">${ICONITE[n]}</g>`).join('')}</g>`,
    '<g id="g-r3"></g>',
    `<g id="g-d2"${clase('g-d2')}></g>`,
    ...plan.linii.map((l) => `<path id="${l.id}" class="${l.clasa}" d="${l.d}"/>`),
  ].join('\n');
  const carduri = plan.carduri.map((c) => {
    let html = `<div class="card" id="${c.id}"><div class="label">${esc(c.eticheta)}</div>`;
    if (c.cuvinte) {
      html += `<div class="mask gap words" id="cuvinte-${c.id}" data-layout-allow-overflow>`
        + `${c.cuvinte.map((w) => `<div class="h word">${esc(w.text)}</div>`).join('')}</div>`;
    } else {
      (c.randuri ?? []).forEach((r, i) => {
        html += `<div class="mask${i === 0 ? ' gap' : ''}" data-layout-allow-overflow><div class="h${r.accent ? ' accent' : ''}">${esc(r.text)}</div></div>`;
      });
    }
    return `${html}</div>`;
  });
  carduri.push(`<div class="card" id="cta"><div class="mask" data-layout-allow-overflow><div class="h">${esc(plan.cta.text)}</div></div></div>`);
  const culori = ':root { --fundal: #0E0F13; --text: #F2EFEA; --atenuat: #9A9AA3; --accent: #FF7A59; --linie: #F2EFEA; '
    + '--granulatie: 0.1; --ceata-a: rgba(255, 122, 89, 0.3); --ceata-b: rgba(242, 239, 234, 0.14); '
    + '--eticheta-spatiere: 0.16em; --font-titlu: sans-serif; --font-text: sans-serif; }';
  const inlocuiri = [
    ['/*MG_FONTURI*/', ''],
    ['/*MG_CULORI*/', culori],
    ['/*MG_ROLURI*/', cssRoluriReel()],
    ['{{MG_ATMOSFERA}}', plan.atmosfera.mod],
    ['{{MG_DURATA}}', String(plan.durata)],
    ['<!--MG_SCENA-->', scena],
    ['<!--MG_CARDURI-->', carduri.join('\n')],
    ['<!--MG_SEMNATURA-->', esc(plan.semnatura.text)],
    ['/*MG_LINIA*/', fs.readFileSync(path.join(SABLON, 'runtime', 'linia.js'), 'utf8')],
    ['/*MG_DATE*/', `window.__MG_PLAN = ${json(plan)};\nwindow.__MG_DESENE = ${json(DESENE)};`],
    ['/*MG_REGIZOR*/', fs.readFileSync(path.join(SABLON, 'runtime', 'regizor-runtime.js'), 'utf8')],
    ['<!--MG_AUDIO-->', ''], // fără muzică (planul F): marcajul dispare, ca în compileaza
  ];
  let html = fs.readFileSync(path.join(SABLON, 'sablon.html'), 'utf8');
  for (const [marcaj, valoare] of inlocuiri) html = html.split(marcaj).join(valoare);
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  fs.copyFileSync(GSAP, path.join(dir, 'gsap.min.js'));
}

test('hyperframes check --json trece pe un build mic al runtime-ului', { skip: sari && 'setează MG_TESTE_INTEGRARE=1', timeout: 300000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg test Ăîș '));
  try {
    asambleaza(dir);
    const check = await checkJson(dir, { radacina: REPO });
    const gasiri = ['lint', 'runtime', 'layout', 'motion', 'contrast']
      .flatMap((cheie) => check[cheie].findings.map((f) => `${cheie}: ${f.severity} ${f.code} ${f.message}`));
    assert.equal(check._meta.version, '0.8.96');
    assert.equal(check.lint.errorCount, 0, gasiri.join('\n'));
    assert.equal(check.runtime.errorCount, 0, gasiri.join('\n'));
    assert.equal(check.runtime.warningCount, 0, gasiri.join('\n'));
    assert.equal(check.ok, true, gasiri.join('\n'));
  } finally {
    stergeRecursiv(dir);
  }
});

// Conturul din L.forma trebuie să se deseneze treptat (spec 8.4.4), nu să apară dintr-odată. Cu pathLength=1,
// stroke-dashoffset merge de la 1 la 0; dacă tween-ul îl rotunjește la pixeli întregi, traseul sare din 1 în 0.
// Planul C, D1 (V2): fiecare traseu din g.ink își desenează conturul pe toată fereastra de contur (70% din fereastră),
// cu eșalonarea plafonată ca ultimul să se termine exact unde începe umplerea. La od-proba (3 trasee, fereastra 2,4 s),
// conturul ține 1,68 s, pasul e 0,06 s, iar bara (al treilea traseu, pe panou) se desenează între 9,72 s și 11,28 s.
// Referința e conturul complet, la t0 + contur (umplerea pornește abia atunci); la t0 + 0,35 · contur bara trebuie să fie
// desenată parțial, iar la t0 + 0,69 · fereastră aproape complet. La t0 + 0,35 · contur bara e la 30% din timpul ei, deci,
// cu power1.inOut, la 18% din lungime (17% din pixeli la măsurare); de aceea pragul de jos e 0,1, nu 0,2. Înainte de V2,
// conturul barei era aici la 70%.
const laMiime = (t) => Math.round(t * 1000) / 1000;

async function pixeliInBanda(cadre, png, crop, conditie) {
  const ff = await rezolvaFfmpeg(REPO);
  const iesire = await ruleazaFfmpeg(['-v', 'error', '-i', path.join(cadre, png), '-vf', `crop=${crop},format=gray`,
    '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { ffmpeg: ff.ffmpeg });
  assert.equal(iesire.cod, 0, iesire.stderr);
  return iesire.stdout.reduce((n, v) => n + (conditie(v) ? 1 : 0), 0);
}

test('L.forma desenează conturul treptat, pe toată fereastra de contur', { skip: sari && 'setează MG_TESTE_INTEGRARE=1', timeout: 300000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg test Ăîș '));
  try {
    asambleaza(dir);
    const [t0, dur] = PLAN.desene[1].draw;
    const contur = 0.7 * dur;
    const momente = [laMiime(t0 + 0.35 * contur), laMiime(t0 + 0.69 * dur), laMiime(t0 + contur)];
    const cadre = path.join(dir, 'cadre');
    const r = await ruleazaHyperframes(['snapshot', dir, '--at', momente.join(','), '--no-end', '-o', cadre], { radacina: REPO });
    assert.equal(r.cod, 0, r.stderr);
    const pngs = fs.readdirSync(cadre).filter((f) => /^frame-\d+-at-.*\.png$/.test(f)).sort();
    assert.equal(pngs.length, 3, pngs.join(', '));
    /* pixelii închiși (conturul, în culoarea fundalului) din banda barei, pe panoul deschis */
    const pixeliContur = (png) => pixeliInBanda(cadre, png, '480:50:300:1125', (v) => v < 128);
    const [partial, aproape, complet] = [await pixeliContur(pngs[0]), await pixeliContur(pngs[1]), await pixeliContur(pngs[2])];
    assert.ok(complet > 500, `conturul complet al barei are doar ${complet} pixeli`);
    const raport = partial / complet;
    assert.ok(raport > 0.1 && raport < 0.6, `la ${momente[0]} s conturul barei are ${(raport * 100).toFixed(0)}% din pixelii conturului complet (${partial} / ${complet})`);
    assert.ok(aproape / complet > 0.9, `la ${momente[1]} s conturul barei are doar ${(aproape / complet * 100).toFixed(0)}% din pixelii conturului complet (${aproape} / ${complet})`);
  } finally {
    stergeRecursiv(dir);
  }
});

// Planul C, D1 (V2): la retragere, umplerea și accentele se sting în primele 40% din fereastra de retragere, apoi conturul
// se retrage cu dash în rest. Piesa od-proba, fără panou, pe atmosfera plin (fundal uniform): cerneala are culoarea liniei,
// deci se numără pixelii deschiși. Umplerea barei se măsoară în interiorul ei (între cele două linii de contur), conturul
// în toată banda barei. La undraw[0] + 0,85 · durata retragerii, umplerea a dispărut, iar conturul e retras doar parțial
// (C16: la 0,7 conturul de 3 px păstra 90% din pixeli, la limita pragului; se mută momentul, nu pragul).
const PLAN_RETRAGERE = {
  ...PLAN,
  atmosfera: { mod: 'plin', aprinde: null, impingere: 1, granulatie: 0 },
  desene: [PLAN.desene[0], { ...PLAN.desene[1], panou: null, undraw: [12.4, 1.2] }],
  linii: [],
  panouri: [],
};

test('la retragere, conturul formei se retrage după umplere', { skip: sari && 'setează MG_TESTE_INTEGRARE=1', timeout: 300000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg test Ăîș '));
  try {
    asambleaza(dir, PLAN_RETRAGERE);
    const d = PLAN_RETRAGERE.desene[1];
    const [t0, dur] = d.draw;
    const [u, durRetragere] = d.undraw;
    /* conturul complet (fără umplere), sfârșitul desenării (umplerea plină) și momentul din retragere */
    const momente = [laMiime(t0 + 0.7 * dur), laMiime(t0 + dur), laMiime(u + 0.85 * durRetragere)];
    const cadre = path.join(dir, 'cadre');
    const r = await ruleazaHyperframes(['snapshot', dir, '--at', momente.join(','), '--no-end', '-o', cadre], { radacina: REPO });
    assert.equal(r.cod, 0, r.stderr);
    const pngs = fs.readdirSync(cadre).filter((f) => /^frame-\d+-at-.*\.png$/.test(f)).sort();
    assert.equal(pngs.length, 3, pngs.join(', '));
    const deschis = (v) => v > 128;
    /* bara: x între 336 și 744, contururile la y 1140 și 1154,4; interiorul fără contur: x 345-735, y 1143-1150 */
    const umplere = (png) => pixeliInBanda(cadre, png, '390:8:345:1143', deschis);
    const contur = (png) => pixeliInBanda(cadre, png, '480:50:300:1125', deschis);
    const conturComplet = await contur(pngs[0]);
    const umplerePlina = await umplere(pngs[1]);
    const [umplereRetragere, conturRetragere] = [await umplere(pngs[2]), await contur(pngs[2])];
    assert.ok(conturComplet > 500, `conturul complet al barei are doar ${conturComplet} pixeli`);
    assert.ok(umplerePlina > 1500, `umplerea barei la ${momente[1]} s are doar ${umplerePlina} pixeli`);
    assert.ok(umplereRetragere < 0.05 * umplerePlina,
      `la ${momente[2]} s umplerea barei are încă ${umplereRetragere} pixeli (${(umplereRetragere / umplerePlina * 100).toFixed(0)}% din ${umplerePlina})`);
    const raport = conturRetragere / conturComplet;
    assert.ok(raport > 0.1 && raport < 0.9,
      `la ${momente[2]} s conturul barei are ${(raport * 100).toFixed(0)}% din pixelii conturului complet (${conturRetragere} / ${conturComplet})`);
  } finally {
    stergeRecursiv(dir);
  }
});

// Scena finală cu cuvinte: plan.mjs dă iese: null, deci cardul și ultimul cuvânt rămân până în ultimul cadru.
// Pe atmosfera plin nu există tween-uri pe toată durata înaintea cardurilor, deci o ieșire pusă din greșeală
// „la capătul timeline-ului” ar cădea în mijlocul filmului; testul compară zona cardului la 11,5 s și în ultimul cadru.
const PLAN_FINAL_CUVINTE = {
  ...PLAN,
  atmosfera: { mod: 'plin', aprinde: null, impingere: 1, granulatie: 0 },
  carduri: [
    ...PLAN.carduri.filter((c) => c.id !== 'c3'),
    { id: 'c3', scena: 2, eticheta: 'TU', randuri: null, cuvinte: [{ text: 'Unu.', t: 9.4 }, { text: 'Doi.', t: 10.4 }],
      intra: 9.4, iese: null },
  ],
};

test('cardul final cu cuvinte se vede în ultimul cadru (atmosfera plin)', { skip: sari && 'setează MG_TESTE_INTEGRARE=1', timeout: 300000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg test Ăîș '));
  try {
    asambleaza(dir, PLAN_FINAL_CUVINTE);
    const check = await checkJson(dir, { radacina: REPO });
    const gasiri = check.runtime.findings.map((f) => `${f.severity} ${f.code} ${f.message}`);
    assert.equal(check.runtime.errorCount + check.runtime.warningCount, 0, gasiri.join('\n'));
    const cadre = path.join(dir, 'cadre');
    const r = await ruleazaHyperframes(['snapshot', dir, '--at', '11.5,13.95', '--no-end', '-o', cadre], { radacina: REPO });
    assert.equal(r.cod, 0, r.stderr);
    const pngs = fs.readdirSync(cadre).filter((f) => /^frame-\d+-at-.*\.png$/.test(f)).sort();
    assert.equal(pngs.length, 2, pngs.join(', '));
    const ff = await rezolvaFfmpeg(REPO);
    /* pixelii deschiși (eticheta și cuvântul) din zona cardului: .card are left 96, top 200; eticheta, apoi
     * rândul de cuvinte (margin-top 28, înălțime 118) se termină pe la y 380 */
    const pixeliCard = async (png) => {
      const iesire = await ruleazaFfmpeg(['-v', 'error', '-i', path.join(cadre, png), '-vf', 'crop=888:190:96:195,format=gray',
        '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { ffmpeg: ff.ffmpeg });
      assert.equal(iesire.cod, 0, iesire.stderr);
      return iesire.stdout.reduce((n, v) => n + (v > 128 ? 1 : 0), 0);
    };
    const [mijloc, final] = [await pixeliCard(pngs[0]), await pixeliCard(pngs[1])];
    assert.ok(mijloc > 300, `la 11,5 s cardul final are doar ${mijloc} pixeli de text`);
    assert.ok(final >= 0.9 * mijloc, `în ultimul cadru cardul final are ${final} pixeli de text, față de ${mijloc} la 11,5 s`);
  } finally {
    stergeRecursiv(dir);
  }
});

// Revizuirea transversală B01-B13, T16: clasa de contur pusă de mg desen adauga are CSS și în reel (o singură sursă,
// nucleu/lib/desen/roluri.mjs), iar L.forma o desenează. Linia orizontală a piesei stă la y 1020 (820 + 200),
// între x 190 și 590, cu grosimea 12; în ultimul cadru trebuie să fie desenată, în culoarea liniei (deschisă pe noapte).
const PLAN_CONTUR = {
  ...PLAN,
  atmosfera: { mod: 'plin', aprinde: null, impingere: 1, granulatie: 0 },
  desene: [PLAN.desene[0], { g: 'g-d2', scena: 2, id: 'p-contur', tip: 'forma', familie: 'proprie', animatie: 'contur-umplere',
    x: 140, y: 820, s: 1, oglindit: false, panou: null, cutie: [140, 820, 500, 400], draw: [9.6, 2.4], undraw: null }],
  linii: [],
  panouri: [],
};

test('T16: o piesă proprie cu contur (ink-contur) se desenează în reel', { skip: sari && 'setează MG_TESTE_INTEGRARE=1', timeout: 300000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg test Ăîș '));
  try {
    asambleaza(dir, PLAN_CONTUR);
    const cadre = path.join(dir, 'cadre');
    const r = await ruleazaHyperframes(['snapshot', dir, '--at', '13.95', '--no-end', '-o', cadre], { radacina: REPO });
    assert.equal(r.cod, 0, r.stderr);
    const [png] = fs.readdirSync(cadre).filter((f) => /^frame-\d+-at-.*\.png$/.test(f));
    const ff = await rezolvaFfmpeg(REPO);
    const iesire = await ruleazaFfmpeg(['-v', 'error', '-i', path.join(cadre, png), '-vf', 'crop=380:30:200:1005,format=gray',
      '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { ffmpeg: ff.ffmpeg });
    assert.equal(iesire.cod, 0, iesire.stderr);
    const deschisi = iesire.stdout.reduce((n, v) => n + (v > 128 ? 1 : 0), 0);
    assert.ok(deschisi > 2000, `linia piesei cu contur are doar ${deschisi} pixeli deschiși în ultimul cadru`);
  } finally {
    stergeRecursiv(dir);
  }
});

// Planul D, D1: un cerc cu rol ink (fără stroke în desen) trebuie să-și traseze conturul în culoarea liniei,
// ca un path. Cercul are centrul la (390, 1020) și raza 150; la jumătatea ferestrei de contur, umplerea nu a început,
// deci pixelii deschiși din cutia cercului vin doar din contur.
DESENE['od-cerc'] = { viewBox: [0, 0, 500, 400], continut: '<g class="ink"><circle cx="250" cy="200" r="150"/></g>' };
const PLAN_CERC = {
  ...PLAN,
  atmosfera: { mod: 'plin', aprinde: null, impingere: 1, granulatie: 0 },
  desene: [PLAN.desene[0], { g: 'g-d2', scena: 2, id: 'od-cerc', tip: 'forma', familie: 'cerneala', animatie: 'contur-umplere',
    x: 140, y: 820, s: 1, oglindit: false, panou: null, cutie: [140, 820, 500, 400], draw: [9.6, 2.4], undraw: null }],
  linii: [],
  panouri: [],
};

test('D1: un cerc cu rol ink își trasează conturul înainte de umplere', { skip: sari && 'setează MG_TESTE_INTEGRARE=1', timeout: 300000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg test Ăîș '));
  try {
    asambleaza(dir, PLAN_CERC);
    const [t0, dur] = PLAN_CERC.desene[1].draw;
    const moment = laMiime(t0 + 0.5 * 0.7 * dur);
    const cadre = path.join(dir, 'cadre');
    const r = await ruleazaHyperframes(['snapshot', dir, '--at', String(moment), '--no-end', '-o', cadre], { radacina: REPO });
    assert.equal(r.cod, 0, r.stderr);
    const [png] = fs.readdirSync(cadre).filter((f) => /^frame-\d+-at-.*\.png$/.test(f));
    // cutia cercului: x 236-544, y 866-1174 (centrul 390, 1020, raza 150, plus o margine de 4 px)
    const deschisi = await pixeliInBanda(cadre, png, '308:308:236:866', (v) => v > 128);
    assert.ok(deschisi > 300, `la ${moment} s conturul cercului are doar ${deschisi} pixeli deschiși`);
  } finally {
    stergeRecursiv(dir);
  }
});

// C10, „Cel mai mare risc” din planul C: pe noapte, o piesă Open Peeps stă pe panoul inversat (fără dreptunghi în spate),
// unde cerneala ia culoarea fundalului și fondul pe a textului. Silueta (fond) trebuie să apară întâi, în primele 0,3 s
// ale ferestrei, iar conturul închis se trasează peste ea; altfel, până la umplere (70% din fereastră), desenul e
// cerneală pe fundal, adică invizibil. Planul e cel al exemplului minim (op-bust-laptop în scena 1, aceeași cutie),
// pe atmosfera plin, ca fundalul din cutie să fie uniform; la t0 + 0,5 s cel puțin 2% din cutie trebuie să difere de fundal.
const PLAN_INVERSAT = {
  ...PLAN,
  atmosfera: { mod: 'plin', aprinde: null, impingere: 1, granulatie: 0 },
  desene: [{ g: 'g-d1', scena: 0, id: 'op-bust-laptop', tip: 'forma', familie: 'cerneala', animatie: 'contur-umplere',
    x: 225, y: 779, s: 2.869, oglindit: false, panou: 'inversat', cutie: [225, 779, 631, 703], draw: [0.3, 3.4], undraw: null },
  PLAN.desene[1]],
  linii: [],
  panouri: [],
};

test('pe noapte, o piesă Open Peeps pe panoul inversat se vede din primele 0,6 s', { skip: sari && 'setează MG_TESTE_INTEGRARE=1', timeout: 300000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg test Ăîș '));
  try {
    asambleaza(dir, PLAN_INVERSAT);
    const [d] = PLAN_INVERSAT.desene;
    const cadre = path.join(dir, 'cadre');
    const r = await ruleazaHyperframes(['snapshot', dir, '--at', String(d.draw[0] + 0.5), '--no-end', '-o', cadre], { radacina: REPO });
    assert.equal(r.cod, 0, r.stderr);
    const [png] = fs.readdirSync(cadre).filter((f) => /^frame-\d+-at-.*\.png$/.test(f));
    const ff = await rezolvaFfmpeg(REPO);
    const [x, y, w, h] = d.cutie;
    const iesire = await ruleazaFfmpeg(['-v', 'error', '-i', path.join(cadre, png), '-vf', `crop=${w}:${h}:${x}:${y},format=gray`,
      '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { ffmpeg: ff.ffmpeg });
    assert.equal(iesire.cod, 0, iesire.stderr);
    /* fundalul de noapte (#0E0F13) are gri ~15; orice pixel peste 40 e desen */
    const diferiti = iesire.stdout.reduce((n, v) => n + (v > 40 ? 1 : 0), 0);
    const prag = Math.ceil(0.02 * w * h);
    assert.ok(diferiti >= prag, `la ${d.draw[0] + 0.5} s piesa de pe panoul inversat are ${diferiti} pixeli diferiți de fundal în cutie (cel puțin ${prag})`);
  } finally {
    stergeRecursiv(dir);
  }
});

// C10, runda 1: după umplere, cerneala (în culoarea fundalului) nu trebuie să acopere silueta. La Open Peeps, cerneala e
// trăsătură subțire peste siluetă (în biblioteca reală și, de la runda 1, în mini); dacă ar fi o formă plină mai mare
// decât fondul, piesa ar dispărea pe noapte de la sfârșitul umplerii. La t0 + fereastră + 0,3 s, cel puțin 2% din cutie
// trebuie să difere încă de fundal.
test('pe noapte, piesa Open Peeps de pe panoul inversat rămâne vizibilă după umplere', { skip: sari && 'setează MG_TESTE_INTEGRARE=1', timeout: 300000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg test Ăîș '));
  try {
    asambleaza(dir, PLAN_INVERSAT);
    const [d] = PLAN_INVERSAT.desene;
    const t = Math.round((d.draw[0] + d.draw[1] + 0.3) * 100) / 100;
    const cadre = path.join(dir, 'cadre');
    const r = await ruleazaHyperframes(['snapshot', dir, '--at', String(t), '--no-end', '-o', cadre], { radacina: REPO });
    assert.equal(r.cod, 0, r.stderr);
    const [png] = fs.readdirSync(cadre).filter((f) => /^frame-\d+-at-.*\.png$/.test(f));
    const ff = await rezolvaFfmpeg(REPO);
    const [x, y, w, h] = d.cutie;
    const iesire = await ruleazaFfmpeg(['-v', 'error', '-i', path.join(cadre, png), '-vf', `crop=${w}:${h}:${x}:${y},format=gray`,
      '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { ffmpeg: ff.ffmpeg });
    assert.equal(iesire.cod, 0, iesire.stderr);
    const diferiti = iesire.stdout.reduce((n, v) => n + (v > 40 ? 1 : 0), 0);
    const prag = Math.ceil(0.02 * w * h);
    assert.ok(diferiti >= prag, `la ${t} s, după umplere, piesa de pe panoul inversat are ${diferiti} pixeli diferiți de fundal în cutie (cel puțin ${prag})`);
  } finally {
    stergeRecursiv(dir);
  }
});
