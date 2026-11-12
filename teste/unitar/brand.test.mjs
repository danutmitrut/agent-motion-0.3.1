import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { citesteBrand, conflicteBrandDate } from '../../nucleu/lib/brand.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';

const FIXTURE = fileURLToPath(new URL('../fixtures/branduri/studio-lemn/vizual.md', import.meta.url));
const vizual = fs.readFileSync(FIXTURE, 'utf8');

function cuBranduri(fisiere) {
  return creeazaRadacinaTemp({ fisiere });
}

test('citesteBrand citește frontmatter-ul fișei studio-lemn', () => {
  const { radacina, curata } = cuBranduri({ 'branduri/studio-lemn/vizual.md': vizual });
  try {
    const brand = citesteBrand(radacina, 'studio-lemn');
    assert.equal(brand.nume, 'studio-lemn');
    assert.equal(brand.mg, 1);
    assert.equal(brand.tema, 'hartie');
    assert.deepEqual(brand.culori, { fundal: '#F4EFE6', text: '#1C1B19', accent: '#C2410C' });
    assert.equal(brand.font_titlu, 'fraunces');
    assert.equal(brand.sigla, 'sigla.svg');
    assert.equal(brand.semnatura, 'Studio Lemn,\nmobilier la comandă');
    assert.equal(brand.dir, path.join(radacina, 'branduri', 'studio-lemn'));
  } finally {
    curata();
  }
});

test('brand inexistent → brand-lipsa', () => {
  const { radacina, curata } = cuBranduri({});
  try {
    assert.throws(() => citesteBrand(radacina, 'nimeni'), (e) => e.eroareMg?.cod === 'brand-lipsa' && e.eroareMg.camp === 'brand');
  } finally {
    curata();
  }
});

test('YAML stricat, mg lipsă, frontmatter neînchis sau culoare fără # → brand-invalid', () => {
  const { radacina, curata } = cuBranduri({
    'branduri/stricat/vizual.md': '---\nmg: 1\nculori: {fundal: "#F4EFE6"\n---\n',
    'branduri/fara-mg/vizual.md': '---\ntema: hartie\n---\n',
    'branduri/neinchis/vizual.md': '---\nmg: 1\ntema: hartie\n',
    'branduri/fara-diez/vizual.md': '---\nmg: 1\nculori: {accent: F4EFE6}\n---\n',
  });
  try {
    for (const nume of ['stricat', 'fara-mg', 'neinchis', 'fara-diez']) {
      assert.throws(() => citesteBrand(radacina, nume), (e) => e.eroareMg?.cod === 'brand-invalid', nume);
    }
  } finally {
    curata();
  }
});

test('conflicteBrandDate: fiecare câmp interzis, pe calea exactă', () => {
  const brand = { nume: 'studio-lemn', mg: 1, culori: { accent: '#C2410C' } };
  const date = {
    sigla: 'resurse/sigla.svg',
    semnatura: 'Ana',
    stil: { tema: 'curat', culori: { accent: '#D9486A', fundal: '#FFFFFF' }, font_titlu: 'fraunces', ritm: 'alert', atmosfera: 'plin', recolorare: 'original' },
  };
  const campuri = conflicteBrandDate(date, brand, 'reel-ilustrat').map((e) => e.camp);
  assert.deepEqual(campuri, ['stil.tema', 'stil.culori.accent', 'stil.culori.fundal', 'stil.font_titlu', 'sigla', 'semnatura']);
  const altSablon = conflicteBrandDate(date, brand, 'text-animat').map((e) => e.camp);
  assert.ok(!altSablon.includes('semnatura'));
  for (const e of conflicteBrandDate(date, brand, 'reel-ilustrat')) assert.equal(e.cod, 'stil-contrazice-brand');
});

test('conflicteBrandDate fără brand sau cu ritm/atmosferă/recolorare → nicio eroare', () => {
  assert.deepEqual(conflicteBrandDate({ stil: { tema: 'curat' } }, null, 'reel-ilustrat'), []);
  const brand = { nume: 'studio-lemn', mg: 1 };
  assert.deepEqual(conflicteBrandDate({ stil: { ritm: 'calm', atmosfera: 'plin', recolorare: 'tema' } }, brand, 'reel-ilustrat'), []);
});

test('font_titlu {fisier, familie} din fișa de brand → cale relativă la rădăcina kitului', () => {
  const { radacina, curata } = cuBranduri({
    'branduri/cu-font/vizual.md': '---\nmg: 1\nfont_titlu: {fisier: titlu.woff2, familie: "Studio Titlu"}\n---\n',
  });
  try {
    const brand = citesteBrand(radacina, 'cu-font');
    assert.deepEqual(brand.font_titlu, { fisier: 'branduri/cu-font/titlu.woff2', familie: 'Studio Titlu' });
  } finally {
    curata();
  }
});

test('font_titlu de brand cu cale, extensie greșită, chei în plus sau familie periculoasă → brand-invalid', () => {
  const fise = {
    'iese-din-folder': '{fisier: ../titlu.woff2, familie: X}',
    'subfolder': '{fisier: fonturi/titlu.woff2, familie: X}',
    'ascuns': '{fisier: .titlu.woff2, familie: X}',
    'ttf': '{fisier: titlu.ttf, familie: X}',
    'cheie-in-plus': '{fisier: titlu.woff2, familie: X, greutate: 700}',
    'fara-familie': '{fisier: titlu.woff2}',
    'familie-css': '{fisier: titlu.woff2, familie: "X; color: red"}',
    'numar': '7',
  };
  const fisiere = {};
  for (const [nume, valoare] of Object.entries(fise)) {
    fisiere[`branduri/${nume}/vizual.md`] = `---\nmg: 1\nfont_titlu: ${valoare}\n---\n`;
  }
  const { radacina, curata } = cuBranduri(fisiere);
  try {
    for (const nume of Object.keys(fise)) {
      assert.throws(() => citesteBrand(radacina, nume),
        (e) => e.eroareMg?.cod === 'brand-invalid' && e.eroareMg.camp === 'brand', nume);
    }
  } finally {
    curata();
  }
});

test('T1/T18: semnatura din fișa de brand care nu e șir nevid (număr sau gol) → brand-invalid', () => {
  const { radacina, curata } = cuBranduri({
    'branduri/numar/vizual.md': '---\nmg: 1\nsemnatura: 2026\n---\n',
    'branduri/gol/vizual.md': '---\nmg: 1\nsemnatura: ""\n---\n',
  });
  try {
    for (const nume of ['numar', 'gol']) {
      assert.throws(() => citesteBrand(radacina, nume), (e) => e.eroareMg?.cod === 'brand-invalid'
        && e.eroareMg.camp === 'brand' && /semnatura/.test(e.eroareMg.mesaj), nume);
    }
  } finally {
    curata();
  }
});
