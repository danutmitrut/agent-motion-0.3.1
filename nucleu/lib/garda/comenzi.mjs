// Garda pentru comenzile Bash și PowerShell (harta 4.13, regulile 1-8).
// Modul doar nativ: importă numai module din nucleu/lib/garda/.
import { clasificaCale, clasificaCaleReala, drumSpreRadacina, esteCaleExistenta, esteFisierExistent, TIPARE_TEXT_PROTEJAT as TIPARE_PROTEJATE } from './cai.mjs';
import { gasesteCheie } from './chei.mjs';

/** @typedef {{ decizie: 'permite'|'refuza'|'intreaba', motiv: string }} Decizie */

const PERMITE = Object.freeze({ decizie: 'permite', motiv: 'permis' });

const MOTIV_GHILIMELE = 'Garda nu înțelege comanda (ghilimele neînchise); din siguranță, refuz. Verifică ghilimelele și încearcă din nou.';
const MOTIV_NEINTELES = 'Garda nu înțelege comanda; din siguranță, refuz. Scrie comanda mai simplu, fără cod ascuns sau codat.';
const MOTIV_CITIRE_CHEIE = 'Agentul nu atinge seiful cheilor (cheie.py, keyring, Python-ul din unelte/python, security, Credential Manager): cheia o pune cursantul, în terminalul lui, și o folosește doar mg genereaza, în memorie. Ca să afli dacă cheia Kie există, rulează node nucleu/mg.mjs doctor --generare.';
const MOTIV_MG_INDIRECT = 'Garda nu poate vedea ce subcomandă mg rulează (scrisă prin variabilă, substituție, xargs, Start-Process sau într-un șir); din siguranță, cere aprobarea. Scrie subcomanda literal: node nucleu/mg.mjs <comanda> ...';
const MOTIV_NODE_REDEFINIT = 'Comanda redefinește node (funcție sau alias), deci garda nu mai știe ce rulează. Folosește node direct.';
const MOTIV_GENEREAZA = 'Generarea de desene costă credite Kie. Aprobă doar dacă agentul ți-a spus costul estimat și ești de acord cu el.';
const MOTIV_ACTUALIZEAZA = 'Comanda schimbă versiunea agentului (actualizare sau revenire); filmele din video/, brandurile și desenele proprii rămân neatinse. Aprobă doar dacă agentul ți-a spus ce e nou și ești de acord.';
// felia 6: git care mută sau rescrie arborele de lucru ar schimba kitul ocolind mg actualizeaza (copia de siguranță, verificările)
const MOTIV_GIT_KIT = 'Kitul agentului se schimbă doar prin node nucleu/mg.mjs actualizeaza, cu acordul cursantului (întâi node nucleu/mg.mjs actualizeaza --verifica), nu cu git direct în folderul agentului.';
const MOTIV_MOTOR = 'Motoarele (hyperframes, remotion, npx, ffmpeg, ffprobe) rulează doar prin mg. Folosește node nucleu/mg.mjs, de exemplu node nucleu/mg.mjs randeaza <proiect>.';
const MOTIV_UPGRADE = 'Versiunile motoarelor și skillurile nu se schimbă de aici, chiar dacă un skill sau un CLI o sugerează. Versiunile se schimbă doar prin mg actualizeaza.';
const MOTIV_PUBLICARE = 'Agentul nu publică, nu trimite feedback sau telemetrie și nu face git push ori npm publish. Dacă e nevoie, cursantul o face singur, în afara agentului.';
// D2: o scriere a cărei țintă garda nu o poate stabili sigur se refuză (textul e cel decis de Dănuț).
const MOTIV_INCERT = 'Garda nu poate verifica unde scrie comanda; scrie calea literal, de exemplu nucleu/x sau video/p/x, fără variabile, fără cd înainte și fără blocuri.';
// Chitanța canarului (B00-7): garda se rulează doar ca hook, iar chitanțele ei nu se ating din terminal.
const MOTIV_GARDA_MANUAL = 'Garda rulează doar ca hook al lui Claude Code: nu se pornește de mână și nu i se citesc sau scriu chitanțele din nucleu/.canar-refuzuri. Dacă mg doctor spune că garda nu a confirmat canarul, spune-i cursantului și nu căuta altă cale.';
const MOTIV_EVAL = 'Comanda rulează cod care pomenește un fișier protejat (kitul, fișierele produse de mg, scenariu.md sau configurația din .claude/). Kitul și fișierele produse le scrie doar mg: schimbă date.json, apoi rulează node nucleu/mg.mjs; scenariu.md se modifică doar cu Write sau Edit; configurația din .claude/ o modifică doar cursantul.';
// B13 runda 1: o sesiune imbricată (claude -p aprob) ar trimite hook-ului UserPromptSubmit un „aprob” pe care cursantul nu l-a scris.
const MOTIV_SESIUNE_CLAUDE = 'Agentul nu pornește alte sesiuni Claude Code (claude, claude.exe sau cli.js din @anthropic-ai/claude-code, rulat cu node): aprobarea scenariului și runda de revizie în plus vin doar din mesajele cursantului, în conversație.';

