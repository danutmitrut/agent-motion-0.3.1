import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rezultat } from '../../nucleu/lib/verificari/index.mjs';
import {
  STADII_COMUNE, VERIFICARI_MINIME, stadiuVerificare, declarate, pastreazaDeclarate, okPentruAprobare, verificaRezultateProprii,
} from '../../nucleu/lib/verificari/stadii.mjs';

const sablon = (verificari, stadii) => ({ nume: 't', meta: { verificari, ...(stadii ? { stadii } : {}) } });
const MIN = [...VERIFICARI_MINIME];

test('M2: stadiile comune și minimul', () => {
  assert.equal(STADII_COMUNE.C07, 'date');
  assert.equal(STADII_COMUNE.C17, 'build');
  assert.equal(STADII_COMUNE.C08, 'aprobare');
  assert.equal(STADII_COMUNE.C15, 'mp4');
  assert.deepEqual(MIN, ['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08', 'C09', 'C10', 'C11', 'C16', 'C17']);
});

test('M2: stadiul unui cod S vine din stadii, implicit date', () => {
  const s = sablon([...MIN, 'S01', 'S02'], { S02: 'mp4' });
  assert.equal(stadiuVerificare('S01', s), 'date');
  assert.equal(stadiuVerificare('S02', s), 'mp4');
  assert.deepEqual(declarate(s, ['mp4']), ['C11', 'C16', 'S02']);
});

test('M2: pastreazaDeclarate scoate C-urile nedeclarate (C15 la un șablon care nu o declară)', () => {
  const s = sablon(MIN);
  const r = pastreazaDeclarate([rezultat('C11', true), rezultat('C15', false)], s);
  assert.deepEqual(r.map((x) => x.cod), ['C11']);
});

test('D: okPentruAprobare cere verde pe date și build, plus rezultat pentru fiecare cod declarat al lor', () => {
  const s = sablon([...MIN, 'S01'], { S01: 'build' });
  const verzi = declarate(s, ['date', 'build']).map((c) => rezultat(c, true));
  assert.equal(okPentruAprobare(verzi, s), true);
  assert.equal(okPentruAprobare(verzi.filter((r) => r.cod !== 'S01'), s), false, 'S01 de build lipsă');
  assert.equal(okPentruAprobare([...verzi, rezultat('C11', false)], s), true, 'MP4-ul nu contează la aprobare');
  assert.equal(okPentruAprobare(verzi.map((r) => (r.cod === 'C05' ? rezultat('C05', false) : r)), s), false);
});

test('M2: verificaRezultateProprii refuză un cod nedeclarat sau cu alt stadiu și o formă greșită', () => {
  const s = sablon([...MIN, 'S01', 'S02'], { S01: 'build', S02: 'mp4' });
  assert.deepEqual(verificaRezultateProprii([rezultat('S01', true)], s, 'build', 'verificariBuild').map((r) => r.cod), ['S01']);
  assert.throws(() => verificaRezultateProprii([rezultat('S02', true)], s, 'build', 'verificariBuild'), TypeError);
  assert.throws(() => verificaRezultateProprii([rezultat('S03', true)], s, 'build', 'verificariBuild'), TypeError);
  assert.throws(() => verificaRezultateProprii([{ cod: 'S01', ok: 'da' }], s, 'build', 'verificariBuild'), TypeError);
  assert.throws(() => verificaRezultateProprii(null, s, 'build', 'verificariBuild'), TypeError);
});

// Review final, Important 3: contractul înghețat al rezultatelor din hook-uri.
const EROARE = Object.freeze({ cod: 'valoare-invalida', camp: 'build', mesaj: 'Test.', sugestie: 'Nimic.' });
const rez = (cod, ok, { erori = [], avertismente = [] } = {}) => ({ cod, ok, valoare: null, prag: null, camp: null, erori, avertismente });
const S_BUILD = sablon([...MIN, 'S01'], { S01: 'build' });
const verifica = (r) => verificaRezultateProprii(r, S_BUILD, 'build', 'verificariBuild');

test('Important 3: un hook nu poate întoarce coduri C, nici declarate cu stadiul lui (C10, C17)', () => {
  assert.throws(() => verifica([rez('C10', true)]), /codul comun C10/);
  assert.throws(() => verifica([rez('C17', true)]), /codul comun C17/);
});

test('Important 3: ok trebuie să fie exact erori.length === 0', () => {
  assert.throws(() => verifica([rez('S01', true, { erori: [{ ...EROARE }] })]), /ok: true cu 1 erori/);
  assert.throws(() => verifica([rez('S01', false)]), /ok: false cu 0 erori/);
  assert.equal(verifica([rez('S01', false, { erori: [{ ...EROARE }] })]).length, 1);
  assert.equal(verifica([rez('S01', true, { avertismente: [{ ...EROARE }] })]).length, 1, 'avertismentele nu schimbă ok');
});

test('Important 3: fiecare eroare și fiecare avertisment are forma EroareMg, cu cod din CODURI', () => {
  const rele = [
    null, 'text', [], {},
    { ...EROARE, cod: 'cod-inventat' },
    { ...EROARE, camp: '' },
    { ...EROARE, mesaj: '   ' },
    { ...EROARE, sugestie: 3 },
    { cod: EROARE.cod, camp: EROARE.camp, mesaj: EROARE.mesaj },
    { ...EROARE, extra: 1 },
    { ...EROARE, verificare: 'S00' },
    { ...EROARE, verificare: null },
  ];
  for (const e of rele) {
    assert.throws(() => verifica([rez('S01', false, { erori: [e] })]), /erori\[0\] din rezultatul S01 nu are forma EroareMg/, JSON.stringify(e));
    assert.throws(() => verifica([rez('S01', true, { avertismente: [e] })]), /avertismente\[0\] din rezultatul S01 nu are forma EroareMg/, JSON.stringify(e));
  }
  const cuVerificare = { ...EROARE, verificare: 'S01' };
  assert.equal(verifica([rez('S01', false, { erori: [cuVerificare], avertismente: [{ ...EROARE }] })]).length, 1);
});
