// Timpii, cronologia și așteptările (I08): segmentele tăiate la mijlocul tranzițiilor (decizia 10), C09 pe ele,
// câte un text pe rând afișat, cu caseta lui din așezare.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { timpi, segmentTimp } from '../timp.mjs';
import { valideazaCronologie } from '../../../../../nucleu/lib/cronologie.mjs';
import { verificaC09 } from '../../../../../nucleu/lib/verificari/date.mjs';
import { exemplu, sablonul, stilRezolvat, ctxTest } from './ajutoare.mjs';

const implicite = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../implicite.json', import.meta.url)), 'utf8'));

async function cronologia(date) {
  const sab = await sablonul();
  const stil = stilRezolvat(sab, date);
  const c = sab.modul.cronologie(date, stil, ctxTest(sab, { stil }));
  return { sab, stil, c };
}

test('timpi: cadrele, începuturile, intrările și totalul exemplului grafic.date', () => {
  const t = timpi(exemplu('grafic.date'), implicite);
  assert.deepEqual(t, {
    durate: [3.8, 4, 7.8, 4.6, 3.8],
    cadre: [114, 120, 234, 138, 114],
    inceputuri: [0, 102, 210, 432, 558],
    intrari: [18, 45, 40, 36, 18],
    total: 672,
  });
});

test('timpi: duratele lipsă iau implicitul tipului', () => {
  const t = timpi(exemplu('minim'), implicite);
  assert.deepEqual([t.durate, t.cadre, t.inceputuri, t.total], [[4, 3.5], [120, 105], [0, 108], 213]);
});

test('segmentTimp: start și sfârșit la mijlocul tranziției, complet după intrare', () => {
  const t = timpi(exemplu('grafic.date'), implicite);
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => segmentTimp(t, i)), [
    { start: 0, complet: 0.6, sfarsit: 3.6 },
    { start: 3.6, complet: 4.9, sfarsit: 7.2 },
    { start: 7.2, complet: 8.333, sfarsit: 14.6 },
    { start: 14.6, complet: 15.6, sfarsit: 18.8 },
    { start: 18.8, complet: 19.2, sfarsit: 22.4 },
  ]);
});

test('cronologie: formatul comun valid, segmente lipite, câte un text pe rând, 22,4 s', async () => {
  const { c } = await cronologia(exemplu('grafic.date'));
  assert.deepEqual(c.erori, []);
  const cron = c.cronologie;
  assert.deepEqual(valideazaCronologie(cron), []);
  assert.deepEqual([cron.sablon, cron.format, cron.latime, cron.inaltime, cron.fps, cron.durata, cron.fundal, cron.audio], ['date-serie', 'vertical', 1080, 1920, 30, 22.4, '#0E0F13', null]);
  assert.deepEqual(cron.ferestre_statice, []);
  for (let i = 1; i < cron.segmente.length; i++) assert.equal(cron.segmente[i].start, cron.segmente[i - 1].sfarsit);
  assert.deepEqual(cron.segmente.map((s) => s.texte.length), [4, 3, 15, 5, 3]);
  assert.deepEqual(cron.segmente[0].texte, ['PRIMUL SEMESTRU', 'Cursul meu online,', 'în cifre', 'Ianuarie-iunie 2026']);
  assert.deepEqual(cron.segmente[4].texte, ['Următoarea grupă', 'pe 15 octombrie', 'Link în bio']);
  assert.ok(cron.segmente.every((s) => !('selectori' in s)), 'fără selectori: nucleul nu scrie index.motion.json');
  assert.deepEqual(cron.momente_foaie.map((m) => m.t), [0.6, 3.6, 4.9, 7.2, 8.333, 14.6, 15.6, 18.8, 19.2, 22.367]);
  assert.deepEqual(Object.keys(c.intern), ['durate', 'cadre', 'inceputuri', 'intrari', 'total', 'asezare']);
});

test('C09 e verde pe grafic.date: fiecare scenă stă pe ecran cât îi trebuie la citit', async () => {
  const { sab, c } = await cronologia(exemplu('grafic.date'));
  const r = verificaC09(sab, c.cronologie);
  assert.equal(r.ok, true, JSON.stringify(r.erori));
});

test('C09 pică pe o scenă de 2 s cu text lung: prea-repede-de-citit pe scene[0].durata', async () => {
  const date = exemplu('minim');
  Object.assign(date.scene[0], { durata: 2, text: 'clienți noi au venit din recomandări în primul trimestru' });
  date.scene[1].durata = 5; // totalul, 6,6 s, trece de minimul de 6 s
  const { sab, c } = await cronologia(date);
  assert.deepEqual(c.erori, []);
  const r = verificaC09(sab, c.cronologie);
  assert.deepEqual(r.erori.map((e) => [e.cod, e.camp]), [['prea-repede-de-citit', 'scene[0].durata']]);
  assert.equal(r.erori[0].mesaj, 'Scena 1: textele cer 4,4 s de citire, dar stau pe ecran 1,8 s.');
});

test('cronologie: datele invalide nu produc cronologie; S04 vine din așezare', async () => {
  const d1 = exemplu('grafic.date');
  d1.scene[2].evidentiaza = 'iulie';
  const r1 = (await cronologia(d1)).c;
  assert.equal(r1.cronologie, null);
  assert.deepEqual(r1.erori.map((e) => e.cod), ['date-serie-evidentiaza']);
  const d2 = exemplu('grafic.date');
  d2.scene[4].titlu = ['Următoarea grupă', 'începe pe 15 octombrie'];
  const r2 = (await cronologia(d2)).c;
  assert.deepEqual([r2.cronologie, r2.intern, r2.erori.map((e) => [e.cod, e.camp, e.verificare])], [null, null, [['rand-nu-incape', 'scene[4].titlu[1]', 'S04']]]);
});

test('asteptari: câte un text pe rând, la complet, cu câmpul și caseta lui', async () => {
  const { sab, c } = await cronologia(exemplu('grafic.date'));
  const a = sab.modul.asteptari(c.cronologie, ctxTest(sab, { intern: c.intern }));
  assert.equal(a.texte.length, 30);
  assert.deepEqual(a.texte[1], { ref: 'Scena 1', camp: 'scene[0].titlu[0]', text: 'Cursul meu online,', t: 0.6, zona_text: [80, 697, 920, 400], caseta: [80, 774, 880, 115] });
  assert.deepEqual(a.texte.map((t) => t.text), c.cronologie.segmente.flatMap((s) => s.texte));
  assert.deepEqual(a.momente, [0.6, 4.9, 8.333, 15.6, 19.2]);
  assert.deepEqual(a.audio, { prezent: false, durata: null });
  assert.equal(a.fundal, '#0E0F13');
  const fara = sab.modul.asteptari(c.cronologie, {});
  assert.deepEqual(fara.texte[1], { ref: 'Scena 1', camp: 'scene[0]', text: 'Cursul meu online,', t: 0.6, zona_text: [80, 697, 920, 400] });
});

test('cu muzică, cronologia are audio la durata videoului', async () => {
  const date = exemplu('grafic.date');
  date.muzica = { fisier: 'resurse/muzica.mp3' };
  const { c } = await cronologia(date);
  assert.deepEqual(c.cronologie.audio, { fisier: 'build/assets/muzica.m4a', durata: 22.4 });
});
