// Felia 4: câmpurile noi din fișa de brand (ceata, font_text, eticheta.prefix) și catalogul de desene al brandului
// (branduri/<nume>/catalog.json, doar trasee, doar pentru proiectele cu acel brand).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { rezolvaStil, valoriStil } from '../../nucleu/lib/teme.mjs';
import { citesteBrand } from '../../nucleu/lib/brand.mjs';
import { straturiCeata, puncteFundal } from '../../nucleu/lib/contrast.mjs';
import { incarcaCatalog, gasestePiesa, caleFisierPiesa } from '../../nucleu/lib/desen/catalog.mjs';
import { verificaDesene } from '../../nucleu/lib/desen/verifica.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';

const SABLON = {
  nume: 'reel-ilustrat',
  meta: { teme: ['noapte', 'hartie', 'curat'] },
  schema: { properties: { stil: { properties: { tema: { enum: ['noapte', 'hartie', 'curat'] } } } } },
  implicite: { jetoane: { linie: 'text' } },
};

const piesa = (id, extra = {}) => ({ id, tip: 'traseu', fisier: `desene/${id}.json`, cutie: { w: 100, h: 200 }, licenta: 'proprie', etichete: ['om'], ...extra });
const TRASEU = JSON.stringify({ w: 100, h: 200, paths: ['M0 0 L10 10'] });

function radacina(catalogB1 = { versiune: 1, piese: [piesa('b-om')] }) {
  return creeazaRadacinaTemp({
    copiaza: ['motoare/comun/teme', 'motoare/comun/fonturi', 'biblioteci/catalog.json'],
    fisiere: {
      'branduri/b1/vizual.md': [
        '---', 'mg: 1', 'tema: noapte', 'culori: {accent: "#E0905E"}',
        'font_text: {fisier: mono.woff2, familie: Mono Test}',
        'ceata:', '  sus: "#8060C0"', '  jos: {culoare: "#40A0A0", alfa: 0.2}',
        'eticheta: {prefix: "// "}', '---', '',
      ].join('\n'),
      'branduri/b1/catalog.json': JSON.stringify(catalogB1),
      'branduri/b1/desene/b-om.json': TRASEU,
      'branduri/b2/vizual.md': '---\nmg: 1\nceata: {sus: {culoare: "#FFFFFF", alfa: 0.9}}\n---\n',
      'branduri/b3/vizual.md': '---\nmg: 1\neticheta: {prefix: "<b>"}\n---\n',
    },
  });
}

test('fișa de brand citește ceata (șir sau {culoare, alfa}), font_text și eticheta.prefix', () => {
  const r = radacina();
  try {
    const b = citesteBrand(r.radacina, 'b1');
    assert.deepEqual(b.ceata, { sus: { culoare: '#8060C0' }, jos: { culoare: '#40A0A0', alfa: 0.2 } });
    assert.deepEqual(b.font_text, { fisier: 'branduri/b1/mono.woff2', familie: 'Mono Test' });
    assert.deepEqual(b.eticheta, { prefix: '// ' });
    assert.throws(() => citesteBrand(r.radacina, 'b2'), (e) => e.eroareMg.cod === 'brand-invalid' && /ceata\.sus\.alfa/.test(e.eroareMg.mesaj));
    assert.throws(() => citesteBrand(r.radacina, 'b3'), (e) => e.eroareMg.cod === 'brand-invalid' && /eticheta\.prefix/.test(e.eroareMg.mesaj));
  } finally {
    r.curata();
  }
});

test('rezolvaStil pune ceața, fontul de text și prefixul din brand; fără ele, stilul rămâne ca înainte', () => {
  const r = radacina();
  try {
    const brand = citesteBrand(r.radacina, 'b1');
    const { stil, erori } = rezolvaStil({ radacina: r.radacina, sablon: SABLON, date: { brand: 'b1' }, brand });
    assert.deepEqual(erori, []);
    assert.equal(stil.ceata.sursa, 'brand');
    assert.equal(stil.font_text.sursa, 'brand');
    assert.equal(stil.eticheta.valoare.prefix, '// ');
    assert.equal(stil.eticheta.sursa, 'brand');
    const faraBrand = rezolvaStil({ radacina: r.radacina, sablon: SABLON, date: {}, brand: null }).stil;
    assert.equal('ceata' in faraBrand, false);
    assert.equal(faraBrand.font_text.sursa, 'tema');
  } finally {
    r.curata();
  }
});

