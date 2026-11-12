// Verificările lui mg doctor de dinainte de npm ci. Doar module native (rulează înainte să existe node_modules).
import { eroare, avertisment } from '../erori.mjs';

/** @typedef {{ id: string, ok: boolean, nivel: 'ok'|'avertisment'|'eroare'|'sarit', valoare: string|number|null, eroare: import('../erori.mjs').EroareMg|null }} RezultatDoctor */

const GIB = 1024 ** 3;
const SPATIU_MINIM = 2 * GIB;
const MEMORIE_PRAG = 12 * GIB;
const LIMITA_CALE = 200;
const REZERVA_CALE = 60;
const REFA = 'apoi rulează din nou node nucleu/mg.mjs doctor.';

/**
 * @param {string} id
 * @param {RezultatDoctor['nivel']} nivel
 * @param {string|number|null} valoare
 * @param {import('../erori.mjs').EroareMg|null} [problema]
 * @returns {RezultatDoctor}
 */
function rezultat(id, nivel, valoare, problema = null) {
  return { id, ok: nivel !== 'eroare', nivel, valoare, eroare: problema };
}

/** @param {string} v */
function parti(v) {
  return String(v).trim().replace(/^v/, '').split(/[.+-]/).slice(0, 3).map((x) => Number.parseInt(x, 10) || 0);
}

/** @param {string} v @param {string} minim */
function celPutin(v, minim) {
  const a = parti(v);
  const b = parti(minim);
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return true;
}

/** @param {number} octeti */
function gb(octeti) {
  return (octeti / GIB).toFixed(1).replace('.', ',');
}

async function verificaNode(ctx) {
  const minim = ctx.versiuni.node.minim;
  const v = String(ctx.versiuneNode).replace(/^v/, '');
  if (!celPutin(v, minim)) {
    return rezultat('node', 'eroare', v, eroare('node-vechi', 'mediu.node',
      `Ai Node ${v}; agentul cere cel puțin Node ${minim}.`,
      `Instalează ${ctx.platforma === 'win32' ? 'Node 24 LTS (x64)' : 'Node 22 LTS (arm64)'} de pe nodejs.org, închide și redeschide Claude Code, ${REFA}`));
  }
  // Node 22 pe Windows oprește procesul fără mesaj la fs.cpSync într-o cale cu diacritice (Node 24 nu mai are problema).
  // Nucleul nu folosește cpSync; HyperFrames da, pe drumuri pe care șabloanele de acum nu le ating, deci e avertisment.
  if (ctx.platforma === 'win32' && !celPutin(v, '24.0.0')) {
    return rezultat('node', 'avertisment', v, avertisment('node-22-windows', 'mediu.node',
      `Ai Node ${v} pe Windows. Merge, dar Node 22 se poate opri fără niciun mesaj când copiază fișiere dintr-un folder cu diacritice în nume (de exemplu „Proiecte Ăîș”).`,
      `Instalează Node 24 LTS de pe nodejs.org (x64), închide și redeschide Claude Code, ${REFA}`));
  }
  return rezultat('node', 'ok', v);
}

async function verificaPlatforma(ctx) {
  const p = `${ctx.platforma}-${ctx.arhitectura}`;
  if (p === 'win32-x64' || p === 'darwin-arm64') return rezultat('platforma', 'ok', p);
  if (p === 'darwin-x64') {
    return rezultat('platforma', 'avertisment', p, avertisment('platforma-netestata', 'mediu.platforma',
      'Mac cu procesor Intel: platformă netestată, fără garanție și fără susținere dedicată.',
      'Poți continua. Dacă randarea dă erori, folosește un Mac cu Apple Silicon sau un laptop Windows x64.'));
  }
  if (p === 'linux-x64') {
    return rezultat('platforma', 'avertisment', p, avertisment('platforma-netestata', 'mediu.platforma',
      'Linux: platformă netestată pentru cursanți; merge doar pentru dezvoltarea kitului.',
      'Pentru lucru real folosește un laptop Windows x64 sau un Mac cu Apple Silicon.'));
  }
  const mesaj = p === 'win32-arm64'
    ? 'Windows pe ARM64 (Snapdragon) nu e suportat: Chrome headless, ffmpeg și ffprobe nu au binare native pentru el.'
    : `Platforma ${p} nu e suportată.`;
  return rezultat('platforma', 'eroare', p, eroare('platforma-nesuportata', 'mediu.platforma', mesaj,
    'Folosește un laptop Windows x64 sau un Mac cu Apple Silicon.'));
}

