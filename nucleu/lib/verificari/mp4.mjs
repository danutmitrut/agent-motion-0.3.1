// Verificările pe MP4: C11 (B16), C12-C14 pe pixeli (B17), C15 audio (B18). C16, foaia de contact, stă în randeaza/index.mjs.
import path from 'node:path';
import { hexInRgb } from '../contrast.mjs';
import { rotunjeste } from '../cronologie.mjs';
import { EroareFatala, eroare } from '../erori.mjs';
import { cadruLa, extrageCadre, masoaraVolum, parseazaFreezedetect, probeazaMp4, ruleazaFfmpeg, ultimeleRanduri } from '../ffmpeg.mjs';
import { filtruDecupare } from '../filmare/decupare.mjs';
import { numarRo } from '../format.mjs';
import { rezultat } from './index.mjs';
import { areDesen, esteCadruGol, esteCadruUniform, existaInDate, propozitie, proportieDiferita, proportieDiferitaCadre, TRIMITERE_SABLON, verificaGoluri, verificaGoluriSursa, verificaTextVizibil } from './pixeli.mjs';

const SUGESTIE =
  'Rulează din nou randarea completă (node nucleu/mg.mjs randeaza <proiect>); dacă eroarea se repetă, rulează node nucleu/mg.mjs doctor.';

/**
 * C11: h264, yuv420p, rezoluția și fps-ul cronologiei, |durata - cronologie.durata| ≤ 1/fps.
 * @param {{durata: number, video: null|{codec, pix_fmt, latime, inaltime, fps, cadre}, audio: unknown}} info
 * @param {{latime: number, inaltime: number, fps: number, durata: number}} cronologie
 */
export function verificaFormatMp4(info, cronologie) {
  const { latime, inaltime, fps, durata } = cronologie;
  const toleranta = 1 / fps;
  const v = info?.video ?? null;
  const durataMp4 = typeof info?.durata === 'number' ? rotunjeste(info.durata) : null;
  const valoare = {
    codec: v?.codec ?? null,
    pix_fmt: v?.pix_fmt ?? null,
    latime: v?.latime ?? null,
    inaltime: v?.inaltime ?? null,
    fps: v?.fps ?? null,
    durata: durataMp4,
  };
  const prag = {
    codec: 'h264',
    pix_fmt: 'yuv420p',
    latime,
    inaltime,
    fps,
    durata: `${numarRo(durata)} ± ${numarRo(rotunjeste(toleranta))} s`,
  };
  const erori = [];
  if (!v) {
    erori.push(eroare('mp4-invalid', 'mp4.video', 'MP4-ul nu are nicio pistă video.', SUGESTIE));
  } else {
    if (v.codec !== 'h264') {
      erori.push(eroare('mp4-invalid', 'mp4.codec', `MP4-ul are codecul ${v.codec}, nu h264.`, SUGESTIE));
    }
    if (v.pix_fmt !== 'yuv420p') {
      erori.push(eroare('mp4-invalid', 'mp4.pix_fmt', `MP4-ul are pixelii în ${v.pix_fmt}, nu în yuv420p.`, SUGESTIE));
    }
    if (v.latime !== latime || v.inaltime !== inaltime) {
      erori.push(eroare('mp4-invalid', 'mp4.rezolutie', `MP4-ul are ${v.latime}x${v.inaltime}, nu ${latime}x${inaltime}.`, SUGESTIE));
    }
    if (typeof v.fps !== 'number' || Math.abs(v.fps - fps) > 0.01) {
      erori.push(eroare('mp4-invalid', 'mp4.fps', `MP4-ul are ${numarRo(v.fps)} cadre pe secundă, nu ${fps}.`, SUGESTIE));
    }
  }
  if (durataMp4 === null || Math.abs(durataMp4 - durata) > toleranta + 1e-9) {
    erori.push(
      eroare(
        'mp4-invalid',
        'mp4.durata',
        `MP4-ul durează ${numarRo(durataMp4)} s, iar cronologia ${numarRo(durata)} s (abaterea permisă e de un cadru).`,
        SUGESTIE,
      ),
    );
  }
  return rezultat('C11', erori.length === 0, { valoare, prag, camp: erori[0]?.camp ?? null, erori });
}

