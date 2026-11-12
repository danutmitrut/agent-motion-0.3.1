import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  proportieDiferita, esteCadruGol, areDesen, segmenteGoale, verificaGoluri, verificaTextVizibil, PRAGURI_C13,
} from '../../nucleu/lib/verificari/pixeli.mjs';
import { verificaInghetare } from '../../nucleu/lib/verificari/mp4.mjs';
import { parseazaFreezedetect } from '../../nucleu/lib/ffmpeg.mjs';
import { hexInRgb } from '../../nucleu/lib/contrast.mjs';
import { CODURI } from '../../nucleu/lib/erori.mjs';
import { cadruUniform, cadruCuDreptunghi } from '../ajutoare/imagini.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TEME = ['noapte', 'hartie', 'curat'].map((id) => {
  const tema = JSON.parse(fs.readFileSync(path.join(REPO, 'motoare', 'comun', 'teme', `${id}.json`), 'utf8'));
  return { id, fundal: hexInRgb(tema.culori.fundal), text: hexInRgb(tema.culori.text), accent: hexInRgb(tema.culori.accent) };
});
// Cadrul lui C13 (270x480) și zona de text a reelului [96, 200, 888, 280] scalată cu 270 / 1080.
const L = 270;
const H = 480;
const ZONA = [24, 50, 222, 70];
const SEGMENTE = [
  { ref: 'Scena 1', camp: 'scene[0]', start: 0, sfarsit: 4 },
  { ref: 'Scena 2', camp: 'scene[1]', start: 4, sfarsit: 8 },
];

/** Serie la 10 fps de la 0 la `pana` (exclusiv), goală în intervalele [a, b) date. */
function serie(pana, goluri) {
  const rez = [];
  for (let k = 0; k < Math.round(pana * 10); k += 1) {
    const t = Math.round(k * 100) / 1000;
    rez.push({ t, gol: goluri.some(([a, b]) => t >= a - 1e-9 && t < b - 1e-9) });
  }
  return rez;
}

test('codurile C12, C13 și C14 sunt în lista comună', () => {
  assert.equal(CODURI['cadre-goale']?.verificare, 'C12');
  assert.equal(CODURI['text-invizibil']?.verificare, 'C13');
  assert.equal(CODURI['video-inghetat']?.verificare, 'C14');
});

test('ajutoarele de imagini produc RGB24 de lungimea corectă', () => {
  assert.equal(cadruUniform(4, 3, [1, 2, 3]).length, 36);
  const c = cadruCuDreptunghi(4, 3, [0, 0, 0], [1, 1, 10, 10], [9, 9, 9]);
  assert.deepEqual([...c.subarray(0, 3)], [0, 0, 0]);
  assert.deepEqual([...c.subarray((1 * 4 + 1) * 3, (1 * 4 + 1) * 3 + 3)], [9, 9, 9]);
});

test('pe fiecare temă, un cadru uniform pe fundal e gol', () => {
  for (const tema of TEME) {
    const cadru = cadruUniform(135, 240, tema.fundal);
    assert.equal(proportieDiferita(cadru, 135, 240, tema.fundal), 0, tema.id);
    assert.equal(esteCadruGol(cadru, 135, 240, tema.fundal), true, tema.id);
  }
});

test('pe fiecare temă, un dreptunghi de 2% din zona textului dă o proporție de aproximativ 0,02', () => {
  // 31 x 10 = 310 pixeli din 222 x 70 = 15540, adică 0,01995
  for (const tema of TEME) {
    for (const culoare of [tema.text, tema.accent]) {
      const cadru = cadruCuDreptunghi(L, H, tema.fundal, [30, 60, 31, 10], culoare);
      const p = proportieDiferita(cadru, L, H, tema.fundal, ZONA);
      assert.ok(Math.abs(p - 0.02) < 0.001, `${tema.id}: ${p}`);
      assert.ok(Math.abs(proportieDiferita(cadru, L, H, tema.fundal, ZONA, 96) - 0.02) < 0.001, `${tema.id} la 96`);
    }
  }
});

