#!/usr/bin/env node
/**
 * mg, CLI-ul unic al agentului motion (spec 6.10, harta 4.12).
 * Dispecerul folosește doar module native; comenzile se încarcă cu await import() după alegere,
 * ca `mg doctor` să meargă și înainte de npm ci.
 */
import { parseArgs } from 'node:util';
import { radacinaAgent, rulatDirect } from './lib/cai.mjs';
import { COD_IESIRE, EroareFatala, eroare, formateazaPentruOm } from './lib/erori.mjs';

export const AJUTOR = `mg, unealta agentului motion

Folosire: node nucleu/mg.mjs <comandă> [opțiuni]

Comenzi:
  doctor [--ci] [--confirma-canar] [--json]
      verifică și repară mediul; scrie nucleu/.stare.json
  doctor --generare [--instaleaza-keyring] [--json]
      verifică doar generarea de desene (Python 3, seiful keyring din unelte/python/, cheia Kie); cu --instaleaza-keyring, după acordul cursantului, face seiful
  nou <proiect> --sablon <nume> [--format <format>] [--brand <nume>] [--instaleaza-motorul] [--json]
      creează video/<proiect>/ cu date.json, scenariu.md, jurnal.md, motor.lock și resurse/; la primul șablon Remotion cere acordul pentru descărcarea motorului (~340 MB)
  nou <proiect> --sablon overlay-filmare --filmare <cale> [--limba ro] [--transcriere <fișier.srt|.vtt|.json>] [--instaleaza-transcrierea] [--json]
      copiază filmarea, face copia de lucru și o transcrie local; prima dată cere acordul pentru descărcarea transcrierii (~670 MB)
  nou <proiect> --din <proiect-vechi> [--instaleaza-motorul] [--json]
      creează video/<proiect>/ din datele și resursele proiectului vechi, validate pe schema curentă; proiectul vechi rămâne neatins
  desen lista [--tip <forma>] [--familie <cerneala|proprie>] [--tema <tema>] [--include-evita] [--personaj <valoare>] [--brand <nume>] [--json]
      listează piesele din biblioteca de desene, din cele proprii și, cu --brand, din catalogul brandului
  desen cauta "<text>" [--tip ...] [--familie ...] [--tema ...] [--include-evita] [--personaj ...] [--brand <nume>] [--json]
      caută piese fără diacritice, cu sinonime; pe tema noapte ascunde piesele „evita” până la --include-evita
  desen arata <id...> [--tema <tema>] [--proiect <proiect>] [--brand <nume>] [--json]
      scrie o foaie PNG cu piesele recolorate pe temă; cu --proiect, pe tema proiectului, în video/<proiect>/cadre/desene.png
  desen verifica <cale spre date.json> [--json]
      verifică desenele și iconițele din date.json față de catalog
  desen adauga <fisier> --licenta "<text>" --etichete "<e1,e2,e3,e4>" [--id <p-nume>] [--fara-mapare] [--json]
      adaugă o piesă proprie (SVG, PNG, JPG sau WebP) în proprii/, cu licența și etichetele ei
  genereaza desen <p-nume> "<subiectul>" --etichete "<e1,e2,e3,e4>" --estimeaza [--json]
      spune costul unui desen generat prin Kie și ce lipsește (Python, seiful, cheia), fără să cheltuie nimic
  genereaza desen <p-nume> "<subiectul>" --etichete "<e1,e2,e3,e4>" [--proiect <proiect>] [--json]
      generează desenul prin Kie, cu cheia și costul cursantului (garda cere aprobarea), și îl pune în proprii/ ca formă umplută
  genereaza reia <p-nume> [--proiect <proiect>] [--json]
      termină o generare pornită la Kie care n-a ajuns în proprii/ (termen depășit, rețea); nu pornește alta, deci nu costă
  randeaza <proiect> --doar-verificare [--json]
      validează datele, construiește compoziția, rulează verificarea motorului (C10) și scrie blocul „Ce apare pe ecran” în scenariu.md; fără MP4
  randeaza <proiect> --schita [--json]
      în plus, instantaneele sau schița la jumătate de rezoluție, cu foaia cadre/foaie-schita-N.jpg; fără MP4, merge și înainte de aprobare
  randeaza <proiect> [--json]
      randarea completă, după aprobare: MP4-ul, verificările pe MP4, cadrele de predare, foaia cadre/foaie-N.jpg și verificare.json
  corectura <proiect> --deschide "<cererea>" | --din-nou "<cererea>" | --verifica | --propuneri [--json]
      corectura cerută după predare: o deschide pe filmul predat, a doua încercare, verificarea a ce s-a schimbat, lista de propuneri după două încercări
  actualizeaza --verifica [--json]
      aduce ultima versiune a agentului fără s-o aplice și spune ce s-a schimbat
  actualizeaza [--chiar-daca-e-in-lucru] [--json]
      trece agentul pe ultima versiune (garda cere aprobarea); video/, branduri/ și proprii/ rămân neatinse
  actualizeaza --inapoi [--chiar-daca-e-in-lucru] [--json]
      revine la versiunea de dinaintea ultimei actualizări (garda cere aprobarea)
  help
      afișează acest text

Coduri de ieșire: 0 reușită, 1 date sau verificări picate, 2 mediu sau motor, 3 argumente greșite.
`;

