// mg corectura (felia 2): corectura cerută de cursant după predare, cu cel mult două încercări, apoi lista de propuneri.
// Starea stă în video/<proiect>/corecturi/<N>/, zonă scrisă doar de mg (garda/cai.mjs): inainte/ (date.json,
// cronologie.json și MP4-ul predat la deschidere), cerere.md și incercare-<K>.json. Încercările se numără din fișiere,
// ca rundele revizorului; fiecare încercare adaugă o rundă de revizie (garda/revizor.mjs, plafonRunde). O încercare
// neîncepută (cerere care nu există în șablon) se închide cu --propuneri: are inchisa_la și nu mai adaugă rundă.
import fs from 'node:fs';
import path from 'node:path';
import { caiProiect, esteNumeProiect, relativaLaRadacina } from './cai.mjs';
import { COD_IESIRE, EroareFatala, eroare } from './erori.mjs';
import { masoaraSsim, rezolvaFfmpeg } from './ffmpeg.mjs';
import { amprentaSerie, citesteJson, existaFisier, scrieJsonAtomic, scrieTextAtomic, sha256Fisier, stergeRecursiv } from './fisiere.mjs';
import { citesteLock } from './lock.mjs';
import { sursaSchimbata } from './garda/stop.mjs';
import { incarcaSablon } from './sabloane.mjs';

export const INCERCARI_MAXIME = 2;
export const PRAG_SSIM = 0.95;
const TRANZITIE = 0.4;
const FISIER_PROPUNERI = 'propuneri.json';

const fatala = (cod, camp, mesaj, sugestie, iesire = COD_IESIRE.DATE) => new EroareFatala(eroare(cod, camp, mesaj, sugestie), iesire);

/**
 * Căile unei corecturi.
 * @param {string} dirProiect @param {number} n
 */
export function caiCorectura(dirProiect, n) {
  const dir = path.join(dirProiect, 'corecturi', String(n));
  return {
    dir,
    inainte: path.join(dir, 'inainte'),
    cerere: path.join(dir, 'cerere.md'),
    incercare: (k) => path.join(dir, `incercare-${k}.json`),
  };
}

/** Numerele corecturilor existente, crescător. */
function corecturi(dirProiect) {
  try {
    return fs.readdirSync(path.join(dirProiect, 'corecturi'))
      .filter((n) => /^\d+$/.test(n) && fs.statSync(path.join(dirProiect, 'corecturi', n)).isDirectory())
      .map(Number)
      .sort((a, b) => a - b);
  } catch {
    return [];
  }
}

/** Încercările unei corecturi, citite din incercare-<K>.json, crescător după K. */
function incercari(cc) {
  let nume;
  try {
    nume = fs.readdirSync(cc.dir);
  } catch {
    return [];
  }
  return nume
    .map((f) => /^incercare-(\d+)\.json$/.exec(f))
    .filter(Boolean)
    .map((m) => Number(m[1]))
    .sort((a, b) => a - b)
    .map((k) => citesteJson(cc.incercare(k)));
}

/**
 * Starea corecturilor proiectului: ultima corectură și ultima ei încercare.
 * @param {string} dirProiect
 * @returns {{ n: number|null, cc: object|null, incercari: object[], ultima: object|null }}
 */
export function stareCorectura(dirProiect) {
  const lista = corecturi(dirProiect);
  if (lista.length === 0) return { n: null, cc: null, incercari: [], ultima: null };
  const n = lista[lista.length - 1];
  const cc = caiCorectura(dirProiect, n);
  const inc = incercari(cc);
  return { n, cc, incercari: inc, ultima: inc[inc.length - 1] ?? null };
}

/** Încercarea așteaptă randarea și --verifica: nici verificată, nici închisă cu --propuneri. */
const inLucru = (inc) => Boolean(inc) && !inc.verificata_la && !inc.inchisa_la;

/**
 * O corectură (--deschide, --din-nou) pornește doar dintr-un mesaj al cursantului scris după reper: hook-ul
 * UserPromptSubmit notează momentul fiecărui mesaj în .cache/, zonă pe care agentul n-o poate scrie.
 */
