import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planificaTimpi, planificaSpatiu, planifica } from '../plan.mjs';
import { incarcaCatalog } from '../../../../../nucleu/lib/desen/catalog.mjs';
import { verificaDesene } from '../../../../../nucleu/lib/desen/verifica.mjs';
import { creeazaRadacinaTemp } from '../../../../../teste/ajutoare/radacina-temp.mjs';

const AICI = path.dirname(fileURLToPath(import.meta.url));
const implicite = JSON.parse(readFileSync(path.join(AICI, '..', 'implicite.json'), 'utf8'));
const exemplu01 = JSON.parse(readFileSync(path.join(AICI, '..', 'exemple', '01-rutina-preluata.json'), 'utf8'));

const stil = (tema) => ({
  tema: { valoare: tema, sursa: 'date' },
  culori: tema === 'noapte'
    ? { fundal: { valoare: '#0E0F13', sursa: 'tema' }, text: { valoare: '#F2EFEA', sursa: 'tema' } }
    : { fundal: { valoare: '#F3EBDD', sursa: 'tema' }, text: { valoare: '#2A2420', sursa: 'tema' } },
  ritm: { valoare: 'normal', sursa: 'implicit' },
  atmosfera: { valoare: 'ceata', sursa: 'tema' },
  granulatie: { valoare: 0.1, sursa: 'tema' },
  eticheta: { valoare: { majuscule: true, spatiere: 0.16, prefix: '' }, sursa: 'tema' },
});

// catalog sintetic, cu cutii cunoscute, încărcat prin incarcaCatalog dintr-o rădăcină temporară
function piesa(id, tip, sursa, cutie, noapte) {
  return {
    id, tip, familie: tip === 'traseu' ? 'linie' : 'cerneala', sursa, original: `sintetic/${id}`,
    fisier: `${tip === 'traseu' ? 'trasee' : 'forme'}/${id}.${tip === 'traseu' ? 'json' : 'svg'}`,
    sha256: '0'.repeat(64), kb: 1, cutie, roluri: tip === 'traseu' ? [] : ['ink'], recolorabil: true,
    acoperire_cerneala: noapte === 'bun' ? 0.02 : noapte === 'autocolant' ? 0.1 : 0.3,
    personaj: { numar: 1, gen: 'ambiguu', poza: 'in-picioare', orientare: 'fata' },
    etichete: ['test', 'sintetic', 'formă', 'piesă'], descriere: 'Piesă de test.', noapte,
    teme_potrivite: noapte === 'evita' ? ['hartie', 'curat'] : ['noapte', 'hartie', 'curat'],
    animatie: tip === 'traseu' ? { implicit: 'linie', durata_s: 3.4, retragere: true } : { implicit: 'contur-umplere', alternative: ['aparitie'], esalonare: 0.06, accent: 'aparitie' },
  };
}
const CATALOG = {
  versiune: 1,
  surse: {
    'open-doodles': { nume: 'Test', autor: 'Test', url: '', descarcat_din: '', licenta: 'CC0-1.0', licenta_url: 'https://creativecommons.org/publicdomain/zero/1.0/', dovada: [], verificat: '2026-10-01', nota: '' },
    'open-peeps': { nume: 'Test', autor: 'Test', url: '', descarcat_din: '', licenta: 'CC0-1.0', licenta_url: 'https://creativecommons.org/publicdomain/zero/1.0/', dovada: [], verificat: '2026-10-01', nota: '' },
  },
  piese: [
    piesa('od-test-inalt', 'forma', 'open-doodles', { w: 600, h: 900 }, 'bun'),
    piesa('od-test-lat', 'forma', 'open-doodles', { w: 1000, h: 650 }, 'bun'),
    piesa('od-test-autocolant', 'forma', 'open-doodles', { w: 812, h: 690 }, 'autocolant'),
    piesa('op-test-autocolant', 'forma', 'open-peeps', { w: 500, h: 900 }, 'autocolant'),
  ],
  sinonime: {},
};

// desene generate prin mg genereaza: cu silueta (ink + fond) și doar cu cerneală (conturul nu s-a închis)
function generat(id, roluri) {
  return { ...piesa(id, 'forma', 'proprie', { w: 600, h: 600 }, 'autocolant'), familie: 'proprie', personaj: null, roluri,
    licenta: 'generat de cursant prin Kie (test)', generat: { model: 'test', data: '2026-10-26' } };
}
const PROPRII = { versiune: 1, piese: [generat('p-gen-silueta', ['ink', 'fond']), generat('p-gen-linie', ['ink'])] };

let tmp;
let catalog;
test.before(() => {
  tmp = creeazaRadacinaTemp({ fisiere: {
    'biblioteci/catalog.json': JSON.stringify(CATALOG, null, 2) + '\n',
    'proprii/catalog-propriu.json': JSON.stringify(PROPRII, null, 2) + '\n',
  } });
  catalog = incarcaCatalog(tmp.radacina);
});
test.after(() => tmp.curata());

