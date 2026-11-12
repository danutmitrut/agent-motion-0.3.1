import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  citesteText,
  citesteJson,
  scrieTextAtomic,
  scrieOctetiAtomic,
  scrieJsonAtomic,
  sha256Fisier,
  sha256Text,
  jsonStabil,
  existaFisier,
  stergeRecursiv,
  mutaFisier,
} from '../../nucleu/lib/fisiere.mjs';
import { EroareFatala, COD_IESIRE } from '../../nucleu/lib/erori.mjs';
import { radacinaAgent } from '../../nucleu/lib/cai.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';

const RADACINA = radacinaAgent(import.meta.url, 2);
const DATE = path.join(RADACINA, 'teste', 'fixtures', 'date');

function dirTemp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mg test Ăîș '));
}

/** Verifică o EroareFatala cu codul dat și întoarce eroarea pentru alte verificări. */
function asteaptaFatala(fn, cod) {
  let prinsa = null;
  try {
    fn();
  } catch (e) {
    prinsa = e;
  }
  assert.ok(prinsa instanceof EroareFatala, `se aștepta EroareFatala ${cod}, a venit ${prinsa}`);
  assert.equal(prinsa.eroareMg.cod, cod);
  assert.equal(prinsa.codIesire, COD_IESIRE.DATE);
  return prinsa;
}

