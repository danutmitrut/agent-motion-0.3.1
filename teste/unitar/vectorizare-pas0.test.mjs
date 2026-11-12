import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { codificaPng, crc32, curbaReferinta, deseneazaLinie, DESEN_IMPLICIT } from '../pas0/vectorizare/genereaza-desen.mjs';
import { decodificaPng, inversa, capat, prag, vectorizeaza, zhangSuen, finalizeaza } from '../pas0/vectorizare/vectorizeaza-propriu.mjs';
import { codificaBmp, codificaPpm, copiazaFolder, decodeazaIesire, diagnosticheazaAutotrace, formateazaEroareProces, nivelManifest, numeral, parseazaSvgAutotrace, ruleazaAutotrace, stergeFolder, taie } from '../pas0/vectorizare/vectorizeaza-autotrace.mjs';
import { combinaRulari, escapeazaMd, formateazaMarkdown, inlocuiesteRezultate, masoara, recomanda, rezumaDiagnostic, trebuieDiagnostic } from '../pas0/vectorizare/compara.mjs';

const RADACINA = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FORMA_D = /^M-?\d+\.\d -?\d+\.\d( C-?\d+\.\d -?\d+\.\d, -?\d+\.\d -?\d+\.\d, -?\d+\.\d -?\d+\.\d| L-?\d+\.\d -?\d+\.\d)+$/;

function bucataPng(tip, date) {
  const lungime = Buffer.alloc(4);
  lungime.writeUInt32BE(date.length);
  const tipSiDate = Buffer.concat([Buffer.from(tip, 'latin1'), date]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(tipSiDate));
  return Buffer.concat([lungime, tipSiDate, crc]);
}

// PNG RGB 3x5, câte un rând cu fiecare filtru (0-4), ca să verificăm defiltrarea.
function pngRgbCuFiltre(randuri) {
  const latime = randuri[0].length / 3;
  const brut = [];
  let anterior = new Uint8Array(randuri[0].length);
  randuri.forEach((rand, y) => {
    const filtru = y % 5;
    const iesire = new Uint8Array(rand.length);
    for (let i = 0; i < rand.length; i++) {
      const a = i >= 3 ? rand[i - 3] : 0;
      const b = anterior[i];
      const c = i >= 3 ? anterior[i - 3] : 0;
      let pred = 0;
      if (filtru === 1) pred = a;
      else if (filtru === 2) pred = b;
      else if (filtru === 3) pred = (a + b) >> 1;
      else if (filtru === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      iesire[i] = (rand[i] - pred) & 0xff;
    }
    brut.push(Buffer.from([filtru]), Buffer.from(iesire));
    anterior = rand;
  });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(latime, 0);
  ihdr.writeUInt32BE(randuri.length, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bucataPng('IHDR', ihdr),
    bucataPng('IDAT', deflateSync(Buffer.concat(brut))),
    bucataPng('IEND', Buffer.alloc(0)),
  ]);
}

test('PNG gri: codificarea și decodificarea se întorc la aceiași pixeli', () => {
  const img = { latime: 4, inaltime: 3, pixeli: Uint8Array.from([0, 10, 20, 30, 40, 50, 60, 70, 255, 128, 1, 2]) };
  const inapoi = decodificaPng(codificaPng(img));
  assert.equal(inapoi.latime, 4);
  assert.equal(inapoi.inaltime, 3);
  assert.deepEqual([...inapoi.pixeli], [...img.pixeli]);
});

test('PNG RGB cu filtrele 0-4: pixelii gri ies corect', () => {
  const randuri = [];
  for (let y = 0; y < 5; y++) {
    const rand = new Uint8Array(9);
    for (let x = 0; x < 3; x++) rand.fill((y * 50 + x * 20) & 0xff, x * 3, x * 3 + 3);
    randuri.push(rand);
  }
  const img = decodificaPng(pngRgbCuFiltre(randuri));
  const asteptat = randuri.flatMap((r) => [r[0], r[3], r[6]]);
  assert.deepEqual([...img.pixeli], asteptat);
});

test('Zhang-Suen subțiază o bară groasă la o linie de 1 px', () => {
  const w = 40;
  const h = 11;
  const bin = new Uint8Array(w * h);
  for (let y = 3; y <= 7; y++) for (let x = 3; x <= 36; x++) bin[y * w + x] = 1;
  const s = zhangSuen(bin, w, h);
  for (let x = 8; x <= 31; x++) {
    let n = 0;
    for (let y = 0; y < h; y++) n += s[y * w + x];
    assert.equal(n, 1, `coloana ${x} are ${n} pixeli în schelet`);
  }
});

