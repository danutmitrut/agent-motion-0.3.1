// Transcrierea filmării (spec 7.4, „Transcrierea Parakeet”; planul H, H03 și decizia 6).
// Normalizarea și raportul sunt pure; transcrie și importaTranscriere rulează HyperFrames într-un director temporar,
// pentru că `transcribe` rescrie fișierele .html din --dir.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { rotunjeste } from '../cronologie.mjs';
import { COD_IESIRE, EroareFatala, eroare } from '../erori.mjs';
import { stergeRecursiv } from '../fisiere.mjs';
import { ruleazaHyperframes } from '../motor-hf.mjs';
import { ultimeleRanduri } from '../ffmpeg.mjs';

export const LIMBI_PARAKEET = Object.freeze(['en', 'es', 'fr', 'de', 'bg', 'hr', 'cs', 'da', 'nl', 'et', 'fi', 'el', 'hu', 'it',
  'lv', 'lt', 'mt', 'pl', 'pt', 'ro', 'sk', 'sl', 'sv', 'ru', 'uk']);
export const CUVINTE_FUNCTIONALE_RO = Object.freeze(['și', 'că', 'de', 'la', 'în', 'pe', 'nu', 'cu', 'să', 'mai']);
const SEDILE = { '\u015f': 'ș', '\u0163': 'ț', '\u015e': 'Ș', '\u0162': 'Ț' };
const SIMBOLURI = /[♪\uFFFD]/gu;
const ARE_SIMBOL = /[♪\uFFFD]/u;

const curata = (text) => String(text ?? '').replace(/[\u015f\u0163\u015e\u0162]/g, (c) => SEDILE[c]).replace(SIMBOLURI, '').replace(/\s+/g, ' ').trim();

function spargeReplica(intrare, fraza) {
  const cuvinte = curata(intrare.text).split(' ').filter(Boolean);
  const total = cuvinte.reduce((s, c) => s + [...c].length, 0);
  const durata = intrare.end - intrare.start;
  let acc = 0;
  return cuvinte.map((text, i) => {
    const start = intrare.start + (durata * acc) / total;
    acc += [...text].length;
    const end = i === cuvinte.length - 1 ? intrare.end : intrare.start + (durata * acc) / total;
    return { text, start, end, fraza };
  });
}

/** Un cuvânt tăiat de finalul copiei de lucru rămâne doar dacă mai mult de jumătate din el încape. */
function depasireAcceptabila(c, durata) {
  return c.end <= durata || (durata - c.start) * 2 > c.end - c.start;
}

/**
 * @param {Array<{text: string, start: number, end: number}>} brut transcript.json al lui HyperFrames
 * @param {{sursa: 'parakeet'|'import', limba: string, durata: number}} p
 */
export function normalizeazaTranscriere(brut, { sursa, limba, durata }) {
  const lista = Array.isArray(brut) ? brut : [];
  const bucati = sursa === 'import'
    ? lista.flatMap((intrare, k) => spargeReplica(intrare, k))
    : lista.map((x) => ({ text: curata(x.text), start: x.start, end: x.end }));
  const cuvinte = bucati
    .filter((c) => c.text !== '' && Number.isFinite(c.start) && Number.isFinite(c.end) && c.start < durata && depasireAcceptabila(c, durata))
    .map((c, i) => {
      const cuvant = { id: `w${i}`, text: c.text, start: rotunjeste(c.start, 3), end: rotunjeste(Math.min(c.end, durata), 3) };
      if (c.fraza !== undefined) cuvant.fraza = c.fraza;
      return cuvant;
    });
  return { versiune: 1, sursa, limba, durata, cuvinte };
}

const fara = (text) => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

