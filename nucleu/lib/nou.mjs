/**
 * mg nou <proiect> --sablon <nume> [--format <format>] [--brand <nume>] (spec 6.10, harta 4.10).
 * mg nou <proiect> --din <proiect-vechi> (B14, spec T5, decizia B-Î2): proiect nou din datele și resursele
 * unui proiect vechi, validate pe schema curentă; proiectul vechi doar se citește.
 */
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { creeazaCtx } from './context.mjs';
import { caiProiect, esteNumeProiect, relativaLaRadacina } from './cai.mjs';
import { COD_IESIRE, EroareFatala, avertisment, eroare } from './erori.mjs';
import {
  citesteJson, citesteText, existaFisier, scrieJsonAtomic, scrieOctetiAtomic, scrieTextAtomic, sha256Fisier, stergeRecursiv,
} from './fisiere.mjs';
import { citesteLock, lockNou, scrieLock } from './lock.mjs';
import { pregatesteFilmare, serviciiImplicite } from './filmare/index.mjs';
import { EXTENSII_FILMARE } from './filmare/sonda.mjs';
import { LIMBI_PARAKEET } from './filmare/transcriere.mjs';
import { instaleazaRemotion, stareRemotion } from './motoare/remotion-instalare.mjs';
import { incarcaSablon } from './sabloane.mjs';
import { extrageBlocMg, inlocuiesteBlocMg, scheletScenariu } from './scenariu.mjs';
import { valideazaPeSchema } from './schema.mjs';
import { citesteVersiuni } from './versiuni.mjs';

const NUME_BRAND = /^[a-z0-9-]{2,40}$/;

function gresit(cod, camp, mesaj, sugestie) {
  return new EroareFatala(eroare(cod, camp, mesaj, sugestie), COD_IESIRE.UTILIZARE);
}

/** Propune un nume valid pornind de la cel greșit: „Programări Luni” → „programari-luni”. */
function numePropus(nume) {
  const propus = String(nume)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return propus || 'proiect-nou';
}

/**
 * O cale de resursă declarată în date: relativă, sub resurse/, cu '/', fără '..', fără backslash.
 * Litera de unitate (C:/...), calea absolută și UNC nu încep cu „resurse/”, deci nu sunt resurse; ':' în interior
 * se respinge și el, fiindcă pe Windows `join` cu o cale cu unitate iese din proiect.
 */
function esteCaleResursa(valoare) {
  if (typeof valoare !== 'string' || !valoare.startsWith('resurse/') || valoare.length <= 'resurse/'.length) return false;
  if (valoare.includes('\\') || valoare.includes(':') || valoare.includes('\0')) return false;
  return valoare.split('/').every((parte) => parte !== '' && parte !== '.' && parte !== '..');
}

/** Toate șirurile din date care sunt căi de resurse, cu câmpul lor (de exemplu muzica.fisier, scene[2].imagine). */
function resurseDeclarate(valoare, camp = '', gasite = []) {
  if (esteCaleResursa(valoare)) {
    gasite.push({ cale: valoare, camp });
  } else if (Array.isArray(valoare)) {
    valoare.forEach((v, i) => resurseDeclarate(v, `${camp}[${i}]`, gasite));
  } else if (valoare !== null && typeof valoare === 'object') {
    for (const [cheie, v] of Object.entries(valoare)) resurseDeclarate(v, camp === '' ? cheie : `${camp}.${cheie}`, gasite);
  }
  return gasite;
}

/**
 * Calea absolută a unei resurse din proiectul vechi, doar dacă e un fișier obișnuit care rămâne sub video/<vechi>/resurse/,
 * și după rezolvarea legăturilor simbolice (o legătură spre afara proiectului nu se urmează); altfel null.
 * Comparația de rădăcină e `relativaLaRadacina` din cai.mjs, aceeași care servește restul nucleului.
 */
