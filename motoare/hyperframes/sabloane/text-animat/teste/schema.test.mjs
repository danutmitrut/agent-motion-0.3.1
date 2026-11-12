import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { valideazaPeSchema } from '../../../../../nucleu/lib/schema.mjs';

const schema = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../schema.json', import.meta.url)), 'utf8'));
const minim = () => JSON.parse(fs.readFileSync(fileURLToPath(new URL('../exemple/minim.json', import.meta.url)), 'utf8'));
const coduri = (date) => valideazaPeSchema(schema, date).map((e) => [e.cod, e.camp]);

test('exemplul minim trece schema', () => {
  assert.deepEqual(coduri(minim()), []);
});

test('un câmp care nu aparține tipului e camp-necunoscut pe calea lui', () => {
  const date = minim();
  date.scene[0].puncte = ['a', 'b'];
  assert.deepEqual(coduri(date), [['camp-necunoscut', 'scene[0].puncte']]);
});

test('eticheta nu există la final și la citat', () => {
  const date = minim();
  date.scene[2].eticheta = 'Gata';
  assert.deepEqual(coduri(date), [['camp-necunoscut', 'scene[2].eticheta']]);
});

test('limitele: 12 scene, titlu 3 rânduri, final până la 10 s, celelalte până la 8 s, sigla doar în resurse/', () => {
  const date = minim();
  date.scene = Array.from({ length: 13 }, () => ({ tip: 'titlu', titlu: ['Un rând'] }));
  assert.deepEqual(coduri(date).map(([c]) => c), ['valoare-invalida']);
  const d2 = minim();
  d2.scene[2].durata = 9.5;
  assert.deepEqual(coduri(d2), []);
  d2.scene[0].durata = 9.5;
  assert.deepEqual(coduri(d2).map(([, camp]) => camp), ['scene[0].durata']);
  const d3 = minim();
  d3.sigla = 'sigla.svg';
  assert.deepEqual(coduri(d3).map(([, camp]) => camp), ['sigla']);
});

test('tema contrast, atmosfera degrade și alinierea sunt acceptate', () => {
  const date = minim();
  date.stil = { tema: 'contrast', atmosfera: 'degrade', aliniere: 'stanga', font_titlu: 'playfair-display', ritm: 'alert' };
  assert.deepEqual(coduri(date), []);
});

test('scena cuvinte are 2-4 cuvinte (decizia 12): cu 5 pică pe scene[i].cuvinte, cu mesaj în română', () => {
  const date = minim();
  date.scene[0] = { tip: 'cuvinte', cuvinte: ['unu', 'doi', 'trei', 'patru'] };
  assert.deepEqual(coduri(date), []);
  date.scene[0].cuvinte.push('cinci');
  assert.deepEqual(coduri(date), [['valoare-invalida', 'scene[0].cuvinte']]);
  const mesaj = valideazaPeSchema(schema, date)[0].mesaj;
  assert.match(mesaj, /cel mult 4 cuvinte/);
  assert.match(mesaj, /8 secunde/);
  const ramura = schema.$defs.scenaCuvinte;
  assert.equal(ramura.properties.cuvinte.maxItems, 4);
  assert.doesNotMatch(ramura['x-mesaj'].required, /2-5/);
  assert.match(ramura['x-mesaj'].required, /2-4/);
});
