// Rata de eroare pe cuvinte (WER) a transcrierii Parakeet în română, pe clipuri Google FLEURS (spec 7.4, „Testul de
// acceptare”; planul H, H18). Clipurile nu intră în repo. Rulează pe Mac, cu Parakeet instalat, pe drumul lui mg nou.
//
//   node unelte/wer/masoara.mjs --fleurs <folder cu dev.tsv și dev/*.wav> [--n 5] --iesire <raport.json> [--doc <fișier.md>]
//     [--vezi-si <raport.json al altei platforme> --vezi-doc <numele documentului ei>]
//   node unelte/wer/masoara.mjs --din <raport.json> --doc <fișier.md> [--vezi-si … --vezi-doc …]
//     reface documentul dintr-un raport existent, fără să măsoare din nou (fără Parakeet și fără clipuri)
// Rulează pe orice platformă cu Parakeet instalat (Mac, Windows); platforma intră în raport și în antetul documentului.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RADACINA = fileURLToPath(new URL('../../', import.meta.url));
const RATA_FLEURS = 16000; // eșantioane pe secundă în dev.tsv (coloana num_samples)

/** Cuvintele pentru comparație: litere mici, ș și ț cu virgulă, fără punctuație; cratima desparte cuvintele. */
export function normalizeazaWer(text) {
  return text.normalize('NFC').toLowerCase()
    .replace(/\u015f/g, 'ș').replace(/\u0163/g, 'ț')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').filter(Boolean);
}

/** Distanța pe cuvinte între referință și transcriere; la egalitate se preferă substituirea, apoi ștergerea. */
export function wer(referinta, ipoteza) {
  const r = normalizeazaWer(referinta);
  const h = normalizeazaWer(ipoteza);
  // fiecare celulă: [operații, substituiri, ștergeri, inserări]
  let prev = Array.from({ length: h.length + 1 }, (_, j) => [j, 0, 0, j]);
  for (let i = 1; i <= r.length; i++) {
    const cur = [[i, 0, i, 0]];
    for (let j = 1; j <= h.length; j++) {
      const egal = r[i - 1] === h[j - 1] ? 0 : 1;
      const [s, d, ins] = [prev[j - 1], prev[j], cur[j - 1]];
      const optiuni = [
        [s[0] + egal, s[1] + egal, s[2], s[3]],
        [d[0] + 1, d[1], d[2] + 1, d[3]],
        [ins[0] + 1, ins[1], ins[2], ins[3] + 1],
      ];
      cur.push(optiuni.reduce((a, b) => (b[0] < a[0] ? b : a)));
    }
    prev = cur;
  }
  const [erori, substituiri, stergeri, inserari] = prev[h.length];
  const cuvinte = r.length;
  return { cuvinte, substituiri, stergeri, inserari, erori, wer: cuvinte === 0 ? (h.length === 0 ? 0 : 1) : erori / cuvinte };
}

/** Rândurile din dev.tsv al FLEURS: id, fișier, transcrierea cu punctuație, durata, vorbitorul. */
export function citesteTsvFleurs(text) {
  return text.split('\n').filter((l) => l.trim() !== '').map((l) => {
    const c = l.split('\t');
    return { id: c[0], fisier: c[1], referinta: c[2], durata: Math.round((Number(c[5]) / RATA_FLEURS) * 10) / 10, gen: c[6]?.trim() ?? null };
  });
}

/** Primele n clipuri descărcate, în ordinea numelui de fișier, câte unul pe frază (FLEURS repetă fraza cu alți vorbitori). */
export function alegeClipuri(randuri, existente, n) {
  const frazeVazute = new Set();
  const alese = [];
  for (const r of [...randuri].sort((a, b) => (a.fisier < b.fisier ? -1 : a.fisier > b.fisier ? 1 : 0))) {
    if (alese.length === n) break;
    if (!existente.has(r.fisier) || frazeVazute.has(r.id)) continue;
    frazeVazute.add(r.id);
    alese.push(r);
  }
  return alese;
}

/** Rata pe tot setul: erorile adunate, împărțite la cuvintele adunate ale referințelor. */
export function totalWer(rezultate) {
  const cuvinte = rezultate.reduce((s, r) => s + r.cuvinte, 0);
  const erori = rezultate.reduce((s, r) => s + r.erori, 0);
  return { cuvinte, erori, wer: cuvinte === 0 ? 0 : erori / cuvinte };
}

