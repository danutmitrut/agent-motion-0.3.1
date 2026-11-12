// Muzica din date.json (spec 6.5; planul F): validarea în stratul datelor (C07), avertismentul pentru piesa scurtă,
// potrivirea cu cronologia, apoi (F5) transcodarea în build/assets/muzica.m4a, cu cache în active/muzica/.
import fs from 'node:fs';
import path from 'node:path';
import { COD_IESIRE, EroareFatala, avertisment, eroare } from './erori.mjs';
import { existaFisier, mutaFisier, sha256Fisier, sha256Text, stergeRecursiv } from './fisiere.mjs';
import { probeazaAudio, ruleazaFfmpeg, ultimeleRanduri } from './ffmpeg.mjs';
import { numarRo } from './format.mjs';
import { rotunjeste } from './cronologie.mjs';

export const CALE_MUZICA_BUILD = 'build/assets/muzica.m4a';
export const EXTENSII_MUZICA = Object.freeze(['.mp3', '.wav', '.m4a', '.aac']);
export const MARIME_MAXIMA_MUZICA = 50 * 1024 * 1024;
export const VOLUM_IMPLICIT = 0.4;
export const REZERVA_FINAL = 5; // secundele de piesă care trebuie să rămână după incepe_de_la
const EPS = 1e-9;

const C07 = { verificare: 'C07' };
const SUGESTIE_RESURSE = 'Copiază piesa în folderul resurse/ al proiectului și scrie în muzica.fisier calea ei cu /, de exemplu "resurse/muzica.mp3".';

/** @param {object|null} date @returns {boolean} */
export function areMuzica(date) {
  const m = date?.muzica;
  return m !== null && typeof m === 'object' && !Array.isArray(m);
}

/** Calea relativă e de forma resurse/<nume>[/<nume>...], fără .., fără \ și fără segmente goale. */
function caleInResurse(fisier) {
  if (typeof fisier !== 'string' || fisier.includes('\\')) return false;
  const bucati = fisier.split('/');
  return bucati.length >= 2 && bucati[0] === 'resurse' && bucati.slice(1).every((b) => b !== '' && b !== '.' && b !== '..');
}

/**
 * Validarea muzicii, după schema șablonului (C02) și înaintea stilului. Fără muzică nu cheamă ffprobe.
 * @param {object} date
 * @param {{dirProiect: string, ff: {ffprobe: string}|null, probeaza?: typeof probeazaAudio}} optiuni
 * @returns {Promise<{erori: object[], muzica: null|{cale: string, fisier: string, durata: number, volum: number, incepe_de_la: number}}>}
 *   aruncă mai departe EroareFatala (ffprobe nu pornește: eroare de mediu)
 */
export async function valideazaMuzica(date, { dirProiect, ff, probeaza = probeazaAudio }) {
  if (!areMuzica(date)) return { erori: [], muzica: null };
  const { fisier } = date.muzica;
  const volum = date.muzica.volum ?? VOLUM_IMPLICIT;
  const incepe = date.muzica.incepe_de_la ?? 0;
  const greseala = (camp, mesaj, sugestie) => ({ erori: [eroare('valoare-invalida', camp, mesaj, sugestie, C07)], muzica: null });

  if (!caleInResurse(fisier)) {
    return greseala('muzica.fisier', `Muzica „${String(fisier)}” nu e un fișier din folderul resurse/ al proiectului.`, SUGESTIE_RESURSE);
  }
  const extensie = path.extname(fisier).toLowerCase();
  if (!EXTENSII_MUZICA.includes(extensie)) {
    return greseala('muzica.fisier', `Muzica trebuie să fie .mp3, .wav, .m4a sau .aac, nu ${extensie || 'un fișier fără extensie'}.`,
      'Exportă piesa ca MP3 (sau WAV, M4A, AAC), pune-o în resurse/ și schimbă muzica.fisier.');
  }
  const cale = path.join(dirProiect, ...fisier.split('/'));
  if (!existaFisier(cale)) {
    return { erori: [eroare('resursa-lipsa', 'muzica.fisier', `Piesa ${fisier} nu există în proiect.`, SUGESTIE_RESURSE)], muzica: null };
  }
  if (fs.statSync(cale).size > MARIME_MAXIMA_MUZICA) {
    return greseala('muzica.fisier', `Piesa ${fisier} are peste 50 MB.`,
      'Folosește o variantă mai mică a piesei (un MP3 de 192 kbps are cam 1,4 MB pe minut).');
  }
  let info;
  try {
    info = await probeaza(cale, { ffprobe: ff.ffprobe });
  } catch (err) {
    if (err instanceof EroareFatala) throw err; // ffprobe nu pornește: mediul, nu datele
    // Mesajul lui ffprobe (în engleză, cu calea absolută) nu ajută cursantul: rămâne doar ce trebuie să schimbe.
    return greseala('muzica.fisier', `Piesa din muzica.fisier (${fisier}) nu se poate citi ca fișier audio.`,
      'Exportă din nou piesa ca MP3 și înlocuiește fișierul din resurse/.');
  }
  if (info.piste === 0) {
    return greseala('muzica.fisier', `Fișierul ${fisier} nu are nicio pistă audio.`, 'Alege un fișier care conține sunet (MP3, WAV, M4A sau AAC).');
  }
  if (incepe >= info.durata - REZERVA_FINAL - EPS) {
    const maxim = Math.max(0, Math.floor((info.durata - REZERVA_FINAL - 0.1) * 10 + EPS) / 10);
    return greseala('muzica.incepe_de_la',
      `Piesa durează ${numarRo(rotunjeste(info.durata, 1))} s, iar muzica.incepe_de_la (${numarRo(incepe)} s) lasă mai puțin de ${REZERVA_FINAL} s de muzică.`,
      `Pune muzica.incepe_de_la cel mult ${numarRo(maxim)} s sau alege o piesă mai lungă.`);
  }
  return { erori: [], muzica: { cale, fisier, durata: info.durata, volum, incepe_de_la: incepe } };
}

