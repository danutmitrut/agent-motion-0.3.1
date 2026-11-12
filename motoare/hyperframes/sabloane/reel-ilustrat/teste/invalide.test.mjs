// Fiecare fișier din invalide/ trebuie să pice exact cu {cod, camp} din asteptat.json,
// pe drumul pe care îl parcurge și mg randeaza: schema (C02), brandul (C02), apoi valideaza.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { incarcaSablon } from '../../../../../nucleu/lib/sabloane.mjs';
import { valideazaPeSchema } from '../../../../../nucleu/lib/schema.mjs';
import { citesteBrand, conflicteBrandDate } from '../../../../../nucleu/lib/brand.mjs';
import { creeazaRadacinaTemp } from '../../../../../teste/ajutoare/radacina-temp.mjs';

const AICI = path.dirname(fileURLToPath(import.meta.url));
const RADACINA = path.resolve(AICI, '..', '..', '..', '..', '..');
const DIR_INVALIDE = path.join(AICI, 'invalide');
const DIR_EXEMPLE = path.join(AICI, '..', 'exemple');
const FIXTURE_BRAND = path.join(RADACINA, 'teste', 'fixtures', 'branduri', 'studio-lemn', 'vizual.md');

let sablon;
let temp;

before(async () => {
  sablon = await incarcaSablon(RADACINA, 'reel-ilustrat');
  temp = creeazaRadacinaTemp({
    fisiere: {
      'branduri/studio-lemn/vizual.md': fs.readFileSync(FIXTURE_BRAND, 'utf8'),
      // T1/T18: brandul din revizuirea transversală, cu linie lungă, fără diacritice, 3 rânduri și un rând de peste 42
      'branduri/bb/vizual.md': `---\nmg: 1\nsemnatura: "Ana Popescu ${String.fromCharCode(0x2014)} coach de productivitate pentru antreprenori ocupati si stresati\\nlinia doi\\nlinia trei"\n---\n`,
    },
  });
});

after(() => temp?.curata());

function citeste(cale) {
  return JSON.parse(fs.readFileSync(cale, 'utf8'));
}

function valideazaComplet(date) {
  const deSchema = valideazaPeSchema(sablon.schema, date);
  if (deSchema.length > 0) return { erori: deSchema, avertismente: [] };
  let brand = null;
  if (typeof date.brand === 'string') {
    brand = citesteBrand(temp.radacina, date.brand);
    const conflicte = conflicteBrandDate(date, brand, 'reel-ilustrat');
    if (conflicte.length > 0) return { erori: conflicte, avertismente: [] };
  }
  const ctx = {
    brand,
    radacina: RADACINA,
    proiect: 'test',
    dirProiect: path.join(RADACINA, 'video', 'test'),
    sablon,
    mod: 'doar-verificare',
  };
  return sablon.modul.valideaza(date, ctx);
}

test('minim.json trece fără erori și fără avertismente', () => {
  const r = valideazaComplet(citeste(path.join(DIR_EXEMPLE, 'minim.json')));
  assert.deepEqual(r.erori, []);
  assert.deepEqual(r.avertismente, []);
});

test('exemplul complet din spec 7.1 trece fără erori', () => {
  const date = {
    sablon: 'reel-ilustrat', versiune_schema: 1, format: 'vertical', durata: 25,
    stil: { descriere: 'cald, prietenos, luminos', tema: 'hartie', ritm: 'normal', culori: { accent: '#D9486A' }, recolorare: 'tema' },
    semnatura: 'Ana Pop,\ncoach de carieră',
    scene: [
      { tip: 'desen', durata: 4, desen: { id: 'op-bust-telefon', marime: 'mare', ramane_pana_la: 2 }, eticheta: 'Luni, 8:30', titlu: ['Telefonul sună', '*din nou.*'] },
      { tip: 'adunare', durata: 4.5, iconite: ['phone', 'message-circle', 'calendar-x', 'mail', 'bell'], eticheta: 'Toată ziua', cuvinte: ['Reprogramări.', 'Anulări.', 'Mesaje.'] },
      { tip: 'retea', durata: 6, scanteie: true, eticheta: 'Altfel', titlu: ['Un agent preia', '*programările.*'] },
      { tip: 'desen', durata: 5, desen: { id: 'op-picioare-explica-ochelari', marime: 'mare' }, eticheta: 'Tu', titlu: ['Ai timp pentru', '*clienți.*'] },
      { tip: 'final', durata: 5.5, desen: { id: 'op-bust-cafea', marime: 'mediu' }, linie_accent: true, eticheta: 'Om + agent', titlu: ['Tu decizi,', '*agentul ține minte.*'], cta: 'Scrie „AGENT” în comentarii' },
    ],
  };
  const r = valideazaComplet(date);
  assert.deepEqual(r.erori, []);
});

