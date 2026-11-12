// Faza 2 a lui mg doctor, după npm ci. Se încarcă dinamic din index.mjs, pentru că depinde de pachetele npm.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { eroare, avertisment, EroareFatala } from '../erori.mjs';
import { sha256Fisier, stergeRecursiv } from '../fisiere.mjs';
import { verificaIntegritate, citesteVersiuni } from '../versiuni.mjs';
import { stareParakeet } from '../filmare/parakeet.mjs';
import { rezolvaFfmpeg, descarcaRezerva, probeazaMp4 } from '../ffmpeg.mjs';
import { ruleazaHyperframes } from '../motor-hf.mjs';
import { incarcaCatalogFonturi, verificaDiacriticeFont } from '../fonturi.mjs';

const REFA = 'apoi rulează din nou node nucleu/mg.mjs doctor.';
const SUGESTII = {
  'integritate-kit': `Fișierele kitului nu se modifică. Rulează git status ca să vezi ce s-a schimbat și readu fișierele cu git checkout -- <fișier>; dacă nu știi ce s-a schimbat, clonează din nou repo-ul, ${REFA}`,
  'ffmpeg-lipsa': `Verifică conexiunea la internet (ffmpeg și ffprobe se descarcă la instalare), ${REFA}`,
  'chrome-lipsa': `Verifică conexiunea la internet; dacă ești în rețeaua unei firme sau ai un antivirus strict, deblochează descărcarea browserului de randare, ${REFA}`,
  'font-fara-diacritice': 'Fonturile kitului sunt deteriorate sau lipsesc. Readu folderul motoare/comun/fonturi cu git checkout -- motoare/comun/fonturi, apoi rulează din nou node nucleu/mg.mjs doctor.',
  'pluginuri-globale': 'Nu trebuie să faci nimic pentru agent.',
  'pluginuri-cu-hookuri': 'Nu trebuie să faci nimic dacă agentul merge bine.',
  'hyperframes-actualizare-pendinte': 'Nu trebuie să faci nimic pentru agent.',
  'randare-proba-esuata': `Închide programele grele, verifică dacă antivirusul blochează Chrome sau ffmpeg din folderul agentului, ${REFA}`,
};

/** @returns {import('./baza.mjs').RezultatDoctor} */
function rezultat(id, nivel, valoare, problema = null) {
  return { id, ok: nivel !== 'eroare', nivel, valoare, eroare: problema };
}

/** @param {string} text */
function ultimaLinie(text) {
  return String(text ?? '').trim().split(/\r?\n/).filter(Boolean).at(-1) ?? 'fără mesaj';
}

/** @param {string} radacina @param {string} cale */
function relativ(radacina, cale) {
  return path.relative(radacina, cale).split(path.sep).join('/');
}

/**
 * Rulează o verificare; orice excepție devine rezultat, ca o verificare căzută să nu le oprească pe celelalte.
 * @param {string} id
 * @param {string} cod codul folosit dacă verificarea aruncă altceva decât EroareFatala
 * @param {'eroare'|'avertisment'} nivelLaEsec
 * @param {() => Promise<import('./baza.mjs').RezultatDoctor>} verificare
 */
async function sigur(id, cod, nivelLaEsec, verificare) {
  try {
    return await verificare();
  } catch (e) {
    if (e instanceof EroareFatala) return rezultat(id, nivelLaEsec, null, e.eroareMg);
    const fabrica = nivelLaEsec === 'eroare' ? eroare : avertisment;
    return rezultat(id, nivelLaEsec, null, fabrica(cod, `mediu.${id}`, `Verificarea ${id} a căzut: ${e && e.message ? e.message : String(e)}`, SUGESTII[cod]));
  }
}

