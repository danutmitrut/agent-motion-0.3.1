import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { grupeaza, cuvinteVizibile, randuriCuvinte } from '../grupeaza.mjs';

const I = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../implicite.json', import.meta.url)), 'utf8'));
// măsurătorul fals: fiecare caracter are jumătate din mărime
const masoaraLa = (m) => (t) => [...t].length * m * 0.5;
const W = (text, start, end, extra = {}) => ({ id: `w${Math.round(start * 10)}`, ids: [], text, start, end, ascuns: false, corectat: false, ...extra });
const OPT = { start: 0, durata: 30, umpluturi: I.subtitrari.umpluturi, suspendari: [], cuvinteMax: 4, evidentiaza: [], import: false,
  majuscule: false, marime: 64, marimeMin: 42, banda: I.formate.vertical.benzi.jos, masoaraLa, reguli: I.subtitrari };
const texte = (r) => r.grupuri.map((g) => g.cuvinte.map((c) => c.text).join(' '));
const sir = (cuvinte, pas = 0.3, durata = 0.25) => cuvinte.split(' ').map((t, i) => W(t, i * pas, i * pas + durata));

test('rupe la cuvinte_max, la punct și la virgulă urmată de pauză', () => {
  assert.deepEqual(texte(grupeaza(sir('unu doi trei patru cinci șase'), OPT)), ['unu doi trei patru', 'cinci șase']);
  assert.deepEqual(texte(grupeaza(sir('Bună. Sunt aici'), OPT)), ['Bună.', 'Sunt aici']);
  const c = [W('Da,', 0, 0.3), W('sigur', 0.6, 0.9), W('așa,', 1.0, 1.3), W('e', 1.35, 1.5)];
  assert.deepEqual(texte(grupeaza(c, OPT)), ['Da,', 'sigur așa, e']);
});

test('rupe la pauza de 0,5 s și la schimbarea replicii la import', () => {
  const c = [W('unu', 0, 0.3), W('doi', 0.8, 1.1), W('trei', 1.2, 1.5)];
  assert.deepEqual(texte(grupeaza(c, OPT)), ['unu', 'doi trei']);
  const imp = sir('a b c d').map((x, i) => ({ ...x, fraza: i < 1 ? 0 : 1 }));
  assert.deepEqual(texte(grupeaza(imp, { ...OPT, import: true })), ['a', 'b c d']);
});

test('nu rupe numărul de unitatea lui și nici o expresie evidențiată', () => {
  const r = grupeaza(sir('acum câștig fix 6 ore pe săptămână'), OPT);
  assert.deepEqual(texte(r), ['acum câștig fix', '6 ore pe săptămână']);
  assert.equal(r.grupuri[1].cuvinte[0].evidentiat, true);
  const e = grupeaza(sir('el face asta cu agentul meu zilnic'), { ...OPT, evidentiaza: ['agentul meu'] });
  assert.deepEqual(texte(e), ['el face asta cu', 'agentul meu zilnic']);
  assert.deepEqual(e.grupuri[1].cuvinte.map((c) => c.evidentiat), [true, true, false]);
  const lipsa = grupeaza(sir('unu doi'), { ...OPT, evidentiaza: ['trei'] });
  assert.deepEqual(lipsa.erori.map((x) => [x.cod, x.camp]), [['overlay-filmare-evidentiaza', 'subtitrari.evidentiaza[0]']]);
});

test('umpluturile și cuvintele ascunse nu apar; majusculele se aplică pe text', () => {
  const c = [W('ăă', 0, 0.2), W('Bună', 0.3, 0.6), W('', 0.7, 0.9, { ascuns: true }), W('ziua', 1.0, 1.3)];
  const r = grupeaza(c, { ...OPT, majuscule: true });
  assert.deepEqual(texte(r), ['BUNĂ ZIUA']);
  assert.equal(r.acoperire.proportie, 1);
});

test('timpii: cel mult 80 ms înainte, cel puțin 0,5 s, fără suprapuneri', () => {
  const r = grupeaza([W('Unu.', 1, 1.1), W('Doi.', 1.2, 1.3), W('Trei.', 3, 3.6)], OPT);
  const [a, b, c] = r.grupuri;
  assert.deepEqual([a.start, a.end], [0.92, 1.42]);
  assert.deepEqual([b.start, b.end], [1.42, 1.92]);
  assert.deepEqual([c.start, c.end], [2.92, 3.6]);
  assert.deepEqual(r.grupuri.map((g) => g.id), ['g1', 'g2', 'g3']);
});

test('mărimea scade în pași de 2 px până încape în 2 rânduri; altfel grupul se rupe', () => {
  // lățimea utilă: 858 - 48 = 810 px
  const lung = grupeaza([W('aaaaaaaaaaaaaaaaaaaaaaaaa', 0, 0.4), W('bbbbbbbbbbbbbbbbbbbbbbbbb', 0.45, 0.8)], OPT);
  assert.equal(lung.grupuri.length, 1);
  assert.equal(lung.grupuri[0].marime, 64); // 25 · 32 = 800 ≤ 810, câte un cuvânt pe rând
  assert.deepEqual(lung.grupuri[0].randuri, [[0], [1]]);
  const r = grupeaza([W('a'.repeat(30), 0, 0.4), W('b'.repeat(30), 0.45, 0.8), W('c'.repeat(30), 0.85, 1.2)], OPT);
  assert.ok(r.grupuri.every((g) => g.marime <= 54 && g.marime >= 42 && g.randuri.length <= 2), JSON.stringify(r.grupuri.map((g) => [g.marime, g.randuri])));
  const prea = grupeaza([W('x'.repeat(60), 0, 1)], OPT);
  // cuvântul scos lasă și acoperirea la 0%
  assert.deepEqual(prea.erori.map((e) => [e.cod, e.camp]), [['overlay-filmare-subtitrari', 'corecturi'], ['overlay-filmare-subtitrari', 'subtitrari']]);
});

