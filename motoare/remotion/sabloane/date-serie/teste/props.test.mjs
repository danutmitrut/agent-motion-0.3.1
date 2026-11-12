// construieste și build/props.json (I09): forma din planul I, fonturile și sigla în build/, fără rețea.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fonturiProps } from '../props.mjs';
import { incarcaCatalogFonturi } from '../../../../../nucleu/lib/sdk.mjs';
import { exemplu, REPO, buildExemplu, sablonul, stilRezolvat, ctxTest } from './ajutoare.mjs';

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 80"><rect width="200" height="80"/></svg>';
const temp = (nume) => fs.mkdtempSync(path.join(os.tmpdir(), `mg-date-serie-${nume}-`));
const citesteProps = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'props.json'), 'utf8'));
const CHEI = ['versiune', 'latime', 'inaltime', 'fps', 'cadre', 'tranzitie', 'culori', 'fonturi', 'familii', 'atmosfera', 'ceata', 'muzica', 'sigla', 'scene'];
const CHEI_TEXT = ['id', 'text', 'randuri', 'x', 'y', 'latime', 'inaltime', 'marime', 'font', 'greutate', 'culoare', 'spatiere', 'aliniere'];

test('construieste: props.json și fonturile temei, cu motor.props și motor.compozitie', async () => {
  const dir = temp('build');
  const { construit } = await buildExemplu(exemplu('grafic.date'), dir);
  assert.deepEqual(construit, {
    intrare: 'props.json',
    fisiere: ['fonturi/inter-400-latin-ext.woff2', 'fonturi/inter-400-latin.woff2', 'fonturi/inter-500-latin-ext.woff2', 'fonturi/inter-500-latin.woff2',
      'fonturi/inter-700-latin-ext.woff2', 'fonturi/inter-700-latin.woff2', 'props.json'],
    active: [],
    motor: { props: 'props.json', compozitie: 'Grafic' },
  });
  for (const f of construit.fisiere) assert.ok(fs.existsSync(path.join(dir, f)), f);
  const text = fs.readFileSync(path.join(dir, 'props.json'), 'utf8');
  assert.equal(text, `${JSON.stringify(JSON.parse(text), null, 2)}\n`);
  assert.doesNotMatch(text, /https?:\/\//);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('props.json: cheile în ordinea din plan, cadrele, culorile, fonturile desenate și ceața', async () => {
  const dir = temp('props');
  await buildExemplu(exemplu('grafic.date'), dir);
  const p = citesteProps(dir);
  assert.deepEqual(Object.keys(p), CHEI);
  assert.deepEqual([p.versiune, p.latime, p.inaltime, p.fps, p.cadre, p.tranzitie, p.atmosfera, p.muzica, p.sigla], [1, 1080, 1920, 30, 672, 12, 'ceata', null, null]);
  assert.deepEqual(p.culori, { fundal: '#0E0F13', text: '#F2EFEA', atenuat: '#9A9AA3', accent: '#FF7A59' });
  assert.deepEqual(p.familii, { titlu: 'MG Inter', text: 'MG Inter' });
  assert.deepEqual(p.fonturi.map((f) => [f.familie, f.url, f.greutate]), [
    ['MG Inter', 'fonturi/inter-500-latin-ext.woff2', '500'], ['MG Inter', 'fonturi/inter-500-latin.woff2', '500'],
    ['MG Inter', 'fonturi/inter-700-latin-ext.woff2', '700'], ['MG Inter', 'fonturi/inter-700-latin.woff2', '700'],
  ]);
  assert.match(p.fonturi[1].unicodeRange, /^U\+0000-00FF,/);
  assert.deepEqual(p.ceata, [{ culoare: '#FF7A59', alfa: 0.3 }, { culoare: '#F2EFEA', alfa: 0.14 }]);
  assert.deepEqual(p.scene.map((s) => [s.ref, s.tip, s.cadre, s.inceput, s.intrare]), [
    ['Scena 1', 'titlu', 114, 0, 18], ['Scena 2', 'cifra', 120, 102, 45], ['Scena 3', 'bare', 234, 210, 40],
    ['Scena 4', 'comparatie', 138, 432, 36], ['Scena 5', 'final', 114, 558, 18],
  ]);
  for (const s of p.scene) {
    assert.deepEqual(Object.keys(s), ['ref', 'tip', 'cadre', 'inceput', 'intrare', 'texte', 'detalii']);
    for (const t of s.texte) assert.deepEqual(Object.keys(t), CHEI_TEXT);
  }
  assert.deepEqual(Object.keys(p.scene[2].detalii.bare[0]), ['x', 'y', 'latime', 'inaltime', 'accent', 'idEticheta', 'idValoare', 'valoare', 'zecimale', 'prefix', 'sufix']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('hârtie: titlul în Fraunces 700, textul în Inter, ceața limitată pentru contrast; curat: fără ceață', async () => {
  const dir = temp('hartie');
  await buildExemplu(exemplu('grafic.date'), dir, { tema: 'hartie' });
  const p = citesteProps(dir);
  assert.deepEqual(p.familii, { titlu: 'MG Fraunces', text: 'MG Inter' });
  assert.deepEqual(p.fonturi.map((f) => f.url), [
    'fonturi/fraunces-700-latin-ext.woff2', 'fonturi/fraunces-700-latin.woff2',
    'fonturi/inter-500-latin-ext.woff2', 'fonturi/inter-500-latin.woff2', 'fonturi/inter-700-latin-ext.woff2', 'fonturi/inter-700-latin.woff2',
  ]);
  assert.deepEqual(p.ceata, [{ culoare: '#C2410C', alfa: 0.273 }, { culoare: '#2A2420', alfa: 0.1274 }]);
  const dir2 = temp('curat');
  await buildExemplu(exemplu('grafic.date'), dir2, { tema: 'curat' });
  assert.deepEqual([citesteProps(dir2).atmosfera, citesteProps(dir2).ceata], ['plin', []]);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(dir2, { recursive: true, force: true });
});

test('C17: fiecare text așteptat e o valoare separată în props.json (rândurile, nu doar textul unit)', async () => {
  const dir = temp('c17');
  const sab = await sablonul();
  const date = exemplu('grafic.date');
  const { cronologie, intern } = await buildExemplu(date, dir);
  const a = sab.modul.asteptari(cronologie, ctxTest(sab, { intern }));
  const valori = new Set();
  (function strange(v) {
    if (typeof v === 'string') valori.add(v);
    else if (v && typeof v === 'object') Object.values(v).forEach(strange);
  })(citesteProps(dir));
  for (const t of a.texte) assert.ok(valori.has(t.text), t.text);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('sigla: copiată în build/sigla.svg, cu poziția din așezare; muzica: assets/muzica.m4a', async () => {
  const proiect = temp('proiect');
  fs.mkdirSync(path.join(proiect, 'resurse'));
  fs.writeFileSync(path.join(proiect, 'resurse', 'sigla.svg'), SVG);
  const date = exemplu('grafic.date');
  date.sigla = 'resurse/sigla.svg';
  const dir = temp('sigla');
  const { construit } = await buildExemplu(date, dir, { dirProiect: proiect });
  assert.ok(construit.fisiere.includes('sigla.svg'));
  assert.equal(fs.readFileSync(path.join(dir, 'sigla.svg'), 'utf8'), SVG);
  assert.deepEqual(citesteProps(dir).sigla, { url: 'sigla.svg', x: 80, y: 1019, latime: 350, inaltime: 140 });
  const cuMuzica = exemplu('grafic.date');
  cuMuzica.muzica = { fisier: 'resurse/muzica.mp3' };
  const dir2 = temp('muzica');
  await buildExemplu(cuMuzica, dir2);
  assert.equal(citesteProps(dir2).muzica, 'assets/muzica.m4a');
  for (const d of [proiect, dir, dir2]) fs.rmSync(d, { recursive: true, force: true });
});

test('construieste fără intern-ul din cronologie e o greșeală de apel (TypeError)', async () => {
  const sab = await sablonul();
  const date = exemplu('grafic.date');
  const stil = stilRezolvat(sab, date);
  const c = sab.modul.cronologie(date, stil, ctxTest(sab, { stil }));
  await assert.rejects(sab.modul.construieste(date, stil, c.cronologie, temp('fara'), ctxTest(sab, { stil })), TypeError);
});

test('determinism: același props.json, byte cu byte, la două build-uri', async () => {
  const [d1, d2] = [temp('det1'), temp('det2')];
  await buildExemplu(exemplu('grafic.date'), d1);
  await buildExemplu(exemplu('grafic.date'), d2);
  assert.ok(fs.readFileSync(path.join(d1, 'props.json')).equals(fs.readFileSync(path.join(d2, 'props.json'))));
  for (const d of [d1, d2]) fs.rmSync(d, { recursive: true, force: true });
});

test('font de brand pe titlu: intrare fonturi/brand-<fisier>, fără unicodeRange, familia MG <familie>; fișierul e copiat în build/', async () => {
  const brand = { fisier: 'motoare/comun/fonturi/inter/inter-700-latin.woff2', familie: 'Casa Mea' };
  const intrari = fonturiProps({ font_titlu: brand, font_text: 'inter' }, incarcaCatalogFonturi(REPO));
  assert.deepEqual(intrari.find((f) => f.url === 'fonturi/brand-inter-700-latin.woff2'),
    { familie: 'MG Casa Mea', url: 'fonturi/brand-inter-700-latin.woff2', greutate: '700', unicodeRange: null });

  const sab = await sablonul();
  const date = exemplu('grafic.date');
  const stil = stilRezolvat(sab, date);
  stil.font_titlu = { ...stil.font_titlu, valoare: brand };
  const ctx = ctxTest(sab, { stil });
  const c = sab.modul.cronologie(date, stil, ctx);
  const dir = temp('brand');
  const construit = await sab.modul.construieste(date, stil, c.cronologie, dir, { ...ctx, intern: c.intern });
  const props = citesteProps(dir);
  assert.equal(props.familii.titlu, 'MG Casa Mea');
  const titlu = props.fonturi.find((f) => f.familie === 'MG Casa Mea');
  assert.equal(titlu.url, 'fonturi/brand-inter-700-latin.woff2');
  assert.ok(fs.existsSync(path.join(dir, titlu.url)));
  assert.ok(construit.fisiere.includes(titlu.url));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('felia 4: font de brand pe text: fișierul lui e copiat în build/, ca cel de titlu (props.json îl cere)', async () => {
  // revizia feliei 4: doar fontul de titlu se copia, iar props.json cerea și fișierul fontului de text
  const brand = { fisier: 'motoare/comun/fonturi/inter/inter-400-latin.woff2', familie: 'Text Casa' };
  const sab = await sablonul();
  const date = exemplu('grafic.date');
  const stil = stilRezolvat(sab, date);
  stil.font_text = { ...stil.font_text, valoare: brand };
  const ctx = ctxTest(sab, { stil });
  const c = sab.modul.cronologie(date, stil, ctx);
  const dir = temp('brand-text');
  const construit = await sab.modul.construieste(date, stil, c.cronologie, dir, { ...ctx, intern: c.intern });
  const text = citesteProps(dir).fonturi.find((f) => f.familie === 'MG Text Casa');
  assert.equal(text.url, 'fonturi/brand-inter-400-latin.woff2');
  assert.ok(fs.existsSync(path.join(dir, text.url)));
  assert.ok(construit.fisiere.includes(text.url));
  fs.rmSync(dir, { recursive: true, force: true });
});