test('vectorizarea proprie urmărește desenul sintetic în forma {w, h, paths} cerută de linia.js', () => {
  const img = deseneazaLinie(DESEN_IMPLICIT);
  assert.equal(prag(img).reduce((a, b) => a + b, 0) > 1000, true);
  const traseu = vectorizeaza(img);
  assert.ok(traseu.paths.length >= 1);
  assert.ok(traseu.w > 0 && traseu.h > 0);
  for (const d of traseu.paths) assert.match(d, FORMA_D);
  const m = masoara(traseu, curbaReferinta(DESEN_IMPLICIT));
  assert.ok(m.abatere_medie <= 2, `abaterea medie ${m.abatere_medie}`);
  assert.ok(m.acoperire >= 0.95, `acoperirea ${m.acoperire}`);
});

test('inversa de două ori păstrează capetele', () => {
  const s = { start: [0, 0], segs: [{ tip: 'C', puncte: [[1, 0], [2, 1], [3, 3]] }, { tip: 'L', puncte: [[5, 3]] }] };
  const dublu = inversa(inversa(s));
  assert.deepEqual(dublu.start, s.start);
  assert.deepEqual(capat(dublu), capat(s));
  assert.deepEqual(capat(inversa(s)), s.start);
});

test('SVG-ul autotrace devine subtrasee, apoi trasee normalizate', () => {
  const svg = '<?xml version="1.0" standalone="yes"?>\n<svg width="100" height="80">\n<path style="stroke:#000000; fill:none;" d="M10 20C15 20 25 30 30 40L60 40"/>\n<path style="stroke:#000000; fill:none;" d="M70 10L90 10L90 50Z"/>\n</svg>\n';
  const subtrasee = parseazaSvgAutotrace(svg);
  assert.equal(subtrasee.length, 2);
  assert.deepEqual(subtrasee[0].segs.map((s) => s.tip), ['C', 'L']);
  assert.deepEqual(subtrasee[1].segs.map((s) => s.tip), ['L', 'L', 'L']);
  const traseu = finalizeaza(subtrasee);
  assert.equal(traseu.paths.length, 2);
  assert.deepEqual(traseu.origine, [10, 10]);
  for (const d of traseu.paths) assert.match(d, FORMA_D);
});

test('nivelManifest citește requestedExecutionLevel din executabil', () => {
  const cu = Buffer.from('MZ....<requestedPrivileges><requestedExecutionLevel level="requireAdministrator" uiAccess="false"/>', 'latin1');
  assert.equal(nivelManifest(cu), 'requireAdministrator');
  assert.equal(nivelManifest(Buffer.from('MZ fara manifest', 'latin1')), null);
});

test('BMP pe 24 de biți: antet corect, rânduri de jos în sus', () => {
  const bmp = codificaBmp({ latime: 2, inaltime: 2, pixeli: Uint8Array.from([0, 255, 100, 200]) });
  assert.equal(bmp.toString('latin1', 0, 2), 'BM');
  assert.equal(bmp.readUInt32LE(2), 54 + 8 * 2);
  assert.equal(bmp.readInt32LE(18), 2);
  assert.equal(bmp.readInt32LE(22), 2);
  assert.equal(bmp.readUInt16LE(28), 24);
  assert.deepEqual([...bmp.subarray(54, 60)], [100, 100, 100, 200, 200, 200]);
  assert.deepEqual([...bmp.subarray(62, 68)], [0, 0, 0, 255, 255, 255]);
});

test('masoara: linia ideală desenată ca traseu are abatere zero și acoperire completă', () => {
  const ref = curbaReferinta(DESEN_IMPLICIT);
  const d = `M${ref[0][0].toFixed(1)} ${ref[0][1].toFixed(1)}` + ref.slice(1).map(([x, y]) => ` L${x.toFixed(1)} ${y.toFixed(1)}`).join('');
  const m = masoara({ paths: [d], origine: [0, 0] }, ref);
  assert.equal(m.numar_trasee, 1);
  assert.ok(m.abatere_medie <= 0.1);
  assert.equal(m.acoperire, 1);
  assert.equal(masoara({ paths: [] }, ref).acoperire, 0);
});

test('recomanda alege eligibilul cu cele mai puține trasee și refuză fără eligibili', () => {
  const baza = { instalat_fara_admin: true, ok: true, abatere_medie: 1, acoperire: 0.99, timp_ms: 1000 };
  const r = recomanda([
    { ...baza, id: 'propriu', numar_trasee: 4 },
    { ...baza, id: 'autotrace-portabil', numar_trasee: 3 },
    { ...baza, id: 'autotrace-instalator', numar_trasee: 1, instalat_fara_admin: false },
  ]);
  assert.equal(r.id, 'autotrace-portabil');
  assert.equal(recomanda([{ ...baza, id: 'propriu', numar_trasee: 2, abatere_medie: 3 }]).id, null);
});

test('inlocuiesteRezultate scrie doar între marcaje', () => {
  const text = 'Antet\n<!-- rezultate:inceput -->\nvechi\n<!-- rezultate:sfarsit -->\nFinal\n';
  assert.equal(inlocuiesteRezultate(text, 'nou'), 'Antet\n<!-- rezultate:inceput -->\nnou\n<!-- rezultate:sfarsit -->\nFinal\n');
  assert.throws(() => inlocuiesteRezultate('fără marcaje', 'x'), /marcajele/);
});

