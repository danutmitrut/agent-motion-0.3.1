// Cheia Kie a cursantului, prin nucleu/cheie.py și keyring (spec 5.9, decizia lui Dănuț din 2026-10-26: rămâne Python).
// Python-ul de sistem face doar mediul izolat unelte/python/ (ignorat de git), unde stă keyring; așa nu atingem
// pachetele sistemului (pe Mac, Python din Homebrew refuză pip install --user) și nu cerem drepturi de administrator.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export const KEYRING = 'keyring==25.7.0';
const TERMEN_MS = 30000;
// Python izolat: fără variabilele PYTHON* (un PYTHONPATH plantat ar încărca alt keyring), fără folderul curent sau al
// scriptului în sys.path și fără pachetele din contul utilizatorului; -X utf8 ține locul lui PYTHONUTF8, ignorat sub -I.
export const IZOLAT = ['-I', '-X', 'utf8'];

/** Cheia nu se poate citi din alt motiv decât lipsa ei (seiful nu răspunde, keyring stricat, termen depășit). */
export class SeifIndisponibil extends Error {
  constructor(mesaj) {
    super(mesaj);
    this.name = 'SeifIndisponibil';
  }
}

function mediuFaraPython() {
  return Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^python/i.test(k)));
}

/** @returns {Promise<{cod: number, stdout: string, stderr: string}>} */
export function ruleazaImplicit(comanda, argumente, { timeoutMs = TERMEN_MS, cwd } = {}) {
  return new Promise((rezolva) => {
    execFile(comanda, argumente, {
      cwd,
      env: mediuFaraPython(),
      windowsHide: true,
      timeout: timeoutMs,
      maxBuffer: 16 * 1024 * 1024,
    }, (err, stdout, stderr) => {
      // -1 când procesul n-a ieșit singur (termen depășit, oprit, negăsit): nu se confundă cu codul 1, cheie lipsă
      const cod = err ? (typeof err.code === 'number' ? err.code : -1) : 0;
      rezolva({ cod, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') + (err && typeof err.code !== 'number' ? `\n${err.message}` : '') });
    });
  });
}

/** Executabilul Python din mediul izolat al agentului. */
export function pythonMediu(radacina, platforma = process.platform) {
  return platforma === 'win32'
    ? join(radacina, 'unelte', 'python', 'Scripts', 'python.exe')
    : join(radacina, 'unelte', 'python', 'bin', 'python');
}

/**
 * Python 3 de sistem, doar ca să facă mediul izolat. Pe Windows, întâi lansatorul py (instalatorul de pe python.org),
 * apoi python; aliasul din Microsoft Store iese cu eroare sau fără versiune, deci pică testul.
 * @returns {Promise<string[] | null>} comanda și argumentele de început
 */
export async function gasestePython({ platforma = process.platform, ruleaza = ruleazaImplicit } = {}) {
  const candidati = platforma === 'win32' ? [['py', '-3'], ['python'], ['python3']] : [['python3'], ['python']];
  for (const [cmd, ...pre] of candidati) {
    const r = await ruleaza(cmd, [...pre, ...IZOLAT, '-c', 'import sys, venv; print(sys.version_info[0], sys.version_info[1])'], { timeoutMs: 15000 });
    const m = /^(\d+) (\d+)/.exec(r.stdout.trim());
    if (r.cod === 0 && m && Number(m[1]) === 3 && Number(m[2]) >= 9) return [cmd, ...pre];
  }
  return null;
}

/**
 * Starea generării, fără să schimbe nimic: Python, mediul izolat cu keyring, cheia Kie (doar da sau nu).
 * seif = motivul, când seiful n-a răspuns limpede (altceva decât da sau nu); atunci cheie e false.
 * @returns {Promise<{python: string[] | null, keyring: boolean, cheie: boolean, seif?: string}>}
 */
export async function stareGenerare(radacina, { platforma = process.platform, ruleaza = ruleazaImplicit } = {}) {
  const py = pythonMediu(radacina, platforma);
  let keyring = false;
  if (existsSync(py)) {
    const r = await ruleaza(py, [...IZOLAT, '-c', 'import keyring; print("ok")']);
    keyring = r.cod === 0 && r.stdout.trim() === 'ok';
  }
  const python = keyring ? [py] : await gasestePython({ platforma, ruleaza });
  let cheie = false;
  let seif;
  if (keyring) {
    const r = await ruleaza(py, [...IZOLAT, join(radacina, 'nucleu', 'cheie.py'), 'verifica', 'kie']);
    cheie = r.cod === 0 && r.stdout.trim() === 'da';
    if (!cheie && r.cod !== 1) seif = `cheie.py verifica a ieșit cu codul ${r.cod}: ${ultimeleRanduri(r)}`;
  }
  return seif ? { python, keyring, cheie, seif } : { python, keyring, cheie };
}

/**
 * Face mediul izolat și pune keyring în el (după acordul cursantului, prin mg doctor --generare --instaleaza-keyring).
 * @returns {Promise<{ok: boolean, detaliu: string}>}
 */
export async function instaleazaKeyring(radacina, python, { platforma = process.platform, ruleaza = ruleazaImplicit } = {}) {
  const dir = join(radacina, 'unelte', 'python');
  const [cmd, ...pre] = python;
  const py = pythonMediu(radacina, platforma);
  // un mediu rămas stricat (Python-ul de sistem mutat sau șters după ce l-am făcut) se reface de la zero
  const merge = existsSync(py) && (await ruleaza(py, [...IZOLAT, '-c', 'pass'])).cod === 0;
  if (!merge) {
    const v = await ruleaza(cmd, [...pre, ...IZOLAT, '-m', 'venv', '--clear', dir], { timeoutMs: 180000 });
    if (v.cod !== 0) return { ok: false, detaliu: `python -m venv a ieșit cu codul ${v.cod}: ${ultimeleRanduri(v)}` };
  }
  const p = await ruleaza(py, [...IZOLAT, '-m', 'pip', 'install', '--disable-pip-version-check', '--no-input', KEYRING], { timeoutMs: 300000 });
  if (p.cod !== 0) return { ok: false, detaliu: `pip install ${KEYRING} a ieșit cu codul ${p.cod}: ${ultimeleRanduri(p)}` };
  return { ok: true, detaliu: `${KEYRING} în unelte/python/` };
}

function ultimeleRanduri(r) {
  return String(r.stderr || r.stdout || '').trim().split(/\r?\n/).filter(Boolean).slice(-3).join(' | ') || 'fără mesaj';
}

/**
 * Cheia Kie, citită din seif; stă doar în memorie și nu se afișează niciodată.
 * @returns {Promise<string | null>} null dacă lipsește
 * @throws {SeifIndisponibil} dacă seiful n-a răspuns limpede; mesajul nu conține ieșirea standard (ar putea fi cheia)
 */
export async function citesteCheie(radacina, { platforma = process.platform, ruleaza = ruleazaImplicit } = {}) {
  const py = pythonMediu(radacina, platforma);
  if (!existsSync(py)) return null;
  const r = await ruleaza(py, [...IZOLAT, join(radacina, 'nucleu', 'cheie.py'), 'citeste', 'kie']);
  if (r.cod === 1) return null;
  if (r.cod !== 0) throw new SeifIndisponibil(`cheie.py citeste a ieșit cu codul ${r.cod}: ${ultimeleRanduri({ stderr: r.stderr })}`);
  const valoare = r.stdout.trim();
  return valoare === '' ? null : valoare;
}

/** Comanda pe care cursantul o rulează singur, în terminalul lui, ca să pună cheia (nu prin chat). */
export function comandaPuneCheie(platforma = process.platform) {
  return platforma === 'win32'
    ? '.\\unelte\\python\\Scripts\\python.exe nucleu\\cheie.py pune kie'
    : 'unelte/python/bin/python nucleu/cheie.py pune kie';
}