function cereMesajNou(cai, reper, proiect, mod) {
  let la = null;
  try {
    la = citesteJson(cai.mesajCursant).la ?? null;
  } catch {
    // fără mesaj notat
  }
  if (typeof la !== 'string' || (reper && la <= reper)) {
    throw fatala('corectura-fara-mesaj', 'corecturi',
      `Cursantul n-a scris niciun mesaj de la ${reper ? `${reper} (ultima predare sau încercare)` : 'predare'}; --${mod} pornește doar dintr-o cerere a lui.`,
      `Nu deschide singur o corectură: predă filmul cum e, cu observațiile la vedere, și așteaptă ce spune cursantul.`);
  }
}

const maxIso = (...v) => v.filter((x) => typeof x === 'string').sort().pop() ?? null;

function corecturaInchisa(stare, proiect) {
  return fatala('corectura-lipsa', `corecturi/${stare.n}`,
    `Corectura ${stare.n} s-a închis cu lista de propuneri, fără încercare.`,
    `Ce alege cursantul din listă e o corectură nouă: node nucleu/mg.mjs corectura ${proiect} --deschide "<cuvintele lui>".`);
}

/**
 * Filmul predat de acum: randarea completă verde, pe date.json-ul curent, cu MP4-ul ei. La o serie (verificare.json
 * versiunea 2), toate MP4-urile ei, iar sha256_mp4 e amprenta seriei (fisiere.mjs, amprentaSerie).
 * @returns {{ verificare: object, sha256_date: string, sha256_mp4: string, serie: boolean }}
 */
function filmPredat(cai, proiect) {
  const sugestie = `Corectura vine după predare: rulează node nucleu/mg.mjs randeaza ${proiect} și predă filmul întâi.`;
  if (existaFisier(cai.verificare) && citesteJson(cai.verificare).versiune === 2) return seriePredata(cai, proiect, sugestie);
  if (!existaFisier(cai.verificare) || !existaFisier(cai.mp4)) {
    throw fatala('corectura-fara-predare', 'verificare.json', `Proiectul ${proiect} nu are încă un film randat complet.`, sugestie);
  }
  const verificare = citesteJson(cai.verificare);
  const sha256Date = sha256Fisier(cai.date);
  if (verificare.mod !== 'complet' || verificare.ok !== true || verificare.sha256_date !== sha256Date || verificare.sha256_mp4 !== sha256Fisier(cai.mp4)) {
    throw fatala('corectura-fara-predare', 'verificare.json',
      `Ultima randare a proiectului ${proiect} nu e o randare completă verde pe date.json-ul de acum.`, sugestie);
  }
  return { verificare, sha256_date: sha256Date, sha256_mp4: verificare.sha256_mp4, serie: false };
}

const caleManifest = (cai) => path.join(cai.dir, 'serie', 'manifest.json');

function seriePredata(cai, proiect, sugestie) {
  const verificare = citesteJson(cai.verificare);
  const sha256Date = sha256Fisier(cai.date);
  const iesiri = Array.isArray(verificare.iesiri) ? verificare.iesiri : [];
  const radacina = path.dirname(path.dirname(cai.dir));
  const neatinse = iesiri.length > 0 && iesiri.every((i) => {
    const mp4 = path.join(radacina, ...String(i.mp4).split('/'));
    return existaFisier(mp4) && sha256Fisier(mp4) === i.sha256_mp4;
  });
  const manifestBun = existaFisier(caleManifest(cai)) && sha256Fisier(caleManifest(cai)) === verificare.manifest?.sha256;
  if (verificare.mod !== 'complet' || verificare.ok !== true || verificare.sha256_date !== sha256Date || !neatinse || !manifestBun || sursaSchimbata(cai.dir, verificare.surse) !== null) {
    throw fatala('corectura-fara-predare', 'verificare.json',
      `Ultima randare a seriei ${proiect} nu e o randare completă verde pe datele de acum (date.json, tabelul și pozele).`, sugestie);
  }
  return { verificare, sha256_date: sha256Date, sha256_mp4: amprentaSerie(iesiri), serie: true };
}

function verificaProiect(radacina, proiect) {
  if (!esteNumeProiect(proiect)) {
    throw fatala('proiect-nume-invalid', 'argumente.proiect', `Numele „${proiect ?? ''}” nu e un nume de proiect.`,
      'Scrie numele folderului din video/, de exemplu: node nucleu/mg.mjs corectura programari --verifica.', COD_IESIRE.UTILIZARE);
  }
  const cai = caiProiect(radacina, proiect);
  if (!existaFisier(cai.lock)) {
    throw fatala('proiect-lipsa', 'argumente.proiect', `Proiectul ${proiect} nu există în video/.`,
      'Verifică numele folderului din video/.', COD_IESIRE.UTILIZARE);
  }
  return cai;
}

