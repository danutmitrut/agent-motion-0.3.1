// Decodorul PNG al lui mg genereaza (felia 5): imaginea de la Kie devine o hartă de gri, fără dependențe npm.
// Acceptă PNG pe 8 biți, neîntrețesut, gri, gri cu alfa, RGB, RGBA sau paletă; restul e refuzat clar.
import { inflateSync } from 'node:zlib';

const SEMNATURA = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// canale pe tip de culoare (0 gri, 2 RGB, 3 paletă, 4 gri+alfa, 6 RGBA)
const CANALE = Object.freeze({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 });

export class PngNeacceptat extends Error {}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/**
 * @param {Buffer} buf
 * @returns {{latime: number, inaltime: number, gri: Uint8Array}} gri 0 negru, 255 alb; alfa se compune pe alb
 */
export function decodeazaPng(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 33 || !buf.subarray(0, 8).equals(SEMNATURA)) {
    throw new PngNeacceptat('fișierul nu e PNG');
  }
  let i = 8;
  let antet = null;
  let paleta = null;
  let transparenta = null;
  const idat = [];
  while (i + 8 <= buf.length) {
    const lungime = buf.readUInt32BE(i);
    const tip = buf.toString('latin1', i + 4, i + 8);
    const date = buf.subarray(i + 8, i + 8 + lungime);
    if (date.length !== lungime) throw new PngNeacceptat('PNG trunchiat');
    if (tip === 'IHDR') {
      antet = { latime: date.readUInt32BE(0), inaltime: date.readUInt32BE(4), adancime: date[8], culoare: date[9], intretesere: date[12] };
    } else if (tip === 'PLTE') paleta = date;
    else if (tip === 'tRNS') transparenta = date;
    else if (tip === 'IDAT') idat.push(date);
    else if (tip === 'IEND') break;
    i += 12 + lungime;
  }
  if (!antet || idat.length === 0) throw new PngNeacceptat('PNG fără IHDR sau IDAT');
  const { latime, inaltime, adancime, culoare, intretesere } = antet;
  const canale = CANALE[culoare];
  if (!canale || adancime !== 8) throw new PngNeacceptat(`PNG pe ${adancime} biți, tipul de culoare ${culoare}; se acceptă doar 8 biți`);
  if (intretesere !== 0) throw new PngNeacceptat('PNG întrețesut (interlaced)');
  if (culoare === 3 && !paleta) throw new PngNeacceptat('PNG cu paletă, fără PLTE');
  if (latime < 1 || inaltime < 1 || latime * inaltime > 40e6) throw new PngNeacceptat(`dimensiuni nepermise: ${latime}x${inaltime}`);

  const pasRand = latime * canale;
  // maxOutputLength: un IDAT mic care se umflă la gigaocteți (bombă de compresie) se oprește la cât trebuie
  let brut;
  try {
    brut = inflateSync(Buffer.concat(idat), { maxOutputLength: (pasRand + 1) * inaltime });
  } catch (e) {
    throw new PngNeacceptat(`date PNG stricate sau prea mari (${e.code ?? e.message})`);
  }
  if (brut.length < (pasRand + 1) * inaltime) throw new PngNeacceptat('date PNG incomplete');
  const rand = new Uint8Array(pasRand);
  const anterior = new Uint8Array(pasRand);
  const gri = new Uint8Array(latime * inaltime);
  for (let y = 0; y < inaltime; y++) {
    const start = y * (pasRand + 1);
    const filtru = brut[start];
    for (let x = 0; x < pasRand; x++) {
      const v = brut[start + 1 + x];
      const a = x >= canale ? rand[x - canale] : 0;
      const b = anterior[x];
      const c = x >= canale ? anterior[x - canale] : 0;
      let r;
      if (filtru === 0) r = v;
      else if (filtru === 1) r = v + a;
      else if (filtru === 2) r = v + b;
      else if (filtru === 3) r = v + ((a + b) >> 1);
      else if (filtru === 4) r = v + paeth(a, b, c);
      else throw new PngNeacceptat(`filtru PNG necunoscut: ${filtru}`);
      rand[x] = r & 0xff;
    }
    for (let x = 0; x < latime; x++) {
      const o = x * canale;
      let l;
      let alfa = 255;
      if (culoare === 0) l = rand[o];
      else if (culoare === 4) { l = rand[o]; alfa = rand[o + 1]; }
      else {
        let r, g, bl;
        if (culoare === 3) {
          const k = rand[o];
          r = paleta[k * 3]; g = paleta[k * 3 + 1]; bl = paleta[k * 3 + 2];
          if (transparenta && k < transparenta.length) alfa = transparenta[k];
        } else {
          r = rand[o]; g = rand[o + 1]; bl = rand[o + 2];
          if (culoare === 6) alfa = rand[o + 3];
        }
        l = 0.2126 * r + 0.7152 * g + 0.0722 * bl;
      }
      // pe alb, ca un desen cu fundal transparent să nu devină negru
      gri[y * latime + x] = Math.round((l * alfa + 255 * (255 - alfa)) / 255);
    }
    anterior.set(rand);
  }
  return { latime, inaltime, gri };
}