const reel = (scene, durata) => ({ sablon: 'reel-ilustrat', versiune_schema: 1, format: 'vertical', durata, scene });
function spatiu(date, tema = 'noapte') {
  const timpi = planificaTimpi(date, stil(tema), implicite);
  assert.deepEqual(timpi.erori, [], 'datele de test trebuie să treacă de timpi');
  return planificaSpatiu(timpi.plan, date, catalog, implicite, stil(tema));
}
const coduri = (lista) => lista.map((e) => `${e.cod} ${e.camp}`);

test('S08: un desen mare cu ajustare.dy care iese sub 1594 dă reel-ilustrat-cutie-desen', () => {
  const date = reel([
    { tip: 'desen', durata: 5, desen: { id: 'od-test-inalt', marime: 'mare', ajustare: { dx: 0, dy: 200, scara: 1 } }, titlu: ['Prea jos.'] },
    { tip: 'final', durata: 5, titlu: ['Gata.'] },
  ], 10);
  const { plan, erori } = spatiu(date);
  assert.deepEqual(plan.desene[0].cutie, [306, 979, 469, 703]);
  assert.deepEqual(coduri(erori), ['reel-ilustrat-cutie-desen scene[0].desen.ajustare']);
});

test('S08: același desen fără ajustare încape (cutie centrată în zona de desen)', () => {
  const date = reel([
    { tip: 'desen', durata: 5, desen: { id: 'od-test-inalt', marime: 'mare' }, titlu: ['Bine.'] },
    { tip: 'final', durata: 5, titlu: ['Gata.'] },
  ], 10);
  const { plan, erori } = spatiu(date);
  assert.deepEqual(erori, []);
  assert.deepEqual({ x: plan.desene[0].x, y: plan.desene[0].y, s: plan.desene[0].s }, { x: 306, y: 779, s: 0.781 });
});

test('S12: ajustare.scara 1.3 dă avertismentul reel-ilustrat-ajustare, nu eroare', () => {
  const date = reel([
    { tip: 'desen', durata: 5, desen: { id: 'od-test-inalt', marime: 'mediu', ajustare: { dx: 0, dy: 0, scara: 1.3 } }, titlu: ['Mai mare.'] },
    { tip: 'final', durata: 5, titlu: ['Gata.'] },
  ], 10);
  const { erori, avertismente } = spatiu(date);
  assert.deepEqual(erori, []);
  assert.deepEqual(coduri(avertismente), ['reel-ilustrat-ajustare scene[0].desen.ajustare']);
});

test('decizia 7: pe tema noapte, o piesă autocolant primește panou dreptunghi în culoarea textului', () => {
  const date = reel([
    { tip: 'desen', durata: 5, desen: { id: 'od-test-autocolant', marime: 'mediu' }, titlu: ['Pe panou.'] },
    { tip: 'final', durata: 5, titlu: ['Gata.'] },
  ], 10);
  const { plan, erori } = spatiu(date);
  assert.deepEqual(erori, []);
  assert.equal(plan.desene[0].panou, 'dreptunghi');
  const [x, y, w, h] = plan.desene[0].cutie;
  assert.deepEqual(plan.panouri, [{ pentru: 'g-d1', cutie: [x - 24, y - 24, w + 48, h + 48], culoare: '#F2EFEA' }]);
});

test('decizia 7: la Open Peeps panoul vine din piesă (inversat), fără dreptunghi', () => {
  const date = reel([
    { tip: 'desen', durata: 5, desen: { id: 'op-test-autocolant', marime: 'mediu' }, titlu: ['Decupat.'] },
    { tip: 'final', durata: 5, titlu: ['Gata.'] },
  ], 10);
  const { plan } = spatiu(date);
  assert.equal(plan.desene[0].panou, 'inversat');
  assert.deepEqual(plan.panouri, []);
});

test('decizia 7: un desen generat cu siluetă primește panoul inversat, ca Open Peeps; fără siluetă, dreptunghiul (felia 5)', () => {
  for (const [id, panou] of [['p-gen-silueta', 'inversat'], ['p-gen-linie', 'dreptunghi']]) {
    const date = reel([
      { tip: 'desen', durata: 5, desen: { id, marime: 'mediu' }, titlu: ['Generat.'] },
      { tip: 'final', durata: 5, titlu: ['Gata.'] },
    ], 10);
    const { plan, erori } = spatiu(date);
    assert.deepEqual(erori, [], id);
    assert.equal(plan.desene[0].panou, panou, id);
  }
});

test('pe tema hartie, piesa autocolant nu primește panou', () => {
  const date = reel([
    { tip: 'desen', durata: 5, desen: { id: 'od-test-autocolant', marime: 'mediu' }, titlu: ['Fără panou.'] },
    { tip: 'final', durata: 5, titlu: ['Gata.'] },
  ], 10);
  const { plan } = spatiu(date, 'hartie');
  assert.equal(plan.desene[0].panou, null);
  assert.deepEqual(plan.panouri, []);
});

