import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { rezolvaStil, valoriStil, calculeazaAtenuat } from '../../nucleu/lib/teme.mjs';
import { citesteBrand } from '../../nucleu/lib/brand.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';

const vizual = fs.readFileSync(fileURLToPath(new URL('../fixtures/branduri/studio-lemn/vizual.md', import.meta.url)), 'utf8');

// Un SablonIncarcat minim (harta 5.8): doar ce citește rezolvaStil.
const SABLON = {
  nume: 'reel-ilustrat',
  meta: { teme: ['noapte', 'hartie', 'curat'] },
  schema: { properties: { stil: { properties: {
    tema: { enum: ['noapte', 'hartie', 'curat'] },
    ritm: { enum: ['calm', 'normal', 'alert'], default: 'normal' },
    recolorare: { enum: ['tema', 'original'], default: 'tema' },
  } } } },
  implicite: { jetoane: { linie: 'text' } },
};

function radacina() {
  return creeazaRadacinaTemp({
    copiaza: ['motoare/comun/teme', 'motoare/comun/fonturi'],
    fisiere: {
      'branduri/studio-lemn/vizual.md': vizual,
      'branduri/doar-accent/vizual.md': '---\nmg: 1\ntema: hartie\nculori: {accent: "#9D174D"}\n---\n',
    },
  });
}

test('fără brand și fără stil: tema noapte, ritm normal, linie = text, surse corecte', () => {
  const r = radacina();
  try {
    const { stil, erori } = rezolvaStil({ radacina: r.radacina, sablon: SABLON, date: {}, brand: null });
    assert.deepEqual(erori, []);
    assert.deepEqual(stil.tema, { valoare: 'noapte', sursa: 'implicit' });
    assert.deepEqual(stil.culori.fundal, { valoare: '#0E0F13', sursa: 'tema' });
    assert.deepEqual(stil.culori.atenuat, { valoare: '#9A9AA3', sursa: 'tema' });
    assert.deepEqual(stil.culori.linie, { valoare: '#F2EFEA', sursa: 'implicit' });
    assert.deepEqual(stil.ritm, { valoare: 'normal', sursa: 'implicit' });
    assert.deepEqual(stil.recolorare, { valoare: 'tema', sursa: 'implicit' });
    assert.deepEqual(stil.font_titlu, { valoare: 'inter', sursa: 'tema' });
    assert.equal(stil.semnatura, undefined);
  } finally {
    r.curata();
  }
});

test('schema cu $ref local (forma din B02): implicitele de stil se citesc din $defs', () => {
  const sablonCuRef = {
    ...SABLON,
    schema: {
      properties: { stil: { $ref: '#/$defs/stil' } },
      $defs: {
        ritm: { enum: ['calm', 'normal', 'alert'], default: 'calm' },
        stil: {
          type: 'object',
          properties: {
            tema: { enum: ['noapte', 'hartie', 'curat'] },
            ritm: { $ref: '#/$defs/ritm' },
            recolorare: { enum: ['tema', 'original'], default: 'tema' },
          },
        },
      },
    },
  };
  const r = radacina();
  try {
    const { stil, erori } = rezolvaStil({ radacina: r.radacina, sablon: sablonCuRef, date: {}, brand: null });
    assert.deepEqual(erori, []);
    assert.deepEqual(stil.recolorare, { valoare: 'tema', sursa: 'implicit' });
    assert.deepEqual(stil.ritm, { valoare: 'calm', sursa: 'implicit' });
    const cuDate = rezolvaStil({ radacina: r.radacina, sablon: sablonCuRef, date: { stil: { recolorare: 'original' } }, brand: null });
    assert.deepEqual(cuDate.stil.recolorare, { valoare: 'original', sursa: 'date' });
  } finally {
    r.curata();
  }
});

test('date peste temă: exemplul din harta 5.5 (hartie, accent din date)', () => {
  const r = radacina();
  try {
    const date = { semnatura: 'Ana Pop,\ncoach de carieră', stil: { tema: 'hartie', ritm: 'normal', culori: { accent: '#D9486A' } } };
    const { stil, erori } = rezolvaStil({ radacina: r.radacina, sablon: SABLON, date, brand: null });
    assert.deepEqual(erori, []);
    assert.deepEqual(stil.tema, { valoare: 'hartie', sursa: 'date' });
    assert.deepEqual(stil.culori.accent, { valoare: '#D9486A', sursa: 'date' });
    assert.deepEqual(stil.culori.atenuat, { valoare: '#6B6157', sursa: 'tema' });
    assert.deepEqual(stil.culori.linie, { valoare: '#2A2420', sursa: 'implicit' });
    assert.deepEqual(stil.font_titlu, { valoare: 'fraunces', sursa: 'tema' });
    assert.deepEqual(stil.granulatie, { valoare: 0.06, sursa: 'tema' });
    assert.deepEqual(stil.ritm, { valoare: 'normal', sursa: 'date' });
    assert.deepEqual(stil.semnatura, { valoare: 'Ana Pop,\ncoach de carieră', sursa: 'date' });
  } finally {
    r.curata();
  }
});