export const OPTIUNI = {
  doctor: {
    ci: { type: 'boolean' },
    'confirma-canar': { type: 'boolean' },
    generare: { type: 'boolean' },
    'instaleaza-keyring': { type: 'boolean' },
    json: { type: 'boolean' },
  },
  nou: {
    sablon: { type: 'string' },
    format: { type: 'string' },
    brand: { type: 'string' },
    din: { type: 'string' },
    filmare: { type: 'string' },
    limba: { type: 'string' },
    transcriere: { type: 'string' },
    'instaleaza-transcrierea': { type: 'boolean' },
    'instaleaza-motorul': { type: 'boolean' },
    json: { type: 'boolean' },
  },
};
const INDISPONIBILE = new Set();

// Ramura desen (B03): opțiunile din harta 4.12; desen/index.mjs se încarcă doar când e aleasă.
export const OPTIUNI_DESEN = {
  tip: { type: 'string' },
  familie: { type: 'string' },
  tema: { type: 'string' },
  'include-evita': { type: 'boolean' },
  personaj: { type: 'string' },
  licenta: { type: 'string' },
  etichete: { type: 'string' },
  id: { type: 'string' },
  proiect: { type: 'string' },
  brand: { type: 'string' },
  'fara-mapare': { type: 'boolean' },
  json: { type: 'boolean' },
};

function gresit(cod, camp, mesaj, sugestie) {
  return new EroareFatala(eroare(cod, camp, mesaj, sugestie), COD_IESIRE.UTILIZARE);
}

function eroareArgumente(err) {
  const optiune = /'(-{1,2}[^' ]+)/.exec(err.message)?.[1] ?? '';
  const nume = optiune.replace(/^-+/, '') || 'necunoscut';
  const mesaj = err.code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE'
    ? `Opțiunea ${optiune} are nevoie de o valoare.`
    : `Opțiunea ${optiune || 'dată'} nu există pentru această comandă.`;
  return gresit('argument-necunoscut', `argumente.${nume}`, mesaj, 'Vezi opțiunile cu node nucleu/mg.mjs help.');
}