function sursaResursa(dirVechi, cale) {
  const baza = join(dirVechi, 'resurse');
  const sursa = join(dirVechi, ...cale.split('/'));
  const relativa = relativaLaRadacina(sursa, baza);
  if (relativa === null || relativa === '') return null;
  try {
    if (!lstatSync(sursa).isFile()) return null;
    // Ancora e folderul real al proiectului vechi: dacă resurse/ însuși e o legătură sau o joncțiune spre afară, nu trece.
    const reala = relativaLaRadacina(realpathSync(sursa), join(realpathSync(dirVechi), 'resurse'));
    return reala === null || reala === '' ? null : sursa;
  } catch {
    return null;
  }
}

/**
 * Textul scenariului vechi, cu titlul pe numele nou și blocul mg golit (nicio aprobare nu trece în proiectul nou).
 * Lipsă: scheletul, fără zgomot. Altă eroare de citire: tot scheletul, dar cu un avertisment care numește fișierul și motivul.
 * @returns {{text: string, avertisment: object|null}}
 */
function scenariuDin(caleVeche, proiect, din, numarScene) {
  const blocGol = extrageBlocMg(scheletScenariu(proiect, 0)).bloc;
  if (!existaFisier(caleVeche)) return { text: scheletScenariu(proiect, numarScene), avertisment: null };
  let text;
  try {
    text = citesteText(caleVeche);
  } catch (e) {
    const motiv = e?.eroareMg?.mesaj ?? e?.message ?? String(e);
    return {
      text: scheletScenariu(proiect, numarScene),
      avertisment: avertisment('scenariu-necitibil', `fisier:video/${din}/scenariu.md`,
        `Nu am putut citi video/${din}/scenariu.md, așa că video/${proiect}/scenariu.md e scheletul gol (${motiv}).`,
        `Repară sau salvează în UTF-8 video/${din}/scenariu.md și copiază de acolo textele scenelor în video/${proiect}/scenariu.md, sau completează scheletul de la zero.`),
    };
  }
  const titluVechi = `# Scenariu: ${din}`;
  if (text.startsWith(`${titluVechi}\n`) || text === titluVechi) text = `# Scenariu: ${proiect}${text.slice(titluVechi.length)}`;
  return { text: inlocuiesteBlocMg(text, blocGol), avertisment: null };
}

/**
 * Verificările lui mg nou pentru un șablon cu intrare: filmare, fără să scrie nimic: filmarea dată, extensia, fișierul,
 * limba, transcrierea importată și transcrierea locală (instalată sau acceptată cu --instaleaza-transcrierea).
 * @returns {Promise<{servicii: object, limba: string}>}
 */
