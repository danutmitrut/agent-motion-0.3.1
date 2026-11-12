// mg actualizeaza (spec 9.6, felia 6): kitul trece pe ultima versiune a ramurii stabil sau revine la cea dinainte.
// --verifica doar aduce și spune ce e nou (garda îl lasă să treacă); fără el, garda a cerut deja aprobarea cursantului.
// Nimic din video/, branduri/, proprii/ și fișierele cursantului nu se atinge: sunt ignorate de git, iar o versiune
// care le-ar aduce ca fișiere urmărite e refuzată înainte de orice scriere. Doar module native.
import fs from 'node:fs';
import path from 'node:path';
import { eroare, avertisment, EroareFatala, COD_IESIRE } from '../erori.mjs';
import { citesteJson, scrieJsonAtomic, existaFisier, jsonDinText, stergeRecursiv } from '../fisiere.mjs';
import { citesteVersiuni, verificaIntegritate } from '../versiuni.mjs';
import { aduce, git, rezumatGit } from './sursa.mjs';

export const FISIER_ISTORIC = 'nucleu/.actualizare.json';
/** Ține commit-ul de dinainte accesibil pentru --inapoi, chiar dacă sursa își rescrie istoria. */
const REF_INAPOI = 'refs/mg/inapoi';
// Zonele cursantului din .gitignore (harta 3); testul unitar le compară cu .gitignore.
export const ZONE_CURSANT = ['video/', 'branduri/', 'proprii/', 'unelte/ffmpeg/', 'unelte/vectorizare/', 'unelte/python/'];
export const FISIERE_CURSANT = ['USER.md', 'MEMORY.md', 'CLAUDE.local.md', '.claude/settings.local.json', '.instalat',
  'nucleu/.stare.json', 'nucleu/.canar', 'nucleu/.canar-refuzuri', FISIER_ISTORIC];
const MAX_NOUTATI = 40;
const FISIERE_PACHETE = /(^|\/)package-lock\.json$/;

function fatala(cod, camp, mesaj, sugestie, codIesire = COD_IESIRE.DATE) {
  return new EroareFatala(eroare(cod, camp, mesaj, sugestie), codIesire);
}

async function gitSigur(radacina, argumente, ce) {
  const r = await git(radacina, argumente);
  if (r.lipsa) throw fatala('actualizare-sursa', 'mediu.git', 'Git nu e instalat sau nu e în PATH.', 'Pe Windows, cursantul instalează Git for Windows (git-scm.com), apoi repornește Claude Code.', COD_IESIRE.MEDIU);
  if (r.cod !== 0) throw fatala('actualizare-sursa', 'mediu.git', `${ce}: ${rezumatGit(r)}.`, 'Spune-i lui Dănuț ce scrie aici; kitul n-a fost schimbat.', COD_IESIRE.MEDIU);
  return r.stdout;
}

/** Folderul agentului trebuie să fie chiar rădăcina unui depozit git (o clonă), nu o copie fără git. */
async function verificaDepozit(radacina) {
  const r = await git(radacina, ['rev-parse', '--show-prefix']);
  if (r.lipsa) await gitSigur(radacina, ['--version'], 'Git');
  if (/dubious ownership/i.test(r.stderr)) {
    throw fatala('actualizare-sursa', 'mediu.git',
      'Git nu are încredere în folderul agentului, pentru că a fost creat de alt cont al calculatorului.',
      `Cursantul rulează o dată, în terminalul lui: git config --global --add safe.directory "${radacina.replace(/\\/g, '/')}" ; apoi rulezi din nou comanda.`,
      COD_IESIRE.MEDIU);
  }
  if (r.cod !== 0 || r.stdout.trim() !== '') {
    throw fatala('actualizare-sursa', 'mediu.git',
      'Folderul agentului nu e o clonă git, deci nu se poate actualiza pe loc.',
      'Spune-i cursantului că agentul se actualizează doar într-un folder obținut cu git clone; pentru o versiune nouă, cere-i lui Dănuț instrucțiunile.',
      COD_IESIRE.MEDIU);
  }
}

/** versiune_kit din nucleu/VERSIUNI.json al unui commit; null dacă lipsește. */
async function versiuneKit(radacina, commit) {
  const r = await git(radacina, ['show', `${commit}:nucleu/VERSIUNI.json`]);
  if (r.cod !== 0) return null;
  try {
    const v = jsonDinText(r.stdout, `fisier:${commit}:nucleu/VERSIUNI.json`)?.versiune_kit;
    return typeof v === 'string' ? v : null;
  } catch {
    return null;
  }
}

