// Temele comune din motoare/comun/teme/ și atenuatul calculat (decizia 13).
// rezolvaStil și valoriStil (A08) sunt la finalul fișierului.
import fs from 'node:fs';
import path from 'node:path';
import { citesteJson, existaFisier } from './fisiere.mjs';
import { eroare, EroareFatala, COD_IESIRE } from './erori.mjs';
import { conflicteBrandDate } from './brand.mjs';
import { eroareFontCatalogBrand } from './fonturi.mjs';
import { hexInRgb, rgbInHex, raportContrast, amestec, punctCelMaiNefavorabil, puncteFundal, stopuriDegrade } from './contrast.mjs';

/** Temele acceptate de toate șabloanele; 'contrast' e doar a lui text-animat. */
export const TEME_COMUNE = Object.freeze(['noapte', 'hartie', 'curat']);

/** @param {string} radacina */
function dirTeme(radacina) {
  return path.join(radacina, 'motoare', 'comun', 'teme');
}

/**
 * Id-urile temelor instalate, sortate.
 * @param {string} radacina
 * @returns {string[]}
 */
export function listaTeme(radacina) {
  return fs
    .readdirSync(dirTeme(radacina))
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -'.json'.length))
    .sort();
}

/**
 * @typedef {{ id: string, nume: string,
 *   culori: { fundal: string, text: string, atenuat: string, accent: string },
 *   font_titlu: string, font_text: string, atmosfera: 'ceata'|'plin'|'degrade', granulatie: number,
 *   eticheta: { majuscule: boolean, spatiere: number, prefix: string } }} Tema
 */

/**
 * @param {string} radacina
 * @param {string} id
 * @returns {Tema}
 */
export function incarcaTema(radacina, id) {
  const cale = path.join(dirTeme(radacina), `${id}.json`);
  if (typeof id !== 'string' || !/^[a-z0-9-]+$/.test(id) || !existaFisier(cale)) {
    const lista = listaTeme(radacina).join(', ');
    throw new EroareFatala(
      eroare(
        'tema-necunoscuta',
        'stil.tema',
        `Stil, tema: tema „${id}” nu există. Temele instalate sunt: ${lista}.`,
        `Pune în stil.tema una dintre temele: ${TEME_COMUNE.join(', ')}.`,
      ),
      COD_IESIRE.DATE,
    );
  }
  return /** @type {Tema} */ (citesteJson(cale, `fisier:motoare/comun/teme/${id}.json`));
}

/**
 * Atenuatul calculat din culorile rezolvate (decizia 13): 60% text + 40% fundal;
 * cât timp contrastul față de punctul cel mai nefavorabil al fundalului e sub prag, ponderea textului crește
 * cu 5 puncte; la 100% e chiar textul. Fără `puncte`, singurul punct e fundalul (comportamentul din fișă);
 * rezolvaStil dă punctele ceții la intensitatea 1, ca atenuatul să treacă C06 și la ceață (A-Î2, F10).
 * @param {string} text hex
 * @param {string} fundal hex
 * @param {number} [prag]
 * @param {string[]} [puncte] culorile pe care poate sta textul (puncteFundal)
 * @returns {string} '#RRGGBB'
 */
export function calculeazaAtenuat(text, fundal, prag = 3, puncte = [fundal]) {
  for (let pondere = 60; pondere < 100; pondere += 5) {
    const atenuat = amestec(text, fundal, pondere);
    if (raportContrast(atenuat, punctCelMaiNefavorabil(atenuat, puncte)) >= prag) return atenuat;
  }
  return rgbInHex(hexInRgb(text));
}

// Rezolvarea stilului (A08): precedența implicite < temă < brand < date (spec 6.4, harta 4.6).

const STIL_DE_BAZA = Object.freeze({ tema: 'noapte', ritm: 'normal' });
const CAMPURI_STIL_COMUNE = new Set(['descriere', 'tema', 'culori', 'font_titlu', 'ritm', 'atmosfera']);
const JETOANE_CULORI_TEMA = ['fundal', 'text', 'atenuat', 'accent'];

const cuSursa = (valoare, sursa) => ({ valoare, sursa });

// Lanțul de noduri al unui `$ref` local (`#/...`, pointer JSON în aceeași schemă), de la nodul dat până la ținta finală.
// La reel (B02), `"stil": { "$ref": "#/$defs/stil" }`. Un `$ref` extern, o țintă lipsă sau un ciclu opresc lanțul.
function lantRefLocal(schema, nod) {
  const lant = [];
  const vazute = new Set();
  let curent = nod;
  while (curent && typeof curent === 'object' && !Array.isArray(curent)) {
    lant.push(curent);
    const ref = curent.$ref;
    if (typeof ref !== 'string' || !ref.startsWith('#') || vazute.has(ref)) break;
    vazute.add(ref);
    let tinta = schema;
    for (const bucata of ref.slice(1).split('/').slice(1)) {
      const cheie = bucata.replaceAll('~1', '/').replaceAll('~0', '~');
      tinta = tinta !== null && typeof tinta === 'object' && Object.hasOwn(tinta, cheie) ? tinta[cheie] : undefined;
    }
    curent = tinta;
  }
  return lant;
}

