import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { verificaBiblioteci, GRUPURI_PEEPS, ROLURI_REEL } from '../../unelte/import-biblioteci/verifica.mjs';
import { sha256Fisier, stergeRecursiv } from '../../nucleu/lib/fisiere.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';

const caleCatalog = (r) => path.join(r, 'biblioteci', 'catalog.json');
const caleLock = (r) => path.join(r, 'unelte', 'import-biblioteci', 'surse.lock.json');
const caleFoaie = (r) => path.join(r, 'biblioteci', 'foi', 'foaie.html');
const citesteCatalog = (r) => JSON.parse(readFileSync(caleCatalog(r), 'utf8'));
const coduri = (erori) => erori.map((e) => `${e.cod} ${e.camp}`);

// foaia de contact minimă, cu meta-ul pe care îl scrie import.py (B06)
function scrieFoaie(r) {
  mkdirSync(path.dirname(caleFoaie(r)), { recursive: true });
  writeFileSync(caleFoaie(r), `<!DOCTYPE html>\n<html lang="ro"><head><meta charset="utf-8">\n<meta name="catalog-sha256" content="${sha256Fisier(caleCatalog(r))}">\n</head><body></body></html>\n`);
}
// ca în importul real: după orice schimbare de catalog, foaia se rescrie
function scrieCatalog(r, c) {
  writeFileSync(caleCatalog(r), JSON.stringify(c, null, 2) + '\n');
  scrieFoaie(r);
}

// biblioteca mini (teste/fixtures/biblioteci-mini) copiată într-o rădăcină temporară, plus catalogul Lucide la care trimite,
// un surse.lock.json cu câte o intrare pentru fiecare formă și foaia la zi
function copieMini() {
  const tmp = creeazaRadacinaTemp({ biblioteciMini: true, copiaza: ['motoare/comun/iconite'] });
  const forme = citesteCatalog(tmp.radacina).piese.filter((p) => p.tip === 'forma');
  mkdirSync(path.dirname(caleLock(tmp.radacina)), { recursive: true });
  const fisiere = forme.map((p) => ({ sursa: p.sursa, original: p.original, url: `https://exemplu.invalid/${p.original}`, sha256: 'a'.repeat(64), octeti: 1, descarcat: '2026-10-01' }));
  writeFileSync(caleLock(tmp.radacina), JSON.stringify({ versiune: 1, fisiere }, null, 2) + '\n');
  scrieFoaie(tmp.radacina);
  return tmp;
}

const MESAJ_ONE_LINE = 'Desenele one-line nu fac parte din biblioteca agentului (decizia din 2026-10-07)';

// piesă de traseu one-line, scrisă în catalogul temporar (biblioteca mini nu mai are trasee); cu `suprascrie` se schimbă câmpurile
function adaugaTraseu(catalog, suprascrie = {}) {
  catalog.surse['trasee-dm'] ??= { nume: 'Trasee de test', autor: 'teste', url: '', descarcat_din: '', licenta: 'proprie-dm', licenta_text: 'Fixture de test.', dovada: [], verificat: '2026-10-01', nota: 'sintetic', generat_cu: 'test' };
  catalog.piese.push({
    id: 'lc-inline', tip: 'traseu', familie: 'linie', sursa: 'trasee-dm', original: 'sintetic/lc-inline.json',
    fisier: 'trasee/lc-inline.json', sha256: '0'.repeat(64), kb: 0.1, cutie: { w: 100, h: 100 },
    roluri: ['ink'], recolorabil: true, acoperire_cerneala: 0.02, lungime: 100, subtrasee: 1,
    provenienta: { model: 'sintetic', prompt: '', data: '2026-10-01' },
    personaj: { numar: 0, gen: 'ambiguu', poza: 'niciuna', orientare: 'fata' },
    etichete: ['inline', 'test', 'traseu', 'sintetic'], descriere: 'Traseu scris de test.', noapte: 'bun', teme_potrivite: ['noapte', 'hartie', 'curat'],
    animatie: { implicit: 'linie', durata_s: 3.4, retragere: true },
    ...suprascrie,
  });
  return catalog.piese.length - 1;
}


test('biblioteca mini e în regulă', () => {
  const tmp = copieMini();
  try {
    const r = verificaBiblioteci(tmp.radacina);
    assert.deepEqual(r.erori, []);
    assert.equal(r.ok, true);
  } finally {
    tmp.curata();
  }
});

