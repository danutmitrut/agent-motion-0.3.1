// Verdictul revizorului (T1, T3): garda îl scrie din SubagentStop sau din PostToolUse/SubagentHandback, o singură dată pe foaie (F1).
// Plafonul de runde nu blochează predarea (P1): după el, agentul predă cu observațiile la vedere.
// Modul doar nativ.
import fs from 'node:fs';
import path from 'node:path';
import { scrieTextAtomic } from '../fisiere.mjs';
import { blocheazaStop } from './raspuns.mjs';

/** @typedef {{ stdout: string, cod: 0|2, stderr?: string }} RaspunsHook */

const AGENT_REVIZOR = 'revizor-cadre';
/** Spec 4.3: maximum 3 runde, numărate din fișiere; schița are rundele ei (T3). */
export const RUNDE_MAXIME = 3;
const MESAJ_PLAFON = 'Agentul principal predă cu observațiile revizorului la vedere (ce a semnalat și n-a reparat), iar cursantul decide; o rundă în plus pornește doar la cererea lui explicită.';
const MESAJ_FARA_VERDICT = 'Încheie cu verdictul: prima linie „Verdict: TRECE” sau „Verdict: REPARĂ”.';
const TIPAR_VERDICT = /^[*_\s]*verdict\s*:\s*[*_\s]*(trece|repară|repara)(?=$|[\s.,;:!*_)])/iu;
/** Numele unei foi de contact: foaie-N.jpg sau foaie-schita-N.jpg. */
const TIPAR_FOAIE = /^foaie-(schita-)?(\d+)\.jpg$/;
/** Rândul „Foaia: <nume>” din verdict (G3); învelișul Markdown al valorii (*, _, `) se taie separat, fără regex. */
const TIPAR_RAND_FOAIA = /^[*_\s]*foaia\s*:(.*)$/iu;
const INVELIS = /^[*_`\s]$/u;

/**
 * Alege fișierul în care se scrie verdictul: foaia de contact cu mtime cel mai mare care nu are încă verdict.
 * Cu `foaie` (G3, numele din rândul „Foaia:” al verdictului), ținta e foaia cu exact numele acela, dacă există
 * în `cadre/` și nu are încă verdict (la același nume în mai multe proiecte, cea mai nouă dintre ele). Dacă foaia
 * numită există, dar are peste tot verdict, nu e nicio țintă (F1: e a doua livrare a aceluiași verdict). Dacă
 * nicio foaie nu are numele acela, regula de mai sus, neschimbată. Ținta e mereu `cadre/revizie-N.md` sau
 * `cadre/revizie-schita-N.md` lângă o foaie reală.
 * @param {string} radacina
 * @param {{ foaie?: string | null }} [optiuni]
 * @returns {{ proiect: string, fisier: string } | null}
 */
export function alegeTintaVerdict(radacina, { foaie = null } = {}) {
  const dirVideo = path.join(radacina, 'video');
  let proiecte;
  try {
    proiecte = fs.readdirSync(dirVideo, { withFileTypes: true });
  } catch {
    return null;
  }
  let aleasa = null;
  let numita = null;
  let numitaJudecata = false;
  for (const intrare of proiecte) {
    if (!intrare.isDirectory()) continue;
    const proiect = intrare.name;
    const dirCadre = path.join(dirVideo, proiect, 'cadre');
    let nume;
    try {
      nume = fs.readdirSync(dirCadre);
    } catch {
      continue;
    }
    const existente = new Set(nume);
    for (const n of nume) {
      const m = TIPAR_FOAIE.exec(n);
      if (!m) continue;
      const revizie = `revizie-${m[1] ?? ''}${m[2]}.md`;
      if (existente.has(revizie)) {
        if (n === foaie) numitaJudecata = true;
        continue;
      }
      const candidat = { proiect, fisier: `video/${proiect}/cadre/${revizie}`, mtime: fs.statSync(path.join(dirCadre, n)).mtimeMs };
      aleasa = maiNoua(candidat, aleasa);
      if (n === foaie) numita = maiNoua(candidat, numita);
    }
  }
  if (!numita && numitaJudecata) return null;
  const tinta = numita ?? aleasa;
  return tinta ? { proiect: tinta.proiect, fisier: tinta.fisier } : null;
}

/**
 * Candidatul cu mtime mai mare; la egalitate, cel cu calea mai mare (ordine stabilă).
 * @param {{ proiect: string, fisier: string, mtime: number }} candidat
 * @param {{ proiect: string, fisier: string, mtime: number } | null} curent
 */
function maiNoua(candidat, curent) {
  if (!curent || candidat.mtime > curent.mtime || (candidat.mtime === curent.mtime && candidat.fisier > curent.fisier)) return candidat;
  return curent;
}

/**
 * Numele foii judecate, din primul rând „Foaia: <nume>” al textului revizorului (G3). Acceptă și o cale care
 * se termină cu numele (cu / sau \\) și ia doar numele. Potrivirea e strictă: foaie-N.jpg sau foaie-schita-N.jpg.
 * @param {unknown} text
 * @returns {string | null} numele, sau null când rândul lipsește ori numele nu se potrivește tiparului
 */
export function extrageFoaia(text) {
  if (typeof text !== 'string') return null;
  const linii = text.normalize('NFC').replace(/\r\n?/g, '\n').split('\n');
  const rand = linii.map((l) => TIPAR_RAND_FOAIA.exec(l)).find((m) => m);
  if (!rand) return null;
  const nume = taieInvelis(rand[1]).split(/[\\/]/).pop();
  return TIPAR_FOAIE.test(nume) ? nume : null;
}

/**
 * Taie de la capete spațiile și învelișul Markdown (*, _, `), caracter cu caracter (liniar, fără backtracking).
 * @param {string} valoare
 * @returns {string}
 */