const HEX = /^#[0-9A-Fa-f]{6}$/;

// Punctele față de care se calculează atenuatul (F10): la 'ceata', fundalul și straturile de ceață la intensitatea 1;
// la 'degrade', fundalul și stopurile degradeului (stopuriDegrade, planul G), tot la intensitatea 1; altfel doar fundalul.
// Jetoanele șablonului care nu depind de atenuat (ex. linie: 'text') se rezolvă provizoriu. Culorile invalide le raportează schema.
function puncteAtenuat(culori, jetoaneSablon, atmosfera, ceata) {
  const fundal = culori.fundal.valoare;
  if (atmosfera !== 'ceata' && atmosfera !== 'degrade') return [fundal];
  const plate = Object.fromEntries(Object.entries(culori).map(([jeton, c]) => [jeton, c.valoare]));
  delete plate.atenuat;
  for (const [jeton, ref] of jetoaneSablon) {
    if (plate[jeton] !== undefined || ref === 'atenuat') continue;
    plate[jeton] = plate[ref] ?? ref;
  }
  const folosite = ['fundal', 'text', 'accent', 'linie'].filter((j) => plate[j] !== undefined);
  if (!folosite.every((j) => typeof plate[j] === 'string' && HEX.test(plate[j]))) return [fundal];
  if (atmosfera === 'degrade') return puncteFundal(plate, 'degrade', { stopuri: stopuriDegrade(plate), intensitate: 1 });
  return puncteFundal(plate, 'ceata', { intensitate: 1, ceata });
}

