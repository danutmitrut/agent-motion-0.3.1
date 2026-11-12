// Poarta de înghețare (planul E, E10): locurile din nucleu care presupuneau forma reelului (`scene`, „Scena 1”,
// „Semnătura”, --sablon reel-ilustrat) merg și pe un șablon fără `scene`, ca proba-elemente.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existaInDate, verificaGoluri, verificaTextVizibil } from '../../nucleu/lib/verificari/pixeli.mjs';
import { campMasurare, verificaInghetare } from '../../nucleu/lib/verificari/mp4.mjs';
import { verificaDesene } from '../../nucleu/lib/desen/verifica.mjs';
import { pregatesteBuild } from '../../nucleu/lib/randeaza/pregatire.mjs';
import { comandaNou } from '../../nucleu/lib/nou.mjs';
import { extrageBlocMg } from '../../nucleu/lib/scenariu.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';

const REPO = fileURLToPath(new URL('../../', import.meta.url));

/** Serie la 10 fps de la 0 la `pana` (exclusiv), goală în intervalele [a, b) date. */
function serie(pana, goluri) {
  const rez = [];
  for (let k = 0; k < Math.round(pana * 10); k += 1) {
    const t = Math.round(k * 100) / 1000;
    rez.push({ t, gol: goluri.some(([a, b]) => t >= a - 1e-9 && t < b - 1e-9) });
  }
  return rez;
}

test('pregatire: proiectul lipsă sugerează --sablon <numele-șablonului>, fără un șablon anume', async (t) => {
  const { radacina, curata } = creeazaRadacinaTemp();
  t.after(curata);
  await assert.rejects(pregatesteBuild({ radacina, proiect: 'nu-exista', mod: 'doar-verificare' }), (e) => {
    assert.equal(e.eroareMg.cod, 'proiect-lipsa');
    assert.doesNotMatch(e.eroareMg.sugestie, /reel-ilustrat/);
    assert.match(e.eroareMg.sugestie, /nou nu-exista --sablon <numele-șablonului>/);
    return true;
  });
});

test('C13: câmpul măsurătorii vine din x.camp, apoi din segmentul cu același ref, altfel $', () => {
  const segmente = [{ ref: 'Elementul 1', camp: 'elemente[0]' }];
  assert.equal(campMasurare({ ref: 'Elementul 1', camp: 'elemente[0].text' }, segmente), 'elemente[0].text');
  assert.equal(campMasurare({ ref: 'Elementul 1' }, segmente), 'elemente[0]');
  assert.equal(campMasurare({ ref: 'Semnătura' }, segmente), '$');
  // reelul își pune singur camp pe semnătură (asteptari), deci nu pierde nimic
  assert.equal(campMasurare({ ref: 'Semnătura', camp: 'semnatura' }, []), 'semnatura');
});

test('C12: fără segmente, primul conținut târziu pică pe $ / Începutul videoului, cu sugestia generică', () => {
  const r = verificaGoluri(serie(6, [[0, 1.5]]));
  assert.equal(r.ok, false);
  assert.equal(r.erori[0].camp, '$');
  assert.match(r.erori[0].mesaj, /^Începutul videoului: primul conținut apare abia la 1,5 s/);
  assert.equal(r.erori[0].sugestie, 'Începe videoul cu un element vizibil de la prima secundă.');
});

test('C12: pe un segment fără titlu sau desen în date, sugestia nu numește .titlu sau .desen', () => {
  const segmente = [{ ref: 'Elementul 1', camp: 'elemente[0]', start: 0, sfarsit: 3 }];
  const date = { elemente: [{ text: 'Primul element' }] };
  const r = verificaGoluri(serie(6, [[0, 1.5]]), { segmente, date });
  assert.equal(r.erori[0].camp, 'elemente[0]');
  assert.match(r.erori[0].mesaj, /^Elementul 1: /);
  assert.equal(r.erori[0].sugestie, 'Începe videoul cu un element vizibil de la prima secundă.');
});

test('C12: pe reel (scena are titlu), sugestia rămâne cu câmpurile scenei care există', () => {
  const segmente = [{ ref: 'Scena 1', camp: 'scene[0]', start: 0, sfarsit: 4 }];
  const cuTitlu = verificaGoluri(serie(6, [[0, 1.5]]), { segmente, date: { scene: [{ tip: 'titlu', titlu: ['x'] }] } });
  assert.match(cuTitlu.erori[0].sugestie, /\(scene\[0\]\.titlu\)/);
  const ambele = verificaGoluri(serie(6, [[0, 1.5]]), { segmente, date: { scene: [{ titlu: ['x'], desen: { id: 'a' } }] } });
  assert.match(ambele.erori[0].sugestie, /\(scene\[0\]\.titlu sau scene\[0\]\.desen\)/);
});