test('straturiCeata: fără brand, accentul și linia cu alfa șablonului; cu brand, culorile și alfa brandului', () => {
  const culori = { fundal: '#0E0F13', text: '#F2EFEA', accent: '#FF7A59', linie: '#F2EFEA' };
  assert.deepEqual(straturiCeata(culori), [
    { culoare: '#FF7A59', alfa: 0.3, jeton: 'accent' },
    { culoare: '#F2EFEA', alfa: 0.14, jeton: 'linie' },
  ]);
  const ceata = { sus: { culoare: '#8060C0' }, jos: { culoare: '#40A0A0', alfa: 0.2 } };
  assert.deepEqual(straturiCeata(culori, ceata), [
    { culoare: '#8060C0', alfa: 0.3, jeton: 'ceata.sus' },
    { culoare: '#40A0A0', alfa: 0.2, jeton: 'ceata.jos' },
  ]);
  assert.notDeepEqual(puncteFundal(culori, 'ceata', { ceata }), puncteFundal(culori, 'ceata'));
});

test('piesele brandului intră în catalog doar cu brandul, din branduri/<nume>/', () => {
  const r = radacina();
  try {
    assert.equal(gasestePiesa(incarcaCatalog(r.radacina), 'b-om'), null);
    assert.equal(gasestePiesa(incarcaCatalog(r.radacina, 'b2'), 'b-om'), null);
    const p = gasestePiesa(incarcaCatalog(r.radacina, 'b1'), 'b-om');
    assert.equal(p.brand, 'b1');
    assert.equal(p.familie, 'traseu');
    assert.equal(caleFisierPiesa(r.radacina, p), path.join(r.radacina, 'branduri', 'b1', 'desene', 'b-om.json'));
  } finally {
    r.curata();
  }
});

test('catalogul brandului refuză id fără b-, alt tip decât traseu, fișier în afara desene/ și piesa fără licență', () => {
  const cazuri = [
    [piesa('om'), /b-/],
    [piesa('b-om', { tip: 'forma' }), /doar trasee/],
    [piesa('b-om', { fisier: '../x.json' }), /desene\/<nume>\.json/],
    [piesa('b-om', { licenta: '' }), /licenta/],
  ];
  for (const [p, mesaj] of cazuri) {
    const r = radacina({ versiune: 1, piese: [p] });
    try {
      assert.throws(() => incarcaCatalog(r.radacina, 'b1'), (e) => e.eroareMg.cod === 'json-invalid' && mesaj.test(e.eroareMg.mesaj), JSON.stringify(p));
    } finally {
      r.curata();
    }
  }
});

test('verificaDesene primește traseul brandului, dar refuză un traseu care nu vine din brand', () => {
  const r = radacina();
  try {
    const date = { brand: 'b1', scene: [{ tip: 'desen', desen: { id: 'b-om' } }] };
    assert.deepEqual(verificaDesene(date, incarcaCatalog(r.radacina, 'b1'), r.radacina).erori, []);
    const catalog = incarcaCatalog(r.radacina);
    catalog.piese.push({ ...piesa('b-strain'), proprie: true });
    const { erori } = verificaDesene({ scene: [{ tip: 'desen', desen: { id: 'b-strain' } }] }, catalog, r.radacina);
    assert.deepEqual(erori.map((e) => [e.cod, e.camp]), [['valoare-invalida', 'scene[0].desen.id']]);
  } finally {
    r.curata();
  }
});

test('valoriStil păstrează ceața brandului pentru șabloane', () => {
  const r = radacina();
  try {
    const brand = citesteBrand(r.radacina, 'b1');
    const plat = valoriStil(rezolvaStil({ radacina: r.radacina, sablon: SABLON, date: { brand: 'b1' }, brand }).stil);
    assert.deepEqual(plat.ceata, brand.ceata);
  } finally {
    r.curata();
  }
});
