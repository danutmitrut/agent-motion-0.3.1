// Regula de lățime a rândurilor din carduri (C04, decizia lui Dănuț din 2026-10-06): fiecare rând de pe card,
// măsurat cu fontkit la mărimea lui fixă, încape în lățimea cardului din sablon.html minus marja de 4% (spec 6.11, C04).
// Cazul real: „Dacă rutina ar merge” (908 px cu fontkit, 910,4 px în Chrome) într-un card de 888 px, rupt pe două rânduri.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { creeazaRadacinaTemp } from '../../../../../teste/ajutoare/radacina-temp.mjs';
import { radacinaCuMotoare } from '../../../../../teste/ajutoare/radacina-motoare.mjs';
import { incarcaSablon } from '../../../../../nucleu/lib/sabloane.mjs';
import { rezolvaStil, valoriStil } from '../../../../../nucleu/lib/teme.mjs';
import { latimiRanduriCard, caseteTexte } from '../casete.mjs';
import { incarcaCatalog } from '../../../../../nucleu/lib/desen/catalog.mjs';
import { lockNou, scrieLock } from '../../../../../nucleu/lib/lock.mjs';
import { citesteVersiuni } from '../../../../../nucleu/lib/versiuni.mjs';
import { CODURI } from '../../../../../nucleu/lib/erori.mjs';
import { pregatesteBuild } from '../../../../../nucleu/lib/randeaza/pregatire.mjs';

const REPO = fileURLToPath(new URL('../../../../../', import.meta.url));
const DIR_SABLON = fileURLToPath(new URL('../', import.meta.url));
const exemplu = (nume) => JSON.parse(fs.readFileSync(path.join(DIR_SABLON, 'exemple', `${nume}.json`), 'utf8'));

let sablon;
let temp;

before(async () => {
  sablon = await incarcaSablon(REPO, 'reel-ilustrat');
  temp = creeazaRadacinaTemp({
    copiaza: ['motoare/comun', 'motoare/hyperframes/comun', 'nucleu/VERSIUNI.json'],
    biblioteciMini: true,
  });
});

after(() => temp?.curata());

/** cronologie() pe drumul lui mg randeaza: stilul rezolvat (tema din date), catalogul bibliotecii mini. */
function cronologia(date) {
  const { radacina } = temp;
  const s = rezolvaStil({ radacina, sablon, date, brand: null });
  assert.deepEqual(s.erori, []);
  const ctx = { radacina, proiect: 'latimi', sablon, mod: 'doar-verificare', catalog: incarcaCatalog(radacina) };
  assert.deepEqual(sablon.modul.valideaza(date, ctx).erori, [], 'valideaza trece: plafoanele de caractere nu prind lățimea');
  return sablon.modul.cronologie(date, s.stil, ctx);
}

test('rand-prea-lat e un cod al lui C04', () => {
  assert.equal(CODURI['rand-prea-lat']?.verificare, 'C04');
  assert.equal(CODURI['rand-prea-lat'].nivel, 'eroare');
});

test('„Dacă rutina ar merge” (exemplul 01 vechi) pică, cu rândul, lățimea și cât trebuie scurtat', () => {
  const date = exemplu('01-rutina-preluata');
  date.scene[2].titlu = ['Dacă rutina ar merge', '*fără tine?*'];
  const r = cronologia(date);
  assert.equal(r.cronologie, null);
  assert.deepEqual(r.erori.map((e) => [e.cod, e.camp]), [['rand-prea-lat', 'scene[2].titlu[0]']]);
  const [e] = r.erori;
  assert.match(e.mesaj, /^Scena 3, rândul 1 din titlu, „Dacă rutina ar merge”, are 908 px/);
  assert.match(e.mesaj, /852 px/);
  assert.match(e.mesaj, /888 px/);
  assert.match(e.sugestie, /cu cel puțin 56 px \(cam 2 caractere\)/);
  assert.match(e.sugestie, /scene\[2\]\.titlu\[0\]/);
});

test('marja de 4%: un rând care ar încăpea la limită în 888 px pică, unul sub 852 px trece', () => {
  const date = exemplu('minim');
  date.scene[0].titlu = ['Dacă totul ar merge.']; // 878,6 px: încape în card, dar nu și în marjă
  const r = cronologia(date);
  assert.deepEqual(r.erori.map((e) => [e.cod, e.camp]), [['rand-prea-lat', 'scene[0].titlu[0]']]);
  date.scene[0].titlu = ['Mesaje, cereri, plăți']; // 849,0 px
  assert.deepEqual(cronologia(date).erori, []);
});

