// Adaptorul de motor (planul I, decizia 3): nucleul alege motorul după sablon.motor, adică folderul din motoare/
// în care stă șablonul (incarcaSablon cere ca meta.motor să fie același).
import { adaptorHyperframes } from './hyperframes.mjs';
import { adaptorRemotion } from './remotion.mjs';

const ADAPTOARE = Object.freeze({ hyperframes: adaptorHyperframes, remotion: adaptorRemotion });

/**
 * @param {string} nume
 * @returns {object} Adaptor (forma din planul I, „Forma datelor interne”)
 * @throws {TypeError} pentru un motor fără adaptor
 */
export function adaptorMotor(nume) {
  if (!Object.hasOwn(ADAPTOARE, nume)) {
    throw new TypeError(`Motorul „${String(nume)}” nu are adaptor în nucleu/lib/motoare/ (cunoscute: ${Object.keys(ADAPTOARE).join(', ')}).`);
  }
  return ADAPTOARE[nume];
}