async function esteStramos(radacina, a, b) {
  return (await git(radacina, ['merge-base', '--is-ancestor', a, b])).cod === 0;
}

/** Subiectele commit-urilor din (de, la], fără merge-uri, cele mai noi primele (decizia din 27 oct: fără NOUTATI.md). */
async function noutati(radacina, de, la) {
  const total = Number((await gitSigur(radacina, ['rev-list', '--count', '--no-merges', `${de}..${la}`], 'Lista schimbărilor')).trim());
  const iesire = await gitSigur(radacina, ['log', '--no-merges', `-n${MAX_NOUTATI}`, '--format=%h%x09%as%x09%s', `${de}..${la}`], 'Lista schimbărilor');
  const lista = iesire.split('\n').filter(Boolean).map((l) => {
    const [commit, data, ...subiect] = l.split('\t');
    return { commit, data, subiect: subiect.join('\t') };
  });
  return { total: Number.isFinite(total) ? total : lista.length, lista };
}

/**
 * Proiectele cu un video în lucru: scenariul aprobat, dar filmul final (MP4-ul sau manifestul seriei) lipsește
 * ori e mai vechi decât aprobarea (o corectură aprobată și nerandată).
 * @returns {string[]}
 */
export function videoInLucru(radacina) {
  const dirVideo = path.join(radacina, 'video');
  let intrari;
  try {
    intrari = fs.readdirSync(dirVideo, { withFileTypes: true });
  } catch {
    return [];
  }
  const rezultat = [];
  for (const d of intrari) {
    if (!d.isDirectory()) continue;
    const dir = path.join(dirVideo, d.name);
    let lock;
    try {
      lock = citesteJson(path.join(dir, 'motor.lock'));
    } catch {
      continue;
    }
    const aprobatLa = Date.parse(lock?.aprobare?.aprobat_la ?? '');
    if (typeof lock?.aprobare?.sha256_texte !== 'string') continue;
    const finale = [path.join(dir, `${d.name}.mp4`), path.join(dir, 'serie', 'manifest.json')].filter(existaFisier);
    const ultim = Math.max(0, ...finale.map((f) => fs.statSync(f).mtimeMs));
    if (finale.length === 0 || (Number.isFinite(aprobatLa) && ultim < aprobatLa)) rezultat.push(d.name);
  }
  return rezultat.sort();
}

/** Fișierele urmărite de git schimbate pe disc față de versiunea instalată. */
async function kitModificat(radacina) {
  const iesire = await gitSigur(radacina, ['status', '--porcelain=v1', '-z', '--untracked-files=no'], 'Starea kitului');
  return iesire.split('\0').filter(Boolean).map((l) => l.slice(3)).sort();
}

/**
 * Căile unei versiuni care ar cădea peste fișierele cursantului: git suprascrie sau șterge în tăcere un fișier ignorat.
 * Pe lângă zonele cunoscute (fără să țină cont de majuscule, ca Windows și macOS), orice cale nouă care, ea sau un
 * folder-părinte, există deja pe disc fără să fie urmărită (Video/x peste video/, user.md peste USER.md, video ca fișier).
 */
async function atingeCursant(radacina, commit) {
  const lista = async (args, ce) => (await gitSigur(radacina, args, ce)).split('\0').filter(Boolean);
  const tinta = await lista(['ls-tree', '-r', '-z', '--name-only', commit], 'Lista fișierelor versiunii');
  const urmarite = new Set((await lista(['ls-files', '-z'], 'Lista fișierelor kitului')).map((c) => c.toLowerCase()));
  const foldereUrmarite = new Set();
  for (const c of urmarite) {
    const parti = c.split('/');
    for (let k = 1; k < parti.length; k += 1) foldereUrmarite.add(parti.slice(0, k).join('/'));
  }
  const zone = ZONE_CURSANT.map((z) => z.replace(/\/$/, '').toLowerCase());
  const fisiere = FISIERE_CURSANT.map((f) => f.toLowerCase());
  const exista = (rel) => {
    try {
      fs.lstatSync(path.join(radacina, ...rel.split('/')));
      return true;
    } catch {
      return false;
    }
  };
  const conflicte = tinta.filter((c) => {
    const mic = c.toLowerCase();
    if ([...zone, ...fisiere].some((z) => mic === z || mic.startsWith(`${z}/`))) return true;
    if (urmarite.has(mic)) return false;
    const parti = c.split('/');
    for (let k = 1; k <= parti.length; k += 1) {
      const prefix = parti.slice(0, k).join('/');
      const urmarit = k < parti.length ? foldereUrmarite.has(prefix.toLowerCase()) : false;
      if (!urmarit && exista(prefix)) return true;
    }
    return false;
  });
  return conflicte.sort();
}

