import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { incarcaSablon } from '../../nucleu/lib/sabloane.mjs';
import { obligatoriiPentru, rezultat, grupeazaPeVerificari } from '../../nucleu/lib/verificari/index.mjs';
import { cuRezultateSablon, pregatesteBuild } from '../../nucleu/lib/randeaza/pregatire.mjs';
import { COD_IESIRE } from '../../nucleu/lib/erori.mjs';
import { sha256Fisier } from '../../nucleu/lib/fisiere.mjs';
import { comandaRandeaza, verificariSablon } from '../../nucleu/lib/randeaza/index.mjs';
import { declarate, okPentruAprobare } from '../../nucleu/lib/verificari/stadii.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const S = ['S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08', 'S09', 'S10', 'S11', 'S12'];
const DATE_C = ['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C09'];

test('pe drumul fericit, fiecare cod S declarat de reel primește un rezultat verde', async () => {
  const reel = await incarcaSablon(REPO, 'reel-ilustrat');
  assert.equal(obligatoriiPentru(reel).length, 29);
  const r = cuRezultateSablon(DATE_C.map((cod) => rezultat(cod, true)), reel);
  assert.deepEqual(r.map((x) => x.cod), [...DATE_C, ...S]);
  assert.ok(r.every((x) => x.ok));
});

test('un rezultat S existent (de exemplu S12 cu avertisment) nu se dublează și nu se rescrie', () => {
  const s12 = rezultat('S12', true, { avertismente: [{ cod: 'iconite-inghesuite', camp: 'scene[1].iconite', mesaj: 'm', sugestie: 's' }] });
  const r = cuRezultateSablon([rezultat('C01', true), s12], { nume: 't', meta: { verificari: ['C01', 'S11', 'S12'] } });
  assert.deepEqual(r.map((x) => x.cod), ['C01', 'S11', 'S12']);
  assert.equal(r[2], s12);
});

test('M2: cuRezultateSablon nu dă verde automat codurilor S de build sau mp4', () => {
  const s = { nume: 't', meta: { verificari: ['C01', 'S01', 'S02', 'S03'], stadii: { S02: 'build', S03: 'mp4' } } };
  const r = cuRezultateSablon([rezultat('C01', true)], s);
  assert.deepEqual(r.map((x) => x.cod), ['C01', 'S01']);
});

test('un nume de proiect invalid sau un proiect lipsă opresc pregătirea cu cod 3, înainte de orice citire', async () => {
  const { radacina, curata } = creeazaRadacinaTemp();
  try {
    const opreste = (proiect, cod) => assert.rejects(pregatesteBuild({ radacina, proiect, mod: 'doar-verificare' }),
      (e) => e.eroareMg?.cod === cod && e.eroareMg.camp === 'argumente.proiect' && e.codIesire === COD_IESIRE.UTILIZARE);
    await opreste('Programări Luni', 'proiect-nume-invalid');
    await opreste(undefined, 'proiect-nume-invalid');
    await opreste('nu-exista', 'proiect-lipsa');
  } finally {
    curata();
  }
});

// SEC-1: hash-ul lui date.json vine din octeții citiți o singură dată, la pregătire; un date.json schimbat în
// timpul rulării face verificare.json roșu, cu hash-ul datelor verificate, nu cu al fișierului nou.

const LOCK_PROBA = {
  versiune: 1,
  proiect: 'p',
  creat_la: '2026-10-02T09:00:00.000Z',
  motor: { nume: 'hyperframes', versiune: '0.8.96' },
  sablon: { nume: 'proba', versiune_schema: 1, sha256: 'a'.repeat(64) },
  versiuni_sha256: 'b'.repeat(64),
  active: {},
  aprobare: null,
  randari: { ultima_completa: null },
};

/** Proiectul p pe șablonul de probă; cu `modificaInValideaza`, valideaza rescrie date.json și întoarce o eroare. */
function proiectProba(date, { modificaInValideaza = false } = {}) {
  const t = creeazaRadacinaTemp({
    copiaza: ['nucleu/VERSIUNI.json'],
    sablonProba: true,
    biblioteciMini: true,
    fisiere: { 'video/p/motor.lock': JSON.stringify(LOCK_PROBA, null, 2) + '\n', 'video/p/date.json': date },
  });
  if (modificaInValideaza) {
    const dir = path.join(t.radacina, 'motoare', 'hyperframes', 'sabloane', 'proba');
    fs.renameSync(path.join(dir, 'sablon.mjs'), path.join(dir, 'sablon-original.mjs'));
    fs.writeFileSync(path.join(dir, 'sablon.mjs'), [
      "import fs from 'node:fs';",
      "import path from 'node:path';",
      "export * from './sablon-original.mjs';",
      'export function valideaza(date, ctx) {',
      "  fs.appendFileSync(path.join(ctx.dirProiect, 'date.json'), '\\n');",
      "  return { erori: [{ cod: 'valoare-invalida', camp: 'scene[0].titlu[0]', mesaj: 'Oprire de test.', sugestie: 'Nimic.' }], avertismente: [] };",
      '}',
      '',
    ].join('\n'));
  }
  return { ...t, date: path.join(t.radacina, 'video', 'p', 'date.json'), verificare: path.join(t.radacina, 'video', 'p', 'verificare.json') };
}

