// Validarea pe schema.json a șablonului (C02), cu mesaje în română.
import Ajv2020 from 'ajv/dist/2020.js';
import { eroare } from './erori.mjs';

/** Cache: schema (obiect) → funcția de validare compilată. */
const compilate = new WeakMap();

/** Cuvintele cheie care doar raportează eșecul ramurilor lor; ramurile dau deja erorile utile. */
const FARA_EROARE_PROPRIE = new Set(['if']);

/** Cum se numesc elementele unei liste în mesajele pentru oameni. */
const ELEMENTE = Object.freeze({ titlu: 'rândul', cuvinte: 'cuvântul', noduri: 'nodul', iconite: 'iconița' });

/**
 * '/scene/2/titlu/1' → 'scene[2].titlu[1]'; '' → '$'.
 * @param {string} instancePath
 * @returns {string}
 */
export function caleJson(instancePath) {
  if (!instancePath) return '$';
  const bucati = instancePath
    .split('/')
    .slice(1)
    .map((b) => b.replace(/~1/g, '/').replace(/~0/g, '~'));
  let cale = '';
  for (const b of bucati) {
    if (/^\d+$/.test(b)) cale += `[${b}]`;
    else cale += cale === '' ? b : `.${b}`;
  }
  return cale;
}

/**
 * 'scene[2].titlu[1]' → 'Scena 3, titlu, rândul 2' (numărare de la 1, pentru oameni).
 * @param {string} camp
 * @returns {string}
 */