async function pacheteSchimbate(radacina, de, la) {
  const iesire = await gitSigur(radacina, ['diff', '--name-only', de, la], 'Diferența dintre versiuni');
  return iesire.split('\n').filter((c) => FISIERE_PACHETE.test(c));
}

function citesteIstoric(radacina) {
  const cale = path.join(radacina, ...FISIER_ISTORIC.split('/'));
  if (!existaFisier(cale)) return { versiune: 1, istoric: [] };
  const j = citesteJson(cale);
  return { versiune: 1, istoric: Array.isArray(j?.istoric) ? j.istoric : [] };
}

function scrieIstoric(radacina, istoric) {
  scrieJsonAtomic(path.join(radacina, ...FISIER_ISTORIC.split('/')), { versiune: 1, istoric });
}

/**
 * Nota pe care mg doctor o adaugă când pică imediat după o actualizare (.instalat lipsește, istoricul are o intrare).
 * @returns {string|null}
 */
export function notaDupaActualizare(radacina) {
  if (existaFisier(path.join(radacina, '.instalat'))) return null;
  let ultim;
  try {
    ultim = citesteIstoric(radacina).istoric.at(-1);
  } catch {
    return null;
  }
  if (!ultim) return null;
  return `Kitul a fost actualizat pe ${String(ultim.la_data ?? '').slice(0, 10)}, de la ${eticheta(ultim.de_la)} la ${eticheta(ultim.la)}. `
    + 'Dacă erorile de mai sus nu se repară, propune-i cursantului revenirea: node nucleu/mg.mjs actualizeaza --inapoi.';
}

const scurt = (c) => String(c ?? '').slice(0, 7);
const eticheta = (v) => `${v?.versiune_kit ?? 'versiunea necunoscută'} (${scurt(v?.commit)})`;

/** Ce oprește trecerea pe commit-ul țintă; listele goale înseamnă că se poate. */
async function blocaje(radacina, tinta, chiarDacaInLucru) {
  const inLucru = videoInLucru(radacina);
  const modificate = await kitModificat(radacina);
  const cursant = await atingeCursant(radacina, tinta);
  const erori = [];
  if (inLucru.length > 0 && !chiarDacaInLucru) {
    erori.push(eroare('actualizare-video-in-lucru', 'video',
      `Un video e în lucru (scenariul aprobat, filmul nerandat): ${inLucru.join(', ')}.`,
      'Termină filmul și predă-l, apoi actualizează. Dacă cursantul vrea totuși acum, rulează aceeași comandă cu --chiar-daca-e-in-lucru; dacă versiunea nouă schimbă motorul, proiectul acela va cere mg nou <proiect-nou> --din <proiect>.'));
  }
  if (modificate.length > 0) {
    erori.push(eroare('actualizare-kit-modificat', 'kit',
      `Fișiere ale agentului au fost schimbate pe acest calculator: ${modificate.slice(0, 10).join(', ')}${modificate.length > 10 ? ` și încă ${modificate.length - 10}` : ''}.`,
      'Actualizarea le-ar pierde, deci nu pornește. Ce personalizează cursantul stă în CLAUDE.local.md, USER.md sau MEMORY.md. Dacă schimbările nu sunt ale lui, cursantul le aruncă în terminalul lui, din folderul agentului: git checkout -- . ; apoi rulezi din nou comanda.'));
  }
  if (cursant.length > 0) {
    erori.push(eroare('actualizare-atinge-cursant', 'kit',
      `Versiunea țintă conține fișiere în zona cursantului: ${cursant.slice(0, 10).join(', ')}.`,
      'Nu se aplică, ca să nu suprascrie lucrul cursantului. Spune-i lui Dănuț.'));
  }
  return { erori, inLucru };
}

