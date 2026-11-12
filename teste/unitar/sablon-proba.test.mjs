import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as proba from '../fixtures/sabloane/proba/sablon.mjs';
import { valideazaCronologie } from '../../nucleu/lib/cronologie.mjs';
import { creeazaCtx } from '../../nucleu/lib/context.mjs';
import { CODURI } from '../../nucleu/lib/erori.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';

const DIR_PROBA = fileURLToPath(new URL('../fixtures/sabloane/proba/', import.meta.url));
const citesteJson = (cale) => JSON.parse(readFileSync(join(DIR_PROBA, cale), 'utf8'));

/** ctx minim: SablonIncarcat construit de mână (incarcaSablon vine în A12, frontmatter-ul cere yaml). */
function ctxProba() {
  return creeazaCtx({
    radacina: '/nu-se-foloseste',
    proiect: 'proba',
    dirProiect: '/nu-se-foloseste/video/proba',
    sablon: { nume: 'proba', motor: 'hyperframes', dir: DIR_PROBA, meta: { fps: 30 }, schema: citesteJson('schema.json'), implicite: citesteJson('implicite.json'), modul: proba, sha256: '0'.repeat(64) },
    mod: 'doar-verificare',
  });
}

/** StilRezolvat minim (harta 5.5), cu valorile temei noapte. */
const STIL = {
  tema: { valoare: 'noapte', sursa: 'date' },
  culori: {
    fundal: { valoare: '#0E0F13', sursa: 'tema' },
    text: { valoare: '#F2EFEA', sursa: 'tema' },
    atenuat: { valoare: '#9A9AA3', sursa: 'tema' },
    accent: { valoare: '#FF7A59', sursa: 'tema' },
  },
};

const minim = () => citesteJson('exemple/minim.json');

test('șablonul de probă exportă exact interfața cerută, fără verificariProprii', () => {
  for (const nume of ['valideaza', 'cronologie', 'construieste', 'asteptari']) {
    assert.equal(typeof proba[nume], 'function', nume);
  }
  assert.equal(proba.verificariProprii, undefined);
});

test('fișierele șablonului există, iar JSON-urile se citesc', () => {
  const sablonMd = readFileSync(join(DIR_PROBA, 'SABLON.md'), 'utf8');
  assert.ok(sablonMd.startsWith('---\nnume: proba\n'));
  assert.match(sablonMd, /\nformate: \[vertical, patrat\]\n/);
  assert.match(sablonMd, /\nfps: 30\n/);
  assert.equal(citesteJson('schema.json').properties.sablon.const, 'proba');
  assert.deepEqual(Object.keys(citesteJson('implicite.json').formate), ['vertical', 'patrat']);
  assert.equal(minim().sablon, 'proba');
});

test('valideaza: minim.json trece; rândul gol și accentul neînchis pică pe câmpul exact', () => {
  assert.deepEqual(proba.valideaza(minim(), ctxProba()), { erori: [], avertismente: [] });
  const date = minim();
  date.scene[0].titlu[1] = '   ';
  date.scene[1].titlu[0] = 'un *accent';
  const { erori } = proba.valideaza(date, ctxProba());
  assert.deepEqual(erori.map((e) => [e.cod, e.camp]), [
    ['valoare-invalida', 'scene[0].titlu[1]'],
    ['accent-neinchis', 'scene[1].titlu[0]'],
  ]);
  for (const e of erori) {
    assert.ok(Object.hasOwn(CODURI, e.cod), e.cod);
    assert.deepEqual(Object.keys(e), ['cod', 'camp', 'mesaj', 'sugestie']);
  }
});

test('cronologie() pe minim.json trece valideazaCronologie', () => {
  const rezultat = proba.cronologie(minim(), STIL, ctxProba());
  assert.deepEqual(rezultat.erori, []);
  assert.deepEqual(rezultat.avertismente, []);
  assert.equal(rezultat.intern, null);
  assert.deepEqual(valideazaCronologie(rezultat.cronologie), []);
});