/**
 * Avertismentul pentru piesa mai scurtă decât videoul (restul se completează cu liniște). Nu oprește randarea.
 * @returns {object[]}
 */
export function avertismentPiesaScurta(muzica, cronologie) {
  if (!muzica) return [];
  const ramas = rotunjeste(muzica.durata - muzica.incepe_de_la, 1);
  if (ramas >= cronologie.durata - EPS) return [];
  return [avertisment('valoare-invalida', 'muzica.fisier',
    `Din piesă rămân ${numarRo(ramas)} s după muzica.incepe_de_la, iar videoul are ${numarRo(cronologie.durata)} s: ultimele ${numarRo(rotunjeste(cronologie.durata - ramas, 1))} s vor fi liniște.`,
    'Alege o piesă mai lungă sau micșorează muzica.incepe_de_la, dacă vrei muzică până la capăt.', C07)];
}

/**
 * Muzica din date și `cronologie.audio` trebuie să se potrivească: e o eroare a șablonului, nu a cursantului.
 * @returns {object[]}
 */
export function verificaAudioCronologie(cronologie, muzica) {
  const audio = cronologie.audio ?? null;
  const sugestie = 'E o problemă a șablonului, nu a datelor: trimite lui Dănuț ieșirea lui node nucleu/mg.mjs randeaza <proiect> --doar-verificare --json.';
  if (muzica && audio === null) {
    return [eroare('cronologie-invalida', 'cronologie.audio', 'Datele au muzică, dar cronologia șablonului are audio null.', sugestie)];
  }
  if (!muzica && audio !== null) {
    return [eroare('cronologie-invalida', 'cronologie.audio', 'Cronologia șablonului are audio, deși datele nu au muzică.', sugestie)];
  }
  if (audio === null) return [];
  if (audio.fisier !== CALE_MUZICA_BUILD) {
    return [eroare('cronologie-invalida', 'cronologie.audio.fisier', `cronologie.audio.fisier trebuie să fie ${CALE_MUZICA_BUILD}.`, sugestie)];
  }
  if (Math.abs(audio.durata - cronologie.durata) > EPS) {
    return [eroare('cronologie-invalida', 'cronologie.audio.durata', 'cronologie.audio.durata trebuie să fie durata videoului.', sugestie)];
  }
  return [];
}

// Transcodarea (planul F, F5): HyperFrames primește o singură piesă gata pregătită (volum, fade-uri, durata exactă).
const RETETA = 1; // crește la orice schimbare a lui argumenteTranscodare: cache-ul vechi devine invalid
const FADE_IN = 0.5;
const FADE_OUT = 1.5;
const TOLERANTA_DURATA = 0.05;
const s3 = (x) => rotunjeste(x).toFixed(3);

/**
 * `cronologie.audio` pentru un șablon: null fără muzică.
 * @param {object|null} date
 * @param {number} durata durata videoului (s)
 * @returns {null|{fisier: string, durata: number}}
 */
export function audioCronologie(date, durata) {
  if (!areMuzica(date)) return null;
  return { fisier: CALE_MUZICA_BUILD, durata: rotunjeste(durata) };
}

/**
 * Elementul <audio> al compoziției (atributele confirmate de proba F1, teste/integrare/hyperframes-audio.test.mjs),
 * pus ca ultim copil al rădăcinii. Volumul e deja în fișier (transcodarea), deci data-volume rămâne 1. Fără muzică: șir gol.
 * @param {{audio: null|{durata: number}}|null} cronologie
 * @returns {string}
 */
export function elementAudio(cronologie) {
  const audio = cronologie?.audio ?? null;
  if (!audio) return '';
  return `<audio id="muzica" src="assets/muzica.m4a" data-start="0" data-duration="${audio.durata}" data-track-index="10" data-volume="1"></audio>`;
}

/**
 * Argumentele ffmpeg ale transcodării: [incepe_de_la, incepe_de_la + L) din sursă, cu L = min(durata, ce rămâne din piesă),
 * volumul, fade-in de 0,5 s, fade-out de 1,5 s la capătul lui L, apoi liniște până la durata videoului. AAC 192k, stereo, 48 kHz.
 * @returns {string[]}
 */
