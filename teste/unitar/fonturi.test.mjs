import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DIACRITICE, incarcaCatalogFonturi, glifeLipsa, verificaAcoperire,
  verificaDiacriticeFont, cssFontFace, copiazaFonturi,
  esteFontBrand, verificaFontBrand, cssFontFaceBrand, copiazaFontBrand, familieCss,
} from '../../nucleu/lib/fonturi.mjs';
import { sha256Fisier } from '../../nucleu/lib/fisiere.mjs';

const RADACINA = fileURLToPath(new URL('../../', import.meta.url));
const DIR = path.join(RADACINA, 'motoare', 'comun', 'fonturi');
const ASTEPTAT = {
  inter: { familie: 'MG Inter', greutati: [400, 500, 700] },
  fraunces: { familie: 'MG Fraunces', greutati: [600, 700] },
  montserrat: { familie: 'MG Montserrat', greutati: [700, 800] },
  'instrument-sans': { familie: 'MG Instrument Sans', greutati: [700] },
  'playfair-display': { familie: 'MG Playfair Display', greutati: [700] },
};

test('catalogul are exact cele 5 fonturi, cu greutățile din harta 5.6, latin și latin-ext', () => {
  const catalog = incarcaCatalogFonturi(RADACINA);
  assert.deepEqual(Object.keys(catalog).sort(), Object.keys(ASTEPTAT).sort());
  for (const [id, a] of Object.entries(ASTEPTAT)) {
    const info = catalog[id];
    assert.equal(info.familie, a.familie);
    assert.equal(info.sursa, `@fontsource/${id}@5.3.0`);
    assert.equal(info.licenta, 'OFL-1.1');
    for (const g of a.greutati) {
      for (const subset of ['latin', 'latin-ext']) {
        const f = info.fisiere.find((x) => x.greutate === g && x.subset === subset);
        assert.ok(f, `${id} ${g} ${subset}`);
        assert.equal(f.fisier, `${id}-${g}-${subset}.woff2`);
        assert.match(f.unicode_range, /^U\+[0-9A-F]/);
      }
    }
    assert.equal(info.fisiere.length, a.greutati.length * 2);
    assert.ok(fs.statSync(path.join(DIR, id, 'OFL.txt')).size > 1000, `${id}/OFL.txt`);
  }
});

test('fiecare woff2 are sha256-ul din font.json', () => {
  for (const [id, info] of Object.entries(incarcaCatalogFonturi(RADACINA))) {
    for (const f of info.fisiere) {
      assert.equal(sha256Fisier(path.join(DIR, id, f.fisier)), f.sha256, `${id}/${f.fisier}`);
    }
  }
});

test('verificaDiacriticeFont trece pentru toate cele 5 fonturi', async () => {
  for (const id of Object.keys(ASTEPTAT)) {
    const r = await verificaDiacriticeFont(RADACINA, id);
    assert.equal(r.ok, true, `${id}: ${JSON.stringify(r.erori)}`);
    assert.deepEqual(r.erori, []);
  }
});

test('DIACRITICE are cele 10 litere, cu ș și ț cu virgulă', () => {
  assert.equal(DIACRITICE, 'ăâîșțĂÂÎȘȚ');
  assert.ok(DIACRITICE.includes('ș') && DIACRITICE.includes('ț'));
  assert.ok(!DIACRITICE.includes('\u015F') && !DIACRITICE.includes('\u0163'));
});

test('glifeLipsa pe „Ă” + omul de zăpadă (U+2603) întoarce doar omul de zăpadă', async () => {
  assert.deepEqual(await glifeLipsa(RADACINA, 'inter', 'Ă\u2603', 700), ['\u2603']);
  assert.deepEqual(await glifeLipsa(RADACINA, 'fraunces', 'Ana Pop,\ncoach de carieră', 700), []);
});

test('verificaAcoperire dă C05 cu glifa-lipsa pe câmpul exact', async () => {
  const bun = await verificaAcoperire(RADACINA, 'inter', ['Telefonul sună', 'Ședință'], 700);
  assert.equal(bun.cod, 'C05');
  assert.equal(bun.ok, true);
  assert.equal(bun.camp, null);
  const rau = await verificaAcoperire(RADACINA, 'inter',
    ['Bine', { camp: 'scene[2].titlu[0]', text: 'Cald \u2603' }], 700);
  assert.equal(rau.ok, false);
  assert.equal(rau.camp, 'scene[2].titlu[0]');
  assert.equal(rau.erori.length, 1);
  assert.equal(rau.erori[0].cod, 'glifa-lipsa');
  assert.equal(rau.erori[0].camp, 'scene[2].titlu[0]');
  assert.match(rau.erori[0].mesaj, /U\+2603/);
  assert.deepEqual(rau.valoare.lipsa, ['\u2603']);
});