function textPentruOm(comanda, rezultat, ok = true) {
  if (comanda === 'nou' && rezultat.din) {
    return [
      `Proiectul „${rezultat.proiect}” e creat în ${rezultat.dir}/ din video/${rezultat.din}/ (șablonul ${rezultat.sablon}); proiectul vechi a rămas neatins.`,
      `Fișiere: ${rezultat.fisiere.join(', ')}`,
      `Resurse copiate: ${rezultat.resurse.length > 0 ? rezultat.resurse.join(', ') : 'niciuna'}`,
      ok
        ? `Pasul următor: verifică proiectul cu node nucleu/mg.mjs randeaza ${rezultat.proiect} --doar-verificare.`
        : `Pasul următor: repară în ${rezultat.dir}/date.json erorile de mai jos, apoi rulează node nucleu/mg.mjs randeaza ${rezultat.proiect} --doar-verificare.`,
      '',
    ].join('\n');
  }
  if (comanda === 'nou' && rezultat.filmare) {
    const f = rezultat.filmare;
    return [
      `Proiectul „${rezultat.proiect}” e creat în ${rezultat.dir}/ din filmarea ta (${String(f.durata).replace('.', ',')} s, ${f.latime}x${f.inaltime}, ${f.fps} fps, formatul ${rezultat.format}).`,
      `Transcrierea: ${f.cuvinte} cuvinte (${f.sursa_transcriere === 'import' ? 'din fișierul tău de subtitrări' : 'Parakeet, local'}), în ${rezultat.dir}/active/transcriere.json.`,
      `Pasul următor: citește ${rezultat.dir}/cadre/verificare-1fps.jpg (un vorbitor, fără tăieturi, fără subtitrări arse), apoi completează ${rezultat.dir}/date.json.`,
      '',
    ].join('\n');
  }
  if (comanda === 'nou') {
    return [
      `Proiectul „${rezultat.proiect}” e creat în ${rezultat.dir}/ (șablonul ${rezultat.sablon}, formatul ${rezultat.format ?? 'implicit'}).`,
      `Fișiere: ${rezultat.fisiere.join(', ')}`,
      `Pasul următor: completează ${rezultat.dir}/date.json.`,
      '',
    ].join('\n');
  }
  return '';
}

function tipareste(stdout, json, comanda, rez) {
  if (json) {
    stdout.write(`${JSON.stringify({
      ok: rez.ok,
      comanda,
      erori: rez.erori,
      avertismente: rez.avertismente,
      rezultat: rez.rezultat ?? {},
    })}\n`);
    return;
  }
  // mg nou --din creează proiectul și când datele copiate au erori, deci textul apare și atunci.
  if (rez.ok || rez.rezultat?.din) stdout.write(textPentruOm(comanda, rez.rezultat ?? {}, rez.ok));
  if (rez.erori.length > 0 || rez.avertismente.length > 0) {
    stdout.write(`${formateazaPentruOm(rez.erori, rez.avertismente)}\n`);
  }
}

async function ramuraDesen(argumente, radacina, stdout) {
  let parsat;
  try {
    parsat = parseArgs({ args: argumente, options: OPTIUNI_DESEN, strict: true, allowPositionals: true });
  } catch (err) {
    if (typeof err?.code === 'string' && err.code.startsWith('ERR_PARSE_ARGS_')) throw eroareArgumente(err);
    throw err;
  }
  const { values, positionals } = parsat;
  const { comandaDesen } = await import('./lib/desen/index.mjs');
  const rez = await comandaDesen({
    radacina,
    sub: positionals[0],
    pozitionale: positionals.slice(1),
    optiuni: {
      tip: values.tip,
      familie: values.familie,
      tema: values.tema,
      includeEvita: values['include-evita'] === true,
      personaj: values.personaj,
      licenta: values.licenta,
      etichete: values.etichete,
      id: values.id,
      proiect: values.proiect,
      brand: values.brand,
      faraMapare: values['fara-mapare'] === true,
    },
  });
  const { text, ...restul } = rez.rezultat;
  if (values.json === true) {
    stdout.write(`${JSON.stringify({ ok: rez.ok, comanda: 'desen', erori: rez.erori, avertismente: rez.avertismente, rezultat: restul })}\n`);
  } else {
    stdout.write(`${text}\n`);
    if (rez.erori.length > 0 || rez.avertismente.length > 0) stdout.write(`${formateazaPentruOm(rez.erori, rez.avertismente)}\n`);
  }
  return rez.ok ? COD_IESIRE.OK : COD_IESIRE.DATE;
}

