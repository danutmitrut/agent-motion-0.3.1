// Citirea și scrierea fișierelor (C01), JSON, scriere atomică, sha256.
// Modul doar nativ: importă numai module node:* și cai.mjs, erori.mjs.
// fs se importă ca obiect (nu cu nume), ca testele să poată simula renameSync cu mock.method.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { relativaLaRadacina, normalizeazaCale } from './cai.mjs';
import { eroare, EroareFatala, COD_IESIRE } from './erori.mjs';

const REINCERCARI_REDENUMIRE = 3;
const PAUZA_REDENUMIRE_MS = 200;
// Ștergerea: pe Windows, un folder ținut deschis (Chrome pornit de hyperframes, antivirus, indexare) dă EBUSY,
// ENOTEMPTY sau EPERM câteva sute de milisecunde după ce procesul s-a oprit (revizuirea transversală B01-B13, T9).
const REINCERCARI_STERGERE = 5;
const PAUZA_STERGERE_MS = 100;
const CODURI_STERGERE_TRECATOARE = new Set(['EBUSY', 'ENOTEMPTY', 'EPERM']);

/** @param {string} cale */
function campImplicit(cale) {
  const absoluta = path.resolve(cale);
  const relativa = relativaLaRadacina(absoluta, process.cwd());
  return 'fisier:' + (relativa === null || relativa === '' ? normalizeazaCale(absoluta) : relativa);
}

/** @param {string} camp */
function numeFisier(camp) {
  return camp.startsWith('fisier:') ? camp.slice('fisier:'.length) : camp;
}

/**
 * C01: citește un fișier text ca UTF-8 strict.
 * Respinge UTF-16, scoate BOM-ul UTF-8, CRLF devine LF, textul iese în NFC.
 * @param {string} cale
 * @param {string} [camp] implicit 'fisier:<cale relativă la directorul curent>'
 * @returns {string}
 */
export function citesteText(cale, camp = campImplicit(cale)) {
  return textDinOcteti(citesteOcteti(cale, camp), camp);
}

/**
 * Octeții fișierului, cu eroarea C01 fisier-necitibil când nu se poate citi.
 * @param {string} cale
 * @param {string} [camp]
 * @returns {Buffer}
 */
export function citesteOcteti(cale, camp = campImplicit(cale)) {
  try {
    return fs.readFileSync(cale);
  } catch (e) {
    throw new EroareFatala(
      eroare(
        'fisier-necitibil',
        camp,
        `Fișierul ${numeFisier(camp)} nu poate fi citit (${e.code || e.message}).`,
        'Verifică dacă fișierul există la calea aceasta și nu e deschis în alt program.',
      ),
      COD_IESIRE.DATE,
    );
  }
}

/**
 * C01 pe octeți deja citiți: UTF-8 strict, fără BOM, cu LF, în NFC (regulile lui citesteText).
 * @param {Buffer} octeti
 * @param {string} camp
 * @returns {string}
 */
export function textDinOcteti(octeti, camp) {
  const nume = numeFisier(camp);
  if (octeti.length >= 2 && ((octeti[0] === 0xff && octeti[1] === 0xfe) || (octeti[0] === 0xfe && octeti[1] === 0xff))) {
    throw new EroareFatala(
      eroare(
        'fisier-utf16',
        camp,
        `Fișierul ${nume} e salvat în UTF-16, iar agentul citește doar UTF-8.`,
        'Salvează fișierul din nou cu codificarea UTF-8 (în Notepad: Salvare ca, Codificare: UTF-8).',
      ),
      COD_IESIRE.DATE,
    );
  }
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(octeti);
  } catch {
    throw new EroareFatala(
      eroare(
        'fisier-utf8-invalid',
        camp,
        `Fișierul ${nume} conține octeți care nu sunt UTF-8 valid.`,
        'Salvează fișierul din nou cu codificarea UTF-8 sau scrie-l din nou fără caracterele lipite din alte programe.',
      ),
      COD_IESIRE.DATE,
    );
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return text.replace(/\r\n/g, '\n').normalize('NFC');
}

/**
 * Poziția (indice în text) a primului caracter care face JSON-ul invalid.
 * Mesajele lui JSON.parse diferă între versiunile de Node și nu dau mereu poziția,
 * așa că locul se caută cu un parcurs propriu, după gramatica JSON (RFC 8259).
 * @param {string} text
 * @returns {number}
 */
