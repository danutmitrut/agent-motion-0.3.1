// Candidatul (a) al testului de la pasul 0: autotrace 0.31.10 pe Windows, fără drepturi de administrator.
// Instalatorul oficial e NSIS 3.09, cu manifest requireAdministrator și InstallDir $PROGRAMFILES64\AutoTrace
// (verificat pe autotrace-20240129-win64-setup.exe și pe distribute/win/autotrace.nsi la tagul 0.31.10).
// Două moduri:
//   instalator: rulează setup.exe /S /D=<dir> ca utilizatorul curent (NSIS: /D ultimul, fără ghilimele);
//   portabil:   extrage fișierele din setup.exe cu 7-Zip, fără să ruleze instalatorul.
// Vectorizarea: PNG → BMP pe 24 de biți, autotrace -centerline, apoi aceeași ordonare și normalizare
// ca vectorizeaza.py din kit (prin finalizeaza din vectorizeaza-propriu.mjs).
// La eșec se păstrează codul de ieșire, stderr și stdout (nu textul comenzii), iar diagnosticheazaAutotrace
// strânge versiunea, formatele, fișierele extrase, câte o probă cu intrarea în PNG și în PPM și o probă cu folderul
// extras copiat într-o cale ASCII (executabilul și directorul curent stau altfel în workspace, în calea cu diacritice).
// Copierea și ștergerea folosesc doar readdirSync, mkdirSync, copyFileSync, unlinkSync și rmdirSync, nu cpSync și
// rmSync: în Node 22.17+ pe Windows, cpSync pe un folder trece calea UTF-8 neconvertită la std::filesystem, care o
// citește în pagina de cod ANSI și aruncă o excepție C++ neprinsă (procesul moare cu 0xC0000409, fără excepție JS;
// nodejs/node#61878, #63970). rmSync are aceeași problemă în versiunile în care e scris în C++ (#56049).
// Folosire:
//   node teste/pas0/vectorizare/vectorizeaza-autotrace.mjs <intrare.png> <iesire.json> --exe <autotrace(.exe)>
//   node teste/pas0/vectorizare/vectorizeaza-autotrace.mjs instaleaza --mod instalator|portabil --instalator <setup.exe> --dir <dir> [--7z <7z.exe>]
import { execFile } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { rulatDirect } from '../../../nucleu/lib/cai.mjs';
import { citestePng, finalizeaza } from './vectorizeaza-propriu.mjs';

const TIMP_MAXIM_MS = 120000;
const TIMP_DIAGNOSTIC_MS = 30000;
/** Câte caractere din stderr și din stdout ajung în raport, pentru fiecare proces. */
export const LIMITA_IESIRE = 8000;
const LIMITA_MESAJ = 240;
const RANDURI_MESAJ = 3;
const LIMITA_FISIERE = 200;
/** Peste atâția octeți, folderul extras nu se mai copiază pentru proba cu executabilul într-o cale ASCII. */
const LIMITA_COPIE = 200 * 1024 * 1024;

/**
 * Nivelul cerut de manifestul unui executabil Windows (asInvoker, highestAvailable, requireAdministrator).
 * @param {Buffer} octeti
 * @returns {string|null}
 */
export function nivelManifest(octeti) {
  const m = /requestedExecutionLevel\s+level="([A-Za-z]+)"/.exec(octeti.toString('latin1'));
  return m ? m[1] : null;
}

/**
 * BMP necomprimat pe 24 de biți, rânduri de jos în sus, aliniate la 4 octeți.
 * @param {{latime: number, inaltime: number, pixeli: Uint8Array}} img gri
 * @returns {Buffer}
 */