async function verificaIntegritatea(ctx) {
  const r = verificaIntegritate(ctx.radacina, ctx.versiuni);
  if (!r.ok) {
    const diferite = [...r.diferite, ...r.lipsa.map((cale) => `${cale} (lipsă)`)];
    const lista = diferite.slice(0, 5).join(', ') + (diferite.length > 5 ? ` și încă ${diferite.length - 5}` : '');
    return rezultat('integritate', 'eroare', diferite.length, eroare('integritate-kit', 'mediu.integritate',
      `Fișiere ale kitului diferă de versiunea fixată în nucleu/VERSIUNI.json: ${lista}.`, SUGESTII['integritate-kit']));
  }
  return rezultat('integritate', 'ok', 'kit neatins');
}

/** rezolvaFfmpeg, cu descărcarea rezervei (T6) pentru binarul care lipsește, dacă VERSIUNI.json o are pe platformă. */
async function rezolvaCuRezerva(ctx, plat) {
  const descarcate = new Set();
  for (;;) {
    try {
      return await rezolvaFfmpeg(ctx.radacina);
    } catch (e) {
      if (!(e instanceof EroareFatala)) throw e;
      const binar = e.eroareMg.camp === 'mediu.ffprobe' ? 'ffprobe' : 'ffmpeg';
      if (descarcate.has(binar) || !ctx.versiuni.ffmpeg?.rezerva?.[plat]?.[binar]) throw e;
      descarcate.add(binar);
      await descarcaRezerva(ctx.radacina, binar, ctx.versiuni);
    }
  }
}

function verificaHash(ctx, plat, binar, ff) {
  const sursa = ff.surse[binar];
  const valoare = `${sursa}: ${relativ(ctx.radacina, ff[binar])}`;
  const asteptat = sursa === 'rezerva'
    ? ctx.versiuni.ffmpeg?.rezerva?.[plat]?.[binar]?.sha256
    : ctx.versiuni.ffmpeg?.binare?.[plat]?.[binar];
  if (!asteptat) {
    return rezultat(binar, 'avertisment', valoare, avertisment('platforma-netestata', `mediu.${binar}`,
      `Pe ${plat}, ${binar} nu are hash fixat în nucleu/VERSIUNI.json, deci nu îl pot verifica.`,
      'Poți continua; platforma e netestată. Dacă randarea dă erori, folosește un Mac cu Apple Silicon sau un laptop Windows x64.'));
  }
  if (sha256Fisier(ff[binar]) !== asteptat) {
    return rezultat(binar, 'eroare', valoare, eroare('ffmpeg-hash', `mediu.${binar}`,
      `${binar} (${sursa}) are alt sha256 decât cel fixat în nucleu/VERSIUNI.json.`,
      `Șterge folderele nucleu/node_modules și unelte/ffmpeg, ${REFA} Dacă se repetă, spune-i lui Dănuț.`));
  }
  return rezultat(binar, 'ok', valoare);
}

/** @returns {Promise<{ rezultate: import('./baza.mjs').RezultatDoctor[], ff: {ffmpeg: string, ffprobe: string}|null }>} */
async function verificaFfmpeg(ctx) {
  const plat = `${ctx.platforma}-${ctx.arhitectura}`;
  let ff;
  try {
    ff = await rezolvaCuRezerva(ctx, plat);
  } catch (e) {
    const problema = e instanceof EroareFatala
      ? e.eroareMg
      : eroare('ffmpeg-lipsa', 'mediu.ffmpeg', `Nu am putut pregăti ffmpeg: ${e && e.message ? e.message : String(e)}`, SUGESTII['ffmpeg-lipsa']);
    const vinovat = problema.camp === 'mediu.ffprobe' ? 'ffprobe' : 'ffmpeg';
    return {
      rezultate: ['ffmpeg', 'ffprobe'].map((b) => (b === vinovat ? rezultat(b, 'eroare', null, problema) : rezultat(b, 'sarit', null))),
      ff: null,
    };
  }
  const rezultate = ['ffmpeg', 'ffprobe'].map((b) => verificaHash(ctx, plat, b, ff));
  return { rezultate, ff: rezultate.some((r) => r.nivel === 'eroare') ? null : { ffmpeg: ff.ffmpeg, ffprobe: ff.ffprobe } };
}