test('din linia de comandă: genereaza-desen, apoi vectorizeaza-propriu, într-o cale cu spațiu și diacritice', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mg test Ăîș '));
  try {
    const png = join(dir, 'desen.png');
    const json = join(dir, 'traseu.json');
    execFileSync(process.execPath, [join(RADACINA, 'teste/pas0/vectorizare/genereaza-desen.mjs'), png]);
    execFileSync(process.execPath, [join(RADACINA, 'teste/pas0/vectorizare/vectorizeaza-propriu.mjs'), png, json]);
    const traseu = JSON.parse(readFileSync(json, 'utf8'));
    assert.ok(traseu.paths.length >= 1);
    assert.equal(typeof traseu.w, 'number');
    assert.equal(typeof traseu.h, 'number');
  } finally {
    stergeFolder(dir);
  }
});

// Comanda lungă din rularea 37111211779, pe care Node o pune la începutul lui error.message.
const COMANDA = 'C:\\Users\\mgtest\\Proiecte Ăîș test\\agent-motion\\unelte\\vectorizare\\autotrace-portabil\\autotrace.exe -centerline -background-color FFFFFF -output-format svg -output-file C:\\Users\\mgtest\\traseu.svg C:\\Users\\mgtest\\traseu.bmp';
const eroareNode = (proprietati, stderr = '') => Object.assign(new Error(`Command failed: ${COMANDA}\n${stderr}`), { killed: false, signal: null, ...proprietati });

test('formateazaEroareProces: cod numeric, cu mesajul real al lui Node, păstrează stderr-ul (cu \\r\\n) și nu comanda', () => {
  const stderr = 'autotrace.exe: input file format not supported\r\nsecond line\r\n';
  const f = formateazaEroareProces(eroareNode({ code: 1 }, stderr), '', stderr);
  assert.equal(f.cod, 1);
  assert.equal(f.mesaj, 'a ieșit cu codul 1; stderr: autotrace.exe: input file format not supported / second line');
  assert.doesNotMatch(f.mesaj, /Command failed|-centerline|\r/);
  assert.equal(f.stderr, stderr);
  assert.equal(f.stdout, '');
});

test('formateazaEroareProces: fără stderr separat, îl ia din error.message, de după comandă', () => {
  const f = formateazaEroareProces(eroareNode({ code: 2 }, 'mesajul real\r\n'));
  assert.equal(f.mesaj, 'a ieșit cu codul 2; stderr: mesajul real');
  assert.equal(f.stderr, 'mesajul real\r\n');
});

test('formateazaEroareProces: stderr gol, mesajul vine din stdout; ambele goale, o spune explicit', () => {
  const dinStdout = formateazaEroareProces(eroareNode({ code: 1 }), 'Unknown input format\r\n', '');
  assert.equal(dinStdout.mesaj, 'a ieșit cu codul 1; stdout: Unknown input format');
  assert.equal(dinStdout.stdout, 'Unknown input format\r\n');
  const gol = formateazaEroareProces(eroareNode({ code: 1 }), '', '');
  assert.equal(gol.mesaj, 'a ieșit cu codul 1; fără mesaj pe stderr sau stdout');
  assert.equal(formateazaEroareProces(eroareNode({ code: 1 }), ' \r\n', '\r\n').mesaj, 'a ieșit cu codul 1; fără mesaj pe stderr sau stdout');
});

test('formateazaEroareProces: ENOENT și EACCES au cod text, fără stderr și fără cale', () => {
  const enoent = Object.assign(new Error('spawn C:\\lipsa\\autotrace.exe ENOENT'), { code: 'ENOENT', errno: -4058, syscall: 'spawn C:\\lipsa\\autotrace.exe' });
  const a = formateazaEroareProces(enoent, '', '');
  assert.equal(a.cod, 'ENOENT');
  assert.equal(a.mesaj, 'nu a pornit: executabilul nu există (ENOENT)');
  const eacces = Object.assign(new Error('spawn /x/autotrace EACCES'), { code: 'EACCES' });
  const b = formateazaEroareProces(eacces, undefined, undefined);
  assert.equal(b.cod, 'EACCES');
  assert.equal(b.mesaj, 'nu a pornit: acces refuzat (EACCES)');
  assert.equal(b.stderr, '');
});

test('formateazaEroareProces: timeout (killed) și oprire prin semnal', () => {
  const t = formateazaEroareProces(eroareNode({ code: null, killed: true, signal: 'SIGTERM' }), '', '');
  assert.equal(t.cod, 'timeout');
  assert.equal(t.mesaj, 'oprit după timeout (semnalul SIGTERM); fără mesaj pe stderr sau stdout');
  const s = formateazaEroareProces(eroareNode({ code: null, signal: 'SIGSEGV' }, 'segfault'), '', 'segfault');
  assert.equal(s.cod, 'SIGSEGV');
  assert.equal(s.mesaj, 'oprit de semnalul SIGSEGV; stderr: segfault');
});