export function codificaBmp({ latime, inaltime, pixeli }) {
  const pasRand = Math.ceil((latime * 3) / 4) * 4;
  const marimeDate = pasRand * inaltime;
  const b = Buffer.alloc(54 + marimeDate);
  b.write('BM', 0, 'latin1');
  b.writeUInt32LE(54 + marimeDate, 2);
  b.writeUInt32LE(54, 10);
  b.writeUInt32LE(40, 14);
  b.writeInt32LE(latime, 18);
  b.writeInt32LE(inaltime, 22);
  b.writeUInt16LE(1, 26);
  b.writeUInt16LE(24, 28);
  b.writeUInt32LE(0, 30);
  b.writeUInt32LE(marimeDate, 34);
  b.writeInt32LE(2835, 38);
  b.writeInt32LE(2835, 42);
  for (let y = 0; y < inaltime; y++) {
    const rand = 54 + (inaltime - 1 - y) * pasRand;
    for (let x = 0; x < latime; x++) {
      const v = pixeli[y * latime + x];
      b[rand + x * 3] = v;
      b[rand + x * 3 + 1] = v;
      b[rand + x * 3 + 2] = v;
    }
  }
  return b;
}

/**
 * PPM binar (P6): antetul `P6\n<latime> <inaltime>\n255\n`, apoi câte trei octeți RGB pe pixel, rânduri de sus în jos.
 * @param {{latime: number, inaltime: number, pixeli: Uint8Array}} img gri
 * @returns {Buffer}
 */
export function codificaPpm({ latime, inaltime, pixeli }) {
  const antet = Buffer.from(`P6\n${latime} ${inaltime}\n255\n`, 'latin1');
  const date = Buffer.alloc(latime * inaltime * 3);
  for (let i = 0; i < latime * inaltime; i++) date.fill(pixeli[i], i * 3, i * 3 + 3);
  return Buffer.concat([antet, date]);
}

/**
 * Atributele d din SVG-ul scris de autotrace, ca subtrasee {start, segs}.
 * @param {string} svg
 */
export function parseazaSvgAutotrace(svg) {
  const d = [...svg.matchAll(/\sd="([^"]*)"/g)].map((m) => m[1]).join(' ');
  const jetoane = d.match(/[MLCZ]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const subtrasee = [];
  let curent = null;
  let i = 0;
  const numar = () => Number(jetoane[i++]);
  while (i < jetoane.length) {
    const t = jetoane[i++];
    if (t === 'M') {
      curent = { start: [numar(), numar()], segs: [] };
      subtrasee.push(curent);
    } else if (t === 'L') {
      while (i < jetoane.length && !/^[MLCZ]$/.test(jetoane[i])) curent.segs.push({ tip: 'L', puncte: [[numar(), numar()]] });
    } else if (t === 'C') {
      while (i < jetoane.length && !/^[MLCZ]$/.test(jetoane[i])) curent.segs.push({ tip: 'C', puncte: [[numar(), numar()], [numar(), numar()], [numar(), numar()]] });
    } else if (t === 'Z' && curent) {
      curent.segs.push({ tip: 'L', puncte: [curent.start] });
    }
  }
  return subtrasee.filter((s) => s.segs.length);
}

/**
 * Numeralul cu substantivul, după regula din română: de la 20 în sus (și la sute întregi) cere „de”.
 * @example numeral(3, 'traseu', 'trasee') // '3 trasee'; numeral(20, ...) // '20 de trasee'; numeral(101, ...) // '101 trasee'
 * @param {number} n @param {string} unu @param {string} multe
 */
export function numeral(n, unu, multe) {
  return n === 1 ? `1 ${unu}` : `${n} ${n % 100 >= 20 || (n > 0 && n % 100 === 0) ? 'de ' : ''}${multe}`;
}

/**
 * Taie un text la `limita` caractere și notează lungimea totală.
 * @param {unknown} text
 * @param {number} [limita]
 */
export function taie(text, limita = LIMITA_IESIRE) {
  const s = String(text ?? '');
  return s.length <= limita ? s : `${s.slice(0, limita)}\n[tăiat: ${numeral(s.length, 'caracter', 'caractere')} în total]`;
}

/**
 * Decodează ieșirea unui proces: UTF-8 dacă octeții sunt UTF-8 valid, altfel windows-1252 (pagina de cod ANSI a
 * runner-ului Windows, în care scrie un program mingw cu main() ANSI). windows-1252 nu pierde niciun octet, deci
 * din raport se vede exact cum a primit procesul o cale cu diacritice. Un text deja decodat rămâne „utf-8”.
 * @param {Buffer|Uint8Array|string|null|undefined} octeti
 * @returns {{text: string, codificare: 'utf-8'|'windows-1252'|'latin1'}}
 */
export function decodeazaIesire(octeti) {
  if (octeti === null || octeti === undefined) return { text: '', codificare: 'utf-8' };
  if (typeof octeti === 'string') return { text: octeti, codificare: 'utf-8' };
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(octeti), codificare: 'utf-8' };
  } catch { /* nu e UTF-8 valid */ }
  try {
    return { text: new TextDecoder('windows-1252').decode(octeti), codificare: 'windows-1252' };
  } catch {
    // Node fără ICU complet: latin1 păstrează și el fiecare octet
    return { text: Buffer.from(octeti).toString('latin1'), codificare: 'latin1' };
  }
}

