// nucleu/VERSIUNI.json: versiunile fixate, sha256-urile binarelor și integritatea kitului (harta 5.15).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { citesteJson, sha256Fisier, existaFisier } from './fisiere.mjs';

const CALE_VERSIUNI = 'nucleu/VERSIUNI.json';
const DIRURI_URMARITE = ['nucleu', 'motoare', 'biblioteci', '.claude'];
// Fișierele cursantului din aceste foldere (ignorate de git, harta 3) și gunoiul de sistem.
const EXCLUSE = new Set([CALE_VERSIUNI, 'nucleu/.stare.json', 'nucleu/.canar', 'nucleu/.canar-refuzuri', 'nucleu/.actualizare.json', '.claude/settings.local.json']);
const NUME_EXCLUSE = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);

function pastreaza(relativ) {
  if (EXCLUSE.has(relativ)) return false;
  const bucati = relativ.split('/');
  if (bucati.includes('node_modules')) return false;
  return !NUME_EXCLUSE.has(bucati[bucati.length - 1]);
}

export function citesteVersiuni(radacina) {
  return citesteJson(path.join(radacina, CALE_VERSIUNI), `fisier:${CALE_VERSIUNI}`);
}

function dinGit(radacina) {
  try {
    const optiuni = { cwd: radacina, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] };
    // Doar dacă radacina e chiar rădăcina unui depozit git (prefixul e gol).
    if (execFileSync('git', ['rev-parse', '--show-prefix'], optiuni).trim() !== '') return null;
    const iesire = execFileSync('git', ['ls-files', '-z', '--', ...DIRURI_URMARITE], optiuni);
    return iesire.split('\0').filter(Boolean);
  } catch {
    return null; // fără git sau în afara unui depozit
  }
}

function parcurge(radacina, relativ, rezultat) {
  const absolut = path.join(radacina, relativ);
  if (!fs.existsSync(absolut)) return;
  for (const intrare of fs.readdirSync(absolut, { withFileTypes: true })) {
    const copil = relativ ? `${relativ}/${intrare.name}` : intrare.name;
    if (intrare.isDirectory()) {
      if (intrare.name !== 'node_modules') parcurge(radacina, copil, rezultat);
    } else if (intrare.isFile()) {
      rezultat.push(copil);
    }
  }
}

/** Căile relative, cu '/', ale fișierelor acoperite de integritate, sortate. */
export function fisiereUrmarite(radacina) {
  let cai = dinGit(radacina);
  if (cai === null) {
    cai = [];
    for (const dir of DIRURI_URMARITE) parcurge(radacina, dir, cai);
  }
  return [...new Set(cai.map((c) => c.replace(/\\/g, '/')))].filter(pastreaza).sort();
}

/** {cale: sha256} pentru fiecare fișier urmărit care există pe disc. */
export function calculeazaIntegritate(radacina) {
  const integritate = {};
  for (const relativ of fisiereUrmarite(radacina)) {
    const absolut = path.join(radacina, ...relativ.split('/'));
    if (existaFisier(absolut)) integritate[relativ] = sha256Fisier(absolut);
  }
  return integritate;
}

/** Compară discul cu versiuni.integritate: {ok, diferite, lipsa}, căi sortate. */
export function verificaIntegritate(radacina, versiuni) {
  const diferite = [];
  const lipsa = [];
  for (const [relativ, asteptat] of Object.entries(versiuni.integritate ?? {})) {
    const absolut = path.join(radacina, ...relativ.split('/'));
    if (!existaFisier(absolut)) lipsa.push(relativ);
    else if (sha256Fisier(absolut) !== asteptat) diferite.push(relativ);
  }
  diferite.sort();
  lipsa.sort();
  return { ok: diferite.length === 0 && lipsa.length === 0, diferite, lipsa };
}