test('formateazaEroareProces: cod NTSTATUS de Windows în hex, fără eroare dă cod 0, textele lungi se taie', () => {
  assert.equal(formateazaEroareProces(eroareNode({ code: 3221225781 }), '', '').mesaj, 'a ieșit cu codul 3221225781 (0xC0000135); fără mesaj pe stderr sau stdout');
  assert.deepEqual(formateazaEroareProces(null, 'ok', ''), { cod: 0, mesaj: null, stderr: '', stdout: 'ok' });
  const lung = 'x'.repeat(20000);
  const f = formateazaEroareProces(eroareNode({ code: 1 }), lung, lung);
  assert.ok(f.mesaj.length <= 240, `mesajul are ${f.mesaj.length} caractere`);
  assert.ok(f.stderr.startsWith('x'.repeat(8000)));
  assert.match(f.stderr, /\[tăiat: 20000 de caractere în total\]$/);
  assert.ok(f.stdout.length < 8100);
  const multe = formateazaEroareProces(eroareNode({ code: 1 }), '', 'r1\nr2\n\nr3\nr4\n');
  assert.equal(multe.mesaj, 'a ieșit cu codul 1; stderr: r1 / r2 / r3');
});

test('PPM P6: antet, dimensiuni, 255, apoi octeți RGB pe rânduri de sus în jos', () => {
  const ppm = codificaPpm({ latime: 2, inaltime: 2, pixeli: Uint8Array.from([0, 255, 100, 200]) });
  const antet = 'P6\n2 2\n255\n';
  assert.equal(ppm.toString('latin1', 0, antet.length), antet);
  assert.equal(ppm.length, antet.length + 2 * 2 * 3);
  assert.deepEqual([...ppm.subarray(antet.length)], [0, 0, 0, 255, 255, 255, 100, 100, 100, 200, 200, 200]);
});

test('taie: nota de tăiere folosește numeralul corect în română', () => {
  assert.equal(taie('abcdef', 5), 'abcde\n[tăiat: 6 caractere în total]');
  assert.equal(taie('x'.repeat(25), 3), 'xxx\n[tăiat: 25 de caractere în total]');
  assert.equal(taie('scurt', 5), 'scurt');
  assert.equal(numeral(1, 'caracter', 'caractere'), '1 caracter');
  assert.equal(numeral(19, 'caracter', 'caractere'), '19 caractere');
  assert.equal(numeral(101, 'caracter', 'caractere'), '101 caractere');
  assert.equal(numeral(8771, 'caracter', 'caractere'), '8771 de caractere');
});

test('decodeazaIesire: UTF-8 valid rămâne UTF-8; octeții ANSI (cp1252) se decodează ca windows-1252, fără pierderi', () => {
  assert.deepEqual(decodeazaIesire(Buffer.from('Proiecte Ăîș test\r\n', 'utf8')), { text: 'Proiecte Ăîș test\r\n', codificare: 'utf-8' });
  // „can't open C:\Proiecte ?î? test” scris de un program mingw cu main() ANSI: 0xEE e î în cp1252, nu UTF-8 valid
  const ansi = Buffer.concat([Buffer.from("can't open C:\\Proiecte ?", 'latin1'), Buffer.from([0xee]), Buffer.from('? test', 'latin1')]);
  const d = decodeazaIesire(ansi);
  assert.equal(d.codificare, 'windows-1252');
  assert.equal(d.text, "can't open C:\\Proiecte ?î? test");
  assert.doesNotMatch(d.text, /\uFFFD/);
  assert.equal(decodeazaIesire(Buffer.from([0x80])).text, '€');
  assert.deepEqual(decodeazaIesire(Buffer.alloc(0)), { text: '', codificare: 'utf-8' });
  assert.deepEqual(decodeazaIesire('deja text'), { text: 'deja text', codificare: 'utf-8' });
  assert.deepEqual(decodeazaIesire(undefined), { text: '', codificare: 'utf-8' });
});

test('combinaRulari păstrează codul, stderr, stdout și codificarea fiecărei rulări', () => {
  const rulari = [
    { cale: 'diacritice', ok: false, eroare: 'a ieșit cu codul 1; stderr: x', cod: 1, stderr: 'x\r\n', stdout: '', timp_ms: 5 },
    { cale: 'ascii', ok: false, eroare: 'a ieșit cu codul 1; stderr: x', cod: 1, stderr: 'x\r\n', stdout: 'y', codificare: { stdout: 'utf-8', stderr: 'windows-1252' }, timp_ms: 4 },
  ];
  const c = combinaRulari({ id: 'autotrace-portabil', instalat_fara_admin: true }, rulari, []);
  assert.deepEqual(c.rulari[1], { cale: 'ascii', ok: false, eroare: 'a ieșit cu codul 1; stderr: x', cod: 1, timp_ms: 4, stderr: 'x\r\n', stdout: 'y', codificare: { stdout: 'utf-8', stderr: 'windows-1252' } });
  assert.equal(c.rulari[0].codificare, null);
});

