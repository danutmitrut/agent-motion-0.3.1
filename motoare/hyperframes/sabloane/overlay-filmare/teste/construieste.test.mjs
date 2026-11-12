import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { cronologie, construieste } from '../sablon.mjs';
import { asteptariDinPlan } from '../plan.mjs';
import { verificaBuild } from '../../../../../nucleu/lib/verificari/build.mjs';
import { proiectFals, cuvinteDin, dateMinime, stilTest, REPO } from './ajutoare.mjs';

const VERSIUNI = JSON.parse(fs.readFileSync(path.join(REPO, 'nucleu', 'VERSIUNI.json'), 'utf8'));
const TEXT = 'Bună sunt Andreea și lucrez cu agenți în fiecare zi. Acum câștig șase ore pe săptămână, pentru că agentul meu face trei lucruri: răspunde la e-mailuri, programează postările și pregătește ofertele. Vreau să-ți arăt cum.';
const DATE = dateMinime({
  elemente: [
    { tip: 'nume', ancora: { fraza: 'sunt andreea' }, nume: 'Andreea Popescu', rol: 'consultant de marketing' },
    { tip: 'lista', ancora: { fraza: 'trei lucruri' }, titlu: ['Ce face agentul'], puncte: [{ text: 'Răspunde la e-mailuri', ancora: { fraza: 'e-mailuri' } }, { text: 'Programează postările', ancora: { fraza: 'postările' } }] },
    { tip: 'final', cta: 'Scrie AGENT', detaliu: 'și îți trimit ghidul' },
  ],
});

async function construit(t, date = DATE) {
  const p = proiectFals({ cuvinte: cuvinteDin(TEXT, { de_la: 0.4, pas: 0.36, lung: 0.3 }), durata: 20 });
  t.after(p.curata);
  const stil = stilTest('noapte');
  const c = cronologie(date, stil, p.ctx);
  assert.deepEqual(c.erori, []);
  const ctx = { ...p.ctx, intern: c.intern };
  const dirBuild = path.join(p.dir, 'build');
  const r = await construieste(date, stil, c.cronologie, dirBuild, ctx);
  return { ...r, dirBuild, plan: c.intern, cron: c.cronologie, p, stil, ctx };
}

test('build-ul: fișierele, filmarea legată fără copie, argumentele de motor', async (t) => {
  const b = await construit(t);
  assert.equal(b.intrare, 'index.html');
  assert.deepEqual(b.fisiere.filter((f) => !f.startsWith('fonturi/')), ['filmare.mp4', 'gsap.min.js', 'index.html', 'plan.json', 'stil-rezolvat.json']);
  assert.ok(b.fisiere.some((f) => f.startsWith('fonturi/')));
  for (const f of b.fisiere) assert.ok(fs.existsSync(path.join(b.dirBuild, ...f.split('/'))), f);
  assert.deepEqual(b.active, []);
  const lucru = fs.statSync(path.join(b.p.dir, 'active', 'filmare-lucru.mp4'));
  const legat = fs.statSync(path.join(b.dirBuild, 'filmare.mp4'));
  assert.equal(legat.ino, lucru.ino, 'filmare.mp4 e o legătură fixă spre copia de lucru');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(b.dirBuild, 'plan.json'), 'utf8')), b.plan);
  assert.equal(b.motor.check.argumente[1], '--caption-zone');
  assert.deepEqual(b.motor.randare.argumente.slice(0, 2), ['--no-best-effort', '--frames-cache-dir']);
});

test('verificările nucleului pe build: C17 găsește fiecare text, C10 nu găsește rețea', async (t) => {
  const b = await construit(t);
  const asteptari = asteptariDinPlan(b.cron, b.plan);
  assert.ok(asteptari.texte.some((x) => x.camp === 'subtitrari'));
  const [c10, c17] = verificaBuild({ dirBuild: b.dirBuild, asteptari, check: { ok: true, _meta: { version: VERSIUNI.motoare.hyperframes.versiune } }, versiuni: VERSIUNI });
  assert.deepEqual(c17.erori, []);
  assert.equal(c17.ok, true);
  assert.equal(c10.ok, true);
  assert.deepEqual(c10.erori, []);
});

test('a doua construire dă exact aceleași fișiere', async (t) => {
  const a = await construit(t);
  const html = fs.readFileSync(path.join(a.dirBuild, 'index.html'), 'utf8');
  const b = await construieste(DATE, a.stil, a.cron, a.dirBuild, a.ctx);
  assert.deepEqual(b.fisiere, a.fisiere);
  assert.equal(fs.readFileSync(path.join(a.dirBuild, 'index.html'), 'utf8'), html);
});

test('copia de lucru dispărută: resursa-lipsa, nu un build fără filmare', async (t) => {
  const p = proiectFals({ cuvinte: cuvinteDin(TEXT), durata: 20 });
  t.after(p.curata);
  const stil = stilTest('noapte');
  const c = cronologie(dateMinime(), stil, p.ctx);
  fs.rmSync(path.join(p.dir, 'active', 'filmare-lucru.mp4'));
  await assert.rejects(() => construieste(dateMinime(), stil, c.cronologie, path.join(p.dir, 'build'), { ...p.ctx, intern: c.intern }),
    (e) => e.name === 'EroareFatala' && e.eroareMg.cod === 'resursa-lipsa' && e.eroareMg.camp === 'filmare.fisier');
});

test('fără planul din cronologie(), construieste refuză', async (t) => {
  const p = proiectFals({ cuvinte: cuvinteDin(TEXT), durata: 20 });
  t.after(p.curata);
  await assert.rejects(() => construieste(dateMinime(), stilTest(), { durata: 20 }, path.join(p.dir, 'build'), p.ctx), /planul lui overlay-filmare în ctx.intern/);
});