/**
 * ffprobe nu poate citi fișierul sau nu găsește nicio pistă video: C11 pică cu mp4-invalid (nu eroare-interna).
 * Doar lipsa binarului (EroareFatala ffmpeg-lipsa) merge mai departe, ca eroare de mediu.
 */
function esecProba(err) {
  if (err instanceof EroareFatala) throw err;
  const mesaj = String(err?.message ?? err);
  const camp = /flux video/.test(mesaj) ? 'mp4.video' : 'mp4';
  return rezultat('C11', false, {
    camp,
    erori: [eroare('mp4-invalid', camp, `MP4-ul nu se poate citi: ${mesaj}`, SUGESTIE)],
  });
}

const TOLERANTA_AUDIO = 0.05;
const MEDIE_MINIMA = -35;
const MAXIM_PERMIS = -0.5;
const COADA_SUB_MEDIE = 10;
const COADA = 0.5;
const SUGESTIE_RANDARE_AUDIO = 'Rulează din nou node nucleu/mg.mjs randeaza cu numele proiectului; dacă eroarea rămâne, rulează node nucleu/mg.mjs doctor.';

/**
 * C15 (spec 6.11). Fără muzică: MP4-ul nu are pistă audio. Cu muzică: exact o pistă AAC, durata cronologiei ± 0,05 s,
 * media peste −35 dB, vârful cel mult −0,5 dB, ultimele 0,5 s cu cel puțin 10 dB sub medie.
 * @param {object|null} info InfoMp4 (parseazaFfprobe)
 * @param {object|null} asteptari
 * @param {{medie: number, maxim: number, coada: number}|null} [nivel] măsurat de verificaC15 (volumedetect)
 */
