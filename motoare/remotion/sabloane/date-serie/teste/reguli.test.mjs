import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { valideaza, locCamp, zecimaleScena, durataScena } from '../reguli.mjs';
import { CODURI, verificareaErorii } from '../../../../../nucleu/lib/erori.mjs';

const citeste = (rel) => JSON.parse(fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8'));
const implicite = citeste('../implicite.json');
const grafic = () => citeste('../exemple/grafic.date.json');
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 80"><rect width="200" height="80"/></svg>';

function ruleaza(date, { brand = null, dirProiect = os.tmpdir() } = {}) {
  return valideaza(date, { sablon: { implicite }, brand, dirProiect, mod: 'doar-verificare' });
}
// verificarea: cea dată explicit în eroare sau cea implicită a codului din erori.mjs
const coduri = (r) => r.erori.map((e) => [e.cod, e.camp, verificareaErorii(e)]);

test('exemplele minim și grafic.date trec', () => {
  assert.deepEqual(coduri(ruleaza(citeste('../exemple/minim.json'))), []);
  assert.deepEqual(coduri(ruleaza(grafic())), []);
});

test('codurile proprii sunt în erori.mjs, cu S03', () => {
  for (const c of ['date-serie-evidentiaza', 'date-serie-bare-zero', 'date-serie-final-nu-e-ultimul']) {
    assert.equal(CODURI[c]?.verificare, 'S03', c);
    assert.equal(CODURI[c].nivel, 'eroare', c);
  }
});

test('locCamp numește câmpul pentru om', () => {
  assert.equal(locCamp('scene[2].valori[3].eticheta'), 'Scena 3, valoarea 4, eticheta');
  assert.equal(locCamp('scene[4].titlu[1]'), 'Scena 5, rândul 2 din titlu');
  assert.equal(locCamp('scene[0].subtitlu'), 'Scena 1, subtitlul');
});

test('durataScena: durata din date sau implicitul tipului', () => {
  assert.equal(durataScena({ tip: 'bare' }, implicite), 7);
  assert.equal(durataScena({ tip: 'final', durata: 5 }, implicite), 5);
});

test('plafoanele de caractere (C04): eticheta 24, eticheta barei 14, a comparației 18', () => {
  const d = grafic();
  d.scene[0].eticheta = 'x'.repeat(25);
  d.scene[2].valori[0].eticheta = 'y'.repeat(15);
  d.scene[3].valori[0].eticheta = 'z'.repeat(18);
  assert.deepEqual(coduri(ruleaza(d)), [
    ['rand-nu-incape', 'scene[0].eticheta', 'C04'],
    ['rand-nu-incape', 'scene[2].valori[0].eticheta', 'C04'],
  ]);
});

test('C03: sedila și linia lungă se resping pe câmpul lor', () => {
  const d = grafic();
  d.scene[1].text = 'oameni au terminat \u015Fi un modul';
  d.scene[2].sursa = 'Stripe \u2014 export';
  assert.deepEqual(coduri(ruleaza(d)).map(([c, camp]) => [c, camp]), [['sedila', 'scene[1].text'], ['liniuta-lunga', 'scene[2].sursa']]);
});

test('durata are pasul de 0,1 s', () => {
  const d = grafic();
  d.scene[0].durata = 3.85;
  assert.deepEqual(coduri(ruleaza(d)), [['valoare-invalida', 'scene[0].durata', 'C02']]);
});

test('cifra: zecimalele lipsă sau prea multe nu se rotunjesc pe tăcute', () => {
  const d = grafic();
  d.scene[1].valoare = 3.5;
  assert.deepEqual(coduri(ruleaza(d)), [['valoare-invalida', 'scene[1].zecimale', 'C02']]);
  d.scene[1].zecimale = 1;
  assert.deepEqual(coduri(ruleaza(d)), []);
  d.scene[1].valoare = 1.005;
  assert.deepEqual(coduri(ruleaza(d)), [['valoare-invalida', 'scene[1].valoare', 'C02']]);
});

test('bare și comparatie: o valoare cu mai mult de 2 zecimale e respinsă; zecimaleScena ia maximul', () => {
  const d = grafic();
  d.scene[2].valori[1].valoare = 9100.125;
  assert.deepEqual(coduri(ruleaza(d)), [['valoare-invalida', 'scene[2].valori[1].valoare', 'C02']]);
  assert.equal(zecimaleScena({ valori: [{ valoare: 1 }, { valoare: 2.5 }, { valoare: 3.25 }] }), 2);
  assert.equal(zecimaleScena(grafic().scene[2]), 0);
});

test('S03: evidentiaza fără etichetă, barele toate 0, finalul care nu e ultimul', () => {
  const d = grafic();
  d.scene[2].evidentiaza = 'iulie';
  assert.deepEqual(coduri(ruleaza(d)), [['date-serie-evidentiaza', 'scene[2].evidentiaza', 'S03']]);
  const d2 = grafic();
  for (const v of d2.scene[2].valori) v.valoare = 0;
  assert.deepEqual(coduri(ruleaza(d2)), [['date-serie-bare-zero', 'scene[2].valori', 'S03']]);
  const d3 = grafic();
  d3.scene = [d3.scene[4], ...d3.scene.slice(0, 4)];
  assert.deepEqual(coduri(ruleaza(d3)), [['date-serie-final-nu-e-ultimul', 'scene[0].tip', 'S03']]);
});

test('C09: totalul cu tranzițiile scăzute trebuie să fie 6-60 s', () => {
  const d = grafic();
  d.scene = [{ tip: 'titlu', titlu: ['A'], durata: 3 }, { tip: 'final', titlu: ['B'], durata: 3 }];
  const r = ruleaza(d);
  assert.deepEqual(coduri(r), [['durata-in-afara-limitelor', 'scene', 'C09']]);
  assert.match(r.erori[0].mesaj, /5,6 s/);
  d.scene = Array.from({ length: 8 }, (_, i) => ({ tip: i === 7 ? 'final' : 'titlu', titlu: ['A'], durata: 8 }));
  assert.match(ruleaza(d).erori[0].mesaj, /61,2 s/);
});

test('S05: sigla lipsă, sigla bună, sigla fără scenă final la sfârșit', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-date-serie-sigla-'));
  const d = grafic();
  d.sigla = 'resurse/sigla.svg';
  assert.deepEqual(coduri(ruleaza(d, { dirProiect: dir })), [['resursa-lipsa', 'sigla', 'S05']]);
  fs.mkdirSync(path.join(dir, 'resurse'));
  fs.writeFileSync(path.join(dir, 'resurse', 'sigla.svg'), SVG);
  assert.deepEqual(coduri(ruleaza(d, { dirProiect: dir })), []);
  d.scene = d.scene.slice(0, 4);
  const r = ruleaza(d, { dirProiect: dir });
  assert.deepEqual(coduri(r), []);
  assert.deepEqual(r.avertismente.map((a) => [a.cod, a.camp, a.verificare]), [['valoare-invalida', 'sigla', 'S05']]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('sugestia plafonului scrie „de caractere” doar de la 20 în sus', () => {
  const d = grafic();
  d.scene[2].valori[0].eticheta = 'y'.repeat(15);
  d.scene[3].valori[0].eticheta = 'z'.repeat(19);
  d.scene[0].eticheta = 'x'.repeat(25);
  const sugestii = ruleaza(d).erori.map((e) => e.sugestie);
  assert.deepEqual(sugestii, [
    'Scurtează scene[0].eticheta la cel mult 24 de caractere.',
    'Scurtează scene[2].valori[0].eticheta la cel mult 14 caractere.',
    'Scurtează scene[3].valori[0].eticheta la cel mult 18 caractere.',
  ]);
});

test('mesajele despre zecimale arată valoarea exact cum a scris-o cursantul', () => {
  const d = grafic();
  d.scene[2].valori[1].valoare = 9100.0004;
  const m1 = ruleaza(d).erori[0];
  assert.match(m1.mesaj, /9100,0004 are mai mult de 2 zecimale/);
  const d2 = grafic();
  d2.scene[1].valoare = 1.0004;
  const m2 = ruleaza(d2).erori[0];
  assert.match(m2.mesaj, /valoarea 1,0004 are mai multe zecimale/);
});
