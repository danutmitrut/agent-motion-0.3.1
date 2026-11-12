import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { valideazaPeSchema } from '../../../../../nucleu/lib/schema.mjs';

const citeste = (rel) => JSON.parse(fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8'));
const schema = citeste('../schema.json');
const grafic = () => citeste('../exemple/grafic.date.json');
const coduri = (date) => valideazaPeSchema(schema, date).map((e) => [e.cod, e.camp]);

test('exemplele minim și grafic.date trec schema', () => {
  assert.deepEqual(coduri(citeste('../exemple/minim.json')), []);
  assert.deepEqual(coduri(grafic()), []);
});

test('compozitie e „grafic” sau „serie” (felia 3), iar formatul doar vertical', () => {
  const d = grafic();
  d.compozitie = 'carusel';
  assert.deepEqual(coduri(d), [['valoare-invalida', 'compozitie']]);
  const d2 = grafic();
  d2.format = 'patrat';
  assert.deepEqual(coduri(d2), [['valoare-invalida', 'format']]);
  const d3 = grafic();
  delete d3.compozitie;
  assert.deepEqual(coduri(d3).map(([c]) => c), ['camp-lipsa']);
});

test('un câmp care nu aparține tipului e camp-necunoscut pe calea lui', () => {
  const d = grafic();
  d.scene[1].titlu = ['Nu la cifră'];
  assert.deepEqual(coduri(d), [['camp-necunoscut', 'scene[1].titlu']]);
});

test('bare: 2-8 valori, fiecare ≥ 0; comparatie 2-3 valori', () => {
  const d = grafic();
  d.scene[2].valori = d.scene[2].valori.slice(0, 1);
  assert.deepEqual(coduri(d), [['valoare-invalida', 'scene[2].valori']]);
  const d2 = grafic();
  d2.scene[2].valori[0].valoare = -5;
  assert.deepEqual(coduri(d2), [['valoare-invalida', 'scene[2].valori[0].valoare']]);
  const d3 = grafic();
  d3.scene[3].valori.push({ eticheta: 'a', valoare: 1 }, { eticheta: 'b', valoare: 2 });
  assert.deepEqual(coduri(d3), [['valoare-invalida', 'scene[3].valori']]);
});

test('stil acceptă doar descriere, tema și culori; ritmul și fontul titlului nu există în v1', () => {
  const d = grafic();
  d.stil.ritm = 'alert';
  assert.deepEqual(coduri(d), [['camp-necunoscut', 'stil.ritm']]);
  const d2 = grafic();
  d2.stil.tema = 'contrast';
  assert.deepEqual(coduri(d2), [['valoare-invalida', 'stil.tema']]);
});

test('durata scenei 2-12 s; sigla doar în resurse/, .svg sau .png', () => {
  const d = grafic();
  d.scene[0].durata = 1.5;
  assert.deepEqual(coduri(d), [['valoare-invalida', 'scene[0].durata']]);
  const d2 = grafic();
  d2.sigla = 'sigla.svg';
  assert.deepEqual(coduri(d2), [['valoare-invalida', 'sigla']]);
});
