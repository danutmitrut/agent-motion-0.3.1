import { test } from 'node:test';
import assert from 'node:assert/strict';
import { principal } from '../../nucleu/mg.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';
import { construiesteCompozitieArata, ID_COMPOZITIE } from '../../nucleu/lib/desen/arata.mjs';

const NOAPTE = { id: 'noapte', culori: { fundal: '#0E0F13', text: '#F2EFEA', atenuat: '#9A9AA3', accent: '#FF7A59' } };
const HARTIE = { id: 'hartie', culori: { fundal: '#F3EBDD', text: '#2A2420', atenuat: '#6B6157', accent: '#C2410C' } };
const TRASEU = { id: 'traseu-proba', tip: 'traseu', noapte: 'bun', traseu: { w: 100, h: 50, paths: ['M0 0 L100 50', 'M0 50 L100 0'] } };
const FORMA = { id: 'od-meditating', tip: 'forma', noapte: 'evita',
  svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" data-piesa="od-meditating"><path class="acc" d="M0 0h5v5z"/><g class="ink"><path d="M5 5h5v5z"/></g></svg>' };
const numara = (html, tipar) => (html.match(tipar) ?? []).length;

test('compoziția are data-composition-id și o celulă pe piesă (trei pe traseu)', () => {
  const r = construiesteCompozitieArata([TRASEU, FORMA], HARTIE);
  assert.match(r.html, new RegExp(`data-composition-id="${ID_COMPOZITIE}" data-start="0" data-duration="1"`));
  assert.match(r.html, new RegExp(`window.__timelines = \\{ "${ID_COMPOZITIE}": tl \\}`));
  assert.equal(numara(r.html, /class="celula/g), 4);
  assert.deepEqual(r.celule.map((c) => [c.id, c.progres]), [['traseu-proba', 0.3], ['traseu-proba', 0.6], ['traseu-proba', 1], ['od-meditating', null]]);
  assert.equal(numara(r.html, /data-progres="/g), 3);
  assert.match(r.html, />traseu-proba 30%</);
  assert.match(r.html, />od-meditating</);
});

test('timpii: durata 1 s și o singură captură la 0,5 s', () => {
  const r = construiesteCompozitieArata([FORMA], HARTIE);
  assert.equal(r.durata, 1);
  assert.deepEqual(r.momente, [0.5]);
});

test('mărimea foii urmează numărul de celule (cel mult 4 pe rând)', () => {
  const unu = construiesteCompozitieArata([FORMA], HARTIE);
  assert.deepEqual([unu.latime, unu.inaltime], [364, 408]);
  const cinci = construiesteCompozitieArata([TRASEU, FORMA, FORMA], HARTIE);
  assert.deepEqual([cinci.latime, cinci.inaltime], [1324, 772]);
  assert.match(cinci.html, /data-width="1324" data-height="772"/);
});

test('culorile vin din temă, iar pe noapte piesele evita și autocolant stau pe panou', () => {
  const pe = construiesteCompozitieArata([TRASEU, FORMA], NOAPTE);
  assert.match(pe.html, /--fundal:#0E0F13;--text:#F2EFEA;--linie:#F2EFEA;--accent:#FF7A59/);
  assert.deepEqual(pe.celule.map((c) => c.panou), [false, false, false, true]);
  assert.match(pe.html, /od-meditating \(pe panou\)/);
  const zi = construiesteCompozitieArata([FORMA], HARTIE);
  assert.deepEqual(zi.celule.map((c) => c.panou), [false]);
});

test('HTML-ul e determinist și fără referințe http', () => {
  const a = construiesteCompozitieArata([TRASEU, FORMA], NOAPTE).html;
  const b = construiesteCompozitieArata([TRASEU, FORMA], NOAPTE).html;
  assert.equal(a, b);
  assert.doesNotMatch(a.replace(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, ''), /https?:\/\//);
});

test('mg desen arata --proiect ajunge la comandaDesen (proiect inexistent: proiect-lipsa, fără randare)', async (t) => {
  const { radacina, curata } = creeazaRadacinaTemp({ biblioteciMini: true, copiaza: ['motoare/comun/teme'] });
  t.after(curata);
  let iesire = '';
  const stdout = { write(s) { iesire += s; return true; } };
  const cod = await principal(['desen', 'arata', 'traseu-proba', '--proiect', 'nu-exista', '--json'], { radacina, stdout });
  assert.equal(cod, 3, iesire);
  const json = JSON.parse(iesire);
  assert.equal(json.erori[0].cod, 'proiect-lipsa');
  assert.equal(json.erori[0].camp, 'argumente.proiect');
});

test('un id inexistent dă desen-necunoscut pe argumente.id, fără randare, iar subcomanda necunoscută numește toate subcomenzile', async (t) => {
  const { radacina, curata } = creeazaRadacinaTemp({ biblioteciMini: true, copiaza: ['motoare/comun/teme'] });
  t.after(curata);
  let iesire = '';
  const stdout = { write(s) { iesire += s; return true; } };
  assert.equal(await principal(['desen', 'arata', 'nu-exista-piesa', '--json'], { radacina, stdout }), 3, iesire);
  const e = JSON.parse(iesire).erori[0];
  assert.equal(e.cod, 'desen-necunoscut');
  assert.equal(e.camp, 'argumente.id');
  iesire = '';
  assert.equal(await principal(['desen', 'altceva', '--json'], { radacina, stdout }), 3, iesire);
  const n = JSON.parse(iesire).erori[0];
  assert.equal(n.cod, 'comanda-necunoscuta');
  for (const sub of ['lista', 'cauta', 'verifica', 'adauga', 'arata']) assert.match(n.sugestie, new RegExp(sub));
});

// Revizuirea transversală B01-B13, T13: aceeași regulă a căii ca în build, înainte de orice copiere sau randare.
test('T13: un „fisier” din catalog-propriu.json care iese din proprii/ dă valoare-invalida, fără randare', async (t) => {
  const { radacina, curata } = creeazaRadacinaTemp({
    biblioteciMini: true,
    copiaza: ['motoare/comun/teme'],
    fisiere: {
      'proprii/catalog-propriu.json': `${JSON.stringify({ versiune: 1, piese: [{ id: 'p-x', tip: 'forma', familie: 'proprie', fisier: '../../../Desktop/poza.png', licenta: 'a mea', cutie: { w: 100, h: 100 } }] }, null, 2)}\n`,
    },
  });
  t.after(curata);
  let iesire = '';
  const stdout = { write(s) { iesire += s; return true; } };
  assert.equal(await principal(['desen', 'arata', 'p-x', '--json'], { radacina, stdout }), 1, iesire);
  const e = JSON.parse(iesire).erori[0];
  assert.equal(e.cod, 'valoare-invalida');
  assert.equal(e.camp, 'fisier:proprii/catalog-propriu.json');
});
