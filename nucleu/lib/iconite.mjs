// Catalogul iconițelor Lucide 1.49.0: motoare/comun/iconite/lucide-1.49.0.json,
// copia lui icon-nodes.json din lucide-static@1.49.0, forma {"phone": [["path", {"d": "..."}]]}.
import path from 'node:path';
import { citesteJson } from './fisiere.mjs';
import { escapeazaHtml } from './html.mjs';

const CALE_RELATIVA = 'motoare/comun/iconite/lucide-1.49.0.json';
const ETICHETE_PERMISE = new Set(['path', 'circle', 'rect', 'line', 'ellipse', 'polyline', 'polygon']);
const CACHE = new Map();

/** @returns {Map<string, Array<[string, Record<string, string>]>>} */
export function incarcaIconite(radacina) {
  const cale = path.join(radacina, ...CALE_RELATIVA.split('/'));
  let harta = CACHE.get(cale);
  if (harta === undefined) {
    harta = new Map(Object.entries(citesteJson(cale, `fisier:${CALE_RELATIVA}`)));
    CACHE.set(cale, harta);
  }
  return harta;
}

/** @returns {boolean} */
export function existaIconita(radacina, nume) {
  return incarcaIconite(radacina).has(nume);
}

/** @returns {string} SVG-ul iconiței, cu stroke="currentColor"; aruncă TypeError dacă nu există (S10 o prinde înainte). */
export function svgIconita(radacina, nume) {
  const noduri = incarcaIconite(radacina).get(nume);
  if (noduri === undefined) throw new TypeError(`Iconița „${nume}” nu există în Lucide 1.49.0.`);
  const interior = noduri.map(([eticheta, atribute]) => {
    if (!ETICHETE_PERMISE.has(eticheta)) throw new TypeError(`Iconița „${nume}” are elementul neașteptat <${eticheta}>.`);
    const at = Object.entries(atribute).map(([k, v]) => ` ${k}="${escapeazaHtml(v)}"`).join('');
    return `<${eticheta}${at}/>`;
  }).join('');
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
    + ` stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${interior}</svg>`;
}