test('avertismentul fara-diacritice nu oprește validarea', () => {
  const date = citeste(path.join(DIR_EXEMPLE, 'minim.json'));
  date.scene[0].titlu = ['Faci totul si singur.'];
  const r = valideazaComplet(date);
  assert.deepEqual(r.erori, []);
  assert.deepEqual(r.avertismente.map((a) => [a.cod, a.camp]), [['fara-diacritice', 'scene[0].titlu[0]']]);
});

test('muzica validă pe schemă trece de valideaza (pasul 4: reelul acceptă muzică)', () => {
  const date = citeste(path.join(DIR_EXEMPLE, 'minim.json'));
  date.muzica = { fisier: 'resurse/muzica.mp3', volum: 0.4, incepe_de_la: 4.0 };
  const { erori } = valideazaComplet(date);
  assert.deepEqual(erori, []);
});

// Decizia lui Dănuț din 2026-10-06 (B17, I3): un card doar cu etichetă ocupă sub 0,3% din cadru și ar pica sigur
// C12 (și C14 pe curat) abia după randare, cu un mesaj fals; valideaza îl oprește înainte, pe scena lui.
function cuCard(card) {
  const date = citeste(path.join(DIR_EXEMPLE, 'minim.json'));
  date.scene.splice(1, 0, { tip: 'card', ...card });
  return date;
}

test('card doar cu etichetă: valideaza îl refuză pe scene[i], cu sugestia de titlu sau desen', () => {
  const { erori } = valideazaComplet(cuCard({ eticheta: 'Luni, 8:30' }));
  assert.deepEqual(erori.map((e) => [e.cod, e.camp]), [['valoare-invalida', 'scene[1]']]);
  assert.match(erori[0].mesaj, /^Scena 2 \(card\) are doar eticheta „Luni, 8:30”, fără titlu/);
  assert.match(erori[0].sugestie, /scene\[1\]\.titlu/);
  assert.match(erori[0].sugestie, /scene\[1\]\.cuvinte/);
  assert.match(erori[0].sugestie, /„desen”.*scene\[1\]\.desen\.id/);
});

test('card fără niciun text: refuzat la fel, pe scene[i]', () => {
  const { erori } = valideazaComplet(cuCard({}));
  assert.deepEqual(erori.map((e) => [e.cod, e.camp]), [['valoare-invalida', 'scene[1]']]);
  assert.match(erori[0].mesaj, /^Scena 2 \(card\) nu are niciun text/);
});

test('card cu etichetă și titlu, card cu etichetă și cuvinte: acceptate', () => {
  for (const card of [
    { eticheta: 'Luni, 8:30', titlu: ['Telefonul sună.'] },
    { eticheta: 'Luni, 8:30', cuvinte: ['Telefon.', 'Mesaje.'] },
    { titlu: ['Fără etichetă.'] },
  ]) {
    const { erori } = valideazaComplet(cuCard(card));
    assert.deepEqual(erori, [], JSON.stringify(card));
  }
});

test('desenul nu e permis pe card (schema), deci eticheta cu desen se scrie ca scenă desen, care trece', () => {
  const { erori } = valideazaComplet(cuCard({ eticheta: 'Luni, 8:30', desen: { id: 'op-bust-cafea' } }));
  assert.deepEqual(erori.map((e) => [e.cod, e.camp]), [['camp-necunoscut', 'scene[1].desen']]);
  const date = citeste(path.join(DIR_EXEMPLE, 'minim.json'));
  date.scene.splice(1, 0, { tip: 'desen', eticheta: 'Luni, 8:30', desen: { id: 'op-bust-cafea' } });
  assert.deepEqual(valideazaComplet(date).erori, []);
});

test('T1/T18: semnătura din fișa de brand trece prin C03 și C04, cu câmpul brand', () => {
  const date = citeste(path.join(DIR_EXEMPLE, 'minim.json'));
  date.brand = 'bb';
  const { erori, avertismente } = valideazaComplet(date);
  assert.deepEqual(erori.map((e) => [e.cod, e.camp]), [
    ['liniuta-lunga', 'brand'],
    ['rand-nu-incape', 'brand'],
    ['rand-nu-incape', 'brand'],
  ]);
  assert.deepEqual(avertismente.map((e) => [e.cod, e.camp]), [['fara-diacritice', 'brand']]);
  for (const e of [...erori, ...avertismente]) {
    assert.match(e.mesaj, /Semnătura din brandul „bb”/, e.mesaj);
    assert.doesNotMatch(e.sugestie, /date\.json/, e.sugestie);
  }
  assert.match(erori[1].sugestie, /branduri\/bb\/vizual\.md/);
});

