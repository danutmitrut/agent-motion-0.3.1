// Pozele testimonialelor (S05): formatul și dimensiunile din antetul fișierului, fără dependențe.
// JPEG: primul marcaj SOF (C0-CF, fără C4, C8, CC); PNG: IHDR; WebP: VP8 , VP8L sau VP8X.
// Orientarea EXIF nu schimbă latura mică, deci nu se citește (Chrome o aplică singur la desen).
import fs from 'node:fs';
import path from 'node:path';

/** Poza unui testimonial: latura mică de cel puțin 400 px (altfel iese neclară în cerc), cel mult 8 MB. */
export const LIMITE_POZA = Object.freeze({ latura: 400, octeti: 8 * 1024 * 1024 });

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** @param {Buffer} b @returns {{format: 'jpg'|'png'|'webp', latime: number, inaltime: number}|null} */
export function antetPoza(b) {
  if (b.length >= 24 && b.subarray(0, 8).equals(PNG) && b.toString('latin1', 12, 16) === 'IHDR') {
    return { format: 'png', latime: b.readUInt32BE(16), inaltime: b.readUInt32BE(20) };
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let p = 2;
    while (p + 9 < b.length) {
      if (b[p] !== 0xff) {
        p += 1;
        continue;
      }
      const m = b[p + 1];
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7) || m === 0xff) {
        p += m === 0xff ? 1 : 2;
        continue;
      }
      const lung = b.readUInt16BE(p + 2);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { format: 'jpg', inaltime: b.readUInt16BE(p + 5), latime: b.readUInt16BE(p + 7) };
      }
      p += 2 + lung;
    }
    return null;
  }
  if (b.length >= 30 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') {
    const tip = b.toString('latin1', 12, 16);
    if (tip === 'VP8 ') return { format: 'webp', latime: b.readUInt16LE(26) & 0x3fff, inaltime: b.readUInt16LE(28) & 0x3fff };
    if (tip === 'VP8L') {
      const v = b.readUInt32LE(21);
      return { format: 'webp', latime: (v & 0x3fff) + 1, inaltime: ((v >> 14) & 0x3fff) + 1 };
    }
    if (tip === 'VP8X') return { format: 'webp', latime: b.readUIntLE(24, 3) + 1, inaltime: b.readUIntLE(27, 3) + 1 };
  }
  return null;
}

/**
 * @param {string} cale
 * @returns {{ok: true, extensie: string, latime: number, inaltime: number, octeti: number} | {ok: false, motiv: 'mare'|'format'|'mica', octeti?: number, latime?: number, inaltime?: number}}
 */
export function dimensiuniPoza(cale) {
  const stat = fs.statSync(cale);
  if (stat.size > LIMITE_POZA.octeti) return { ok: false, motiv: 'mare', octeti: stat.size };
  const fd = fs.openSync(cale, 'r');
  let b;
  try {
    // SOF-ul unui JPEG poate sta după un EXIF mare (miniatura): se citesc cel mult 512 KB
    b = Buffer.alloc(Math.min(stat.size, 512 * 1024));
    fs.readSync(fd, b, 0, b.length, 0);
  } finally {
    fs.closeSync(fd);
  }
  const a = antetPoza(b);
  if (!a || a.latime <= 0 || a.inaltime <= 0) return { ok: false, motiv: 'format' };
  if (Math.min(a.latime, a.inaltime) < LIMITE_POZA.latura) return { ok: false, motiv: 'mica', latime: a.latime, inaltime: a.inaltime };
  const ext = path.extname(cale).slice(1).toLowerCase();
  return { ok: true, extensie: ext === 'jpeg' ? 'jpg' : ext, latime: a.latime, inaltime: a.inaltime, octeti: stat.size };
}
