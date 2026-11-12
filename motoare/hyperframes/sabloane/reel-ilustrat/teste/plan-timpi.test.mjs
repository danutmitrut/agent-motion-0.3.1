import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planificaTimpi } from '../plan.mjs';
import { valideaza } from '../sablon.mjs';
import { rotunjeste } from '../../../../../nucleu/lib/cronologie.mjs';

const AICI = path.dirname(fileURLToPath(import.meta.url));
const implicite = JSON.parse(readFileSync(path.join(AICI, '..', 'implicite.json'), 'utf8'));
const stil = (ritm = 'normal') => ({
  tema: 'hartie', ritm, atmosfera: 'ceata', granulatie: 0.06,
  eticheta: { majuscule: true, spatiere: 0.16, prefix: '' },
  culori: { fundal: '#F3EBDD', text: '#2A2420', atenuat: '#6B6157', accent: '#D9486A', linie: '#2A2420' },
  semnatura: null,
});
const cu = (modificare) => {
  const copie = structuredClone(implicite);
  modificare(copie);
  return copie;
};
// ș și ț cu sedilă, en dash și em dash, construite din coduri ca fișierul să nu le conțină
const INTERZISE = new RegExp(`[${String.fromCharCode(0x15f, 0x163, 0x15e, 0x162, 0x2013, 0x2014)}]`);
const coduri = (erori) => erori.map((e) => `${e.cod} ${e.camp}`);

