import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { incarcaCatalog, gasestePiesa } from '../../nucleu/lib/desen/catalog.mjs';
import { normalizeazaCautare, cauta, listeaza } from '../../nucleu/lib/desen/cauta.mjs';
import { comandaDesen } from '../../nucleu/lib/desen/index.mjs';
import { principal } from '../../nucleu/mg.mjs';
import { EroareFatala } from '../../nucleu/lib/erori.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';

let temp;
let catalog;

const PIESA_PROPRIE = {
  id: 'p-logo-client', tip: 'forma', familie: 'proprie', sursa: 'proprie', original: 'originale/logo.svg',
  fisier: 'forme/p-logo-client.svg', sha256: '0'.repeat(64), kb: 1, cutie: { w: 100, h: 100 },
  roluri: ['ink'], recolorabil: true, licenta: 'desenul meu',
  etichete: ['logo', 'client', 'firmă', 'siglă'], descriere: 'Sigla clientului.',
};

before(() => {
  temp = creeazaRadacinaTemp({
    biblioteciMini: true,
    fisiere: { 'proprii/catalog-propriu.json': JSON.stringify({ versiune: 1, piese: [PIESA_PROPRIE] }, null, 2) + '\n' },
  });
  catalog = incarcaCatalog(temp.radacina);
});

after(() => temp?.curata());

test('normalizeazaCautare scoate diacriticele, majusculele și punctuația', () => {
  assert.equal(normalizeazaCautare('Copleșit, LAPTOP!'), 'coplesit laptop');
  assert.equal(normalizeazaCautare('ȘTIRI în  țară'), 'stiri in tara');
  assert.equal(normalizeazaCautare('cop\u{15F}it'), 'copsit');
  assert.equal(normalizeazaCautare('calendar-x'), 'calendar x');
});

test('incarcaCatalog citește biblioteca, apoi piesele proprii marcate', () => {
  assert.equal(catalog.piese.length, 10);
  assert.equal(gasestePiesa(catalog, 'op-bust-laptop').proprie, false);
  assert.equal(gasestePiesa(catalog, 'p-logo-client').proprie, true);
  assert.equal(gasestePiesa(catalog, 'nu-exista'), null);
  assert.deepEqual(catalog.sinonime['plictiseală'], ['obosit', 'epuizat', 'plictisit']);
});

test('incarcaCatalog fără biblioteci/catalog.json aruncă EroareFatala', () => {
  const gol = creeazaRadacinaTemp();
  try {
    assert.throws(() => incarcaCatalog(gol.radacina), (e) => e instanceof EroareFatala && e.eroareMg.camp === 'fisier:biblioteci/catalog.json');
  } finally {
    gol.curata();
  }
});

test('cauta("plictiseala") găsește op-bust-telefon prin normalizare', () => {
  const r = cauta(catalog, 'plictiseala', {});
  assert.equal(r[0].piesa.id, 'op-bust-telefon');
  assert.equal(r[0].scor, 3);
  assert.match(r[0].motiv, /eticheta „plictiseală”/);
});

test('cauta("obosit") găsește op-bust-telefon prin sinonime', () => {
  const r = cauta(catalog, 'obosit', {});
  assert.equal(r[0].piesa.id, 'op-bust-telefon');
  assert.equal(r[0].scor, 2);
  assert.match(r[0].motiv, /sinonim pentru „plictiseală”/);
});

test('cauta("coffee") găsește op-bust-cafea prin sinonime, iar prefixul dă 2 puncte', () => {
  assert.equal(cauta(catalog, 'coffee', {})[0].piesa.id, 'op-bust-cafea');
  const prefix = cauta(catalog, 'medit', {});
  assert.equal(prefix[0].piesa.id, 'od-meditating');
  assert.equal(prefix[0].scor, 2);
});

test('scorurile se adună pe cuvinte, iar rezultatele sunt cel mult 5, sortate', () => {
  const r = cauta(catalog, 'plictiseală, telefon', {});
  assert.equal(r[0].piesa.id, 'op-bust-telefon');
  assert.equal(r[0].scor, 6);
  const multe = cauta(catalog, 'pauza calm liniste respiratie meditatie cafea', {});
  assert.ok(multe.length <= 5);
  for (let i = 1; i < multe.length; i += 1) assert.ok(multe[i - 1].scor >= multe[i].scor);
  assert.deepEqual(cauta(catalog, '   ', {}), []);
});