function taieInvelis(valoare) {
  let inceput = 0;
  let sfarsit = valoare.length;
  while (inceput < sfarsit && INVELIS.test(valoare[inceput])) inceput++;
  while (sfarsit > inceput && INVELIS.test(valoare[sfarsit - 1])) sfarsit--;
  return valoare.slice(inceput, sfarsit);
}

/**
 * F1: proiectul țintei are un verdict scris după foaia țintei, deci foaia e o rundă rămasă în urmă, iar
 * revizorul care se oprește acum și-a livrat deja verdictul (prin SubagentHandback, în modul auto).
 * @param {string} radacina
 * @param {{ proiect: string, fisier: string }} tinta
 * @returns {boolean}
 */
function verdictScrisDupaFoaie(radacina, tinta) {
  const dirCadre = path.join(radacina, 'video', tinta.proiect, 'cadre');
  const foaie = path.basename(tinta.fisier).replace(/^revizie-/, 'foaie-').replace(/\.md$/, '.jpg');
  let nume;
  let mtimeFoaie;
  try {
    nume = fs.readdirSync(dirCadre);
    mtimeFoaie = fs.statSync(path.join(dirCadre, foaie)).mtimeMs;
  } catch {
    return false;
  }
  return nume.some((n) => /^revizie-(schita-)?\d+\.md$/.test(n) && fs.statSync(path.join(dirCadre, n)).mtimeMs > mtimeFoaie);
}

/**
 * Câte verdicte are deja proiectul: fișierele revizie-N.md (sau revizie-schita-N.md) din video/<proiect>/cadre/.
 * @param {string} radacina
 * @param {string} proiect
 * @param {{ schita?: boolean }} [optiuni]
 * @returns {number}
 */
export function numaraRunde(radacina, proiect, { schita = false } = {}) {
  let nume;
  try {
    nume = fs.readdirSync(path.join(radacina, 'video', proiect, 'cadre'));
  } catch {
    return 0;
  }
  const tipar = schita ? /^revizie-schita-\d+\.md$/ : /^revizie-\d+\.md$/;
  return nume.filter((n) => tipar.test(n)).length;
}

/**
 * Numărul de runde suplimentare dintr-o valoare din motor.lock.runde_suplimentare: un întreg pozitiv rămâne,
 * orice altceva (lipsă, negativ, zecimal, text) înseamnă 0. Singura definiție a regulii: o folosesc plafonRunde
 * și hook-ul UserPromptSubmit (garda/aprobare.mjs), care crește valoarea.
 * @param {unknown} n
 * @returns {number}
 */
export const valoareRunde = (n) => (Number.isInteger(n) && n > 0 ? n : 0);

/**
 * Plafonul de runde al proiectului (P1): RUNDE_MAXIME plus rundele suplimentare cerute explicit de cursant,
 * din motor.lock, câmpul opțional runde_suplimentare: { complet, schita } (întregi ≥ 0). motor.lock e în zona
 * „generat” (agentul nu-l poate scrie); câmpul îl crește doar hook-ul UserPromptSubmit, la mesajul cursantului (B13).
 * Un motor.lock lipsă, ilizibil sau cu valori invalide înseamnă 0 runde suplimentare.
 * @param {string} radacina
 * @param {string} proiect
 * @param {{ schita?: boolean }} [optiuni]
 * @returns {number}
 */
export function plafonRunde(radacina, proiect, { schita = false } = {}) {
  let suplimentare = 0;
  try {
    const lock = JSON.parse(fs.readFileSync(path.join(radacina, 'video', proiect, 'motor.lock'), 'utf8'));
    suplimentare = valoareRunde(lock?.runde_suplimentare?.[schita ? 'schita' : 'complet']);
  } catch {
    suplimentare = 0;
  }
  // Felia 2: fiecare încercare de corectură după predare (corecturi/N/incercare-K.json, scrise doar de mg) are o rundă a ei.
  return RUNDE_MAXIME + suplimentare + (schita ? 0 : numaraIncercariCorectura(radacina, proiect));
}