test('recomanda nu ține cont de diagnostic: același rezultat cu și fără, iar un candidat picat rămâne neeligibil', () => {
  const eligibil = {
    id: 'autotrace-portabil', instalat_fara_admin: true, ok: true, timp_ms: 900, numar_trasee: 2, abatere_medie: 0.8, acoperire: 0.99,
    rulari: [{ cale: 'diacritice', ok: true }, { cale: 'ascii', ok: true }],
  };
  const propriu = { id: 'propriu', instalat_fara_admin: true, ok: true, timp_ms: 50, numar_trasee: 3, abatere_medie: 0.5, acoperire: 0.98, rulari: [] };
  const diagnosticPicat = { versiune: { cod: 1 }, proba_png: { cod: 1, svg_scris: false }, proba_ppm: { cod: 1, svg_scris: false }, proba_exe_ascii: { cod: 1, svg_scris: false }, erori: ['x'] };
  const fara = recomanda([propriu, eligibil]);
  assert.equal(fara.id, 'autotrace-portabil');
  assert.deepEqual(recomanda([propriu, { ...eligibil, diagnostic: diagnosticPicat }]), fara);

  // picat într-o cale, dar cu un diagnostic „reușit” (toate probele merg): tot neeligibil
  const reusit = { cod: 0, svg_scris: true, numar_trasee: 1 };
  const picat = { ...eligibil, ok: false, rulari: [{ cale: 'diacritice', ok: false }, { cale: 'ascii', ok: true }], diagnostic: { versiune: { cod: 0 }, proba_png: reusit, proba_ppm: reusit, proba_exe_ascii: reusit, erori: [] } };
  assert.equal(recomanda([propriu, picat]).id, 'propriu');
  assert.equal(recomanda([picat]).id, null);
});

test('trebuieDiagnostic: doar când autotrace a picat în cel puțin o cale', () => {
  assert.equal(trebuieDiagnostic([{ cale: 'diacritice', ok: true }, { cale: 'ascii', ok: true }]), false);
  assert.equal(trebuieDiagnostic([{ cale: 'diacritice', ok: false }, { cale: 'ascii', ok: true }]), true);
  assert.equal(trebuieDiagnostic([{ cale: 'diacritice', ok: true }, { cale: 'ascii', ok: false }]), true);
  assert.equal(trebuieDiagnostic([{ cale: 'diacritice', ok: false }, { cale: 'ascii', ok: false }]), true);
  assert.equal(trebuieDiagnostic([]), false);
});