function procentSimboluri(cuvinte, brut) {
  const r3 = (x) => rotunjeste(x, 3);
  if (Array.isArray(brut)) {
    const nevide = brut.filter((x) => String(x?.text ?? '').trim() !== '');
    if (nevide.length === 0) return 0;
    return r3(nevide.filter((x) => ARE_SIMBOL.test(String(x.text).trim())).length / nevide.length);
  }
  return cuvinte.length === 0 ? 0 : r3(cuvinte.filter((c) => ARE_SIMBOL.test(c.text)).length / cuvinte.length);
}

/**
 * @param {object} t transcrierea normalizată
 * @param {Array<{text: string}>} [brut] lista brută de dinainte de normalizare; normalizarea scoate ♪ și U+FFFD,
 *   deci procent_simboluri se poate măsura doar pe ea. Fără brut, procent_simboluri se calculează pe t.
 */
export function raportTranscriere(t, brut) {
  const { cuvinte } = t;
  const baza = { versiune: 1, sursa: t.sursa, limba: t.limba, cuvinte: cuvinte.length };
  if (cuvinte.length === 0) {
    return { ...baza, interval_vorbit: null, cuvinte_pe_secunda: 0, procent_simboluri: procentSimboluri(cuvinte, brut), procent_scurte: 0, durata_max: 0, procent_functionale: 0 };
  }
  const a = cuvinte[0].start;
  const b = cuvinte.at(-1).end;
  const durate = cuvinte.map((c) => c.end - c.start);
  const functionale = new Set(CUVINTE_FUNCTIONALE_RO);
  const r3 = (x) => rotunjeste(x, 3);
  return {
    ...baza,
    interval_vorbit: [r3(a), r3(b)],
    cuvinte_pe_secunda: r3(cuvinte.length / Math.max(b - a, 0.001)),
    procent_simboluri: procentSimboluri(cuvinte, brut),
    procent_scurte: r3(durate.filter((d) => d < 0.05).length / cuvinte.length),
    durata_max: r3(Math.max(...durate)),
    procent_functionale: r3(cuvinte.filter((c) => functionale.has(fara(c.text))).length / cuvinte.length),
  };
}

async function ruleazaTranscribe(radacina, argumente, { ff, mediu } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-transcriere-'));
  try {
    const r = await ruleazaHyperframes(['transcribe', ...argumente, '--dir', dir, '--json'], { radacina, ff, mediu, timeoutMs: 3600000 });
    let json = null;
    try { json = JSON.parse(r.stdout.trim().split(/\r?\n/).at(-1)); } catch { json = null; }
    const fisier = path.join(dir, 'transcript.json');
    if (r.cod !== 0 || json?.ok !== true || !fs.existsSync(fisier)) {
      throw new EroareFatala(eroare('transcriere-esuata', 'argumente.filmare',
        `Transcrierea a eșuat (cod ${r.cod}): ${json?.error ?? json?.message ?? ultimeleRanduri(r.stderr || r.stdout, 3)}`,
        'Rulează node nucleu/mg.mjs doctor; dacă transcrierea e instalată și eroarea rămâne, încearcă importul unui fișier .srt sau .vtt cu --transcriere.'), COD_IESIRE.MEDIU);
    }
    return { brut: JSON.parse(fs.readFileSync(fisier, 'utf8')) };
  } finally {
    stergeRecursiv(dir);
  }
}

export function transcrie(radacina, lucru, limba, optiuni) {
  return ruleazaTranscribe(radacina, [lucru, '--engine', 'parakeet', '--language', limba], optiuni);
}

export async function importaTranscriere(radacina, fisier, optiuni) {
  const ext = path.extname(fisier).toLowerCase();
  if (!['.srt', '.vtt', '.json'].includes(ext)) {
    throw new EroareFatala(eroare('transcriere-format', 'argumente.transcriere',
      `Fișierul de transcriere trebuie să fie .srt, .vtt sau .json, nu „${ext || 'fără extensie'}”.`,
      'Exportă subtitrările din CapCut, Descript sau YouTube ca .srt și dă-mi fișierul.'), COD_IESIRE.UTILIZARE);
  }
  return ruleazaTranscribe(radacina, [fisier], optiuni);
}