/** O încercare adaugă o rundă dacă nu s-a închis cu --propuneri înainte de randare; un fișier stricat nu adaugă (garda rămâne strictă). */
function adaugaRunda(cale) {
  try {
    const inc = JSON.parse(fs.readFileSync(cale, 'utf8'));
    return !inc.inchisa_la || Boolean(inc.verificata_la);
  } catch {
    return false;
  }
}

/**
 * Câte încercări de corectură are proiectul, pe toate corecturile: fișierele corecturi/<N>/incercare-<K>.json,
 * fără cele închise cu --propuneri înainte de orice randare.
 * @param {string} radacina
 * @param {string} proiect
 * @returns {number}
 */
export function numaraIncercariCorectura(radacina, proiect) {
  const dir = path.join(radacina, 'video', proiect, 'corecturi');
  let total = 0;
  let corecturi;
  try {
    corecturi = fs.readdirSync(dir).filter((n) => /^\d+$/.test(n));
  } catch {
    return 0;
  }
  for (const n of corecturi) {
    try {
      for (const f of fs.readdirSync(path.join(dir, n)).filter((f) => /^incercare-\d+\.json$/.test(f))) {
        if (adaugaRunda(path.join(dir, n, f))) total += 1;
      }
    } catch {
      // un fișier cu nume de număr, nu un folder: nu e o corectură
    }
  }
  return total;
}

/**
 * Textul de la prima linie „Verdict: TRECE” sau „Verdict: REPARĂ” (acceptă și „REPARA”) până la final.
 * Prima linie întoarsă are mereu forma canonică „Verdict: TRECE” sau „Verdict: REPARĂ”.
 * @param {string} text
 * @returns {string | null}
 */
export function extrageVerdict(text) {
  if (typeof text !== 'string') return null;
  const linii = text.normalize('NFC').replace(/\r\n?/g, '\n').split('\n');
  const index = linii.findIndex((l) => TIPAR_VERDICT.test(l.trimStart()));
  if (index === -1) return null;
  const prima = linii[index].trimStart();
  const m = TIPAR_VERDICT.exec(prima);
  const tip = m[1].toLowerCase() === 'trece' ? 'TRECE' : 'REPARĂ';
  const rest = prima.slice(m[0].length).replace(/^[*_]+/, '');
  return [`Verdict: ${tip}${rest}`, ...linii.slice(index + 1)].join('\n').trimEnd();
}

/**
 * @param {object} intrare JSON-ul hook-ului SubagentStop sau PostToolUse (SubagentHandback)
 * @param {string} radacina
 * @returns {RaspunsHook}
 */
export function decideVerdict(intrare, radacina) {
  const nimic = { stdout: '', cod: 0 };
  if (!intrare || intrare.agent_type !== AGENT_REVIZOR) return nimic;
  let text;
  if (intrare.hook_event_name === 'SubagentStop') {
    text = intrare.last_assistant_message;
  } else if (intrare.hook_event_name === 'PostToolUse' && intrare.tool_name === 'SubagentHandback') {
    text = intrare.tool_input?.message;
  } else {
    return nimic;
  }
  const foaie = extrageFoaia(text);
  const tinta = alegeTintaVerdict(radacina, { foaie });
  if (!tinta) return nimic;
  // F1: SubagentStop vine după SubagentHandback (modul auto). Când foaia țintei nu e cea numită în „Foaia:” și
  // proiectul are deja un verdict mai nou decât ea, verdictul a fost livrat: nu se scrie a doua oară, nu se blochează.
  const foaieTinta = path.basename(tinta.fisier).replace(/^revizie-/, 'foaie-').replace(/\.md$/, '.jpg');
  if (intrare.hook_event_name === 'SubagentStop' && foaie !== foaieTinta && verdictScrisDupaFoaie(radacina, tinta)) return nimic;
  const schita = tinta.fisier.includes('/revizie-schita-');
  const plafon = plafonRunde(radacina, tinta.proiect, { schita });
  if (numaraRunde(radacina, tinta.proiect, { schita }) >= plafon) {
    return {
      stdout: '',
      cod: 0,
      stderr: `Proiectul ${tinta.proiect} are deja ${plafon} runde de revizie${schita ? ' pe schiță' : ''}; garda nu scrie ${tinta.fisier}. ${MESAJ_PLAFON}`,
    };
  }
  const verdict = extrageVerdict(typeof text === 'string' ? text : '');
  if (verdict) {
    scrieTextAtomic(path.join(radacina, ...tinta.fisier.split('/')), verdict + '\n');
    return nimic;
  }
  if (intrare.hook_event_name === 'SubagentStop') return { stdout: blocheazaStop(MESAJ_FARA_VERDICT), cod: 0 };
  return nimic;
}