async function verificaArgumenteFilmare({ radacina, filmare, limba, transcriere, instaleazaTranscrierea, servicii }) {
  if (filmare === undefined || filmare === '') {
    throw gresit('filmare-lipsa', 'argumente.filmare', 'Șablonul overlay-filmare are nevoie de filmarea ta: --filmare <cale spre clip>.',
      'Adaugă --filmare <cale spre clip>, de exemplu --filmare C:/Filmari/clip.mp4.');
  }
  if (!EXTENSII_FILMARE.includes(extname(filmare).toLowerCase())) {
    throw gresit('filmare-extensie', 'argumente.filmare', `Filmarea „${basename(filmare)}” nu are o extensie acceptată (${EXTENSII_FILMARE.join(', ')}).`,
      'Exportă clipul ca MP4 (H.264) din aplicația de pe telefon sau din CapCut și dă-mi fișierul exportat.');
  }
  const ca = (cod, camp, mesaj, sugestie) => new EroareFatala(eroare(cod, camp, mesaj, sugestie), COD_IESIRE.DATE);
  if (!existaFisier(resolve(filmare))) {
    throw ca('filmare-necitita', 'argumente.filmare', `Nu găsesc fișierul de filmare ${filmare}.`,
      'Verifică calea; dacă fișierul e pe OneDrive, descarcă-l întâi local (clic dreapta, „Păstrează pe acest dispozitiv”).');
  }
  const limbaFolosita = limba ?? 'ro';
  if (!LIMBI_PARAKEET.includes(limbaFolosita)) {
    throw gresit('limba-necunoscuta', 'argumente.limba', `Limba „${limbaFolosita}” nu e printre limbile transcrierii.`,
      `Alege unul dintre codurile: ${LIMBI_PARAKEET.join(', ')}.`);
  }
  if (transcriere !== undefined && !existaFisier(resolve(transcriere))) {
    throw ca('filmare-necitita', 'argumente.transcriere', `Nu găsesc fișierul de transcriere ${transcriere}.`,
      'Verifică calea spre fișierul .srt, .vtt sau .json.');
  }
  const servicii2 = servicii ?? await serviciiImplicite(radacina);
  if (transcriere === undefined && !servicii2.stareParakeet().instalat && !instaleazaTranscrierea) {
    throw new EroareFatala(eroare('transcriere-neinstalata', 'mediu.parakeet',
      'Transcrierea locală nu e instalată încă. La prima filmare se descarcă o singură dată ~670 MB (modelul Parakeet), apoi transcrierea merge fără internet.',
      'Întreabă cursantul dacă e de acord cu descărcarea; dacă da, rulează aceeași comandă cu --instaleaza-transcrierea.'), COD_IESIRE.MEDIU);
  }
  return { servicii: servicii2, limba: limbaFolosita };
}

/** Rândul din jurnal despre filmare (H05). */
function randJurnalFilmare(acum, numeFisier, f, cuvinte) {
  const ext = extname(f.original.cale);
  return `- ${acum.toISOString()}: filmarea ${numeFisier} copiată în resurse/filmare-original${ext} (sha256 ${f.original.sha256.slice(0, 12)}), `
    + `copia de lucru ${f.latime}x${f.inaltime} la ${f.fps} fps, ${cuvinte} cuvinte transcrise (${f.transcriere.sursa}).`;
}

/**
 * Motorul șablonului (planul I, decizia 2): HyperFrames vine cu mg doctor, Remotion se instalează la primul proiect,
 * doar cu acordul cursantului (--instaleaza-motorul), înainte să se scrie ceva în video/.
 * @param {{radacina: string, sab: {nume: string, motor: string}, instaleazaMotorul: boolean,
 *   serviciiMotor?: {stare: (radacina: string) => {instalat: boolean}, instaleaza: (radacina: string) => Promise<unknown>}}} p
 */
async function asiguraMotorul({ radacina, sab, instaleazaMotorul, serviciiMotor }) {
  if (sab.motor !== 'remotion') {
    if (instaleazaMotorul) {
      throw gresit('argument-necunoscut', 'argumente.instaleaza-motorul',
        `Șablonul „${sab.nume}” merge pe HyperFrames, pe care îl instalează mg doctor; --instaleaza-motorul e doar pentru șabloanele Remotion.`,
        'Scoate opțiunea --instaleaza-motorul.');
    }
    return;
  }
  const servicii = serviciiMotor ?? { stare: stareRemotion, instaleaza: instaleazaRemotion };
  if (servicii.stare(radacina).instalat) return;
  if (!instaleazaMotorul) {
    throw new EroareFatala(eroare('remotion-neinstalat', 'mediu.remotion',
      `Șablonul „${sab.nume}” merge pe motorul Remotion, care nu e instalat încă. La primul proiect se descarcă o singură dată ~340 MB (pachetele Remotion și Chrome Headless Shell), apoi merge fără să mai descarce nimic.`,
      'Întreabă cursantul dacă e de acord cu descărcarea (~340 MB); dacă da, rulează aceeași comandă cu --instaleaza-motorul.'), COD_IESIRE.MEDIU);
  }
  await servicii.instaleaza(radacina);
}