/** Primele `n` rânduri nevide, fără \r (Windows scrie \r\n). */
function primeleRanduri(text, n) {
  return String(text ?? '').replace(/\r\n?/g, '\n').split('\n').map((r) => r.trim()).filter(Boolean).slice(0, n);
}

/** Primele rânduri din stderr sau, dacă stderr e gol, din stdout (autotrace scrie uneori mesajele pe stdout). */
function rezumaIesire(stderr, stdout, randuri = RANDURI_MESAJ) {
  const err = primeleRanduri(stderr, randuri);
  if (err.length) return `stderr: ${err.join(' / ')}`;
  const out = primeleRanduri(stdout, randuri);
  if (out.length) return `stdout: ${out.join(' / ')}`;
  return 'fără mesaj pe stderr sau stdout';
}

/**
 * Motivul eșecului unui proces pornit cu execFile: codul și primele rânduri din stderr (sau stdout), fără textul
 * comenzii. Node pune comanda la începutul lui error.message („Command failed: <comanda>\n<stderr>”), deci mesajul
 * lui nu se folosește. `stderr` și `stdout` se întorc întregi, tăiate la `limitaIesire`, pentru raport.
 * @param {(Error & {code?: number|string|null, killed?: boolean, signal?: string|null, stderr?: string, stdout?: string})|null|undefined} eroare
 * @param {string} [stdout]
 * @param {string} [stderr]
 * @param {{limitaMesaj?: number, randuri?: number, limitaIesire?: number}} [o]
 * @returns {{cod: number|string, mesaj: string|null, stderr: string, stdout: string}}
 */
