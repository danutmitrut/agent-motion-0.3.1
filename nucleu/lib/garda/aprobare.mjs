// Hook-ul UserPromptSubmit: înregistrează aprobarea scenariului în motor.lock (spec 5.4, 6.9)
// și runda de revizie în plus cerută explicit de cursant după plafon (decizia P1). Felia 2: notează momentul
// fiecărui mesaj în video/<p>/.cache/mesaj-cursant.json, ca mg corectura să pornească doar dintr-o cerere a cursantului.
// Modul doar nativ: importă numai node:* și module din lista harta 2.
// Nu blochează niciodată mesajul: cel mult nu aprobă și adaugă o precizare în context.
import fs from 'node:fs';
import path from 'node:path';
import { caiProiect, esteNumeProiect } from '../cai.mjs';
import { citesteJson, citesteText, sha256Fisier } from '../fisiere.mjs';
import { citesteLock, scrieLock } from '../lock.mjs';
import { extrageBlocMg, extrageZonaTexte, hashZonaTexte, normalizeazaZona, TITLU_TEXTE } from '../scenariu.mjs';
import { context } from './raspuns.mjs';
import { numaraRunde, plafonRunde, valoareRunde } from './revizor.mjs';

const EVENIMENT = 'UserPromptSubmit';
// „aprob”, opțional cu numele proiectului (după normalizeazaMesaj). G5: punctul și semnul exclamării de la final
// se acceptă („Aprob.”, „aprob programari!”); orice alt adaos lasă mesajul fără efect.
const MESAJ_APROB = /^aprob(?: ([a-z0-9][a-z0-9-]{0,39}))?[.!]*$/;
// P1: „încă o rundă”, „încă o rundă schiță”, opțional cu numele proiectului (după normalizeazaMesaj). Ca la „aprob”
// (G5), punctul și semnul exclamării de la final se acceptă (B13 M3); orice alt adaos lasă mesajul fără efect.
// Felia 8: cursanții scriau „aprob” împreună cu răspunsuri sau cu formule propuse de agent, iar aprobarea nu se înregistra.
const NOTA_APROB_CU_ADAOS =
  'Mesajul începe cu „aprob”, dar nu a înregistrat nicio aprobare: aprobarea se dă doar cu „aprob” sau „aprob <proiect>”, singur în mesaj. ' +
  'Răspunde întâi la restul mesajului; dacă cursantul vrea să aprobe, roagă-l să trimită doar „aprob”, fără altă formulă.';
const MESAJ_RUNDA = /^inca o runda(?: (schita))?(?: ([a-z0-9][a-z0-9-]{0,39}))?[.!]*$/;

/**
 * Forma comparabilă a mesajului: fără diacritice, cu minuscule, un singur spațiu, fără margini.
 * @param {string} prompt
 * @returns {string}
 */
