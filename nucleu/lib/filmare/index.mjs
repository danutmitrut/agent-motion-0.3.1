// Pașii lui mg nou pentru un șablon cu intrare: filmare (spec 7.4, „Intrarea cursantului”; planul H, H05).
import fs from 'node:fs';
import path from 'node:path';
import { COD_IESIRE, EroareFatala, eroare } from '../erori.mjs';
import { rezolvaFfmpeg } from '../ffmpeg.mjs';
import { scrieJsonAtomic, sha256Fisier } from '../fisiere.mjs';
import { citesteVersiuni } from '../versiuni.mjs';
import { probeazaSursa, poartaFilmare } from './sonda.mjs';
import { normalizeaza, foaieVerificare } from './normalizeaza.mjs';
import { stareParakeet, instaleazaParakeet } from './parakeet.mjs';
import { transcrie, importaTranscriere, normalizeazaTranscriere, raportTranscriere } from './transcriere.mjs';

/** Serviciile reale; testele dau în loc o copie cu aceeași formă (comandaNou, parametrul servicii). */
export async function serviciiImplicite(radacina) {
  const ff = await rezolvaFfmpeg(radacina);
  const versiuni = citesteVersiuni(radacina);
  return {
    ff,
    stareParakeet: () => stareParakeet({ versiuni }),
    instaleazaParakeet: () => instaleazaParakeet(radacina, { ff }),
    transcrie: (lucru, limba) => transcrie(radacina, lucru, limba, { ff }),
    importaTranscriere: (fisier) => importaTranscriere(radacina, fisier, { ff }),
  };
}

const rel = (cale) => cale.split(path.sep).join('/');

/**
 * @param {{radacina: string, cai: object, sursa: string, limba: string, transcriere?: string, instaleaza: boolean,
 *          servicii: object, transcriereVeche?: {brut: object[], sursa: 'parakeet'|'import'}}} p
 *   transcriereVeche: la mg nou --din, transcrierea brută a proiectului vechi, refolosită (decizia 16)
 */
export async function pregatesteFilmare({ radacina, cai, sursa, limba, transcriere, instaleaza, servicii, transcriereVeche }) {
  const { ff } = servicii;
  const versiuni = citesteVersiuni(radacina);
  let info;
  try {
    info = await probeazaSursa(sursa, { ffprobe: ff.ffprobe });
  } catch (e) {
    if (e instanceof EroareFatala) throw e;
    throw new EroareFatala(eroare('filmare-necitita', 'argumente.filmare', `Nu pot citi filmarea: ${e.message}`,
      'Verifică dacă fișierul se deschide pe calculator; dacă e pe OneDrive, descarcă-l întâi local (clic dreapta, „Păstrează pe acest dispozitiv”).'), COD_IESIRE.DATE);
  }
  const poarta = poartaFilmare(info);
  if (poarta.length > 0) return { ok: false, erori: poarta, avertismente: [] };

  const ext = path.extname(sursa).toLowerCase();
  const original = path.join(cai.dir, 'resurse', `filmare-original${ext}`);
  const dirActive = path.join(cai.dir, 'active');
  const lucru = path.join(dirActive, 'filmare-lucru.mp4');
  fs.mkdirSync(path.dirname(original), { recursive: true });
  fs.mkdirSync(dirActive, { recursive: true });
  fs.mkdirSync(path.join(cai.dir, 'cadre'), { recursive: true });
  fs.copyFileSync(sursa, original);
  const norm = await normalizeaza(original, lucru, info, ff);
  const lucruInfo = await probeazaSursa(lucru, { ffprobe: ff.ffprobe });
  await foaieVerificare(lucru, path.join(cai.dir, 'cadre', 'verificare-1fps.jpg'), { durata: lucruInfo.durata, latime: norm.latime, inaltime: norm.inaltime }, ff);

  let brut;
  let sursaTr;
  if (transcriereVeche) {
    ({ brut } = transcriereVeche);
    sursaTr = transcriereVeche.sursa;
  } else if (transcriere) {
    ({ brut } = await servicii.importaTranscriere(transcriere));
    sursaTr = 'import';
  } else {
    if (!servicii.stareParakeet().instalat) await servicii.instaleazaParakeet();
    ({ brut } = await servicii.transcrie(lucru, limba));
    sursaTr = 'parakeet';
  }
  const tr = normalizeazaTranscriere(brut, { sursa: sursaTr, limba, durata: lucruInfo.durata });
  if (tr.cuvinte.length === 0) {
    return { ok: false, avertismente: [], erori: [eroare('transcriere-goala', 'argumente.filmare', 'Transcrierea nu are niciun cuvânt: în filmare nu se aude vorbire.',
      'Verifică sunetul clipului; dacă vorbești, dar e zgomot mare, dă-mi subtitrările din CapCut sau YouTube ca .srt, cu --transcriere.')] };
  }
  scrieJsonAtomic(path.join(dirActive, 'transcriere.brut.json'), brut);
  scrieJsonAtomic(path.join(dirActive, 'transcriere.json'), tr);
  scrieJsonAtomic(path.join(dirActive, 'raport.json'), raportTranscriere(tr, brut));
  const t = versiuni.transcriere;
  const filmare = {
    original: { cale: rel(path.relative(cai.dir, original)), sha256: sha256Fisier(original) },
    lucru: { cale: 'active/filmare-lucru.mp4', sha256: sha256Fisier(lucru) },
    transcriere: { cale: 'active/transcriere.json', sha256: sha256Fisier(path.join(dirActive, 'transcriere.json')), sursa: sursaTr, limba },
    fps: norm.fps, latime: norm.latime, inaltime: norm.inaltime, durata: lucruInfo.durata,
    sursa_info: { latime: info.latime, inaltime: info.inaltime, rotatie: info.rotatie, fps: info.fps, vfr: info.vfr, codec: info.codec },
    motor_transcriere: sursaTr === 'parakeet' ? { runtime: t.runtime, versiune: t.versiune, model: t.model, revizie: t.revizie } : null,
  };
  return { ok: true, erori: [], avertismente: [], filmare, transcriere: tr, format: norm.latime >= norm.inaltime ? 'orizontal' : 'vertical' };
}