test('pe tema noapte, o piesă evita nu apare fără includeEvita', () => {
  assert.equal(cauta(catalog, 'arata', { tema: 'noapte' }).some((r) => r.piesa.id === 'op-picioare-arata'), false);
  assert.equal(cauta(catalog, 'arata', { tema: 'noapte', includeEvita: true })[0].piesa.id, 'op-picioare-arata');
  assert.equal(cauta(catalog, 'arata', { tema: 'hartie' })[0].piesa.id, 'op-picioare-arata');
  const ids = listeaza(catalog, { tema: 'noapte' }).map((p) => p.id);
  assert.ok(!ids.includes('op-picioare-arata'));
  assert.ok(ids.includes('od-meditating'), 'autocolant rămâne în ofertă');
  assert.ok(listeaza(catalog, { tema: 'noapte', includeEvita: true }).some((p) => p.id === 'op-picioare-arata'));
});

test('listeaza filtrează după tip și familie și întoarce forma scurtă', () => {
  const forme = listeaza(catalog, { familie: 'cerneala' });
  assert.deepEqual(forme.map((p) => p.id), ['od-chilling', 'od-meditating', 'od-running', 'od-strolling', 'op-bust-cafea', 'op-bust-laptop', 'op-bust-telefon', 'op-picioare-arata', 'op-picioare-explica-ochelari']);
  assert.deepEqual(forme[5], {
    id: 'op-bust-laptop', tip: 'forma', familie: 'cerneala', noapte: 'autocolant',
    etichete: ['laptop', 'calculator', 'lucru'], proprie: false,
  });
  assert.equal(listeaza(catalog, { tip: 'traseu' }).length, 0);
  assert.deepEqual(listeaza(catalog, { familie: 'proprie' }).map((p) => [p.id, p.proprie, p.noapte]), [['p-logo-client', true, null]]);
});

test('filtrul personaj (spec 8.9) la lista și la cauta', async () => {
  assert.deepEqual(listeaza(catalog, { personaj: 'in-picioare' }).map((p) => p.id), ['od-meditating', 'op-picioare-arata']);
  assert.deepEqual(listeaza(catalog, { personaj: 'fara' }).map((p) => p.id), ['p-logo-client']);
  assert.deepEqual(listeaza(catalog, { personaj: '1', tema: 'noapte' }).map((p) => p.id),
    ['od-chilling', 'od-meditating', 'od-running', 'od-strolling', 'op-bust-cafea', 'op-bust-laptop', 'op-bust-telefon', 'op-picioare-explica-ochelari']);
  assert.deepEqual(cauta(catalog, 'calm', { personaj: 'in-picioare' }).map((r) => r.piesa.id), ['od-meditating']);
  const prinCli = await comandaDesen({ radacina: temp.radacina, sub: 'lista', pozitionale: [], optiuni: { personaj: 'fara' } });
  assert.equal(prinCli.rezultat.piese.length, 1);
  await assert.rejects(comandaDesen({ radacina: temp.radacina, sub: 'lista', pozitionale: [], optiuni: { personaj: 'În picioare' } }),
    (e) => e instanceof EroareFatala && e.eroareMg.camp === 'argumente.personaj');
});

test('comandaDesen: lista, cauta și erorile de utilizare', async () => {
  const lista = await comandaDesen({ radacina: temp.radacina, sub: 'lista', pozitionale: [], optiuni: { tema: 'noapte' } });
  assert.equal(lista.ok, true);
  assert.equal(lista.rezultat.piese.length, 9);
  assert.match(lista.rezultat.text, /^Piese \(9\):/);
  const gasite = await comandaDesen({ radacina: temp.radacina, sub: 'cauta', pozitionale: ['plictiseală,', 'telefon'], optiuni: {} });
  assert.equal(gasite.rezultat.rezultate[0].id, 'op-bust-telefon');
  await assert.rejects(comandaDesen({ radacina: temp.radacina, sub: 'cauta', pozitionale: [], optiuni: {} }),
    (e) => e instanceof EroareFatala && e.eroareMg.cod === 'argument-necunoscut');
  await assert.rejects(comandaDesen({ radacina: temp.radacina, sub: 'lista', pozitionale: [], optiuni: { tip: 'poza' } }),
    (e) => e instanceof EroareFatala && e.eroareMg.camp === 'argumente.tip');
  await assert.rejects(comandaDesen({ radacina: temp.radacina, sub: 'zboara', pozitionale: [], optiuni: {} }),
    (e) => e instanceof EroareFatala && e.eroareMg.cod === 'comanda-necunoscuta');
});

