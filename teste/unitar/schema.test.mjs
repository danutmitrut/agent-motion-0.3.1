import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { compileazaSchema, valideazaPeSchema, caleJson, locPentruOm } from '../../nucleu/lib/schema.mjs';
import { radacinaAgent } from '../../nucleu/lib/cai.mjs';

const RADACINA = radacinaAgent(import.meta.url, 2);
const citeste = (...parti) => JSON.parse(fs.readFileSync(path.join(RADACINA, ...parti), 'utf8'));

/** Schemă mică, scrisă aici, ca maparea erorilor să nu depindă de alt fișier. */
const SCHEMA_MICA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  required: ['versiune_schema', 'durata', 'scene'],
  properties: {
    versiune_schema: { const: 1 },
    durata: { type: 'number', minimum: 10, maximum: 60, 'x-mesaj': { maximum: 'durata trece de 60 de secunde.' } },
    scene: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['tip'],
        properties: {
          tip: { enum: ['desen', 'card'] },
          titlu: { type: 'array', maxItems: 2, items: { type: 'string', maxLength: 22 } },
          id: { type: 'string' },
        },
        if: { properties: { tip: { const: 'desen' } } },
        then: { properties: { id: true }, required: ['id'] },
      },
    },
  },
};

test('caleJson', () => {
  assert.equal(caleJson('/scene/2/titlu/1'), 'scene[2].titlu[1]');
  assert.equal(caleJson(''), '$');
  assert.equal(caleJson('/stil/culori/accent'), 'stil.culori.accent');
  assert.equal(caleJson('/a~1b/c~0d'), 'a/b.c~d');
});

test('locPentruOm', () => {
  assert.equal(locPentruOm('scene[2].titlu[1]'), 'Scena 3, titlu, rândul 2');
  assert.equal(locPentruOm('scene[0].sigla'), 'Scena 1, sigla');
  assert.equal(locPentruOm('scene[1].cuvinte[0]'), 'Scena 2, cuvinte, cuvântul 1');
  assert.equal(locPentruOm('stil.culori.accent'), 'Stil, culori, accent');
  assert.equal(locPentruOm('$'), 'Fișierul date.json');
});

test('maparea: additionalProperties, required, const pe versiune_schema, restul', () => {
  const erori = valideazaPeSchema(SCHEMA_MICA, {
    versiune_schema: 2,
    durata: 75,
    titlu: 'nu există la nivel video',
    scene: [{ tip: 'card', titlu: ['un rând mult prea lung pentru plafon'] }, { tip: 'desen' }],
  });
  const pe = Object.fromEntries(erori.map((e) => [e.camp, e.cod]));
  assert.deepEqual(pe, {
    titlu: 'camp-necunoscut',
    versiune_schema: 'versiune-schema',
    durata: 'valoare-invalida',
    'scene[0].titlu[0]': 'valoare-invalida',
    'scene[1].id': 'camp-lipsa',
  });
  const durata = erori.find((e) => e.camp === 'durata');
  assert.equal(durata.mesaj, 'Durata: durata trece de 60 de secunde.');
  for (const e of erori) {
    assert.ok(e.mesaj.length > 0 && e.sugestie.length > 0, e.cod);
    assert.doesNotMatch(e.mesaj + e.sugestie, /[\u2013\u2014\u015F\u0163\u015E\u0162]/);
  }
});

test('o singură eroare pe câmp și nicio eroare a lui „if”', () => {
  const erori = valideazaPeSchema(SCHEMA_MICA, { versiune_schema: 1, durata: 'x', scene: [{ tip: 'desen' }] });
  assert.deepEqual(
    erori.map((e) => [e.cod, e.camp]),
    [
      ['valoare-invalida', 'durata'],
      ['camp-lipsa', 'scene[0].id'],
    ],
  );
});

test('date valide: nicio eroare; compilarea se refolosește', () => {
  const valideaza = compileazaSchema(SCHEMA_MICA);
  assert.deepEqual(valideaza({ versiune_schema: 1, durata: 20, scene: [{ tip: 'card' }] }), []);
  assert.deepEqual(valideazaPeSchema(SCHEMA_MICA, { versiune_schema: 1, durata: 20, scene: [{ tip: 'desen', id: 'od-x' }] }), []);
});

test('modul strict respinge un cuvânt cheie necunoscut, dar acceptă x-mesaj', () => {
  assert.throws(() => compileazaSchema({ type: 'object', 'x-altceva': true }), /unknown keyword/);
  assert.doesNotThrow(() => compileazaSchema({ type: 'string', 'x-mesaj': { type: 'trebuie text.' } }));
});

test('șablonul de probă: minimul trece, proba-camp-necunoscut dă exact o eroare pe scene[0].sigla', () => {
  const schema = citeste('teste', 'fixtures', 'sabloane', 'proba', 'schema.json');
  assert.deepEqual(valideazaPeSchema(schema, citeste('teste', 'fixtures', 'date', 'proba-minim.json')), []);
  const erori = valideazaPeSchema(schema, citeste('teste', 'fixtures', 'date', 'proba-camp-necunoscut.json'));
  assert.equal(erori.length, 1);
  assert.equal(erori[0].cod, 'camp-necunoscut');
  assert.equal(erori[0].camp, 'scene[0].sigla');
  assert.match(erori[0].mesaj, /^Scena 1, sigla: /);
  assert.match(erori[0].sugestie, /scene\[0\]\.sigla/);
});

