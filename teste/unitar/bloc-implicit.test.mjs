// Blocul „Ce apare pe ecran” fără hook (planul E, M1): nucleul îl derivă din asteptari().texte și din segmente.
// Cu hook, blocPentru cheamă blocScenariu al șablonului și îi validează strict rezultatul.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { blocImplicit, blocPentru } from '../../nucleu/lib/randeaza/bloc.mjs';
import { pregatesteBuild } from '../../nucleu/lib/randeaza/pregatire.mjs';
import { genereazaBloc, MARCAJ_START } from '../../nucleu/lib/scenariu.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const NOAPTE = { tema: { valoare: 'noapte', sursa: 'implicit' } };

test('M1: fără blocScenariu, blocul vine din asteptari și din segmente', () => {
  const cron = { segmente: [
    { ref: 'Scena 1', camp: 'scene[0]', tip: 'titlu', start: 0, complet: 0.5, sfarsit: 1, zona_text: [0, 0, 1, 1], texte: ['Primul rând', 'cu accent'] },
    { ref: 'Scena 2', camp: 'scene[1]', tip: 'titlu', start: 1, complet: 1.5, sfarsit: 2, zona_text: [0, 0, 1, 1], texte: ['Ăîâșț ĂÎÂȘȚ'] },
  ] };
  const asteptari = { texte: cron.segmente.flatMap((s) => s.texte.map((text) => ({ ref: s.ref, text, t: s.complet, zona_text: s.zona_text }))) };
  const b = blocImplicit({ cronologie: cron, asteptari, stil: NOAPTE });
  assert.deepEqual(b.texte.map((t) => [t.ref, t.camp, t.eticheta, t.text]), [
    ['Scena 1', 'scene[0]', null, 'Primul rând'], ['Scena 1', 'scene[0]', null, 'cu accent'], ['Scena 2', 'scene[1]', null, 'Ăîâșț ĂÎÂȘȚ'],
  ]);
  assert.deepEqual(b.stil, ['Tema: noapte', 'Scena 1 (titlu): 0,0-1,0 s, complet la 0,5 s', 'Scena 2 (titlu): 1,0-2,0 s, complet la 1,5 s']);
  assert.ok(b.texte.every((t) => t.accent === false && t.separat === false));
});

test('M1: blocImplicit păstrează camp-ul dat de asteptari, pune $ când nu are segment, și sare tema când stilul n-o are', () => {
  const cron = { segmente: [{ ref: 'Scena 1', camp: 'scene[0]', tip: 'titlu', start: 0, complet: 0.25, sfarsit: 1.5 }] };
  const asteptari = { texte: [
    { ref: 'Scena 1', camp: 'scene[0].titlu[1]', text: 'Explicit' },
    { ref: 'Coda', text: 'Fără segment' },
  ] };
  const b = blocImplicit({ cronologie: cron, asteptari, stil: {} });
  assert.deepEqual(b.texte, [
    { ref: 'Scena 1', camp: 'scene[0].titlu[1]', eticheta: null, text: 'Explicit', accent: false, separat: false, font: 'titlu', greutate: 700 },
    { ref: 'Coda', camp: '$', eticheta: null, text: 'Fără segment', accent: false, separat: false, font: 'titlu', greutate: 700 },
  ]);
  assert.deepEqual(b.stil, ['Scena 1 (titlu): 0,0-1,5 s, complet la 0,25 s']);
});

/** O pregătire minimă, cu un șablon al cărui modul e dat de test. */
const pregatire = (modul) => ({
  sablon: { nume: 't', modul },
  date: { d: 1 },
  stil: NOAPTE,
  cronologie: { segmente: [{ ref: 'Scena 1', camp: 'scene[0]', tip: 'titlu', start: 0, complet: 0.5, sfarsit: 1 }] },
  asteptari: { texte: [{ ref: 'Scena 1', text: 'Din asteptari' }] },
  ctx: { mod: 'doar-verificare' },
});