export function formateazaEroareProces(eroare, stdout, stderr, { limitaMesaj = LIMITA_MESAJ, randuri = RANDURI_MESAJ, limitaIesire = LIMITA_IESIRE } = {}) {
  let err = String(stderr || eroare?.stderr || '');
  const out = String(stdout || eroare?.stdout || '');
  const mesajNode = typeof eroare?.message === 'string' ? eroare.message : '';
  // fără stderr separat, îl luăm din error.message, de după comandă
  if (!err && mesajNode.startsWith('Command failed:') && mesajNode.includes('\n')) err = mesajNode.slice(mesajNode.indexOf('\n') + 1);
  const complet = { stderr: taie(err, limitaIesire), stdout: taie(out, limitaIesire) };
  if (!eroare) return { cod: 0, mesaj: null, ...complet };

  let cod;
  let motiv;
  let cuIesire = true;
  if (typeof eroare.code === 'number') {
    cod = eroare.code;
    // pe Windows, codurile mari sunt NTSTATUS (de exemplu 0xC0000135, o bibliotecă DLL lipsă)
    const hex = cod < 0 || cod > 255 ? ` (0x${(cod >>> 0).toString(16).toUpperCase().padStart(8, '0')})` : '';
    motiv = `a ieșit cu codul ${cod}${hex}`;
  } else if (eroare.code === 'ENOENT' || eroare.code === 'EACCES') {
    cod = eroare.code;
    motiv = eroare.code === 'ENOENT' ? 'nu a pornit: executabilul nu există (ENOENT)' : 'nu a pornit: acces refuzat (EACCES)';
    cuIesire = Boolean(primeleRanduri(err, 1).length || primeleRanduri(out, 1).length);
  } else if (typeof eroare.code === 'string' && eroare.code) {
    cod = eroare.code;
    const prim = primeleRanduri(mesajNode.startsWith('Command failed:') ? '' : mesajNode, 1)[0];
    motiv = `a eșuat cu ${cod}${prim && prim !== cod ? ` (${prim})` : ''}`;
  } else if (eroare.killed) {
    cod = 'timeout';
    motiv = `oprit după timeout${eroare.signal ? ` (semnalul ${eroare.signal})` : ''}`;
  } else if (eroare.signal) {
    cod = eroare.signal;
    motiv = `oprit de semnalul ${eroare.signal}`;
  } else {
    cod = 'eroare';
    const prim = primeleRanduri(mesajNode.startsWith('Command failed:') ? '' : mesajNode, 1)[0];
    motiv = prim ? `a eșuat: ${prim}` : 'a eșuat';
  }
  const mesaj = cuIesire ? `${motiv}; ${rezumaIesire(err, out, randuri)}` : motiv;
  return { cod, mesaj: mesaj.length > limitaMesaj ? `${mesaj.slice(0, limitaMesaj - 3)}...` : mesaj, ...complet };
}

/**
 * Rulează un executabil și nu aruncă niciodată. stdout și stderr se citesc ca octeți și se decodează cu
 * decodeazaIesire; `codificare` spune ce codificare s-a folosit pentru fiecare.
 * @returns {Promise<{cod: number|string, eroare: string|null, stdout: string, stderr: string, codificare: {stdout: string, stderr: string}, timp_ms: number}>}
 */
function ruleaza(fisier, argumente, optiuni = {}) {
  return new Promise((rezolva) => {
    const t0 = performance.now();
    const gata = (eroare, stdout, stderr) => {
      const out = decodeazaIesire(stdout);
      const err = decodeazaIesire(stderr);
      const f = formateazaEroareProces(eroare, out.text, err.text);
      rezolva({ cod: f.cod, eroare: f.mesaj, stdout: f.stdout, stderr: f.stderr, codificare: { stdout: out.codificare, stderr: err.codificare }, timp_ms: Math.round(performance.now() - t0) });
    };
    try {
      execFile(fisier, argumente, { timeout: TIMP_MAXIM_MS, windowsHide: true, maxBuffer: 16 * 1024 * 1024, ...optiuni, encoding: 'buffer' }, gata);
    } catch (e) {
      gata(e, '', '');
    }
  });
}

/** Caută autotrace.exe (sau autotrace) oriunde sub dir. */
export function gasesteExe(dir) {
  if (!existsSync(dir)) return null;
  const gasit = readdirSync(dir, { recursive: true }).map(String).find((f) => /(^|[\\/])autotrace(\.exe)?$/i.test(f));
  return gasit ? join(dir, gasit) : null;
}

/**
 * @param {{instalator: string, dir: string, mod: 'instalator'|'portabil', sevenZip?: string}} o
 * `stderr` și `stdout` (ale instalatorului sau ale lui 7z) apar doar când `cod !== 0`; `eroare` e atunci rezumatul lor scurt.
 * @returns {Promise<{ok: boolean, mod: string, cod: number|string, eroare: string|null, timp_ms: number, nivel_manifest: string|null, exe: string|null, stderr?: string, stdout?: string}>}
 */