async function verificaChrome(ctx, ff) {
  // Fără ffmpeg valid nu pornim HyperFrames: eroarea apare o singură dată, la ffmpeg.
  if (!ff) return rezultat('chrome', 'sarit', 'fără ffmpeg valid');
  const optiuni = { radacina: ctx.radacina, cwd: ctx.radacina, timeoutMs: 900000, ff };
  const r = await ruleazaHyperframes(['browser', 'ensure'], optiuni);
  if (r.cod !== 0) {
    return rezultat('chrome', 'eroare', null, eroare('chrome-lipsa', 'mediu.chrome',
      `HyperFrames nu a putut pregăti Chrome headless (cod ${r.cod}): ${ultimaLinie(r.stderr || r.stdout)}`, SUGESTII['chrome-lipsa']));
  }
  const cale = /Path:\s*(.+)/.exec(String(r.stdout))?.[1]?.trim() ?? 'pregătit';
  return rezultat('chrome', 'ok', cale);
}

async function verificaFonturi(ctx) {
  const catalog = incarcaCatalogFonturi(ctx.radacina);
  const iduri = Object.keys(catalog).sort();
  if (iduri.length === 0) {
    return rezultat('fonturi', 'eroare', 0, eroare('font-fara-diacritice', 'mediu.fonturi',
      'Catalogul de fonturi din motoare/comun/fonturi e gol.', SUGESTII['font-fara-diacritice']));
  }
  const probleme = [];
  for (const id of iduri) {
    const r = await verificaDiacriticeFont(ctx.radacina, id);
    if (r.ok) continue;
    const litere = [...new Set(Object.values(r.lipsa).flat())].join('');
    probleme.push(litere ? `${id} (${litere})` : `${id} (fișiere lipsă)`);
  }
  if (probleme.length > 0) {
    return rezultat('fonturi', 'eroare', iduri.length, eroare('font-fara-diacritice', 'mediu.fonturi',
      `Fonturi fără diacriticele românești: ${probleme.join(', ')}.`, SUGESTII['font-fara-diacritice']));
  }
  return rezultat('fonturi', 'ok', iduri.join(', '));
}

/**
 * Pluginurile din ~/.claude/plugins/installed_plugins.json (formatul 2: plugins[nume] e o listă de instalări;
 * formatul vechi are un obiect). Un fișier lipsă dă un obiect gol; unul necitibil dă și necitibil: true (decizia E5).
 * @param {{ acasa: string }} ctx
 * @returns {{ pluginuri: Record<string, unknown>, necitibil: boolean }}
 */
function citestePluginuriInstalate(ctx) {
  const fisier = path.join(ctx.acasa, '.claude', 'plugins', 'installed_plugins.json');
  if (!fs.existsSync(fisier)) return { pluginuri: {}, necitibil: false };
  let date = null;
  let necitibil = false;
  try {
    date = JSON.parse(fs.readFileSync(fisier, 'utf8'));
  } catch {
    necitibil = true;
  }
  const pluginuri = date && typeof date === 'object'
    ? (date.plugins && typeof date.plugins === 'object' ? date.plugins : date)
    : {};
  return { pluginuri, necitibil };
}

