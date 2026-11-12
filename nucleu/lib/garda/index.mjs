// Dispecerul gărzii: un singur punct de intrare pentru cele 5 hook-uri (harta 4.13, 6.2).
// Modul doar nativ.
import { refuza, intreaba, blocheazaStop } from './raspuns.mjs';
import { decideScriere } from './scriere.mjs';
import { decideComanda } from './comenzi.mjs';
import { decideStop } from './stop.mjs';
import { decideVerdict } from './revizor.mjs';
import { comandaTintesteCanar, scrieChitantaCanar } from './canar.mjs';
import { decideAprobare } from './aprobare.mjs';

/** @typedef {{ stdout: string, cod: 0|2, stderr?: string }} RaspunsHook */

const MOTIV_NECITIT = 'Garda nu a putut citi cererea; din siguranță, refuz.';
const MOTIV_EROARE_INTERNA = 'Garda a întâlnit o eroare internă; din siguranță, refuz.';
const MOTIV_PREDARE_NECITITA = 'Garda nu a putut citi răspunsul cu predarea; din siguranță, predarea nu e acceptată. Verifică videoul cu node nucleu/mg.mjs randeaza <proiect> și predă din nou.';
const NIMIC = Object.freeze({ stdout: '', cod: 0 });

function refuzDeSiguranta(stderr) {
  return { stdout: refuza(MOTIV_NECITIT), cod: 2, stderr };
}

function dinDecizie(decizie) {
  if (decizie.decizie === 'refuza') return { stdout: refuza(decizie.motiv), cod: 2 };
  if (decizie.decizie === 'intreaba') return { stdout: intreaba(decizie.motiv), cod: 0 };
  return { stdout: '', cod: 0 };
}

function intrareNecitita(textIntrare, motiv) {
  const eveniment = /"hook_event_name"\s*:\s*"([A-Za-z]+)"/.exec(textIntrare)?.[1];
  if (eveniment === 'Stop') {
    if (textIntrare.includes('Predare:')) return { stdout: blocheazaStop(MOTIV_PREDARE_NECITITA), cod: 0, stderr: motiv };
    return { stdout: '', cod: 0, stderr: motiv };
  }
  if (eveniment === 'UserPromptSubmit' || eveniment === 'SubagentStop' || eveniment === 'PostToolUse') {
    return { stdout: '', cod: 0, stderr: motiv };
  }
  return refuzDeSiguranta(motiv);
}

/**
 * Folderul în care rulează comanda: câmpul cwd din intrarea hook-ului (Bash-ul lui Claude Code păstrează
 * folderul curent între apeluri), cu rădăcina ca rezervă (F1).
 */
function bazaComenzii(intrare, radacina) {
  const cwd = intrare.cwd;
  if (typeof cwd !== 'string' || cwd.trim() === '') return radacina;
  return /^[\\/]/.test(cwd) || /^[A-Za-z]:[\\/]/.test(cwd) ? cwd : `${String(radacina).replace(/[\\/]+$/, '')}/${cwd}`;
}

function decidePreToolUse(intrare, radacina, acum) {
  const unealta = intrare.tool_name;
  const input = intrare.tool_input;
  if (!input || typeof input !== 'object') return refuzDeSiguranta('tool_input lipsește');
  if (unealta === 'Write' || unealta === 'Edit') {
    if (typeof input.file_path !== 'string' || input.file_path === '') return refuzDeSiguranta('file_path lipsește');
    return dinDecizie(decideScriere(unealta, input, radacina));
  }
  if (unealta === 'Bash' || unealta === 'PowerShell') {
    if (typeof input.command !== 'string') return refuzDeSiguranta('command lipsește');
    const decizie = decideComanda(input.command, unealta, radacina, bazaComenzii(intrare, radacina));
    // D1: un refuz pe canar lasă o chitanță pentru doctor; scrierea ei nu poate schimba refuzul (scrieChitantaCanar nu aruncă).
    if (decizie.decizie === 'refuza' && comandaTintesteCanar(input.command)) scrieChitantaCanar(radacina, unealta, acum);
    return dinDecizie(decizie);
  }
  return { stdout: refuza(`Garda nu cunoaște unealta ${String(unealta)}; din siguranță, refuz.`), cod: 2 };
}

/**
 * @param {string} textIntrare JSON-ul primit pe stdin
 * @param {{radacina: string, env: object, acum: Date}} mediu
 * @returns {Promise<RaspunsHook>}
 */
export async function proceseazaHook(textIntrare, mediu) {
  const radacina = mediu?.radacina;
  if (typeof textIntrare !== 'string' || textIntrare.trim() === '') return refuzDeSiguranta('stdin gol');
  let intrare;
  try {
    intrare = JSON.parse(textIntrare);
  } catch (e) {
    return intrareNecitita(textIntrare, `JSON invalid: ${e.message}`);
  }
  if (!intrare || typeof intrare !== 'object' || Array.isArray(intrare)) return refuzDeSiguranta('intrarea nu e un obiect JSON');
  const eveniment = intrare.hook_event_name;
  try {
    switch (eveniment) {
      case 'PreToolUse':
        return decidePreToolUse(intrare, radacina, mediu?.acum instanceof Date ? mediu.acum : new Date());
      case 'Stop':
        return decideStop(intrare, radacina);
      case 'SubagentStop':
        return decideVerdict(intrare, radacina);
      case 'PostToolUse':
        return intrare.tool_name === 'SubagentHandback' ? decideVerdict(intrare, radacina) : NIMIC;
      case 'UserPromptSubmit':
        // Aprobarea scenariului și runda de revizie în plus (B13). O excepție ajunge în catch-ul de mai jos (F18),
        // care la UserPromptSubmit lasă mesajul să treacă, fără efect.
        return decideAprobare(intrare, radacina, mediu?.acum instanceof Date ? mediu.acum : new Date());
      default:
        return refuzDeSiguranta(`eveniment necunoscut: ${String(eveniment)}`);
    }
  } catch (e) {
    // Stack-ul ajunge în jurnalul --debug-file al lui Claude Code; motivul spune agentului că defectul e în gardă (F18).
    const detalii = `eroare internă în gardă: ${e?.stack ?? e?.message ?? String(e)}`;
    if (eveniment === 'PreToolUse') return { stdout: refuza(MOTIV_EROARE_INTERNA), cod: 2, stderr: detalii };
    if (eveniment === 'Stop' && String(intrare.last_assistant_message ?? '').includes('Predare:')) {
      return { stdout: blocheazaStop(MOTIV_PREDARE_NECITITA), cod: 0, stderr: detalii };
    }
    return { stdout: '', cod: 0, stderr: detalii };
  }
}