// Ramura randeaza (B12): opțiunile din harta 4.12; randeaza/index.mjs se încarcă doar când e aleasă.
// Modurile --doar-verificare, --schita (B15) și randarea completă (B16, fără opțiune) sunt aici.
export const OPTIUNI_RANDEAZA = {
  'doar-verificare': { type: 'boolean' },
  schita: { type: 'boolean' },
  json: { type: 'boolean' },
};

export function textRandeaza(rezultat) {
  const randuri = [];
  if (rezultat.tabel) randuri.push(rezultat.tabel);
  if (rezultat.scenariu) randuri.push(`Blocul „Ce apare pe ecran” e scris în ${rezultat.scenariu}.`);
  randuri.push(`Verificări: ${rezultat.verificari.map((v) => `${v.cod} ${v.ok ? 'ok' : 'picat'}`).join(', ')}.`);
  if (rezultat.schita) {
    const { check } = rezultat.schita;
    randuri.push(`Schița: ${rezultat.schita.celule} instantanee în ${rezultat.schita.instantanee}, foaia în ${rezultat.schita.foaie}.`);
    if (check) {
      randuri.push(`hyperframes check la tranziții: ${check.ok ? 'ok' : 'picat'} (${check.erori} erori, ${check.avertismente} avertismente).`);
      // Felia 8: avertismentul fără conținut lăsa agentul să spună „nu știu ce înseamnă”; arătăm primele trei.
      const avertismente = (check.gasiri ?? []).filter((g) => g.severitate !== 'error');
      for (const g of avertismente.slice(0, 3)) randuri.push(`- avertisment ${g.categorie}/${g.cod}: ${g.mesaj ?? 'fără mesaj'}`);
      const rest = avertismente.length - 3;
      if (rest > 0) randuri.push(`- încă ${rest} ${rest === 1 ? 'avertisment' : 'avertismente'}.`);
    }
    else randuri.push('Check la tranziții: Remotion nu are un echivalent; foaia schiței e făcută din MP4-ul schiței, la jumătate de rezoluție.');
  }
  if (rezultat.schita?.iesiri) randuri.push(`Schița seriei pe ${rezultat.schita.iesiri.join(', ')}.`);
  if (rezultat.mod === 'complet' && rezultat.manifest !== undefined) {
    // seria (felia 3): un MP4 pe rând, manifestul și foaia rundei cu toată seria
    for (const i of rezultat.iesiri) randuri.push(`${i.mp4}: ${i.sarit ? 'neschimbat, păstrat' : i.ok ? 'gata' : 'cu probleme'}.`);
    if (rezultat.manifest) randuri.push(`Manifestul seriei: ${rezultat.manifest}.`);
  } else if (rezultat.mod === 'doar-verificare' && rezultat.iesiri?.length > 0) {
    randuri.push(`Seria: ${rezultat.iesiri.length} filme, ${rezultat.iesiri.map((i) => `${i.fisier} (${String(i.durata).replace('.', ',')} s)`).join(', ')}.`);
  }
  if (rezultat.mod === 'complet') {
    if (rezultat.mp4) {
      randuri.push(`MP4: ${rezultat.mp4}${rezultat.reluat_low_memory ? ` (randat din a doua încercare, cu ${rezultat.reluare ?? '--low-memory-mode'})` : ''}.`);
      randuri.push(`Cadre de predare: ${rezultat.predare.join(', ')}.`);
    }
    if (rezultat.foaie) randuri.push(`Foaia de contact a rundei: ${rezultat.foaie}.`);
    if (rezultat.verificari_lipsa.length > 0) randuri.push(`Verificări încă neimplementate sau nerulate: ${rezultat.verificari_lipsa.join(', ')}.`);
  }
  randuri.push(`Detalii în ${rezultat.verificare}.`);
  // P1: câte runde de revizie s-au folosit; la plafon, predarea cu observațiile la vedere sau „încă o rundă”
  if (rezultat.revizie) randuri.push(rezultat.revizie.mesaj);
  return `${randuri.join('\n')}\n`;
}