test('proportieDiferita: zona se taie la marginile cadrului, toleranța e pe canal, lungimea greșită aruncă', () => {
  const fundal = [14, 15, 19];
  const cadru = cadruCuDreptunghi(10, 10, fundal, [5, 5, 5, 5], [200, 200, 200]);
  assert.equal(proportieDiferita(cadru, 10, 10, fundal, [5, 5, 100, 100]), 1);
  assert.equal(proportieDiferita(cadru, 10, 10, fundal, [20, 20, 5, 5]), 0);
  assert.equal(proportieDiferita(cadru, 10, 10, fundal), 0.25);
  const aproape = cadruUniform(10, 10, [14 + 20, 15, 19]);
  assert.equal(proportieDiferita(aproape, 10, 10, fundal), 0, 'o diferență de 20 e sub toleranța 24');
  assert.equal(proportieDiferita(aproape, 10, 10, fundal, null, 10), 1);
  assert.throws(() => proportieDiferita(new Uint8Array(5), 10, 10, fundal), TypeError);
});

test('ceața nu e text: un strat de 30% spre accent rămâne sub toleranța 96 pe toate temele', () => {
  for (const tema of TEME) {
    const ceata = tema.fundal.map((v, i) => Math.round(v * 0.7 + tema.accent[i] * 0.3));
    const cadru = cadruCuDreptunghi(L, H, tema.fundal, ZONA, ceata);
    assert.equal(proportieDiferita(cadru, L, H, tema.fundal, ZONA, 96), 0, tema.id);
  }
  const noapte = TEME[0];
  const ceata = noapte.fundal.map((v, i) => Math.round(v * 0.7 + noapte.accent[i] * 0.3));
  assert.equal(proportieDiferita(cadruCuDreptunghi(L, H, noapte.fundal, ZONA, ceata), L, H, noapte.fundal, ZONA), 1, 'la 24, ceața pe noapte acoperă toată zona');
});

test('esteCadruGol: sub 0,3% din pixeli e gol, de la 0,3% în sus nu', () => {
  const fundal = [255, 255, 255];
  // 135 x 240 = 32400 pixeli; 0,3% = 97,2
  const mic = cadruCuDreptunghi(135, 240, fundal, [0, 0, 9, 10], [17, 20, 24]);
  const mare = cadruCuDreptunghi(135, 240, fundal, [0, 0, 10, 10], [17, 20, 24]);
  assert.equal(esteCadruGol(mic, 135, 240, fundal), true);
  assert.equal(esteCadruGol(mare, 135, 240, fundal), false);
});

test('areDesen: 3 pixeli peste 48 sunt desen, 2 nu; ceața (diferență 27) și zgomotul de 1 nu contează', () => {
  // cadrul C12, 135x240, pe fiecare temă
  for (const tema of TEME) {
    const gol = cadruUniform(135, 240, tema.fundal);
    assert.equal(areDesen(gol, 135, 240, tema.fundal), false, `${tema.id}: fundalul gol`);
    // ceața de pe noapte la începutul filmului: tot cadrul la 26-27 de fundal (măsurat pe randările reale)
    const ceata = cadruUniform(135, 240, tema.fundal.map((v) => (v > 127 ? v - 27 : v + 27)));
    assert.equal(areDesen(ceata, 135, 240, tema.fundal), false, `${tema.id}: ceața nu e desen`);
    const linie3 = cadruCuDreptunghi(135, 240, tema.fundal, [60, 120, 3, 1], tema.text);
    const linie2 = cadruCuDreptunghi(135, 240, tema.fundal, [60, 120, 2, 1], tema.text);
    assert.equal(areDesen(linie3, 135, 240, tema.fundal), true, `${tema.id}: 3 pixeli de linie`);
    assert.equal(areDesen(linie2, 135, 240, tema.fundal), false, `${tema.id}: 2 pixeli`);
    // aceiași 3 pixeli, sub 0,3%: desen, dar cadru gol pentru regula golurilor
    assert.equal(esteCadruGol(linie3, 135, 240, tema.fundal), true, tema.id);
  }
});