const procent = (x) => `${(Math.round(x * 1000) / 10).toFixed(1).replace('.', ',')}%`;
const secunde = (x) => `${x.toFixed(1).replace('.', ',')} s`;
/** „de” după numeral: doar la 00 și 20-99 (108 cuvinte, 120 de cuvinte). */
export const de = (n) => (n % 100 === 0 || n % 100 >= 20 ? ' de' : '');
const NUME_PLATFORMA = Object.freeze({ darwin: 'Mac', win32: 'Windows', linux: 'Linux' });
/** Platforma pe care rulează măsurătoarea: nume pentru oameni și codul runtime-ului (darwin-arm64, win32-x64). */
export const platformaCurenta = () => ({ nume: NUME_PLATFORMA[process.platform] ?? process.platform, cod: `${process.platform}-${process.arch}` });
const PLATFORMA_IMPLICITA = Object.freeze({ nume: 'Mac', cod: 'darwin-arm64' }); // raportul din 2026-10-19 nu avea câmpul
const VORBITOR = Object.freeze({ MALE: 'bărbat', FEMALE: 'femeie' });

const VORBITORI = Object.freeze({ MALE: ['bărbat', 'bărbați'], FEMALE: ['femeie', 'femei'] });

/**
 * Limita eșantionului, din rezultate: câte clipuri și cuvinte, cine vorbește și cât mută rata o singură eroare.
 * Stă lângă cifră, ca rata să nu fie citită ca valoare exactă (revizuirea finală a planului H, minorul 71).
 */
export function limitaEsantion(rezultate) {
  const t = totalWer(rezultate);
  const numar = (gen) => rezultate.filter((r) => r.gen === gen).length;
  const barbati = numar('MALE');
  const femei = numar('FEMALE');
  const altii = rezultate.length - barbati - femei;
  let cine;
  if (barbati === rezultate.length) cine = 'toți vorbitorii sunt bărbați, deci vocile de femei nu sunt măsurate';
  else if (femei === rezultate.length) cine = 'toate vorbitoarele sunt femei, deci vocile de bărbați nu sunt măsurate';
  else {
    const parti = [[barbati, VORBITORI.MALE], [femei, VORBITORI.FEMALE]].filter(([n]) => n > 0).map(([n, [unu, multi]]) => `${n} ${n === 1 ? unu : multi}`);
    if (altii > 0) parti.push(`${altii} cu genul nespecificat`);
    cine = `vorbitorii: ${parti.join(', ')}`;
  }
  const una = t.cuvinte === 0 ? '' : ` O eroare în plus sau în minus mută rata cu ${procent(1 / t.cuvinte)}: cifra e un ordin de mărime, nu o valoare exactă.`;
  return `- Eșantionul e mic: ${rezultate.length}${de(rezultate.length)} ${rezultate.length === 1 ? 'clip' : 'clipuri'}, ${t.cuvinte}${de(t.cuvinte)} cuvinte, iar ${cine}.${una}`;
}

/** Textul afișat în document (docs/ trece prin texte-romana.test.mjs): liniile lungi devin cratimă, sedilele devin virgulă. */
export function curataAfisare(text) {
  return text.replace(/[\u2013\u2014]/g, '-').replace(/\u015f/g, 'ș').replace(/\u0163/g, 'ț')
    .replace(/\u015e/g, 'Ș').replace(/\u0162/g, 'Ț').replace(/\p{Extended_Pictographic}/gu, '');
}

/** Ce înseamnă rata pentru agent (pragurile din planul H, H18). */
export function concluzie(rata) {
  if (rata <= 0.1) return 'Transcrierea e bună pentru subtitrări: agentul corectează prin `corecturi` doar numele proprii, termenii rari și cifrele.';
  if (rata <= 0.2) return 'Transcrierea e utilizabilă, dar cere corecturi: agentul citește fiecare grup din blocul „Ce apare pe ecran” înainte să ceară aprobarea.';
  return 'Transcrierea e slabă pentru subtitrări: când cursantul are deja un `.srt` (din CapCut, Descript sau YouTube), agentul îl propune din start, cu `--transcriere`.';
}