test('cronologie(): câte 3 s pe scenă, textele fără *, momentele sortate', () => {
  const { cronologie: cron } = proba.cronologie(minim(), STIL, ctxProba());
  assert.equal(cron.sablon, 'proba');
  assert.equal(cron.durata, 6);
  assert.equal(cron.fundal, '#0E0F13');
  assert.deepEqual(cron.segmente.map((s) => [s.ref, s.start, s.complet, s.sfarsit]), [['Scena 1', 0, 0.5, 3], ['Scena 2', 3, 3.5, 6]]);
  assert.deepEqual(cron.segmente[0].texte, ['Primul rând', 'cu accent']);
  assert.deepEqual(cron.momente_foaie.map((m) => m.t), [0.5, 3.5, 5.967]);
  assert.deepEqual(cron.ferestre_statice, [{ start: 0.5, sfarsit: 3, motiv: 'citire' }, { start: 3.5, sfarsit: 5.5, motiv: 'citire' }, { start: 5.5, sfarsit: 6, motiv: 'pauza-finala' }]);
});

test('cronologie() pe formatul patrat folosește dimensiunile lui', () => {
  const date = minim();
  date.format = 'patrat';
  const { cronologie: cron } = proba.cronologie(date, STIL, ctxProba());
  assert.equal(cron.inaltime, 1080);
  assert.deepEqual(valideazaCronologie(cron), []);
});

test('asteptari() întoarce textele fără marcajul *, la momentul complet', () => {
  const { cronologie: cron } = proba.cronologie(minim(), STIL, ctxProba());
  const a = proba.asteptari(cron);
  assert.deepEqual(a.texte.map((t) => [t.ref, t.text, t.t]), [
    ['Scena 1', 'Primul rând', 0.5],
    ['Scena 1', 'cu accent', 0.5],
    ['Scena 2', 'Ăîâșț ĂÎÂȘȚ', 3.5],
  ]);
  assert.ok(a.texte.every((t) => !t.text.includes('*')));
  assert.deepEqual(a.texte[0].zona_text, [96, 760, 888, 400]);
  assert.deepEqual(a.momente, [0.5, 3.5]);
  assert.deepEqual(a.audio, { prezent: false, durata: null });
  assert.equal(a.fundal, '#0E0F13');
});

test('construieste() scrie un index.html static, cu textele escape-uite și fără rețea', async () => {
  const date = minim();
  date.scene[1].titlu[0] = 'A & B <c>';
  const ctx = ctxProba();
  const { cronologie: cron } = proba.cronologie(date, STIL, ctx);
  const { radacina, curata } = creeazaRadacinaTemp();
  try {
    const dirBuild = join(radacina, 'video', 'proba', 'build');
    const rezultat = await proba.construieste(date, STIL, cron, dirBuild, ctx);
    assert.deepEqual(rezultat, { intrare: 'index.html', fisiere: ['index.html'] });
    const html = readFileSync(join(dirBuild, 'index.html'), 'utf8');
    assert.match(html, /<div id="root" data-composition-id="main" data-no-timeline data-start="0" data-duration="6" data-width="1080" data-height="1920">/);
    assert.match(html, /<p id="scena-1" class="clip" data-start="0" data-duration="3" data-track-index="0"/);
    assert.ok(html.includes('Primul rând<br>cu accent'));
    assert.ok(html.includes('A &amp; B &lt;c&gt;'));
    assert.equal(html.includes('*'), false);
    assert.equal(/https?:/.test(html), false);
    const aDouaOara = join(radacina, 'build2');
    await proba.construieste(date, STIL, cron, aDouaOara, ctx);
    assert.equal(readFileSync(join(aDouaOara, 'index.html'), 'utf8'), html, 'construieste trebuie să fie determinist');
  } finally {
    curata();
  }
});

test('creeazaRadacinaTemp({sablonProba: true}) pune șablonul în motoare/hyperframes/sabloane/proba', () => {
  const { radacina, curata } = creeazaRadacinaTemp({ sablonProba: true });
  try {
    for (const fisier of ['SABLON.md', 'schema.json', 'implicite.json', 'sablon.mjs', 'exemple/minim.json']) {
      assert.ok(existsSync(join(radacina, 'motoare/hyperframes/sabloane/proba', fisier)), fisier);
    }
  } finally {
    curata();
  }
});