export function normalizeazaMesaj(prompt) {
  return String(prompt ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Proiectele din video/, sortate; [] dacă folderul lipsește. */
function listaProiecte(radacina) {
  let intrari;
  try {
    intrari = fs.readdirSync(path.join(radacina, 'video'), { withFileTypes: true });
  } catch {
    return [];
  }
  return intrari
    .filter((d) => d.isDirectory() && esteNumeProiect(d.name))
    .map((d) => d.name)
    .sort();
}

/**
 * T8: aprobarea cere ca ultima verificare să fi trecut pe date.json de acum. Pasul comun scrie blocul „Ce apare pe ecran”
 * doar când datele n-au erori, dar verificare.json mereu; dacă verificarea a picat sau date.json s-a schimbat de atunci,
 * blocul din scenariu.md poate să nu fie cel care se va randa.
 * D: „verde” înseamnă câmpul `ok_pentru_aprobare` din verificare.json, pe care îl calculează nucleul
 * (docs/interfete/verificare.md): verificările declarate de șablon de stadiu date și build, cu codurile S de aceleași
 * stadii, nu `ok` global. O randare completă refuzată doar de C08 sau picată doar pe MP4 nu blochează aprobarea.
 * Hook-ul nu recalculează verdictul; un verificare.json fără câmp (scris de o versiune veche) nu aprobă.
 * @param {string} dir video/<proiect>
 * @returns {null | 'lipsa' | 'picata' | 'date-schimbate'} null când verificarea e verde pe datele de acum
 */
function problemaVerificare(dir) {
  let verificare;
  try {
    verificare = citesteJson(path.join(dir, 'verificare.json'));
  } catch {
    return 'lipsa';
  }
  if (verificare?.ok_pentru_aprobare !== true) return 'picata';
  let sha;
  try {
    sha = sha256Fisier(path.join(dir, 'date.json'));
  } catch {
    return 'date-schimbate';
  }
  return verificare.sha256_date === sha ? null : 'date-schimbate';
}

function mesajProblema(cerere, proiect, problema) {
  const pas = `Rulează node nucleu/mg.mjs randeaza ${proiect} --doar-verificare, arată-i cursantului blocul „Ce apare pe ecran” din scenariu.md și așteaptă din nou „aprob”.`;
  const motiv = {
    lipsa: `proiectul ${proiect} nu are încă o verificare (verificare.json).`,
    picata: `ultima verificare a proiectului ${proiect} a picat, deci blocul „Ce apare pe ecran” poate să nu fie cel care se va randa. Repară întâi erorile din verificare.json.`,
    'date-schimbate': `date.json s-a schimbat după ultima verificare a proiectului ${proiect}, deci blocul „Ce apare pe ecran” nu mai arată datele de acum.`,
  }[problema];
  return `Mesajul „${cerere}” nu a înregistrat nicio aprobare: ${motiv} ${pas}`;
}

/**
 * Starea unui proiect pentru aprobare, sau null dacă nu are motor.lock, scenariu.md
 * sau un bloc „Ce apare pe ecran” generat. Blocul gol de la mg nou (doar titlurile, scheletScenariu din A12)
 * și blocul fără zona „Texte și cifre” nu se aprobă.
 * `problema` e null când ultima verificare e verde pe date.json de acum (T8).
 */
function stareProiect(radacina, proiect) {
  const dir = path.join(radacina, 'video', proiect);
  const caleScenariu = path.join(dir, 'scenariu.md');
  const caleLock = path.join(dir, 'motor.lock');
  let text;
  let lock;
  try {
    text = citesteText(caleScenariu);
    lock = citesteLock(caleLock);
  } catch {
    return null;
  }
  const extras = extrageBlocMg(text);
  if (!extras || !extras.bloc.includes(TITLU_TEXTE)) return null;
  if (normalizeazaZona(extrageZonaTexte(extras.bloc)) === '') return null;
  const sha256Scenariu = sha256Fisier(caleScenariu);
  return {
    proiect,
    caleLock,
    lock,
    bloc: extras.bloc,
    sha256Scenariu,
    problema: problemaVerificare(dir),
    inAsteptare: lock.aprobare?.sha256_scenariu !== sha256Scenariu,
  };
}

function raspunsContext(text, stderr) {
  const r = { stdout: context(EVENIMENT, text), cod: 0 };
  if (stderr) r.stderr = stderr;
  return r;
}

function precizare(inAsteptare) {
  if (inAsteptare.length === 0) {
    return (
      'Mesajul „aprob” nu a înregistrat nicio aprobare: niciun proiect din video/ nu are un bloc „Ce apare pe ecran” nou și neaprobat. ' +
      'Blocul se scrie cu node nucleu/mg.mjs randeaza <proiect> --doar-verificare.'
    );
  }
  return (
    `Mesajul „aprob” nu a înregistrat nicio aprobare: mai multe proiecte au scenariul în așteptarea aprobării (${inAsteptare.join(', ')}). ` +
    `Aprobarea cere numele proiectului, în forma „aprob <proiect>”, de exemplu „aprob ${inAsteptare[0]}”.`
  );
}

/**
 * P1: cursantul cere explicit încă o rundă de revizie după plafon. Crește cu 1
 * motor.lock.runde_suplimentare.complet (sau .schita), pe care plafonRunde (A17) îl citește.
 * Sub plafon nu scrie nimic. motor.lock e în zona „generat”: agentul nu îl poate scrie, doar acest hook, la mesajul cursantului.
 * @param {{prompt?: string}} intrare JSON-ul hook-ului, deja parsat
 * @param {string} radacina rădăcina agentului
 * @returns {{stdout: string, cod: 0, stderr?: string}}
 */
export function decideRundaSuplimentara(intrare, radacina) {
  const prompt = typeof intrare?.prompt === 'string' ? intrare.prompt : '';
  const potrivire = MESAJ_RUNDA.exec(normalizeazaMesaj(prompt));
  if (!potrivire) return { stdout: '', cod: 0 };

  const schita = potrivire[1] === 'schita';
  const fel = schita ? 'revizie pe schiță' : 'revizie';
  const cerere = schita ? 'încă o rundă schiță' : 'încă o rundă';
  const numit = potrivire[2] ?? null;
  let proiect;
  if (numit) {
    if (!fs.existsSync(path.join(radacina, 'video', numit, 'motor.lock'))) {
      return raspunsContext(`Mesajul „${cerere} ${numit}” nu a pornit nicio rundă: proiectul ${numit} nu există în video/.`);
    }
    proiect = numit;
  } else {
    const laPlafon = listaProiecte(radacina).filter(
      (p) => numaraRunde(radacina, p, { schita }) >= plafonRunde(radacina, p, { schita }),
    );
    if (laPlafon.length === 0) {
      return raspunsContext(`Mesajul „${cerere}” nu a pornit nicio rundă: niciun proiect din video/ nu a atins plafonul de runde de ${fel}.`);
    }
    if (laPlafon.length > 1) {
      return raspunsContext(
        `Mesajul „${cerere}” nu a pornit nicio rundă: mai multe proiecte au atins plafonul de runde de ${fel} (${laPlafon.join(', ')}). ` +
          `Runda în plus cere numele proiectului, în forma „${cerere} <proiect>”, de exemplu „${cerere} ${laPlafon[0]}”.`,
      );
    }
    proiect = laPlafon[0];
  }

  const scrise = numaraRunde(radacina, proiect, { schita });
  const plafon = plafonRunde(radacina, proiect, { schita });
  if (scrise < plafon) {
    return raspunsContext(
      `Proiectul ${proiect} are ${scrise} din ${plafon} runde de ${fel}, deci revizorul mai poate scrie verdicte fără o rundă în plus; motor.lock nu s-a schimbat.`,
    );
  }
  const caleLock = path.join(radacina, 'video', proiect, 'motor.lock');
  try {
    const lock = citesteLock(caleLock);
    const vechi = lock.runde_suplimentare ?? {};
    const runde = { complet: valoareRunde(vechi.complet), schita: valoareRunde(vechi.schita) };
    runde[schita ? 'schita' : 'complet'] += 1;
    scrieLock(caleLock, { ...lock, runde_suplimentare: runde });
  } catch (e) {
    return raspunsContext(
      `Runda în plus pentru proiectul ${proiect} nu a putut fi scrisă în motor.lock (${e?.code ?? e?.message ?? 'eroare necunoscută'}). Plafonul rămâne ${plafon} runde de ${fel}.`,
      `garda: scrierea rundei suplimentare a eșuat: ${e?.stack ?? e}\n`,
    );
  }
  return raspunsContext(
    `Cursantul a cerut explicit încă o rundă de ${fel} pentru proiectul ${proiect}: plafonul a crescut de la ${plafon} la ${plafon + 1} runde și e înregistrat în motor.lock.`,
  );
}

/**
 * Decizia hook-ului UserPromptSubmit: aprobarea („aprob”) sau runda de revizie în plus („încă o rundă”, P1).
 * @param {{prompt?: string}} intrare JSON-ul hook-ului, deja parsat
 * @param {string} radacina rădăcina agentului
 * @param {Date} acum
 * @returns {{stdout: string, cod: 0, stderr?: string}}
 */
/**
 * Momentul mesajului cursantului, în fiecare proiect cu motor.lock (zona generat: agentul nu-l poate scrie).
 * O eroare de scriere lasă proiectul fără notare: corectura cere atunci un mesaj nou, nu se deschide din oficiu.
 */
export function noteazaMesajCursant(radacina, acum) {
  for (const proiect of listaProiecte(radacina)) {
    const c = caiProiect(radacina, proiect);
    if (!fs.existsSync(c.lock)) continue;
    try {
      fs.mkdirSync(c.cache, { recursive: true });
      const temp = `${c.mesajCursant}.${process.pid}.tmp`;
      fs.writeFileSync(temp, `${JSON.stringify({ versiune: 1, la: acum.toISOString() })}\n`);
      fs.renameSync(temp, c.mesajCursant);
    } catch {
      // vezi mai sus
    }
  }
}

export function decideAprobare(intrare, radacina, acum) {
  const prompt = typeof intrare?.prompt === 'string' ? intrare.prompt : '';
  noteazaMesajCursant(radacina, acum);
  const normalizat = normalizeazaMesaj(prompt);
  if (MESAJ_RUNDA.test(normalizat)) return decideRundaSuplimentara(intrare, radacina);
  const potrivire = MESAJ_APROB.exec(normalizat);
  if (!potrivire) {
    // Felia 8: un mesaj care începe cu „aprob” dar are adaos nu aprobă; agentul află de ce, ca să nu propună alte formule.
    return normalizat.startsWith('aprob') ? raspunsContext(NOTA_APROB_CU_ADAOS) : { stdout: '', cod: 0 };
  }

  const numit = potrivire[1] ?? null;
  let tinta;
  if (numit) {
    tinta = stareProiect(radacina, numit);
    if (!tinta) {
      return raspunsContext(
        `Mesajul „aprob ${numit}” nu a înregistrat nicio aprobare: proiectul ${numit} nu există în video/ sau nu are încă blocul „Ce apare pe ecran”, ` +
          `care se scrie cu node nucleu/mg.mjs randeaza ${numit} --doar-verificare.`,
      );
    }
  } else {
    const inAsteptare = listaProiecte(radacina)
      .map((p) => stareProiect(radacina, p))
      .filter((s) => s !== null && s.inAsteptare);
    if (inAsteptare.length !== 1) return raspunsContext(precizare(inAsteptare.map((s) => s.proiect)));
    tinta = inAsteptare[0];
  }

  if (tinta.problema) {
    return raspunsContext(mesajProblema(numit ? `aprob ${numit}` : 'aprob', tinta.proiect, tinta.problema));
  }

  const lockNou = {
    ...tinta.lock,
    aprobare: {
      sha256_scenariu: tinta.sha256Scenariu,
      sha256_texte: hashZonaTexte(tinta.bloc),
      aprobat_la: acum.toISOString(),
      mesaj: prompt,
    },
  };
  try {
    scrieLock(tinta.caleLock, lockNou);
  } catch (e) {
    return raspunsContext(
      `Aprobarea pentru proiectul ${tinta.proiect} nu a putut fi scrisă în motor.lock (${e?.code ?? e?.message ?? 'eroare necunoscută'}). Scenariul nu este aprobat.`,
      `garda: scrierea aprobării a eșuat: ${e?.stack ?? e}\n`,
    );
  }
  return raspunsContext(
    `Aprobarea scenariului pentru proiectul ${tinta.proiect} a fost înregistrată în motor.lock. Urmează randarea completă: node nucleu/mg.mjs randeaza ${tinta.proiect}.`,
  );
}