function verificaCerere(cerere, mod) {
  if (typeof cerere !== 'string' || cerere.trim() === '') {
    throw fatala('argument-necunoscut', 'argumente.cerere', `--${mod} are nevoie de cuvintele cursantului.`,
      `Scrie: node nucleu/mg.mjs corectura <proiect> --${mod} "<ce a cerut cursantul, cu cuvintele lui>".`, COD_IESIRE.UTILIZARE);
  }
  return cerere.trim();
}

function adaugaLaCerere(cc, k, cerere, acum) {
  const vechi = existaFisier(cc.cerere) ? fs.readFileSync(cc.cerere, 'utf8') : '';
  scrieTextAtomic(cc.cerere, `${vechi}## Încercarea ${k} (${acum})\n\n${cerere}\n\n`);
}

/**
 * --deschide: o corectură nouă pe filmul predat.
 */
export function deschide({ radacina, proiect, cerere, acum = new Date().toISOString() }) {
  const cai = verificaProiect(radacina, proiect);
  const text = verificaCerere(cerere, 'deschide');
  const stare = stareCorectura(cai.dir);
  if (inLucru(stare.ultima)) {
    throw fatala('corectura-deschisa', `corecturi/${stare.n}`,
      `Încercarea ${stare.ultima.incercare} a corecturii ${stare.n} nu e încă verificată.`,
      `Termină-o întâi: repară în date.json, rulează node nucleu/mg.mjs randeaza ${proiect}, apoi node nucleu/mg.mjs corectura ${proiect} --verifica. Dacă n-ai început-o pentru că cererea nu se poate face în șablon, node nucleu/mg.mjs corectura ${proiect} --propuneri o închide.`);
  }
  const predat = filmPredat(cai, proiect);
  const u = stare.ultima;
  cereMesajNou(cai, maxIso(predat.verificare.scris_la, u?.deschisa_la, u?.verificata_la, u?.inchisa_la), proiect, 'deschide');
  const cronologie = path.join(cai.build, 'cronologie.json');
  if (!predat.serie && !existaFisier(cronologie)) {
    throw fatala('corectura-fara-predare', 'build/cronologie.json', `Proiectul ${proiect} nu are build/cronologie.json de la randare.`,
      `Rulează node nucleu/mg.mjs randeaza ${proiect} și predă filmul întâi.`);
  }
  const n = (stare.n ?? 0) + 1;
  const cc = caiCorectura(cai.dir, n);
  // totul se scrie într-un folder temporar (ignorat de numărare) și se redenumește la final: fără corecturi pe jumătate
  const temp = path.join(cai.dir, 'corecturi', `.${n}.tmp`);
  stergeRecursiv(temp);
  const ct = { dir: temp, inainte: path.join(temp, 'inainte'), cerere: path.join(temp, 'cerere.md'), incercare: (k) => path.join(temp, `incercare-${k}.json`) };
  fs.mkdirSync(ct.inainte, { recursive: true });
  fs.copyFileSync(cai.date, path.join(ct.inainte, 'date.json'));
  if (predat.serie) {
    // la serie, manifestul ține build-ul și MP4-ul fiecărui rând; filmele nu se copiază, se compară byte cu byte
    fs.copyFileSync(caleManifest(cai), path.join(ct.inainte, 'manifest.json'));
  } else {
    fs.copyFileSync(cronologie, path.join(ct.inainte, 'cronologie.json'));
    fs.copyFileSync(cai.mp4, path.join(ct.inainte, 'film.mp4'));
  }
  const incercare = { versiune: 1, corectura: n, incercare: 1, cerere: text, deschisa_la: acum, sha256_date_inainte: predat.sha256_date, sha256_mp4_inainte: predat.sha256_mp4, sha256_mp4_de_la: predat.sha256_mp4, verificata_la: null, ...(predat.serie ? { serie: true } : {}) };
  adaugaLaCerere(ct, 1, text, acum);
  scrieJsonAtomic(ct.incercare(1), incercare);
  fs.renameSync(temp, cc.dir);
  return {
    corectura: n,
    incercare: 1,
    text: [
      predat.serie
        ? `Corectura ${n} e deschisă pe seria predată (încercarea 1 din ${INCERCARI_MAXIME}); manifestul de dinainte e păstrat în ${relativaLaRadacina(cc.inainte, radacina)}/.`
        : `Corectura ${n} e deschisă pe filmul predat (încercarea 1 din ${INCERCARI_MAXIME}); filmul de dinainte e păstrat în ${relativaLaRadacina(cc.inainte, radacina)}/.`,
      predat.serie
        ? 'Schimbă doar ce a cerut cursantul: rândul lui în tabel (fișierul nou de la el) sau câmpurile din date.json (vezi „Corecturile” din SABLON.md); rândurile neatinse rămân identice. Apoi:'
        : 'Schimbă în date.json doar câmpurile care fac ce a cerut cursantul (vezi „Corecturile” din SABLON.md), apoi:',
      `node nucleu/mg.mjs randeaza ${proiect}, revizorul, și node nucleu/mg.mjs corectura ${proiect} --verifica înainte de predare.`,
    ].join('\n'),
  };
}