export function verificaAudio(info, asteptari, nivel = null) {
  const muzica = asteptari?.audio?.prezent === true;
  const a = info?.audio ?? null;
  const pista = a ? { codec: a.codec ?? null, canale: a.canale ?? null, durata: typeof a.durata === 'number' ? rotunjeste(a.durata) : null } : null;
  const erori = [];
  if (!muzica) {
    if (pista) {
      erori.push(eroare('audio-invalid', 'mp4.audio',
        `MP4-ul are o pistă audio (${pista.codec}), deși datele nu au muzică.`, SUGESTIE_RANDARE_AUDIO));
    }
    return rezultat('C15', erori.length === 0, {
      valoare: { muzica, pista }, prag: { mod: 'fara-muzica', pista_audio: 'niciuna' }, camp: erori[0]?.camp ?? null, erori,
    });
  }
  const durata = asteptari.audio.durata;
  const piste = a?.piste ?? (a ? 1 : 0);
  if (!pista) {
    erori.push(eroare('audio-invalid', 'mp4.audio', 'Datele au muzică, dar MP4-ul nu are nicio pistă audio.',
      'Verifică muzica.fisier cu node nucleu/mg.mjs randeaza <proiect> --doar-verificare, apoi randează din nou.'));
  } else if (piste !== 1) {
    erori.push(eroare('audio-invalid', 'mp4.audio', `MP4-ul are ${piste} piste audio, nu una.`, SUGESTIE_RANDARE_AUDIO));
  } else if (pista.codec !== 'aac') {
    erori.push(eroare('audio-invalid', 'mp4.audio.codec', `Pista audio a MP4-ului e ${pista.codec}, nu AAC.`, SUGESTIE_RANDARE_AUDIO));
  } else if (pista.durata === null || Math.abs(pista.durata - durata) > TOLERANTA_AUDIO + 1e-9) {
    erori.push(eroare('audio-invalid', 'mp4.audio.durata',
      `Pista audio durează ${pista.durata === null ? 'necunoscut' : `${numarRo(rotunjeste(pista.durata, 2))} s`}, iar videoul ${numarRo(durata)} s.`,
      'Alege un muzica.incepe_de_la mai devreme sau o piesă mai lungă în muzica.fisier, apoi randează din nou (dacă diferența rămâne, rulează node nucleu/mg.mjs doctor).'));
  } else if (nivel === null) {
    erori.push(eroare('audio-invalid', 'mp4.audio', 'Nivelul sunetului din MP4 nu s-a putut măsura.', SUGESTIE_RANDARE_AUDIO));
  } else if (!(nivel.medie > MEDIE_MINIMA)) {
    erori.push(eroare('audio-invalid', 'muzica.volum',
      `Muzica se aude prea încet: media e ${numarRo(nivel.medie)} dB (trebuie peste ${numarRo(MEDIE_MINIMA)} dB).`,
      'Mărește muzica.volum (cel mult 1), mută muzica.incepe_de_la într-un loc mai tare al piesei sau alege altă piesă în muzica.fisier, apoi randează din nou.'));
  } else if (!(nivel.maxim <= MAXIM_PERMIS)) {
    erori.push(eroare('audio-invalid', 'muzica.volum',
      `Muzica e saturată: vârful e ${numarRo(nivel.maxim)} dB (cel mult ${numarRo(MAXIM_PERMIS)} dB).`,
      'Micșorează muzica.volum (de exemplu cu 0,1), apoi randează din nou.'));
  } else if (!(nivel.coada <= nivel.medie - COADA_SUB_MEDIE)) {
    erori.push(eroare('audio-invalid', 'muzica.fisier',
      `Muzica nu se stinge la final: ultimele ${numarRo(COADA)} s au ${numarRo(nivel.coada)} dB, iar media ${numarRo(nivel.medie)} dB (trebuie cu cel puțin ${COADA_SUB_MEDIE} dB sub medie).`,
      'Randează din nou; dacă rămâne, mută muzica.incepe_de_la ca piesa să nu se termine înaintea videoului sau înlocuiește piesa din muzica.fisier (mg pune oricum un fade-out de 1,5 s).'));
  }
  return rezultat('C15', erori.length === 0, {
    valoare: { muzica, pista, piste, nivel },
    prag: {
      mod: 'cu-muzica', codec: 'aac', piste: 1, durata: `${numarRo(durata)} ± ${numarRo(TOLERANTA_AUDIO)} s`,
      medie_peste: MEDIE_MINIMA, maxim_cel_mult: MAXIM_PERMIS, coada_sub_medie: COADA_SUB_MEDIE,
    },
    camp: erori[0]?.camp ?? null,
    erori,
  });
}

/**
 * C15 cu măsurarea nivelului: volumedetect pe tot fișierul și pe ultimele 0,5 s, doar cu muzică și cu o pistă.
 * O eroare la măsurare (alta decât EroareFatala) pică C15 cu audio-invalid, ca la C12-C14 (sigur).
 */
export async function verificaC15({ mp4, info, asteptari, ff, masoaraAudio = masoaraVolum }) {
  if (asteptari?.audio?.prezent !== true || !info?.audio) return verificaAudio(info, asteptari);
  return sigur('C15', 'audio-invalid', async () => {
    const tot = await masoaraAudio(mp4, { ffmpeg: ff.ffmpeg });
    const coada = await masoaraAudio(mp4, { ffmpeg: ff.ffmpeg, start: rotunjeste(Math.max(0, info.durata - COADA)) });
    return verificaAudio(info, asteptari, { medie: tot.medie, maxim: tot.maxim, coada: coada.medie });
  });
}

