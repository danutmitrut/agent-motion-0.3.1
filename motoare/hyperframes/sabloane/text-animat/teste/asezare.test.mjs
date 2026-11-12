import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { aseazaScena, creeazaMasuratori, greutateTitlu, etichetaAfisata, aliniereScena } from '../asezare.mjs';
import { rotunjeste } from '../../../../../nucleu/lib/cronologie.mjs';

const REPO = fileURLToPath(new URL('../../../../../', import.meta.url));
const citeste = (rel) => JSON.parse(fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8'));
const implicite = citeste('../implicite.json');
const minim = citeste('../exemple/minim.json');
const tema = (nume) => JSON.parse(fs.readFileSync(`${REPO}motoare/comun/teme/${nume}.json`, 'utf8'));

function stilDin(numeTema, peste = {}) {
  const t = tema(numeTema);
  return { tema: numeTema, culori: { ...t.culori, linie: t.culori.text }, font_titlu: t.font_titlu, font_text: t.font_text, eticheta: t.eticheta, atmosfera: t.atmosfera, ritm: 'normal', ...peste };
}

function aseaza(scena, { i = 0, stil = stilDin('noapte'), format = implicite.formate.vertical, sigla = null } = {}) {
  const masuri = creeazaMasuratori(REPO, stil, implicite);
  return aseazaScena({ scena, i, stilPlat: stil, implicite, format, masuri, aliniere: aliniereScena(stil, implicite), sigla });
}
const piese = (a) => a.blocuri.flatMap((b) => b.randuri.flatMap((r) => r.parti.filter((p) => p.tip === 'piesa')));

test('greutatea titlului: montserrat 800, restul 700, fontul de brand 700', () => {
  assert.equal(greutateTitlu('montserrat', implicite), 800);
  assert.equal(greutateTitlu('inter', implicite), 700);
  assert.equal(greutateTitlu({ fisier: 'branduri/x/f.woff2', familie: 'X' }, implicite), 700);
});

test('eticheta și alinierea vin din temă, alinierea din date are prioritate', () => {
  assert.equal(etichetaAfisata('Pentru soloprenori', { majuscule: true, prefix: '' }), 'PENTRU SOLOPRENORI');
  assert.equal(etichetaAfisata('Nou', { majuscule: false, prefix: '/ ' }), '/ Nou');
  assert.equal(aliniereScena(stilDin('noapte'), implicite), 'centru');
  assert.equal(aliniereScena(stilDin('hartie'), implicite), 'stanga');
  assert.equal(aliniereScena(stilDin('noapte', { aliniere: 'stanga' }), implicite), 'stanga');
});

test('scena 1 din minim: eticheta mică, titlul mare la 104 px, piesele pe segmentele de accent, centrat vertical', () => {
  const a = aseaza(minim.scene[0]);
  assert.deepEqual(a.erori, []);
  assert.deepEqual(a.blocuri.map((b) => [b.id, b.fel, b.rol, b.marime]), [['b1-1', 'eticheta', 'mic', 36], ['b1-2', 'randuri', 'mare', 104]]);
  assert.deepEqual(piese(a).map((p) => [p.id, p.text, p.accent]), [
    ['t1-1', 'PENTRU SOLOPRENORI', false], ['t1-2', 'Lucrezi 12 ore', false], ['t1-3', 'și tot', false], ['t1-4', 'nu ajungi', true], ['t1-5', '?', false],
  ]);
  const H = 36 * 1.3 + 28 + 2 * 104 * 1.08;
  assert.equal(a.inaltime, rotunjeste(H, 2));
  assert.equal(a.blocuri[0].y, rotunjeste(200 + (1390 - H) / 2, 2));
  assert.equal(a.blocuri[1].y, rotunjeste(a.blocuri[0].y + 36 * 1.3 + 28, 2));
  const [r1, r2, r3] = a.blocuri.flatMap((b) => b.randuri);
  assert.deepEqual([r1.id, r2.id, r3.id], ['r1-1', 'r1-2', 'r1-3']);
  assert.equal(r3.y, rotunjeste(a.blocuri[1].y + 104 * 1.08, 2));
  for (const r of [r1, r2, r3]) assert.ok(Math.abs(r.x + r.w / 2 - 540) < 0.02, `rândul ${r.id} e centrat`);
  const [, , p3, p4, p5] = piese(a);
  assert.equal(p3.caseta[0], r3.x);
  assert.ok(p4.caseta[0] > p3.caseta[0] + p3.caseta[2], 'spațiul dintre „și tot” și accent');
  assert.ok(Math.abs(p5.caseta[0] - (p4.caseta[0] + p4.caseta[2])) < 1, '„?” e lipit de accent');
  assert.deepEqual([p4.caseta[1], p4.caseta[3]], [r3.y, r3.h]);
});

test('pe hartie (stânga), rândurile încep la marginea zonei', () => {
  const a = aseaza(minim.scene[0], { stil: stilDin('hartie') });
  for (const r of a.blocuri.flatMap((b) => b.randuri)) assert.equal(r.x, 96);
});

test('fraza: o piesă pe cuvânt, cel mult 3 rânduri; prea lungă: rand-nu-incape pe S03', () => {
  const a = aseaza({ tip: 'fraza', text: 'Nu munca e problema. *Rutina* e.' }, { i: 1 });
  assert.deepEqual(a.erori, []);
  assert.deepEqual(piese(a).map((p) => p.text), ['Nu', 'munca', 'e', 'problema.', 'Rutina', 'e.']);
  assert.deepEqual(piese(a).map((p) => p.id), ['t2-1', 't2-2', 't2-3', 't2-4', 't2-5', 't2-6']);
  assert.equal(piese(a)[4].accent, true);
  const lunga = aseaza({ tip: 'fraza', text: 'Optsprezece cuvinte lungi despărțite frumos nu încap niciodată pe trei rânduri mari' }, { i: 1 });
  assert.deepEqual(lunga.erori.map((e) => [e.cod, e.camp, e.verificare]), [['rand-nu-incape', 'scene[1].text', 'S03']]);
});

test('un rând de titlu care nu încape nici la 90 px: rand-nu-incape pe C04, pe rândul lui', () => {
  const a = aseaza({ tip: 'titlu', titlu: ['Scurt', 'Antreprenoriatul solitar'] }, { i: 2 });
  assert.deepEqual(a.erori.map((e) => [e.cod, e.camp]), [['rand-nu-incape', 'scene[2].titlu[1]']]);
  assert.match(a.erori[0].mesaj, /^Scena 3, rândul 2 din titlu, „Antreprenoriatul solitar”/);
});

test('titlul care nu încape la 104 px se micșorează în pași de 2 px până încape', () => {
  const a = aseaza({ tip: 'titlu', titlu: ['Clienții tăi zâmbesc'] });
  assert.deepEqual(a.erori, []);
  assert.equal(a.blocuri[0].marime, 92); // 951 px la 104, 841 px la 92 (încape în 852), 877 px la 96
});

test('lista: marcajul și golul în fața punctelor, grupul centrat, bifele cu id', () => {
  const a = aseaza(minim.scene[1], { i: 1 });
  assert.deepEqual(a.erori, []);
  const lista = a.blocuri.find((b) => b.fel === 'lista');
  assert.equal(lista.marcaj, 'bife');
  assert.equal(lista.marcajW, rotunjeste(0.9 * lista.marime, 2));
  assert.equal(lista.gol, rotunjeste(0.45 * lista.marime, 2));
  assert.ok(Math.abs(lista.x + lista.w / 2 - 540) < 0.02);
  const randuri = lista.randuri;
  assert.deepEqual(randuri.map((r) => r.marcajId), ['m2-1', 'm2-2', 'm2-3']);
  for (const r of randuri) assert.equal(r.x, rotunjeste(lista.x + lista.marcajW + lista.gol, 2));
  assert.equal(randuri[1].y, rotunjeste(randuri[0].y + lista.marime * 1.2 + 22, 2));
});

test('cifra: valoarea formatată românește cu două grupe de mii, o singură piesă', () => {
  const a = aseaza({ tip: 'cifra', valoare: 1250000, text: 'economisiți', sursa: 'raport intern' }, { i: 0 });
  assert.deepEqual(a.erori, []);
  assert.deepEqual(a.blocuri.map((b) => b.fel), ['cifra', 'rupt', 'mic']);
  assert.equal(piese(a)[0].text, '1.250.000');
  assert.equal(a.blocuri[0].marime, 164); // la 160 px „0.000.000” are 825 px, deci mărimea scade de la 220 la 164
  const scurta = aseaza({ tip: 'cifra', valoare: 12500, prefix: '€', text: 'economisiți' });
  assert.deepEqual(scurta.erori, []);
  assert.equal(piese(scurta)[0].text, '€12.500');
});

test('cifra prea lată chiar la minimul de 160 px: rand-nu-incape pe câmpul valorii, fără micșorare ascunsă', () => {
  const a = aseaza({ tip: 'cifra', valoare: 1250000, prefix: '€', text: 'economisiți' }, { i: 0 });
  assert.deepEqual(a.erori.map((e) => [e.cod, e.camp, e.verificare]), [['rand-nu-incape', 'scene[0].valoare', undefined]]);
  assert.match(a.erori[0].mesaj, /nici la 160 px/);
  assert.deepEqual(a.blocuri, []);
});

test('citatul primește „ și ”, autorul și rolul sunt mici', () => {
  const a = aseaza({ tip: 'citat', text: 'Am recuperat o zi pe săptămână încă din prima lună.', autor: 'Ioana Pop', rol: 'fondatoare, Studio Lemn' }, { i: 5 });
  assert.deepEqual(a.erori, []);
  const p = piese(a);
  assert.ok(p[0].text.startsWith('„'));
  assert.ok(p.filter((x) => x.camp === 'scene[5].text').at(-1).text.endsWith('”'));
  assert.deepEqual(a.blocuri.map((b) => [b.fel, b.rol]), [['rupt', 'mediu'], ['mic', 'mic'], ['mic', 'mic']]);
});

test('finalul cu siglă: cutia formatului, raportul păstrat, spațiul de 56 px', () => {
  const a = aseaza(minim.scene[2], { i: 2, sigla: { latime: 400, inaltime: 100 } });
  assert.deepEqual(a.erori, []);
  const s = a.blocuri.at(-1);
  assert.equal(s.fel, 'sigla');
  assert.deepEqual([s.w, s.h], [360, 90]);
  const inainte = a.blocuri.at(-2);
  assert.equal(s.y, rotunjeste(inainte.y + inainte.h + 56, 2));
});

test('un bloc mai înalt decât zona: rand-nu-incape pe S03, pe scenă', () => {
  const format = { latime: 1080, inaltime: 1080, zona: [108, 108, 864, 200] };
  const a = aseaza(minim.scene[0], { i: 0, format });
  assert.deepEqual(a.erori.map((e) => [e.cod, e.camp, e.verificare]), [['rand-nu-incape', 'scene[0]', 'S03']]);
});

test('pătratul are zona mai îngustă: același titlu coboară mai jos decât în vertical', () => {
  // „Programări online”: 865 px la 104 (nu încape în 852 vertical, nici în 829 pătrat); 98 px în pătrat, 102 px în vertical
  const scena = { tip: 'titlu', titlu: ['Programări online'] };
  const a = aseaza(scena, { format: implicite.formate.patrat });
  const v = aseaza(scena);
  assert.deepEqual(a.erori, []);
  assert.deepEqual(v.erori, []);
  assert.equal(v.blocuri[0].marime, 102);
  assert.equal(a.blocuri[0].marime, 98);
  assert.ok(a.blocuri[0].marime < v.blocuri[0].marime);
});

test('cifra care nu încape: sugestia o scrie în milioane, cu valoare, zecimale și sufix', () => {
  const a = aseaza({ tip: 'cifra', valoare: 1250000, prefix: '€', text: 'cifra de afaceri' });
  assert.equal(a.erori.length, 1);
  assert.deepEqual([a.erori[0].cod, a.erori[0].camp], ['rand-nu-incape', 'scene[0].valoare']);
  assert.match(a.erori[0].sugestie, /valoare 1\.25/);
  assert.match(a.erori[0].sugestie, /zecimale 2/);
  assert.match(a.erori[0].sugestie, /sufix „ mil\.”/);
  assert.doesNotMatch(a.erori[0].sugestie, /^Scurtează scene\[0\]\.valoare\.$/);
  const b = aseaza({ tip: 'cifra', valoare: 12500000, text: 'cifra de afaceri' });
  assert.match(b.erori[0].sugestie, /valoare 12\.5/);
  assert.match(b.erori[0].sugestie, /zecimale 1/);
  const c = aseaza({ tip: 'cifra', valoare: 980000, prefix: '€', sufix: ' lei', text: 'cifra de afaceri' });
  assert.match(c.erori[0].sugestie, /valoare 980/);
  assert.match(c.erori[0].sugestie, /mii/);
});

test('la final, sugestiile de lățime nu cer împărțirea în două scene', () => {
  const a = aseaza({ tip: 'final', titlu: ['Un titlu de final mult prea lung pentru rând'] });
  assert.equal(a.erori.length, 1);
  assert.equal(a.erori[0].camp, 'scene[0].titlu[0]');
  assert.doesNotMatch(a.erori[0].sugestie, /împarte|două scene/);
  assert.match(a.erori[0].sugestie, /Scurtează/);
  const b = aseaza({ tip: 'titlu', titlu: ['Un titlu mult prea lung pentru un singur rând pe ecran', 'a', 'b'] });
  assert.match(b.erori[0].sugestie, /împarte scena în două/);
});

// Felia 2: treptele lui marime pe elementul principal; o scenă plină nu crește, iar eroarea cere o treaptă mai mică.
test('marime: titlul crește la L și XL, eticheta rămâne la 36 px', () => {
  const marimeTitlu = (marime) => {
    const a = aseaza({ tip: 'titlu', eticheta: 'Duminică', titlu: ['Planul', 'săptămânii'], marime });
    assert.deepEqual(a.erori, []);
    return [a.blocuri.find((b) => b.rol === 'mare').marime, a.blocuri.find((b) => b.fel === 'eticheta').marime];
  };
  const [m, l, xl] = [undefined, 'L', 'XL'].map(marimeTitlu);
  assert.ok(m[0] < l[0] && l[0] < xl[0], `${m[0]} ${l[0]} ${xl[0]}`);
  assert.deepEqual([m[1], l[1], xl[1]], [36, 36, 36]);
});

test('marime pe o listă plină: XL nu încape și sugestia e o treaptă mai mică, fără micșorare pe ascuns', () => {
  const plina = { tip: 'lista', titlu: ['Duminică seara'], puncte: ['Ce am terminat săptămâna asta?', 'Ce mă așteaptă luni dimineață?', 'Ce pot delega sau amâna?', 'Când îmi fac timp pentru mine?', 'Care e singurul lucru important?'] };
  assert.deepEqual(aseaza(plina).erori, []);
  const a = aseaza({ ...plina, marime: 'XL' });
  assert.ok(a.erori.length > 0);
  assert.equal(a.erori[0].cod, 'rand-nu-incape');
  assert.match(a.erori[0].sugestie, /scene\[0\]\.marime pe "L" sau "M"/);
});
