// build/props.json al compoziției Grafic (forma din planul I, „build/props.json al lui date-serie”). Funcție pură:
// din date, stilul plat, timpi, așezare și catalogul de fonturi; construieste() doar o scrie. Ordinea cheilor e fixă
// (scrieJsonAtomic păstrează ordinea de inserare), deci aceleași date dau același fișier, byte cu byte.
import path from 'node:path';
import { straturiCeata, limitaIntensitate, esteFontBrand } from '../../../../nucleu/lib/sdk.mjs';
import { FPS, CADRE_TRANZITIE } from './src/durata.mjs';
import * as Z from './src/comun/zone.mjs';

const JETOANE = ['fundal', 'text', 'atenuat', 'accent'];
const CHEI_TEXT = ['id', 'text', 'randuri', 'x', 'y', 'latime', 'inaltime', 'marime', 'font', 'greutate', 'culoare', 'spatiere', 'aliniere'];

/** Greutățile desenate: titlul la 700, textul la 500 și 700 (eticheta, valorile barelor, îndemnul). */
export const GREUTATI = Object.freeze({ titlu: [Z.GREUTATE.titlu], text: [Z.GREUTATE.text, Z.GREUTATE.tare] });

/**
 * Fonturile pentru loadFont din @remotion/fonts: câte o intrare pe fișierul woff2 al fiecărei greutăți desenate
 * (latin și latin-ext), cu unicodeRange din font.json; sortate după url. Un font de brand e un singur fișier
 * (`fonturi/brand-<nume>`), fără unicodeRange.
 * @param {{font_titlu: string|object, font_text: string}} stilPlat @param {Record<string, object>} catalog incarcaCatalogFonturi
 */
export function fonturiProps(stilPlat, catalog) {
  const intrari = new Map();
  for (const [rol, font] of [['titlu', stilPlat.font_titlu], ['text', stilPlat.font_text]]) {
    if (esteFontBrand(font)) {
      const url = `fonturi/brand-${path.basename(font.fisier)}` /* ca numeCopieBrand din sdk */;
      intrari.set(url, { familie: `MG ${font.familie}`, url, greutate: String(Z.GREUTATE.titlu), unicodeRange: null });
      continue;
    }
    const info = catalog[font];
    for (const f of info.fisiere) {
      if (!GREUTATI[rol].includes(f.greutate)) continue;
      const url = `fonturi/${f.fisier}`;
      intrari.set(url, { familie: info.familie, url, greutate: String(f.greutate), unicodeRange: f.unicode_range });
    }
  }
  return [...intrari.keys()].sort().map((url) => intrari.get(url));
}

function familie(font, catalog) {
  return esteFontBrand(font) ? `MG ${font.familie}` : catalog[font].familie;
}

/** Straturile de ceață, cu opacitatea deja limitată pentru contrast (aceeași regulă ca C06); [] la atmosfera plin. */
export function ceataProps(culori, atmosfera, ceata = null) {
  if (atmosfera !== 'ceata') return [];
  const intensitate = limitaIntensitate(culori, atmosfera, { ceata });
  return straturiCeata(culori, ceata).map(({ culoare, alfa }) => ({ culoare, alfa: Math.round(alfa * intensitate * 10000) / 10000 }));
}

// afixe există doar la cifra XL (felia 2); fără ea, props.json rămâne byte cu byte ca înainte
const textProps = (b) => ({ ...Object.fromEntries(CHEI_TEXT.map((k) => [k, b[k]])), ...(b.afixe ? { afixe: b.afixe } : {}) });

/**
 * @param {{date: object, stilPlat: object, timpi: object, asezare: object, catalog: object, muzica: boolean, sigla: {extensie: string}|null}} p
 * @returns {object} conținutul lui build/props.json
 */
export function construiesteProps({ date, stilPlat, timpi, asezare, catalog, muzica, sigla }) {
  const culori = Object.fromEntries(JETOANE.map((j) => [j, stilPlat.culori[j]]));
  return {
    versiune: 1,
    latime: Z.LATIME,
    inaltime: Z.INALTIME,
    fps: FPS,
    cadre: timpi.total,
    tranzitie: CADRE_TRANZITIE,
    culori,
    fonturi: fonturiProps(stilPlat, catalog),
    familii: { titlu: familie(stilPlat.font_titlu, catalog), text: familie(stilPlat.font_text, catalog) },
    atmosfera: stilPlat.atmosfera,
    ceata: ceataProps(culori, stilPlat.atmosfera, stilPlat.ceata ?? null),
    muzica: muzica ? 'assets/muzica.m4a' : null,
    sigla: sigla && asezare.sigla ? { url: `sigla.${sigla.extensie}`, ...asezare.sigla } : null,
    scene: date.scene.map((s, i) => ({
      ref: `Scena ${i + 1}`,
      tip: s.tip,
      cadre: timpi.cadre[i],
      inceput: timpi.inceputuri[i],
      intrare: timpi.intrari[i],
      texte: asezare.scene[i].texte.map(textProps),
      detalii: asezare.scene[i].detalii,
    })),
  };
}