test('C12, C13, C14: fără segment și fără camp, rezerva e $, nu scene', () => {
  const gol = verificaGoluri(serie(6, [[2, 4]]));
  assert.equal(gol.erori[0].camp, '$');
  const text = verificaTextVizibil([{ ref: 'X', t: 1, proportie: 0.001 }]);
  assert.equal(text.erori[0].camp, '$');
  const inghet = verificaInghetare([{ start: 0, durata: 3, sfarsit: 3 }], { durata: 6 });
  assert.equal(inghet.erori[0].camp, '$');
});

test('verificaDesene trece fără erori pe date fără scene', () => {
  const r = verificaDesene({ sablon: 'proba-elemente', elemente: [{ text: 'a' }] }, { piese: [] }, REPO);
  assert.deepEqual(r, { erori: [], avertismente: [] });
});

test('mg nou pe un șablon fără scene: scheletul n-are secțiuni de scenă, doar blocul mg', async (t) => {
  const { radacina, curata } = creeazaRadacinaTemp({ sablonProbaElemente: true, copiaza: ['nucleu/VERSIUNI.json'] });
  t.after(curata);
  const r = await comandaNou({ radacina, proiect: 'el', sablon: 'proba-elemente', acum: new Date('2026-10-14T10:00:00.000Z') });
  assert.equal(r.ok, true);
  const scenariu = fs.readFileSync(path.join(radacina, 'video', 'el', 'scenariu.md'), 'utf8');
  assert.doesNotMatch(scenariu, /## Scena/);
  assert.ok(extrageBlocMg(scenariu));
});

test('F10: pe un șablon fără scene și fără stil.atmosfera, sugestiile C12-C14 nu numesc câmpuri de reel', () => {
  const date = { sablon: 'proba-elemente', versiune_schema: 1, elemente: [{ text: 'Unu' }] };
  const segmente = [{ ref: 'Elementul 1', camp: 'elemente[0]', start: 0, sfarsit: 6 }];
  const goluri = verificaGoluri(serie(6, [[2, 4]]), { segmente, date });
  const text = verificaTextVizibil([{ ref: 'Elementul 1', camp: 'elemente[0]', t: 1, proportie: 0.9 }], { zone: 'casete', date });
  const zona = verificaTextVizibil([{ ref: 'Elementul 1', camp: 'elemente[0]', t: 1, proportie: 0.9 }], { zone: 'zona_text', date });
  const mic = verificaTextVizibil([{ ref: 'Elementul 1', camp: 'elemente[0]', t: 1, proportie: 0 }], { date });
  const inghet = verificaInghetare([{ start: 1, durata: 3, sfarsit: 4 }], { durata: 6, segmente, date });
  const sugestii = [goluri, text, zona, mic, inghet].flatMap((r) => r.erori.map((e) => e.sugestie));
  assert.equal(sugestii.length, 5, JSON.stringify(sugestii));
  for (const s of sugestii) {
    assert.doesNotMatch(s, /desen|atmosfera|ramane_pana_la|elemente\[0\]\.durata/, s);
    assert.match(s, /SABLON\.md/, s);
  }
});

test('F10: pe reel, sugestiile numesc câmpurile care există în date', () => {
  const date = { sablon: 'reel-ilustrat', versiune_schema: 1, stil: { atmosfera: 'ceata' }, scene: [{ tip: 'desen', durata: 4, desen: { id: 'x' }, titlu: ['A'] }] };
  const segmente = [{ ref: 'Scena 1', camp: 'scene[0]', start: 0, sfarsit: 6 }];
  const goluri = verificaGoluri(serie(6, [[2, 4]]), { segmente, date });
  assert.match(goluri.erori[0].sugestie, /scene\[0\]\.durata/);
  assert.match(goluri.erori[0].sugestie, /scene\[0\]\.desen\.ramane_pana_la/);
  const zona = verificaTextVizibil([{ ref: 'Scena 1', camp: 'scene[0]', t: 1, proportie: 0.9 }], { zone: 'zona_text', date });
  assert.match(zona.erori[0].sugestie, /scene\[0\]\.desen\.marime/);
  assert.match(zona.erori[0].sugestie, /stil\.atmosfera/);
  const inghet = verificaInghetare([{ start: 1, durata: 3, sfarsit: 4 }], { durata: 6, segmente, date });
  assert.match(inghet.erori[0].sugestie, /scene\[0\]\.durata/);
  assert.match(inghet.erori[0].sugestie, /stil\.atmosfera/);
});

const schemaReel = JSON.parse(fs.readFileSync(path.join(REPO, 'motoare', 'hyperframes', 'sabloane', 'reel-ilustrat', 'schema.json'), 'utf8'));
const schemaMinim = { type: 'object', additionalProperties: false, properties: { sablon: { type: 'string' }, elemente: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { text: { type: 'string' } } } } } };

