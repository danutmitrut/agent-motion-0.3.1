import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const citesteText = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const MISCARI = citesteText('../lib/miscari.js');
const REGIZOR = citesteText('../lib/regizor.js');

function mediu() {
  const apeluri = [];
  const elemente = new Map();
  const element = (sel) => {
    if (!elemente.has(sel)) elemente.set(sel, { textContent: '', className: 'ceata centru', setAttribute(n, v) { this[n] = v; } });
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
  const window = {};
  return { apeluri, element, window, context: { window, gsap, document, Array }, laTimpul: (t) => { timp = t; } };
}

test('regulile runtime-ului: fără aleator, fără ceas, fără valori relative, doar comentarii bloc', () => {
  for (const [nume, text] of [['miscari.js', MISCARI], ['regizor.js', REGIZOR]]) {
    assert.equal(/Math\.random|Date\.now|new Date|performance\.now/.test(text), false, `${nume}: aleator sau ceas`);
    assert.equal(/["'][+-]=/.test(text), false, `${nume}: valoare relativă`);
    assert.equal(/^\s*\/\//m.test(text), false, `${nume}: comentariu de tip linie`);
  }
});

test('regizorul execută pașii planului în ordine, cu timpii din plan', () => {
  const m = mediu();
  m.window.__MG_PLAN = {
    durata: 4.4, inaltime: 1920, iesire: 0.45,
    atmosfera: { mod: 'degrade', impingere: 1.03 },
    scene: [{ id: 's1', start: 0, sfarsit: 4.4, ultima: false, deriva: 12, pasi: [
      { efect: 'apare', tinta: '#r1-1', t: 0.1, dur: 0.5, x: 0, y: 16, ease: 'power3.out' },
      { efect: 'masca', tinta: '#r1-2', t: 0.35, dur: 0.7, ease: 'power3.out' },
      { efect: 'numara', tinta: '#t1-3', t: 1, dur: 1.4, valoare: 1250000, zecimale: 0, prefix: '€', sufix: '' },
      { efect: 'tasteaza', tinta: '#t1-4', t: 2, dur: 0.8, text: 'Ioana Pop' },
    ] }],
  };
  vm.runInNewContext(`${MISCARI}\n${REGIZOR}`, m.context);
  assert.equal(typeof m.window.__timelines.main, 'object');
  const fromTo = m.apeluri.filter((a) => a[0] === 'fromTo');
  assert.deepEqual(fromTo.map((a) => [a[1], a[4]]), [
    ['#compozitie', 0], ['#degrade', 0], ['#s1', 0], ['#s1 > .bloc', 3.95], ['#r1-1', 0.1], ['#r1-2', 0.35],
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(fromTo[3][3])), { y: -24, opacity: 0, duration: 0.45, ease: 'power2.in', immediateRender: false });
  assert.deepEqual(m.apeluri.filter((a) => a[0] === 'set').map((a) => [a[1], a[2].autoAlpha, a[3]]), [['#s1', 1, 0], ['#s1', 0, 4.4]]);
  const motor = m.apeluri.find((a) => a[0] === 'to' && a[2].onUpdate);
  m.laTimpul(1.7);
  motor[2].onUpdate();
  assert.match(m.element('#t1-3').textContent, /^€\d{1,3}(\.\d{3})*$/);
  m.laTimpul(2.4);
  motor[2].onUpdate();
  assert.equal(m.element('#t1-3').textContent, '€1.250.000');
  assert.equal(m.element('#t1-4').textContent, 'Ioan');
  m.laTimpul(3);
  motor[2].onUpdate();
  assert.equal(m.element('#t1-4').textContent, 'Ioana Pop');
  assert.equal(m.element('#noise-t').seed, String(1 + (Math.floor(3 * 12) % 8)));
});

test('ultima scenă nu iese; un efect necunoscut oprește regizorul', () => {
  const m = mediu();
  m.window.__MG_PLAN = { durata: 3.5, inaltime: 1080, iesire: 0.45, atmosfera: { mod: 'plin', impingere: 1.03 }, scene: [{ id: 's1', start: 0, sfarsit: 3.5, ultima: true, deriva: 12, pasi: [] }] };
  vm.runInNewContext(`${MISCARI}\n${REGIZOR}`, m.context);
  assert.equal(m.apeluri.some((a) => a[1] === '#s1 > .bloc'), false);
  const m2 = mediu();
  m2.window.__MG_PLAN = { ...m.window.__MG_PLAN, scene: [{ id: 's1', start: 0, sfarsit: 3.5, ultima: true, deriva: 12, pasi: [{ efect: 'zboara', tinta: '#x', t: 0, dur: 1 }] }] };
  assert.throws(() => vm.runInNewContext(`${MISCARI}\n${REGIZOR}`, m2.context), /Efect necunoscut/);
});
