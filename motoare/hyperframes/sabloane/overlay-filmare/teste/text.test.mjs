import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cheieCuvant, curat, esteUmplutura, esteNumar } from '../text.mjs';

const UMPLUTURI = ['ă', 'ăă', 'îî', 'mm', 'hm', 'ee'];

test('cheieCuvant: fără diacritice, majuscule și punctuație', () => {
  assert.equal(cheieCuvant('„E-mailurile,”'), 'emailurile');
  assert.equal(cheieCuvant('Șase'), 'sase');
  assert.equal(cheieCuvant('2026.'), '2026');
  assert.equal(cheieCuvant('\u2014'), '');
});

test('curat păstrează diacriticele; umpluturile nu prind „a”', () => {
  assert.equal(curat('Ăă,'), 'ăă');
  assert.equal(esteUmplutura('Ăă,', UMPLUTURI), true);
  assert.equal(esteUmplutura('mm...', UMPLUTURI), true);
  assert.equal(esteUmplutura('a', UMPLUTURI), false);
  assert.equal(esteUmplutura('ea', UMPLUTURI), false);
});

test('esteNumar: întregi, zecimale românești, procente, cu punctuația lipită', () => {
  for (const t of ['6', '3,5', '1.250.000', '40%', '12,', '-3']) assert.equal(esteNumar(t), true, t);
  for (const t of ['șase', 'ore', '6ore', '']) assert.equal(esteNumar(t), false, t);
});
