import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gasesteFraza, eroareAncora } from '../ancore.mjs';

const lista = (texte) => texte.map((text, i) => ({ id: `w${i}`, ids: [`w${i}`], text, start: i, end: i + 0.8, ascuns: false, corectat: false }));
const C = lista(['Acum', 'câștig', 'șase', 'ore,', 'adică', 'șase', 'ore', 'în', 'fiecare', 'săptămână.']);

test('fraza fără diacritice și punctuație, la a N-a apariție', () => {
  assert.deepEqual(gasesteFraza(C, 'sase ore'), { gasita: true, t: 2, de_la: 2, pana_la: 3 });
  assert.deepEqual(gasesteFraza(C, 'Șase ore', 2), { gasita: true, t: 5, de_la: 5, pana_la: 6 });
  const r = gasesteFraza(C, 'sase ore', 3);
  assert.equal(r.gasita, false);
  assert.equal(r.gasite, 2);
});

test('cuvintele ascunse nu se caută; un cuvânt corectat cu spațiu dă două chei', () => {
  const c = lista(['lucrez', 'cu', 'X', 'zilnic']);
  c[2] = { ...c[2], text: 'Claude Code', corectat: true };
  assert.equal(gasesteFraza(c, 'cu claude code').t, 1);
  c[1] = { ...c[1], ascuns: true, text: '' };
  assert.equal(gasesteFraza(c, 'lucrez claude').t, 0);
});

test('negăsită: cele mai apropiate 3 ferestre, cu timpii lor, în eroare', () => {
  const r = gasesteFraza(C, 'sapte ore');
  assert.equal(r.gasita, false);
  assert.deepEqual(r.apropiate.slice(0, 2), [{ text: 'șase ore,', t: 2 }, { text: 'șase ore', t: 5 }]);
  const e = eroareAncora('elemente[1].ancora.fraza', 'sapte ore', 1, r);
  assert.equal(e.cod, 'overlay-filmare-ancora');
  assert.equal(e.camp, 'elemente[1].ancora.fraza');
  assert.match(e.mesaj, /„șase ore,” \(la 2,0 s\)/);
});