async function ramuraRandeaza(argumente, radacina, stdout) {
  let parsat;
  try {
    parsat = parseArgs({ args: argumente, options: OPTIUNI_RANDEAZA, strict: true, allowPositionals: true });
  } catch (err) {
    // ca la desen (B03, P1-4): doar erorile lui parseArgs devin argument-necunoscut; restul merg mai departe
    if (typeof err?.code === 'string' && err.code.startsWith('ERR_PARSE_ARGS_')) throw eroareArgumente(err);
    throw err;
  }
  const { values, positionals } = parsat;
  if (positionals.length > 1) {
    throw gresit('argument-necunoscut', 'argumente.pozitional',
      `Argumentul „${positionals[1]}” nu e așteptat.`,
      'Scrie: node nucleu/mg.mjs randeaza <proiect> --doar-verificare.');
  }
  if (values['doar-verificare'] === true && values.schita === true) {
    throw gresit('argument-necunoscut', 'argumente.schita',
      'Opțiunile --doar-verificare și --schita nu merg împreună.',
      'Alege una: --doar-verificare înainte de aprobare, --schita pentru cadrele de previzualizare.');
  }
  const mod = values['doar-verificare'] === true ? 'doar-verificare' : values.schita === true ? 'schita' : 'complet';
  const { comandaRandeaza } = await import('./lib/randeaza/index.mjs');
  // progresul seriei se scrie pe loc, ca omul să vadă că lucrează; la --json, nimic în afara JSON-ului
  const progres = values.json === true ? null : (linie) => stdout.write(`${linie}\n`);
  const rez = await comandaRandeaza({ radacina, proiect: positionals[0], mod, progres });
  if (values.json === true) {
    stdout.write(`${JSON.stringify({ ok: rez.ok, comanda: 'randeaza', erori: rez.erori, avertismente: rez.avertismente, rezultat: rez.rezultat })}\n`);
  } else {
    stdout.write(textRandeaza(rez.rezultat));
    if (rez.erori.length > 0 || rez.avertismente.length > 0) stdout.write(`${formateazaPentruOm(rez.erori, rez.avertismente)}\n`);
  }
  return rez.ok ? COD_IESIRE.OK : COD_IESIRE.DATE;
}

// Ramura corectura (felia 2): un singur mod pe apel; corectura.mjs se încarcă doar când e aleasă.
export const OPTIUNI_CORECTURA = {
  deschide: { type: 'string' },
  'din-nou': { type: 'string' },
  verifica: { type: 'boolean' },
  propuneri: { type: 'boolean' },
  json: { type: 'boolean' },
};
const MODURI_CORECTURA = ['deschide', 'din-nou', 'verifica', 'propuneri'];