async function verificaClaude(ctx) {
  if (ctx.ci) return rezultat('claude', 'sarit', null);
  const minim = ctx.versiuni.claude_code.minim;
  const v = await ctx.versiuneClaude();
  if (!v) {
    return rezultat('claude', 'eroare', null, eroare('claude-vechi', 'mediu.claude',
      'Nu am putut citi versiunea Claude Code (comanda claude --version nu a răspuns).',
      `Verifică într-un terminal că merge claude --version; dacă nu merge, reinstalează Claude Code, ${REFA}`));
  }
  if (!celPutin(v, minim)) {
    return rezultat('claude', 'eroare', v, eroare('claude-vechi', 'mediu.claude',
      `Ai Claude Code ${v}; agentul cere cel puțin ${minim} (altfel revizorul nu are context curat).`,
      `Actualizează Claude Code cu claude update, redeschide-l în folderul agentului, ${REFA}`));
  }
  return rezultat('claude', 'ok', v);
}

async function verificaCale(ctx) {
  const r = String(ctx.radacina);
  if (/onedrive/i.test(r)) {
    return rezultat('cale', 'avertisment', r, avertisment('cale-onedrive', 'mediu.cale',
      `Folderul agentului e în OneDrive (${r}); sincronizarea poate bloca fișierele în timpul randării.`,
      'Mută folderul în C:\\agent-motion (în afara OneDrive) și redeschide Claude Code acolo.'));
  }
  if (r.length + REZERVA_CALE > LIMITA_CALE) {
    return rezultat('cale', 'avertisment', r, avertisment('cale-lunga', 'mediu.cale',
      `Calea folderului are ${r.length} caractere; cu fișierele din node_modules se apropie de limita Windows de 260.`,
      'Mută folderul în C:\\agent-motion și redeschide Claude Code acolo.'));
  }
  if (/\s/.test(r) || /[^\x00-\x7F]/.test(r)) {
    return rezultat('cale', 'avertisment', r, avertisment('cale-cu-spatii-sau-diacritice', 'mediu.cale',
      `Calea folderului conține spații sau diacritice (${r}); merge, dar unele unelte externe se încurcă în astfel de căi.`,
      'Dacă apar erori ciudate la randare, mută folderul în C:\\agent-motion.'));
  }
  return rezultat('cale', 'ok', r);
}

async function verificaSpatiu(ctx) {
  let liber;
  try {
    liber = await ctx.spatiuLiber();
  } catch {
    return rezultat('spatiu', 'sarit', null);
  }
  if (liber < SPATIU_MINIM) {
    return rezultat('spatiu', 'eroare', `${gb(liber)} GB`, eroare('spatiu-insuficient', 'mediu.spatiu',
      `Pe discul agentului mai sunt ${gb(liber)} GB liberi; instalarea cere cel puțin 2 GB.`,
      `Eliberează cel puțin ${gb(SPATIU_MINIM - liber)} GB (Coșul de gunoi, descărcări vechi), ${REFA}`));
  }
  return rezultat('spatiu', 'ok', `${gb(liber)} GB`);
}

async function verificaMemorie(ctx) {
  const total = ctx.memorieTotala;
  if (total < MEMORIE_PRAG) {
    return rezultat('memorie', 'avertisment', `${gb(total)} GB`, avertisment('memorie-putina', 'mediu.memorie',
      `Calculatorul are ${gb(total)} GB RAM, sub 12 GB; mg va randa cu mai puține procese, deci mai încet.`,
      'Nu trebuie să faci nimic; închide aplicațiile grele în timpul randării.'));
  }
  return rezultat('memorie', 'ok', `${gb(total)} GB`);
}

const PASI = [verificaNode, verificaPlatforma, verificaClaude, verificaCale, verificaSpatiu, verificaMemorie];

/**
 * Faza 1 a doctorului: node, platforma, claude, cale, spatiu, memorie, în această ordine.
 * Se oprește la prima eroare (rezultatul cu eroarea e ultimul din listă).
 * @param {object} ctx CtxDoctor, cu ctx.versiuni pus de comandaDoctor
 * @returns {Promise<RezultatDoctor[]>}
 */
export async function verificariBaza(ctx) {
  const rezultate = [];
  for (const pas of PASI) {
    const r = await pas(ctx);
    rezultate.push(r);
    if (r.nivel === 'eroare') break;
  }
  return rezultate;
}