const DATE_PROBA = fs.readFileSync(path.join(REPO, 'teste', 'fixtures', 'sabloane', 'proba', 'exemple', 'minim.json'), 'utf8');

/** Proiectul p pe șablonul de probă, cu funcțiile învelite: fiecare apel își pune ctx-ul în globalThis.__ctxProba. */
function proiectProbaSpion() {
  const t = proiectProba(DATE_PROBA);
  const dir = path.join(t.radacina, 'motoare', 'hyperframes', 'sabloane', 'proba');
  fs.renameSync(path.join(dir, 'sablon.mjs'), path.join(dir, 'sablon-original.mjs'));
  fs.writeFileSync(path.join(dir, 'sablon.mjs'), [
    "import * as o from './sablon-original.mjs';",
    'const noteaza = (functie, ctx) => (globalThis.__ctxProba ??= []).push({ functie, ctx });',
    'export function valideaza(date, ctx) { noteaza("valideaza", ctx); return o.valideaza(date, ctx); }',
    'export function cronologie(date, stil, ctx) { noteaza("cronologie", ctx); return o.cronologie(date, stil, ctx); }',
    'export async function construieste(date, stil, cron, dir, ctx) { noteaza("construieste", ctx); return o.construieste(date, stil, cron, dir, ctx); }',
    'export function asteptari(cron, ctx) { noteaza("asteptari", ctx); return o.asteptari(cron, ctx); }',
    '',
  ].join('\n'));
  return t;
}

test('M6: pregatesteBuild dă fiecărei funcții a șablonului același ctx, cu modul real; valideaza se cheamă o dată', async (t) => {
  const proiect = proiectProbaSpion();
  t.after(proiect.curata);
  globalThis.__ctxProba = [];
  const p = await pregatesteBuild({ radacina: proiect.radacina, proiect: 'p', mod: 'schita' });
  assert.deepEqual(p.erori, []);
  const apeluri = globalThis.__ctxProba;
  assert.deepEqual(apeluri.map((a) => a.functie), ['valideaza', 'cronologie', 'asteptari', 'construieste']);
  for (const { functie, ctx } of apeluri) {
    assert.equal(ctx.mod, 'schita', functie);
    assert.equal(ctx.dirProiect, path.join(proiect.radacina, 'video', 'p'), functie);
    assert.ok(Object.hasOwn(ctx, 'brand') && Object.hasOwn(ctx, 'catalog') && Object.hasOwn(ctx, 'ff'), functie);
  }
  const dupaCronologie = apeluri.filter((a) => a.functie === 'asteptari' || a.functie === 'construieste');
  for (const { ctx } of dupaCronologie) assert.ok(ctx.stil !== null && Object.hasOwn(ctx, 'intern'));
  assert.equal(p.ctx.mod, 'schita');
});

test('pregatesteBuild: sha256Date e hash-ul octeților citiți, și când datele au erori (SEC-1)', async (t) => {
  // C02 (schema) și C01 (JSON invalid) opresc pregătirea înaintea temelor, deci rădăcina de test nu are nevoie de motoare/comun
  for (const date of [DATE_PROBA.replace('"vertical"', '"pătrat-greșit"'), '{ "sablon": ']) {
    const proiect = proiectProba(date);
    t.after(proiect.curata);
    const p = await pregatesteBuild({ radacina: proiect.radacina, proiect: 'p', mod: 'doar-verificare' });
    assert.ok(p.erori.length > 0);
    assert.equal(p.sha256Date, sha256Fisier(proiect.date));
  }
});

test('mg randeaza --doar-verificare: date.json schimbat în timpul rulării dă C01 picat și hash-ul datelor citite (SEC-1)', async (t) => {
  const proiect = proiectProba(DATE_PROBA, { modificaInValideaza: true });
  t.after(proiect.curata);
  const citit = sha256Fisier(proiect.date);
  const r = await comandaRandeaza({ radacina: proiect.radacina, proiect: 'p', mod: 'doar-verificare' });
  assert.notEqual(sha256Fisier(proiect.date), citit, 'șablonul de test a schimbat date.json');
  const v = JSON.parse(fs.readFileSync(proiect.verificare, 'utf8'));
  assert.equal(v.ok, false);
  assert.equal(v.sha256_date, citit);
  const c01 = v.verificari.filter((x) => x.cod === 'C01' && x.ok === false);
  assert.equal(c01.length, 1, JSON.stringify(v.verificari));
  assert.equal(c01[0].erori[0].cod, 'date-schimbate-in-randare');
  assert.match(c01[0].erori[0].mesaj, /date\.json s-a schimbat în timpul rulării/);
  assert.ok(r.erori.some((e) => e.cod === 'date-schimbate-in-randare'));
});

