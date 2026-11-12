import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { radacinaAgent } from '../../nucleu/lib/cai.mjs';
import { sha256Fisier, sha256Text } from '../../nucleu/lib/fisiere.mjs';
import { citesteLock } from '../../nucleu/lib/lock.mjs';
import {
  extrageBlocMg,
  hashZonaTexte,
  MARCAJ_START,
  MARCAJ_SFARSIT,
  scheletScenariu,
  TITLU_BLOC,
  TITLU_TEXTE,
  TITLU_STIL,
} from '../../nucleu/lib/scenariu.mjs';
import { normalizeazaMesaj, decideAprobare, decideRundaSuplimentara } from '../../nucleu/lib/garda/aprobare.mjs';
import { proceseazaHook } from '../../nucleu/lib/garda/index.mjs';
import { plafonRunde } from '../../nucleu/lib/garda/revizor.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';
import { ruleazaGarda } from '../ajutoare/garda.mjs';

const REPO = radacinaAgent(import.meta.url, 2);
const FIXTURE = JSON.parse(
  fs.readFileSync(path.join(REPO, 'teste', 'fixtures', 'hook', 'userpromptsubmit-aprob.json'), 'utf8'),
);
const ACUM = new Date('2026-10-02T10:00:00.000Z');
const CONFIRMARE = (p) =>
  `Aprobarea scenariului pentru proiectul ${p} a fost înregistrată în motor.lock. Urmează randarea completă: node nucleu/mg.mjs randeaza ${p}.`;

function intrare(prompt) {
  return { ...FIXTURE, prompt };
}

/** Blocul „Ce apare pe ecran” în forma din harta 5.11. */
function blocMg({ titlu = 'Telefonul sună', ritm = 'normal' } = {}) {
  return [
    MARCAJ_START,
    TITLU_BLOC,
    '',
    TITLU_TEXTE,
    '- Scena 1, eticheta: „LUNI, 8:30”',
    `- Scena 1, titlu, rândul 1: „${titlu}”`,
    '- Scena 2, cuvinte: „Reprogramări.” / „Anulări.” / „Mesaje.”',
    '',
    TITLU_STIL,
    '- Tema: hârtie; accent #D9486A (din date); linie #2A2420 (implicit)',
    `- Ritm: ${ritm}; atmosferă: ceață`,
    MARCAJ_SFARSIT,
  ].join('\n');
}

const BLOC_GOL = `${MARCAJ_START}\n${MARCAJ_SFARSIT}`;
// Blocul gol exact cum îl scrie mg nou (scheletScenariu, A12): titlurile, fără nicio linie de text.
const BLOC_SCHELET = extrageBlocMg(scheletScenariu('programari', 1)).bloc;

function scenariu(proiect, bloc) {
  return [
    `# Scenariu: ${proiect}`,
    '',
    '## Scena 1',
    'Ce se vede: o femeie la birou, cu telefonul în mână.',
    'Text: Telefonul sună din nou.',
    'Durată estimată: 4 s',
    '',
    bloc,
    '',
  ].join('\n');
}

function lock(proiect, aprobare = null) {
  return {
    versiune: 1,
    proiect,
    creat_la: '2026-10-02T09:00:00.000Z',
    motor: { nume: 'hyperframes', versiune: '0.8.96' },
    sablon: { nume: 'reel-ilustrat', versiune_schema: 1, sha256: 'a'.repeat(64) },
    versiuni_sha256: 'b'.repeat(64),
    active: {},
    aprobare,
    randari: { ultima_completa: null },
  };
}

const DATE_JSON = '{"versiune_schema":1,"scene":[]}\n';
// Obligatoriile reelului (SABLON.md) și rezultatele verzi ale nivelului doar-verificare, ca în verificare.json scris de pasComun.
const OBLIGATORII = [
  'C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08', 'C09', 'C10', 'C11', 'C12', 'C13', 'C14', 'C15', 'C16', 'C17',
  'S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08', 'S09', 'S10', 'S11', 'S12',
];
const COD_DATE = ['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C09', 'C10', 'C17'];

