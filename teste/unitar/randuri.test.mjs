// Ruperea rândurilor (planul F, F8): lacomă, deterministă, cu regula română a cuvintelor scurte și accentul *...* pe segmente.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { CUVINTE_SCURTE, masuratorRand, rupeRanduri } from '../../nucleu/lib/randuri.mjs';

const RADACINA = fileURLToPath(new URL('../../', import.meta.url));
const caractere = (s) => Array.from(s).length * 10; // 10 px pe caracter, pentru cazurile de logică

test('lista cuvintelor scurte e cea din decizia 7', () => {
  assert.deepEqual([...CUVINTE_SCURTE].sort(), ['a', 'ca', 'cu', 'că', 'dar', 'de', 'din', 'iar', 'la', 'nu', 'o', 'pe', 'pentru', 'prin', 'sau', 'spre', 'să', 'un', 'în', 'și'].sort());
});

test('lacom: umple fiecare rând cât încape', () => {
  const r = rupeRanduri('aaa bbb ccc ddd', { latimeMax: 70, masoara: caractere });
  assert.equal(r.ok, true);
  assert.deepEqual(r.randuri.map((x) => x.text), ['aaa bbb', 'ccc ddd']);
  assert.deepEqual(r.randuri.map((x) => x.latime), [70, 70]);
});

test('un cuvânt scurt de la capăt de rând trece pe rândul următor când acolo încape', () => {
  const r = rupeRanduri('Ana merge și ea acasă', { latimeMax: 120, masoara: caractere });
  assert.deepEqual(r.randuri.map((x) => x.text), ['Ana merge', 'și ea acasă']);
});

test('cuvântul scurt rămâne la capăt dacă pe rândul următor nu mai încape', () => {
  const r = rupeRanduri('Ana merge și acasăacasă', { latimeMax: 120, masoara: caractere });
  assert.deepEqual(r.randuri.map((x) => x.text), ['Ana merge și', 'acasăacasă']);
});

test('două cuvinte scurte la rând se mută împreună („și în”); majusculele și punctuația nu ascund cuvântul („Și”, „în,” nu)', () => {
  assert.deepEqual(rupeRanduri('xxxxx și în zzzzzzz', { latimeMax: 140, masoara: caractere }).randuri.map((x) => x.text), ['xxxxx', 'și în zzzzzzz']);
  assert.deepEqual(rupeRanduri('xxxxx yyy Și zzzz', { latimeMax: 120, masoara: caractere }).randuri.map((x) => x.text), ['xxxxx yyy', 'Și zzzz']);
  assert.deepEqual(rupeRanduri('xxxxx yyy în, zzzz', { latimeMax: 140, masoara: caractere }).randuri.map((x) => x.text), ['xxxxx yyy în,', 'zzzz']);
});

test('un singur cuvânt mai lat decât rândul: eșec structurat cuvant-prea-lung', () => {
  assert.deepEqual(rupeRanduri('aa bbbbbbbbbbbb cc', { latimeMax: 100, masoara: caractere }),
    { ok: false, motiv: 'cuvant-prea-lung', cuvant: 'bbbbbbbbbbbb', latime: 120 });
});

test('peste maxRanduri: eșec structurat prea-multe-randuri, cu rândurile și numărul necesar', () => {
  const r = rupeRanduri('aaa bbb ccc ddd eee', { latimeMax: 70, masoara: caractere, maxRanduri: 2 });
  assert.equal(r.ok, false);
  assert.equal(r.motiv, 'prea-multe-randuri');
  assert.equal(r.necesare, 3);
  assert.deepEqual(r.randuri.map((x) => x.text), ['aaa bbb', 'ccc ddd', 'eee']);
});

test('accentul: * nu se măsoară; accentul rupt pe două rânduri se închide și se redeschide', () => {
  const r = rupeRanduri('Un *sistem care preia* rutina', { latimeMax: 110, masoara: caractere });
  assert.equal(r.ok, true);
  assert.deepEqual(r.randuri.map((x) => x.text), ['Un sistem', 'care preia', 'rutina']);
  assert.deepEqual(r.randuri.map((x) => x.segmente), [
    [{ text: 'Un ', accent: false }, { text: 'sistem', accent: true, nr: 0 }],
    [{ text: 'care preia', accent: true, nr: 0 }],
    [{ text: 'rutina', accent: false }],
  ]);
});

