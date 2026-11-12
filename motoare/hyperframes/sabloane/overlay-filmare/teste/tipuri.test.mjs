import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aseazaElement, creeazaMasuratori, formateazaNumar, textCifra, cereriElement, INTRARE_RAND, PAS_RAND, NUMARARE, IESIRE } from '../tipuri.mjs';
import { benziFormat } from '../benzi.mjs';
import { valoriStil } from '../../../../../nucleu/lib/sdk.mjs';
import { IMPLICITE, REPO, stilTest } from './ajutoare.mjs';

const stilPlat = valoriStil(stilTest('noapte'));
const ritm = IMPLICITE.ritm.normal;
const opt = (format = 'vertical') => ({ benzi: benziFormat(IMPLICITE, format), implicite: IMPLICITE, format, masuri: creeazaMasuratori(REPO, stilPlat, IMPLICITE), stilPlat, ritm });
const EL = (tip, start, sfarsit, extra = {}) => ({ n: 1, camp: 'elemente[0]', id: 'e1', tip, banda: IMPLICITE.banda_tip[tip], start, sfarsit, ancora: null, ...extra });
const inauntru = ([x, y, w, h], [bx, by, bw, bh]) => x >= bx - 1e-6 && y >= by - 1e-6 && x + w <= bx + bw + 1e-6 && y + h <= by + bh + 1e-6;

test('cifrele cu formatare românească, scrisă manual', () => {
  assert.equal(formateazaNumar(1250000, 0), '1.250.000');
  assert.equal(formateazaNumar(3.5, 1), '3,5');
  assert.equal(formateazaNumar(-12.25, 2), '-12,25');
  assert.equal(formateazaNumar(0, 0), '0');
  assert.equal(textCifra({ valoare: 6, sufix: ' ore' }), '6 ore');
  assert.equal(textCifra({ valoare: 3.5, prefix: '+', sufix: '%' }), '+3,5%');
  assert.equal(textCifra({ valoare: 2, zecimale: 2 }), '2,00');
});

test('cererile: eticheta cu majusculele temei, citatul între ghilimele românești', () => {
  assert.deepEqual(cereriElement({ tip: 'titlu', eticheta: 'pe scurt', titlu: ['Șase ore'] }, 'elemente[0]', stilPlat.eticheta).map((c) => [c.rol, c.camp, c.text]),
    [['eticheta', 'elemente[0].eticheta', 'PE SCURT'], ['titlu', 'elemente[0].titlu[0]', 'Șase ore']]);
  assert.equal(cereriElement({ tip: 'citat', text: 'Lucrez mai puțin' }, 'elemente[2]')[0].text, '„Lucrez mai puțin”');
});

test('titlul: în banda de sus, aliniat la stânga, rândurile pe rând, ieșirea înainte de sfârșit', () => {
  const r = aseazaElement(EL('titlu', 0.2, 2.8), { tip: 'titlu', la: 0.2, eticheta: 'pe scurt', titlu: ['Cum câștig șase ore'] }, opt());
  assert.deepEqual(r.erori, []);
  const e = r.element;
  const [card, ...randuri] = e.blocuri;
  assert.deepEqual([card.id, card.fel, card.x, card.y], ['b1-1', 'card', 72, 220]);
  assert.ok(inauntru([card.x, card.y, card.w, card.h], IMPLICITE.formate.vertical.benzi.sus));
  assert.deepEqual(randuri.map((b) => [b.id, b.fel, b.text_id, b.text]), [['b1-2', 'eticheta', 't1-1', 'PE SCURT'], ['b1-3', 'rand', 't1-2', 'Cum câștig șase ore']]);
  assert.ok(randuri.every((b) => b.x === 72 + 36));
  assert.ok(randuri[1].marime >= 60 && randuri[1].marime <= 84);
  assert.deepEqual(e.pasi.map((p) => [p.efect, p.tinta, p.t]), [
    ['apare', '#b1-1', 0.2], ['apare', '#b1-2', 0.32], ['apare', '#b1-3', Math.round((0.2 + INTRARE_RAND + PAS_RAND) * 1000) / 1000], ['iese', '#e1', 2.55],
  ]);
  assert.deepEqual(e.texte.map((t) => [t.id, t.camp, t.t]), [['t1-1', 'elemente[0].eticheta', 0.67], ['t1-2', 'elemente[0].titlu[0]', 0.75]]);
  assert.equal(e.complet, 0.75);
  for (const t of e.texte) assert.ok(inauntru(t.caseta, [card.x, card.y, card.w, card.h]));
});

