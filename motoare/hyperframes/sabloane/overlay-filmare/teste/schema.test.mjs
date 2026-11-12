import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { valideazaPeSchema } from '../../../../../nucleu/lib/schema.mjs';
import { incarcaSablon } from '../../../../../nucleu/lib/sabloane.mjs';

const REPO = fileURLToPath(new URL('../../../../../', import.meta.url));
const schema = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../schema.json', import.meta.url)), 'utf8'));
const minim = () => JSON.parse(fs.readFileSync(fileURLToPath(new URL('../exemple/minim.json', import.meta.url)), 'utf8'));
const coduri = (date) => valideazaPeSchema(schema, date).map((e) => [e.cod, e.camp]);
const cu = (extra) => ({ ...minim(), ...extra });

test('minimul scris de mg nou trece schema și șablonul se încarcă, cu intrare: filmare', async () => {
  assert.deepEqual(minim(), { sablon: 'overlay-filmare', versiune_schema: 1, format: 'vertical', filmare: { fisier: 'active/filmare-lucru.mp4' } });
  assert.deepEqual(coduri(minim()), []);
  const sab = await incarcaSablon(REPO, 'overlay-filmare');
  assert.equal(sab.meta.intrare, 'filmare');
  assert.deepEqual(sab.meta.stadii, { S09: 'mp4', S10: 'mp4' });
});

test('exemplul din spec 7.4 trece schema (cu fontul instrument-sans)', () => {
  const date = JSON.parse(fs.readFileSync(fileURLToPath(new URL('./fixtures/spec.json', import.meta.url)), 'utf8'));
  assert.deepEqual(coduri(date), []);
});

test('filmare.fisier e fix, start ≥ 0, sfarsit număr sau null, focus_x 0-100', () => {
  assert.deepEqual(coduri(cu({ filmare: { fisier: 'resurse/alt.mp4' } })).map(([, c]) => c), ['filmare.fisier']);
  assert.deepEqual(coduri(cu({ filmare: { fisier: 'active/filmare-lucru.mp4', start: -1 } })).map(([, c]) => c), ['filmare.start']);
  assert.deepEqual(coduri(cu({ filmare: { fisier: 'active/filmare-lucru.mp4', sfarsit: null, focus_x: 100 } })), []);
  assert.deepEqual(coduri(cu({ filmare: { fisier: 'active/filmare-lucru.mp4', focus_x: 101 } })).map(([, c]) => c), ['filmare.focus_x']);
});

test('limba: doar limbile Parakeet', () => {
  assert.deepEqual(coduri(cu({ limba: 'en' })), []);
  assert.deepEqual(coduri(cu({ limba: 'ja' })).map(([, c]) => c), ['limba']);
});

test('elementele: tipul alege câmpurile, exact unul dintre la și ancora', () => {
  const titlu = { tip: 'titlu', la: 0.2, titlu: ['Bun venit'] };
  assert.deepEqual(coduri(cu({ elemente: [titlu] })), []);
  assert.deepEqual(coduri(cu({ elemente: [{ ...titlu, ancora: { fraza: 'bună' } }] })).map(([c]) => c), ['valoare-invalida']);
  assert.deepEqual(coduri(cu({ elemente: [{ tip: 'titlu', titlu: ['x'] }] })).map(([c]) => c), ['valoare-invalida']);
  assert.deepEqual(coduri(cu({ elemente: [{ ...titlu, nume: 'Ana' }] })), [['camp-necunoscut', 'elemente[0].nume']]);
  assert.deepEqual(coduri(cu({ elemente: [{ tip: 'nume', la: 1, nume: 'x'.repeat(29) }] })).map(([, c]) => c), ['elemente[0].nume']);
  assert.deepEqual(coduri(cu({ elemente: [{ tip: 'lista', la: 1, puncte: [{ text: 'a', ancora: { fraza: 'a' } }] }] })).map(([, c]) => c), ['elemente[0].puncte']);
  assert.deepEqual(coduri(cu({ elemente: Array.from({ length: 13 }, (_, i) => ({ ...titlu, la: i })) })).map(([, c]) => c), ['elemente']);
});

test('corecturi: cuvinte wN sau wN-wM, in cel mult 40 de caractere sau gol', () => {
  assert.deepEqual(coduri(cu({ corecturi: [{ cuvinte: 'w21-w22', din: 'cloud cod', in: 'Claude Code' }, { cuvinte: 'w48', din: 'practic', in: '' }] })), []);
  assert.deepEqual(coduri(cu({ corecturi: [{ cuvinte: 'w2-', din: 'a', in: 'b' }] })).map(([, c]) => c), ['corecturi[0].cuvinte']);
  assert.deepEqual(coduri(cu({ corecturi: [{ cuvinte: 'w2', din: 'a', in: 'x'.repeat(41) }] })).map(([, c]) => c), ['corecturi[0].in']);
});

test('stilul: temele, fonturile din catalog, opacitatea 0,45-1, fără atmosferă', () => {
  assert.deepEqual(coduri(cu({ stil: { tema: 'hartie', font_titlu: 'fraunces', opacitate_fundal: 0.45, ritm: 'calm' } })), []);
  assert.deepEqual(coduri(cu({ stil: { tema: 'contrast' } })).map(([, c]) => c), ['stil.tema']);
  assert.deepEqual(coduri(cu({ stil: { font_titlu: 'caveat' } })).map(([, c]) => c), ['stil.font_titlu']);
  assert.deepEqual(coduri(cu({ stil: { opacitate_fundal: 0.3 } })).map(([, c]) => c), ['stil.opacitate_fundal']);
  assert.deepEqual(coduri(cu({ stil: { atmosfera: 'ceata' } })), [['camp-necunoscut', 'stil.atmosfera']]);
});

test('subtitrările: enumerările, cuvinte_max 2-6, evidentiaza 1-3 cuvinte, max. 12', () => {
  assert.deepEqual(coduri(cu({ subtitrari: { activ: true, animatie: 'grup', pozitie: 'mijloc', marime: 'L', cuvinte_max: 6, evidentiaza: ['șase ore'], majuscule: true } })), []);
  assert.deepEqual(coduri(cu({ subtitrari: { cuvinte_max: 7 } })).map(([, c]) => c), ['subtitrari.cuvinte_max']);
  assert.deepEqual(coduri(cu({ subtitrari: { evidentiaza: ['unu doi trei patru'] } })).map(([, c]) => c), ['subtitrari.evidentiaza[0]']);
});
