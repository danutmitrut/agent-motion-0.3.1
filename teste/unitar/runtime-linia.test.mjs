// L.card și L.cuvinte din runtime/linia.js pe GSAP 3.14.2 real, într-un vm Node, cu un document minim (fără Chrome).
// Cardul final cu cuvinte (iese: null, plan.mjs) rămâne până la capăt, iar timeline-ul nu trece de durata
// compoziției; un card doar cu etichetă (CARD_DOAR_ETICHETA în plan.mjs) nu cere elemente care lipsesc.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const GSAP = path.join(REPO, 'motoare', 'hyperframes', 'comun', 'vendor', 'gsap.min.js');
const LINIA = path.join(REPO, 'motoare', 'hyperframes', 'sabloane', 'reel-ilustrat', 'runtime', 'linia.js');
const DURATA = 14;

/**
 * Pornește linia.js peste GSAP-ul din repo. Elementele sunt obiecte simple, găsite după selectorul exact
 * pe care îl cere runtime-ul; GSAP le animă proprietățile direct (opacity, autoAlpha, yPercent, x, y, scale).
 * @param {Record<string, number>} selectori selector -> numărul de elemente
 */
function pornesteLinia(selectori) {
  const elemente = {};
  for (const [selector, n] of Object.entries(selectori)) {
    elemente[selector] = Array.from({ length: n }, () => ({ opacity: 1, autoAlpha: 1, yPercent: 0, x: 0, y: 0, scale: 1 }));
  }
  const document = {
    querySelectorAll: (s) => elemente[s] ?? [],
    querySelector: (s) => (elemente[s] ?? [])[0] ?? null,
    getElementById: (id) => (elemente[`#${id}`] ?? [])[0] ?? null,
    createElement: () => ({ style: {} }),
    documentElement: { style: {} },
    body: { style: {} },
  };
  const avertismente = [];
  const ctx = {
    document,
    console: { warn: (...a) => avertismente.push(a.join(' ')), log() {} },
    setTimeout, clearTimeout, requestAnimationFrame: () => 0, cancelAnimationFrame() {},
  };
  ctx.window = ctx;
  ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(GSAP, 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(LINIA, 'utf8'), ctx);
  const negasite = () => avertismente.filter((a) => /not found/.test(a));
  return { L: ctx.Linia.start(DURATA), el: (s, i = 0) => elemente[s][i], tl: () => ctx.__timelines.main, negasite };
}

const SCENA = { '#glow-a': 1, '#glow-b': 1, '#cam': 1, '.card': 1 };

for (const mod of ['ceata', 'plin']) {
  test(`cardul final cu cuvinte rămâne până la capăt, iar timeline-ul are durata compoziției (${mod})`, () => {
    const { L, el, tl, negasite } = pornesteLinia({ ...SCENA, '#c3': 1, '#c3 .label': 1, '#cuvinte-c3 .word': 2 });
    L.atmosfera({ mod, aprinde: mod === 'ceata' ? 4.9 : null, impingere: 1.04 });
    L.cuvinte('cuvinte-c3', [9.4, 10.4], null, { card: 'c3' });
    L.gata();
    assert.equal(tl().duration(), DURATA, 'timeline-ul trece de durata compoziției');
    tl().seek(DURATA - 0.01);
    assert.equal(el('#c3').autoAlpha, 1, 'cardul final s-a ascuns');
    assert.equal(el('#c3 .label').opacity, 1, 'eticheta cardului final s-a stins');
    assert.equal(el('#cuvinte-c3 .word', 1).autoAlpha, 1, 'ultimul cuvânt s-a ascuns');
    assert.equal(el('#cuvinte-c3 .word', 1).yPercent, 0, 'ultimul cuvânt a ieșit din mască');
    assert.equal(el('#cuvinte-c3 .word', 0).autoAlpha, 0, 'primul cuvânt trebuia înlocuit de al doilea');
    assert.deepEqual(negasite(), []);
  });
}

test('un card doar cu etichetă intră și iese fără ținte GSAP lipsă', () => {
  const { L, el, tl, negasite } = pornesteLinia({ ...SCENA, '#c4': 1, '#c4 .label': 1 });
  L.card('c4', 7.0, 8.5);
  L.gata();
  assert.deepEqual(negasite(), []);
  tl().seek(7.8);
  assert.equal(el('#c4').autoAlpha, 1);
  assert.equal(el('#c4 .label').opacity, 1);
  tl().seek(9.2);
  assert.equal(el('#c4').autoAlpha, 0);
  assert.equal(tl().duration(), DURATA);
});
