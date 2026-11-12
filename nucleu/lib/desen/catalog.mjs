// Catalogul pieselor: biblioteci/catalog.json, apoi proprii/catalog-propriu.json (spec 8.5, 8.6, harta 5.13) și, doar
// pentru un proiect cu brand, branduri/<brand>/catalog.json (felia 4). Piesele de tip traseu ({w, h, paths}) vin numai din
// catalogul unui brand (verificaDesene refuză altele, verifica-biblioteci le refuză în biblioteci/): folderul branduri/
// nu intră în git, deci nici desenele unui brand.
import path from 'node:path';
import { citesteJson, existaFisier } from '../fisiere.mjs';
import { eroare, EroareFatala, COD_IESIRE } from '../erori.mjs';

const ID_BRAND = /^b-[a-z0-9][a-z0-9-]*$/;
const FISIER_BRAND = /^desene\/[a-z0-9][a-z0-9-]*\.json$/;

// Piesele brandului: doar trasee, cu id b-..., fișierul în desene/ și licența scrisă (C07 o cere).
function pieseBrand(radacina, brand) {
  const relativ = `branduri/${brand}/catalog.json`;
  const cale = path.join(radacina, 'branduri', brand, 'catalog.json');
  if (!existaFisier(cale)) return [];
  const catalog = citesteJson(cale, `fisier:${relativ}`);
  const gresit = (ce) => new EroareFatala(eroare('json-invalid', `fisier:${relativ}`,
    `${relativ} nu poate fi folosit: ${ce}.`,
    `Refă catalogul brandului cu unealta care l-a scris (exportul din kitul brandului).`), COD_IESIRE.DATE);
  if (!Array.isArray(catalog?.piese)) throw gresit('nu are lista piese');
  return catalog.piese.map((p, i) => {
    if (p === null || typeof p !== 'object') throw gresit(`piese[${i}] nu e un obiect`);
    if (typeof p.id !== 'string' || !ID_BRAND.test(p.id)) throw gresit(`piese[${i}].id trebuie să înceapă cu „b-” și să aibă doar litere mici, cifre și cratime`);
    if (p.tip !== 'traseu') throw gresit(`piesa „${p.id}” are tipul ${JSON.stringify(p.tip)}; catalogul unui brand are doar trasee`);
    if (typeof p.fisier !== 'string' || !FISIER_BRAND.test(p.fisier)) throw gresit(`piesa „${p.id}” trebuie să aibă fisier: desene/<nume>.json`);
    if (typeof p.licenta !== 'string' || p.licenta.trim() === '') throw gresit(`piesa „${p.id}” nu are licenta`);
    const cutie = p.cutie;
    if (!cutie || !(cutie.w > 0) || !(cutie.h > 0)) throw gresit(`piesa „${p.id}” nu are cutie {w, h} pozitivă`);
    return { familie: 'traseu', noapte: 'bun', teme_potrivite: ['noapte'], etichete: [], ...p, proprie: false, brand };
  });
}

/**
 * @param {string} radacina
 * @param {string|null} [brand] numele brandului proiectului; doar atunci intră și piesele lui
 * @returns {{versiune: number, surse: object, piese: object[], sinonime: Record<string, string[]>}}
 */
