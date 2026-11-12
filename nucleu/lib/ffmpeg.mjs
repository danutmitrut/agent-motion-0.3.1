/**
 * ffmpeg și ffprobe pentru mg (decizia T6).
 *
 * Fiecare binar se alege separat, pe platformă: întâi pachetul npm din
 * nucleu/node_modules (ffmpeg-static, ffprobe-static), apoi rezerva din
 * unelte/ffmpeg/<platforma>/. Un candidat e acceptat doar dacă are sha256-ul
 * fixat în nucleu/VERSIUNI.json (când platforma are hash fixat) și rulează
 * `-version`. Pe Mac arm64, ffprobe-static 3.1.0 are de fapt un binar x86_64,
 * deci acolo câștigă mereu rezerva (release-ul b6.1.1 al eugeneware/ffmpeg-static).
 * ffmpeg-ul sistemului nu e folosit niciodată.
 */
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { rotunjeste } from './cronologie.mjs';
import { COD_IESIRE, EroareFatala, eroare } from './erori.mjs';
import { sha256Fisier, stergeRecursiv } from './fisiere.mjs';
import { inregistreaza, opresteArbore } from './procese.mjs';
import { citesteVersiuni } from './versiuni.mjs';

const ARGUMENTE_FFPROBE = [
  '-v', 'error',
  '-show_entries', 'stream=codec_type,codec_name,pix_fmt,width,height,r_frame_rate,nb_frames,duration,channels:format=duration',
  '-of', 'json',
];

/** @returns {string} de exemplu 'darwin-arm64' sau 'win32-x64' */
export function platforma() {
  return `${process.platform}-${process.arch}`;
}

function sufixExe(plat) {
  return plat.startsWith('win32-') ? '.exe' : '';
}

/** Eroare de pornire a procesului (binar lipsă, neexecutabil, altă arhitectură), nu cod de ieșire. */
function esteEroarePornire(err) {
  if (!err) return false;
  if (err.errno === -86) return true;
  return typeof err.code === 'string' && !err.code.startsWith('ERR_');
}

function descrieEroareSpawn(err) {
  if (err?.errno === -86 || String(err?.code ?? '').includes('-86')) {
    return 'eroarea -86: binarul e pentru alt procesor';
  }
  if (err?.code === 'ENOENT') return 'ENOENT: fișierul lipsește';
  if (err?.code === 'EACCES') return 'EACCES: fișierul nu se poate executa';
  if (err?.killed) return 'nu a răspuns la timp';
  if (typeof err?.code === 'number') return `a ieșit cu codul ${err.code}`;
  return String(err?.code ?? err?.message ?? err);
}

/**
 * Rulează `<cale> -version`. Nu aruncă niciodată.
 * Atenție: pe Mac arm64 fără Rosetta, execFile pe un binar x86_64 aruncă SINCRON
 * „spawn Unknown system error -86” (errno -86), de aceea apelul stă în try/catch.
 * @param {string} cale
 * @returns {Promise<{ok: boolean, versiune?: string, eroare?: string}>}
 */
export function verificaBinar(cale) {
  return new Promise((rezolva) => {
    try {
      inregistreaza(execFile(cale, ['-version'], { timeout: 15000, windowsHide: true, encoding: 'utf8' }, (err, stdout) => {
        if (err) {
          rezolva({ ok: false, eroare: descrieEroareSpawn(err) });
          return;
        }
        const potrivire = /version\s+(\S+)/.exec(stdout);
        rezolva({ ok: true, versiune: potrivire ? potrivire[1] : stdout.split(/\r?\n/)[0] });
      }));
    } catch (err) {
      rezolva({ ok: false, eroare: descrieEroareSpawn(err) });
    }
  });
}

function candidati(radacina, binar, plat) {
  const [sistem, arhitectura] = plat.split('-');
  const exe = sufixExe(plat);
  const caleNpm = binar === 'ffmpeg'
    ? join(radacina, 'nucleu', 'node_modules', 'ffmpeg-static', `ffmpeg${exe}`)
    : join(radacina, 'nucleu', 'node_modules', 'ffprobe-static', 'bin', sistem, arhitectura, `ffprobe${exe}`);
  return [
    { sursa: binar === 'ffmpeg' ? 'ffmpeg-static' : 'ffprobe-static', cale: caleNpm },
    { sursa: 'rezerva', cale: join(radacina, 'unelte', 'ffmpeg', plat, `${binar}${exe}`) },
  ];
}