test('o piesă traseu one-line în catalog e refuzată, oricum ar fi marcată', () => {
  const variante = [
    ['tip traseu', {}],
    ['familie linie', { id: 'op-fals', tip: 'forma', fisier: 'forme/op-fals.svg', original: 'sintetic/op-fals.svg' }],
    ['id lc-', { tip: 'forma', familie: 'cerneala' }],
    ['sursa trasee-dm', { id: 'od-fals', tip: 'forma', familie: 'cerneala', fisier: 'forme/od-fals.svg', original: 'sintetic/od-fals.svg' }],
  ];
  for (const [nume, suprascrie] of variante) {
    const tmp = copieMini();
    try {
      const catalog = citesteCatalog(tmp.radacina);
      const i = adaugaTraseu(catalog, suprascrie);
      scrieCatalog(tmp.radacina, catalog);
      const r = verificaBiblioteci(tmp.radacina);
      assert.equal(r.ok, false, nume);
      const gasita = r.erori.filter((e) => e.cod === 'valoare-invalida' && e.camp === `biblioteci.piese[${i}].id`);
      assert.equal(gasita.length, 1, `${nume}: ${coduri(r.erori).join('; ')}`);
      assert.ok(gasita[0].mesaj.includes(MESAJ_ONE_LINE), nume);
    } finally {
      tmp.curata();
    }
  }
});

test('un sha256 stricat în catalog dă resursa-hash', () => {
  const tmp = copieMini();
  try {
    const catalog = citesteCatalog(tmp.radacina);
    catalog.piese[0].sha256 = '0'.repeat(64);
    scrieCatalog(tmp.radacina, catalog);
    assert.deepEqual(coduri(verificaBiblioteci(tmp.radacina).erori), ['resursa-hash biblioteci.piese[0].sha256']);
  } finally {
    tmp.curata();
  }
});

test('un SVG cu script dă desen-svg-periculos, chiar cu sha256 la zi', () => {
  const tmp = copieMini();
  try {
    const catalog = citesteCatalog(tmp.radacina);
    const i = catalog.piese.findIndex((p) => p.tip === 'forma');
    const cale = path.join(tmp.radacina, 'biblioteci', catalog.piese[i].fisier);
    writeFileSync(cale, readFileSync(cale, 'utf8').replace('</svg>', '<script>alert(1)</script></svg>'));
    catalog.piese[i].sha256 = sha256Fisier(cale);
    scrieCatalog(tmp.radacina, catalog);
    assert.ok(coduri(verificaBiblioteci(tmp.radacina).erori).includes(`desen-svg-periculos biblioteci.piese[${i}].fisier`));
  } finally {
    tmp.curata();
  }
});

// Revizuirea transversală B01-B13, T12: build-ul pune în HTML ieșirea lui normalizeazaSvg, deci fișierul trebuie să fie chiar ea.
test('T12: o formă cu <img onerror> ascuns în <metadata> pică, deși normalizeazaSvg nu dă erori, chiar cu sha256 la zi', () => {
  const tmp = copieMini();
  try {
    const catalog = citesteCatalog(tmp.radacina);
    const i = catalog.piese.findIndex((p) => p.tip === 'forma');
    const cale = path.join(tmp.radacina, 'biblioteci', catalog.piese[i].fisier);
    writeFileSync(cale, readFileSync(cale, 'utf8').replace('</svg>', '<metadata><img src=x onerror=alert(1)></metadata></svg>'));
    catalog.piese[i].sha256 = sha256Fisier(cale);
    scrieCatalog(tmp.radacina, catalog);
    assert.deepEqual(coduri(verificaBiblioteci(tmp.radacina).erori), [`valoare-invalida biblioteci.piese[${i}].fisier`]);
  } finally {
    tmp.curata();
  }
});

test('mai puțin de 4 etichete și etichete fără diacritice sunt erori', () => {
  const tmp = copieMini();
  try {
    const catalog = citesteCatalog(tmp.radacina);
    catalog.piese[0].etichete = ['coplesit', 'birou', 'laptop'];
    scrieCatalog(tmp.radacina, catalog);
    assert.deepEqual(coduri(verificaBiblioteci(tmp.radacina).erori), [
      'desen-etichete-putine biblioteci.piese[0].etichete',
      'valoare-invalida biblioteci.piese[0].etichete[0]',
    ]);
  } finally {
    tmp.curata();
  }
});

