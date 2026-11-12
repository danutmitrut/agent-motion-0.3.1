// Degradeul ca atmosferă măsurată de C06 (planul G, G01): stopurile vin dintr-un singur loc din nucleu, stopuriDegrade,
// ca C06, atenuatul calculat de rezolvaStil și șablonul text-animat să folosească exact aceleași culori.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stopuriDegrade, PONDERI_DEGRADE, hexInRgb, verificaContrast, PRAGURI_C06, raportContrast } from '../../nucleu/lib/contrast.mjs';
import { atmosferaC06 } from '../../nucleu/lib/verificari/date.mjs';
import { rezolvaStil, valoriStil } from '../../nucleu/lib/teme.mjs';
import * as sdk from '../../nucleu/lib/sdk.mjs';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const tema = (nume) => JSON.parse(fs.readFileSync(path.join(REPO, 'motoare', 'comun', 'teme', `${nume}.json`), 'utf8'));

test('stopuriDegrade: accentul la 8% și textul la 6% spre fundal; pe noapte, #211819 și #1C1C20', () => {
  assert.deepEqual(PONDERI_DEGRADE, { accent: 8, text: 6 });
  const { culori } = tema('noapte');
  assert.deepEqual(stopuriDegrade(culori), ['#211819', '#1C1C20']);
});

test('pe toate cele 4 teme, stopurile diferă de fundal cu cel mult 24 pe canal (C12 nu vede degradeul ca text)', () => {
  for (const nume of ['noapte', 'hartie', 'curat', 'contrast']) {
    const { culori } = tema(nume);
    const fundal = hexInRgb(culori.fundal);
    for (const stop of stopuriDegrade(culori)) {
      const rgb = hexInRgb(stop);
      const maxim = Math.max(...rgb.map((c, i) => Math.abs(c - fundal[i])));
      assert.ok(maxim <= 24, `${nume}: stopul ${stop} e la ${maxim} de fundalul ${culori.fundal}`);
    }
  }
});

test('atmosferaC06: degradeul primește stopurile; plin și ceata trec neschimbate', () => {
  const { culori } = tema('noapte');
  assert.deepEqual(atmosferaC06({ culori, atmosfera: 'degrade' }), { atmosfera: 'degrade', stopuri: stopuriDegrade(culori) });
  assert.deepEqual(atmosferaC06({ culori, atmosfera: 'ceata' }), { atmosfera: 'ceata' });
  assert.deepEqual(atmosferaC06({ culori, atmosfera: 'plin' }), { atmosfera: 'plin' });
  assert.deepEqual(atmosferaC06({ culori }), { atmosfera: 'plin' });
});

test('C06 pe degrade nu mai aruncă și trece pe toate temele', () => {
  for (const nume of ['noapte', 'hartie', 'curat', 'contrast']) {
    const { culori } = tema(nume);
    const plate = { ...culori, linie: culori.text };
    const r = verificaContrast(plate, PRAGURI_C06, atmosferaC06({ culori: plate, atmosfera: 'degrade' }));
    assert.equal(r.ok, true, `${nume}: ${JSON.stringify(r.erori)}`);
  }
});

test('rezolvaStil pe degrade, cu textul schimbat: atenuatul calculat trece C06 și față de stopurile degradeului', () => {
  const sablon = {
    nume: 'proba-degrade',
    meta: { teme: ['noapte', 'hartie', 'curat', 'contrast'] },
    implicite: { jetoane: { linie: 'text' } },
    schema: { properties: { stil: { properties: { atmosfera: { enum: ['plin', 'degrade', 'ceata'] } } } } },
  };
  const date = { stil: { tema: 'hartie', atmosfera: 'degrade', culori: { text: '#3A3530' } } };
  const r = rezolvaStil({ radacina: REPO, sablon, date, brand: null });
  assert.deepEqual(r.erori, []);
  const plat = valoriStil(r.stil);
  assert.equal(r.stil.culori.atenuat.sursa, 'calculat');
  const c06 = verificaContrast(plat.culori, PRAGURI_C06, atmosferaC06(plat));
  assert.equal(c06.ok, true, JSON.stringify(c06.erori));
  for (const stop of stopuriDegrade(plat.culori)) {
    assert.ok(raportContrast(plat.culori.atenuat, stop) >= 3, `atenuatul ${plat.culori.atenuat} față de stopul ${stop}`);
  }
});

test('sdk exportă stopuriDegrade (adăugare compatibilă)', () => {
  assert.equal(sdk.stopuriDegrade, stopuriDegrade);
});
