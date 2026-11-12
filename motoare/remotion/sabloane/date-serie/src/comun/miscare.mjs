// Coregrafia comună, ca funcții pure de cadru: fiecare animație atinge exact valoarea finală la cadrul `pana`.
// La cadrul local `intrare` al scenei totul stă în poziția din props și la opacitate 1 (C13 măsoară acolo).
// Modul .mjs (nu .ts), ca testele node:test să-l importe direct (teste/miscare.test.mjs).
import { Easing, interpolate, spring } from 'remotion';

const iesire = Easing.out(Easing.cubic);

/**
 * 0 până la `de`, 1 de la `pana` încolo, ease-out între ele.
 * @param {number} cadru @param {number} de @param {number} pana
 * @returns {number}
 */
export function progres(cadru, de, pana) {
  if (cadru >= pana) return 1;
  if (cadru <= de) return 0;
  return interpolate(cadru, [de, pana], [0, 1], { easing: iesire, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
}

/**
 * Creșterea unei bare: spring fără depășire, întins pe [de, pana]. Spring-ul se apropie de 1 fără să-l atingă,
 * deci de la `pana` încolo valoarea e fixată la 1, ca bara să fie exact cât în props.
 * @param {number} cadru @param {number} de @param {number} pana @param {number} fps
 * @returns {number}
 */
export function crestere(cadru, de, pana, fps) {
  if (cadru >= pana) return 1;
  if (cadru <= de) return 0;
  return spring({ frame: cadru - de, fps, durationInFrames: pana - de, config: { damping: 200 } });
}

/**
 * Mișcarea lentă de după intrare (scala 1 → 1,02 până la capătul scenei), ca niciun cadru să nu stea pe loc (C14),
 * nici pe temele fără ceață. La `intrare` scala e exact 1.
 * @param {number} cadru @param {number} intrare @param {number} cadre
 * @returns {number}
 */
export function deriva(cadru, intrare, cadre) {
  if (cadru <= intrare || cadre <= intrare) return 1;
  return 1 + 0.02 * Math.min(1, (cadru - intrare) / (cadre - intrare));
}

/**
 * Intrarea eșalonată a textului k dintr-o scenă: începe la 4k cadre (cel târziu cu 12 cadre înainte de `pana`).
 * @param {number} k @param {number} pana
 * @returns {{de: number, pana: number}}
 */
export function esalonat(k, pana) {
  return { de: Math.max(0, Math.min(4 * k, pana - 12)), pana };
}