export async function instaleazaAutotrace({ instalator, dir, mod, sevenZip }) {
  const nivel = existsSync(instalator) ? nivelManifest(readFileSync(instalator)) : null;
  mkdirSync(dir, { recursive: true });
  let r;
  if (mod === 'instalator') {
    // windowsVerbatimArguments: Node nu pune ghilimele, iar NSIS cere /D=... ultimul și fără ghilimele
    r = await ruleaza(instalator, ['/S', `/D=${dir}`], { windowsVerbatimArguments: true });
  } else {
    if (!sevenZip) return { ok: false, mod, cod: 'fara-7z', eroare: 'lipsește calea spre 7z.exe', timp_ms: 0, nivel_manifest: nivel, exe: null };
    r = await ruleaza(sevenZip, ['x', '-y', `-o${dir}`, instalator]);
  }
  const exe = gasesteExe(dir);
  const iesire = r.cod === 0 ? {} : { stderr: r.stderr, stdout: r.stdout };
  return { ok: r.cod === 0 && exe !== null, mod, cod: r.cod, eroare: r.eroare ?? (exe ? null : 'autotrace.exe nu a apărut în folder'), timp_ms: r.timp_ms, nivel_manifest: nivel, exe, ...iesire };
}

/**
 * Vectorizează `png` cu autotrace, prin BMP. Rezultatul păstrează codul de ieșire, stderr și stdout (tăiate la
 * LIMITA_IESIRE), iar `eroare` e mesajul scurt din formateazaEroareProces.
 * @param {string} exe @param {string} png @param {string} iesireRelativa
 * @param {{start?: 'left'|'right'|'bottom'}} [o]
 */
export async function ruleazaAutotrace(exe, png, iesireRelativa, { start = 'left' } = {}) {
  const t0 = performance.now();
  const iesire = resolve(iesireRelativa);
  const bmp = iesire.replace(/\.json$/i, '') + '.bmp';
  const svg = iesire.replace(/\.json$/i, '') + '.svg';
  writeFileSync(bmp, codificaBmp(citestePng(png)));
  const r = await ruleaza(exe, ['-centerline', '-background-color', 'FFFFFF', '-output-format', 'svg', '-output-file', svg, bmp], { cwd: dirname(exe) });
  const proces = { cod: r.cod, stderr: r.stderr, stdout: r.stdout, codificare: r.codificare };
  if (r.cod !== 0) return { ok: false, eroare: r.eroare, ...proces, timp_ms: Math.round(performance.now() - t0) };
  if (!existsSync(svg)) {
    return { ok: false, eroare: `a ieșit cu codul 0, dar nu a scris ${basename(svg)}; ${rezumaIesire(r.stderr, r.stdout)}`, ...proces, timp_ms: Math.round(performance.now() - t0) };
  }
  const traseu = finalizeaza(parseazaSvgAutotrace(readFileSync(svg, 'utf8')), { start });
  writeFileSync(iesire, JSON.stringify(traseu) + '\n');
  return { ok: traseu.paths.length > 0, eroare: traseu.paths.length ? null : 'zero trasee', ...proces, timp_ms: Math.round(performance.now() - t0), traseu };
}

/**
 * Fișierele de sub `dir` (cale relativă cu `/` și mărime în octeți), sortate, cel mult `limita`, plus numărul total.
 * @param {string} dir
 * @param {number} [limita]
 * @returns {{total: number, fisiere: Array<{cale: string, marime: number|null}>, taiat: boolean}}
 */
export function listeazaFisiere(dir, limita = LIMITA_FISIERE) {
  const toate = [];
  for (const nume of readdirSync(dir, { recursive: true }).map(String).sort()) {
    let st = null;
    try { st = statSync(join(dir, nume)); } catch { /* fișier dispărut sau fără drepturi: rămâne fără mărime */ }
    if (st && !st.isFile()) continue;
    toate.push({ cale: nume.replace(/\\/g, '/'), marime: st ? st.size : null });
  }
  return { total: toate.length, fisiere: toate.slice(0, limita), taiat: toate.length > limita };
}

