// Desenul sintetic pentru testul de vectorizare de la pasul 0.
// O linie continuă groasă, neagră pe alb, cu trei bucle (o cicloidă alungită),
// ca să existe și capete, și încrucișări. Nu e un desen al lui Dănuț.
// Folosire: node teste/pas0/vectorizare/genereaza-desen.mjs <iesire.png>
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { rulatDirect } from '../../../nucleu/lib/cai.mjs';

export const DESEN_IMPLICIT = Object.freeze({ latime: 800, inaltime: 800, grosime: 14 });

/**
 * Linia de mijloc ideală a desenului, eșantionată la cel mult 1 px.
 * @param {{latime?: number, inaltime?: number}} [o]
 * @returns {Array<[number, number]>}
 */
export function curbaReferinta({ latime = 800, inaltime = 800 } = {}) {
  const a = 1;
  const b = 2.2;
  const tetaMax = 6 * Math.PI;
  const kx = (latime - 160) / (a * tetaMax + 2 * b);
  const ky = (inaltime - 320) / (2 * b);
  const x0 = 80 + b * kx;
  const y0 = inaltime / 2;
  const punct = (t) => [x0 + kx * (a * t - b * Math.sin(t)), y0 - ky * (b * Math.cos(t) - a * 0.2)];
  const puncte = [punct(0)];
  let t = 0;
  while (t < tetaMax) {
    let pas = 0.01;
    const [px, py] = puncte[puncte.length - 1];
    let [qx, qy] = punct(Math.min(t + pas, tetaMax));
    while (Math.hypot(qx - px, qy - py) > 1 && pas > 1e-5) {
      pas /= 2;
      [qx, qy] = punct(Math.min(t + pas, tetaMax));
    }
    t = Math.min(t + pas, tetaMax);
    puncte.push([qx, qy]);
  }
  return puncte;
}

/**
 * Desenează linia groasă, cu margini netezite (cum arată un desen generat).
 * @param {{latime?: number, inaltime?: number, grosime?: number}} [o]
 * @returns {{latime: number, inaltime: number, pixeli: Uint8Array}} gri, 0 negru, 255 alb
 */
export function deseneazaLinie({ latime = 800, inaltime = 800, grosime = 14 } = {}) {
  const raza = grosime / 2;
  const distanta = new Float32Array(latime * inaltime).fill(Infinity);
  const puncte = curbaReferinta({ latime, inaltime });
  const dens = [];
  for (let i = 1; i < puncte.length; i++) {
    const [ax, ay] = puncte[i - 1];
    const [bx, by] = puncte[i];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.5));
    for (let k = 0; k < n; k++) dens.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  }
  dens.push(puncte[puncte.length - 1]);
  const r = Math.ceil(raza + 1);
  for (const [cx, cy] of dens) {
    const x1 = Math.max(0, Math.floor(cx - r));
    const x2 = Math.min(latime - 1, Math.ceil(cx + r));
    const y1 = Math.max(0, Math.floor(cy - r));
    const y2 = Math.min(inaltime - 1, Math.ceil(cy + r));
    for (let y = y1; y <= y2; y++) {
      for (let x = x1; x <= x2; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        const i = y * latime + x;
        if (d < distanta[i]) distanta[i] = d;
      }
    }
  }
  const pixeli = new Uint8Array(latime * inaltime);
  for (let i = 0; i < pixeli.length; i++) {
    const v = (distanta[i] - (raza - 0.5)) * 255;
    pixeli[i] = Math.max(0, Math.min(255, Math.round(v)));
  }
  return { latime, inaltime, pixeli };
}

const TABEL_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** @param {Uint8Array} octeti */
export function crc32(octeti) {
  let c = 0xffffffff;
  for (const b of octeti) c = TABEL_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function bucata(tip, date) {
  const lungime = Buffer.alloc(4);
  lungime.writeUInt32BE(date.length);
  const tipSiDate = Buffer.concat([Buffer.from(tip, 'latin1'), date]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(tipSiDate));
  return Buffer.concat([lungime, tipSiDate, crc]);
}

/**
 * PNG gri pe 8 biți, fără filtre (filtrul 0 pe fiecare rând).
 * @param {{latime: number, inaltime: number, pixeli: Uint8Array}} img
 * @returns {Buffer}
 */
export function codificaPng({ latime, inaltime, pixeli }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(latime, 0);
  ihdr.writeUInt32BE(inaltime, 4);
  ihdr[8] = 8; // adâncime
  ihdr[9] = 0; // gri
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const brut = Buffer.alloc((latime + 1) * inaltime);
  for (let y = 0; y < inaltime; y++) {
    brut[y * (latime + 1)] = 0;
    Buffer.from(pixeli.buffer, pixeli.byteOffset + y * latime, latime).copy(brut, y * (latime + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bucata('IHDR', ihdr),
    bucata('IDAT', deflateSync(brut, { level: 9 })),
    bucata('IEND', Buffer.alloc(0)),
  ]);
}

/** @param {string} cale @param {{latime: number, inaltime: number, pixeli: Uint8Array}} img */
export function scriePng(cale, img) {
  writeFileSync(cale, codificaPng(img));
}

if (rulatDirect(import.meta.url)) {
  const iesire = process.argv[2];
  if (!iesire) {
    console.error('Folosire: node teste/pas0/vectorizare/genereaza-desen.mjs <iesire.png>');
    process.exitCode = 3;
  } else {
    const img = deseneazaLinie(DESEN_IMPLICIT);
    scriePng(iesire, img);
    console.log(`Desen scris: ${iesire} (${img.latime}x${img.inaltime}, grosime ${DESEN_IMPLICIT.grosime} px)`);
  }
}