test('formateazaMarkdown: mesajele de la proces sunt escapate (backtick-ul neîmperecheat al lui getopt nu face cod)', () => {
  const mesaj = "a ieșit cu codul 1; stderr: autotrace: unrecognized option `-centerline' / C:\\Users\\x_y\\*.bmp | z";
  assert.equal(escapeazaMd('a`b*c_d|e\\f<g>[h]'), 'a\\`b\\*c\\_d\\|e\\\\f\\<g\\>\\[h\\]');
  const raport = {
    platforma: 'win32-x64', windows: '10.0', node: 'v24', utilizator: 'mgtest', in_grup_administratori: false, scris_la: 'azi', desen: { lungime_referinta: 1 },
    candidati: [{
      id: 'autotrace-portabil', instalat_fara_admin: true, ok: false, instalare: { ok: true, nivel_manifest: null },
      rulari: [{ cale: 'diacritice', ok: false, eroare: mesaj }, { cale: 'ascii', ok: false, eroare: mesaj }],
      eroare: `a picat în toate căile (diacritice: ${mesaj}; ascii: ${mesaj})`,
      diagnostic: { versiune: { cod: 0, stdout: 'AutoTrace `0.31.10`', stderr: '' }, proba_png: { cod: 1, mesaj, svg_scris: false }, proba_ppm: null, proba_exe_ascii: null, erori: [] },
    }],
    recomandare: { id: null, motiv: 'niciunul' },
  };
  const md = formateazaMarkdown(raport);
  const [linie, diag] = md.split('\n').filter((r) => r.trimStart().startsWith('- '));
  // singurele backtick-uri neescapate din rândul candidatului sunt cele puse de noi: id-ul și manifestul
  assert.equal((linie.match(/(?<!\\)`/g) ?? []).length, 4);
  assert.ok(linie.includes("option \\`-centerline'"));
  assert.ok(linie.includes('C:\\\\Users\\\\x\\_y\\\\\\*.bmp \\| z'));
  // versiunea cu backtick-uri în ea stă într-un span cu delimitator dublu
  assert.ok(diag.includes('versiunea `` AutoTrace `0.31.10` ``'), diag);
  assert.ok(diag.includes("proba PNG: nu merge (a ieșit cu codul 1; stderr: autotrace: unrecognized option \\`-centerline'"));
});

test('rezumaDiagnostic și formateazaMarkdown: un rând scurt sub candidat, tabelul rămâne același', () => {
  const diagnostic = {
    exe: 'autotrace.exe',
    versiune: { cod: 0, mesaj: null, stdout: 'AutoTrace version 0.31.10\r\n', stderr: '' },
    fisiere: { total: 23, fisiere: [], taiat: false },
    proba_png: { cod: 0, mesaj: null, svg_scris: true, numar_trasee: 3 },
    proba_ppm: { cod: 1, mesaj: 'a ieșit cu codul 1; stderr: bad', svg_scris: false, numar_trasee: null },
    erori: [],
  };
  assert.equal(rezumaDiagnostic(diagnostic), 'versiunea `AutoTrace version 0.31.10`; proba PNG: merge (3 trasee); proba PPM: nu merge (a ieșit cu codul 1; stderr: bad); proba BMP cu executabilul și directorul curent într-o cale ASCII: nu a rulat; 23 de fișiere în folderul extras');
  assert.match(rezumaDiagnostic({ ...diagnostic, proba_exe_ascii: { cod: 0, mesaj: null, svg_scris: true, numar_trasee: 2 } }), /proba BMP cu executabilul și directorul curent într-o cale ASCII: merge \(2 trasee\)/);
  assert.match(rezumaDiagnostic({ versiune: null, proba_png: null, proba_ppm: null, erori: ['versiune: x'] }), /^versiunea necunoscută \(nu a rulat\); proba PNG: nu a rulat; proba PPM: nu a rulat; proba BMP cu executabilul și directorul curent într-o cale ASCII: nu a rulat; 1 eroare în diagnostic/);
  const raport = {
    platforma: 'win32-x64', windows: '10.0', node: 'v24', utilizator: 'mgtest', in_grup_administratori: false, scris_la: 'azi', desen: { lungime_referinta: 1 },
    candidati: [{ id: 'autotrace-portabil', instalat_fara_admin: true, ok: false, instalare: { ok: true, nivel_manifest: null }, rulari: [{ cale: 'ascii', ok: false, eroare: 'a ieșit cu codul 1; stderr: bad' }], diagnostic }],
    recomandare: { id: null, motiv: 'niciunul' },
  };
  const md = formateazaMarkdown(raport);
  assert.match(md, /cale ascii: eroare \(a ieșit cu codul 1; stderr: bad\)/);
  assert.match(md, /\n {2}- diagnostic \(nu contează la eligibilitate\): versiunea `AutoTrace version 0\.31\.10`; proba PNG: merge/);
  assert.equal(md.split('\n').filter((r) => r.startsWith('| `')).length, 1);
});

test('ruleazaAutotrace și diagnosticul, cu un executabil care iese cu cod nenul și scrie pe stderr (node cu opțiuni necunoscute)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mg diag Ăîș '));
  try {
    const png = join(dir, 'desen.png');
    execFileSync(process.execPath, [join(RADACINA, 'teste/pas0/vectorizare/genereaza-desen.mjs'), png]);
    const r = await ruleazaAutotrace(process.execPath, png, join(dir, 'traseu.json'));
    assert.equal(r.ok, false);
    assert.equal(typeof r.cod, 'number');
    assert.notEqual(r.cod, 0);
    assert.match(r.stderr, /bad option/);
    assert.match(r.eroare, /^a ieșit cu codul \d+; stderr: .*bad option/);
    assert.doesNotMatch(r.eroare, /Command failed|traseu\.svg/);

    const extras = join(dir, 'extras');
    mkdirSync(join(extras, 'lib'), { recursive: true });
    writeFileSync(join(extras, 'lib', 'a.dll'), 'abc');
    const d = await diagnosticheazaAutotrace({ exe: process.execPath, dirExtras: extras, png, dirProba: join(dir, 'proba') });
    assert.notEqual(d.versiune.cod, 0);
    assert.match(d.versiune.stderr, /bad option/);
    assert.ok(d.formate_intrare && d.formate_iesire);
    assert.deepEqual(d.fisiere, { total: 1, fisiere: [{ cale: 'lib/a.dll', marime: 3 }], taiat: false });
    for (const p of [d.proba_png, d.proba_ppm]) {
      assert.equal(p.svg_scris, false);
      assert.match(p.mesaj, /bad option/);
    }
    assert.equal(d.proba_ppm.intrare, 'proba.ppm');
    assert.match(readFileSync(join(dir, 'proba', 'proba.ppm'), 'latin1').slice(0, 15), /^P6\n800 800\n255\n/);
    // node nu e în folderul extras, deci proba cu executabilul copiat nu rulează și o spune
    assert.equal(d.proba_exe_ascii, null);
    assert.deepEqual(d.erori, ['proba_exe_ascii: executabilul nu e în folderul extras, deci nu s-a copiat']);
    const fara = await diagnosticheazaAutotrace({ exe: join(dir, 'lipsa.exe'), dirExtras: join(dir, 'nu-exista'), png: join(dir, 'nu-exista.png'), dirProba: join(dir, 'p2') });
    assert.equal(fara.versiune.cod, 'ENOENT');
    assert.ok(fara.erori.length >= 2, `erori: ${JSON.stringify(fara.erori)}`);
  } finally {
    stergeFolder(dir);
  }
});