test('două accente pe același rând rămân două segmente, cu nr 0 și 1; spațiul dintre ele nu e accentuat', () => {
  const r = rupeRanduri('*fără* *tine*', { latimeMax: 1000, masoara: caractere });
  assert.deepEqual(r.randuri.map((x) => x.segmente), [
    [{ text: 'fără', accent: true, nr: 0 }, { text: ' ', accent: false }, { text: 'tine', accent: true, nr: 1 }],
  ]);
  const lipite = rupeRanduri('a*b**c*d', { latimeMax: 1000, masoara: caractere });
  assert.deepEqual(lipite.randuri[0].segmente, [
    { text: 'a', accent: false }, { text: 'b', accent: true, nr: 0 }, { text: 'c', accent: true, nr: 1 }, { text: 'd', accent: false },
  ]);
});

test('un accent rupt pe două rânduri dă două segmente cu același nr; accentele de după își păstrează indicele', () => {
  const r = rupeRanduri('*aaa* x *bbb ccc*', { latimeMax: 70, masoara: caractere });
  assert.deepEqual(r.randuri.map((x) => x.text), ['aaa x', 'bbb ccc']);
  assert.deepEqual(r.randuri.map((x) => x.segmente), [
    [{ text: 'aaa', accent: true, nr: 0 }, { text: ' x', accent: false }],
    [{ text: 'bbb ccc', accent: true, nr: 1 }],
  ]);
  const rupt = rupeRanduri('*aaa bbb* ccc', { latimeMax: 30, masoara: caractere });
  assert.deepEqual(rupt.randuri.map((x) => x.segmente), [
    [{ text: 'aaa', accent: true, nr: 0 }],
    [{ text: 'bbb', accent: true, nr: 0 }],
    [{ text: 'ccc', accent: false }],
  ]);
});

test('spațiul nedespărțitor (U+00A0, U+202F) ține cuvintele împreună; lățimile sunt rotunjite la 3 zecimale', () => {
  const r = rupeRanduri('aaa bb\u00A0cc dd\u202Fee', { latimeMax: 60, masoara: caractere });
  assert.deepEqual(r.randuri.map((x) => x.text), ['aaa', 'bb\u00A0cc', 'dd\u202Fee']);
  const z = rupeRanduri('aa bb', { latimeMax: 100, masoara: (s) => s.length / 3 });
  assert.equal(z.randuri[0].latime, 1.667);
});

test('spațiile multiple și cele de la capete nu fac rânduri goale; textul gol dă zero rânduri', () => {
  assert.deepEqual(rupeRanduri('  aaa   bbb  ', { latimeMax: 1000, masoara: caractere }).randuri.map((x) => x.text), ['aaa bbb']);
  assert.deepEqual(rupeRanduri('', { latimeMax: 100, masoara: caractere }), { ok: true, randuri: [] });
});

test('cu fonturi reale (fontkit): diacriticele se măsoară și ruperea e aceeași la două rulări', () => {
  const masoara = masuratorRand(RADACINA, { font: 'inter', greutate: 700, marime: 64 });
  const lat = masoara('Șase oameni își țin ritmul');
  assert.ok(lat > 700 && lat < 856, `lățimea ${lat}`); // Inter 700 la 64 px: 778,28 px măsurat (fontkit), ± 10%
  assert.equal(masoara('*ăîș*'), masoara('ăîș'));
  const a = rupeRanduri('Programările se fac singure, iar tu ai timp pentru clienți', { latimeMax: 852, masoara });
  const b = rupeRanduri('Programările se fac singure, iar tu ai timp pentru clienți', { latimeMax: 852, masoara });
  assert.deepEqual(a, b);
  assert.equal(a.ok, true);
  for (const r of a.randuri) assert.ok(r.latime <= 852, `${r.text}: ${r.latime}`);
  for (const r of a.randuri.slice(0, -1)) {
    const ultim = r.text.split(' ').at(-1).toLocaleLowerCase('ro');
    assert.ok(!CUVINTE_SCURTE.includes(ultim), `rândul „${r.text}” se termină în „${ultim}”`);
  }
});
