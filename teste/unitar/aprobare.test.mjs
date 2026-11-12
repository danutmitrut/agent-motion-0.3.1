import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verificaAprobare } from '../../nucleu/lib/aprobare.mjs';
import { comandaRandeaza } from '../../nucleu/lib/randeaza/index.mjs';
import { incarcaSablon } from '../../nucleu/lib/sabloane.mjs';
import {
  hashZonaTexte,
  MARCAJ_START,
  MARCAJ_SFARSIT,
  TITLU_BLOC,
  TITLU_TEXTE,
  TITLU_STIL,
} from '../../nucleu/lib/scenariu.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';

function blocMg({ eticheta = 'LUNI, 8:30', titlu = 'Telefonul sună', ritm = 'normal', opacitate = '0,9' } = {}) {
  return [
    MARCAJ_START,
    TITLU_BLOC,
    '',
    TITLU_TEXTE,
    `- Scena 1, eticheta: „${eticheta}”`,
    `- Scena 1, titlu, rândul 1: „${titlu}”`,
    '',
    TITLU_STIL,
    '- Tema: hârtie; accent #D9486A (din date); linie #2A2420 (implicit)',
    `- Ritm: ${ritm}; atmosferă: ceață; opacitatea ceții ${opacitate}`,
    '- Scena 1 (desen, od-running, mare): 0,0-4,0 s, complet la 2,15 s',
    MARCAJ_SFARSIT,
  ].join('\n');
}

function lock({ proiect = 'programari', motor = '0.8.96', sablon = 'reel-ilustrat', schema = 1, aprobare = null } = {}) {
  return {
    versiune: 1,
    proiect,
    creat_la: '2026-10-02T09:00:00.000Z',
    motor: { nume: 'hyperframes', versiune: motor },
    sablon: { nume: sablon, versiune_schema: schema, sha256: 'a'.repeat(64) },
    versiuni_sha256: 'b'.repeat(64),
    active: {},
    aprobare,
    randari: { ultima_completa: null },
  };
}

const APROBARE = {
  sha256_scenariu: 'c'.repeat(64),
  sha256_texte: hashZonaTexte(blocMg()),
  aprobat_la: '2026-10-02T10:00:00.000Z',
  mesaj: 'aprob',
};

test('C08: fără aprobare dă aprobare-lipsa', () => {
  const r = verificaAprobare(lock(), blocMg());
  assert.equal(r.cod, 'C08');
  assert.equal(r.ok, false);
  assert.equal(r.camp, 'scenariu.md');
  assert.equal(r.erori.length, 1);
  assert.equal(r.erori[0].cod, 'aprobare-lipsa');
  assert.equal(r.erori[0].camp, 'scenariu.md');
  assert.match(r.erori[0].sugestie, /aprob programari/);
});

test('C08: același bloc trece', () => {
  const r = verificaAprobare(lock({ aprobare: APROBARE }), blocMg());
  assert.deepEqual(r, {
    cod: 'C08',
    ok: true,
    valoare: { sha256_texte: APROBARE.sha256_texte, aprobat_la: APROBARE.aprobat_la },
    prag: { sha256_texte: APROBARE.sha256_texte },
    camp: null,
    erori: [],
    avertismente: [],
  });
});

test('C08: o schimbare de ritm sau de opacitate (zona „Stil și timpi”) nu invalidează aprobarea', () => {
  const r = verificaAprobare(lock({ aprobare: APROBARE }), blocMg({ ritm: 'calm', opacitate: '0,6' }));
  assert.equal(r.ok, true);
});

test('C08: o modificare de text în zona „Texte și cifre” după aprobare dă aprobare-invalida', () => {
  const r = verificaAprobare(lock({ aprobare: APROBARE }), blocMg({ titlu: 'Telefonul tace' }));
  assert.equal(r.ok, false);
  assert.equal(r.erori[0].cod, 'aprobare-invalida');
  assert.equal(r.erori[0].camp, 'scenariu.md');
});

test('C08: o modificare de cifră dă aprobare-invalida', () => {
  const r = verificaAprobare(lock({ aprobare: APROBARE }), blocMg({ eticheta: 'LUNI, 9:30' }));
  assert.equal(r.ok, false);
  assert.equal(r.erori[0].cod, 'aprobare-invalida');
});

