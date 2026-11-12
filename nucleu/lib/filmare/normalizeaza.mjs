// Normalizarea filmării în copia de lucru și foaia de verificare la 1 fps (spec 7.4, pașii 3 și 4; planul H, H02).
// Copia de lucru rezolvă HEVC, rata de cadre variabilă și rotația din metadate; GOP-ul egal cu fps-ul previne
// înghețarea imaginii sub overlay. Nu se schimbă nici culoarea, nici sunetul (doar recodare AAC).
import fs from 'node:fs';
import { COD_IESIRE, EroareFatala, eroare } from '../erori.mjs';
import { ruleazaFfmpeg, ultimeleRanduri } from '../ffmpeg.mjs';
import { mutaFisier, stergeRecursiv } from '../fisiere.mjs';

export function fpsTinta(fps) {
  return fps < 27.5 ? 25 : 30;
}

const par = (x) => Math.floor(x / 2) * 2;

export function dimensiuniTinta(latime, inaltime) {
  const scurta = Math.min(latime, inaltime);
  const k = scurta > 1080 ? 1080 / scurta : 1;
  return { latime: par(Math.round(latime * k)), inaltime: par(Math.round(inaltime * k)) };
}

export function argumenteNormalizare(sursa, dest, info) {
  const fps = fpsTinta(info.fps);
  const { latime, inaltime } = dimensiuniTinta(info.latime, info.inaltime);
  return [
    '-hide_banner', '-nostdin', '-y', '-i', sursa,
    '-map', '0:v:0', '-map', '0:a:0',
    '-vf', `scale=${latime}:${inaltime}:flags=lanczos,fps=${fps},format=yuv420p,setsar=1`,
    '-fps_mode', 'cfr',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-g', String(fps), '-keyint_min', String(fps), '-sc_threshold', '0',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
    '-map_metadata', '-1', '-movflags', '+faststart',
    '-f', 'mp4', dest,
  ];
}

/** @returns {Promise<{fps: number, latime: number, inaltime: number}>} */
export async function normalizeaza(sursa, dest, info, ff) {
  const temporar = `${dest}.tmp.mp4`;
  stergeRecursiv(temporar);
  const r = await ruleazaFfmpeg(argumenteNormalizare(sursa, temporar, info), { ffmpeg: ff.ffmpeg, timeoutMs: 1800000 });
  if (r.cod !== 0 || !fs.existsSync(temporar)) {
    stergeRecursiv(temporar);
    throw new EroareFatala(eroare('filmare-normalizare-esuata', 'argumente.filmare',
      `Copia de lucru a filmării nu s-a putut face (ffmpeg, cod ${r.cod}): ${ultimeleRanduri(r.stderr, 2)}`,
      'Încearcă să exporți clipul din nou din telefon (MP4, H.264) și dă-mi fișierul nou; dacă eroarea rămâne, trimite mesajul lui Dănuț.'), COD_IESIRE.MEDIU);
  }
  mutaFisier(temporar, dest);
  return { fps: fpsTinta(info.fps), ...dimensiuniTinta(info.latime, info.inaltime) };
}

export function argumenteFoaieVerificare(lucru, destJpg, { durata, latime, inaltime }) {
  const celula = latime >= inaltime ? 320 : 270;
  const cadre = Math.min(90, Math.max(1, Math.ceil(durata)));
  const randuri = Math.ceil(cadre / 6);
  return ['-hide_banner', '-nostdin', '-y', '-i', lucru, '-vf', `fps=1,scale=${celula}:-2,tile=6x${randuri}`, '-frames:v', '1', '-q:v', '4', destJpg];
}

export async function foaieVerificare(lucru, destJpg, dims, ff) {
  const r = await ruleazaFfmpeg(argumenteFoaieVerificare(lucru, destJpg, dims), { ffmpeg: ff.ffmpeg, timeoutMs: 600000 });
  if (r.cod !== 0 || !fs.existsSync(destJpg)) {
    throw new EroareFatala(eroare('filmare-normalizare-esuata', 'argumente.filmare',
      `Foaia de verificare a filmării nu s-a putut face (ffmpeg, cod ${r.cod}): ${ultimeleRanduri(r.stderr, 2)}`,
      'Trimite mesajul lui Dănuț.'), COD_IESIRE.MEDIU);
  }
}