/**
 * --din-nou: a doua încercare a aceleiași corecturi, când cursantul spune că nu e cum a cerut.
 */
export async function dinNou({ radacina, proiect, cerere, acum = new Date().toISOString() }) {
  const cai = verificaProiect(radacina, proiect);
  const text = verificaCerere(cerere, 'din-nou');
  const stare = stareCorectura(cai.dir);
  if (!stare.ultima) {
    throw fatala('corectura-lipsa', 'corecturi', `Proiectul ${proiect} nu are nicio corectură deschisă.`,
      `Prima cerere de schimbare după predare se deschide cu node nucleu/mg.mjs corectura ${proiect} --deschide "<cererea>".`);
  }
  if (stare.ultima.inchisa_la) throw corecturaInchisa(stare, proiect);
  if (!stare.ultima.verificata_la) {
    throw fatala('corectura-deschisa', `corecturi/${stare.n}`,
      `Încercarea ${stare.ultima.incercare} a corecturii ${stare.n} nu e încă verificată.`,
      `Termină-o întâi: node nucleu/mg.mjs randeaza ${proiect}, apoi node nucleu/mg.mjs corectura ${proiect} --verifica.`);
  }
  if (stare.ultima.incercare >= INCERCARI_MAXIME) {
    throw fatala('corectura-plafon', `corecturi/${stare.n}`,
      `Corectura ${stare.n} a avut deja ${INCERCARI_MAXIME} încercări; a treia nu se face.`,
      `Nu mai insista: rulează node nucleu/mg.mjs corectura ${proiect} --propuneri și dă-i cursantului lista, cu variantele tale.`);
  }
  cereMesajNou(cai, stare.ultima.verificata_la, proiect, 'din-nou');
  const k = stare.ultima.incercare + 1;
  const { ok: _ok, verificata_la, schimbari, scene, comparatie_sarita, sha256_mp4_dupa, randuri: _randuri, ...baza } = stare.ultima;
  adaugaLaCerere(stare.cc, k, text, acum);
  scrieJsonAtomic(stare.cc.incercare(k), { ...baza, incercare: k, cerere: text, deschisa_la: acum, sha256_mp4_de_la: sha256_mp4_dupa, verificata_la: null });
  return {
    corectura: stare.n,
    incercare: k,
    text: [
      `Corectura ${stare.n}, încercarea ${k} din ${INCERCARI_MAXIME}: compară tot cu filmul de dinainte de corectură.`,
      k === INCERCARI_MAXIME ? 'E ultima încercare: dacă nici aceasta nu iese, urmează lista de propuneri (--propuneri), nu a treia încercare.' : '',
      `După date.json: node nucleu/mg.mjs randeaza ${proiect}, revizorul, apoi node nucleu/mg.mjs corectura ${proiect} --verifica.`,
    ].filter(Boolean).join('\n'),
  };
}

const esteObiect = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Diferența dintre două valori JSON, ca listă de căi în stilul câmpurilor de eroare (scene[2].titlu[1], stil.tema).
 * Un tablou cu altă lungime e o singură schimbare, pe tot tabloul.
 * @returns {{ camp: string, inainte: unknown, dupa: unknown }[]}
 */
export function diferenteDate(a, b, cale = '') {
  if (esteObiect(a) && esteObiect(b)) {
    const chei = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    return chei.flatMap((c) => diferenteDate(a[c], b[c], cale ? `${cale}.${c}` : c));
  }
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    return a.flatMap((v, i) => diferenteDate(v, b[i], `${cale}[${i}]`));
  }
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  return [{ camp: cale || '(tot)', inainte: a, dupa: b }];
}

