// Sonda și poarta filmării (spec 7.4, „Intrarea cursantului”, pașii 2 și 3; planul H, H01).
// Pură, în afară de probeazaSursa (ffprobe prin nucleu/lib/ffmpeg.mjs).
import { eroare } from '../erori.mjs';
import { probeazaJson } from '../ffmpeg.mjs';

export const ARGUMENTE_SURSA = Object.freeze(['-v', 'error', '-show_streams', '-show_format', '-of', 'json']);
export const EXTENSII_FILMARE = Object.freeze(['.mp4', '.mov', '.m4v', '.webm']);
export const LIMITE_FILMARE = Object.freeze({ min: 5, max: 90 });
// Abatere relativă între fps-ul mediu și cel nominal peste care sursa e socotită VFR. Briefului îi trebuie
// 29,87 față de 30 (0,43%) ca VFR; fracțiile se rotunjesc la 0,01, deci o sursă CFR iese sub 0,05%.
const PRAG_VFR = 0.002;
const TRANSFER_HDR = new Set(['smpte2084', 'arib-std-b67']);

function numar(x) {
  if (x === undefined || x === null || x === '' || x === 'N/A') return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function fractie(text) {
  const [n, d] = String(text ?? '').split('/').map(Number);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null;
  return Math.round((n / d) * 100) / 100;
}

function rotatieFlux(video) {
  const matrice = (video.side_data_list ?? []).find((s) => s.side_data_type === 'Display Matrix' && numar(s.rotation) !== null);
  const brut = matrice ? -numar(matrice.rotation) : numar(video.tags?.rotate) ?? 0;
  const r = ((Math.round(brut / 90) * 90) % 360 + 360) % 360;
  return r;
}

/**
 * @param {string|object} json ieșirea lui ffprobe cu ARGUMENTE_SURSA
 * @returns {{durata: number, latime: number, inaltime: number, rotatie: number, fps: number, vfr: boolean, hdr: boolean, codec: string|null, audio: {codec: string|null, canale: number|null}|null}}
 */
export function parseazaSursa(json) {
  const date = typeof json === 'string' ? JSON.parse(json) : json;
  const fluxuri = Array.isArray(date?.streams) ? date.streams : [];
  const video = fluxuri.find((f) => f.codec_type === 'video' && f.disposition?.attached_pic !== 1);
  if (!video) throw new Error('ffprobe nu a găsit niciun flux video.');
  const audio = fluxuri.find((f) => f.codec_type === 'audio');
  const durata = numar(date?.format?.duration) ?? numar(video.duration);
  if (durata === null) throw new Error('ffprobe nu a întors durata fișierului.');
  const rotatie = rotatieFlux(video);
  const w = numar(video.width);
  const h = numar(video.height);
  const culcat = rotatie === 90 || rotatie === 270;
  const nominal = fractie(video.r_frame_rate);
  const mediu = fractie(video.avg_frame_rate) ?? nominal;
  const dovi = (video.side_data_list ?? []).some((s) => /DOVI/i.test(String(s.side_data_type ?? '')));
  return {
    durata,
    latime: culcat ? h : w,
    inaltime: culcat ? w : h,
    rotatie,
    fps: mediu,
    vfr: nominal !== null && mediu !== null && Math.abs(nominal - mediu) / nominal > PRAG_VFR,
    hdr: TRANSFER_HDR.has(String(video.color_transfer ?? '')) || dovi,
    codec: video.codec_name ?? null,
    audio: audio ? { codec: audio.codec_name ?? null, canale: numar(audio.channels) } : null,
  };
}

/** @param {string} cale @param {{ffprobe: string}} optiuni */
export function probeazaSursa(cale, { ffprobe }) {
  return probeazaJson(cale, { ffprobe }, [...ARGUMENTE_SURSA], parseazaSursa);
}

const rotunjit = (x, zecimale) => Math.round(x * 10 ** zecimale) / 10 ** zecimale;

/**
 * Durata filmării în mesaj, cu o zecimală; când rotunjirea ar cădea pe o limită (90,03 s ar ieși „90 s”, 4,96 s „5 s”),
 * cu două zecimale (trei, dacă tot pe limită ar cădea), ca mesajul să nu-și contrazică limitele.
 */
function secundeDurata(x) {
  const peLimita = (v) => v === LIMITE_FILMARE.min || v === LIMITE_FILMARE.max;
  let zecimale = 1;
  while (zecimale < 3 && x !== rotunjit(x, zecimale) && peLimita(rotunjit(x, zecimale))) zecimale += 1;
  return String(rotunjit(x, zecimale)).replace('.', ',');
}

/** Poarta de decizie de la mg nou: lista erorilor, goală dacă filmarea trece. */
export function poartaFilmare(info) {
  const erori = [];
  if (!info.audio) {
    erori.push(eroare('filmare-fara-audio', 'argumente.filmare', 'Filmarea nu are pistă audio, deci nu are ce transcrie.',
      'Exportă din nou clipul cu sunet sau alege altă filmare, în care vorbești.'));
  }
  if (info.durata < LIMITE_FILMARE.min || info.durata > LIMITE_FILMARE.max) {
    erori.push(eroare('filmare-durata', 'argumente.filmare',
      `Filmarea are ${secundeDurata(info.durata)} s; șablonul acceptă între ${LIMITE_FILMARE.min} și ${LIMITE_FILMARE.max} s.`,
      info.durata > LIMITE_FILMARE.max
        ? 'Taie clipul la cel mult 90 s în aplicația de pe telefon și dă-mi bucata tăiată.'
        : 'Filmează o bucată de cel puțin 5 s.'));
  }
  if (info.hdr) {
    erori.push(eroare('filmare-hdr', 'argumente.filmare', 'Filmarea e HDR (HLG sau Dolby Vision); peste ea culorile ar ieși decolorate.',
      'Exportă clipul în SDR: pe iPhone, Setări > Cameră > Formate, oprește „Video HDR” și filmează din nou, sau exportă din Poze cu opțiunea „Cel mai compatibil”.'));
  }
  return erori;
}
