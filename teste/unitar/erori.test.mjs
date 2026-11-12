import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COD_IESIRE, CODURI, eroare, avertisment, EroareFatala, formateazaPentruOm, verificareaErorii,
} from '../../nucleu/lib/erori.mjs';

const RADACINA = fileURLToPath(new URL('../../', import.meta.url));
const RAND_COD = /^\| `([a-z0-9-]+)` \| (eroare|avertisment) \| (C\d\d|S\d\d|-) \| (.+) \|$/;

/** Codurile din tabelul secțiunii „## Lista codurilor” din docs/interfete/erori.md. */
function coduriDinDocument() {
  const text = readFileSync(join(RADACINA, 'docs/interfete/erori.md'), 'utf8');
  const inceput = text.indexOf('\n## Lista codurilor\n');
  assert.notEqual(inceput, -1, 'lipsește secțiunea „## Lista codurilor”');
  const dupa = text.slice(inceput + 1);
  const sfarsit = dupa.indexOf('\n## ', 1);
  const sectiune = sfarsit === -1 ? dupa : dupa.slice(0, sfarsit);
  const coduri = {};
  for (const linie of sectiune.split('\n')) {
    if (!linie.startsWith('| `')) continue;
    const m = RAND_COD.exec(linie);
    assert.ok(m, `rând de tabel cu formă greșită: ${linie}`);
    assert.equal(Object.hasOwn(coduri, m[1]), false, `cod dublat în document: ${m[1]}`);
    coduri[m[1]] = { nivel: m[2], verificare: m[3] === '-' ? null : m[3] };
  }
  return coduri;
}

test('COD_IESIRE are valorile din spec', () => {
  assert.deepEqual({ ...COD_IESIRE }, { OK: 0, DATE: 1, MEDIU: 2, UTILIZARE: 3 });
  assert.ok(Object.isFrozen(COD_IESIRE));
});

test('lista din erori.md și CODURI sunt identice (cod, nivel, verificare)', () => {
  const dinCod = {};
  for (const [cod, { nivel, verificare }] of Object.entries(CODURI)) dinCod[cod] = { nivel, verificare };
  assert.deepEqual(coduriDinDocument(), dinCod);
});

test('CODURI e înghețat și fiecare intrare are forma cerută', () => {
  assert.ok(Object.isFrozen(CODURI));
  for (const [cod, intrare] of Object.entries(CODURI)) {
    assert.match(cod, /^[a-z0-9]+(-[a-z0-9]+)*$/, cod);
    assert.ok(Object.isFrozen(intrare), cod);
    assert.deepEqual(Object.keys(intrare).sort(), ['descriere', 'nivel', 'verificare'], cod);
    assert.ok(['eroare', 'avertisment'].includes(intrare.nivel), cod);
    assert.ok(intrare.verificare === null || /^(C(0[1-9]|1[0-7])|S(0[1-9]|1[0-2]))$/.test(intrare.verificare), cod);
    assert.ok(intrare.descriere.trim().length > 0, cod);
  }
});

test('codurile comune din spec 6.12 există toate', () => {
  for (const cod of ['camp-necunoscut', 'rand-nu-incape', 'glifa-lipsa', 'contrast-slab', 'stil-contrazice-brand',
    'text-cu-cod', 'sedila', 'accent-neinchis', 'prea-repede-de-citit', 'resursa-lipsa', 'aprobare-invalida']) {
    assert.ok(Object.hasOwn(CODURI, cod), cod);
  }
});

test('codurile proprii ale lui reel-ilustrat sunt fixate de la pasul 0 (spec 7.1)', () => {
  const asteptate = {
    'reel-ilustrat-scene-durate': 'S01', 'reel-ilustrat-persistenta': 'S02', 'reel-ilustrat-carduri-suprapuse': 'S03',
    'reel-ilustrat-iconite-retea': 'S04', 'reel-ilustrat-desen-dupa-retea': 'S05', 'reel-ilustrat-fereastra-scenei': 'S06',
    'reel-ilustrat-semnatura': 'S07', 'reel-ilustrat-cutie-desen': 'S08', 'reel-ilustrat-aglomerare': 'S09',
    'reel-ilustrat-accent': 'S11', 'reel-ilustrat-ajustare': 'S12',
  };
  for (const [cod, verificare] of Object.entries(asteptate)) {
    assert.ok(Object.hasOwn(CODURI, cod), cod);
    assert.equal(CODURI[cod].verificare, verificare, cod);
    assert.equal(CODURI[cod].nivel, cod === 'reel-ilustrat-ajustare' ? 'avertisment' : 'eroare', cod);
  }
  const proprii = Object.keys(CODURI).filter((cod) => cod.startsWith('reel-ilustrat-'));
  assert.deepEqual(proprii.sort(), Object.keys(asteptate).sort());
});

test('eroare() și avertisment() întorc forma comună, cu cheile în ordine', () => {
  const e = eroare('camp-necunoscut', 'scene[0].sigla', 'Scena 1 are câmpul sigla, care nu există.', 'Șterge scene[0].sigla.');
  assert.deepEqual(e, { cod: 'camp-necunoscut', camp: 'scene[0].sigla', mesaj: 'Scena 1 are câmpul sigla, care nu există.', sugestie: 'Șterge scene[0].sigla.' });
  assert.deepEqual(Object.keys(e), ['cod', 'camp', 'mesaj', 'sugestie']);
  const a = avertisment('cale-onedrive', 'mediu.cale', 'Agentul stă în OneDrive.', 'Mută folderul în C:\\agent-motion.');
  assert.equal(a.cod, 'cale-onedrive');
  assert.deepEqual(Object.keys(a), ['cod', 'camp', 'mesaj', 'sugestie']);
});

