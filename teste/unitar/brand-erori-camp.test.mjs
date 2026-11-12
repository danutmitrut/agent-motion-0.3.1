// F11: cu brand, erorile C06 și C05 pentru valori care vin din fișa de brand numesc brandul
// (camp 'brand', branduri/<nume>/vizual.md), nu câmpuri stil.* din date.json, interzise când există brand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rezolvaStil, valoriStil } from '../../nucleu/lib/teme.mjs';
import { citesteBrand, conflicteBrandDate } from '../../nucleu/lib/brand.mjs';
import { verificaContrast, PRAGURI_C06 } from '../../nucleu/lib/contrast.mjs';
import { verificaAcoperire } from '../../nucleu/lib/fonturi.mjs';
import { radacinaAgent } from '../../nucleu/lib/cai.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';

const RADACINA = radacinaAgent(import.meta.url, 2);

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
      'branduri/b1/vizual.md': '---\nmg: 1\ntema: noapte\nculori: {accent: "#3A3A40"}\n---\n',
      'branduri/b2/vizual.md': '---\nmg: 1\nculori: {text: "#4A4A50"}\n---\n',
      'branduri/b3/vizual.md': '---\nmg: 1\nfont_titlu: Inter\n---\n',
      'branduri/b4/vizual.md': '---\nmg: 1\nfont_titlu: fraunces\n---\n',
      'branduri/b5/vizual.md': '---\nmg: 1\nfont_titlu: {fisier: titlu.woff2, familie: "Studio Titlu"}\n---\n',
      'branduri/b6/vizual.md': '---\nmg: 1\nfont_text: Inter\n---\n',
    },
  });
}

/** C06 cum îl va chema B cu brand: culorile plate, atmosfera, sursele și numele brandului. */
function c06CuBrand(rad, nume) {
  const brand = citesteBrand(rad, nume);
  const date = { brand: nume };
  const { stil, erori } = rezolvaStil({ radacina: rad, sablon: SABLON, date, brand });
  assert.deepEqual(erori, []);
  const plat = valoriStil(stil);
  const surse = Object.fromEntries(Object.entries(stil.culori).map(([j, c]) => [j, c.sursa]));
  return verificaContrast(plat.culori, PRAGURI_C06, { atmosfera: plat.atmosfera, surse, brand: nume });
}

function faraCampStilInterzis(e) {
  assert.doesNotMatch(e.sugestie, /stil\.culori|stil\.font_titlu|stil\.tema/, e.sugestie);
}

test('F11: brand cu accent slab: camp brand și sugestia trimite la branduri/b1/vizual.md', () => {
  const r = radacina();
  try {
    const rez = c06CuBrand(r.radacina, 'b1');
    assert.equal(rez.ok, false);
    assert.equal(rez.camp, 'brand');
    const e = rez.erori.find((x) => /Culoarea de accent/.test(x.mesaj));
    assert.ok(e, JSON.stringify(rez.erori));
    assert.equal(e.cod, 'contrast-slab');
    assert.equal(e.camp, 'brand');
    assert.match(e.mesaj, /branduri\/b1\/vizual\.md/);
    assert.match(e.sugestie, /culori\.accent în branduri\/b1\/vizual\.md/);
    faraCampStilInterzis(e);
    // sugestia nu duce la stil-contrazice-brand: nu cere nimic în stil.culori din date.json
    assert.deepEqual(conflicteBrandDate({ brand: 'b1' }, citesteBrand(r.radacina, 'b1'), 'reel-ilustrat'), []);
  } finally {
    r.curata();
  }
});

test('F11: brand cu text slab: text, linie implicită și atenuat calculat au toate camp brand', () => {
  const r = radacina();
  try {
    const rez = c06CuBrand(r.radacina, 'b2');
    assert.equal(rez.ok, false);
    assert.ok(rez.erori.length >= 3, JSON.stringify(rez.erori));
    for (const e of rez.erori) {
      assert.equal(e.camp, 'brand', e.mesaj);
      assert.match(e.sugestie, /branduri\/b2\/vizual\.md/);
      faraCampStilInterzis(e);
    }
    const atenuat = rez.erori.find((x) => /Textul atenuat/.test(x.mesaj));
    assert.ok(atenuat);
    assert.match(atenuat.sugestie, /culori\.text/);
  } finally {
    r.curata();
  }
});

test('F11: fără brand, C06 rămâne pe stil.culori.<jeton> (harta 4.6)', () => {
  const r = verificaContrast({ fundal: '#0E0F13', text: '#F2EFEA', atenuat: '#9A9AA3', accent: '#3A3A40' });
  assert.equal(r.camp, 'stil.culori.accent');
  assert.match(r.erori[0].sugestie, /^Alege în stil\.culori\.accent/);
});