test('brand care schimbă doar accentul păstrează atenuatul temei (sursa tema)', () => {
  const r = radacina();
  try {
    const brand = citesteBrand(r.radacina, 'doar-accent');
    const { stil, erori } = rezolvaStil({ radacina: r.radacina, sablon: SABLON, date: { brand: 'doar-accent' }, brand });
    assert.deepEqual(erori, []);
    assert.deepEqual(stil.tema, { valoare: 'hartie', sursa: 'brand' });
    assert.deepEqual(stil.culori.accent, { valoare: '#9D174D', sursa: 'brand' });
    assert.deepEqual(stil.culori.atenuat, { valoare: '#6B6157', sursa: 'tema' });
  } finally {
    r.curata();
  }
});

test('brand cu alt fundal și alt text: atenuatul e calculat (sursa calculat)', () => {
  const r = radacina();
  try {
    const brand = citesteBrand(r.radacina, 'studio-lemn');
    const { stil, erori } = rezolvaStil({ radacina: r.radacina, sablon: SABLON, date: { brand: 'studio-lemn' }, brand });
    assert.deepEqual(erori, []);
    assert.deepEqual(stil.culori.fundal, { valoare: '#F4EFE6', sursa: 'brand' });
    // F10: hartie are atmosfera ceata, deci atenuatul trece pragul și față de straturile ceții la intensitatea 1
    // (65% text, nu 60% ca față de fundalul plin: calculeazaAtenuat('#1C1B19', '#F4EFE6') = '#72706B').
    assert.deepEqual(stil.culori.atenuat, { valoare: '#686561', sursa: 'calculat' });
    assert.equal(calculeazaAtenuat('#1C1B19', '#F4EFE6'), '#72706B');
    assert.deepEqual(stil.culori.linie, { valoare: '#1C1B19', sursa: 'implicit' });
    assert.deepEqual(stil.font_titlu, { valoare: 'fraunces', sursa: 'brand' });
    assert.deepEqual(stil.semnatura, { valoare: 'Studio Lemn,\nmobilier la comandă', sursa: 'brand' });
  } finally {
    r.curata();
  }
});

test('brand cu atenuat propriu: sursa brand', () => {
  const r = creeazaRadacinaTemp({
    copiaza: ['motoare/comun/teme', 'motoare/comun/fonturi'],
    fisiere: { 'branduri/cu-atenuat/vizual.md': '---\nmg: 1\nculori: {fundal: "#FFFFFF", atenuat: "#555555"}\n---\n' },
  });
  try {
    const brand = citesteBrand(r.radacina, 'cu-atenuat');
    const { stil } = rezolvaStil({ radacina: r.radacina, sablon: SABLON, date: {}, brand });
    assert.deepEqual(stil.culori.atenuat, { valoare: '#555555', sursa: 'brand' });
  } finally {
    r.curata();
  }
});

test('date cu stil.culori.accent plus brand → stil-contrazice-brand pe stil.culori.accent, fără suprascriere', () => {
  const r = radacina();
  try {
    const brand = citesteBrand(r.radacina, 'studio-lemn');
    const date = { brand: 'studio-lemn', stil: { culori: { accent: '#D9486A' }, ritm: 'alert' } };
    const { stil, erori } = rezolvaStil({ radacina: r.radacina, sablon: SABLON, date, brand });
    assert.equal(erori.length, 1);
    assert.equal(erori[0].cod, 'stil-contrazice-brand');
    assert.equal(erori[0].camp, 'stil.culori.accent');
    assert.deepEqual(stil.culori.accent, { valoare: '#C2410C', sursa: 'brand' });
    assert.deepEqual(stil.ritm, { valoare: 'alert', sursa: 'date' });
  } finally {
    r.curata();
  }
});

test('tema neacceptată de șablon → tema-necunoscuta pe stil.tema', () => {
  const r = radacina();
  try {
    const { erori } = rezolvaStil({ radacina: r.radacina, sablon: SABLON, date: { stil: { tema: 'contrast' } }, brand: null });
    assert.equal(erori[0].cod, 'tema-necunoscuta');
    assert.equal(erori[0].camp, 'stil.tema');
  } finally {
    r.curata();
  }
});

test('valoriStil întoarce valorile fără surse', () => {
  const r = radacina();
  try {
    const { stil } = rezolvaStil({ radacina: r.radacina, sablon: SABLON, date: { stil: { tema: 'curat' } }, brand: null });
    const plat = valoriStil(stil);
    assert.equal(plat.tema, 'curat');
    assert.deepEqual(plat.culori, { fundal: '#FFFFFF', text: '#111418', atenuat: '#5B6470', accent: '#2563EB', linie: '#111418' });
    assert.equal(plat.font_text, 'inter');
    assert.equal(plat.recolorare, 'tema');
  } finally {
    r.curata();
  }
});

test('brand cu font_titlu {fisier, familie}: obiectul ajunge în stil cu sursa brand', () => {
  const r = creeazaRadacinaTemp({
    copiaza: ['motoare/comun/teme', 'motoare/comun/fonturi'],
    fisiere: { 'branduri/cu-font/vizual.md': '---\nmg: 1\nfont_titlu: {fisier: titlu.woff2, familie: "Studio Titlu"}\n---\n' },
  });
  try {
    const brand = citesteBrand(r.radacina, 'cu-font');
    const { stil, erori } = rezolvaStil({ radacina: r.radacina, sablon: SABLON, date: { brand: 'cu-font' }, brand });
    assert.deepEqual(erori, []);
    const font = { fisier: 'branduri/cu-font/titlu.woff2', familie: 'Studio Titlu' };
    assert.deepEqual(stil.font_titlu, { valoare: font, sursa: 'brand' });
    assert.deepEqual(valoriStil(stil).font_titlu, font);
  } finally {
    r.curata();
  }
});