test('eroare() aruncă TypeError la cod necunoscut sau câmp gol', () => {
  assert.throws(() => eroare('cod-inexistent', 'x', 'm', 's'), TypeError);
  assert.throws(() => eroare(undefined, 'x', 'm', 's'), TypeError);
  assert.throws(() => eroare('toString', 'x', 'm', 's'), TypeError);
  assert.throws(() => eroare('json-invalid', '', 'm', 's'), TypeError);
  assert.throws(() => eroare('json-invalid', 'fisier:date.json', '   ', 's'), TypeError);
  assert.throws(() => eroare('json-invalid', 'fisier:date.json', 'm', undefined), TypeError);
  assert.throws(() => avertisment('cod-inexistent', 'x', 'm', 's'), TypeError);
  assert.throws(() => avertisment('cale-lunga', 'mediu.cale', '', 's'), TypeError);
});

test('EroareFatala păstrează eroarea și codul de ieșire', () => {
  const e = eroare('sablon-necunoscut', 'argumente.sablon', 'Șablonul „x” nu există.', 'Alege un șablon din lista lui mg nou --help.');
  const f = new EroareFatala(e, COD_IESIRE.UTILIZARE);
  assert.ok(f instanceof Error);
  assert.equal(f.name, 'EroareFatala');
  assert.equal(f.message, e.mesaj);
  assert.equal(f.eroareMg, e);
  assert.equal(f.codIesire, 3);
  assert.equal(new EroareFatala(e).codIesire, COD_IESIRE.MEDIU);
  assert.throws(() => new EroareFatala({ cod: 'cod-inexistent' }), TypeError);
  assert.throws(() => new EroareFatala(e, 0), TypeError);
  assert.throws(() => new EroareFatala(e, 7), TypeError);
});

test('formateazaPentruOm: antetele și câte o linie JSON validă pe eroare', () => {
  const erori = [
    eroare('camp-lipsa', 'scene[0].tip', 'Scena 1 nu are tip.', 'Adaugă scene[0].tip.'),
    eroare('json-invalid', 'fisier:video/p/date.json', 'JSON invalid la linia 3, coloana 5.', 'Repară virgula de la linia 3.'),
  ];
  const avertismente = [avertisment('cale-lunga', 'mediu.cale', 'Calea are 230 de caractere.', 'Mută agentul în C:\\agent-motion.')];
  const text = formateazaPentruOm(erori, avertismente);
  assert.ok(text.endsWith('\n'));
  const linii = text.slice(0, -1).split('\n');
  assert.equal(linii.length, 5);
  assert.equal(linii[0], 'Erori (2):');
  assert.deepEqual(JSON.parse(linii[1]), erori[0]);
  assert.deepEqual(JSON.parse(linii[2]), erori[1]);
  assert.equal(linii[3], 'Avertismente (1):');
  assert.deepEqual(JSON.parse(linii[4]), avertismente[0]);
  assert.equal(formateazaPentruOm([], []), '');
  assert.equal(formateazaPentruOm(erori, []).split('\n')[0], 'Erori (2):');
  assert.equal(formateazaPentruOm([], avertismente).split('\n')[0], 'Avertismente (1):');
});

test('erori.mjs importă doar module native', () => {
  const sursa = readFileSync(join(RADACINA, 'nucleu/lib/erori.mjs'), 'utf8');
  const importuri = [...sursa.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  assert.deepEqual(importuri.filter((s) => !s.startsWith('node:')), []);
});

test('M3: eroare cu { verificare } păstrează câmpul; fără opțiune, forma rămâne cea veche', () => {
  const e = eroare('prea-repede-de-citit', 'randuri[0]', 'Mesaj.', 'Sugestie.', { verificare: 'S02' });
  assert.deepEqual(e, { cod: 'prea-repede-de-citit', camp: 'randuri[0]', mesaj: 'Mesaj.', sugestie: 'Sugestie.', verificare: 'S02' });
  assert.deepEqual(Object.keys(eroare('sedila', 'x', 'm', 's')), ['cod', 'camp', 'mesaj', 'sugestie']);
  assert.equal(avertisment('fara-diacritice', 'x', 'm', 's', { verificare: 'S13' }).verificare, 'S13');
});

test('M3: o verificare invalidă în opțiuni aruncă TypeError', () => {
  for (const v of ['S00', 'C18', 'X01', 'S100', '', 7]) {
    assert.throws(() => eroare('sedila', 'x', 'm', 's', { verificare: v }), TypeError, String(v));
  }
});

test('M3: verificareaErorii preferă câmpul erorii, apoi CODURI, apoi null', () => {
  assert.equal(verificareaErorii({ cod: 'prea-repede-de-citit', verificare: 'S02' }), 'S02');
  assert.equal(verificareaErorii({ cod: 'prea-repede-de-citit' }), 'C09');
  assert.equal(verificareaErorii({ cod: 'cronologie-invalida' }), null);
});