/**
 * Scenele de comparat: cele fără niciun câmp schimbat, când toate schimbările sunt în scene[i] și numărul
 * scenelor e același. Altfel, motivul pentru care comparația nu se face.
 * @returns {{ scene: number[], sarita: string|null }}
 */
export function sceneNeatinse(schimbari, cronInainte, cronDupa) {
  const segScene = (cron) => (cron?.segmente ?? []).filter((s) => /^scene\[\d+\]$/.test(s.camp));
  const vechi = segScene(cronInainte);
  const noi = segScene(cronDupa);
  if (vechi.length === 0) return { scene: [], sarita: 'șablonul nu are scene în cronologie; ajunge diferența din date.json' };
  if (vechi.length !== noi.length) return { scene: [], sarita: 's-a schimbat numărul scenelor' };
  const globale = schimbari.filter((s) => !/^scene\[\d+\]/.test(s.camp)).map((s) => s.camp);
  if (globale.length > 0) return { scene: [], sarita: `s-a schimbat ${globale.join(', ')}, care atinge tot filmul` };
  const atinse = new Set(schimbari.map((s) => Number(/^scene\[(\d+)\]/.exec(s.camp)[1])));
  return { scene: vechi.map((s) => Number(/\d+/.exec(s.camp)[0])).filter((i) => !atinse.has(i)), sarita: null };
}

/**
 * Momentele de comparat dintr-o scenă: după ce e completă și înainte de tranziția de ieșire (relativ la start).
 * @returns {number[]}
 */
export function momenteScena(seg) {
  const a = seg.complet;
  const b = Math.max(a, seg.sfarsit - TRANZITIE);
  return [...new Set([a + 0.1, (a + b) / 2].map((t) => Math.round(Math.min(t, b) * 1000) / 1000))].map((t) => Math.round((t - seg.start) * 1000) / 1000);
}

/**
 * --verifica: după randarea completă verde a încercării, ce s-a schimbat în date.json și dacă scenele neatinse au rămas la fel.
 * @param {{ radacina: string, proiect: string, acum?: string, ssim?: typeof masoaraSsim, ff?: object }} o
 */