async function ramuraCorectura(argumente, radacina, stdout) {
  let parsat;
  try {
    parsat = parseArgs({ args: argumente, options: OPTIUNI_CORECTURA, strict: true, allowPositionals: true });
  } catch (err) {
    if (typeof err?.code === 'string' && err.code.startsWith('ERR_PARSE_ARGS_')) throw eroareArgumente(err);
    throw err;
  }
  const { values, positionals } = parsat;
  if (positionals.length > 1) {
    throw gresit('argument-necunoscut', 'argumente.pozitional', `Argumentul „${positionals[1]}” nu e așteptat.`,
      'Cererea cursantului se pune între ghilimele: corectura <proiect> --deschide "<cererea>".');
  }
  const alese = MODURI_CORECTURA.filter((m) => values[m] !== undefined);
  if (alese.length !== 1) {
    throw gresit('argument-necunoscut', 'argumente.mod',
      alese.length === 0 ? 'Comanda corectura cere un mod.' : `Modurile ${alese.map((m) => `--${m}`).join(' și ')} nu merg împreună.`,
      'Alege unul: --deschide "<cererea>", --din-nou "<cererea>", --verifica sau --propuneri.');
  }
  const c = await import('./lib/corectura.mjs');
  const proiect = positionals[0];
  let erori = [];
  let rezultat;
  if (alese[0] === 'deschide') rezultat = c.deschide({ radacina, proiect, cerere: values.deschide });
  else if (alese[0] === 'din-nou') rezultat = await c.dinNou({ radacina, proiect, cerere: values['din-nou'] });
  else if (alese[0] === 'propuneri') rezultat = await c.propuneri({ radacina, proiect });
  else ({ erori, rezultat } = await c.verifica({ radacina, proiect }));
  const { text, ...restul } = rezultat;
  const ok = erori.length === 0;
  if (values.json === true) {
    stdout.write(`${JSON.stringify({ ok, comanda: 'corectura', erori, avertismente: [], rezultat: restul })}\n`);
  } else {
    stdout.write(`${text}\n`);
    if (!ok) stdout.write(`${formateazaPentruOm(erori, [])}\n`);
  }
  return ok ? COD_IESIRE.OK : COD_IESIRE.DATE;
}

// Ramura genereaza (felia 5): --estimeaza nu cheltuie nimic; fără el, garda a cerut deja aprobarea costului.
export const OPTIUNI_GENEREAZA = {
  etichete: { type: 'string' },
  proiect: { type: 'string' },
  estimeaza: { type: 'boolean' },
  json: { type: 'boolean' },
};

async function ramuraGenereaza(argumente, radacina, stdout) {
  let parsat;
  try {
    parsat = parseArgs({ args: argumente, options: OPTIUNI_GENEREAZA, strict: true, allowPositionals: true });
  } catch (err) {
    if (typeof err?.code === 'string' && err.code.startsWith('ERR_PARSE_ARGS_')) throw eroareArgumente(err);
    throw err;
  }
  const { values, positionals } = parsat;
  const { comandaGenereaza } = await import('./lib/genereaza/index.mjs');
  const rez = await comandaGenereaza({
    radacina, pozitionale: positionals,
    optiuni: { etichete: values.etichete, proiect: values.proiect, estimeaza: values.estimeaza === true },
  });
  const { text, ...restul } = rez.rezultat;
  if (values.json === true) {
    stdout.write(`${JSON.stringify({ ok: rez.ok, comanda: 'genereaza', erori: rez.erori, avertismente: rez.avertismente, rezultat: restul })}\n`);
  } else {
    stdout.write(`${text}\n`);
  }
  return rez.ok ? COD_IESIRE.OK : COD_IESIRE.DATE;
}

// Ramura actualizeaza (felia 6): --verifica doar aduce și spune ce e nou; altfel garda a cerut deja aprobarea.
export const OPTIUNI_ACTUALIZEAZA = {
  verifica: { type: 'boolean' },
  inapoi: { type: 'boolean' },
  'chiar-daca-e-in-lucru': { type: 'boolean' },
  json: { type: 'boolean' },
};

