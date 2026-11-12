import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { radacinaAgent } from '../../nucleu/lib/cai.mjs';
import { TEME_COMUNE, incarcaTema, listaTeme, calculeazaAtenuat } from '../../nucleu/lib/teme.mjs';
import { raportContrast, verificaContrast, hexInRgb, rgbInHex, PRAGURI_C06, limitaIntensitate, amestec } from '../../nucleu/lib/contrast.mjs';
import { EroareFatala, COD_IESIRE } from '../../nucleu/lib/erori.mjs';

const RADACINA = radacinaAgent(import.meta.url, 2);
const DIR_TEME = path.join(RADACINA, 'motoare', 'comun', 'teme');

/** Valorile decise la pasul 0 (decizia 8; spec 6.6; harta 5.5). */
const ASTEPTATE = {
  noapte: { culori: { fundal: '#0E0F13', text: '#F2EFEA', atenuat: '#9A9AA3', accent: '#FF7A59' }, font_titlu: 'inter', font_text: 'inter', atmosfera: 'ceata', granulatie: 0.1 },
  hartie: { culori: { fundal: '#F3EBDD', text: '#2A2420', atenuat: '#6B6157', accent: '#C2410C' }, font_titlu: 'fraunces', font_text: 'inter', atmosfera: 'ceata', granulatie: 0.06 },
  curat: { culori: { fundal: '#FFFFFF', text: '#111418', atenuat: '#5B6470', accent: '#2563EB' }, font_titlu: 'inter', font_text: 'inter', atmosfera: 'plin', granulatie: 0 },
  contrast: { culori: { fundal: '#0A0A0A', text: '#FFFFFF', atenuat: '#B3B3B3', accent: '#FFD60A' }, font_titlu: 'montserrat', font_text: 'inter', atmosfera: 'plin', granulatie: 0 },
};

test('TEME_COMUNE și listaTeme', () => {
  assert.deepEqual([...TEME_COMUNE], ['noapte', 'hartie', 'curat']);
  assert.ok(Object.isFrozen(TEME_COMUNE));
  assert.deepEqual(listaTeme(RADACINA), ['contrast', 'curat', 'hartie', 'noapte']);
});

test('fiecare temă are forma din harta 5.5 și valorile deciziei 8', () => {
  for (const [id, asteptat] of Object.entries(ASTEPTATE)) {
    const tema = incarcaTema(RADACINA, id);
    assert.deepEqual(Object.keys(tema).sort(), ['atmosfera', 'culori', 'eticheta', 'font_text', 'font_titlu', 'granulatie', 'id', 'nume'], id);
    assert.equal(tema.id, id);
    assert.deepEqual(tema.culori, asteptat.culori, id);
    assert.equal(tema.font_titlu, asteptat.font_titlu, id);
    assert.equal(tema.font_text, asteptat.font_text, id);
    assert.equal(tema.atmosfera, asteptat.atmosfera, id);
    assert.equal(tema.granulatie, asteptat.granulatie, id);
    assert.deepEqual(tema.eticheta, { majuscule: true, spatiere: 0.16, prefix: '' }, id);
  }
});

test('fiecare temă trece pragurile C06 (text ≥ 4,5; accent și atenuat ≥ 3), și în propria atmosferă', () => {
  for (const id of listaTeme(RADACINA)) {
    const { culori, atmosfera } = incarcaTema(RADACINA, id);
    const r = verificaContrast(culori, PRAGURI_C06, { atmosfera });
    assert.equal(r.ok, true, `${id}: ${JSON.stringify(r.valoare)}`);
    assert.ok(r.valoare.text >= 4.5 && r.valoare.accent >= 3 && r.valoare.atenuat >= 3, id);
  }
});

test('A-Î2: pe temele deschise, ceața și degradeul se limitează ca accentul să rămână ≥ 3 și textul ≥ 4,5', () => {
  // limitele calculate pe 2026-10-01; culorile temelor (decizia 8) nu se schimbă
  const asteptat = { hartie: 0.91, curat: 1 };
  for (const [id, limita] of Object.entries(asteptat)) {
    const { culori } = incarcaTema(RADACINA, id);
    assert.equal(limitaIntensitate(culori, 'ceata'), limita, id);
    for (const [atmosfera, stopuri] of [['ceata', []], ['degrade', [amestec(culori.text, culori.fundal, 30)]]]) {
      const r = verificaContrast(culori, PRAGURI_C06, { atmosfera, stopuri });
      assert.equal(r.ok, true, `${id}, ${atmosfera}: ${JSON.stringify(r.valoare)}`);
      assert.ok(r.valoare.accent >= 3 && r.valoare.text >= 4.5, `${id}, ${atmosfera}`);
    }
  }
  // temele închise nu se limitează
  for (const id of ['noapte', 'contrast']) {
    assert.equal(limitaIntensitate(incarcaTema(RADACINA, id).culori, 'ceata'), 1, id);
  }
});

