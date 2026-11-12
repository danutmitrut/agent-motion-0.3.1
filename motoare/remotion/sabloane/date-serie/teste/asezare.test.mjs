// Așezarea (I07): mărimile, rândurile, pozițiile și casetele, măsurate cu fontkit în fontul real al fiecărei teme.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aseaza, orientareBare, marimi, etichetaAfisata, plajaTreapta } from '../asezare.mjs';
import { LATIME_RAND } from '../src/comun/zone.mjs';
import { REPO, exemplu, sablonul, stilPlat } from './ajutoare.mjs';

async function asezat(date, tema = null, sigla = null) {
  const sab = await sablonul();
  return aseaza({ date, stilPlat: stilPlat(sab, date, tema), radacina: REPO, sigla });
}
const titluri = (a) => a.scene.map((sc) => sc.texte.find((t) => t.id === 'titlu')?.marime ?? null);
const erori = (a) => a.erori.map((e) => [e.cod, e.camp, e.verificare]);

test('marimi: de la max la min, cu pasul, minimul inclus', () => {
  assert.deepEqual(marimi({ max: 110, min: 84, pas: 2 }).length, 14);
  assert.deepEqual(marimi({ max: 44, min: 32, pas: 5 }), [44, 39, 34, 32]);
});

test('etichetaAfisata: prefixul și majusculele temei', () => {
  assert.equal(etichetaAfisata('Cursanți', { majuscule: true, prefix: '' }), 'CURSANȚI');
  assert.equal(etichetaAfisata('Cursanți', { majuscule: false, prefix: '// ' }), '// Cursanți');
});

test('mărimea titlului coboară de la 110 doar cât trebuie, pe fontul fiecărei teme', async () => {
  const date = exemplu('grafic.date');
  assert.deepEqual(titluri(await asezat(date, 'noapte')), [96, null, 110, 110, 98]);
  assert.deepEqual(titluri(await asezat(date, 'hartie')), [92, null, 110, 110, 94]);
  assert.deepEqual(titluri(await asezat(date, 'curat')), [96, null, 110, 110, 98]);
});

test('fiecare rând încape în 883,2 px și totul stă în zona sigură, în pixeli întregi', async () => {
  for (const tema of ['noapte', 'hartie', 'curat']) {
    const a = await asezat(exemplu('grafic.date'), tema);
    assert.deepEqual(a.erori, []);
    for (const t of a.scene.flatMap((sc) => sc.texte)) {
      for (const k of ['x', 'y', 'latime', 'inaltime', 'marime']) assert.ok(Number.isInteger(t[k]), `${tema} ${t.id}.${k}`);
      assert.ok(t.x >= 80 && t.x + t.latime <= 1000, `${tema} ${t.id} iese pe lățime`);
      assert.ok(t.y >= 200 && t.y + t.inaltime <= 1594, `${tema} ${t.id} iese pe înălțime`);
      assert.equal(t.randuri.length, t.casete.length);
      assert.equal(t.text, t.randuri.join('\n'));
      for (const c of t.casete) assert.ok(c[2] <= Math.ceil(LATIME_RAND), `${tema} ${t.id}: ${c[2]} px`);
    }
  }
});

test('grafic.date pe noapte: titlul scenei 1, cifra, valorile comparației', async () => {
  const a = await asezat(exemplu('grafic.date'), 'noapte');
  const titlu = a.scene[0].texte[1];
  assert.deepEqual(
    [titlu.id, titlu.randuri, titlu.x, titlu.y, titlu.latime, titlu.inaltime, titlu.marime, titlu.campuri, titlu.casete],
    ['titlu', ['Cursul meu online,', 'în cifre'], 80, 774, 880, 230, 96, ['scene[0].titlu[0]', 'scene[0].titlu[1]'], [[80, 774, 880, 115], [80, 889, 324, 115]]],
  );
  assert.deepEqual(a.scene[0].texte[0].randuri, ['PRIMUL SEMESTRU']);
  const cifra = a.scene[1].texte.find((t) => t.id === 'valoare');
  assert.deepEqual([cifra.text, cifra.marime, cifra.culoare, cifra.font], ['1.248', 220, 'accent', 'titlu']);
  assert.deepEqual(a.scene[1].detalii, { valoare: 1248, zecimale: 0, prefix: '', sufix: '', idText: 'valoare' });
  assert.deepEqual(a.scene[3].texte.filter((t) => t.id.startsWith('valoare-')).map((t) => [t.text, t.marime, t.culoare]),
    [['41.200 lei', 140, 'text'], ['78.450 lei', 140, 'accent']]);
  assert.deepEqual(a.scene.map((sc) => sc.zona), [[80, 697, 920, 400], [80, 680, 920, 434], [80, 200, 920, 1394], [80, 562, 920, 670], [80, 733, 920, 328]]);
});

