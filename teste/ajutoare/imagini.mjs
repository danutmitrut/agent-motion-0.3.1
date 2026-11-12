// Cadre RGB24 sintetice pentru testele C12 și C13 (harta 8.2): 3 octeți pe pixel, rând după rând.

/**
 * @param {number} latime
 * @param {number} inaltime
 * @param {[number, number, number]} rgb
 * @returns {Uint8Array}
 */
export function cadruUniform(latime, inaltime, rgb) {
  const pixeli = new Uint8Array(latime * inaltime * 3);
  for (let i = 0; i < pixeli.length; i += 3) {
    pixeli[i] = rgb[0];
    pixeli[i + 1] = rgb[1];
    pixeli[i + 2] = rgb[2];
  }
  return pixeli;
}

/**
 * Un cadru uniform cu un dreptunghi plin; dreptunghiul se taie la marginile cadrului.
 * @param {number} latime
 * @param {number} inaltime
 * @param {[number, number, number]} fundalRgb
 * @param {[number, number, number, number]} dreptunghi [x, y, w, h]
 * @param {[number, number, number]} rgb
 * @returns {Uint8Array}
 */
export function cadruCuDreptunghi(latime, inaltime, fundalRgb, dreptunghi, rgb) {
  const pixeli = cadruUniform(latime, inaltime, fundalRgb);
  const [x, y, w, h] = dreptunghi;
  for (let rand = Math.max(0, y); rand < Math.min(inaltime, y + h); rand += 1) {
    for (let col = Math.max(0, x); col < Math.min(latime, x + w); col += 1) {
      const i = (rand * latime + col) * 3;
      pixeli[i] = rgb[0];
      pixeli[i + 1] = rgb[1];
      pixeli[i + 2] = rgb[2];
    }
  }
  return pixeli;
}
