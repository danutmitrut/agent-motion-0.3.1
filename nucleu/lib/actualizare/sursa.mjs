// Sursa versiunilor noi (felia 6, decizia din 18 oct): ramura stabil a lui origin, adusă cu git.
// E singurul loc care știe de unde vine o versiune nouă; o altă sursă (o arhivă, un server) schimbă doar acest fișier.
// Doar module native: mg actualizeaza merge și când node_modules e stricat.
import { execFile } from 'node:child_process';
import os from 'node:os';
import { eroare, EroareFatala, COD_IESIRE } from '../erori.mjs';

export const RAMURA = 'stabil';
/** Referința locală în care ajunge versiunea adusă; arborele de lucru nu se schimbă la aducere. */
export const REF_NOU = 'refs/remotes/origin/stabil';
// Sub cele 120 s implicite ale uneltei Bash din Claude Code, ca la sondarea Kie (felia 5).
const TERMEN_ADUCERE_MS = 90_000;

/**
 * git în folderul agentului, fără shell și fără întrebări în terminal (Claude Code nu are unde să răspundă la ele).
 * @param {string} radacina
 * @param {string[]} argumente
 * @param {{termenMs?: number}} [optiuni]
 * @returns {Promise<{cod: number|null, stdout: string, stderr: string, lipsa?: boolean}>}
 */
export function git(radacina, argumente, { termenMs = 30_000 } = {}) {
  return new Promise((rezolva) => {
    // hook-urile depozitului nu rulează niciodată din mg (un reference-transaction ar porni chiar la --verifica)
    execFile('git', ['-c', 'core.quotepath=off', '-c', `core.hooksPath=${os.devNull}`, ...argumente], {
      cwd: radacina,
      encoding: 'utf8',
      windowsHide: true,
      timeout: termenMs,
      maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' },
    }, (err, stdout, stderr) => {
      if (err && err.code === 'ENOENT') rezolva({ cod: null, stdout: '', stderr: '', lipsa: true });
      else rezolva({ cod: err ? (typeof err.code === 'number' ? err.code : null) : 0, stdout: stdout ?? '', stderr: stderr ?? '' });
    });
  });
}

/** Prima linie utilă din ieșirea de eroare a lui git, pentru mesaj. */
export function rezumatGit(r) {
  const linii = `${r.stderr}\n${r.stdout}`.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return linii.find((l) => /^(fatal|error|eroare):/i.test(l)) ?? linii[0] ?? 'fără mesaj';
}

/**
 * Aduce ultima versiune a ramurii stabil în REF_NOU, fără să atingă arborele de lucru.
 * @param {string} radacina
 * @returns {Promise<string>} commit-ul versiunii aduse
 */
export async function aduce(radacina) {
  const r = await git(radacina, ['fetch', '--no-tags', 'origin', `+refs/heads/${RAMURA}:${REF_NOU}`], { termenMs: TERMEN_ADUCERE_MS });
  if (r.lipsa) {
    throw new EroareFatala(eroare('actualizare-sursa', 'mediu.git', 'Git nu e instalat sau nu e în PATH.',
      'Pe Windows, cursantul instalează Git for Windows (git-scm.com), apoi repornește Claude Code.'), COD_IESIRE.MEDIU);
  }
  if (r.cod !== 0) {
    const motiv = r.cod === null ? `aducerea a durat peste ${TERMEN_ADUCERE_MS / 1000} s` : rezumatGit(r);
    throw new EroareFatala(eroare('actualizare-sursa', 'mediu.git', `Versiunea nouă nu s-a putut aduce: ${motiv}.`,
      'Verifică legătura la internet și rulează din nou node nucleu/mg.mjs actualizeaza --verifica. Dacă mesajul cere autentificare, cursantul rulează o dată, în terminalul lui, din folderul agentului: git fetch origin stabil.'),
    COD_IESIRE.MEDIU);
  }
  const rev = await git(radacina, ['rev-parse', '--verify', `${REF_NOU}^{commit}`]);
  if (rev.cod !== 0) {
    throw new EroareFatala(eroare('actualizare-sursa', 'mediu.git', `Sursa nu are ramura ${RAMURA}.`,
      'Spune-i lui Dănuț; kitul nu se poate actualiza din această sursă.'), COD_IESIRE.MEDIU);
  }
  return rev.stdout.trim();
}