test('barele: coloane când etichetele au cel mult 5 caractere, axa de la 0, bara evidențiată în accent', async () => {
  const date = exemplu('grafic.date');
  assert.equal(orientareBare(date.scene[2]), 'coloane');
  const a = await asezat(date, 'noapte');
  const d = a.scene[2].detalii;
  assert.equal(d.orientare, 'coloane');
  assert.deepEqual(d.axa, { x: 80, y: 1445, latime: 920, inaltime: 2 });
  assert.deepEqual(d.bare.map((b) => [b.x, b.y, b.latime, b.inaltime, b.accent]), [
    [109, 1079, 95, 366, false], [263, 1049, 95, 396, false], [416, 894, 95, 551, false],
    [569, 957, 95, 488, false], [723, 757, 95, 688, false], [876, 517, 95, 928, true],
  ]);
  for (const b of d.bare) assert.equal(b.y + b.inaltime, d.axa.y, 'fiecare bară pornește din axă');
  const v5 = a.scene[2].texte.find((t) => t.id === 'valoare-5');
  assert.deepEqual([v5.text, v5.marime, v5.culoare, v5.aliniere, v5.y + v5.inaltime + 12], ['21.300', 40, 'accent', 'centru', 517]);
});

test('barele orizontale: etichetele lungi, lățimea proporțională cu valoarea, valoarea la dreapta', async () => {
  const date = exemplu('grafic.date');
  date.scene[2].valori = [['ianuarie', 8400], ['februarie', 9100], ['martie', 12650], ['aprilie', 11200]].map(([eticheta, valoare]) => ({ eticheta, valoare }));
  date.scene[2].evidentiaza = 'aprilie';
  assert.equal(orientareBare(date.scene[2]), 'orizontal');
  const a = await asezat(date, 'noapte');
  const d = a.scene[2].detalii;
  assert.deepEqual(d.bare.map((b) => [b.x, b.y, b.latime, b.inaltime, b.accent]), [
    [80, 516, 611, 24, false], [80, 619, 662, 24, false], [80, 722, 920, 24, false], [80, 825, 815, 24, true],
  ]);
  assert.deepEqual(d.axa, { x: 80, y: 516, latime: 2, inaltime: 333 });
  for (const t of a.scene[2].texte.filter((x) => x.id.startsWith('valoare-'))) assert.equal(t.x + t.latime, 1000, t.id);
});

test('8 bare orizontale cu antet și sursă pe 2 rânduri: textele graficului coboară la 42 px ca să încapă pe înălțime', async () => {
  const date = exemplu('grafic.date');
  const luni = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august'];
  Object.assign(date.scene[2], {
    eticheta: 'Primul an', titlu: ['Vânzări', 'pe luni'], evidentiaza: 'august',
    valori: luni.map((eticheta, k) => ({ eticheta, valoare: 1000 * (k + 1) })),
    sursa: 'Stripe, export 1 iulie 2026, toate produsele, fără rambursări și fără TVA',
  });
  const a = await asezat(date, 'noapte');
  assert.deepEqual(a.erori, []);
  const texte = a.scene[2].texte;
  assert.deepEqual([...new Set(texte.filter((t) => /-\d$/.test(t.id)).map((t) => t.marime))], [42]);
  assert.deepEqual(texte.find((t) => t.id === 'sursa').randuri.length, 2);
  assert.equal(texte.at(-1).y + texte.at(-1).inaltime, 1594);
});

test('S04: rândul de titlu care nu încape nici la 84 px, pe câmpul lui', async () => {
  const date = exemplu('grafic.date');
  date.scene[4].titlu = ['Următoarea grupă', 'începe pe 15 octombrie'];
  const a = await asezat(date, 'noapte');
  assert.deepEqual(erori(a), [['rand-nu-incape', 'scene[4].titlu[1]', 'S04']]);
  assert.equal(a.erori[0].mesaj, 'Scena 5, rândul 2 din titlu, „începe pe 15 octombrie”, are 948 px la 84 px și nu încape (încap 883 px).');
  assert.deepEqual(a.scene, []);
  const h = await asezat(date, 'hartie');
  assert.match(h.erori[0].mesaj, /are 953 px la 84 px/);
});

test('S04: cifra prea lată la 140 px, valoarea barei prea lată în coloana ei, subtitlul pe mai mult de 2 rânduri', async () => {
  const d1 = exemplu('grafic.date');
  Object.assign(d1.scene[1], { valoare: 999999999, sufix: ' lei' });
  const a1 = await asezat(d1, 'noapte');
  assert.deepEqual(erori(a1), [['rand-nu-incape', 'scene[1].valoare', 'S04']]);
  assert.match(a1.erori[0].mesaj, /„999\.999\.999 lei”, are 1119 px la 140 px/);
  assert.match(a1.erori[0].sugestie, /mii sau milioane/);

  const d2 = exemplu('grafic.date');
  d2.scene[2].valori = Array.from({ length: 8 }, () => ({ eticheta: 'abcde', valoare: 123456789 }));
  delete d2.scene[2].evidentiaza;
  const a2 = await asezat(d2, 'noapte');
  assert.deepEqual(erori(a2), [['rand-nu-incape', 'scene[2].valori[0].valoare', 'S04']]);
  assert.match(a2.erori[0].mesaj, /^Scena 3, valoarea 1, „123\.456\.789”, are 208 px la 32 px și nu încape \(încap 110 px\)\.$/);

  const d3 = exemplu('grafic.date');
  d3.scene[0].subtitlu = 'Ianuarie-iunie 2026, toate cursurile online și offline, cu toți cursanții activi, inclusiv cei care s-au înscris târziu';
  assert.deepEqual(erori(await asezat(d3, 'noapte')), [['rand-nu-incape', 'scene[0].subtitlu', 'S04']]);
});