async function ramuraActualizeaza(argumente, radacina, stdout) {
  let parsat;
  try {
    parsat = parseArgs({ args: argumente, options: OPTIUNI_ACTUALIZEAZA, strict: true, allowPositionals: true });
  } catch (err) {
    if (typeof err?.code === 'string' && err.code.startsWith('ERR_PARSE_ARGS_')) throw eroareArgumente(err);
    throw err;
  }
  const { values, positionals } = parsat;
  if (positionals.length > 0) {
    throw gresit('argument-necunoscut', 'argumente.pozitional', `Argumentul „${positionals[0]}” nu e așteptat.`,
      'Scrie node nucleu/mg.mjs actualizeaza --verifica, actualizeaza sau actualizeaza --inapoi.');
  }
  if (values.verifica && values.inapoi) {
    throw gresit('argument-necunoscut', 'argumente.mod', 'Modurile --verifica și --inapoi nu merg împreună.',
      'Alege unul: --verifica (doar spune ce e nou) sau --inapoi (revine la versiunea de dinainte).');
  }
  const { comandaActualizeaza } = await import('./lib/actualizare/index.mjs');
  const rez = await comandaActualizeaza({
    radacina,
    mod: values.verifica ? 'verifica' : values.inapoi ? 'inapoi' : 'aplica',
    chiarDacaInLucru: values['chiar-daca-e-in-lucru'] === true,
  });
  const { text, ...restul } = rez.rezultat;
  if (values.json === true) {
    stdout.write(`${JSON.stringify({ ok: rez.ok, comanda: 'actualizeaza', erori: rez.erori, avertismente: rez.avertismente, rezultat: restul })}\n`);
  } else {
    stdout.write(`${text}\n`);
    const detalii = formateazaPentruOm(rez.erori, rez.avertismente);
    if (detalii) stdout.write(`${detalii}\n`);
  }
  return rez.ok ? COD_IESIRE.OK : COD_IESIRE.DATE;
}

/**
 * @param {string[]} argv argumentele, fără 'node' și calea scriptului
 * @param {{radacina?: string, stdout?: {write: (s: string) => unknown}}} [optiuni]
 * @returns {Promise<number>} codul de ieșire (COD_IESIRE)
 */