// C12-C14 (B17). Pragurile sunt cele din spec 6.11; toleranța C13 e calibrată în teste/integrare/pixeli-teme.test.mjs.
// Lățimea cadrelor e fixă; înălțimea urmează formatul cronologiei (vertical 1080x1920: 135x240 și 270x480).
const CADRE_C12 = Object.freeze({ fps: 10, latime: 135 });
// Cadrul de 270 px rămâne doar pentru zona_text (șabloane fără casete). Casetele textelor se măsoară la rezoluția
// MP4-ului: la 270 px, micșorarea topește literele mici (semnătura de 27 px ajunge la 1,8% la 96) și umflă marginile
// antialiasate ale titlurilor bold în casetele strânse (până la 39% pe noapte). La rezoluția MP4-ului, pe exemplul 01
// cu îndemn și pe cazurile la limită randate în B17, la 96: noapte 0,085-0,336, hartie 0,085-0,322, curat 0,088-0,330
// („Ana” 0,120-0,132, eticheta singură 0,154-0,170, îndemnul singur 0,182-0,202).
const CADRU_C13 = Object.freeze({ latime: 270 });
// Toleranța pe canal pentru C13. La 24, ceața din zona textului trece singură de 35% (pragul zonei_text): pe MP4-ul de probă (valori alese la planul B),
// zona textului dă 0,48-0,79 la 24 și 0,045-0,176 la 96 (0 fără text); la 64, ceața de pe noapte dă încă 0,52-0,59
// pe exemplul 01. La 112 și la 128, semnătura și „Ana” cad la 0 în cadrul de 270 px.
const TOLERANTA_TEXT = 96;
const FILTRU_C14 = 'freezedetect=n=0.001:d=2';
const INGHET_MINIM = 2;
const TOLERANTA_FEREASTRA = 0.1;
const EPS_C14 = 1e-9;

/** Înălțimea cadrului de analiză pentru o lățime dată, cu proporțiile cronologiei (rotunjită la număr par, ca la scale). */
function inaltimePentru(latime, cronologie) {
  return Math.round((latime * cronologie.inaltime) / cronologie.latime / 2) * 2;
}

/** Lungimea din [start, sfarsit] care nu intră în nicio fereastră statică (cu toleranța de 0,1 s la margini). */
function neacoperit(start, sfarsit, ferestre) {
  const bucati = ferestre
    .map((f) => [Math.max(start, f.start - TOLERANTA_FEREASTRA), Math.min(sfarsit, f.sfarsit + TOLERANTA_FEREASTRA)])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  let acoperit = 0;
  let cursor = start;
  for (const [a, b] of bucati) {
    const inceput = Math.max(a, cursor);
    if (b > inceput) {
      acoperit += b - inceput;
      cursor = b;
    }
  }
  return Math.max(0, sfarsit - start - acoperit);
}

/**
 * C14: un îngheț e eroare când partea lui din afara ferestrelor statice ține cel puțin 2 s
 * (durata minimă a lui freezedetect), cu o toleranță de 0,1 s la marginile ferestrelor.
 * @param {Array<{start: number, durata: number|null, sfarsit: number|null}>} intervale ieșirea lui parseazaFreezedetect
 * @param {{durata: number, ferestre?: Array<{start: number, sfarsit: number, motiv: string}>, segmente?: Array<{ref: string, camp: string, start: number, sfarsit: number}>, date?: object|null, schema?: object|null}} optiuni
 */
export function verificaInghetare(intervale, { durata, ferestre = [], segmente = [], date = null, schema = null } = {}) {
  const erori = [];
  const valori = [];
  for (const iv of intervale) {
    const sfarsit = iv.sfarsit ?? durata;
    const rest = neacoperit(iv.start, sfarsit, ferestre);
    valori.push({ start: rotunjeste(iv.start), sfarsit: rotunjeste(sfarsit), durata: rotunjeste(sfarsit - iv.start), neacoperit: rotunjeste(rest) });
    if (rest < INGHET_MINIM - EPS_C14) continue;
    const s = segmente.find((x) => iv.start >= x.start - EPS_C14 && iv.start < x.sfarsit - EPS_C14) ?? segmente[segmente.length - 1];
    const camp = s?.camp ?? '$';
    const pasi = [
      existaInDate(date, `${camp}.durata`, schema) && `scurtează ${camp}.durata`,
      existaInDate(date, 'stil.atmosfera', schema) && 'lasă mișcare în scenă (stil.atmosfera „ceata”)',
    ].filter(Boolean);
    erori.push(eroare('video-inghetat', camp,
      `${s?.ref ?? 'Videoul'}: între ${numarRo(rotunjeste(iv.start, 2))} s și ${numarRo(rotunjeste(sfarsit, 2))} s imaginea stă pe loc ${numarRo(rotunjeste(sfarsit - iv.start, 2))} s, fără o fereastră statică declarată.`,
      pasi.length > 0 ? propozitie(pasi) : `Lasă mișcare în scenă sau scurtează scena; ${TRIMITERE_SABLON}.`));
  }
  return rezultat('C14', erori.length === 0, { valoare: { intervale: valori }, prag: { n: 0.001, d: 2 }, camp: erori[0]?.camp ?? null, erori });
}

