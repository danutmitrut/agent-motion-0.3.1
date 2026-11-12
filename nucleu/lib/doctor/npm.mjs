// npm ci pentru nucleu/ și motoare/hyperframes/, fără shell și fără npm.cmd. Doar module native.
import fs from 'node:fs';
import path from 'node:path';
import { eroare, EroareFatala } from '../erori.mjs';

/** @param {string} cale */
function existaFisier(cale) {
  try {
    return fs.statSync(cale).isFile();
  } catch {
    return false;
  }
}

/** @param {string} cale */
function caleReala(cale) {
  try {
    return fs.realpathSync(cale);
  } catch {
    return null;
  }
}

/**
 * Găsește npm-cli.js, ca npm să pornească cu execFile(process.execPath, [npmCli, ...]).
 * Ordinea: npm_execpath (dacă e npm-cli.js); <dir node>/node_modules/npm/bin/npm-cli.js (Windows, ca npm.cmd);
 * <dir node>/../lib/node_modules/npm/bin/npm-cli.js (instalatorul oficial pe Mac și Linux);
 * <dir node>/npm, rezolvat prin symlink, dacă duce la npm-cli.js (Homebrew).
 * @param {string} [execPath]
 * @param {string} [platforma]
 * @returns {string}
 */
export function rezolvaNpmCli(execPath = process.execPath, platforma = process.platform) {
  const dir = path.dirname(execPath);
  const candidati = [];
  const dinMediu = process.env.npm_execpath;
  if (dinMediu && /npm-cli\.js$/i.test(dinMediu)) candidati.push(dinMediu);
  if (platforma === 'win32') {
    candidati.push(path.join(dir, 'node_modules', 'npm', 'bin', 'npm-cli.js'));
  } else {
    candidati.push(path.join(dir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'));
    const prinLegatura = caleReala(path.join(dir, 'npm'));
    if (prinLegatura && /npm-cli\.js$/.test(prinLegatura)) candidati.push(prinLegatura);
  }
  for (const c of candidati) {
    if (existaFisier(c)) return path.resolve(c);
  }
  throw new EroareFatala(eroare('npm-ci-esuat', 'mediu.npm',
    `Nu găsesc npm-cli.js lângă Node (${execPath}).`,
    `Reinstalează ${platforma === 'win32' ? 'Node 24 LTS' : 'Node 22 LTS'} de pe nodejs.org (instalatorul include npm), apoi rulează din nou node nucleu/mg.mjs doctor.`));
}

/** @param {string} cale */
function citesteJson(cale) {
  try {
    return JSON.parse(fs.readFileSync(cale, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * node_modules/.package-lock.json (scris de npm la instalare) e „la zi” față de package-lock.json dacă:
 * are același nume și lockfileVersion; fiecare pachet din el are exact aceeași intrare în package-lock.json;
 * fiecare pachet din package-lock.json care lipsește din el e marcat optional (binarele altor platforme).
 * Verificat pe npm 11.12.1: fișierul ascuns nu are intrarea rădăcinii ("") și nici pachetele opționale neinstalate.
 * @param {string} dir
 */
export function instalareLaZi(dir) {
  const lock = citesteJson(path.join(dir, 'package-lock.json'));
  const ascuns = citesteJson(path.join(dir, 'node_modules', '.package-lock.json'));
  if (!lock || !ascuns || !lock.packages || !ascuns.packages) return false;
  if (lock.name !== ascuns.name || lock.lockfileVersion !== ascuns.lockfileVersion) return false;
  for (const [cheie, intrare] of Object.entries(ascuns.packages)) {
    if (!Object.hasOwn(lock.packages, cheie)) return false;
    if (JSON.stringify(lock.packages[cheie]) !== JSON.stringify(intrare)) return false;
  }
  for (const [cheie, intrare] of Object.entries(lock.packages)) {
    if (cheie === '') continue;
    if (!Object.hasOwn(ascuns.packages, cheie) && intrare.optional !== true) return false;
  }
  return true;
}

// Pachete al căror binar vine din scriptul install, nu din tarball (F12): ffmpeg-static descarcă ffmpeg de pe GitHub.
// .package-lock.json nu știe dacă scriptul a rulat, deci instalarea e „la zi” doar cu binarul pe disc.
const BINARE_DIN_INSTALL = [{ pachet: 'node_modules/ffmpeg-static', binar: 'ffmpeg' }];

/**
 * Binarele cerute de package-lock.json din dir care lipsesc de pe disc, ca și căi relative la dir.
 * @param {string} dir
 * @param {string} platforma
 * @returns {string[]}
 */
function binareLipsa(dir, platforma) {
  const lock = citesteJson(path.join(dir, 'package-lock.json'));
  const exe = platforma === 'win32' ? '.exe' : '';
  const lipsa = [];
  for (const { pachet, binar } of BINARE_DIN_INSTALL) {
    const intrare = lock?.packages?.[pachet];
    if (!intrare || intrare.optional === true) continue;
    const relativ = `${pachet}/${binar}${exe}`;
    if (!existaFisier(path.join(dir, ...relativ.split('/')))) lipsa.push(relativ);
  }
  return lipsa;
}

/** @param {string} text */
function ultimeleLinii(text, n = 3) {
  return String(text).trim().split(/\r?\n/).filter(Boolean).slice(-n).join(' | ');
}

const PREFIX_EROARE_NPM = /^npm (?:error|ERR!)(?:\s|$)/;
const CAMP_NPM = /^(?:code|errno|syscall|path) \S/;
// „Error: ...” sau „<Nume>Error: ...” (TypeError, FetchError): excepția adevărată, nu „command failed” al lui npm.
const EXCEPTIE = /^\w*Error: /;

/**
 * Rezumatul erorii npm (F16): code, errno, syscall și path, prima linie cu cauza (fără stack și fără câmpurile
 * obiectului de eroare; prima linie „Error:” sau „<Nume>Error:” are prioritate, apoi prima linie rămasă) și calea
 * jurnalului complet. npm 10/11 încheie mereu cu sfatul generic și cu jurnalul, deci ultimele linii pierd codul.
 * Un text fără linii „npm error” păstrează ultimele 3 linii, ca înainte.
 * @param {string} text
 */
function rezumatNpm(text) {
  const randuri = String(text ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const linii = randuri.filter((l) => PREFIX_EROARE_NPM.test(l)).map((l) => l.replace(PREFIX_EROARE_NPM, '').trim()).filter(Boolean);
  if (linii.length === 0) return ultimeleLinii(text);
  const campuri = linii.filter((l) => CAMP_NPM.test(l));
  const jurnal = linii.find((l) => /A complete log of this run/i.test(l));
  const candidate = linii.filter((l) => !CAMP_NPM.test(l) && l !== jurnal && !/^at\s/.test(l) && !/^[{}]/.test(l) && !/^[a-z]\w*: .*,$/.test(l));
  // La un script install eșuat, prima linie de cauză e „command failed”, iar excepția (de exemplu ENOTFOUND) vine după ea.
  const cauza = candidate.find((l) => EXCEPTIE.test(l)) ?? candidate[0];
  // O linie fără prefixul npm la final (de exemplu mesajul de timeout adăugat de ruleaza) se păstrează.
  const ultima = randuri.at(-1);
  const coada = ultima && !/^npm\s/.test(ultima) ? ultima : null;
  return [...new Set([...campuri, cauza, jurnal, coada].filter(Boolean))].join(' | ');
}

/**
 * Rulează npm ci în dir, cu ctx.ruleaza, sau îl sare dacă instalarea e deja la zi.
 * @param {string} dir absolut
 * @param {object} ctx CtxDoctor
 * @returns {Promise<import('./baza.mjs').RezultatDoctor>}
 */
export async function ruleazaNpmCi(dir, ctx) {
  const relativ = path.relative(ctx.radacina, dir).split(path.sep).join('/');
  const id = `npm-ci:${relativ}`;
  const camp = `mediu.${id}`;
  if (instalareLaZi(dir) && binareLipsa(dir, ctx.platforma).length === 0) return { id, ok: true, nivel: 'ok', valoare: 'la zi', eroare: null };
  let npmCli;
  try {
    npmCli = rezolvaNpmCli(process.execPath, ctx.platforma);
  } catch (e) {
    if (e instanceof EroareFatala) return { id, ok: false, nivel: 'eroare', valoare: null, eroare: e.eroareMg };
    throw e;
  }
  const r = await ctx.ruleaza(process.execPath, [npmCli, 'ci', '--no-audit', '--no-fund'], {
    cwd: dir,
    // ignore-scripts=true din .npmrc-ul cursantului ar sări scriptul care descarcă ffmpeg; variabila de mediu bate .npmrc-ul.
    env: { ...process.env, npm_config_update_notifier: 'false', npm_config_ignore_scripts: 'false' },
    timeoutMs: 1800000,
  });
  if (r.cod !== 0) {
    return {
      id, ok: false, nivel: 'eroare', valoare: null,
      eroare: eroare('npm-ci-esuat', camp,
        `npm ci a eșuat în ${relativ} (cod ${r.cod}): ${rezumatNpm(r.stderr || r.stdout) || 'fără mesaj'}`,
        'Verifică conexiunea la internet (npm descarcă pachetele și ffmpeg), închide programele care țin fișiere deschise în folderul agentului, apoi rulează din nou node nucleu/mg.mjs doctor.'),
    };
  }
  const lipsa = binareLipsa(dir, ctx.platforma);
  if (lipsa.length > 0) {
    const cai = lipsa.map((c) => `${relativ}/${c}`).join(', ');
    return {
      id, ok: false, nivel: 'eroare', valoare: null,
      eroare: eroare('npm-ci-esuat', camp,
        `npm ci a terminat în ${relativ}, dar lipsește binarul descărcat de scriptul install al lui ffmpeg-static: ${cai}.`,
        'Binarul se descarcă de pe GitHub la instalare. Verifică conexiunea la internet și dacă antivirusul (Microsoft Defender) a pus ffmpeg în carantină; dacă da, restaurează-l sau exclude folderul agentului, apoi rulează din nou node nucleu/mg.mjs doctor. Dacă tot lipsește, trimite-i lui Dănuț raportul doctorului.'),
    };
  }
  return { id, ok: true, nivel: 'ok', valoare: 'instalat', eroare: null };
}