test('o etichetă cu ș cu sedilă dă sedila, cu sugestia scrisă corect', () => {
  const tmp = copieMini();
  try {
    const catalog = citesteCatalog(tmp.radacina);
    catalog.piese[0].etichete[0] = `lini${String.fromCharCode(0x15f)}te`; // ș cu sedilă, construit din cod
    scrieCatalog(tmp.radacina, catalog);
    const { erori } = verificaBiblioteci(tmp.radacina);
    assert.deepEqual(coduri(erori), ['sedila biblioteci.piese[0].etichete[0]']);
    assert.equal(erori[0].sugestie, 'Scrie „liniște”.');
  } finally {
    tmp.curata();
  }
});

test('o licență nepermisă și o dovadă lipsă sunt erori', () => {
  const tmp = copieMini();
  try {
    const catalog = citesteCatalog(tmp.radacina);
    const [cheie] = Object.entries(catalog.surse).find(([, s]) => s.licenta === 'CC0-1.0');
    catalog.surse[cheie].dovada = ['dovezi/nu-exista.pdf'];
    const [alta] = Object.entries(catalog.surse).find(([k, s]) => k !== cheie && s.licenta !== 'proprie-dm');
    catalog.surse[alta].licenta = 'CC-BY-NC-4.0';
    scrieCatalog(tmp.radacina, catalog);
    const c = coduri(verificaBiblioteci(tmp.radacina).erori);
    assert.ok(c.includes(`resursa-lipsa biblioteci.surse.${cheie}.dovada[0]`), c.join('; '));
    assert.ok(c.includes(`desen-licenta-lipsa biblioteci.surse.${alta}.licenta`), c.join('; '));
  } finally {
    tmp.curata();
  }
});