export async function verifica({ radacina, proiect, acum = new Date().toISOString(), ssim = masoaraSsim, ff = null }) {
  const cai = verificaProiect(radacina, proiect);
  const stare = stareCorectura(cai.dir);
  if (!stare.ultima) {
    throw fatala('corectura-lipsa', 'corecturi', `Proiectul ${proiect} nu are nicio corectură deschisă.`,
      `Deschide-o cu node nucleu/mg.mjs corectura ${proiect} --deschide "<cererea>".`);
  }
  if (stare.ultima.inchisa_la) throw corecturaInchisa(stare, proiect);
  if (existaFisier(cai.verificare) && citesteJson(cai.verificare).sha256_date !== sha256Fisier(cai.date)) {
    throw fatala('corectura-nerandata', 'date.json', `date.json al proiectului ${proiect} s-a schimbat după ultima randare.`,
      `Rulează node nucleu/mg.mjs randeaza ${proiect}, apoi --verifica.`);
  }
  const predat = filmPredat(cai, proiect);
  if (stare.ultima.verificata_la) {
    if (predat.sha256_mp4 !== stare.ultima.sha256_mp4_dupa) {
      throw fatala('corectura-verificata', `corecturi/${stare.n}`,
        `Încercarea ${stare.ultima.incercare} a corecturii ${stare.n} e deja verificată, iar filmul s-a schimbat de atunci.`,
        stare.ultima.incercare < INCERCARI_MAXIME
          ? `O schimbare nouă e o încercare nouă: doar după ce cursantul spune că nu e cum a cerut, node nucleu/mg.mjs corectura ${proiect} --din-nou "<cuvintele lui>".`
          : `Corectura ${stare.n} și-a folosit încercările: node nucleu/mg.mjs corectura ${proiect} --propuneri.`);
    }
    const u = stare.ultima;
    const erori = u.ok === false ? (u.scene ?? []).filter((c) => !c.ok).map((c) => eroareAtingeAltceva(c)) : [];
    if (u.serie) {
      return { erori, rezultat: { corectura: stare.n, incercare: u.incercare, schimbari: u.schimbari, scene: u.scene, randuri: u.randuri, comparatie_sarita: null, text: textVerificaSerie(stare, u.schimbari, u.scene, u.randuri, proiect) } };
    }
    return { erori, rezultat: { corectura: stare.n, incercare: u.incercare, schimbari: u.schimbari, scene: u.scene, comparatie_sarita: u.comparatie_sarita, text: textVerifica(stare, u.schimbari, u.scene, u.comparatie_sarita, proiect) } };
  }
  if (predat.sha256_mp4 === stare.ultima.sha256_mp4_de_la) {
    throw fatala('corectura-nerandata', 'date.json',
      `Filmul proiectului ${proiect} e încă cel de dinainte de această încercare.`,
      `Schimbă date.json pentru corectură și rulează node nucleu/mg.mjs randeaza ${proiect}, apoi --verifica.`);
  }
  const inainte = citesteJson(path.join(stare.cc.inainte, 'date.json'));
  const dupa = citesteJson(cai.date);
  const schimbari = diferenteDate(inainte, dupa);
  if (predat.serie) return verificaSerie({ cai, stare, predat, schimbari, acum, proiect });
  const cronInainte = citesteJson(path.join(stare.cc.inainte, 'cronologie.json'));
  const cronDupa = citesteJson(path.join(cai.build, 'cronologie.json'));
  const { scene, sarita } = sceneNeatinse(schimbari, cronInainte, cronDupa);

  const comparate = [];
  const mutate = [];
  if (scene.length > 0) {
    const binare = ff ?? (await rezolvaFfmpeg(radacina));
    const latime = Math.round(cronDupa.latime / 4 / 2) * 2;
    const inaltime = Math.round(cronDupa.inaltime / 4 / 2) * 2;
    const filmInainte = path.join(stare.cc.inainte, 'film.mp4');
    for (const i of scene) {
      const vechi = cronInainte.segmente.find((s) => s.camp === `scene[${i}]`);
      const nou = cronDupa.segmente.find((s) => s.camp === `scene[${i}]`);
      // o scenă neatinsă cu altă durată sau alt moment complet nu se mai poate compara cadru cu cadru
      const dif = (k) => Math.abs((nou[k] - nou.start) - (vechi[k] - vechi.start)) > 0.001;
      if (dif('complet') || dif('sfarsit')) {
        mutate.push(`scene[${i}]`);
        continue;
      }
      const momente = momenteScena(vechi).map((t) => Math.round((vechi.start + t) * 1000) / 1000);
      const valori = await ssim(filmInainte, cai.mp4, { ffmpeg: binare.ffmpeg, momente, latime, inaltime, startB: Math.round((nou.start - vechi.start) * 1000) / 1000, fps: cronDupa.fps });
      comparate.push({ camp: `scene[${i}]`, momente, ssim: valori, ok: valori.every((v) => v >= PRAG_SSIM) });
    }
  }
  const erori = comparate.filter((c) => !c.ok).map((c) => eroareAtingeAltceva(c));
  const motiv = sarita ?? (mutate.length > 0 ? `${mutate.join(', ')} au altă durată în cronologie, deci nu se compară cadru cu cadru` : null);
  const rezultat = { ...stare.ultima, verificata_la: acum, sha256_mp4_dupa: predat.sha256_mp4, ok: erori.length === 0, schimbari, scene: comparate, comparatie_sarita: motiv };
  scrieJsonAtomic(stare.cc.incercare(stare.ultima.incercare), rezultat);
  return { erori, rezultat: { corectura: stare.n, incercare: stare.ultima.incercare, schimbari, scene: comparate, comparatie_sarita: motiv, text: textVerifica(stare, schimbari, comparate, motiv, proiect) } };
}

/**
 * --verifica pe o serie: rândurile cu același build (sha256_build din manifest) trebuie să aibă exact același MP4 ca
 * înainte de corectură; cele cu build schimbat sunt cele atinse de cerere. Rândurile noi și cele scoase se raportează.
 */
