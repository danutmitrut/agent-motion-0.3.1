// Hook-ul Stop (A17, completat în B19): nicio predare, pe nicio linie „Predare:”, fără verificare.json verde, cu toate verificările obligatorii și cadrele de predare (spec 5.4, harta 4.13).
// Rundele de revizie nu se verifică aici: plafonul nu blochează predarea (P1). Corecturile da (felia 2, problemaCorecturii).
// Modul doar nativ.
import fs from 'node:fs';
import path from 'node:path';
import { amprentaSerie, citesteJson, existaFisier, sha256Fisier } from '../fisiere.mjs';
import { caiProiect, esteNumeProiect, normalizeazaCale, relativaLaRadacina } from '../cai.mjs';
import { blocheazaStop } from './raspuns.mjs';

/** @typedef {{ stdout: string, cod: 0|2, stderr?: string }} RaspunsHook */

const MARCAJ = 'Predare:';

/**
 * Caută toate liniile care, după trimStart (și după marcajele Markdown de început: >, *, _, #, -), încep cu „Predare:”.
 * @param {string} mesaj
 * @returns {{ cale: string, proiect: string }[]} proiect e '' când calea nu e sub video/<proiect>/
 */
export function gasestePredarile(mesaj) {
  if (typeof mesaj !== 'string') return [];
  const predari = [];
  for (const linieBruta of mesaj.replace(/\r\n?/g, '\n').split('\n')) {
    const linie = linieBruta.trimStart().replace(/^(?:[>*_#-]+\s*)+/, '');
    if (!linie.startsWith(MARCAJ)) continue;
    const cale = linie
      .slice(MARCAJ.length)
      .replace(/^[*_\s]+/, '')
      .replace(/[`"'„”“]/g, '')
      .trim()
      .replace(/[.,;:]+$/, '')
      .trim();
    const potriviri = [...('/' + normalizeazaCale(cale || '.')).matchAll(/\/video\/([^/]+)/g)];
    const proiect = potriviri.length > 0 ? potriviri[potriviri.length - 1][1] : '';
    predari.push({ cale, proiect });
  }
  return predari;
}

/**
 * Prima linie „Predare:” din mesaj (vezi gasestePredarile).
 * @param {string} mesaj
 * @returns {{ cale: string, proiect: string } | null}
 */
export function gasestePredare(mesaj) {
  return gasestePredarile(mesaj)[0] ?? null;
}

function caleRelativa(cale, radacina) {
  if (!cale) return null;
  if (/^([a-zA-Z]:)?[\\/]/.test(cale)) return relativaLaRadacina(cale, radacina);
  const rel = normalizeazaCale(cale);
  if (rel === '..' || rel.startsWith('../')) return null;
  return rel === '.' ? '' : rel;
}

function aceeasiCale(a, b, radacina) {
  const insensibil = /^[a-z]:/i.test(normalizeazaCale(radacina));
  return insensibil ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function problemaPredarii({ cale, proiect }, radacina) {
  if (!proiect || !esteNumeProiect(proiect)) {
    return 'linia „Predare:” trebuie să numească un fișier din video/<proiect>/';
  }
  const dirRel = `video/${proiect}`;
  const rel = caleRelativa(cale, radacina);
  if (rel === null || (rel !== dirRel && !rel.startsWith(dirRel + '/'))) {
    return `calea predată (${cale}) nu e în ${dirRel}/ din folderul agentului`;
  }
  const c = caiProiect(radacina, proiect);
  if (!existaFisier(c.verificare)) return `lipsește ${dirRel}/verificare.json, deci videoul nu a trecut prin verificare`;
  let v;
  try {
    v = citesteJson(c.verificare, `fisier:${dirRel}/verificare.json`);
  } catch {
    return `${dirRel}/verificare.json nu se poate citi`;
  }
  if (!v || typeof v !== 'object') return `${dirRel}/verificare.json nu are forma așteptată`;
  if (v.versiune === 2) return problemaPredariiSerie({ v, rel, c, dirRel, radacina });
  if (v.ok !== true) return `${dirRel}/verificare.json are verificări picate`;
  if (v.mod !== 'complet') return `${dirRel}/verificare.json vine dintr-o rulare „${String(v.mod)}”, nu din randarea completă`;
  if (!existaFisier(c.date)) return `lipsește ${dirRel}/date.json`;
  if (v.sha256_date !== sha256Fisier(c.date)) return `${dirRel}/date.json s-a schimbat după ultima verificare`;
  if (typeof v.mp4 !== 'string' || v.mp4 === '') return `${dirRel}/verificare.json nu numește un MP4`;
  const mp4 = normalizeazaCale(v.mp4);
  const potrivit = aceeasiCale(rel, mp4, radacina)
    || (rel === dirRel && aceeasiCale(mp4, `${dirRel}/${proiect}.mp4`, radacina));
  if (!potrivit) return `calea predată (${rel}) nu e MP4-ul verificat (${mp4})`;
  const caleMp4 = path.join(radacina, ...mp4.split('/'));
  if (!existaFisier(caleMp4)) return `lipsește ${mp4}`;
  if (v.sha256_mp4 !== sha256Fisier(caleMp4)) return `${mp4} s-a schimbat după ultima verificare`;
  // [B, complet] Fiecare cod obligatoriu are rezultate și toate trec; cadrele de control ale predării există.
  if (!Array.isArray(v.obligatorii) || v.obligatorii.length === 0) {
    return `${dirRel}/verificare.json nu are lista verificărilor obligatorii`;
  }
  const rezultate = Array.isArray(v.verificari) ? v.verificari : [];
  const lipsa = v.obligatorii.filter((cod) => !rezultate.some((r) => r?.cod === cod));
  if (lipsa.length > 0) return `${dirRel}/verificare.json nu are rezultate pentru ${lipsa.join(', ')}`;
  const picate = v.obligatorii.filter((cod) => rezultate.some((r) => r?.cod === cod && r.ok !== true));
  if (picate.length > 0) return `${dirRel}/verificare.json are verificări obligatorii picate: ${picate.join(', ')}`;
  for (const k of [1, 2]) {
    if (!existaFisier(path.join(c.cadre, `predare-${k}.png`))) {
      return `lipsește ${dirRel}/cadre/predare-${k}.png, cadrul de control al predării`;
    }
  }
  return problemaCorecturii(c.dir, dirRel, v.sha256_mp4);
}

/** Codurile din `obligatorii` fără rezultat sau cu un rezultat picat (ca la versiunea 1); null dacă lista lipsește. */
function obligatoriiNeverzi(obligatorii, verificari) {
  if (!Array.isArray(obligatorii) || obligatorii.length === 0) return null;
  const rezultate = Array.isArray(verificari) ? verificari : [];
  return obligatorii.filter((cod) => !rezultate.some((r) => r?.cod === cod) || rezultate.some((r) => r?.cod === cod && r.ok !== true));
}

/**
 * Prima sursă din verificare.json (versiunea 2, câmpul surse) care nu mai e pe disc cum a fost verificată; null dacă
 * toate sunt la fel. Un hash null înseamnă că fișierul nu exista; un câmp lipsă sau stricat e tratat ca schimbat.
 */
export function sursaSchimbata(dirProiect, surse) {
  if (surse === null || typeof surse !== 'object' || Array.isArray(surse)) return 'verificare.json (lista surselor)';
  for (const [rel, sha] of Object.entries(surse)) {
    if (typeof rel !== 'string' || rel.split(/[\\/]/).includes('..')) return rel;
    const cale = path.join(dirProiect, ...rel.split('/'));
    const acum = existaFisier(cale) ? sha256Fisier(cale) : null;
    if (acum !== sha) return rel;
  }
  return null;
}

/**
 * Felia 3, verificare.json versiunea 2 (docs/interfete/verificare.md, regula Stop a versiunii 2): o serie se predă
 * doar întreagă verde. Predarea numește manifestul sau unul dintre MP4-urile din iesiri.
 * @returns {string|null}
 */
function problemaPredariiSerie({ v, rel, c, dirRel, radacina }) {
  // 1. ok, complet, date.json neschimbat
  if (v.ok !== true) return `${dirRel}/verificare.json are verificări picate`;
  if (v.mod !== 'complet') return `${dirRel}/verificare.json vine dintr-o rulare „${String(v.mod)}”, nu din randarea completă`;
  if (!existaFisier(c.date)) return `lipsește ${dirRel}/date.json`;
  if (v.sha256_date !== sha256Fisier(c.date)) return `${dirRel}/date.json s-a schimbat după ultima verificare`;
  // 1b. sursele seriei (tabelul, pozele): o schimbare a lor nu trece prin date.json
  const sursa = sursaSchimbata(c.dir, v.surse);
  if (sursa) return `${dirRel}/${sursa} s-a schimbat după ultima verificare`;
  // 2. nivelul superior
  const sus = obligatoriiNeverzi(v.obligatorii, v.verificari);
  if (sus === null) return `${dirRel}/verificare.json nu are lista verificărilor obligatorii`;
  if (sus.length > 0) return `${dirRel}/verificare.json nu are rezultate verzi pentru ${sus.join(', ')}`;
  // 3. manifestul, cu hash-ul înregistrat
  const manifest = typeof v.manifest?.cale === 'string' ? normalizeazaCale(v.manifest.cale) : null;
  if (manifest !== `${dirRel}/serie/manifest.json`) return `${dirRel}/verificare.json nu numește manifestul seriei`;
  const caleManifest = path.join(radacina, ...manifest.split('/'));
  if (!existaFisier(caleManifest)) return `lipsește ${manifest}`;
  if (v.manifest.sha256 !== sha256Fisier(caleManifest)) return `${manifest} s-a schimbat după ultima verificare`;
  // 4. ce se predă: manifestul, folderul seriei sau un MP4 din iesiri
  const iesiri = Array.isArray(v.iesiri) ? v.iesiri : [];
  if (iesiri.length === 0) return `${dirRel}/verificare.json nu are ieșirile seriei`;
  const predabile = [manifest, `${dirRel}/serie`, ...iesiri.map((i) => normalizeazaCale(String(i?.mp4 ?? '')))];
  if (!predabile.some((x) => aceeasiCale(rel, x, radacina))) {
    return `calea predată (${rel}) nu e manifestul seriei și nici un MP4 verificat din ${dirRel}/serie/`;
  }
  // 5 și 6. fiecare ieșire: MP4-ul cu hash-ul lui, verde, cu cadrele de predare
  for (const i of iesiri) {
    if (typeof i?.id !== 'string' || !esteNumeProiect(i.id)) return `${dirRel}/verificare.json are o ieșire fără id valid`;
    const mp4 = normalizeazaCale(String(i.mp4 ?? ''));
    if (!/^video\/[^/]+\/serie\/\d{2,3}-[a-z0-9-]+\.mp4$/.test(mp4) || !mp4.startsWith(`${dirRel}/serie/`)) return `ieșirea ${i.id} nu are un MP4 în ${dirRel}/serie/`;
    const caleMp4 = path.join(radacina, ...mp4.split('/'));
    if (!existaFisier(caleMp4)) return `lipsește ${mp4}`;
    if (i.sha256_mp4 !== sha256Fisier(caleMp4)) return `${mp4} s-a schimbat după ultima verificare`;
    if (i.ok !== true) return `filmul ${mp4} are verificări picate`;
    const jos = obligatoriiNeverzi(i.obligatorii, i.verificari);
    if (jos === null) return `ieșirea ${i.id} nu are lista verificărilor obligatorii`;
    if (jos.length > 0) return `filmul ${mp4} nu are rezultate verzi pentru ${jos.join(', ')}`;
    for (const k of [1, 2]) {
      if (!existaFisier(path.join(c.cadre, i.id, `predare-${k}.png`))) return `lipsește ${dirRel}/cadre/${i.id}/predare-${k}.png, cadrul de control al predării`;
    }
  }
  return problemaCorecturii(c.dir, dirRel, amprentaSerie(iesiri));
}

/**
 * Felia 2: după prima corectură, orice film predat trece prin ea. Ultima încercare a ultimei corecturi spune ce MP4
 * poate fi predat: cel verificat cu --verifica (fără scene atinse), sau cel de la deschidere dacă e în lucru ori închisă.
 * @returns {string|null}
 */
export function problemaCorecturii(dirProiect, dirRel, sha256Mp4) {
  let ultima = null;
  let n = null;
  try {
    const dir = path.join(dirProiect, 'corecturi');
    n = fs.readdirSync(dir).filter((x) => /^\d+$/.test(x)).map(Number).sort((a, b) => a - b).pop() ?? null;
    if (n === null) return null;
    const k = fs.readdirSync(path.join(dir, String(n))).map((f) => /^incercare-(\d+)\.json$/.exec(f)).filter(Boolean)
      .map((m) => Number(m[1])).sort((a, b) => a - b).pop();
    if (k === undefined) return null;
    ultima = citesteJson(path.join(dir, String(n), `incercare-${k}.json`));
  } catch {
    return n === null ? null : `${dirRel}/corecturi/${n} nu se poate citi`;
  }
  const proiect = dirRel.slice('video/'.length);
  if (ultima.verificata_la) {
    if (ultima.sha256_mp4_dupa !== sha256Mp4) {
      return `filmul s-a schimbat după corectura ${n} (încercarea ${ultima.incercare}, verificată); o schimbare nouă după predare pornește de la cursant: --din-nou sau --deschide, apoi --verifica`;
    }
    if (ultima.ok === false) return `corectura ${n} a schimbat și scene pe care cursantul nu le-a cerut (corectura-atinge-altceva); repară date.json, randează, apoi node nucleu/mg.mjs corectura ${proiect} --verifica`;
    return null;
  }
  if (ultima.sha256_mp4_de_la !== sha256Mp4) {
    return ultima.inchisa_la
      ? `filmul s-a schimbat după ce corectura ${n} s-a închis cu propunerile; ce alege cursantul se deschide cu node nucleu/mg.mjs corectura ${proiect} --deschide`
      : `corectura ${n} nu e verificată: rulează node nucleu/mg.mjs corectura ${proiect} --verifica înainte de predare`;
  }
  return null;
}

/**
 * @param {object} intrare JSON-ul hook-ului Stop
 * @param {string} radacina
 * @returns {RaspunsHook}
 */
export function decideStop(intrare, radacina) {
  const mesaj = typeof intrare?.last_assistant_message === 'string' ? intrare.last_assistant_message : '';
  // Fiecare linie „Predare:” se verifică; prima problemă blochează, cu proiectul ei în mesaj (SEC-2).
  let predare = null;
  let problema = null;
  for (const candidat of gasestePredarile(mesaj)) {
    problema = problemaPredarii(candidat, radacina);
    if (problema) {
      predare = candidat;
      break;
    }
  }
  if (!predare) return { stdout: '', cod: 0 };
  const p = esteNumeProiect(predare.proiect) ? predare.proiect : '<proiect>';
  // o serie (felia 3, verificare.json versiunea 2) se predă prin manifest
  let serie = false;
  try {
    serie = p !== '<proiect>' && citesteJson(caiProiect(radacina, p).verificare)?.versiune === 2;
  } catch {
    // fără verificare.json citibil, linia filmului unic
  }
  const linie = serie ? `video/${p}/serie/manifest.json` : `video/${p}/${p}.mp4`;
  return {
    stdout: blocheazaStop(`Predarea nu e verificată: ${problema}. Rulează node nucleu/mg.mjs randeaza ${p}, apoi predă din nou, cu linia „Predare: ${linie}”. Dacă nu poți preda acum, spune-i cursantului ce lipsește, fără linia „Predare:”.`),
    cod: 0,
  };
}
