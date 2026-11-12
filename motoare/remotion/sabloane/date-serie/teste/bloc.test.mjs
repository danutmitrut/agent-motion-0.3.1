// Blocul „Ce apare pe ecran” (I08): textul exact de pe ecran, câmpul și fontul fiecărui text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blocScenariu } from '../bloc.mjs';
import { exemplu, sablonul, stilRezolvat, ctxTest } from './ajutoare.mjs';

async function bloc(date, tema = null) {
  const sab = await sablonul();
  const stil = stilRezolvat(sab, date, tema);
  const c = sab.modul.cronologie(date, stil, ctxTest(sab, { stil }));
  assert.deepEqual(c.erori, []);
  return blocScenariu(date, stil, c.cronologie, ctxTest(sab, { stil, intern: c.intern }));
}

test('texte: o linie pe câmp, cu textul exact de pe ecran și fontul cu care se desenează', async () => {
  const b = await bloc(exemplu('grafic.date'));
  assert.equal(b.texte.length, 30);
  assert.deepEqual(b.texte[0], { ref: 'Scena 1', camp: 'scene[0].eticheta', eticheta: 'eticheta', text: 'PRIMUL SEMESTRU', accent: false, separat: false, font: 'text', greutate: 700 });
  const linie = (camp) => b.texte.find((t) => t.camp === camp);
  assert.deepEqual([linie('scene[1].valoare').eticheta, linie('scene[1].valoare').text, linie('scene[1].valoare').font], ['cifra', '1.248', 'titlu']);
  assert.deepEqual([linie('scene[2].valori[5].eticheta').eticheta, linie('scene[2].valori[5].eticheta').text], ['bara 6', 'iun']);
  assert.deepEqual([linie('scene[2].valori[5].valoare').eticheta, linie('scene[2].valori[5].valoare').text, linie('scene[2].valori[5].valoare').accent], ['bara 6, valoarea', '21.300', true]);
  assert.equal(linie('scene[2].valori[4].valoare').accent, false);
  assert.deepEqual([linie('scene[3].valori[1].valoare').eticheta, linie('scene[3].valori[1].valoare').text, linie('scene[3].valori[1].valoare').accent], ['comparația, valoarea 2', '78.450 lei', true]);
  assert.deepEqual([linie('scene[4].cta').eticheta, linie('scene[4].cta').text], ['îndemn', 'Link în bio']);
  for (const t of b.texte) assert.deepEqual(Object.keys(t), ['ref', 'camp', 'eticheta', 'text', 'accent', 'separat', 'font', 'greutate']);
});

test('textele nu depind de temă (zona intră în hash-ul aprobării), stilul da', async () => {
  const n = await bloc(exemplu('grafic.date'), 'noapte');
  const h = await bloc(exemplu('grafic.date'), 'hartie');
  assert.deepEqual(h.texte, n.texte);
  assert.notDeepEqual(h.stil, n.stil);
});

test('stil: tema, atmosfera și câte un rând pe scenă, cu orientarea barelor', async () => {
  const b = await bloc(exemplu('grafic.date'));
  assert.deepEqual(b.stil, [
    'Tema: noapte; accent #FF7A59 (din temă); fundal #0E0F13 (din temă)',
    'Atmosferă: ceață; format: vertical 1080x1920, 30 fps; tranziție de 0,4 s între scene',
    'Scena 1 (titlu): 0,0-3,6 s, complet la 0,6 s',
    'Scena 2 (cifră): 3,6-7,2 s, complet la 4,9 s',
    'Scena 3 (bare, coloane): 7,2-14,6 s, complet la 8,333 s',
    'Scena 4 (comparație): 14,6-18,8 s, complet la 15,6 s',
    'Scena 5 (final): 18,8-22,4 s, complet la 19,2 s',
  ]);
});
