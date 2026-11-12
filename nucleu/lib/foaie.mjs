// Foaia de contact (C16), foaia schiței și cadrele de predare, cu ffmpeg.
// Fără drawtext: etichetele stau în JSON, ca foaia să nu depindă de fonturile ffmpeg pe Windows (spec 6.14).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { normalizeazaCale } from './cai.mjs';
import { rotunjeste } from './cronologie.mjs';
import { eroare, EroareFatala, COD_IESIRE } from './erori.mjs';
import { mutaFisier, scrieJsonAtomic, stergeRecursiv } from './fisiere.mjs';
import { probeazaMp4, ruleazaFfmpeg, secundaCautare, ultimeleRanduri } from './ffmpeg.mjs';

/**
 * Sugestia lui foaie-lipsa, cu numele real al proiectului (fără el, locul rămâne <proiect>, pentru apelurile fără proiect).
 * @param {string|undefined} proiect
 * @param {boolean} [schita] foaia schiței se reface cu --schita
 */
export function sugestie(proiect, schita = false) {
  return `Rulează din nou node nucleu/mg.mjs randeaza ${proiect ?? '<proiect>'}${schita ? ' --schita' : ''}; dacă eroarea se repetă, rulează node nucleu/mg.mjs doctor.`;
}

function lipsaFoaie(camp, mesaj, sug) {
  return new EroareFatala(eroare('foaie-lipsa', camp, mesaj, sug), COD_IESIRE.MEDIU);
}

// secundaCautare trăiește în ffmpeg.mjs (o folosește și cadruLa); aici rămâne exportată, ca până acum.
export { secundaCautare };

async function extragePng(mp4, t, fps, scala, iesire, ff, sug) {
  const argumente = ['-v', 'error', '-nostdin', '-y', '-ss', secundaCautare(t, fps), '-i', mp4, '-frames:v', '1'];
  if (scala) argumente.push('-vf', `scale=${scala[0]}:${scala[1]}`);
  argumente.push(iesire);
  const r = await ruleazaFfmpeg(argumente, { ffmpeg: ff.ffmpeg });
  if (r.cod !== 0 || !fs.existsSync(iesire)) {
    throw lipsaFoaie('cadre', `Nu am putut extrage cadrul de la ${t} s din ${path.basename(mp4)}: ${ultimeleRanduri(r.stderr, 1)}`, sug);
  }
}

/** Celulele grilei: index, rând și coloană numărate de la 1, cel mult 4 coloane. */
function celuleGrila(momente) {
  const coloane = Math.min(4, momente.length);
  return momente.map((m, i) => ({
    index: i + 1,
    t: rotunjeste(m.t),
    eticheta: m.eticheta,
    ref: m.ref,
    rand: Math.floor(i / coloane) + 1,
    coloana: (i % coloane) + 1,
  }));
}

/** Cuvintele rostite în ± 1 s față de t (spec 7.4, „Ce verifică revizorul”), în ordine, unite cu spațiu. */
export function rostitLa(transcriere, t) {
  return transcriere.filter((c) => c.start >= t - 1 && c.start <= t + 1).map((c) => c.text).join(' ');
}

/**
 * Lipește PNG-urile într-o grilă (concat + tile), scalate la latimeCelula (înălțimea păstrează proporția, pară).
 * Scrie întâi un fișier temporar, apoi îl mută peste iesireJpg (mutaFisier: reîncercări pe Windows, ca la MP4).
 */
async function compuneGrila(pnguri, iesireJpg, ff, latimeCelula, sug) {
  const n = pnguri.length;
  const coloane = Math.min(4, n);
  const randuri = Math.ceil(n / coloane);
  const scalari = pnguri.map((_, i) => `[${i}:v]scale=${latimeCelula}:-2[c${i}]`).join(';');
  const intrari = pnguri.flatMap((p) => ['-i', p]);
  const etichete = pnguri.map((_, i) => `[c${i}]`).join('');
  fs.mkdirSync(path.dirname(iesireJpg), { recursive: true });
  const temporar = path.join(path.dirname(iesireJpg), `.foaie-${process.pid}.jpg`);
  const r = await ruleazaFfmpeg(
    [
      '-v', 'error', '-nostdin', '-y',
      ...intrari,
      '-filter_complex', `${scalari};${etichete}concat=n=${n}:v=1:a=0,tile=${coloane}x${randuri}`,
      '-frames:v', '1', '-q:v', '3',
      temporar,
    ],
    { ffmpeg: ff.ffmpeg },
  );
  if (r.cod !== 0 || !fs.existsSync(temporar)) {
    stergeRecursiv(temporar);
    throw lipsaFoaie('cadre', `Nu am putut compune foaia de contact: ${ultimeleRanduri(r.stderr, 1)}`, sug);
  }
  try {
    mutaFisier(temporar, iesireJpg);
  } catch (e) {
    stergeRecursiv(temporar);
    throw lipsaFoaie('cadre', `Nu am putut scrie ${path.basename(iesireJpg)} (${e?.code ?? e?.message}).`, sug);
  }
}

