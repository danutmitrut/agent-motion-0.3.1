// Felia 4: stilul privat al unui brand (desenele traseu, culorile, fonturile, semnătura) nu ajunge în repo.
// Partea întâi rulează peste tot (și în CI): nimic sub branduri/ sau proprii/, nicio piesă traseu în fișierele urmărite,
// exemplele fără brand și amprentele cunoscute ale stilului lui Dănuț absente din livrare. Partea a doua rulează doar
// unde există folderul unui brand (pe Mac-ul lui Dănuț): niciun fișier urmărit nu conține ceva din el.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { citesteBrand } from '../../nucleu/lib/brand.mjs';

const RADACINA = fileURLToPath(new URL('../../', import.meta.url));
// urmărite de git și cele noi, încă neadăugate, dar neignorate (un `git add .` le-ar lua pe toate)
const URMARITE = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: RADACINA, encoding: 'utf8', maxBuffer: 1 << 28 })
  .split('\0')
  .filter((f, i, toate) => f && toate.indexOf(f) === i && existsSync(join(RADACINA, f)));
// fișierele text; și cele fără extensie (LICENSE, scripturi), în afară de cele din foldere ascunse
const TEXT = /(\.(json|js|mjs|cjs|mts|cts|html|css|md|svg|txt|yml|yaml|py|toml|tsx|ts|ps1|sh|csv|srt|vtt|xml)|(^|\/)[^./]+)$/i;
// Doar fișierele de test (*.test.*) scriu amprentele, ca să le caute; golden-urile și fixture-urile sunt verificate.
const LIVRARE = (f) => !/\.test\.[cm]?js$/.test(f) && !f.includes('node_modules/') && !f.startsWith('motoare/hyperframes/referinta/');

// Amprentele stilului lui Dănuț (kit/linia-continua/STIL.md), scrise în bucăți ca fișierul să nu se găsească singur.
const AMPRENTE = [
  ['#0A0B', '0E'], ['#E08A', '5E'], ['#EDE6', 'DA'], ['C084', 'FC'], ['4ECD', 'C4'],
  ['rgba(192,132', ',252'], ['rgba(78,205', ',196'], ['Personality and', ' Cognitive'], ['Unde se', ' întâlnesc'],
].map((p) => p.join('').toLowerCase());