test('UTF-16 scris la rulare (FF FE) dă fisier-utf16', () => {
  const dir = dirTemp();
  const cale = path.join(dir, 'proba-utf16.json');
  fs.writeFileSync(cale, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('{"a": 1}', 'utf16le')]));
  const e = asteaptaFatala(() => citesteText(cale, 'fisier:video/p/date.json'), 'fisier-utf16');
  assert.equal(e.eroareMg.camp, 'fisier:video/p/date.json');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('UTF-16 big endian (FE FF) dă tot fisier-utf16', () => {
  const dir = dirTemp();
  const cale = path.join(dir, 'be.json');
  fs.writeFileSync(cale, Buffer.from([0xfe, 0xff, 0x00, 0x7b, 0x00, 0x7d]));
  asteaptaFatala(() => citesteText(cale), 'fisier-utf16');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('octeți care nu sunt UTF-8 dau fisier-utf8-invalid', () => {
  const dir = dirTemp();
  const cale = path.join(dir, 'latin1.txt');
  fs.writeFileSync(cale, Buffer.from([0x63, 0x61, 0x73, 0xe3, 0x0a]));
  asteaptaFatala(() => citesteText(cale), 'fisier-utf8-invalid');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('fișier lipsă dă fisier-necitibil', () => {
  asteaptaFatala(() => citesteText(path.join(os.tmpdir(), 'nu-exista-mg-7f3a.json')), 'fisier-necitibil');
});

test('camp implicit: fisier:<cale relativă la directorul curent>', () => {
  const e = asteaptaFatala(() => citesteText(path.join(process.cwd(), 'nu-exista-mg.json')), 'fisier-necitibil');
  assert.equal(e.eroareMg.camp, 'fisier:nu-exista-mg.json');
});

test('BOM-ul UTF-8 se scoate, CRLF devine LF', () => {
  const dir = dirTemp();
  const cale = path.join(dir, 'proba-bom.json');
  fs.writeFileSync(cale, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('{\r\n  "a": 1\r\n}\r\n', 'utf8')]));
  assert.equal(citesteText(cale), '{\n  "a": 1\n}\n');
  assert.deepEqual(citesteJson(cale), { a: 1 });
  fs.rmSync(dir, { recursive: true, force: true });
});

test('ș și ț în forma NFD ies în NFC', () => {
  const dir = dirTemp();
  const cale = path.join(dir, 'nfd.txt');
  // 's' + U+0326 (virgula de dedesubt) și 't' + U+0326
  fs.writeFileSync(cale, 'caș ț', 'utf8');
  const text = citesteText(cale);
  assert.equal(text, 'caș ț');
  assert.equal(text.length, 5);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('s cu sedilă (U+0327) în forma NFD iese compus în NFC; sedila se semnalează abia la C03', () => {
  const dir = dirTemp();
  const cale = path.join(dir, 'nfd-sedila.txt');
  // 's' + U+0327 (sedila); NFC îl compune în U+015F
  fs.writeFileSync(cale, 'ş', 'utf8');
  assert.equal(citesteText(cale), 'ş');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('citesteJson pe proba-minim.json întoarce același obiect ca exemplul șablonului de probă', () => {
  const date = citesteJson(path.join(DATE, 'proba-minim.json'));
  const exemplu = JSON.parse(
    fs.readFileSync(path.join(RADACINA, 'teste', 'fixtures', 'sabloane', 'proba', 'exemple', 'minim.json'), 'utf8'),
  );
  assert.deepEqual(date, exemplu);
  assert.equal(date.sablon, 'proba');
});

test('citesteJson pe proba-json-stricat.json dă json-invalid cu linia și coloana', () => {
  const e = asteaptaFatala(
    () => citesteJson(path.join(DATE, 'proba-json-stricat.json'), 'fisier:video/p/date.json'),
    'json-invalid',
  );
  assert.equal(e.eroareMg.camp, 'fisier:video/p/date.json');
  assert.match(e.eroareMg.mesaj, /linia 6, coloana 3/);
  assert.match(e.eroareMg.sugestie, /linia 6/);
});

test('json-invalid: alte greșeli, cu locul exact', () => {
  const dir = dirTemp();
  const cazuri = [
    ['{"a": 1,}', 'linia 1, coloana 9'],
    ['{\n  "a": \'x\'\n}', 'linia 2, coloana 8'],
    ['{"a": 1', 'linia 1, coloana 8'],
    ['', 'linia 1, coloana 1'],
    ['{"a": "fara inchidere}', 'linia 1, coloana 23'],
    ['{"a": 01}', 'linia 1, coloana 8'],
    ['[1, 2] x', 'linia 1, coloana 8'],
  ];
  for (const [text, loc] of cazuri) {
    const cale = path.join(dir, 'x.json');
    fs.writeFileSync(cale, text, 'utf8');
    const e = asteaptaFatala(() => citesteJson(cale), 'json-invalid');
    assert.ok(e.eroareMg.mesaj.includes(loc), `${JSON.stringify(text)}: ${e.eroareMg.mesaj}`);
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

test('scrierea atomică creează folderele și nu lasă fișiere .tmp', () => {
  const dir = dirTemp();
  const cale = path.join(dir, 'video', 'p', 'build', 'stil-rezolvat.json');
  scrieJsonAtomic(cale, { b: 1, a: 'ș' });
  assert.equal(fs.readFileSync(cale, 'utf8'), '{\n  "b": 1,\n  "a": "ș"\n}\n');
  scrieTextAtomic(cale, 'al doilea\n');
  assert.equal(fs.readFileSync(cale, 'utf8'), 'al doilea\n');
  const ramase = fs.readdirSync(path.dirname(cale)).filter((f) => f.includes('.tmp'));
  assert.deepEqual(ramase, []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('scrieOctetiAtomic scrie octeții întocmai (PNG, woff2), fără fișiere .tmp', () => {
  const dir = dirTemp();
  try {
    const cale = path.join(dir, 'video', 'p', 'active', 'desen', 'p-sigla.png');
    const octeti = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0xfe, 0x0a]);
    scrieOctetiAtomic(cale, octeti);
    assert.ok(fs.readFileSync(cale).equals(octeti));
    assert.deepEqual(fs.readdirSync(path.dirname(cale)).filter((f) => f.includes('.tmp')), []);
  } finally {
    stergeRecursiv(dir);
  }
});

test('scrierea atomică reîncearcă la EBUSY și EPERM', () => {
  const dir = dirTemp();
  const cale = path.join(dir, 'motor.lock');
  const original = fs.renameSync;
  let apeluri = 0;
  const simulat = mock.method(fs, 'renameSync', (de, la) => {
    apeluri += 1;
    if (apeluri === 1) throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });
    if (apeluri === 2) throw Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' });
    return original(de, la);
  });
  try {
    scrieTextAtomic(cale, 'x\n');
  } finally {
    simulat.mock.restore();
  }
  assert.equal(apeluri, 3);
  assert.equal(fs.readFileSync(cale, 'utf8'), 'x\n');
  assert.deepEqual(fs.readdirSync(dir).filter((f) => f.includes('.tmp')), []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('scrierea atomică renunță după 3 reîncercări și șterge fișierul temporar', () => {
  const dir = dirTemp();
  const cale = path.join(dir, 'motor.lock');
  let apeluri = 0;
  const simulat = mock.method(fs, 'renameSync', () => {
    apeluri += 1;
    throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' });
  });
  try {
    assert.throws(() => scrieTextAtomic(cale, 'x\n'), { code: 'EBUSY' });
  } finally {
    simulat.mock.restore();
  }
  assert.equal(apeluri, 4);
  assert.deepEqual(fs.readdirSync(dir), []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('mutaFisier înlocuiește un fișier existent, fără să-l șteargă întâi', () => {
  const dir = dirTemp();
  const sursa = path.join(dir, 'randare.mp4');
  const tinta = path.join(dir, 'film.mp4');
  fs.writeFileSync(sursa, 'nou');
  fs.writeFileSync(tinta, 'vechi');
  const stergeri = mock.method(fs, 'unlinkSync');
  try {
    mutaFisier(sursa, tinta);
  } finally {
    stergeri.mock.restore();
  }
  assert.equal(stergeri.mock.callCount(), 0, 'destinația veche nu se șterge înainte de mutare');
  assert.equal(fs.readFileSync(tinta, 'utf8'), 'nou');
  assert.equal(fs.existsSync(sursa), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('mutaFisier reîncearcă la EBUSY și EPERM (player care ține videoul deschis)', () => {
  const dir = dirTemp();
  const sursa = path.join(dir, 'randare.mp4');
  const tinta = path.join(dir, 'film.mp4');
  fs.writeFileSync(sursa, 'nou');
  fs.writeFileSync(tinta, 'vechi');
  const original = fs.renameSync;
  let apeluri = 0;
  const simulat = mock.method(fs, 'renameSync', (de, la) => {
    apeluri += 1;
    if (apeluri === 1) throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' });
    if (apeluri === 2) throw Object.assign(new Error('EPERM'), { code: 'EPERM' });
    return original(de, la);
  });
  try {
    mutaFisier(sursa, tinta);
  } finally {
    simulat.mock.restore();
  }
  assert.equal(apeluri, 3);
  assert.equal(fs.readFileSync(tinta, 'utf8'), 'nou');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('mutaFisier între volume (EXDEV) copiază lângă destinație, o redenumește peste ea și șterge sursa', () => {
  const dir = dirTemp();
  const sursa = path.join(dir, 'randare.mp4');
  const tinta = path.join(dir, 'film.mp4');
  fs.writeFileSync(sursa, 'nou');
  fs.writeFileSync(tinta, 'vechi');
  const original = fs.renameSync;
  const redenumiri = [];
  const simulat = mock.method(fs, 'renameSync', (de, la) => {
    redenumiri.push([path.basename(de), path.basename(la)]);
    if (de === sursa) throw Object.assign(new Error('EXDEV'), { code: 'EXDEV' });
    return original(de, la);
  });
  try {
    mutaFisier(sursa, tinta);
  } finally {
    simulat.mock.restore();
  }
  assert.equal(redenumiri.length, 2);
  assert.match(redenumiri[1][0], /^film\.mp4\.tmp-/);
  assert.equal(fs.readFileSync(tinta, 'utf8'), 'nou');
  assert.equal(fs.existsSync(sursa), false);
  assert.deepEqual(fs.readdirSync(dir), ['film.mp4']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('mutaFisier: dacă destinația rămâne blocată, o lasă neatinsă, păstrează sursa și aruncă eroarea', () => {
  const dir = dirTemp();
  const sursa = path.join(dir, 'randare.mp4');
  const tinta = path.join(dir, 'film.mp4');
  fs.writeFileSync(sursa, 'nou');
  fs.writeFileSync(tinta, 'vechi');
  let apeluri = 0;
  const simulat = mock.method(fs, 'renameSync', () => {
    apeluri += 1;
    throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' });
  });
  try {
    assert.throws(() => mutaFisier(sursa, tinta), { code: 'EBUSY' });
  } finally {
    simulat.mock.restore();
  }
  assert.equal(apeluri, 4);
  assert.equal(fs.readFileSync(tinta, 'utf8'), 'vechi');
  assert.equal(fs.readFileSync(sursa, 'utf8'), 'nou');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('sha256Fisier și sha256Text', () => {
  const dir = dirTemp();
  const cale = path.join(dir, 'mare.bin');
  const continut = Buffer.alloc(3 * 1024 * 1024 + 17, 7);
  fs.writeFileSync(cale, continut);
  assert.equal(sha256Fisier(cale), createHash('sha256').update(continut).digest('hex'));
  assert.equal(sha256Text('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(sha256Text('ș'), createHash('sha256').update(Buffer.from([0xc8, 0x99])).digest('hex'));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('jsonStabil sortează cheile recursiv, fără spații', () => {
  assert.equal(jsonStabil({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: null } }), '{"a":{"c":null,"d":[3,{"y":2,"z":1}]},"b":1}');
  assert.equal(jsonStabil({ a: undefined, b: 'ț' }), '{"b":"ț"}');
  assert.equal(jsonStabil([]), '[]');
  assert.equal(jsonStabil('x'), '"x"');
  assert.equal(jsonStabil({ b: 1, a: 2 }), jsonStabil({ a: 2, b: 1 }));
});

test('existaFisier', () => {
  const dir = dirTemp();
  const cale = path.join(dir, 'a.txt');
  assert.equal(existaFisier(cale), false);
  fs.writeFileSync(cale, 'a');
  assert.equal(existaFisier(cale), true);
  assert.equal(existaFisier(dir), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

/** Un folder de lucru cu diacritice și spațiu, într-o rădăcină temporară (ca la cursanți). */
function folderProiect() {
  const { radacina, curata } = creeazaRadacinaTemp();
  const folder = path.join(radacina, 'Proiect Ăîșț');
  fs.mkdirSync(folder);
  return { radacina, folder, curata };
}

test('stergeRecursiv: o cale care lipsește nu aruncă și nu creează nimic', () => {
  const { radacina, folder, curata } = folderProiect();
  try {
    const lipsa = path.join(folder, 'nu există', 'deloc');
    assert.doesNotThrow(() => stergeRecursiv(lipsa));
    assert.equal(fs.existsSync(lipsa), false);
    assert.deepEqual(fs.readdirSync(folder), []);
    assert.equal(fs.existsSync(radacina), true);
  } finally {
    curata();
  }
});

test('stergeRecursiv: șterge un fișier, pe o cale cu diacritice și spațiu', () => {
  const { folder, curata } = folderProiect();
  try {
    const fisier = path.join(folder, 'notițe ăîșț.txt');
    fs.writeFileSync(fisier, 'ceva\n');
    stergeRecursiv(fisier);
    assert.equal(fs.existsSync(fisier), false);
    assert.equal(fs.existsSync(folder), true, 'folderul din jur rămâne');
  } finally {
    curata();
  }
});

test('stergeRecursiv: șterge un folder cu subfoldere și fișiere pe mai multe niveluri', () => {
  const { radacina, folder, curata } = folderProiect();
  try {
    fs.mkdirSync(path.join(folder, 'a', 'b', 'c ș'), { recursive: true });
    fs.mkdirSync(path.join(folder, 'gol'));
    fs.writeFileSync(path.join(folder, 'radacina.txt'), '1');
    fs.writeFileSync(path.join(folder, 'a', 'unu.txt'), '2');
    fs.writeFileSync(path.join(folder, 'a', 'b', 'doi.txt'), '3');
    fs.writeFileSync(path.join(folder, 'a', 'b', 'c ș', 'trei țî.txt'), '4');
    const vecin = path.join(radacina, 'vecin.txt');
    fs.writeFileSync(vecin, 'rămâne');
    stergeRecursiv(folder);
    assert.equal(fs.existsSync(folder), false);
    assert.equal(fs.readFileSync(vecin, 'utf8'), 'rămâne', 'ce e în afara folderului rămâne');
  } finally {
    curata();
  }
});

test('stergeRecursiv: șterge și un fișier read-only dintr-un folder', () => {
  const { folder, curata } = folderProiect();
  try {
    const adanc = path.join(folder, 'sub');
    fs.mkdirSync(adanc);
    const readOnly = path.join(adanc, 'doar-citire.txt');
    fs.writeFileSync(readOnly, 'x');
    fs.chmodSync(readOnly, 0o444);
    stergeRecursiv(folder);
    assert.equal(fs.existsSync(folder), false);
  } finally {
    curata();
  }
});

test('stergeRecursiv: o legătură spre un folder din afară dispare, ținta și conținutul ei rămân', (t) => {
  const { radacina, folder, curata } = folderProiect();
  try {
    const tinta = path.join(radacina, 'Ținta Ăîș');
    fs.mkdirSync(path.join(tinta, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(tinta, 'important.txt'), 'nu se șterge');
    fs.writeFileSync(path.join(tinta, 'sub', 'adânc.txt'), 'nici asta');
    const legatura = path.join(folder, 'legătură');
    try {
      // Pe Windows joncțiunea nu cere drepturi de administrator, legătura simbolică da.
      fs.symlinkSync(tinta, legatura, process.platform === 'win32' ? 'junction' : 'dir');
    } catch (e) {
      t.skip(`nu pot crea legătura în mediul acesta (${e.code || e.message})`);
      return;
    }
    // O legătură simbolică la un fișier, și una care arată în gol: se șterg și ele ca legături.
    fs.writeFileSync(path.join(radacina, 'fisier-tinta.txt'), 'rămâne');
    try {
      fs.symlinkSync(path.join(radacina, 'fisier-tinta.txt'), path.join(folder, 'legătură-fișier'), 'file');
      fs.symlinkSync(path.join(radacina, 'lipsă'), path.join(folder, 'legătură-în-gol'), 'file');
    } catch {
      // Legăturile la fișiere sunt un plus: lipsa lor nu strică verificarea de bază.
    }
    stergeRecursiv(folder);
    assert.equal(fs.existsSync(folder), false);
    assert.equal(fs.readFileSync(path.join(tinta, 'important.txt'), 'utf8'), 'nu se șterge');
    assert.equal(fs.readFileSync(path.join(tinta, 'sub', 'adânc.txt'), 'utf8'), 'nici asta');
    assert.equal(fs.readFileSync(path.join(radacina, 'fisier-tinta.txt'), 'utf8'), 'rămâne');
  } finally {
    curata();
  }
});

test('stergeRecursiv: o legătură dată direct dispare, ținta rămâne', (t) => {
  const { radacina, curata } = folderProiect();
  try {
    const tinta = path.join(radacina, 'Ținta Ăîș');
    fs.mkdirSync(tinta);
    fs.writeFileSync(path.join(tinta, 'important.txt'), 'nu se șterge');
    const legatura = path.join(radacina, 'legătură directă');
    try {
      fs.symlinkSync(tinta, legatura, process.platform === 'win32' ? 'junction' : 'dir');
    } catch (e) {
      t.skip(`nu pot crea legătura în mediul acesta (${e.code || e.message})`);
      return;
    }
    stergeRecursiv(legatura);
    assert.equal(fs.lstatSync(legatura, { throwIfNoEntry: false }), undefined);
    assert.equal(fs.readFileSync(path.join(tinta, 'important.txt'), 'utf8'), 'nu se șterge');
  } finally {
    curata();
  }
});

test('nucleul nu mai folosește rmSync și cpSync (cad pe Windows la căi cu diacritice, nodejs/node #56049)', () => {
  const nucleu = path.join(RADACINA, 'nucleu');
  const fisiere = [];
  const parcurge = (dir) => {
    for (const intrare of fs.readdirSync(dir, { withFileTypes: true })) {
      if (intrare.name === 'node_modules') continue;
      const cale = path.join(dir, intrare.name);
      if (intrare.isDirectory()) parcurge(cale);
      else if (intrare.isFile() && cale.endsWith('.mjs')) fisiere.push(cale);
    }
  };
  parcurge(nucleu);
  assert.ok(fisiere.length > 10, 'parcurgerea găsește fișierele nucleului');
  const gasite = fisiere
    .filter((f) => /\b(rmSync|cpSync)\s*\(/.test(fs.readFileSync(f, 'utf8')))
    .map((f) => path.relative(RADACINA, f).split(path.sep).join('/'));
  assert.deepEqual(gasite, []);
});

test('T9: stergeRecursiv reîncearcă la EBUSY, ENOTEMPTY și EPERM (folder încă ținut de Chrome pe Windows)', () => {
  for (const cod of ['EBUSY', 'ENOTEMPTY', 'EPERM']) {
    const { folder, curata } = folderProiect();
    const original = fs.rmdirSync;
    let apeluri = 0;
    const simulat = mock.method(fs, 'rmdirSync', (cale, ...rest) => {
      apeluri += 1;
      if (apeluri <= 2) throw Object.assign(new Error(`${cod}: simulat`), { code: cod });
      return original.call(fs, cale, ...rest);
    });
    try {
      const build = path.join(folder, 'build');
      fs.mkdirSync(build);
      fs.writeFileSync(path.join(build, 'index.html'), 'x');
      stergeRecursiv(build);
      assert.equal(fs.existsSync(build), false, cod);
      assert.equal(apeluri, 3, cod);
    } finally {
      simulat.mock.restore();
      curata();
    }
  }
});

test('T9: stergeRecursiv renunță după 5 reîncercări și aruncă eroarea, fără să înghită altele (EACCES nu se reîncearcă)', () => {
  const { folder, curata } = folderProiect();
  const build = path.join(folder, 'build');
  fs.mkdirSync(build);
  let apeluri = 0;
  let cod = 'EBUSY';
  const simulat = mock.method(fs, 'rmdirSync', () => {
    apeluri += 1;
    throw Object.assign(new Error(`${cod}: simulat`), { code: cod });
  });
  try {
    assert.throws(() => stergeRecursiv(build), (e) => e.code === 'EBUSY');
    assert.equal(apeluri, 6);
    apeluri = 0;
    cod = 'EACCES';
    assert.throws(() => stergeRecursiv(build), (e) => e.code === 'EACCES');
    assert.equal(apeluri, 1);
  } finally {
    simulat.mock.restore();
    curata();
  }
});

test('nici codul și testele șabloanelor nu folosesc cpSync (clonele de teste Windows stau în căi cu diacritice)', () => {
  const fisiere = [];
  const parcurge = (dir) => {
    for (const intrare of fs.readdirSync(dir, { withFileTypes: true })) {
      if (intrare.name === 'node_modules') continue;
      const cale = path.join(dir, intrare.name);
      if (intrare.isDirectory()) parcurge(cale);
      else if (intrare.isFile() && cale.endsWith('.mjs')) fisiere.push(cale);
    }
  };
  for (const motor of fs.readdirSync(path.join(RADACINA, 'motoare'))) {
    const sabloane = path.join(RADACINA, 'motoare', motor, 'sabloane');
    if (fs.existsSync(sabloane)) parcurge(sabloane);
  }
  assert.ok(fisiere.length > 10, 'parcurgerea găsește fișierele șabloanelor');
  const gasite = fisiere
    .filter((f) => /\bcpSync\s*\(/.test(fs.readFileSync(f, 'utf8')))
    .map((f) => path.relative(RADACINA, f).split(path.sep).join('/'));
  assert.deepEqual(gasite, [], 'folosește copiazaDosar din teste/ajutoare/copiaza.mjs');
});