/**
 * Conținutul lui verificare.json. mod: 'doar-verificare' | 'complet'; rosii: codurile cu ok:false; lipsa: codurile fără rezultat.
 * La 'complet' se adaugă C08 și C11-C16 (verzi, dacă nu sunt în rosii), iar `ok` global e false când orice cod e roșu.
 * `ok_pentru_aprobare` (D) urmează regula nucleului: toate codurile de date și de build au rezultat verde; C08 și MP4 nu contează.
 * okAprobare: true/false îl suprascrie, null îl scoate (verificare.json scris de o versiune veche).
 */
function verificareJson(nume, { mod = 'doar-verificare', rosii = [], lipsa = [], sha = sha256Text(DATE_JSON), okAprobare } = {}) {
  const coduri = mod === 'complet' ? [...COD_DATE, 'C08', 'C11', 'C12', 'C13', 'C14', 'C15', 'C16'].sort() : COD_DATE;
  const verificari = coduri.filter((c) => !lipsa.includes(c)).map((cod) => ({ cod, ok: !rosii.includes(cod) }));
  const json = {
    versiune: 1, proiect: nume, mod, ok: rosii.length === 0, sha256_date: sha, obligatorii: OBLIGATORII, verificari,
  };
  const calculat = COD_DATE.every((c) => !rosii.includes(c) && !lipsa.includes(c));
  if (okAprobare !== null) json.ok_pentru_aprobare = okAprobare ?? calculat;
  return JSON.stringify(json, null, 2) + '\n';
}

/**
 * defs: { nume: { bloc?: string, verificare?: 'ok' | 'picata' | 'lipsa' | 'date-schimbate' } } → rădăcină temporară cu
 * video/<nume>/scenariu.md, motor.lock, date.json și verificare.json (implicit verde, pe date.json de pe disc; T8).
 */
function cuProiecte(defs) {
  const fisiere = {};
  for (const [nume, d] of Object.entries(defs)) {
    fisiere[`video/${nume}/scenariu.md`] = scenariu(nume, 'bloc' in d ? d.bloc : blocMg());
    fisiere[`video/${nume}/motor.lock`] = JSON.stringify(lock(nume), null, 2) + '\n';
    fisiere[`video/${nume}/date.json`] = DATE_JSON;
    const stare = d.verificare ?? 'ok';
    if (stare !== 'lipsa') {
      fisiere[`video/${nume}/verificare.json`] = verificareJson(nume, {
        rosii: stare === 'picata' ? ['C03'] : [],
        sha: stare === 'date-schimbate' ? sha256Text('{"vechi":true}\n') : sha256Text(DATE_JSON),
      });
    }
  }
  return creeazaRadacinaTemp({ fisiere });
}

function caleLock(radacina, p) {
  return path.join(radacina, 'video', p, 'motor.lock');
}

function caleScenariu(radacina, p) {
  return path.join(radacina, 'video', p, 'scenariu.md');
}

/** Marchează proiectul ca deja aprobat pe scenariul curent. */
function aprobaDinainte(radacina, p) {
  const aprobare = {
    sha256_scenariu: sha256Fisier(caleScenariu(radacina, p)),
    sha256_texte: hashZonaTexte(blocMg()),
    aprobat_la: '2026-10-01T08:00:00.000Z',
    mesaj: 'aprob',
  };
  fs.writeFileSync(caleLock(radacina, p), JSON.stringify(lock(p, aprobare), null, 2) + '\n');
}

