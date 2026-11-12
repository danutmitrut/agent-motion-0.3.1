// mg doctor: ordinea fazelor, raportul, nucleu/.stare.json, USER.md și MEMORY.md, canarul și .instalat.
// Se încarcă înainte de npm ci, deci importurile statice de aici sunt toate fără dependențe npm;
// complet.mjs (care folosește pachetele npm) se încarcă dinamic, după npm ci.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { COD_IESIRE, eroare } from '../erori.mjs';
import { sha256Fisier, scrieJsonAtomic } from '../fisiere.mjs';
import { citesteVersiuni } from '../versiuni.mjs';
import { citesteStare, scrieStare } from '../stare.mjs';
import { verificariBaza } from './baza.mjs';
import { ruleazaNpmCi } from './npm.mjs';
import { DIR_REMOTION, browserRemotion, remotionCerut, stareRemotion } from '../motoare/remotion-instalare.mjs';
import { scrieCanar, confirmaCanar, INSTRUCTIUNE_CANAR } from './canar.mjs';
import { notaDupaActualizare } from '../actualizare/index.mjs';

/**
 * @typedef {{ ok: boolean, faza: 'baza'|'npm'|'complet'|'canar', verificari: import('./baza.mjs').RezultatDoctor[],
 *   erori: import('../erori.mjs').EroareMg[], avertismente: import('../erori.mjs').EroareMg[],
 *   canar: null | { cale: string, instructiune: string }, instalat: boolean, mesaj: string }} RaportDoctor
 */

const DIRURI_NPM = [['nucleu'], ['motoare', 'hyperframes']];
const EXEMPLE = [['USER.exemplu.md', 'USER.md'], ['MEMORY.exemplu.md', 'MEMORY.md']];
const ETICHETE = { ok: 'ok', avertisment: 'avertisment', eroare: 'EROARE', sarit: 'sărit' };