/** Rulează o verificare; o eroare neprevăzută devine rezultat picat, o EroareFatala (mediu, MP4 necitibil) oprește comanda. */
async function sigur(cod, codEroare, functie) {
  try {
    return await functie();
  } catch (e) {
    if (e instanceof EroareFatala) throw e;
    return rezultat(cod, false, {
      camp: '$',
      erori: [eroare(codEroare, '$', `Verificarea ${cod} nu a putut citi MP4-ul: ${e?.message ?? String(e)}`, SUGESTIE)],
    });
  }
}

async function masoaraGoluri({ mp4, cronologie, fundalRgb, ff, date, schema }) {
  const { fps, latime } = CADRE_C12;
  const inaltime = inaltimePentru(latime, cronologie);
  const serie = [];
  for await (const { t, pixeli } of extrageCadre(mp4, { ffmpeg: ff.ffmpeg, fps, latime, inaltime, durata: cronologie.durata })) {
    serie.push({ t, gol: esteCadruGol(pixeli, latime, inaltime, fundalRgb), desen: areDesen(pixeli, latime, inaltime, fundalRgb) });
  }
  return verificaGoluri(serie, { segmente: cronologie.segmente ?? [], date, schema });
}

/**
 * Câmpul din date.json al unui text măsurat de C13: al textului (asteptari), altfel al segmentului cu același ref,
 * altfel tot documentul ('$'). Fără nume de câmpuri ale unui șablon anume (planul E, E10).
 * @param {{ref: string, camp?: string}} x @param {Array<{ref: string, camp: string}>} segmente @returns {string}
 */
export function campMasurare(x, segmente) {
  return x.camp ?? segmente.find((s) => s.ref === x.ref)?.camp ?? '$';
}

/** Caseta [x, y, w, h] din pixelii formatului în pixelii cadrului de analiză, cu marginile în afară (fără pixeli pierduți). */
function casetaLaScara([x, y, w, h], scara) {
  const x0 = Math.floor(x * scara);
  const y0 = Math.floor(y * scara);
  return [x0, y0, Math.ceil((x + w) * scara) - x0, Math.ceil((y + h) * scara) - y0];
}

/**
 * C13. Cu casete în asteptari (decizia din 2026-10-05): fiecare text în caseta lui reală de pe ecran, la momentul lui
 * (titlu, cuvinte, etichetă, îndemn, semnătură). Fără casete (alt șablon): fiecare segment cu texte, la complet,
 * în zona_text (spec 6.11).
 */
