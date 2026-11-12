import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cronologie, blocScenariu } from '../sablon.mjs';
import { proiectFals, cuvinteDin, dateMinime, stilTest } from './ajutoare.mjs';

const TEXT = 'Bună sunt Andreea și lucrez cu agenți în fiecare zi. Acum câștig șase ore pe săptămână, pentru că agentul meu face trei lucruri: răspunde la e-mailuri, programează postările și pregătește ofertele. Vreau să-ți arăt cum.';

function bloc(t, date) {
  const p = proiectFals({ cuvinte: cuvinteDin(TEXT, { de_la: 0.4, pas: 0.36, lung: 0.3 }), durata: 20 });
  t.after(p.curata);
  const stil = stilTest('noapte');
  const c = cronologie(date, stil, p.ctx);
  assert.deepEqual(c.erori, []);
  return { b: blocScenariu(date, stil, c.cronologie, { ...p.ctx, intern: c.intern }), plan: c.intern };
}

test('o linie pe fiecare text al elementelor, apoi una pe fiecare grup de subtitrare', (t) => {
  const { b, plan } = bloc(t, dateMinime({
    elemente: [
      { tip: 'lista', ancora: { fraza: 'trei lucruri' }, titlu: ['Ce face agentul'], puncte: [{ text: 'E-mailuri', ancora: { fraza: 'e-mailuri' } }, { text: 'Postări', ancora: { fraza: 'postările' } }] },
      { tip: 'cifra', id: 'ore', ancora: { fraza: 'șase ore' }, valoare: 6, sufix: ' ore' },
    ],
  }));
  const elemente = b.texte.filter((l) => l.camp !== 'subtitrari');
  assert.deepEqual(elemente.map((l) => [l.ref, l.eticheta, l.text]), [
    ['e1', 'titlul listei', 'Ce face agentul'], ['e1', 'punctul 1', 'E-mailuri'], ['e1', 'punctul 2', 'Postări'],
    ['ore', 'cifra', '6 ore'],
  ]);
  const sub = b.texte.filter((l) => l.camp === 'subtitrari');
  assert.equal(sub.length, plan.subtitrari.grupuri.length);
  assert.deepEqual(sub.map((l) => l.ref), plan.subtitrari.grupuri.map((g) => `Subtitrare ${g.n}`));
  assert.ok(sub.every((l) => l.eticheta === null && l.font === 'titlu' && l.greutate === plan.greutate_titlu));
});

test('corectura schimbă textul din bloc (deci și hash-ul aprobării); timpii nu intră în texte', (t) => {
  const a = bloc(t, dateMinime()).b;
  const b = bloc(t, dateMinime({ corecturi: [{ cuvinte: 'w18', din: 'agentul', in: 'AGENTUL' }] })).b;
  assert.notDeepEqual(a.texte, b.texte);
  assert.ok(b.texte.some((l) => l.text.includes('AGENTUL')));
  assert.equal(JSON.stringify(a.texte).match(/\d+,\d s/), null);
});

test('rândurile de stil: tema, ritmul, filmarea, subtitrările, apoi segmentele cu text', (t) => {
  const { b } = bloc(t, dateMinime({ elemente: [{ tip: 'titlu', la: 0.2, titlu: ['Primii pași'] }] }));
  assert.match(b.stil[0], /^Tema: noapte; accent #[0-9A-Fa-f]{6}; carduri #[0-9A-Fa-f]{6} la \d+%$/);
  assert.match(b.stil[1], /^Ritm: normal; format: vertical 1080x1920, 30 fps$/);
  assert.match(b.stil[2], /^Filmarea: de la 0,0 s, 20,0 s, decupată la 50%$/);
  assert.match(b.stil[3], /^Subtitrări: cuvântul activ, jos, \d+ px; \d+ grupuri$/);
  assert.match(b.stil[4], /^e1 \(titlu, banda \w+\): 0,2-[\d,]+ s, complet la [\d,]+ s$/);
  assert.equal(b.stil.length, 5);
});