// Minorele din revizia finală: T3 (reel fără niciun text), T2 (finalul doar ca ultimă scenă), T5 (accentul doar în titlu).

test('T3: un reel fără niciun text (titlu, cuvinte, etichetă, îndemn, semnătură) e refuzat la validare, cu mesaj clar', () => {
  const date = citeste(path.join(DIR_EXEMPLE, 'minim.json'));
  for (const s of date.scene) delete s.titlu;
  const { erori } = valideazaComplet(date);
  assert.deepEqual(erori.map((e) => [e.cod, e.camp]), [['valoare-invalida', 'scene']]);
  assert.match(erori[0].mesaj, /niciun text/);
  assert.match(erori[0].sugestie, /scene\[0\]\.titlu/);
  // un singur text (aici, semnătura) ajunge: zona „Texte și cifre” nu mai e goală și scenariul se poate aproba
  assert.deepEqual(valideazaComplet({ ...date, semnatura: 'Ana Pop' }).erori, []);
});

test('T2: scena final doar ca ultimă scenă și cel mult una', () => {
  const date = citeste(path.join(DIR_EXEMPLE, 'minim.json'));
  date.durata = 30;
  date.scene.splice(1, 0, { tip: 'final', titlu: ['Tot un final.'], cta: 'Scrie-mi' });
  const { erori } = valideazaComplet(date);
  assert.deepEqual(erori.map((e) => [e.cod, e.camp]), [['valoare-invalida', 'scene[1].tip']]);
  assert.match(erori[0].mesaj, /Scena 2 e de tip final, dar nu e ultima/);
  assert.match(erori[0].sugestie, /scene\[1\]\.tip/);
});

test('T5: accentul *...* în cuvinte e refuzat (pe ecran ar dispărea), cu sugestia care trimite la titlu', () => {
  const date = citeste(path.join(DIR_EXEMPLE, 'minim.json'));
  date.scene[1] = { tip: 'adunare', iconite: ['phone', 'mail'], cuvinte: ['*Azi*', 'Mâine.'] };
  const { erori } = valideazaComplet(date);
  assert.deepEqual(erori.map((e) => [e.cod, e.camp]), [['text-cu-cod', 'scene[1].cuvinte[0]']]);
  assert.doesNotMatch(erori[0].sugestie, /sau în cuvinte/);
});

test('C05: un desen lc- (traseu) e refuzat de schemă, cu mesaj fără lc-', () => {
  const date = citeste(path.join(DIR_EXEMPLE, 'minim.json'));
  // id-ul interzis se compune la rulare, ca fișierul să nu conțină tiparul lc- (tiparele pazei din teste/ajutoare/)
  date.scene[0].desen.id = ['lc', 'coplesit-laptop'].join('-');
  const { erori } = valideazaComplet(date);
  assert.deepEqual(erori.map((e) => [e.cod, e.camp]), [['valoare-invalida', 'scene[0].desen.id']]);
  assert.doesNotMatch(erori[0].mesaj, /lc-/);
  assert.match(erori[0].mesaj, /od-, op-, p- sau b-/);
});

const asteptat = citeste(path.join(DIR_INVALIDE, 'asteptat.json'));
const fisiere = fs.readdirSync(DIR_INVALIDE).filter((f) => f.endsWith('.json') && f !== 'asteptat.json').sort();

test('asteptat.json acoperă exact fișierele din invalide/ (12-15 cazuri)', () => {
  assert.deepEqual(Object.keys(asteptat).sort(), fisiere);
  assert.ok(fisiere.length >= 12 && fisiere.length <= 15, `sunt ${fisiere.length} cazuri`);
});

for (const fisier of fisiere) {
  test(`${fisier} pică exact cu ${asteptat[fisier]?.cod} pe ${asteptat[fisier]?.camp}`, () => {
    const { erori } = valideazaComplet(citeste(path.join(DIR_INVALIDE, fisier)));
    assert.ok(erori.length > 0, 'fișierul trebuia să pice');
    assert.deepEqual({ cod: erori[0].cod, camp: erori[0].camp }, asteptat[fisier]);
    for (const e of erori) {
      assert.ok(e.mesaj.length > 0 && e.sugestie.length > 0, `eroare fără mesaj sau sugestie: ${JSON.stringify(e)}`);
    }
  });
}