test('diagnosticul copiază folderul extras și rulează proba BMP cu executabilul și directorul curent în calea copiei', { skip: process.platform === 'win32' && 'scriptul de probă e pentru sh' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mg diag Ăîș '));
  try {
    const png = join(dir, 'desen.png');
    execFileSync(process.execPath, [join(RADACINA, 'teste/pas0/vectorizare/genereaza-desen.mjs'), png]);
    const extras = join(dir, 'unelte Ăîș', 'autotrace-portabil');
    mkdirSync(join(extras, 'bin'), { recursive: true });
    writeFileSync(join(extras, 'bin', 'lib.dll'), 'abc');
    // un „autotrace” fals: scrie pe stderr directorul curent și ultimul argument, apoi iese cu 1
    const exe = join(extras, 'bin', 'autotrace');
    writeFileSync(exe, '#!/bin/sh\nfor a; do ultim="$a"; done\necho "cwd=$(pwd -P) intrare=$ultim" >&2\nexit 1\n');
    chmodSync(exe, 0o755);
    const dirProba = join(dir, 'proba');
    const d = await diagnosticheazaAutotrace({ exe, dirExtras: extras, png, dirProba });
    const p = d.proba_exe_ascii;
    assert.ok(p, `erori: ${JSON.stringify(d.erori)}`);
    // copia stă într-un folder nou, exe-ascii-XXXXXX, creat cu mkdtempSync în dirProba
    const dirCopie = dirname(dirname(p.exe));
    assert.equal(dirname(dirCopie), dirProba);
    assert.match(basename(dirCopie), /^exe-ascii-.{6}$/);
    assert.equal(p.exe, join(dirCopie, 'bin', 'autotrace'));
    assert.equal(p.intrare, 'proba.bmp');
    assert.equal(p.cod, 1);
    assert.equal(p.svg_scris, false);
    assert.ok(existsSync(join(dirCopie, 'bin', 'lib.dll')), 'DLL-urile de lângă exe se copiază și ele');
    assert.ok(p.stderr.includes(`intrare=${join(dirProba, 'proba.bmp')}`), p.stderr);
    assert.match(p.stderr, /^cwd=\S.*\/proba\/exe-ascii-[^/]{6}\/bin intrare=/);
    assert.match(rezumaDiagnostic(d), /proba BMP cu executabilul și directorul curent într-o cale ASCII: nu merge \(a ieșit cu codul 1; stderr: cwd=/);
    assert.deepEqual(d.erori, []);
  } finally {
    stergeFolder(dir);
  }
});

test('copiazaFolder copiază subfolderele, fișierele și folderele goale dintr-o cale cu diacritice, fără cpSync', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mg copie Ăîș '));
  try {
    const sursa = join(dir, 'unelte Ăîș', 'autotrace-portabil');
    mkdirSync(join(sursa, 'bin', 'plugin șț'), { recursive: true });
    mkdirSync(join(sursa, 'gol'), { recursive: true });
    writeFileSync(join(sursa, 'autotrace.exe'), 'exe');
    writeFileSync(join(sursa, 'bin', 'lib.dll'), 'abcd');
    writeFileSync(join(sursa, 'bin', 'plugin șț', 'ăîâșț.txt'), Buffer.from([0, 1, 2, 255]));
    const dest = join(dir, 'copie');
    const r = copiazaFolder(sursa, dest);
    assert.deepEqual(r, { fisiere: 3, directoare: 3, octeti: 3 + 4 + 4, sarite: 0 });
    assert.equal(readFileSync(join(dest, 'autotrace.exe'), 'utf8'), 'exe');
    assert.equal(readFileSync(join(dest, 'bin', 'lib.dll'), 'utf8'), 'abcd');
    assert.deepEqual([...readFileSync(join(dest, 'bin', 'plugin șț', 'ăîâșț.txt'))], [0, 1, 2, 255]);
    assert.deepEqual(readdirSync(join(dest, 'gol')), []);
    // a doua copie, într-un folder care există deja, suprascrie fișierele
    writeFileSync(join(sursa, 'bin', 'lib.dll'), 'nou');
    copiazaFolder(sursa, dest);
    assert.equal(readFileSync(join(dest, 'bin', 'lib.dll'), 'utf8'), 'nou');
    // sursa și destinația nu se suprapun
    assert.throws(() => copiazaFolder(sursa, join(sursa, 'bin', 'copie')), /folderul sursă/);
    assert.throws(() => copiazaFolder(sursa, sursa), /folderul sursă/);
    assert.ok(!existsSync(join(sursa, 'bin', 'copie')));
    // stergeFolder șterge copia cu tot cu subfolderele cu diacritice
    assert.deepEqual(stergeFolder(dest), []);
    assert.equal(existsSync(dest), false);
  } finally {
    stergeFolder(dir);
  }
});

