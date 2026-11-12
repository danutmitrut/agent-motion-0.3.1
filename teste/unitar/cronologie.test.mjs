import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rotunjeste, valideazaCronologie, tabelCronologie } from '../../nucleu/lib/cronologie.mjs';
import { CODURI } from '../../nucleu/lib/erori.mjs';

/** Cronologia validă din harta 5.4, completată cu ultimul cadru (25 - 1/30 = 24,967). */
function cronologieValida() {
  return {
    versiune: 1,
    sablon: 'reel-ilustrat',
    format: 'vertical',
    latime: 1080,
    inaltime: 1920,
    fps: 30,
    durata: 25,
    fundal: '#F3EBDD',
    segmente: [
      {
        ref: 'Scena 1',
        camp: 'scene[0]',
        tip: 'desen',
        start: 0,
        complet: 2.15,
        sfarsit: 4,
        zona_text: [96, 200, 888, 280],
        texte: ['Luni, 8:30', 'Telefonul sună', 'din nou.'],
      },
      {
        ref: 'Scena 2',
        camp: 'scene[1]',
        tip: 'card',
        start: 4,
        complet: 6.4,
        sfarsit: 23.5,
        zona_text: [96, 200, 888, 280],
        texte: ['Programări | online'],
      },
    ],
    ferestre_statice: [{ start: 23.5, sfarsit: 25, motiv: 'pauza-finala' }],
    momente_foaie: [
      { t: 2.15, ref: 'Scena 1', eticheta: 'Scena 1, complet' },
      { t: 6.4, ref: 'Scena 2', eticheta: 'Scena 2, complet' },
      { t: 24.967, ref: 'Scena 2', eticheta: 'Ultimul cadru' },
    ],
    audio: null,
  };
}

const campuri = (erori) => erori.map((e) => e.camp);

test('rotunjeste: 3 zecimale implicit, Math.round(x * 10^z) / 10^z', () => {
  assert.equal(rotunjeste(2.15004), 2.15);
  assert.equal(rotunjeste(0.1 + 0.2), 0.3);
  assert.equal(rotunjeste(25 - 1 / 30), 24.967);
  assert.equal(rotunjeste(1.23456, 2), 1.23);
  assert.equal(rotunjeste(7), 7);
});

test('o cronologie validă trece fără erori', () => {
  assert.deepEqual(valideazaCronologie(cronologieValida()), []);
});

test('audio cu fișier și fundal „filmare” sunt acceptate', () => {
  const cron = cronologieValida();
  cron.fundal = 'filmare';
  cron.sursa_video = { fisier: 'build/filmare.mp4', start: 0, latime: 1080, inaltime: 1920, focus_x: 50 };
  cron.audio = { fisier: 'build/assets/muzica.m4a', durata: 25 };
  assert.deepEqual(valideazaCronologie(cron), []);
});

test('start după complet pică pe camp ...complet', () => {
  const cron = cronologieValida();
  cron.segmente[0].start = 3;
  const erori = valideazaCronologie(cron);
  assert.deepEqual(campuri(erori), ['cronologie.segmente[0].complet']);
  assert.equal(erori[0].cod, 'cronologie-invalida');
});

test('un timp cu 4 zecimale pică pe câmpul lui', () => {
  const cron = cronologieValida();
  cron.segmente[0].complet = 2.1501;
  assert.deepEqual(campuri(valideazaCronologie(cron)), ['cronologie.segmente[0].complet']);
});

test('momente_foaie nesortate pică pe momentul ieșit din ordine', () => {
  const cron = cronologieValida();
  [cron.momente_foaie[0], cron.momente_foaie[1]] = [cron.momente_foaie[1], cron.momente_foaie[0]];
  assert.deepEqual(campuri(valideazaCronologie(cron)), ['cronologie.momente_foaie[1].t']);
});

test('două momente la mai puțin de 0,1 s sunt dubluri; la exact 0,1 s nu', () => {
  const cron = cronologieValida();
  cron.momente_foaie.splice(1, 0, { t: 2.2, ref: 'Scena 1', eticheta: 'extra' });
  assert.deepEqual(campuri(valideazaCronologie(cron)), ['cronologie.momente_foaie[1].t']);
  cron.momente_foaie[1].t = 2.25;
  assert.deepEqual(valideazaCronologie(cron), []);
});

test('lipsa momentului complet sau a ultimului cadru pică pe momente_foaie', () => {
  const cron = cronologieValida();
  cron.momente_foaie = cron.momente_foaie.filter((m) => m.t !== 6.4);
  assert.deepEqual(campuri(valideazaCronologie(cron)), ['cronologie.momente_foaie']);
  const cron2 = cronologieValida();
  cron2.momente_foaie.pop();
  assert.deepEqual(campuri(valideazaCronologie(cron2)), ['cronologie.momente_foaie']);
});

test('sfârșitul după durată, zona în afara cadrului și textul cu * pică pe câmpul exact', () => {
  const a = cronologieValida();
  a.segmente[1].sfarsit = 25.5;
  assert.deepEqual(campuri(valideazaCronologie(a)), ['cronologie.segmente[1].sfarsit']);
  const b = cronologieValida();
  b.segmente[0].zona_text = [96, 1800, 888, 280];
  assert.deepEqual(campuri(valideazaCronologie(b)), ['cronologie.segmente[0].zona_text']);
  const c = cronologieValida();
  c.segmente[0].texte[1] = 'Telefonul *sună*';
  assert.deepEqual(campuri(valideazaCronologie(c)), ['cronologie.segmente[0].texte[1]']);
});