export async function principal(argv, { radacina = radacinaAgent(import.meta.url, 1), stdout = process.stdout } = {}) {
  const comanda = argv[0];
  const json = argv.includes('--json');
  try {
    if (comanda === undefined) {
      stdout.write(AJUTOR);
      return COD_IESIRE.UTILIZARE;
    }
    if (comanda === 'help' || comanda === '--help' || comanda === '-h') {
      stdout.write(AJUTOR);
      return COD_IESIRE.OK;
    }
    if (INDISPONIBILE.has(comanda)) {
      throw gresit('comanda-indisponibila', 'argumente.comanda',
        `Comanda „${comanda}” nu e disponibilă în această versiune a agentului.`,
        'Vezi comenzile disponibile cu node nucleu/mg.mjs help.');
    }
    if (comanda === 'desen') return await ramuraDesen(argv.slice(1), radacina, stdout);
    if (comanda === 'randeaza') return await ramuraRandeaza(argv.slice(1), radacina, stdout);
    if (comanda === 'corectura') return await ramuraCorectura(argv.slice(1), radacina, stdout);
    if (comanda === 'genereaza') return await ramuraGenereaza(argv.slice(1), radacina, stdout);
    if (comanda === 'actualizeaza') return await ramuraActualizeaza(argv.slice(1), radacina, stdout);
    if (!Object.hasOwn(OPTIUNI, comanda)) {
      throw gresit('comanda-necunoscuta', 'argumente.comanda', `Comanda „${comanda}” nu există.`,
        'Vezi comenzile disponibile cu node nucleu/mg.mjs help.');
    }
    let valori;
    let pozitionale;
    try {
      ({ values: valori, positionals: pozitionale } = parseArgs({
        args: argv.slice(1), options: OPTIUNI[comanda], strict: true, allowPositionals: true,
      }));
    } catch (err) {
      if (typeof err?.code === 'string' && err.code.startsWith('ERR_PARSE_ARGS_')) throw eroareArgumente(err);
      throw err;
    }

    if (comanda === 'doctor') {
      if (pozitionale.length > 0) {
        throw gresit('argument-necunoscut', 'argumente.pozitional', `Argumentul „${pozitionale[0]}” nu e așteptat.`,
          'Scrie doar node nucleu/mg.mjs doctor, cu opțiunile din help.');
      }
      if (valori.generare) {
        const { doctorGenerare } = await import('./lib/doctor/generare.mjs');
        const raport = await doctorGenerare({ radacina, instaleaza: valori['instaleaza-keyring'] === true });
        if (valori.json) {
          stdout.write(`${JSON.stringify({ ok: raport.ok, comanda: 'doctor', erori: raport.erori, avertismente: raport.avertismente, rezultat: { faza: 'generare', verificari: raport.verificari } })}\n`);
        } else {
          const detalii = formateazaPentruOm(raport.erori, raport.avertismente);
          stdout.write(`${raport.mesaj}\n${detalii ? `${detalii}\n` : ''}`);
        }
        return raport.ok ? COD_IESIRE.OK : COD_IESIRE.MEDIU;
      }
      if (valori['instaleaza-keyring']) {
        throw gresit('argument-necunoscut', 'argumente.instaleaza-keyring', 'Opțiunea --instaleaza-keyring merge doar cu --generare.',
          'Scrie: node nucleu/mg.mjs doctor --generare --instaleaza-keyring.');
      }
      const { comandaDoctor } = await import('./lib/doctor/index.mjs');
      const { cod, raport } = await comandaDoctor({
        radacina,
        optiuni: { ci: Boolean(valori.ci), confirmaCanar: Boolean(valori['confirma-canar']), json: Boolean(valori.json) },
      });
      if (valori.json) {
        stdout.write(`${JSON.stringify({
          ok: raport.ok,
          comanda: 'doctor',
          erori: raport.erori,
          avertismente: raport.avertismente,
          rezultat: { faza: raport.faza, verificari: raport.verificari, canar: raport.canar, instalat: raport.instalat },
        })}\n`);
      } else {
        const detalii = formateazaPentruOm(raport.erori, raport.avertismente);
        stdout.write(`${raport.mesaj}\n${detalii ? `${detalii}\n` : ''}`);
      }
      return cod;
    }

    // comanda === 'nou'
    if (pozitionale.length > 1) {
      throw gresit('argument-necunoscut', 'argumente.pozitional', `Argumentul „${pozitionale[1]}” nu e așteptat.`,
        'Numele proiectului e un singur cuvânt, cu cratimă între părți: nou programari-luni --sablon <nume>.');
    }
    const { comandaNou } = await import('./lib/nou.mjs');
    const rez = await comandaNou({
      radacina, proiect: pozitionale[0], sablon: valori.sablon, format: valori.format, brand: valori.brand, din: valori.din,
      filmare: valori.filmare, limba: valori.limba, transcriere: valori.transcriere,
      instaleazaTranscrierea: valori['instaleaza-transcrierea'] === true,
      instaleazaMotorul: valori['instaleaza-motorul'] === true,
    });
    tipareste(stdout, json, comanda, rez);
    return rez.ok ? COD_IESIRE.OK : COD_IESIRE.DATE;
  } catch (err) {
    if (err instanceof EroareFatala) {
      tipareste(stdout, json, comanda ?? '', { ok: false, erori: [err.eroareMg], avertismente: [], rezultat: {} });
      return err.codIesire;
    }
    const interna = eroare('eroare-interna', 'mediu.mg', `Eroare neașteptată în mg: ${err?.message ?? err}`,
      'Rulează din nou cu MG_DEPANARE=1 și trimite ieșirea lui Dănuț.');
    tipareste(stdout, json, comanda ?? '', { ok: false, erori: [interna], avertismente: [], rezultat: {} });
    if (process.env.MG_DEPANARE === '1' && err?.stack) stdout.write(`${err.stack}\n`);
    return COD_IESIRE.MEDIU;
  }
}

if (rulatDirect(import.meta.url)) {
  process.exitCode = await principal(process.argv.slice(2));
}
