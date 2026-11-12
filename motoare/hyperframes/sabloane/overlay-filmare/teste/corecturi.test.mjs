import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicaCorecturi } from '../corecturi.mjs';

const C = (text, start, end, extra = {}) => ({ text, start, end, ...extra });
const cuvinte = () => ['Bună,', 'sunt', 'Andrea,', 'lucrez', 'cu', 'cloud', 'cod,', 'practic', 'zilnic.']
  .map((t, i) => ({ id: `w${i}`, ...C(t, i * 0.5, i * 0.5 + 0.4) }));

test('fără corecturi: cuvintele trec neschimbate, cu ids', () => {
  const r = aplicaCorecturi(cuvinte(), []);
  assert.deepEqual(r.erori, []);
  assert.deepEqual(r.cuvinte[2], { id: 'w2', ids: ['w2'], text: 'Andrea,', start: 1, end: 1.4, ascuns: false, corectat: false });
});

test('un interval devine un cuvânt cu startul primului și sfârșitul ultimului; in gol ascunde', () => {
  const r = aplicaCorecturi(cuvinte(), [
    { cuvinte: 'w5-w6', din: 'Cloud cod', in: 'Claude Code,' },
    { cuvinte: 'w2', din: 'andrea', in: 'Andreea,' },
    { cuvinte: 'w7', din: 'practic', in: '' },
  ]);
  assert.deepEqual(r.erori, []);
  assert.equal(r.cuvinte.length, 8);
  assert.deepEqual(r.cuvinte[5], { id: 'w5-w6', ids: ['w5', 'w6'], text: 'Claude Code,', start: 2.5, end: 3.4, ascuns: false, corectat: true });
  assert.equal(r.cuvinte[2].text, 'Andreea,');
  assert.deepEqual([r.cuvinte[6].id, r.cuvinte[6].ascuns, r.cuvinte[6].text], ['w7', true, '']);
});

test('S03: din greșit, peste 4 cuvinte, suprapuneri, cuvinte inexistente, interval invers', () => {
  const coduri = (corecturi) => aplicaCorecturi(cuvinte(), corecturi).erori.map((e) => e.camp);
  assert.deepEqual(coduri([{ cuvinte: 'w5', din: 'clod', in: 'Claude' }]), ['corecturi[0].din']);
  assert.deepEqual(coduri([{ cuvinte: 'w0-w4', din: 'bună sunt andrea lucrez cu', in: 'x' }]), ['corecturi[0].cuvinte']);
  assert.deepEqual(coduri([{ cuvinte: 'w5-w6', din: 'cloud cod', in: 'x' }, { cuvinte: 'w6', din: 'cod', in: 'y' }]), ['corecturi[1].cuvinte']);
  assert.deepEqual(coduri([{ cuvinte: 'w9', din: 'x', in: 'y' }]), ['corecturi[0].cuvinte']);
  assert.deepEqual(coduri([{ cuvinte: 'w6-w5', din: 'x', in: 'y' }]), ['corecturi[0].cuvinte']);
  const e = aplicaCorecturi(cuvinte(), [{ cuvinte: 'w5', din: 'clod', in: 'Claude' }]).erori[0];
  assert.equal(e.cod, 'overlay-filmare-corectura');
  assert.match(e.mesaj, /„cloud”/);
});

test('importul: fraza primului cuvânt se păstrează', () => {
  const c = cuvinte().map((x, i) => ({ ...x, fraza: i < 3 ? 0 : 1 }));
  assert.equal(aplicaCorecturi(c, [{ cuvinte: 'w2-w3', din: 'andrea lucrez', in: 'Andreea lucrează' }]).cuvinte[2].fraza, 0);
});
