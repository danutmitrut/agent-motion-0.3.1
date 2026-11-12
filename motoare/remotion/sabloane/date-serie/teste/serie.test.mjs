// Compoziția serie (felia 3): rândurile din tabel, pozele potrivite după nume, scurtările doar prin tăieturi, durata
// cardului din timpul de citire și exemplul exemple/serie/ pe drumul lui mg randeaza --doar-verificare (pregatesteBuild).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { copiazaDosar } from '../../../../../teste/ajutoare/copiaza.mjs';
import { creeazaRadacinaTemp } from '../../../../../teste/ajutoare/radacina-temp.mjs';
import { legaDinRepo } from '../../../../../teste/ajutoare/radacina-motoare.mjs';
import { incarcaSablon } from '../../../../../nucleu/lib/sabloane.mjs';
import { lockNou, scrieLock } from '../../../../../nucleu/lib/lock.mjs';
import { citesteVersiuni } from '../../../../../nucleu/lib/versiuni.mjs';
import { pregatesteBuild } from '../../../../../nucleu/lib/randeaza/pregatire.mjs';
import { citesteRanduri, initiale, problemaScurtare, slug } from '../serie/randuri.mjs';
import { antetPoza } from '../serie/poze.mjs';
import { DIR_EXEMPLE } from './ajutoare.mjs';

const DIR_SERIE = path.join(DIR_EXEMPLE, 'serie');
const dateSerie = () => JSON.parse(fs.readFileSync(path.join(DIR_SERIE, 'date.json'), 'utf8'));

let temp;
let legaturi;
let sablon;

before(async () => {
  temp = creeazaRadacinaTemp({
    copiaza: ['nucleu/lib', 'nucleu/VERSIUNI.json', 'nucleu/package.json', 'motoare/comun', 'motoare/remotion/sabloane/date-serie'],
    biblioteciMini: true,
  });
  legaturi = legaDinRepo(temp.radacina, ['nucleu/node_modules']);
  sablon = await incarcaSablon(temp.radacina, 'date-serie');
});

after(() => {
  legaturi?.scoateLegaturile();
  temp?.curata();
});

/** Un proiect în rădăcina temporară, cu exemplul seriei copiat și, opțional, fișierele schimbate. */
function proiect(nume, { date = dateSerie(), fisiere = {} } = {}) {
  const dir = path.join(temp.radacina, 'video', nume);
  fs.mkdirSync(dir, { recursive: true });
  copiazaDosar(path.join(DIR_SERIE, 'resurse'), path.join(dir, 'resurse'));
  for (const [rel, continut] of Object.entries(fisiere)) {
    const cale = path.join(dir, ...rel.split('/'));
    if (continut === null) fs.rmSync(cale, { force: true });
    else fs.writeFileSync(cale, continut);
  }
  scrieLock(path.join(dir, 'motor.lock'), lockNou({ proiect: nume, sablon, versiuni: citesteVersiuni(temp.radacina), acum: new Date('2026-10-25T00:00:00.000Z') }));
  fs.writeFileSync(path.join(dir, 'date.json'), `${JSON.stringify(date, null, 2)}\n`);
  return dir;
}

const randuri = (dir, date = dateSerie()) => citesteRanduri(date, { dirProiect: dir });
/** Datele exemplului fără scurtarea Elenei, pentru tabelele mici de test. */
const faraScurtari = () => {
  const d = dateSerie();
  delete d.serie.scurtari;
  return d;
};
const coduri = (lista) => lista.map((e) => [e.cod, e.camp]);
const CSV = (corp) => Buffer.from(`nume;oraș;text\r\n${corp}`, 'utf8');

test('slug-ul și inițialele: fără diacritice, cu cratimă; două inițiale', () => {
  assert.equal(slug('Ana-Maria Popescu'), 'ana-maria-popescu');
  assert.equal(slug('Ștefan Țurcanu'), 'stefan-turcanu');
  assert.equal(initiale('Ana-Maria Popescu'), 'AP');
  assert.equal(initiale('Mihai'), 'M');
});

test('un om numit ca un folder al nucleului (Schița 2, Foaie) primește prefixul om-', () => {
  const dir = proiect('id-rezervat', { date: faraScurtari(), fisiere: { 'resurse/testimoniale.csv': CSV('Schița 2;Iași;Un citat scurt.\r\nFoaie;Cluj;Alt citat scurt.\r\nFoaieverde;Cluj;Al treilea citat.\r\n') } });
  assert.deepEqual(randuri(dir, faraScurtari()).randuri.map((x) => x.id), ['om-schita-2', 'om-foaie', 'foaieverde']);
});