test('un câmp obligatoriu lipsă și un fișier forme/ fără intrare în catalog sunt erori', () => {
  const tmp = copieMini();
  try {
    const catalog = citesteCatalog(tmp.radacina);
    delete catalog.piese[0].noapte;
    scrieCatalog(tmp.radacina, catalog);
    writeFileSync(path.join(tmp.radacina, 'biblioteci', 'forme', 'od-orfan.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>\n');
    const c = coduri(verificaBiblioteci(tmp.radacina).erori);
    assert.ok(c.includes('camp-lipsa biblioteci.piese[0].noapte'), c.join('; '));
    assert.ok(c.includes('desen-necunoscut fisier:biblioteci/forme/od-orfan.svg'), c.join('; '));
  } finally {
    tmp.curata();
  }
});

test('folderul biblioteci/trasee/ e refuzat, chiar gol', () => {
  const tmp = copieMini();
  try {
    mkdirSync(path.join(tmp.radacina, 'biblioteci', 'trasee'), { recursive: true });
    const { ok, erori } = verificaBiblioteci(tmp.radacina);
    assert.equal(ok, false);
    assert.deepEqual(coduri(erori), ['desen-necunoscut fisier:biblioteci/trasee']);
    assert.ok(erori[0].mesaj.includes(MESAJ_ONE_LINE));
  } finally {
    tmp.curata();
  }
});

test('T10: fișierele de sistem (.DS_Store, Thumbs.db, alte fișiere cu punct) din forme/ nu sunt erori', () => {
  const tmp = copieMini();
  try {
    for (const nume of ['.DS_Store', 'Thumbs.db', '._od-umbra.svg']) writeFileSync(path.join(tmp.radacina, 'biblioteci', 'forme', nume), 'x');
    assert.deepEqual(coduri(verificaBiblioteci(tmp.radacina).erori), []);
  } finally {
    tmp.curata();
  }
});

test('o familie fără nicio piesă potrivită pe o temă a reelului încalcă acoperirea', () => {
  const tmp = copieMini();
  try {
    const catalog = citesteCatalog(tmp.radacina);
    for (const p of catalog.piese) if (p.familie === 'cerneala') p.teme_potrivite = p.teme_potrivite.filter((t) => t !== 'curat');
    scrieCatalog(tmp.radacina, catalog);
    assert.deepEqual(coduri(verificaBiblioteci(tmp.radacina).erori), ['valoare-invalida biblioteci.acoperire.cerneala.curat']);
  } finally {
    tmp.curata();
  }
});

test('o formă fără intrare în surse.lock.json dă resursa-lipsa pe original', () => {
  const tmp = copieMini();
  try {
    const catalog = citesteCatalog(tmp.radacina);
    const i = catalog.piese.findIndex((p) => p.tip === 'forma');
    const lock = JSON.parse(readFileSync(caleLock(tmp.radacina), 'utf8'));
    lock.fisiere = lock.fisiere.filter((f) => !(f.sursa === catalog.piese[i].sursa && f.original === catalog.piese[i].original));
    writeFileSync(caleLock(tmp.radacina), JSON.stringify(lock, null, 2) + '\n');
    assert.deepEqual(coduri(verificaBiblioteci(tmp.radacina).erori), [`resursa-lipsa biblioteci.piese[${i}].original`]);
  } finally {
    tmp.curata();
  }
});

test('o foaie făcută pe alt catalog dă resursa-hash, iar o foaie lipsă dă resursa-lipsa', () => {
  const tmp = copieMini();
  try {
    const catalog = citesteCatalog(tmp.radacina);
    catalog.piese[0].descriere = 'Descriere schimbată după ce s-a făcut foaia.';
    writeFileSync(caleCatalog(tmp.radacina), JSON.stringify(catalog, null, 2) + '\n'); // fără scrieFoaie: foaia rămâne pe catalogul vechi
    assert.deepEqual(coduri(verificaBiblioteci(tmp.radacina).erori), ['resursa-hash fisier:biblioteci/foi/foaie.html']);
    stergeRecursiv(caleFoaie(tmp.radacina));
    assert.deepEqual(coduri(verificaBiblioteci(tmp.radacina).erori), ['resursa-lipsa fisier:biblioteci/foi/foaie.html']);
  } finally {
    tmp.curata();
  }
});

test('la Open Peeps, un traseu din g.ink fără data-grup dă valoare-invalida', () => {
  const tmp = copieMini();
  try {
    const catalog = citesteCatalog(tmp.radacina);
    const i = catalog.piese.findIndex((p) => p.id.startsWith('op-'));
    const cale = path.join(tmp.radacina, 'biblioteci', catalog.piese[i].fisier);
    assert.match(readFileSync(cale, 'utf8'), /<g class="ink"><path data-grup="corp"/);
    writeFileSync(cale, readFileSync(cale, 'utf8').replace(' data-grup="corp"', ''));
    catalog.piese[i].sha256 = sha256Fisier(cale);
    scrieCatalog(tmp.radacina, catalog);
    assert.deepEqual(coduri(verificaBiblioteci(tmp.radacina).erori), [`valoare-invalida biblioteci.piese[${i}].fisier`]);
  } finally {
    tmp.curata();
  }
});
// valorile din verifica.mjs nu se copiază libere: ele trebuie să fie egale cu cele din import.py (ledger B06)
test('grupurile Open Peeps din verifica.mjs sunt cele din import.py', () => {
  const py = readFileSync(new URL('../../unelte/import-biblioteci/import.py', import.meta.url), 'utf8');
  const functie = /def grupDinId\(id_\):([\s\S]*?)\n\n\n/.exec(py);
  assert.ok(functie, 'import.py nu mai are grupDinId');
  const grupuri = [...new Set([...functie[1].matchAll(/return "([a-z]+)"/g)].map((m) => m[1]))].sort();
  assert.deepEqual([...GRUPURI_PEEPS].sort(), grupuri);
  const roluri = /ROLURI_ORDINE = \(([^)]*)\)/.exec(py);
  assert.ok(roluri, 'import.py nu mai are ROLURI_ORDINE');
  assert.deepEqual([...ROLURI_REEL], [...roluri[1].matchAll(/"([a-z0-9]+)"/g)].map((m) => m[1]));
});


test('catalog lipsă sau JSON stricat: nu aruncă, întoarce eroarea', () => {
  const tmp = copieMini();
  try {
    writeFileSync(caleCatalog(tmp.radacina), '{stricat');
    const stricat = verificaBiblioteci(tmp.radacina);
    assert.equal(stricat.ok, false);
    assert.deepEqual(coduri(stricat.erori), ['json-invalid fisier:biblioteci/catalog.json']);
    stergeRecursiv(caleCatalog(tmp.radacina));
    const lipsa = verificaBiblioteci(tmp.radacina);
    assert.equal(lipsa.ok, false);
    assert.deepEqual(coduri(lipsa.erori), ['fisier-necitibil fisier:biblioteci/catalog.json']);
  } finally {
    tmp.curata();
  }
});
