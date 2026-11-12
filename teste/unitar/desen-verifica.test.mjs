import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { verificaDesene, temaFilmului } from '../../nucleu/lib/desen/verifica.mjs';
import { comandaDesen } from '../../nucleu/lib/desen/index.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';

const CATALOG = {
  versiune: 1, surse: {}, sinonime: {},
  piese: [
    { id: 'od-chilling', tip: 'forma', familie: 'cerneala', noapte: 'bun' },
    { id: 'od-running', tip: 'forma', familie: 'cerneala', noapte: 'bun' },
    { id: 'x-test-b', tip: 'forma', familie: 'test-b', noapte: 'bun' },
    { id: 'od-meditating', tip: 'forma', familie: 'cerneala', noapte: 'evita' },
    { id: 'op-picioare-arata', tip: 'forma', familie: 'cerneala', noapte: 'autocolant' },
    { id: 'p-sigla', tip: 'forma', familie: 'proprie', noapte: 'autocolant', proprie: true },
  ],
};
const { radacina, curata } = creeazaRadacinaTemp({ copiaza: ['motoare/comun/iconite'] });
test.after(curata);

function date(scene, stil = {}) {
  return { sablon: 'reel-ilustrat', versiune_schema: 1, stil, scene };
}
const coduri = (r) => r.erori.map((e) => `${e.cod} ${e.camp}`);

test('date corecte: nicio eroare', () => {
  const r = verificaDesene(date([
    { tip: 'desen', desen: { id: 'od-chilling', marime: 'mare' }, titlu: ['A'] },
    { tip: 'adunare', iconite: ['phone', 'mail'], cuvinte: ['a', 'b'] },
    { tip: 'final', desen: { id: 'od-running' }, titlu: ['B'] },
  ]), CATALOG, radacina);
  assert.deepEqual(r, { erori: [], avertismente: [] });
});

test('un id care nu există dă desen-necunoscut', () => {
  const r = verificaDesene(date([{ tip: 'desen', desen: { id: 'od-nu-exista' } }]), CATALOG, radacina);
  assert.deepEqual(coduri(r), ['desen-necunoscut scene[0].desen.id']);
  assert.match(r.erori[0].mesaj, /^Scena 1: /);
});

test('două scene cu familii diferite dau desen-familii-amestecate (regula e generică)', () => {
  const r = verificaDesene(date([
    { tip: 'desen', desen: { id: 'od-chilling' } },
    { tip: 'final', desen: { id: 'x-test-b' } },
  ], { tema: 'hartie' }), CATALOG, radacina);
  assert.deepEqual(coduri(r), ['desen-familii-amestecate scene[1].desen.id']);
});

test('piesele proprii nu declanșează amestecul', () => {
  const r = verificaDesene(date([
    { tip: 'desen', desen: { id: 'od-chilling' } },
    { tip: 'desen', desen: { id: 'p-sigla' } },
  ]), CATALOG, radacina);
  assert.deepEqual(r.erori, []);
});

test('o piesă rezolvată cu alt tip decât forma (traseu one-line) e refuzată', () => {
  const catalog = { ...CATALOG, piese: [...CATALOG.piese, { id: 'p-x', tip: 'traseu', familie: 'proprie', noapte: 'bun', proprie: true }] };
  const r = verificaDesene(date([{ tip: 'desen', desen: { id: 'p-x' } }]), catalog, radacina);
  assert.deepEqual(coduri(r), ['valoare-invalida scene[0].desen.id']);
  assert.match(r.erori[0].mesaj, /agentul folosește doar forme/);
});

test('pe noapte, o piesă evita fără panou dă desen-fara-panou', () => {
  const scene = [{ tip: 'desen', desen: { id: 'od-meditating' } }, { tip: 'final', desen: { id: 'op-picioare-arata' } }];
  assert.deepEqual(coduri(verificaDesene(date(scene), CATALOG, radacina)), ['desen-fara-panou scene[0].desen.panou']);
  const cuPanou = [{ tip: 'desen', desen: { id: 'od-meditating', panou: true } }, scene[1]];
  assert.deepEqual(verificaDesene(date(cuPanou), CATALOG, radacina).erori, []);
  assert.deepEqual(verificaDesene(date(scene, { tema: 'hartie' }), CATALOG, radacina).erori, []);
});

test('o mărime greșită dă desen-marime-invalida', () => {
  const r = verificaDesene(date([{ tip: 'desen', desen: { id: 'od-chilling', marime: 'urias' } }]), CATALOG, radacina);
  assert.deepEqual(coduri(r), ['desen-marime-invalida scene[0].desen.marime']);
});

test('o iconiță care nu e în Lucide dă iconita-necunoscuta', () => {
  const r = verificaDesene(date([{ tip: 'adunare', iconite: ['phone', 'telefon-vechi'] }]), CATALOG, radacina);
  assert.deepEqual(coduri(r), ['iconita-necunoscuta scene[0].iconite[1]']);
});

test('tema filmului: din date, altfel noapte', () => {
  assert.equal(temaFilmului(date([], { tema: 'curat' }), radacina), 'curat');
  assert.equal(temaFilmului(date([]), radacina), 'noapte');
  assert.equal(temaFilmului({ brand: 'nu-exista', scene: [] }, radacina), 'noapte');
});

test('comandaDesen verifica citește date.json și întoarce erorile', async (t) => {
  const tmp = creeazaRadacinaTemp({
    biblioteciMini: true,
    copiaza: ['motoare/comun/iconite'],
    fisiere: { 'video/p/date.json': JSON.stringify(date([{ tip: 'desen', desen: { id: 'od-nu-exista' } }, { tip: 'adunare', iconite: ['phone'] }])) },
  });
  t.after(tmp.curata);
  const cale = join(tmp.radacina, 'video', 'p', 'date.json');
  const r = await comandaDesen({ radacina: tmp.radacina, sub: 'verifica', pozitionale: [cale], optiuni: {} });
  assert.equal(r.ok, false);
  assert.deepEqual(r.erori.map((e) => e.cod), ['desen-necunoscut']);
  assert.deepEqual(r.rezultat, { date: cale, desene: 1, iconite: 1 });
});
