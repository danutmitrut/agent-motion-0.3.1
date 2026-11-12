// F9: x-mesaj se ia din nodul de schemă al erorii și când ajv nu inline-ază o $ref
// (o definiție care are la rândul ei $ref-uri se compilează separat, cu schemaPath relativ la definiție).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileazaSchema } from '../../nucleu/lib/schema.mjs';

/** Forma din schema reelului (planul B): scene → scena → scenaDesen → titlu, stil → hex. */
const SCHEMA_CU_REF_IMBRICAT = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  required: ['sablon', 'versiune_schema', 'scene'],
  'x-mesaj': {
    additionalProperties: 'Câmpul nu există în reel (mesajul rădăcinii).',
    required: 'Lipsește un câmp obligatoriu: sablon, versiune_schema sau scene.',
  },
  properties: {
    sablon: { const: 'reel' },
    versiune_schema: { const: 1 },
    stil: { $ref: '#/$defs/stil' },
    scene: { type: 'array', minItems: 1, items: { $ref: '#/$defs/scena' } },
  },
  $defs: {
    hex: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$', 'x-mesaj': { pattern: 'Culoarea e hex #RRGGBB.' } },
    titlu: {
      type: 'array',
      maxItems: 2,
      items: { type: 'string' },
      'x-mesaj': { maxItems: 'Titlul are cel mult 2 rânduri.' },
    },
    cuvinte: { type: 'array', items: { type: 'string' } },
    desen: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
    stil: {
      type: 'object',
      additionalProperties: false,
      'x-mesaj': { additionalProperties: 'Câmpul nu există în stil la reel.' },
      properties: {
        culori: {
          type: 'object',
          additionalProperties: false,
          properties: { fundal: { $ref: '#/$defs/hex' }, accent: { $ref: '#/$defs/hex' } },
        },
      },
    },
    scena: {
      type: 'object',
      required: ['tip'],
      'x-mesaj': { required: 'Fiecare scenă are un tip: desen sau card.' },
      properties: { tip: { enum: ['desen', 'card'] } },
      allOf: [
        {
          if: { type: 'object', properties: { tip: { const: 'desen' } }, required: ['tip'] },
          then: { $ref: '#/$defs/scenaDesen' },
        },
      ],
    },
    scenaDesen: {
      type: 'object',
      additionalProperties: false,
      required: ['tip', 'desen'],
      not: { type: 'object', properties: { titlu: true, cuvinte: true }, required: ['titlu', 'cuvinte'] },
      'x-mesaj': {
        additionalProperties: 'Câmpul nu există la o scenă de tip desen.',
        required: 'Scena de tip desen are nevoie de desen.id.',
        not: 'Scena are și titlu, și cuvinte; păstrează doar unul.',
      },
      properties: {
        tip: { const: 'desen' },
        titlu: { $ref: '#/$defs/titlu' },
        cuvinte: { $ref: '#/$defs/cuvinte' },
        desen: { $ref: '#/$defs/desen' },
      },
    },
  },
};

const BAZA = { sablon: 'reel', versiune_schema: 1 };
const valideaza = compileazaSchema(SCHEMA_CU_REF_IMBRICAT);
const eroarePe = (erori, camp) => erori.find((e) => e.camp === camp);

test('F9: required din definiția interioară (scenaDesen) are mesajul ei, nu pe al rădăcinii', () => {
  const e = eroarePe(valideaza({ ...BAZA, scene: [{ tip: 'desen' }] }), 'scene[0].desen');
  assert.ok(e, 'lipsește eroarea pe scene[0].desen');
  assert.equal(e.cod, 'camp-lipsa');
  assert.equal(e.mesaj, 'Scena 1, desen: Scena de tip desen are nevoie de desen.id.');
});

test('F9: additionalProperties din definiția interioară are mesajul ei', () => {
  const e = eroarePe(valideaza({ ...BAZA, scene: [{ tip: 'desen', desen: { id: 'a' }, sigla: 'x' }] }), 'scene[0].sigla');
  assert.ok(e, 'lipsește eroarea pe scene[0].sigla');
  assert.equal(e.cod, 'camp-necunoscut');
  assert.equal(e.mesaj, 'Scena 1, sigla: Câmpul nu există la o scenă de tip desen.');
});

test('F9: not din definiția interioară are mesajul ei, nu textul generic', () => {
  const erori = valideaza({ ...BAZA, scene: [{ tip: 'desen', desen: { id: 'a' }, titlu: ['x'], cuvinte: ['y'] }] });
  const e = eroarePe(erori, 'scene[0]');
  assert.ok(e, 'lipsește eroarea pe scene[0]');
  assert.equal(e.cod, 'valoare-invalida');
  assert.equal(e.mesaj, 'Scena 1: Scena are și titlu, și cuvinte; păstrează doar unul.');
});

test('F9: required din definiția cu $ref-uri (scena fără tip) are mesajul definiției', () => {
  const e = eroarePe(valideaza({ ...BAZA, scene: [{}] }), 'scene[0].tip');
  assert.ok(e, 'lipsește eroarea pe scene[0].tip');
  assert.equal(e.mesaj, 'Scena 1, tip: Fiecare scenă are un tip: desen sau card.');
});

test('F9: câmp în plus în stil (stil trimite la hex) are mesajul lui stil', () => {
  const e = eroarePe(valideaza({ ...BAZA, scene: [{ tip: 'card' }], stil: { sigla: 'x' } }), 'stil.sigla');
  assert.ok(e, 'lipsește eroarea pe stil.sigla');
  assert.equal(e.mesaj, 'Stil, sigla: Câmpul nu există în stil la reel.');
});

test('F9: referințele inline-ate (titlu, hex) și rădăcina își păstrează mesajele', () => {
  const erori = valideaza({
    versiune_schema: 1,
    extra: 1,
    scene: [{ tip: 'desen', desen: { id: 'a' }, titlu: ['a', 'b', 'c'] }],
    stil: { culori: { accent: 'rosu' } },
  });
  assert.equal(eroarePe(erori, 'sablon').mesaj, 'Sablon: Lipsește un câmp obligatoriu: sablon, versiune_schema sau scene.');
  assert.equal(eroarePe(erori, 'extra').mesaj, 'Extra: Câmpul nu există în reel (mesajul rădăcinii).');
  assert.equal(eroarePe(erori, 'scene[0].titlu').mesaj, 'Scena 1, titlu: Titlul are cel mult 2 rânduri.');
  assert.equal(eroarePe(erori, 'stil.culori.accent').mesaj, 'Stil, culori, accent: Culoarea e hex #RRGGBB.');
});