function verificaSerie({ cai, stare, predat, schimbari, acum, proiect }) {
  const vechi = citesteJson(path.join(stare.cc.inainte, 'manifest.json')).iesiri ?? [];
  const nou = citesteJson(caleManifest(cai)).iesiri ?? [];
  const randuri = { schimbate: [], neatinse: [], adaugate: [], scoase: vechi.filter((v) => !nou.some((x) => x.id === v.id)).map((v) => v.id) };
  const comparate = [];
  for (const x of nou) {
    const v = vechi.find((e) => e.id === x.id);
    if (!v) randuri.adaugate.push(x.id);
    else if (v.sha256_build !== x.sha256_build) randuri.schimbate.push(x.id);
    else {
      randuri.neatinse.push(x.id);
      comparate.push({ camp: `serie/${x.mp4.split('/').pop()}`, identic: v.sha256_mp4 === x.sha256_mp4, ok: v.sha256_mp4 === x.sha256_mp4 });
    }
  }
  const erori = comparate.filter((c) => !c.ok).map((c) => eroareAtingeAltceva(c));
  const rezultat = { ...stare.ultima, verificata_la: acum, sha256_mp4_dupa: predat.sha256_mp4, ok: erori.length === 0, schimbari, scene: comparate, randuri, comparatie_sarita: null };
  scrieJsonAtomic(stare.cc.incercare(stare.ultima.incercare), rezultat);
  return { erori, rezultat: { corectura: stare.n, incercare: stare.ultima.incercare, schimbari, scene: comparate, randuri, comparatie_sarita: null, text: textVerificaSerie(stare, schimbari, comparate, randuri, proiect) } };
}

function textVerificaSerie(stare, schimbari, comparate, randuri, proiect) {
  const text = [`Corectura ${stare.n}, încercarea ${stare.ultima.incercare} din ${INCERCARI_MAXIME}, pe serie.`];
  text.push(schimbari.length === 0
    ? `În date.json nu s-a schimbat nimic${randuri.schimbate.length + randuri.adaugate.length > 0 ? '; schimbarea e în tabel sau în poze' : ''}.`
    : 'S-a schimbat în date.json:');
  for (const s of schimbari) text.push(`- ${s.camp}: ${scurt(s.inainte)} → ${scurt(s.dupa)}`);
  text.push(`Filme refăcute: ${randuri.schimbate.length ? randuri.schimbate.join(', ') : 'niciunul'}.`);
  if (randuri.adaugate.length) text.push(`Filme noi: ${randuri.adaugate.join(', ')}.`);
  if (randuri.scoase.length) text.push(`Filme scoase din serie: ${randuri.scoase.join(', ')}.`);
  if (comparate.length) text.push(`Filmele neatinse, identice cu cele de dinainte: ${comparate.filter((c) => c.ok).length} din ${comparate.length}.`);
  text.push(`La predare, spune-i cursantului ce filme s-au refăcut. Dacă spune că tot nu e cum a cerut: ${stare.ultima.incercare < INCERCARI_MAXIME
    ? `node nucleu/mg.mjs corectura ${proiect} --din-nou "<cuvintele lui>".`
    : `nu mai încerca; node nucleu/mg.mjs corectura ${proiect} --propuneri.`}`);
  return text.join('\n');
}

function eroareAtingeAltceva(c) {
  if (c.identic !== undefined) {
    return eroare('corectura-atinge-altceva', c.camp, `Filmul ${c.camp} are aceleași date ca înainte de corectură, dar alt MP4.`,
      'Trimite proiectul lui Dănuț: un rând neatins trebuie să rămână identic, deci e un defect de nucleu, nu de date.');
  }
  return eroare('corectura-atinge-altceva', c.camp,
    `Scena ${c.camp} nu are niciun câmp schimbat, dar arată altfel decât înainte de corectură (SSIM ${c.ssim.map((v) => v.toFixed(3)).join(', ')}, pragul ${PRAG_SSIM}).`,
    'Verifică dacă schimbarea altei scene (de exemplu o durată) a mutat-o; dacă nu, trimite proiectul lui Dănuț: e un defect de șablon, nu de date.');
}

const scurt = (v) => {
  const s = JSON.stringify(v) ?? 'lipsă';
  return s.length > 60 ? `${s.slice(0, 57)}...` : s;
};

