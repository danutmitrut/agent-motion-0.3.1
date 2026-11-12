// Măsurătorile și orchestrarea testului de vectorizare de la pasul 0.
// Subcomenzi:
//   node teste/pas0/vectorizare/compara.mjs sonda <iesire.json>
//   node teste/pas0/vectorizare/compara.mjs toate --lucru <dir> --unelte <dir> --instalator <setup.exe> --7z <7z.exe> --raport <raport.json>
//   node teste/pas0/vectorizare/compara.mjs masoara <traseu.json>
//   node teste/pas0/vectorizare/compara.mjs md <raport.json> <document.md>
import { execFile } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { format } from 'node:util';
import { tmpdir, userInfo, release } from 'node:os';
import { promisify } from 'node:util';
import { rulatDirect } from '../../../nucleu/lib/cai.mjs';
import { curbaReferinta, deseneazaLinie, scriePng, DESEN_IMPLICIT } from './genereaza-desen.mjs';
import { citestePng, vectorizeaza } from './vectorizeaza-propriu.mjs';
import { diagnosticheazaAutotrace, instaleazaAutotrace, numeral, ruleazaAutotrace } from './vectorizeaza-autotrace.mjs';

const executa = promisify(execFile);

export const PRAGURI = Object.freeze({ abatere_medie: 2.0, acoperire: 0.95, timp_ms: 30000 });
// un punct al liniei ideale e acoperit dacă traseul trece la cel mult jumătate din grosimea liniei
const RAZA_ACOPERIRE = DESEN_IMPLICIT.grosime / 2;
const CELULA = 8;

/**
 * Eșantionează un atribut d (M, L, C, cu coordonate absolute) în puncte aflate la cel mult ~1 px unul de altul.
 * @param {string} d
 * @returns {Array<[number, number]>}
 */
