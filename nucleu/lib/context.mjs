// Contextul unic dat funcțiilor unui șablon (docs/interfete/sablon.md, „Contextul ctx”; planul E, M6).
// Toate cheile există la fiecare apel; ce nu există încă e null (intern și stil până după cronologie, ff în afara randării).

import { ingheataActiv } from './active.mjs';

export const MODURI = Object.freeze(['doar-verificare', 'schita', 'complet']);

/**
 * @param {{radacina: string, proiect: string, dirProiect: string, sablon: object, mod: string, catalog?: object|null, brand?: object|null, ff?: {ffmpeg: string, ffprobe: string}|null}} p
 * @returns {{radacina: string, proiect: string, dirProiect: string, sablon: object, mod: string, catalog: object|null, brand: object|null, ff: object|null, intern: unknown, stil: object|null, ingheataActiv: (activ: {tip: string, id: string, continut: string|Buffer, extensie: string}) => {cale: string, sha256: string}}}
 */
export function creeazaCtx({ radacina, proiect, dirProiect, sablon, mod, catalog = null, brand = null, ff = null }) {
  if (!MODURI.includes(mod)) throw new TypeError(`Mod de randare necunoscut: ${String(mod)}.`);
  return { radacina, proiect, dirProiect, sablon, mod, catalog, brand, ff, intern: null, stil: null,
    // M8: singurul loc prin care un șablon scrie în active/ și în motor.lock.
    ingheataActiv: (activ) => ingheataActiv(radacina, proiect, activ),
  };
}
