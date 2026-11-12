import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sus01, numarCuvinte, durataFormula, limiteScena, minimCitire, durataTastare, durataScena } from '../timp.mjs';

const implicite = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../implicite.json', import.meta.url)), 'utf8'));
const normal = implicite.ritm.normal;

test('sus01 rotunjește în sus la 0,1 s, fără să urce o valoare deja rotundă', () => {
  assert.equal(sus01(4.4), 4.4);
  assert.equal(sus01(4.300000000001), 4.3);
  assert.equal(sus01(4.7424), 4.8);
  assert.equal(sus01(2.81), 2.9);
});

test('numarCuvinte: * devine spațiu; punctuația lipită de accent e un cuvânt, ca pe ecran', () => {
  assert.equal(numarCuvinte(['Pentru soloprenori', 'Lucrezi 12 ore', 'și tot *nu ajungi*?']), 10);
  assert.equal(numarCuvinte(['Nu munca e problema. *Rutina* e.']), 6);
  assert.equal(numarCuvinte(['*fără tine*.']), 3);
  assert.equal(numarCuvinte([]), 0);
});

test('durataFormula pe fiecare tip, la ritmul normal', () => {
  const D = implicite.durate;
  assert.equal(durataFormula({ tip: 'titlu' }, 10, D), 1.4 + 3);
  assert.equal(durataFormula({ tip: 'fraza' }, 6, D), 1.2 + 0.45 * 6);
  assert.equal(durataFormula({ tip: 'cuvinte', cuvinte: ['a', 'b', 'c'] }, 99, D), 1.0 + 0.9 * 3);
  assert.equal(durataFormula({ tip: 'lista', puncte: ['a', 'b', 'c'], titlu: ['x'] }, 99, D), 1.2 + 0.9 * 3 + 0.5);
  assert.equal(durataFormula({ tip: 'lista', puncte: ['a', 'b'] }, 99, D), 1.2 + 0.9 * 2);
  assert.equal(durataFormula({ tip: 'cifra', sursa: 'x' }, 99, D), 3.2 + 0.6);
  assert.equal(durataFormula({ tip: 'citat' }, 10, D), 1.6 + 3);
  assert.equal(durataFormula({ tip: 'final' }, 99, D), 3.5);
});

test('limitele de scenă, minimul de citire și tastarea', () => {
  assert.deepEqual(limiteScena('titlu', implicite.scene), [1.5, 8]);
  assert.deepEqual(limiteScena('final', implicite.scene), [2.5, 10]);
  assert.equal(minimCitire(33), 0.8 + 10);
  assert.equal(durataTastare('exemplu.ro/atelier', implicite.timpi), 0.81);
  assert.equal(durataTastare('Ana', implicite.timpi), 0.6);
  assert.equal(durataTastare('x'.repeat(60), implicite.timpi), 1.6);
});

test('exemplul minim: 4,4 / 4,8 / 3,5 s', () => {
  const s1 = durataScena({ scena: { tip: 'titlu' }, cuvinte: 10, texteEcran: ['PENTRU SOLOPRENORI', 'Lucrezi 12 ore', 'și tot', 'nu ajungi', '?'], complet: 1.35, ultima: false, ritm: normal, implicite });
  assert.deepEqual(s1, { durata: 4.4, minim: 3.9, maxim: 8, eroare: null });
  const s2 = durataScena({ scena: { tip: 'lista', titlu: ['Unde se pierde:'], puncte: ['a', 'b', 'c'] }, cuvinte: 13, texteEcran: ['Unde se pierde:', 'E-mailuri de rutină', 'Programări și reveniri', 'Rapoarte copiate de mână'], complet: 2.3, ultima: false, ritm: normal, implicite });
  assert.equal(s2.durata, 4.8);
  const s3 = durataScena({ scena: { tip: 'final' }, cuvinte: 6, texteEcran: ['Hai să-l construim', 'împreună', '.', 'exemplu.ro/atelier'], complet: 2.01, ultima: true, ritm: normal, implicite });
  assert.deepEqual([s3.durata, s3.minim], [3.5, 2.9]);
});