test('C08: fără bloc curent, aprobarea nu poate fi confirmată', () => {
  for (const bloc of [null, '', `${MARCAJ_START}\n${MARCAJ_SFARSIT}`]) {
    const r = verificaAprobare(lock({ aprobare: APROBARE }), bloc);
    assert.equal(r.ok, false);
    assert.equal(r.erori[0].cod, 'aprobare-invalida');
  }
});

function radacinaCuLock(continut) {
  return creeazaRadacinaTemp({
    copiaza: ['nucleu/VERSIUNI.json'],
    sablonProba: true,
    fisiere: { 'video/vechi/motor.lock': JSON.stringify(continut, null, 2) + '\n' },
  });
}

async function asteaptaAltaVersiune(promisiune) {
  await assert.rejects(promisiune, (e) => {
    assert.equal(e.eroareMg?.cod, 'proiect-alta-versiune');
    assert.equal(e.eroareMg.camp, 'motor.lock');
    assert.equal(e.codIesire, 1);
    assert.match(e.eroareMg.sugestie, /node nucleu\/mg\.mjs nou <proiect-nou> --din vechi/);
    assert.match(e.eroareMg.sugestie, /Proiectul vechi rămâne neatins/);
    return true;
  });
}

test('T5: motor.versiune 0.8.95 dă proiect-alta-versiune, înaintea oricărui mod', async (t) => {
  const { radacina, curata } = radacinaCuLock(lock({ proiect: 'vechi', motor: '0.8.95', sablon: 'proba' }));
  t.after(curata);
  for (const mod of ['doar-verificare', 'schita', 'complet']) {
    await asteaptaAltaVersiune(comandaRandeaza({ radacina, proiect: 'vechi', mod }));
  }
});

test('T5: versiune_schema diferită de a șablonului instalat dă proiect-alta-versiune', async (t) => {
  const { radacina, curata } = radacinaCuLock(lock({ proiect: 'vechi', sablon: 'proba', schema: 1 }));
  t.after(curata);
  const instalata = (await incarcaSablon(radacina, 'proba')).meta.versiune_schema;
  assert.equal(typeof instalata, 'number', 'șablonul de probă trebuie să aibă versiune_schema în SABLON.md');
  const { radacina: r2, curata: c2 } = radacinaCuLock(lock({ proiect: 'vechi', sablon: 'proba', schema: instalata + 1 }));
  t.after(c2);
  await asteaptaAltaVersiune(comandaRandeaza({ radacina: r2, proiect: 'vechi', mod: 'doar-verificare' }));
});

test('T5: un nume de proiect invalid nu ajunge la motor.lock; îl raportează pasul comun', async (t) => {
  const { radacina, curata } = radacinaCuLock(lock({ proiect: 'vechi', motor: '0.8.95', sablon: 'proba' }));
  t.after(curata);
  // '../video/vechi' ar duce, prin caiProiect, chiar la video/vechi/motor.lock, care e pe altă versiune.
  await assert.rejects(comandaRandeaza({ radacina, proiect: '../video/vechi', mod: 'doar-verificare' }), (e) => {
    assert.equal(e.eroareMg?.cod, 'proiect-nume-invalid');
    return true;
  });
});

test('T5: versiunile egale trec de verificare (eroarea următoare, dacă există, e alta)', async (t) => {
  const { radacina, curata } = radacinaCuLock(lock({ proiect: 'vechi', sablon: 'proba', schema: 1 }));
  t.after(curata);
  const instalata = (await incarcaSablon(radacina, 'proba')).meta.versiune_schema;
  const { radacina: r2, curata: c2 } = radacinaCuLock(lock({ proiect: 'vechi', sablon: 'proba', schema: instalata }));
  t.after(c2);
  let cod = null;
  try {
    const r = await comandaRandeaza({ radacina: r2, proiect: 'vechi', mod: 'doar-verificare' });
    cod = r.erori[0]?.cod ?? null;
  } catch (e) {
    cod = e.eroareMg?.cod ?? String(e);
  }
  assert.notEqual(cod, 'proiect-alta-versiune');
});