async function verificaPluginuri(ctx) {
  const gasite = [];
  for (const nume of ['hyperframes', 'remotion']) {
    if (fs.existsSync(path.join(ctx.acasa, '.claude', 'skills', nume))) gasite.push(`skillul ~/.claude/skills/${nume}`);
  }
  const { pluginuri, necitibil } = citestePluginuriInstalate(ctx);
  for (const nume of ['hyperframes@hyperframes', 'remotion@remotion']) {
    if (Object.hasOwn(pluginuri, nume)) gasite.push(`pluginul ${nume}`);
  }
  if (gasite.length > 0) {
    return rezultat('pluginuri-globale', 'avertisment', gasite.length, avertisment('pluginuri-globale', 'mediu.pluginuri-globale',
      `Ai instalate global: ${gasite.join(', ')}. În folderul agentului sunt dezactivate prin .claude/settings.json.`,
      'Nu trebuie să faci nimic pentru agent. Dacă vrei să le scoți și din celelalte proiecte, dezinstalează-le din Claude Code.'));
  }
  return rezultat('pluginuri-globale', 'ok', necitibil ? 'installed_plugins.json necitibil' : 'niciunul');
}

/** @param {string} cale @returns {unknown} conținutul JSON sau undefined, dacă fișierul lipsește sau nu e JSON */
function citesteJsonSigur(cale) {
  try {
    return JSON.parse(fs.readFileSync(cale, 'utf8'));
  } catch {
    return undefined;
  }
}

/** @param {unknown} v o valoare din care ar putea veni hook-uri: șir (cale), listă sau obiect, nu goale */
function nuEGoala(v) {
  if (typeof v === 'string') return v.trim() !== '';
  if (Array.isArray(v)) return v.length > 0;
  return Boolean(v) && typeof v === 'object' && Object.keys(v).length > 0;
}

/**
 * Un plugin are hook-uri dacă are hooks/hooks.json (nu gol) sau câmpul „hooks” (nu gol) în .claude-plugin/plugin.json.
 * Un hooks.json care există dar nu se citește se numără: nu putem dovedi că e gol.
 * @param {string} folder
 */
function areHookuri(folder) {
  const fisierHooks = path.join(folder, 'hooks', 'hooks.json');
  if (fs.existsSync(fisierHooks)) {
    const hooks = citesteJsonSigur(fisierHooks);
    if (hooks === undefined || nuEGoala(hooks?.hooks)) return true;
  }
  const manifest = citesteJsonSigur(path.join(folder, '.claude-plugin', 'plugin.json'));
  return nuEGoala(manifest?.hooks);
}

/**
 * enabledPlugins efectiv: setările utilizatorului, apoi ale proiectului (agentul), apoi cele locale ale proiectului;
 * cele de mai târziu le bat pe cele dinainte. Un fișier lipsă sau necitibil se ignoră.
 * @param {{ acasa: string, radacina: string }} ctx
 * @returns {Record<string, unknown>}
 */
function pluginuriActivate(ctx) {
  const activate = {};
  for (const fisier of [
    path.join(ctx.acasa, '.claude', 'settings.json'),
    path.join(ctx.radacina, '.claude', 'settings.json'),
    path.join(ctx.radacina, '.claude', 'settings.local.json'),
  ]) {
    const ep = citesteJsonSigur(fisier)?.enabledPlugins;
    if (ep && typeof ep === 'object' && !Array.isArray(ep)) Object.assign(activate, ep);
  }
  return activate;
}

/** @param {string} a @param {string} b două căi, comparate fără diferențe de separator, de majuscule pe Windows sau de „/” la final */
function aceeasiCale(a, b) {
  const normal = (c) => path.resolve(String(c)).replace(/[\\/]+$/, '');
  return process.platform === 'win32' ? normal(a).toLowerCase() === normal(b).toLowerCase() : normal(a) === normal(b);
}

/**
 * G4: pluginurile globale active cu hook-uri rulează și în folderul agentului (enabledPlugins din .claude/settings.json
 * oprește doar hyperframes și remotion). Le listăm, ca avertisment, fără să le oprim.
 */