test('scurtarea: doar tăieturi, în ordine, cu (…); emoji scoase fără marcaj; altfel motivul', () => {
  const o = 'Am învățat mult. Agentul mă ajută zilnic, iar clienții observă diferența \u{1F642}';
  assert.equal(problemaScurtare(o, 'Am învățat mult. (…) clienții observă diferența'), null);
  assert.equal(problemaScurtare(o, 'Am învățat mult. (...) clienții observă diferența'), null, 'trei puncte se acceptă ca marcaj');
  assert.equal(problemaScurtare(o, 'Am învățat mult. Agentul mă ajută zilnic, iar clienții observă diferența'), null, 'doar emoji scos');
  assert.match(problemaScurtare(o, 'Am învățat enorm. (…) diferența'), /nu apare în citatul original/);
  assert.match(problemaScurtare(o, 'clienții observă diferența (…) Am învățat mult.'), /nu în această ordine/);
  assert.match(problemaScurtare(o, 'Am învățat mult. clienții observă diferența'), /nu are marcajul/);
});

test('exemplul: 5 rânduri în ordinea tabelului, pozele după nume, Mihai fără poză, sedilele reparate, scurtarea Elenei', () => {
  const r = randuri(proiect('ex-randuri'));
  assert.deepEqual(r.erori, []);
  assert.deepEqual(r.randuri.map((x) => x.id), ['ana-maria-popescu', 'radu-ionescu', 'elena-dumitrescu', 'mihai-stan', 'stefan-turcanu']);
  assert.deepEqual(r.randuri.map((x) => x.poza?.fisier ?? null), ['ana-maria-popescu.jpg', 'radu-ionescu.jpg', 'elena-dumitrescu.jpg', null, 'stefan-turcanu.jpg']);
  assert.equal(r.randuri[4].nume, 'Ștefan Țurcanu');
  assert.equal(r.randuri[4].rol, 'Constanța');
  assert.equal(r.randuri[2].scurtat, true);
  assert.match(r.randuri[2].citat, /\(…\)/);
  assert.deepEqual(r.avertismente.map((a) => a.cod), ['sedila']);
  assert.deepEqual(r.fisiere, ['resurse/poze/ana-maria-popescu.jpg', 'resurse/poze/elena-dumitrescu.jpg', 'resurse/poze/radu-ionescu.jpg', 'resurse/poze/stefan-turcanu.jpg', 'resurse/testimoniale.csv']);
});

test('antetul cu sinonime fără diacritice; fără coloana citatului e date-serie-antet pe S01', () => {
  const date = faraScurtari();
  const bun = proiect('antet-bun', { date, fisiere: { 'resurse/testimoniale.csv': Buffer.from('Nume și prenume;Localitate;Părerea\r\nAna Pop;Iași;Mi-a plăcut mult tot atelierul.\r\n') } });
  assert.deepEqual(randuri(bun, date).erori, []);
  const rau = proiect('antet-rau', { date, fisiere: { 'resurse/testimoniale.csv': Buffer.from('cine;unde\r\nAna;Iași\r\n') } });
  const r = randuri(rau, date);
  assert.deepEqual(r.erori.map((e) => [e.cod, e.verificare]), [['date-serie-antet', 'S01']]);
});

test('rânduri greșite: nume lipsă, nume dublat, citat prea lung, scurtare pentru un om inexistent', () => {
  const lung = 'cuvânt '.repeat(60).trim();
  const date = dateSerie();
  date.serie.scurtari = { 'Nimeni Altcineva': 'ceva (…)' };
  const dir = proiect('randuri-rele', {
    date,
    fisiere: { 'resurse/testimoniale.csv': CSV(`;Iași;Un citat fără nume aici.\r\nAna Pop;Iași;Primul citat al Anei.\r\nAna  Pop;Cluj;Al doilea citat al Anei.\r\nRadu;Iași;${lung}\r\n`) },
  });
  assert.deepEqual(coduri(randuri(dir, date).erori), [
    ['date-serie-rand-invalid', 'randuri[0].nume'],
    ['date-serie-nume-duplicat', 'randuri[2].nume'],
    ['date-serie-citat-lung', 'randuri[3].citat'],
    ['date-serie-scurtare-invalida', 'serie.scurtari.Nimeni Altcineva'],
  ]);
});