test('niciun fișier de temă nu conține culorile stilului linia-continua', () => {
  for (const f of fs.readdirSync(DIR_TEME)) {
    const text = fs.readFileSync(path.join(DIR_TEME, f), 'utf8').toUpperCase();
    assert.equal(text.includes('#0A0B0E'), false, f);
    assert.equal(text.includes('#E08A5E'), false, f);
  }
});

test('incarcaTema: temă necunoscută dă tema-necunoscuta pe stil.tema', () => {
  for (const id of ['violet', '../teme/noapte', 'Noapte', '']) {
    let prinsa = null;
    try {
      incarcaTema(RADACINA, id);
    } catch (e) {
      prinsa = e;
    }
    assert.ok(prinsa instanceof EroareFatala, id);
    assert.equal(prinsa.eroareMg.cod, 'tema-necunoscuta');
    assert.equal(prinsa.eroareMg.camp, 'stil.tema');
    assert.equal(prinsa.codIesire, COD_IESIRE.DATE);
  }
});

test('amestec: ponderea textului în procente întregi, valori calculate de mână', () => {
  assert.equal(amestec('#000000', '#FFFFFF', 60), '#666666'); // 255 * 0,4 = 102
  assert.equal(amestec('#FF0000', '#0000FF', 25), '#4000BF'); // R 63,75 -> 64; B 191,25 -> 191
  assert.equal(amestec('#102030', '#F0E0D0', 100), '#102030');
  assert.equal(amestec('#102030', '#F0E0D0', 0), '#F0E0D0');
});

test('calculeazaAtenuat pe hârtie trece pragul 3 din prima încercare (60% text)', () => {
  const atenuat = calculeazaAtenuat('#2A2420', '#F3EBDD');
  assert.match(atenuat, /^#[0-9A-F]{6}$/);
  assert.ok(raportContrast(atenuat, '#F3EBDD') >= 3);
  assert.equal(atenuat, amestec('#2A2420', '#F3EBDD', 60));
  assert.equal(atenuat, '#7A746C'); // valoarea literală din fișă
});

test('calculeazaAtenuat urcă ponderea textului peste 60% când amestecul inițial pică', () => {
  const text = '#8A8A8A';
  const fundal = '#000000';
  assert.ok(raportContrast(amestec(text, fundal, 60), fundal) < 3);
  const atenuat = calculeazaAtenuat(text, fundal);
  assert.ok(raportContrast(atenuat, fundal) >= 3);
  const pondere = [65, 70, 75, 80, 85, 90, 95, 100].find((p) => amestec(text, fundal, p) === atenuat);
  assert.ok(pondere > 60, `ponderea găsită: ${pondere}`);
  assert.ok(raportContrast(amestec(text, fundal, pondere - 5), fundal) < 3);
});

test('calculeazaAtenuat întoarce textul când nici 95% nu ajunge', () => {
  assert.equal(calculeazaAtenuat('#5a5a5a', '#000000'), '#5A5A5A');
});

test('calculeazaAtenuat pe tema noapte cu fundal deschis suprascris', () => {
  const atenuat = calculeazaAtenuat('#0E0F13', '#F2EFEA');
  assert.ok(raportContrast(atenuat, '#F2EFEA') >= 3);
});

test('contrastele temelor coincid, la o zecimală, cu cele măsurate pe foaia de la pasul 0 (spec 6.6)', () => {
  const foaie = {
    noapte: { text: 16.7, atenuat: 6.9, accent: 7.5 },
    hartie: { text: 12.9, atenuat: 5.1, accent: 4.4 },
    curat: { text: 18.5, atenuat: 6.0, accent: 5.2 },
    contrast: { text: 19.8, atenuat: 9.4, accent: 14.0 },
  };
  for (const [id, asteptat] of Object.entries(foaie)) {
    const { culori } = incarcaTema(RADACINA, id);
    for (const [jeton, valoare] of Object.entries(asteptat)) {
      const masurat = Math.round(raportContrast(culori[jeton], culori.fundal) * 10) / 10;
      assert.equal(masurat, valoare, `${id}.${jeton}`);
    }
  }
});
