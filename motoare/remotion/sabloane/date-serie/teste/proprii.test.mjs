// S06 și S07 pe MP4 (proprii.mjs), cu ffprobe și mărimea fișierului injectate: cadrele = cadreTotale ± 1, durata în
// limitele șablonului, mărimea cel mult 100 MB. Forma rezultatelor e cea cerută de validarea hook-urilor din nucleu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CODURI } from '../../../../../nucleu/lib/erori.mjs';
import { MARIME_MAX, TOLERANTA_CADRE, evalueazaCadre, evalueazaMarime, verificariProprii } from '../proprii.mjs';
import * as sablon from '../sablon.mjs';

const CHEI = ['avertismente', 'camp', 'cod', 'erori', 'ok', 'prag', 'valoare'];
const DURATA = { min: 6, max: 60, implicita: 20 };
const CADRE = [114, 120, 234, 138, 114]; // exemplul din spec (3,8 / 4 / 7,8 / 4,6 / 3,8 s): 672 de cadre, 22,4 s
const info = (cadre, durata = cadre / 30) => ({ durata, video: { codec: 'h264', pix_fmt: 'yuv420p', latime: 1080, inaltime: 1920, fps: 30, cadre }, audio: null });
const ctx = { intern: { cadre: CADRE, total: 672 }, sablon: { meta: { durata: DURATA } }, ff: { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' } };

test('codurile noi sunt în CODURI, cu verificarea lor', () => {
  assert.deepEqual(CODURI['date-serie-durata-mp4'], { nivel: 'eroare', verificare: 'S06', descriere: CODURI['date-serie-durata-mp4'].descriere });
  assert.equal(CODURI['date-serie-marime-mp4'].verificare, 'S07');
  assert.equal(CODURI['date-serie-marime-mp4'].nivel, 'eroare');
});

test('S06 trece la cadreTotale și la ± 1 cadru, pică la 2 cadre diferență', () => {
  assert.equal(TOLERANTA_CADRE, 1);
  for (const n of [671, 672, 673]) assert.equal(evalueazaCadre({ info: info(n), asteptate: 672, durata: DURATA }).ok, true, `${n} cadre`);
  const r = evalueazaCadre({ info: info(674), asteptate: 672, durata: DURATA });
  assert.equal(r.ok, false);
  assert.equal(r.cod, 'S06');
  assert.equal(r.camp, 'mp4');
  assert.equal(r.erori[0].cod, 'date-serie-durata-mp4');
  assert.match(r.erori[0].mesaj, /674 de cadre, iar scenele cer 672/);
  assert.deepEqual(Object.keys(r).sort(), CHEI);
  assert.deepEqual(r.valoare, { cadre: 674, durata: 674 / 30 });
  assert.deepEqual(r.prag, { cadre: 672, toleranta: 1, durata_min: 6, durata_max: 60 });
});

test('S06 pune „de” după numeral doar la 00 și 20-99 în ultimele două cifre', () => {
  const mesaj = (n) => evalueazaCadre({ info: info(n), asteptate: 1500, durata: DURATA }).erori[0].mesaj;
  assert.match(mesaj(705), /are 705 cadre,/);
  assert.match(mesaj(1019), /are 1019 cadre,/);
  assert.match(mesaj(1100), /are 1100 de cadre,/);
  assert.match(mesaj(1120), /are 1120 de cadre,/);
});

test('S06 pică fără nb_frames și la durata în afara limitelor (câmpul scene)', () => {
  const fara = evalueazaCadre({ info: info(null, 22.4), asteptate: 672, durata: DURATA });
  assert.equal(fara.ok, false);
  assert.match(fara.erori[0].mesaj, /un număr necunoscut de cadre/);
  const scurt = evalueazaCadre({ info: info(150), asteptate: 150, durata: DURATA });
  assert.equal(scurt.ok, false);
  assert.equal(scurt.camp, 'scene');
  assert.match(scurt.erori[0].mesaj, /5,0 s; filmul trebuie să aibă între 6 și 60 s/);
  assert.equal(evalueazaCadre({ info: info(1800), asteptate: 1800, durata: DURATA }).ok, true, '60 s fix');
  assert.equal(evalueazaCadre({ info: info(1801), asteptate: 1801, durata: DURATA }).ok, true, '60,03 s, în toleranța lui C11');
  assert.equal(evalueazaCadre({ info: info(1802), asteptate: 1802, durata: DURATA }).ok, false, '60,07 s');
  assert.equal(evalueazaCadre({ info: info(179), asteptate: 179, durata: DURATA }).ok, true, '5,97 s, în toleranța lui C11');
});

test('S07: cel mult 100 MB', () => {
  assert.equal(MARIME_MAX, 100 * 1024 * 1024);
  assert.equal(evalueazaMarime({ octeti: MARIME_MAX }).ok, true);
  const r = evalueazaMarime({ octeti: MARIME_MAX + 1 });
  assert.equal(r.ok, false);
  assert.equal(r.cod, 'S07');
  assert.equal(r.camp, 'mp4');
  assert.equal(r.erori[0].cod, 'date-serie-marime-mp4');
  assert.match(r.erori[0].mesaj, /100,0 MB; maximum 100 MB/);
  assert.deepEqual(Object.keys(r).sort(), CHEI);
  assert.deepEqual(r.prag, { octeti_max: MARIME_MAX });
});

test('verificariProprii probează MP4-ul o dată și întoarce [S06, S07], plus S08 și S09 verzi la grafic; sablon.mjs o reexportă', async () => {
  const apeluri = [];
  const probeaza = async (cale, opt) => { apeluri.push([cale, opt.ffprobe]); return info(672); };
  const rezultate = await verificariProprii('/x/grafic.mp4', ctx, { probeaza, marime: () => 5_500_000 });
  assert.deepEqual(apeluri, [['/x/grafic.mp4', 'ffprobe']]);
  assert.deepEqual(rezultate.map((r) => [r.cod, r.ok]), [['S06', true], ['S07', true], ['S08', true], ['S09', true]]);
  assert.deepEqual(rezultate[2].valoare, { aplicabil: false });
  const card = await verificariProprii('/x/card.mp4', { ...ctx, intern: { ...ctx.intern, card: true } }, { probeaza, marime: () => 5_500_000 });
  assert.deepEqual(card.map((r) => r.cod), ['S06', 'S07'], 'la un card, S08 și S09 le dă nucleul');
  assert.equal(sablon.verificariProprii, verificariProprii);
});

test('verificariProprii refuză un ctx fără cadrele scenelor (greșeală de nucleu, nu de date)', async () => {
  await assert.rejects(() => verificariProprii('/x.mp4', { ...ctx, intern: null }, { probeaza: async () => info(672), marime: () => 1 }), TypeError);
});
