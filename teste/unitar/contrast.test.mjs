import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hexInRgb,
  rgbInHex,
  luminantaRelativa,
  raportContrast,
  PRAGURI_C06,
  verificaContrast,
  amestecaAlfa,
  STRATURI_CEATA,
  puncteFundal,
  punctCelMaiDeschis,
  punctCelMaiNefavorabil,
  limitaIntensitate,
} from '../../nucleu/lib/contrast.mjs';

test('hexInRgb și rgbInHex', () => {
  assert.deepEqual(hexInRgb('#F3EBDD'), [243, 235, 221]);
  assert.deepEqual(hexInRgb('#ff7a59'), [255, 122, 89]);
  assert.equal(rgbInHex([255, 122, 89]), '#FF7A59');
  assert.equal(rgbInHex([0, 0.4, 300]), '#0000FF');
  assert.throws(() => hexInRgb('#FFF'), TypeError);
  assert.throws(() => hexInRgb('rosu'), TypeError);
});

test('luminantaRelativa: capetele scalei', () => {
  assert.equal(luminantaRelativa('#000000'), 0);
  assert.equal(luminantaRelativa('#FFFFFF'), 1);
});

test('raportContrast: alb pe negru e 21, simetric, rotunjit la 2 zecimale', () => {
  assert.equal(raportContrast('#FFFFFF', '#000000'), 21);
  assert.equal(raportContrast('#000000', '#FFFFFF'), 21);
  assert.equal(raportContrast('#777777', '#777777'), 1);
  assert.equal(raportContrast('#767676', '#FFFFFF'), 4.54);
});

test('PRAGURI_C06', () => {
  assert.deepEqual(PRAGURI_C06, { text: 4.5, accent: 3, linie: 3, atenuat: 3 });
  assert.ok(Object.isFrozen(PRAGURI_C06));
});

test('verificaContrast trece pe culori bune', () => {
  const r = verificaContrast({ fundal: '#F3EBDD', text: '#2A2420', atenuat: '#6B6157', accent: '#C2410C', linie: '#2A2420' });
  assert.equal(r.cod, 'C06');
  assert.equal(r.ok, true);
  assert.equal(r.camp, null);
  assert.deepEqual(r.erori, []);
  assert.deepEqual(Object.keys(r.valoare).sort(), ['accent', 'atenuat', 'linie', 'text']);
  assert.deepEqual(r.prag, { text: 4.5, accent: 3, linie: 3, atenuat: 3 });
});

test('verificaContrast: accent slab dă contrast-slab pe stil.culori.accent', () => {
  const r = verificaContrast({ fundal: '#FFFFFF', text: '#111418', atenuat: '#5B6470', accent: '#FFD60A' });
  assert.equal(r.ok, false);
  assert.equal(r.camp, 'stil.culori.accent');
  assert.equal(r.erori.length, 1);
  assert.equal(r.erori[0].cod, 'contrast-slab');
  assert.match(r.erori[0].mesaj, /minimul este 3:1/);
  assert.match(r.erori[0].sugestie, /stil\.culori\.accent/);
});

test('verificaContrast: atenuatul slab se raportează pe stil.culori.text', () => {
  const r = verificaContrast({ fundal: '#0E0F13', text: '#F2EFEA', atenuat: '#2A2B30', accent: '#FF7A59' });
  assert.equal(r.ok, false);
  assert.deepEqual(
    r.erori.map((e) => [e.cod, e.camp]),
    [['contrast-slab', 'stil.culori.text']],
  );
  assert.match(r.erori[0].mesaj, /^Stil: Textul atenuat/);
});

test('verificaContrast: text sub 4,5 pică, linia lipsă nu se verifică', () => {
  const r = verificaContrast({ fundal: '#FFFFFF', text: '#888888', atenuat: '#555555', accent: '#2563EB' });
  assert.deepEqual(
    r.erori.map((e) => e.camp),
    ['stil.culori.text'],
  );
  assert.equal('linie' in r.valoare, false);
  assert.match(r.erori[0].mesaj, /minimul este 4,5:1/);
});

test('verificaContrast acceptă praguri suprascrise', () => {
  const r = verificaContrast(
    { fundal: '#FFFFFF', text: '#111418', atenuat: '#5B6470', accent: '#2563EB' },
    { text: 4.5, accent: 7, linie: 3, atenuat: 3 },
  );
  assert.deepEqual(
    r.erori.map((e) => e.camp),
    ['stil.culori.accent'],
  );
});