test('M3: grupeazaPeVerificari folosește câmpul verificare al erorii', () => {
  const g = grupeazaPeVerificari([{ cod: 'prea-repede-de-citit', camp: 'a', mesaj: 'm', sugestie: 's', verificare: 'S02' }], []);
  assert.deepEqual([...g.keys()], ['S02']);
});

test('M3: rezultat acceptă S01-S99 și refuză S00 și S100', () => {
  assert.equal(rezultat('S13', true).cod, 'S13');
  assert.equal(rezultat('S99', true).cod, 'S99');
  assert.throws(() => rezultat('S00', true), TypeError);
  assert.throws(() => rezultat('S100', true), TypeError);
});

// M2, runda de reparații după review: eroarea unui hook nu se pierde când șablonul n-are coduri S de stadiul lui.
const MIN_HOOK = ['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08', 'C09', 'C10', 'C11', 'C16', 'C17'];
const apelHook = (sablon, stadiu, apel, rezultate) => verificariSablon({
  sablon, stadiu, functie: stadiu === 'build' ? 'verificariBuild' : 'verificariProprii', descriere: 'de test', apel, sugestie: 'Nimic.', rezultate,
});

test('M2: verificariSablon adaugă rezultatele valide ale hook-ului, fără să schimbe lista primită', async () => {
  const s = { nume: 't', meta: { verificari: [...MIN_HOOK, 'S05'], stadii: { S05: 'build' } } };
  const inainte = [rezultat('C10', true)];
  const picat = { cod: 'valoare-invalida', camp: 'build', mesaj: 'Test.', sugestie: 'Nimic.' };
  const r = await apelHook(s, 'build', () => [rezultat('S05', false, { camp: 'build', erori: [picat] })], inainte);
  assert.deepEqual(r.map((x) => [x.cod, x.ok]), [['C10', true], ['S05', false]]);
  assert.equal(inainte.length, 1);
});

test('M2: verificariSablon cu S05 nedeclarat ca build (rămas de date) face C10 picat, cu eroarea internă adăugată', async () => {
  const s = { nume: 't', meta: { verificari: [...MIN_HOOK, 'S05'] } };
  const c10 = rezultat('C10', true, { valoare: { ok: true } });
  const r = await apelHook(s, 'build', () => [rezultat('S05', false)], [rezultat('C01', true), c10]);
  assert.deepEqual(r.map((x) => [x.cod, x.ok]), [['C01', true], ['C10', false]]);
  const nou = r.find((x) => x.cod === 'C10');
  assert.equal(nou.erori.length, 1);
  assert.equal(nou.erori[0].cod, 'eroare-interna');
  assert.equal(nou.erori[0].camp, 'build');
  assert.match(nou.erori[0].mesaj, /S05 nu e declarat în SABLON\.md cu stadiul build/);
  assert.deepEqual(nou.valoare, { ok: true });
  assert.equal(c10.ok, true, 'rezultatul inițial nu se modifică');
});

test('M2: verificariProprii care aruncă, fără coduri S de mp4, face C11 picat (existent sau nou)', async () => {
  const s = { nume: 't', meta: { verificari: [...MIN_HOOK] } };
  const arunca = () => { throw new Error('stricat'); };
  const cuC11 = await apelHook(s, 'mp4', arunca, [rezultat('C11', true)]);
  assert.deepEqual(cuC11.map((x) => [x.cod, x.ok]), [['C11', false]]);
  assert.match(cuC11[0].erori[0].mesaj, /Verificările de test ale șablonului t au căzut: stricat/);
  const faraC11 = await apelHook(s, 'mp4', arunca, []);
  assert.deepEqual(faraC11.map((x) => [x.cod, x.ok, x.camp]), [['C11', false, 'mp4']]);
});

test('M2: verificariSablon cu coduri S de stadiul hook-ului le face pe ele să pice, nu verificarea comună', async () => {
  const s = { nume: 't', meta: { verificari: [...MIN_HOOK, 'S02'], stadii: { S02: 'mp4' } } };
  const r = await apelHook(s, 'mp4', async () => { throw new Error('x'); }, [rezultat('C11', true)]);
  assert.deepEqual(r.map((x) => [x.cod, x.ok]), [['C11', true], ['S02', false]]);
});