async function masoaraTextul({ mp4, cronologie, asteptari, fundalRgb, ff, date, schema }) {
  const deMasurat = (asteptari?.texte ?? []).filter((x) => Array.isArray(x.caseta));
  // casetele: la rezoluția MP4-ului; zona_text: în cadrul de 270 px pe care e calibrată (vezi CADRU_C13)
  const latime = deMasurat.length > 0 ? cronologie.latime : CADRU_C13.latime;
  const inaltime = inaltimePentru(latime, cronologie);
  const scara = latime / cronologie.latime;
  const segmente = cronologie.segmente ?? [];
  const masuratori = [];
  // Câte un cadru pe moment, extras o singură dată și eliberat înainte de următorul: la rezoluția MP4-ului
  // un cadru are 6,2 MB, deci nu le ținem pe toate în memorie.
  let tCurent = null;
  let pixeliCurenti = null;
  const cadru = async (t) => {
    if (t !== tCurent) {
      pixeliCurenti = null;
      pixeliCurenti = await cadruLa(mp4, t, { ffmpeg: ff.ffmpeg, latime, inaltime, fps: cronologie.fps });
      tCurent = t;
    }
    return pixeliCurenti;
  };
  if (deMasurat.length > 0) {
    // ordinea măsurătorilor rămâne cea din asteptari; texte pe același moment sunt de obicei consecutive
    for (const x of deMasurat) {
      const camp = campMasurare(x, segmente);
      const zona = casetaLaScara(x.caseta, scara);
      // o casetă cu NaN sau Infinity nu se măsoară: verificaTextVizibil o raportează ca text nemăsurat
      const pixeli = zona.every(Number.isFinite) ? await cadru(x.t) : null;
      masuratori.push({
        ref: `${x.ref} („${x.text.replace(/\n/g, ' ')}”)`, t: x.t, camp,
        proportie: pixeli ? proportieDiferita(pixeli, latime, inaltime, fundalRgb, zona, TOLERANTA_TEXT) : NaN,
      });
    }
  } else {
    for (const s of segmente) {
      if (!Array.isArray(s.zona_text) || !Array.isArray(s.texte) || s.texte.length === 0) continue;
      const zona = casetaLaScara(s.zona_text, scara);
      const pixeli = zona.every(Number.isFinite) ? await cadru(s.complet) : null;
      masuratori.push({
        ref: s.ref, t: s.complet, camp: s.camp,
        proportie: pixeli ? proportieDiferita(pixeli, latime, inaltime, fundalRgb, zona, TOLERANTA_TEXT) : NaN,
      });
    }
  }
  pixeliCurenti = null;
  // același drum de măsurare; doar pragul și mesajul urmează tipul zonei (decizia din 2026-10-06)
  const zone = deMasurat.length > 0 ? 'casete' : 'zona_text';
  const r = verificaTextVizibil(masuratori, { zone, date, schema });
  return { ...r, prag: { ...r.prag, toleranta: TOLERANTA_TEXT, zone, latime_cadru: latime } };
}

async function masoaraInghetarea({ mp4, cronologie, ff, date, schema }) {
  const { cod, stderr } = await ruleazaFfmpeg(
    ['-hide_banner', '-nostats', '-nostdin', '-i', mp4, '-map', '0:v:0', '-vf', FILTRU_C14, '-f', 'null', '-'],
    { ffmpeg: ff.ffmpeg });
  if (cod !== 0) throw new Error(`freezedetect a ieșit cu codul ${cod}: ${ultimeleRanduri(stderr, 2)}`);
  return verificaInghetare(parseazaFreezedetect(stderr), {
    durata: cronologie.durata, ferestre: cronologie.ferestre_statice ?? [], segmente: cronologie.segmente ?? [], date, schema,
  });
}

const TOLERANTA_SURSA = 40;

/** Calea și filtrul sursei din cronologie.sursa_video; proiectul e folderul MP4-ului (video/<p>/<p>.mp4). */
function sursaComparata(mp4, cronologie) {
  const sv = cronologie.sursa_video;
  if (!sv) throw new Error('cronologia cu fundal „filmare” nu are sursa_video.');
  return { cale: path.join(path.dirname(mp4), ...sv.fisier.split('/')), start: sv.start, filtru: filtruDecupare(sv, cronologie, sv.focus_x) };
}

