import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timpiElemente } from '../timp.mjs';
import { IMPLICITE, cuvinteDin } from './ajutoare.mjs';

const C = cuvinteDin('Bună sunt Andreea acum câștig șase ore pentru că agentul face trei lucruri răspunde la e-mailuri programează postările pregătește ofertele').map((c) => ({ ...c, ids: [c.id], ascuns: false, corectat: false }));
const opt = { cuvinte: C, start: 0, durata: 20, ritm: IMPLICITE.ritm.normal, implicite: IMPLICITE };
const t = (c) => C.find((x) => x.text === c).start;

test('la, ancora cu avansul ritmului, durata implicită a tipului', () => {
  const r = timpiElemente([{ tip: 'titlu', la: 0.2, titlu: ['x'] }, { tip: 'nume', ancora: { fraza: 'sunt andreea' }, nume: 'A' }], opt);
  assert.deepEqual(r.erori, []);
  assert.deepEqual([r.elemente[0].start, r.elemente[0].sfarsit], [0.2, 2.7]);
  assert.deepEqual([r.elemente[1].start, r.elemente[1].sfarsit], [Math.round((t('sunt') - 0.15) * 1000) / 1000, Math.round((t('sunt') - 0.15 + 3.5) * 1000) / 1000]);
  assert.deepEqual(r.elemente[1].ancora, { fraza: 'sunt andreea', aparitia: 1, gasita: true, t: t('sunt') });
  assert.deepEqual(r.elemente.map((e) => [e.n, e.id, e.banda]), [[1, 'e1', 'sus'], [2, 'e2', 'nume']]);
});

test('durata implicită crește cu timpul de citire, până la maximul tipului (decizia 21)', () => {
  const r = timpiElemente([
    { tip: 'titlu', la: 0, eticheta: 'Pe scurt', titlu: ['Cum câștig șase ore'] },
    { tip: 'citat', la: 4, text: Array.from({ length: 30 }, () => 'cuvânt').join(' ') },
    { tip: 'titlu', la: 13, titlu: ['Scurt'], durata: 2 },
  ], opt);
  assert.deepEqual(r.elemente.map((e) => Math.round((e.sfarsit - e.start) * 1000) / 1000), [2.6, 8, 2]);
});

test('filmare.start mută ancora pe cronologia finală', () => {
  const r = timpiElemente([{ tip: 'cifra', ancora: { fraza: 'șase ore' }, valoare: 6 }], { ...opt, start: 1 });
  assert.equal(r.elemente[0].ancora.t, Math.round((t('șase') - 1) * 1000) / 1000);
});

test('final: implicit la durata − 3 s, până la capăt; cu durata, pornește la durata videoului − durata', () => {
  assert.deepEqual(timpiElemente([{ tip: 'final', cta: 'x' }], opt).elemente.map((e) => [e.start, e.sfarsit]), [[17, 20]]);
  assert.deepEqual(timpiElemente([{ tip: 'final', durata: 4, cta: 'x' }], opt).elemente.map((e) => [e.start, e.sfarsit]), [[16, 20]]);
});

test('lista: punctele în ordine după ancora listei, durata = ultimul punct + 1,5 s, între 3 și 8 s', () => {
  const lista = { tip: 'lista', ancora: { fraza: 'trei lucruri' }, puncte: [{ text: 'a', ancora: { fraza: 'e-mailuri' } }, { text: 'b', ancora: { fraza: 'postările' } }, { text: 'c', ancora: { fraza: 'ofertele' } }] };
  const r = timpiElemente([lista], opt);
  assert.deepEqual(r.erori, []);
  const e = r.elemente[0];
  assert.deepEqual(e.puncte.map((p) => p.k), [0, 1, 2]);
  assert.ok(e.puncte[0].t < e.puncte[1].t && e.puncte[1].t < e.puncte[2].t);
  assert.equal(e.sfarsit, Math.round(Math.min(e.start + 8, Math.max(e.start + 3, e.puncte[2].t + 1.5)) * 1000) / 1000);
  const invers = timpiElemente([{ ...lista, puncte: [lista.puncte[2], lista.puncte[0]] }], opt);
  assert.deepEqual(invers.erori.map((x) => [x.cod, x.camp]), [['overlay-filmare-ancora', 'elemente[0].puncte[1].ancora.fraza']]);
});

test('fraza negăsită: S02 pe câmpul ancorei, elementul nu intră în listă', () => {
  const r = timpiElemente([{ tip: 'titlu', ancora: { fraza: 'nu există' }, titlu: ['x'] }], opt);
  assert.deepEqual(r.erori.map((x) => [x.cod, x.camp]), [['overlay-filmare-ancora', 'elemente[0].ancora.fraza']]);
  assert.deepEqual(r.elemente, []);
});