test('S09: mai mult de 6 iconițe vizibile deodată dau reel-ilustrat-aglomerare', () => {
  const sase = ['mail', 'phone', 'bell', 'receipt', 'calendar-x', 'file-text'];
  const date = reel([
    { tip: 'card', durata: 3, titlu: ['Început.'] },
    { tip: 'adunare', durata: 5, iconite: sase, eticheta: 'Dimineața' },
    { tip: 'adunare', durata: 5, iconite: sase, eticheta: 'Seara' },
    { tip: 'final', durata: 5, titlu: ['Gata.'] },
  ], 18);
  const { erori } = spatiu(date);
  assert.deepEqual(coduri(erori), ['reel-ilustrat-aglomerare scene[2].iconite']);
});

test('S09: două desene simultane care se suprapun peste 10% dau reel-ilustrat-aglomerare', () => {
  const date = reel([
    { tip: 'desen', durata: 4, desen: { id: 'od-test-lat', marime: 'mare', ramane_pana_la: 2 }, titlu: ['Unul.'] },
    { tip: 'card', durata: 3, titlu: ['Pauză.'] },
    { tip: 'final', durata: 5, desen: { id: 'od-test-inalt', marime: 'mare' }, titlu: ['Altul.'] },
  ], 12);
  const timpi = planificaTimpi(date, stil('noapte'), implicite);
  // cu regulile de timp, primul desen începe retragerea la 6,8 s, iar al doilea pornește la 8,5 s: nu sunt simultane
  assert.deepEqual(planificaSpatiu(timpi.plan, date, catalog, implicite, stil('noapte')).erori, []);
  // un plan de timpi în care al doilea desen ar porni la 5,0 s (de exemplu după o schimbare a constantelor)
  timpi.plan.desene[1].draw = [5.0, 2.5];
  const { erori } = planificaSpatiu(timpi.plan, date, catalog, implicite, stil('noapte'));
  assert.deepEqual(coduri(erori), ['reel-ilustrat-aglomerare scene[2].desen.marime']);
});

test('S11: accentul pe o parte de rând și titlul cu cuvinte dau reel-ilustrat-accent', () => {
  const date = reel([
    { tip: 'desen', durata: 5, desen: { id: 'od-test-inalt' }, titlu: ['Un *accent* parțial'] },
    { tip: 'final', durata: 5, titlu: ['Gata.'], cuvinte: ['Unu.', 'Doi.'] },
  ], 10);
  const timpi = planificaTimpi(date, stil('noapte'), implicite);
  const { erori } = planificaSpatiu(timpi.plan, date, catalog, implicite, stil('noapte'));
  assert.deepEqual(coduri(erori), ['reel-ilustrat-accent scene[0].titlu[0]', 'reel-ilustrat-accent scene[1].cuvinte']);
});

test('iconițele se așază în arc deasupra desenului rămas, în cadru și sub zona de text', () => {
  const date = reel([
    { tip: 'desen', durata: 4.4, desen: { id: 'od-test-lat', marime: 'mare', ramane_pana_la: 2 }, titlu: ['Unul.'] },
    { tip: 'adunare', durata: 5.2, iconite: ['mail', 'phone', 'bell', 'receipt', 'calendar-x', 'file-text'], cuvinte: ['A.', 'B.'] },
    { tip: 'final', durata: 5.4, titlu: ['Gata.'] },
  ], 15);
  const { plan } = spatiu(date);
  const m = 24 * implicite.iconite.scara;
  assert.equal(plan.iconite[0].pozitii.length, 6);
  for (const [x, y] of plan.iconite[0].pozitii) {
    assert.ok(x >= 24 && x + m <= 1080 - 24, `x ${x}`);
    assert.ok(y >= 480 + 24 && y + m <= 1594, `y ${y}`);
  }
  assert.ok(plan.iconite[0].pozitii[0][1] < plan.desene[0].cutie[1] + plan.desene[0].cutie[3] / 2);
});

test('planifica pe exemplul 01 cu biblioteca mini: fără erori, chei în ordinea din 5.17, S10 trece', () => {
  const mini = creeazaRadacinaTemp({ biblioteciMini: true, copiaza: ['motoare/comun/iconite'] }); // S10 citește catalogul Lucide din rădăcină
  try {
    const ctx = { radacina: mini.radacina, sablon: { nume: 'reel-ilustrat', implicite } };
    const r = planifica(exemplu01, stil('noapte'), ctx);
    assert.deepEqual(r.erori, []);
    assert.deepEqual(Object.keys(r.plan), ['versiune', 'durata', 'fps', 'latime', 'inaltime', 'atmosfera', 'desene', 'iconite', 'retele', 'linii', 'carduri', 'cta', 'semnatura', 'panouri']);
    assert.deepEqual(Object.keys(r.plan.desene[0]), ['g', 'scena', 'id', 'tip', 'familie', 'animatie', 'x', 'y', 's', 'oglindit', 'panou', 'cutie', 'draw', 'undraw']);
    assert.match(r.plan.linii[0].d, /^M-40 \d+ C /);
    assert.equal(JSON.stringify(planifica(exemplu01, stil('noapte'), ctx)), JSON.stringify(r));
    const s10 = verificaDesene(exemplu01, incarcaCatalog(mini.radacina), mini.radacina);
    assert.deepEqual(s10.erori, []);
  } finally {
    mini.curata();
  }
});