test('regula prinde și cuvintele și îndemnul, pe câmpul fiecăruia', () => {
  const date = exemplu('minim');
  date.scene[0].cuvinte = ['Mesaje.', 'MMMMMMMMMMMMMMMM'];
  delete date.scene[0].titlu;
  date.scene[2].cta = 'MMMMMMMMMMMMMMMMMMMMMMMMMMMM';
  const r = cronologia(date);
  assert.deepEqual(r.erori.map((e) => [e.cod, e.camp]), [
    ['rand-prea-lat', 'scene[0].cuvinte[1]'],
    ['rand-prea-lat', 'scene[2].cta'],
  ]);
  assert.match(r.erori[0].mesaj, /^Scena 1, cuvântul 2, „MMMMMMMMMMMMMMMM”, are \d+ px/);
  assert.match(r.erori[1].mesaj, /^Scena 3: îndemnul, „M+”, are \d+ px/);
});

test('exemplele kitului trec regula pe toate cele trei teme', () => {
  for (const nume of ['minim', '01-rutina-preluata', '02-programari-25s']) {
    for (const tema of ['noapte', 'hartie', 'curat']) {
      const date = exemplu(nume);
      date.stil = { ...(date.stil ?? {}), tema };
      assert.deepEqual(cronologia(date).erori, [], `${nume} pe ${tema}`);
    }
  }
});

test('pe drumul lui mg randeaza, rândul prea lat face C04 roșu, înaintea build-ului', async (t) => {
  // kitul copiat, cu nucleu/node_modules legat spre repo; motorul nu pornește (regula oprește înaintea build-ului)
  const r = radacinaCuMotoare();
  t.after(r.curata);
  const dir = path.join(r.radacina, 'video', 'p');
  fs.mkdirSync(dir, { recursive: true });
  const sab = await incarcaSablon(r.radacina, 'reel-ilustrat');
  scrieLock(path.join(dir, 'motor.lock'), lockNou({ proiect: 'p', sablon: sab, versiuni: citesteVersiuni(r.radacina), acum: new Date('2026-10-06T00:00:00.000Z') }));
  const date = exemplu('01-rutina-preluata');
  date.scene[2].titlu = ['Dacă rutina ar merge', '*fără tine?*'];
  fs.writeFileSync(path.join(dir, 'date.json'), JSON.stringify(date, null, 2) + '\n');
  const p = await pregatesteBuild({ radacina: r.radacina, proiect: 'p', mod: 'doar-verificare' });
  const c04 = p.rezultate.find((x) => x.cod === 'C04');
  assert.equal(c04?.ok, false, JSON.stringify(p.rezultate));
  assert.deepEqual(c04.erori.map((e) => [e.cod, e.camp]), [['rand-prea-lat', 'scene[2].titlu[0]']]);
  assert.equal(fs.existsSync(path.join(dir, 'build')), false, 'build-ul nu pornește');
});

test('plasa de siguranță: un îndemn prea lat care nu vine dintr-o scenă primește un loc și un câmp generale, nu „Scena 0”', () => {
  const date = exemplu('minim');
  const s = rezolvaStil({ radacina: temp.radacina, sablon, date, brand: null });
  const ctx = { radacina: temp.radacina, proiect: 'latimi', sablon, mod: 'doar-verificare', catalog: incarcaCatalog(temp.radacina) };
  const r = sablon.modul.cronologie(date, s.stil, ctx);
  assert.deepEqual(r.erori, []);
  // planul are un îndemn, dar nicio scenă din date nu are cta (azi nu se poate; de exemplu, un îndemn venit din brand)
  const plan = { ...r.intern, cta: { ...(r.intern.cta ?? {}), text: 'M'.repeat(28) } };
  for (const sc of date.scene) delete sc.cta;
  const erori = sablon.modul.verificaLatimi(date, plan, s.stil, ctx);
  assert.deepEqual(erori.map((e) => [e.cod, e.camp]), [['rand-prea-lat', 'scene']]);
  assert.match(erori[0].mesaj, /^Îndemnul, „M+”, are \d+ px/);
  assert.match(erori[0].sugestie, /^Scurtează îndemnul cu cel puțin \d+ px/);
  assert.doesNotMatch(erori[0].mesaj + erori[0].sugestie, /Scena 0|scene\[-1\]/);
});

test('felia 4: marime XL pe un titlu scurt alege cel mai mare px din treaptă care încape, iar casetele îl folosesc', () => {
  const date = exemplu('minim');
  date.scene[2].titlu = ['Tu decizi.'];
  date.scene[2].marime = 'XL';
  const r = cronologia(date);
  assert.deepEqual(r.erori, []);
  const card = r.intern.carduri.find((c) => c.scena === 2);
  assert.equal(card.treapta, 'XL');
  assert.ok(card.px >= 126 && card.px <= 154, `px ${card.px}`);
  date.scene[2].marime = 'L';
  const l = cronologia(date).intern.carduri.find((c) => c.scena === 2);
  assert.ok(l.px >= 110 && l.px <= 124 && l.px < card.px, `L ${l.px}`);
  // fără marime (sau M), cardul nu primește nimic nou: plan.json rămâne ca înainte
  delete date.scene[2].marime;
  const m = cronologia(date).intern.carduri.find((c) => c.scena === 2);
  assert.equal('px' in m || 'treapta' in m, false);
});