/**
 * mg nou --din: argumentele se verifică înainte să se scrie ceva; erorile de validare și resursele lipsă
 * nu opresc copierea (proiectul nou se creează, ok: false, cursantul repară datele în el).
 * La eșecul unei scrieri sau copieri folderul nou se șterge (E4), ca un proiect pe jumătate să nu blocheze rularea următoare.
 */
async function nouDin({ radacina, proiect, din, cai, acum, servicii, instaleazaMotorul, serviciiMotor }) {
  if (!esteNumeProiect(din)) {
    throw gresit('proiect-nume-invalid', 'argumente.din', `Proiectul vechi „${din}” nu are un nume valid.`,
      'Scrie numele folderului din video/, de exemplu: node nucleu/mg.mjs nou programari-2 --din programari.');
  }
  const vechi = caiProiect(radacina, din);
  if (!existaFisier(vechi.date)) {
    throw gresit('proiect-lipsa', 'argumente.din', `Proiectul vechi „${din}” nu are video/${din}/date.json.`,
      'Verifică numele folderului din video/ al proiectului vechi.');
  }
  const date = citesteJson(vechi.date, `fisier:video/${din}/date.json`);
  let lockVechi = null;
  try {
    lockVechi = citesteLock(vechi.lock);
  } catch {
    lockVechi = null;
  }
  const numeSablon = typeof date?.sablon === 'string' ? date.sablon : lockVechi?.sablon?.nume;
  if (typeof numeSablon !== 'string' || numeSablon === '') {
    throw gresit('sablon-necunoscut', 'argumente.din', `Nu știu din ce șablon e proiectul „${din}”: date.json nu are câmpul sablon, iar motor.lock nu îl numește.`,
      'Pune în video/<proiect-vechi>/date.json câmpul "sablon", de exemplu "sablon": "reel-ilustrat", apoi rulează din nou comanda.');
  }
  const sab = await incarcaSablon(radacina, numeSablon);
  await asiguraMotorul({ radacina, sab, instaleazaMotorul, serviciiMotor });

  // Șablon cu filmare (decizia 16): originalul și transcrierea brută ale proiectului vechi; lipsa lor oprește comanda înainte de orice scriere.
  let filmareVeche = null;
  if (sab.meta.intrare === 'filmare') {
    const dirResurse = join(vechi.dir, 'resurse');
    const nume = existsSync(dirResurse) ? readdirSync(dirResurse).find((n) => /^filmare-original\.[A-Za-z0-9]+$/.test(n)) : undefined;
    const original = nume === undefined ? null : sursaResursa(vechi.dir, `resurse/${nume}`);
    const caleBrut = join(vechi.dir, 'active', 'transcriere.brut.json');
    if (original === null || !existaFisier(caleBrut)) {
      return {
        ok: false,
        erori: [eroare('resursa-lipsa', 'filmare',
          `Proiectul vechi „${din}” nu are ${original === null ? 'resurse/filmare-original.*' : 'active/transcriere.brut.json'}, deci nu pot reface filmarea.`,
          `Refă filmarea cu node nucleu/mg.mjs nou ${proiect} --sablon ${sab.nume} --filmare <cale spre clip>.`)],
        avertismente: [],
        rezultat: { proiect, sablon: sab.nume, motor: sab.motor, dir: `video/${proiect}` },
      };
    }
    filmareVeche = {
      original,
      brut: citesteJson(caleBrut, `fisier:video/${din}/active/transcriere.brut.json`),
      sursa: lockVechi?.filmare?.transcriere?.sursa === 'import' ? 'import' : 'parakeet',
      limba: lockVechi?.filmare?.transcriere?.limba ?? (typeof date?.limba === 'string' ? date.limba : 'ro'),
    };
  }

  const esteObiect = date !== null && typeof date === 'object' && !Array.isArray(date);
  const copie = esteObiect ? { ...date, versiune_schema: sab.meta.versiune_schema } : date;
  if (esteObiect && copie.sablon === undefined) copie.sablon = sab.nume;
  const numarScene = Array.isArray(copie?.scene) ? copie.scene.length : 0;
  const versiuni = await citesteVersiuni(radacina);
  const lock = lockNou({ proiect, sablon: sab, versiuni, acum });
  lock.versiuni_sha256 = sha256Fisier(join(radacina, 'nucleu', 'VERSIUNI.json'));

  const erori = [];
  const avertismente = [];
  const copiate = [];
  const deCopiat = [];
  const vazute = new Set();
  for (const { cale, camp } of resurseDeclarate(copie)) {
    if (vazute.has(cale)) continue;
    vazute.add(cale);
    const sursa = sursaResursa(vechi.dir, cale);
    if (sursa === null) {
      erori.push(eroare('resursa-lipsa', camp, `Resursa ${cale}, declarată în video/${din}/date.json, lipsește din proiectul vechi.`,
        `Pune fișierul în video/${proiect}/${cale} sau scoate-l din video/${proiect}/date.json.`));
      continue;
    }
    deCopiat.push({ cale, sursa });
  }

  const scenariu = scenariuDin(vechi.scenariu, proiect, din, numarScene);
  if (scenariu.avertisment) avertismente.push(scenariu.avertisment);
  try {
    mkdirSync(cai.resurse, { recursive: true });
    for (const { cale, sursa } of deCopiat) {
      scrieOctetiAtomic(join(cai.dir, ...cale.split('/')), readFileSync(sursa));
      copiate.push(cale);
    }
    let randFilmare = [];
    if (filmareVeche !== null) {
      const p = await pregatesteFilmare({
        radacina, cai, sursa: filmareVeche.original, limba: filmareVeche.limba, instaleaza: false,
        servicii: servicii ?? await serviciiImplicite(radacina),
        transcriereVeche: { brut: filmareVeche.brut, sursa: filmareVeche.sursa },
      });
      if (!p.ok) {
        stergeRecursiv(cai.dir);
        return { ok: false, erori: p.erori, avertismente: [...avertismente, ...p.avertismente], rezultat: { proiect, sablon: sab.nume, motor: sab.motor, dir: `video/${proiect}` } };
      }
      lock.filmare = p.filmare;
      copiate.push(p.filmare.original.cale);
      randFilmare = [randJurnalFilmare(acum, basename(filmareVeche.original), p.filmare, p.transcriere.cuvinte.length)];
    }
    scrieJsonAtomic(cai.date, copie);
    scrieTextAtomic(cai.scenariu, scenariu.text);
    scrieTextAtomic(cai.jurnal, [
      `# Jurnal: ${proiect}`,
      '',
      `- ${acum.toISOString()}: proiect creat cu mg nou --din ${din} (șablonul ${sab.nume}; date.json și ${copiate.length} resurse copiate; proiectul vechi a rămas neatins).`,
      ...randFilmare,
      '',
    ].join('\n'));
    scrieLock(cai.lock, lock);
  } catch (e) {
    stergeRecursiv(cai.dir);
    throw e;
  }

  // Validarea pe schema curentă (C02), apoi regulile șablonului, doar dacă schema a trecut (harta 4.16).
  const eroriSchema = valideazaPeSchema(sab.schema, copie);
  erori.push(...eroriSchema);
  if (eroriSchema.length === 0) {
    const v = sab.modul.valideaza(copie, creeazaCtx({ radacina, proiect, dirProiect: cai.dir, sablon: sab, mod: 'doar-verificare' }));
    erori.push(...v.erori);
    avertismente.push(...v.avertismente);
  }

  return {
    ok: erori.length === 0,
    erori,
    avertismente,
    rezultat: {
      proiect,
      din,
      sablon: sab.nume,
      motor: sab.motor,
      format: copie?.format ?? null,
      brand: copie?.brand ?? null,
      dir: `video/${proiect}`,
      fisiere: ['date.json', 'scenariu.md', 'jurnal.md', 'motor.lock', 'resurse/'],
      resurse: copiate,
    },
  };
}

