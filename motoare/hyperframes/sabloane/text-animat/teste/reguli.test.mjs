import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { valideaza, campuriScena, cuvinteScena, locCamp } from '../reguli.mjs';
import { CODURI } from '../../../../../nucleu/lib/erori.mjs';

const citeste = (rel) => JSON.parse(fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8'));
const implicite = citeste('../implicite.json');
const minim = () => citeste('../exemple/minim.json');

function ruleaza(date, { brand = null, dirProiect = os.tmpdir() } = {}) {
  return valideaza(date, { sablon: { implicite }, brand, dirProiect, mod: 'doar-verificare' });
}
const coduri = (r) => r.erori.map((e) => [e.cod, e.camp]);

test('exemplul minim trece', () => {
  assert.deepEqual(coduri(ruleaza(minim())), []);
});

test('campuriScena: ordinea de pe ecran și accentul permis doar în titlu, text și cuvinte', () => {
  const c = campuriScena({ tip: 'cifra', eticheta: 'E', valoare: 62, sufix: '%', text: 'din timp', sursa: 'sondaj' }, 2);
  assert.deepEqual(c.map((x) => [x.camp, x.accent, x.cuvinte]), [
    ['scene[2].eticheta', false, true], ['scene[2].sufix', false, false], ['scene[2].text', true, true], ['scene[2].sursa', false, true],
  ]);
  const f = campuriScena({ tip: 'final', titlu: ['A'], cta: 'B', detaliu: 'C' }, 0);
  assert.deepEqual(f.map((x) => x.camp), ['scene[0].titlu[0]', 'scene[0].cta', 'scene[0].detaliu']);
  const l = campuriScena({ tip: 'lista', puncte: ['a', 'b'] }, 1);
  assert.deepEqual(l.map((x) => x.accent), [false, false]);
});

test('cuvinteScena numără și valoarea cifrei, dar nu prefixul și sufixul separat', () => {
  assert.equal(cuvinteScena({ tip: 'cifra', valoare: 62, sufix: '%', text: 'din timp, pe sarcini repetitive' }), 1 + 5);
  assert.equal(cuvinteScena(minim().scene[0]), 10);
});

test('locCamp numește câmpul pentru om', () => {
  assert.equal(locCamp('scene[1].puncte[2]'), 'Scena 2, punctul 3');
  assert.equal(locCamp('scene[0].titlu[1]'), 'Scena 1, rândul 2 din titlu');
  assert.equal(locCamp('scene[3].eticheta'), 'Scena 4, eticheta');
});

test('finalul care nu e ultimul', () => {
  const date = minim();
  date.scene = [date.scene[2], date.scene[0]];
  assert.deepEqual(coduri(ruleaza(date)), [['text-animat-final-nu-e-ultimul', 'scene[0].tip']]);
  assert.equal(CODURI['text-animat-final-nu-e-ultimul'].verificare, 'S01');
});

test('ghilimelele la capetele citatului', () => {
  const date = minim();
  date.scene.splice(2, 0, { tip: 'citat', text: '„Am recuperat o zi pe săptămână.”', autor: 'Ioana Pop' });
  assert.deepEqual(coduri(ruleaza(date)), [['text-animat-ghilimele-in-citat', 'scene[2].text']]);
});

test('peste 2 accente pe scenă: text-animat-accent, atribuit lui C03', () => {
  const date = minim();
  date.scene[0].titlu = ['*Unu* și *doi*', 'și *trei*'];
  const r = ruleaza(date);
  assert.deepEqual(coduri(r), [['text-animat-accent', 'scene[0]']]);
  assert.equal(r.erori[0].verificare, 'C03');
});

test('accentul în punctele listei e refuzat de C03 (accent nepermis)', () => {
  const date = minim();
  date.scene[1].puncte[0] = '*E-mailuri* de rutină';
  assert.equal(ruleaza(date).erori[0].camp, 'scene[1].puncte[0]');
});

test('plafonul de caractere: rand-nu-incape pe rând, fără S03', () => {
  const date = minim();
  date.scene[0].titlu[0] = 'Lucrezi douăsprezece ore pe zi';
  const r = ruleaza(date);
  assert.deepEqual(coduri(r), [['rand-nu-incape', 'scene[0].titlu[0]']]);
  assert.equal(CODURI['rand-nu-incape'].verificare, 'C04');
  assert.match(r.erori[0].mesaj, /Scena 1, rândul 1 din titlu/);
});

test('fraza are 2-10 cuvinte', () => {
  const date = minim();
  date.scene.splice(1, 0, { tip: 'fraza', text: 'Singur.' });
  assert.deepEqual(coduri(ruleaza(date)), [['valoare-invalida', 'scene[1].text']]);
});

test('durata: pasul de 0,1 s și minimul de citire (S02)', () => {
  const date = minim();
  date.scene[1].durata = 3.25;
  assert.deepEqual(coduri(ruleaza(date)), [['valoare-invalida', 'scene[1].durata']]);
  date.scene[1].durata = 3;
  const r = ruleaza(date);
  assert.deepEqual(coduri(r), [['prea-repede-de-citit', 'scene[1].durata']]);
  assert.equal(r.erori[0].verificare, 'S02');
  assert.match(r.erori[0].sugestie, /4,8/);
});

test('sigla: lipsă (resursa-lipsa), prea mare și fără dimensiuni (valoare-invalida), toate pe C07', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reguli-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'resurse'));
  const date = minim();
  date.sigla = 'resurse/sigla.svg';
  let r = ruleaza(date, { dirProiect: dir });
  assert.deepEqual(coduri(r), [['resursa-lipsa', 'sigla']]);
  fs.writeFileSync(path.join(dir, 'resurse', 'sigla.svg'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  r = ruleaza(date, { dirProiect: dir });
  assert.deepEqual(coduri(r), [['valoare-invalida', 'sigla']]);
  assert.equal(r.erori[0].verificare, 'C07');
  fs.writeFileSync(path.join(dir, 'resurse', 'sigla.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><!--${'x'.repeat(2100000)}--></svg>`);
  assert.deepEqual(coduri(ruleaza(date, { dirProiect: dir })), [['valoare-invalida', 'sigla']]);
  fs.writeFileSync(path.join(dir, 'resurse', 'sigla.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 80"><rect width="240" height="80"/></svg>');
  assert.deepEqual(coduri(ruleaza(date, { dirProiect: dir })), []);
});

test('text-cu-cod din C03 rămâne neschimbat', () => {
  const date = minim();
  date.scene[2].detaliu = '<b>exemplu</b>';
  assert.equal(ruleaza(date).erori[0].cod, 'text-cu-cod');
});

test('sigla din brand: validă, număr și ieșirea din folderul brandului', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reguli-brand-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const brandDir = path.join(dir, 'branduri', 'studio');
  fs.mkdirSync(brandDir, { recursive: true });
  const brand = (sigla) => ({ nume: 'studio', dir: brandDir, sigla });
  assert.deepEqual(coduri(ruleaza(minim(), { brand: brand('sigla.svg') })), [['resursa-lipsa', 'brand']]);
  fs.writeFileSync(path.join(brandDir, 'sigla.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 80"><rect width="240" height="80"/></svg>');
  assert.deepEqual(coduri(ruleaza(minim(), { brand: brand('sigla.svg') })), []);
  for (const rea of [123, ['a'], '', '../x.png', '../../x.png', 'sub/../../x.png']) {
    const r = ruleaza(minim(), { brand: brand(rea) });
    assert.deepEqual(coduri(r), [['valoare-invalida', 'brand.sigla']], JSON.stringify(rea));
    assert.equal(r.erori[0].verificare, 'C07');
    assert.match(r.erori[0].sugestie, /doar numele lui/);
  }
});

function cifra(extra) {
  const date = minim();
  date.scene[1] = { tip: 'cifra', valoare: 62, text: 'din timp', ...extra };
  return date;
}

test('zecimale pierdute: valoarea cu mai multe zecimale decât zecimale e valoare-invalida pe scene[i].zecimale, fără rotunjire tăcută', () => {
  const r = ruleaza(cifra({ valoare: 0.5 }));
  assert.deepEqual(coduri(r), [['valoare-invalida', 'scene[1].zecimale']]);
  assert.match(r.erori[0].mesaj, /0,5/);
  assert.match(r.erori[0].sugestie, /scene\[1\]\.zecimale/);
  assert.match(r.erori[0].sugestie, /1/);
  const r2 = ruleaza(cifra({ valoare: 3.25, zecimale: 1 }));
  assert.deepEqual(coduri(r2), [['valoare-invalida', 'scene[1].zecimale']]);
  assert.match(r2.erori[0].sugestie, /zecimale 2/);
  const r3 = ruleaza(cifra({ valoare: 3.256, zecimale: 2 }));
  assert.deepEqual(coduri(r3), [['valoare-invalida', 'scene[1].valoare']]);
  assert.match(r3.erori[0].sugestie, /3,26/);
});

test('zecimale: valorile exacte trec (întreg fără zecimale, 1.1 cu 1, 3.25 cu 2, 62 cu 2)', () => {
  for (const extra of [{ valoare: 62 }, { valoare: 1.1, zecimale: 1 }, { valoare: 3.25, zecimale: 2 }, { valoare: 62, zecimale: 2 }, { valoare: 0.07, zecimale: 2 }, { valoare: 156409.98, zecimale: 2 }, { valoare: 312665.71, zecimale: 2 }, { valoare: 555555555.55, zecimale: 2 }]) {
    assert.deepEqual(coduri(ruleaza(cifra(extra))), [], JSON.stringify(extra));
  }
});

test('la final, sugestiile nu cer împărțirea în două scene (există un singur final)', () => {
  const date = minim();
  date.scene[2].cta = 'Scrie-mi acum un mesaj scurt, azi';
  const r = ruleaza(date);
  assert.deepEqual(coduri(r), [['rand-nu-incape', 'scene[2].cta']]);
  assert.doesNotMatch(r.erori[0].sugestie, /împarte|două scene/);
  assert.match(r.erori[0].sugestie, /Scurtează scene\[2\]\.cta/);
  const d2 = minim();
  d2.scene[2].titlu = ['Un titlu de final mult prea lung acum'];
  const r2 = ruleaza(d2);
  assert.deepEqual(coduri(r2), [['rand-nu-incape', 'scene[2].titlu[0]']]);
  assert.doesNotMatch(r2.erori[0].sugestie, /împarte|două scene/);
});