test('amestecaAlfa, STRATURI_CEATA, puncteFundal și punctCelMaiDeschis', () => {
  assert.equal(amestecaAlfa('#0E0F13', '#FF7A59', 0.3), '#562F28');
  assert.equal(amestecaAlfa('#0E0F13', '#F2EFEA', 0.14), '#2E2E31');
  assert.equal(amestecaAlfa('#000000', '#FFFFFF', 0), '#000000');
  assert.deepEqual(STRATURI_CEATA, [{ strat: 'sus', jeton: 'accent', alfa: 0.3 }, { strat: 'jos', jeton: 'linie', alfa: 0.14 }]);
  assert.ok(Object.isFrozen(STRATURI_CEATA));
  const noapte = { fundal: '#0E0F13', text: '#F2EFEA', atenuat: '#9A9AA3', accent: '#FF7A59' };
  assert.deepEqual(puncteFundal(noapte), ['#0E0F13']);
  assert.deepEqual(puncteFundal(noapte, 'plin'), ['#0E0F13']);
  // fără linie, al doilea strat folosește textul
  assert.deepEqual(puncteFundal(noapte, 'ceata'), ['#0E0F13', '#562F28', '#2E2E31']);
  assert.equal(punctCelMaiDeschis(puncteFundal(noapte, 'ceata')), '#562F28');
  assert.deepEqual(puncteFundal(noapte, 'degrade', { stopuri: ['#3A3F55'] }), ['#0E0F13', '#3A3F55']);
  assert.equal(punctCelMaiDeschis(['#0E0F13', '#3A3F55', '#20232B']), '#3A3F55');
  assert.throws(() => puncteFundal(noapte, 'degrade'), TypeError);
  assert.throws(() => puncteFundal(noapte, 'degrade', { stopuri: ['rosu'] }), TypeError);
  assert.throws(() => puncteFundal(noapte, 'abur'), TypeError);
});