/**
 * Copiază folderul `sursa` în `dest`, recursiv, doar cu readdirSync, mkdirSync și copyFileSync (toate prin libuv,
 * care pe Windows trec calea în UTF-16, deci merg și cu diacritice). Întâi parcurge sursa și adună mărimea
 * fișierelor; peste `limitaOcteti` aruncă fără să scrie nimic. O legătură simbolică spre un fișier se copiază ca
 * fișierul spre care arată; legăturile spre foldere, cele rupte și fișierele speciale se sar și se numără în `sarite`.
 * @param {string} sursa
 * @param {string} dest folderul copiei (se creează dacă lipsește; nu poate fi în `sursa`)
 * @param {{limitaOcteti?: number}} [o]
 * @returns {{fisiere: number, directoare: number, octeti: number, sarite: number}}
 */
export function copiazaFolder(sursa, dest, { limitaOcteti = LIMITA_COPIE } = {}) {
  const inSursa = relative(resolve(sursa), resolve(dest));
  if (!inSursa || (!inSursa.startsWith('..') && !isAbsolute(inSursa))) throw new Error('destinația copiei e chiar folderul sursă sau e în el');
  const directoare = [];
  const fisiere = [];
  let octeti = 0;
  let sarite = 0;
  const parcurge = (relDir) => {
    for (const intrare of readdirSync(join(sursa, relDir), { withFileTypes: true })) {
      const rel = relDir ? join(relDir, intrare.name) : intrare.name;
      if (intrare.isDirectory()) {
        directoare.push(rel);
        parcurge(rel);
        continue;
      }
      let st = null;
      if (intrare.isFile() || intrare.isSymbolicLink()) {
        try { st = statSync(join(sursa, rel)); } catch { /* legătură ruptă */ }
      }
      if (!st || !st.isFile()) {
        sarite++;
        continue;
      }
      octeti += st.size;
      fisiere.push(rel);
    }
  };
  parcurge('');
  if (octeti > limitaOcteti) throw new Error(`folderul de copiat are ${octeti} octeți, peste limita de ${limitaOcteti}`);
  mkdirSync(dest, { recursive: true });
  for (const d of directoare) mkdirSync(join(dest, d), { recursive: true });
  for (const f of fisiere) copyFileSync(join(sursa, f), join(dest, f));
  return { fisiere: fisiere.length, directoare: directoare.length, octeti, sarite };
}

/**
 * Șterge folderul `dir` cu tot ce e în el, doar cu readdirSync, unlinkSync și rmdirSync (fără rmSync). Nu aruncă:
 * ce nu s-a putut șterge apare în lista întoarsă. Un folder care nu există nu e o eroare. O legătură simbolică
 * se șterge ca legătură, fără să se intre în folderul spre care arată.
 * @param {string} dir
 * @returns {string[]} erorile, goală dacă totul s-a șters
 */
export function stergeFolder(dir) {
  const erori = [];
  const sterge = (cale) => {
    let intrari;
    try {
      intrari = readdirSync(cale, { withFileTypes: true });
    } catch (e) {
      if (e?.code !== 'ENOENT') erori.push(`${cale}: ${e?.code ?? e?.message ?? e}`);
      return;
    }
    for (const intrare of intrari) {
      const copil = join(cale, intrare.name);
      if (intrare.isDirectory()) sterge(copil);
      else stergeFisier(copil, erori);
    }
    try { rmdirSync(cale); } catch (e) { if (e?.code !== 'ENOENT') erori.push(`${cale}: ${e?.code ?? e?.message ?? e}`); }
  };
  sterge(dir);
  return erori;
}