test('verificaGoluri: primul conținut e primul cadru cu desen, chiar sub 0,3%; golurile din mijloc rămân pe 0,3%', () => {
  // o linie care crește de la 0,4 s: cadre goale după 0,3% până la 0,9 s, dar cu desen de la 0,4 s
  const serieLinie = serie(8, [[0, 0.9]]).map((c) => ({ ...c, desen: c.t >= 0.4 - 1e-9 }));
  const r = verificaGoluri(serieLinie, { segmente: SEGMENTE });
  assert.equal(r.ok, true, JSON.stringify(r.erori));
  assert.equal(r.valoare.primul_continut, 0.4);
  // fără desen până la 0,7 s: pică
  const tarziu = serie(8, [[0, 0.9]]).map((c) => ({ ...c, desen: c.t >= 0.7 - 1e-9 }));
  assert.equal(verificaGoluri(tarziu, { segmente: SEGMENTE }).ok, false);
  // un gol de 1,2 s în mijloc pică și dacă are câțiva pixeli de desen
  const mijloc = serie(8, [[4.2, 5.4]]).map((c) => ({ ...c, desen: true }));
  const rm = verificaGoluri(mijloc, { segmente: SEGMENTE });
  assert.equal(rm.ok, false);
  assert.equal(rm.erori[0].camp, 'scene[1]');
});

test('segmenteGoale: începutul, mijlocul și finalul, cu pasul seriei', () => {
  assert.deepEqual(segmenteGoale(serie(6, [[0, 0.3], [2, 3.2], [5.5, 6]])), [
    { start: 0, sfarsit: 0.3, durata: 0.3 },
    { start: 2, sfarsit: 3.2, durata: 1.2 },
    { start: 5.5, sfarsit: 6, durata: 0.5 },
  ]);
  assert.deepEqual(segmenteGoale(serie(3, [])), []);
  assert.deepEqual(segmenteGoale([]), []);
});

test('verificaGoluri: o serie cu un gol de 1,2 s dă cadre-goale pe scena potrivită', () => {
  const r = verificaGoluri(serie(8, [[4.2, 5.4]]), { segmente: SEGMENTE });
  assert.equal(r.cod, 'C12');
  assert.equal(r.ok, false);
  assert.equal(r.erori.length, 1);
  assert.equal(r.erori[0].cod, 'cadre-goale');
  assert.equal(r.erori[0].camp, 'scene[1]');
  assert.match(r.erori[0].mesaj, /Scena 2/);
  assert.match(r.erori[0].mesaj, /1,2 s/);
  assert.equal(r.camp, 'scene[1]');
  assert.deepEqual(r.prag, { gol_max: 1, primul_continut: 0.6, cadru_gol: 0.003, desen: { toleranta: 48, pixeli: 3 } });
});

test('verificaGoluri: un gol de 1,0 s și primul conținut la 0,6 s trec', () => {
  const r = verificaGoluri(serie(8, [[0, 0.6], [4, 5]]), { segmente: SEGMENTE });
  assert.equal(r.ok, true, JSON.stringify(r.erori));
  assert.equal(r.valoare.primul_continut, 0.6);
  assert.deepEqual(r.erori, []);
});

test('verificaGoluri: primul conținut după 0,6 s pică o singură dată, pe scena 1', () => {
  const r = verificaGoluri(serie(8, [[0, 1.5]]), { segmente: SEGMENTE });
  assert.equal(r.ok, false);
  assert.equal(r.erori.length, 1);
  assert.equal(r.erori[0].camp, 'scene[0]');
  assert.match(r.erori[0].mesaj, /1,5 s/);
});

test('verificaGoluri: un video doar cu fundal sau fără cadre pică pe tot documentul', () => {
  const gol = verificaGoluri(serie(3, [[0, 3]]));
  assert.equal(gol.ok, false);
  assert.equal(gol.erori[0].camp, '$');
  assert.equal(gol.valoare.primul_continut, null);
  assert.equal(verificaGoluri([]).ok, false);
});