export function incarcaCatalog(radacina, brand = null) {
  const caleBiblioteci = path.join(radacina, 'biblioteci', 'catalog.json');
  if (!existaFisier(caleBiblioteci)) {
    throw new EroareFatala(eroare('fisier-necitibil', 'fisier:biblioteci/catalog.json',
      'Catalogul bibliotecii, biblioteci/catalog.json, lipsește.',
      'Rulează node nucleu/mg.mjs doctor; dacă eroarea rămâne, reia instalarea kitului.'), COD_IESIRE.MEDIU);
  }
  const baza = citesteJson(caleBiblioteci, 'fisier:biblioteci/catalog.json');
  if (!Array.isArray(baza.piese)) {
    throw new EroareFatala(eroare('json-invalid', 'fisier:biblioteci/catalog.json',
      'biblioteci/catalog.json nu are lista piese.',
      'Rulează node nucleu/mg.mjs doctor; catalogul vine din kit și nu se editează de mână.'), COD_IESIRE.MEDIU);
  }
  // `brand` îl pune doar pieseBrand: scris de mână într-un catalog, ar muta calea piesei și ar deschide traseele
  const faraBrand = ({ brand: _brand, ...p }) => p;
  const piese = baza.piese.map((p) => ({ ...faraBrand(p), proprie: false }));

  const calePropriu = path.join(radacina, 'proprii', 'catalog-propriu.json');
  if (existaFisier(calePropriu)) {
    const propriu = citesteJson(calePropriu, 'fisier:proprii/catalog-propriu.json');
    if (!Array.isArray(propriu.piese)) {
      throw new EroareFatala(eroare('json-invalid', 'fisier:proprii/catalog-propriu.json',
        'proprii/catalog-propriu.json nu are lista piese.',
        'Adaugă piesele proprii doar cu node nucleu/mg.mjs desen adauga.'), COD_IESIRE.DATE);
    }
    for (const p of propriu.piese) piese.push({ ...faraBrand(p), proprie: true });
  }

  // aceeași regulă ca `brand` din schemele șabloanelor
  if (typeof brand === 'string' && /^[a-z0-9-]{2,40}$/.test(brand)) {
    for (const p of pieseBrand(radacina, brand)) {
      if (piese.some((q) => q.id === p.id)) continue;
      piese.push(p);
    }
  }

  return { versiune: baza.versiune, surse: baza.surse ?? {}, piese, sinonime: baza.sinonime ?? {} };
}

/** @returns {object|null} */
export function gasestePiesa(catalog, id) {
  return catalog.piese.find((p) => p.id === id) ?? null;
}

/**
 * Calea absolută a fișierului unei piese: în proprii/ pentru piesele proprii, în branduri/<brand>/ pentru ale unui brand,
 * în biblioteci/ pentru rest.
 * `fisier` vine din catalog, iar proprii/catalog-propriu.json stă în zona liberă, deci calea rezolvată trebuie să rămână
 * în folderul piesei; altfel dă valoare-invalida pe fișierul catalogului, fără să citească nimic (revizuirea
 * transversală B01-B13, T13). O folosesc build-ul reelului (sablon.mjs) și foaia de piese (arata.mjs).
 * @param {string} radacina
 * @param {{id: string, fisier: string, proprie: boolean}} piesa
 * @returns {string}
 */
export function caleFisierPiesa(radacina, piesa) {
  const dir = piesa.brand ? `branduri/${piesa.brand}` : piesa.proprie ? 'proprii' : 'biblioteci';
  const baza = path.resolve(radacina, ...dir.split('/'));
  const cale = typeof piesa.fisier === 'string' && piesa.fisier !== '' ? path.resolve(baza, ...piesa.fisier.split('/')) : baza;
  const relativ = path.relative(baza, cale);
  if (relativ === '' || relativ === '..' || relativ.startsWith(`..${path.sep}`) || path.isAbsolute(relativ)) {
    const catalog = piesa.brand ? `${dir}/catalog.json` : piesa.proprie ? 'proprii/catalog-propriu.json' : 'biblioteci/catalog.json';
    throw new EroareFatala(eroare('valoare-invalida', `fisier:${catalog}`,
      `Piesa „${piesa.id}” are fișierul „${String(piesa.fisier)}”, care nu e în folderul ${dir}/.`,
      piesa.proprie
        ? 'Adaugă piesele proprii doar cu node nucleu/mg.mjs desen adauga <fisier> --licenta "<text>" --etichete "<e1,e2,e3,e4>"; nu scrie de mână în proprii/catalog-propriu.json.'
        : 'Rulează node nucleu/mg.mjs doctor; catalogul vine din kit și nu se editează de mână.'), COD_IESIRE.DATE);
  }
  return cale;
}