async function masoaraGoluriSursa({ mp4, cronologie, ff }) {
  const { fps, latime } = CADRE_C12;
  const inaltime = inaltimePentru(latime, cronologie);
  const src = sursaComparata(mp4, cronologie);
  const a = extrageCadre(mp4, { ffmpeg: ff.ffmpeg, fps, latime, inaltime, durata: cronologie.durata });
  const b = extrageCadre(src.cale, { ffmpeg: ff.ffmpeg, fps, latime, inaltime, start: src.start, durata: cronologie.durata, filtru: src.filtru });
  const serie = [];
  try {
    for (;;) {
      const [x, y] = await Promise.all([a.next(), b.next()]);
      if (x.done || y.done) break;
      serie.push({ t: x.value.t, uniform: esteCadruUniform(x.value.pixeli, latime, inaltime), uniformSursa: esteCadruUniform(y.value.pixeli, latime, inaltime) });
    }
  } finally {
    await a.return?.();
    await b.return?.();
  }
  return verificaGoluriSursa(serie);
}

async function masoaraTextulSursa({ mp4, cronologie, asteptari, ff, date, schema }) {
  const { latime, inaltime } = cronologie;
  const src = sursaComparata(mp4, cronologie);
  const segmente = cronologie.segmente ?? [];
  const cuCasete = (asteptari?.texte ?? []).filter((x) => Array.isArray(x.caseta));
  const deMasurat = cuCasete.length > 0
    ? cuCasete.map((x) => ({ ref: `${x.ref} („${x.text.replace(/\n/g, ' ')}”)`, t: x.t, camp: campMasurare(x, segmente), zona: x.caseta }))
    : segmente.filter((s) => Array.isArray(s.zona_text) && s.texte?.length).map((s) => ({ ref: s.ref, t: s.complet, camp: s.camp, zona: s.zona_text }));
  const masuratori = [];
  for (const m of deMasurat) {
    const ok = m.zona.every(Number.isFinite);
    const a = ok ? await cadruLa(mp4, m.t, { ffmpeg: ff.ffmpeg, latime, inaltime, fps: cronologie.fps }) : null;
    const b = ok ? await cadruLa(src.cale, src.start + m.t, { ffmpeg: ff.ffmpeg, latime, inaltime, fps: cronologie.fps, filtru: src.filtru }) : null;
    masuratori.push({ ref: m.ref, t: m.t, camp: m.camp, proportie: ok ? proportieDiferitaCadre(a, b, latime, inaltime, m.zona.map(Math.round), TOLERANTA_SURSA) : NaN });
  }
  const r = verificaTextVizibil(masuratori, { zone: 'sursa', date, schema });
  return { ...r, prag: { ...r.prag, toleranta: TOLERANTA_SURSA, zone: 'sursa' } };
}

async function inghetari(cale, ff, { start = 0, durata, filtru = null }) {
  const args = ['-hide_banner', '-nostats', '-nostdin', '-ss', String(start), '-t', String(durata), '-i', cale, '-map', '0:v:0', '-vf', filtru ? `${filtru},${FILTRU_C14}` : FILTRU_C14, '-f', 'null', '-'];
  const { cod, stderr } = await ruleazaFfmpeg(args, { ffmpeg: ff.ffmpeg });
  if (cod !== 0) throw new Error(`freezedetect a ieșit cu codul ${cod}: ${ultimeleRanduri(stderr, 2)}`);
  return parseazaFreezedetect(stderr);
}

async function masoaraInghetareaSursa({ mp4, cronologie, ff, date, schema }) {
  const src = sursaComparata(mp4, cronologie);
  const dinSursa = (await inghetari(src.cale, ff, { start: src.start, durata: cronologie.durata, filtru: src.filtru }))
    .map((iv) => ({ start: iv.start, sfarsit: iv.sfarsit ?? cronologie.durata, motiv: 'înghețat și în filmare' }));
  return verificaInghetare(await inghetari(mp4, ff, { durata: cronologie.durata }), {
    durata: cronologie.durata, ferestre: [...(cronologie.ferestre_statice ?? []), ...dinSursa], segmente: cronologie.segmente ?? [], date, schema,
  });
}

