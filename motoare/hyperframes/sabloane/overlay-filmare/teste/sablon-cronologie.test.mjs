import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cronologie, asteptari } from '../sablon.mjs';
import { proiectFals, cuvinteDin, dateMinime, stilTest } from './ajutoare.mjs';

const CUVINTE = cuvinteDin('Bună sunt Andreea și lucrez cu agenți în fiecare zi de la nouă la cinci', { de_la: 0.4 });

test('cronologie: valideaza întâi, apoi planul în intern; asteptari folosește planul', (t) => {
  const p = proiectFals({ cuvinte: CUVINTE, durata: 12 });
  t.after(p.curata);
  const rau = cronologie(dateMinime({ elemente: [{ tip: 'titlu', ancora: { fraza: 'nu există' }, titlu: ['x'] }] }), stilTest(), p.ctx);
  assert.deepEqual([rau.cronologie, rau.intern, rau.erori.map((e) => e.cod)], [null, null, ['overlay-filmare-ancora']]);
  const bun = cronologie(dateMinime({ elemente: [{ tip: 'titlu', la: 0.2, titlu: ['Bun venit'] }] }), stilTest(), p.ctx);
  assert.deepEqual(bun.erori, []);
  assert.equal(bun.intern.sablon, 'overlay-filmare');
  const a = asteptari(bun.cronologie, { intern: bun.intern });
  assert.ok(a.texte.some((x) => x.ref === 'e1' && x.text === 'Bun venit'));
  assert.ok(a.texte.some((x) => x.ref.startsWith('Subtitrare')));
  const faraPlan = asteptari(bun.cronologie);
  assert.deepEqual(faraPlan.texte.map((x) => x.text), ['Bun venit']);
  assert.deepEqual(faraPlan.transcriere, []);
});
