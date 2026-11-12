import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planifica, asteptariDinPlan } from '../plan.mjs';
import { valideazaCronologie } from '../../../../../nucleu/lib/cronologie.mjs';
import { proiectFals, cuvinteDin, dateMinime, stilTest } from './ajutoare.mjs';

const TEXT = 'Bună sunt Andreea și lucrez cu agenți în fiecare zi. Acum câștig șase ore pe săptămână, pentru că agentul meu face trei lucruri: răspunde la e-mailuri, programează postările și pregătește ofertele. Vreau să-ți arăt cum.';
const CUVINTE = cuvinteDin(TEXT, { de_la: 0.4, pas: 0.36, lung: 0.3 });

function cu(t, extra = {}) {
  const p = proiectFals({ cuvinte: CUVINTE, durata: 20, ...extra });
  t.after(p.curata);
  return p;
}
const DATE = dateMinime({
  elemente: [
    { tip: 'titlu', la: 0.2, titlu: ['Șase ore pe săptămână'] },
    { tip: 'citat', id: 'citat-agent', ancora: { fraza: 'agentul meu' }, text: 'Agentul meu face trei lucruri' },
    { tip: 'final', cta: 'Urmărește-mă pentru partea a doua' },
  ],
});

test('fără elemente: un segment „Filmarea”, subtitrările grupate în bandă, cronologia validă', (t) => {
  const { ctx } = cu(t);
  const r = planifica(dateMinime(), stilTest(), ctx);
  assert.deepEqual(r.erori, []);
  const c = r.cronologie;
  assert.deepEqual(valideazaCronologie(c), []);
  assert.deepEqual(c.segmente.map((s) => [s.ref, s.texte.length, s.banda]), [['Filmarea', 0, 'filmare']]);
  assert.deepEqual(c.sursa_video, { fisier: 'build/filmare.mp4', start: 0, latime: 1080, inaltime: 1920, focus_x: 50 });
  assert.equal(c.fundal, 'filmare');
  assert.equal(c.audio, null);
  const g = r.plan.subtitrari.grupuri;
  assert.ok(g.length > 5);
  g.forEach((x, i) => {
    assert.ok(x.end - x.start >= 0.5 - 1e-9);
    if (i > 0) assert.ok(x.start >= g[i - 1].end - 1e-9);
    const [bx, by, bw, bh] = r.plan.banda_subtitrari;
    const [cx, cy, cw, ch] = x.caseta;
    assert.ok(cx >= bx && cy >= by && cx + cw <= bx + bw + 1e-6 && cy + ch <= by + bh + 1e-6);
  });
  assert.equal(r.plan.subtitrari.animatie, 'cuvant-activ');
  assert.ok(r.plan.subtitrari.pasi.some((p) => p.efect === 'cuvant'));
});

test('cu elemente: segmentele sortate după start, pe benzi; citatul și finalul suspendă subtitrările', (t) => {
  const { ctx } = cu(t);
  const r = planifica(DATE, stilTest(), ctx);
  assert.deepEqual(r.erori, []);
  const c = r.cronologie;
  assert.deepEqual(valideazaCronologie(c), []);
  assert.deepEqual(c.segmente.map((s) => [s.ref, s.banda]), [['e1', 'sus'], ['citat-agent', 'centru'], ['e3', 'centru']]);
  // ref = id-ul elementului, dat sau implicit (decizia 30), și în așteptări, și în momentele foii
  assert.deepEqual([...new Set(asteptariDinPlan(c, r.plan).texte.filter((x) => x.camp !== 'subtitrari').map((x) => x.ref))], ['e1', 'citat-agent', 'e3']);
  assert.ok(c.momente_foaie.some((m) => m.eticheta === 'citat-agent, complet'));
  // fraza găsită și timpul ei, în cronologie (spec 7.4, „Calculul timpilor”); nucleul nu citește detalii
  assert.deepEqual(c.segmente.map((s) => s.detalii.ancora && [s.detalii.ancora.fraza, s.detalii.ancora.aparitia]), [null, ['agentul meu', 1], null]);
  const { suspendari, grupuri } = r.plan.subtitrari;
  assert.equal(suspendari.length, 2);
  for (const [a, b] of suspendari) for (const g of grupuri) assert.ok(g.end <= a + 1e-9 || g.start >= b - 1e-9, `${g.id} se suprapune cu [${a}, ${b}]`);
  assert.equal(r.plan.elemente.at(-1).sfarsit, 20);
  for (const s of c.segmente) assert.ok(c.momente_foaie.some((m) => Math.abs(m.t - s.complet) <= 0.1 + 1e-9));
  assert.equal(c.momente_foaie.at(-1).t, Math.round((20 - 1 / 30) * 1000) / 1000);
  assert.deepEqual(r.plan.elemente.map((e) => e.permite_banda_subtitrari), [false, false, false]);
});