function pozitieEroareJson(text) {
  let i = 0;
  const greseala = () => {
    throw i;
  };
  const spatii = () => {
    while (i < text.length && ' \t\n\r'.includes(text[i])) i += 1;
  };
  const cuvant = (c) => {
    for (const ch of c) {
      if (text[i] !== ch) greseala();
      i += 1;
    }
  };
  const sir = () => {
    i += 1;
    while (i < text.length) {
      const ch = text[i];
      if (ch === '"') {
        i += 1;
        return;
      }
      if (ch.charCodeAt(0) < 0x20) greseala();
      if (ch === '\\') {
        i += 1;
        if (text[i] === 'u') {
          i += 1;
          for (let k = 0; k < 4; k += 1) {
            if (!/[0-9a-fA-F]/.test(text[i] ?? '')) greseala();
            i += 1;
          }
          continue;
        }
        if (i >= text.length || !'"\\/bfnrt'.includes(text[i])) greseala();
      }
      i += 1;
    }
    greseala();
  };
  const numar = () => {
    const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i));
    if (!m) greseala();
    i += m[0].length;
  };
  const valoare = () => {
    spatii();
    const ch = text[i];
    if (ch === '{') {
      i += 1;
      spatii();
      if (text[i] === '}') {
        i += 1;
        return;
      }
      for (;;) {
        spatii();
        if (text[i] !== '"') greseala();
        sir();
        spatii();
        if (text[i] !== ':') greseala();
        i += 1;
        valoare();
        spatii();
        if (text[i] === ',') {
          i += 1;
          continue;
        }
        if (text[i] === '}') {
          i += 1;
          return;
        }
        greseala();
      }
    }
    if (ch === '[') {
      i += 1;
      spatii();
      if (text[i] === ']') {
        i += 1;
        return;
      }
      for (;;) {
        valoare();
        spatii();
        if (text[i] === ',') {
          i += 1;
          continue;
        }
        if (text[i] === ']') {
          i += 1;
          return;
        }
        greseala();
      }
    }
    if (ch === '"') return sir();
    if (ch === 't') return cuvant('true');
    if (ch === 'f') return cuvant('false');
    if (ch === 'n') return cuvant('null');
    return numar();
  };
  try {
    valoare();
    spatii();
    if (i < text.length) greseala();
    return text.length;
  } catch (pozitie) {
    if (typeof pozitie !== 'number') throw pozitie;
    return Math.min(pozitie, text.length);
  }
}

/**
 * Linia și coloana (de la 1) ale primei greșeli dintr-un JSON invalid.
 * @param {string} text
 * @returns {{linie: number, coloana: number}}
 */
function locEroareJson(text) {
  const inainte = text.slice(0, pozitieEroareJson(text)).split('\n');
  return { linie: inainte.length, coloana: inainte[inainte.length - 1].length + 1 };
}

/**
 * Citește un fișier JSON prin citesteText.
 * @param {string} cale
 * @param {string} [camp]
 * @returns {unknown}
 */
export function citesteJson(cale, camp = campImplicit(cale)) {
  return jsonDinText(citesteText(cale, camp), camp);
}

/**
 * Parsează textul unui fișier JSON, cu eroarea C01 json-invalid (linia și coloana) când nu e JSON valid.
 * @param {string} text
 * @param {string} camp
 * @returns {unknown}
 */
export function jsonDinText(text, camp) {
  try {
    return JSON.parse(text);
  } catch {
    const { linie, coloana } = locEroareJson(text);
    throw new EroareFatala(
      eroare(
        'json-invalid',
        camp,
        `Fișierul ${numeFisier(camp)} nu e JSON valid: problema e la linia ${linie}, coloana ${coloana}.`,
        `Deschide fișierul la linia ${linie} și verifică virgulele, ghilimelele și acoladele din jur.`,
      ),
      COD_IESIRE.DATE,
    );
  }
}