test('suspendările: cuvintele din fereastra lor ies, iar grupul scurt dinainte se lipește de anterior', () => {
  const c = sir('unu doi trei patru cinci șase șapte opt', 0.4, 0.3);
  const r = grupeaza(c, { ...OPT, cuvinteMax: 3, suspendari: [[1.7, 2.5]] });
  assert.ok(r.grupuri.every((g) => g.end <= 1.7 || g.start >= 2.5), JSON.stringify(r.grupuri.map((g) => [g.start, g.end])));
  assert.deepEqual(cuvinteVizibile(c, { start: 0, durata: 30, umpluturi: [], suspendari: [[1.7, 2.5]] }).map((x) => x.text), ['unu', 'doi', 'trei', 'patru', 'opt']);
});

test('filmare.start mută timpii; cuvintele tăiate de capete nu apar', () => {
  const c = [W('tăiat', 0.2, 0.6), W('bună', 1.2, 1.5), W('ziua', 1.6, 1.9), W('coadă', 4.8, 5.3)];
  const r = grupeaza(c, { ...OPT, start: 1, durata: 4 });
  assert.deepEqual(texte(r), ['bună ziua']);
  assert.deepEqual([r.grupuri[0].cuvinte[0].start, r.grupuri[0].cuvinte[1].end], [0.2, 0.9]);
});

test('acoperirea sub 95% e eroare pe subtitrari', () => {
  const c = Array.from({ length: 20 }, (_, i) => W(`c${i}.`, i * 0.3, i * 0.3 + 0.1));
  const r = grupeaza(c, { ...OPT, suspendari: [], durata: 30 });
  assert.equal(r.acoperire.proportie, 1);
  const scurt = grupeaza([W('a.', 0, 0.1), W('b.', 0.12, 0.2)], { ...OPT, durata: 0.3 });
  assert.ok(scurt.erori.some((e) => e.cod === 'overlay-filmare-subtitrari' && e.camp === 'subtitrari') || scurt.acoperire.proportie >= 0.95);
});

test('randuriCuvinte: lacom, pe cuvinte întregi', () => {
  const m = (t) => [...t].length * 10;
  assert.deepEqual(randuriCuvinte(['aa', 'bb', 'cc'], 50, m, 2), [[0, 1], [2]]);
  assert.equal(randuriCuvinte(['aa', 'bb', 'cc'], 20, m, 2), null);
  assert.deepEqual(randuriCuvinte(['Claude Code'], 110, m, 2), [[0]]);
});

test('fix 1: un număr cu unitatea lui la capătul rândului trece întreg pe rândul următor', () => {
  const m = (x) => [...x].length * 10;
  const texte = ['aaaa', '6', 'ore', 'bb'];
  // fără unități, „6” rămâne pe primul rând și „ore” trece pe al doilea
  assert.deepEqual(randuriCuvinte(texte, 90, m, 2), [[0, 1], [2, 3]]);
  assert.deepEqual(randuriCuvinte(texte, 90, m, 2, [[0], [1, 2], [3]]), [[0], [1, 2, 3]]);
  assert.equal(randuriCuvinte(['aaaa', '6', 'ore'], 40, m, 2, [[0], [1, 2]]), null);
  const c = [W('a'.repeat(23), 0, 0.2), W('6', 0.25, 0.4), W('ore', 0.45, 0.7), W('b'.repeat(8), 0.75, 1)];
  const r = grupeaza(c, { ...OPT, cuvinteMax: 6 });
  for (const g of r.grupuri) {
    const rand = g.randuri.find((x) => x.includes(1));
    if (rand) assert.ok(rand.includes(2), JSON.stringify(g.randuri));
  }
});

test('fix 2: o suspendare între număr și cuvântul următor desparte unitatea', () => {
  const c = [W('acum', 0, 0.3), W('6', 0.4, 0.6), W('ore', 1.0, 1.3), W('bine', 1.4, 1.7)];
  const r = grupeaza(c, { ...OPT, suspendari: [[0.7, 0.88]] });
  assert.ok(r.grupuri.every((g) => g.end <= 0.7 || g.start >= 0.88), JSON.stringify(r.grupuri.map((g) => [g.start, g.end])));
  assert.ok(!r.grupuri.some((g) => g.cuvinte.some((x) => x.text === '6') && g.cuvinte.some((x) => x.text === 'ore')));
});

test('fix 3: după rupere, ordinea cuvintelor și timpii grupurilor se păstrează', () => {
  const r = grupeaza([W('a'.repeat(30), 0, 0.4), W('b'.repeat(30), 0.45, 0.8), W('c'.repeat(30), 0.85, 1.2)], OPT);
  assert.deepEqual(r.grupuri.flatMap((g) => g.cuvinte.map((x) => x.text[0])), ['a', 'b', 'c']);
  r.grupuri.forEach((g, i) => { if (i > 0) assert.ok(g.start >= r.grupuri[i - 1].end); assert.ok(g.end - g.start >= 0.5 - 1e-9); });
});

test('decizia 27: startul grupului nu cade în interiorul unei suspendări (cel puțin sfârșitul ei)', () => {
  const r = grupeaza([W('unu', 1.0, 1.3), W('doi', 1.35, 1.6)], { ...OPT, suspendari: [[0.5, 0.95]] });
  assert.equal(r.grupuri[0].start, 0.95);
  // fără suspendare, avansul se aplică întreg
  assert.equal(grupeaza([W('unu', 1.0, 1.3), W('doi', 1.35, 1.6)], OPT).grupuri[0].start, 0.92);
});
