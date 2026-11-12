import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { formateazaNumar } from '../tipuri.mjs';

const citesteText = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const MISCARI = citesteText('../lib/miscari.js');
const REGIZOR = citesteText('../lib/regizor.js');
const CULORI = { text: '#F2EFEA', accent: '#FF7A59' };

function mediu() {
  const apeluri = [];
  const elemente = new Map();
  const element = (sel) => {
    if (!elemente.has(sel)) elemente.set(sel, { textContent: '' });
    return elemente.get(sel);
  };
  let timp = 0;
  const tl = {
    fromTo: (...a) => apeluri.push(['fromTo', ...a]),
    set: (...a) => apeluri.push(['set', ...a]),
    to: (...a) => apeluri.push(['to', ...a]),
    time: () => timp,
  };
  const gsap = { timeline: () => tl, set: (...a) => apeluri.push(['gsap.set', ...a]) };
  const document = { querySelector: (s) => element(s), getElementById: (id) => element(`#${id}`) };
  const window = { __MG_CULORI: CULORI };
  return { apeluri, element, window, context: { window, gsap, document }, laTimpul: (t) => { timp = t; } };
}

const PLAN = {
  durata: 6,
  elemente: [
    { n: 1, tip: 'cifra', start: 0.2, sfarsit: 2.7, pasi: [
      { efect: 'apare', tinta: '#b1-1', t: 0.2, dur: 0.35, x: 0, y: 16, ease: 'power3.out' },
      { efect: 'apare', tinta: '#b1-2', t: 0.32, dur: 0.35, x: 0, y: 12, ease: 'power3.out' },
      { efect: 'numara', tinta: '#t1-1', t: 0.32, dur: 0.8, valoare: 1250, zecimale: 0, prefix: '', sufix: ' lei' },
      { efect: 'iese', tinta: '#e1', t: 2.45, dur: 0.25, x: 0, y: -12, ease: 'power2.in' },
    ] },
    { n: 2, tip: 'final', start: 4, sfarsit: 6, pasi: [{ efect: 'apare', tinta: '#b2-1', t: 4, dur: 0.35, x: 0, y: 16, ease: 'power3.out' }] },
  ],
  subtitrari: { pasi: [{ efect: 'grup', tinta: '#g1', t: 0.3, dur: 1.5, iesire: 0.12 }, { efect: 'cuvant', tinta: '#c1-1', t: 0.4, dur: 0.3 }] },
};

test('regulile runtime-ului: fără aleator, fără ceas, fără valori relative, doar comentarii bloc, filmarea neatinsă', () => {
  for (const [nume, text] of [['miscari.js', MISCARI], ['regizor.js', REGIZOR]]) {
    assert.equal(/Math\.random|Date\.now|new Date|performance\.now/.test(text), false, `${nume}: aleator sau ceas`);
    assert.equal(/["'][+-]=/.test(text), false, `${nume}: valoare relativă`);
    assert.equal(/^\s*\/\//m.test(text), false, `${nume}: comentariu de tip linie`);
    assert.equal(/#video|#voce|currentTime|playbackRate/.test(text), false, `${nume}: atinge filmarea`);
  }
});

test('regizorul: elementele cu pașii lor, apoi subtitrările, cu timpii din plan', () => {
  const m = mediu();
  m.window.__MG_PLAN = PLAN;
  vm.runInNewContext(`${MISCARI}\n${REGIZOR}`, m.context);
  assert.equal(typeof m.window.__timelines.main, 'object');
  assert.deepEqual(m.apeluri.filter((a) => a[0] === 'gsap.set').map((a) => a[1]), ['#e1', '#e2', '#g1']);
  assert.deepEqual(m.apeluri.filter((a) => a[0] === 'set').map((a) => [a[1], JSON.parse(JSON.stringify(a[2])), a[3]]), [
    ['#e1', { autoAlpha: 1 }, 0.2], ['#e1', { autoAlpha: 0 }, 2.7], ['#e2', { autoAlpha: 1 }, 4], ['#g1', { autoAlpha: 1 }, 0.3],
    ['#c1-1', { color: CULORI.accent }, 0.4], ['#c1-1', { color: CULORI.text }, 0.7],
  ]);
  const fromTo = m.apeluri.filter((a) => a[0] === 'fromTo').map((a) => [a[1], a[4]]);
  assert.deepEqual(fromTo.slice(0, 4), [['#b1-1', 0.2], ['#b1-2', 0.32], ['#e1', 2.45], ['#b2-1', 4]]);
  assert.equal(fromTo[4][0], '#g1');
  assert.ok(Math.abs(fromTo[4][1] - 1.68) < 1e-9);
});

test('numărătoarea: formatarea lui formateazaNumar, valoarea exactă la final', () => {
  const m = mediu();
  m.window.__MG_PLAN = PLAN;
  vm.runInNewContext(`${MISCARI}\n${REGIZOR}`, m.context);
  const motor = m.apeluri.find((a) => a[0] === 'to' && a[2].onUpdate);
  assert.equal(m.element('#t1-1').textContent, '0 lei');
  m.laTimpul(2);
  motor[2].onUpdate();
  assert.equal(m.element('#t1-1').textContent, '1.250 lei');
  for (const [x, z] of [[0, 0], [7, 0], [1250000, 0], [3.5, 1], [-12.25, 2], [999.995, 2], [0.04, 1]]) {
    assert.equal(m.window.Miscari.formatRo(x, z), formateazaNumar(x, z), `${x} cu ${z} zecimale`);
  }
});

test('un efect necunoscut oprește regizorul', () => {
  const m = mediu();
  m.window.__MG_PLAN = { durata: 1, elemente: [], subtitrari: { pasi: [{ efect: 'zboara', tinta: '#x', t: 0, dur: 1 }] } };
  assert.throws(() => vm.runInNewContext(`${MISCARI}\n${REGIZOR}`, m.context), /Efect necunoscut în plan: zboara/);
});