async function verificaPluginuriHookuri(ctx) {
  const { pluginuri, necitibil } = citestePluginuriInstalate(ctx);
  const activate = pluginuriActivate(ctx);
  const cuHookuri = [];
  for (const [nume, instalari] of Object.entries(pluginuri)) {
    if (activate[nume] === false) continue;
    const lista = Array.isArray(instalari) ? instalari : [instalari];
    // Un plugin legat de alt proiect (scope project sau local) nu rulează aici.
    const aiciSauGlobal = (i) => i && typeof i === 'object' && typeof i.installPath === 'string'
      && (!i.scope || i.scope === 'user' || (typeof i.projectPath === 'string' && aceeasiCale(i.projectPath, ctx.radacina)));
    if (lista.some((i) => aiciSauGlobal(i) && areHookuri(i.installPath))) cuHookuri.push(nume);
  }
  if (cuHookuri.length > 0) {
    const lista = cuHookuri.sort().join(', ');
    const exemplu = `"${cuHookuri[0]}": false`;
    return rezultat('pluginuri-hookuri', 'avertisment', cuHookuri.length, avertisment('pluginuri-cu-hookuri', 'mediu.pluginuri-hookuri',
      `Pluginuri globale cu hook-uri: ${lista}. Hook-urile lor rulează și în folderul agentului, alături de garda lui.`,
      `Nu trebuie să faci nimic dacă agentul merge bine. Dacă apar probleme (mesaje ciudate la începutul sesiunii, comenzi încetinite sau blocate), oprește pluginul doar pentru proiectul acesta: în .claude/settings.local.json adaugă la enabledPlugins numele lui cu false, de exemplu ${exemplu}. Fișierul .claude/settings.json al kitului nu se modifică.`));
  }
  return rezultat('pluginuri-hookuri', 'ok', necitibil ? 'installed_plugins.json necitibil' : 'niciunul');
}

async function verificaActualizare(ctx) {
  const fisier = path.join(ctx.acasa, '.hyperframes', 'config.json');
  if (!fs.existsSync(fisier)) return rezultat('actualizare-hyperframes', 'ok', 'fără config');
  let config = null;
  try {
    config = JSON.parse(fs.readFileSync(fisier, 'utf8'));
  } catch {
    return rezultat('actualizare-hyperframes', 'ok', 'config necitibil');
  }
  const pendinte = config && typeof config === 'object' ? config.pendingUpdate : null;
  if (pendinte) {
    const versiune = typeof pendinte.version === 'string' ? ` (versiunea ${pendinte.version})` : '';
    return rezultat('actualizare-hyperframes', 'avertisment', pendinte.version ?? null, avertisment('hyperframes-actualizare-pendinte', 'mediu.actualizare-hyperframes',
      `HyperFrames are o actualizare automată în așteptare${versiune}, pornită în afara agentului.`,
      'Agentul folosește doar HyperFrames 0.8.96 din motoare/hyperframes și nu e afectat. Nu rula hyperframes upgrade.'));
  }
  return rezultat('actualizare-hyperframes', 'ok', 'nicio actualizare în așteptare');
}

/** Doar raport (spec 7.4): transcrierea se instalează la primul overlay, cu acordul cursantului, nu la doctor. */
export function verificaParakeet(ctx) {
  const versiuni = ctx.versiuni ?? citesteVersiuni(ctx.radacina);
  const stare = stareParakeet({ acasa: ctx.acasa ?? os.homedir(), versiuni });
  return stare.instalat
    ? rezultat('parakeet', 'ok', `instalat (sherpa-onnx-node ${versiuni.transcriere.versiune}, Parakeet TDT 0.6B v3)`)
    : rezultat('parakeet', 'ok', 'neinstalat; se instalează la primul overlay, cu acordul tău (~670 MB)');
}