test('verificaTextVizibil: între 1% și 35% trece, în afară pică cu text-invizibil', () => {
  const ok = verificaTextVizibil([{ ref: 'Scena 1', t: 2.15, proportie: 0.02, camp: 'scene[0]' }]);
  assert.equal(ok.cod, 'C13');
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.prag, { min: 0.01, max: 0.35 });
  const r = verificaTextVizibil([
    { ref: 'Scena 1', t: 2.15, proportie: 0.005, camp: 'scene[0]' },
    { ref: 'Scena 2', t: 6.4, proportie: 0.41, camp: 'scene[1]' },
    { ref: 'Scena 3', t: 9, proportie: 0.2, camp: 'scene[2]' },
  ]);
  assert.equal(r.ok, false);
  assert.deepEqual(r.erori.map((e) => [e.cod, e.camp]), [['text-invizibil', 'scene[0]'], ['text-invizibil', 'scene[1]']]);
  assert.match(r.erori[0].mesaj, /Scena 1: la 2,15 s/);
  assert.match(r.erori[0].mesaj, /0,5%/);
  assert.match(r.erori[1].mesaj, /41%/);
  assert.equal(r.valoare.masuratori.length, 3);
  assert.equal(verificaTextVizibil([]).ok, true);
});

test('C13 (decizia din 2026-10-06): maximul e 50% în casetele strânse și 35% în zona_text, ales după tipul zonei', () => {
  assert.deepEqual(PRAGURI_C13, { casete: { min: 0.01, max: 0.5 }, zona_text: { min: 0.01, max: 0.35 }, sursa: { min: 0.01, max: 1 } });
  // „MM” pe noapte, în caseta lui strânsă: 42% pe Mac (c13-windows-investigatie.md), perfect lizibil
  const mm = [{ ref: 'Scena 4 („MM”)', t: 22.8, proportie: 0.4224, camp: 'scene[3]' }];
  const casete = verificaTextVizibil(mm, { zone: 'casete' });
  assert.equal(casete.ok, true, JSON.stringify(casete.erori));
  assert.deepEqual(casete.prag, { min: 0.01, max: 0.5 });
  const zona = verificaTextVizibil(mm, { zone: 'zona_text' });
  assert.equal(zona.ok, false);
  assert.deepEqual(zona.prag, { min: 0.01, max: 0.35 });
  // fără zone: zona_text, ca până acum (șabloanele fără casete)
  assert.deepEqual(verificaTextVizibil(mm).prag, { min: 0.01, max: 0.35 });
  // inundarea unei casete (ceața peste prag dă 0,8-1,0) pică în continuare
  const inundata = verificaTextVizibil([{ ...mm[0], proportie: 0.82 }], { zone: 'casete' });
  assert.equal(inundata.ok, false);
  assert.match(inundata.erori[0].mesaj, /82%/);
  assert.match(inundata.erori[0].mesaj, /maximum 50%/);
  // sub 1% pică la fel în ambele
  assert.equal(verificaTextVizibil([{ ...mm[0], proportie: 0.005 }], { zone: 'casete' }).ok, false);
  assert.throws(() => verificaTextVizibil(mm, { zone: 'banda' }), /zonă C13 „banda” nu există/);
});

test('C13 peste prag: în casete, mesajul trimite la stil.atmosfera și la contrast, nu la desen; în zona_text rămâne la desen', () => {
  const m = [{ ref: 'Scena 2 („Plăți.”)', t: 8.15, proportie: 0.6, camp: 'scene[1]' }];
  const dateReel = { stil: { atmosfera: 'ceata' }, scene: [{ titlu: ['A'] }, { desen: { id: 'x' }, titlu: ['B'] }] };
  const [casete] = verificaTextVizibil(m, { zone: 'casete', date: dateReel }).erori;
  assert.equal(casete.cod, 'text-invizibil');
  assert.equal(casete.camp, 'scene[1]');
  assert.match(casete.mesaj, /^Scena 2 \(„Plăți\.”\): la 8,15 s, în caseta textului diferă de fundal 60% din pixeli \(maximum 50%\)/);
  assert.match(casete.mesaj, /ceața/);
  assert.match(casete.sugestie, /stil\.atmosfera pe „plin”/);
  assert.match(casete.sugestie, /contrastul dintre stil\.culori\.text \(la rândurile accentuate, stil\.culori\.accent\) și stil\.culori\.fundal/);
  for (const text of [casete.mesaj, casete.sugestie]) assert.doesNotMatch(text, /Micșorează desenul|desen\.marime|zona textului e acoperită/);
  const [zona] = verificaTextVizibil(m, { zone: 'zona_text', date: dateReel }).erori;
  assert.match(zona.mesaj, /deci zona textului e acoperită/);
  assert.match(zona.sugestie, /^Micșorează desenul scenei \(scene\[1\]\.desen\.marime „mediu” sau „mic”\) sau pune stil\.atmosfera pe „plin”\.$/);
});

