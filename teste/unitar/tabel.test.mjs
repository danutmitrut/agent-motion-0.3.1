// Cititorul de tabele al seriei (felia 3, nucleu/lib/tabel.mjs): CSV în UTF-8, UTF-16 și windows-1250, cu separatorul
// ghicit, ghilimele RFC 4180, sedilele reparate, mojibake-ul refuzat; .xlsx real (fixture făcut cu openpyxl).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { citesteTabel, decodeazaCsv, detecteazaSeparator, parseazaCsv } from '../../nucleu/lib/tabel.mjs';

const FIX = fileURLToPath(new URL('../fixtures/serie/', import.meta.url));
const opt = { camp: 'serie.fisier', nume: 'resurse/t.csv' };
const cp1250 = (s) => Buffer.from([...s].map((c) => ({ 'ş': 0xba, 'ţ': 0xfe, 'ă': 0xe3, 'â': 0xe2, 'î': 0xee, 'Ş': 0xaa, 'Ţ': 0xde }[c] ?? c.charCodeAt(0))));

test('UTF-8 cu BOM, UTF-16 LE cu BOM și windows-1250 se decodează la același text', () => {
  const text = 'nume;text\r\nAna;Mulțumesc frumos\r\n';
  assert.equal(decodeazaCsv(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text)])).text, text);
  assert.equal(decodeazaCsv(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')])).text, text);
  const d = decodeazaCsv(cp1250('nume;text\r\nAna;Mulţumesc frumos în Bârlad\r\n'));
  assert.equal(d.codificare, 'windows-1250');
  assert.match(d.text, /Mulţumesc frumos în Bârlad/);
});

test('separatorul: cel mai des pe primul rând, în afara ghilimelelor; tab; implicit ; (Excel în română)', () => {
  assert.equal(detecteazaSeparator('nume;text\nAna;a, b, c'), ';');
  assert.equal(detecteazaSeparator('nume,text\nAna,"a; b"'), ',');
  assert.equal(detecteazaSeparator('nume\ttext\nAna\tx'), '\t');
  assert.equal(detecteazaSeparator('nume\nAna'), ';');
});

test('ghilimelele RFC 4180: separator, ghilimele dublate și rânduri noi în celulă', () => {
  assert.deepEqual(parseazaCsv('a;b\r\n"x; y";"el a zis ""da"""\r\n"rând\nnou";z\r\n', ';'), [['a', 'b'], ['x; y', 'el a zis "da"'], ['rând\nnou', 'z']]);
});

test('citesteTabel pe CSV windows-1250: sedilele devin virgule, iar numărul lor e raportat', () => {
  const r = citesteTabel(cp1250('nume;oras\r\nŞtefan Ţurcanu;Constanţa\r\n'), opt);
  assert.equal(r.ok, true);
  assert.deepEqual(r.randuri, [['nume', 'oras'], ['Ștefan Țurcanu', 'Constanța']]);
  assert.deepEqual({ tip: r.sursa.tip, codificare: r.sursa.codificare, separator: r.sursa.separator, sedile: r.sursa.sedile }, { tip: 'csv', codificare: 'windows-1250', separator: ';', sedile: 3 });
});

test('mojibake (UTF-8 deschis ca windows-1252 sau windows-1250, apoi salvat UTF-8) e serie-codificare pe S01', () => {
  for (const cod of ['windows-1252', 'windows-1250']) {
    const stricat = Buffer.from(new TextDecoder(cod).decode(Buffer.from('Mulțumesc pentru tot', 'utf8')), 'utf8');
    const r = citesteTabel(Buffer.concat([Buffer.from('nume;text\r\nAna;'), stricat]), opt);
    assert.equal(r.ok, false, cod);
    assert.equal(r.eroare.cod, 'serie-codificare', cod);
    assert.equal(r.eroare.verificare, 'S01');
  }
});

test('.xlsx real: prima foaie, șiruri partajate, diacritice, celule numerice ca text', () => {
  const r = citesteTabel(fs.readFileSync(path.join(FIX, 'testimoniale.xlsx')), { camp: 'serie.fisier', nume: 'resurse/t.xlsx' });
  assert.equal(r.ok, true, JSON.stringify(r.eroare));
  assert.deepEqual(r.randuri[0], ['Nume și prenume', 'Oraș', 'Testimonial', 'Observații']);
  assert.deepEqual(r.randuri[2].slice(0, 2), ['Ștefan Țurcanu', 'Constanța']);
  assert.equal(r.randuri[3][1], '2026');
  assert.equal(r.randuri.length, 4, 'a doua foaie nu se citește');
  assert.equal(r.sursa.poze_in_excel, 0);
});

test('.xlsx cu o poză lipită în foaie: poza e numărată (avertismentul îl dă șablonul), textul se citește la fel', () => {
  const r = citesteTabel(fs.readFileSync(path.join(FIX, 'cu-poza.xlsx')), { camp: 'serie.fisier', nume: 'resurse/t.xlsx' });
  assert.equal(r.ok, true);
  assert.equal(r.sursa.poze_in_excel, 1);
  assert.equal(r.randuri[1][0], 'Ana-Maria Popescu');
});

test('un .xlsx stricat e serie-fisier-invalid, nu o excepție', () => {
  const r = citesteTabel(Buffer.from('PK\u0003\u0004 nu e zip'), { camp: 'serie.fisier', nume: 'resurse/t.xlsx' });
  assert.equal(r.ok, false);
  assert.equal(r.eroare.cod, 'serie-fisier-invalid');
});

test('.xlsx cu prefixul spațiului de nume (<x:row>) și șiruri goale (<si/>, <t/>): fiecare celulă la locul ei', () => {
  const r = citesteTabel(fs.readFileSync(path.join(FIX, 'prefix-gol.xlsx')), { camp: 'serie.fisier', nume: 'resurse/t.xlsx' });
  assert.equal(r.ok, true, JSON.stringify(r.eroare));
  assert.deepEqual(r.randuri, [['nume', 'text'], ['Ana', 'Mulțumesc frumos'], ['Radu', '', '']]);
});

test('un „?” între litere într-un CSV windows-1250 (Excel a înlocuit ș sau ț) e serie-codificare, cu sfatul CSV UTF-8', () => {
  const r = citesteTabel(cp1250('nume;text\r\nAna;Mul?umesc din suflet în Bârlad\r\n'), opt);
  assert.equal(r.ok, false);
  assert.equal(r.eroare.cod, 'serie-codificare');
  assert.match(r.eroare.sugestie, /CSV UTF-8/);
  assert.equal(citesteTabel(cp1250('nume;text\r\nAna;Ce faci? Bine.\r\n'), opt).ok, true, 'semnul întrebării la final de propoziție rămâne');
});