function hashAsteptat(versiuni, plat, binar, sursa) {
  const fixat = versiuni?.ffmpeg?.binare?.[plat]?.[binar] ?? null;
  if (sursa !== 'rezerva') return fixat;
  return versiuni?.ffmpeg?.rezerva?.[plat]?.[binar]?.sha256 ?? fixat;
}

/**
 * @param {string} radacina
 * @param {{versiuni?: object, platforma?: string, verifica?: (cale: string) => Promise<{ok: boolean, eroare?: string}>}} [optiuni]
 *   versiuni: implicit citesteVersiuni(radacina); platforma: implicit platforma(); verifica: implicit verificaBinar (înlocuite doar în teste)
 * @returns {Promise<{ffmpeg: string, ffprobe: string, surse: {ffmpeg: string, ffprobe: string}}>}
 */
export async function rezolvaFfmpeg(radacina, optiuni = {}) {
  const plat = optiuni.platforma ?? platforma();
  const versiuni = optiuni.versiuni ?? (await citesteVersiuni(radacina));
  const verifica = optiuni.verifica ?? verificaBinar;
  const rezultat = { ffmpeg: '', ffprobe: '', surse: { ffmpeg: '', ffprobe: '' } };

  for (const binar of ['ffmpeg', 'ffprobe']) {
    const motive = [];
    let ales = null;
    let rezervaCuHashGresit = false;
    let npmCuHashGresit = false;
    for (const c of candidati(radacina, binar, plat)) {
      if (!existsSync(c.cale)) {
        motive.push(`${c.sursa}: lipsește`);
        continue;
      }
      const asteptat = hashAsteptat(versiuni, plat, binar, c.sursa);
      if (c.sursa === 'rezerva' && !asteptat) {
        motive.push('rezerva: fără sha256 fixat în nucleu/VERSIUNI.json');
        continue;
      }
      if (asteptat && (await sha256Fisier(c.cale)) !== asteptat) {
        motive.push(`${c.sursa}: sha256 diferit de cel fixat`);
        if (c.sursa === 'rezerva') rezervaCuHashGresit = true;
        else npmCuHashGresit = true;
        continue;
      }
      const verificare = await verifica(c.cale);
      if (!verificare.ok) {
        motive.push(`${c.sursa}: ${verificare.eroare}`);
        continue;
      }
      ales = c;
      break;
    }
    if (!ales) {
      const areRezerva = Boolean(versiuni?.ffmpeg?.rezerva?.[plat]?.[binar]);
      const deHash = rezervaCuHashGresit || (npmCuHashGresit && !areRezerva);
      throw new EroareFatala(
        deHash
          ? eroare('ffmpeg-hash', `mediu.${binar}`,
            `Binarul ${binar} pentru ${plat} nu are sha256-ul fixat în nucleu/VERSIUNI.json (${motive.join('; ')}).`,
            'Rulează node nucleu/mg.mjs doctor; dacă eroarea rămâne, trimite mesajul lui Dănuț.')
          : eroare('ffmpeg-lipsa', `mediu.${binar}`,
            `Nu găsesc un ${binar} care să ruleze pe ${plat} (${motive.join('; ')}).`,
            'Rulează node nucleu/mg.mjs doctor, care instalează pachetele și descarcă rezerva.'),
        COD_IESIRE.MEDIU,
      );
    }
    rezultat[binar] = ales.cale;
    rezultat.surse[binar] = ales.sursa;
  }
  return rezultat;
}

/**
 * Descarcă rezerva fixată în VERSIUNI.json (ffmpeg.rezerva.<platforma>.<binar>),
 * o dezarhivează cu gunzip, compară sha256-ul binarului dezarhivat și o scrie în
 * unelte/ffmpeg/<platforma>/<binar>[.exe], executabilă.
 * @param {string} radacina
 * @param {'ffmpeg'|'ffprobe'} binar
 * @param {object} versiuni conținutul lui nucleu/VERSIUNI.json
 * @param {{fetch?: typeof fetch, platforma?: string}} [optiuni] înlocuite doar în teste
 * @returns {Promise<string>} calea binarului scris
 */
