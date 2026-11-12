/**
 * video/<proiect>/motor.lock (harta 5.3, spec 6.13). Doar module native.
 */
import { citesteJson, scrieJsonAtomic } from './fisiere.mjs';

/**
 * @param {{proiect: string, sablon: {nume: string, motor: string, meta: {versiune_schema: number}, sha256: string}, versiuni: object, acum: Date}} p
 * @returns {object} MotorLock; versiuni_sha256 rămâne null aici și îl completează comandaNou cu sha256Fisier(nucleu/VERSIUNI.json)
 */
export function lockNou({ proiect, sablon, versiuni, acum }) {
  const versiuneMotor = versiuni?.motoare?.[sablon.motor]?.versiune;
  if (typeof versiuneMotor !== 'string' || versiuneMotor === '') {
    throw new TypeError(`nucleu/VERSIUNI.json nu fixează versiunea motorului ${sablon.motor}`);
  }
  return {
    versiune: 1,
    proiect,
    creat_la: acum.toISOString(),
    motor: { nume: sablon.motor, versiune: versiuneMotor },
    sablon: { nume: sablon.nume, versiune_schema: sablon.meta.versiune_schema, sha256: sablon.sha256 },
    versiuni_sha256: null,
    active: {},
    aprobare: null,
    randari: { ultima_completa: null },
  };
}

/** @param {string} cale @returns {object} */
export function citesteLock(cale) {
  return citesteJson(cale);
}

/** @param {string} cale @param {object} lock */
export function scrieLock(cale, lock) {
  scrieJsonAtomic(cale, lock);
}
