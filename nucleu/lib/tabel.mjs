// Tabelul seriei (spec 7.3, „Intrarea cursantului”; felia 3): CSV-ul sau Excelul cursantului, citit neatins din
// resurse/. CSV-ul: UTF-8 strict (cu sau fără BOM), altfel windows-1250 (Excel în română); UTF-16 cu BOM („Text
// Unicode” din Excel); separatorul ; , sau tab, detectat; CRLF acceptat; ghilimelele după RFC 4180. Excelul (.xlsx):
// prima foaie, citită direct din arhivă (zip + XML, cu zlib din Node), fără dependențe. Sedilele se repară și se
// numără; mojibake-ul rămas după decodare e eroare S01, cu sfatul „CSV UTF-8 (delimitat prin virgulă)”.
import zlib from 'node:zlib';
import { eroare } from './erori.mjs';
import { reparaSedila } from './text.mjs';

const VERIFICARE = { verificare: 'S01' };
const SFAT_CSV = 'În Excel: Fișier, Salvare ca, „CSV UTF-8 (delimitat prin virgulă)”, apoi dă fișierul din nou. Sau dă direct fișierul .xlsx.';
// Tiparele de mojibake: UTF-8 citit ca windows-1252 sau windows-1250 (perechi ca È sau Č urmat de semnul mărcii) și caracterul de înlocuire.
const RE_MOJIBAKE = /\u{FFFD}|[ÈČ][\u2122›šˇ]|Å[£Ÿ¢]|Ă[˘\u00AE]|Ã[¢\u00AEŽ]|Ä[‚ƒ]/u;

/**
 * Textul unui CSV din octeți: UTF-16 cu BOM, apoi UTF-8 strict, apoi windows-1250.
 * @param {Buffer} octeti
 * @returns {{text: string, codificare: 'utf-8'|'utf-16le'|'utf-16be'|'windows-1250'}}
 */
export function decodeazaCsv(octeti) {
  if (octeti.length >= 2 && octeti[0] === 0xff && octeti[1] === 0xfe) return { text: new TextDecoder('utf-16le').decode(octeti.subarray(2)), codificare: 'utf-16le' };
  if (octeti.length >= 2 && octeti[0] === 0xfe && octeti[1] === 0xff) return { text: new TextDecoder('utf-16be').decode(octeti.subarray(2)), codificare: 'utf-16be' };
  try {
    return { text: new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(octeti), codificare: 'utf-8' };
  } catch {
    return { text: new TextDecoder('windows-1250').decode(octeti), codificare: 'windows-1250' };
  }
}

/** Separatorul: cel mai des întâlnit dintre ; , și tab în primul rând (în afara ghilimelelor); la egalitate, ; (Excel în română). */
export function detecteazaSeparator(text) {
  const numar = { ';': 0, ',': 0, '\t': 0 };
  let ghilimele = false;
  for (const c of text) {
    if (c === '"') ghilimele = !ghilimele;
    else if (!ghilimele && (c === '\n' || c === '\r')) break;
    else if (!ghilimele && c in numar) numar[c] += 1;
  }
  const maxim = Math.max(...Object.values(numar));
  if (maxim === 0) return ';';
  return [';', ',', '\t'].find((s) => numar[s] === maxim);
}

/**
 * Rândurile unui CSV (RFC 4180): câmpuri între ghilimele cu "" pentru ghilimele, separatori și rânduri noi în ele.
 * Rândurile complet goale se sar.
 * @param {string} text @param {string} separator
 * @returns {string[][]}
 */
export function parseazaCsv(text, separator) {
  const randuri = [];
  let rand = [];
  let camp = '';
  let ghilimele = false;
  let i = 0;
  const incheieRand = () => {
    rand.push(camp);
    camp = '';
    if (rand.some((c) => c.trim() !== '')) randuri.push(rand);
    rand = [];
  };
  while (i < text.length) {
    const c = text[i];
    if (ghilimele) {
      if (c === '"' && text[i + 1] === '"') {
        camp += '"';
        i += 2;
        continue;
      }
      if (c === '"') ghilimele = false;
      else camp += c;
      i += 1;
      continue;
    }
    if (c === '"' && camp === '') ghilimele = true;
    else if (c === separator) {
      rand.push(camp);
      camp = '';
    } else if (c === '\r' && text[i + 1] === '\n') {
      incheieRand();
      i += 1;
    } else if (c === '\n' || c === '\r') incheieRand();
    else camp += c;
    i += 1;
  }
  if (camp !== '' || rand.length > 0) incheieRand();
  return randuri;
}