test('pozele: coloana poza are prioritate, două poze ale aceluiași om sunt ambigue, o poză fără om e avertisment', () => {
  const poza = fs.readFileSync(path.join(DIR_SERIE, 'resurse/poze/radu-ionescu.jpg'));
  const date = faraScurtari();
  const dir = proiect('poze', {
    date,
    fisiere: {
      'resurse/testimoniale.csv': Buffer.from('nume;oras;text;poza\r\nAna-Maria Popescu;Cluj;Primul citat al Anei.;radu-ionescu.jpg\r\nMihai Stan;Brașov;Un citat scurt, dar destul.;\r\n'),
      'resurse/poze/mihai-stan.jpg': poza,
      'resurse/poze/mihai-stan.png': fs.readFileSync(path.join(DIR_SERIE, 'resurse/poze/ana-maria-popescu.jpg')),
    },
  });
  const r = randuri(dir, date);
  assert.deepEqual(coduri(r.erori), [['date-serie-poza-ambigua', 'randuri[1].poza']]);
  assert.equal(r.randuri[0].poza.fisier, 'radu-ionescu.jpg');
  assert.deepEqual(r.avertismente.map((a) => a.cod), ['date-serie-poza-fara-om']);
});

test('o poză sub 400 px pe latura mică e valoare-invalida pe S05; antetul PNG se citește', () => {
  const png = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png, 0);
  png.writeUInt32BE(13, 8);
  png.write('IHDR', 12, 'latin1');
  png.writeUInt32BE(640, 16);
  png.writeUInt32BE(300, 20);
  assert.deepEqual(antetPoza(png), { format: 'png', latime: 640, inaltime: 300 });
  const dir = proiect('poza-mica', { fisiere: { 'resurse/poze/mihai-stan.png': png } });
  const r = randuri(dir);
  assert.deepEqual(r.erori.map((e) => [e.cod, e.camp, e.verificare]), [['valoare-invalida', 'randuri[3].poza', 'S05']]);
});

test('exemplul pe drumul lui --doar-verificare: 5 ieșiri, schița pe primul, ultimul și cel mai lung, duratele din citire', async () => {
  proiect('ex-serie');
  const p = await pregatesteBuild({ radacina: temp.radacina, proiect: 'ex-serie', mod: 'doar-verificare' });
  assert.deepEqual(p.erori, [], JSON.stringify(p.erori, null, 2));
  assert.deepEqual(p.rezultate.map((r) => `${r.cod}:${r.ok}`),
    ['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C09', 'S01', 'S02', 'S03', 'S04', 'S05'].map((c) => `${c}:true`));
  assert.equal(p.cronologie, null);
  assert.deepEqual(p.iesiri.map((i) => [i.nn, i.id, i.schita]), [
    ['01', 'ana-maria-popescu', true], ['02', 'radu-ionescu', false], ['03', 'elena-dumitrescu', true], ['04', 'mihai-stan', false], ['05', 'stefan-turcanu', true],
  ]);
  for (const i of p.iesiri) {
    assert.ok(i.cronologie.durata >= 6 && i.cronologie.durata <= 20, `${i.id}: ${i.cronologie.durata}`);
    assert.equal(i.cronologie.segmente.length, 1);
    assert.deepEqual(i.construit.motor, { props: 'props.json', compozitie: 'Serie' });
    const props = JSON.parse(fs.readFileSync(path.join(i.dirBuild, 'props.json'), 'utf8'));
    assert.equal(props.cadre, Math.round(i.cronologie.durata * 30));
    assert.ok(props.fonturi.every((f) => f.url.startsWith(`${i.id}/`)), 'căile sunt relative la build/, cu folderul cardului');
  }
  const elena = p.iesiri[2];
  assert.ok(elena.cronologie.durata > p.iesiri[0].cronologie.durata, 'citatul lung ține mai mult');
  const mihai = JSON.parse(fs.readFileSync(path.join(p.iesiri[3].dirBuild, 'props.json'), 'utf8'));
  assert.deepEqual([mihai.card.avatar.poza, mihai.card.avatar.initiale], [null, 'MS']);
  assert.ok(fs.existsSync(path.join(p.iesiri[0].dirBuild, 'poza.jpg')));
  assert.deepEqual(sablon.modul.surse(p.date, p.ctx).at(-1), 'resurse/testimoniale.csv');
});

test('un citat care ar cere peste 20 s fără scurtare e date-serie-citat-lung pe S02, cu sugestia scurtării', async () => {
  const date = dateSerie();
  delete date.serie.scurtari;
  proiect('fara-scurtare', { date });
  const p = await pregatesteBuild({ radacina: temp.radacina, proiect: 'fara-scurtare', mod: 'doar-verificare' });
  assert.deepEqual(p.erori.map((e) => [e.cod, e.camp, e.verificare]), [['date-serie-citat-lung', 'randuri[2].citat', 'S02']]);
  assert.match(p.erori[0].sugestie, /serie\.scurtari\["Elena Dumitrescu"\]/);
  // agentul nu citește tabelul pe altă cale, deci citatul întreg vine în mesaj, ca să poată propune tăieturile
  assert.match(p.erori[0].mesaj, /Citatul, întreg: „La început credeam .*”$/);
});