/** Trece arborele de lucru pe commit; --keep refuză dacă ar pierde schimbări locale sau fișiere neurmărite. */
async function treciPe(radacina, commit) {
  const r = await git(radacina, ['reset', '--keep', commit], { termenMs: 10 * 60_000 });
  return r.cod === 0 ? null : rezumatGit(r);
}

/**
 * După un reset pornit și eșuat la jumătate (fișier blocat pe Windows, antivirus): readuce fișierele urmărite ale lui
 * commit. --hard atinge doar căile urmărite (cele ignorate ale cursantului rămân), iar plasa din atingeCursant a refuzat
 * deja orice cale nouă care ar cădea peste ele. Un index.lock rămas de la git-ul oprit se șterge întâi.
 * @returns {Promise<boolean>} true dacă HEAD e pe commit și kitul trece integritatea
 */
async function readuce(radacina, commit) {
  const lacat = path.join(radacina, '.git', 'index.lock');
  if (existaFisier(lacat)) stergeRecursiv(lacat);
  const r = await git(radacina, ['reset', '--hard', commit], { termenMs: 10 * 60_000 });
  if (r.cod !== 0) return false;
  const cap = await git(radacina, ['rev-parse', 'HEAD']);
  if (cap.stdout.trim() !== commit) return false;
  try {
    return verificaIntegritate(radacina, citesteVersiuni(radacina)).ok;
  } catch {
    return false;
  }
}

/** Integritatea kitului după schimbare; la nepotrivire, revine pe commit-ul de dinainte. */
async function verificaDupa(radacina, inapoiLa) {
  let ok = false;
  let detalii = '';
  try {
    const v = verificaIntegritate(radacina, citesteVersiuni(radacina));
    ok = v.ok;
    detalii = [...v.diferite, ...v.lipsa].slice(0, 5).join(', ');
  } catch (err) {
    detalii = err?.eroareMg?.mesaj ?? err?.message ?? String(err);
  }
  if (ok) return;
  const revenit = await treciPe(radacina, inapoiLa) === null || await readuce(radacina, inapoiLa);
  const err = fatala('actualizare-integritate', 'fisier:nucleu/VERSIUNI.json',
    `Versiunea adusă nu trece verificarea de integritate (${detalii || 'VERSIUNI.json necitibil'}).`,
    revenit
      ? 'Kitul a revenit singur la versiunea de dinainte. Spune-i lui Dănuț.'
      : 'Revenirea automată a eșuat. Spune-i lui Dănuț imediat; nu lucra la videouri.',
    COD_IESIRE.MEDIU);
  err.revenit = revenit;
  throw err;
}

function stergeInstalat(radacina) {
  stergeRecursiv(path.join(radacina, '.instalat'));
}

const PAS_REPORNIRE = 'Pasul următor: spune-i cursantului să închidă Claude Code și să-l deschidă din nou în acest folder, ca să se încarce regulile noi. '
  + 'La pornire lipsește .instalat, deci refaci pașii din INSTALARE.md (doctorul, cu randarea de probă, și canarul). '
  + 'Dacă doctorul pică și nu se repară, propune-i node nucleu/mg.mjs actualizeaza --inapoi.';