/**
 * @param {{radacina: string, proiect?: string, sablon?: string, format?: string, brand?: string, din?: string, filmare?: string, limba?: string,
 *   transcriere?: string, instaleazaTranscrierea?: boolean, instaleazaMotorul?: boolean, servicii?: object, serviciiMotor?: object, acum?: Date}} p
 *   servicii, serviciiMotor: doar pentru teste (vezi serviciiImplicite din filmare/index.mjs și asiguraMotorul)
 * @returns {Promise<{ok: boolean, erori: object[], avertismente: object[], rezultat: object}>}
 *   Argumentele greșite opresc comanda cu EroareFatala (COD_IESIRE.UTILIZARE), înainte să se scrie ceva.
 */
export async function comandaNou({
  radacina, proiect, sablon, format, brand, din, filmare, limba, transcriere, instaleazaTranscrierea = false, instaleazaMotorul = false,
  servicii, serviciiMotor, acum = new Date(),
}) {
  if (!proiect) {
    throw gresit('proiect-lipsa', 'argumente.proiect', 'Lipsește numele proiectului.',
      'Scrie comanda așa: node nucleu/mg.mjs nou <proiect> --sablon <nume>, de exemplu nou programari --sablon reel-ilustrat.');
  }
  if (!esteNumeProiect(proiect)) {
    throw gresit('proiect-nume-invalid', 'argumente.proiect',
      `Numele „${proiect}” nu e valid: se acceptă doar litere mici fără diacritice, cifre și cratimă, cel mult 40 de caractere, începând cu literă sau cifră.`,
      `Folosește un nume ca „${numePropus(proiect)}”.`);
  }
  if (din !== undefined && (sablon !== undefined || format !== undefined || brand !== undefined
    || filmare !== undefined || limba !== undefined || transcriere !== undefined || instaleazaTranscrierea)) {
    throw gresit('argument-necunoscut', 'argumente.din',
      'Opțiunea --din nu merge împreună cu --sablon, --format, --brand, --filmare, --limba, --transcriere sau --instaleaza-transcrierea.',
      `Scrie doar node nucleu/mg.mjs nou ${proiect} --din <proiect-vechi>: șablonul, formatul, brandul și filmarea vin din proiectul vechi.`);
  }
  const cai = caiProiect(radacina, proiect);
  if (existsSync(cai.dir)) {
    throw gresit('proiect-exista', 'argumente.proiect', `Proiectul „${proiect}” există deja în video/${proiect}.`,
      'Alege alt nume sau lucrează mai departe în proiectul existent.');
  }
  if (din !== undefined) return nouDin({ radacina, proiect, din, cai, acum, servicii, instaleazaMotorul, serviciiMotor });
  if (!sablon) {
    throw gresit('sablon-necunoscut', 'argumente.sablon', 'Lipsește opțiunea --sablon.',
      'Adaugă --sablon <nume>, de exemplu --sablon reel-ilustrat, sau --din <proiect-vechi> ca să pornești din datele unui proiect existent.');
  }
  const sab = await incarcaSablon(radacina, sablon);
  if (format !== undefined && !sab.meta.formate.includes(format)) {
    throw gresit('format-neacceptat', 'argumente.format', `Șablonul „${sab.nume}” nu are formatul „${format}”.`,
      `Alege unul dintre: ${sab.meta.formate.join(', ')}.`);
  }
  if (brand !== undefined && (!NUME_BRAND.test(brand) || !existaFisier(join(radacina, 'branduri', brand, 'vizual.md')))) {
    throw gresit('brand-lipsa', 'argumente.brand', `Nu găsesc fișa de brand branduri/${brand}/vizual.md.`,
      'Creează întâi fișa de brand sau scoate opțiunea --brand.');
  }

  const cuFilmare = sab.meta.intrare === 'filmare';
  if (!cuFilmare && (filmare !== undefined || limba !== undefined || transcriere !== undefined || instaleazaTranscrierea)) {
    throw gresit('argument-necunoscut', 'argumente.filmare', `Șablonul „${sab.nume}” nu lucrează cu o filmare.`,
      'Scoate opțiunile --filmare, --limba, --transcriere și --instaleaza-transcrierea sau alege șablonul overlay-filmare.');
  }
  let pregatire = null;
  if (cuFilmare) pregatire = await verificaArgumenteFilmare({ radacina, filmare, limba, transcriere, instaleazaTranscrierea, servicii });
  await asiguraMotorul({ radacina, sab, instaleazaMotorul, serviciiMotor });

  const date = citesteJson(join(sab.dir, 'exemple', 'minim.json'));
  if (format !== undefined) date.format = format;
  if (brand !== undefined) date.brand = brand;
  const numarScene = Array.isArray(date.scene) ? date.scene.length : 0;
  const versiuni = await citesteVersiuni(radacina);
  const lock = lockNou({ proiect, sablon: sab, versiuni, acum });
  lock.versiuni_sha256 = sha256Fisier(join(radacina, 'nucleu', 'VERSIUNI.json'));

  // Un proiect pe jumătate creat ar bloca o nouă rulare (proiect-exista): la orice eșec ștergem folderul, care nu exista înainte de comandă.
  let p = null;
  try {
    if (cuFilmare) {
      mkdirSync(cai.dir, { recursive: true });
      p = await pregatesteFilmare({
        radacina, cai, sursa: resolve(filmare), limba: pregatire.limba, transcriere: transcriere && resolve(transcriere),
        instaleaza: instaleazaTranscrierea, servicii: pregatire.servicii,
      });
      if (!p.ok) {
        stergeRecursiv(cai.dir);
        return {
          ok: false,
          erori: p.erori,
          avertismente: p.avertismente,
          rezultat: { proiect, sablon: sab.nume, motor: sab.motor, dir: `video/${proiect}`, fisiere: [] },
        };
      }
      date.format = format ?? p.format;
      date.filmare = { ...date.filmare, fisier: 'active/filmare-lucru.mp4' };
      if (limba !== undefined) date.limba = limba;
      lock.filmare = p.filmare;
    }
    scrieJsonAtomic(cai.date, date);
    scrieTextAtomic(cai.scenariu, scheletScenariu(proiect, numarScene));
    scrieTextAtomic(cai.jurnal, [
      `# Jurnal: ${proiect}`,
      '',
      `- ${acum.toISOString()}: proiect creat cu mg nou (șablonul ${sab.nume}, formatul ${date.format ?? 'implicit'}${brand ? `, brandul ${brand}` : ''}).`,
      ...(p ? [randJurnalFilmare(acum, basename(filmare), p.filmare, p.transcriere.cuvinte.length)] : []),
      '',
    ].join('\n'));
    scrieLock(cai.lock, lock);
    mkdirSync(cai.resurse, { recursive: true });
  } catch (e) {
    stergeRecursiv(cai.dir);
    throw e;
  }

  return {
    ok: true,
    erori: [],
    avertismente: [],
    rezultat: {
      proiect,
      sablon: sab.nume,
      motor: sab.motor,
      format: date.format ?? null,
      brand: brand ?? null,
      dir: `video/${proiect}`,
      fisiere: p
        ? ['date.json', 'scenariu.md', 'jurnal.md', 'motor.lock', 'resurse/', `${p.filmare.original.cale}`, 'active/', 'cadre/verificare-1fps.jpg']
        : ['date.json', 'scenariu.md', 'jurnal.md', 'motor.lock', 'resurse/'],
      ...(p ? { filmare: { durata: p.filmare.durata, latime: p.filmare.latime, inaltime: p.filmare.inaltime, fps: p.filmare.fps,
        cuvinte: p.transcriere.cuvinte.length, sursa_transcriere: p.filmare.transcriere.sursa } } : {}),
    },
  };
}
