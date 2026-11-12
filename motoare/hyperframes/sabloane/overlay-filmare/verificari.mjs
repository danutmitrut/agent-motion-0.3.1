// Verificările proprii ale overlay-ului pe MP4 (spec 7.4, „Verificări specifice”; stadiul mp4, hook-ul verificariProprii):
// S09 = pista audio (vocea filmării ajunge întreagă în MP4), S10 = filmarea neatinsă în banda liberă (SSIM față de copia
// de lucru decupată ca în compoziție). Amândouă sunt defecte de randare sau de șablon, nu de date: sugestiile trimit la Dănuț.
import path from 'node:path';
import { eroare, rotunjeste, secundeCuZecimala as secunde, probeazaMp4, masoaraVolum, masoaraSsim, filtruDecupare } from '../../../../nucleu/lib/sdk.mjs';

const RAPORTEAZA = 'E un defect de randare, nu de date: trimite lui Dănuț ieșirea lui node nucleu/mg.mjs randeaza <proiect> --json.';
const CAMP = 'mp4';
// numerele din mesaje, cu virgulă zecimală (dB, SSIM, praguri)
const ro = (x) => String(x).replace('.', ',');

function rezultatS(cod, erori, valoare, prag) {
  return { cod, ok: erori.length === 0, valoare, prag, camp: erori[0]?.camp ?? null, erori, avertismente: [] };
}

/** Momentele S10: `n` puncte la mijlocul a n intervale egale din durată. */
export function momenteSsim(durata, n) {
  return Array.from({ length: n }, (_, k) => rotunjeste((durata * (k + 0.5)) / n, 3));
}

/** Filtrele S10: banda liberă din cadrul MP4-ului și aceeași bandă din copia de lucru decupată ca în compoziție. */
export function filtreBandaLibera(plan, banda) {
  const [x, y, w, h] = banda;
  const crop = `crop=${w}:${h}:${x}:${y}`;
  return { filtruA: crop, filtruB: `${filtruDecupare(plan.sursa, { latime: plan.latime, inaltime: plan.inaltime }, plan.focus_x)},${crop}`, latime: w, inaltime: h };
}

/** S09 din măsurători (pură): pista AAC, durata ± toleranță, volumul peste minim și cel mult `sub` dB sub copia de lucru. */
export function evalueazaAudio({ info, volumMp4, volumLucru, durata = info.durata }, P) {
  // `durata` e durata așteptată a MP4-ului (plan.durata): info.durata vine din format.duration, maximul dintre fluxuri,
  // deci un audio prea lung ar apărea ca "durata videoului" și diferența ar ieși 0.
  const erori = [];
  const pune = (camp, mesaj) => erori.push(eroare('overlay-filmare-audio', camp, mesaj, RAPORTEAZA));
  const a = info.audio;
  if (!a) pune('mp4.audio', 'MP4-ul nu are pistă audio: vocea filmării lipsește.');
  else {
    if (a.codec !== 'aac') pune('mp4.audio', `Pista audio e ${a.codec ?? 'necunoscută'}, nu AAC.`);
    if (a.durata === null || Math.abs(a.durata - durata) > P.durata_audio + 1e-9) {
      pune('mp4.audio', `Pista audio are ${a.durata === null ? 'durata necunoscută' : `${secunde(a.durata)} s`}, iar videoul ${secunde(durata)} s (durata așteptată; diferența admisă: ${ro(P.durata_audio)} s).`);
    }
    if (volumMp4 && !(volumMp4.medie > P.volum_min)) pune('mp4.audio', `Vocea din MP4 e prea încet: ${ro(volumMp4.medie)} dB în medie (minimum ${ro(P.volum_min)} dB).`);
    if (volumMp4 && volumLucru && volumMp4.medie < volumLucru.medie - P.volum_sub_lucru - 1e-9) {
      pune('mp4.audio', `Vocea din MP4 are ${ro(volumMp4.medie)} dB în medie, cu ${ro(rotunjeste(volumLucru.medie - volumMp4.medie, 1))} dB sub copia de lucru pe același interval (maximum ${ro(P.volum_sub_lucru)} dB).`);
    }
  }
  return rezultatS('S09', erori,
    { codec: a?.codec ?? null, durata_audio: a?.durata ?? null, durata_video: durata, volum_mp4: volumMp4?.medie ?? null, volum_lucru: volumLucru?.medie ?? null },
    { codec: 'aac', durata_audio: P.durata_audio, volum_min: P.volum_min, volum_sub_lucru: P.volum_sub_lucru });
}

/** S10 din măsurători (pură): SSIM ≥ prag la fiecare moment. */
export function evalueazaBandaLibera({ momente, ssim }, P) {
  const sub = momente.map((t, i) => ({ t, ssim: ssim[i] })).filter((m) => !(m.ssim >= P.ssim_min));
  const erori = sub.length === 0 ? [] : [eroare('overlay-filmare-filmare-atinsa', CAMP,
    `În banda liberă, cadrul MP4-ului diferă de filmare la ${sub.map((m) => `${secunde(m.t)} s (SSIM ${ro(rotunjeste(m.ssim, 3))})`).join(', ')}; minimul e ${ro(P.ssim_min)}.`,
    'E un defect de șablon, nu de date: trimite lui Dănuț ieșirea lui node nucleu/mg.mjs randeaza <proiect> --json.')];
  return rezultatS('S10', erori, { momente, ssim: ssim.map((x) => rotunjeste(x, 4)) }, { ssim_min: P.ssim_min });
}

/**
 * Hook-ul verificariProprii (docs/interfete/sablon.md): S09 și S10 pe MP4-ul randat.
 * @param {string} mp4 calea absolută a MP4-ului
 * @param {{dirProiect: string, intern: object, sablon: {implicite: object}, ff: {ffmpeg: string, ffprobe: string}}} ctx
 */
export async function verificariProprii(mp4, ctx) {
  const plan = ctx.intern;
  if (!plan || plan.sablon !== 'overlay-filmare') throw new TypeError('verificariProprii cere planul lui overlay-filmare în ctx.intern.');
  const implicite = ctx.sablon.implicite;
  const P = implicite.verificari;
  const lucru = path.join(ctx.dirProiect, 'active', 'filmare-lucru.mp4');
  const info = await probeazaMp4(mp4, { ffprobe: ctx.ff.ffprobe });
  const cuAudio = Boolean(info.audio);
  const volumMp4 = cuAudio ? await masoaraVolum(mp4, { ffmpeg: ctx.ff.ffmpeg }) : null;
  const volumLucru = cuAudio ? await masoaraVolum(lucru, { ffmpeg: ctx.ff.ffmpeg, start: plan.start, durata: plan.durata }) : null;
  const s09 = evalueazaAudio({ info, volumMp4, volumLucru, durata: plan.durata }, P);
  const momente = momenteSsim(plan.durata, P.momente_ssim);
  const f = filtreBandaLibera(plan, implicite.formate[plan.format].benzi.libera);
  const ssim = await masoaraSsim(mp4, lucru, { ffmpeg: ctx.ff.ffmpeg, momente, latime: f.latime, inaltime: f.inaltime, filtruA: f.filtruA, filtruB: f.filtruB, startB: plan.start, fps: plan.fps });
  return [s09, evalueazaBandaLibera({ momente, ssim }, P)];
}