test('F11: font_titlu necunoscut din brand: font-necunoscut cu camp brand și trimitere la vizual.md', async () => {
  const r = radacina();
  try {
    const brand = citesteBrand(r.radacina, 'b3');
    const { stil } = rezolvaStil({ radacina: r.radacina, sablon: SABLON, date: { brand: 'b3' }, brand });
    assert.deepEqual(stil.font_titlu, { valoare: 'Inter', sursa: 'brand' });
  } finally {
    r.curata();
  }
  await assert.rejects(
    verificaAcoperire(RADACINA, 'Inter', [{ camp: 'scene[0].titlu', text: 'Ăsta' }], 700, { brand: 'b3' }),
    (e) => {
      assert.equal(e.eroareMg?.cod, 'font-necunoscut');
      assert.equal(e.eroareMg.camp, 'brand');
      assert.match(e.eroareMg.mesaj, /branduri\/b3\/vizual\.md/);
      assert.match(e.eroareMg.sugestie, /font_titlu în branduri\/b3\/vizual\.md/);
      assert.match(e.eroareMg.sugestie, /inter/);
      faraCampStilInterzis(e.eroareMg);
      return true;
    },
  );
});

test('F11: fără brand, fontul necunoscut rămâne pe stil.font_titlu', async () => {
  await assert.rejects(
    verificaAcoperire(RADACINA, 'Inter', ['a'], 700),
    (e) => e.eroareMg?.cod === 'font-necunoscut' && e.eroareMg.camp === 'stil.font_titlu',
  );
});

// F11, repararea la rezolvarea stilului: rezolvaStil rulează în toate fluxurile, înaintea lui construieste și a lui C05,
// deci un font de catalog necunoscut din brand trebuie să iasă de aici cu camp 'brand'.
function rezolva(rad, nume) {
  const brand = citesteBrand(rad, nume);
  return rezolvaStil({ radacina: rad, sablon: SABLON, date: { brand: nume }, brand });
}

test('F11: font_titlu necunoscut din brand: rezolvaStil dă font-necunoscut pe brand, cu brandul și fontul în mesaj', () => {
  const r = radacina();
  try {
    const { stil, erori } = rezolva(r.radacina, 'b3');
    assert.equal(erori.length, 1, JSON.stringify(erori));
    const [e] = erori;
    assert.equal(e.cod, 'font-necunoscut');
    assert.equal(e.camp, 'brand');
    assert.match(e.mesaj, /„Inter”/);
    assert.match(e.mesaj, /„b3”/);
    assert.match(e.mesaj, /branduri\/b3\/vizual\.md/);
    assert.match(e.sugestie, /font_titlu în branduri\/b3\/vizual\.md/);
    assert.match(e.sugestie, /inter/);
    faraCampStilInterzis(e);
    assert.deepEqual(stil.font_titlu, { valoare: 'Inter', sursa: 'brand' });
    assert.deepEqual(conflicteBrandDate({ brand: 'b3' }, citesteBrand(r.radacina, 'b3'), 'reel-ilustrat'), []);
  } finally {
    r.curata();
  }
});

test('felia 4: font_text din fișa de brand se citește; un id necunoscut dă font-necunoscut pe câmpul brand', () => {
  const r = radacina();
  try {
    const { stil, erori } = rezolva(r.radacina, 'b6');
    assert.equal(erori.length, 1);
    assert.equal(erori[0].cod, 'font-necunoscut');
    assert.equal(erori[0].camp, 'brand');
    assert.match(erori[0].mesaj, /„Inter”/);
    assert.deepEqual(stil.font_text, { valoare: 'Inter', sursa: 'brand' });
  } finally {
    r.curata();
  }
});

test('F11: font_titlu din catalog (fraunces) trece fără erori', () => {
  const r = radacina();
  try {
    const { stil, erori } = rezolva(r.radacina, 'b4');
    assert.deepEqual(erori, []);
    assert.deepEqual(stil.font_titlu, { valoare: 'fraunces', sursa: 'brand' });
  } finally {
    r.curata();
  }
});

test('F11: brand cu fișier woff2 propriu: familia nu se caută în catalog, fără erori', () => {
  const r = radacina();
  try {
    const { stil, erori } = rezolva(r.radacina, 'b5');
    assert.deepEqual(erori, []);
    assert.deepEqual(stil.font_titlu, { valoare: { fisier: 'branduri/b5/titlu.woff2', familie: 'Studio Titlu' }, sursa: 'brand' });
  } finally {
    r.curata();
  }
});

test('F11: fără brand, font_titlu din date rămâne al verificării C05, nu al rezolvaStil', () => {
  const r = radacina();
  try {
    const { erori } = rezolvaStil({ radacina: r.radacina, sablon: SABLON, date: { stil: { font_titlu: 'Inter' } }, brand: null });
    assert.deepEqual(erori, []);
  } finally {
    r.curata();
  }
});
