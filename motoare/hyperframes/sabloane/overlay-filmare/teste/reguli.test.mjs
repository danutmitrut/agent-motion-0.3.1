import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { valideaza, verificaIduri } from '../reguli.mjs';
import { proiectFals, cuvinteDin, dateMinime } from './ajutoare.mjs';

const TEXT = 'Bună sunt Andreea și lucrez cu cloud cod în fiecare zi de la nouă la cinci dar acum câștig șase ore pe săptămână cu agentul meu care face trei lucruri pentru mine';
const coduri = (r) => r.erori.map((e) => [e.cod, e.camp]);

function cu(t, extra = {}) {
  const p = proiectFals({ cuvinte: cuvinteDin(TEXT), durata: 20, ...extra });
  t.after(p.curata);
  return p;
}

test('minimul trece', (t) => {
  const { ctx } = cu(t);
  assert.deepEqual(valideaza(dateMinime(), ctx), { erori: [], avertismente: [] });
});

test('durata: sub 5 s sau sfârșitul după copia de lucru', (t) => {
  const { ctx } = cu(t);
  assert.deepEqual(coduri(valideaza(dateMinime({ filmare: { fisier: 'active/filmare-lucru.mp4', start: 16 } }), ctx)), [['overlay-filmare-durata', 'filmare.start']]);
  assert.deepEqual(coduri(valideaza(dateMinime({ filmare: { fisier: 'active/filmare-lucru.mp4', sfarsit: 25 } }), ctx)), [['overlay-filmare-durata', 'filmare.sfarsit']]);
});

test('S01: originalul sau copia de lucru schimbate', (t) => {
  const { ctx, dir } = cu(t);
  fs.writeFileSync(path.join(dir, 'resurse', 'filmare-original.mp4'), 'altceva');
  assert.deepEqual(coduri(valideaza(dateMinime(), ctx)), [['overlay-filmare-sursa-schimbata', 'filmare.fisier']]);
});

test('C03 pe textele din date; ancora caută în textul corectat; S02 pe fraza negăsită', (t) => {
  const { ctx } = cu(t);
  const d = dateMinime({
    corecturi: [{ cuvinte: 'w6-w7', din: 'cloud cod', in: 'Claude Code' }],
    elemente: [{ tip: 'titlu', la: 0.2, titlu: ['Lucrez \u2014 mai puțin'] }, { tip: 'cifra', ancora: { fraza: 'claude code' }, valoare: 1 }, { tip: 'citat', ancora: { fraza: 'opt ore' }, text: 'x' }],
  });
  assert.deepEqual(coduri(valideaza(d, ctx)), [['liniuta-lunga', 'elemente[0].titlu[0]'], ['overlay-filmare-ancora', 'elemente[2].ancora.fraza']]);
});

test('S03: corectura cu din greșit; ancorele caută atunci în transcrierea necorectată', (t) => {
  const { ctx } = cu(t);
  const d = dateMinime({ corecturi: [{ cuvinte: 'w0', din: 'buna', in: 'Bună,' }], elemente: [{ tip: 'cifra', ancora: { fraza: 'șase ore' }, valoare: 6 }] });
  assert.deepEqual(coduri(valideaza(d, ctx)), [['overlay-filmare-corectura', 'corecturi[0].din']]);
});

test('S05: transcrierea care pare în altă limbă', (t) => {
  const { ctx } = cu(t, { cuvinte: cuvinteDin('the quick brown fox jumps over the lazy dog and runs away from the farmer today') });
  assert.deepEqual(coduri(valideaza(dateMinime(), ctx)), [['overlay-filmare-transcriere-slaba', 'limba']]);
  assert.deepEqual(coduri(valideaza(dateMinime({ limba: 'en' }), ctx)), []);
});

test('S05: avertisment pentru emoji în transcriere, cu id-ul cuvântului', (t) => {
  const c = cuvinteDin(TEXT);
  c[3] = { ...c[3], text: 'și\u{1F642}' };
  const { ctx } = cu(t, { cuvinte: c });
  const r = valideaza(dateMinime(), ctx);
  assert.deepEqual(r.erori, []);
  assert.deepEqual(r.avertismente.map((a) => [a.cod, a.camp]), [['overlay-filmare-transcriere-text', 'corecturi']]);
  assert.match(r.avertismente[0].mesaj, /w3/);
});