/** @param {number} ms */
function asteaptaSincron(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Scrie text UTF-8 atomic: <cale>.tmp-<pid>, apoi redenumire.
 * La EPERM sau EBUSY (antivirus, indexare pe Windows) reîncearcă de 3 ori, la 200 ms.
 * @param {string} cale
 * @param {string} text
 */
export function scrieTextAtomic(cale, text) {
  scrieOctetiAtomic(cale, Buffer.from(text, 'utf8'));
}

/**
 * Scrie octeți atomic (activele înghețate: PNG, woff2), cu aceeași redenumire și aceleași reîncercări ca scrieTextAtomic.
 * @param {string} cale
 * @param {Buffer} octeti
 */
export function scrieOctetiAtomic(cale, octeti) {
  fs.mkdirSync(path.dirname(cale), { recursive: true });
  const temporar = `${cale}.tmp-${process.pid}`;
  fs.writeFileSync(temporar, octeti);
  try {
    redenumesteCuReincercari(temporar, cale);
  } catch (e) {
    stergeRecursiv(temporar);
    throw e;
  }
}

/**
 * Redenumește un fișier peste destinație (o înlocuiește dacă există). La EPERM sau EBUSY (antivirus, indexare,
 * un player care ține fișierul deschis, pe Windows) reîncearcă de 3 ori, la 200 ms; orice altă eroare se aruncă.
 * @param {string} de
 * @param {string} la
 */
function redenumesteCuReincercari(de, la) {
  for (let incercare = 0; ; incercare += 1) {
    try {
      fs.renameSync(de, la);
      return;
    } catch (e) {
      if ((e.code === 'EPERM' || e.code === 'EBUSY') && incercare < REINCERCARI_REDENUMIRE) {
        asteaptaSincron(PAUZA_REDENUMIRE_MS);
        continue;
      }
      throw e;
    }
  }
}

/**
 * Mută un fișier (de exemplu MP4-ul randat) peste o destinație care poate exista deja, fără să șteargă întâi destinația:
 * - aceeași redenumire cu reîncercări ca la scrierea atomică (EPERM, EBUSY);
 * - între volume (EXDEV, de exemplu un build/ pe alt disc) copiază lângă destinație, redenumește copia peste ea și șterge sursa.
 * Dacă mutarea nu reușește, destinația veche rămâne neatinsă și eroarea se aruncă.
 * @param {string} sursa
 * @param {string} destinatie
 */
export function mutaFisier(sursa, destinatie) {
  try {
    redenumesteCuReincercari(sursa, destinatie);
    return;
  } catch (e) {
    if (e.code !== 'EXDEV') throw e;
  }
  fs.mkdirSync(path.dirname(destinatie), { recursive: true });
  const temporar = `${destinatie}.tmp-${process.pid}`;
  try {
    fs.copyFileSync(sursa, temporar);
    redenumesteCuReincercari(temporar, destinatie);
  } catch (e) {
    stergeRecursiv(temporar);
    throw e;
  }
  stergeRecursiv(sursa);
}

/**
 * @param {string} cale
 * @param {unknown} obiect
 */
export function scrieJsonAtomic(cale, obiect) {
  scrieTextAtomic(cale, JSON.stringify(obiect, null, 2) + '\n');
}

/**
 * sha256 al unui fișier, citit pe bucăți (MP4-uri mari).
 * @param {string} cale
 * @returns {string} hex
 */
export function sha256Fisier(cale) {
  const hash = createHash('sha256');
  const tampon = Buffer.alloc(1024 * 1024);
  const fd = fs.openSync(cale, 'r');
  try {
    let citit;
    while ((citit = fs.readSync(fd, tampon, 0, tampon.length, null)) > 0) {
      hash.update(tampon.subarray(0, citit));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

/**
 * @param {Buffer} octeti
 * @returns {string} hex
 */
export function sha256Octeti(octeti) {
  return createHash('sha256').update(octeti).digest('hex');
}

/**
 * @param {string} text
 * @returns {string} hex, peste octeții UTF-8
 */
export function sha256Text(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * JSON cu cheile sortate recursiv și fără spații, pentru hash-uri de obiecte.
 * @param {unknown} valoare
 * @returns {string}
 */
export function jsonStabil(valoare) {
  if (valoare === null || typeof valoare !== 'object') {
    const s = JSON.stringify(valoare);
    return s === undefined ? 'null' : s;
  }
  if (Array.isArray(valoare)) {
    return '[' + valoare.map((x) => jsonStabil(x)).join(',') + ']';
  }
  const chei = Object.keys(valoare)
    .filter((k) => valoare[k] !== undefined && typeof valoare[k] !== 'function')
    .sort();
  return '{' + chei.map((k) => JSON.stringify(k) + ':' + jsonStabil(valoare[k])).join(',') + '}';
}

/**
 * @param {string} cale
 * @returns {boolean} true doar pentru un fișier obișnuit care există
 */
export function existaFisier(cale) {
  const st = fs.statSync(cale, { throwIfNoEntry: false });
  return Boolean(st && st.isFile());
}

/** @param {unknown} e @returns {boolean} */
const lipsa = (e) => /** @type {{code?: string}} */ (e)?.code === 'ENOENT';

/**
 * Șterge un fișier sau o legătură, trecând peste unul care a dispărut între timp (ENOENT).
 * Pe Windows, un fișier read-only dă EPERM sau EACCES: se face întâi inscriptibil, apoi se reîncearcă.
 * @param {string} cale
 */
function stergeFisier(cale) {
  try {
    fs.unlinkSync(cale);
  } catch (e) {
    if (lipsa(e)) return;
    if (e.code !== 'EPERM' && e.code !== 'EACCES') throw e;
    try {
      fs.chmodSync(cale, 0o666);
      fs.unlinkSync(cale);
    } catch (e2) {
      if (lipsa(e2)) return;
      throw e; // rămâne eroarea de la prima încercare, cea care spune de ce nu se putea șterge
    }
  }
}

/**
 * Șterge o legătură simbolică sau o joncțiune (Windows), fără să intre în ea: ținta rămâne neatinsă.
 * O legătură spre fișier se șterge cu unlinkSync; o joncțiune spre folder cere rmdirSync
 * (unlinkSync dă acolo EPERM sau EISDIR).
 * @param {string} cale
 */
function stergeLegatura(cale) {
  try {
    fs.unlinkSync(cale);
  } catch (e) {
    if (lipsa(e)) return;
    if (e.code !== 'EPERM' && e.code !== 'EISDIR') throw e;
    try {
      fs.rmdirSync(cale);
    } catch (e2) {
      if (lipsa(e2)) return;
      throw e; // nu era o joncțiune: rămâne eroarea de la unlinkSync
    }
  }
}

/**
 * Șterge un folder: întâi conținutul, apoi folderul. Dacă un folder lipsește, nu face nimic.
 * @param {string} cale
 */
function stergeFolder(cale) {
  let intrari;
  try {
    intrari = fs.readdirSync(cale, { withFileTypes: true });
  } catch (e) {
    if (lipsa(e)) return;
    throw e;
  }
  for (const intrare of intrari) {
    const copil = path.join(cale, intrare.name);
    if (intrare.isSymbolicLink()) stergeLegatura(copil);
    else if (intrare.isDirectory()) stergeFolder(copil);
    else if (intrare.isFile()) stergeFisier(copil);
    else stergeCale(copil); // tip necunoscut de sistemul de fișiere: se hotărăște după lstat
  }
  try {
    fs.rmdirSync(cale);
  } catch (e) {
    if (!lipsa(e)) throw e;
  }
}

/**
 * Alege felul de ștergere după lstat (care nu urmează legăturile). Lipsa căii nu e o eroare.
 * @param {string} cale
 */
function stergeCale(cale) {
  const st = fs.lstatSync(cale, { throwIfNoEntry: false });
  if (!st) return;
  if (st.isSymbolicLink()) stergeLegatura(cale);
  else if (st.isDirectory()) stergeFolder(cale);
  else stergeFisier(cale);
}

/**
 * Șterge recursiv un fișier sau un folder, cu semantica lui `fs.rmSync` pornit cu
 * `{ recursive: true, force: true }`, dar fără el: pe Windows, în Node 23 și în Node 24 sub 24.15, rmSync cade cu abort (0xC0000409) pe căi cu
 * caractere non-ASCII (nodejs/node #56049), iar cursanții au diacritice în căi (decizia G1).
 * - o cale care lipsește: nu face nimic;
 * - un fișier read-only (Windows): se face întâi inscriptibil, apoi se șterge;
 * - o legătură simbolică sau o joncțiune: se șterge legătura, niciodată ținta, și nu se intră în ea;
 * - la EBUSY, ENOTEMPTY sau EPERM (un folder ținut încă de un proces pe Windows) reia ștergerea de 5 ori, la 100 ms;
 * - orice altă eroare decât ENOENT, ori una dintre cele trei după ultima reîncercare, se aruncă mai departe.
 * @param {string} cale
 */
export function stergeRecursiv(cale) {
  for (let incercare = 0; ; incercare += 1) {
    try {
      stergeCale(cale);
      return;
    } catch (e) {
      if (!CODURI_STERGERE_TRECATOARE.has(e.code) || incercare >= REINCERCARI_STERGERE) throw e;
      asteaptaSincron(PAUZA_STERGERE_MS);
    }
  }
}

/**
 * Pune `sursa` la `destinatie` ca hardlink (același volum, fără octeți copiați) sau, dacă nu se poate (alt volum,
 * sistem de fișiere fără legături), ca o copie. Destinația veche se șterge întâi. HyperFrames nu acceptă surse din afara
 * folderului compoziției, deci filmarea intră în build/ (spec 7.4, „Riscuri”).
 * @param {string} sursa @param {string} destinatie
 * @returns {'hardlink'|'copie'}
 */
export function legaFisier(sursa, destinatie) {
  stergeRecursiv(destinatie);
  try {
    fs.linkSync(sursa, destinatie);
    return 'hardlink';
  } catch {
    fs.copyFileSync(sursa, destinatie);
    return 'copie';
  }
}

/**
 * Amprenta unei serii predate (felia 3): hash-ul perechilor (id, sha256_mp4) ale ieșirilor, în ordinea lor. Ține locul
 * hash-ului MP4-ului unic în corectură și la Stop (manifestul nu merge: are data scrierii).
 * @param {Array<{id: string, sha256_mp4: string|null}>} iesiri
 * @returns {string}
 */
export function amprentaSerie(iesiri) {
  return sha256Text(jsonStabil(iesiri.map((i) => [i.id, i.sha256_mp4])));
}