test('mg desen lista --json, pe o rădăcină cu biblioteca mini, întoarce ok true', async () => {
  let iesire = '';
  const stdout = { write(s) { iesire += s; return true; } };
  const cod = await principal(['desen', 'lista', '--json'], { radacina: temp.radacina, stdout });
  assert.equal(cod, 0);
  const json = JSON.parse(iesire);
  assert.equal(json.ok, true);
  assert.equal(json.comanda, 'desen');
  assert.equal(json.rezultat.piese.length, 10);
  assert.equal(json.rezultat.text, undefined);
});

test('mg desen lista --personaj trece prin dispecer, iar opțiunile lui adauga și arata sunt declarate', async () => {
  let iesire = '';
  const stdout = { write(s) { iesire += s; return true; } };
  const cod = await principal(['desen', 'lista', '--personaj', 'in-picioare', '--json'], { radacina: temp.radacina, stdout });
  assert.equal(cod, 0);
  assert.deepEqual(JSON.parse(iesire).rezultat.piese.map((p) => p.id), ['od-meditating', 'op-picioare-arata']);
  // --licenta, --etichete, --id și --proiect sunt declarate în OPTIUNI_DESEN: parseArgs nu le respinge,
  // iar subcomanda necunoscută ajunge la comandaDesen (comanda-necunoscuta), nu la argument-necunoscut.
  iesire = '';
  const cod2 = await principal(['desen', 'zboara', '--licenta', 'a', '--etichete', 'a,b', '--id', 'p-x', '--proiect', 'p', '--json'],
    { radacina: temp.radacina, stdout });
  assert.equal(cod2, 3);
  assert.equal(JSON.parse(iesire).erori[0].cod, 'comanda-necunoscuta');
});

test('mg desen cauta fără --json tipărește rezultatele pentru om', async () => {
  let iesire = '';
  const stdout = { write(s) { iesire += s; return true; } };
  const cod = await principal(['desen', 'cauta', 'plictiseala', '--tema', 'noapte'], { radacina: temp.radacina, stdout });
  assert.equal(cod, 0);
  assert.match(iesire, /^Rezultate pentru „plictiseala” \(1\):\nop-bust-telefon \| scor 3 \| eticheta „plictiseală”\n$/);
});

test('mg desen cu o opțiune necunoscută întoarce argument-necunoscut, cod 3', async () => {
  let iesire = '';
  const stdout = { write(s) { iesire += s; return true; } };
  const cod = await principal(['desen', 'lista', '--culoare', 'rosu', '--json'], { radacina: temp.radacina, stdout });
  assert.equal(cod, 3);
  const erori = JSON.parse(iesire).erori;
  assert.equal(erori[0].cod, 'argument-necunoscut');
  assert.equal(erori[0].camp, 'argumente.culoare');
});

test('mg desen lista refuză --familie linie, cu lista nouă de valori (C05); --tip traseu fără brand nu găsește nimic', async () => {
  const cazuri = [
    [['desen', 'lista', '--familie', 'linie', '--json'], 'argumente.familie', /Folosește una dintre: cerneala, proprie, traseu\./],
  ];
  let iesireTraseu = '';
  const codTraseu = await principal(['desen', 'lista', '--tip', 'traseu', '--json'],
    { radacina: temp.radacina, stdout: { write(s) { iesireTraseu += s; return true; } } });
  assert.equal(codTraseu, 0);
  assert.deepEqual(JSON.parse(iesireTraseu).rezultat.piese, []);
  for (const [argumente, camp, sugestie] of cazuri) {
    let iesire = '';
    const stdout = { write(s) { iesire += s; return true; } };
    const cod = await principal(argumente, { radacina: temp.radacina, stdout });
    assert.equal(cod, 3, argumente.join(' '));
    const erori = JSON.parse(iesire).erori;
    assert.equal(erori[0].cod, 'argument-necunoscut');
    assert.equal(erori[0].camp, camp);
    assert.match(erori[0].sugestie, sugestie);
  }
});
