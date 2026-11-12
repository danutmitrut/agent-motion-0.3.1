// Șablonul de probă cu elemente (planul E, E10): a doua implementare de referință, fără `scene`, cu hook-urile
// opționale. Testul rulează fără HyperFrames; poarta completă e în teste/integrare/poarta-inghetare.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as elemente from '../fixtures/sabloane/proba-elemente/sablon.mjs';
import { valideazaCronologie } from '../../nucleu/lib/cronologie.mjs';
import { creeazaCtx } from '../../nucleu/lib/context.mjs';
import { CODURI } from '../../nucleu/lib/erori.mjs';
import { incarcaSablon } from '../../nucleu/lib/sabloane.mjs';
import { valideazaPeSchema } from '../../nucleu/lib/schema.mjs';
import { pregatesteBuild } from '../../nucleu/lib/randeaza/pregatire.mjs';
import { verificaRezultateProprii } from '../../nucleu/lib/verificari/stadii.mjs';
import { genereazaBloc } from '../../nucleu/lib/scenariu.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const DIR = fileURLToPath(new URL('../fixtures/sabloane/proba-elemente/', import.meta.url));
const citesteJson = (cale) => JSON.parse(fs.readFileSync(path.join(DIR, cale), 'utf8'));
const minim = () => citesteJson('exemple/minim.json');

const STIL = {
  tema: { valoare: 'noapte', sursa: 'date' },
  culori: {
    fundal: { valoare: '#0E0F13', sursa: 'tema' },
    text: { valoare: '#F2EFEA', sursa: 'tema' },
    atenuat: { valoare: '#9A9AA3', sursa: 'tema' },
    accent: { valoare: '#FF7A59', sursa: 'tema' },
  },
};

function ctxElemente() {
  return creeazaCtx({
    radacina: '/nu-se-foloseste',
    proiect: 'p',
    dirProiect: '/nu-se-foloseste/video/p',
    sablon: { nume: 'proba-elemente', motor: 'hyperframes', dir: DIR, meta: { fps: 30 }, schema: citesteJson('schema.json'), implicite: citesteJson('implicite.json'), modul: elemente, sha256: '0'.repeat(64) },
    mod: 'doar-verificare',
  });
}

const lock = (sablon) => JSON.stringify({
  versiune: 1,
  proiect: 'p',
  creat_la: '2026-10-14T09:00:00.000Z',
  motor: { nume: 'hyperframes', versiune: '0.8.96' },
  sablon: { nume: sablon, versiune_schema: 1, sha256: 'a'.repeat(64) },
  versiuni_sha256: 'b'.repeat(64),
  active: {},
  aprobare: null,
  randari: { ultima_completa: null },
}, null, 2) + '\n';

/** Proiectul p pe unul dintre șabloanele de probă, cu datele din exemple/minim.json. */
function proiect(sablon) {
  const date = fs.readFileSync(path.join(REPO, 'teste', 'fixtures', 'sabloane', sablon, 'exemple', 'minim.json'), 'utf8');
  return creeazaRadacinaTemp({
    copiaza: ['nucleu/VERSIUNI.json'],
    sablonProba: sablon === 'proba',
    sablonProbaElemente: sablon === 'proba-elemente',
    biblioteciMini: true,
    fisiere: { 'video/p/motor.lock': lock(sablon), 'video/p/date.json': date },
  });
}

test('proba-elemente exportă interfața, cu toate hook-urile opționale', () => {
  for (const nume of ['valideaza', 'cronologie', 'construieste', 'asteptari', 'blocScenariu', 'verificariBuild', 'verificariProprii']) {
    assert.equal(typeof elemente[nume], 'function', nume);
  }
});

test('minim.json trece schema și valideaza; un text doar din spații dă valoare-invalida pe câmpul exact', () => {
  assert.deepEqual(valideazaPeSchema(citesteJson('schema.json'), minim()), []);
  assert.deepEqual(elemente.valideaza(minim(), ctxElemente()), { erori: [], avertismente: [] });
  const date = minim();
  date.elemente[1].text = '   ';
  const { erori } = elemente.valideaza(date, ctxElemente());
  assert.deepEqual(erori.map((e) => [e.cod, e.camp]), [['valoare-invalida', 'elemente[1].text']]);
  assert.ok(Object.hasOwn(CODURI, erori[0].cod));
  assert.deepEqual(Object.keys(erori[0]), ['cod', 'camp', 'mesaj', 'sugestie']);
});