export function rezolvaStil({ radacina, sablon, date, brand }) {
  const erori = [];
  const avertismente = [];
  const stilDate = date && typeof date.stil === 'object' && date.stil !== null ? date.stil : {};
  const culoriDate = brand ? {} : (stilDate.culori ?? {});
  const culoriBrand = brand?.culori ?? {};
  if (brand) erori.push(...conflicteBrandDate(date, brand, sablon.nume));

  // Implicitele șablonului: valorile `default` din schema lui stil, peste baza comună (decizia 1).
  // Schema lui stil poate fi un `$ref` local (la reel, `#/$defs/stil`); la fel fiecare câmp al ei.
  const schema = sablon.schema ?? {};
  const schemaStil = lantRefLocal(schema, schema.properties?.stil).at(-1);
  const proprietatiStil = schemaStil?.properties ?? {};
  const implicite = { ...STIL_DE_BAZA };
  for (const [cheie, def] of Object.entries(proprietatiStil)) {
    const cuImplicit = lantRefLocal(schema, def).find((nod) => Object.hasOwn(nod, 'default'));
    if (cuImplicit) implicite[cheie] = cuImplicit.default;
  }

  // Tema.
  let tema = cuSursa(implicite.tema, 'implicit');
  if (brand?.tema !== undefined) tema = cuSursa(brand.tema, 'brand');
  if (!brand && stilDate.tema !== undefined) tema = cuSursa(stilDate.tema, 'date');
  const acceptate = sablon.meta?.teme;
  let dateTema;
  try {
    if (Array.isArray(acceptate) && !acceptate.includes(tema.valoare)) {
      throw new EroareFatala(eroare('tema-necunoscuta', tema.sursa === 'brand' ? 'brand' : 'stil.tema',
        `Tema „${tema.valoare}” nu e acceptată de șablonul ${sablon.nume}.`,
        `Alege una dintre: ${acceptate.join(', ')}.`), COD_IESIRE.DATE);
    }
    dateTema = incarcaTema(radacina, tema.valoare);
  } catch (e) {
    if (!(e instanceof EroareFatala)) throw e;
    erori.push(e.eroareMg);
    tema = cuSursa(implicite.tema, 'implicit');
    dateTema = incarcaTema(radacina, tema.valoare);
  }

  // Culorile temei, apoi brandul, apoi datele.
  const culori = {};
  for (const jeton of JETOANE_CULORI_TEMA) culori[jeton] = cuSursa(dateTema.culori[jeton], 'tema');
  for (const [jeton, valoare] of Object.entries(culoriBrand)) {
    if (jeton !== 'atenuat') culori[jeton] = cuSursa(valoare, 'brand');
  }
  for (const [jeton, valoare] of Object.entries(culoriDate)) culori[jeton] = cuSursa(valoare, 'date');

  const atmosfera = stilDate.atmosfera !== undefined ? cuSursa(stilDate.atmosfera, 'date') : cuSursa(dateTema.atmosfera, 'tema');
  const jetoaneSablon = Object.entries(sablon.implicite?.jetoane ?? {});

  // Atenuatul (decizia 13): al brandului dacă îl dă; altfel calculat dacă fundalul sau textul s-au schimbat; altfel al temei.
  // Cel calculat trece pragul și față de straturile de ceață (A-Î2, F10), la intensitatea 1.
  const schimbat = culori.fundal.sursa !== 'tema' || culori.text.sursa !== 'tema';
  if (culoriBrand.atenuat !== undefined) culori.atenuat = cuSursa(culoriBrand.atenuat, 'brand');
  else if (schimbat) {
    const puncte = puncteAtenuat(culori, jetoaneSablon, atmosfera.valoare, brand?.ceata ?? null);
    culori.atenuat = cuSursa(calculeazaAtenuat(culori.text.valoare, culori.fundal.valoare, 3, puncte), 'calculat');
  }

  // Jetoanele proprii ale șablonului (ex. linie: 'text'), dacă nu le-au dat brandul sau datele.
  for (const [jeton, ref] of jetoaneSablon) {
    if (culori[jeton]) continue;
    culori[jeton] = cuSursa(culori[ref] ? culori[ref].valoare : ref, 'implicit');
  }

  const stil = { tema, culori };
  stil.font_titlu = cuSursa(dateTema.font_titlu, 'tema');
  if (brand?.font_titlu !== undefined) {
    stil.font_titlu = cuSursa(brand.font_titlu, 'brand');
    // F11: un id de catalog necunoscut din brand se raportează aici, înaintea lui construieste și a lui C05, pe câmpul brand.
    const fontNecunoscut = eroareFontCatalogBrand(radacina, brand.font_titlu, brand.nume);
    if (fontNecunoscut) erori.push(fontNecunoscut);
  }
  if (!brand && stilDate.font_titlu !== undefined) stil.font_titlu = cuSursa(stilDate.font_titlu, 'date');
  stil.font_text = cuSursa(dateTema.font_text, 'tema');
  if (brand?.font_text !== undefined) {
    stil.font_text = cuSursa(brand.font_text, 'brand');
    const fontNecunoscut = eroareFontCatalogBrand(radacina, brand.font_text, brand.nume);
    if (fontNecunoscut) erori.push(fontNecunoscut);
  }
  stil.ritm = stilDate.ritm !== undefined ? cuSursa(stilDate.ritm, 'date') : cuSursa(implicite.ritm, 'implicit');
  stil.atmosfera = atmosfera;
  stil.granulatie = cuSursa(dateTema.granulatie, 'tema');
  stil.eticheta = cuSursa(dateTema.eticheta, 'tema');
  if (brand?.eticheta?.prefix !== undefined) stil.eticheta = cuSursa({ ...dateTema.eticheta, prefix: brand.eticheta.prefix }, 'brand');
  // Ceața brandului (felia 4) există în stil doar când o dă brandul, ca stil-rezolvat.json fără ea să rămână neschimbat.
  if (brand?.ceata !== undefined) stil.ceata = cuSursa(brand.ceata, 'brand');

  // Câmpurile proprii ale șablonului din stil (ex. recolorare): implicitul din schemă, apoi datele.
  const proprii = new Set([...Object.keys(proprietatiStil), ...Object.keys(stilDate)]);
  for (const cheie of [...proprii].sort()) {
    if (CAMPURI_STIL_COMUNE.has(cheie)) continue;
    if (stilDate[cheie] !== undefined) stil[cheie] = cuSursa(stilDate[cheie], 'date');
    else if (Object.hasOwn(implicite, cheie)) stil[cheie] = cuSursa(implicite[cheie], 'implicit');
  }

  const semnatura = semnaturaRezolvata(date, brand);
  if (semnatura) stil.semnatura = cuSursa(semnatura.valoare, semnatura.sursa);

  return { stil, erori, avertismente };
}

/**
 * Semnătura care apare pe ecran, dintr-un singur loc (revizuirea transversală B01-B13, T1/T18): din brand,
 * altfel, doar fără brand, din date. O folosesc rezolvaStil (stil.semnatura) și regulile C03/C04 ale șablonului,
 * care rulează înaintea stilului.
 * @param {object} date @param {object|null} brand fișa din citesteBrand (semnatura e deja text nevid)
 * @returns {{valoare: unknown, sursa: 'brand'|'date'}|null}
 */
export function semnaturaRezolvata(date, brand) {
  if (brand?.semnatura !== undefined) return { valoare: brand.semnatura, sursa: 'brand' };
  if (!brand && date?.semnatura !== undefined) return { valoare: date.semnatura, sursa: 'date' };
  return null;
}

/** StilRezolvat → obiect plat, fără surse. */
export function valoriStil(stil) {
  const plat = {};
  for (const [cheie, camp] of Object.entries(stil)) {
    if (cheie === 'culori') {
      plat.culori = Object.fromEntries(Object.entries(camp).map(([jeton, c]) => [jeton, c.valoare]));
    } else {
      plat[cheie] = camp.valoare;
    }
  }
  return plat;
}