/**
 * Foaia de contact din MP4: câte o celulă pe moment, grilă de cel mult 4 coloane.
 * @param {{mp4: string, momente: Array<{t: number, eticheta: string, ref: string}>, iesireJpg: string, iesireJson: string,
 *          ff: {ffmpeg: string, ffprobe: string}, latimeCelula?: number, proiect?: string,
 *          transcriere?: Array<{start: number, end: number, text: string}>|null}} p proiect intră în sugestia erorilor;
 *   transcriere (opțional) adaugă `rostit` în fiecare celulă
 * @returns {Promise<{celule: number}>}
 */
export async function genereazaFoaie({ mp4, momente, iesireJpg, iesireJson, ff, latimeCelula = 270, proiect, transcriere = null }) {
  const sug = sugestie(proiect);
  if (!Array.isArray(momente) || momente.length === 0) {
    throw lipsaFoaie('cronologie.momente_foaie', 'Cronologia nu are niciun moment pentru foaia de contact.', sug);
  }
  const info = await probeazaMp4(mp4, { ffprobe: ff.ffprobe });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-foaie-'));
  try {
    const pnguri = [];
    for (let i = 0; i < momente.length; i++) {
      const png = path.join(tmp, `celula-${String(i + 1).padStart(3, '0')}.png`);
      await extragePng(mp4, momente[i].t, info.video.fps, null, png, ff, sug);
      pnguri.push(png);
    }
    await compuneGrila(pnguri, iesireJpg, ff, latimeCelula, sug);
  } finally {
    // un folder temporar rămas în os.tmpdir() nu strică foaia și nu trebuie să acopere o eroare reală
    try {
      stergeRecursiv(tmp);
    } catch {
      // se curăță la următoarea curățenie a sistemului
    }
  }
  scrieJsonAtomic(iesireJson, {
    versiune: 1,
    mp4: normalizeazaCale(path.relative(path.dirname(iesireJson), mp4)),
    celule: transcriere ? celuleGrila(momente).map((c, i) => ({ ...c, rostit: rostitLa(transcriere, momente[i].t) })) : celuleGrila(momente),
  });
  return { celule: momente.length };
}

/**
 * Foaia de contact din mai multe MP4-uri (ieșirile unei serii, felia 3): celulele fiecărui MP4, în ordinea surselor,
 * într-o singură grilă, ca revizorul să vadă toată seria pe o foaie. Etichetele celulelor vin din momente (ref-ul
 * fiecărei ieșiri, de exemplu „Testimonial 3, complet”).
 * @param {{surse: Array<{mp4: string, momente: Array<{t: number, eticheta: string, ref: string}>}>, iesireJpg: string, iesireJson: string,
 *          ff: {ffmpeg: string, ffprobe: string}, latimeCelula?: number, proiect?: string, schita?: boolean}} p
 * @returns {Promise<{celule: number}>}
 */