/** unlinkSync care trece peste un fișier lipsă; pe Windows, un fișier read-only se face întâi inscriptibil. */
function stergeFisier(cale, erori) {
  try {
    unlinkSync(cale);
  } catch (e) {
    if (e?.code === 'ENOENT') return;
    if (e?.code === 'EPERM' || e?.code === 'EACCES') {
      try {
        chmodSync(cale, 0o666);
        unlinkSync(cale);
        return;
      } catch { /* rămâne eroarea de la prima încercare */ }
    }
    if (!erori) throw e;
    erori.push(`${cale}: ${e?.code ?? e?.message ?? e}`);
  }
}

/** O rulare de probă cu aceleași opțiuni ca ruleazaAutotrace, dar cu intrarea dată direct (PNG, PPM). */
async function probaAutotrace(exe, intrare, svg, timpMaximMs) {
  // un SVG rămas de la o rulare anterioară nu trebuie să pară scris acum
  stergeFisier(svg);
  const r = await ruleaza(exe, ['-centerline', '-background-color', 'FFFFFF', '-output-format', 'svg', '-output-file', svg, intrare], { cwd: dirname(exe), timeout: timpMaximMs });
  const svgScris = existsSync(svg);
  let numarTrasee = null;
  let eroareSvg = null;
  if (svgScris) {
    try {
      numarTrasee = finalizeaza(parseazaSvgAutotrace(readFileSync(svg, 'utf8'))).paths.length;
    } catch (e) {
      eroareSvg = `SVG-ul nu s-a putut citi: ${e?.message ?? String(e)}`;
    }
  }
  return { intrare: basename(intrare), cod: r.cod, mesaj: r.eroare ?? eroareSvg, svg_scris: svgScris, numar_trasee: numarTrasee, timp_ms: r.timp_ms, stderr: r.stderr, stdout: r.stdout, codificare: r.codificare };
}

/**
 * Copiază folderul extras într-un folder nou din `dirProba` (calea ASCII), `exe-ascii-XXXXXX`, și rulează autotrace
 * de acolo, cu directorul curent tot acolo, pe BMP-ul obișnuit. Deosebește un eșec cauzat de calea executabilului
 * sau a directorului curent (care în rulările testului stau în workspace, în calea cu diacritice) de unul cauzat de
 * formatul de intrare. Folderul nou (mkdtempSync) scutește de ștergerea unei copii vechi.
 */
async function probaExeAscii(exe, dirExtras, png, dirProba, timpMaximMs) {
  const caleExe = relative(dirExtras, exe);
  if (!caleExe || caleExe.startsWith('..') || isAbsolute(caleExe)) throw new Error('executabilul nu e în folderul extras, deci nu s-a copiat');
  const dirCopie = mkdtempSync(join(dirProba, 'exe-ascii-'));
  try {
    copiazaFolder(dirExtras, dirCopie);
  } catch (e) {
    stergeFolder(dirCopie);
    throw e;
  }
  const exeCopiat = join(dirCopie, caleExe);
  const intrare = join(dirProba, 'proba.bmp');
  writeFileSync(intrare, codificaBmp(citestePng(png)));
  return { exe: exeCopiat, ...(await probaAutotrace(exeCopiat, intrare, join(dirProba, 'proba-exe-ascii.svg'), timpMaximMs)) };
}

/**
 * Diagnosticul unui autotrace instalat care a picat la vectorizare: `-version`, `-list-input-formats`,
 * `-list-output-formats`, fișierele din folderul extras, câte o probă cu intrarea în PNG (originalul) și în PPM (P6),
 * scrise în `dirProba`, și o probă pe BMP cu folderul extras copiat în `dirProba` (executabil și director curent
 * ASCII). Nu influențează eligibilitatea. Nu aruncă niciodată: orice eroare devine text în `erori`.
 * @param {{exe: string, dirExtras: string, png: string, dirProba: string, timpMaximMs?: number}} o
 */