test('subtitrările la mijloc: elementele din centru intră în banda lor (data-layout-allow-caption-zone)', (t) => {
  const { ctx } = cu(t);
  const r = planifica({ ...DATE, subtitrari: { pozitie: 'mijloc' } }, stilTest(), ctx);
  assert.deepEqual(r.plan.elemente.map((e) => e.permite_banda_subtitrari), [false, true, true]);
});

test('importul: animația pe grup și avertismentul pentru cuvântul activ cerut', (t) => {
  const { ctx } = cu(t, { sursa: 'import' });
  const r = planifica(dateMinime({ subtitrari: { animatie: 'cuvant-activ' } }), stilTest(), ctx);
  assert.equal(r.plan.subtitrari.animatie, 'grup');
  assert.ok(r.plan.subtitrari.pasi.every((p) => p.efect === 'grup'));
  assert.deepEqual(r.avertismente.map((a) => [a.cod, a.camp]), [['valoare-invalida', 'subtitrari.animatie']]);
});

test('subtitrările oprite, opacitatea din temă sau din date, filmare.start mută totul', (t) => {
  const { ctx } = cu(t);
  const oprite = planifica(dateMinime({ subtitrari: { activ: false } }), stilTest('hartie'), ctx);
  assert.deepEqual([oprite.plan.subtitrari.grupuri, oprite.plan.opacitate_fundal], [[], 0.86]);
  assert.equal(planifica(dateMinime(), stilTest('noapte', { opacitate_fundal: 0.5 }), ctx).plan.opacitate_fundal, 0.5);
  const mutat = planifica(dateMinime({ filmare: { fisier: 'active/filmare-lucru.mp4', start: 2, sfarsit: 14 } }), stilTest(), ctx);
  assert.equal(mutat.cronologie.durata, 12);
  assert.equal(mutat.cronologie.sursa_video.start, 2);
  assert.ok(mutat.plan.subtitrari.grupuri.every((g) => g.start >= 0 && g.end <= 12));
});

test('S06 vine din planifica: evidentiaza negăsită', (t) => {
  const { ctx } = cu(t);
  const r = planifica(dateMinime({ subtitrari: { evidentiaza: ['opt ore'] } }), stilTest(), ctx);
  assert.deepEqual(r.erori.map((e) => [e.cod, e.camp]), [['overlay-filmare-evidentiaza', 'subtitrari.evidentiaza[0]']]);
  assert.equal(r.plan, null);
});

test('asteptari: rândurile cu casetă, cuvintele subtitrărilor (caseta doar pe primul din grup), transcrierea afișată', (t) => {
  const { ctx } = cu(t);
  const r = planifica(DATE, stilTest(), ctx);
  const a = asteptariDinPlan(r.cronologie, r.plan);
  const el = a.texte.filter((x) => x.camp !== 'subtitrari');
  assert.deepEqual(el.map((x) => x.text), r.plan.elemente.flatMap((e) => e.texte.map((y) => y.text)));
  assert.ok(el.every((x) => Array.isArray(x.caseta)));
  const sub = a.texte.filter((x) => x.ref.startsWith('Subtitrare'));
  assert.equal(sub.length, r.plan.subtitrari.grupuri.reduce((s, g) => s + g.cuvinte.length, 0));
  assert.equal(sub.filter((x) => x.caseta).length, r.plan.subtitrari.grupuri.length);
  // transcrierea așteptată = cuvintele rostite, nu doar cele afișate
  assert.deepEqual(a.transcriere.map((x) => x.text), CUVINTE.map((x) => x.text));
  assert.ok(a.transcriere.length > sub.length);
  const [susp0, susp1] = r.plan.subtitrari.suspendari[0];
  assert.ok(a.transcriere.some((x) => x.start >= susp0 && x.start < susp1), 'cuvinte rostite în timpul citatului');
  assert.deepEqual(a.audio, { prezent: false, durata: null });
  assert.deepEqual(a.momente, r.cronologie.segmente.map((s) => s.complet));
});

test('determinism: aceleași date și aceeași transcriere dau același plan', (t) => {
  const { ctx } = cu(t);
  assert.equal(JSON.stringify(planifica(DATE, stilTest(), ctx)), JSON.stringify(planifica(DATE, stilTest(), ctx)));
});

test('filmare.start cu mai mult de 3 zecimale dă o cronologie validă', (t) => {
  const { ctx } = cu(t);
  const r = planifica(dateMinime({ filmare: { fisier: 'active/filmare-lucru.mp4', start: 2.3456, sfarsit: 14 } }), stilTest(), ctx);
  assert.deepEqual(r.erori, []);
  assert.deepEqual(valideazaCronologie(r.cronologie), []);
  assert.equal(r.cronologie.sursa_video.start, 2.346);
});