/** @returns {Promise<{cod: number, stdout: string, stderr: string}>} */
function ruleazaImplicit(comanda, argumente, optiuni = {}) {
  return new Promise((rezolva) => {
    execFile(comanda, argumente, {
      cwd: optiuni.cwd,
      env: optiuni.env ?? process.env,
      windowsHide: true,
      maxBuffer: 64 * 1024 * 1024,
      timeout: optiuni.timeoutMs ?? 900000,
    }, (err, stdout, stderr) => {
      const cod = err ? (typeof err.code === 'number' ? err.code : 1) : 0;
      const extra = err && typeof err.code !== 'number' ? `\n${err.message}` : '';
      rezolva({ cod, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') + extra });
    });
  });
}

/** @param {string} text */
function primaVersiune(text) {
  const m = /\d+\.\d+\.\d+/.exec(String(text));
  return m ? m[0] : null;
}

/**
 * claude --version; pe Windows, dacă execFile nu găsește un .exe (ENOENT) sau refuză shim-ul .cmd (EINVAL),
 * reia prin cmd.exe /d /s /c, singura excepție de la regula „fără shell”.
 * @param {string} platforma
 */
async function versiuneClaudeImplicit(platforma) {
  const optiuni = { windowsHide: true, timeout: 15000 };
  const ruleaza = (comanda, argumente) => new Promise((rezolva, respinge) => {
    execFile(comanda, argumente, optiuni, (err, stdout) => (err ? respinge(err) : rezolva(String(stdout))));
  });
  try {
    return primaVersiune(await ruleaza('claude', ['--version']));
  } catch (e) {
    if (platforma === 'win32' && (e.code === 'ENOENT' || e.code === 'EINVAL')) {
      try {
        return primaVersiune(await ruleaza(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'claude --version']));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/** @param {string} radacina @param {{ci?: boolean}} optiuni */
function ctxImplicit(radacina, optiuni) {
  return {
    radacina,
    platforma: process.platform,
    arhitectura: process.arch,
    versiuneNode: process.versions.node,
    acasa: os.homedir(),
    ci: Boolean(optiuni.ci),
    memorieTotala: os.totalmem(),
    spatiuLiber: async () => {
      const s = await fs.promises.statfs(radacina);
      return Number(s.bavail) * Number(s.bsize);
    },
    ruleaza: ruleazaImplicit,
    versiuneClaude: () => versiuneClaudeImplicit(process.platform),
  };
}

/** @param {import('./baza.mjs').RezultatDoctor[]} verificari */
function areEroare(verificari) {
  return verificari.some((r) => r.nivel === 'eroare');
}

/**
 * Motorul Remotion (planul I, decizia 2): cât timp nu e cerut (nici node_modules în motoare/remotion, nici un proiect
 * pe Remotion), doctorul doar spune că se instalează la primul proiect; altfel îl ține la zi ca pe celelalte:
 * npm ci în motoare/remotion, apoi Chrome Headless Shell al lui Remotion, adus doar dacă lipsește.
 * @param {object} ctx CtxDoctor
 * @returns {Promise<import('./baza.mjs').RezultatDoctor[]>}
 */
export async function pasRemotion(ctx) {
  if (!remotionCerut(ctx.radacina)) {
    return [{ id: 'remotion', ok: true, nivel: 'ok', valoare: 'neinstalat (se instalează la primul proiect Remotion, cu acordul cursantului)', eroare: null }];
  }
  const npm = await ruleazaNpmCi(path.join(ctx.radacina, ...DIR_REMOTION), ctx);
  if (npm.nivel === 'eroare') return [npm];
  if (!stareRemotion(ctx.radacina).lipsa.includes('browser')) {
    return [npm, { id: 'chrome-remotion', ok: true, nivel: 'ok', valoare: 'la zi', eroare: null }];
  }
  const b = await browserRemotion(ctx.radacina, ctx.ruleaza);
  if (b.cod === 0) return [npm, { id: 'chrome-remotion', ok: true, nivel: 'ok', valoare: 'adus', eroare: null }];
  const detaliu = String(b.stderr || b.stdout || '').trim().split(/\r?\n/).filter(Boolean).slice(-3).join(' | ') || 'fără mesaj';
  return [npm, {
    id: 'chrome-remotion', ok: false, nivel: 'eroare', valoare: null,
    eroare: eroare('chrome-lipsa', 'mediu.chrome-remotion',
      `remotion browser ensure a ieșit cu codul ${b.cod}: ${detaliu}`,
      'Verifică conexiunea la internet (Chrome Headless Shell al lui Remotion are ~95 MB) și închide programele care țin fișiere deschise în folderul agentului, apoi rulează din nou node nucleu/mg.mjs doctor.'),
  }];
}

/**
 * @param {{ faza: RaportDoctor['faza'], verificari: import('./baza.mjs').RezultatDoctor[], canar?: RaportDoctor['canar'], instalat?: boolean, note?: string[] }} p
 * @returns {RaportDoctor}
 */
function construiesteRaport({ faza, verificari, canar = null, instalat = false, note = [] }) {
  const erori = verificari.filter((r) => r.nivel === 'eroare' && r.eroare).map((r) => r.eroare);
  const avertismente = verificari.filter((r) => r.nivel === 'avertisment' && r.eroare).map((r) => r.eroare);
  const ok = !areEroare(verificari);
  const linii = ['Raportul mg doctor:'];
  for (const r of verificari) {
    linii.push(`- ${r.id}: ${ETICHETE[r.nivel]}${r.valoare === null || r.valoare === undefined ? '' : ` (${r.valoare})`}`);
  }
  if (!ok) linii.push('Doctorul a găsit erori. Repară ce scrie mai jos, apoi rulează din nou: node nucleu/mg.mjs doctor');
  linii.push(...note);
  if (canar) linii.push(canar.instructiune);
  if (instalat) linii.push('Instalarea e completă: am scris marcajul .instalat.');
  return { ok, faza, verificari, erori, avertismente, canar, instalat, mesaj: linii.join('\n') };
}

/** @param {string} radacina */
function sha256Versiuni(radacina) {
  return sha256Fisier(path.join(radacina, 'nucleu', 'VERSIUNI.json'));
}

/**
 * @param {object} ctx
 * @param {import('./baza.mjs').RezultatDoctor[]} verificari
 * @param {boolean} ok
 * @param {import('../stare.mjs').Stare['canar']} canar
 */
function stareNoua(ctx, verificari, ok, canar) {
  const claude = verificari.find((r) => r.id === 'claude');
  return {
    versiune: 1,
    scris_la: new Date().toISOString(),
    platforma: `${ctx.platforma}-${ctx.arhitectura}`,
    node: String(ctx.versiuneNode).replace(/^v/, ''),
    claude_code: claude && claude.nivel === 'ok' ? String(claude.valoare) : null,
    ok,
    verificari,
    canar,
    versiuni_sha256: sha256Versiuni(ctx.radacina),
  };
}

/** USER.md și MEMORY.md din exemple, numai dacă lipsesc (nu suprascrie niciodată fișierele cursantului). */
function copiazaExemple(radacina) {
  for (const [exemplu, tinta] of EXEMPLE) {
    const sursa = path.join(radacina, exemplu);
    const destinatie = path.join(radacina, tinta);
    if (!fs.existsSync(destinatie) && fs.existsSync(sursa)) fs.copyFileSync(sursa, destinatie, fs.constants.COPYFILE_EXCL);
  }
}

/**
 * --confirma-canar: confirmă canarul, actualizează starea și scrie .instalat dacă restul stării e verde,
 * complet (cu randarea de probă reușită) și făcut pe VERSIUNI.json curent.
 * @param {string} radacina
 * @returns {Promise<{cod: number, raport: RaportDoctor}>}
 */
async function confirmaDoar(radacina) {
  const stare = citesteStare(radacina);
  const canar = confirmaCanar(radacina, stare);
  if (!stare) {
    return { cod: COD_IESIRE.MEDIU, raport: construiesteRaport({ faza: 'canar', verificari: [canar] }) };
  }
  const acum = new Date().toISOString();
  const restul = stare.verificari.filter((r) => r.id !== 'canar');
  const completa = restul.some((r) => r.id === 'randare-proba' && r.nivel === 'ok');
  // O rulare --ci sare verificarea Claude Code (și nu scrie canarul), deci starea ei nu poate duce la .instalat (F13).
  const claudeVerificat = restul.some((r) => r.id === 'claude' && r.nivel === 'ok');
  const aceeasiVersiune = stare.versiuni_sha256 === sha256Versiuni(radacina);
  const restulVerde = !areEroare(restul) && completa && aceeasiVersiune && claudeVerificat;
  const rezultatCanar = canar.ok && !restulVerde
    ? {
      id: 'canar', ok: false, nivel: 'eroare', valoare: 'neatins',
      eroare: eroare('canar-nefacut', 'mediu.canar',
        claudeVerificat
          ? 'Canarul e neatins, dar nucleu/.stare.json nu e al unei rulări complete și verzi a doctorului pe versiunea curentă a kitului.'
          : 'Canarul e neatins, dar nucleu/.stare.json e scris de o rulare cu --ci, care nu verifică versiunea Claude Code.',
        'Rulează node nucleu/mg.mjs doctor (fără --ci), fă testul canar cerut (inclusiv scrierea prin terminal), apoi node nucleu/mg.mjs doctor --confirma-canar.'),
    }
    : canar;
  const verificari = [...restul, rezultatCanar];
  const instalat = canar.ok && restulVerde;
  scrieStare(radacina, {
    ...stare,
    scris_la: acum,
    ok: instalat,
    verificari,
    canar: stare.canar ? { ...stare.canar, confirmat: canar.ok, confirmat_la: canar.ok ? acum : null } : null,
  });
  if (instalat) {
    scrieJsonAtomic(path.join(radacina, '.instalat'), { versiune: 1, instalat_la: acum, versiuni_sha256: stare.versiuni_sha256 });
  }
  return {
    cod: instalat ? COD_IESIRE.OK : COD_IESIRE.MEDIU,
    raport: construiesteRaport({ faza: 'canar', verificari, instalat }),
  };
}

/**
 * Ordinea (harta 4.11): verificariBaza (oprire la prima eroare) → npm ci în nucleu/ și motoare/hyperframes/
 * → verificariComplete → USER.md și MEMORY.md → canarul (fără --ci) → nucleu/.stare.json.
 * O rulare completă rescrie canarul, deci .instalat apare numai după --confirma-canar; cu --ci nu apare deloc.
 * @param {{ radacina: string, optiuni?: {ci?: boolean, confirmaCanar?: boolean, json?: boolean}, ctx?: object }} p
 * @returns {Promise<{cod: number, raport: RaportDoctor}>}
 */
export async function comandaDoctor({ radacina, optiuni = {}, ctx: partial = {} }) {
  if (optiuni.confirmaCanar) return confirmaDoar(radacina);
  const versiuni = citesteVersiuni(radacina);
  const ctx = { ...ctxImplicit(radacina, optiuni), ...partial, versiuni };
  const verificari = [];
  /** @type {RaportDoctor['faza']} */
  let faza = 'baza';
  verificari.push(...(await verificariBaza(ctx)));
  if (!areEroare(verificari)) {
    faza = 'npm';
    for (const parti of DIRURI_NPM) {
      const r = await ruleazaNpmCi(path.join(radacina, ...parti), ctx);
      verificari.push(r);
      if (r.nivel === 'eroare') break;
    }
    if (!areEroare(verificari)) verificari.push(...(await pasRemotion(ctx)));
  }
  if (!areEroare(verificari)) {
    faza = 'complet';
    const { verificariComplete } = await import('./complet.mjs');
    verificari.push(...(await verificariComplete(ctx)));
  }
  const ok = !areEroare(verificari);
  let stareCanar = citesteStare(radacina)?.canar ?? null;
  let canar = null;
  if (ok) {
    copiazaExemple(radacina);
    if (!ctx.ci) {
      const acum = new Date();
      const scris = scrieCanar(radacina, acum);
      stareCanar = { scris_la: acum.toISOString(), sha256: scris.sha256, confirmat: false, confirmat_la: null };
      canar = { cale: scris.cale, instructiune: INSTRUCTIUNE_CANAR };
    }
  }
  scrieStare(radacina, stareNoua(ctx, verificari, ok, stareCanar));
  // felia 6: pică imediat după mg actualizeaza, deci revenirea e o opțiune
  const nota = ok ? null : notaDupaActualizare(radacina);
  return {
    cod: ok ? COD_IESIRE.OK : COD_IESIRE.MEDIU,
    raport: construiesteRaport({ faza, verificari, canar, note: nota ? [nota] : [] }),
  };
}