test('ritmul se aplică înaintea limitelor tipului (cazul nediscriminant: ambele valori cad în interval, alert e ridicat de minimul mecanic)', () => {
  const baza = { scena: { tip: 'titlu' }, cuvinte: 4, texteEcran: ['a b c d'], complet: 1.0, ultima: false, implicite };
  assert.equal(durataScena({ ...baza, ritm: implicite.ritm.calm }).durata, 3.2); // (1,4 + 1,2) × 1,2 = 3,12, rotunjit în sus: 3,2 (minimul e 2,3)
  assert.equal(durataScena({ ...baza, ritm: implicite.ritm.alert }).durata, 2.3); // 2,6 × 0,85 = 2,21 → [2,2-5] → 2,21; minim 2,25 → 2,3
});

test('durata dată de cursant: sub minim e eroare; peste minim rămâne exact', () => {
  const p = { scena: { tip: 'titlu', durata: 2 }, cuvinte: 10, texteEcran: [], complet: 1.35, ultima: false, ritm: normal, implicite };
  assert.deepEqual(durataScena(p), { durata: 2, minim: 3.9, maxim: 8, eroare: 'sub-minim' });
  assert.equal(durataScena({ ...p, scena: { tip: 'titlu', durata: 6.2 } }).durata, 6.2);
});

test('un minim peste plafonul scenei dă „nu-incape”, fără durată', () => {
  const r = durataScena({ scena: { tip: 'citat' }, cuvinte: 30, texteEcran: [], complet: 7.5, ultima: false, ritm: normal, implicite });
  assert.deepEqual(r, { durata: null, minim: 9.9, maxim: 8, eroare: 'nu-incape' }); // 0,8 + 30/3,3 = 9,89
});

const ec = { texteEcran: [], ultima: false, implicite };

test('ritm înaintea plafonului tipului: titlu calm de 10 cuvinte (4,4 × 1,2 = 5,28) este tăiat la 5, nu 5,3', () => {
  const r = durataScena({ ...ec, scena: { tip: 'titlu' }, cuvinte: 10, complet: 1.0, ritm: implicite.ritm.calm });
  assert.deepEqual(r, { durata: 5, minim: 3.9, maxim: 8, eroare: null });
});

test('ritm înaintea minimului tipului: titlu alert de 2 cuvinte (2,0 × 0,85 = 1,7) este ridicat la 2,2 de minimul tipului, nu de minim (1,8)', () => {
  const r = durataScena({ ...ec, scena: { tip: 'titlu' }, cuvinte: 2, complet: 0.5, ritm: implicite.ritm.alert });
  assert.deepEqual(r, { durata: 2.2, minim: 1.8, maxim: 8, eroare: null });
});

test('tipurile fixe (final, cifra) primesc ritmul și sunt limitate doar de scenă', () => {
  const final = { ...ec, scena: { tip: 'final' }, cuvinte: 6, complet: 2.01, ultima: true };
  assert.equal(durataScena({ ...final, ritm: implicite.ritm.calm }).durata, 4.2); // 3,5 × 1,2
  assert.equal(durataScena({ ...final, ritm: implicite.ritm.alert }).durata, 3); // 2,975 → 3,0
  const cifra = { ...ec, cuvinte: 3, complet: 1.9, ritm: implicite.ritm.calm };
  assert.equal(durataScena({ ...cifra, scena: { tip: 'cifra' } }).durata, 3.9); // 3,84
  assert.equal(durataScena({ ...cifra, scena: { tip: 'cifra', sursa: 'x' } }).durata, 4.6); // 4,56
});

test('fraza, cuvinte, citat la ritmul normal', () => {
  const b = { ...ec, ritm: normal, complet: 1.5 };
  assert.deepEqual(durataScena({ ...b, scena: { tip: 'fraza' }, cuvinte: 6 }), { durata: 3.9, minim: 2.8, maxim: 8, eroare: null });
  assert.deepEqual(durataScena({ ...b, scena: { tip: 'cuvinte', cuvinte: ['a', 'b', 'c', 'd'] }, cuvinte: 4 }), { durata: 4.6, minim: 2.8, maxim: 8, eroare: null });
  assert.deepEqual(durataScena({ ...b, scena: { tip: 'citat' }, cuvinte: 12 }), { durata: 5.2, minim: 4.5, maxim: 8, eroare: null });
});

test('minimul de citire depășește plafonul tipului dar încape în scenă: fraza de 20 cuvinte (formula 10,2 → 6) urcă la 6,9', () => {
  const r = durataScena({ ...ec, scena: { tip: 'fraza' }, cuvinte: 20, complet: 2, ritm: normal });
  assert.deepEqual(r, { durata: 6.9, minim: 6.9, maxim: 8, eroare: null });
});