export function locPentruOm(camp) {
  if (!camp || camp === '$') return 'Fișierul date.json';
  const parti = [];
  const re = /([^.[\]]+)|\[(\d+)\]/g;
  let ultimulNume = null;
  for (const m of camp.matchAll(re)) {
    if (m[1] !== undefined) {
      ultimulNume = m[1];
      if (m[1] !== 'scene') parti.push(m[1]);
      continue;
    }
    const n = Number(m[2]) + 1;
    if (ultimulNume === 'scene') parti.push(`Scena ${n}`);
    else parti.push(`${ELEMENTE[ultimulNume] ?? 'elementul'} ${n}`);
  }
  const text = parti.join(', ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Numărul cu substantivul potrivit: 1 caracter, 2 caractere, 22 de caractere. */
function numar(n, singular, plural) {
  if (n === 1) return `1 ${singular}`;
  const ultimele = Math.abs(n) % 100;
  const cuDe = ultimele === 0 || ultimele >= 20;
  return `${n} ${cuDe ? 'de ' : ''}${plural}`;
}

const TIPURI = Object.freeze({
  string: 'text',
  number: 'număr',
  integer: 'număr întreg',
  boolean: 'valoare da/nu',
  array: 'listă',
  object: 'obiect',
  null: 'valoare goală',
});

const listaValori = (v) => (Array.isArray(v) ? v : [v]).map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(', ');

/** Texte în română pe cuvânt cheie ajv, cu parametrii erorii interpolați (fără mesajul englezesc al ajv). */
const MESAJE_RO = Object.freeze({
  type: (p) => `valoarea trebuie să fie de tipul: ${[].concat(p.type).map((t) => TIPURI[t] ?? t).join(' sau ')}.`,
  enum: (p) => `valoarea trebuie să fie una dintre valorile: ${listaValori(p.allowedValues)}.`,
  const: (p) => `valoarea trebuie să fie exact ${listaValori(p.allowedValue)}.`,
  minimum: (p) => `valoarea trebuie să fie cel puțin ${p.limit}.`,
  maximum: (p) => `valoarea trebuie să fie cel mult ${p.limit}.`,
  exclusiveMinimum: (p) => `valoarea trebuie să fie strict mai mare decât ${p.limit}.`,
  exclusiveMaximum: (p) => `valoarea trebuie să fie strict mai mică decât ${p.limit}.`,
  minLength: (p) => `textul trebuie să aibă cel puțin ${numar(p.limit, 'caracter', 'caractere')}.`,
  maxLength: (p) => `textul trebuie să aibă cel mult ${numar(p.limit, 'caracter', 'caractere')}.`,
  minItems: (p) => `lista trebuie să aibă cel puțin ${numar(p.limit, 'element', 'elemente')}.`,
  maxItems: (p) => `lista trebuie să aibă cel mult ${numar(p.limit, 'element', 'elemente')}.`,
  pattern: (p) => `textul nu are forma cerută (model: ${p.pattern}).`,
  format: (p) => `textul nu are formatul cerut (${p.format}).`,
  multipleOf: (p) => `valoarea trebuie să fie multiplu de ${p.multipleOf}.`,
  uniqueItems: () => 'elementele listei trebuie să fie diferite între ele, fără dubluri.',
});

/** Textul generic, în română, pentru o eroare ajv fără x-mesaj. */
function mesajGeneric(e) {
  const f = MESAJE_RO[e.keyword];
  return f ? f(e.params ?? {}) : 'valoarea nu respectă o regulă din schema șablonului.';
}

/**
 * Traduce o eroare ajv în EroareMg. x-mesaj vine din nodul de schemă care conține cuvântul cheie al erorii
 * (e.parentSchema, cu verbose). schemaPath nu ajunge: pentru o $ref spre o definiție care are la rândul ei
 * $ref-uri, ajv compilează o funcție separată, iar schemaPath e relativ la definiție, nu la rădăcină (F9).
 * @param {import('ajv').ErrorObject} e
 */
function traduce(e) {
  const cale = caleJson(e.instancePath);
  const nod = e.parentSchema && typeof e.parentSchema === 'object' ? e.parentSchema : null;
  const dinSchema = nod && nod['x-mesaj'] && typeof nod['x-mesaj'] === 'object' ? nod['x-mesaj'][e.keyword] : undefined;

  if (e.keyword === 'additionalProperties') {
    const prop = e.params.additionalProperty;
    const camp = cale === '$' ? prop : `${cale}.${prop}`;
    return eroare(
      'camp-necunoscut',
      camp,
      `${locPentruOm(camp)}: ${dinSchema ?? `câmpul „${prop}” nu există în acest șablon.`}`,
      `Șterge câmpul ${camp} din date.json sau mută informația într-un câmp care există în schemă.`,
    );
  }
  if (e.keyword === 'required') {
    const prop = e.params.missingProperty;
    const camp = cale === '$' ? prop : `${cale}.${prop}`;
    return eroare(
      'camp-lipsa',
      camp,
      `${locPentruOm(camp)}: ${dinSchema ?? `lipsește câmpul obligatoriu „${prop}”.`}`,
      `Adaugă câmpul ${camp} în date.json.`,
    );
  }
  if (e.keyword === 'const' && cale === 'versiune_schema') {
    return eroare(
      'versiune-schema',
      cale,
      `${locPentruOm(cale)}: ${dinSchema ?? `datele sunt scrise pentru altă versiune a schemei; șablonul instalat cere ${JSON.stringify(e.params.allowedValue)}.`}`,
      `Pune versiune_schema la ${JSON.stringify(e.params.allowedValue)} și verifică datele pe schema șablonului instalat.`,
    );
  }
  return eroare(
    'valoare-invalida',
    cale,
    `${locPentruOm(cale)}: ${dinSchema ?? mesajGeneric(e)}`,
    `Schimbă valoarea din ${cale} după regula din schemă.`,
  );
}

/**
 * Compilează o schemă JSON 2020-12 într-o funcție care întoarce EroareMg[].
 * @param {object} schema
 * @returns {(date: unknown) => import('./erori.mjs').EroareMg[]}
 */
export function compileazaSchema(schema) {
  // verbose: true doar adaugă pe erori schema, parentSchema și data (de aici x-mesaj); compilarea strictă rămâne aceeași.
  const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true, verbose: true });
  ajv.addKeyword('x-mesaj');
  const valideaza = ajv.compile(schema);
  return (date) => {
    if (valideaza(date)) return [];
    const vazute = new Set();
    const erori = [];
    for (const e of valideaza.errors) {
      if (FARA_EROARE_PROPRIE.has(e.keyword)) continue;
      const tradusa = traduce(e);
      if (vazute.has(tradusa.camp)) continue;
      vazute.add(tradusa.camp);
      erori.push(tradusa);
    }
    return erori;
  };
}

/**
 * Validează datele pe schemă; compilarea se face o dată pe obiectul schemei.
 * @param {object} schema
 * @param {unknown} date
 * @returns {import('./erori.mjs').EroareMg[]}
 */
export function valideazaPeSchema(schema, date) {
  let valideaza = compilate.get(schema);
  if (!valideaza) {
    valideaza = compileazaSchema(schema);
    compilate.set(schema, valideaza);
  }
  return valideaza(date);
}