test('C06 la ceata: culoarea de bază trece, dar punctul cel mai deschis al ceții pică', () => {
  const culori = { fundal: '#0E0F13', text: '#8A8A8A', atenuat: '#9A9AA3', accent: '#FF7A59' };
  // pe fundalul plin, textul are 5,55:1 și trece
  assert.equal(verificaContrast(culori).ok, true);
  assert.equal(verificaContrast(culori, PRAGURI_C06, { atmosfera: 'plin' }).ok, true);
  // în ceață, față de #562F28, textul are 3,32:1 și pică
  const r = verificaContrast(culori, PRAGURI_C06, { atmosfera: 'ceata' });
  assert.equal(r.ok, false);
  assert.equal(r.valoare.text, 3.32);
  assert.deepEqual(r.erori.map((e) => [e.cod, e.camp]), [['contrast-slab', 'stil.culori.text']]);
  assert.match(r.erori[0].mesaj, /punctul cel mai nefavorabil al fundalului \(#562F28, atmosfera ceata, intensitatea 1\)/);
  assert.match(r.erori[0].mesaj, /minimul este 4,5:1/);
});

test('C06 la degrade: un stop deschis face să pice o culoare care trece pe culoarea de bază', () => {
  const culori = { fundal: '#101820', text: '#B0B0B0', atenuat: '#B0B0B0', accent: '#FFD60A' };
  assert.equal(verificaContrast(culori).ok, true);
  const r = verificaContrast(culori, PRAGURI_C06, { atmosfera: 'degrade', stopuri: ['#4A5868'] });
  assert.equal(r.ok, false);
  assert.equal(r.valoare.text, 3.35);
  assert.equal(r.camp, 'stil.culori.text');
  assert.deepEqual(r.erori.map((e) => e.camp), ['stil.culori.text']);
  assert.match(r.erori[0].mesaj, /#4A5868/);
});

/** Tema hartie, cu culorile deciziei 8 (fundal deschis, text închis). */
const HARTIE = { fundal: '#F3EBDD', text: '#2A2420', atenuat: '#6B6157', accent: '#C2410C' };

test('punctCelMaiNefavorabil: cel mai deschis pentru o culoare deschisă, cel mai închis pentru una închisă', () => {
  // pe noapte, textul deschis are punctul cel mai nefavorabil în stratul de accent, cel mai deschis
  assert.equal(punctCelMaiNefavorabil('#F2EFEA', ['#0E0F13', '#562F28', '#2E2E31']), '#562F28');
  // pe hârtie, accentul și textul închise au punctul cel mai nefavorabil în stratul de accent, cel mai închis
  assert.equal(punctCelMaiNefavorabil('#C2410C', ['#F3EBDD', '#E4B89E', '#D7CFC3']), '#E4B89E');
  assert.equal(punctCelMaiNefavorabil('#2A2420', ['#F3EBDD', '#E4B89E', '#D7CFC3']), '#E4B89E');
  // o culoare între puncte: contează contrastul cel mai mic, nu doar capetele
  assert.equal(punctCelMaiNefavorabil('#808080', ['#000000', '#FFFFFF', '#707070']), '#707070');
  // la egalitate, primul
  assert.equal(punctCelMaiNefavorabil('#000000', ['#FFFFFF', '#FFFFFF']), '#FFFFFF');
});

test('puncteFundal cu intensitate: ceața și degradeul se apropie de fundal, 0 dă fundalul plin', () => {
  assert.deepEqual(puncteFundal(HARTIE, 'ceata'), ['#F3EBDD', '#E4B89E', '#D7CFC3']);
  assert.deepEqual(puncteFundal(HARTIE, 'ceata', { intensitate: 1 }), ['#F3EBDD', '#E4B89E', '#D7CFC3']);
  assert.deepEqual(puncteFundal(HARTIE, 'ceata', { intensitate: 0.91 }), ['#F3EBDD', '#E6BDA4', '#D9D2C5']);
  assert.deepEqual(puncteFundal(HARTIE, 'ceata', { intensitate: 0 }), ['#F3EBDD', '#F3EBDD', '#F3EBDD']);
  assert.deepEqual(puncteFundal(HARTIE, 'degrade', { stopuri: ['#D8C9B0'], intensitate: 0.5 }), ['#F3EBDD', '#E6DAC7']);
  assert.deepEqual(puncteFundal(HARTIE, 'plin', { intensitate: 0.3 }), ['#F3EBDD']);
  for (const gresit of [-0.1, 1.2, Number.NaN, '1']) {
    assert.throws(() => puncteFundal(HARTIE, 'ceata', { intensitate: gresit }), TypeError, String(gresit));
  }
});

test('A-Î2: pe hârtie, ceața întreagă face accentul să pice față de punctul cel mai nefavorabil', () => {
  const r = verificaContrast(HARTIE, PRAGURI_C06, { atmosfera: 'ceata', intensitate: 1 });
  assert.equal(r.ok, false);
  assert.deepEqual(r.valoare, { text: 8.49, accent: 2.87, atenuat: 3.35 });
  assert.deepEqual(r.erori.map((e) => [e.cod, e.camp]), [['contrast-slab', 'stil.culori.accent']]);
  assert.match(r.erori[0].mesaj, /punctul cel mai nefavorabil al fundalului \(#E4B89E, atmosfera ceata, intensitatea 1\)/);
});

test('limitaIntensitate pe hârtie la ceata: 0,91, cea mai mare intensitate la care accentul rămâne ≥ 3 și textul ≥ 4,5', () => {
  const k = limitaIntensitate(HARTIE, 'ceata');
  assert.equal(k, 0.91);
  const la = verificaContrast(HARTIE, PRAGURI_C06, { atmosfera: 'ceata', intensitate: k });
  assert.equal(la.ok, true);
  assert.deepEqual(la.valoare, { text: 8.88, accent: 3, atenuat: 3.51 });
  const peste = verificaContrast(HARTIE, PRAGURI_C06, { atmosfera: 'ceata', intensitate: 0.92 });
  assert.equal(peste.ok, false);
  assert.equal(peste.camp, 'stil.culori.accent');
  // fără intensitate dată, verificaContrast măsoară la limită, adică la intensitatea pe care o desenează șablonul
  assert.deepEqual(verificaContrast(HARTIE, PRAGURI_C06, { atmosfera: 'ceata' }).valoare, la.valoare);
});

test('limitaIntensitate la degrade pe fundal deschis: stopurile prea închise se apropie de fundal', () => {
  assert.equal(limitaIntensitate(HARTIE, 'degrade', { stopuri: ['#D8C9B0'] }), 1);
  assert.equal(limitaIntensitate(HARTIE, 'degrade', { stopuri: ['#C9B79A'] }), 0.77);
  assert.equal(limitaIntensitate(HARTIE, 'degrade', { stopuri: ['#B8A383'] }), 0.55);
  const intreg = verificaContrast(HARTIE, PRAGURI_C06, { atmosfera: 'degrade', stopuri: ['#B8A383'], intensitate: 1 });
  assert.equal(intreg.ok, false);
  const limitat = verificaContrast(HARTIE, PRAGURI_C06, { atmosfera: 'degrade', stopuri: ['#B8A383'] });
  assert.equal(limitat.ok, true);
  assert.ok(limitat.valoare.text >= 4.5 && limitat.valoare.accent >= 3, JSON.stringify(limitat.valoare));
  assert.throws(() => limitaIntensitate(HARTIE, 'degrade'), TypeError);
  assert.throws(() => limitaIntensitate(HARTIE, 'abur'), TypeError);
});

test('limitaIntensitate: 1 la plin și pe fundal închis, 0 când nici fundalul plin nu ajunge', () => {
  assert.equal(limitaIntensitate(HARTIE), 1);
  assert.equal(limitaIntensitate(HARTIE, 'plin'), 1);
  // pe fundal închis, ceața se verifică întreagă: limita rămâne 1, iar C06 pică dacă e cazul
  const inchis = { fundal: '#0E0F13', text: '#8A8A8A', atenuat: '#9A9AA3', accent: '#FF7A59' };
  assert.equal(limitaIntensitate(inchis, 'ceata'), 1);
  assert.equal(verificaContrast(inchis, PRAGURI_C06, { atmosfera: 'ceata' }).ok, false);
  // accentul galben pe alb pică și pe fundalul plin: limita e 0, iar eroarea numește fundalul de bază
  const galben = { fundal: '#FFFFFF', text: '#111418', atenuat: '#5B6470', accent: '#FFD60A' };
  assert.equal(limitaIntensitate(galben, 'ceata'), 0);
  const r = verificaContrast(galben, PRAGURI_C06, { atmosfera: 'ceata' });
  assert.equal(r.camp, 'stil.culori.accent');
  assert.match(r.erori[0].mesaj, /față de fundalul #FFFFFF;/);
});
