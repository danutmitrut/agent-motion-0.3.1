// Activele unui proiect: înghețarea în video/<p>/active/ cu sha256 în motor.lock și verificarea C07
// (spec 6.11, 6.13, 6.14, 7.1; harta 4.15 și 5.3). Un activ se scrie o singură dată; după aceea proiectul
// folosește copia înghețată, chiar dacă biblioteca se schimbă, iar hash-ul din motor.lock nu se mai rescrie.
import path from 'node:path';
import { caiProiect } from './cai.mjs';
import { existaFisier, sha256Fisier, scrieOctetiAtomic } from './fisiere.mjs';
import { citesteLock, scrieLock } from './lock.mjs';
import { eroare } from './erori.mjs';
import { incarcaCatalog, gasestePiesa } from './desen/catalog.mjs';
import { incarcaCatalogFonturi } from './fonturi.mjs';

// desen: png, jpg și webp doar pentru piesele raster proprii (spec 8.6), care intră prin apariție
const EXTENSII = Object.freeze({ desen: ['json', 'svg', 'png', 'jpg', 'webp'], iconita: ['svg'], font: ['woff2'] });
const CALE_ACTIV = /^active\/(desen|iconita|font)\/([a-z0-9][a-z0-9-]*)\.([a-z0-9]+)$/;

function sortat(obiect) {
  return Object.fromEntries(Object.entries(obiect).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/**
 * @param {string} radacina
 * @param {string} proiect
 * @param {{tip: 'desen'|'iconita'|'font', id: string, continut: string|Buffer, extensie: string}} activ
 * @returns {{cale: string, sha256: string}} cale e relativă la video/<proiect>/, cu '/'
 */
export function ingheataActiv(radacina, proiect, { tip, id, continut, extensie }) {
  if (!Object.hasOwn(EXTENSII, tip)) throw new TypeError(`Tip de activ necunoscut: ${tip}.`);
  if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new TypeError(`Id de activ invalid: ${id}.`);
  if (!EXTENSII[tip].includes(extensie)) throw new TypeError(`Extensia ${extensie} nu e permisă pentru tipul ${tip}.`);
  const cai = caiProiect(radacina, proiect);
  const cale = `active/${tip}/${id}.${extensie}`;
  const absolut = path.join(cai.dir, 'active', tip, `${id}.${extensie}`);
  if (!existaFisier(absolut)) {
    scrieOctetiAtomic(absolut, typeof continut === 'string' ? Buffer.from(continut, 'utf8') : continut);
  }
  const lock = citesteLock(cai.lock);
  const active = lock.active ?? {};
  if (typeof active[cale] === 'string') return { cale, sha256: active[cale] };
  const sha256 = sha256Fisier(absolut);
  lock.active = sortat({ ...active, [cale]: sha256 });
  scrieLock(cai.lock, lock);
  return { cale, sha256 };
}

function areLicenta(radacina, tip, id, cache) {
  const nevid = (s) => typeof s === 'string' && s.trim() !== '';
  if (tip === 'font') {
    cache.fonturi ??= incarcaCatalogFonturi(radacina);
    return nevid(cache.fonturi[id]?.licenta);
  }
  cache.catalog ??= incarcaCatalog(radacina, cache.brand ?? null);
  if (tip === 'iconita') return nevid(cache.catalog.surse?.lucide?.licenta);
  const piesa = gasestePiesa(cache.catalog, id);
  if (!piesa) return false;
  if (piesa.proprie || piesa.brand) return nevid(piesa.licenta);
  return nevid(cache.catalog.surse?.[piesa.sursa]?.licenta);
}

/**
 * C07: fiecare activ din motor.lock există, are extensia permisă, hash-ul înghețat și licență în catalog.
 * Cu `folosite` (activele planului curent, întoarse de construieste), doar intrările din listă: un activ pe care
 * proiectul nu-l mai folosește rămâne în motor.lock și pe disc, ca istoric, dar nu mai oprește randarea (T4).
 * @param {string} radacina
 * @param {string} proiect
 * @param {object} lock MotorLock (harta 5.3)
 * @param {string[]} [folosite] căi relative la video/<proiect>/, ca în motor.lock; fără ea, toate intrările
 * @param {string|null} [brand] brandul proiectului, ca licența pieselor lui să se găsească în catalogul brandului
 * @returns {{cod: 'C07', ok: boolean, valoare: {active: number}, prag: null, camp: null, erori: object[]}}
 */
export function verificaActive(radacina, proiect, lock, folosite, brand = null) {
  const cai = caiProiect(radacina, proiect);
  const erori = [];
  const cache = { brand };
  const filtru = Array.isArray(folosite) ? new Set(folosite) : null;
  const intrari = Object.entries(lock?.active ?? {})
    .filter(([cale]) => filtru === null || filtru.has(cale))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const refacere = `Rulează din nou node nucleu/mg.mjs randeaza ${proiect} --doar-verificare; mg reface activul din bibliotecă.`;
  for (const [cale, sha256] of intrari) {
    const camp = `fisier:video/${proiect}/${cale}`;
    const m = CALE_ACTIV.exec(cale);
    if (!m || !EXTENSII[m[1]].includes(m[3])) {
      erori.push(eroare('resursa-lipsa', camp, `Intrarea „${cale}” din motor.lock nu e un activ permis (tip sau extensie).`, refacere));
      continue;
    }
    const [, tip, id] = m;
    const absolut = path.join(cai.dir, ...cale.split('/'));
    if (!existaFisier(absolut)) {
      erori.push(eroare('resursa-lipsa', camp, `Activul ${cale} lipsește din proiect.`, refacere));
      continue;
    }
    if (sha256Fisier(absolut) !== sha256) {
      erori.push(eroare('resursa-hash', camp,
        `Activul ${cale} a fost modificat după înghețare (sha256 diferit de cel din motor.lock).`,
        `Nu modifica fișierele din active/. Pornește un proiect nou din datele acestuia: node nucleu/mg.mjs nou <proiect-nou> --din ${proiect}; activele se îngheață din nou din bibliotecă.`));
      continue;
    }
    if (!areLicenta(radacina, tip, id, cache)) {
      erori.push(eroare('licenta-lipsa', camp,
        `Activul ${cale} nu are licență înregistrată în catalog.`,
        'Alege alt desen cu node nucleu/mg.mjs desen cauta "<subiect>" sau adaugă piesa ta cu node nucleu/mg.mjs desen adauga <fisier> --licenta "<text>" --etichete "<e1,e2,e3,e4>".'));
    }
  }
  return { cod: 'C07', ok: erori.length === 0, valoare: { active: intrari.length }, prag: null, camp: null, erori };
}