// ---------- .xlsx ----------

/** Intrările unei arhive zip, din directorul central: nume → { metoda, comprimat, marime, deplasare }. */
function intrariZip(octeti) {
  let eocd = -1;
  for (let i = octeti.length - 22; i >= Math.max(0, octeti.length - 65557); i--) {
    if (octeti.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('nu e o arhivă zip (lipsește sfârșitul directorului central)');
  const numar = octeti.readUInt16LE(eocd + 10);
  let p = octeti.readUInt32LE(eocd + 16);
  const intrari = new Map();
  for (let k = 0; k < numar; k++) {
    if (octeti.readUInt32LE(p) !== 0x02014b50) throw new Error('directorul central e stricat');
    const metoda = octeti.readUInt16LE(p + 10);
    const comprimat = octeti.readUInt32LE(p + 20);
    const marime = octeti.readUInt32LE(p + 24);
    const lungNume = octeti.readUInt16LE(p + 28);
    const lungExtra = octeti.readUInt16LE(p + 30);
    const lungComentariu = octeti.readUInt16LE(p + 32);
    const deplasare = octeti.readUInt32LE(p + 42);
    const nume = octeti.subarray(p + 46, p + 46 + lungNume).toString('utf8');
    intrari.set(nume, { metoda, comprimat, marime, deplasare });
    p += 46 + lungNume + lungExtra + lungComentariu;
  }
  return intrari;
}

function citesteIntrare(octeti, intrare) {
  const p = intrare.deplasare;
  if (octeti.readUInt32LE(p) !== 0x04034b50) throw new Error('antet local zip stricat');
  const start = p + 30 + octeti.readUInt16LE(p + 26) + octeti.readUInt16LE(p + 28);
  const date = octeti.subarray(start, start + intrare.comprimat);
  if (intrare.metoda === 0) return date;
  if (intrare.metoda === 8) return zlib.inflateRawSync(date);
  throw new Error(`metodă de compresie necunoscută (${intrare.metoda})`);
}

const ENTITATI = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function textXml(s) {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
    return ENTITATI[e];
  });
}

/** Textul unui element <si> sau <is>: toate <t> din el, în ordine (inclusiv bucățile cu formatare, <r>), fără <rPh>. */
function textBogat(xml) {
  const fara = xml.replace(/<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g, '');
  let text = '';
  // elementul gol (<t/>) întâi, ca să nu înghită textul de după el până la următorul </t>
  for (const m of fara.matchAll(/<(?:\w+:)?t(?:\s[^>]*?)?\/>|<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)) text += m[1] === undefined ? '' : textXml(m[1]);
  return text;
}

/** Indexul coloanei din referința celulei (A1 → 0, AB7 → 27). */
function coloana(ref) {
  const litere = /^[A-Z]+/.exec(ref)?.[0] ?? '';
  let n = 0;
  for (const l of litere) n = n * 26 + (l.charCodeAt(0) - 64);
  return n - 1;
}

/** Calea primei foi, din workbook.xml și relațiile lui; implicit xl/worksheets/sheet1.xml. */
function caleaPrimeiFoi(text) {
  const wb = text('xl/workbook.xml');
  const rels = text('xl/_rels/workbook.xml.rels');
  const foaie = wb ? /<(?:\w+:)?sheet\b[^>]*\br:id="([^"]+)"/.exec(wb) ?? /<(?:\w+:)?sheet\b[^>]*\bid="([^"]+)"/.exec(wb) : null;
  if (foaie && rels) {
    for (const m of rels.matchAll(/<(?:\w+:)?Relationship\b([^>]*)\/?>/g)) {
      if (new RegExp(`\\bId="${foaie[1]}"`).test(m[1])) {
        const tinta = /\bTarget="([^"]+)"/.exec(m[1])?.[1];
        if (tinta) return tinta.startsWith('/') ? tinta.slice(1) : `xl/${tinta.replace(/^\.\//, '')}`;
      }
    }
  }
  return 'xl/worksheets/sheet1.xml';
}

/**
 * Rândurile primei foi dintr-un .xlsx: valorile ca text (numerele cum sunt scrise în fișier), celulele lipsă goale.
 * `poze` e numărul de imagini din arhivă (xl/media/): pozele lipite în Excel nu se citesc, dar se observă.
 * @param {Buffer} octeti
 * @returns {{randuri: string[][], poze: number}}
 */