export async function descarcaRezerva(radacina, binar, versiuni, optiuni = {}) {
  const plat = optiuni.platforma ?? platforma();
  const aduce = optiuni.fetch ?? globalThis.fetch;
  const camp = `mediu.${binar}`;
  const intrare = versiuni?.ffmpeg?.rezerva?.[plat]?.[binar];
  if (!intrare?.url || !intrare?.sha256) {
    throw new EroareFatala(eroare('ffmpeg-lipsa', camp,
      `Pentru ${plat} nu există o rezervă fixată pentru ${binar} în nucleu/VERSIUNI.json.`,
      'Platforma nu e susținută oficial; scrie-i lui Dănuț ce sistem ai.'), COD_IESIRE.MEDIU);
  }
  let raspuns;
  try {
    raspuns = await aduce(intrare.url);
  } catch (err) {
    throw new EroareFatala(eroare('ffmpeg-lipsa', camp,
      `Nu pot descărca rezerva pentru ${binar} (${err?.message ?? err}).`,
      'Verifică legătura la internet (proxy, antivirus) și rulează din nou node nucleu/mg.mjs doctor.'), COD_IESIRE.MEDIU);
  }
  if (!raspuns.ok) {
    throw new EroareFatala(eroare('ffmpeg-lipsa', camp,
      `Descărcarea rezervei pentru ${binar} a eșuat: serverul a răspuns ${raspuns.status}.`,
      'Rulează din nou node nucleu/mg.mjs doctor mai târziu; dacă eroarea rămâne, trimite mesajul lui Dănuț.'), COD_IESIRE.MEDIU);
  }
  let arhiva;
  try {
    arhiva = Buffer.from(await raspuns.arrayBuffer());
  } catch (err) {
    throw new EroareFatala(eroare('ffmpeg-lipsa', camp,
      `Nu pot descărca rezerva pentru ${binar} (${err?.message ?? err}).`,
      'Verifică legătura la internet (proxy, antivirus) și rulează din nou node nucleu/mg.mjs doctor.'), COD_IESIRE.MEDIU);
  }
  const hashGresit = (detaliu) => new EroareFatala(eroare('ffmpeg-hash', camp,
    `Rezerva descărcată pentru ${binar} nu e cea fixată în nucleu/VERSIUNI.json (${detaliu}).`,
    'Nu folosi fișierul; rulează din nou node nucleu/mg.mjs doctor, iar dacă eroarea rămâne, trimite mesajul lui Dănuț.'), COD_IESIRE.MEDIU);
  let continut;
  try {
    continut = gunzipSync(arhiva);
  } catch {
    throw hashGresit('arhiva gzip e stricată');
  }
  const real = createHash('sha256').update(continut).digest('hex');
  if (real !== intrare.sha256) throw hashGresit(`sha256 ${real}`);

  const cale = join(radacina, 'unelte', 'ffmpeg', plat, `${binar}${sufixExe(plat)}`);
  mkdirSync(dirname(cale), { recursive: true });
  const temporar = `${cale}.tmp-${process.pid}`;
  try {
    writeFileSync(temporar, continut, { mode: 0o755 });
    renameSync(temporar, cale);
  } catch (err) {
    stergeRecursiv(temporar);
    throw err;
  }
  chmodSync(cale, 0o755);
  return cale;
}

/**
 * Ultimele rânduri nevide din stderr-ul unui proces (ffmpeg, hyperframes), pentru mesajele de eroare.
 * Singura copie: o importă motor-hf.mjs, foaie.mjs și randeaza/index.mjs.
 * @param {unknown} text
 * @param {number} [n]
 * @returns {string} rândurile despărțite prin „ | ” sau „fără mesaj”
 */
export function ultimeleRanduri(text, n = 5) {
  const randuri = String(text ?? '').trim().split(/\r?\n/).map((r) => r.trim()).filter(Boolean);
  return randuri.slice(-n).join(' | ') || 'fără mesaj';
}