test('F10 runda 1: pe reel, cu stil.atmosfera și durata omise, schema le permite și sugestiile le numesc', () => {
  const date = { sablon: 'reel-ilustrat', versiune_schema: 1, scene: [{ tip: 'desen', desen: { id: 'x' }, titlu: ['A'] }, { tip: 'card', titlu: ['B'] }] };
  const segmente = [{ ref: 'Scena 1', camp: 'scene[0]', start: 0, sfarsit: 6 }, { ref: 'Scena 2', camp: 'scene[1]', start: 6, sfarsit: 9 }];
  const casete = verificaTextVizibil([{ ref: 'Scena 1', camp: 'scene[0]', t: 1, proportie: 0.9 }], { zone: 'casete', date, schema: schemaReel });
  assert.match(casete.erori[0].sugestie, /stil\.atmosfera pe „plin”/);
  assert.doesNotMatch(casete.erori[0].sugestie, /SABLON\.md/);
  const inghet = verificaInghetare([{ start: 1, durata: 3, sfarsit: 4 }], { durata: 9, segmente, date, schema: schemaReel });
  assert.match(inghet.erori[0].sugestie, /scene\[0\]\.durata/);
  assert.match(inghet.erori[0].sugestie, /stil\.atmosfera/);
  const zona = verificaTextVizibil([{ ref: 'Scena 1', camp: 'scene[0]', t: 1, proportie: 0.9 }], { zone: 'zona_text', date, schema: schemaReel });
  assert.match(zona.erori[0].sugestie, /scene\[0\]\.desen\.marime/);
  // scena de tip card nu are desen în schemă: nu primește sugestia de desen
  const card = verificaTextVizibil([{ ref: 'Scena 2', camp: 'scene[1]', t: 7, proportie: 0.9 }], { zone: 'zona_text', date, schema: schemaReel });
  assert.doesNotMatch(card.erori[0].sugestie, /desen\.marime/);
});

test('F10 runda 1: o schemă fără stil.atmosfera nu o primește niciodată în sugestii', () => {
  const date = { sablon: 'minim', elemente: [{ text: 'Unu' }] };
  const segmente = [{ ref: 'Elementul 1', camp: 'elemente[0]', start: 0, sfarsit: 6 }];
  const rez = [
    verificaTextVizibil([{ ref: 'E', camp: 'elemente[0]', t: 1, proportie: 0.9 }], { zone: 'casete', date, schema: schemaMinim }),
    verificaTextVizibil([{ ref: 'E', camp: 'elemente[0]', t: 1, proportie: 0.9 }], { zone: 'zona_text', date, schema: schemaMinim }),
    verificaInghetare([{ start: 1, durata: 3, sfarsit: 4 }], { durata: 6, segmente, date, schema: schemaMinim }),
    verificaGoluri(serie(6, [[2, 4]]), { segmente, date, schema: schemaMinim }),
  ];
  for (const r of rez) {
    assert.doesNotMatch(r.erori[0].sugestie, /atmosfera|desen|durata/, r.erori[0].sugestie);
    assert.match(r.erori[0].sugestie, /SABLON\.md/);
  }
});

const schemaOneOf = {
  type: 'object',
  additionalProperties: false,
  properties: {
    scene: {
      type: 'array',
      items: {
        oneOf: [
          { $ref: '#/$defs/titlu' },
          { type: 'object', additionalProperties: false, properties: { tip: { const: 'desen' }, desen: { type: 'object' }, durata: { type: 'number' } } },
        ],
      },
    },
    ghicit: { allOf: [{ if: { required: ['x'] }, then: { properties: { secret: { type: 'string' } } } }] },
  },
  $defs: { titlu: { type: 'object', additionalProperties: false, properties: { tip: { enum: ['titlu'] }, text: { type: 'string' }, ritm: { type: 'string' } } } },
};

test('F10 runda 2: oneOf pe tip numește câmpurile ramurii proprii, niciodată ale altei ramuri', () => {
  const date = { scene: [{ tip: 'titlu', text: 'A' }, { tip: 'desen', desen: {} }] };
  assert.equal(existaInDate(date, 'scene[0].ritm', schemaOneOf), true, 'câmp opțional omis, din ramura proprie');
  assert.equal(existaInDate(date, 'scene[0].durata', schemaOneOf), false, 'durata e doar pe ramura desen');
  assert.equal(existaInDate(date, 'scene[0].desen', schemaOneOf), false);
  assert.equal(existaInDate(date, 'scene[1].durata', schemaOneOf), true);
  assert.equal(existaInDate(date, 'scene[1].ritm', schemaOneOf), false, 'ritm e doar pe ramura titlu');
  // fără discriminator în date: nu se alege nicio ramură
  assert.equal(existaInDate({ scene: [{ text: 'A' }] }, 'scene[0].durata', schemaOneOf), false);
  assert.equal(existaInDate({ scene: [{ tip: 'altceva' }] }, 'scene[0].ritm', schemaOneOf), false);
});

test('F10 runda 2: un allOf cu if fără properties nu se potrivește niciodată', () => {
  assert.equal(existaInDate({ ghicit: { x: 1 } }, 'ghicit.secret', schemaOneOf), false);
});