/** C12, C13, C14 pe MP4-ul final. Fundalul: cel rezolvat (build/stil-rezolvat.json) sau, fără el, cel din cronologie. */
async function verificariPeCadre({ mp4, cronologie, asteptari, stil, ff, date, schema }) {
  if (cronologie.fundal === 'filmare') {
    return [
      await sigur('C12', 'cadre-goale', () => masoaraGoluriSursa({ mp4, cronologie, ff })),
      await sigur('C13', 'text-invizibil', () => masoaraTextulSursa({ mp4, cronologie, asteptari, ff, date, schema })),
      await sigur('C14', 'video-inghetat', () => masoaraInghetareaSursa({ mp4, cronologie, ff, date, schema })),
    ];
  }
  const fundalRgb = hexInRgb(stil?.culori?.fundal?.valoare ?? cronologie.fundal);
  return [
    await sigur('C12', 'cadre-goale', () => masoaraGoluri({ mp4, cronologie, fundalRgb, ff, date, schema })),
    await sigur('C13', 'text-invizibil', () => masoaraTextul({ mp4, cronologie, asteptari, fundalRgb, ff, date, schema })),
    await sigur('C14', 'video-inghetat', () => masoaraInghetarea({ mp4, cronologie, ff, date, schema })),
  ];
}

/**
 * Doar C11 (ffprobe și formatul), pe orice fișier: randarea completă o rulează pe MP4-ul temporar, înaintea mutării
 * peste filmul vechi (decizia lui Dănuț din 2026-10-06), iar verificariMp4 pe MP4-ul final.
 * Lipsa lui ffprobe (EroareFatala ffmpeg-lipsa) se aruncă mai departe, ca eroare de mediu.
 * @param {{mp4: string, cronologie: object, ff: {ffprobe: string}, probeaza?: typeof probeazaMp4}} p
 * @returns {Promise<{c11: object, info: object|null}>} info e null când ffprobe nu a putut citi fișierul
 */
export async function verificaC11({ mp4, cronologie, ff, probeaza = probeazaMp4 }) {
  let info;
  try {
    info = await probeaza(mp4, { ffprobe: ff.ffprobe });
  } catch (err) {
    return { c11: esecProba(err), info: null };
  }
  return { c11: verificaFormatMp4(info, cronologie), info };
}

/**
 * Verificările pe MP4-ul final: C11, apoi C12-C14 (pixeli și `freezedetect`) și C15 (audio), doar dacă C11 a trecut
 * (un MP4 cu altă rezoluție, durată sau fără pistă video nu se măsoară). `stil` dă fundalul pentru C12 și C13;
 * `asteptari` dă casetele textelor pentru C13 și muzica pentru C15. `format` rămâne în semnătură pentru forma comună. `probeaza` se schimbă doar în teste.
 * @param {{mp4: string, cronologie: object, asteptari: object|null, stil: object|null, ff: {ffmpeg: string, ffprobe: string}, format: string, date?: object|null, schema?: object|null, probeaza?: typeof probeazaMp4, masoaraAudio?: typeof masoaraVolum}} p
 *   masoaraAudio (opțional): măsurarea nivelului pentru C15, se schimbă doar în teste
 *   date (opțional): datele randate; sugestiile lui C12-C14 numesc doar câmpurile care există în ele sau pe care le permite schema
 *   schema (opțional): schema șablonului; un câmp opțional omis din date rămâne o sugestie dacă schema îl permite
 * @returns {Promise<object[]>} RezultatVerificare[]
 */
export async function verificariMp4({ mp4, cronologie, asteptari, stil, ff, format, date = null, schema = null, probeaza = probeazaMp4, masoaraAudio = masoaraVolum }) {
  const { c11, info } = await verificaC11({ mp4, cronologie, ff, probeaza });
  if (!c11.ok) return [c11];
  return [c11, ...(await verificariPeCadre({ mp4, cronologie, asteptari, stil, ff, date, schema })), await verificaC15({ mp4, info, asteptari, ff, masoaraAudio })];
}