test('sigla: cutia de 360x140, sub îndemn, în scena final', async () => {
  const a = await asezat(exemplu('grafic.date'), 'noapte', { latime: 200, inaltime: 80 });
  assert.deepEqual(a.sigla, { x: 80, y: 1019, latime: 350, inaltime: 140 });
  const cta = a.scene[4].texte.find((t) => t.id === 'cta');
  assert.equal(cta.y + cta.inaltime + 56, a.sigla.y);
  assert.equal((await asezat(exemplu('grafic.date'), 'noapte')).sigla, null);
});

test('așezarea e deterministă: același rezultat la două rulări', async () => {
  const x = JSON.stringify(await asezat(exemplu('grafic.date'), 'hartie'));
  assert.equal(JSON.stringify(await asezat(exemplu('grafic.date'), 'hartie')), x);
});

test('valoarea unei bare se măsoară cu fiecare cifră înlocuită de 0, ca la cifră și la comparație (lățimea în timpul numărătorii)', async () => {
  const lat = async (valoare) => {
    const date = exemplu('grafic.date');
    date.scene[2].valori = date.scene[2].valori.map((v, k) => ({ ...v, valoare: k === 0 ? valoare : 1000 }));
    delete date.scene[2].evidentiaza;
    const a = await asezat(date, 'noapte');
    assert.deepEqual(a.erori, []);
    const t = a.scene[2].texte.find((x) => x.id === 'valoare-0');
    return [t.latime, t.casete[0][2], t.marime];
  };
  assert.deepEqual(await lat(11111), await lat(88888));
  assert.deepEqual(await lat(21300), await lat(20444));
});

// Felia 2: treptele lui marime, alinierea la centru și afixele mai mici la cifra XL.
const scenaCifra = (extra) => ({ sablon: 'date-serie', versiune_schema: 1, compozitie: 'grafic', scene: [
  { tip: 'cifra', valoare: 54, prefix: '+', sufix: '%', text: 'creștere față de septembrie', ...extra }, { tip: 'final', titlu: ['Mulțumesc'] }] });
const valoare = (a) => a.scene[0].texte.find((t) => t.id === 'valoare');

test('plajaTreapta: M neschimbat, L și XL pornesc de la maximul lui M, pe același pas', () => {
  assert.deepEqual(plajaTreapta({ max: 220, min: 140, pas: 4 }, undefined), { max: 220, min: 140, pas: 4 });
  assert.deepEqual(plajaTreapta({ max: 220, min: 140, pas: 4 }, 'L'), { max: 288, min: 252, pas: 4 });
  assert.deepEqual(plajaTreapta({ max: 220, min: 140, pas: 4 }, 'XL', true), { max: 440, min: 288, pas: 4 });
  assert.deepEqual(plajaTreapta({ max: 110, min: 84, pas: 2 }, 'XL'), { max: 176, min: 144, pas: 2 });
});

test('cifra crește pe trepte (M < L < XL), iar la XL „+” și „%” sunt la jumătate', async () => {
  const [m, l, xl] = await Promise.all([undefined, 'L', 'XL'].map(async (marime) => valoare(await asezat(scenaCifra({ marime }), 'noapte'))));
  assert.ok(m.marime < l.marime && l.marime < xl.marime, `${m.marime} ${l.marime} ${xl.marime}`);
  assert.equal(m.afixe, undefined);
  assert.deepEqual(xl.afixe, { prefix: '+', sufix: '%', marime: Math.round(xl.marime / 2) });
  assert.ok(xl.latime <= LATIME_RAND);
});

test('aliniere centru: blocurile stau la mijlocul lățimii utile', async () => {
  const a = await asezat(scenaCifra({ marime: 'XL', aliniere: 'centru' }), 'noapte');
  for (const t of a.scene[0].texte) {
    assert.ok(Math.abs(t.x + t.latime / 2 - 540) <= 1, `${t.id} nu e centrat`);
    assert.equal(t.aliniere, 'centru');
  }
  assert.equal(a.scene[1].texte[0].x, 80, 'scena fără aliniere rămâne la stânga');
});

test('o treaptă care nu încape dă rand-nu-incape cu sugestia unei trepte mai mici, fără micșorare pe ascuns', async () => {
  const a = await asezat(scenaCifra({ valoare: 12900, prefix: undefined, sufix: ' lei', marime: 'L' }), 'noapte');
  assert.deepEqual(erori(a), [['rand-nu-incape', 'scene[0].valoare', 'S04']]);
  assert.match(a.erori[0].sugestie, /scene\[0\]\.marime pe "M"/);
});