async function verificaRandare(ctx, ff) {
  const dirTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-proba-'));
  try {
    const iesire = path.join(dirTemp, 'proba.mp4');
    // HyperFrames respinge căile cu '../' în resurse, deci GSAP stă lângă index.html, într-o copie temporară a probei.
    const proba = path.join(dirTemp, 'proba');
    fs.mkdirSync(proba, { recursive: true });
    fs.copyFileSync(path.join(ctx.radacina, 'motoare', 'hyperframes', 'proba', 'index.html'), path.join(proba, 'index.html'));
    fs.copyFileSync(path.join(ctx.radacina, 'motoare', 'hyperframes', 'comun', 'vendor', 'gsap.min.js'), path.join(proba, 'gsap.min.js'));
    const r = await ruleazaHyperframes(['render', proba, '-o', iesire, '--quality', 'draft', '--quiet'],
      { radacina: ctx.radacina, cwd: ctx.radacina, ff, timeoutMs: 600000 });
    if (r.cod !== 0 || !fs.existsSync(iesire)) {
      return rezultat('randare-proba', 'eroare', null, eroare('randare-proba-esuata', 'mediu.randare-proba',
        `Randarea de probă de 2 s a eșuat (cod ${r.cod}): ${ultimaLinie(r.stderr || r.stdout)}`, SUGESTII['randare-proba-esuata']));
    }
    const info = await probeazaMp4(iesire, { ffprobe: ff.ffprobe });
    const fps = info.video && info.video.fps ? info.video.fps : 30;
    if (Math.abs(info.durata - 2) > 1 / fps + 1e-9) {
      return rezultat('randare-proba', 'eroare', info.durata, eroare('randare-proba-esuata', 'mediu.randare-proba',
        `Randarea de probă are ${String(info.durata).replace('.', ',')} s în loc de 2 s.`, SUGESTII['randare-proba-esuata']));
    }
    return rezultat('randare-proba', 'ok', `${info.durata.toFixed(3).replace('.', ',')} s, ${info.video.latime}x${info.video.inaltime}`);
  } finally {
    stergeRecursiv(dirTemp);
  }
}

/**
 * Faza 2: integritate, ffmpeg, ffprobe, chrome, fonturi, pluginuri-globale, pluginuri-hookuri, actualizare-hyperframes,
 * parakeet (doar raport), randare-proba.
 * Rulează toate verificările (nu se oprește la prima eroare); randarea de probă e sărită fără ffmpeg sau fără Chrome.
 * @param {object} ctx CtxDoctor, cu ctx.versiuni
 * @returns {Promise<import('./baza.mjs').RezultatDoctor[]>}
 */
export async function verificariComplete(ctx) {
  const rezultate = [];
  rezultate.push(await sigur('integritate', 'integritate-kit', 'eroare', () => verificaIntegritatea(ctx)));
  const { rezultate: rezultateFf, ff } = await verificaFfmpeg(ctx);
  rezultate.push(...rezultateFf);
  const chrome = await sigur('chrome', 'chrome-lipsa', 'eroare', () => verificaChrome(ctx, ff));
  rezultate.push(chrome);
  rezultate.push(await sigur('fonturi', 'font-fara-diacritice', 'eroare', () => verificaFonturi(ctx)));
  rezultate.push(await sigur('pluginuri-globale', 'pluginuri-globale', 'avertisment', () => verificaPluginuri(ctx)));
  rezultate.push(await sigur('pluginuri-hookuri', 'pluginuri-cu-hookuri', 'avertisment', () => verificaPluginuriHookuri(ctx)));
  rezultate.push(await sigur('actualizare-hyperframes', 'hyperframes-actualizare-pendinte', 'avertisment', () => verificaActualizare(ctx)));
  rezultate.push(await sigur('parakeet', 'transcriere-neinstalata', 'avertisment', async () => verificaParakeet(ctx)));
  if (ff && chrome.nivel === 'ok') {
    rezultate.push(await sigur('randare-proba', 'randare-proba-esuata', 'eroare', () => verificaRandare(ctx, ff)));
  } else {
    rezultate.push(rezultat('randare-proba', 'sarit', 'fără ffmpeg sau fără Chrome'));
  }
  return rezultate;
}
