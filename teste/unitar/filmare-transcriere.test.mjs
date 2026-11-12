import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeazaTranscriere, raportTranscriere, LIMBI_PARAKEET } from '../../nucleu/lib/filmare/transcriere.mjs';

const w = (text, start, end) => ({ text, start, end });

test('Parakeet: id-uri w0…, sedile convertite, ♪ și U+FFFD scoase, cuvintele de după final tăiate', () => {
  const t = normalizeazaTranscriere([
    { id: 'x', text: 'Bună,', start: 0, end: 0.48 }, w('\u015fase', 0.6, 0.9), w('♪', 1, 1.2), w('\uFFFD', 1.3, 1.4),
    w('\u0162ara', 1.5, 1.9), w('\u015eI', 2, 2.2), w('coadă', 9.95, 10.4),
  ], { sursa: 'parakeet', limba: 'ro', durata: 10 });
  assert.deepEqual(t, {
    versiune: 1, sursa: 'parakeet', limba: 'ro', durata: 10,
    cuvinte: [
      { id: 'w0', text: 'Bună,', start: 0, end: 0.48 },
      { id: 'w1', text: 'șase', start: 0.6, end: 0.9 },
      { id: 'w2', text: 'Țara', start: 1.5, end: 1.9 },
      { id: 'w3', text: 'ȘI', start: 2, end: 2.2 },
    ],
  });
});

test('Parakeet: textul gol după curățare dispare, timpii rotunjiți la 3 zecimale', () => {
  const t = normalizeazaTranscriere([w('  ', 0, 0.1), w('ok', 0.12345, 0.56789)], { sursa: 'parakeet', limba: 'ro', durata: 5 });
  assert.deepEqual(t.cuvinte, [{ id: 'w0', text: 'ok', start: 0.123, end: 0.568 }]);
});

test('import: replicile se sparg în cuvinte, cu timpi proporționali cu caracterele și indicele replicii', () => {
  const t = normalizeazaTranscriere([w('Bună, sunt Andreea.', 0, 1.6), w('În fiecare săptămână câ\u015ftig \u015fase ore.', 1.6, 4.2)],
    { sursa: 'import', limba: 'ro', durata: 5 });
  assert.equal(t.sursa, 'import');
  assert.deepEqual(t.cuvinte.map((c) => c.text), ['Bună,', 'sunt', 'Andreea.', 'În', 'fiecare', 'săptămână', 'câștig', 'șase', 'ore.']);
  assert.deepEqual(t.cuvinte.map((c) => c.fraza), [0, 0, 0, 1, 1, 1, 1, 1, 1]);
  assert.equal(t.cuvinte[0].start, 0);
  assert.equal(t.cuvinte[2].end, 1.6);
  assert.equal(t.cuvinte[3].start, 1.6);
  assert.equal(t.cuvinte.at(-1).end, 4.2);
  for (let i = 1; i < t.cuvinte.length; i += 1) assert.ok(t.cuvinte[i].start >= t.cuvinte[i - 1].end - 1e-9);
  // „Bună,” are 5 caractere din 17 (fără spații) ale primei replici
  assert.equal(t.cuvinte[0].end, Math.round((1.6 * 5 / 17) * 1000) / 1000);
});

test('raportTranscriere: metricile lui S05', () => {
  const cuvinte = [];
  const texte = ['și', 'eu', 'cred', 'că', 'e', 'bine', 'la', 'noi', 'în', 'oraș'];
  for (let i = 0; i < 10; i += 1) cuvinte.push({ id: `w${i}`, text: texte[i], start: 1 + i * 0.4, end: 1 + i * 0.4 + (i === 9 ? 0.03 : 0.3) });
  const r = raportTranscriere({ versiune: 1, sursa: 'parakeet', limba: 'ro', durata: 6, cuvinte });
  assert.deepEqual(r.interval_vorbit, [1, 4.63]);
  assert.equal(r.cuvinte, 10);
  assert.equal(r.cuvinte_pe_secunda, Math.round((10 / 3.63) * 1000) / 1000);
  assert.equal(r.procent_scurte, 0.1);
  assert.equal(r.durata_max, 0.3);
  assert.equal(r.procent_functionale, 0.4); // și, că, la, în (e nu e în listă)
  assert.equal(r.procent_simboluri, 0);
});

test('raportTranscriere: fără cuvinte', () => {
  const r = raportTranscriere({ versiune: 1, sursa: 'parakeet', limba: 'ro', durata: 6, cuvinte: [] });
  assert.equal(r.cuvinte, 0);
  assert.equal(r.interval_vorbit, null);
  assert.equal(r.cuvinte_pe_secunda, 0);
});

test('LIMBI_PARAKEET: lista din spec, cu ro', () => {
  assert.equal(LIMBI_PARAKEET.length, 25);
  assert.ok(LIMBI_PARAKEET.includes('ro'));
});

test('raportTranscriere: procent_simboluri se măsoară pe brut, nu pe transcrierea normalizată', () => {
  const brut = [];
  for (let i = 0; i < 10; i += 1) brut.push(w(i < 2 ? (i === 0 ? '♪' : '\uFFFD') : `cuv${i}`, i * 0.5, i * 0.5 + 0.4));
  brut.push(w('   ', 5, 5.2)); // text vid: nu intră la numitor
  const t = normalizeazaTranscriere(brut, { sursa: 'parakeet', limba: 'ro', durata: 10 });
  assert.equal(t.cuvinte.length, 8);
  assert.equal(raportTranscriere(t, brut).procent_simboluri, 0.2);
  assert.equal(raportTranscriere(t).procent_simboluri, 0);
});

test('normalizeazaTranscriere: cuvântul tăiat de final rămâne dacă mai mult de jumătate încape, cu end tăiat la durată', () => {
  const t = normalizeazaTranscriere([w('aproape', 9.5, 10.3)], { sursa: 'parakeet', limba: 'ro', durata: 10 });
  assert.deepEqual(t.cuvinte, [{ id: 'w0', text: 'aproape', start: 9.5, end: 10 }]);
});
