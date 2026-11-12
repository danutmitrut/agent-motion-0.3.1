// F10: atenuatul calculat (decizia 13) trece C06 față de punctul cel mai nefavorabil al ceții (A-Î2),
// nu doar față de fundalul plin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rezolvaStil, valoriStil, calculeazaAtenuat } from '../../nucleu/lib/teme.mjs';
import { citesteBrand } from '../../nucleu/lib/brand.mjs';
import { verificaContrast, limitaIntensitate, puncteFundal, PRAGURI_C06 } from '../../nucleu/lib/contrast.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';

// Un SablonIncarcat minim (harta 5.8), ca în stil.test.mjs: linia ia culoarea textului.
const SABLON = {
  nume: 'reel-ilustrat',
  meta: { teme: ['noapte', 'hartie', 'curat'] },
  schema: { properties: { stil: { properties: { tema: { enum: ['noapte', 'hartie', 'curat'] } } } } },
  implicite: { jetoane: { linie: 'text' } },
};

function radacina() {
  return creeazaRadacinaTemp({
    copiaza: ['motoare/comun/teme', 'motoare/comun/fonturi'],
    fisiere: {
      'branduri/inchis-galben/vizual.md': '---\nmg: 1\nculori: {fundal: "#101418", accent: "#FFD60A"}\n---\n',
    },
  });
}

/** C06 exact cum îl va chema B (verificariDate): culorile plate și atmosfera stilului. */
function c06(stil) {
  const plat = valoriStil(stil);
  return verificaContrast(plat.culori, PRAGURI_C06, { atmosfera: plat.atmosfera });
}

test('F10: calculeazaAtenuat fără puncte se comportă ca în fișă (doar față de fundal)', () => {
  assert.equal(calculeazaAtenuat('#F2EFEA', '#101418'), '#989796');
  assert.equal(calculeazaAtenuat('#F2EFEA', '#101418', 3, ['#101418']), '#989796');
});

test('F10: calculeazaAtenuat cu punctele ceții urcă ponderea până trece față de punctul cel mai nefavorabil', () => {
  const puncte = puncteFundal({ fundal: '#101418', text: '#F2EFEA', accent: '#FFD60A', linie: '#F2EFEA' }, 'ceata');
  assert.equal(calculeazaAtenuat('#F2EFEA', '#101418', 3, puncte), '#A3A2A1');
});

test('F10: noapte cu date {fundal închis, accent galben}: atenuatul calculat trece C06 la ceață', () => {
  const r = radacina();
  try {
    const date = { stil: { culori: { fundal: '#101418', accent: '#FFD60A' } } };
    const { stil, erori } = rezolvaStil({ radacina: r.radacina, sablon: SABLON, date, brand: null });
    assert.deepEqual(erori, []);
    assert.deepEqual(stil.atmosfera, { valoare: 'ceata', sursa: 'tema' });
    assert.deepEqual(stil.culori.atenuat, { valoare: '#A3A2A1', sursa: 'calculat' });
    const r06 = c06(stil);
    assert.equal(r06.ok, true, JSON.stringify(r06.erori));
  } finally {
    r.curata();
  }
});

test('F10: același caz venit din brand trece C06 la ceață', () => {
  const r = radacina();
  try {
    const brand = citesteBrand(r.radacina, 'inchis-galben');
    const { stil, erori } = rezolvaStil({ radacina: r.radacina, sablon: SABLON, date: { brand: 'inchis-galben' }, brand });
    assert.deepEqual(erori, []);
    assert.deepEqual(stil.culori.atenuat, { valoare: '#A3A2A1', sursa: 'calculat' });
    assert.equal(c06(stil).ok, true);
  } finally {
    r.curata();
  }
});

test('F10: cu atmosfera plin din date, atenuatul rămâne cel din fișă (doar fundalul)', () => {
  const r = radacina();
  try {
    const date = { stil: { atmosfera: 'plin', culori: { fundal: '#101418', accent: '#FFD60A' } } };
    const { stil } = rezolvaStil({ radacina: r.radacina, sablon: SABLON, date, brand: null });
    assert.deepEqual(stil.culori.atenuat, { valoare: '#989796', sursa: 'calculat' });
    assert.equal(c06(stil).ok, true);
  } finally {
    r.curata();
  }
});

test('F10: pe fundal deschis, atenuatul calculat nu mai e cel care limitează intensitatea ceții', () => {
  const r = radacina();
  try {
    const date = { stil: { tema: 'hartie', culori: { fundal: '#F3EBDD', text: '#2A2420', accent: '#C2410C' } } };
    const { stil } = rezolvaStil({ radacina: r.radacina, sablon: SABLON, date, brand: null });
    const { culori, atmosfera } = valoriStil(stil);
    assert.equal(atmosfera, 'ceata');
    assert.equal(stil.culori.atenuat.sursa, 'calculat');
    const { atenuat, ...faraAtenuat } = culori;
    assert.equal(limitaIntensitate(culori, atmosfera), limitaIntensitate(faraAtenuat, atmosfera));
    assert.equal(limitaIntensitate(culori, atmosfera), 0.91);
    assert.equal(c06(stil).ok, true);
  } finally {
    r.curata();
  }
});

test('F10: atenuat slab față de un strat de ceață: sugestia numește accentul și atmosfera plin', () => {
  const culori = { fundal: '#101418', text: '#F2EFEA', accent: '#FFD60A', linie: '#F2EFEA', atenuat: '#989796' };
  const r = verificaContrast(culori, PRAGURI_C06, { atmosfera: 'ceata' });
  assert.equal(r.ok, false);
  const e = r.erori.find((x) => /Textul atenuat/.test(x.mesaj));
  assert.ok(e, JSON.stringify(r.erori));
  assert.match(e.sugestie, /stil\.culori\.accent/);
  assert.match(e.sugestie, /stil\.atmosfera/);
  assert.match(e.sugestie, /„plin”/);
});