const MOTOARE = new Set(['hyperframes', 'remotion', 'npx', 'ffmpeg', 'ffprobe', 'ffmpeg.exe', 'ffprobe.exe']);
// Numele de comandă după numeComanda (fără cale, cu minuscule, fără .exe/.cmd/.bat/.ps1): acoperă și claude.exe.
const SESIUNI_CLAUDE = new Set(['claude']);
// Decizia lui Dănuț din 2026-10-06: același CLI, rulat cu node (node.exe) din pachetul npm, e tot comanda claude.
const CLI_CLAUDE = /\/@anthropic-ai\/claude-code\/cli\.js$/;
const VERBE_SCRIERE = new Set([
  'cp', 'mv', 'rm', 'rmdir', 'touch', 'tee', 'sed', 'truncate', 'dd', 'mkdir', 'ln', 'chmod',
  'copy-item', 'move-item', 'remove-item', 'new-item', 'set-content', 'add-content', 'out-file',
  'rename-item', 'clear-content', 'cpi', 'mi', 'ri', 'ni', 'sc', 'ac', 'del', 'erase', 'copy', 'move', 'ren', 'rd',
  // F7 și F17: verbe uzuale care lipseau (multe naturale pe Windows)
  'install', 'rsync', 'shred', 'unlink', 'robocopy', 'xcopy', 'mklink', 'md', 'rni', 'clear-item', 'cli', 'clc',
  'set-item', 'si', 'export-csv', 'epcsv', 'export-clixml', 'tee-object',
  // F7 (coada lungă): copierile spre alt folder
  'scp', 'ditto',
]);
const VERBE_DISTRUCTIVE = new Set([
  'rm', 'rmdir', 'rd', 'remove-item', 'ri', 'del', 'erase', 'mv', 'move', 'mi', 'move-item', 'ren', 'rename-item',
  'shred', 'unlink', 'rni', 'clear-item', 'cli', 'clc',
]);
const NUME_PROTEJATE_SUS = ['motoare', 'nucleu', 'biblioteci', 'video', '.claude', '.git'];
const PREFIXE = new Set([
  'env', 'sudo', 'time', 'nohup', 'exec', 'command', 'nice', 'start', 'start-process', 'saps',
  // F2: prefixele care rulează comanda de după ele
  'builtin', 'timeout', 'stdbuf', 'watch', 'caffeinate', 'coproc',
  // F14: corepack rulează managerul de pachete de după el (corepack pnpm add x)
  'corepack',
]);
// F2: opțiunile prefixelor care primesc o valoare (nice -n 5, stdbuf -o 0, env -C nucleu) și câte argumente
// poziționale stau înaintea comenzii (durata lui timeout). Opțiunile lipite (stdbuf -o0, nice -10, --chdir=x) se sar întregi.
const OPTIUNI_PREFIXE = {
  env: { valoare: ['-u', '--unset', '-C', '--chdir', '-P'], pozitionale: 0 },
  nice: { valoare: ['-n', '--adjustment'], pozitionale: 0 },
  timeout: { valoare: ['-s', '--signal', '-k', '--kill-after'], pozitionale: 1 },
  stdbuf: { valoare: ['-i', '-o', '-e', '--input', '--output', '--error'], pozitionale: 0 },
  watch: { valoare: ['-n', '--interval'], pozitionale: 0 },
  caffeinate: { valoare: ['-t', '-w'], pozitionale: 0 },
};
// F2: atribuirea PowerShell din fața comenzii ($null = Remove-Item ..., [string]$x += ...): comanda rulează oricum.
const VARIABILA_PS = /^(\[[^\]]*\])*\$(\{[^}]*\}|[\w:]+)$/;
const OPERATOR_ATRIBUIRE = /^(?:[-+*/%]|\?\?)?=(.*)$/s;
const ATRIBUIRE_PS = /^(\[[^\]]*\])*\$(\{[^}]*\}|[\w:]+)(?:[-+*/%]|\?\?)?=(.*)$/s;
const INTERPRETOARE = new Set(['node', 'python', 'python3', 'py', 'bash', 'sh', 'zsh', 'dash', 'powershell', 'pwsh']);
const OPTIUNI_NODE_EVAL = new Set(['-e', '--eval', '-p', '--print']);
const OPTIUNI_NODE_CU_VALOARE = new Set(['-r', '--require', '--import', '--loader', '--experimental-loader', '-C', '--conditions', '--env-file', '--input-type', '--title']);
const OPTIUNI_PS_CU_VALOARE = new Set(['-executionpolicy', '-ep', '-ex', '-windowstyle', '-w', '-outputformat', '-of', '-inputformat', '-if', '-workingdirectory', '-wd', '-configurationname', '-version', '-v']);
const ADANCIME_MAXIMA = 3;
// F1: comenzile care schimbă folderul curent; popd și Pop-Location întorc într-un folder pe care garda nu-l știe.
const VERBE_CD = new Set(['cd', 'chdir', 'pushd', 'set-location', 'sl', 'push-location']);
const VERBE_CD_INAPOI = new Set(['popd', 'pop-location']);
const MAXIM_BAZE = 32;
// Țintele care nu sunt fișiere în folderul agentului.
const TINTE_SPECIALE = /^(\/dev\/(null|stdout|stderr|tty)|\$null|nul|con|-)$/i;
// Verbele care cer o cale. Fără o cale scrisă în comandă, ținta vine din pipeline sau dintr-o expresie (...),
// pe care garda nu o poate verifica (D2).
const VERBE_CU_CALE = new Set([
  'rm', 'rmdir', 'touch', 'mkdir', 'cp', 'mv', 'ln', 'chmod', 'truncate', 'sed',
  'remove-item', 'ri', 'del', 'erase', 'rd', 'set-content', 'sc', 'add-content', 'ac', 'out-file', 'clear-content',
  'rename-item', 'ren', 'copy-item', 'cpi', 'copy', 'move-item', 'mi', 'move', 'new-item', 'ni',
  'install', 'shred', 'unlink', 'rni', 'clear-item', 'cli', 'clc', 'set-item', 'si', 'export-csv', 'epcsv', 'export-clixml',
  'md', 'mklink', 'robocopy', 'xcopy', 'rsync', 'scp', 'ditto',
]);
// Aliasurile PowerShell ale verbelor de scriere: parametrii lor se citesc ca la cmdlet-uri (-Path, -Destination).
const ALIASURI_PS = new Set(['cpi', 'mi', 'ri', 'ni', 'sc', 'ac', 'del', 'erase', 'copy', 'move', 'ren', 'rd', 'md', 'rni', 'cli', 'clc', 'si', 'epcsv']);
// Parametrii PowerShell care primesc o cale și cei care primesc altă valoare (se acceptă și prescurtările lor).
const PARAMETRI_CALE_PS = ['path', 'literalpath', 'lp', 'pspath', 'destination', 'filepath', 'outfile', 'destinationpath', 'newname', 'target', 'name'];
const PARAMETRI_VALOARE_PS = [
  'value', 'encoding', 'filter', 'include', 'exclude', 'itemtype', 'type', 'stream', 'delimiter', 'credential', 'inputobject',
  'erroraction', 'ea', 'warningaction', 'wa', 'informationaction', 'ia', 'outvariable', 'ov', 'errorvariable', 'ev',
  'outbuffer', 'ob', 'pipelinevariable', 'pv', 'uri', 'method', 'body', 'headers', 'contenttype', 'useragent', 'timeoutsec',
  'maximumredirection', 'depth', 'width', 'tosession', 'fromsession', 'variable', 'culture', 'compressionlevel',
];
// Opțiunile Bash care primesc o cale, respectiv altă valoare, pe verb.
const OPTIUNI_CALE_BASH = {
  cp: ['-t', '--target-directory'], mv: ['-t', '--target-directory'], ln: ['-t', '--target-directory'],
};
const OPTIUNI_VALOARE_BASH = {
  cp: ['-S', '--suffix'], mv: ['-S', '--suffix'], ln: ['-S', '--suffix'],
  touch: ['-d', '--date', '-r', '--reference', '-t'], truncate: ['-s', '--size', '-r', '--reference'],
  sed: ['-e', '--expression', '-f', '--file', '-l', '--line-length'], mkdir: ['-m', '--mode'],
};
// Copierea lasă sursa neatinsă: contează doar numele fișierului rezultat. Mutarea șterge sursa, deci contează toată calea.
const VERBE_COPIERE = new Set(['cp', 'copy-item', 'cpi', 'copy', 'install', 'scp', 'ditto']);
// F3: la aceste copieri, o sursă cu slash final aduce conținutul folderului (cp-ul BSD de pe Mac), ca la rsync.
// ditto (F7) e tratat aparte în verificaDestinatieFolder: copiază mereu conținutul unui folder sursă.
const COPIERI_CONTINUT_CU_SLASH = new Set(['rsync', 'cp', 'cpi', 'copy-item']);
const VERBE_MUTARE = new Set(['mv', 'move-item', 'mi', 'move']);
// F3 și F7: numele protejate pe care le poate primi un fișier cu nume necunoscut într-un folder (conținutul copiat cu „.”,
// o arhivă, robocopy, find -delete). Pentru o sursă cu tipar (*.mp4) se adaugă și tiparele fără folder fix (MP4, revizie-N.md).
const NUME_PROTEJATE_IN_FOLDER = [
  'verificare.json', 'motor.lock', 'scenariu.md', 'build', 'active', 'cadre', 'serie', 'corecturi',
  'settings.json', 'settings.local.json', 'agents', 'nucleu', 'motoare', 'biblioteci', 'video', '.claude',
];
const NUME_PROTEJATE_PENTRU_TIPAR = [...NUME_PROTEJATE_IN_FOLDER, 'x.mp4', 'revizie-1.md'];
// La aceste verbe doar primul argument fără nume e cale; restul e conținutul (Set-Content <cale> <valoare>).
const DOAR_PRIMA_POZITIONALA = new Set(['set-content', 'sc', 'add-content', 'ac', 'out-file', 'tee-object', 'set-item', 'si', 'export-csv', 'epcsv', 'export-clixml']);
// F7 și F17: descărcările scriu doar unde spun opțiunile de ieșire (sau, cu -O la curl și implicit la wget, în folderul curent).
const VERBE_DESCARCARE = new Set(['curl', 'wget', 'invoke-webrequest', 'iwr', 'invoke-restmethod', 'irm']);
const CURL_CU_VALOARE = new Set([
  '-H', '--header', '-d', '--data', '--data-raw', '--data-binary', '--data-urlencode', '-X', '--request', '-u', '--user',
  '-A', '--user-agent', '-e', '--referer', '-b', '--cookie', '-F', '--form', '-m', '--max-time', '-x', '--proxy',
  '-w', '--write-out', '-T', '--upload-file', '-K', '--config', '-r', '--range', '--connect-timeout', '--retry', '-U', '--proxy-user',
]);
const WGET_CU_VALOARE = new Set(['-U', '--user-agent', '--header', '-e', '--execute', '-t', '--tries', '-T', '--timeout', '--user', '--password', '-i', '--input-file']);
// F14: subcomenzile npm, pnpm și yarn care schimbă node_modules sau package*.json, și opțiunile care aleg folderul.
const SUBCOMENZI_NPM_SCRIU = new Set([
  'install', 'i', 'in', 'ins', 'inst', 'insta', 'instal', 'isnt', 'isntall', 'add', 'ci', 'clean-install', 'ic',
  'install-clean', 'isntall-clean', 'install-test', 'it', 'install-ci-test', 'cit', 'uninstall', 'un', 'unlink', 'remove',
  'rm', 'r', 'link', 'ln', 'update', 'up', 'upgrade', 'udpate', 'dedupe', 'ddp', 'prune', 'rebuild', 'rb', 'import', 'patch',
]);
const OPTIUNI_NPM_FOLDER = new Set(['--prefix', '-C', '--cwd', '--dir']);
const OPTIUNI_NPM_CU_VALOARE = new Set([...OPTIUNI_NPM_FOLDER, '--workspace', '-w', '--filter', '-F', '--registry', '--cache', '--userconfig', '--globalconfig', '--loglevel']);
// Apelurile statice .NET care scriu fișiere, de exemplu [System.IO.File]::WriteAllText(<cale>, ...) (F17).
// F7: la Copy și Move ținta e al doilea argument, la Replace al doilea și al treilea (copia de rezervă).
const APEL_NET_SCRIERE = /\]\s*::\s*(Write|Append|Create|Copy|Move|Delete|Replace|Open|Set)\w*\s*\(([^)]*)/gi;
// F7: obiectele .NET create cu New-Object care scriu în fișierul dat ca argument.
const OBIECT_NET_SCRIERE = /\bnew-object\s+(?:-typename\s+)?(?:system\.)?io\.(?:streamwriter|filestream|binarywriter)\b([^;|\n]*)/i;
// Seiful cheilor (felia 5): agentul nu rulează cheie.py (nici prin glob), keyring, Python-ul din unelte/python și nici
// apelurile directe către seif. Limita: un script scris pe disc și rulat apoi nu se vede aici; garda nu e o barieră
// completă între agent și seiful aceluiași utilizator, doar oprește drumurile evidente.
const CITIRE_SEIF = /chei[^\s/\\'"]*\.py|unelte[\\/]+python(?:[\\/]|\b)|\bkeyring\b|get_password|get_credential|find-(generic|internet)-password|passwordvault|credread|get-storedcredential/i;
// Subcomenzile lui mg scrise literal; altceva în locul lor (variabilă, substituție, lipsă) cere aprobare.
const SUBCOMENZI_MG = new Set(['doctor', 'nou', 'desen', 'randeaza', 'corectura', 'actualizeaza', 'help', '--help', '-h']);
const NODE_REDEFINIT = /(?:^|[\s;&|({])(?:function\s+node\b|node\s*\(\s*\)|alias\s+node\s*=|(?:set|new)-alias\b[^;|&\n]*\bnode\b)/i;
// Codul în linie care scrie fișiere (node -e, python -c, here-doc), recunoscut după numele funcțiilor.
const COD_CARE_SCRIE = /(write|append|create|copy|move|rename|unlink|remove|delete|replace|truncate|symlink|mkdir|makedirs|rmdir|rmtree|chmod)\w*\s*\(|\b(rm|cp)(Sync)?\s*\(|\bopen\s*\([^)]*,\s*['"][wax]|\bshutil\.|\bos\.(remove|unlink|rename|replace)|(Out-File|Set-Content|Add-Content|New-Item|Remove-Item|Copy-Item|Move-Item)\b/i;
const OPTIUNI_XARGS_CU_VALOARE = new Set(['-I', '-i', '-n', '-P', '-d', '-L', '-l', '-s', '-E', '-e', '-a', '--max-args', '--replace', '--delimiter', '--max-procs', '--arg-file']);
// F7: parallel <opțiuni> <comandă> ::: <argumente>; argumentele din fișiere (::::, -a) nu se văd.
const OPTIUNI_PARALLEL_CU_VALOARE = new Set(['-j', '--jobs', '-S', '--sshlogin', '-N', '-n', '--max-args', '-I', '--delay', '--joblog', '--results', '--colsep', '-C', '-d', '--delimiter', '--timeout', '--tagstring', '-E', '--eof']);
const OPTIUNI_PARALLEL_FISIER = new Set(['-a', '--arg-file']);

const ESCAPABILE_BACKSLASH = new Set([' ', '\t', '"', "'", '\\', ';', '&', '|', '>', '<', '(', ')', '$', '`', '\n']);
const ESCAPABILE_IN_GHILIMELE = new Set(['"', '\\', '$', '`']);
// Cuvintele cheie de control din fața verbului (Bash și PowerShell); se sar ca prefixele (F2).
const CUVINTE_CHEIE = new Set(['if', 'then', 'elif', 'else', 'do', 'while', 'until', '!', 'try', 'catch', 'finally']);

const GHILIMELE_DUBLE_PS = new Set(['"', '\u201C', '\u201D', '\u201E']);
const GHILIMELE_SIMPLE_PS = new Set(["'", '\u2018', '\u2019', '\u201A', '\u201B']);

/**
 * Împarte o comandă Bash sau PowerShell în subcomenzi, fiecare o listă de cuvinte.
 * Separatori: ';', '&&', '||', '|', '&', newline, '(', ')', '{' și '}' (acoladele lui ${...} rămân în cuvânt;
 * la `{ bash: true }`, '{' și '}' separă doar când stau singure, ca în Bash). Redirecționările ('>', '>>', '2>', '&>', '*>')
 * devin cuvinte separate; '2>&1' dă cuvintele '2>' și '&1'. '\' scapă doar caracterele speciale
 * (deci 'nucleu\mg.mjs' rămâne neatins), '`' scapă caracterul următor (PowerShell).
 * La `{ bash: true }`, '\x' devine 'x' pentru orice x (așa citește Bash 'n\ucleu/mg.mjs'), iar '#' la început de cuvânt
 * deschide un comentariu până la capătul rândului.
 * La `{ powershell: true }`, citirea e cea din PowerShell (F6): '\' e un caracter obișnuit, '`' e escape, '' și "" dau
 * ghilimeaua în interiorul ghilimelelor, ghilimelele tipografice sunt ghilimele, '#' la început de cuvânt și <# ... #>
 * sunt comentarii.
 * În afara lui PowerShell, redirecționările de intrare necitate ('<', '<<', '<<-', '<<<') dispar împreună cu cuvântul
 * de după ele (fișierul citit, delimitatorul here-doc-ului): nu sunt căi de scris (F7, xargs rm < lista.txt).
 * Un '<' între ghilimele rămâne cuvânt obișnuit.
 * @param {string} comanda
 * @param {{ bash?: boolean, powershell?: boolean }} [optiuni]
 * @returns {string[][] | null} null dacă ghilimelele sau un comentariu <# nu se închid
 */
export function imparteComanda(comanda, { bash = false, powershell = false } = {}) {
  if (typeof comanda !== 'string') return null;
  const text = comanda.replace(/\r\n?/g, '\n');
  /** @type {string[][]} */
  const grupuri = [];
  /** @type {string[]} */
  let curent = [];
  let token = '';
  let areToken = false;
  // F7: cuvântul de după o redirecționare de intrare se sare
  let sariIntrare = false;
  const inchideToken = () => {
    if (areToken) {
      if (sariIntrare) sariIntrare = false;
      else curent.push(token);
    }
    token = '';
    areToken = false;
  };
  const inchideGrup = () => {
    inchideToken();
    sariIntrare = false;
    if (curent.length > 0) grupuri.push(curent);
    curent = [];
  };
  // Acoladele lui ${...} rămân în cuvânt; celelalte acolade închid grupul (F2).
  let acoladeVariabila = 0;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    const urm = text[i + 1];
    if (powershell && c === '<' && urm === '#') {
      const sfarsit = text.indexOf('#>', i + 2);
      if (sfarsit === -1) return null;
      inchideToken();
      i = sfarsit + 2;
      continue;
    }
    if ((bash || powershell) && c === '#' && !areToken) {
      while (i < text.length && text[i] !== '\n') i += 1;
      continue;
    }
    if (c === '{' && token.endsWith('$')) { token += c; areToken = true; acoladeVariabila += 1; i += 1; continue; }
    if (c === '}' && acoladeVariabila > 0) { token += c; acoladeVariabila -= 1; i += 1; continue; }
    if (c === '{' || c === '}') {
      // În Bash, „{” și „}” sunt cuvinte rezervate doar singure („{ rm x; }”); lipite de text („{a,b}”), rămân în cuvânt.
      const singur = !areToken && (urm === undefined || /[\s;|&)]/.test(urm));
      if (!bash || singur) { inchideGrup(); i += 1; continue; }
    }
    if (powershell && GHILIMELE_SIMPLE_PS.has(c)) {
      let j = i + 1;
      let inchis = false;
      while (j < text.length) {
        if (GHILIMELE_SIMPLE_PS.has(text[j])) {
          if (GHILIMELE_SIMPLE_PS.has(text[j + 1] ?? '')) { token += "'"; j += 2; continue; }
          inchis = true;
          break;
        }
        token += text[j];
        j += 1;
      }
      if (!inchis) return null;
      areToken = true;
      i = j + 1;
      continue;
    }
    if (powershell && GHILIMELE_DUBLE_PS.has(c)) {
      let j = i + 1;
      let inchis = false;
      while (j < text.length) {
        const d = text[j];
        if (GHILIMELE_DUBLE_PS.has(d)) {
          if (GHILIMELE_DUBLE_PS.has(text[j + 1] ?? '')) { token += '"'; j += 2; continue; }
          inchis = true;
          break;
        }
        if (d === '`' && j + 1 < text.length) { token += text[j + 1]; j += 2; continue; }
        token += d;
        j += 1;
      }
      if (!inchis) return null;
      areToken = true;
      i = j + 1;
      continue;
    }
    if (c === "'") {
      const sfarsit = text.indexOf("'", i + 1);
      if (sfarsit === -1) return null;
      token += text.slice(i + 1, sfarsit);
      areToken = true;
      i = sfarsit + 1;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let inchis = false;
      while (j < text.length) {
        const d = text[j];
        if (d === '"') { inchis = true; break; }
        if (d === '`' && !bash && j + 1 < text.length) { token += text[j + 1]; j += 2; continue; }
        if (d === '\\' && j + 1 < text.length && ESCAPABILE_IN_GHILIMELE.has(text[j + 1])) { token += text[j + 1]; j += 2; continue; }
        token += d;
        j += 1;
      }
      if (!inchis) return null;
      areToken = true;
      i = j + 1;
      continue;
    }
    // În Bash, backtick-ul e substituție de comandă, nu escape: rămâne în cuvânt, ca garda să vadă ținta nesigură (D2).
    if (bash && c === '`') { token += c; areToken = true; i += 1; continue; }
    if (c === '`') {
      if (urm === undefined) { i += 1; continue; }
      if (urm !== '\n') { token += urm; areToken = true; }
      i += 2;
      continue;
    }
    if (!powershell && c === '\\' && urm !== undefined && (bash || ESCAPABILE_BACKSLASH.has(urm))) {
      if (urm !== '\n') { token += urm; areToken = true; }
      i += 2;
      continue;
    }
    if (c === ' ' || c === '\t') { inchideToken(); i += 1; continue; }
    if (c === ';' || c === '\n' || c === '(' || c === ')') { inchideGrup(); i += 1; continue; }
    if (c === '|') { inchideGrup(); i += urm === '|' ? 2 : 1; continue; }
    if (c === '&') {
      if (urm === '&') { inchideGrup(); i += 2; continue; }
      if (urm === '>') {
        inchideToken();
        sariIntrare = false;
        const dublu = text[i + 2] === '>';
        curent.push(dublu ? '&>>' : '&>');
        i += dublu ? 3 : 2;
        continue;
      }
      inchideGrup();
      i += 1;
      continue;
    }
    if (c === '>') {
      let operator = '>';
      if (areToken && /^(\d|\*)$/.test(token)) {
        operator = token + '>';
        token = '';
        areToken = false;
      } else {
        inchideToken();
      }
      sariIntrare = false;
      let j = i + 1;
      if (text[j] === '>') { operator += '>'; j += 1; } else if (text[j] === '|') { operator += '|'; j += 1; }
      if (text[j] === '&' && !/\d/.test(text[j + 1] ?? '')) { operator += '&'; j += 1; }
      curent.push(operator);
      if (text[j] === '&' && /\d/.test(text[j + 1] ?? '')) { curent.push('&' + text[j + 1]); j += 2; }
      i = j;
      continue;
    }
    // <( e substituție de proces, <> deschide și pentru scriere, <& dublează un descriptor: rămân cum erau
    if (!powershell && c === '<' && urm !== '(' && urm !== '>' && urm !== '&') {
      inchideToken();
      let lungime = 1;
      if (urm === '<') lungime = text[i + 2] === '<' || text[i + 2] === '-' ? 3 : 2;
      i += lungime;
      sariIntrare = true;
      continue;
    }
    token += c;
    areToken = true;
    i += 1;
  }
  inchideGrup();
  return grupuri;
}

/**
 * Decizia gărzii pentru o comandă Bash sau PowerShell (harta 4.13, regulile 1-8).
 * Precedența între subcomenzi: refuza > intreaba > permite.
 * Căile relative se rezolvă față de baza (cwd-ul din intrarea hook-ului, cu rădăcina ca rezervă) și față de
 * folderele în care duc cd-urile literale din comandă (F1). O scriere a cărei țintă nu se poate stabili sigur se refuză (D2).
 * @param {string} comanda
 * @param {'Bash'|'PowerShell'} unealta
 * @param {string} radacina
 * @param {string} [baza] folderul în care rulează comanda; implicit radacina
 * @returns {Decizie}
 */
export function decideComanda(comanda, unealta, radacina, baza = radacina) {
  // O excepție urcă la proceseazaHook, care refuză cu motivul de eroare internă și pune stack-ul pe stderr (F18).
  return decideIntern(comanda, unealta, radacina, [baza], 0);
}

/**
 * @param {string} comanda
 * @param {'Bash'|'PowerShell'} unealta
 * @param {string} radacina
 * @param {(string|null)[]} bazeInitiale folderele în care poate rula comanda; null = necunoscut
 * @param {number} adancime
 * @returns {Decizie}
 */
function decideIntern(comanda, unealta, radacina, bazeInitiale, adancime) {
  if (adancime > ADANCIME_MAXIMA || typeof comanda !== 'string') return refuz(MOTIV_NEINTELES);
  // (1) cheie în text
  const cheie = gasesteCheie(comanda);
  if (cheie) {
    return refuz(`Comanda conține ceva ce arată a cheie API (${cheie.tip}). Cheile nu se scriu în comenzi sau în fișiere; stau doar în seiful sistemului.`);
  }
  // B00-7: garda nu se rulează de mână și chitanțele canarului nu se ating din terminal (nici citite)
  if (/\.canar-refuzuri/i.test(comanda)) return refuz(MOTIV_GARDA_MANUAL);
  // felia 5: seiful cheilor (--instaleaza-keyring e doar opțiunea lui mg doctor) și node redefinit
  if (CITIRE_SEIF.test(comanda.replace(/--instaleaza-keyring\b/gi, ''))) return refuz(MOTIV_CITIRE_CHEIE);
  if (NODE_REDEFINIT.test(comanda)) return refuz(MOTIV_NODE_REDEFINIT);
  const grupuriBash = unealta === 'Bash' ? imparteComanda(comanda, { bash: true }) : [];
  if (grupuriBash === null) return refuz(MOTIV_GHILIMELE);
  // PowerShell citește backslash-ul, comentariile și ghilimelele altfel decât Bash; grupurile se judecă împreună (F6).
  const grupuriPs = unealta === 'PowerShell' ? imparteComanda(comanda, { powershell: true }) : [];
  if (grupuriPs === null) return refuz(MOTIV_GHILIMELE);
  // F6 (D2): în PowerShell, „\” nu scapă ghilimeaua ("video\"); dacă doar citirea generică lasă ghilimele neînchise,
  // contează citirea PowerShell, care e cea reală.
  const grupuri = imparteComanda(comanda) ?? (unealta === 'PowerShell' ? grupuriPs : null);
  if (grupuri === null) return refuz(MOTIV_GHILIMELE);
  // F1: toate folderele în care poate rula o subcomandă. Mulțimea doar crește (un cd dintr-un subshell sau dintr-o
  // ramură if poate să fi rulat sau nu), deci fiecare scriere se judecă față de toate.
  let baze = [...bazeInitiale];
  for (const set of [grupuri, grupuriBash, grupuriPs]) baze = urmaresteCd(set, baze, radacina);
  const ctx = { unealta, radacina, baze, adancime };
  /** @type {Decizie[]} */
  const decizii = [];
  // conținutul lui $(...) și, la Bash, al backtick-urilor se judecă și el ca o comandă
  for (const interior of extrageSubstitutii(comanda, unealta)) {
    decizii.push(decideIntern(interior, unealta, radacina, baze, adancime + 1));
  }
  // here-doc dat unui interpretor, cu o cale protejată în text sau cu o scriere dintr-un folder nesigur
  if (comanda.includes('<<') && grupuri.some((g) => INTERPRETOARE.has(numeComanda(scoatePrefixe(g)[0] ?? '')))) {
    if (pomenesteCaleProtejata(comanda, radacina)) decizii.push(refuz(MOTIV_EVAL));
    else if (COD_CARE_SCRIE.test(comanda) && bazeNesigure(baze, radacina)) decizii.push(refuz(MOTIV_INCERT));
  }
  // F17: un apel static .NET ([System.IO.File]::WriteAllText(...)) nu trece prin verbele de scriere
  if (unealta === 'PowerShell' && /\]\s*::/.test(comanda)) {
    if (pomenesteCaleProtejata(comanda, radacina)) decizii.push(refuz(MOTIV_EVAL));
    for (const m of comanda.matchAll(APEL_NET_SCRIERE)) {
      const verb = m[1].toLowerCase();
      const tinte = m[2].split(',').slice(0, verb === 'replace' ? 3 : (verb === 'copy' || verb === 'move') ? 2 : 1);
      if (tinte.some((t) => /[$(]/.test(t)) || bazeNesigure(baze, radacina)) decizii.push(refuz(MOTIV_INCERT));
    }
  }
  // F7: New-Object System.IO.StreamWriter <cale> scrie fără verb de scriere, ca apelurile statice; ținta e primul argument
  const obiect = unealta === 'PowerShell' ? OBIECT_NET_SCRIERE.exec(comanda) : null;
  if (obiect) {
    if (pomenesteCaleProtejata(comanda, radacina)) decizii.push(refuz(MOTIV_EVAL));
    else if (/[$(]/.test(obiect[1].replace(/^\s*\(/, '').split(',')[0]) || bazeNesigure(baze, radacina)) decizii.push(refuz(MOTIV_INCERT));
  }
  for (const grup of [...grupuri, ...grupuriBash, ...grupuriPs]) decizii.push(decideGrup(grup, ctx));
  return decizii.find((d) => d.decizie === 'refuza')
    ?? decizii.find((d) => d.decizie === 'intreaba')
    ?? PERMITE;
}

function decideGrup(grupBrut, ctxComanda) {
  const { radacina } = ctxComanda;
  /** @type {(string|null)[]} */
  const directoareEnv = [];
  const cuvinte = scoatePrefixe(grupBrut.map((c) => expandeazaVariabile(c, radacina)), directoareEnv);
  if (cuvinte.length === 0) return PERMITE;
  // env -C/--chdir mută folderul doar pentru comanda pe care o rulează env, nu pentru restul liniei și nici pentru
  // redirecționările ei
  const ctx = directoareEnv.length === 0
    ? ctxComanda
    : { ...ctxComanda, baze: directoareEnv.reduce((baze, d) => bazeInFolder(baze, d), ctxComanda.baze) };
  const prim = numeComanda(cuvinte[0]);
  const argumente = cuvinte.slice(1);

  // (7, redirecționări) se aplică tuturor subcomenzilor, inclusiv lui mg; le deschide shell-ul, în folderul lui,
  // înainte ca env -C să schimbe folderul comenzii
  const redirectare = verificaRedirectari(cuvinte, ctxComanda);
  if (redirectare) return redirectare;
  // mg dintr-un șir (Start-Process -ArgumentList, cmd /c, bash -c): subcomanda nu se vede sigur
  if (cuvinte.some((c) => /mg\.mjs["']?\s+\S/i.test(c))) return { decizie: 'intreaba', motiv: MOTIV_MG_INDIRECT };

  // (2) și (3): node <cale spre mg.mjs> ...; garda însăși nu se pornește de mână (chitanța canarului, B00-7)
  if (prim === 'node') {
    const script = scriptNode(argumente);
    if (script && bazaFisier(script.cale) === 'garda.mjs') return refuz(MOTIV_GARDA_MANUAL);
    if (script && bazaFisier(script.cale) === 'mg.mjs') {
      const sub = (argumente[script.index + 1] ?? '').toLowerCase();
      if (sub !== 'genereaza' && !SUBCOMENZI_MG.has(sub)) return { decizie: 'intreaba', motiv: MOTIV_MG_INDIRECT };
      if (sub === 'genereaza') {
        // --estimeaza (felia 5) doar spune costul și ce lipsește, fără să cheltuie; contează doar înainte de `--`,
        // pentru că după el parseArgs îl ia ca argument, iar comanda ar genera
        const dupa = argumente.slice(script.index + 2);
        // reia doar termină o sarcină deja pornită la Kie (sau deja descărcată); nu poate porni alta, deci nu costă
        if (dupa[0] === 'reia') return PERMITE;
        const capat = dupa.indexOf('--');
        if ((capat === -1 ? dupa : dupa.slice(0, capat)).includes('--estimeaza')) return PERMITE;
        return { decizie: 'intreaba', motiv: MOTIV_GENEREAZA };
      }
      if (sub === 'actualizeaza') {
        // --verifica (felia 6) doar aduce și spune ce e nou; tot restul (aplicarea, --inapoi) schimbă kitul
        const dupa = argumente.slice(script.index + 2);
        const capat = dupa.indexOf('--');
        if ((capat === -1 ? dupa : dupa.slice(0, capat)).includes('--verifica')) return PERMITE;
        return { decizie: 'intreaba', motiv: MOTIV_ACTUALIZEAZA };
      }
      return PERMITE;
    }
  }
  // (5) și (6) înaintea lui (4): toate refuză, dar motivul e mai precis
  const upgrade = verificaUpgrade(prim, argumente) ?? verificaInstalareKit(prim, argumente, ctx);
  if (upgrade) return upgrade;
  const publicare = verificaPublicare(prim, argumente);
  if (publicare) return publicare;
  // o sesiune Claude Code imbricată (B13 runda 1), și prin node …/@anthropic-ai/claude-code/cli.js (2026-10-06)
  if (SESIUNI_CLAUDE.has(prim) || esteCliClaude(prim, argumente)) return refuz(MOTIV_SESIUNE_CLAUDE);
  // (4) motoarele rulate direct
  const motor = verificaMotor(prim, argumente);
  if (motor) return motor;
  // (7) scriere în zona kit sau generat
  const scriere = verificaScriere(prim, argumente, ctx) ?? verificaScrieriSpeciale(prim, argumente, ctx);
  if (scriere) return scriere;
  // (8)
  return PERMITE;
}

function refuz(motiv) {
  return { decizie: 'refuza', motiv };
}

function numeComanda(cuvant) {
  const baza = String(cuvant).replace(/\\/g, '/').split('/').pop().toLowerCase();
  return baza.replace(/\.(exe|cmd|bat|ps1|mjs|cjs|js)$/, '');
}

function bazaFisier(cale) {
  return String(cale).replace(/\\/g, '/').split('/').pop().toLowerCase();
}

function numeMotor(cuvant) {
  const t = String(cuvant).toLowerCase();
  const nume = numeComanda(t);
  if (/^hyperframes(@[\w.-]+)?$/.test(nume)) return 'hyperframes';
  if (/^remotion(@[\w.-]+)?$/.test(nume) || /^@remotion\/cli(@[\w.-]+)?$/.test(t)) return 'remotion';
  return null;
}

/**
 * Cuvintele comenzii propriu-zise, fără prefixele din fața ei: atribuiri (X=1, $null =), cuvinte cheie, xargs,
 * parallel (cu argumentele de după ::: puse la coadă), prefixele din PREFIXE cu opțiunile lor și operatorul „.”
 * (dot-source în PowerShell, source în Bash).
 * @param {string[]} cuvinte
 * @param {(string|null)[]} [directoare] primește folderele date lui env -C/--chdir (null dacă lipsește valoarea)
 * @returns {string[]}
 */
function scoatePrefixe(cuvinte, directoare = []) {
  let i = 0;
  while (i < cuvinte.length) {
    const c = cuvinte[i];
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(c)) { i += 1; continue; }
    if (CUVINTE_CHEIE.has(c.toLowerCase()) || c === '.') { i += 1; continue; }
    // F2: $x = <comandă> și $x=<comandă> (lipit) în PowerShell
    const operator = VARIABILA_PS.test(c) ? OPERATOR_ATRIBUIRE.exec(cuvinte[i + 1] ?? '') : null;
    if (operator) {
      cuvinte = [...(operator[1] === '' ? [] : [operator[1]]), ...cuvinte.slice(i + 2)];
      i = 0;
      continue;
    }
    const atribuire = ATRIBUIRE_PS.exec(c);
    if (atribuire) {
      cuvinte = [...(atribuire[3] === '' ? [] : [atribuire[3]]), ...cuvinte.slice(i + 1)];
      i = 0;
      continue;
    }
    if (numeComanda(c) === 'xargs') {
      // xargs <opțiuni> <verb>: verbul primește căile din pipeline, deci se judecă fără ținte scrise (D2)
      i += 1;
      while (i < cuvinte.length && cuvinte[i].startsWith('-')) i += OPTIUNI_XARGS_CU_VALOARE.has(cuvinte[i]) ? 2 : 1;
      continue;
    }
    if (numeComanda(c) === 'parallel') {
      cuvinte = comandaParallel(cuvinte.slice(i + 1));
      i = 0;
      continue;
    }
    const n = numeComanda(c);
    if (PREFIXE.has(n)) {
      i += 1;
      if ((n === 'start-process' || n === 'saps') && (cuvinte[i] ?? '').startsWith('-')) i += 1;
      const spec = OPTIUNI_PREFIXE[n];
      if (spec) {
        while (i < cuvinte.length && cuvinte[i].startsWith('-')) {
          const o = cuvinte[i];
          if (o === '--') { i += 1; break; }
          const egal = o.indexOf('=');
          const cuValoare = egal < 0 && spec.valoare.includes(o);
          // F2: env -C/--chdir mută folderul comenzii, ca un cd
          if (n === 'env' && ['-C', '--chdir'].includes(egal < 0 ? o : o.slice(0, egal))) {
            directoare.push(egal < 0 ? (cuvinte[i + 1] ?? null) : o.slice(egal + 1));
          }
          i += cuValoare ? 2 : 1;
        }
        i += spec.pozitionale;
      }
      continue;
    }
    break;
  }
  return cuvinte.slice(i);
}

/**
 * F7: comanda pe care o rulează parallel, cu argumentele de după ::: puse la coada ei. Argumentele din fișiere
 * (:::: sau -a) nu se văd: în locul lor stă {}, o țintă pe care garda nu o poate verifica (D2).
 * @param {string[]} cuvinte cuvintele de după parallel
 * @returns {string[]}
 */
function comandaParallel(cuvinte) {
  let i = 0;
  let dinFisier = false;
  while (i < cuvinte.length && cuvinte[i].startsWith('-') && !cuvinte[i].startsWith(':::')) {
    if (OPTIUNI_PARALLEL_FISIER.has(cuvinte[i])) dinFisier = true;
    i += OPTIUNI_PARALLEL_CU_VALOARE.has(cuvinte[i]) || OPTIUNI_PARALLEL_FISIER.has(cuvinte[i]) ? 2 : 1;
  }
  const comanda = [];
  const argumente = [];
  let separator = null;
  for (; i < cuvinte.length; i += 1) {
    const c = cuvinte[i];
    if (/^:{3,4}\+?$/.test(c)) { separator = c; if (c.startsWith('::::')) dinFisier = true; continue; }
    if (separator === null) comanda.push(c);
    else if (!separator.startsWith('::::')) argumente.push(c);
  }
  return [...comanda, ...argumente, ...(dinFisier ? ['{}'] : [])];
}

function expandeazaVariabile(text, radacina) {
  return String(text).replace(/\$\{(env:)?CLAUDE_PROJECT_DIR\}|\$env:CLAUDE_PROJECT_DIR\b|\$CLAUDE_PROJECT_DIR\b/gi, () => radacina);
}

function pomenesteCaleProtejata(text, radacina) {
  const t = expandeazaVariabile(text, radacina).replace(/\\/g, '/').toLowerCase();
  return TIPARE_PROTEJATE.some((r) => r.test(t));
}

function extrageSubstitutii(comanda, unealta) {
  const interioare = [];
  for (const m of comanda.matchAll(/\$\(([^()]*)\)/g)) interioare.push(m[1]);
  if (unealta === 'Bash') for (const m of comanda.matchAll(/`([^`]*)`/g)) interioare.push(m[1]);
  return interioare;
}

function primulNeOptiune(argumente) {
  return argumente.find((a) => !a.startsWith('-'))?.toLowerCase() ?? null;
}

function scriptNode(argumente) {
  for (let i = 0; i < argumente.length; i += 1) {
    const a = argumente[i];
    if (OPTIUNI_NODE_EVAL.has(a) || /^--(eval|print)=/.test(a)) return null;
    if (OPTIUNI_NODE_CU_VALOARE.has(a)) { i += 1; continue; }
    if (a.startsWith('-')) continue;
    return { cale: a, index: i };
  }
  return null;
}

/** node <opțiuni> <cale>/@anthropic-ai/claude-code/cli.js: scriptul e CLI-ul lui Claude Code (căi Windows, majuscule). */
function esteCliClaude(prim, argumente) {
  if (prim !== 'node') return false;
  const script = scriptNode(argumente);
  return script !== null && CLI_CLAUDE.test('/' + script.cale.replace(/\\/g, '/').toLowerCase());
}

function valoareOptiune(argumente, optiuni) {
  for (let i = 0; i < argumente.length; i += 1) {
    const a = argumente[i];
    if (optiuni.has(a.toLowerCase())) return argumente[i + 1] ?? '';
    const egal = a.indexOf('=');
    if (egal > 0 && optiuni.has(a.slice(0, egal).toLowerCase())) return a.slice(egal + 1);
  }
  return null;
}

function valoareDupaFlagScurt(argumente, tipar) {
  const i = argumente.findIndex((a) => tipar.test(a));
  return i === -1 ? null : (argumente[i + 1] ?? '');
}

function comandaPowershell(argumente) {
  const iCom = argumente.findIndex((a) => /^-(c|command)$/i.test(a));
  if (iCom !== -1) return argumente.slice(iCom + 1).join(' ');
  if (argumente.some((a) => /^-(f|file)$/i.test(a))) return null;
  const rest = [];
  for (let i = 0; i < argumente.length; i += 1) {
    const a = argumente[i];
    if (OPTIUNI_PS_CU_VALOARE.has(a.toLowerCase())) { i += 1; continue; }
    if (a.startsWith('-')) continue;
    rest.push(a);
  }
  return rest.length > 0 ? rest.join(' ') : null;
}

function globLaRegex(glob) {
  const sursa = glob.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${sursa}$`, 'i');
}

function esteAbsoluta(cale) {
  return /^[\\/]/.test(cale) || /^[A-Za-z]:[\\/]/.test(cale);
}

function uneste(baza, relativ) {
  return `${String(baza).replace(/[\\/]+$/, '')}/${relativ}`;
}

/**
 * O expansiune pe care garda nu o poate rezolva: variabile, substituții, ~, {a,b}, %VAR%, @splat,
 * căi relative la disc (C:x) și căi UNC (D2, F5, F6).
 * @param {string} cale
 */
function areExpansiune(cale) {
  if (/[$`{}]/.test(cale) || /^[~@]/.test(cale) || /%[^%\s]+%/.test(cale)) return true;
  if (/^[A-Za-z]:(?![\\/])/.test(cale)) return true;
  return /^[\\/]{2}/.test(cale) && !/^[\\/]{2}[?.][\\/][A-Za-z]:/.test(cale);
}

/**
 * Ținta unei scrieri pe care garda nu o poate stabili sigur (D2).
 * @param {string|undefined} tinta
 * @param {(string|null)[]} baze
 */
function tintaIncerta(tinta, baze) {
  if (tinta === undefined || tinta === '') return true;
  if (/^&\d$/.test(tinta) || TINTE_SPECIALE.test(tinta)) return false;
  if (areExpansiune(tinta)) return true;
  return !esteAbsoluta(tinta) && baze.includes(null);
}

/** Folderele de lucru sunt nesigure dacă unul e necunoscut sau e în agent, dar nu e rădăcina. */
function bazeNesigure(baze, radacina) {
  return baze.some((b) => {
    if (b === null) return true;
    const z = clasificaCale(b, radacina);
    return z.zona !== 'in-afara' && z.relativ !== '';
  });
}

/** Adaugă folderele noi, fără dubluri; peste MAXIM_BAZE, folderul devine necunoscut. */
function adaugaBaze(baze, noi) {
  const rezultat = [...baze];
  const chei = new Set(rezultat.map((b) => (b === null ? null : normalizeazaCaleText(b))));
  for (const b of noi) {
    const cheie = b === null ? null : normalizeazaCaleText(b);
    if (chei.has(cheie)) continue;
    chei.add(cheie);
    rezultat.push(b);
  }
  if (rezultat.length > MAXIM_BAZE) return [...rezultat.slice(0, MAXIM_BAZE - 1), null];
  return rezultat;
}

function normalizeazaCaleText(cale) {
  return String(cale).replace(/\\/g, '/').replace(/\/+$/, '').normalize('NFC').toLowerCase();
}

/** Argumentul lui cd, Set-Location sau Push-Location: -Path/-LiteralPath sau primul argument; null dacă lipsește. */
function argumentCd(argumente) {
  for (let i = 0; i < argumente.length; i += 1) {
    const a = argumente[i];
    if (a === '-') return '-';
    if (a === '--') return argumente[i + 1] ?? null;
    if (a.startsWith('-')) {
      const m = /^-+([^=:]+)[=:](.*)$/s.exec(a);
      const nume = (m ? m[1] : a.replace(/^-+/, '')).toLowerCase();
      const cale = ['path', 'literalpath', 'lp', 'pspath'].some((p) => p === nume || (nume.length >= 2 && p.startsWith(nume)));
      if (m) { if (cale) return m[2]; continue; }
      if (cale) return argumente[i + 1] ?? null;
      continue;
    }
    return a;
  }
  return null;
}

/**
 * F1: folderele în care duc cd-urile din grupuri, adăugate la baze. Un cd neliteral (variabilă, ~, -, fără argument)
 * sau un popd duce într-un folder necunoscut (null).
 * @param {string[][]} grupuri
 * @param {(string|null)[]} baze
 * @param {string} radacina
 */
function urmaresteCd(grupuri, baze, radacina) {
  let rezultat = [...baze];
  for (const grupBrut of grupuri) {
    // env -C/--chdir nu schimbă folderul shell-ului; îl judecă decideGrup, doar pentru comanda lui env
    const cuvinte = scoatePrefixe(grupBrut.map((c) => expandeazaVariabile(c, radacina)));
    if (cuvinte.length === 0) continue;
    const prim = numeComanda(cuvinte[0]);
    if (prim === 'eval') {
      // F2: un cd rulat prin eval schimbă folderul shell-ului, ca unul scris direct
      const interior = imparteComanda(cuvinte.slice(1).join(' '), { bash: true });
      rezultat = interior === null ? adaugaBaze(rezultat, [null]) : urmaresteCd(interior, rezultat, radacina);
      continue;
    }
    if (VERBE_CD_INAPOI.has(prim)) { rezultat = adaugaBaze(rezultat, [null]); continue; }
    if (!VERBE_CD.has(prim)) continue;
    rezultat = bazeDupaCd(rezultat, argumentCd(cuvinte.slice(1)));
  }
  return rezultat;
}

/**
 * Folderele în care duce tinta, pornind din fiecare bază; o țintă neliterală sau lipsă duce într-un folder necunoscut (null).
 * @param {(string|null)[]} baze
 * @param {string|null} tinta
 * @returns {(string|null)[]}
 */
function bazeInFolder(baze, tinta) {
  if (tinta === null || tinta === '-' || areExpansiune(tinta)) return [null];
  if (esteAbsoluta(tinta)) return [tinta];
  return baze.map((b) => (b === null ? null : uneste(b, tinta)));
}

/**
 * Folderele de lucru după un cd: cele vechi plus cele în care duce cd-ul (poate să fi rulat sau nu).
 * @param {(string|null)[]} baze
 * @param {string|null} tinta
 */
function bazeDupaCd(baze, tinta) {
  return adaugaBaze(baze, bazeInFolder(baze, tinta));
}

/**
 * Zona protejată atinsă de un argument, față de fiecare folder în care poate rula comanda (F1).
 * @param {string} candidat
 * @param {boolean} distructiv
 * @param {{radacina: string, baze: (string|null)[]}} ctx
 */
function zonaProtejata(candidat, distructiv, ctx) {
  if (!candidat || candidat.startsWith('&') || TINTE_SPECIALE.test(candidat)) return null;
  if (esteAbsoluta(candidat)) return zonaProtejataAbsoluta(candidat, distructiv, ctx.radacina);
  for (const baza of ctx.baze) {
    if (baza === null) continue;
    const z = zonaProtejataAbsoluta(uneste(baza, candidat), distructiv, ctx.radacina);
    if (z) return z;
  }
  return null;
}

function zonaProtejataAbsoluta(candidat, distructiv, radacina) {
  // F4: legăturile existente pe disc se urmează
  const z = clasificaCaleReala(candidat, radacina);
  if (z.zona === 'kit' || z.zona === 'generat' || z.zona === 'scenariu' || z.zona === 'configuratie') return z;
  if (z.zona === 'in-afara' || z.relativ === null) return null;
  const copil = clasificaCaleReala(candidat.replace(/[\\/]+$/, '') + '/_', radacina);
  if (copil.zona === 'kit' || copil.zona === 'generat' || copil.zona === 'configuratie') return { zona: copil.zona, relativ: z.relativ, motiv: copil.motiv };
  const relativ = z.relativ === '.' ? '' : z.relativ;
  if (distructiv && relativ === '.claude') {
    return { zona: 'configuratie', relativ, motiv: 'ar șterge sau ar muta configurația lui Claude Code' };
  }
  if (distructiv && (relativ === '' || relativ === 'video' || /^video\/[^/]*[*?[]/.test(relativ))) {
    return { zona: 'kit', relativ: relativ || '.', motiv: 'ar atinge tot folderul agentului sau toate proiectele' };
  }
  const primulSegment = relativ.split('/')[0];
  if (/[*?[]/.test(primulSegment) && NUME_PROTEJATE_SUS.some((n) => globLaRegex(primulSegment).test(n))) {
    return { zona: 'kit', relativ, motiv: 'tiparul atinge un folder protejat' };
  }
  return null;
}

/**
 * SEC-3 (decizia lui Dănuț din 2026-10-06): o cale ștearsă sau mutată din loc care conține tot agentul (un strămoș al
 * rădăcinii, scris relativ, absolut sau cu un tipar în ultimul segment, ca rm -rf ../*) sau un proiect întreg din
 * video/ (aceeași regulă ca la find -delete, în subarboreProtejat). Rădăcina însăși și video/ le refuză deja zonaProtejata.
 * Destinația unei mutări nu trece pe aici: mv poza.png video/p/ nu șterge proiectul.
 * @param {string} candidat
 * @param {{radacina: string, baze: (string|null)[]}} ctx
 * @returns {Decizie|null}
 */
function verificaStergereIntreaga(candidat, ctx) {
  if (!candidat || candidat.startsWith('&') || TINTE_SPECIALE.test(candidat) || areExpansiune(candidat)) return null;
  const absolute = esteAbsoluta(candidat) ? [candidat] : ctx.baze.filter((b) => b !== null).map((b) => uneste(b, candidat));
  for (const abs of absolute) {
    const nume = numeFinal(abs);
    const drumParinte = /[*?[]/.test(nume) ? drumSpreRadacina(folderParinte(abs), ctx.radacina) : null;
    if (drumSpreRadacina(abs, ctx.radacina) !== null || (drumParinte !== null && globLaRegex(nume).test(drumParinte.split('/')[0]))) {
      return refuz(`Comanda ar șterge sau ar muta ${candidat}, un folder în care stă tot agentul (kitul, proiectele din video/ și configurația din .claude/). Nu atinge folderele de deasupra agentului; dacă trebuie făcut curat, șterge doar fișiere anume din video/<proiect>/.`);
    }
    const { relativ } = clasificaCaleReala(abs, ctx.radacina);
    // un fișier existent aflat direct în video/ (o poză lăsată acolo, .DS_Store, Thumbs.db) nu e un proiect
    if (relativ !== null && /^video\/[^/]+$/.test(relativ) && !esteFisierExistent(abs)) {
      // numele cu majusculele scrise de cursant, nu cele din comparația fără majuscule
      const proiect = candidat.split(/[\\/]/).filter((s) => s !== '' && s !== '.').pop() ?? relativ.slice('video/'.length);
      return refuz(`Comanda ar șterge sau ar muta tot proiectul ${candidat} (date.json, scenariu.md, motor.lock, verificare.json, cadre/, MP4-ul și resursele cursantului). Un proiect întreg nu se șterge, nu se mută și nu se redenumește din agent. Pentru o variantă, o copie sau alt nume, fă un proiect nou din el: node nucleu/mg.mjs nou <alt-nume> --din ${proiect} (proiectul vechi rămâne neatins). Dacă proiectul chiar trebuie redenumit sau șters, o face cursantul, singur, în Finder sau în Explorer.`);
    }
  }
  return null;
}

/**
 * Ca zonaProtejata, plus tiparul (*, ?, [) din ultimul segment al unei ținte distructive sau al unei redirecționări:
 * în folderul părinte, tiparul poate da oricare dintre numele protejate pe care le acoperă (aceeași listă ca la
 * copierea cu tipar, F3). De exemplu, rm -f *.json cu folderul curent .claude atinge settings.json.
 * Zona găsită prin tipar poartă în `tipar` tiparul scris în comandă, pentru motivul refuzului.
 * @param {string} candidat
 * @param {boolean} distructiv
 * @param {{radacina: string, baze: (string|null)[]}} ctx
 */
function zonaProtejataTipar(candidat, distructiv, ctx) {
  const z = zonaProtejata(candidat, distructiv, ctx);
  if (z || !candidat) return z;
  const nume = numeFinal(candidat);
  if (!/[*?[]/.test(nume)) return null;
  const faraSlash = candidat.replace(/[\\/]+$/, '');
  const parinte = faraSlash.slice(0, faraSlash.length - nume.length) || '.';
  for (const n of NUME_PROTEJATE_PENTRU_TIPAR.filter((x) => globLaRegex(nume).test(x))) {
    const zn = zonaProtejata(uneste(parinte, n), distructiv, ctx);
    if (zn) return { ...zn, tipar: candidat };
  }
  return null;
}

/** Ce fel de fișier protejat poate atinge un tipar: tipul, nu numele de probă din NUME_PROTEJATE_PENTRU_TIPAR. */
function tipProtejat(z) {
  if (z.zona === 'configuratie') return 'configurația lui Claude Code din .claude/ (settings.json, settings.local.json, agents/)';
  if (z.zona === 'scenariu') return 'scenariu.md';
  if (z.zona === 'kit') return 'kitul agentului (motoare/, nucleu/, biblioteci/)';
  const nume = numeFinal(z.relativ ?? '');
  if (/\.mp4$/i.test(nume)) return 'un MP4 produs de mg';
  if (/^revizie(-schita)?-\d+\.md$/i.test(nume)) return 'un verdict revizie-N.md al revizorului';
  if (['build', 'active', 'cadre', 'serie', 'corecturi'].includes(nume)) return `folderul ${nume}/ al unui proiect, scris de mg`;
  return `${nume}, scris de mg`;
}

function refuzScriere(z) {
  if (z.tipar !== undefined) {
    return refuz(`Tiparul ${z.tipar} poate atinge un fișier protejat: ${tipProtejat(z)}. Scrie o extensie sau un nume precis, de exemplu *.png sau nota.txt.`);
  }
  if (z.zona === 'scenariu') {
    return refuz(`Comanda ar scrie în ${z.relativ}. scenariu.md se modifică doar cu Write sau Edit, ca garda să verifice blocul mg.`);
  }
  if (z.zona === 'configuratie') {
    return refuz(`Comanda ar scrie în ${z.relativ}, care e configurația lui Claude Code (.claude/settings.json, .claude/settings.local.json, .claude/agents/); o modifică doar cursantul, cu mâna lui. Spune-i ce să schimbe și de ce.`);
  }
  const descriere = z.zona === 'generat'
    ? 'care e un fișier produs de mg; îl refaci cu node nucleu/mg.mjs, după ce schimbi date.json'
    : 'care face parte din kit (motoare/, nucleu/, biblioteci/) și nu se modifică';
  return refuz(`Comanda ar scrie în ${z.relativ || '.'}, ${descriere}.`);
}

function candidati(argument) {
  if (argument.startsWith('-')) {
    const m = /^-[^=:]+[=:](.+)$/.exec(argument);
    return m ? [m[1]] : [];
  }
  const egal = argument.indexOf('=');
  return egal > 0 ? [argument, argument.slice(egal + 1)] : [argument];
}

function verificaRedirectari(cuvinte, ctx) {
  for (let i = 0; i < cuvinte.length; i += 1) {
    if (/^(\d|\*|&)?(>>?|>\||>&)$/.test(cuvinte[i])) {
      const tinta = cuvinte[i + 1];
      // o redirecționare fără țintă în același grup are ținta într-o expresie (...) sau {...} (D2)
      if (tintaIncerta(tinta, ctx.baze)) return refuz(MOTIV_INCERT);
      const z = zonaProtejataTipar(tinta, false, ctx);
      if (z) return refuzScriere(z);
    }
  }
  return null;
}

/** Numele ultimului segment al unei căi, fără separatorul final. */
function numeFinal(cale) {
  return String(cale).replace(/[\\/]+$/, '').split(/[\\/]/).pop();
}

/**
 * Sursele și destinația unei copieri sau mutări: -t/--target-directory sau -Destination, altfel ultimul argument
 * (Bash) ori al doilea argument fără nume (PowerShell, unde lipsa destinației înseamnă folderul curent).
 * @param {string} prim
 * @param {string[]} argumente
 * @returns {{ surse: string[], destinatie: string|null }}
 */
function structuraCopiere(prim, argumente) {
  const stilPs = prim.includes('-') || ALIASURI_PS.has(prim);
  let destinatie = null;
  const caleNumita = [];
  const pozitionale = [];
  for (let i = 0; i < argumente.length; i += 1) {
    const a = argumente[i];
    if (a === '--') { pozitionale.push(...argumente.slice(i + 1)); break; }
    if (a.length < 2 || !a.startsWith('-')) { pozitionale.push(a); continue; }
    const m = /^(-{1,2}[^=:]+)[=:](.*)$/s.exec(a);
    const optiune = m ? m[1] : a;
    const valoare = () => { if (m) return m[2]; i += 1; return argumente[i]; };
    if (stilPs) {
      const nume = optiune.replace(/^-+/, '').toLowerCase();
      if (esteParametruPs(nume, ['destination'])) destinatie = valoare() ?? '';
      else if (esteParametruPs(nume, ['path', 'literalpath', 'lp', 'pspath'])) caleNumita.push(valoare() ?? '');
      else if (esteParametruPs(nume, PARAMETRI_VALOARE_PS)) valoare();
    } else if (['-t', '--target-directory'].includes(optiune)) destinatie = valoare() ?? '';
    else if (['-S', '--suffix', '-m', '--mode', '-o', '--owner', '-g', '--group'].includes(optiune)) valoare();
  }
  if (destinatie !== null) return { surse: [...caleNumita, ...pozitionale], destinatie };
  if (stilPs) {
    if (caleNumita.length > 0) return { surse: caleNumita, destinatie: pozitionale[0] ?? '.' };
    if (pozitionale.length === 0) return { surse: [], destinatie: null };
    return { surse: [pozitionale[0], ...pozitionale.slice(2)], destinatie: pozitionale[1] ?? '.' };
  }
  if (pozitionale.length < 2) return { surse: pozitionale, destinatie: null };
  return { surse: pozitionale.slice(0, -1), destinatie: pozitionale[pozitionale.length - 1] };
}

/**
 * F3: cp, mv, ln, Copy-Item și Move-Item într-un folder scriu fișierul cu numele sursei. Garda e pură (nu se uită pe disc),
 * deci verifică mereu și destinatie/nume. O sursă „.”, „..” sau cu tipar (*) aduce nume necunoscute: se verifică
 * toate numele protejate pe care tiparul le poate da.
 * @param {string} prim
 * @param {string[]} argumente
 * @param {{radacina: string, baze: (string|null)[]}} ctx
 * @returns {Decizie|null}
 */
function verificaDestinatieFolder(prim, argumente, ctx) {
  if (prim === 'robocopy' || prim === 'xcopy') {
    // robocopy <sursă> <destinație> [fișiere] /opțiuni: copiază conținutul, cu nume necunoscute (F7)
    const destinatie = argumente.filter((a) => !/^\/[A-Za-z]/.test(a))[1];
    if (destinatie === undefined) return refuz(MOTIV_INCERT);
    if (tintaIncerta(destinatie, ctx.baze)) return refuz(MOTIV_INCERT);
    return continutProtejat(destinatie, ctx);
  }
  if (!VERBE_COPIERE.has(prim) && !VERBE_MUTARE.has(prim) && prim !== 'ln' && prim !== 'rsync') return null;
  const { surse, destinatie } = structuraCopiere(prim, argumente);
  if (destinatie === null || tintaIncerta(destinatie, ctx.baze)) return null;
  // rsync cu --delete șterge din destinație tot ce nu e în sursă
  if (prim === 'rsync' && argumente.some((a) => a.startsWith('--delete'))) return continutProtejat(destinatie, ctx);
  // B1 (felia 2): un folder adus direct sub video/ (sau video/ adus în rădăcină) e un proiect întreg; când destinația
  // video/<x> nu există, cp și mv pun conținutul sursei chiar în ea
  if (poateDuceFolder(prim, argumente)) {
    const rel = relativeFolder(destinatie, ctx);
    const inVideo = rel.some((r) => r === 'video' || r === '');
    const proiect = rel.some((r) => /^video\/[^/]+$/.test(r));
    for (const sursa of surse) {
      const nume = numeFinal(sursa);
      if (!sursaPoateFiFolder(sursa, nume, ctx)) continue;
      const necunoscut = areExpansiune(nume) || /[*?[]/.test(nume) || nume === '' || nume === '.' || nume === '..';
      const d = (proiect ? continutProtejat(destinatie, ctx) : null)
        ?? (inVideo ? continutProtejat(necunoscut ? destinatie : uneste(destinatie, nume), ctx) : null);
      if (d) return d;
    }
  }
  for (const sursa of surse) {
    const nume = numeFinal(sursa);
    if (areExpansiune(nume)) continue;
    const continut = nume === '' || nume === '.' || nume === '..' || prim === 'ditto'
      || (COPIERI_CONTINUT_CU_SLASH.has(prim) && /[\\/]$/.test(sursa));
    const nume2 = continut ? NUME_PROTEJATE_IN_FOLDER
      : /[*?[]/.test(nume) ? NUME_PROTEJATE_PENTRU_TIPAR.filter((n) => globLaRegex(nume).test(n))
        : [nume];
    for (const n of nume2) {
      const z = zonaProtejata(uneste(destinatie, n), false, ctx);
      if (z) return refuzScriere(z);
    }
  }
  return null;
}

/**
 * Un folder în care ajung fișiere cu nume necunoscute (conținutul unei arhive, robocopy, find -delete):
 * refuz dacă vreunul dintre numele protejate ar ajunge sau ar fi atins acolo.
 * @param {string} folder
 * @param {{radacina: string, baze: (string|null)[]}} ctx
 * @returns {Decizie|null}
 */
function continutProtejat(folder, ctx) {
  const z = zonaProtejata(folder, false, ctx);
  if (z) return refuzScriere(z);
  for (const n of NUME_PROTEJATE_IN_FOLDER) {
    const zn = zonaProtejata(uneste(folder, n), false, ctx);
    if (zn) return refuzScriere(zn);
  }
  // B1 (felia 2): în video/ conținutul necunoscut poate fi un proiect întreg, cu verificare.json, MP4 și corecturi/ falsificate
  if (relativeFolder(folder, ctx).includes('video')) return refuz(MOTIV_PROIECT_ADUS);
  return null;
}

const MOTIV_PROIECT_ADUS = 'Comanda ar aduce în video/ foldere cu nume necunoscute, deci și un proiect întreg cu fișiere pe care le scrie doar mg (verificare.json, MP4, cadre/, corecturi/). Un proiect nou se face cu node nucleu/mg.mjs nou <proiect>.';

/** Căile relative la rădăcină ale unui folder, pe fiecare bază cunoscută (null când e în afara folderului agentului). */
function relativeFolder(folder, ctx) {
  const absolute = esteAbsoluta(folder) ? [folder] : ctx.baze.filter((b) => b !== null).map((b) => uneste(b, folder));
  return absolute.map((abs) => clasificaCale(abs, ctx.radacina).relativ).filter((r) => r !== null);
}

/** Copierea sau mutarea poate duce un folder întreg: mv, ln, ditto, rsync, cp -r/-a, Copy-Item -Recurse. */
function poateDuceFolder(prim, argumente) {
  if (VERBE_MUTARE.has(prim) || prim === 'ln' || prim === 'ditto' || prim === 'rsync') return true;
  return argumente.some((a) => /^-[a-zA-Z]*[rRa]/.test(a) || a === '--recursive' || a === '--archive');
}

/**
 * Sursa poate fi un folder: un tipar, un folder existent sau, ca la SEC-3, o cale care lipsește; o cale care lipsește,
 * dar are extensie (poza.png din Descărcări), trece drept fișier. Limita: un folder cu extensie creat în aceeași comandă.
 */
function sursaPoateFiFolder(sursa, nume, ctx) {
  if (areExpansiune(nume) || /[*?[]/.test(nume) || nume === '' || nume === '.' || nume === '..') return true;
  const absolute = esteAbsoluta(sursa) ? [sursa] : ctx.baze.filter((b) => b !== null).map((b) => uneste(b, sursa));
  if (absolute.length === 0) return true;
  return absolute.some((abs) => !esteFisierExistent(abs) && (!/\.[A-Za-z0-9]{1,8}$/.test(nume) || esteFolderExistent(abs)));
}

function esteFolderExistent(cale) {
  return !esteFisierExistent(cale) && esteCaleExistenta(cale);
}

/**
 * Un folder atins în adâncime (find -delete, git clean, git checkout): refuz dacă e o zonă protejată, dacă le conține
 * (rădăcina, video/, video/<proiect>/, .claude/) sau dacă numele protejate ar fi direct în el.
 * @param {string} folder
 * @param {{radacina: string, baze: (string|null)[]}} ctx
 * @returns {Decizie|null}
 */
function subarboreProtejat(folder, ctx) {
  const d = continutProtejat(folder, ctx);
  if (d) return d;
  const absolute = esteAbsoluta(folder) ? [folder] : ctx.baze.filter((b) => b !== null).map((b) => uneste(b, folder));
  for (const abs of absolute) {
    const { relativ } = clasificaCale(abs, ctx.radacina);
    if (relativ === null) continue;
    if (relativ === '' || relativ === 'video' || relativ === '.claude' || /^video\/[^/]+$/.test(relativ)) {
      return refuz(`Comanda ar atinge tot ce e în ${relativ || '.'}, inclusiv fișiere protejate (kitul, fișierele produse de mg sau configurația din .claude/). Alege un folder anume, fără fișiere protejate în el.`);
    }
  }
  return null;
}

/** Numele fișierului dintr-un URL (ce salvează curl -O și wget fără -O). */
function numeDinUrl(url) {
  const nume = String(url).split(/[?#]/)[0].replace(/\/+$/, '').split('/').pop();
  return nume && !/^[a-z]+:$/i.test(nume) ? nume : 'index.html';
}

/** Verifică o țintă de scriere: incertă (D2) sau într-o zonă protejată. */
function verificaTinta(tinta, ctx, distructiv = false) {
  if (tintaIncerta(tinta, ctx.baze)) return refuz(MOTIV_INCERT);
  const z = zonaProtejata(tinta, distructiv, ctx);
  return z ? refuzScriere(z) : null;
}

/** curl, wget, Invoke-WebRequest, Invoke-RestMethod: scriu în -o/-O/-OutFile sau, cu -O/implicit, în folderul curent. */
function verificaDescarcare(prim, argumente, ctx) {
  const tinte = [];
  const urluri = [];
  let numeDinUrlCerut = prim === 'wget';
  let folder = '.';
  for (let i = 0; i < argumente.length; i += 1) {
    const a = argumente[i];
    const urmator = () => { i += 1; return argumente[i]; };
    if (!a.startsWith('-') || a.length < 2) { urluri.push(a); continue; }
    const m = /^(-{1,2}[^=:]+)[=:](.*)$/s.exec(a);
    const optiune = (m ? m[1] : a);
    const mic = optiune.toLowerCase();
    if (mic.length >= 5 && 'outfile'.startsWith(mic.replace(/^-+/, ''))) { tinte.push(m ? m[2] : urmator()); continue; }
    if (prim === 'curl') {
      if (optiune === '--output') { tinte.push(m ? m[2] : urmator()); continue; }
      if (optiune === '--output-dir') { folder = m ? m[2] : urmator(); continue; }
      if (optiune === '--remote-name' || optiune === '--remote-name-all') { numeDinUrlCerut = true; continue; }
      if (CURL_CU_VALOARE.has(optiune)) { if (!m) i += 1; continue; }
      if (/^-[a-zA-Z]+$/.test(a)) {
        if (a.includes('O')) numeDinUrlCerut = true;
        const ultima = `-${a[a.length - 1]}`;
        if (ultima === '-o') tinte.push(urmator());
        else if (CURL_CU_VALOARE.has(ultima)) i += 1;
      }
      continue;
    }
    if (prim === 'wget') {
      if (optiune === '--output-document' || optiune === '--output-file' || optiune === '--append-output') { tinte.push(m ? m[2] : urmator()); numeDinUrlCerut = false; continue; }
      if (optiune === '--directory-prefix') { folder = m ? m[2] : urmator(); continue; }
      if (WGET_CU_VALOARE.has(optiune)) { if (!m) i += 1; continue; }
      if (/^-[a-zA-Z]+$/.test(a)) {
        const ultima = a[a.length - 1];
        if (ultima === 'O') { tinte.push(urmator()); numeDinUrlCerut = false; } else if (ultima === 'o' || ultima === 'a') tinte.push(urmator());
        else if (ultima === 'P') folder = urmator();
        else if (WGET_CU_VALOARE.has(`-${ultima}`)) i += 1;
      } else if (/^-O./.test(a)) { tinte.push(a.slice(2)); numeDinUrlCerut = false; }
      continue;
    }
    if (m === null && /^-(uri|method|body|headers|contenttype|useragent|timeoutsec|credential|maximumredirection)$/i.test(a)) i += 1;
  }
  for (const t of tinte) {
    if (t === '-') continue;
    const d = verificaTinta(t ?? '', ctx);
    if (d) return d;
  }
  if (numeDinUrlCerut) {
    if (tintaIncerta(folder, ctx.baze)) return refuz(MOTIV_INCERT);
    for (const url of urluri) {
      const nume = numeDinUrl(url);
      if (areExpansiune(nume)) return refuz(MOTIV_INCERT);
      const d = verificaTinta(uneste(folder, nume), ctx);
      if (d) return d;
    }
  }
  return null;
}

/** unzip, tar și Expand-Archive: despachetează nume necunoscute într-un folder (implicit cel curent). */
function verificaDespachetare(prim, argumente, ctx) {
  if (prim === 'unzip') {
    if (argumente.some((a) => /^-[a-zA-Z]*[ltvZpcz]/.test(a) && !/^-[a-zA-Z]*[od]/.test(a) && a !== '-o')) return null;
    const i = argumente.indexOf('-d');
    const folder = i === -1 ? (argumente.find((a) => /^-d./.test(a))?.slice(2) ?? '.') : (argumente[i + 1] ?? '');
    if (tintaIncerta(folder, ctx.baze)) return refuz(MOTIV_INCERT);
    return continutProtejat(folder, ctx);
  }
  if (prim === 'tar') {
    const grupLitere = argumente.filter((a, k) => (k === 0 && /^[a-zA-Z]+$/.test(a)) || /^-[a-zA-Z]+$/.test(a)).join('');
    const extrage = /x/.test(grupLitere) || argumente.some((a) => a === '--extract' || a === '--get');
    const creeaza = /[cru]/.test(grupLitere) || argumente.some((a) => ['--create', '--append', '--update', '--concatenate'].includes(a));
    let arhiva = null;
    let folder = '.';
    for (let k = 0; k < argumente.length; k += 1) {
      const a = argumente[k];
      if (a.startsWith('--file=')) arhiva = a.slice(7);
      else if (a === '--file') arhiva = argumente[k + 1] ?? '';
      else if (a.startsWith('--directory=')) folder = a.slice(12);
      else if (a === '--directory' || a === '-C') folder = argumente[k + 1] ?? '';
      else if (((k === 0 && /^[a-zA-Z]+$/.test(a)) || /^-[a-zA-Z]+$/.test(a)) && a.includes('f')) arhiva = argumente[k + 1] ?? '';
    }
    if (creeaza && arhiva !== null && arhiva !== '-') {
      const d = verificaTinta(arhiva, ctx);
      if (d) return d;
    }
    if (extrage) {
      if (tintaIncerta(folder, ctx.baze)) return refuz(MOTIV_INCERT);
      return continutProtejat(folder, ctx);
    }
    return null;
  }
  // Expand-Archive [-Path] <arhivă> [-DestinationPath] <folder>
  const destinatie = sursaSiDestinatiePs(argumente, ['destinationpath'], ['path', 'literalpath', 'lp']).destinatie ?? '.';
  if (tintaIncerta(destinatie, ctx.baze)) return refuz(MOTIV_INCERT);
  return continutProtejat(destinatie, ctx);
}

/**
 * Sursele și destinația unui cmdlet de forma <Cmdlet> [-Sursă] <x> [-Destinație] <y> (Expand-Archive, Compress-Archive,
 * Start-BitsTransfer): parametrii numiți sau, fără ei, primele două argumente fără nume.
 * @param {string[]} argumente
 * @param {string[]} parametriDestinatie
 * @param {string[]} parametriSursa
 * @returns {{ surse: string[], destinatie: string|null }}
 */
function sursaSiDestinatiePs(argumente, parametriDestinatie, parametriSursa) {
  let destinatie = null;
  const surse = [];
  const pozitionale = [];
  for (let i = 0; i < argumente.length; i += 1) {
    const a = argumente[i];
    if (!a.startsWith('-') || a.length < 2) { pozitionale.push(a); continue; }
    const m = /^(-{1,2}[^=:]+)[=:](.*)$/s.exec(a);
    const nume = (m ? m[1] : a).replace(/^-+/, '').toLowerCase();
    const valoare = () => { if (m) return m[2]; i += 1; return argumente[i] ?? ''; };
    if (esteParametruPs(nume, parametriDestinatie)) destinatie = valoare();
    else if (esteParametruPs(nume, parametriSursa)) surse.push(valoare());
    else if (esteParametruPs(nume, PARAMETRI_VALOARE_PS)) valoare();
  }
  if (surse.length === 0 && pozitionale.length > 0) surse.push(pozitionale.shift());
  return { surse, destinatie: destinatie ?? pozitionale[0] ?? null };
}

/**
 * F7 (coada lungă): scrierile cu ținta într-o opțiune sau într-o poziție anume: sort -o, patch, zip,
 * Compress-Archive și Start-BitsTransfer.
 * @param {string} prim
 * @param {string[]} argumente
 * @param {{radacina: string, baze: (string|null)[]}} ctx
 * @returns {Decizie|null}
 */
function verificaTintaOptiune(prim, argumente, ctx) {
  if (prim === 'sort') {
    for (let i = 0; i < argumente.length; i += 1) {
      const a = argumente[i];
      const tinta = a === '-o' || a === '--output' ? argumente[i + 1] ?? ''
        : a.startsWith('--output=') ? a.slice(9) : /^-o./.test(a) ? a.slice(2) : null;
      if (tinta === null) continue;
      const d = verificaTinta(tinta, ctx);
      if (d) return d;
    }
    return null;
  }
  if (prim === 'patch') {
    // patch [opțiuni] [fișier [patch]]; fără fișier, numele vin din diff, deci se verifică folderul (ca la git apply)
    const cuValoare = new Set(['-i', '--input', '-p', '--strip', '-B', '--prefix', '-z', '--suffix', '-r', '--reject-file', '-D', '--ifdef', '-F', '--fuzz', '-V', '--version-control', '-Y', '--basename-prefix']);
    let folder = '.';
    const tinte = [];
    const pozitionale = [];
    for (let i = 0; i < argumente.length; i += 1) {
      const a = argumente[i];
      if (a === '-o' || a === '--output') tinte.push(argumente[++i] ?? '');
      else if (a.startsWith('--output=')) tinte.push(a.slice(9));
      else if (a === '-d' || a === '--directory') folder = argumente[++i] ?? '';
      else if (a.startsWith('--directory=')) folder = a.slice(12);
      else if (cuValoare.has(a)) i += 1;
      else if (!a.startsWith('-')) pozitionale.push(a);
    }
    if (tintaIncerta(folder, ctx.baze)) return refuz(MOTIV_INCERT);
    if (pozitionale.length > 0) tinte.push(esteAbsoluta(pozitionale[0]) ? pozitionale[0] : uneste(folder, pozitionale[0]));
    for (const t of tinte.filter((x) => x !== '-')) {
      const d = verificaTinta(t, ctx);
      if (d) return d;
    }
    return tinte.length === 0 ? continutProtejat(folder, ctx) : null;
  }
  if (prim === 'zip') {
    // zip [opțiuni] <arhivă> <fișiere>; -O scrie arhiva nouă în alt fișier
    const cuValoare = new Set(['-b', '--temp-path', '-n', '--suffixes', '-t', '-tt', '-P', '--password']);
    const tinte = [];
    for (let i = 0; i < argumente.length; i += 1) {
      const a = argumente[i];
      if (a === '-O' || a === '--output-file') { tinte.push(argumente[++i] ?? ''); continue; }
      if (cuValoare.has(a)) { i += 1; continue; }
      if (a.startsWith('-') && a !== '-') continue;
      tinte.push(a);
      break;
    }
    for (const t of tinte.filter((x) => x !== '-')) {
      const d = verificaTinta(t, ctx);
      if (d) return d;
    }
    return null;
  }
  if (prim === 'compress-archive') {
    const { destinatie } = sursaSiDestinatiePs(argumente, ['destinationpath'], ['path', 'literalpath', 'lp']);
    return verificaTinta(destinatie ?? '', ctx);
  }
  if (prim === 'start-bitstransfer') {
    // fără -Destination, fișierul ajunge în folderul curent, cu numele din URL
    const { surse, destinatie } = sursaSiDestinatiePs(argumente, ['destination'], ['source']);
    const folder = destinatie ?? '.';
    if (destinatie !== null) {
      const d = verificaTinta(destinatie, ctx);
      if (d) return d;
    }
    for (const sursa of surse) {
      const d = verificaTinta(uneste(folder, numeDinUrl(sursa)), ctx);
      if (d) return d;
    }
    return null;
  }
  return null;
}

/** find cu -delete sau -exec: atinge tot ce e sub punctele de pornire. */
function verificaFind(argumente, ctx) {
  const pornire = [];
  let k = 0;
  while (k < argumente.length && !/^[-(!]/.test(argumente[k])) { pornire.push(argumente[k]); k += 1; }
  if (argumente.some((a) => ['-delete', '-fprint', '-fprint0', '-fprintf', '-fls'].includes(a))) {
    for (const p of pornire.length > 0 ? pornire : ['.']) {
      if (tintaIncerta(p, ctx.baze)) return refuz(MOTIV_INCERT);
      const d = subarboreProtejat(p, ctx);
      if (d) return d;
    }
  }
  // -exec <comandă> {} ; se judecă la fel ca o comandă scrisă direct; {} e o țintă pe care garda nu o vede (D2)
  for (; k < argumente.length; k += 1) {
    if (!['-exec', '-execdir', '-ok', '-okdir'].includes(argumente[k])) continue;
    const comanda = [];
    for (k += 1; k < argumente.length && ![';', '\\;', '+'].includes(argumente[k]); k += 1) comanda.push(argumente[k]);
    const d = decideGrup(comanda, ctx);
    if (d.decizie !== 'permite') return d;
  }
  return null;
}

// felia 6: în folderul agentului, git trece doar cu subcomenzile care nu schimbă arborele de lucru, refs-urile sau
// configurația depozitului (după review: o listă de interzise lăsa aliasuri, -C <subfolder> și config/remote să scape).
// apply, clean, clone, restore, rm, mv și checkout cu „--” au regulile lor, pe căi, mai jos.
const GIT_SIGURE = new Set(['status', 'log', 'diff', 'show', 'rev-parse', 'fetch', 'ls-files', 'ls-tree', 'cat-file', 'branch',
  'tag', 'describe', 'blame', 'grep', 'shortlog', 'rev-list', 'reflog', 'merge-base', 'for-each-ref', 'name-rev', 'show-ref',
  'count-objects', 'check-ignore', 'check-attr', 'whatchanged', 'help', 'version', 'var', 'diff-tree', 'diff-files', 'diff-index']);
const GIT_PE_CAI = new Set(['apply', 'clean', 'clone', 'restore', 'rm', 'mv', 'checkout']);
// Chei -c inofensive (afișare); orice altă cheie poate pune un alias, un hook sau alt arbore de lucru.
const GIT_CHEI_SIGURE = /^(color\.|core\.quotepath$|core\.pager$|pager\.|log\.|i18n\.)/i;

function gitConfigCiteste(rest) {
  const poz = rest.filter((a) => !a.startsWith('-'));
  if (rest.some((a) => /^--get(-all|-regexp|-urlmatch|-color|colorbool)?$/.test(a) || a === '-l' || a === '--list')) return true;
  if (['get', 'list'].includes((poz[0] ?? '').toLowerCase())) return true;
  return poz.length === 1 && !rest.some((a) => ['--unset', '--unset-all', '--add', '--replace-all', '--edit', '-e', '--rename-section', '--remove-section'].includes(a));
}

function gitRemoteCiteste(rest) {
  const poz = rest.filter((a) => !a.startsWith('-'));
  return poz.length === 0 || ['show', 'get-url'].includes((poz[0] ?? '').toLowerCase());
}

/** git checkout/restore/rm/mv/clean/apply: scriu în arborele de lucru, cu căile față de -C; restul, prin GIT_SIGURE. */
function verificaGit(argumente, ctx) {
  let bazeGit = ctx.baze;
  const depozite = [];
  const chei = [];
  const laBaze = (dir) => (areExpansiune(dir) ? [null] : esteAbsoluta(dir) ? [dir] : bazeGit.map((b) => (b === null ? null : uneste(b, dir))));
  let i = 0;
  while (i < argumente.length) {
    const a = argumente[i];
    if (a === '-C') {
      bazeGit = laBaze(argumente[i + 1] ?? '');
      i += 2;
      continue;
    }
    const egal = /^(--git-dir|--work-tree|--config-env)=(.*)$/.exec(a);
    if (egal) {
      if (egal[1] === '--config-env') chei.push(egal[2].split('=')[0]);
      else depozite.push(...laBaze(egal[2]));
      i += 1;
      continue;
    }
    if (a === '--git-dir' || a === '--work-tree') { depozite.push(...laBaze(argumente[i + 1] ?? '')); i += 2; continue; }
    if (a === '-c' || a === '--config-env') { chei.push(String(argumente[i + 1] ?? '').split('=')[0]); i += 2; continue; }
    if (a === '--namespace') { i += 2; continue; }
    if (a.startsWith('-')) { i += 1; continue; }
    break;
  }
  const sub = (argumente[i] ?? '').toLowerCase();
  const rest = argumente.slice(i + 1);
  const ctxGit = { ...ctx, baze: bazeGit };
  const sigur = GIT_SIGURE.has(sub) || (sub === 'config' && gitConfigCiteste(rest)) || (sub === 'remote' && gitRemoteCiteste(rest))
    || (GIT_PE_CAI.has(sub) && !(sub === 'checkout' && !rest.includes('--')));
  if (!sigur || chei.some((k) => !GIT_CHEI_SIGURE.test(k))) {
    const tinte = [...bazeGit, ...depozite];
    if (tinte.includes(null)) return refuz(MOTIV_INCERT);
    if (tinte.some((d) => clasificaCale(d, ctx.radacina).zona !== 'in-afara')) return refuz(MOTIV_GIT_KIT);
    if (!GIT_PE_CAI.has(sub)) return null;
  }
  if (sub === 'apply') {
    if (rest.some((a) => ['--check', '--stat', '--numstat', '--summary', '--cached'].includes(a))) return null;
    return continutProtejat('.', ctxGit);
  }
  if (sub === 'clean') {
    if (rest.some((a) => a === '-n' || a === '--dry-run' || /^-[a-zA-Z]*n/.test(a))) return null;
    const cai = rest.filter((a) => !a.startsWith('-'));
    for (const c of cai.length > 0 ? cai : ['.']) {
      const d = tintaIncerta(c, bazeGit) ? refuz(MOTIV_INCERT) : subarboreProtejat(c, ctxGit);
      if (d) return d;
    }
    return null;
  }
  if (sub === 'clone') {
    // B1 (felia 2): clona aduce nume necunoscute în folderul ei (implicit numele depozitului)
    const cuValoareClone = new Set(['-b', '--branch', '-o', '--origin', '--depth', '--reference', '-c', '--config', '--template', '--separate-git-dir', '-j', '--jobs', '--filter', '-u', '--upload-pack']);
    const pozitionale = [];
    for (let k = 0; k < rest.length; k += 1) {
      if (cuValoareClone.has(rest[k])) k += 1;
      else if (!rest[k].startsWith('-')) pozitionale.push(rest[k]);
    }
    if (pozitionale.length === 0) return null;
    const dest = pozitionale[1] ?? numeDinUrl(pozitionale[0]).replace(/\.git$/, '');
    if (tintaIncerta(dest, bazeGit)) return refuz(MOTIV_INCERT);
    return continutProtejat(dest, ctxGit);
  }
  if (!['checkout', 'restore', 'rm', 'mv'].includes(sub)) return null;
  if (sub === 'rm' && rest.includes('--cached')) return null;
  const cuValoare = new Set(['-b', '-B', '--orphan', '-s', '--source', '--conflict']);
  for (let k = 0; k < rest.length; k += 1) {
    const a = rest[k];
    if (cuValoare.has(a)) { k += 1; continue; }
    if (a.startsWith('-')) continue;
    if (tintaIncerta(a, bazeGit)) return refuz(MOTIV_INCERT);
    const d = subarboreProtejat(a, ctxGit);
    if (d) return d;
  }
  return null;
}

/** perl -i, awk -i inplace și sed cu comanda w: scriu în fișierele date. */
function verificaInPlace(prim, argumente, ctx) {
  if (prim === 'perl') {
    if (!argumente.some((a) => /^-[a-zA-Z]*i/.test(a))) return null;
    let areScript = false;
    const fisiere = [];
    for (let k = 0; k < argumente.length; k += 1) {
      const a = argumente[k];
      if (/^-[a-zA-Z]*e$/.test(a) || a === '-E') { areScript = true; k += 1; continue; }
      if (a.startsWith('-')) continue;
      fisiere.push(a);
    }
    for (const f of areScript ? fisiere : fisiere.slice(1)) { const d = verificaTinta(f, ctx); if (d) return d; }
    return null;
  }
  if (prim === 'awk' || prim === 'gawk') {
    const inplace = argumente.some((a, k) => a === '-iinplace' || a === '--include=inplace' || ((a === '-i' || a === '--include') && argumente[k + 1] === 'inplace'));
    if (!inplace) return null;
    let areProgram = false;
    const fisiere = [];
    for (let k = 0; k < argumente.length; k += 1) {
      const a = argumente[k];
      if (['-f', '--file'].includes(a)) { areProgram = true; k += 1; continue; }
      if (['-v', '-F', '-i', '--include', '--assign', '--field-separator'].includes(a)) { k += 1; continue; }
      if (a.startsWith('-')) continue;
      fisiere.push(a);
    }
    for (const f of areProgram ? fisiere : fisiere.slice(1)) { const d = verificaTinta(f, ctx); if (d) return d; }
    return null;
  }
  if (prim === 'sed') {
    // comanda w (sau flag-ul w al lui s///) scrie într-un fișier numit în script
    const scripturi = [];
    let areScript = false;
    const pozitionale = [];
    for (let k = 0; k < argumente.length; k += 1) {
      const a = argumente[k];
      if (['-e', '--expression'].includes(a)) { scripturi.push(argumente[k + 1] ?? ''); areScript = true; k += 1; continue; }
      if (a.startsWith('--expression=')) { scripturi.push(a.slice(13)); areScript = true; continue; }
      if (['-f', '--file'].includes(a)) { areScript = true; k += 1; continue; }
      if (a.startsWith('-')) continue;
      pozitionale.push(a);
    }
    if (!areScript && pozitionale.length > 0) scripturi.push(pozitionale[0]);
    for (const script of scripturi) {
      if (!/(^|[\s;{}\/0-9$])[wW]\s*\S/.test(script)) continue;
      if (pomenesteCaleProtejata(script, ctx.radacina)) return refuz(MOTIV_EVAL);
      if (script.includes('$') && /[;{}\s]w\s*\S*\$/.test(script)) return refuz(MOTIV_INCERT);
      if (bazeNesigure(ctx.baze, ctx.radacina)) return refuz(MOTIV_INCERT);
    }
  }
  return null;
}

/** Scrierile care nu urmează forma „verb <căi>”: descărcări, arhive, find, git, editări pe loc, sort -o, patch (F7, F17). */
function verificaScrieriSpeciale(prim, argumente, ctx) {
  if (VERBE_DESCARCARE.has(prim)) return verificaDescarcare(prim, argumente, ctx);
  if (prim === 'unzip' || prim === 'tar' || prim === 'expand-archive') return verificaDespachetare(prim, argumente, ctx);
  if (prim === 'find') return verificaFind(argumente, ctx);
  if (prim === 'git') return verificaGit(argumente, ctx);
  if (['perl', 'awk', 'gawk', 'sed'].includes(prim)) return verificaInPlace(prim, argumente, ctx);
  return verificaTintaOptiune(prim, argumente, ctx);
}

/** @param {string} nume @param {string[]} lista */
function esteParametruPs(nume, lista) {
  return lista.some((p) => p === nume || (nume.length >= 2 && p.startsWith(nume)));
}

/**
 * Argumentele unui verb de scriere care sunt căi (ținte sau surse), fără valorile care nu sunt căi
 * (-Value, scriptul lui sed, modul lui chmod). Pe ele se aplică regula țintelor incerte (D2).
 * @param {string} prim
 * @param {string[]} argumente
 * @returns {string[]}
 */
function argumenteCale(prim, argumente) {
  const stilPs = prim.includes('-') || ALIASURI_PS.has(prim);
  const optiuniCale = OPTIUNI_CALE_BASH[prim] ?? [];
  const optiuniValoare = OPTIUNI_VALOARE_BASH[prim] ?? [];
  const numite = [];
  const pozitionale = [];
  let areScript = false;
  for (let i = 0; i < argumente.length; i += 1) {
    const a = argumente[i];
    if (a === '--') { pozitionale.push(...argumente.slice(i + 1)); break; }
    if (a.length < 2 || !a.startsWith('-')) { pozitionale.push(a); continue; }
    const m = /^(-{1,2}[^=:]+)[=:](.*)$/s.exec(a);
    const optiune = m ? m[1] : a;
    let tip = 'comutator';
    if (stilPs) {
      const nume = optiune.replace(/^-+/, '').toLowerCase();
      if (esteParametruPs(nume, PARAMETRI_CALE_PS)) tip = 'cale';
      else if (esteParametruPs(nume, PARAMETRI_VALOARE_PS)) tip = 'valoare';
    } else if (optiuniCale.includes(optiune)) tip = 'cale';
    else if (optiuniValoare.includes(optiune)) tip = 'valoare';
    if (prim === 'sed' && ['-e', '--expression', '-f', '--file'].includes(optiune)) areScript = true;
    if (tip === 'comutator') continue;
    const valoare = m ? m[2] : argumente[i + 1];
    if (!m) i += 1;
    if (tip === 'cale') numite.push(valoare);
  }
  let cai = pozitionale;
  if (prim === 'sed' && !areScript) cai = cai.slice(1);
  if (prim === 'chmod') cai = cai.slice(1);
  if (DOAR_PRIMA_POZITIONALA.has(prim)) cai = numite.length > 0 ? [] : cai.slice(0, 1);
  return [...numite, ...cai];
}

/** Folderul care conține o cale („.” pentru un nume simplu). */
function folderParinte(cale) {
  const faraSlash = String(cale).replace(/[\\/]+$/, '');
  const k = Math.max(faraSlash.lastIndexOf('/'), faraSlash.lastIndexOf('\\'));
  if (k === -1) return '.';
  return faraSlash.slice(0, k) || faraSlash.slice(0, 1);
}

/**
 * F17: căile scrise din bucăți. New-Item -Path <folder> -Name <nume> scrie <folder>/<nume> (fără -Path, în folderul
 * curent); Rename-Item, rni și ren <cale> [-NewName] <nume nou> scriu <folderul căii>/<nume nou>.
 * @param {string} prim
 * @param {string[]} argumente
 * @returns {string[]}
 */
function tinteCompuse(prim, argumente) {
  const creare = prim === 'new-item' || prim === 'ni';
  if (!creare && !['rename-item', 'rni', 'ren'].includes(prim)) return [];
  const cai = [];
  const pozitionale = [];
  let nume = null;
  for (let i = 0; i < argumente.length; i += 1) {
    const a = argumente[i];
    if (a.length < 2 || !a.startsWith('-')) { pozitionale.push(a); continue; }
    const m = /^(-{1,2}[^=:]+)[=:](.*)$/s.exec(a);
    const parametru = (m ? m[1] : a).replace(/^-+/, '').toLowerCase();
    const valoare = () => { if (m) return m[2]; i += 1; return argumente[i] ?? ''; };
    if (esteParametruPs(parametru, ['path', 'literalpath', 'lp', 'pspath'])) cai.push(valoare());
    else if (esteParametruPs(parametru, [creare ? 'name' : 'newname'])) nume = valoare();
    else if (esteParametruPs(parametru, PARAMETRI_VALOARE_PS)) valoare();
  }
  if (cai.length === 0 && pozitionale.length > 0) cai.push(pozitionale.shift());
  if (creare) return nume === null ? [] : (cai.length > 0 ? cai : ['.']).map((c) => uneste(c, nume));
  nume ??= pozitionale[0] ?? null;
  return nume === null ? [] : cai.map((c) => uneste(folderParinte(c), nume));
}

function subcomandaMotor(prim, argumente, test) {
  const toate = [prim, ...argumente];
  const k = toate.findIndex((a) => test(numeMotor(a)));
  return k === -1 ? null : primulNeOptiune(toate.slice(k + 1));
}

/** Argumentele fără nume ale lui npm, pnpm, yarn sau bun, sărind peste opțiunile cu valoare (npm --prefix x install). */
function pozitionaleNpm(argumente) {
  const rezultat = [];
  for (let i = 0; i < argumente.length; i += 1) {
    const a = argumente[i];
    if (OPTIUNI_NPM_CU_VALOARE.has(a)) { i += 1; continue; }
    if (a.startsWith('-')) continue;
    rezultat.push(a.toLowerCase());
  }
  return rezultat;
}

/** Subcomanda lui npm, pnpm sau yarn (primul argument fără nume). */
function subcomandaNpm(argumente) {
  return pozitionaleNpm(argumente)[0] ?? null;
}

/**
 * F14: subcomanda schimbă node_modules sau package*.json: lista SUBCOMENZI_NPM_SCRIU, plus audit fix,
 * pkg set/delete/fix și version cu o versiune nouă (fără argument, version doar afișează).
 * @param {string|null} sub
 * @param {string|undefined} urmator argumentul fără nume de după subcomandă
 */
function subcomandaNpmScrie(sub, urmator) {
  if (SUBCOMENZI_NPM_SCRIU.has(sub)) return true;
  if (sub === 'audit') return urmator === 'fix';
  if (sub === 'pkg') return ['set', 'delete', 'fix'].includes(urmator);
  return sub === 'version' && urmator !== undefined;
}

/**
 * F14: npm/pnpm/yarn/bun care instalează, dezinstalează, reinstalează sau schimbă package.json în kit (prin --prefix, -C, --cwd, --dir
 * sau din folderul curent) ar schimba versiunile fixate; în kit instalează doar mg doctor.
 * @param {string} prim
 * @param {string[]} argumente
 * @param {{radacina: string, baze: (string|null)[]}} ctx
 * @returns {Decizie|null}
 */
function verificaInstalareKit(prim, argumente, ctx) {
  // F14: și bun, și managerul cu versiune dat prin corepack (corepack pnpm@9 add x)
  const manager = prim.replace(/@.*$/, '');
  if (!['npm', 'pnpm', 'yarn', 'bun'].includes(manager)) return null;
  const [primul, urmator] = pozitionaleNpm(argumente);
  const sub = primul ?? (manager === 'yarn' ? 'install' : null);
  if (!subcomandaNpmScrie(sub, urmator)) return null;
  if (argumente.some((a) => a === '-g' || a === '--global' || a === '--location=global')) return null;
  let folder = null;
  for (let i = 0; i < argumente.length; i += 1) {
    const a = argumente[i];
    const egal = a.indexOf('=');
    if (OPTIUNI_NPM_FOLDER.has(a)) folder = argumente[i + 1] ?? '';
    else if (egal > 0 && OPTIUNI_NPM_FOLDER.has(a.slice(0, egal))) folder = a.slice(egal + 1);
  }
  const tinta = folder ?? '.';
  if (tintaIncerta(tinta, ctx.baze)) return refuz(MOTIV_INCERT);
  const lista = esteAbsoluta(tinta) ? [tinta] : ctx.baze.filter((b) => b !== null).map((b) => uneste(b, tinta));
  for (const abs of lista) {
    if (clasificaCale(uneste(abs, 'package.json'), ctx.radacina).zona === 'kit') return refuz(MOTIV_UPGRADE);
  }
  return null;
}

function verificaUpgrade(prim, argumente) {
  const sub = ['npm', 'pnpm', 'yarn'].includes(prim) ? subcomandaNpm(argumente) : primulNeOptiune(argumente);
  if (['npm', 'pnpm', 'yarn'].includes(prim)) {
    if (['update', 'up', 'upgrade', 'udpate'].includes(sub)) return refuz(MOTIV_UPGRADE);
    if (['install', 'i', 'add'].includes(sub) && argumente.some((a) => a === '-g' || a === '--global' || a === '--location=global')) return refuz(MOTIV_UPGRADE);
  }
  if ([prim, ...argumente].some((a) => a.toLowerCase().includes('create-video@'))) return refuz(MOTIV_UPGRADE);
  if (prim === 'npx' && sub === 'skills') return refuz(MOTIV_UPGRADE);
  const dupa = subcomandaMotor(prim, argumente, (n) => n !== null);
  if (dupa === 'upgrade' || dupa === 'skills') return refuz(MOTIV_UPGRADE);
  return null;
}

function verificaPublicare(prim, argumente) {
  if (argumente.some((a) => a === '--file-issue' || a.startsWith('--file-issue='))) return refuz(MOTIV_PUBLICARE);
  if (prim === 'git') {
    let i = 0;
    while (i < argumente.length) {
      const a = argumente[i];
      if (['-c', '-C', '--git-dir', '--work-tree', '--namespace'].includes(a)) { i += 2; continue; }
      if (a.startsWith('-')) { i += 1; continue; }
      break;
    }
    if ((argumente[i] ?? '').toLowerCase() === 'push') return refuz(MOTIV_PUBLICARE);
  }
  if (['npm', 'pnpm', 'yarn'].includes(prim) && subcomandaNpm(argumente) === 'publish') return refuz(MOTIV_PUBLICARE);
  const dupa = subcomandaMotor(prim, argumente, (n) => n === 'hyperframes');
  if (['feedback', 'publish', 'cloud', 'lambda', 'cloudrun', 'telemetry'].includes(dupa)) return refuz(MOTIV_PUBLICARE);
  return null;
}

function verificaMotor(prim, argumente) {
  if (MOTOARE.has(prim) || numeMotor(prim) !== null || prim === 'bunx') return refuz(MOTIV_MOTOR);
  const sub = ['npm', 'pnpm', 'yarn'].includes(prim) ? subcomandaNpm(argumente) : primulNeOptiune(argumente);
  if (['npm', 'pnpm'].includes(prim) && ['exec', 'x', 'dlx'].includes(sub)) return refuz(MOTIV_MOTOR);
  if (prim === 'yarn' && sub === 'dlx') return refuz(MOTIV_MOTOR);
  if (prim === 'node') {
    const script = scriptNode(argumente);
    if (script) {
      const s = '/' + script.cale.replace(/\\/g, '/').toLowerCase();
      if (/\/node_modules\/(hyperframes|remotion|@remotion|ffmpeg-static|ffprobe-static)\//.test(s)
        || numeMotor(script.cale) !== null || MOTOARE.has(numeComanda(script.cale))) {
        return refuz(MOTIV_MOTOR);
      }
    }
  }
  return null;
}

/** Cod în linie: refuz dacă pomenește o cale protejată sau dacă scrie dintr-un folder pe care garda nu-l poate verifica. */
function verificaCodInLinie(cod, ctx) {
  if (cod === null) return null;
  if (pomenesteCaleProtejata(cod, ctx.radacina)) return refuz(MOTIV_EVAL);
  if (COD_CARE_SCRIE.test(cod) && (cod.includes('$') || bazeNesigure(ctx.baze, ctx.radacina))) return refuz(MOTIV_INCERT);
  return null;
}

function verificaScriere(prim, argumente, ctx) {
  const { radacina, baze, adancime } = ctx;
  if (prim === 'node') {
    const d = verificaCodInLinie(valoareOptiune(argumente, OPTIUNI_NODE_EVAL) ?? valoareDupaFlagScurt(argumente, /^-[a-zA-Z]*[ep]$/), ctx);
    if (d) return d;
  }
  if (['python', 'python3', 'py'].includes(prim)) {
    const d = verificaCodInLinie(valoareOptiune(argumente, new Set(['-c'])) ?? valoareDupaFlagScurt(argumente, /^-[a-zA-Z]*c$/), ctx);
    if (d) return d;
  }
  if (['bash', 'sh', 'zsh', 'dash'].includes(prim)) {
    const cod = valoareOptiune(argumente, new Set(['-c'])) ?? valoareDupaFlagScurt(argumente, /^-[a-zA-Z]*c[a-zA-Z]*$/);
    if (cod !== null) {
      const d = decideIntern(cod, 'Bash', radacina, baze, adancime + 1);
      if (d.decizie !== 'permite') return d;
    }
  }
  if (prim === 'eval') {
    // F2: eval rulează argumentele lipite ca o comandă Bash, deci se judecă la fel ca bash -c
    const d = decideIntern(argumente.join(' '), 'Bash', radacina, baze, adancime + 1);
    if (d.decizie !== 'permite') return d;
  }
  if (prim === 'powershell' || prim === 'pwsh') {
    if (argumente.some((a) => /^-(e|ec|enc|encodedcommand)$/i.test(a))) return refuz(MOTIV_NEINTELES);
    const cod = comandaPowershell(argumente);
    if (cod !== null) {
      if (pomenesteCaleProtejata(cod, radacina)) return refuz(MOTIV_EVAL);
      const d = decideIntern(cod, 'PowerShell', radacina, baze, adancime + 1);
      if (d.decizie !== 'permite') return d;
    }
  }
  if (prim === 'cmd') {
    const i = argumente.findIndex((a) => /^\/[ck]$/i.test(a));
    if (i !== -1) {
      const d = decideIntern(argumente.slice(i + 1).join(' '), 'PowerShell', radacina, baze, adancime + 1);
      if (d.decizie !== 'permite') return d;
    }
  }
  if (prim === 'invoke-expression' || prim === 'iex') {
    const d = decideIntern(argumente.filter((a) => !/^-command$/i.test(a)).join(' '), 'PowerShell', radacina, baze, adancime + 1);
    if (d.decizie !== 'permite') return d;
  }
  const sedScrie = prim !== 'sed' || argumente.some((a) => /^-[a-zA-Z]*i/.test(a) || a.startsWith('--in-place'));
  if (VERBE_SCRIERE.has(prim) && sedScrie) {
    const distructiv = VERBE_DISTRUCTIVE.has(prim);
    // SEC-3: destinația unei mutări primește fișiere, nu se șterge
    const destinatie = VERBE_MUTARE.has(prim) ? structuraCopiere(prim, argumente).destinatie : null;
    for (const argument of argumente) {
      for (const candidat of candidati(argument)) {
        const z = distructiv ? zonaProtejataTipar(candidat, true, ctx) : zonaProtejata(candidat, false, ctx);
        if (z) return refuzScriere(z);
        const intreaga = distructiv && candidat !== destinatie ? verificaStergereIntreaga(candidat, ctx) : null;
        if (intreaga) return intreaga;
      }
    }
    for (const tinta of tinteCompuse(prim, argumente)) {
      const z = zonaProtejata(tinta, false, ctx);
      if (z) return refuzScriere(z);
    }
    const destinatieFolder = verificaDestinatieFolder(prim, argumente, ctx);
    if (destinatieFolder) return destinatieFolder;
    // D2: o cale cu variabile, după un cd neliteral sau lipsă (dată prin pipeline sau prin (...)) nu se poate verifica
    let cai = argumenteCale(prim, argumente);
    if (VERBE_COPIERE.has(prim) || VERBE_MUTARE.has(prim)) {
      const { surse, destinatie } = structuraCopiere(prim, argumente);
      cai = [...(VERBE_MUTARE.has(prim) ? surse : surse.map(numeFinal)), ...(destinatie === null ? [] : [destinatie])];
    }
    if (cai.some((c) => tintaIncerta(c, baze))) return refuz(MOTIV_INCERT);
    if (cai.length === 0 && VERBE_CU_CALE.has(prim)) return refuz(MOTIV_INCERT);
  }
  return null;
}