test('nucleu/package.json: versiuni exacte, module ES, Node 22+', () => {
  const pachet = citeste('nucleu', 'package.json');
  assert.equal(pachet.type, 'module');
  assert.equal(pachet.engines.node, '>=22');
  assert.deepEqual(pachet.dependencies, {
    ajv: '8.20.0',
    'ffmpeg-static': '5.3.0',
    'ffprobe-static': '3.1.0',
    fontkit: '2.0.4',
    yaml: '2.9.1',
  });
  for (const [nume, versiune] of Object.entries({ ...pachet.dependencies, ...(pachet.devDependencies ?? {}) })) {
    assert.doesNotMatch(versiune, /^[\^~]/, `${nume} are interval de versiuni: ${versiune}`);
  }
  assert.equal(pachet.devDependencies, undefined);
});

test('nucleu/package-lock.json fixează exact versiunile din package.json', () => {
  const lock = citeste('nucleu', 'package-lock.json');
  const pachet = citeste('nucleu', 'package.json');
  for (const [nume, versiune] of Object.entries(pachet.dependencies)) {
    assert.equal(lock.packages[`node_modules/${nume}`]?.version, versiune, nume);
  }
});

test('textul generic e în română, cu limita interpolată, fără mesajul ajv', () => {
  const erori = valideazaPeSchema(SCHEMA_MICA, {
    versiune_schema: 1,
    durata: 20,
    scene: [{ tip: 'card', titlu: ['un rând mult prea lung pentru plafon'] }],
  });
  const e = erori.find((x) => x.camp === 'scene[0].titlu[0]');
  assert.equal(e.mesaj, 'Scena 1, titlu, rândul 1: textul trebuie să aibă cel mult 22 de caractere.');
  assert.doesNotMatch(e.mesaj, /must|should|maxLength|NOT/);
});

test('rezervele pe cuvinte cheie nu conțin engleză și interpolează parametrii', () => {
  const schema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: {
      t: { type: 'string' },
      e: { enum: ['a', 'b'] },
      c: { const: 3 },
      mn: { type: 'number', minimum: 5 },
      mx: { type: 'number', maximum: 5 },
      emn: { type: 'number', exclusiveMinimum: 5 },
      emx: { type: 'number', exclusiveMaximum: 5 },
      minl: { type: 'string', minLength: 1 },
      maxl: { type: 'string', maxLength: 3 },
      mini: { type: 'array', minItems: 1 },
      maxi: { type: 'array', maxItems: 2 },
      p: { type: 'string', pattern: '^[a-z]+$' },
      m: { type: 'number', multipleOf: 5 },
      u: { type: 'array', uniqueItems: true },
    },
  };
  const erori = compileazaSchema(schema)({
    t: 1, e: 'z', c: 4, mn: 1, mx: 9, emn: 5, emx: 5, minl: '', maxl: 'abcd',
    mini: [], maxi: [1, 2, 3], p: 'A1', m: 7, u: [1, 1],
  });
  assert.equal(erori.length, 14);
  for (const e of erori) {
    assert.doesNotMatch(e.mesaj + e.sugestie, /\b(must|should|have|NOT|than)\b/, e.camp);
    assert.doesNotMatch(e.mesaj, /\b(minimum|maximum|minLength|maxLength|minItems|maxItems|multipleOf|uniqueItems)\b/, e.camp);
  }
  const mesaj = (c) => erori.find((e) => e.camp === c).mesaj;
  assert.match(mesaj('e'), /una dintre valorile: a, b\./);
  assert.match(mesaj('mini'), /cel puțin 1 element\./);
  assert.match(mesaj('maxi'), /cel mult 2 elemente\./);
  assert.match(mesaj('minl'), /cel puțin 1 caracter\./);
  assert.match(mesaj('mn'), /cel puțin 5/);
  assert.match(mesaj('m'), /multiplu de 5/);
});

test('un cuvânt cheie fără text propriu primește rezerva românească neutră', () => {
  const erori = compileazaSchema({ type: 'object', properties: { a: { not: { type: 'string' } } } })({ a: 'x' });
  assert.equal(erori.length, 1);
  assert.equal(erori[0].mesaj, 'A: valoarea nu respectă o regulă din schema șablonului.');
  assert.doesNotMatch(erori[0].mesaj, /not|must/i);
});

test('x-mesaj are prioritate față de textul generic', () => {
  const erori = compileazaSchema({ type: 'object', properties: { a: { type: 'string', maxLength: 2, 'x-mesaj': { maxLength: 'prea lung.' } } } })({ a: 'abc' });
  assert.equal(erori[0].mesaj, 'A: prea lung.');
});