test('copiazaFolder: peste limită aruncă înainte să scrie ceva, iar la limită exactă copiază', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mg copie Ăîș '));
  try {
    const sursa = join(dir, 'sursă');
    mkdirSync(join(sursa, 'a', 'b'), { recursive: true });
    writeFileSync(join(sursa, 'x.bin'), Buffer.alloc(6));
    writeFileSync(join(sursa, 'a', 'b', 'y.bin'), Buffer.alloc(4));
    const dest = join(dir, 'copie');
    assert.throws(() => copiazaFolder(sursa, dest, { limitaOcteti: 9 }), /are 10 octeți, peste limita de 9/);
    assert.equal(existsSync(dest), false, 'nimic nu se scrie când folderul trece de limită');
    assert.deepEqual(copiazaFolder(sursa, dest, { limitaOcteti: 10 }), { fisiere: 2, directoare: 2, octeti: 10, sarite: 0 });
    assert.equal(readFileSync(join(dest, 'a', 'b', 'y.bin')).length, 4);
  } finally {
    stergeFolder(dir);
  }
});

test('copiazaFolder: o legătură spre fișier se copiază ca fișier, cele spre foldere și cele rupte se sar', { skip: process.platform === 'win32' && 'legăturile simbolice cer drepturi pe Windows' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'mg copie Ăîș '));
  try {
    const sursa = join(dir, 'sursă');
    mkdirSync(join(sursa, 'sub'), { recursive: true });
    writeFileSync(join(sursa, 'sub', 'real.txt'), 'real');
    symlinkSync(join(sursa, 'sub', 'real.txt'), join(sursa, 'spre-fisier'));
    symlinkSync(join(sursa, 'sub'), join(sursa, 'spre-folder'));
    symlinkSync(join(sursa, 'lipsa'), join(sursa, 'rupta'));
    const dest = join(dir, 'copie');
    assert.deepEqual(copiazaFolder(sursa, dest), { fisiere: 2, directoare: 1, octeti: 8, sarite: 2 });
    assert.equal(readFileSync(join(dest, 'spre-fisier'), 'utf8'), 'real');
    assert.equal(existsSync(join(dest, 'spre-folder')), false);
    // stergeFolder șterge legătura spre folder fără să intre în el
    const altul = join(dir, 'altul');
    mkdirSync(altul);
    writeFileSync(join(altul, 'pastreaza.txt'), 'da');
    symlinkSync(altul, join(dest, 'legatura'));
    assert.deepEqual(stergeFolder(dest), []);
    assert.equal(existsSync(dest), false);
    assert.equal(readFileSync(join(altul, 'pastreaza.txt'), 'utf8'), 'da');
  } finally {
    stergeFolder(dir);
  }
});

test('stergeFolder: un folder care nu există nu e o eroare', () => {
  assert.deepEqual(stergeFolder(join(tmpdir(), `mg-nu-exista-${process.pid}-${Date.now()}`)), []);
});

// Pe Windows, cu folderul extras într-o cale cu diacritice: cu cpSync, Node 22.17+ murea aici cu 0xC0000409
// (rularea 37121012701), fără excepție JS. Executabilul e o copie a lui node.exe, care iese cu „bad option”.
test('diagnosticul copiază folderul extras dintr-o cale cu diacritice și rulează executabilul copiat (Windows)', { skip: process.platform !== 'win32' && 'node.exe se poate copia singur doar pe Windows' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mg diag Ăîș '));
  try {
    const png = join(dir, 'desen.png');
    execFileSync(process.execPath, [join(RADACINA, 'teste/pas0/vectorizare/genereaza-desen.mjs'), png]);
    const extras = join(dir, 'unelte Ăîș', 'autotrace-portabil');
    mkdirSync(join(extras, 'bin', 'plugin șț'), { recursive: true });
    writeFileSync(join(extras, 'bin', 'plugin șț', 'ăîș.dll'), 'abc');
    const exe = join(extras, 'bin', 'autotrace.exe');
    copyFileSync(process.execPath, exe);
    const dirProba = join(dir, 'proba');
    const d = await diagnosticheazaAutotrace({ exe, dirExtras: extras, png, dirProba });
    assert.deepEqual(d.erori, []);
    const p = d.proba_exe_ascii;
    const dirCopie = dirname(dirname(p.exe));
    assert.equal(dirname(dirCopie), dirProba);
    assert.match(basename(dirCopie), /^exe-ascii-.{6}$/);
    assert.equal(p.exe, join(dirCopie, 'bin', 'autotrace.exe'));
    assert.equal(typeof p.cod, 'number');
    assert.notEqual(p.cod, 0);
    assert.match(p.stderr, /bad option/);
    assert.equal(readFileSync(join(dirCopie, 'bin', 'plugin șț', 'ăîș.dll'), 'utf8'), 'abc');
  } finally {
    stergeFolder(dir);
  }
});