async function verifica(radacina) {
  await verificaDepozit(radacina);
  const curent = (await gitSigur(radacina, ['rev-parse', 'HEAD'], 'Versiunea instalată')).trim();
  const nou = await aduce(radacina);
  const deLa = { commit: curent, versiune_kit: await versiuneKit(radacina, curent) };
  const la = { commit: nou, versiune_kit: await versiuneKit(radacina, nou) };
  if (curent === nou) {
    return {
      ok: true, erori: [], avertismente: [],
      rezultat: { mod: 'verifica', disponibila: false, de_la: deLa, la: deLa, noutati: { total: 0, lista: [] },
        text: `Agentul are deja ultima versiune: ${eticheta(deLa)}.` },
    };
  }
  // Dănuț a mutat stabil înapoi (o versiune retrasă): cursantul primește retragerea, cu schimbările care pleacă
  const retrasa = await esteStramos(radacina, nou, curent);
  const lista = retrasa ? await noutati(radacina, nou, curent) : await noutati(radacina, curent, nou);
  const pachete = await pacheteSchimbate(radacina, curent, nou);
  const { erori } = await blocaje(radacina, nou, false);
  const avertismente = erori.map((e) => avertisment(e.cod, e.camp, e.mesaj, e.sugestie));
  const linii = [
    `Versiunea instalată: ${eticheta(deLa)}. Versiunea nouă: ${eticheta(la)}.`,
    retrasa
      ? `Dănuț a retras ultimele schimbări; actualizarea le scoate (${lista.total} ${lista.total === 1 ? 'schimbare' : 'schimbări'}${lista.total > lista.lista.length ? `; aici primele ${lista.lista.length}` : ''}):`
      : `Ce s-a schimbat (${lista.total} ${lista.total === 1 ? 'schimbare' : 'schimbări'}, cele mai noi primele${lista.total > lista.lista.length ? `; aici primele ${lista.lista.length}` : ''}):`,
    ...lista.lista.map((n) => `- ${n.data} ${n.subiect}`),
  ];
  if (pachete.length > 0) {
    linii.push('Se schimbă și pachetele: după actualizare, doctorul le reinstalează și descarcă din nou Chrome pentru randare; poate dura câteva minute.');
  }
  linii.push(avertismente.length > 0
    ? 'Actualizarea nu poate porni acum; vezi mai jos de ce.'
    : 'Pasul următor: rezumă-i cursantului, în cuvinte simple, ce înseamnă schimbările pentru filmele lui (fără termeni de programare). Dacă e de acord: node nucleu/mg.mjs actualizeaza (garda îi cere încă o dată aprobarea).');
  return {
    ok: true, erori: [], avertismente,
    rezultat: { mod: 'verifica', disponibila: true, retrasa, de_la: deLa, la, noutati: lista, pachete_schimbate: pachete.length > 0, text: linii.join('\n') },
  };
}

async function aplica(radacina, { chiarDacaInLucru }) {
  await verificaDepozit(radacina);
  const curent = (await gitSigur(radacina, ['rev-parse', 'HEAD'], 'Versiunea instalată')).trim();
  const nou = await aduce(radacina);
  const deLa = { commit: curent, versiune_kit: await versiuneKit(radacina, curent) };
  const la = { commit: nou, versiune_kit: await versiuneKit(radacina, nou) };
  if (curent === nou) {
    return { ok: true, erori: [], avertismente: [], rezultat: { mod: 'aplica', schimbat: false, de_la: deLa, la: deLa, text: `Agentul are deja ultima versiune: ${eticheta(deLa)}. Nu s-a schimbat nimic.` } };
  }
  const { erori, inLucru } = await blocaje(radacina, nou, chiarDacaInLucru);
  if (erori.length > 0) {
    return { ok: false, erori, avertismente: [], rezultat: { mod: 'aplica', schimbat: false, de_la: deLa, la, text: 'Actualizarea n-a pornit; kitul a rămas cum era.' } };
  }
  const { istoric } = citesteIstoric(radacina);
  await gitSigur(radacina, ['update-ref', REF_INAPOI, curent], 'Copia de siguranță');
  const intrare = { de_la: deLa, la, la_data: new Date().toISOString() };
  scrieIstoric(radacina, [...istoric, intrare]);
  const motiv = await treciPe(radacina, nou);
  if (motiv !== null) {
    // git poate să fi scris deja o parte din fișiere: kitul se readuce întreg pe versiunea de dinainte
    const revenit = await readuce(radacina, curent);
    if (revenit) scrieIstoric(radacina, istoric);
    throw fatala('actualizare-esuata', 'mediu.git', `Git n-a putut trece kitul pe versiunea nouă: ${motiv}.`,
      revenit
        ? 'Kitul a rămas pe versiunea de dinainte. Spune-i lui Dănuț ce scrie aici.'
        : 'Kitul a rămas amestecat între versiuni. Nu lucra la videouri; închide programele care țin fișiere din folderul agentului, apoi rulează node nucleu/mg.mjs actualizeaza --inapoi.',
      COD_IESIRE.MEDIU);
  }
  try {
    await verificaDupa(radacina, curent);
  } catch (err) {
    // istoricul rămâne doar dacă revenirea automată a eșuat, ca --inapoi să poată încerca din nou
    if (err.revenit) scrieIstoric(radacina, istoric);
    throw err;
  }
  stergeInstalat(radacina);
  const pachete = await pacheteSchimbate(radacina, curent, nou);
  const linii = [
    `Agentul e acum la versiunea ${eticheta(la)}, de la ${eticheta(deLa)}. Filmele din video/, brandurile și desenele proprii n-au fost atinse.`,
  ];
  if (inLucru.length > 0) linii.push(`Proiectele în lucru (${inLucru.join(', ')}) pot cere un proiect nou din datele lor, dacă mg randeaza spune că sunt făcute pe altă versiune.`);
  if (pachete.length > 0) linii.push('Pachetele s-au schimbat: doctorul le reinstalează și descarcă din nou Chrome pentru randare; poate dura câteva minute.');
  linii.push(PAS_REPORNIRE);
  return { ok: true, erori: [], avertismente: [], rezultat: { mod: 'aplica', schimbat: true, de_la: deLa, la, text: linii.join('\n') } };
}

