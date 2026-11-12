// Rulează nucleu/garda.mjs ca subproces, exact cum îl pornește Claude Code: node <garda>, JSON pe stdin.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const GARDA = fileURLToPath(new URL('../../nucleu/garda.mjs', import.meta.url));

/**
 * @param {object|string} intrare obiectul hook-ului sau textul brut (de exemplu '' sau JSON stricat)
 * @param {{ radacina?: string, env?: object }} [optiuni]
 * @returns {Promise<{cod: number, stdout: string, stderr: string, json: object|null}>}
 */
export async function ruleazaGarda(intrare, { radacina, env = {} } = {}) {
  const text = typeof intrare === 'string' ? intrare : JSON.stringify(intrare);
  const mediu = { ...process.env, ...env };
  if (radacina !== undefined) mediu.CLAUDE_PROJECT_DIR = radacina;
  return new Promise((rezolva, respinge) => {
    const proces = spawn(process.execPath, [GARDA], { env: mediu, windowsHide: true });
    let stdout = '';
    let stderr = '';
    proces.stdout.setEncoding('utf8').on('data', (d) => { stdout += d; });
    proces.stderr.setEncoding('utf8').on('data', (d) => { stderr += d; });
    proces.on('error', respinge);
    proces.on('close', (cod) => {
      let json = null;
      try {
        json = stdout.trim() ? JSON.parse(stdout) : null;
      } catch {
        json = null;
      }
      rezolva({ cod, stdout, stderr, json });
    });
    proces.stdin.on('error', () => {});
    proces.stdin.end(text, 'utf8');
  });
}