/**
 * Documentul din docs/teste, din raport. `vezi` (opțional) trimite spre măsurătoarea altei platforme, pe aceleași clipuri:
 * { platforma, data, cuvinte, wer, fisier }; cifra ei vine din raportul acelei platforme, deci nu rămâne un număr scris de mână.
 */
export function documentMarkdown({ data, rezultate, motor, platforma = PLATFORMA_IMPLICITA, vezi = null }) {
  const t = totalWer(rezultate);
  const durata = rezultate.reduce((s, r) => s + r.durata, 0);
  const linii = [
    '# Rata de eroare a transcrierii Parakeet în română',
    '',
    `Măsurată pe ${data} cu \`unelte/wer/masoara.mjs\` (planul H, H18), pe ${rezultate.length} clipuri din Google FLEURS (configurația \`ro_ro\`, setul \`dev\`, licența CC BY 4.0), transcrise pe ${platforma.nume} (\`${platforma.cod}\`) pe drumul lui \`mg nou\`: fiecare clip devine un MP4 (cadru negru și vocea), apoi \`hyperframes transcribe --engine parakeet --language ro\`. Modelul: \`${motor.model}\`, revizia \`${motor.revizie}\`, prin \`${motor.runtime}\` ${motor.versiune}. Clipurile nu sunt în repo.`,
    '',
    '## Metoda',
    '',
    'WER = (substituiri + ștergeri + inserări) / cuvintele referinței, pe textul normalizat: litere mici, ș și ț cu virgulă, fără punctuație, cratima ca despărțitor de cuvinte. Referința e transcrierea FLEURS cu punctuație (coloana a treia din `dev.tsv`). Cifrele se compară ca text: „2015” față de „două mii cincisprezece” contează ca eroare.',
    '',
    '## Rezultate',
    '',
    '| Clip | Durata | Vorbitor | Cuvinte | Substituiri | Ștergeri | Inserări | WER |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rezultate.map((r) => `| \`${r.fisier}\` | ${secunde(r.durata)} | ${VORBITOR[r.gen] ?? 'nespecificat'} | ${r.cuvinte} | ${r.substituiri} | ${r.stergeri} | ${r.inserari} | ${procent(r.wer)} |`),
    `| Total | ${secunde(durata)} | | ${t.cuvinte} | ${rezultate.reduce((s, r) => s + r.substituiri, 0)} | ${rezultate.reduce((s, r) => s + r.stergeri, 0)} | ${rezultate.reduce((s, r) => s + r.inserari, 0)} | ${procent(t.wer)} |`,
    '',
    '## Clip cu clip',
    '',
    ...rezultate.flatMap((r) => [`- \`${r.fisier}\` (${procent(r.wer)})`, `  - Referința: ${curataAfisare(r.referinta)}`, `  - Transcrierea: ${curataAfisare(r.ipoteza)}`]),
    '',
    '## Concluzia',
    '',
    concluzie(t.wer),
    '',
    '## Ce rămâne deschis',
    '',
    limitaEsantion(rezultate),
    '- Common Voice (CC0) nu e în măsurătoare: din octombrie 2025 se descarcă doar prin Mozilla Data Collective, cu cont (verificat pe 2026-10-18).',
    ...(vezi ? [`- Parakeet dă alt text pe fiecare platformă (inferența, nu codificarea: decizia 29). Aceleași clipuri, măsurate pe ${vezi.platforma.nume} la ${vezi.data}: ${procent(vezi.wer)} pe ${vezi.cuvinte}${de(vezi.cuvinte)} cuvinte, în \`${vezi.fisier}\`.`] : []),
    '- FLEURS e vorbire citită, înregistrată curat; vorbirea liberă, filmată cu telefonul, are de obicei o rată mai mare. Verificarea pe clipurile cursanților, cu acordul lor, rămâne pentru primul atelier (spec 7.4).',
    '',
  ];
  return linii.join('\n');
}