// Cât din stdout păstrează ruleazaFfmpeg: câteva cadre brute de 1080x1920 (6,2 MB fiecare). Cine are nevoie de
// mai mult citește în flux (extrageCadre, cadruLa), nu ține tot filmul în memorie. Peste plafon, ffmpeg se oprește.
const PLAFON_STDOUT = 32 * 1024 * 1024;
// Din stderr rămâne doar coada (mesajele de eroare și ieșirea lui freezedetect sunt mici).
const PLAFON_STDERR = 4 * 1024 * 1024;

/** Pornește ffmpeg înregistrat în procese.mjs (se oprește odată cu mg), cu EroareFatala dacă nu pornește. */
function pornesteFfmpeg(ffmpeg, argumente, stdio) {
  const nuPorneste = (err) => new EroareFatala(eroare('ffmpeg-lipsa', 'mediu.ffmpeg',
    `ffmpeg nu a pornit (${descrieEroareSpawn(err)}).`,
    'Rulează node nucleu/mg.mjs doctor.'), COD_IESIRE.MEDIU);
  let proces;
  try {
    proces = spawn(ffmpeg, argumente, { windowsHide: true, stdio });
  } catch (err) {
    // pe Mac arm64, un binar x86_64 fără Rosetta aruncă sincron (errno -86)
    throw nuPorneste(err);
  }
  inregistreaza(proces);
  const inchis = new Promise((rezolva, respinge) => {
    proces.once('error', (err) => respinge(esteEroarePornire(err) ? nuPorneste(err) : err));
    proces.once('close', (cod, semnal) => rezolva({ cod, semnal }));
  });
  inchis.catch(() => {});
  return { proces, inchis };
}

/**
 * Rulează ffmpeg până la capăt. stdout se păstrează până la 32 MB (peste, ffmpeg se oprește și codul e 1),
 * iar la termenul depășit ffmpeg se oprește cu tot arborele lui (procese.mjs).
 * @param {string[]} argumente
 * @param {{ffmpeg: string, timeoutMs?: number}} optiuni
 * @returns {Promise<{cod: number, stdout: Buffer, stderr: string}>}
 */
export async function ruleazaFfmpeg(argumente, { ffmpeg, timeoutMs = 600000 }) {
  const { proces, inchis } = pornesteFfmpeg(ffmpeg, argumente, ['ignore', 'pipe', 'pipe']);
  const bucati = [];
  let octeti = 0;
  let stderr = '';
  let nota = '';
  proces.stdout.on('data', (b) => {
    octeti += b.length;
    if (octeti > PLAFON_STDOUT) {
      if (!nota) nota = `\n[mg] ieșirea lui ffmpeg a trecut de ${PLAFON_STDOUT / 1048576} MB; oprit`;
      opresteArbore(proces);
      return;
    }
    bucati.push(b);
  });
  proces.stderr.setEncoding('utf8');
  proces.stderr.on('data', (t) => {
    stderr += t;
    if (stderr.length > PLAFON_STDERR) stderr = stderr.slice(-PLAFON_STDERR);
  });
  const ceas = timeoutMs > 0 ? setTimeout(() => {
    nota = `\n[mg] ${descrieEroareSpawn({ killed: true })}`;
    opresteArbore(proces);
  }, timeoutMs) : null;
  try {
    const { cod } = await inchis;
    return { cod: nota ? 1 : typeof cod === 'number' ? cod : 1, stdout: Buffer.concat(bucati), stderr: stderr + nota };
  } finally {
    if (ceas) clearTimeout(ceas);
    opresteArbore(proces);
  }
}

