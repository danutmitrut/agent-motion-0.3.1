import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { comandaNou } from '../../nucleu/lib/nou.mjs';
import { incarcaSablon, listaSabloane, sha256Sablon } from '../../nucleu/lib/sabloane.mjs';
import { extrageBlocMg, MARCAJ_SFARSIT, MARCAJ_START, scheletScenariu, TITLU_STIL, TITLU_TEXTE } from '../../nucleu/lib/scenariu.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';

// nucleu/lib se copiază pentru că sablon.mjs al probei poate importa module din nucleu prin căi relative
const radacinaCuProba = () => creeazaRadacinaTemp({ sablonProba: true, copiaza: ['nucleu/VERSIUNI.json', 'nucleu/lib'] });
const ACUM = new Date('2026-10-02T10:00:00.000Z');
const codul = (cod) => (err) => err.eroareMg?.cod === cod;

test('scheletScenariu: câte o secțiune pe scenă și blocul mg gol la final', () => {
  const text = scheletScenariu('test', 2);
  assert.ok(text.startsWith('# Scenariu: test\n'));
  assert.match(text, /## Scena 1\n\nCe se vede:\nText:\nDurată estimată:\n/);
  assert.match(text, /## Scena 2\n/);
  assert.doesNotMatch(text, /## Scena 3/);
  const bloc = extrageBlocMg(text);
  assert.ok(bloc);
  assert.equal(bloc.bloc, `${MARCAJ_START}\n## Ce apare pe ecran\n\n${TITLU_TEXTE}\n\n${TITLU_STIL}\n${MARCAJ_SFARSIT}`);
  assert.equal(text.slice(bloc.inceput, bloc.sfarsit), bloc.bloc);
});

test('extrageBlocMg întoarce null fără marcaje sau fără marcajul de final', () => {
  assert.equal(extrageBlocMg('# Scenariu\n'), null);
  assert.equal(extrageBlocMg(`${MARCAJ_START}\n## Ce apare pe ecran\n`), null);
});

test('listaSabloane găsește proba și ignoră folderele cu _', () => {
  const { radacina, curata } = creeazaRadacinaTemp({
    sablonProba: true,
    fisiere: { 'motoare/hyperframes/sabloane/_ciorna/SABLON.md': '---\nnume: _ciorna\n---\n' },
  });
  try {
    assert.deepEqual(listaSabloane(radacina).map((s) => [s.nume, s.motor]), [['proba', 'hyperframes']]);
  } finally {
    curata();
  }
});

test('incarcaSablon: proba se încarcă, cu sha256 stabil', async () => {
  const { radacina, curata } = radacinaCuProba();
  try {
    const sab = await incarcaSablon(radacina, 'proba');
    assert.equal(sab.nume, 'proba');
    assert.equal(sab.motor, 'hyperframes');
    assert.equal(sab.meta.versiune_schema, 1);
    assert.ok(sab.meta.formate.includes('vertical'));
    for (const nume of ['valideaza', 'cronologie', 'construieste', 'asteptari']) assert.equal(typeof sab.modul[nume], 'function');
    assert.match(sab.sha256, /^[0-9a-f]{64}$/);
    assert.equal(sab.sha256, sha256Sablon(sab.dir));
  } finally {
    curata();
  }
});

test('incarcaSablon: nume necunoscut dă sablon-necunoscut (cod 3), export lipsă dă sablon-invalid (cod 2)', async () => {
  const { radacina, curata } = radacinaCuProba();
  try {
    await assert.rejects(incarcaSablon(radacina, 'nu-exista'), (err) => codul('sablon-necunoscut')(err) && err.codIesire === 3);
    await assert.rejects(incarcaSablon(radacina, '../proba'), codul('sablon-necunoscut'));
    writeFileSync(join(radacina, 'motoare/hyperframes/sabloane/proba/sablon.mjs'), 'export function valideaza() {}\n');
    await assert.rejects(incarcaSablon(radacina, 'proba'), (err) => codul('sablon-invalid')(err) && err.codIesire === 2);
  } finally {
    curata();
  }
});

test('comandaNou creează date.json, scenariu.md, jurnal.md, motor.lock și resurse/', async () => {
  const { radacina, curata } = radacinaCuProba();
  try {
    const rez = await comandaNou({ radacina, proiect: 'test', sablon: 'proba', acum: ACUM });
    assert.equal(rez.ok, true);
    assert.equal(rez.rezultat.dir, 'video/test');
    const dir = join(radacina, 'video', 'test');
    const minim = JSON.parse(readFileSync(join(radacina, 'motoare/hyperframes/sabloane/proba/exemple/minim.json'), 'utf8'));
    assert.deepEqual(JSON.parse(readFileSync(join(dir, 'date.json'), 'utf8')), minim);
    const scenariu = readFileSync(join(dir, 'scenariu.md'), 'utf8');
    assert.equal(scenariu, scheletScenariu('test', minim.scene.length));
    assert.ok(extrageBlocMg(scenariu));
    assert.match(readFileSync(join(dir, 'jurnal.md'), 'utf8'), /^# Jurnal: test\n\n- 2026-10-02T10:00:00.000Z: proiect creat cu mg nou/);
    const lock = JSON.parse(readFileSync(join(dir, 'motor.lock'), 'utf8'));
    assert.equal(lock.motor.versiune, '0.8.96');
    assert.equal(lock.sablon.nume, 'proba');
    assert.match(lock.versiuni_sha256, /^[0-9a-f]{64}$/);
    assert.ok(statSync(join(dir, 'resurse')).isDirectory());
  } finally {
    curata();
  }
});

test('comandaNou pune formatul și brandul cerute', async () => {
  const { radacina, curata } = creeazaRadacinaTemp({
    sablonProba: true,
    copiaza: ['nucleu/VERSIUNI.json', 'nucleu/lib'],
    fisiere: { 'branduri/studio-lemn/vizual.md': '---\nmg: 1\n---\n' },
  });
  try {
    await comandaNou({ radacina, proiect: 'patrat', sablon: 'proba', format: 'patrat', brand: 'studio-lemn', acum: ACUM });
    const date = JSON.parse(readFileSync(join(radacina, 'video', 'patrat', 'date.json'), 'utf8'));
    assert.equal(date.format, 'patrat');
    assert.equal(date.brand, 'studio-lemn');
  } finally {
    curata();
  }
});

test('comandaNou oprește argumentele greșite înainte să scrie ceva', async () => {
  const { radacina, curata } = radacinaCuProba();
  try {
    const cazuri = [
      [{ proiect: undefined, sablon: 'proba' }, 'proiect-lipsa'],
      [{ proiect: 'Test', sablon: 'proba' }, 'proiect-nume-invalid'],
      [{ proiect: 'programări', sablon: 'proba' }, 'proiect-nume-invalid'],
      [{ proiect: 'test' }, 'sablon-necunoscut'],
      [{ proiect: 'test', sablon: 'nu-exista' }, 'sablon-necunoscut'],
      [{ proiect: 'test', sablon: 'proba', format: 'orizontal' }, 'format-neacceptat'],
      [{ proiect: 'test', sablon: 'proba', brand: 'lipsa' }, 'brand-lipsa'],
      [{ proiect: 'test', sablon: 'proba', brand: '../x' }, 'brand-lipsa'],
    ];
    for (const [argumente, cod] of cazuri) {
      await assert.rejects(comandaNou({ radacina, acum: ACUM, ...argumente }), (err) => codul(cod)(err) && err.codIesire === 3, cod);
    }
    assert.equal(existsSync(join(radacina, 'video', 'test')), false);
    await comandaNou({ radacina, proiect: 'test', sablon: 'proba', acum: ACUM });
    await assert.rejects(comandaNou({ radacina, proiect: 'test', sablon: 'proba', acum: ACUM }), codul('proiect-exista'));
  } finally {
    curata();
  }
});

test('mesajul pentru un nume greșit propune un nume valid', async () => {
  const { radacina, curata } = radacinaCuProba();
  try {
    await assert.rejects(
      comandaNou({ radacina, proiect: 'Programări Luni', sablon: 'proba' }),
      (err) => err.eroareMg.sugestie.includes('„programari-luni”'),
    );
  } finally {
    curata();
  }
});

test('comandaNou nu lasă un proiect pe jumătate creat când o scriere pică, iar o nouă rulare reușește', async () => {
  const { radacina, curata } = radacinaCuProba();
  try {
    // prima citire a datei (motor.lock) trece, a doua (jurnal.md, după date.json și scenariu.md) aruncă: eșec determinist, la fel pe Windows
    let apeluri = 0;
    const acumDefect = { toISOString() { apeluri += 1; if (apeluri > 1) throw new Error('scriere-picata'); return ACUM.toISOString(); } };
    await assert.rejects(
      comandaNou({ radacina, proiect: 'test', sablon: 'proba', acum: acumDefect }),
      (err) => err instanceof Error && err.message === 'scriere-picata',
    );
    assert.equal(existsSync(join(radacina, 'video', 'test')), false);
    const rez = await comandaNou({ radacina, proiect: 'test', sablon: 'proba', acum: ACUM });
    assert.equal(rez.ok, true);
    assert.ok(statSync(join(radacina, 'video', 'test', 'resurse')).isDirectory());
  } finally {
    curata();
  }
});

test('sha256Sablon: acoperă tot folderul șablonului, fără teste/, exemple/ și fișierele ascunse', () => {
  const { radacina, curata } = radacinaCuProba();
  try {
    const dir = join(radacina, 'motoare/hyperframes/sabloane/proba');
    const initial = sha256Sablon(dir);
    mkdirSync(join(dir, 'teste'), { recursive: true });
    writeFileSync(join(dir, 'teste/x.test.mjs'), '// nou\n');
    writeFileSync(join(dir, 'exemple/minim.json'), `${readFileSync(join(dir, 'exemple/minim.json'), 'utf8')}\n`);
    writeFileSync(join(dir, '.ascuns'), 'x');
    assert.equal(sha256Sablon(dir), initial);
    mkdirSync(join(dir, 'lib'), { recursive: true });
    writeFileSync(join(dir, 'lib/ajutor.mjs'), 'export const a = 1;\n');
    const cuAjutor = sha256Sablon(dir);
    assert.notEqual(cuAjutor, initial);
    writeFileSync(join(dir, 'lib/ajutor.mjs'), 'export const a = 2;\n');
    assert.notEqual(sha256Sablon(dir), cuAjutor);
  } finally {
    curata();
  }
});