test('citatul: centrat în bandă, textul centrat în card', () => {
  const e = aseazaElement(EL('citat', 5, 9), { tip: 'citat', la: 5, text: 'Am lucrat zece ani fără să mă opresc', autor: 'Andreea' }, opt()).element;
  const [card] = e.blocuri;
  const [bx, by, bw, bh] = IMPLICITE.formate.vertical.benzi.centru;
  assert.ok(Math.abs(card.x + card.w / 2 - (bx + bw / 2)) < 0.01);
  assert.ok(Math.abs(card.y + card.h / 2 - (by + bh / 2)) < 0.01);
  assert.equal(e.aliniere, 'centru');
  for (const b of e.blocuri.slice(1)) assert.ok(Math.abs(b.x + b.w / 2 - (card.x + card.w / 2)) < 0.01);
});

test('numele: jos în banda lui; cifra: numărătoarea și textul ei vizibil după ea', () => {
  const nume = aseazaElement(EL('nume', 1, 4.5), { tip: 'nume', la: 1, nume: 'Andreea Pop', rol: 'consultant' }, opt()).element;
  const [, y, , h] = IMPLICITE.formate.vertical.benzi.nume;
  assert.equal(Math.round((nume.blocuri[0].y + nume.blocuri[0].h) * 100) / 100, y + h);
  const cifra = aseazaElement(EL('cifra', 6, 8.5), { tip: 'cifra', la: 6, valoare: 1250, sufix: ' lei', text: 'pe lună' }, opt()).element;
  const numara = cifra.pasi.find((p) => p.efect === 'numara');
  assert.deepEqual(numara, { efect: 'numara', tinta: '#t1-1', t: 6.12, dur: NUMARARE, valoare: 1250, zecimale: 0, prefix: '', sufix: ' lei' });
  assert.equal(cifra.texte[0].text, '1.250 lei');
  assert.equal(cifra.texte[0].t, Math.round((6.12 + NUMARARE) * 1000) / 1000);
});

test('lista: fiecare punct intră când e rostit, cu bulina în față', () => {
  const el = EL('lista', 3, 9, { puncte: [{ k: 0, t: 4, ancora_t: 4.15 }, { k: 1, t: 5.5, ancora_t: 5.65 }] });
  const e = aseazaElement(el, { tip: 'lista', ancora: { fraza: 'trei lucruri' }, titlu: ['Ce face agentul'], puncte: [{ text: 'răspunde', ancora: { fraza: 'răspunde' } }, { text: 'programează', ancora: { fraza: 'programează' } }] }, opt()).element;
  const puncte = e.blocuri.filter((b) => b.fel === 'punct');
  assert.equal(puncte.length, 2);
  assert.ok(puncte.every((b) => b.marcaj > 0));
  assert.deepEqual(e.pasi.filter((p) => puncte.some((b) => `#${b.id}` === p.tinta)).map((p) => p.t), [4, 5.5]);
  assert.equal(e.complet, 5.85);
});

test('pe orizontal, rolurile sunt la 0,75', () => {
  const e = aseazaElement(EL('titlu', 0, 2.5), { tip: 'titlu', la: 0, titlu: ['Scurt'] }, opt('orizontal')).element;
  assert.equal(e.blocuri[1].marime, 63);
});

test('erorile: textul care nu încape (C04), ultimul punct după ieșire, timpul de citire (C09)', () => {
  const lung = aseazaElement(EL('nume', 1, 4), { tip: 'nume', la: 1, nume: 'W'.repeat(28) }, opt());
  assert.deepEqual(lung.erori.map((e) => [e.cod, e.camp]), [['rand-nu-incape', 'elemente[0].nume']]);
  const tarziu = aseazaElement(EL('lista', 3, 6, { puncte: [{ k: 0, t: 4 }, { k: 1, t: 5.9 }] }),
    { tip: 'lista', la: 3, durata: 3, puncte: [{ text: 'a', ancora: { fraza: 'a' } }, { text: 'b', ancora: { fraza: 'b' } }] }, opt());
  assert.deepEqual(tarziu.erori.map((e) => [e.cod, e.camp]), [['overlay-filmare-ocupare', 'elemente[0].durata']]);
  const repede = aseazaElement(EL('titlu', 0, 1.5), { tip: 'titlu', la: 0, durata: 1.5, titlu: ['Cum câștig șase ore pe săptămână'] }, opt());
  assert.deepEqual(repede.erori.map((e) => [e.cod, e.camp]), [['prea-repede-de-citit', 'elemente[0].durata']]);
  assert.equal(IESIRE, 0.25);
});