function contextDin(raspuns) {
  const json = JSON.parse(raspuns.stdout);
  assert.equal(json.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.equal(json.decision, undefined, 'garda nu blochează niciodată mesajul');
  return json.hookSpecificOutput.additionalContext;
}

test('normalizeazaMesaj: margini, majuscule, diacritice, spații multiple', () => {
  assert.equal(normalizeazaMesaj('Aprob'), 'aprob');
  assert.equal(normalizeazaMesaj(' aprob programari '), 'aprob programari');
  assert.equal(normalizeazaMesaj('APROB   Programări\n'), 'aprob programari');
  assert.equal(normalizeazaMesaj('Aprob, dar schimbă titlul'), 'aprob, dar schimba titlul');
  assert.equal(normalizeazaMesaj('Îți ȘTERG țărușii'), 'iti sterg tarusii');
  assert.equal(normalizeazaMesaj(undefined), '');
});

test('„Aprob” cu un singur proiect în așteptare leagă aprobarea de cele două hash-uri', (t) => {
  const { radacina, curata } = cuProiecte({ programari: {} });
  t.after(curata);
  const r = decideAprobare(intrare('Aprob'), radacina, ACUM);
  assert.equal(r.cod, 0);
  assert.equal(contextDin(r), CONFIRMARE('programari'));
  assert.deepEqual(citesteLock(caleLock(radacina, 'programari')).aprobare, {
    sha256_scenariu: sha256Fisier(caleScenariu(radacina, 'programari')),
    sha256_texte: hashZonaTexte(blocMg()),
    aprobat_la: '2026-10-02T10:00:00.000Z',
    mesaj: 'Aprob',
  });
});

test('„ aprob programari ” aprobă proiectul numit, chiar dacă alt proiect așteaptă', (t) => {
  const { radacina, curata } = cuProiecte({ programari: {}, reclama: {} });
  t.after(curata);
  const r = decideAprobare(intrare(' aprob programari '), radacina, ACUM);
  assert.equal(contextDin(r), CONFIRMARE('programari'));
  assert.notEqual(citesteLock(caleLock(radacina, 'programari')).aprobare, null);
  assert.equal(citesteLock(caleLock(radacina, 'reclama')).aprobare, null);
});

test('„aprob, dar schimbă titlul” nu aprobă și nu atinge motor.lock', (t) => {
  const { radacina, curata } = cuProiecte({ programari: {} });
  t.after(curata);
  const inainte = fs.readFileSync(caleLock(radacina, 'programari'), 'utf8');
  const r = decideAprobare(intrare('aprob, dar schimbă titlul'), radacina, ACUM);
  assert.match(contextDin(r), /nu a înregistrat nicio aprobare.*doar cu „aprob”/s);
  assert.equal(fs.readFileSync(caleLock(radacina, 'programari'), 'utf8'), inainte);
});

test('G5: „Aprob.” și „aprob programari!” aprobă; punctul sau semnul exclamării de la final nu contează', (t) => {
  for (const [mesaj, dedus] of [['Aprob.', true], ['aprob!', true], ['aprob programari!', false], ['Aprob programari.', false]]) {
    const { radacina, curata } = cuProiecte(dedus ? { programari: {} } : { programari: {}, reclama: {} });
    t.after(curata);
    const r = decideAprobare(intrare(mesaj), radacina, ACUM);
    assert.equal(contextDin(r), CONFIRMARE('programari'), mesaj);
    assert.equal(citesteLock(caleLock(radacina, 'programari')).aprobare.mesaj, mesaj);
  }
});

test('G5: textele cu adaos după punctuație rămân refuzate și nu ating motor.lock', (t) => {
  const { radacina, curata } = cuProiecte({ programari: {} });
  t.after(curata);
  const inainte = fs.readFileSync(caleLock(radacina, 'programari'), 'utf8');
  for (const mesaj of ['aprob. schimbă titlul', 'aprob! dar fără cifre', 'aprob?', 'aprob, programari']) {
    assert.match(contextDin(decideAprobare(intrare(mesaj), radacina, ACUM)), /nu a înregistrat nicio aprobare/, mesaj);
  }
  assert.deepEqual(decideAprobare(intrare('.aprob'), radacina, ACUM), { stdout: '', cod: 0 });
  assert.equal(fs.readFileSync(caleLock(radacina, 'programari'), 'utf8'), inainte);
});

test('un mesaj cu conținut lipit nu aprobă nimic, nici când textul lipit e „aprob”', (t) => {
  const { radacina, curata } = cuProiecte({ programari: {} });
  t.after(curata);
  const inainte = fs.readFileSync(caleLock(radacina, 'programari'), 'utf8');
  for (const mesaj of [
    'aprob\n<pasted_content id="1">Telefonul sună din nou.</pasted_content>',
    '<pasted_content id="1">aprob</pasted_content>',
    '<pasted_content id="1">\naprob\n</pasted_content>\naprob',
  ]) {
    const r = decideAprobare(intrare(mesaj), radacina, ACUM);
    if (r.stdout) assert.match(contextDin(r), /nu a înregistrat nicio aprobare/, mesaj);
  }
  assert.equal(fs.readFileSync(caleLock(radacina, 'programari'), 'utf8'), inainte);
});

test('cu două proiecte în așteptare, „aprob” cere precizare și nu aprobă', (t) => {
  const { radacina, curata } = cuProiecte({ reclama: {}, programari: {} });
  t.after(curata);
  const r = decideAprobare(intrare('aprob'), radacina, ACUM);
  assert.equal(r.cod, 0);
  const text = contextDin(r);
  assert.match(text, /programari, reclama/);
  assert.match(text, /aprob <proiect>/);
  assert.equal(citesteLock(caleLock(radacina, 'programari')).aprobare, null);
  assert.equal(citesteLock(caleLock(radacina, 'reclama')).aprobare, null);
});

test('un proiect deja aprobat și neschimbat nu mai e în așteptare', (t) => {
  const { radacina, curata } = cuProiecte({ programari: {}, reclama: {} });
  t.after(curata);
  aprobaDinainte(radacina, 'programari');
  const r = decideAprobare(intrare('aprob'), radacina, ACUM);
  assert.equal(contextDin(r), CONFIRMARE('reclama'));
  assert.equal(citesteLock(caleLock(radacina, 'programari')).aprobare.aprobat_la, '2026-10-01T08:00:00.000Z');
});

test('blocul gol de la mg nou nu se aprobă, nici numit, nici dedus', (t) => {
  for (const bloc of [BLOC_GOL, BLOC_SCHELET]) {
    const { radacina, curata } = cuProiecte({ programari: { bloc } });
    t.after(curata);
    const dedus = decideAprobare(intrare('aprob'), radacina, ACUM);
    assert.match(contextDin(dedus), /niciun proiect/);
    const numit = decideAprobare(intrare('aprob programari'), radacina, ACUM);
    assert.match(contextDin(numit), /--doar-verificare/);
    assert.equal(citesteLock(caleLock(radacina, 'programari')).aprobare, null);
  }
});

// T8: blocul „Ce apare pe ecran” rămâne de la ultima rulare reușită; dacă verificarea de după a picat sau date.json
// s-a schimbat de atunci, blocul poate să nu mai fie cel care se va randa, deci „aprob” nu înregistrează nimic.
for (const [stare, motiv] of [
  ['picata', /ultima verificare a proiectului programari a picat/],
  ['date-schimbate', /date\.json s-a schimbat după ultima verificare a proiectului programari/],
  ['lipsa', /proiectul programari nu are încă o verificare/],
]) {
  test(`T8: cu verificarea ${stare}, „aprob” și „aprob programari” nu aprobă și spun de ce`, (t) => {
    const { radacina, curata } = cuProiecte({ programari: { verificare: stare } });
    t.after(curata);
    for (const mesaj of ['aprob', 'aprob programari']) {
      const r = decideAprobare(intrare(mesaj), radacina, ACUM);
      assert.equal(r.cod, 0);
      const text = contextDin(r);
      assert.match(text, motiv);
      assert.match(text, /node nucleu\/mg\.mjs randeaza programari --doar-verificare/);
      assert.match(text, /arată-i cursantului blocul „Ce apare pe ecran” din scenariu\.md și așteaptă din nou „aprob”/);
      assert.equal(citesteLock(caleLock(radacina, 'programari')).aprobare, null);
    }
  });
}

test('T8: date.json modificat pe disc după o verificare verde blochează aprobarea', (t) => {
  const { radacina, curata } = cuProiecte({ programari: {} });
  t.after(curata);
  fs.writeFileSync(path.join(radacina, 'video', 'programari', 'date.json'), '{"versiune_schema":1,"scene":[{}]}\n');
  const r = decideAprobare(intrare('aprob'), radacina, ACUM);
  assert.match(contextDin(r), /date\.json s-a schimbat/);
  assert.equal(citesteLock(caleLock(radacina, 'programari')).aprobare, null);
});

// T8 (corecția controllerului): contează verificările de nivel doar-verificare, nu `ok` global.
for (const [titlu, optiuni, aproba] of [
  ['o randare completă refuzată doar de C08 nu blochează aprobarea', { mod: 'complet', rosii: ['C08'] }, true],
  ['o randare completă picată doar pe MP4 (C14) nu blochează aprobarea', { mod: 'complet', rosii: ['C14'] }, true],
  ['o verificare de date picată (C03) într-o randare completă blochează aprobarea', { mod: 'complet', rosii: ['C03'] }, false],
  ['un cod de date obligatoriu fără rezultat (C10) blochează aprobarea', { lipsa: ['C10'] }, false],
]) {
  test(`T8: ${titlu}`, (t) => {
    const { radacina, curata } = cuProiecte({ programari: {} });
    t.after(curata);
    fs.writeFileSync(path.join(radacina, 'video', 'programari', 'verificare.json'), verificareJson('programari', optiuni));
    const r = decideAprobare(intrare('aprob programari'), radacina, ACUM);
    if (aproba) {
      assert.equal(contextDin(r), CONFIRMARE('programari'));
      assert.notEqual(citesteLock(caleLock(radacina, 'programari')).aprobare, null);
    } else {
      assert.match(contextDin(r), /ultima verificare a proiectului programari a picat/);
      assert.equal(citesteLock(caleLock(radacina, 'programari')).aprobare, null);
    }
  });
}

// D: verdictul îl calculează nucleul (ok_pentru_aprobare); hook-ul citește doar câmpul și hash-ul datelor.
test('D: un verificare.json fără ok_pentru_aprobare (scris de o versiune veche) nu aprobă', (t) => {
  const { radacina, curata } = cuProiecte({ programari: {} });
  t.after(curata);
  // Verde pe vechea regulă: toate C-urile de date ok, sha256_date corect; doar câmpul lipsește.
  fs.writeFileSync(path.join(radacina, 'video', 'programari', 'verificare.json'), verificareJson('programari', { okAprobare: null }));
  for (const mesaj of ['aprob', 'aprob programari']) {
    const r = decideAprobare(intrare(mesaj), radacina, ACUM);
    assert.equal(r.cod, 0);
    const text = contextDin(r);
    assert.match(text, /ultima verificare a proiectului programari a picat/);
    assert.match(text, /node nucleu\/mg\.mjs randeaza programari --doar-verificare/);
    assert.equal(citesteLock(caleLock(radacina, 'programari')).aprobare, null);
  }
});

test('D: ok_pentru_aprobare false cu toate C-urile verzi nu aprobă (hook-ul nu recalculează verdictul)', (t) => {
  const { radacina, curata } = cuProiecte({ programari: {} });
  t.after(curata);
  // De exemplu un cod S de date picat, pe care lista veche din gardă nu-l vedea.
  fs.writeFileSync(path.join(radacina, 'video', 'programari', 'verificare.json'), verificareJson('programari', { okAprobare: false }));
  const r = decideAprobare(intrare('aprob programari'), radacina, ACUM);
  assert.match(contextDin(r), /ultima verificare a proiectului programari a picat/);
  assert.equal(citesteLock(caleLock(radacina, 'programari')).aprobare, null);
});

test('D: ok_pentru_aprobare true cu ok global false (randare refuzată de C08) aprobă', (t) => {
  const { radacina, curata } = cuProiecte({ programari: {} });
  t.after(curata);
  const json = verificareJson('programari', { mod: 'complet', rosii: ['C08'], okAprobare: true });
  assert.equal(JSON.parse(json).ok, false);
  fs.writeFileSync(path.join(radacina, 'video', 'programari', 'verificare.json'), json);
  const r = decideAprobare(intrare('aprob programari'), radacina, ACUM);
  assert.equal(r.cod, 0);
  assert.equal(contextDin(r), CONFIRMARE('programari'));
  assert.deepEqual(citesteLock(caleLock(radacina, 'programari')).aprobare, {
    sha256_scenariu: sha256Fisier(caleScenariu(radacina, 'programari')),
    sha256_texte: hashZonaTexte(blocMg()),
    aprobat_la: '2026-10-02T10:00:00.000Z',
    mesaj: 'aprob programari',
  });
});

test('D: ok_pentru_aprobare true pe un date.json schimbat de atunci nu aprobă', (t) => {
  const { radacina, curata } = cuProiecte({ programari: {} });
  t.after(curata);
  fs.writeFileSync(
    path.join(radacina, 'video', 'programari', 'verificare.json'),
    verificareJson('programari', { okAprobare: true, sha: sha256Text('{"vechi":true}\n') }),
  );
  const r = decideAprobare(intrare('aprob programari'), radacina, ACUM);
  assert.match(contextDin(r), /date\.json s-a schimbat după ultima verificare a proiectului programari/);
  assert.equal(citesteLock(caleLock(radacina, 'programari')).aprobare, null);
});

// Review final (E5): doar booleanul true aprobă; un șir, un număr sau un verificare.json care nu e obiect nu aprobă.
test('D: ok_pentru_aprobare "true" sau 1 nu aprobă; nici un verificare.json care nu e obiect ([] sau null)', (t) => {
  const { radacina, curata } = cuProiecte({ programari: {} });
  t.after(curata);
  const cale = path.join(radacina, 'video', 'programari', 'verificare.json');
  const verde = JSON.parse(verificareJson('programari', { okAprobare: true }));
  const continuturi = [
    JSON.stringify({ ...verde, ok_pentru_aprobare: 'true' }),
    JSON.stringify({ ...verde, ok_pentru_aprobare: 1 }),
    '[]\n',
    'null\n',
  ];
  for (const continut of continuturi) {
    fs.writeFileSync(cale, continut);
    for (const mesaj of ['aprob', 'aprob programari']) {
      const r = decideAprobare(intrare(mesaj), radacina, ACUM);
      assert.equal(r.cod, 0);
      assert.match(contextDin(r), /ultima verificare a proiectului programari a picat/, `${continut} / ${mesaj}`);
      assert.equal(citesteLock(caleLock(radacina, 'programari')).aprobare, null, continut);
    }
  }
  // martorul: același fișier, cu booleanul true, aprobă
  fs.writeFileSync(cale, JSON.stringify(verde));
  assert.equal(contextDin(decideAprobare(intrare('aprob programari'), radacina, ACUM)), CONFIRMARE('programari'));
});

test('proiect numit inexistent sau rădăcină fără video/: precizare, cod 0', (t) => {
  const { radacina, curata } = creeazaRadacinaTemp();
  t.after(curata);
  assert.match(contextDin(decideAprobare(intrare('aprob altul'), radacina, ACUM)), /altul/);
  assert.match(contextDin(decideAprobare(intrare('aprob'), radacina, ACUM)), /niciun proiect/);
});

test('un mesaj obișnuit întoarce răspunsul gol, fără să citească discul', () => {
  const r = decideAprobare(intrare('Fă-mi un reel despre programări'), '/cale/care/nu/exista', ACUM);
  assert.deepEqual(r, { stdout: '', cod: 0 });
  assert.deepEqual(decideAprobare({ hook_event_name: 'UserPromptSubmit' }, '/nu/exista', ACUM), { stdout: '', cod: 0 });
});

test('o scriere eșuată în motor.lock nu blochează mesajul', { skip: process.platform === 'win32' && 'chmod nu blochează scrierea pe Windows' }, (t) => {
  const { radacina, curata } = cuProiecte({ programari: {} });
  const dir = path.join(radacina, 'video', 'programari');
  // Și fișierul, și folderul devin doar de citit: scrieLock pică fie că scrie pe loc, fie prin fișier temporar și rename.
  fs.chmodSync(caleLock(radacina, 'programari'), 0o444);
  fs.chmodSync(dir, 0o555);
  t.after(() => {
    fs.chmodSync(dir, 0o755);
    fs.chmodSync(caleLock(radacina, 'programari'), 0o644);
    curata();
  });
  const r = decideAprobare(intrare('aprob'), radacina, ACUM);
  assert.equal(r.cod, 0);
  assert.match(contextDin(r), /nu a putut fi scrisă/);
});

test('proceseazaHook trimite UserPromptSubmit la decideAprobare', async (t) => {
  const { radacina, curata } = cuProiecte({ programari: {} });
  t.after(curata);
  const r = await proceseazaHook(JSON.stringify(intrare('aprob')), { radacina, env: {}, acum: ACUM });
  assert.equal(r.cod, 0);
  assert.equal(contextDin(r), CONFIRMARE('programari'));
});

/** Scrie n verdicte în video/<p>/cadre/: revizie-1.md ... revizie-n.md (sau revizie-schita-N.md). */
function cuRevizii(radacina, p, n, { schita = false } = {}) {
  const dir = path.join(radacina, 'video', p, 'cadre');
  fs.mkdirSync(dir, { recursive: true });
  for (let i = 1; i <= n; i += 1) {
    fs.writeFileSync(path.join(dir, `revizie-${schita ? 'schita-' : ''}${i}.md`), 'Verdict: REPARĂ\n- titlul scenei 2 iese din cadru\n');
  }
}

test('P1: „Încă o rundă” după 3 revizii crește runde_suplimentare.complet și ridică plafonul la 4', (t) => {
  const { radacina, curata } = cuProiecte({ programari: {} });
  t.after(curata);
  cuRevizii(radacina, 'programari', 3);
  assert.equal(plafonRunde(radacina, 'programari'), 3);
  const r = decideAprobare(intrare('Încă o rundă'), radacina, ACUM);
  assert.equal(r.cod, 0);
  assert.match(contextDin(r), /proiectul programari: plafonul a crescut de la 3 la 4 runde/);
  const scris = citesteLock(caleLock(radacina, 'programari'));
  assert.deepEqual(scris.runde_suplimentare, { complet: 1, schita: 0 });
  assert.equal(scris.aprobare, null, 'runda în plus nu atinge aprobarea');
  assert.equal(plafonRunde(radacina, 'programari'), 4);
  assert.equal(plafonRunde(radacina, 'programari', { schita: true }), 3);
});

test('P1: „încă o rundă schiță programari” crește doar rundele schiței proiectului numit', (t) => {
  const { radacina, curata } = cuProiecte({ programari: {}, reclama: {} });
  t.after(curata);
  cuRevizii(radacina, 'programari', 3, { schita: true });
  cuRevizii(radacina, 'reclama', 3);
  const r = decideRundaSuplimentara(intrare('încă o rundă schiță programari'), radacina);
  assert.match(contextDin(r), /revizie pe schiță pentru proiectul programari/);
  assert.deepEqual(citesteLock(caleLock(radacina, 'programari')).runde_suplimentare, { complet: 0, schita: 1 });
  assert.equal(citesteLock(caleLock(radacina, 'reclama')).runde_suplimentare, undefined);
});

test('P1: runda în plus pornește de la valorile existente și ignoră valorile invalide', (t) => {
  const { radacina, curata } = cuProiecte({ programari: {} });
  t.after(curata);
  const cuSuplimentare = { ...lock('programari'), runde_suplimentare: { complet: 1, schita: -2 } };
  fs.writeFileSync(caleLock(radacina, 'programari'), JSON.stringify(cuSuplimentare, null, 2) + '\n');
  cuRevizii(radacina, 'programari', 4);
  assert.match(contextDin(decideAprobare(intrare('încă o rundă'), radacina, ACUM)), /de la 4 la 5 runde/);
  assert.deepEqual(citesteLock(caleLock(radacina, 'programari')).runde_suplimentare, { complet: 2, schita: 0 });
  assert.equal(plafonRunde(radacina, 'programari'), 5);
});

test('P1: sub plafon, „încă o rundă” nu schimbă motor.lock', (t) => {
  const { radacina, curata } = cuProiecte({ programari: {} });
  t.after(curata);
  cuRevizii(radacina, 'programari', 1);
  const inainte = fs.readFileSync(caleLock(radacina, 'programari'), 'utf8');
  const r = decideAprobare(intrare('încă o rundă programari'), radacina, ACUM);
  assert.match(contextDin(r), /are 1 din 3 runde de revizie/);
  assert.equal(fs.readFileSync(caleLock(radacina, 'programari'), 'utf8'), inainte);
});

test('P1: fără proiect la plafon sau cu două, „încă o rundă” cere precizare și nu scrie', (t) => {
  const { radacina, curata } = cuProiecte({ programari: {}, reclama: {} });
  t.after(curata);
  assert.match(contextDin(decideAprobare(intrare('încă o rundă'), radacina, ACUM)), /niciun proiect/);
  cuRevizii(radacina, 'programari', 3);
  cuRevizii(radacina, 'reclama', 3);
  const text = contextDin(decideAprobare(intrare('încă o rundă'), radacina, ACUM));
  assert.match(text, /programari, reclama/);
  assert.match(text, /încă o rundă <proiect>/);
  assert.equal(citesteLock(caleLock(radacina, 'programari')).runde_suplimentare, undefined);
  assert.equal(citesteLock(caleLock(radacina, 'reclama')).runde_suplimentare, undefined);
});

test('P1: proiect numit inexistent și mesaje care doar seamănă cu cererea', (t) => {
  const { radacina, curata } = cuProiecte({ programari: {} });
  t.after(curata);
  cuRevizii(radacina, 'programari', 3);
  assert.match(contextDin(decideAprobare(intrare('încă o rundă altul'), radacina, ACUM)), /proiectul altul nu există/);
  for (const mesaj of ['încă o rundă, te rog', 'mai fă o rundă', 'Încă o rundă de revizie']) {
    assert.deepEqual(decideAprobare(intrare(mesaj), radacina, ACUM), { stdout: '', cod: 0 }, mesaj);
  }
  assert.equal(citesteLock(caleLock(radacina, 'programari')).runde_suplimentare, undefined);
});

test('B13 M3: „Încă o rundă.” și „încă o rundă schiță programari!” au efect, ca „aprob” după G5; adaosul rămâne fără efect', (t) => {
  const { radacina, curata } = cuProiecte({ programari: {} });
  t.after(curata);
  cuRevizii(radacina, 'programari', 3);
  cuRevizii(radacina, 'programari', 3, { schita: true });
  assert.match(contextDin(decideAprobare(intrare('Încă o rundă.'), radacina, ACUM)), /de la 3 la 4 runde/);
  assert.match(contextDin(decideAprobare(intrare('încă o rundă schiță programari!'), radacina, ACUM)), /revizie pe schiță pentru proiectul programari/);
  assert.deepEqual(citesteLock(caleLock(radacina, 'programari')).runde_suplimentare, { complet: 1, schita: 1 });
  assert.deepEqual(decideAprobare(intrare('încă o rundă. și schimbă titlul'), radacina, ACUM), { stdout: '', cod: 0 });
});

test('garda.mjs ca subproces aprobă în rădăcina din CLAUDE_PROJECT_DIR', async (t) => {
  const { radacina, curata } = cuProiecte({ programari: {} });
  t.after(curata);
  const r = await ruleazaGarda(intrare('aprob'), { radacina });
  assert.equal(r.cod, 0, r.stderr);
  assert.equal(r.json.hookSpecificOutput.additionalContext, CONFIRMARE('programari'));
  const aprobare = citesteLock(caleLock(radacina, 'programari')).aprobare;
  assert.equal(aprobare.mesaj, 'aprob');
  assert.match(aprobare.aprobat_la, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
});

test('felia 8: „aprob cu fraza nouă” și „aprob, răspunsurile: ...” nu aprobă și spun agentului forma corectă', (t) => {
  const { radacina, curata } = cuProiecte({ programari: {} });
  t.after(curata);
  const inainte = fs.readFileSync(caleLock(radacina, 'programari'), 'utf8');
  for (const mesaj of ['aprob cu fraza nouă', 'Aprob, răspunsurile: 1 da, 2 nu', 'aprobă tu']) {
    const text = contextDin(decideAprobare(intrare(mesaj), radacina, ACUM));
    assert.match(text, /doar cu „aprob” sau „aprob <proiect>”, singur în mesaj/, mesaj);
  }
  assert.deepEqual(decideAprobare(intrare('mulțumesc, aprob'), radacina, ACUM), { stdout: '', cod: 0 });
  assert.equal(fs.readFileSync(caleLock(radacina, 'programari'), 'utf8'), inainte);
});