function textVerifica(stare, schimbari, comparate, sarita, proiect) {
  const randuri = [`Corectura ${stare.n}, încercarea ${stare.ultima.incercare} din ${INCERCARI_MAXIME}.`];
  randuri.push(schimbari.length === 0 ? 'În date.json nu s-a schimbat nimic.' : 'S-a schimbat în date.json:');
  for (const s of schimbari) randuri.push(`- ${s.camp}: ${scurt(s.inainte)} → ${scurt(s.dupa)}`);
  if (sarita) randuri.push(comparate.length > 0 ? `Nu s-au comparat: ${sarita}.` : `Comparația cadrelor nu s-a făcut: ${sarita}.`);
  if (comparate.length > 0) {
    const bune = comparate.filter((c) => c.ok).map((c) => c.camp);
    randuri.push(`Scenele neatinse, comparate cu filmul de dinainte: ${bune.length} din ${comparate.length} la fel${bune.length > 0 ? ` (${bune.join(', ')})` : ''}.`);
  }
  randuri.push(`La predare, spune-i cursantului lista schimbărilor. Dacă spune că tot nu e cum a cerut: ${stare.ultima.incercare < INCERCARI_MAXIME
    ? `node nucleu/mg.mjs corectura ${proiect} --din-nou "<cuvintele lui>".`
    : `nu mai încerca; node nucleu/mg.mjs corectura ${proiect} --propuneri.`}`);
  return randuri.join('\n');
}

/**
 * Închide încercarea în lucru pe care agentul n-a început-o (filmul predat e neschimbat): cererea nu există în
 * șablon și primește lista din prima. O încercare începută (date.json schimbat sau randat) se termină cu --verifica.
 */
function inchideNeinceputa(cai, stare, proiect, acum) {
  let neinceputa = false;
  try {
    neinceputa = filmPredat(cai, proiect).sha256_mp4 === stare.ultima.sha256_mp4_de_la;
  } catch {
    // date.json schimbat după predare sau randare nefinalizată: încercarea e începută
  }
  if (!neinceputa) {
    throw fatala('corectura-deschisa', `corecturi/${stare.n}`,
      `Încercarea ${stare.ultima.incercare} a corecturii ${stare.n} e începută (date.json sau filmul s-au schimbat de la deschiderea ei).`,
      `Termin-o întâi: node nucleu/mg.mjs randeaza ${proiect}, apoi node nucleu/mg.mjs corectura ${proiect} --verifica; abia apoi --propuneri.`);
  }
  const inchisa = { ...stare.ultima, inchisa_la: acum, schimbari: [] };
  scrieJsonAtomic(stare.cc.incercare(stare.ultima.incercare), inchisa);
  stare.incercari[stare.incercari.length - 1] = inchisa;
  stare.ultima = inchisa;
}

/**
 * --propuneri: ce poate cere cursantul în acest șablon, cu variantele, și ce s-a încercat la ultima corectură.
 * O încercare deschisă și neîncepută se închide aici, fără să consume încercarea și runda de revizie.
 */
export async function propuneri({ radacina, proiect, acum = new Date().toISOString() }) {
  const cai = verificaProiect(radacina, proiect);
  const lock = citesteLock(cai.lock);
  const sablon = await incarcaSablon(radacina, lock.sablon.nume);
  const cale = path.join(sablon.dir, FISIER_PROPUNERI);
  const lista = existaFisier(cale) ? citesteJson(cale).propuneri ?? [] : [];
  const stare = stareCorectura(cai.dir);
  if (inLucru(stare.ultima)) inchideNeinceputa(cai, stare, proiect, acum);
  const randuri = [];
  if (stare.ultima) {
    randuri.push(`Corectura ${stare.n} („${stare.incercari[0].cerere}”), încercările:`);
    for (const inc of stare.incercari) {
      const campuri = inc.inchisa_la ? 'nimic, închisă cu propunerile' : (inc.schimbari ?? []).map((s) => s.camp).join(', ') || 'nimic schimbat';
      randuri.push(`- ${inc.incercare}: „${inc.cerere}”; schimbat: ${campuri}`);
    }
    if (stare.ultima.inchisa_la) randuri.push(`Corectura ${stare.n} e închisă; ce alege cursantul se deschide cu --deschide, ca o corectură nouă.`);
    randuri.push('');
  }
  randuri.push(`Ce poate cere cursantul în ${sablon.nume}, cu variantele pe care le oferi:`);
  for (const p of lista) randuri.push(`- ${p.cerere} (${p.camp}): ${p.variante.join('; ')}`);
  randuri.push('', 'Dă-i cursantului lista, cu 2-3 variante potrivite filmului lui, și întreabă-l pe care o vrea; nu începe singur a treia încercare.');
  return { propuneri: lista, corectura: stare.n, text: randuri.join('\n') };
}