function numar(x) {
  if (x === undefined || x === null || x === '' || x === 'N/A') return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function fractie(text) {
  const [n, d] = String(text ?? '').split('/').map(Number);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null;
  return Math.round((n / d) * 1000) / 1000;
}

/**
 * Transformă ieșirea JSON a lui ffprobe (argumentele din harta 5.12) în InfoMp4.
 * @param {string|object} json
 * @returns {{durata: number, video: {codec: string|null, pix_fmt: string|null, latime: number|null, inaltime: number|null, fps: number|null, cadre: number|null}, audio: null|{codec: string|null, durata: number|null, canale: number|null, piste: number}}}
 */
export function parseazaFfprobe(json) {
  const date = typeof json === 'string' ? JSON.parse(json) : json;
  const fluxuri = Array.isArray(date?.streams) ? date.streams : [];
  const video = fluxuri.find((f) => f.codec_type === 'video');
  if (!video) throw new Error('ffprobe nu a găsit niciun flux video.');
  const audio = fluxuri.find((f) => f.codec_type === 'audio');
  const piste = fluxuri.filter((f) => f.codec_type === 'audio').length;
  const durata = numar(date?.format?.duration) ?? numar(video.duration);
  if (durata === null) throw new Error('ffprobe nu a întors durata fișierului.');
  const cadre = numar(video.nb_frames);
  return {
    durata,
    video: {
      codec: video.codec_name ?? null,
      pix_fmt: video.pix_fmt ?? null,
      latime: numar(video.width),
      inaltime: numar(video.height),
      fps: fractie(video.r_frame_rate),
      cadre: cadre === null ? null : Math.round(cadre),
    },
    audio: audio
      ? { codec: audio.codec_name ?? null, durata: numar(audio.duration), canale: numar(audio.channels), piste }
      : null,
  };
}

/**
 * Rulează ffprobe cu argumentele din harta 5.12 și parsează ieșirea cu `parseaza`.
 * Aruncă EroareFatala 'ffmpeg-lipsa' dacă ffprobe nu pornește și Error simplu dacă fișierul nu se poate citi.
 */
function probeaza(cale, ffprobe, parseaza, argumente = ARGUMENTE_FFPROBE) {
  const nuPorneste = (err) => new EroareFatala(eroare('ffmpeg-lipsa', 'mediu.ffprobe',
    `ffprobe nu a pornit (${descrieEroareSpawn(err)}).`,
    'Rulează node nucleu/mg.mjs doctor.'), COD_IESIRE.MEDIU);
  return new Promise((rezolva, respinge) => {
    try {
      inregistreaza(execFile(ffprobe, [...argumente, cale],
        { encoding: 'utf8', timeout: 60000, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
        (err, stdout, stderr) => {
          if (esteEroarePornire(err)) {
            respinge(nuPorneste(err));
            return;
          }
          if (err) {
            respinge(new Error(`ffprobe nu poate citi ${cale}: ${String(stderr ?? '').trim() || descrieEroareSpawn(err)}`));
            return;
          }
          try {
            rezolva(parseaza(stdout));
          } catch (e) {
            respinge(e);
          }
        }));
    } catch (err) {
      respinge(nuPorneste(err));
    }
  });
}

/**
 * @param {string} cale MP4-ul
 * @param {{ffprobe: string}} optiuni
 * @returns {Promise<ReturnType<typeof parseazaFfprobe>>}
 *   Aruncă EroareFatala 'ffmpeg-lipsa' dacă ffprobe nu pornește și Error simplu dacă fișierul nu se poate citi;
 *   apelantul (doctor, C11) alege codul potrivit lui.
 */
export function probeazaMp4(cale, { ffprobe }) {
  return probeaza(cale, ffprobe, parseazaFfprobe);
}

/**
 * O piesă audio (muzica cursantului, planul F): durata, codecul primei piste audio și numărul pistelor.
 * Un flux video (coperta unui MP3) se ignoră.
 * @param {string|object} json
 * @returns {{durata: number, codec: string|null, piste: number}}
 */
export function parseazaAudioSursa(json) {
  const date = typeof json === 'string' ? JSON.parse(json) : json;
  const fluxuri = Array.isArray(date?.streams) ? date.streams : [];
  const audio = fluxuri.filter((f) => f.codec_type === 'audio');
  const durata = numar(date?.format?.duration) ?? numar(audio[0]?.duration);
  if (durata === null) throw new Error('ffprobe nu a întors durata fișierului.');
  return { durata, codec: audio[0]?.codec_name ?? null, piste: audio.length };
}

/**
 * @param {string} cale piesa audio
 * @param {{ffprobe: string}} optiuni
 * @returns {Promise<ReturnType<typeof parseazaAudioSursa>>} aceleași erori ca probeazaMp4
 */
export function probeazaAudio(cale, { ffprobe }) {
  return probeaza(cale, ffprobe, parseazaAudioSursa);
}

/**
 * ffprobe cu argumente date de apelant (de exemplu sonda filmării, H01), parsat cu `parseaza`.
 * @param {string} cale
 * @param {{ffprobe: string}} optiuni
 * @param {string[]} argumente fără cale; calea se pune la sfârșit
 * @param {(stdout: string) => any} parseaza
 * @returns {Promise<any>} aceleași erori ca probeazaMp4
 */
export function probeazaJson(cale, { ffprobe }, argumente, parseaza) {
  return probeaza(cale, ffprobe, parseaza, argumente);
}

/**
 * Extrage intervalele înghețate din stderr-ul filtrului freezedetect.
 * Un interval care ține până la final are doar start (durata și sfarsit rămân null).
 * @param {string} stderr
 * @returns {Array<{start: number, durata: number|null, sfarsit: number|null}>}
 */
export function parseazaFreezedetect(stderr) {
  const intervale = [];
  const tipar = /lavfi\.freezedetect\.freeze_(start|duration|end):\s*(-?[0-9.]+)/g;
  for (const [, cheie, valoare] of String(stderr ?? '').matchAll(tipar)) {
    const t = Number(valoare);
    if (cheie === 'start') {
      intervale.push({ start: t, durata: null, sfarsit: null });
    } else if (intervale.length > 0) {
      intervale[intervale.length - 1][cheie === 'duration' ? 'durata' : 'sfarsit'] = t;
    }
  }
  return intervale;
}

function decibeli(text) {
  return text === '-inf' ? -Infinity : Number(text);
}

/**
 * Media și vârful din stderr-ul filtrului volumedetect (dB). Liniștea completă poate da „-inf dB”.
 * @param {string} stderr
 * @returns {{medie: number, maxim: number} | null} null dacă lipsește oricare rând
 */
export function parseazaVolumedetect(stderr) {
  const text = String(stderr ?? '');
  const medie = /mean_volume:\s*(-inf|-?[0-9.]+) dB/.exec(text);
  const maxim = /max_volume:\s*(-inf|-?[0-9.]+) dB/.exec(text);
  if (!medie || !maxim) return null;
  return { medie: decibeli(medie[1]), maxim: decibeli(maxim[1]) };
}

/**
 * Nivelul primei piste audio (volumedetect), pe fereastra [start, start + durata], sau de la `start` până la capăt fără `durata`. Pentru C15 (planul F, F6) și S09 (planul H).
 * @param {string} cale
 * @param {{ffmpeg: string, start?: number, durata?: number|null, timeoutMs?: number}} optiuni
 * @returns {Promise<{medie: number, maxim: number}>} aruncă Error dacă ffmpeg eșuează sau nu scrie nivelurile
 */
export async function masoaraVolum(cale, { ffmpeg, start = 0, durata = null, timeoutMs = 120000 }) {
  const argumente = ['-hide_banner', '-nostdin'];
  if (start > 0) argumente.push('-ss', start.toFixed(3));
  if (durata !== null) argumente.push('-t', durata.toFixed(3));
  argumente.push('-i', cale, '-map', '0:a:0', '-af', 'volumedetect', '-f', 'null', '-');
  const r = await ruleazaFfmpeg(argumente, { ffmpeg, timeoutMs });
  if (r.cod !== 0) throw new Error(`ffmpeg nu a putut măsura sunetul din ${cale}: ${ultimeleRanduri(r.stderr)}`);
  const nivel = parseazaVolumedetect(r.stderr);
  if (!nivel) throw new Error(`ffmpeg nu a scris nivelul sunetului pentru ${cale}.`);
  return nivel;
}

const SUGESTIE_CADRE =
  'Rulează din nou randarea completă (node nucleu/mg.mjs randeaza <proiect>); dacă eroarea se repetă, rulează node nucleu/mg.mjs doctor.';

/**
 * Secunda de căutare pentru cadrul afișat la momentul t. Cu „-ss t” exact, ultimul cadru
 * (t = durata - 1/fps, rotunjit în sus la 3 zecimale) nu se mai găsește și ffmpeg nu scrie nimic.
 * Singura copie: o folosesc foaie.mjs (care o re-exportă) și cadruLa.
 * @param {number} t secunde
 * @param {number} fps
 * @returns {string} secunde cu 4 zecimale
 */
export function secundaCautare(t, fps) {
  return Math.max(0, t - 0.5 / fps).toFixed(4);
}

/**
 * Citește din stdout-ul lui ffmpeg cadre RGB24 de câte `marime` octeți, fiecare într-un buffer alocat o singură dată
 * (fără concatenări), și le dă pe rând; în memorie stă cel mult un cadru plus bucata curentă din pipe.
 */
async function* cadreDinFlux(stdout, marime) {
  let cadru = new Uint8Array(marime);
  let umplut = 0;
  for await (const bucata of stdout) {
    let pozitie = 0;
    while (pozitie < bucata.length) {
      const n = Math.min(marime - umplut, bucata.length - pozitie);
      cadru.set(bucata.subarray(pozitie, pozitie + n), umplut);
      umplut += n;
      pozitie += n;
      if (umplut === marime) {
        yield cadru;
        cadru = new Uint8Array(marime);
        umplut = 0;
      }
    }
  }
}

/** Termenul unui ffmpeg care citește cadre: la depășire, procesul se oprește (procese.mjs) și citirea se încheie. */
function termen(proces, timeoutMs) {
  let depasit = false;
  const ceas = timeoutMs > 0 ? setTimeout(() => {
    depasit = true;
    opresteArbore(proces);
  }, timeoutMs) : null;
  return {
    opreste: () => { if (ceas) clearTimeout(ceas); },
    mesaj: (stderr) => (depasit ? descrieEroareSpawn({ killed: true }) : ultimeleRanduri(stderr, 1)),
  };
}

/**
 * Cadrele unui MP4 ca RGB24, la fps-ul și mărimea cerute, în flux: în memorie stă un singur cadru, nu tot videoul.
 * Oprirea iterării (break, excepție), termenul depășit și oprirea lui mg (procese.mjs) opresc procesul ffmpeg.
 * @param {string} cale
 * @param {{ffmpeg: string, fps: number, latime: number, inaltime: number, start?: number, durata?: number, filtru?: string|null, timeoutMs?: number}} o
 *   filtru: șir ffmpeg pus înaintea lui fps= și scale= în -vf (de exemplu decuparea filmării)
 * @returns {AsyncGenerator<{t: number, pixeli: Uint8Array}>}
 */
export async function* extrageCadre(cale, { ffmpeg, fps, latime, inaltime, start = 0, durata, filtru = null, timeoutMs = 600000 }) {
  const argumente = ['-v', 'error', '-nostdin', '-ss', String(start)];
  if (durata !== undefined && durata !== null) argumente.push('-t', String(durata));
  argumente.push('-i', cale, '-vf', `${filtru ? `${filtru},` : ''}fps=${fps},scale=${latime}:${inaltime}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-');
  const { proces, inchis } = pornesteFfmpeg(ffmpeg, argumente, ['ignore', 'pipe', 'pipe']);
  let stderr = '';
  proces.stderr.setEncoding('utf8');
  proces.stderr.on('data', (s) => {
    stderr = (stderr + s).slice(-PLAFON_STDERR);
  });
  const ceas = termen(proces, timeoutMs);
  let index = 0;
  let terminat = false;
  try {
    for await (const pixeli of cadreDinFlux(proces.stdout, latime * inaltime * 3)) {
      yield { t: rotunjeste(start + index / fps), pixeli };
      index += 1;
    }
    const { cod } = await inchis;
    terminat = true;
    if (cod !== 0) {
      throw new EroareFatala(
        eroare('mp4-invalid', 'mp4', `ffmpeg nu a putut citi cadrele din ${basename(cale)}: ${ceas.mesaj(stderr)}`, SUGESTIE_CADRE),
        COD_IESIRE.MEDIU,
      );
    }
  } finally {
    ceas.opreste();
    if (!terminat) opresteArbore(proces);
  }
}

/**
 * Un singur cadru RGB24, cel afișat la momentul t, căutat la secundaCautare (ca la foaie), citit în flux
 * direct într-un buffer de mărimea cadrului; cu termen, ca ruleazaFfmpeg.
 * @param {string} cale
 * @param {number} t secunde
 * @param {{ffmpeg: string, latime: number, inaltime: number, fps?: number, filtru?: string|null, timeoutMs?: number}} o
 *   filtru: șir ffmpeg pus înaintea lui scale= în -vf
 * @returns {Promise<Uint8Array>}
 */
export async function cadruLa(cale, t, { ffmpeg, latime, inaltime, fps = 30, filtru = null, timeoutMs = 600000 }) {
  const argumente = ['-v', 'error', '-nostdin', '-ss', secundaCautare(t, fps), '-i', cale, '-frames:v', '1',
    '-vf', `${filtru ? `${filtru},` : ''}scale=${latime}:${inaltime}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'];
  const { proces, inchis } = pornesteFfmpeg(ffmpeg, argumente, ['ignore', 'pipe', 'pipe']);
  let stderr = '';
  proces.stderr.setEncoding('utf8');
  proces.stderr.on('data', (s) => {
    stderr = (stderr + s).slice(-PLAFON_STDERR);
  });
  const ceas = termen(proces, timeoutMs);
  try {
    let cadru = null;
    for await (const pixeli of cadreDinFlux(proces.stdout, latime * inaltime * 3)) {
      if (cadru === null) cadru = pixeli;
    }
    const { cod } = await inchis;
    if (cod !== 0 || cadru === null) {
      throw new EroareFatala(
        eroare('mp4-invalid', 'mp4', `Nu am putut extrage cadrul de la ${t} s din ${basename(cale)}: ${ceas.mesaj(stderr)}`, SUGESTIE_CADRE),
        COD_IESIRE.MEDIU,
      );
    }
    return cadru;
  } finally {
    ceas.opreste();
    opresteArbore(proces);
  }
}

/**
 * SSIM între cadrul lui `a` și cadrul lui `b` la fiecare moment (câte o rulare ffmpeg pe moment, cu -ss înaintea lui -i),
 * după filtrele date (de exemplu decuparea și banda liberă), la latime x inaltime. Folosit de S09/S10 ale overlay-ului.
 * @param {string} a @param {string} b
 * @param {{ffmpeg: string, momente: number[], latime: number, inaltime: number, filtruA?: string, filtruB?: string, startB?: number, fps?: number, timeoutMs?: number}} o
 *   startB: `b` se citește la t + startB (copia de lucru, decalată cu filmare.start față de MP4)
 * @returns {Promise<number[]>} SSIM All (0..1), în ordinea momentelor
 */
export async function masoaraSsim(a, b, { ffmpeg, momente, latime, inaltime, filtruA = '', filtruB = '', startB = 0, fps = 30, timeoutMs = 120000 }) {
  const valori = [];
  for (const t of momente) {
    const fa = `[0:v]${filtruA ? `${filtruA},` : ''}scale=${latime}:${inaltime},format=yuv420p[a]`;
    const fb = `[1:v]${filtruB ? `${filtruB},` : ''}scale=${latime}:${inaltime},format=yuv420p[b]`;
    const { cod, stderr } = await ruleazaFfmpeg(['-hide_banner', '-nostdin', '-ss', secundaCautare(t, fps), '-i', a, '-ss', secundaCautare(t + startB, fps), '-i', b,
      '-filter_complex', `${fa};${fb};[a][b]ssim`, '-frames:v', '1', '-f', 'null', '-'], { ffmpeg, timeoutMs });
    const m = /SSIM .*All:([0-9.]+)/.exec(stderr);
    if (cod !== 0 || !m) throw new Error(`ssim la ${t} s a eșuat (cod ${cod}): ${ultimeleRanduri(stderr, 2)}`);
    valori.push(Number(m[1]));
  }
  return valori;
}