export function argumenteTranscodare({ sursa, iesire, volum, incepe_de_la, durataPiesa, durata }) {
  const lungime = Math.min(durata, durataPiesa - incepe_de_la);
  const filtru = `volume=${volum},afade=t=in:st=0:d=${FADE_IN},afade=t=out:st=${s3(Math.max(0, lungime - FADE_OUT))}:d=${FADE_OUT},apad=whole_dur=${s3(durata)}`;
  return [
    '-hide_banner', '-nostdin', '-y', '-ss', s3(incepe_de_la), '-t', s3(lungime), '-i', sursa,
    '-af', filtru,
    '-t', s3(durata), '-c:a', 'aac', '-b:a', '192k', '-ac', '2', '-ar', '48000',
    '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact', iesire,
  ];
}

/**
 * Cheia cache-ului: sursa (sha256) și rețeta. 16 caractere hex: căi scurte pe Windows (MAX_PATH).
 * @returns {string}
 */
export function cheieMuzica({ sha256Sursa, volum, incepe_de_la, durata }) {
  return sha256Text(`${sha256Sursa}\n${JSON.stringify({ reteta: RETETA, volum, incepe_de_la, durata })}`).slice(0, 16);
}

/** Fișierul e o singură pistă AAC cu durata cerută (± 0,05 s). EroareFatala (ffprobe nu pornește) trece mai departe. */
async function esteBun(cale, durata, probeaza, ff) {
  try {
    const info = await probeaza(cale, { ffprobe: ff.ffprobe });
    return info.codec === 'aac' && info.piste === 1 && Math.abs(info.durata - durata) <= TOLERANTA_DURATA;
  } catch (err) {
    if (err instanceof EroareFatala) throw err;
    return false;
  }
}

/**
 * După construieste: build/assets/muzica.m4a, din cache-ul active/muzica/<cheie>.m4a sau transcodat acum.
 * Cache-ul nu e în motor.lock (planul F, abaterea 3): e derivat din resurse/ și se reface oricând.
 * Celelalte fișiere din active/muzica/ (rețete sau parametri vechi) se șterg.
 * @param {{muzica: {cale: string, fisier: string, durata: number, volum: number, incepe_de_la: number}, durata: number,
 *   dirProiect: string, dirBuild: string, ff: {ffmpeg: string, ffprobe: string}, ruleaza?: typeof ruleazaFfmpeg, probeaza?: typeof probeazaAudio}} optiuni
 * @returns {Promise<{cheie: string, din_cache: boolean}>} EroareFatala valoare-invalida pe muzica.fisier (C07) dacă ffmpeg eșuează
 */
export async function pregatesteMuzica({ muzica, durata, dirProiect, dirBuild, ff, ruleaza = ruleazaFfmpeg, probeaza = probeazaAudio }) {
  const dirCache = path.join(dirProiect, 'active', 'muzica');
  fs.mkdirSync(dirCache, { recursive: true });
  const cheie = cheieMuzica({ sha256Sursa: sha256Fisier(muzica.cale), volum: muzica.volum, incepe_de_la: muzica.incepe_de_la, durata });
  const din = path.join(dirCache, `${cheie}.m4a`);
  for (const nume of fs.readdirSync(dirCache)) {
    if (nume !== `${cheie}.m4a`) stergeRecursiv(path.join(dirCache, nume));
  }
  const dinCache = fs.existsSync(din) && await esteBun(din, durata, probeaza, ff);
  if (!dinCache) {
    const temporar = path.join(dirCache, `${cheie}.partial.m4a`);
    const r = await ruleaza(argumenteTranscodare({
      sursa: muzica.cale, iesire: temporar, volum: muzica.volum, incepe_de_la: muzica.incepe_de_la, durataPiesa: muzica.durata, durata,
    }), { ffmpeg: ff.ffmpeg, timeoutMs: 300000 });
    if (r.cod !== 0 || !(await esteBun(temporar, durata, probeaza, ff))) {
      stergeRecursiv(temporar);
      throw new EroareFatala(eroare('valoare-invalida', 'muzica.fisier',
        `Piesa din muzica.fisier (${muzica.fisier}) nu s-a putut pregăti pentru video: ${r.cod !== 0 ? `ffmpeg a eșuat (${ultimeleRanduri(r.stderr)})` : 'fișierul rezultat nu e o pistă AAC cu durata cerută'}.`,
        'Exportă din nou piesa ca MP3 și înlocuiește fișierul din resurse/; dacă eroarea rămâne, rulează node nucleu/mg.mjs doctor.',
        C07), COD_IESIRE.DATE);
    }
    if (fs.existsSync(din)) stergeRecursiv(din); // un fișier stricat din cache; pe Windows, mutarea nu suprascrie
    mutaFisier(temporar, din);
  }
  const tinta = path.join(dirBuild, 'assets', 'muzica.m4a');
  fs.mkdirSync(path.dirname(tinta), { recursive: true });
  fs.copyFileSync(din, tinta);
  return { cheie, din_cache: dinCache };
}
