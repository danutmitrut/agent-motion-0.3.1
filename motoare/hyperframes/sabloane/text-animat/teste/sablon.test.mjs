import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { incarcaSablon } from '../../../../../nucleu/lib/sabloane.mjs';
import { rezolvaStil } from '../../../../../nucleu/lib/teme.mjs';

const REPO = fileURLToPath(new URL('../../../../../', import.meta.url));
const sablon = await incarcaSablon(REPO, 'text-animat');
const minim = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../exemple/minim.json', import.meta.url)), 'utf8'));

function ctxPentru(dirProiect, extra = {}) {
  return { radacina: REPO, proiect: 'test', dirProiect, sablon, mod: 'doar-verificare', catalog: null, brand: null, intern: null, stil: null, ff: null,
    ingheataActiv: () => { throw new Error('text-animat nu îngheață active'); }, ...extra };
}

test('SABLON.md se încarcă: formatele, temele, durata și verificările declarate', () => {
  assert.equal(sablon.nume, 'text-animat');
  assert.deepEqual(sablon.meta.formate, ['vertical', 'patrat']);
  assert.deepEqual(sablon.meta.teme, ['noapte', 'hartie', 'curat', 'contrast']);
  assert.deepEqual(sablon.meta.durata, { min: 5, max: 60, implicita: 15 });
  for (const cod of ['C01', 'C09', 'C13', 'C17', 'S01', 'S02', 'S03', 'S04']) assert.ok(sablon.meta.verificari.includes(cod), cod);
  for (const f of ['valideaza', 'cronologie', 'construieste', 'asteptari', 'blocScenariu']) assert.equal(typeof sablon.modul[f], 'function', f);
});

test('cronologie: valideaza întâi; date invalide nu dau cronologie', () => {
  const ctx = ctxPentru(REPO);
  const { stil } = rezolvaStil({ radacina: REPO, sablon, date: minim, brand: null });
  const rau = { ...minim, scene: [minim.scene[2], minim.scene[0]] };
  const r = sablon.modul.cronologie(rau, stil, ctx);
  assert.equal(r.cronologie, null);
  assert.deepEqual(r.erori.map((e) => e.cod), ['text-animat-final-nu-e-ultimul']);
});

test('asteptari: piesele cu momentul și caseta lor; fără plan, textele segmentelor', () => {
  const ctx = ctxPentru(REPO);
  const { stil } = rezolvaStil({ radacina: REPO, sablon, date: minim, brand: null });
  const c = sablon.modul.cronologie(minim, stil, ctx);
  const a = sablon.modul.asteptari(c.cronologie, { ...ctx, intern: c.intern, stil });
  assert.equal(a.texte.length, 5 + 4 + 4);
  assert.deepEqual(Object.keys(a.texte[0]).sort(), ['camp', 'caseta', 'ref', 't', 'text', 'zona_text']);
  assert.deepEqual(a.momente, [1.35, 6.7, 11.21]);
  assert.deepEqual(a.audio, { prezent: false, durata: null });
  assert.equal(a.fundal, '#0E0F13');
  const fara = sablon.modul.asteptari(c.cronologie, {});
  assert.equal(fara.texte.length, a.texte.length);
  assert.equal(fara.texte[0].caseta, undefined);
});

test('construieste: index.html, planul, stilul, măsurătorile, GSAP și fonturile, fără active', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-text-build-'));
  try {
    const ctx = ctxPentru(dir);
    const { stil } = rezolvaStil({ radacina: REPO, sablon, date: minim, brand: null });
    const c = sablon.modul.cronologie(minim, stil, ctx);
    const dirBuild = path.join(dir, 'build');
    const r = await sablon.modul.construieste(minim, stil, c.cronologie, dirBuild, { ...ctx, intern: c.intern, stil });
    assert.equal(r.intrare, 'index.html');
    assert.equal(r.active, undefined);
    for (const f of ['gsap.min.js', 'index.html', 'masuratori.json', 'plan.json', 'stil-rezolvat.json']) assert.ok(r.fisiere.includes(f), f);
    assert.ok(r.fisiere.some((f) => /^fonturi\/.+\.woff2$/.test(f)));
    assert.deepEqual([...r.fisiere].sort(), r.fisiere);
    for (const f of r.fisiere) assert.ok(fs.existsSync(path.join(dirBuild, ...f.split('/'))), f);
    const html = fs.readFileSync(path.join(dirBuild, 'index.html'), 'utf8');
    assert.match(html, /<span class="p" id="t1-2">Lucrezi 12 ore<\/span>/);
    assert.match(html, /font-family: "MG [^"]+"/);
    assert.equal(/https?:\/\//.test(html.replace(/http:\/\/www\.w3\.org\/2000\/svg/g, '')), false);
    const masuratori = JSON.parse(fs.readFileSync(path.join(dirBuild, 'masuratori.json'), 'utf8'));
    assert.equal(masuratori.scene[0].blocuri[1].marime, c.intern.scene[0].blocuri[1].marime);
    const a = await sablon.modul.construieste(minim, stil, c.cronologie, path.join(dir, 'build2'), { ...ctx, intern: c.intern, stil });
    assert.equal(fs.readFileSync(path.join(dir, 'build2', 'index.html'), 'utf8'), html);
    assert.deepEqual(a.fisiere, r.fisiere);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('construieste refuză un plan care nu e al lui text-animat', async () => {
  await assert.rejects(() => sablon.modul.construieste(minim, {}, { durata: 1 }, os.tmpdir(), ctxPentru(REPO, { intern: { versiune: 1, sablon: 'reel-ilustrat' } })), TypeError);
});
