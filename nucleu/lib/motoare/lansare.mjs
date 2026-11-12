// Lansarea motoarelor ca procese Node (spec 6.10, 9.4; planul I, I01): execFile(process.execPath, [bin, ...argumente]),
// fără shell și fără npx, cu mediul dat de apelant. Mutat neschimbat din motor-hf.mjs (executa, opresteArboreWindows),
// ca adaptorul Remotion să-l folosească la fel.
import { execFile } from 'node:child_process';
import { inregistreaza, opresteArbore } from '../procese.mjs';

/**
 * Copiază mediul de bază fără cheile date și fără cheile fixate (comparate cu majuscule, pentru Windows),
 * apoi pune valorile fixate.
 * @param {NodeJS.ProcessEnv | undefined} baza
 * @param {string[]} chei numele cheilor de scos, cu majuscule
 * @param {Record<string, string>} fixate
 * @returns {NodeJS.ProcessEnv}
 */
export function mediuFaraChei(baza, chei, fixate) {
  const scoase = new Set([...chei, ...Object.keys(fixate)]);
  const mediu = {};
  for (const [cheie, valoare] of Object.entries(baza ?? {})) {
    if (!scoase.has(cheie.toUpperCase())) mediu[cheie] = valoare;
  }
  return Object.assign(mediu, fixate);
}

/** Windows: oprește arborele procesului copil (taskkill /T /F din procese.mjs); dacă taskkill nu merge, măcar procesul node. */
function opresteArboreWindows(copil) {
  opresteArbore(copil, { platforma: 'win32' });
}

/**
 * Pornește `node <bin> ...argumente` (process.execPath), înregistrat în procese.mjs, și așteaptă ieșirea.
 * @param {string} bin calea absolută a scriptului
 * @param {string[]} argumente
 * @param {{cwd?: string, env: NodeJS.ProcessEnv, timeoutMs: number, platforma?: string, opresteArbore?: (copil: import('node:child_process').ChildProcess) => void}} optiuni
 *   platforma și opresteArbore: doar pentru teste (ramura Windows a termenului depășit, simulată pe macOS)
 * @returns {Promise<{cod: number, stdout: string, stderr: string}>}
 */
export function executaNode(bin, argumente, { cwd, env, timeoutMs, platforma = process.platform, opresteArbore = opresteArboreWindows }) {
  // T9: pe Windows, timeout-ul lui execFile oprește doar procesul node (TerminateProcess, fără arbore), iar Chrome
  // rămâne viu, cu fișierele și folderele lui deschise. Acolo termenul îl ține mg și oprește tot arborele.
  const arbore = platforma === 'win32' && timeoutMs > 0;
  return new Promise((rezolva) => {
    let oprit = false;
    let ceas = null;
    // înregistrat în procese.mjs: la oprirea lui mg (Ctrl+C, eroare, ieșire), motorul se oprește și el
    const copil = inregistreaza(execFile(process.execPath, [bin, ...argumente],
      { cwd, env, windowsHide: true, maxBuffer: 64 * 1024 * 1024, timeout: arbore ? 0 : timeoutMs, encoding: 'utf8' },
      (err, stdout, stderr) => {
        if (ceas) clearTimeout(ceas);
        if (!err) {
          rezolva({ cod: 0, stdout, stderr });
          return;
        }
        const cod = typeof err.code === 'number' ? err.code : 1;
        const peTermen = oprit || err.killed;
        const nota = peTermen ? `\n[mg] oprit după ${timeoutMs} ms` : typeof err.code === 'number' ? '' : `\n[mg] ${err.message}`;
        rezolva({ cod: peTermen && cod === 0 ? 1 : cod, stdout: stdout ?? '', stderr: `${stderr ?? ''}${nota}` });
      }));
    if (arbore) {
      ceas = setTimeout(() => {
        oprit = true;
        opresteArbore(copil);
      }, timeoutMs);
    }
  });
}
