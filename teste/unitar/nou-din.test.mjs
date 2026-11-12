import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { principal } from '../../nucleu/mg.mjs';
import { comandaNou } from '../../nucleu/lib/nou.mjs';
import { extrageBlocMg, scheletScenariu } from '../../nucleu/lib/scenariu.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';

const ACUM = new Date('2026-10-03T09:00:00.000Z');
const codul = (cod) => (err) => err.eroareMg?.cod === cod;

const SCENARIU_VECHI = [
  '# Scenariu: vechi',
  '',
  '## Scena 1',
  '',
  'Ce se vede: un birou, dimineața.',
  'Text: Primul rând',
  'Durată estimată: 1 s',
  '',
  '<!-- mg:start -->',
  '## Ce apare pe ecran',
  '',
  '### Texte și cifre',
  '- Scena 1, titlu, rândul 1: „Primul rând”',
  '',
  '### Stil și timpi',
  '- Tema: noapte',
  '<!-- mg:end -->',
  '',
].join('\n');

/** Rădăcină cu proba și cu proiectul video/vechi/ creat de mg nou, apoi completat ca de un cursant. */
async function radacinaCuVechi({ date, resurse = {} } = {}) {
  const tmp = creeazaRadacinaTemp({ sablonProba: true, copiaza: ['nucleu/VERSIUNI.json', 'nucleu/lib'] });
  await comandaNou({ radacina: tmp.radacina, proiect: 'vechi', sablon: 'proba', acum: ACUM });
  const dir = join(tmp.radacina, 'video', 'vechi');
  if (date) writeFileSync(join(dir, 'date.json'), JSON.stringify(date, null, 2) + '\n');
  writeFileSync(join(dir, 'scenariu.md'), SCENARIU_VECHI);
  const lock = JSON.parse(readFileSync(join(dir, 'motor.lock'), 'utf8'));
  lock.aprobare = { sha256_scenariu: 'a'.repeat(64), sha256_texte: 'b'.repeat(64), aprobat_la: '2026-10-02T10:00:00.000Z', mesaj: 'aprob' };
  lock.active = { 'active/iconita/phone.svg': 'c'.repeat(64) };
  writeFileSync(join(dir, 'motor.lock'), JSON.stringify(lock, null, 2) + '\n');
  for (const [cale, continut] of Object.entries(resurse)) {
    mkdirSync(join(dir, 'resurse'), { recursive: true });
    writeFileSync(join(dir, ...cale.split('/')), continut);
  }
  return tmp;
}