const citeste = (f) => readFileSync(join(RADACINA, f), 'utf8');
const esteTraseu = (d) => d !== null && typeof d === 'object' && Array.isArray(d.paths) && 'w' in d && 'h' in d;
/** Un traseu oriunde în structură (și imbricat, ca într-un catalog sau o listă de desene). */
const areTraseu = (d) => esteTraseu(d) || (d !== null && typeof d === 'object' && Object.values(d).some(areTraseu));
// un traseu scris direct într-un fișier text (index.html cu desenele în <script>): "paths": ["M...
const TRASEU_IN_TEXT = /"paths"\s*:\s*\[\s*"M\s*-?\d/;

test('nimic urmărit de git sub branduri/ sau proprii/, iar .gitignore le ignoră', () => {
  assert.deepEqual(URMARITE.filter((f) => f.startsWith('branduri/') || f.startsWith('proprii/')), []);
  const ignorate = citeste('.gitignore').split('\n').map((l) => l.trim());
  assert.ok(ignorate.includes('/branduri/'));
  assert.ok(ignorate.includes('/proprii/'));
});

test('niciun fișier urmărit nu are forma unui traseu ({w, h, paths}), nici imbricat, iar catalogul nu are piese traseu', () => {
  const trasee = [];
  for (const f of URMARITE.filter((x) => LIVRARE(x) && TEXT.test(x))) {
    const text = citeste(f);
    if (f.endsWith('.json')) {
      let d = null;
      try { d = JSON.parse(text); } catch { /* nu e JSON valid: îl prinde doar căutarea în text */ }
      if (areTraseu(d)) { trasee.push(f); continue; }
    }
    if (TRASEU_IN_TEXT.test(text)) trasee.push(f);
  }
  assert.deepEqual(trasee, []);
  const catalog = JSON.parse(citeste('biblioteci/catalog.json'));
  assert.deepEqual(catalog.piese.filter((p) => p.tip === 'traseu' || p.familie === 'traseu').map((p) => p.id), []);
});

test('exemplele șabloanelor nu folosesc niciun brand', () => {
  const cuBrand = URMARITE.filter((f) => /\/exemple\/.*\.json$/.test(f))
    .filter((f) => { try { return typeof JSON.parse(citeste(f)).brand === 'string'; } catch { return false; } });
  assert.deepEqual(cuBrand, []);
});

test('amprentele stilului lui Dănuț lipsesc din livrare (culorile, ceața, semnătura, finalul)', () => {
  const gasite = [];
  let citite = 0;
  for (const f of URMARITE.filter((x) => LIVRARE(x) && TEXT.test(x))) {
    const text = citeste(f).toLowerCase();
    citite += 1;
    for (const a of AMPRENTE) if (text.includes(a)) gasite.push(`${f}: ${a}`);
  }
  assert.deepEqual(gasite, []);
  assert.ok(citite > 100, `s-au citit doar ${citite} fișiere`);
});

// Partea locală: fișierele fiecărui brand prezent (pe Mac-ul lui Dănuț, branduri/danut/).
const DIR_BRANDURI = join(RADACINA, 'branduri');
const branduri = existsSync(DIR_BRANDURI) ? readdirSync(DIR_BRANDURI).filter((b) => statSync(join(DIR_BRANDURI, b)).isDirectory()) : [];

function fisiereBrand(dir) {
  const rezultat = [];
  for (const nume of readdirSync(dir)) {
    const cale = join(dir, nume);
    if (statSync(cale).isDirectory()) rezultat.push(...fisiereBrand(cale));
    else rezultat.push(cale);
  }
  return rezultat;
}

// Ce e deja public în repo nu e amprentă: culorile temelor livrate, id-urile și familiile fonturilor din catalog.
function publice() {
  const valori = new Set();
  const teme = join(RADACINA, 'motoare', 'comun', 'teme');
  for (const f of readdirSync(teme)) for (const h of readFileSync(join(teme, f), 'utf8').match(/#[0-9a-f]{6}/gi) ?? []) valori.add(h.toLowerCase());
  const fonturi = join(RADACINA, 'motoare', 'comun', 'fonturi');
  for (const id of readdirSync(fonturi)) {
    valori.add(id.toLowerCase());
    const info = join(fonturi, id, 'font.json');
    if (existsSync(info)) valori.add(String(JSON.parse(readFileSync(info, 'utf8')).familie).toLowerCase());
  }
  return valori;
}

/** Valorile din frontmatter-ul fișei (culori, ceață, fonturi, semnătură, personaj), fără cele deja publice. */
function valoriFisa(brand) {
  if (!existsSync(join(DIR_BRANDURI, brand, 'vizual.md'))) return [];
  const pub = publice();
  // numele autorilor repo-ului (din git) apar legitim ca autor sau sursă; nu sunt o amprentă a stilului
  for (const nume of execFileSync('git', ['log', '--format=%an'], { cwd: RADACINA, encoding: 'utf8' }).split('\n')) {
    if (nume.trim() !== '') pub.add(nume.trim().toLowerCase());
  }
  const valori = [];
  const strange = (v) => {
    if (typeof v === 'string') {
      // semnătura și personajul pe rânduri; prefixe scurte („// ”) sunt prea comune ca să fie amprente
      for (const rand of v.split('\n').map((x) => x.trim())) {
        const hex = /^#[0-9a-f]{6}$/i.test(rand);
        if ((hex || rand.length >= 8) && !pub.has(rand.toLowerCase())) valori.push(rand);
      }
    } else if (v !== null && typeof v === 'object') Object.values(v).forEach(strange);
  };
  const { dir: _dir, nume: _nume, mg: _mg, tema: _tema, ...fisa } = citesteBrand(RADACINA, brand);
  // calea fontului e rescrisă de citesteBrand (branduri/<nume>/...); numele fișierului e cel care contează
  for (const rol of ['font_titlu', 'font_text']) if (fisa[rol]?.fisier) fisa[rol] = { ...fisa[rol], fisier: fisa[rol].fisier.split('/').pop() };
  strange(fisa);
  return valori;
}

test('niciun fișier urmărit nu conține ceva din folderele de brand (rulează doar unde există branduri/)', { skip: branduri.length === 0 && 'nu există branduri/ aici' }, () => {
  const sha = (buf) => createHash('sha256').update(buf).digest('hex');
  const hashuriUrmarite = new Map(URMARITE.map((f) => [sha(readFileSync(join(RADACINA, f))), f]));
  const texte = URMARITE.filter((f) => LIVRARE(f) && TEXT.test(f)).map((f) => [f, citeste(f)]);
  const gasite = [];
  for (const brand of branduri) {
    const fragmente = new Set();
    for (const cale of fisiereBrand(join(DIR_BRANDURI, brand))) {
      const continut = readFileSync(cale);
      const copie = hashuriUrmarite.get(sha(continut));
      if (copie) gasite.push(`${copie} e o copie a ${cale}`);
      if (!cale.endsWith('.json')) continue;
      let d;
      try { d = JSON.parse(continut.toString('utf8')); } catch { continue; }
      if (esteTraseu(d)) for (const p of d.paths) if (p.length >= 40) fragmente.add(p.slice(0, 40));
      for (const p of d.piese ?? []) if (typeof p.id === 'string') fragmente.add(p.id);
    }
    for (const v of valoriFisa(brand)) fragmente.add(v);
    for (const [f, text] of texte) for (const fr of fragmente) if (text.toLowerCase().includes(fr.toLowerCase())) gasite.push(`${f}: o valoare din branduri/${brand}/ (${fr.length} caractere)`);
  }
  assert.deepEqual(gasite, []);
});