test('câmpurile lipsă, în plus sau cu tip greșit au camp exact', () => {
  const a = cronologieValida();
  delete a.fps;
  a.titlu = 'x';
  assert.deepEqual(campuri(valideazaCronologie(a)).sort(), ['cronologie.fps', 'cronologie.titlu']);
  const b = cronologieValida();
  b.latime = 1920;
  assert.deepEqual(campuri(valideazaCronologie(b)), ['cronologie.latime']);
  const c = cronologieValida();
  c.fundal = 'negru';
  assert.deepEqual(campuri(valideazaCronologie(c)), ['cronologie.fundal']);
  assert.deepEqual(campuri(valideazaCronologie(null)), ['cronologie']);
  assert.deepEqual(campuri(valideazaCronologie([])), ['cronologie']);
});

test('M9: segmentul acceptă detalii (obiect) și selectori (listă de șiruri), ambele opționale', () => {
  const cron = cronologieValida();
  cron.segmente[0].detalii = { ancora: { fraza: 'Telefonul sună', t: 1.2 } };
  cron.segmente[0].selectori = ['#scena-1 .eticheta', '#scena-1 .rand-1', '#scena-1 .rand-2'];
  assert.deepEqual(valideazaCronologie(cron), []);
});

test('M9: detalii care nu e obiect și selectori greșiți dau cronologie-invalida pe câmpul exact', () => {
  const cron = cronologieValida();
  cron.segmente[0].detalii = ['nu', 'obiect'];
  cron.segmente[0].selectori = ['#a', '', '#a'];
  const campuri = valideazaCronologie(cron).map((e) => e.camp);
  assert.ok(campuri.includes('cronologie.segmente[0].detalii'), campuri.join(', '));
  assert.ok(campuri.includes('cronologie.segmente[0].selectori'), campuri.join(', '));
});

test('M9 (review final): selectori are exact câte un selector pe text; gol, dublură și lungime greșită, fiecare separat', () => {
  const cu = (selectori) => {
    const cron = cronologieValida();
    cron.segmente[0].selectori = selectori;
    return valideazaCronologie(cron).filter((e) => e.camp === 'cronologie.segmente[0].selectori');
  };
  const n = cronologieValida().segmente[0].texte.length;
  assert.equal(n, 3);
  assert.equal(cu(['#a']).length, 1, 'mai puțini selectori decât texte');
  assert.match(cu(['#a']).at(0).mesaj, /selectori are 1 elemente, iar texte 3/);
  assert.equal(cu(['#a', '#b', '#c', '#d']).length, 1, 'mai mulți selectori decât texte');
  assert.equal(cu(['#a', '', '#c']).length, 1, 'selector gol');
  assert.equal(cu(['#a', '#b', '#a']).length, 1, 'dublură');
  assert.deepEqual(cu(['#a', '#b', '#c']), []);
});

test('M9: detalii null este respins', () => {
  const cron = cronologieValida();
  cron.segmente[0].detalii = null;
  assert.ok(valideazaCronologie(cron).some((e) => e.camp === 'cronologie.segmente[0].detalii'));
});

test('M9: un câmp necunoscut pe segment rămâne eroare', () => {
  const cron = cronologieValida();
  cron.segmente[0].altceva = 1;
  assert.ok(valideazaCronologie(cron).some((e) => e.camp === 'cronologie.segmente[0].altceva'));
});

test('fiecare eroare are forma comună și un cod din CODURI', () => {
  const cron = cronologieValida();
  cron.segmente[0].start = 3;
  cron.segmente[1].complet = 6.40001;
  for (const e of valideazaCronologie(cron)) {
    assert.ok(Object.hasOwn(CODURI, e.cod));
    assert.match(e.camp, /^cronologie(\.|$)/);
    assert.ok(e.mesaj.startsWith('Cronologia: '));
    assert.ok(e.sugestie.length > 0);
  }
});

test('tabelCronologie: antetul și câte un rând pe segment', () => {
  assert.equal(tabelCronologie(cronologieValida()), [
    'Durata 25 s, 30 fps, vertical 1080x1920, fundal #F3EBDD.',
    '',
    '| Ref | Tip | Start | Complet | Sfârșit | Texte |',
    '| --- | --- | --- | --- | --- | --- |',
    '| Scena 1 | desen | 0 | 2,15 | 4 | Luni, 8:30 / Telefonul sună / din nou. |',
    '| Scena 2 | card | 4 | 6,4 | 23,5 | Programări \\| online |',
    '',
  ].join('\n'));
});

test('sursa_video: obligatorie la fundal filmare, interzisă altfel; banda pe segment', () => {
  const baza = cronologieValida();
  const sv = { fisier: 'build/filmare.mp4', start: 0.4, latime: 1080, inaltime: 1920, focus_x: 50 };
  assert.deepEqual(valideazaCronologie({ ...baza, fundal: 'filmare', sursa_video: sv }), []);
  assert.match(valideazaCronologie({ ...baza, fundal: 'filmare' }).map((e) => e.camp).join(), /cronologie\.sursa_video/);
  assert.match(valideazaCronologie({ ...baza, sursa_video: sv }).map((e) => e.camp).join(), /cronologie\.sursa_video/);
  for (const rau of [{ ...sv, fisier: '/abs.mp4' }, { ...sv, start: -1 }, { ...sv, focus_x: 101 }, { ...sv, latime: 0 }, { ...sv, extra: 1 }]) {
    assert.ok(valideazaCronologie({ ...baza, fundal: 'filmare', sursa_video: rau }).length > 0, JSON.stringify(rau));
  }
  const cuBanda = { ...baza, segmente: baza.segmente.map((s) => ({ ...s, banda: 'sus' })) };
  assert.deepEqual(valideazaCronologie(cuBanda), []);
  assert.ok(valideazaCronologie({ ...baza, segmente: baza.segmente.map((s) => ({ ...s, banda: '' })) }).length > 0);
});