// exemplul complet din spec 7.1 (exemple/02-programari-25s.json)
const PROGRAMARI = {
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

// exemple/minim.json din spec 7.1
const MINIM = {
  sablon: 'reel-ilustrat', versiune_schema: 1, format: 'vertical',
  scene: [
    { tip: 'desen', desen: { id: 'op-bust-telefon' }, titlu: ['Faci totul singur.'] },
    { tip: 'retea', titlu: ['Un sistem', '*preia rutina.*'] },
    { tip: 'final', desen: { id: 'op-picioare-explica-ochelari' }, titlu: ['Tu decizi.'] },
  ],
};

test('exemplul 02 (25 s) se planifică fără erori', () => {
  const { plan, erori } = planificaTimpi(PROGRAMARI, { ...stil(), semnatura: PROGRAMARI.semnatura }, implicite);
  assert.deepEqual(erori, []);
  assert.equal(plan.durata, 25);
  assert.equal(plan.atmosfera.aprinde, 8.75);
  assert.deepEqual(plan.retele[0].scanteie, [13.1, 1]);
  assert.equal(plan.retele[0].retrag, 14.7);
  assert.deepEqual(plan.desene[1].draw, [15.7, 3.4]);
  assert.deepEqual(plan.cta, { text: 'Scrie „AGENT” în comentarii', intra: 21.6 });
  assert.equal(plan.carduri[0].eticheta, 'LUNI, 8:30');
  assert.deepEqual(plan.carduri[0].randuri, [{ text: 'Telefonul sună', accent: false }, { text: 'din nou.', accent: true }]);
});

test('minimul fără durate primește 30 s împărțite pe ponderi', () => {
  const { plan, segmente, erori } = planificaTimpi(MINIM, stil(), implicite);
  assert.deepEqual(erori, []);
  assert.equal(plan.durata, 30);
  assert.deepEqual(segmente.map((s) => [s.start, s.sfarsit]), [[0, 8.8], [8.8, 19.4], [19.4, 30]]);
  assert.equal(plan.retele[0].din, null);
  assert.equal(plan.retele[0].noduri, 6);
});

test('durate parțiale: scenele fără durată împart timpul rămas pe ponderi, cu minimul tipului', () => {
  // 30 s, scenele 0 și 2 au durată (6 + 9 = 15 s); rămân 15 s pentru scenele 1 (adunare, 1,1) și 3 (final, 1,2)
  const date = {
    sablon: 'reel-ilustrat', versiune_schema: 1, durata: 30,
    scene: [
      { tip: 'desen', durata: 6, desen: { id: 'op-bust-telefon' }, titlu: ['Faci totul singur.'] },
      { tip: 'adunare', iconite: ['mail', 'phone', 'bell'], eticheta: 'Toată ziua' },
      { tip: 'retea', durata: 9, titlu: ['Un sistem'] },
      { tip: 'final', desen: { id: 'op-picioare-explica-ochelari' }, titlu: ['Tu decizi.'] },
    ],
  };
  const { segmente, plan, erori } = planificaTimpi(date, stil(), implicite);
  assert.deepEqual(erori, []);
  const durate = segmente.map((s) => rotunjeste(s.sfarsit - s.start));
  assert.equal(durate[0], 6);
  assert.equal(durate[2], 9);
  // 15 s pe ponderile 1,1 și 1,2: 7,17 și 7,83, rotunjite cu cel mai mare rest la zecimi, suma exactă
  assert.deepEqual([durate[1], durate[3]], [7.2, 7.8]);
  assert.equal(rotunjeste(durate.reduce((a, d) => a + d, 0)), 30);
  assert.equal(plan.durata, 30);
});

test('durate parțiale: o scenă a cărei cotă e sub minim primește minimul, restul se reîmparte', () => {
  // 20 s, scena 0 are 10 s; rămân 10 s pentru adunare cu 6 iconițe (min 5 s) și final (min 3,5 s)
  const date = {
    sablon: 'reel-ilustrat', versiune_schema: 1, durata: 20,
    scene: [
      { tip: 'desen', durata: 10, desen: { id: 'op-bust-telefon' }, titlu: ['Faci totul singur.'] },
      { tip: 'adunare', iconite: ['mail', 'phone', 'bell', 'receipt', 'calendar-x', 'file-text'] },
      { tip: 'final', desen: { id: 'op-picioare-explica-ochelari' }, titlu: ['Tu decizi.'] },
    ],
  };
  const { segmente } = planificaTimpi(date, stil(), implicite);
  const durate = segmente.map((s) => rotunjeste(s.sfarsit - s.start));
  assert.deepEqual(durate, [10, 5, 5]);
});

test('S01: dacă timpul rămas nu ajunge, planul se calculează oricum (la minime), iar eroarea vine din valideaza', () => {
  // 10 s, dar scenele cu durată (8 + 5) depășesc deja durata videoului: rămân -3 s pentru scena fără durată
  const date = { ...structuredClone(MINIM), durata: 10 };
  date.scene[0].durata = 8;
  date.scene[1].scanteie = true;
  date.scene[2].durata = 5;
  const { plan, segmente, erori } = planificaTimpi(date, stil(), implicite);
  // planul nu dublează regula: nu dă erori de durată, scenele fără durată primesc minimul tipului
  assert.ok(!coduri(erori).some((c) => c.startsWith('reel-ilustrat-scene-durate')), coduri(erori).join('; '));
  assert.deepEqual(segmente.map((s) => rotunjeste(s.sfarsit - s.start)), [8, 5.5, 5]);
  assert.equal(plan.durata, 18.5);
  // eroarea o scrie valideaza (B02), fără un timp rămas negativ („au rămas -3 s”)
  const v = valideaza(date, { sablon: { implicite } });
  const s01 = v.erori.find((e) => e.cod === 'reel-ilustrat-scene-durate' && e.camp === 'durata');
  assert.ok(s01, coduri(v.erori).join('; '));
  assert.doesNotMatch(s01.mesaj, /-\d/);
  assert.match(s01.mesaj, /Scenele cu durată au deja 13 s, peste durata videoului, 10 s/);
});

test('S01: o singură scenă în plus se scrie „Scoate o scenă”, nu „Scoate 1 scene” (B02)', () => {
  // 3 scene la 10 s: încap cel mult floor(10 / 3,5) = 2
  const date = { ...structuredClone(MINIM), durata: 10 };
  const v = valideaza(date, { sablon: { implicite } });
  const s01 = v.erori.find((e) => e.cod === 'reel-ilustrat-scene-durate' && e.camp === 'scene');
  assert.ok(s01, coduri(v.erori).join('; '));
  assert.match(s01.sugestie, /^Scoate o scenă /);
});

test('S02: desenul nu poate rămâne peste o rețea', () => {
  const date = structuredClone(PROGRAMARI);
  date.scene[0].desen.ramane_pana_la = 3;
  const { erori } = planificaTimpi(date, stil(), implicite);
  assert.ok(coduri(erori).includes('reel-ilustrat-persistenta scene[0].desen.ramane_pana_la'), coduri(erori).join('; '));
});

test('S02: ramane_pana_la trebuie să fie după scena curentă', () => {
  const date = structuredClone(PROGRAMARI);
  date.scene[0].desen.ramane_pana_la = 1;
  const { erori } = planificaTimpi(date, stil(), implicite);
  assert.ok(coduri(erori).includes('reel-ilustrat-persistenta scene[0].desen.ramane_pana_la'));
});

test('S03: o pauză între carduri mai mare decât permite mecanica dă eroare', () => {
  const strict = cu((i) => { i.reguli.pauza_carduri = 0.8; });
  const { erori } = planificaTimpi(PROGRAMARI, stil(), strict);
  assert.ok(coduri(erori).includes('reel-ilustrat-carduri-suprapuse scene[1].durata'), coduri(erori).join('; '));
});

test('S04: șase iconițe pe ritm calm nu apucă să se retragă înainte de rețea', () => {
  const date = {
    sablon: 'reel-ilustrat', versiune_schema: 1, durata: 20,
    scene: [
      { tip: 'card', durata: 3, titlu: ['Prea multe'] },
      { tip: 'adunare', durata: 5, iconite: ['mail', 'phone', 'bell', 'receipt', 'calendar-x', 'file-text'], eticheta: 'Toată ziua' },
      { tip: 'retea', durata: 6, titlu: ['Un sistem'] },
      { tip: 'final', durata: 6, desen: { id: 'op-picioare-explica-ochelari' }, titlu: ['Tu decizi.'] },
    ],
  };
  const { erori } = planificaTimpi(date, stil('calm'), implicite);
  assert.deepEqual(coduri(erori), ['reel-ilustrat-iconite-retea scene[1].durata']);
});

test('S05: desenul de după o rețea cu scânteie scurtă nu mai încape', () => {
  const date = {
    sablon: 'reel-ilustrat', versiune_schema: 1, durata: 22.5,
    scene: [
      { tip: 'desen', durata: 4, desen: { id: 'op-bust-telefon' }, titlu: ['Faci totul singur.'] },
      { tip: 'adunare', durata: 5, iconite: ['mail', 'phone', 'bell'], cuvinte: ['Mesaje.', 'Apeluri.'] },
      { tip: 'retea', durata: 5.5, scanteie: true, titlu: ['Un sistem'] },
      { tip: 'desen', durata: 3, desen: { id: 'op-picioare-explica-ochelari' }, titlu: ['Tu'] },
      { tip: 'final', durata: 5, desen: { id: 'op-bust-cafea' }, titlu: ['Tu decizi.'] },
    ],
  };
  const { erori } = planificaTimpi(date, stil(), implicite);
  assert.deepEqual(coduri(erori), ['reel-ilustrat-desen-dupa-retea scene[3].durata']);
});

test('S06: desenarea pe ritm calm nu încape într-o scenă de 3 s', () => {
  const date = {
    sablon: 'reel-ilustrat', versiune_schema: 1, durata: 10,
    scene: [
      { tip: 'desen', durata: 3, desen: { id: 'op-bust-telefon' }, titlu: ['Grabă.'] },
      { tip: 'card', durata: 3, titlu: ['Și mai multă.'] },
      { tip: 'final', durata: 4, titlu: ['Gata.'] },
    ],
  };
  const { erori } = planificaTimpi(date, stil('calm'), implicite);
  assert.ok(coduri(erori).includes('reel-ilustrat-fereastra-scenei scene[0].durata'), coduri(erori).join('; '));
});

test('S07: o semnătură mai lungă decât fereastra finală dă eroare', () => {
  const lunga = cu((i) => { i.reguli.semnatura_durata = 3.4; });
  const { erori } = planificaTimpi(PROGRAMARI, { ...stil(), semnatura: PROGRAMARI.semnatura }, lunga);
  assert.deepEqual(coduri(erori), ['reel-ilustrat-semnatura semnatura']);
});

test('fiecare eroare are mesaj și sugestie în română, fără sedile', () => {
  const date = structuredClone(PROGRAMARI);
  date.scene[0].desen.ramane_pana_la = 3;
  const { erori } = planificaTimpi(date, stil('calm'), implicite);
  assert.ok(erori.length > 0);
  for (const e of erori) {
    assert.ok(e.mesaj.length > 10 && e.sugestie.length > 5);
    assert.doesNotMatch(e.mesaj + e.sugestie, INTERZISE);
  }
});

test('T1: plan.semnatura apare doar pentru un text șir (un număr din stil nu ajunge în plan)', () => {
  const { semnatura, ...faraSemnatura } = PROGRAMARI;
  const { plan, erori } = planificaTimpi(faraSemnatura, { ...stil(), semnatura: { valoare: 2026, sursa: 'brand' } }, implicite);
  assert.deepEqual(erori, []);
  assert.equal(plan.semnatura, null);
});

test('C14 pe atmosfera plin: desenele urcă lent până la pauza finală; pe ceață planul nu are câmpul', () => {
  const plin = planificaTimpi(MINIM, { ...stil(), atmosfera: 'plin' }, implicite);
  assert.deepEqual(plin.erori, []);
  assert.deepEqual(plin.plan.atmosfera, { mod: 'plin', aprinde: null, impingere: 1, granulatie: 0, miscare: { deriva: [0, -24.2], pana: 28.5 } });
  const scurt = planificaTimpi({ ...MINIM, durata: 12 }, { ...stil(), atmosfera: 'plin' }, implicite);
  assert.deepEqual(scurt.plan.atmosfera.miscare, { deriva: [0, -8.9], pana: 10.5 });
  const ceata = planificaTimpi(MINIM, stil(), implicite);
  assert.equal('miscare' in ceata.plan.atmosfera, false);
});