export function esantioneazaD(d) {
  const jetoane = d.match(/[MLCZ]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const puncte = [];
  let i = 0;
  let curent = null;
  let start = null;
  let comanda = '';
  const numar = () => Number(jetoane[i++]);
  while (i < jetoane.length) {
    if (/^[MLCZ]$/.test(jetoane[i])) comanda = jetoane[i++];
    if (comanda === 'M') {
      curent = [numar(), numar()];
      start = curent;
      puncte.push(curent);
      comanda = 'L';
    } else if (comanda === 'L') {
      const q = [numar(), numar()];
      const n = Math.max(1, Math.ceil(Math.hypot(q[0] - curent[0], q[1] - curent[1])));
      for (let k = 1; k <= n; k++) puncte.push([curent[0] + ((q[0] - curent[0]) * k) / n, curent[1] + ((q[1] - curent[1]) * k) / n]);
      curent = q;
    } else if (comanda === 'C') {
      const c1 = [numar(), numar()];
      const c2 = [numar(), numar()];
      const q = [numar(), numar()];
      const poligon = Math.hypot(c1[0] - curent[0], c1[1] - curent[1]) + Math.hypot(c2[0] - c1[0], c2[1] - c1[1]) + Math.hypot(q[0] - c2[0], q[1] - c2[1]);
      const pasi = Math.max(1, Math.ceil(poligon));
      for (let k = 1; k <= pasi; k++) {
        const t = k / pasi;
        const u = 1 - t;
        puncte.push([
          u * u * u * curent[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * q[0],
          u * u * u * curent[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * q[1],
        ]);
      }
      curent = q;
    } else if (comanda === 'Z') {
      if (start) puncte.push(start);
      curent = start;
      comanda = '';
    } else {
      i++;
    }
  }
  return puncte;
}

function grila(puncte) {
  const g = new Map();
  for (const p of puncte) {
    const k = `${Math.floor(p[0] / CELULA)},${Math.floor(p[1] / CELULA)}`;
    if (!g.has(k)) g.set(k, []);
    g.get(k).push(p);
  }
  return g;
}

function distantaMinima(p, g, razaMaxima = 400) {
  const cx = Math.floor(p[0] / CELULA);
  const cy = Math.floor(p[1] / CELULA);
  let cel = Infinity;
  for (let r = 0; r * CELULA <= razaMaxima; r++) {
    for (let x = cx - r; x <= cx + r; x++) {
      for (let y = cy - r; y <= cy + r; y++) {
        if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r) continue;
        for (const q of g.get(`${x},${y}`) ?? []) cel = Math.min(cel, Math.hypot(p[0] - q[0], p[1] - q[1]));
      }
    }
    if (cel <= r * CELULA) return cel;
  }
  return cel;
}

/**
 * Compară un rezultat {w, h, paths, origine} cu linia de mijloc ideală.
 * @param {{paths: string[], origine?: [number, number]}} traseu
 * @param {Array<[number, number]>} referinta
 */
export function masoara(traseu, referinta) {
  const [ox, oy] = traseu.origine ?? [0, 0];
  const puncte = traseu.paths.flatMap((d) => esantioneazaD(d)).map(([x, y]) => [x + ox, y + oy]);
  let lungimeTotala = 0;
  for (const d of traseu.paths) {
    const p = esantioneazaD(d);
    for (let k = 1; k < p.length; k++) lungimeTotala += Math.hypot(p[k][0] - p[k - 1][0], p[k][1] - p[k - 1][1]);
  }
  let lungimeReferinta = 0;
  for (let k = 1; k < referinta.length; k++) lungimeReferinta += Math.hypot(referinta[k][0] - referinta[k - 1][0], referinta[k][1] - referinta[k - 1][1]);
  if (!puncte.length) {
    return { numar_trasee: 0, lungime_totala: 0, lungime_referinta: Math.round(lungimeReferinta), abatere_medie: null, abatere_max: null, acoperire: 0 };
  }
  const gRef = grila(referinta);
  const abateri = puncte.map((p) => distantaMinima(p, gRef));
  const gCand = grila(puncte);
  const acoperite = referinta.filter((p) => distantaMinima(p, gCand, RAZA_ACOPERIRE * 2) <= RAZA_ACOPERIRE).length;
  const rot = (x, z = 2) => Math.round(x * 10 ** z) / 10 ** z;
  return {
    numar_trasee: traseu.paths.length,
    lungime_totala: Math.round(lungimeTotala),
    lungime_referinta: Math.round(lungimeReferinta),
    abatere_medie: rot(abateri.reduce((a, b) => a + b, 0) / abateri.length),
    abatere_max: rot(abateri.reduce((a, b) => Math.max(a, b), 0)),
    acoperire: rot(acoperite / referinta.length, 3),
  };
}

/**
 * Un candidat e eligibil dacă se instalează fără drepturi de administrator (și pe un laptop cu UAC),
 * a rulat în toate căile încercate (`ok` e adevărat doar dacă toate rulările au reușit), iar abaterea, acoperirea și timpul trec pragurile. Dintre eligibili: cele mai puține trasee,
 * apoi abaterea cea mai mică.
 * @param {Array<object>} candidati
 * @returns {{id: string|null, motiv: string}}
 */
export function recomanda(candidati) {
  const eligibili = candidati.filter(
    (c) => c.instalat_fara_admin && c.ok && (c.rulari ?? []).every((r) => r.ok) && c.abatere_medie !== null && c.abatere_medie <= PRAGURI.abatere_medie && c.acoperire >= PRAGURI.acoperire && c.timp_ms <= PRAGURI.timp_ms,
  );
  if (!eligibili.length) return { id: null, motiv: 'Niciun candidat nu trece toate condițiile; testul trebuie reluat cu altă unealtă.' };
  eligibili.sort((a, b) => a.numar_trasee - b.numar_trasee || a.abatere_medie - b.abatere_medie);
  const ales = eligibili[0];
  return {
    id: ales.id,
    motiv: `${ales.id} trece toate condițiile, cu ${ales.numar_trasee} trasee și abaterea medie de ${ales.abatere_medie} px (eligibili: ${eligibili.map((c) => c.id).join(', ')}).`,
  };
}

const da = (v) => (v ? 'da' : 'nu');
const sauLiniuta = (v) => (v === null || v === undefined ? '-' : String(v));

/**
 * Escapează un text venit de la un proces (stderr, stdout) ca să apară literal în markdown: backtick-urile
 * neîmperecheate ale lui getopt („unrecognized option `-x'”), *, _, |, <, [ și ] nu mai formatează nimic, iar
 * backslash-urile din căile Windows rămân vizibile.
 * @param {unknown} text
 * @returns {string}
 */
export function escapeazaMd(text) {
  return String(text ?? '').replace(/[\\`*_|<>[\]]/g, (c) => `\\${c}`);
}

/** Un span de cod care rezistă la backtick-uri în text (delimitator mai lung decât orice șir de backtick-uri din el). */
function codMd(text) {
  const s = String(text ?? '').replace(/\r?\n/g, ' ');
  const cel = Math.max(0, ...(s.match(/`+/g) ?? []).map((b) => b.length));
  const d = '`'.repeat(cel + 1);
  return cel ? `${d} ${s} ${d}` : `${d}${s}${d}`;
}

/**
 * Diagnosticul rulează doar când autotrace s-a instalat și a picat în cel puțin o cale. Nu intră în recomanda().
 * @param {Array<{ok: boolean}>} rulari
 */
export function trebuieDiagnostic(rulari) {
  return (rulari ?? []).some((r) => !r.ok);
}

function rezumaProba(p) {
  if (!p) return 'nu a rulat';
  if (p.cod === 0 && p.svg_scris) return p.numar_trasee === null ? `merge (${escapeazaMd(p.mesaj ?? 'SVG necitit')})` : `merge (${numeral(p.numar_trasee, 'traseu', 'trasee')})`;
  return `nu merge (${escapeazaMd(p.mesaj ?? (p.svg_scris ? 'SVG scris, dar cod nenul' : 'nu a scris SVG-ul'))})`;
}

/**
 * Un rând scurt cu ce a arătat diagnosticul lui autotrace: versiunea, probele PNG și PPM, proba cu executabilul
 * copiat într-o cale ASCII, fișierele extrase. Textele venite de la proces sunt escapate pentru markdown.
 * @param {object} d câmpul `diagnostic` al unui candidat
 * @returns {string}
 */
export function rezumaDiagnostic(d) {
  const v = d?.versiune;
  const primul = (t) => String(t ?? '').replace(/\r\n?/g, '\n').split('\n').map((r) => r.trim()).find(Boolean);
  const versiune = v ? (primul(v.stdout) ?? primul(v.stderr) ?? null) : null;
  const parti = [
    versiune && v.cod === 0 ? `versiunea ${codMd(versiune)}` : `versiunea necunoscută (${v ? escapeazaMd(v.mesaj ?? versiune ?? 'fără mesaj') : 'nu a rulat'})`,
    `proba PNG: ${rezumaProba(d?.proba_png)}`,
    `proba PPM: ${rezumaProba(d?.proba_ppm)}`,
    `proba BMP cu executabilul și directorul curent într-o cale ASCII: ${rezumaProba(d?.proba_exe_ascii)}`,
  ];
  if (d?.fisiere) parti.push(`${numeral(d.fisiere.total, 'fișier', 'fișiere')} în folderul extras`);
  if (d?.erori?.length) parti.push(`${numeral(d.erori.length, 'eroare', 'erori')} în diagnostic (${escapeazaMd(d.erori[0])})`);
  return parti.join('; ');
}

/** Secțiunea de rezultate a documentului, din raport. */
export function formateazaMarkdown(raport) {
  const randuri = raport.candidati.map((c) =>
    `| \`${c.id}\` | ${da(c.instalat_fara_admin)} | ${sauLiniuta(c.instalare?.timp_ms)} | ${da(c.ok)} | ${sauLiniuta(c.timp_ms)} | ${sauLiniuta(c.numar_trasee)} | ${sauLiniuta(c.lungime_totala)} | ${sauLiniuta(c.abatere_medie)} | ${sauLiniuta(c.abatere_max)} | ${sauLiniuta(c.acoperire)} |`,
  );
  const detalii = raport.candidati.map((c) => {
    const rulari = (c.rulari ?? []).map((r) => `cale ${r.cale}: ${r.ok ? 'merge' : `eroare (${escapeazaMd(r.eroare)})`}`).join('; ');
    const instalare = c.instalare ? `instalarea: ${c.instalare.ok ? 'reușită' : `eșuată (${escapeazaMd(c.instalare.eroare)})`}, manifest \`${sauLiniuta(c.instalare.nivel_manifest)}\`` : 'fără instalare';
    const linie = `- \`${c.id}\`: ${instalare}${rulari ? `; ${rulari}` : ''}${c.eroare ? `; ${escapeazaMd(c.eroare)}` : ''}.`;
    return c.diagnostic ? `${linie}\n  - diagnostic (nu contează la eligibilitate): ${rezumaDiagnostic(c.diagnostic)}.` : linie;
  });
  return [
    `Rulat pe ${raport.platforma}, Windows ${sauLiniuta(raport.windows)}, Node ${raport.node}, ca utilizatorul \`${raport.utilizator}\` (în grupul Administratori: ${da(raport.in_grup_administratori)}), la ${raport.scris_la}. Lungimea liniei de referință: ${raport.desen.lungime_referinta} px.`,
    '',
    '| Candidat | Fără admin | Instalare (ms) | A mers | Timp (ms) | Trasee | Lungime (px) | Abatere medie (px) | Abatere max (px) | Acoperire |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...randuri,
    '',
    ...detalii,
    '',
    `Recomandarea calculată: ${raport.recomandare.id ? `\`${raport.recomandare.id}\`` : 'niciun candidat'}. ${raport.recomandare.motiv}`,
  ].join('\n');
}

/** Înlocuiește textul dintre marcajele de rezultate. */
export function inlocuiesteRezultate(text, sectiune) {
  const inceput = '<!-- rezultate:inceput -->';
  const sfarsit = '<!-- rezultate:sfarsit -->';
  const a = text.indexOf(inceput);
  const b = text.indexOf(sfarsit);
  if (a < 0 || b < a) throw new Error('Documentul nu are marcajele de rezultate.');
  return `${text.slice(0, a + inceput.length)}\n${sectiune}\n${text.slice(b)}`;
}

/** Utilizatorul curent și dacă e în grupul Administratori (SID S-1-5-32-544). */
export async function sonda() {
  let inGrup = false;
  let windows = null;
  if (process.platform === 'win32') {
    const { stdout } = await executa('whoami', ['/groups', '/fo', 'csv'], { windowsHide: true });
    inGrup = /S-1-5-32-544/.test(stdout);
    windows = release();
  } else {
    inGrup = typeof process.getuid === 'function' && process.getuid() === 0;
  }
  return { utilizator: userInfo().username, in_grup_administratori: inGrup, node: process.version, platforma: `${process.platform}-${process.arch}`, windows, temp: tmpdir() };
}

async function candidatAutotrace(id, mod, o, desen, referinta) {
  const instalare = await instaleazaAutotrace({ instalator: o.instalator, dir: join(o.unelte, id), mod, sevenZip: o.sevenZip });
  const candidat = {
    id,
    instalare,
    // instalatorul trece doar dacă nici pe un laptop cu UAC nu cere drepturi (manifest asInvoker)
    instalat_fara_admin: mod === 'portabil' ? instalare.ok : instalare.ok && instalare.nivel_manifest === 'asInvoker',
    rulari: [],
    ok: false,
  };
  if (!instalare.ok) return { ...candidat, eroare: 'nu s-a instalat' };
  const locuri = [['diacritice', join(o.lucru, id)], ['ascii', join(tmpdir(), `mg-pas0-${id}`)]];
  const rulari = [];
  for (const [cale, dir] of locuri) {
    mkdirSync(dir, { recursive: true });
    copyFileSync(desen, join(dir, 'desen.png'));
    const r = await ruleazaAutotrace(instalare.exe, join(dir, 'desen.png'), join(dir, 'traseu.json'));
    rulari.push({ cale, ...r });
  }
  const rezultat = combinaRulari(candidat, rulari, referinta);
  // diagnosticul rulează doar la eșec și nu intră în recomanda()
  if (trebuieDiagnostic(rulari)) {
    rezultat.diagnostic = await diagnosticheazaAutotrace({ exe: instalare.exe, dirExtras: join(o.unelte, id), png: desen, dirProba: locuri[1][1] })
      .catch((e) => ({ erori: [`diagnostic: ${String(e?.message ?? e)}`] }));
  }
  return rezultat;
}

/**
 * Din rulările unui candidat (câte una pe cale: {cale, ok, eroare?, timp_ms, traseu?}) scoate candidatul final.
 * Eligibil doar dacă a mers în ambele căi (cursantul poate avea diacritice în cale): `ok` e adevărat doar dacă toate
 * rulările au reușit. Măsurătorile vin din prima rulare reușită; `eroare` spune în ce cale a picat. Fiecare rulare
 * din `rulari` păstrează codul de ieșire, stderr și stdout (tăiate de ruleazaAutotrace) și codificarea lor.
 * @param {object} candidat
 * @param {Array<{cale: string, ok: boolean, eroare?: string|null, cod?: number|string, stderr?: string, stdout?: string, codificare?: {stdout: string, stderr: string}, timp_ms?: number, traseu?: object}>} rulari
 * @param {Array<[number, number]>} referinta
 */
export function combinaRulari(candidat, rulari, referinta) {
  const rezumat = rulari.map((r) => ({ cale: r.cale, ok: r.ok, eroare: r.eroare ?? null, cod: r.cod ?? null, timp_ms: r.timp_ms, stderr: r.stderr ?? '', stdout: r.stdout ?? '', codificare: r.codificare ?? null }));
  const bun = rulari.find((r) => r.ok);
  const picate = rezumat.filter((r) => !r.ok);
  const baza = { ...candidat, rulari: rezumat, ok: false };
  if (!bun) return { ...baza, eroare: `a picat în toate căile (${picate.map((r) => `${r.cale}: ${r.eroare}`).join('; ')})` };
  const rezultat = { ...baza, ok: picate.length === 0, timp_ms: bun.timp_ms, ...masoara(bun.traseu, referinta) };
  if (picate.length) rezultat.eroare = `a picat în calea ${picate.map((r) => `${r.cale} (${r.eroare})`).join(', ')}, deci nu e eligibil`;
  return rezultat;
}

/** Rulează toți candidații și scrie raportul. */
export async function ruleazaTot(o) {
  mkdirSync(o.lucru, { recursive: true });
  const info = await sonda();
  const img = deseneazaLinie(DESEN_IMPLICIT);
  const desen = join(o.lucru, 'desen.png');
  scriePng(desen, img);
  const referinta = curbaReferinta(DESEN_IMPLICIT);

  const t0 = performance.now();
  let propriu;
  try {
    const traseu = vectorizeaza(citestePng(desen));
    const timp = Math.round(performance.now() - t0);
    writeFileSync(join(o.lucru, 'propriu.json'), JSON.stringify(traseu) + '\n');
    propriu = { id: 'propriu', instalare: null, instalat_fara_admin: true, rulari: [], ok: true, timp_ms: timp, ...masoara(traseu, referinta) };
  } catch (e) {
    propriu = { id: 'propriu', instalare: null, instalat_fara_admin: true, rulari: [], ok: false, eroare: e.message };
  }
  const candidati = [
    propriu,
    await candidatAutotrace('autotrace-instalator', 'instalator', o, desen, referinta),
    await candidatAutotrace('autotrace-portabil', 'portabil', o, desen, referinta),
  ];
  const raport = {
    versiune: 1,
    scris_la: new Date().toISOString(),
    ...info,
    desen: { ...DESEN_IMPLICIT, lungime_referinta: masoara({ paths: [] }, referinta).lungime_referinta },
    praguri: PRAGURI,
    candidati,
    recomandare: recomanda(candidati),
  };
  writeFileSync(o.raport, JSON.stringify(raport, null, 2) + '\n');
  return raport;
}

/**
 * Rulează `fn` și scrie în `cale` tot ce trece prin console.log și console.error, plus stack-ul erorii dacă `fn` aruncă
 * (apoi aruncă din nou). Pe Windows, node pornit direct de o sarcină programată își pierde stdout și stderr, deci
 * jurnalul din fișier e singura urmă a unui eșec. Dacă fișierul nu se poate crea, rulează fără jurnal.
 * @param {string} cale
 * @param {() => Promise<any>} fn
 */
export async function cuJurnal(cale, fn) {
  let scrie;
  try {
    mkdirSync(dirname(cale), { recursive: true });
    writeFileSync(cale, '');
    scrie = (text) => {
      try { appendFileSync(cale, `${text}\n`); } catch { /* jurnalul nu trebuie să strice testul */ }
    };
  } catch {
    return fn();
  }
  const log = console.log;
  const err = console.error;
  console.log = (...a) => { scrie(format(...a)); log(...a); };
  console.error = (...a) => { scrie(format(...a)); err(...a); };
  try {
    return await fn();
  } catch (e) {
    scrie(e?.stack || String(e));
    throw e;
  } finally {
    console.log = log;
    console.error = err;
  }
}

function optiune(argv, nume) {
  const i = argv.indexOf(nume);
  return i >= 0 ? argv[i + 1] : undefined;
}

async function principal(argv) {
  const [comanda, ...rest] = argv;
  if (comanda === 'sonda' && rest[0]) {
    return cuJurnal(join(dirname(rest[0]), 'sonda.log'), async () => {
      const info = await sonda();
      writeFileSync(rest[0], JSON.stringify(info, null, 2) + '\n');
      console.log(`sonda: ${JSON.stringify(info)}`);
      return 0;
    });
  }
  const o = { lucru: optiune(rest, '--lucru'), unelte: optiune(rest, '--unelte'), instalator: optiune(rest, '--instalator'), sevenZip: optiune(rest, '--7z'), raport: optiune(rest, '--raport') };
  if (comanda === 'toate' && Object.values(o).every(Boolean)) {
    return cuJurnal(join(o.lucru, 'toate.log'), async () => {
      const raport = await ruleazaTot(o);
      console.log(formateazaMarkdown(raport));
      return 0;
    });
  }
  if (comanda === 'masoara' && rest[0]) {
    const traseu = JSON.parse(readFileSync(rest[0], 'utf8'));
    console.log(JSON.stringify(masoara(traseu, curbaReferinta(DESEN_IMPLICIT))));
    return 0;
  }
  if (comanda === 'md' && rest[0] && rest[1]) {
    const raport = JSON.parse(readFileSync(rest[0], 'utf8'));
    writeFileSync(rest[1], inlocuiesteRezultate(readFileSync(rest[1], 'utf8'), formateazaMarkdown(raport)));
    return 0;
  }
  console.error('Folosire: compara.mjs sonda <iesire.json> | toate --lucru <dir> --unelte <dir> --instalator <exe> --7z <exe> --raport <json> | masoara <traseu.json> | md <raport.json> <document.md>');
  return 3;
}

if (rulatDirect(import.meta.url)) {
  principal(process.argv.slice(2)).then(
    (cod) => { process.exitCode = cod; },
    (e) => { console.error(e.stack || String(e)); process.exitCode = 2; },
  );
}