/** sha256 pe fiecare fișier din folder, recursiv: {cale relativă: hex}. */
function amprenta(dir, prefix = '') {
  const rezultat = {};
  for (const intrare of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${intrare.name}` : intrare.name;
    if (intrare.isDirectory()) Object.assign(rezultat, amprenta(join(dir, intrare.name), rel));
    else rezultat[rel] = createHash('sha256').update(readFileSync(join(dir, intrare.name))).digest('hex');
  }
  return rezultat;
}

const DATE_BUNE = {
  sablon: 'proba',
  versiune_schema: 1,
  format: 'patrat',
  brand: null,
  stil: { tema: 'hartie' },
  scene: [{ tip: 'titlu', titlu: ['Primul rând'] }, { tip: 'titlu', titlu: ['Al *doilea*'] }],
};

function iesire() {
  let text = '';
  return { stdout: { write: (s) => { text += s; return true; } }, text: () => text };
}

test('nou --din copiază date.json, golește blocul mg și lasă proiectul vechi neatins', async (t) => {
  const { radacina, curata } = await radacinaCuVechi({ date: DATE_BUNE });
  t.after(curata);
  const dirVechi = join(radacina, 'video', 'vechi');
  const inainte = amprenta(dirVechi);

  const rez = await comandaNou({ radacina, proiect: 'nou', din: 'vechi', acum: ACUM });
  assert.equal(rez.ok, true, JSON.stringify(rez.erori));
  assert.deepEqual(rez.erori, []);
  assert.equal(rez.rezultat.din, 'vechi');
  assert.equal(rez.rezultat.sablon, 'proba');
  assert.equal(rez.rezultat.format, 'patrat');
  assert.deepEqual(rez.rezultat.resurse, []);

  const dir = join(radacina, 'video', 'nou');
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'date.json'), 'utf8')), DATE_BUNE);
  const scenariu = readFileSync(join(dir, 'scenariu.md'), 'utf8');
  assert.ok(scenariu.startsWith('# Scenariu: nou\n'));
  assert.match(scenariu, /Ce se vede: un birou, dimineața\./);
  assert.equal(extrageBlocMg(scenariu).bloc, extrageBlocMg(scheletScenariu('nou', 0)).bloc, 'blocul mg e cel gol de la mg nou');
  assert.doesNotMatch(scenariu, /„Primul rând”/);
  const lock = JSON.parse(readFileSync(join(dir, 'motor.lock'), 'utf8'));
  assert.equal(lock.proiect, 'nou');
  assert.equal(lock.aprobare, null, 'aprobarea nu trece în proiectul nou');
  assert.deepEqual(lock.active, {});
  assert.equal(lock.runde_suplimentare, undefined);
  assert.equal(lock.motor.versiune, '0.8.96');
  assert.match(lock.versiuni_sha256, /^[0-9a-f]{64}$/);
  assert.match(readFileSync(join(dir, 'jurnal.md'), 'utf8'), /^# Jurnal: nou\n\n- 2026-10-03T09:00:00.000Z: proiect creat cu mg nou --din vechi/);
  assert.ok(statSync(join(dir, 'resurse')).isDirectory());

  assert.deepEqual(amprenta(dirVechi), inainte, 'proiectul vechi e identic byte cu byte');
});

test('nou --din copiază resursele declarate; una lipsă dă resursa-lipsa, dar proiectul se creează', async (t) => {
  const date = { ...DATE_BUNE, sigla: 'resurse/sigla.png', fundal: 'resurse/fundaluri/lipsa.jpg', scapare: 'resurse/../date.json' };
  const { radacina, curata } = await radacinaCuVechi({ date, resurse: { 'resurse/sigla.png': Buffer.from([137, 80, 78, 71, 1, 2, 3]) } });
  t.after(curata);
  const inainte = amprenta(join(radacina, 'video', 'vechi'));

  const rez = await comandaNou({ radacina, proiect: 'nou', din: 'vechi', acum: ACUM });
  assert.equal(rez.ok, false);
  assert.deepEqual(rez.rezultat.resurse, ['resurse/sigla.png']);
  const perechi = rez.erori.map((e) => [e.cod, e.camp]);
  assert.deepEqual(perechi[0], ['resursa-lipsa', 'fundal']);
  assert.ok(perechi.some(([cod]) => cod === 'camp-necunoscut'), 'câmpurile care nu mai sunt în schema curentă sunt raportate');

  const dir = join(radacina, 'video', 'nou');
  assert.deepEqual(readFileSync(join(dir, 'resurse', 'sigla.png')), Buffer.from([137, 80, 78, 71, 1, 2, 3]));
  assert.equal(existsSync(join(dir, 'resurse', 'fundaluri', 'lipsa.jpg')), false);
  assert.equal(existsSync(join(dir, 'date.json')), true);
  assert.equal(existsSync(join(dir, 'motor.lock')), true);
  assert.deepEqual(amprenta(join(radacina, 'video', 'vechi')), inainte);
});

test('nou --din validează pe schema curentă: versiunea schemei se actualizează, regulile șablonului se aplică', async (t) => {
  const { radacina, curata } = await radacinaCuVechi({ date: { ...DATE_BUNE, versiune_schema: 0 } });
  t.after(curata);
  const rez = await comandaNou({ radacina, proiect: 'nou', din: 'vechi', acum: ACUM });
  assert.equal(rez.ok, true, JSON.stringify(rez.erori));
  assert.equal(JSON.parse(readFileSync(join(radacina, 'video', 'nou', 'date.json'), 'utf8')).versiune_schema, 1);

  const cuAccent = { ...DATE_BUNE, scene: [{ tip: 'titlu', titlu: ['Primul rând', 'cu *accent'] }] };
  writeFileSync(join(radacina, 'video', 'vechi', 'date.json'), JSON.stringify(cuAccent, null, 2) + '\n');
  const rez2 = await comandaNou({ radacina, proiect: 'nou-2', din: 'vechi', acum: ACUM });
  assert.equal(rez2.ok, false);
  assert.deepEqual(rez2.erori.map((e) => [e.cod, e.camp]), [['accent-neinchis', 'scene[0].titlu[1]']]);
});

test('fără sablon în date.json, șablonul vine din motor.lock al proiectului vechi', async (t) => {
  const { sablon, ...faraSablon } = DATE_BUNE;
  const { radacina, curata } = await radacinaCuVechi({ date: faraSablon });
  t.after(curata);
  const rez = await comandaNou({ radacina, proiect: 'nou', din: 'vechi', acum: ACUM });
  assert.equal(rez.ok, true, JSON.stringify(rez.erori));
  assert.equal(JSON.parse(readFileSync(join(radacina, 'video', 'nou', 'date.json'), 'utf8')).sablon, 'proba');

  writeFileSync(join(radacina, 'video', 'vechi', 'motor.lock'), '{}\n');
  await assert.rejects(comandaNou({ radacina, proiect: 'nou-2', din: 'vechi', acum: ACUM }),
    (err) => codul('sablon-necunoscut')(err) && err.eroareMg.camp === 'argumente.din');
  assert.equal(existsSync(join(radacina, 'video', 'nou-2')), false);
});

test('argumentele greșite opresc --din înainte să scrie ceva', async (t) => {
  const { radacina, curata } = await radacinaCuVechi({ date: DATE_BUNE });
  t.after(curata);
  const cazuri = [
    [{ proiect: 'nou', din: 'vechi', sablon: 'proba' }, 'argument-necunoscut', 'argumente.din'],
    [{ proiect: 'nou', din: 'vechi', format: 'patrat' }, 'argument-necunoscut', 'argumente.din'],
    [{ proiect: 'nou', din: 'Vechi' }, 'proiect-nume-invalid', 'argumente.din'],
    [{ proiect: 'nou', din: '' }, 'proiect-nume-invalid', 'argumente.din'],
    [{ proiect: 'nou', din: 'lipsa' }, 'proiect-lipsa', 'argumente.din'],
    [{ proiect: 'vechi', din: 'vechi' }, 'proiect-exista', 'argumente.proiect'],
  ];
  for (const [argumente, cod, camp] of cazuri) {
    await assert.rejects(comandaNou({ radacina, acum: ACUM, ...argumente }),
      (err) => codul(cod)(err) && err.eroareMg.camp === camp && err.codIesire === 3, `${cod} ${JSON.stringify(argumente)}`);
  }
  assert.equal(existsSync(join(radacina, 'video', 'nou')), false);
});

test('mg nou <proiect> --din <proiect-vechi>: textul pentru om, codul 1 la date cu erori și --json', async (t) => {
  const { radacina, curata } = await radacinaCuVechi({ date: DATE_BUNE });
  t.after(curata);
  let out = iesire();
  assert.equal(await principal(['nou', 'nou', '--din', 'vechi'], { radacina, stdout: out.stdout }), 0, out.text());
  assert.match(out.text(), /Proiectul „nou” e creat în video\/nou\/ din video\/vechi\//);
  assert.match(out.text(), /node nucleu\/mg\.mjs randeaza nou --doar-verificare/);

  writeFileSync(join(radacina, 'video', 'vechi', 'date.json'),
    JSON.stringify({ ...DATE_BUNE, scene: [{ tip: 'titlu', titlu: ['cu *accent'] }] }, null, 2) + '\n');
  out = iesire();
  assert.equal(await principal(['nou', 'nou-2', '--din', 'vechi'], { radacina, stdout: out.stdout }), 1);
  assert.match(out.text(), /e creat în video\/nou-2\//);
  assert.match(out.text(), /repară în video\/nou-2\/date\.json/);
  assert.match(out.text(), /Erori \(1\):/);

  out = iesire();
  assert.equal(await principal(['nou', 'nou-3', '--din', 'vechi', '--json'], { radacina, stdout: out.stdout }), 1);
  const json = JSON.parse(out.text());
  assert.equal(json.comanda, 'nou');
  assert.equal(json.rezultat.din, 'vechi');
  assert.equal(json.erori[0].cod, 'accent-neinchis');

  out = iesire();
  assert.equal(await principal(['help'], { radacina, stdout: out.stdout }), 0);
  assert.match(out.text(), /nou <proiect> --din <proiect-vechi>/);
});

test('căile care nu sunt resurse relative curate (unitate, absolute, UNC, backslash, ..) nu se copiază și nu ies din proiect', async (t) => {
  const date = {
    ...DATE_BUNE,
    a: 'C:/Windows/system.ini', b: '//server/share/x.png', c: '/etc/passwd', d: 'resurse\\sigla.png',
    e: 'resurse/../date.json', f: 'resurse/C:/x.png', g: 'resurse//x.png', h: 'resurse/./x.png', i: 'resurse/',
  };
  const { radacina, curata } = await radacinaCuVechi({ date, resurse: { 'resurse/sigla.png': 'x' } });
  t.after(curata);
  const rez = await comandaNou({ radacina, proiect: 'nou', din: 'vechi', acum: ACUM });
  assert.deepEqual(rez.rezultat.resurse, []);
  assert.deepEqual(rez.erori.map((e) => e.cod).filter((c) => c === 'resursa-lipsa'), []);
  assert.equal(existsSync(join(radacina, 'video', 'nou', 'resurse', 'sigla.png')), false);
  assert.deepEqual(readdirSync(join(radacina, 'video', 'nou', 'resurse')), []);
});

test('o legătură simbolică din resurse/ care duce în afara proiectului vechi nu se urmează', async (t) => {
  const { symlinkSync } = await import('node:fs');
  const { radacina, curata } = await radacinaCuVechi({ date: { ...DATE_BUNE, sigla: 'resurse/sigla.png', poza: 'resurse/dir/poza.png' }, resurse: {} });
  t.after(curata);
  const dirVechi = join(radacina, 'video', 'vechi');
  writeFileSync(join(radacina, 'secret.txt'), 'secret');
  mkdirSync(join(dirVechi, 'resurse'), { recursive: true });
  try {
    symlinkSync(join(radacina, 'secret.txt'), join(dirVechi, 'resurse', 'sigla.png'));
    symlinkSync(radacina, join(dirVechi, 'resurse', 'dir'));
  } catch (e) {
    t.skip(`nu pot crea legături simbolice (${e.code})`);
    return;
  }
  const rez = await comandaNou({ radacina, proiect: 'nou', din: 'vechi', acum: ACUM });
  assert.deepEqual(rez.rezultat.resurse, []);
  assert.deepEqual(rez.erori.slice(0, 2).map((e) => [e.cod, e.camp]), [['resursa-lipsa', 'sigla'], ['resursa-lipsa', 'poza']]);
  assert.equal(existsSync(join(radacina, 'video', 'nou', 'resurse', 'sigla.png')), false);
});

test('scenariul vechi cu CRLF și BOM iese cu LF, cu titlul nou și fără aprobare', async (t) => {
  const { radacina, curata } = await radacinaCuVechi({ date: DATE_BUNE });
  t.after(curata);
  writeFileSync(join(radacina, 'video', 'vechi', 'scenariu.md'), '\uFEFF' + SCENARIU_VECHI.replace(/\n/g, '\r\n'));
  await comandaNou({ radacina, proiect: 'nou', din: 'vechi', acum: ACUM });
  const scenariu = readFileSync(join(radacina, 'video', 'nou', 'scenariu.md'), 'utf8');
  assert.ok(scenariu.startsWith('# Scenariu: nou\n'));
  assert.doesNotMatch(scenariu, /\r|\uFEFF/);
  assert.match(scenariu, /Ce se vede: un birou, dimineața\./);
});

test('scenariul vechi lipsă dă scheletul, ca la mg nou', async (t) => {
  const { radacina, curata } = await radacinaCuVechi({ date: DATE_BUNE });
  t.after(curata);
  rmSync(join(radacina, 'video', 'vechi', 'scenariu.md'));
  await comandaNou({ radacina, proiect: 'nou', din: 'vechi', acum: ACUM });
  assert.equal(readFileSync(join(radacina, 'video', 'nou', 'scenariu.md'), 'utf8'), scheletScenariu('nou', 2));
});

test('la eșecul unei copieri folderul nou se șterge, iar proiectul vechi rămâne neatins', { skip: process.platform === 'win32' && 'chmod nu blochează citirea pe Windows' }, async (t) => {
  const { radacina, curata } = await radacinaCuVechi({ date: { ...DATE_BUNE, sigla: 'resurse/sigla.png' }, resurse: { 'resurse/sigla.png': 'x' } });
  const fisier = join(radacina, 'video', 'vechi', 'resurse', 'sigla.png');
  t.after(() => { chmodSync(fisier, 0o644); curata(); });
  const inainte = amprenta(join(radacina, 'video', 'vechi'));
  chmodSync(fisier, 0o000);
  if (process.getuid?.() === 0) return t.skip('rulat ca root: chmod 000 nu blochează citirea');
  await assert.rejects(comandaNou({ radacina, proiect: 'nou', din: 'vechi', acum: ACUM }));
  assert.equal(existsSync(join(radacina, 'video', 'nou')), false, 'niciun proiect pe jumătate');
  chmodSync(fisier, 0o644);
  assert.deepEqual(amprenta(join(radacina, 'video', 'vechi')), inainte);
  const rez = await comandaNou({ radacina, proiect: 'nou', din: 'vechi', acum: ACUM });
  assert.deepEqual(rez.rezultat.resurse, ['resurse/sigla.png'], 'după reparare, aceeași comandă merge');
});

test('resurse/ legat spre un folder din afara proiectului vechi nu se urmează (legătură sau joncțiune)', async (t) => {
  const { symlinkSync } = await import('node:fs');
  const { radacina, curata } = await radacinaCuVechi({ date: { ...DATE_BUNE, sigla: 'resurse/sigla.png' } });
  t.after(curata);
  const afara = join(radacina, 'afara');
  mkdirSync(afara);
  writeFileSync(join(afara, 'sigla.png'), 'secret');
  const resurseVechi = join(radacina, 'video', 'vechi', 'resurse');
  rmSync(resurseVechi, { recursive: true, force: true });
  try {
    symlinkSync(afara, resurseVechi, 'junction');
  } catch (e) {
    t.skip(`nu pot crea legătura (${e.code})`);
    return;
  }
  const rez = await comandaNou({ radacina, proiect: 'nou', din: 'vechi', acum: ACUM });
  assert.deepEqual(rez.rezultat.resurse, []);
  assert.deepEqual(rez.erori.map((e) => [e.cod, e.camp])[0], ['resursa-lipsa', 'sigla']);
  assert.equal(existsSync(join(radacina, 'video', 'nou', 'resurse', 'sigla.png')), false);
});

test('scenariu.md vechi care nu se poate citi: schelet plus avertisment; lipsă: schelet fără avertisment', async (t) => {
  const { radacina, curata } = await radacinaCuVechi({ date: DATE_BUNE });
  t.after(curata);
  writeFileSync(join(radacina, 'video', 'vechi', 'scenariu.md'), Buffer.from([0xff, 0xfe, 0x41, 0x00]));
  const rez = await comandaNou({ radacina, proiect: 'nou', din: 'vechi', acum: ACUM });
  assert.equal(rez.ok, true);
  assert.equal(readFileSync(join(radacina, 'video', 'nou', 'scenariu.md'), 'utf8'), scheletScenariu('nou', 2));
  assert.deepEqual(rez.avertismente.map((a) => [a.cod, a.camp]), [['scenariu-necitibil', 'fisier:video/vechi/scenariu.md']]);
  assert.match(rez.avertismente[0].mesaj, /UTF-16/);

  rmSync(join(radacina, 'video', 'vechi', 'scenariu.md'));
  const rez2 = await comandaNou({ radacina, proiect: 'nou-2', din: 'vechi', acum: ACUM });
  assert.deepEqual(rez2.avertismente, []);
});