export async function genereazaFoaieSurse({ surse, iesireJpg, iesireJson, ff, latimeCelula = 270, proiect, schita = false }) {
  const sug = sugestie(proiect, schita);
  const momente = surse.flatMap((s) => s.momente);
  if (surse.length === 0 || momente.length === 0) throw lipsaFoaie('cronologie.momente_foaie', 'Seria nu are niciun moment pentru foaia de contact.', sug);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-foaie-'));
  try {
    const pnguri = [];
    for (const s of surse) {
      const info = await probeazaMp4(s.mp4, { ffprobe: ff.ffprobe });
      for (const m of s.momente) {
        const png = path.join(tmp, `celula-${String(pnguri.length + 1).padStart(3, '0')}.png`);
        await extragePng(s.mp4, m.t, info.video.fps, null, png, ff, sug);
        pnguri.push(png);
      }
    }
    await compuneGrila(pnguri, iesireJpg, ff, latimeCelula, sug);
  } finally {
    try {
      stergeRecursiv(tmp);
    } catch {
      // se curăță la următoarea curățenie a sistemului
    }
  }
  scrieJsonAtomic(iesireJson, {
    versiune: 1,
    mp4: null,
    surse: surse.map((s) => normalizeazaCale(path.relative(path.dirname(iesireJson), s.mp4))),
    celule: celuleGrila(momente),
  });
  return { celule: momente.length };
}

/**
 * Foaia schiței (spec 7.1: la reel, schița nu produce MP4): aceeași grilă, compusă din instantaneele
 * scrise de hyperframes snapshot (frame-NN-at-<t>s.png), în ordinea lui NN. contact-sheet.jpg al lui HyperFrames e ignorat.
 * @param {{dirInstantanee: string, momente: Array<{t: number, eticheta: string, ref: string}>, iesireJpg: string,
 *          iesireJson: string, ff: {ffmpeg: string, ffprobe: string}, latimeCelula?: number, proiect?: string}} p
 * @returns {Promise<{celule: number}>}
 */
export async function foaieDinInstantanee({ dirInstantanee, momente, iesireJpg, iesireJson, ff, latimeCelula = 270, proiect }) {
  const sug = sugestie(proiect, true);
  const cadre = (fs.existsSync(dirInstantanee) ? fs.readdirSync(dirInstantanee) : [])
    .map((nume) => ({ nume, m: /^frame-(\d+)-at-.+\.png$/.exec(nume) }))
    .filter((x) => x.m)
    .sort((a, b) => Number(a.m[1]) - Number(b.m[1]))
    .map((x) => path.join(dirInstantanee, x.nume));
  if (!Array.isArray(momente) || cadre.length === 0 || cadre.length !== momente.length) {
    throw lipsaFoaie('cadre', `În ${path.basename(dirInstantanee)} sunt ${cadre.length} instantanee, dar schița are ${momente?.length ?? 0} momente.`, sug);
  }
  await compuneGrila(cadre, iesireJpg, ff, latimeCelula, sug);
  scrieJsonAtomic(iesireJson, {
    versiune: 1,
    mp4: null,
    instantanee: normalizeazaCale(path.relative(path.dirname(iesireJson), dirInstantanee)),
    celule: celuleGrila(momente),
  });
  return { celule: cadre.length };
}

// Tranzițiile („Tranziția spre scena N”, docs/interfete/cronologie.md) stau în foaie pentru revizor; la predare ar arăta
// cursantului două scene suprapuse.
const esteTranzitie = (m) => typeof m.eticheta === 'string' && m.eticheta.startsWith('Tranziția');

export function alegeMomentePredare(momente) {
  const fara = momente.filter((m) => !esteTranzitie(m));
  const n = fara.length;
  if (n <= 3) return fara;
  return [fara[0], fara[Math.floor((n - 1) / 2)], fara[n - 1]];
}

/**
 * Cadrele de control de la predare: cadre/predare-1..3.png, la rezoluția MP4-ului.
 * @param {{mp4: string, momente: Array<{t: number}>, dirCadre: string, ff: {ffmpeg: string, ffprobe: string}, proiect?: string}} p
 * @returns {Promise<string[]>} căile absolute, în ordine
 */
export async function cadrePredare({ mp4, momente, dirCadre, ff, proiect }) {
  const sug = sugestie(proiect);
  const info = await probeazaMp4(mp4, { ffprobe: ff.ffprobe });
  fs.mkdirSync(dirCadre, { recursive: true });
  for (let k = 1; k <= 3; k++) stergeRecursiv(path.join(dirCadre, `predare-${k}.png`));
  const cai = [];
  const alese = alegeMomentePredare(momente);
  for (let k = 0; k < alese.length; k++) {
    const iesire = path.join(dirCadre, `predare-${k + 1}.png`);
    await extragePng(mp4, alese[k].t, info.video.fps, null, iesire, ff, sug);
    cai.push(iesire);
  }
  return cai;
}