export async function diagnosticheazaAutotrace({ exe, dirExtras, png, dirProba, timpMaximMs = TIMP_DIAGNOSTIC_MS }) {
  const diagnostic = { exe: null, versiune: null, formate_intrare: null, formate_iesire: null, fisiere: null, proba_png: null, proba_ppm: null, proba_exe_ascii: null, erori: [] };
  const pas = async (nume, fn) => {
    try {
      diagnostic[nume] = await fn();
    } catch (e) {
      diagnostic.erori.push(`${nume}: ${String(e?.message ?? e)}`.slice(0, 500));
    }
  };
  const comanda = async (argumente) => {
    const r = await ruleaza(exe, argumente, { cwd: dirname(exe), timeout: timpMaximMs });
    return { cod: r.cod, mesaj: r.eroare, stdout: r.stdout, stderr: r.stderr, codificare: r.codificare };
  };
  try {
    await pas('exe', () => relative(dirExtras, exe).replace(/\\/g, '/'));
    await pas('versiune', () => comanda(['-version']));
    await pas('formate_intrare', () => comanda(['-list-input-formats']));
    await pas('formate_iesire', () => comanda(['-list-output-formats']));
    await pas('fisiere', () => listeazaFisiere(dirExtras));
    await pas('proba_png', () => {
      mkdirSync(dirProba, { recursive: true });
      const intrare = join(dirProba, 'proba.png');
      copyFileSync(png, intrare);
      return probaAutotrace(exe, intrare, join(dirProba, 'proba-png.svg'), timpMaximMs);
    });
    await pas('proba_ppm', () => {
      mkdirSync(dirProba, { recursive: true });
      const intrare = join(dirProba, 'proba.ppm');
      writeFileSync(intrare, codificaPpm(citestePng(png)));
      return probaAutotrace(exe, intrare, join(dirProba, 'proba-ppm.svg'), timpMaximMs);
    });
    await pas('proba_exe_ascii', () => {
      mkdirSync(dirProba, { recursive: true });
      return probaExeAscii(exe, dirExtras, png, dirProba, timpMaximMs);
    });
  } catch (e) {
    diagnostic.erori.push(`diagnostic: ${String(e?.message ?? e)}`.slice(0, 500));
  }
  return diagnostic;
}

function optiune(argv, nume) {
  const i = argv.indexOf(nume);
  return i >= 0 ? argv[i + 1] : undefined;
}

if (rulatDirect(import.meta.url)) {
  const argv = process.argv.slice(2);
  if (argv[0] === 'instaleaza') {
    const o = { mod: optiune(argv, '--mod'), instalator: optiune(argv, '--instalator'), dir: optiune(argv, '--dir'), sevenZip: optiune(argv, '--7z') };
    if (!['instalator', 'portabil'].includes(o.mod) || !o.instalator || !o.dir) {
      console.error('Folosire: vectorizeaza-autotrace.mjs instaleaza --mod instalator|portabil --instalator <setup.exe> --dir <dir> [--7z <7z.exe>]');
      process.exitCode = 3;
    } else {
      const r = await instaleazaAutotrace(o);
      console.log(JSON.stringify(r));
      process.exitCode = r.ok ? 0 : 1;
    }
  } else {
    const [intrare, iesire] = argv;
    const exe = optiune(argv, '--exe');
    if (!intrare || !iesire || !exe) {
      console.error('Folosire: vectorizeaza-autotrace.mjs <intrare.png> <iesire.json> --exe <autotrace(.exe)>');
      process.exitCode = 3;
    } else {
      const r = await ruleazaAutotrace(exe, intrare, iesire);
      console.log(r.ok ? `${r.traseu.paths.length} trasee, ${r.timp_ms} ms` : `Eroare: ${r.eroare}`);
      process.exitCode = r.ok ? 0 : 1;
    }
  }
}