test('S02: ancora în afara porțiunii alese (decizia 26), fără S04', (t) => {
  const { ctx } = cu(t);
  const el = [{ tip: 'nume', ancora: { fraza: 'sunt andreea' }, nume: 'A' }];
  const inainte = valideaza(dateMinime({ filmare: { fisier: 'active/filmare-lucru.mp4', start: 3 }, elemente: el }), ctx);
  assert.deepEqual(coduri(inainte), [['overlay-filmare-ancora', 'elemente[0].ancora']]);
  assert.match(inainte.erori[0].mesaj, /sunt andreea/);
  assert.match(inainte.erori[0].mesaj, /începe la 3 s|începe la 3,0 s|începe la 3/);
  const dupa = valideaza(dateMinime({ filmare: { fisier: 'active/filmare-lucru.mp4', sfarsit: 6 }, elemente: [{ tip: 'cifra', ancora: { fraza: 'șase ore' }, valoare: 6 }] }), ctx);
  assert.deepEqual(coduri(dupa), [['overlay-filmare-ancora', 'elemente[0].ancora']]);
});

test('S02: punctul listei în afara porțiunii alese, pe câmpul punctului', (t) => {
  const { ctx } = cu(t);
  const lista = { tip: 'lista', la: 1, puncte: [{ text: 'a', ancora: { fraza: 'șase ore' } }] };
  const r = valideaza(dateMinime({ filmare: { fisier: 'active/filmare-lucru.mp4', sfarsit: 6 }, elemente: [lista] }), ctx);
  assert.deepEqual(coduri(r), [['overlay-filmare-ancora', 'elemente[0].puncte[0].ancora']]);
});

test('id-urile elementelor sunt unice, inclusiv față de cele implicite (decizia 30)', (t) => {
  const { ctx } = cu(t);
  const titlu = (extra) => ({ tip: 'titlu', titlu: ['Primii pași'], ...extra });
  assert.deepEqual(verificaIduri([titlu({ la: 0.2 }), titlu({ la: 5 }), titlu({ id: 'unu', la: 10 })]), []);
  // același id dat de două ori: eroarea e pe al doilea
  const doi = verificaIduri([titlu({ id: 'start', la: 0.2 }), titlu({ id: 'start', la: 5 })]);
  assert.deepEqual(doi.map((e) => [e.cod, e.camp]), [['overlay-filmare-id-dublu', 'elemente[1].id']]);
  assert.match(doi[0].mesaj, /^Elementele 1 și 2 au același id, „start”;/);
  assert.match(doi[0].sugestie, /elemente\[1\]/);
  // un id dat care ia numele implicit al altui element: eroarea e pe cel dat
  const implicit = verificaIduri([titlu({ id: 'e2', la: 0.2 }), titlu({ la: 5 })]);
  assert.deepEqual(implicit.map((e) => [e.cod, e.camp]), [['overlay-filmare-id-dublu', 'elemente[0].id']]);
  assert.match(implicit[0].mesaj, /„e2” \(implicit\)/);
  // în valideaza, lângă celelalte erori (nu oprește restul regulilor)
  const d = dateMinime({ elemente: [titlu({ id: 'x', la: 0.2 }), { tip: 'cifra', id: 'x', ancora: { fraza: 'opt ore' }, valoare: 8 }] });
  assert.deepEqual(coduri(valideaza(d, ctx)), [['overlay-filmare-id-dublu', 'elemente[1].id'], ['overlay-filmare-ancora', 'elemente[1].ancora.fraza']]);
});

test('jos-de-tot: pe vertical trece, pe orizontal e respinsă (jos e deja la marginea zonei sigure)', (t) => {
  const { ctx } = cu(t);
  assert.deepEqual(coduri(valideaza(dateMinime({ subtitrari: { pozitie: 'jos-de-tot' } }), ctx)), []);
  assert.deepEqual(coduri(valideaza(dateMinime({ format: 'orizontal', subtitrari: { pozitie: 'jos-de-tot' } }), ctx)), [['valoare-invalida', 'subtitrari.pozitie']]);
});