export function citesteXlsx(octeti) {
  const intrari = intrariZip(octeti);
  const text = (nume) => (intrari.has(nume) ? citesteIntrare(octeti, intrari.get(nume)).toString('utf8') : null);
  const comune = [];
  const ss = text('xl/sharedStrings.xml');
  // <si/> (șir gol) întâi; prefixul de spațiu de nume (<x:si>) apare la unele exporturi
  if (ss) for (const m of ss.matchAll(/<(?:\w+:)?si\b[^>]*?\/>|<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/g)) comune.push(m[1] === undefined ? '' : textBogat(m[1]));
  const cale = caleaPrimeiFoi(text);
  const foaie = text(cale);
  if (foaie === null) throw new Error(`lipsește foaia ${cale}`);
  const randuri = [];
  for (const r of foaie.matchAll(/<(?:\w+:)?row\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g)) {
    const rand = [];
    for (const c of (r[1] ?? '').matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
      const atribute = c[1];
      const continut = c[2] ?? '';
      const ref = /\br="([A-Z]+\d+)"/.exec(atribute)?.[1];
      const tip = /\bt="([^"]+)"/.exec(atribute)?.[1] ?? 'n';
      const v = /<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/.exec(continut)?.[1];
      let valoare = '';
      if (tip === 's') valoare = comune[Number(v)] ?? '';
      else if (tip === 'inlineStr') valoare = textBogat(/<(?:\w+:)?is>([\s\S]*?)<\/(?:\w+:)?is>/.exec(continut)?.[1] ?? '');
      else if (tip === 'b') valoare = v === '1' ? 'DA' : 'NU';
      else if (v !== undefined) valoare = textXml(v);
      const k = ref ? coloana(ref) : rand.length;
      while (rand.length < k) rand.push('');
      rand[k] = valoare;
    }
    if (rand.some((x) => x.trim() !== '')) randuri.push(rand);
  }
  const poze = [...intrari.keys()].filter((n) => n.startsWith('xl/media/')).length;
  return { randuri, poze };
}

/**
 * Tabelul cursantului, din octeții fișierului: rândurile brute, sedilele reparate (numărate) și diagnosticul pentru S01.
 * @param {Buffer} octeti @param {{camp: string, nume: string}} p camp = câmpul din erori, nume = calea arătată omului
 * @returns {{ok: true, randuri: string[][], sursa: {tip: 'csv'|'xlsx', codificare: string|null, separator: string|null, sedile: number, poze_in_excel: number}} | {ok: false, eroare: object}}
 */
export function citesteTabel(octeti, { camp, nume }) {
  const xlsx = nume.toLowerCase().endsWith('.xlsx');
  let randuri;
  let sursa;
  if (xlsx) {
    try {
      const r = citesteXlsx(octeti);
      randuri = r.randuri;
      sursa = { tip: 'xlsx', codificare: null, separator: null, sedile: 0, poze_in_excel: r.poze };
    } catch (e) {
      return {
        ok: false,
        eroare: eroare('serie-fisier-invalid', camp, `${nume} nu se poate citi ca Excel (${e.message}).`,
          'Deschide fișierul în Excel și salvează-l din nou ca „Registru de lucru Excel (.xlsx)”, sau salvează-l ca „CSV UTF-8 (delimitat prin virgulă)”.', VERIFICARE),
      };
    }
  } else {
    const d = decodeazaCsv(octeti);
    const text = d.text.replace(/^\u{FEFF}/u, '').normalize('NFC');
    const separator = detecteazaSeparator(text);
    randuri = parseazaCsv(text, separator);
    sursa = { tip: 'csv', codificare: d.codificare, separator, sedile: 0, poze_in_excel: 0 };
  }
  for (const rand of randuri) {
    for (const [k, c] of rand.entries()) {
      // un „?” între litere într-un CSV windows-1250: Excel a înlocuit un caracter pe care codificarea nu-l are
      if (RE_MOJIBAKE.test(c) || (sursa.codificare === 'windows-1250' && /\p{L}\?\p{L}/u.test(c))) {
        return {
          ok: false,
          eroare: eroare('serie-codificare', camp,
            `${nume}: după decodare (${sursa.codificare ?? 'xlsx'}), textul „${c.slice(0, 40)}” are caractere stricate, deci fișierul a fost salvat cu altă codificare.`,
            SFAT_CSV, VERIFICARE),
        };
      }
      const reparat = reparaSedila(c);
      if (reparat !== null) {
        sursa.sedile += [...c].filter((x) => reparaSedila(x) !== null).length;
        rand[k] = reparat;
      }
    }
  }
  return { ok: true, randuri, sursa };
}