async function inapoi(radacina, { chiarDacaInLucru }) {
  await verificaDepozit(radacina);
  const { istoric } = citesteIstoric(radacina);
  const ultim = istoric.at(-1);
  const curent = (await gitSigur(radacina, ['rev-parse', 'HEAD'], 'Versiunea instalată')).trim();
  if (!ultim) {
    throw fatala('actualizare-fara-istoric', `fisier:${FISIER_ISTORIC}`,
      'Nu există o actualizare făcută cu mg actualizeaza la care să se poată reveni.', 'Kitul rămâne cum e. Dacă ceva nu merge, rulează node nucleu/mg.mjs doctor.');
  }
  if (ultim.la?.commit !== curent) {
    throw fatala('actualizare-fara-istoric', `fisier:${FISIER_ISTORIC}`,
      `Kitul nu mai e pe versiunea adusă de ultima actualizare (${eticheta(ultim.la)}), deci revenirea nu e sigură.`,
      'Kitul rămâne cum e. Spune-i lui Dănuț.');
  }
  const tinta = ultim.de_la.commit;
  const exista = await git(radacina, ['cat-file', '-e', `${tinta}^{commit}`]);
  if (exista.cod !== 0) {
    throw fatala('actualizare-fara-istoric', `fisier:${FISIER_ISTORIC}`, `Versiunea de dinainte (${eticheta(ultim.de_la)}) nu mai există în depozit.`, 'Kitul rămâne cum e. Spune-i lui Dănuț.', COD_IESIRE.MEDIU);
  }
  const { erori } = await blocaje(radacina, tinta, chiarDacaInLucru);
  if (erori.length > 0) {
    return { ok: false, erori, avertismente: [], rezultat: { mod: 'inapoi', schimbat: false, de_la: ultim.la, la: ultim.de_la, text: 'Revenirea n-a pornit; kitul a rămas cum era.' } };
  }
  const motiv = await treciPe(radacina, tinta);
  if (motiv !== null) {
    const revenit = await readuce(radacina, curent);
    throw fatala('actualizare-esuata', 'mediu.git', `Git n-a putut readuce versiunea de dinainte: ${motiv}.`,
      revenit
        ? 'Kitul a rămas pe versiunea actuală. Spune-i lui Dănuț ce scrie aici.'
        : 'Kitul a rămas amestecat între versiuni. Nu lucra la videouri; închide programele care țin fișiere din folderul agentului, apoi rulează din nou node nucleu/mg.mjs actualizeaza --inapoi.',
      COD_IESIRE.MEDIU);
  }
  await verificaDupa(radacina, curent);
  scrieIstoric(radacina, istoric.slice(0, -1));
  stergeInstalat(radacina);
  return {
    ok: true, erori: [], avertismente: [],
    rezultat: {
      mod: 'inapoi', schimbat: true, de_la: ultim.la, la: ultim.de_la,
      text: [`Agentul a revenit la versiunea ${eticheta(ultim.de_la)}, de la ${eticheta(ultim.la)}. Filmele din video/ n-au fost atinse.`,
        PAS_REPORNIRE.replace(/ Dacă doctorul pică.*$/, ' Dacă doctorul pică, spune-i lui Dănuț.')].join('\n'),
    },
  };
}

/**
 * @param {{radacina: string, mod: 'verifica'|'aplica'|'inapoi', chiarDacaInLucru?: boolean}} p
 * @returns {Promise<{ok: boolean, erori: object[], avertismente: object[], rezultat: object & {text: string}}>}
 */
export async function comandaActualizeaza({ radacina, mod, chiarDacaInLucru = false }) {
  if (mod === 'verifica') return verifica(radacina);
  if (mod === 'inapoi') return inapoi(radacina, { chiarDacaInLucru });
  return aplica(radacina, { chiarDacaInLucru });
}