test('felia 4: un rând care nu încape întreg în treaptă se rupe în două la un spațiu, la px-ul treptei, fără micșorare', () => {
  // corectura cererii 1 din GATA.md: „fă textul de final mai mare” pe „Îți dă timpul înapoi.” (935 px la 110 px)
  const date = exemplu('minim');
  date.scene[2].titlu = ['Nu te înlocuiește.', '*Îți dă timpul înapoi.*'];
  date.scene[2].marime = 'L';
  const r = cronologia(date);
  assert.deepEqual(r.erori, []);
  const card = r.intern.carduri.find((c) => c.scena === 2);
  assert.ok(card.px >= 110 && card.px <= 124, `px ${card.px}`);
  assert.equal(card.rupturi.length, 2);
  for (const [j, linii] of card.rupturi.entries()) assert.equal(linii.join(' '), card.randuri[j].text);
  assert.equal(card.rupturi[1].length, 2);
  // C04 măsoară liniile, iar casetele C13 au înălțimea liniilor, nu ce ar rupe browserul singur
  const stil = valoriStil(rezolvaStil({ radacina: temp.radacina, sablon, date, brand: null }).stil);
  const geo = { plan: r.intern, stil, radacina: temp.radacina, sablonHtml: fs.readFileSync(path.join(DIR_SABLON, 'sablon.html'), 'utf8'), latimeFormat: 1080 };
  const { latimeCard, randuri } = latimiRanduriCard(geo);
  assert.ok(randuri.filter((x) => x.scena === 2 && x.rol === 'titlu').every((x) => x.latime <= latimeCard * 0.96));
  const [unu, doi] = caseteTexte(geo).scene.get(2).filter((x) => card.randuri.some((rand) => rand.text === x.text));
  assert.ok(Math.abs(doi.caseta[3] - card.rupturi[1].length * unu.caseta[3] / card.rupturi[0].length) < 0.1, JSON.stringify([unu, doi]));
  // un rând care încape întreg în treaptă nu se rupe: fără rupturi
  date.scene[2].titlu = ['Tu decizi.'];
  assert.equal('rupturi' in cronologia(date).intern.carduri.find((c) => c.scena === 2), false);
});

test('felia 4: limita îndemnului se aplică doar cardului scenei finale, nu cardului scenei de dinainte', () => {
  // revizia feliei 4: cu finalul doar cu cta, limita lovea cardul scenei 2, care nu stă pe ecran cu îndemnul
  const date = exemplu('minim');
  date.scene[1].titlu = ['Nu te înlocuiește.', '*Îți dă timpul înapoi.*'];
  date.scene[1].marime = 'L';
  date.scene[2] = { tip: 'final', desen: { id: 'od-chilling' } };
  const fara = cronologia(date);
  assert.deepEqual(fara.erori, []);
  date.scene[2].cta = 'Scrie-mi.';
  const cu = cronologia(date);
  assert.deepEqual(cu.erori, []);
  assert.equal(cu.intern.carduri.find((c) => c.scena === 1).px, fara.intern.carduri.find((c) => c.scena === 1).px);
});

test('felia 4: un titlu care nu încape nici la minimul treptei, nici rupt, dă rand-nu-incape pe marime, fără micșorare', () => {
  const date = exemplu('minim');
  date.scene[0].titlu = ['Responsabilitatea']; // 782 px la 96 px, 896 px la 110 px, un singur cuvânt: nu se poate rupe
  date.scene[0].marime = 'L';
  const r = cronologia(date);
  assert.equal(r.cronologie, null);
  assert.deepEqual(r.erori.map((e) => [e.cod, e.camp]), [['rand-nu-incape', 'scene[0].marime']]);
  assert.match(r.erori[0].mesaj, /Scena 1: titlul nu încape la mărimea L/);
  assert.match(r.erori[0].sugestie, /scene\[0\]\.marime pe „M”/);
});

test('felia 4: marime fără titlu (doar cuvinte) e refuzată', () => {
  const date = exemplu('minim');
  delete date.scene[0].titlu;
  date.scene[0].cuvinte = ['Mesaje.', 'Cereri.'];
  date.scene[0].marime = 'XL';
  const r = cronologia(date);
  assert.deepEqual(r.erori.map((e) => [e.cod, e.camp]), [['valoare-invalida', 'scene[0].marime']]);
});