test('schema: fără scene, cu elemente de 1-22 de caractere, fără chei în plus', () => {
  const schema = citesteJson('schema.json');
  const cuScene = { ...minim(), scene: [] };
  assert.ok(valideazaPeSchema(schema, cuScene).length > 0);
  const lung = minim();
  lung.elemente[0].text = 'x'.repeat(23);
  assert.ok(valideazaPeSchema(schema, lung).some((e) => e.camp.startsWith('elemente[0].text')));
  assert.ok(valideazaPeSchema(schema, { ...minim(), elemente: [] }).length > 0);
});

test('cronologie(): câte 3 s pe element, cu selectori, și trece valideazaCronologie', () => {
  const r = elemente.cronologie(minim(), STIL, ctxElemente());
  assert.deepEqual(r.erori, []);
  const cron = r.cronologie;
  assert.deepEqual(valideazaCronologie(cron), []);
  assert.equal(cron.durata, 6);
  assert.deepEqual(cron.segmente.map((s) => [s.ref, s.camp, s.tip, s.start, s.complet, s.sfarsit]), [
    ['Elementul 1', 'elemente[0]', 'text', 0, 0.5, 3],
    ['Elementul 2', 'elemente[1]', 'text', 3, 3.5, 6],
  ]);
  assert.deepEqual(cron.segmente.map((s) => s.selectori), [['#el-1'], ['#el-2']]);
  assert.deepEqual(cron.ferestre_statice, [{ start: 0.5, sfarsit: 3, motiv: 'citire' }, { start: 3.5, sfarsit: 5.5, motiv: 'citire' }, { start: 5.5, sfarsit: 6, motiv: 'pauza-finala' }]);
  assert.deepEqual(cron.momente_foaie.map((m) => m.t), [0.5, 3.5, 5.967]);
});

test('asteptari și blocScenariu: câmpul elemente[i].text, fontul text la 400', () => {
  const { cronologie: cron } = elemente.cronologie(minim(), STIL, ctxElemente());
  const a = elemente.asteptari(cron);
  assert.deepEqual(a.texte.map((t) => [t.ref, t.camp, t.text, t.t]), [
    ['Elementul 1', 'elemente[0].text', 'Primul element', 0.5],
    ['Elementul 2', 'elemente[1].text', 'Ăîâșț ĂÎÂȘȚ', 3.5],
  ]);
  const bloc = elemente.blocScenariu(minim(), STIL, cron, ctxElemente());
  assert.deepEqual(bloc.stil, ['Elemente: 2']);
  assert.deepEqual(bloc.texte[0], {
    ref: 'Elementul 1', camp: 'elemente[0].text', eticheta: 'text', text: 'Primul element', accent: false, separat: false, font: 'text', greutate: 400,
  });
});

