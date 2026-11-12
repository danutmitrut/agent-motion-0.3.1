// Ajutor de test (felia 5): PNG-uri mici, scrise din cod, pentru decodorul și vectorizarea lui mg genereaza.
import { deflateSync } from 'node:zlib';
import { crc32 } from '../pas0/vectorizare/genereaza-desen.mjs';

function bucata(tip, date) {
  const lungime = Buffer.alloc(4);
  lungime.writeUInt32BE(date.length);
  const tipSiDate = Buffer.concat([Buffer.from(tip, 'latin1'), date]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(tipSiDate));
  return Buffer.concat([lungime, tipSiDate, crc]);
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/**
 * @param {{latime: number, inaltime: number, canale: 1|2|3|4, date: Uint8Array, adancime?: number, intretesere?: number,
 *   filtre?: number[], paleta?: Buffer}} img date = pixelii, rând după rând; filtre = filtrul fiecărui rând, ciclic
 * @returns {Buffer}
 */
export function codificaPng({ latime, inaltime, canale, date, adancime = 8, intretesere = 0, filtre = [0], paleta = null }) {
  const culoare = paleta ? 3 : { 1: 0, 2: 4, 3: 2, 4: 6 }[canale];
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(latime, 0);
  ihdr.writeUInt32BE(inaltime, 4);
  ihdr[8] = adancime;
  ihdr[9] = culoare;
  ihdr[12] = intretesere;
  const pas = latime * canale;
  const brut = Buffer.alloc((pas + 1) * inaltime);
  for (let y = 0; y < inaltime; y++) {
    const f = filtre[y % filtre.length];
    brut[y * (pas + 1)] = f;
    for (let x = 0; x < pas; x++) {
      const v = date[y * pas + x];
      const a = x >= canale ? date[y * pas + x - canale] : 0;
      const b = y > 0 ? date[(y - 1) * pas + x] : 0;
      const c = x >= canale && y > 0 ? date[(y - 1) * pas + x - canale] : 0;
      const pred = [0, a, b, (a + b) >> 1, paeth(a, b, c)][f];
      brut[y * (pas + 1) + 1 + x] = (v - pred) & 0xff;
    }
  }
  const parti = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), bucata('IHDR', ihdr)];
  if (paleta) parti.push(bucata('PLTE', paleta));
  parti.push(bucata('IDAT', deflateSync(brut)), bucata('IEND', Buffer.alloc(0)));
  return Buffer.concat(parti);
}

/**
 * O imagine gri, albă, cu forme negre desenate de funcția dată (true = cerneală în pixelul x, y).
 * @returns {{latime: number, inaltime: number, gri: Uint8Array}}
 */
export function imagineGri(latime, inaltime, cerneala) {
  const gri = new Uint8Array(latime * inaltime).fill(255);
  for (let y = 0; y < inaltime; y++) for (let x = 0; x < latime; x++) if (cerneala(x, y)) gri[y * latime + x] = 0;
  return { latime, inaltime, gri };
}

/** Un inel gros (exteriorul r2, interiorul r1), cu centrul în (cx, cy). */
export const inel = (cx, cy, r1, r2) => (x, y) => {
  const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
  return d >= r1 && d <= r2;
};