// Review final, Important 1: un avertisment din stratul de date atribuit (M3) unui cod S de build nu-i dă acelui cod verde.
test('M2/M3: un avertisment din valideaza cu verificare S01 (de build) nu creează un S01 verde; fără S01 din hook, ok_pentru_aprobare e false', async (t) => {
  const date = fs.readFileSync(path.join(REPO, 'teste', 'fixtures', 'sabloane', 'proba-elemente', 'exemple', 'minim.json'), 'utf8');
  const proiect = creeazaRadacinaTemp({
    copiaza: ['nucleu/VERSIUNI.json'],
    sablonProbaElemente: true,
    biblioteciMini: true,
    fisiere: {
      'video/p/motor.lock': JSON.stringify({ ...LOCK_PROBA, sablon: { ...LOCK_PROBA.sablon, nume: 'proba-elemente' } }, null, 2) + '\n',
      'video/p/date.json': date,
    },
  });
  t.after(proiect.curata);
  const dir = path.join(proiect.radacina, 'motoare', 'hyperframes', 'sabloane', 'proba-elemente');
  fs.renameSync(path.join(dir, 'sablon.mjs'), path.join(dir, 'sablon-original.mjs'));
  fs.writeFileSync(path.join(dir, 'sablon.mjs'), [
    "export * from './sablon-original.mjs';",
    'export function valideaza() {',
    "  const a = (verificare) => ({ cod: 'valoare-invalida', camp: 'elemente[0].text', mesaj: 'Avertisment de test.', sugestie: 'Nimic.', verificare });",
    "  return { erori: [], avertismente: [a('S01'), a('S02')] };",
    '}',
    '',
  ].join('\n'));
  const p = await pregatesteBuild({ radacina: proiect.radacina, proiect: 'p', mod: 'doar-verificare' });
  assert.deepEqual(p.erori, []);
  const coduri = p.rezultate.map((r) => r.cod);
  assert.equal(coduri.includes('S01'), false, 'S01 e de build: nu primește verde din stratul de date');
  assert.equal(coduri.includes('S02'), false, 'S02 e de mp4: nu primește verde din stratul de date');
  assert.deepEqual(p.avertismente.map((a) => a.verificare), ['S01', 'S02'], 'avertismentele rămân în lista rulării');
  // Pasul comun: C10 și C17 verzi, iar un verificariBuild care nu întoarce S01.
  const rezultate = await verificariSablon({
    sablon: p.sablon, stadiu: 'build', functie: 'verificariBuild', descriere: 'de test', sugestie: 'Nimic.',
    rezultate: [...p.rezultate, rezultat('C10', true), rezultat('C17', true)],
    apel: () => [],
  });
  assert.equal(okPentruAprobare(rezultate, p.sablon), false);
  const obligatorii = declarate(p.sablon, ['date', 'build']);
  assert.equal(obligatorii.every((cod) => rezultate.some((r) => r.cod === cod)), false, 'S01 lipsește, deci ok e false');
});

test('Important 3: un hook care întoarce ok: true cu erori sau un cod C trece pe calea de eșec (codul S pică, cu eroare-interna)', async () => {
  const s = { nume: 't', meta: { verificari: [...MIN_HOOK, 'S02'], stadii: { S02: 'mp4' } } };
  const eroareHook = { cod: 'mp4-invalid', camp: 'mp4', mesaj: 'Test.', sugestie: 'Nimic.' };
  for (const intors of [
    [{ cod: 'S02', ok: true, valoare: null, prag: null, camp: null, erori: [eroareHook], avertismente: [] }],
    [{ cod: 'C11', ok: true, valoare: null, prag: null, camp: null, erori: [], avertismente: [] }],
    [{ cod: 'S02', ok: false, valoare: null, prag: null, camp: 'mp4', erori: [{ cod: 'mp4-invalid', camp: 'mp4' }], avertismente: [] }],
  ]) {
    const r = await apelHook(s, 'mp4', () => intors, [rezultat('C11', true)]);
    assert.deepEqual(r.map((x) => [x.cod, x.ok]), [['C11', true], ['S02', false]], JSON.stringify(intors));
    assert.equal(r[1].erori[0].cod, 'eroare-interna');
  }
  // fără coduri S de mp4, aceeași greșeală pică C11
  const faraS = { nume: 't', meta: { verificari: [...MIN_HOOK] } };
  const r = await apelHook(faraS, 'mp4', () => [{ cod: 'C11', ok: true, valoare: null, prag: null, camp: null, erori: [], avertismente: [] }], [rezultat('C11', true)]);
  assert.deepEqual(r.map((x) => [x.cod, x.ok]), [['C11', false]]);
});