test('construieste, verificariBuild și verificariProprii: S01 și S02 au forma lui rezultat()', async (t) => {
  const { radacina, curata } = creeazaRadacinaTemp();
  t.after(curata);
  const ctx = ctxElemente();
  const date = minim();
  date.elemente[0].text = 'A & B <c>';
  const { cronologie: cron } = elemente.cronologie(date, STIL, ctx);
  const dirBuild = path.join(radacina, 'build');
  assert.deepEqual(await elemente.construieste(date, STIL, cron, dirBuild, ctx), { intrare: 'index.html', fisiere: ['index.html'] });
  const html = fs.readFileSync(path.join(dirBuild, 'index.html'), 'utf8');
  assert.match(html, /<div id="root" data-composition-id="main" data-no-timeline data-proba-elemente data-start="0" data-duration="6"/);
  assert.match(html, /<p id="el-1" class="clip" data-start="0" data-duration="3"/);
  assert.ok(html.includes('A &amp; B &lt;c&gt;'));
  assert.equal(/https?:/.test(html), false);

  const sablon = { nume: 'proba-elemente', meta: { verificari: ['S01', 'S02'], stadii: { S01: 'build', S02: 'mp4' } } };
  const s01 = elemente.verificariBuild(dirBuild, ctx);
  assert.deepEqual(verificaRezultateProprii(s01, sablon, 'build', 'verificariBuild').map((r) => [r.cod, r.ok]), [['S01', true]]);
  fs.writeFileSync(path.join(dirBuild, 'index.html'), '<html></html>');
  const picat = elemente.verificariBuild(dirBuild, ctx);
  assert.equal(picat[0].ok, false);
  assert.ok(Object.hasOwn(CODURI, picat[0].erori[0].cod));

  const mp4 = path.join(radacina, 'p.mp4');
  fs.writeFileSync(mp4, '');
  assert.equal((await elemente.verificariProprii(mp4, ctx))[0].ok, false);
  fs.writeFileSync(mp4, 'ceva');
  const s02 = await elemente.verificariProprii(mp4, ctx);
  assert.deepEqual(verificaRezultateProprii(s02, sablon, 'mp4', 'verificariProprii').map((r) => [r.cod, r.ok]), [['S02', true]]);
});

test('incarcaSablon acceptă proba-elemente, cu stadiile S01: build și S02: mp4, fără C15', async (t) => {
  const { radacina, curata } = creeazaRadacinaTemp({ sablonProbaElemente: true });
  t.after(curata);
  for (const d of ['motoare/comun/teme', 'motoare/comun/fonturi']) assert.ok(fs.existsSync(path.join(radacina, d)), d);
  const s = await incarcaSablon(radacina, 'proba-elemente');
  assert.equal(s.nume, 'proba-elemente');
  assert.deepEqual(s.meta.stadii, { S01: 'build', S02: 'mp4' });
  assert.equal(s.meta.verificari.includes('C15'), false);
  assert.deepEqual(s.meta.durata, { min: 3, max: 15, implicita: 6 });
});

test('pregatesteBuild pe proba-elemente: fără erori, blocul din blocScenariu, fără S01, S02 și C15 printre rezultate', async (t) => {
  const p0 = proiect('proba-elemente');
  t.after(p0.curata);
  const p = await pregatesteBuild({ radacina: p0.radacina, proiect: 'p', mod: 'doar-verificare' });
  assert.deepEqual(p.erori, []);
  assert.deepEqual(p.bloc.texte.map((x) => [x.ref, x.camp, x.text, x.font, x.greutate]), [
    ['Elementul 1', 'elemente[0].text', 'Primul element', 'text', 400],
    ['Elementul 2', 'elemente[1].text', 'Ăîâșț ĂÎÂȘȚ', 'text', 400],
  ]);
  assert.deepEqual(p.bloc.stil, ['Elemente: 2']);
  assert.match(genereazaBloc(p.bloc), /\n- Elementul 1, text: „Primul element”\n- Elementul 2, text: „Ăîâșț ĂÎÂȘȚ”\n/);
  const coduri = p.rezultate.map((r) => r.cod);
  for (const cod of ['S01', 'S02', 'C15']) assert.equal(coduri.includes(cod), false, cod);
  assert.ok(p.rezultate.every((r) => r.ok), JSON.stringify(p.rezultate.filter((r) => !r.ok)));
  assert.ok(fs.existsSync(path.join(p0.radacina, 'video', 'p', 'build', 'index.html')));
});

test('pregatesteBuild pe proba (fără blocScenariu): fără erori, cu blocul implicit', async (t) => {
  const p0 = proiect('proba');
  t.after(p0.curata);
  const p = await pregatesteBuild({ radacina: p0.radacina, proiect: 'p', mod: 'doar-verificare' });
  assert.deepEqual(p.erori, []);
  assert.deepEqual(p.bloc.texte.map((x) => [x.ref, x.eticheta, x.text]), [
    ['Scena 1', null, 'Primul rând'], ['Scena 1', null, 'cu accent'], ['Scena 2', null, 'Ăîâșț ĂÎÂȘȚ'],
  ]);
  assert.equal(p.bloc.stil[0], 'Tema: noapte');
});