test('font sau greutate necunoscută → EroareFatala font-necunoscut', async () => {
  await assert.rejects(glifeLipsa(RADACINA, 'comic-sans', 'a', 400), (e) => e.eroareMg?.cod === 'font-necunoscut');
  await assert.rejects(glifeLipsa(RADACINA, 'inter', 'a', 900), (e) => e.eroareMg?.cod === 'font-necunoscut');
});

test('cssFontFace: familia MG Inter, font-display block, unicode-range, câte un bloc pe fișier', () => {
  const css = cssFontFace(RADACINA, 'inter', [700, 400, 700], 'fonturi/');
  assert.match(css, /font-family: "MG Inter";/);
  assert.match(css, /font-display: block;/);
  assert.match(css, /unicode-range: U\+0000-00FF/);
  assert.match(css, /unicode-range: U\+0100-02BA/);
  assert.match(css, /src: url\("fonturi\/inter-400-latin\.woff2"\) format\("woff2"\);/);
  assert.equal((css.match(/@font-face/g) || []).length, 4);
  assert.ok(css.indexOf('font-weight: 400') < css.indexOf('font-weight: 700'));
  assert.equal(css, cssFontFace(RADACINA, 'inter', [400, 700], 'fonturi/'));
});

test('copiazaFonturi copiază toate woff2 ale fonturilor cerute', () => {
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'mg test Ăîș '));
  try {
    const copiate = copiazaFonturi(RADACINA, ['instrument-sans', 'instrument-sans'], path.join(dest, 'fonturi'));
    assert.deepEqual(copiate, ['instrument-sans-700-latin-ext.woff2', 'instrument-sans-700-latin.woff2']);
    for (const f of copiate) assert.ok(fs.existsSync(path.join(dest, 'fonturi', f)));
  } finally {
    fs.rmSync(dest, { recursive: true, force: true });
  }
});

test('fontul de brand {fisier, familie}: C05 pe diacritice, fișier lipsă, @font-face și copiere (spec 6.4, 7.1)', async () => {
  const rad = fs.mkdtempSync(path.join(os.tmpdir(), 'mg brand Ăîș '));
  try {
    fs.mkdirSync(path.join(rad, 'branduri', 'b'), { recursive: true });
    // inter-700-latin.woff2 nu are ă ș ț Ă Ș Ț (sunt în latin-ext): e fontul de brand „stricat” de care avem nevoie.
    fs.copyFileSync(path.join(DIR, 'inter', 'inter-700-latin.woff2'), path.join(rad, 'branduri', 'b', 'titlu.woff2'));
    const font = { fisier: 'branduri/b/titlu.woff2', familie: 'Studio Titlu' };
    assert.equal(esteFontBrand(font), true);
    assert.equal(esteFontBrand('inter'), false);

    assert.deepEqual(await glifeLipsa(rad, font, 'Ana â\u2603', 700), ['\u2603']);
    const rau = await verificaFontBrand(rad, font);
    assert.equal(rau.cod, 'C05');
    assert.equal(rau.ok, false);
    assert.equal(rau.camp, 'brand');
    assert.equal(rau.erori[0].cod, 'glifa-lipsa');
    assert.deepEqual(rau.valoare, { font: 'Studio Titlu', fisier: 'branduri/b/titlu.woff2', lipsa: ['ă', 'ș', 'ț', 'Ă', 'Ș', 'Ț'] });
    assert.equal((await verificaFontBrand(rad, font, 'âîÂÎ')).ok, true);

    const absent = await verificaFontBrand(rad, { fisier: 'branduri/b/nu-exista.woff2', familie: 'X' });
    assert.equal(absent.ok, false);
    assert.equal(absent.erori[0].cod, 'font-necunoscut');
    assert.equal(absent.erori[0].camp, 'brand');
    await assert.rejects(glifeLipsa(rad, { fisier: 'branduri/b/nu-exista.woff2', familie: 'X' }, 'a', 700),
      (e) => e.eroareMg?.cod === 'font-necunoscut');

    const css = cssFontFaceBrand(font, 'fonturi/');
    assert.match(css, /font-family: "MG Studio Titlu";/);
    assert.match(css, /font-weight: 100 900;/);
    assert.match(css, /src: url\("fonturi\/brand-titlu\.woff2"\) format\("woff2"\);/);
    assert.equal((css.match(/@font-face/g) || []).length, 1);
    assert.equal(familieCss(font, rad), 'MG Studio Titlu');
    assert.equal(familieCss('inter', RADACINA), 'MG Inter');

    assert.equal(copiazaFontBrand(rad, font, path.join(rad, 'build', 'fonturi')), 'brand-titlu.woff2');
    assert.ok(fs.existsSync(path.join(rad, 'build', 'fonturi', 'brand-titlu.woff2')));
  } finally {
    fs.rmSync(rad, { recursive: true, force: true });
  }
});