test('M1: blocPentru fără hook dă blocul implicit', () => {
  const p = pregatire({});
  assert.deepEqual(blocPentru(p), blocImplicit(p));
});

test('M1: blocPentru cheamă blocScenariu cu (date, stil, cronologie, ctx) și întoarce rezultatul validat', () => {
  const apeluri = [];
  const linie = { ref: 'Scena 1', camp: 'scene[0].x', eticheta: 'x', text: 'Din hook', accent: true, separat: false, font: 'titlu', greutate: 700 };
  const p = pregatire({ blocScenariu: (...a) => { apeluri.push(a); return { texte: [linie], stil: ['Rând propriu'] }; } });
  assert.deepEqual(blocPentru(p), { texte: [linie], stil: ['Rând propriu'] });
  assert.equal(apeluri.length, 1);
  assert.deepEqual(apeluri[0], [p.date, p.stil, p.cronologie, p.ctx]);
  assert.equal(apeluri[0][3], p.ctx);
});

test('M1: blocPentru refuză un rezultat al hook-ului cu formă greșită', () => {
  const bun = { ref: 'R', camp: 'c', eticheta: null, text: 't', accent: false, separat: false };
  const rezultate = [
    null,
    { texte: [bun] },
    { stil: [] },
    { texte: [{ ...bun, separat: undefined }], stil: [] },
    { texte: [bun], stil: [''] },
    { texte: [bun], stil: [3] },
    { texte: [bun], stil: 'Tema' },
    { texte: [bun], stil: [], altceva: 1 },
  ];
  for (const r of rezultate) {
    assert.throws(() => blocPentru(pregatire({ blocScenariu: () => r })), TypeError, JSON.stringify(r));
  }
});

// Șablonul de probă prin pregatesteBuild complet: p.bloc vine din varianta implicită.
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
const DATE_PROBA = fs.readFileSync(path.join(REPO, 'teste', 'fixtures', 'sabloane', 'proba', 'exemple', 'minim.json'), 'utf8');

function proiectProba(date) {
  const t = creeazaRadacinaTemp({
    copiaza: ['nucleu/VERSIUNI.json'],
    sablonProba: true,
    biblioteciMini: true,
    fisiere: { 'video/p/motor.lock': JSON.stringify(LOCK_PROBA, null, 2) + '\n', 'video/p/date.json': date },
  });
  return t;
}

test('M1: pe șablonul de probă (fără blocScenariu), pregatesteBuild dă p.bloc din asteptari', async (t) => {
  const proiect = proiectProba(DATE_PROBA);
  t.after(proiect.curata);
  const p = await pregatesteBuild({ radacina: proiect.radacina, proiect: 'p', mod: 'doar-verificare' });
  assert.deepEqual(p.erori, []);
  assert.equal(typeof p.sablon.modul.blocScenariu, 'undefined');
  assert.deepEqual(p.bloc.texte.map((x) => [x.ref, x.camp, x.text]), [
    ['Scena 1', 'scene[0]', 'Primul rând'], ['Scena 1', 'scene[0]', 'cu accent'], ['Scena 2', 'scene[1]', 'Ăîâșț ĂÎÂȘȚ'],
  ]);
  assert.equal(p.bloc.stil[0], 'Tema: noapte');
  assert.equal(p.bloc.stil.length, 3);
  const bloc = genereazaBloc(p.bloc);
  assert.ok(bloc.startsWith(MARCAJ_START));
  assert.match(bloc, /\n- Scena 1: „Primul rând”\n- Scena 1: „cu accent”\n- Scena 2: „Ăîâșț ĂÎÂȘȚ”\n/);
});

test('M1: p.bloc e null când pregătirea se oprește înainte de asteptari', async (t) => {
  const proiect = proiectProba(DATE_PROBA.replace('"vertical"', '"pătrat-greșit"'));
  t.after(proiect.curata);
  const p = await pregatesteBuild({ radacina: proiect.radacina, proiect: 'p', mod: 'doar-verificare' });
  assert.ok(p.erori.length > 0);
  assert.equal(p.bloc, null);
});