test('C14: freeze-ul din fixture-ul real e parsat, iar cel din fereastra statică nu dă eroare', () => {
  const text = fs.readFileSync(path.join(REPO, 'teste', 'fixtures', 'ffmpeg', 'freezedetect-static.txt'), 'utf8');
  const intervale = parseazaFreezedetect(text);
  assert.deepEqual(intervale, [
    { start: 2, durata: 3, sfarsit: 5 },
    { start: 7, durata: null, sfarsit: null },
  ]);
  const segmente = [
    { ref: 'Scena 1', camp: 'scene[0]', start: 0, sfarsit: 6 },
    { ref: 'Scena 2', camp: 'scene[1]', start: 6, sfarsit: 9.5 },
  ];
  const finala = [{ start: 7, sfarsit: 9.5, motiv: 'pauza-finala' }];
  const doarFinal = verificaInghetare(intervale, { durata: 9.5, ferestre: finala, segmente });
  assert.equal(doarFinal.cod, 'C14');
  assert.equal(doarFinal.ok, false);
  assert.equal(doarFinal.erori.length, 1, 'înghețul din pauza finală nu e eroare');
  assert.equal(doarFinal.erori[0].cod, 'video-inghetat');
  assert.equal(doarFinal.erori[0].camp, 'scene[0]');
  assert.match(doarFinal.erori[0].mesaj, /între 2 s și 5 s/);
  assert.deepEqual(doarFinal.valoare.intervale[1], { start: 7, sfarsit: 9.5, durata: 2.5, neacoperit: 0 });
  const ambele = verificaInghetare(intervale, { durata: 9.5, ferestre: [{ start: 2, sfarsit: 5, motiv: 'proba' }, ...finala], segmente });
  assert.equal(ambele.ok, true, JSON.stringify(ambele.erori));
  assert.deepEqual(ambele.prag, { n: 0.001, d: 2 });
});

test('C14: un îngheț care iese din fereastră cu mai puțin de 2 s e acceptat; cu 2 s sau mai mult, nu', () => {
  const ferestre = [{ start: 23.5, sfarsit: 25, motiv: 'pauza-finala' }];
  assert.equal(verificaInghetare([{ start: 22.6, durata: null, sfarsit: null }], { durata: 25, ferestre }).ok, true);
  assert.equal(verificaInghetare([{ start: 21.4, durata: null, sfarsit: null }], { durata: 25, ferestre }).ok, false);
  assert.equal(verificaInghetare([], { durata: 25, ferestre }).ok, true);
});

test('proportieDiferita: o zonă, un fundal sau o toleranță cu NaN sau Infinity aruncă, nu dă 0 sau NaN', () => {
  const fundal = [14, 15, 19];
  const cadru = cadruCuDreptunghi(10, 10, fundal, [2, 2, 4, 4], [200, 200, 200]);
  for (const zona of [[0, 0, 10, NaN], [NaN, 0, 5, 5], [0, 0, Infinity, 5], [0, 0, 5, -Infinity], [0, 0, 5], 'tot']) {
    assert.throws(() => proportieDiferita(cadru, 10, 10, fundal, zona), /Zona trebuie să fie \[x, y, w, h\] cu numere finite/, String(zona));
  }
  assert.throws(() => proportieDiferita(cadru, 10, 10, [14, NaN, 19]), /Canalul g al fundalului.*NaN/);
  assert.throws(() => proportieDiferita(cadru, 10, 10, fundal, null, NaN), /Toleranța.*NaN/);
  assert.throws(() => proportieDiferita(cadru, 10, 10, fundal, null, Infinity), /Toleranța.*Infinity/);
  // zona validă rămâne neschimbată
  assert.equal(proportieDiferita(cadru, 10, 10, fundal, [2, 2, 4, 4]), 1);
});