function parseazaArgumente(argv) {
  const opt = { n: 5 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--fleurs') opt.fleurs = argv[++i];
    else if (a === '--n') opt.n = Number(argv[++i]);
    else if (a === '--iesire') opt.iesire = argv[++i];
    else if (a === '--doc') opt.doc = argv[++i];
    else if (a === '--vezi-si') opt.veziSi = argv[++i];
    else if (a === '--vezi-doc') opt.veziDoc = argv[++i];
    else if (a === '--din') opt.din = argv[++i];
    else throw new Error(`Opțiune necunoscută: ${a}`);
  }
  if (opt.din) {
    if (!opt.doc || opt.fleurs || opt.iesire) throw new Error('--din <raport.json> merge doar cu --doc <fișier.md> (și, opțional, --vezi-si și --vezi-doc), fără --fleurs și --iesire.');
  } else if (!opt.fleurs || !opt.iesire) throw new Error('Lipsesc --fleurs <folder> sau --iesire <raport.json>.');
  if (!Number.isInteger(opt.n) || opt.n < 3 || opt.n > 5) throw new Error('--n e 3, 4 sau 5 (spec 7.4: 3-5 clipuri).');
  if (Boolean(opt.veziSi) !== Boolean(opt.veziDoc)) throw new Error('--vezi-si și --vezi-doc merg împreună.');
  return opt;
}

/** `vezi` pentru documentMarkdown, din raportul JSON al altei platforme. */
function veziDin(opt) {
  if (!opt.veziSi) return null;
  const alt = JSON.parse(fs.readFileSync(opt.veziSi, 'utf8'));
  return { platforma: alt.platforma ?? PLATFORMA_IMPLICITA, data: alt.data, cuvinte: alt.total.cuvinte, wer: alt.total.wer, fisier: opt.veziDoc };
}

async function main(argv) {
  const opt = parseazaArgumente(argv);
  if (opt.din) {
    const r = JSON.parse(fs.readFileSync(opt.din, 'utf8'));
    fs.writeFileSync(opt.doc, documentMarkdown({ data: r.data, rezultate: r.rezultate, motor: r.motor, platforma: r.platforma ?? PLATFORMA_IMPLICITA, vezi: veziDin(opt) }));
    console.log(`${opt.doc}: refăcut din ${opt.din}, fără măsurătoare nouă`);
    return;
  }
  const { serviciiImplicite } = await import(pathToFileURL(path.join(RADACINA, 'nucleu', 'lib', 'filmare', 'index.mjs')).href);
  const s = await serviciiImplicite(RADACINA);
  if (!s.stareParakeet().instalat) throw new Error('Parakeet nu e instalat: rulează întâi o dată mg nou --sablon overlay-filmare --instaleaza-transcrierea.');
  const randuri = citesteTsvFleurs(fs.readFileSync(path.join(opt.fleurs, 'dev.tsv'), 'utf8'));
  const clipuri = alegeClipuri(randuri, new Set(fs.readdirSync(path.join(opt.fleurs, 'dev'))), opt.n);
  if (clipuri.length < opt.n) throw new Error(`Sunt doar ${clipuri.length} clipuri cu fraze diferite în ${path.join(opt.fleurs, 'dev')}; trebuie ${opt.n}.`);
  const versiuni = JSON.parse(fs.readFileSync(path.join(RADACINA, 'nucleu', 'VERSIUNI.json'), 'utf8'));
  const motor = { runtime: versiuni.transcriere.runtime, versiune: versiuni.transcriere.versiune, model: versiuni.transcriere.model, revizie: versiuni.transcriere.revizie };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-wer-'));
  const rezultate = [];
  try {
    for (const c of clipuri) {
      const mp4 = path.join(tmp, c.fisier.replace(/\.wav$/, '.mp4'));
      execFileSync(s.ff.ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=320x240:r=25', '-i', path.join(opt.fleurs, 'dev', c.fisier),
        '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '48000', '-y', mp4]);
      const { brut } = await s.transcrie(mp4, 'ro');
      const ipoteza = brut.map((w) => w.text).join(' ');
      rezultate.push({ ...c, ipoteza, ...wer(c.referinta, ipoteza) });
      console.log(`${c.fisier}: ${procent(rezultate.at(-1).wer)}`);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  const data = new Date().toISOString().slice(0, 10);
  const platforma = platformaCurenta();
  fs.writeFileSync(opt.iesire, `${JSON.stringify({ data, platforma, motor, total: totalWer(rezultate), rezultate }, null, 2)}\n`);
  if (opt.doc) fs.writeFileSync(opt.doc, documentMarkdown({ data, rezultate, motor, platforma, vezi: veziDin(opt) }));
  const tot = totalWer(rezultate);
  console.log(`Total: ${procent(tot.wer)} pe ${tot.cuvinte}${de(tot.cuvinte)} cuvinte`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