test('verificaTextVizibil: o proporție NaN sau Infinity e text-invizibil („nu s-a putut măsura”), nu trecere', () => {
  const r = verificaTextVizibil([
    { ref: 'Scena 1', t: 2.15, proportie: NaN, camp: 'scene[0]' },
    { ref: 'Scena 2', t: 6.4, proportie: Infinity, camp: 'scene[1]' },
    { ref: 'Scena 3', t: 9, proportie: -Infinity, camp: 'scene[2]' },
    { ref: 'Scena 4', t: 11, proportie: 0.2, camp: 'scene[3]' },
  ]);
  assert.equal(r.ok, false);
  assert.deepEqual(r.erori.map((e) => [e.cod, e.camp]), [
    ['text-invizibil', 'scene[0]'], ['text-invizibil', 'scene[1]'], ['text-invizibil', 'scene[2]'],
  ]);
  assert.match(r.erori[0].mesaj, /Scena 1: la 2,15 s, textul nu s-a putut măsura \(proporția a ieșit NaN\)/);
  assert.match(r.erori[1].mesaj, /Infinity/);
  // în valoare (JSON), proporția nemăsurată e null, nu NaN
  assert.deepEqual(r.valoare.masuratori.map((m) => m.proportie), [null, null, null, 0.2]);
  assert.throws(() => verificaTextVizibil([], { min: NaN }), /Pragul minim/);
  assert.throws(() => verificaTextVizibil([], { max: Infinity }), /Pragul maxim/);
});

test('verificaGoluri: golul de la început se socotește de la primul desen; peste 1 s după el pică', () => {
  // măsurat pe randările reale (B17): hartie gol [0; 1,1] cu primul desen la 0,5 s, curat la 0,4 s: rămân 0,6 și 0,7 s
  for (const primul of [0.5, 0.4]) {
    const s = serie(8, [[0, 1.1]]).map((c) => ({ ...c, desen: c.t >= primul - 1e-9 }));
    const r = verificaGoluri(s, { segmente: SEGMENTE });
    assert.equal(r.ok, true, `primul desen la ${primul} s: ${JSON.stringify(r.erori)}`);
  }
  // desen de la 0,4 s, dar ecranul rămâne sub 0,3% până la 1,6 s: 1,2 s după primul desen, deci pică pe scena 1
  const lung = serie(8, [[0, 1.6]]).map((c) => ({ ...c, desen: c.t >= 0.4 - 1e-9 }));
  const r = verificaGoluri(lung, { segmente: SEGMENTE });
  assert.equal(r.ok, false);
  assert.equal(r.erori.length, 1);
  assert.equal(r.erori[0].cod, 'cadre-goale');
  assert.equal(r.erori[0].camp, 'scene[0]');
  assert.match(r.erori[0].mesaj, /după primul desen \(0,4 s\), ecranul rămâne aproape gol până la 1,6 s \(1,2 s; cel mult 1 s\)/);
  // exact 1,0 s după primul desen trece (aceeași margine ca golurile din mijloc)
  const limita = serie(8, [[0, 1.4]]).map((c) => ({ ...c, desen: c.t >= 0.4 - 1e-9 }));
  assert.equal(verificaGoluri(limita, { segmente: SEGMENTE }).ok, true);
  // primul conținut târziu nu dă două erori pentru același gol
  const tarziu = verificaGoluri(serie(8, [[0, 1.5]]), { segmente: SEGMENTE });
  assert.equal(tarziu.erori.length, 1);
});
